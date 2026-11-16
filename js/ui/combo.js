/* ── 打ちながら探せる選択欄（型式・会社など） ──
   <div data-combo="名前"> の中に、見える入力欄と、選んだ id を持つ隠し欄を置く。
   一覧にない名前は「＋新しく登録」でその場で作れる。空欄は「引き継ぐ」（placeholder に引き継ぐ値を出す）。
   sources[名前] = { items: () => [{ id, label, sub }], create?: async (text) => id, onPick?: (id) => {} } */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, norm } = KK.util;

  /** 欄の HTML。field は隠し欄の data-field 名 */
  function html({ name, field, id, label, placeholder = '', disabled = false }) {
    return `<div class="combo" data-combo="${esc(name)}">
      <input class="input combo__input" data-combo-input value="${esc(label)}" placeholder="${esc(placeholder)}" autocomplete="off" ${disabled ? 'disabled' : ''} aria-autocomplete="list">
      <input type="hidden" data-field="${esc(field)}" value="${esc(id || '')}">
      <button type="button" class="combo__clear btn btn--ghost btn--icon" data-combo-clear tabindex="-1" title="空欄にする（引き継ぐ）" ${id ? '' : 'hidden'}><i class="fa-solid fa-xmark"></i></button>
      <div class="combo__list" role="listbox" hidden></div></div>`;
  }

  /** root の中の data-combo をまとめて動かす（描き直しても効く） */
  function wire(root, sources) {
    let active = -1;
    const parts = (box) => ({ box, input: box.querySelector('[data-combo-input]'), hidden: box.querySelector('input[type=hidden]'), list: box.querySelector('.combo__list'), src: sources[box.dataset.combo] });

    function candidates(p) {
      const q = norm(p.input.value.trim());
      const all = p.src.items();
      const hits = q ? all.filter((it) => norm(`${it.label} ${it.sub || ''} ${it.keys || ''}`).includes(q)) : all;
      const exact = all.find((it) => norm(it.label) === q);
      const out = hits.slice(0, 50);
      if (q && !exact && p.src.create) out.push({ create: true, label: p.input.value.trim() });
      return out;
    }
    function draw(p) {
      const list = candidates(p);
      p.list.innerHTML = list.length ? list.map((it, i) => it.create
        ? `<div class="combo__item combo__item--create${i === active ? ' is-active' : ''}" data-i="${i}" role="option"><i class="fa-solid fa-plus"></i>「${esc(it.label)}」を新しく登録</div>`
        : `<div class="combo__item${i === active ? ' is-active' : ''}${it.id === p.hidden.value ? ' is-current' : ''}" data-i="${i}" role="option">${esc(it.label)}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</div>`).join('')
        : '<div class="combo__empty sub">候補がありません</div>';
      p.list.hidden = false;
      p.box._items = list;
    }
    async function pick(p, it) {
      let id = it.id;
      if (it.create) {
        try { id = await p.src.create(it.label); } catch (e) { KK.toast(e.message, { kind: 'warn' }); return; }
      }
      p.hidden.value = id || '';
      p.input.value = id ? (p.src.items().find((x) => x.id === id)?.label || it.label) : '';
      p.box.classList.remove('is-unmatched');
      p.box.querySelector('[data-combo-clear]').hidden = !id;
      p.list.hidden = true; active = -1;
      KK.flash(p.input);
      p.hidden.dispatchEvent(new Event('change', { bubbles: true }));
      p.src.onPick && p.src.onPick(id);
    }
    /** 欄を出たとき：一致すれば選ぶ、空なら空に、一致しなければ印を付ける */
    function settle(p) {
      p.list.hidden = true; active = -1;
      const text = p.input.value.trim();
      const items = p.src.items();
      if (!text) { if (p.hidden.value) { p.hidden.value = ''; p.box.querySelector('[data-combo-clear]').hidden = true; p.hidden.dispatchEvent(new Event('change', { bubbles: true })); } p.box.classList.remove('is-unmatched'); return; }
      const cur = items.find((x) => x.id === p.hidden.value);
      if (cur && cur.label === text) { p.box.classList.remove('is-unmatched'); return; }
      const exact = items.find((x) => norm(x.label) === norm(text));
      if (exact) { pick(p, exact); return; }
      p.box.classList.add('is-unmatched');
    }

    root.addEventListener('focusin', (e) => { const b = e.target.closest('[data-combo]'); if (b && e.target.matches('[data-combo-input]')) { active = -1; draw(parts(b)); } });
    root.addEventListener('input', (e) => { const b = e.target.closest('[data-combo]'); if (b && e.target.matches('[data-combo-input]')) { active = 0; draw(parts(b)); } });
    root.addEventListener('focusout', (e) => { const b = e.target.closest('[data-combo]'); if (b && e.target.matches('[data-combo-input]')) setTimeout(() => settle(parts(b)), 120); });
    root.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.combo__item'); if (!item) return;
      e.preventDefault();
      const p = parts(item.closest('[data-combo]'));
      pick(p, p.box._items[Number(item.dataset.i)]);
    });
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-combo-clear]'); if (!c) return;
      const p = parts(c.closest('[data-combo]'));
      p.input.value = ''; settle(p); p.input.focus();
    });
    // Enter は選んでから次の欄へ（入力補助の Enter より先に動かすため capture）
    root.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-combo]'); if (!b || !e.target.matches('[data-combo-input]')) return;
      const p = parts(b);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (p.list.hidden) draw(p);
        const n = (p.box._items || []).length; if (!n) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; draw(p);
        p.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && !e.isComposing && !p.list.hidden && active >= 0 && p.box._items?.[active]) {
        pick(p, p.box._items[active]);
      } else if (e.key === 'Escape' && !p.list.hidden) {
        e.stopPropagation(); p.list.hidden = true;
      }
    }, true);
  }

  /** フォームを保存する前に：一覧にない名前が残っていればその欄を返す */
  function unmatched(root) { return root.querySelector('.combo.is-unmatched [data-combo-input]'); }

  KK.combo = { html, wire, unmatched };
})();
