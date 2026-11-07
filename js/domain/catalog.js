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
    { id: 'cat-micro', name: 'マイクロメータ', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', unit: 'mm', resolution: '0.001',
      fields: [F('range', '測定範囲'), F('tolerance', '器差許容値（±）', 'number', { unit: 'µm', digits: '1' })] },
    { id: 'cat-caliper', name: 'ノギス', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', unit: 'mm', resolution: '0.01',
      fields: [F('range', '測定範囲'), F('display', '表示方式', 'select', { options: ['デジタル', 'ダイヤル', 'バーニヤ'] })] },
    { id: 'cat-feeler', name: 'すきまゲージ', kind: 'measure', intervalMonths: 6, identityKey: 'locationNo', unit: 'mm', resolution: '0.01',
      fields: [F('leaves', '枚数', 'number', { unit: '', digits: '0' }), F('range', '厚さ範囲')] },
    { id: 'cat-dial', name: 'ダイヤルゲージ', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', unit: 'mm', resolution: '0.01',
      fields: [F('range', '測定範囲')] },
    { id: 'cat-gbset', name: 'ブロックゲージセット', kind: 'standard', intervalMonths: 24, identityKey: 'serial', unit: 'mm', resolution: '0.0001',
      fields: [F('grade', '等級', 'select', { options: ['K級', '0級', '1級', '2級'] }), F('pieces', '個数', 'number', { unit: '', digits: '0' }), F('certNo', '校正証明書番号')] },
    { id: 'cat-gb', name: 'ブロックゲージ', kind: 'standard', intervalMonths: 24, identityKey: 'serial', unit: 'mm', resolution: '0.0001',
      fields: [F('nominal', '呼び寸法', 'number', { unit: 'mm', digits: 'asset' }), F('deviation', '寸法差', 'number', { unit: 'µm', digits: '2' })] },
    { id: 'cat-calmicro', name: '校正用マイクロメータ', kind: 'standard', intervalMonths: 12, identityKey: 'serial', unit: 'mm', resolution: '0.001',
      fields: [F('range', '測定範囲'), F('certNo', '校正証明書番号')] },
    { id: 'cat-calfeeler', name: '校正用すきまゲージ', kind: 'standard', intervalMonths: 12, identityKey: 'serial', unit: 'mm', resolution: '0.001',
      fields: [F('range', '厚さ範囲'), F('certNo', '校正証明書番号')] },
    { id: 'cat-tensile', name: '引張試験機', kind: 'test', intervalMonths: 12, identityKey: 'serial', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '容量', 'number', { unit: 'kN', digits: '0' }), F('grade', '等級', 'select', { options: ['0.5級', '1級', '2級'] })] },
    { id: 'cat-force', name: '力計', kind: 'test', intervalMonths: 12, identityKey: 'serial', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '容量', 'number', { unit: 'kN', digits: '0' })] },
    { id: 'cat-loadcell', name: 'ロードセル', kind: 'test', intervalMonths: 12, identityKey: 'serial', unit: 'kN', resolution: '0.01',
      fields: [F('capacity', '定格容量', 'number', { unit: 'kN', digits: '0' })] },
    { id: 'cat-ext', name: '伸び計', kind: 'test', intervalMonths: 12, identityKey: 'serial', unit: 'mm', resolution: '0.001',
      fields: [F('gauge', '標点距離', 'number', { unit: 'mm', digits: '0' }), F('stroke', 'ストローク', 'number', { unit: 'mm', digits: '0' })] }
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
