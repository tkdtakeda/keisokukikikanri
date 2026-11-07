/* ── 単位と表示桁 ──
   単位は選択肢の一覧（利用者が追加できる）。'' は「単位なし」。
   数値は「打ったとおりの文字」で保存し、表示桁に足りない 0 だけを補う（1 → 1.000）。
   桁を超える入力は丸めずにそのまま残し、警告だけを出す（測定記録を黙って変えないため）。 */
(function () {
  'use strict';
  const KK = window.KK;

  const DEFAULT_UNITS = ['mm', 'µm', 'm', 'N', 'kN', '%', ''];
  const NONE_LABEL = '単位なし';

  // ── 単位の一覧 ──
  const units = {
    NONE_LABEL,
    list: () => KK.repo.settings.get('units', DEFAULT_UNITS.slice()),
    label: (u) => (u ? u : NONE_LABEL),
    /** 単位を足す。表記ゆれ（全角・前後の空白）はそろえる */
    async add(name) {
      const u = String(name || '').normalize('NFKC').trim().replace(/^u(m)$/i, 'µ$1');
      if (!u) throw new Error('単位を入力してください');
      if (u === NONE_LABEL) throw new Error('「単位なし」は最初からあります');
      const list = units.list();
      if (list.includes(u)) throw new Error(`「${u}」は既にあります`);
      await KK.repo.settings.set('units', [...list.filter((x) => x !== ''), u, '']);
      return u;
    },
    /** 使っている分類・個体・項目の数（削除できるかの判断に使う） */
    usage(u) {
      let n = 0;
      KK.repo.categories.list().forEach((c) => {
        if ((c.unit ?? null) === u) n++;
        (c.fields || []).forEach((f) => { if (f.type === 'number' && (f.unit || '') === u) n++; });
      });
      KK.repo.assets.list().forEach((a) => { if (a.unit != null && a.unit === u) n++; });
      return n;
    },
    async remove(u) {
      if (u === '') throw new Error('「単位なし」は削除できません');
      const n = units.usage(u);
      if (n) throw new Error(`${n} か所で使っているため削除できません`);
      await KK.repo.settings.set('units', units.list().filter((x) => x !== u));
    },
    /** 一覧に無い単位（古いデータなど）を一覧に足す */
    async ensure(list) {
      const cur = units.list();
      const missing = [...new Set(list.filter((u) => u && !cur.includes(u)))];
      if (missing.length) await KK.repo.settings.set('units', [...cur.filter((x) => x !== ''), ...missing, '']);
    },
    /** <option> の並び */
    options(selected, opt = {}) {
      const head = opt.inherit ? `<option value="__inherit"${selected == null ? ' selected' : ''}>${KK.util.esc(opt.inherit)}</option>` : '';
      return head + units.list().map((u) => `<option value="${KK.util.esc(u)}"${selected === u ? ' selected' : ''}>${KK.util.esc(units.label(u))}</option>`).join('');
    }
  };

  // ── 数値の表示桁 ──
  const num = {
    /** 全角などをそろえた数値の文字。数値でなければ null */
    clean(raw) {
      const s = String(raw ?? '').normalize('NFKC').trim().replace(/[−ー‐]/g, '-').replace(/,/g, '');
      if (s === '') return '';
      return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? s.replace(/^\+/, '').replace(/^(-?)\./, '$10.').replace(/\.$/, '') : null;
    },
    decimals: (s) => { const m = String(s).match(/\.(\d+)$/); return m ? m[1].length : 0; },
    /** 最小表示量（0.001 など）から小数の桁数 */
    digitsOf(resolution) {
      const s = num.clean(resolution);
      return s ? num.decimals(s) : null;
    },
    /** 表示用：桁に足りない 0 を補う。超えていればそのまま（excess=true） */
    format(raw, digits) {
      const s = num.clean(raw);
      if (s === null) return { text: String(raw ?? ''), valid: false, excess: false };
      if (s === '' || digits == null || digits === '') return { text: s, valid: true, excess: false };
      const d = num.decimals(s);
      if (d > digits) return { text: s, valid: true, excess: true };
      const pad = digits - d;
      return { text: pad ? (d ? s : s + (digits ? '.' : '')) + '0'.repeat(pad) : s, valid: true, excess: false };
    },
    /** 桁を超えたときの警告文 */
    excessText: (digits) => `表示桁（小数 ${digits} 桁）を超えています。丸めずに、打ったとおり記録します`
  };

  /** 項目の桁の決め方：'' 入力どおり／'asset' 機器の表示桁／'0'〜'6' */
  num.fieldDigits = (field, asset) => {
    if (!field || field.digits == null || field.digits === '') return null;
    if (field.digits === 'asset') return asset ? KK.rules.digits(asset) : null;
    const n = Number(field.digits);
    return Number.isInteger(n) ? n : null;
  };
  num.fieldDigitOptions = (sel) => [['', '入力どおり'], ['asset', '機器の表示桁'], ...[0, 1, 2, 3, 4, 5, 6].map((n) => [String(n), `小数 ${n} 桁`])]
    .map(([v, l]) => `<option value="${v}"${String(sel ?? '') === v ? ' selected' : ''}>${l}</option>`).join('');

  KK.units = units;
  KK.num = num;
})();
