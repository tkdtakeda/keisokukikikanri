/* ── 保存係（リポジトリ） ──
   画面はここだけを通してデータを読み書きする。全件をメモリに持ち、書き込みは IndexedDB にも反映する。
   変更後は 'data:changed' を通知する。 */
(function () {
  'use strict';
  const KK = window.KK;
  const db = KK.db;

  const cache = { locations: new Map(), categories: new Map(), assets: new Map(), events: new Map() };
  const meta = new Map();
  let childIndex = null; // parentId → [asset]

  const changed = (what) => { childIndex = null; KK.bus.emit('data:changed', { what }); };

  async function load() {
    await db.open();
    const [locs, cats, assets, events, metas] = await Promise.all(['locations', 'categories', 'assets', 'events', 'meta'].map(db.getAll));
    cache.locations = new Map(locs.map((x) => [x.id, x]));
    cache.categories = new Map(cats.map((x) => [x.id, x]));
    cache.assets = new Map(assets.map((x) => [x.id, x]));
    cache.events = new Map(events.map((x) => [x.id, x]));
    meta.clear(); metas.forEach((m) => meta.set(m.key, m.value));
    childIndex = null;
  }

  /** 書き込み：ops を IndexedDB に送り、成功したらキャッシュに反映 */
  async function commit(ops, what) {
    await db.write(ops);
    ops.forEach((o) => {
      const c = cache[o.store];
      if (!c) return;
      if (o.type === 'put') c.set(o.value.id, o.value);
      else if (o.type === 'del') c.delete(o.key);
      else if (o.type === 'clear') c.clear();
    });
    changed(what);
  }

  function buildChildIndex() {
    childIndex = new Map();
    cache.assets.forEach((a) => {
      const k = a.parentId || '';
      if (!childIndex.has(k)) childIndex.set(k, []);
      childIndex.get(k).push(a);
    });
  }

  // ── 設置先 ──
  const locations = {
    list: () => [...cache.locations.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ja')),
    get: (id) => cache.locations.get(id),
    children: (id) => locations.list().filter((l) => (l.parentId || null) === (id || null)),
    /** 自分と配下の設置先 ID */
    subtreeIds(id) { return [id, ...locations.children(id).flatMap((c) => locations.subtreeIds(c.id))]; },
    path(id, sep = ' › ') {
      const names = [];
      for (let l = cache.locations.get(id), guard = 0; l && guard < 20; l = cache.locations.get(l.parentId), guard++) names.unshift(l.name);
      return names.join(sep);
    },
    save: (loc) => commit([db.put('locations', loc)], 'locations')
  };

  // ── 分類 ──
  const categories = {
    list: () => [...cache.categories.values()].sort((a, b) => {
      const ka = KK.kinds.get(a.kind)?.order ?? 9, kb = KK.kinds.get(b.kind)?.order ?? 9;
      return ka - kb || (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ja');
    }),
    get: (id) => cache.categories.get(id),
    usage: (id) => [...cache.assets.values()].filter((a) => a.categoryId === id).length,
    save: (cat) => commit([db.put('categories', cat)], 'categories'),
    remove: (id) => commit([db.del('categories', id)], 'categories')
  };

  // ── 個体 ──
  const assets = {
    list: () => [...cache.assets.values()],
    get: (id) => cache.assets.get(id),
    children(id) {
      if (!childIndex) buildChildIndex();
      return (childIndex.get(id || '') || []).slice().sort(KK.rules.compareIdentity);
    },
    descendants(id) { return assets.children(id).flatMap((c) => [c, ...assets.descendants(c.id)]); },
    ancestors(id) {
      const out = [];
      for (let a = cache.assets.get(cache.assets.get(id)?.parentId), g = 0; a && g < 20; a = cache.assets.get(a.parentId), g++) out.push(a);
      return out;
    },
    topOf(id) { const anc = assets.ancestors(id); return anc.length ? anc[anc.length - 1] : cache.assets.get(id); }
  };

  // ── 記録 ──
  const events = {
    forAsset: (id) => [...cache.events.values()].filter((e) => e.assetId === id)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
  };

  // ── 添付（本体は必要なときだけ読む） ──
  const attachments = {
    async forAsset(id) {
      const all = await db.getAll('attachments');
      return all.filter((x) => x.assetId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    add: (att) => db.write([db.put('attachments', att)]).then(() => changed('attachments')),
    remove: (id) => db.write([db.del('attachments', id)]).then(() => changed('attachments'))
  };

  // ── 設定など ──
  const settings = {
    get: (key, fallback) => (meta.has(key) ? meta.get(key) : fallback),
    async set(key, value) { meta.set(key, value); await db.write([db.put('meta', { key, value })]); }
  };

  /** 個体とその記録・添付の写し（取り消し用） */
  async function snapshotAssets(ids) {
    const set = new Set(ids);
    const atts = (await db.getAll('attachments')).filter((x) => set.has(x.assetId));
    return {
      assets: ids.map((id) => cache.assets.get(id)).filter(Boolean),
      events: [...cache.events.values()].filter((e) => set.has(e.assetId)),
      attachments: atts
    };
  }
  async function removeAssets(ids) {
    const snap = await snapshotAssets(ids);
    await commit([
      ...snap.assets.map((a) => db.del('assets', a.id)),
      ...snap.events.map((e) => db.del('events', e.id)),
      ...snap.attachments.map((x) => db.del('attachments', x.id))
    ], 'assets');
    return snap;
  }
  async function restore(snap) {
    await commit([
      ...(snap.locations || []).map((x) => db.put('locations', x)),
      ...(snap.categories || []).map((x) => db.put('categories', x)),
      ...(snap.assets || []).map((x) => db.put('assets', x)),
      ...(snap.events || []).map((x) => db.put('events', x)),
      ...(snap.attachments || []).map((x) => db.put('attachments', x))
    ], 'restore');
  }

  /** 全データ（バックアップ用） */
  async function dumpAll() {
    return {
      locations: [...cache.locations.values()],
      categories: [...cache.categories.values()],
      assets: [...cache.assets.values()],
      events: [...cache.events.values()],
      attachments: await db.getAll('attachments')
    };
  }
  /** 全データを置き換える（読み込み用） */
  async function replaceAll(data) {
    const stores = ['locations', 'categories', 'assets', 'events', 'attachments'];
    await commit([
      ...stores.map((s) => db.clear(s)),
      ...stores.flatMap((s) => (data[s] || []).map((x) => db.put(s, x)))
    ], 'replace');
  }

  KK.repo = { load, commit, locations, categories, assets, events, attachments, settings, snapshotAssets, removeAssets, restore, dumpAll, replaceAll, put: db.put, del: db.del };
})();
