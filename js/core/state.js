/* ── 画面の状態（1 か所で管理） ──
   変更は set() だけで行い、'state:changed' で変わったキーを通知する。
   persist に挙げたキーはブラウザに保存し、次に開いたときに戻す。 */
(function () {
  'use strict';
  const KK = window.KK;

  const state = {
    locationId: 'ALL',      // 'ALL' は全体
    statusFilter: 'all',
    query: '',
    searchScope: 'here',    // here: この設置先 / all: すべて
    selectedId: null,
    expanded: [],           // 構成を開いている親の ID
    density: 'standard',
    hiddenColumns: [],
    showRetired: false,
    kinds: [],              // 空はすべて
    navCollapsed: false,
    sort: { key: 'status', dir: 'desc' }
  };
  const persist = ['locationId', 'density', 'hiddenColumns', 'showRetired', 'kinds', 'navCollapsed', 'expanded', 'sort'];

  KK.state = {
    get: () => state,
    set(patch) {
      const keys = Object.keys(patch).filter((k) => JSON.stringify(state[k]) !== JSON.stringify(patch[k]));
      if (!keys.length) return;
      keys.forEach((k) => { state[k] = patch[k]; });
      if (keys.some((k) => persist.includes(k))) save();
      KK.bus.emit('state:changed', { keys });
    },
    restore() {
      const saved = KK.repo.settings.get('uiState', {});
      persist.forEach((k) => { if (saved[k] !== undefined) state[k] = saved[k]; });
      if (state.locationId !== 'ALL' && !KK.repo.locations.get(state.locationId)) state.locationId = 'ALL';
    },
    toggleExpanded(id, open) {
      const set = new Set(state.expanded);
      const willOpen = open ?? !set.has(id);
      willOpen ? set.add(id) : set.delete(id);
      KK.state.set({ expanded: [...set] });
    }
  };
  const save = KK.util.debounce(() => {
    const out = {}; persist.forEach((k) => { out[k] = state[k]; });
    KK.repo.settings.set('uiState', out).catch(() => {});
  }, 80);
})();
