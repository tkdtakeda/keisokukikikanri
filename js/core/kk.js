/* ── 名前空間・共通処理 ──
   window.KK にすべての部品を登録する。モジュールを使わず、file:// で動かすため。 */
(function () {
  'use strict';

  const KK = (window.KK = window.KK || {});

  // ── EventBus：部品どうしは購読と通知でつなぐ ──
  const handlers = new Map();
  KK.bus = {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name).delete(fn);
    },
    emit(name, payload) {
      (handlers.get(name) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(`[bus] ${name}`, e); }
      });
    }
  };

  // ── 登録簿：仲間を足すだけで機能を追加できる（開放閉鎖） ──
  KK.createRegistry = function (name) {
    const items = [];
    return {
      name,
      register(item) {
        if (!item || !item.id) throw new Error(`${name}: id が必要です`);
        const i = items.findIndex((x) => x.id === item.id);
        if (i >= 0) items[i] = item; else items.push(item);
        items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
        return item;
      },
      get: (id) => items.find((x) => x.id === id),
      list: () => items.slice()
    };
  };

  // ── 小さな道具 ──
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  KK.util = {
    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    uid(prefix = '') {
      const r = (crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Math.random() * 2 ** 32];
      return prefix + Date.now().toString(36) + Array.from(r, (x) => (x >>> 0).toString(36)).join('');
    },
    /** ローカル日付の YYYY-MM-DD */
    today() {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    nowIso: () => new Date().toISOString(),
    /** 月を足す。月末を越える日は月末に丸める（1/31 + 1か月 = 2/28） */
    addMonths(iso, months) {
      if (!iso) return '';
      const [y, m, d] = iso.split('-').map(Number);
      const target = new Date(Date.UTC(y, m - 1 + months, 1));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      target.setUTCDate(Math.min(d, last));
      return target.toISOString().slice(0, 10);
    },
    daysBetween(fromIso, toIso) {
      return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
    },
    isValidDate(iso) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
      const [y, m, d] = iso.split('-').map(Number);
      const t = new Date(Date.UTC(y, m - 1, d));
      return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    },
    /** 検索用の正規化：全角半角・大文字小文字・ひらがなカタカナを同一視 */
    norm(s) {
      return String(s ?? '').normalize('NFKC').toLowerCase()
        .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
    },
    debounce(fn, ms) {
      let t = null;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },
    /** 乱数の種を固定した疑似乱数（サンプルを毎回同じにする） */
    seeded(seed) {
      let s = seed >>> 0;
      return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    formatBytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },
    /** HTML 文字列から要素を 1 つ作る */
    el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    }
  };
})();
