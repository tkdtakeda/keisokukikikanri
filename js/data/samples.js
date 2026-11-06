/* ── サンプルデータ ──
   パターンごとに登録簿へ登録する。乱数の種は固定。日付は今日を基準にずらすので、いつ開いても状態がばらける。
   サンプルの記録にはすべて sample: true を付け、「サンプルだけを消す」で利用者のデータを残して消す。 */
(function () {
  'use strict';
  const KK = window.KK;
  const U = KK.util;

  KK.samplePatterns = KK.createRegistry('samplePatterns');

  /** 生成の作業台。設置先を名前の経路で用意し、個体と記録を積み上げる */
  function builder(seed) {
    const repo = KK.repo;
    const rnd = U.seeded(seed);
    const today = U.today();
    const out = { locations: [], categories: [], assets: [], events: [] };
    const locByPath = new Map();

    function loc(path) {
      let parentId = null;
      path.forEach((name, i) => {
        const key = path.slice(0, i + 1).join('/');
        let id = locByPath.get(key);
        if (!id) {
          const found = repo.locations.list().find((l) => l.name === name && (l.parentId || null) === parentId);
          if (found) id = found.id;
          else {
            id = U.uid('l');
            out.locations.push({ id, name, parentId, order: out.locations.length, sample: true });
          }
          locByPath.set(key, id);
        }
        parentId = id;
      });
      return parentId;
    }
    /** まだ保存していない設置先も含めて経路名を作る */
    function pathOf(id) {
      const find = (x) => out.locations.find((l) => l.id === x) || repo.locations.get(x);
      const names = [];
      for (let l = find(id), g = 0; l && g < 20; l = find(l.parentId), g++) names.unshift(l.name);
      return names.join(' › ');
    }
    function cat(id) {
      if (!repo.categories.get(id) && !out.categories.some((c) => c.id === id)) {
        const def = KK.defaultCategories.find((c) => c.id === id);
        out.categories.push({ ...JSON.parse(JSON.stringify(def)), sample: true });
      }
      return id;
    }
    /** 期限までの残り日数を指定して前回校正日を作る（負なら期限切れ） */
    function calForDaysLeft(intervalMonths, daysLeft) {
      const due = new Date(Date.parse(today) + daysLeft * 86400000).toISOString().slice(0, 10);
      return U.addMonths(due, -intervalMonths);
    }
    function asset(a) {
      const def = KK.defaultCategories.find((c) => c.id === a.categoryId);
      const interval = a.intervalMonths || def?.intervalMonths || 12;
      const lastCalDate = a.lastCalDate !== undefined ? a.lastCalDate
        : calForDaysLeft(interval, a.daysLeft ?? Math.round(rnd() * 330 - 20));
      const x = {
        id: U.uid('a'), createdAt: U.nowIso(), updatedAt: U.nowIso(),
        categoryId: cat(a.categoryId), locationId: a.locationId, parentId: a.parentId || null,
        mgmtNo: a.mgmtNo || '', serial: a.serial || '', model: a.model || '', maker: a.maker || '',
        lastCalDate, intervalMonths: a.intervalMonths || null, state: a.state || 'active',
        note: a.note || '', props: a.props || {}, sample: true
      };
      out.assets.push(x);
      const regDate = U.addMonths(lastCalDate || today, -interval * 2);
      out.events.push({ id: U.uid('e'), assetId: x.id, type: 'register', date: regDate < today ? regDate : today, text: `${pathOf(x.locationId)} に登録`, createdAt: U.nowIso(), sample: true });
      if (lastCalDate) {
        [0, 1].forEach((k) => {
          const d = U.addMonths(lastCalDate, -interval * k);
          out.events.push({ id: U.uid('e'), assetId: x.id, type: 'calibration', date: d, text: k === 0 ? '合格' : (rnd() < 0.3 ? '調整後合格' : '合格'), by: a.by || '田中', createdAt: U.nowIso(), sample: true });
        });
      }
      return x;
    }
    return { loc, asset, rnd, out, today };
  }

  // ── パターン：測定機器（ライン別） ──
  KK.samplePatterns.register({
    id: 'lines', order: 1, label: '測定機器（ライン別）', icon: 'fa-ruler-combined',
    desc: '3 ラインに同じ管理番号（M-001 など）があり、期限切れ・期限間近・保管中・廃棄後の番号再利用を含む',
    build() {
      const b = builder(101);
      const lines = [['製造部', '加工課', '第1加工ライン'], ['製造部', '加工課', '第2加工ライン'], ['製造部', '組立課', '組立ライン']];
      const plan = [
        ['cat-micro', 'M-001', 'MDC-25MX 0-25mm', { range: '0-25 mm', resolution: 0.001, tolerance: '±2 µm' }],
        ['cat-micro', 'M-002', 'MDC-50MX 25-50mm', { range: '25-50 mm', resolution: 0.001, tolerance: '±2 µm' }],
        ['cat-caliper', 'N-001', 'CD-15AX 150mm', { range: '0-150 mm', resolution: 0.01, display: 'デジタル' }],
        ['cat-caliper', 'N-002', 'CD-20AX 200mm', { range: '0-200 mm', resolution: 0.01, display: 'デジタル' }],
        ['cat-feeler', 'S-001', '150A13 13枚組', { leaves: 13, range: '0.03-0.5 mm' }],
        ['cat-dial', 'D-001', '2046S 0.01mm', { range: '0-10 mm', resolution: 0.01 }]
      ];
      const daysLeft = [[-9, 14, 120, 200, 6, 90], [-7, 180, 25, 300, -2, 45], [60, 150, 240, 12, 100, 320]];
      lines.forEach((path, li) => {
        const locationId = b.loc(path);
        plan.forEach(([categoryId, mgmtNo, model, props], pi) => {
          if (li === 2 && pi === 5) return;
          b.asset({ categoryId, locationId, mgmtNo, model, maker: categoryId === 'cat-feeler' ? '永井ゲージ' : 'ミツトヨ', props, daysLeft: daysLeft[li][pi], serial: categoryId === 'cat-dial' ? `DG${8800 + li}` : '' });
        });
      });
      const l2 = b.loc(lines[1]);
      b.asset({ categoryId: 'cat-micro', locationId: l2, mgmtNo: 'M-002', model: 'MDC-25MX 0-25mm（旧）', maker: 'ミツトヨ', state: 'retired', daysLeft: -400, note: '摩耗のため廃棄。管理番号は後継機で再利用' });
      b.asset({ categoryId: 'cat-caliper', locationId: b.loc(['製造部', '加工課']), mgmtNo: 'N-003', model: 'CD-15AX 150mm', maker: 'ミツトヨ', state: 'stored', daysLeft: 80, note: '予備機。課で保管' });
      return b.out;
    }
  });

  // ── パターン：標準器（セットと子） ──
  KK.samplePatterns.register({
    id: 'standards', order: 2, label: '標準器（セットと子）', icon: 'fa-scale-balanced',
    desc: 'ブロックゲージセット 2 組と中のゲージ（兄弟）。子は製造番号で見分け、1 つだけ校正日が異なる',
    build() {
      const b = builder(202);
      const room = b.loc(['品質保証部', '品証課', '標準室']);
      const set1 = b.asset({ categoryId: 'cat-gbset', locationId: room, mgmtNo: 'BG-01', serial: 'BS-210455', model: '516-940 0級 47個組', maker: 'ミツトヨ', daysLeft: 70, props: { grade: '0級', pieces: 47, certNo: 'JCSS-0123-24' } });
      [1, 2, 5, 10, 20].forEach((n, i) => b.asset({ categoryId: 'cat-gb', locationId: room, parentId: set1.id, serial: `BS-210455-${String(n).padStart(2, '0')}`, model: `${n}.000mm`, maker: 'ミツトヨ', lastCalDate: i === 3 ? undefined : '', daysLeft: 12, props: { nominal: n, deviation: Number((b.rnd() * 0.2 - 0.1).toFixed(2)) } }));
      const set2 = b.asset({ categoryId: 'cat-gbset', locationId: room, mgmtNo: 'BG-02', serial: 'BS-198812', model: '516-941 1級 32個組', maker: 'ミツトヨ', daysLeft: 400, props: { grade: '1級', pieces: 32 } });
      [1, 3, 8].forEach((n) => b.asset({ categoryId: 'cat-gb', locationId: room, parentId: set2.id, serial: `BS-198812-${String(n).padStart(2, '0')}`, model: `${n}.000mm`, maker: 'ミツトヨ', lastCalDate: '', props: { nominal: n } }));
      b.asset({ categoryId: 'cat-calmicro', locationId: room, mgmtNo: 'CM-01', serial: 'CM55102', model: '基準棒付 0-25mm', maker: 'ミツトヨ', daysLeft: 35, props: { range: '0-25 mm' } });
      b.asset({ categoryId: 'cat-calfeeler', locationId: room, mgmtNo: 'CS-01', serial: 'TG-7781', model: '0.01-1.00mm', maker: '永井ゲージ', daysLeft: 280 });
      return b.out;
    }
  });

  // ── パターン：試験機器（親・子・孫） ──
  KK.samplePatterns.register({
    id: 'testers', order: 3, label: '試験機器（親・子・孫）', icon: 'fa-gauge-high',
    desc: '引張試験機 › 力計 › ロードセル の 3 階層と、校正日がずれた伸び計（兄弟）',
    build() {
      const b = builder(303);
      const lab = b.loc(['品質保証部', '品証課', '試験室']);
      const t = b.asset({ categoryId: 'cat-tensile', locationId: lab, mgmtNo: 'T-01', serial: 'AG-X-5531', model: 'AG-X plus 100kN', maker: '島津製作所', daysLeft: 75, by: '島津サービス', props: { capacity: 100, grade: '1級' } });
      const f = b.asset({ categoryId: 'cat-force', locationId: lab, parentId: t.id, serial: 'FC-30018', model: '荷重計測系 100kN', maker: '島津製作所', lastCalDate: '', props: { capacity: 100 } });
      b.asset({ categoryId: 'cat-loadcell', locationId: lab, parentId: f.id, serial: 'LC-88120', model: 'SFL-100kN AG', maker: '島津製作所', lastCalDate: '', props: { capacity: 100 } });
      b.asset({ categoryId: 'cat-ext', locationId: lab, parentId: t.id, serial: 'EX-20514', model: 'SSG50-10H', maker: '島津製作所', daysLeft: -4, by: '島津サービス', note: '試験機と同日に校正できなかったため期限がずれている', props: { gauge: 50, stroke: 10 } });
      const t2 = b.asset({ categoryId: 'cat-tensile', locationId: lab, mgmtNo: 'T-02', serial: 'AGS-1102', model: 'AGS-X 10kN', maker: '島津製作所', daysLeft: 210, props: { capacity: 10, grade: '1級' } });
      b.asset({ categoryId: 'cat-force', locationId: lab, parentId: t2.id, serial: 'FC-10077', model: '荷重計測系 10kN', maker: '島津製作所', lastCalDate: '' });
      return b.out;
    }
  });

  // ── パターン：大量データ（速さの確認） ──
  KK.samplePatterns.register({
    id: 'bulk', order: 4, label: '大量データ（2,000 個体）', icon: 'fa-database',
    desc: '20 ラインに 100 個体ずつ。一覧・検索・絞り込みの速さを確かめる',
    build() {
      const b = builder(404);
      const cats = ['cat-micro', 'cat-caliper', 'cat-feeler', 'cat-dial'];
      const prefix = { 'cat-micro': 'M', 'cat-caliper': 'N', 'cat-feeler': 'S', 'cat-dial': 'D' };
      for (let l = 1; l <= 20; l++) {
        const locationId = b.loc(['大量サンプル工場', `第${Math.ceil(l / 5)}製造課`, `ライン${String(l).padStart(2, '0')}`]);
        for (let i = 1; i <= 100; i++) {
          const c = cats[i % 4];
          b.asset({ categoryId: c, locationId, mgmtNo: `${prefix[c]}-${String(i).padStart(3, '0')}`, model: '量産型', maker: 'サンプル', daysLeft: Math.round(b.rnd() * 400 - 40) });
        }
      }
      return b.out;
    }
  });

  // ── 読み込み・消去 ──
  KK.sampleService = {
    loaded: () => KK.repo.settings.get('samplesLoaded', []),
    async load(id) {
      const p = KK.samplePatterns.get(id);
      if (this.loaded().includes(id)) throw new Error('このサンプルは読み込み済みです');
      const data = p.build();
      const repo = KK.repo;
      await repo.commit([
        ...data.locations.map((x) => repo.put('locations', x)),
        ...data.categories.map((x) => repo.put('categories', x)),
        ...data.assets.map((x) => repo.put('assets', x)),
        ...data.events.map((x) => repo.put('events', x))
      ], 'sample');
      await repo.settings.set('samplesLoaded', [...this.loaded(), id]);
      return data;
    },
    count() {
      return KK.repo.assets.list().filter((a) => a.sample).length;
    },
    /** サンプルだけを消す。利用者のデータは残す。取り消し用の写しを返す */
    async clear() {
      const repo = KK.repo;
      const sampleIds = new Set(repo.assets.list().filter((a) => a.sample).map((a) => a.id));
      const snap = await repo.snapshotAssets([...sampleIds]);
      const ops = [...sampleIds].map((id) => repo.del('assets', id));
      snap.events.forEach((e) => ops.push(repo.del('events', e.id)));
      snap.attachments.forEach((x) => ops.push(repo.del('attachments', x.id)));
      // 利用者がサンプルのセットに入れた子は残し、親を外す
      const detached = repo.assets.list().filter((a) => !a.sample && sampleIds.has(a.parentId));
      detached.forEach((a) => ops.push(repo.put('assets', { ...a, parentId: null })));
      snap.detached = detached;
      // 利用者の個体・設置先が残る設置先は消さない
      const keepLoc = new Set();
      repo.assets.list().filter((a) => !sampleIds.has(a.id)).forEach((a) => {
        for (let l = repo.locations.get(a.locationId); l; l = repo.locations.get(l.parentId)) keepLoc.add(l.id);
      });
      repo.locations.list().filter((l) => !l.sample).forEach((l) => {
        for (let p = repo.locations.get(l.parentId); p; p = repo.locations.get(p.parentId)) keepLoc.add(p.id);
      });
      snap.locations = repo.locations.list().filter((l) => l.sample && !keepLoc.has(l.id));
      snap.locations.forEach((l) => ops.push(repo.del('locations', l.id)));
      const usedCats = new Set(repo.assets.list().filter((a) => !sampleIds.has(a.id)).map((a) => a.categoryId));
      snap.categories = repo.categories.list().filter((c) => c.sample && !usedCats.has(c.id));
      snap.categories.forEach((c) => ops.push(repo.del('categories', c.id)));
      snap.loaded = this.loaded();
      await repo.commit(ops, 'sample');
      await repo.settings.set('samplesLoaded', []);
      return snap;
    },
    async undoClear(snap) {
      await KK.repo.restore({ ...snap, assets: [...snap.assets, ...snap.detached] });
      await KK.repo.settings.set('samplesLoaded', snap.loaded);
    }
  };
})();
