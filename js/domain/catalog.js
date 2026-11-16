/* ── 分類の部品：大分類・識別キー・項目の型・既定の分類 ──
   どれも登録簿なので、仲間を足すときは register() を呼ぶだけでよい。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;

  // ── 大分類 ──
  KK.kinds = KK.createRegistry('kinds');
  KK.kinds.register({ id: 'measure', order: 1, label: '測定機器', icon: 'fa-ruler-combined' });
  KK.kinds.register({ id: 'standard', order: 2, label: '標準器', icon: 'fa-scale-balanced' });
  KK.kinds.register({ id: 'test', order: 3, label: '試験機器', icon: 'fa-gauge-high' });

  // ── 識別キー：どの番号で個体を見分けるか ──
  KK.identityKeys = KK.createRegistry('identityKeys');
  KK.identityKeys.register({
    id: 'locationNo', order: 1, label: '設置先＋管理番号',
    required: ['mgmtNo'],
    /** 重複を調べる鍵。廃棄済みは対象外（管理番号は再利用されるため） */
    keyOf: (a) => (a.mgmtNo ? `${a.locationId}|${KK.util.norm(a.mgmtNo)}` : ''),
    conflictText: (a, loc) => `${loc} に管理番号「${a.mgmtNo}」は既にあります`
  });
  KK.identityKeys.register({
    id: 'serial', order: 2, label: '製造番号',
    required: ['serial'],
    keyOf: (a) => (a.serial ? KK.util.norm(a.serial) : ''),
    conflictText: (a) => `製造番号「${a.serial}」は既に登録されています`
  });

  // ── 項目の型 ──
  KK.fieldTypes = KK.createRegistry('fieldTypes');
  const attrs = (f) => `data-prop="${esc(f.key)}"${f.required ? ' required' : ''}`;
  KK.fieldTypes.register({
    id: 'text', order: 1, label: '文字',
    input: (f, v) => `<input class="input" ${attrs(f)} value="${esc(v)}" data-next>`,
    read: (el) => el.value.trim(),
    format: (v) => esc(v)
  });
  // 数値：打ったとおりの文字で保存し、表示桁に足りない 0 を補って見せる（ctx は桁の基準になる個体）
  KK.fieldTypes.register({
    id: 'number', order: 2, label: '数値',
    input: (f, v, ctx) => {
      const d = KK.num.fieldDigits(f, ctx);
      return `<div class="unit-input"><input class="input" inputmode="decimal" ${attrs(f)} data-num data-digits="${d ?? ''}" value="${esc(KK.num.format(v, d).text)}" data-next>${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ''}</div>`;
    },
    read: (el) => { const s = KK.num.clean(el.value); return s === null ? el.value.trim() : s; },
    validate: (v) => (v === '' || v == null || KK.num.clean(v) !== null ? '' : '数値で入力してください'),
    format: (v, f, a) => {
      if (v === '' || v == null) return '';
      const d = KK.num.fieldDigits(f, a);
      const r = KK.num.format(v, d);
      return `${esc(r.text)}${f.unit ? ' ' + esc(f.unit) : ''}${r.excess ? ` <i class="fa-solid fa-triangle-exclamation" style="color:var(--color-warn)" title="${esc(KK.num.excessText(d))}"></i>` : ''}`;
    }
  });
  KK.fieldTypes.register({
    id: 'select', order: 3, label: '選択肢',
    input: (f, v) => `<select class="input" ${attrs(f)} data-next><option value=""></option>${(f.options || []).map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`,
    read: (el) => el.value,
    format: (v) => esc(v)
  });
  KK.fieldTypes.register({
    id: 'date', order: 4, label: '日付',
    input: (f, v) => KK.dateInputHtml(f.key, v, true),
    read: (el) => KK.readDateInput(el),
    validate: (v) => (v === '' || KK.util.isValidDate(v) ? '' : '日付が正しくありません'),
    format: (v) => esc(v)
  });
  KK.fieldTypes.register({
    id: 'longtext', order: 5, label: '長い文章',
    input: (f, v) => `<textarea class="input input--area" ${attrs(f)} rows="2">${esc(v)}</textarea>`,
    read: (el) => el.value.trim(),
    format: (v) => esc(v).replace(/\n/g, '<br>')
  });

  /** 年4桁・月2桁・日2桁の日付入力。桁がそろうと次の欄へ移る */
  KK.dateInputHtml = function (key, value, isProp) {
    const [y = '', m = '', d = ''] = (value || '').split('-');
    const a = isProp ? `data-prop="${esc(key)}"` : `data-field="${esc(key)}"`;
    return `<div class="date-row" ${a} data-date>
      <input class="input" data-len="4" maxlength="4" inputmode="numeric" value="${esc(y)}" placeholder="年" aria-label="年">
      <span>/</span><input class="input" data-len="2" maxlength="2" inputmode="numeric" value="${esc(m)}" placeholder="月" aria-label="月">
      <span>/</span><input class="input" data-len="2" maxlength="2" inputmode="numeric" value="${esc(d)}" placeholder="日" aria-label="日">
      <button type="button" class="btn btn--ghost btn--icon" data-today title="今日"><i class="fa-solid fa-calendar-day"></i></button>
    </div>`;
  };
  KK.readDateInput = function (row) {
    const [y, m, d] = [...row.querySelectorAll('input')].map((i) => i.value.trim().normalize('NFKC'));
    if (!y && !m && !d) return '';
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };

  // ── 既定の分類（初回起動時に作成。利用者が自由に編集できる） ──
  const F = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
  KK.defaultCategories = [
    { id: 'cat-micro', name: 'マイクロメータ', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', calType: 'internal', unit: 'mm', resolution: '0.001',
      fields: [F('tolerance', '器差許容値（±）', 'number', { unit: 'µm', digits: '1', place: 'model' })] },
    { id: 'cat-caliper', name: 'ノギス', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', calType: 'internal', unit: 'mm', resolution: '0.01',
      fields: [F('display', '表示方式', 'select', { options: ['デジタル', 'ダイヤル', 'バーニヤ'], place: 'model' })] },
    { id: 'cat-feeler', name: 'すきまゲージ', kind: 'measure', intervalMonths: 6, identityKey: 'locationNo', calType: 'internal', unit: 'mm', resolution: '0.01',
      fields: [F('leaves', '枚数', 'number', { unit: '', digits: '0', place: 'model' })] },
    { id: 'cat-dial', name: 'ダイヤルゲージ', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', calType: 'internal', unit: 'mm', resolution: '0.01',
      fields: [] },
    { id: 'cat-gbset', builtins: { range: { use: false } }, name: 'ブロックゲージセット', kind: 'standard', intervalMonths: 24, identityKey: 'serial', calType: 'external', unit: 'mm', resolution: '0.0001',
      fields: [F('grade', '等級', 'select', { options: ['K級', '0級', '1級', '2級'], place: 'model' }), F('pieces', '個数', 'number', { unit: '', digits: '0', place: 'model' }), F('certNo', '校正証明書番号', 'text', { place: 'asset' })] },
    { id: 'cat-gb', builtins: { range: { use: false } }, name: 'ブロックゲージ', kind: 'standard', intervalMonths: 24, identityKey: 'serial', calType: 'external', unit: 'mm', resolution: '0.0001',
      fields: [F('nominal', '呼び寸法', 'number', { unit: 'mm', digits: 'asset', place: 'asset' }), F('deviation', '寸法差', 'number', { unit: 'µm', digits: '2', place: 'asset' })] },
    { id: 'cat-calmicro', name: '校正用マイクロメータ', kind: 'standard', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'mm', resolution: '0.001',
      fields: [F('certNo', '校正証明書番号', 'text', { place: 'asset' })] },
    { id: 'cat-calfeeler', name: '校正用すきまゲージ', kind: 'standard', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'mm', resolution: '0.001',
      fields: [F('certNo', '校正証明書番号', 'text', { place: 'asset' })] },
    { id: 'cat-tensile', name: '引張試験機', kind: 'test', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '容量', 'number', { unit: 'kN', digits: '0', place: 'model' }), F('grade', '等級', 'select', { options: ['0.5級', '1級', '2級'], place: 'model' })] },
    { id: 'cat-force', name: '力計', kind: 'test', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '容量', 'number', { unit: 'kN', digits: '0', place: 'model' })] },
    { id: 'cat-loadcell', builtins: { range: { use: false } }, name: 'ロードセル', kind: 'test', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '定格容量', 'number', { unit: 'kN', digits: '0', place: 'model' })] },
    { id: 'cat-ext', name: '伸び計', kind: 'test', intervalMonths: 12, identityKey: 'serial', calType: 'external', unit: 'mm', resolution: '0.001',
      fields: [F('gauge', '標点距離', 'number', { unit: 'mm', digits: '0', place: 'model' }), F('stroke', 'ストローク', 'number', { unit: 'mm', digits: '0', place: 'model' })] }
  ];

  /** 個体の共通項目（分類によらず持つ）。表・フォーム・詳細の並び順の元 */
  KK.baseFields = [
    { key: 'mgmtNo', label: '管理番号' },
    { key: 'serial', label: '製造番号' },
    { key: 'model', label: '型式・仕様' },
    { key: 'maker', label: 'メーカー' }
  ];

  KK.assetStates = {
    active: { label: '使用中' },
    stored: { label: '保管中' },
    retired: { label: '廃棄' }
  };
})();

/* ── 共通項目（どの分類にもある項目） ──
   分類ごとに「使う／使わない」と表示名を変えられる。値の型と、値を決める場所は固定。
   分類の項目（利用者が足す項目）と同じ表に並べ、何が共通かを覚えなくて済むようにする。 */
(function () {
  'use strict';
  const KK = window.KK;

  /** 値を決める場所：model＝型式で決める（機器で上書き可）／asset＝機器ごと */
  KK.PLACES = {
    model: { label: '型式で決める', hint: '型式の画面で入れ、その型式の機器に引き継ぐ（機器で上書き可）' },
    asset: { label: '機器ごと', hint: '機器ごとに入れる（型式の画面には出ない）' }
  };

  KK.builtinFields = KK.createRegistry('builtinFields');
  [
    { id: 'mgmtNo', label: '管理番号', type: '番号', place: 'asset' },
    { id: 'serial', label: '製造番号', type: '番号', place: 'asset' },
    { id: 'model', label: '型式', type: '型式の台帳から選ぶ', place: 'asset' },
    { id: 'maker', label: 'メーカー', type: '会社の台帳から選ぶ', place: 'model' },
    { id: 'range', label: '測定範囲', type: '下限〜上限', place: 'model' },
    { id: 'unit', label: '測定値の単位', type: '単位', place: 'model' },
    { id: 'resolution', label: '最小表示量', type: '数値（表示桁）', place: 'model' },
    { id: 'calType', label: '校正区分', type: '社内／外部', place: 'asset' },
    { id: 'calibrator', label: '校正会社', type: '会社の台帳から選ぶ', place: 'asset' }
  ].forEach((f, i) => KK.builtinFields.register({ ...f, order: i }));

  /** 分類での共通項目の設定 { use, label, locked } */
  KK.builtin = function (cat, id) {
    const def = KK.builtinFields.get(id);
    const own = cat?.builtins?.[id] || {};
    const idKey = KK.identityKeys.get(cat?.identityKey);
    const locked = idKey?.required.includes(id) ? `見分け方（${idKey.label}）に使うため外せません` : '';
    return { use: locked ? true : own.use !== false, label: own.label || def.label, locked, def };
  };
  KK.useField = (cat, id) => KK.builtin(cat, id).use;
  KK.fieldLabel = (cat, id) => KK.builtin(cat, id).label;

  /** 項目名の重なり：共通項目（元の名前・付け替えた名前）と、ほかの分類の項目 */
  KK.fieldNameConflict = function (cat, label, selfIndex) {
    const n = KK.util.norm(String(label || '').trim());
    if (!n) return '';
    const hit = KK.builtinFields.list().find((b) => KK.util.norm(b.label) === n || KK.util.norm(KK.fieldLabel(cat, b.id)) === n);
    if (hit) return `「${label}」は共通項目（${KK.fieldLabel(cat, hit.id)}）にあります。共通項目の行を使ってください`;
    const dup = (cat.fields || []).findIndex((f, i) => i !== selfIndex && KK.util.norm(f.label) === n);
    return dup >= 0 ? `「${label}」は既にこの分類の項目にあります` : '';
  };
})();
