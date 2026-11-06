/* ── IndexedDB の薄い包み ──
   保存先を直接触るのはこのファイルだけ。将来サーバーに移すときは、同じ形の関数を差し替える。 */
(function () {
  'use strict';
  const KK = window.KK;

  const DB_NAME = 'keisoku-kiki-kanri';
  const DB_VERSION = 1;
  const STORES = {
    locations: {},
    categories: {},
    assets: { indexes: ['parentId', 'locationId'] },
    events: { indexes: ['assetId'] },
    attachments: { indexes: ['assetId'] },
    meta: { keyPath: 'key' }
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('このブラウザでは IndexedDB を使えません')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.entries(STORES).forEach(([name, def]) => {
          if (db.objectStoreNames.contains(name)) return;
          const os = db.createObjectStore(name, { keyPath: def.keyPath || 'id' });
          (def.indexes || []).forEach((ix) => os.createIndex(ix, ix, { unique: false }));
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('データベースを開けませんでした'));
      req.onblocked = () => reject(new Error('別のタブがデータベースを使用中です。他のタブを閉じてから開き直してください'));
    });
    return dbPromise;
  }

  const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  /** 複数ストアへの書き込みを 1 つのトランザクションで行う。ops: [{store, put|del, value|key}] */
  async function write(ops) {
    const db = await open();
    const names = [...new Set(ops.map((o) => o.store))];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      ops.forEach((o) => {
        const os = tx.objectStore(o.store);
        if (o.type === 'put') os.put(o.value);
        else if (o.type === 'del') os.delete(o.key);
        else if (o.type === 'clear') os.clear();
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('保存に失敗しました'));
      tx.onabort = () => reject(tx.error || new Error('保存が中断されました（容量不足の可能性があります）'));
    });
  }

  async function getAll(store) {
    const db = await open();
    return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function get(store, key) {
    const db = await open();
    return wrap(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function estimate() {
    try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; }
  }

  KK.db = {
    open, write, getAll, get, estimate,
    storeNames: Object.keys(STORES),
    put: (store, value) => ({ store, type: 'put', value }),
    del: (store, key) => ({ store, type: 'del', key }),
    clear: (store) => ({ store, type: 'clear' })
  };
})();
