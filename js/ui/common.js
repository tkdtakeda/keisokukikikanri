/* ── 画面の共通部品：通知・非モーダルの窓・メニュー・反映の合図・入力補助 ── */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, el } = KK.util;

  // ── 通知（取り消し付き） ──
  const toastHost = () => document.getElementById('toasts');
  KK.toast = function (message, opt = {}) {
    const kind = opt.kind || 'ok';
    const icon = { ok: 'fa-circle-check', warn: 'fa-triangle-exclamation', danger: 'fa-circle-xmark', info: 'fa-circle-info' }[kind];
    const t = el(`<div class="toast toast--${kind}" role="status">
      <i class="fa-solid ${icon}"></i><span class="toast__msg">${esc(message)}</span>
      ${opt.undo ? '<button class="btn btn--ghost toast__undo"><i class="fa-solid fa-rotate-left"></i>元に戻す</button>' : ''}
      <button class="btn btn--ghost btn--icon toast__close" title="閉じる"><i class="fa-solid fa-xmark"></i></button></div>`);
    const close = () => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 200); };
    t.querySelector('.toast__close').onclick = close;
    if (opt.undo) t.querySelector('.toast__undo').onclick = async () => {
      close();
      try { await opt.undo(); KK.toast('元に戻しました', { kind: 'info' }); } catch (e) { KK.toast(`元に戻せませんでした：${e.message}`, { kind: 'danger' }); }
    };
    toastHost().appendChild(t);
    // 重なりすぎないよう、最大 3 件まで
    const all = toastHost().querySelectorAll('.toast:not(.is-leaving)');
    if (all.length > 3) all[0].remove();
    setTimeout(close, opt.undo ? 10000 : (kind === 'danger' ? 8000 : 4000));
    return t;
  };

  // ── 反映の合図：その場が一瞬光る ──
  KK.flash = function (node) {
    if (!node) return;
    node.classList.remove('is-flash'); void node.offsetWidth; node.classList.add('is-flash');
  };

  // ── 非モーダルの窓：開いたままほかの項目に移れる。見出しをつかんで動かせる ──
  const windows = [];
  KK.floating = function ({ id, title, icon, width = 560, body, foot = '', onClose }) {
    let w = document.getElementById(id);
    if (w) w.remove();
    w = el(`<section class="floating" id="${id}" role="dialog" aria-label="${esc(title)}" style="width:${width}px">
      <header class="floating__head"><i class="fa-solid ${icon}"></i><span class="floating__title">${esc(title)}</span><span class="spacer"></span>
        <button class="btn btn--ghost btn--icon" data-close title="閉じる (Esc)"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="floating__body"></div><footer class="floating__foot"></footer></section>`);
    const bodyEl = w.querySelector('.floating__body');
    typeof body === 'string' ? (bodyEl.innerHTML = body) : bodyEl.appendChild(body);
    const footEl = w.querySelector('.floating__foot');
    footEl.innerHTML = foot; footEl.hidden = !foot;
    const close = () => { w.remove(); const i = windows.indexOf(w); if (i >= 0) windows.splice(i, 1); onClose && onClose(); };
    w.close = close;
    w.querySelector('[data-close]').onclick = close;
    w.addEventListener('mousedown', () => raise(w));
    drag(w, w.querySelector('.floating__head'));
    document.body.appendChild(w);
    windows.push(w); raise(w);
    return w;
  };
  function raise(w) { windows.forEach((x, i) => { x.style.zIndex = 40 + i; }); w.style.zIndex = 40 + windows.length; windows.splice(windows.indexOf(w), 1); windows.push(w); }
  function drag(w, handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = w.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev) => {
        w.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx)) + 'px';
        w.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) + 'px';
        w.style.right = 'auto';
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }
  KK.closeTopWindow = () => { const w = windows[windows.length - 1]; if (w) { w.close(); return true; } return false; };

  // ── メニュー（⋮）：危ない操作はここに入れる ──
  KK.menu = function (anchor, items) {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const m = el(`<div class="menu" role="menu">${items.map((it, i) => it.sep ? '<div class="menu__sep"></div>'
      : `<button class="menu__item${it.danger ? ' is-danger' : ''}" role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''} title="${esc(it.reason || '')}">
          <i class="fa-solid ${it.icon}"></i><span>${esc(it.label)}</span>${it.disabled && it.reason ? `<small>${esc(it.reason)}</small>` : ''}</button>`).join('')}</div>`);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 8) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; m.remove(); items[b.dataset.i].run(); });
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
    m.querySelector('button:not([disabled])')?.focus();
  };

  // ── 入力補助：全選択・桁数で自動移動・Enter で次／Shift+Enter で前 ──
  KK.wireFormAssist = function (root) {
    const fields = () => [...root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, button[data-submit]')]
      .filter((x) => !x.disabled && x.offsetParent !== null);
    // 入った時点ですぐ全選択する（遅らせると、速く打った 1 文字目が選択されて上書きされる）。
    // マウスで入ったときは、離した瞬間に選択が外れるのを 1 回だけ防ぐ。
    let justFocused = null;
    root.addEventListener('focusin', (e) => {
      if (e.target.tagName !== 'INPUT' || !e.target.select) return;
      e.target.select(); justFocused = e.target;
    });
    root.addEventListener('mouseup', (e) => { if (e.target === justFocused) e.preventDefault(); justFocused = null; });
    root.addEventListener('keydown', () => { justFocused = null; }, true);
    root.addEventListener('input', (e) => {
      const len = Number(e.target.dataset.len || 0);
      if (len && e.target.value.normalize('NFKC').replace(/\D/g, '').length >= len) {
        e.target.value = e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, len);
        const f = fields(); f[f.indexOf(e.target) + 1]?.focus();
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey) return;
      if (e.target.tagName === 'BUTTON') return;
      const f = fields(); const i = f.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      const next = f[i + (e.shiftKey ? -1 : 1)];
      if (next) next.focus();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-today]'); if (!b) return;
      const [y, m, d] = KK.util.today().split('-');
      const ins = b.parentElement.querySelectorAll('input');
      ins[0].value = y; ins[1].value = m; ins[2].value = d;
      ins[0].dispatchEvent(new Event('change', { bubbles: true }));
      KK.flash(b.parentElement);
    });
  };

  /** 状態の札：アイコン＋文字＋色 */
  KK.badge = (s, extra = '') => `<span class="badge badge--${s.cls}"${s.viaChild ? ' title="構成の中の機器の状態"' : ''}><i class="fa-solid ${s.icon}"></i>${esc(s.label)}${s.viaChild ? '<i class="fa-solid fa-sitemap badge__via"></i>' : ''}${extra}</span>`;
  KK.kindTag = (a) => { const k = KK.rules.kind(a); return `<span class="kind kind--${k.id}"><i class="fa-solid ${k.icon}"></i>${esc(k.label)}</span>`; };
})();
