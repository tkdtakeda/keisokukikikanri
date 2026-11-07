/* ── 会社・型式の台帳（候補・作成・使用数・文字からの読み取り） ──
   会社には役割の印を持たせない。機器の「メーカー」「校正会社」のどちらの欄に入れたかで役割が決まる。 */
(function () {
  'use strict';
  const KK = window.KK;
  const U = KK.util;
  const repo = () => KK.repo;
  const I = () => KK.inherit;

  const directory = {
    /** 会社の使用数。role の数え方は「引き継いだ値も含めた、実際にその役割を担っている機器の数」 */
    companyUsage(id) {
      const assets = repo().assets.list().filter((a) => a.state !== 'retired');
      return {
        maker: assets.filter((a) => I().maker(a).value === id).length,
        calibrator: assets.filter((a) => I().calType(a).value === 'external' && I().calibrator(a).value === id).length,
        models: repo().models.list().filter((m) => m.makerId === id).length,
        // 削除できるか：直接参照されていないこと
        direct: repo().assets.list().filter((a) => a.makerId === id || a.calibratorId === id).length + repo().models.list().filter((m) => m.makerId === id).length
      };
    },
    modelUsage: (id) => repo().assets.list().filter((a) => a.modelId === id).length,

    /** 会社の候補。role（maker / calibrator）でよく使う会社を上に */
    companyItems(role) {
      const count = new Map();
      repo().assets.list().forEach((a) => {
        const id = role === 'calibrator' ? a.calibratorId : a.makerId;
        if (id) count.set(id, (count.get(id) || 0) + 1);
      });
      if (role === 'maker') repo().models.list().forEach((m) => { if (m.makerId) count.set(m.makerId, (count.get(m.makerId) || 0) + 1); });
      return repo().companies.list()
        .map((c) => ({ id: c.id, label: c.name, sub: c.short || '', keys: c.short || '', n: count.get(c.id) || 0 }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ja'));
    },
    /** 型式の候補。使用中の機器が多い型式を上に（廃棄だけで使われている型式は下に） */
    modelItems(categoryId) {
      const count = new Map();
      repo().assets.list().forEach((a) => { if (a.modelId && a.state !== 'retired') count.set(a.modelId, (count.get(a.modelId) || 0) + 1); });
      return repo().models.forCategory(categoryId).sort((x, y) => (count.get(y.id) || 0) - (count.get(x.id) || 0)).map((m) => ({
        id: m.id, label: I().modelLabel(m),
        sub: [I().companyName(m.makerId), directory.rangeText(m.range, m.unit ?? repo().categories.get(categoryId)?.unit)].filter(Boolean).join('・'),
        keys: [m.modelNo, m.name, I().companyName(m.makerId)].join(' ')
      }));
    },
    rangeText(r, unit) {
      if (!r || (r.min === '' && r.max === '') || (r.min == null && r.max == null)) return '';
      const u = r.unit ?? unit;
      return `${r.min ?? ''}〜${r.max ?? ''}${u ? ' ' + u : ''}`;
    },

    async createCompany(name, extra = {}) {
      const n = String(name || '').trim();
      if (!n) throw new Error('会社名を入力してください');
      const dup = repo().companies.list().find((c) => U.norm(c.name) === U.norm(n));
      if (dup) return dup.id;
      const c = { id: U.uid('co'), name: n, short: '', phone: '', address: '', url: '', accreditation: '', note: '', contacts: [], props: {}, createdAt: U.nowIso(), ...extra };
      await repo().companies.save(c);
      KK.toast(`会社「${n}」を登録しました。担当者や電話番号は「会社」の画面で追加できます`, { kind: 'info' });
      return c.id;
    },
    /** 型式をその場で作る。打った文字は型番として扱う */
    async createModel(categoryId, text, extra = {}) {
      const t = String(text || '').trim();
      if (!t) throw new Error('型番または名称を入力してください');
      if (!categoryId) throw new Error('先に分類を選んでください');
      const m = { id: U.uid('md'), categoryId, modelNo: t, name: '', makerId: null, range: null, unit: null, resolution: null, props: {}, note: '', createdAt: U.nowIso(), ...extra };
      await repo().models.save(m);
      KK.toast(`型式「${t}」を登録しました。測定範囲などは「型式」の画面で追加できます`, { kind: 'info' });
      return m.id;
    },

    // ── 文字からの読み取り（旧データの移し替え・サンプル用） ──
    /** 「MDC-25MX 0-25mm」→ 型番 MDC-25MX ＋ 名称 0-25mm。先頭が型番らしくなければ全部を名称に */
    splitModel(text) {
      const t = String(text || '').trim();
      const m = t.match(/^(\S+)\s+(.+)$/);
      const head = m ? m[1] : t;
      const looksNo = /^[A-Za-z0-9][A-Za-z0-9\-\/._]*$/.test(head) && /\d/.test(head) && !/^\d+(\.\d+)?(mm|µm|um|kN|N|m)$/i.test(head);
      return looksNo ? { modelNo: head, name: m ? m[2] : '' } : { modelNo: '', name: t };
    },
    /** 「0-25 mm」「0.03〜0.5mm」→ { min, max, unit } */
    parseRange(text) {
      const s = String(text || '').normalize('NFKC');
      const m = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|~|〜|～|－)\s*(-?\d+(?:\.\d+)?)\s*([A-Za-zµ%]*)/);
      return m ? { min: m[1], max: m[2], unit: m[3] ? m[3].replace(/^um$/i, 'µm') : null } : null;
    }
  };

  KK.directory = directory;
})();
