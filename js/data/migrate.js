/* ── データの移し替え（起動時に 1 回） ──
   版を上げるときは、ここに手順を足す。終わった版は meta の schemaVersion に記録する。 */
(function () {
  'use strict';
  const KK = window.KK;

  const steps = [
    {
      version: 2,
      label: '単位と最小表示量を分類・個体の正式な項目にする',
      async run() {
        const repo = KK.repo;
        const ops = [];
        const isResField = (f) => f.type === 'number' && (f.key === 'resolution' || /最小表示量|目量/.test(f.label || ''));
        repo.categories.list().forEach((c) => {
          if (c.unit !== undefined) return;
          const def = KK.defaultCategories.find((d) => d.id === c.id);
          const old = (c.fields || []).find(isResField);
          const assets = repo.assets.list().filter((a) => a.categoryId === c.id);
          // 分類の既定：既定の分類ならその値、そうでなければ旧項目で最も多い値
          let resolution = def?.resolution || '';
          if (old && !def) {
            const count = new Map();
            assets.forEach((a) => { const v = KK.num.clean(a.props?.[old.key]); if (v) count.set(v, (count.get(v) || 0) + 1); });
            resolution = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
          }
          const unit = def ? def.unit : (old?.unit ?? '');
          const fields = (c.fields || []).filter((f) => f !== old).map((f) => (f.type === 'number' && f.digits === undefined ? { ...f, digits: '' } : f));
          ops.push(repo.put('categories', { ...c, unit, resolution, fields }));
          // 分類の既定と違う値は、個体の上書きにする
          if (old) {
            assets.forEach((a) => {
              const v = KK.num.clean(a.props?.[old.key]);
              if (v && v !== resolution && a.resolution == null) ops.push(repo.put('assets', { ...a, resolution: v }));
            });
          }
        });
        if (ops.length) await repo.commit(ops, 'migrate');
        const used = [];
        repo.categories.list().forEach((c) => { used.push(c.unit || ''); (c.fields || []).forEach((f) => f.type === 'number' && used.push(f.unit || '')); });
        await KK.units.ensure(used);
        return ops.length;
      }
    },
    {
      version: 3,
      label: 'メーカーと型式を会社・型式の台帳に移し、測定範囲を数値にする',
      async run() {
        const repo = KK.repo; const U = KK.util; const D = KK.directory;
        const ops = [];
        const sameRange = (x, y) => (x && y && x.min === y.min && x.max === y.max && (x.unit ?? null) === (y.unit ?? null));
        // 1. 分類：校正区分の既定、文字の「測定範囲」項目を外す（値は個体から読む）
        const rangeKey = new Map();
        repo.categories.list().forEach((c) => {
          const def = KK.defaultCategories.find((d) => d.id === c.id);
          const old = (c.fields || []).find((f) => (f.type || 'text') === 'text' && (f.key === 'range' || /範囲/.test(f.label || '')));
          if (old) rangeKey.set(c.id, old.key);
          const calType = c.calType || def?.calType || (c.kind === 'measure' ? 'internal' : 'external');
          if (old || !c.calType) ops.push(repo.put('categories', { ...c, calType, fields: (c.fields || []).filter((f) => f !== old) }));
        });
        // 2. 会社：メーカーの文字から（同じ名前は 1 社に）
        const companies = new Map(repo.companies.list().map((c) => [U.norm(c.name), c.id]));
        const company = (name) => {
          const n = String(name || '').trim(); if (!n) return null;
          if (!companies.has(U.norm(n))) {
            const c = { id: U.uid('co'), name: n, short: '', phone: '', address: '', url: '', accreditation: '', note: '', contacts: [], props: {}, createdAt: U.nowIso() };
            ops.push(repo.put('companies', c)); companies.set(U.norm(n), c.id);
          }
          return companies.get(U.norm(n));
        };
        // 3. 型式：同じ分類・同じ文字・同じメーカーを 1 件に
        const models = new Map();
        repo.assets.list().forEach((a) => {
          if (a.modelId !== undefined && a.makerId !== undefined) return; // 移し替え済み
          const cat = repo.categories.get(a.categoryId);
          const makerId = company(a.maker);
          const rk = rangeKey.get(a.categoryId);
          let range = rk ? D.parseRange(a.props?.[rk]) : null;
          if (range && (range.unit === (cat?.unit ?? '') || !range.unit)) range = { ...range, unit: null };
          const next = { ...a, maker: '', makerId: null, modelId: null, range: null, calibratorId: a.calibratorId ?? null, calType: a.calType ?? null };
          if (a.model) {
            const key = `${a.categoryId}|${U.norm(a.model)}|${makerId || ''}`;
            if (!models.has(key)) {
              const m = { id: U.uid('md'), categoryId: a.categoryId, ...D.splitModel(a.model), makerId, range, unit: null, resolution: null, props: {}, note: '', sample: !!a.sample, createdAt: U.nowIso() };
              models.set(key, m); ops.push(repo.put('models', m));
            }
            const m = models.get(key);
            next.modelId = m.id; next.model = '';
            if (range && !sameRange(range, m.range)) next.range = range;
          } else {
            next.makerId = makerId;
            next.range = range;
          }
          ops.push(repo.put('assets', next));
        });
        if (ops.length) await repo.commit(ops, 'migrate');
        return ops.length;
      }
    }
  ];

  KK.migrate = {
    async run() {
      const cur = KK.repo.settings.get('schemaVersion', 1);
      const done = [];
      for (const s of steps.filter((x) => x.version > cur).sort((a, b) => a.version - b.version)) {
        const n = await s.run();
        await KK.repo.settings.set('schemaVersion', s.version);
        if (n) done.push(s.label);
      }
      return done;
    },
    latest: () => Math.max(...steps.map((s) => s.version))
  };
})();
