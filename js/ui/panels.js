/* ── アイコン列と脇パネル ──
   パネルは登録簿（KK.panelRegistry）から作る。足すときは register() だけでよい。
   最初は閉じておき、アイコンを押すと開く。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;

  KK.panelRegistry = KK.createRegistry('panels');
  let railEl = null, panelEl = null, openId = null;

  // ── 絞り込み ──
  KK.panelRegistry.register({
    id: 'filter', order: 1, group: 'work', icon: 'fa-filter', label: '絞り込み',
    active: () => { const s = KK.state.get(); return s.kinds.length + (s.showRetired ? 1 : 0); },
    render() {
      const s = KK.state.get();
      const n = (k) => KK.repo.assets.list().filter((a) => KK.rules.category(a).kind === k && a.state !== 'retired').length;
      return `<h3><i class="fa-solid fa-filter"></i>絞り込み</h3>
        <div class="panel-group"><div class="panel-group__label">大分類（選ばなければすべて）</div>
          ${KK.kinds.list().map((k) => `<label class="chk"><input type="checkbox" data-kind="${k.id}" ${s.kinds.includes(k.id) ? 'checked' : ''}><i class="fa-solid ${k.icon}"></i>${esc(k.label)}<span class="count">${n(k.id)}</span></label>`).join('')}</div>
        <div class="panel-group"><div class="panel-group__label">廃棄</div>
          <label class="chk"><input type="checkbox" data-retired ${s.showRetired ? 'checked' : ''}>廃棄した個体も表示する<span class="count">${KK.repo.assets.list().filter((a) => a.state === 'retired').length}</span></label></div>
        <div class="panel-group"><div class="panel-group__label">状態</div><div class="sub">状態の絞り込みは、表の上の件数ボタンで行います。</div></div>`;
    },
    wire(el) {
      el.addEventListener('change', (e) => {
        if (e.target.dataset.kind) {
          const set = new Set(KK.state.get().kinds);
          e.target.checked ? set.add(e.target.dataset.kind) : set.delete(e.target.dataset.kind);
          KK.state.set({ kinds: [...set] });
        }
        if (e.target.matches('[data-retired]')) KK.state.set({ showRetired: e.target.checked });
      });
    }
  });

  // ── 表示 ──
  KK.panelRegistry.register({
    id: 'view', order: 2, group: 'work', icon: 'fa-sliders', label: '表示',
    render() {
      const s = KK.state.get();
      const dens = [['compact', 'コンパクト'], ['standard', '標準'], ['comfortable', 'ゆったり']];
      return `<h3><i class="fa-solid fa-sliders"></i>表示</h3>
        <div class="panel-group"><div class="panel-group__label">表示密度</div>
          <div class="seg">${dens.map(([v, l]) => `<button class="seg__btn" data-density="${v}" aria-pressed="${s.density === v}">${l}</button>`).join('')}</div></div>
        <div class="panel-group"><div class="panel-group__label">表示する列</div>
          ${KK.columns.list().map((c) => `<label class="chk"><input type="checkbox" data-col="${c.id}" ${c.fixed ? 'checked disabled' : (s.hiddenColumns.includes(c.id) ? '' : 'checked')}>${esc(c.label)}${c.fixed ? '<span class="count">常に表示</span>' : ''}</label>`).join('')}
          <button class="btn btn--ghost" data-col-reset><i class="fa-solid fa-rotate-left"></i>初期の列に戻す</button></div>
        <div class="panel-group"><div class="panel-group__label">列の幅</div>
          <div class="sub">列見出しの右端をドラッグすると幅を変えられます。ダブルクリックでその列だけ自動の幅に戻ります。</div>
          <button class="btn btn--ghost" data-width-reset ${Object.keys(s.columnWidths).length ? '' : 'disabled title="手動で変えた列はありません"'}><i class="fa-solid fa-left-right"></i>すべての列を自動の幅に戻す${Object.keys(s.columnWidths).length ? `（${Object.keys(s.columnWidths).length} 列）` : ''}</button></div>`;
    },
    wire(el) {
      el.addEventListener('click', (e) => {
        const d = e.target.closest('[data-density]'); if (d) { KK.state.set({ density: d.dataset.density }); rerender(); }
        if (e.target.closest('[data-col-reset]')) { KK.state.set({ hiddenColumns: KK.defaultHiddenColumns.slice() }); rerender(); }
        if (e.target.closest('[data-width-reset]')) { KK.state.set({ columnWidths: {} }); rerender(); KK.toast('列の幅を自動に戻しました'); }
      });
      el.addEventListener('change', (e) => {
        const id = e.target.dataset.col; if (!id) return;
        const set = new Set(KK.state.get().hiddenColumns);
        e.target.checked ? set.delete(id) : set.add(id);
        KK.state.set({ hiddenColumns: [...set] });
      });
    }
  });

  // ── 分類と項目・設置先 ──
  KK.panelRegistry.register({
    id: 'master', order: 3, group: 'setup', icon: 'fa-shapes', label: '分類・設置先',
    render() {
      return `<h3><i class="fa-solid fa-shapes"></i>分類・設置先</h3>
        <div class="panel-group"><button class="btn btn--block" data-open-cat><i class="fa-solid fa-shapes"></i>分類と項目を編集</button>
          <div class="sub">分類ごとに、持つ項目・校正周期・見分け方（識別キー）を決めます。分類 ${KK.repo.categories.list().length} 件</div></div>
        <div class="panel-group"><button class="btn btn--block" data-open-loc><i class="fa-solid fa-location-dot"></i>設置先を編集</button>
          <div class="sub">部 › 課 › ライン の階層。設置先 ${KK.repo.locations.list().length} 件</div></div>`;
    },
    wire(el) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-open-cat]')) KK.masters.openCategories();
        if (e.target.closest('[data-open-loc]')) KK.masters.openLocations();
      });
    }
  });

  // ── サンプルデータ ──
  KK.panelRegistry.register({
    id: 'sample', order: 4, group: 'data', icon: 'fa-flask', label: 'サンプルデータ',
    render() {
      const loaded = KK.sampleService.loaded(); const n = KK.sampleService.count();
      return `<h3><i class="fa-solid fa-flask"></i>サンプルデータ</h3>
        <div class="sub" style="margin-bottom:8px">読み込むと動きを確かめられます。サンプルには <span class="tag">サンプル</span> の印が付き、自分で登録したデータとは別に消せます。</div>
        ${KK.samplePatterns.list().map((p) => {
          const done = loaded.includes(p.id);
          return `<div class="sample-card"><div class="sample-card__title"><i class="fa-solid ${p.icon}"></i>${esc(p.label)}</div>
            <div class="sub">${esc(p.desc)}</div>
            <button class="btn btn--small" data-load="${p.id}" ${done ? 'disabled' : ''}>${done ? '<i class="fa-solid fa-check"></i>読み込み済み' : '<i class="fa-solid fa-download"></i>読み込む'}</button></div>`;
        }).join('')}
        <div class="panel-group" style="margin-top:12px">
          <button class="btn btn--block" data-clear-sample ${n ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i>サンプルだけを消す${n ? `（${n.toLocaleString()} 個体）` : ''}</button>
          <div class="sub">${n ? '自分で登録したデータは残ります。消した後も「元に戻す」で戻せます。' : 'サンプルは読み込まれていません。'}</div></div>`;
    },
    wire(el) {
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-load]');
        if (b) {
          b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>読み込み中…';
          try {
            const t0 = performance.now();
            const d = await KK.sampleService.load(b.dataset.load);
            KK.toast(`サンプル「${KK.samplePatterns.get(b.dataset.load).label}」を読み込みました（${d.assets.length.toLocaleString()} 個体・${Math.round(performance.now() - t0)} ms）`);
          } catch (err) { KK.toast(`読み込めませんでした：${err.message}`, { kind: 'danger' }); }
          rerender(); return;
        }
        const c = e.target.closest('[data-clear-sample]');
        if (c) {
          c.disabled = true; c.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>消去中…';
          try {
            const snap = await KK.sampleService.clear();
            KK.state.set({ selectedId: null });
            KK.toast(`サンプル ${snap.assets.length.toLocaleString()} 個体を消しました。自分のデータは残っています`, { kind: 'warn', undo: async () => { await KK.sampleService.undoClear(snap); rerender(); } });
          } catch (err) { KK.toast(`消せませんでした：${err.message}`, { kind: 'danger' }); }
          rerender();
        }
      });
    }
  });

  // ── バックアップ ──
  KK.panelRegistry.register({
    id: 'backup', order: 5, group: 'data', icon: 'fa-floppy-disk', label: 'バックアップ',
    active: () => (KK.backupService.needsReminder() ? 1 : 0),
    render() {
      const last = KK.backupService.lastExport();
      const warn = KK.backupService.needsReminder();
      return `<h3><i class="fa-solid fa-floppy-disk"></i>バックアップ</h3>
        <div class="notice notice--${warn ? 'warn' : 'info'}"><i class="fa-solid ${warn ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
          <span>データはこの PC のこのブラウザの中だけに保存されています。ブラウザのデータを消すと台帳も消えるため、定期的に書き出してください。</span></div>
        <div class="panel-group"><div class="panel-group__label">前回の書き出し：<b>${last ? esc(last) : 'まだありません'}</b></div>
          <button class="btn btn--block" data-export><i class="fa-solid fa-file-export"></i>JSON に書き出す</button></div>
        <div class="panel-group">
          <label class="btn btn--block"><i class="fa-solid fa-file-import"></i>JSON から読み込む<input type="file" accept=".json,application/json" hidden data-import></label>
          <div class="sub">読み込むと、いまの台帳を置き換えます。直後なら「元に戻す」で戻せます。</div></div>
        <div class="panel-group"><div class="panel-group__label">保存量</div><div class="sub" data-usage>確認中…</div></div>`;
    },
    async after(el) {
      const est = await KK.db.estimate();
      const u = el.querySelector('[data-usage]');
      if (u) u.textContent = est ? `${KK.util.formatBytes(est.usage || 0)} 使用（上限の目安 ${KK.util.formatBytes(est.quota || 0)}）` : 'このブラウザでは確認できません';
    },
    wire(el) {
      el.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-export]')) return;
        try { const r = await KK.backupService.exportJson(); KK.toast(`${r.assets.toLocaleString()} 個体を「${r.name}」に書き出しました（${KK.util.formatBytes(r.size)}）`); }
        catch (err) { KK.toast(`書き出せませんでした：${err.message}`, { kind: 'danger' }); }
        rerender(); renderRail();
      });
      el.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-import]') || !e.target.files[0]) return;
        try {
          const r = await KK.backupService.importJson(e.target.files[0]);
          KK.state.set({ selectedId: null, locationId: 'ALL' });
          KK.toast(`${r.assets.toLocaleString()} 個体を読み込みました（${(r.exportedAt || '').slice(0, 10)} の書き出し）`, { undo: () => KK.backupService.undoImport(r.before) });
        } catch (err) { KK.toast(`読み込めませんでした：${err.message}`, { kind: 'danger' }); }
        e.target.value = ''; rerender();
      });
    }
  });

  // ── 開閉 ──
  function renderRail() {
    const groups = ['work', 'setup', 'data'];
    railEl.innerHTML = groups.map((g) => KK.panelRegistry.list().filter((p) => p.group === g).map((p) => {
      const n = p.active ? p.active() : 0;
      return `<button class="rail__btn" data-panel="${p.id}" aria-pressed="${openId === p.id}" aria-label="${esc(p.label)}" data-tip="${esc(p.label)}"><i class="fa-solid ${p.icon}"></i>${n ? `<span class="dot">${n}</span>` : ''}</button>`;
    }).join('')).join('<div class="rail__sep"></div>') +
      '<div class="rail__spacer"></div><button class="rail__btn" data-help aria-label="取扱説明書" data-tip="取扱説明書（F1）"><i class="fa-solid fa-circle-question"></i></button>';
  }
  function rerender() {
    if (!openId) return;
    const p = KK.panelRegistry.get(openId);
    const inner = panelEl.querySelector('.sidepanel__inner');
    inner.innerHTML = p.render();
    p.after && p.after(inner);
  }
  function open(id) {
    openId = openId === id ? null : id;
    panelEl.classList.toggle('is-open', !!openId);
    const inner = panelEl.querySelector('.sidepanel__inner');
    if (openId) {
      const p = KK.panelRegistry.get(openId);
      const fresh = inner.cloneNode(false); inner.replaceWith(fresh); // 前のパネルのイベントを外す
      fresh.innerHTML = p.render(); p.wire && p.wire(fresh); p.after && p.after(fresh);
    }
    renderRail();
  }

  function mount(rail, panel) {
    railEl = rail; panelEl = panel;
    railEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-panel]'); if (b) open(b.dataset.panel);
      if (e.target.closest('[data-help]')) KK.help.open();
    });
    KK.bus.on('state:changed', ({ keys }) => {
      renderRail();
      if (keys.some((k) => ['kinds', 'showRetired'].includes(k)) && openId === 'filter') rerender();
      if (keys.includes('columnWidths') && openId === 'view') rerender();
    });
    KK.bus.on('data:changed', () => { renderRail(); if (openId && openId !== 'view') rerender(); });
    KK.bus.on('filters:cleared', () => { if (openId === 'filter') rerender(); });
    renderRail();
  }

  KK.panels = { mount, open, rerender };
})();
