/* ── 設置先ナビ（部 › 課 › ライン の木） ──
   各設置先に、配下を含む個体数と、期限切れ・期限間近の件数を出す。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;

  let root = null;

  /** 設置先ごとの件数（配下を含む）を一度に数える */
  function tally() {
    const repo = KK.repo; const today = KK.util.today();
    const own = new Map();
    repo.assets.list().forEach((a) => {
      if (a.state === 'retired') return;
      const s = KK.rules.status(a, today).key;
      if (!own.has(a.locationId)) own.set(a.locationId, { n: 0, overdue: 0, soon: 0 });
      const c = own.get(a.locationId); c.n++; if (s === 'overdue') c.overdue++; if (s === 'soon' || s === 'nocal') c.soon++;
    });
    const total = new Map();
    const sum = (id) => {
      if (total.has(id)) return total.get(id);
      const c = { ...(own.get(id) || { n: 0, overdue: 0, soon: 0 }) };
      repo.locations.children(id).forEach((ch) => { const x = sum(ch.id); c.n += x.n; c.overdue += x.overdue; c.soon += x.soon; });
      total.set(id, c); return c;
    };
    const all = { n: 0, overdue: 0, soon: 0 };
    repo.locations.children(null).forEach((l) => { const x = sum(l.id); all.n += x.n; all.overdue += x.overdue; all.soon += x.soon; });
    // 設置先が消えた個体も「すべて」には数える
    own.forEach((c, id) => { if (!repo.locations.get(id)) { all.n += c.n; all.overdue += c.overdue; all.soon += c.soon; } });
    return { total, all };
  }

  const marks = (c) => `${c.overdue ? `<span class="locnav__mark is-danger" title="期限切れ ${c.overdue} 件"><i class="fa-solid fa-circle-exclamation"></i>${c.overdue}</span>` : ''}${c.soon ? `<span class="locnav__mark is-warn" title="期限間近・校正日なし ${c.soon} 件"><i class="fa-solid fa-clock"></i>${c.soon}</span>` : ''}`;

  function render() {
    const st = KK.state.get(); const repo = KK.repo;
    const { total, all } = tally();
    const item = (l, depth) => {
      const c = total.get(l.id) || { n: 0, overdue: 0, soon: 0 };
      const kids = repo.locations.children(l.id);
      return `<button class="locnav__item" data-loc="${l.id}" aria-current="${st.locationId === l.id}" style="--depth:${depth}">
          <i class="fa-solid ${kids.length ? 'fa-folder-open' : 'fa-location-dot'} locnav__icon"></i><span class="locnav__name">${esc(l.name)}</span>${marks(c)}<span class="locnav__n">${c.n}</span></button>` +
        kids.map((k) => item(k, depth + 1)).join('');
    };
    const tops = repo.locations.children(null);
    root.innerHTML = `
      <div class="locnav__head"><span>設置先</span><button class="btn btn--ghost btn--icon" data-collapse title="設置先の一覧を畳む"><i class="fa-solid fa-angles-left"></i></button></div>
      <div class="locnav__list" role="tree">
        <button class="locnav__item locnav__item--all" data-loc="ALL" aria-current="${st.locationId === 'ALL'}" style="--depth:0">
          <i class="fa-solid fa-layer-group locnav__icon"></i><span class="locnav__name">すべて</span>${marks(all)}<span class="locnav__n">${all.n}</span></button>
        ${tops.map((l) => item(l, 0)).join('')}
        ${tops.length ? '' : '<div class="locnav__empty">設置先がまだありません</div>'}
      </div>
      <button class="btn btn--ghost locnav__add" data-add-loc><i class="fa-solid fa-plus"></i>設置先を追加・編集</button>`;
  }

  function mount(node) {
    root = node;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-loc]');
      if (b) { KK.state.set({ locationId: b.dataset.loc, selectedId: null, statusFilter: 'all' }); return; }
      if (e.target.closest('[data-collapse]')) KK.state.set({ navCollapsed: true });
      if (e.target.closest('[data-add-loc]')) KK.masters.openLocations();
    });
    root.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const items = [...root.querySelectorAll('[data-loc]')]; const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault(); items[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    });
    KK.bus.on('data:changed', render);
    KK.bus.on('state:changed', ({ keys }) => {
      if (keys.includes('locationId')) render();
      if (keys.includes('navCollapsed')) document.body.classList.toggle('is-nav-collapsed', KK.state.get().navCollapsed);
    });
    document.body.classList.toggle('is-nav-collapsed', KK.state.get().navCollapsed);
    render();
  }

  KK.locnav = { mount, render };
})();
