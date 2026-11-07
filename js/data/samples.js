/* ── サンプルデータ ──
   パターンごとに登録簿へ登録する。乱数の種は固定。日付は今日を基準にずらすので、いつ開いても状態がばらける。
   サンプルの記録にはすべて sample: true を付け、「サンプルだけを消す」で利用者のデータを残して消す。 */
(function () {
  'use strict';
  const KK = window.KK;
  const U = KK.util;

  KK.samplePatterns = KK.createRegistry('samplePatterns');

  /** サンプルの会社（架空の名前・連絡先。実在の会社とは関係ありません） */
  const SAMPLE_COMPANIES = {
    'サンプル精機': { short: 'S精機', phone: '000-000-0001', address: '（架空）東京都サンプル区 1-1', url: 'https://example.com/seiki',
      contacts: [{ name: '山田 一郎', dept: '営業部', phone: '000-000-0011', email: 'yamada@example.com', note: '購入・見積' },
        { name: '鈴木 花子', dept: '校正サービス課', phone: '000-000-0012', email: 'suzuki@example.com', note: '修理・校正の受付' }] },
    'サンプルゲージ': { phone: '000-000-0002', contacts: [{ name: '佐藤 次郎', dept: '営業', phone: '000-000-0021', email: 'sato@example.com', note: '' }] },
    'サンプル試験機': { short: 'S試験機', phone: '000-000-0003', accreditation: 'JCSS 0000（架空）',
      contacts: [{ name: '高橋 三郎', dept: 'サービス部', phone: '000-000-0031', email: 'takahashi@example.com', note: '試験機の定期校正・点検' }] },
    'サンプル校正サービス': { short: 'S校正', phone: '000-000-0004', accreditation: 'JCSS 0001（架空）', url: 'https://example.com/calib',
      contacts: [{ name: '伊藤 四郎', dept: '受付', phone: '000-000-0041', email: 'ito@example.com', note: '発送前に連絡' }] }
  };

  /** 生成の作業台。設置先を名前の経路で用意し、個体と記録を積み上げる */
  function builder(seed) {
    const repo = KK.repo;
    const rnd = U.seeded(seed);
    const today = U.today();
    const out = { locations: [], categories: [], assets: [], events: [], companies: [], models: [] };
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
    /** 会社：名前で探し、なければサンプルとして作る（実在の会社とは関係のない架空の名前を使う） */
    function company(name) {
      if (!name) return null;
      const found = repo.companies.list().find((c) => U.norm(c.name) === U.norm(name)) || out.companies.find((c) => c.name === name);
      if (found) return found.id;
      const extra = SAMPLE_COMPANIES[name] || {};
      const c = { id: U.uid('co'), name, short: '', phone: '', address: '', url: '', accreditation: '', note: 'サンプルの架空の会社です', contacts: [], props: {}, createdAt: U.nowIso(), sample: true, ...extra };
      out.companies.push(c);
      return c.id;
    }
    /** 型式：分類・文字・メーカーが同じなら 1 件にまとめる */
    function model(categoryId, text, makerId, range) {
      const parts = KK.directory.splitModel(text);
      const found = [...repo.models.list(), ...out.models].find((m) => m.categoryId === categoryId && m.modelNo === parts.modelNo && m.name === parts.name && (m.makerId || null) === makerId);
      if (found) return found.id;
      const m = { id: U.uid('md'), categoryId, ...parts, makerId, range, unit: null, resolution: null, props: {}, note: '', createdAt: U.nowIso(), sample: true };
      out.models.push(m);
      return m.id;
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
      // 測定範囲・メーカーは型式に持たせる（型式がなければ機器に直接）
      const { range: rangeText, ...props } = a.props || {};
      const range = rangeText ? { ...KK.directory.parseRange(rangeText), unit: null } : null;
      const makerId = company(a.maker);
      const modelId = a.model ? model(a.categoryId, a.model, makerId, range) : null;
      const x = {
        id: U.uid('a'), createdAt: U.nowIso(), updatedAt: U.nowIso(),
        categoryId: cat(a.categoryId), locationId: a.locationId, parentId: a.parentId || null,
        mgmtNo: a.mgmtNo || '', serial: a.serial || '', model: '', maker: '',
        modelId, makerId: modelId ? null : makerId, range: modelId ? null : range,
        calType: a.calType || null, calibratorId: company(a.calibrator),
        lastCalDate, intervalMonths: a.intervalMonths || null, state: a.state || 'active',
        unit: a.unit ?? null, resolution: a.resolution || null,
        note: a.note || '', props, sample: true
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
    desc: '3 ラインに同じ管理番号（M-001 など）があり、期限切れ・期限間近・保管中・廃棄後の番号再利用、表示桁を上書きしたマイクロメータを含む',
    build() {
      const b = builder(101);
      const lines = [['製造部', '加工課', '第1加工ライン'], ['製造部', '加工課', '第2加工ライン'], ['製造部', '組立課', '組立ライン']];
      const plan = [
        ['cat-micro', 'M-001', 'SM-25D デジタル外側マイクロ', { range: '0-25 mm', tolerance: '2' }],
        ['cat-micro', 'M-002', 'SM-50D デジタル外側マイクロ', { range: '25-50 mm', tolerance: '2' }],
        ['cat-caliper', 'N-001', 'SC-150D デジタルノギス', { range: '0-150 mm', display: 'デジタル' }],
        ['cat-caliper', 'N-002', 'SC-200D デジタルノギス', { range: '0-200 mm', display: 'デジタル' }],
        ['cat-feeler', 'S-001', 'FG-13 すきまゲージ13枚組', { leaves: 13, range: '0.03-0.5 mm' }],
        ['cat-dial', 'D-001', 'DG-10 ダイヤルゲージ', { range: '0-10 mm' }]
      ];
      const daysLeft = [[-9, 14, 120, 200, 6, 90], [-7, 180, 25, 300, -2, 45], [60, 150, 240, 12, 175, 320]];
      lines.forEach((path, li) => {
        const locationId = b.loc(path);
        plan.forEach(([categoryId, mgmtNo, model, props], pi) => {
          if (li === 2 && pi === 5) return;
          b.asset({ categoryId, locationId, mgmtNo, model, maker: categoryId === 'cat-feeler' ? 'サンプルゲージ' : 'サンプル精機', props, daysLeft: daysLeft[li][pi], serial: categoryId === 'cat-dial' ? `DG${8800 + li}` : '',
            ...(li === 1 && categoryId === 'cat-dial' ? { calType: 'external', calibrator: 'サンプル校正サービス', note: 'このダイヤルゲージだけ外部校正に出している（校正区分を上書き）' } : {}) });
        });
      });
      const l2 = b.loc(lines[1]);
      b.asset({ categoryId: 'cat-micro', locationId: l2, mgmtNo: 'M-002', model: 'SM-25D デジタル外側マイクロ', maker: 'サンプル精機', state: 'retired', daysLeft: -400, note: '摩耗のため廃棄。管理番号は後継機で再利用' });
      b.asset({ categoryId: 'cat-micro', locationId: b.loc(lines[2]), mgmtNo: 'M-005', model: 'SM-25A アナログ外側マイクロ', maker: 'サンプル精機', resolution: '0.01', daysLeft: 140, props: { range: '0-25 mm', tolerance: '4' }, note: 'アナログ表示のため、表示桁を 0.01 mm に上書きしている' });
      b.asset({ categoryId: 'cat-caliper', locationId: b.loc(['製造部', '加工課']), mgmtNo: 'N-003', model: 'SC-150D デジタルノギス', maker: 'サンプル精機', state: 'stored', daysLeft: 80, note: '予備機。課で保管' });
      return b.out;
    }
  });

  // ── パターン：標準器（セットと子） ──
  KK.samplePatterns.register({
    id: 'standards', order: 2, label: '標準器（セットと子）', icon: 'fa-scale-balanced',
    desc: 'ブロックゲージセット 2 組と中のゲージ（兄弟）、校正用マイクロ・すきまゲージ。期限切れの標準器を含み、測定機器と一緒に読み込むと「校正に使った標準器」がつながる',
    build() {
      const b = builder(202);
      const room = b.loc(['品質保証部', '品証課', '標準室']);
      const set1 = b.asset({ categoryId: 'cat-gbset', locationId: room, mgmtNo: 'BG-01', serial: 'BS-210455', model: 'BG-47 0級 47個組', maker: 'サンプル精機', calibrator: 'サンプル校正サービス', daysLeft: 70, props: { grade: '0級', pieces: 47, certNo: 'JCSS-0123-24' } });
      [1, 2, 5, 10, 20].forEach((n, i) => b.asset({ categoryId: 'cat-gb', locationId: room, parentId: set1.id, serial: `BS-210455-${String(n).padStart(2, '0')}`, lastCalDate: i === 3 ? undefined : '', daysLeft: 12, props: { nominal: n, deviation: Number((b.rnd() * 0.2 - 0.1).toFixed(2)) } }));
      const set2 = b.asset({ categoryId: 'cat-gbset', locationId: room, mgmtNo: 'BG-02', serial: 'BS-198812', model: 'BG-32 1級 32個組', maker: 'サンプル精機', calibrator: 'サンプル校正サービス', daysLeft: 400, props: { grade: '1級', pieces: 32 } });
      [1, 3, 8].forEach((n) => b.asset({ categoryId: 'cat-gb', locationId: room, parentId: set2.id, serial: `BS-198812-${String(n).padStart(2, '0')}`, lastCalDate: '', props: { nominal: n }, ...(n === 8 ? { calType: 'internal', note: 'このゲージだけ社内で比較校正している（校正区分を上書き）' } : {}) }));
      b.asset({ categoryId: 'cat-calmicro', locationId: room, mgmtNo: 'CM-01', serial: 'CM55102', model: 'CM-25 基準棒付', maker: 'サンプル精機', daysLeft: 35, props: { range: '0-25 mm' } });
      b.asset({ categoryId: 'cat-calfeeler', locationId: room, mgmtNo: 'CS-01', serial: 'TG-7781', model: 'CF-100 校正用すきまゲージ', maker: 'サンプルゲージ', daysLeft: 280 });
      b.asset({ categoryId: 'cat-calfeeler', locationId: room, mgmtNo: 'CS-02', serial: 'TG-8102', model: 'CF-050 校正用すきまゲージ', maker: 'サンプルゲージ', daysLeft: -20, note: '外部校正に出し忘れ。期限切れの間に使った記録がある' });
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
      const t = b.asset({ categoryId: 'cat-tensile', locationId: lab, mgmtNo: 'T-01', serial: 'AG-X-5531', model: 'UT-100 万能試験機', maker: 'サンプル試験機', calibrator: 'サンプル試験機', daysLeft: 75, by: 'サンプル試験機', props: { capacity: 100, grade: '1級' } });
      const f = b.asset({ categoryId: 'cat-force', locationId: lab, parentId: t.id, serial: 'FC-30018', model: 'FC-100 荷重計測系', maker: 'サンプル試験機', lastCalDate: '', props: { capacity: 100 } });
      b.asset({ categoryId: 'cat-loadcell', locationId: lab, parentId: f.id, serial: 'LC-88120', model: 'LC-100 ロードセル', maker: 'サンプル試験機', lastCalDate: '', props: { capacity: 100 } });
      b.asset({ categoryId: 'cat-ext', locationId: lab, parentId: t.id, serial: 'EX-20514', model: 'EX-50 伸び計', maker: 'サンプル試験機', daysLeft: -4, by: 'サンプル試験機', note: '試験機と同日に校正できなかったため期限がずれている', props: { gauge: 50, stroke: 10 } });
      const t2 = b.asset({ categoryId: 'cat-tensile', locationId: lab, mgmtNo: 'T-02', serial: 'AGS-1102', model: 'UT-10 万能試験機', maker: 'サンプル試験機', calibrator: 'サンプル試験機', daysLeft: 210, props: { capacity: 10, grade: '1級' } });
      b.asset({ categoryId: 'cat-force', locationId: lab, parentId: t2.id, serial: 'FC-10077', model: 'FC-10 荷重計測系', maker: 'サンプル試験機', lastCalDate: '' });
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
        ...data.companies.map((x) => repo.put('companies', x)),
        ...data.models.map((x) => repo.put('models', x)),
        ...data.assets.map((x) => repo.put('assets', x)),
        ...data.events.map((x) => repo.put('events', x))
      ], 'sample');
      await repo.settings.set('samplesLoaded', [...this.loaded(), id]);
      await this.linkTraceability();
      return data;
    },
    /**
     * サンプル同士の「校正に使った標準器」をつなぐ。読み込む順番によらず、両方そろった時点でつながる。
     * 対象はサンプルの校正記録で、まだ標準器が付いていないものだけ。
     */
    async linkTraceability() {
      const repo = KK.repo;
      const bySerial = (s) => repo.assets.list().find((a) => a.sample && a.serial === s);
      const plan = {
        'cat-micro': ['BS-210455-01', 'BS-210455-05', 'BS-210455-10'],
        'cat-dial': ['BS-210455-01', 'BS-210455-02'],
        'cat-caliper': ['BS-198812'],
        'cat-calmicro': ['BS-210455-02', 'BS-210455-20']
      };
      const ops = [];
      repo.assets.list().filter((a) => a.sample && a.lastCalDate).forEach((a) => {
        let serials = plan[a.categoryId];
        if (a.categoryId === 'cat-feeler') serials = [KK.util.daysBetween(a.lastCalDate, KK.util.today()) < 20 ? 'TG-8102' : 'TG-7781'];
        if (!serials) return;
        const ids = serials.map(bySerial).filter(Boolean).map((s) => s.id);
        if (!ids.length) return;
        KK.trace.calibrations(a).forEach((e) => {
          if (e.sample && !(e.standards || []).length) ops.push(repo.put('events', { ...e, ...KK.trace.stamp(ids) }));
        });
      });
      if (ops.length) await repo.commit(ops, 'sample');
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
      // 利用者の機器・型式が使っている型式・会社は残す
      const keptAssets = repo.assets.list().filter((a) => !sampleIds.has(a.id));
      const usedModels = new Set(keptAssets.map((a) => a.modelId).filter(Boolean));
      snap.models = repo.models.list().filter((m) => m.sample && !usedModels.has(m.id));
      snap.models.forEach((m) => ops.push(repo.del('models', m.id)));
      const keptModels = repo.models.list().filter((m) => !snap.models.includes(m));
      const usedCompanies = new Set([...keptAssets.flatMap((a) => [a.makerId, a.calibratorId]), ...keptModels.map((m) => m.makerId)].filter(Boolean));
      snap.companies = repo.companies.list().filter((c) => c.sample && !usedCompanies.has(c.id));
      snap.companies.forEach((c) => ops.push(repo.del('companies', c.id)));
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
