/* ── 標準器の選択（校正に使った標準器） ──
   フォームの中に開く選択欄。セットとその中のゲージを木で見せ、校正日の時点で有効だったかを札で示す。
   別のセットのゲージは同時に選べない（理由を表示）。セットを選ぶと「セット全体を使用」になる。
   model = { selected: [id], open: bool, query: '' } は呼び出し側が持ち、描き直しても保たれる。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, norm } = KK.util;
  const T = () => KK.trace;
  const R = () => KK.rules;

  function chipHtml(id, date) {
    const s = KK.repo.assets.get(id);
    if (!s) return '';
    const st = T().statusAsOf(s, date);
    return `<span class="std-chip std-chip--${st.cls}" title="${esc(st.label)}"><i class="fa-solid ${st.icon}"></i>${esc(T().label(s))}${s.parentId ? '' : (KK.repo.assets.children(s.id).length ? '<span class="sub">（セット全体）</span>' : '')}
      <button type="button" class="btn btn--ghost btn--icon" data-std-remove="${id}" title="外す"><i class="fa-solid fa-xmark"></i></button></span>`;
  }

  function rowHtml(a, depth, m, date) {
    const checked = m.selected.includes(a.id);
    const coveredBySet = !checked && KK.repo.assets.ancestors(a.id).some((p) => m.selected.includes(p.id));
    const block = !checked && T().blockingSet(a.id, m.selected);
    const disabled = coveredBySet || !!block;
    const reason = coveredBySet ? 'セット全体を選択中' : block ? `別のセット ${R().identity(block)} を選択中` : '';
    const st = T().statusAsOf(a, date);
    return `<label class="std-row${disabled ? ' is-disabled' : ''}" style="--depth:${depth}" title="${esc(reason)}">
        <input type="checkbox" data-std-pick="${a.id}" ${checked || coveredBySet ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span class="std-row__name">${esc(R().category(a).name)} <b>${esc(R().identity(a))}</b> <span class="sub">${esc(a.model)}</span></span>
        ${reason ? `<span class="sub">${esc(reason)}</span>` : KK.badge(st)}</label>`;
  }

  function listHtml(m, date, selfId) {
    const q = norm(m.query || '');
    const groups = T().candidates(selfId);
    const match = (a) => !q || norm(`${R().category(a).name} ${a.mgmtNo} ${a.serial} ${a.model} ${KK.repo.locations.path(a.locationId)}`).includes(q);
    const html = groups.map((g) => {
      const kids = g.children.filter(match);
      if (!match(g.asset) && !kids.length) return '';
      return rowHtml(g.asset, 0, m, date) + kids.map((k) => rowHtml(k, KK.repo.assets.ancestors(k.id).length, m, date)).join('');
    }).join('');
    if (!groups.length) return '<div class="sub std-empty">標準器がまだ登録されていません（大分類「標準器」の分類で登録します）</div>';
    return html || '<div class="sub std-empty">一致する標準器はありません</div>';
  }

  /** フィールド全体の HTML */
  function html(m, date, selfId, error) {
    const overdue = m.selected.map((id) => KK.repo.assets.get(id)).filter((s) => s && T().statusAsOf(s, date).key === 'overdue');
    return `
      <div class="std-picked">
        ${m.selected.length ? m.selected.map((id) => chipHtml(id, date)).join('') : '<span class="sub">未選択</span>'}
        <button type="button" class="btn btn--small" data-std-toggle aria-expanded="${m.open}"><i class="fa-solid ${m.open ? 'fa-chevron-up' : 'fa-scale-balanced'}"></i>${m.open ? '選択を閉じる' : '標準器を選ぶ'}</button>
      </div>
      ${error ? `<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i>${esc(error)}</span>` : ''}
      ${overdue.length ? `<span class="field-warn"><i class="fa-solid fa-triangle-exclamation"></i>校正日の時点で期限切れの標準器があります：${overdue.map((s) => esc(R().identity(s))).join('・')}（登録はできます）</span>` : ''}
      <div class="std-picker" ${m.open ? '' : 'hidden'}>
        <label class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" data-std-q value="${esc(m.query || '')}" placeholder="標準器を探す（番号・型式）"></label>
        <div class="std-list">${listHtml(m, date, selfId)}</div>
        <div class="hint">セットにチェックすると「セット全体を使用」。同じ校正で別のセット（またはそのゲージ）は使えません。</div>
      </div>`;
  }

  /**
   * host に取り付ける。getDate は校正日を返す関数、onChange は選択が変わったときに呼ぶ。
   * イベントは host に付けるので、host ごと描き直すときは mount し直す。
   */
  function mount(host, m, { getDate, selfId, onChange }) {
    const draw = (keepFocus) => {
      const pos = keepFocus && host.querySelector('[data-std-q]')?.selectionStart;
      const scroll = host.querySelector('.std-list')?.scrollTop || 0;
      host.innerHTML = html(m, getDate(), selfId, m.error);
      const list = host.querySelector('.std-list'); if (list) list.scrollTop = scroll;
      if (keepFocus) { const q = host.querySelector('[data-std-q]'); q.focus(); q.setSelectionRange(pos, pos); }
    };
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-std-toggle]')) { m.open = !m.open; draw(); if (m.open) host.querySelector('[data-std-q]').focus(); }
      const rm = e.target.closest('[data-std-remove]');
      if (rm) { m.selected = m.selected.filter((x) => x !== rm.dataset.stdRemove); m.error = ''; draw(); onChange && onChange(); }
    });
    host.addEventListener('change', (e) => {
      const id = e.target.dataset.stdPick; if (!id) return;
      e.stopPropagation();
      m.selected = e.target.checked ? T().normalize([...m.selected, id]) : m.selected.filter((x) => x !== id);
      m.error = '';
      draw(); onChange && onChange();
      KK.flash(host.querySelector('.std-picked'));
    });
    host.addEventListener('input', (e) => { if (e.target.matches('[data-std-q]')) { e.stopPropagation(); m.query = e.target.value; draw(true); } });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-std-q]')) { e.preventDefault(); e.stopPropagation(); } }, true);
    draw();
    return { redraw: () => draw() };
  }

  KK.stdPicker = { mount };
})();
