/* ── 値の引き継ぎ（分類 → 型式 → 機器、親 → 子） ──
   機器に値がなければ、型式・親・分類から引き継ぐ。どこから来た値かも一緒に返し、画面に札で出す。
   ・単位・最小表示量・測定範囲・分類の項目：機器 → 型式 → 分類
   ・メーカー：機器 → 型式 → 親
   ・校正区分・校正会社：機器 → 親 → 分類（校正区分のみ） */
(function () {
  'use strict';
  const KK = window.KK;
  const repo = () => KK.repo;
  const has = (v) => v !== undefined && v !== null && v !== '';

  KK.calTypes = {
    internal: { label: '社内', icon: 'fa-building' },
    external: { label: '外部', icon: 'fa-truck-fast' }
  };
  const SOURCE = { asset: 'この機器', model: '型式', parent: '親', category: '分類', none: '' };

  const parentOf = (a) => (a.parentId ? repo().assets.get(a.parentId) : null);
  const cat = (a) => KK.rules.category(a);

  const inherit = {
    SOURCE,
    model: (a) => repo().models.get(a.modelId) || null,

    /** 型式の表示名：型番 名称（型番がなければ名称だけ） */
    modelLabel(m) { return m ? [m.modelNo, m.name].filter(Boolean).join(' ') || '（名前のない型式）' : ''; },
    /** 機器の型式の表示。型式マスタを使っていなければ自由記述 */
    modelText(a) { const m = inherit.model(a); return m ? inherit.modelLabel(m) : (a.model || ''); },

    resolution(a) {
      const m = inherit.model(a);
      if (has(a.resolution)) return { value: a.resolution, source: 'asset' };
      if (m && has(m.resolution)) return { value: m.resolution, source: 'model' };
      return { value: cat(a).resolution || '', source: 'category' };
    },
    unit(a) {
      const m = inherit.model(a);
      if (a.unit != null) return { value: a.unit, source: 'asset' };
      if (m && m.unit != null) return { value: m.unit, source: 'model' };
      return { value: cat(a).unit ?? '', source: 'category' };
    },

    /** 測定範囲 { min, max, unit }。単位がなければ測定値の単位 */
    range(a) {
      const m = inherit.model(a);
      const pick = (r, source) => ({ value: { min: r.min ?? '', max: r.max ?? '', unit: r.unit ?? inherit.unit(a).value }, source });
      if (a.range && (has(a.range.min) || has(a.range.max))) return pick(a.range, 'asset');
      if (m && m.range && (has(m.range.min) || has(m.range.max))) return pick(m.range, 'model');
      return { value: null, source: 'none' };
    },
    rangeText(a) {
      const r = inherit.range(a).value;
      if (!r) return '';
      return `${r.min === '' ? '' : r.min}〜${r.max === '' ? '' : r.max}${r.unit ? ' ' + r.unit : ''}`;
    },

    /** 分類の項目の値：機器 → 型式 */
    prop(a, key) {
      const m = inherit.model(a);
      if (has(a.props?.[key])) return { value: a.props[key], source: 'asset' };
      if (m && has(m.props?.[key])) return { value: m.props[key], source: 'model' };
      return { value: '', source: 'none' };
    },

    maker(a, guard = 0) {
      if (has(a.makerId)) return { value: a.makerId, source: 'asset' };
      const m = inherit.model(a);
      if (m && has(m.makerId)) return { value: m.makerId, source: 'model' };
      const p = parentOf(a);
      if (p && guard < 20) { const r = inherit.maker(p, guard + 1); if (r.value) return { value: r.value, source: 'parent' }; }
      return { value: '', source: 'none' };
    },
    calType(a, guard = 0) {
      if (has(a.calType)) return { value: a.calType, source: 'asset' };
      const p = parentOf(a);
      if (p && guard < 20) return { value: inherit.calType(p, guard + 1).value, source: 'parent' };
      return { value: cat(a).calType || 'internal', source: 'category' };
    },
    calibrator(a, guard = 0) {
      if (has(a.calibratorId)) return { value: a.calibratorId, source: 'asset' };
      const p = parentOf(a);
      if (p && guard < 20) { const r = inherit.calibrator(p, guard + 1); if (r.value) return { value: r.value, source: 'parent' }; }
      return { value: '', source: 'none' };
    },

    companyName: (id) => repo().companies.get(id)?.name || '',
    makerName: (a) => inherit.companyName(inherit.maker(a).value),
    /** 校正会社は外部校正のときだけ意味を持つ */
    calibratorName: (a) => (inherit.calType(a).value === 'external' ? inherit.companyName(inherit.calibrator(a).value) : ''),

    /** 出どころの札（機器自身の値なら出さない） */
    tag(source, opt = {}) {
      if (!SOURCE[source] || (source === 'asset' && !opt.showOwn)) return '';
      return `<span class="tag tag--src" title="${SOURCE[source]}から引き継いだ値">${SOURCE[source]}</span>`;
    }
  };

  KK.inherit = inherit;
})();
