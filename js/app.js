/* ── 起動と組み立て ──
   部品を画面に取り付け、上部バー（検索・主ボタン）とキーボード操作をつなぐ。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;
  const $ = (s) => document.querySelector(s);

  /** 初回だけ既定の分類を作る（利用者が後で消したものは作り直さない） */
  async function ensureDefaults() {
    if (KK.repo.settings.get('initialized', false)) return;
    if (!KK.repo.categories.list().length) {
      await KK.repo.commit(KK.defaultCategories.map((c, i) => KK.repo.put('categories', { ...c, order: i })), 'categories');
    }
    await KK.repo.settings.set('initialized', true);
  }

  // ── 上部バー ──
  function renderCta() {
    const st = KK.state.get();
    const loc = st.locationId !== 'ALL' && KK.repo.locations.get(st.locationId);
    $('#cta').innerHTML = `<i class="fa-solid fa-plus"></i><span>${loc ? `${esc(loc.name)} に登録する` : '個体を登録する'}</span>`;
    $('#cta').title = loc ? `${KK.repo.locations.path(st.locationId)} に新しい個体を登録します（N）` : '新しい個体を登録します（N）';
  }
  function renderSearch() {
    const st = KK.state.get();
    const input = $('#q');
    if (document.activeElement !== input) input.value = st.query;
    $('#qClear').hidden = !st.query;
    const here = st.locationId !== 'ALL';
    $('#scope').hidden = !here;
    $('#scope').innerHTML = `<button class="seg__btn" data-scope="here" aria-pressed="${st.searchScope === 'here'}">この設置先</button><button class="seg__btn" data-scope="all" aria-pressed="${st.searchScope === 'all'}">すべて</button>`;
  }
  function wireTopbar() {
    const setQuery = KK.util.debounce((v) => KK.state.set({ query: v, selectedId: null }), 150);
    $('#q').addEventListener('input', (e) => { $('#qClear').hidden = !e.target.value; setQuery(e.target.value.trim()); });
    $('#q').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.target.value = ''; KK.state.set({ query: '' }); }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('.ledger__table').focus(); const first = KK.ledger.rows()[0]; if (first) KK.ledger.select(first); }
    });
    $('#qClear').addEventListener('click', () => { $('#q').value = ''; KK.state.set({ query: '' }); $('#q').focus(); });
    $('#scope').addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (b) KK.state.set({ searchScope: b.dataset.scope }); });
    $('#cta').addEventListener('click', () => KK.assetForm.openNew());
  }

  // ── キーボード ──
  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'F1') { e.preventDefault(); KK.help.open(); return; }
      if (e.key === 'Escape') {
        if (document.querySelector('.menu')) { document.querySelector('.menu').remove(); return; }
        if (KK.closeTopWindow()) return;
        if (KK.state.get().selectedId) { KK.state.set({ selectedId: null }); $('.ledger__table').focus(); }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); KK.assetForm.openNew(); }
      else if ((e.key === 'e' || e.key === 'E') && KK.state.get().selectedId) { e.preventDefault(); KK.assetForm.openEdit(KK.state.get().selectedId); }
    });
  }

  function applyDensity() { document.documentElement.dataset.density = KK.state.get().density; }

  function fatal(err) {
    $('#ledger').innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation empty__icon" style="color:var(--color-danger)"></i>
      <p><b>データを読み込めませんでした。</b></p><p class="sub">${esc(err.message || String(err))}</p>
      <p class="sub">InPrivate ウィンドウでは保存できないことがあります。通常のウィンドウで開き直してください。</p></div>`;
    console.error(err);
  }

  async function start() {
    try {
      await KK.repo.load();
      await ensureDefaults();
    } catch (e) { fatal(e); return; }
    KK.state.restore();
    if (!KK.repo.settings.get('uiState')) KK.state.set({ hiddenColumns: KK.defaultHiddenColumns.slice() });
    applyDensity();
    KK.panels.mount($('#rail'), $('#panel'));
    KK.locnav.mount($('#locnav'));
    KK.ledger.mount($('#ledger'));
    KK.detail.mount($('#detail'));
    wireTopbar(); wireKeys();
    renderCta(); renderSearch();
    KK.bus.on('state:changed', ({ keys }) => {
      if (keys.includes('density')) applyDensity();
      if (keys.some((k) => ['locationId', 'query', 'searchScope'].includes(k))) { renderCta(); renderSearch(); }
    });
    KK.bus.on('data:changed', renderCta);
    if (window.__iconLoadFailed) KK.toast('アイコンを読み込めませんでした（ネット未接続の可能性）。操作には影響しません', { kind: 'info' });
    document.body.classList.add('is-ready');
  }

  document.addEventListener('DOMContentLoaded', start);
})();
