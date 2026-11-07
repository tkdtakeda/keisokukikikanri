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
