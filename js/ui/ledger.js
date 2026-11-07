/* ── 台帳（設置先の見出し＋表） ──
   列は登録簿（KK.columns）から作る。列を足すときは register() だけでよい。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, norm } = KK.util;
  const R = KK.rules;

  // ── 列の登録簿 ──
  KK.columns = KK.createRegistry('columns');
  const dash = '<span class="sub">—</span>';
  [
    { id: 'status', label: '状態', fixed: true, sortVal: (a, c) => -(c.status.rank * 1e6) + (c.status.days ?? 0), cell: (a, c) => KK.badge(c.status) },
    { id: 'identity', label: '番号', fixed: true, sortVal: (a) => R.identity(a), cell: (a, c) => `${c.indent}${c.toggle}<b class="ident">${esc(R.identity(a))}</b>${c.kids ? ` <span class="sub">（${c.kids}）</span>` : ''}${a.sample ? ' <span class="tag tag--sample">サンプル</span>' : ''}` },
    { id: 'category', label: '分類', sortVal: (a) => R.category(a).name, cell: (a) => `${KK.kindTag(a)} ${esc(R.category(a).name)}` },
    { id: 'model', label: '型式・仕様', max: 260, sortVal: (a) => a.model, cell: (a) => esc(a.model) || dash },
    { id: 'resolution', label: '最小表示量', num: true, sortVal: (a) => Number(R.resolution(a).resolution) || 0,
      cell: (a) => (R.resolutionText(a) ? `${esc(R.resolutionText(a))}${R.resolution(a).inheritedRes && R.resolution(a).inheritedUnit ? '' : ' <span class="tag" title="この機器で上書き">上書き</span>'}` : dash) },
    { id: 'mgmtNo', label: '管理番号', sortVal: (a) => a.mgmtNo, cell: (a) => esc(a.mgmtNo) || dash },
    { id: 'serial', label: '製造番号', sortVal: (a) => a.serial, cell: (a) => esc(a.serial) || dash },
    { id: 'maker', label: 'メーカー', sortVal: (a) => a.maker, cell: (a) => esc(a.maker) || dash },
    { id: 'location', label: '置き場所', max: 280, sortVal: (a) => KK.repo.locations.path(a.locationId), cell: (a, c) => esc(c.locText) },
    { id: 'lastCal', label: '前回校正', num: true, sortVal: (a) => R.calDate(a), cell: (a) => (R.calDate(a) ? `${R.calDate(a)}${R.isCalInherited(a) ? ' <span class="tag" title="親の校正日を引き継いでいます">親</span>' : ''}` : dash) },
    { id: 'interval', label: '周期', num: true, sortVal: (a) => R.interval(a), cell: (a) => `${R.interval(a)} か月` },
    { id: 'due', label: '次回期限', num: true, sortVal: (a) => R.dueDate(a) || '9999', cell: (a) => R.dueDate(a) || dash },
    { id: 'standards', label: '使用標準器', max: 260,
      sortVal: (a) => KK.trace.standardsOf(KK.trace.currentCalEvent(a)).map((s) => s.label).join('、'),
      cell: (a) => {
        const e = KK.trace.currentCalEvent(a); const list = KK.trace.standardsOf(e);
        if (!list.length) return dash;
        const bad = list.some((s) => s.asset && KK.trace.statusAsOf(s.asset, e.date).key === 'overdue');
        return `${bad ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-danger)" title="校正時に期限切れの標準器を使用"></i> ' : ''}${esc(list.map((s) => s.asset ? R.identity(s.asset) : s.label).join('、'))}`;
      } },
    { id: 'note', label: '備考', max: 240, sortVal: (a) => a.note, cell: (a) => esc(a.note) }
  ].forEach((c, i) => KK.columns.register({ ...c, order: i }));
  KK.defaultHiddenColumns = ['mgmtNo', 'maker', 'interval', 'standards', 'note'];

  let root = null;
  let rowOrder = []; // 表示中の行 ID（キーボード移動用）

  // ── 絞り込み ──
  const hay = (a) => norm([a.mgmtNo, a.serial, a.model, a.maker, a.note, R.category(a).name, KK.repo.locations.path(a.locationId),
    ...Object.values(a.props || {})].join(' '));

  function scopeAssets() {
    const st = KK.state.get(); const repo = KK.repo;
    let list = repo.assets.list();
    const searchingAll = st.query && st.searchScope === 'all';
    if (st.locationId !== 'ALL' && !searchingAll) {
      const ids = new Set(repo.locations.subtreeIds(st.locationId));
      list = list.filter((a) => ids.has(a.locationId));
    }
    if (!st.showRetired) list = list.filter((a) => a.state !== 'retired');
    if (st.kinds.length) list = list.filter((a) => st.kinds.includes(R.category(a).kind));
    if (st.query) {
      const terms = norm(st.query).split(/\s+/).filter(Boolean);
      list = list.filter((a) => { const h = hay(a); return terms.every((t) => h.includes(t)); });
    }
    return list;
  }

  function computeView() {
    const st = KK.state.get(); const repo = KK.repo; const today = KK.util.today();
    const scoped = scopeAssets();
    const statusOf = new Map(scoped.map((a) => [a.id, R.status(a, today)]));
    const counts = { all: scoped.length };
    statusOf.forEach((s) => { counts[s.key] = (counts[s.key] || 0) + 1; });
    const match = st.statusFilter === 'all' ? scoped : scoped.filter((a) => statusOf.get(a.id).key === st.statusFilter);
    const filtering = st.statusFilter !== 'all' || !!st.query || st.kinds.length > 0;
    // 一致したものに、構成の親を文脈として加える（どのセットの中かが分かるように）
    const show = new Map(match.map((a) => [a.id, false]));
    match.forEach((a) => repo.assets.ancestors(a.id).forEach((p) => { if (!show.has(p.id)) show.set(p.id, true); }));
    const tops = [...show.keys()].map((id) => repo.assets.get(id)).filter((a) => !a.parentId || !show.has(a.parentId));
    return { scoped, match, show, tops, counts, filtering, today };
  }

  function sortList(list, today) {
    const st = KK.state.get(); const col = KK.columns.get(st.sort.key) || KK.columns.get('status');
    const dir = st.sort.dir === 'asc' ? 1 : -1;
    const coll = new Intl.Collator('ja', { numeric: true });
    const ctx = (a) => ({ status: R.rollup(a, today) });
    const keyed = list.map((a) => [a, col.sortVal(a, ctx(a))]);
    keyed.sort((x, y) => {
      const v = typeof x[1] === 'number' && typeof y[1] === 'number' ? x[1] - y[1] : coll.compare(String(x[1] ?? ''), String(y[1] ?? ''));
      return (st.sort.key === 'status' ? v : v * dir) || R.compareIdentity(x[0], y[0]);
    });
    return keyed.map((k) => k[0]);
  }

  // ── 描画 ──
  function headerHtml(view) {
    const st = KK.state.get(); const repo = KK.repo;
    const isAll = st.locationId === 'ALL';
    const loc = repo.locations.get(st.locationId);
    const name = isAll ? 'すべての設置先' : loc?.name;
    const crumb = isAll ? '' : repo.locations.path(st.locationId);
    const chips = R.statusFilters.filter((f) => f.id === 'all' || view.counts[f.id] || st.statusFilter === f.id).map((f) =>
      `<button class="chip chip--${f.cls}" data-status="${f.id}" aria-pressed="${st.statusFilter === f.id}"><i class="fa-solid ${f.icon}"></i>${f.label}<b>${f.id === 'all' ? view.counts.all : (view.counts[f.id] || 0)}</b></button>`).join('');
    const active = [];
    if (st.query) active.push(`検索「${esc(st.query)}」${st.searchScope === 'all' ? '（すべての設置先）' : ''}`);
    if (st.kinds.length) active.push(st.kinds.map((k) => KK.kinds.get(k)?.label).join('・') + 'のみ');
    if (st.showRetired) active.push('廃棄を含む');
    return `
      <div class="place">
        ${st.navCollapsed ? '<button class="btn btn--ghost btn--icon" data-expand-nav title="設置先の一覧を開く"><i class="fa-solid fa-angles-right"></i></button>' : ''}
        <h2 class="place__name">${esc(name)}</h2><span class="place__crumb">${esc(crumb)}</span>
        <div class="place__chips" role="group" aria-label="状態で絞り込む">${chips}</div>
      </div>
      ${active.length ? `<div class="active-filters"><i class="fa-solid fa-filter"></i>適用中：${active.join('／')}<button class="btn btn--ghost" data-clear-filters><i class="fa-solid fa-xmark"></i>条件を解除</button></div>` : ''}`;
  }

  function tableHtml(view) {
    const st = KK.state.get(); const repo = KK.repo;
    const cols = KK.columns.list().filter((c) => c.fixed || !st.hiddenColumns.includes(c.id));
    const expanded = new Set(st.expanded);
    const baseDepth = st.locationId === 'ALL' ? 0 : repo.locations.path(st.locationId).split(' › ').length;
    rowOrder = [];
    const row = (a, depth) => {
      const context = view.show.get(a.id) === true;
      const kidList = repo.assets.children(a.id).filter((k) => st.showRetired || k.state !== 'retired');
      const visibleKids = view.filtering ? kidList.filter((k) => view.show.has(k.id)) : kidList;
      const open = view.filtering ? visibleKids.length > 0 : expanded.has(a.id);
      const allKids = kidList.length;
      const c = {
        status: depth === 0 ? R.rollup(a, view.today) : R.status(a, view.today),
        indent: `<span class="tree-indent" style="width:${depth * 18}px"></span>`,
        toggle: allKids ? `<button class="tree-toggle" data-toggle="${a.id}" aria-label="構成を${open ? '閉じる' : '開く'}" tabindex="-1"><i class="fa-solid fa-caret-${open ? 'down' : 'right'}"></i></button>` : '<span class="tree-toggle"></span>',
        kids: allKids,
        locText: repo.locations.path(a.locationId).split(' › ').slice(baseDepth).join(' › ') || '（この設置先）'
      };
      rowOrder.push(a.id);
      const cls = [a.id === st.selectedId ? 'is-selected' : '', a.state === 'retired' ? 'is-retired' : '', context ? 'is-context' : ''].join(' ');
      return `<tr data-id="${a.id}" class="${cls}" aria-selected="${a.id === st.selectedId}">${cols.map((col) =>
        `<td class="${col.num ? 'num' : ''}"${col.max ? ` style="max-width:${col.max}px" title="${esc(String(col.sortVal(a, c) ?? ''))}"` : ''}>${col.cell(a, c)}</td>`).join('')}</tr>` +
        (open ? visibleKids.map((k) => row(k, depth + 1)).join('') : '');
    };
    const tops = sortList(view.tops, view.today);
    const head = cols.map((c) => {
      const sorted = st.sort.key === c.id;
      return `<th class="${c.num ? 'num' : ''}" data-col="${c.id}"><button class="th-sort" data-sort="${c.id}" title="並べ替え">${c.label}${sorted ? `<i class="fa-solid fa-arrow-${c.id === 'status' || st.sort.dir === 'desc' ? 'down' : 'up'}"></i>` : ''}</button>
        <span class="col-resize${st.columnWidths[c.id] ? ' is-set' : ''}" data-resize="${c.id}" title="ドラッグで幅を変える／ダブルクリックで自動の幅に戻す"></span></th>`;
    }).join('');
    return { html: `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${tops.map((a) => row(a, 0)).join('')}</tbody></table>`, cols, empty: !tops.length };
  }

  function emptyHtml(view) {
    const st = KK.state.get();
    if (!KK.repo.locations.list().length && !KK.repo.assets.list().length) {
      return `<div class="empty"><i class="fa-solid fa-location-dot empty__icon"></i><p>まず設置先（部・課・ライン）を作り、そこに機器を登録します。</p>
        <div class="empty__actions"><button class="btn btn--primary" data-add-loc-empty><i class="fa-solid fa-plus"></i>設置先を作る</button>
        <button class="btn" data-open-panel="sample"><i class="fa-solid fa-flask"></i>サンプルを読み込んで試す</button></div></div>`;
    }
    if (!KK.repo.assets.list().length) {
      return `<div class="empty"><i class="fa-solid fa-box-open empty__icon"></i><p>まだ機器が登録されていません。</p>
        <div class="empty__actions"><button class="btn btn--primary" data-cta><i class="fa-solid fa-plus"></i>個体を登録する</button>
        <button class="btn" data-open-panel="sample"><i class="fa-solid fa-flask"></i>サンプルを読み込んで試す</button></div></div>`;
    }
    if (view.filtering) return `<div class="empty"><i class="fa-solid fa-filter-circle-xmark empty__icon"></i><p>条件に一致する機器は 0 件です。</p><button class="btn" data-clear-filters><i class="fa-solid fa-xmark"></i>条件を解除</button></div>`;
    return `<div class="empty"><i class="fa-solid fa-location-dot empty__icon"></i><p>この設置先には、まだ機器がありません。</p><button class="btn btn--primary" data-cta><i class="fa-solid fa-plus"></i>ここに登録する</button></div>`;
  }

  // ── 列幅（手動） ──
  // 表示中の列の順番に合わせ、nth-child の規則を 1 つの <style> に書く（行数が多くても速い）
  function widthCss(widths) {
    const st = KK.state.get();
    const cols = KK.columns.list().filter((c) => c.fixed || !st.hiddenColumns.includes(c.id));
    return cols.map((c, i) => (widths[c.id] ? `.ledger .grid th:nth-child(${i + 1}), .ledger .grid td:nth-child(${i + 1}) { width: ${widths[c.id]}px; min-width: ${widths[c.id]}px; max-width: ${widths[c.id]}px !important; }` : '')).join('\n');
  }
  function applyWidths(widths) {
    let el = document.getElementById('colWidths');
    if (!el) { el = document.createElement('style'); el.id = 'colWidths'; document.head.appendChild(el); }
    el.textContent = widthCss(widths || KK.state.get().columnWidths);
  }
  function startResize(e, id) {
    e.preventDefault(); e.stopPropagation();
    const th = e.target.closest('th');
    const startX = e.clientX, startW = th.getBoundingClientRect().width;
    const widths = { ...KK.state.get().columnWidths };
    document.body.classList.add('is-resizing');
    const move = (ev) => { widths[id] = Math.max(48, Math.min(800, Math.round(startW + ev.clientX - startX))); applyWidths(widths); };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('is-resizing');
      KK.state.set({ columnWidths: widths });
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }

  let flashId = null;
  function render() {
    applyWidths();
    const view = computeView();
    root.querySelector('.ledger__head').innerHTML = headerHtml(view);
    const t = tableHtml(view);
    const wrap = root.querySelector('.ledger__table');
    const scroll = wrap.scrollTop;
    wrap.innerHTML = t.empty ? emptyHtml(view) : t.html;
    wrap.scrollTop = scroll;
    root.querySelector('.ledger__foot').innerHTML = `表示 <b>${rowOrder.length.toLocaleString()}</b> 行（一致 ${view.match.length.toLocaleString()} 個体）`;
    if (flashId) { KK.flash(wrap.querySelector(`tr[data-id="${flashId}"]`)); flashId = null; }
    KK.bus.emit('ledger:rendered', view);
  }

  function select(id, opt = {}) {
    KK.state.set({ selectedId: id });
    if (opt.scroll) root.querySelector(`tr[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function mount(node) {
    root = node;
    root.innerHTML = '<div class="ledger__head"></div><div class="ledger__table" tabindex="0" aria-label="台帳の表（↑↓で選択、→←で構成を開閉）"></div><div class="ledger__foot"></div>';
    root.addEventListener('mousedown', (e) => { const h = e.target.closest('[data-resize]'); if (h) startResize(e, h.dataset.resize); });
    root.addEventListener('dblclick', (e) => {
      const h = e.target.closest('[data-resize]'); if (!h) return;
      const w = { ...KK.state.get().columnWidths }; delete w[h.dataset.resize];
      KK.state.set({ columnWidths: w });
    });
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-resize]')) return;
      const chip = t.closest('[data-status]');
      if (chip) { KK.state.set({ statusFilter: KK.state.get().statusFilter === chip.dataset.status && chip.dataset.status !== 'all' ? 'all' : chip.dataset.status }); return; }
      if (t.closest('[data-clear-filters]')) { KK.state.set({ statusFilter: 'all', query: '', kinds: [], showRetired: false }); KK.bus.emit('filters:cleared'); return; }
      if (t.closest('[data-expand-nav]')) { KK.state.set({ navCollapsed: false }); return; }
      if (t.closest('[data-cta]')) { KK.assetForm.openNew(); return; }
      if (t.closest('[data-add-loc-empty]')) { KK.masters.openLocations(); return; }
      const sp = t.closest('[data-open-panel]'); if (sp) { KK.panels.open(sp.dataset.openPanel); return; }
      const s = t.closest('[data-sort]');
      if (s) {
        const cur = KK.state.get().sort;
        KK.state.set({ sort: { key: s.dataset.sort, dir: cur.key === s.dataset.sort && cur.dir === 'asc' ? 'desc' : 'asc' } });
        return;
      }
      const tg = t.closest('[data-toggle]'); if (tg) { KK.state.toggleExpanded(tg.dataset.toggle); return; }
      const tr = t.closest('tr[data-id]'); if (tr) select(tr.dataset.id);
    });
    root.querySelector('.ledger__table').addEventListener('keydown', (e) => {
      const st = KK.state.get(); const i = rowOrder.indexOf(st.selectedId);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = rowOrder[i < 0 ? 0 : Math.max(0, Math.min(rowOrder.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) select(n, { scroll: true });
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && st.selectedId) {
        if (KK.repo.assets.children(st.selectedId).length) { e.preventDefault(); KK.state.toggleExpanded(st.selectedId, e.key === 'ArrowRight'); }
      }
    });
    KK.bus.on('data:changed', render);
    KK.bus.on('state:changed', ({ keys }) => {
      if (keys.some((k) => ['locationId', 'statusFilter', 'query', 'searchScope', 'selectedId', 'expanded', 'hiddenColumns', 'showRetired', 'kinds', 'navCollapsed', 'sort', 'columnWidths'].includes(k))) render();
    });
    KK.bus.on('asset:saved', ({ id }) => { flashId = id; });
    render();
  }

  KK.ledger = { mount, render, select, rows: () => rowOrder.slice() };
})();
