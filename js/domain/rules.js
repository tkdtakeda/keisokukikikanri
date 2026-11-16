/* ── 業務ルール：期限・状態・識別・保存 ──
   画面に依存しない。ここを直せば、表・詳細・フォームの判定がそろって変わる。 */
(function () {
  'use strict';
  const KK = window.KK;
  const U = KK.util;
  const R = () => KK.repo;

  const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

  const rules = {
    soonDays: 30,

    category: (a) => R().categories.get(a.categoryId) || { name: '（分類なし）', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', fields: [] },
    kind(a) { return KK.kinds.get(rules.category(a).kind) || KK.kinds.list()[0]; },

    /** 見分けに使う番号。分類の識別キーに従い、無ければもう一方 */
    identity(a) {
      const key = rules.category(a).identityKey;
      return (key === 'serial' ? (a.serial || a.mgmtNo) : (a.mgmtNo || a.serial)) || '（番号なし）';
    },
    compareIdentity: (a, b) => collator.compare(rules.identity(a), rules.identity(b)),

    /** 単位と最小表示量。機器で上書きしていなければ分類の値。inherited はどちらが分類由来か */
    resolution(a) {
      const r = KK.inherit.resolution(a); const u = KK.inherit.unit(a);
      return { resolution: r.value, unit: u.value, inheritedRes: r.source !== 'asset', inheritedUnit: u.source !== 'asset', resSource: r.source, unitSource: u.source };
    },
    /** 測定値の小数の桁数（最小表示量から）。決まっていなければ null */
    digits(a) { return KK.num.digitsOf(rules.resolution(a).resolution); },
    /** 「0.001 mm」のような表示 */
    resolutionText(a) {
      const r = rules.resolution(a);
      if (!r.resolution) return '';
      return `${r.resolution}${r.unit ? ' ' + r.unit : ''}`;
    },

    interval(a) { return Number(a.intervalMonths) > 0 ? Number(a.intervalMonths) : Number(rules.category(a).intervalMonths) || 12; },

    /** 校正日：未入力の子は親の校正日を引き継ぐ */
    calDate(a) {
      if (a.lastCalDate) return a.lastCalDate;
      const p = a.parentId && R().assets.get(a.parentId);
      return p ? rules.calDate(p) : '';
    },
    isCalInherited: (a) => !a.lastCalDate && !!rules.calDate(a),
    dueDate(a) { const d = rules.calDate(a); return d ? U.addMonths(d, rules.interval(a)) : ''; },

    /** 個体単体の状態 */
    status(a, today = U.today()) {
      if (a.state === 'retired') return { key: 'retired', label: '廃棄', icon: 'fa-ban', cls: 'muted', rank: 0 };
      if (a.state === 'stored') return { key: 'stored', label: '保管中', icon: 'fa-box-archive', cls: 'muted', rank: 1 };
      const due = rules.dueDate(a);
      if (!due) return { key: 'nocal', label: '校正日なし', icon: 'fa-circle-question', cls: 'warn', rank: 3.5 };
      const days = U.daysBetween(today, due);
      if (days < 0) return { key: 'overdue', label: `期限切れ ${-days}日`, icon: 'fa-circle-exclamation', cls: 'danger', rank: 4, days };
      if (days <= rules.soonDays) return { key: 'soon', label: days === 0 ? '今日まで' : `あと${days}日`, icon: 'fa-clock', cls: 'warn', rank: 3, days };
      return { key: 'ok', label: '有効', icon: 'fa-circle-check', cls: 'ok', rank: 2, days };
    },
    /** 親は自分と子孫（廃棄を除く）のうち最も悪い状態を示す */
    rollup(a, today) {
      const own = rules.status(a, today);
      if (own.key === 'retired') return own;
      const all = [own, ...R().assets.descendants(a.id).filter((d) => d.state !== 'retired').map((d) => rules.status(d, today))];
      const worst = all.reduce((w, s) => (s.rank > w.rank ? s : w));
      return worst === own ? own : { ...worst, viaChild: true };
    },

    statusFilters: [
      { id: 'all', label: 'すべて', icon: 'fa-layer-group', cls: '' },
      { id: 'overdue', label: '期限切れ', icon: 'fa-circle-exclamation', cls: 'danger' },
      { id: 'soon', label: '期限間近', icon: 'fa-clock', cls: 'warn' },
      { id: 'nocal', label: '校正日なし', icon: 'fa-circle-question', cls: 'warn' },
      { id: 'ok', label: '有効', icon: 'fa-circle-check', cls: 'ok' },
      { id: 'stored', label: '保管中', icon: 'fa-box-archive', cls: 'muted' }
    ],

    /** 入力の検査。{ field: メッセージ } を返す（空なら合格） */
    validate(input, selfId) {
      const err = {};
      const cat = R().categories.get(input.categoryId);
      if (!cat) err.categoryId = '分類を選んでください';
      if (!input.locationId) err.locationId = '設置先を選んでください';
      const idKey = KK.identityKeys.get(cat?.identityKey);
      (idKey?.required || []).forEach((f) => { if (!String(input[f] || '').trim()) err[f] = `${idKey.label}で見分けるため必須です`; });
      if (input.lastCalDate && !U.isValidDate(input.lastCalDate)) err.lastCalDate = '日付が正しくありません';
      else if (input.lastCalDate && input.lastCalDate > U.today()) err.lastCalDate = '未来の日付は入力できません';
      if (input.intervalMonths !== '' && input.intervalMonths != null && !(Number(input.intervalMonths) > 0)) err.intervalMonths = '1 以上の月数を入力してください';
      if (input.resolution && !(Number(KK.num.clean(input.resolution)) > 0)) err.resolution = '0.001 のような正の数で入力してください';

      // 識別キーの重複（廃棄済みは対象外）
      if (idKey && input.state !== 'retired' && !err[idKey.required[0]]) {
        const key = idKey.keyOf(input);
        const dup = key && R().assets.list().find((a) => a.id !== selfId && a.state !== 'retired' &&
          rules.category(a).identityKey === idKey.id && idKey.keyOf(a) === key);
        if (dup) err[idKey.required[0]] = idKey.conflictText(input, R().locations.path(input.locationId));
      }
      // 親：自分自身や自分の子孫は親にできない
      if (input.parentId && selfId) {
        if (input.parentId === selfId || R().assets.descendants(selfId).some((d) => d.id === input.parentId)) err.parentId = '自分自身や自分の構成の中は親にできません';
      }
      Object.assign(err, KK.trace ? KK.trace.validate(input) : {});
      (cat?.fields || []).forEach((f) => {
        const v = input.props?.[f.key];
        if (f.required && (v === '' || v == null) && !KK.inherit.prop({ props: {}, modelId: input.modelId }, f.key).value) err['prop:' + f.key] = '必須です';
        const msg = KK.fieldTypes.get(f.type)?.validate?.(v ?? '');
        if (msg) err['prop:' + f.key] = msg;
      });
      return err;
    }
  };

  // ── 保存の手続き：変更内容から記録を作り、まとめて書き込む ──
  const ev = (assetId, type, date, text, extra = {}) => ({ id: U.uid('e'), assetId, type, date, text, createdAt: U.nowIso(), ...extra });

  KK.eventTypes = KK.createRegistry('eventTypes');
  [
    { id: 'register', label: '登録', icon: 'fa-plus' },
    { id: 'calibration', label: '校正', icon: 'fa-check-double' },
    { id: 'move', label: '移動', icon: 'fa-truck-arrow-right' },
    { id: 'state', label: '状態変更', icon: 'fa-arrows-rotate' },
    { id: 'edit', label: '変更', icon: 'fa-pen' },
    { id: 'note', label: 'メモ', icon: 'fa-note-sticky' }
  ].forEach((t, i) => KK.eventTypes.register({ ...t, order: i }));

  KK.assetService = {
    /** 新規・更新の保存。input はフォームの値。保存後の個体を返す */
    async save(input, selfId) {
      const repo = R();
      const before = selfId ? repo.assets.get(selfId) : null;
      const today = U.today();
      const parent = input.parentId ? repo.assets.get(input.parentId) : null;
      const keep = (k, conv, empty) => (input[k] === undefined ? (before?.[k] ?? empty) : conv(input[k]));
      const a = {
        ...(before || { id: U.uid('a'), createdAt: U.nowIso() }),
        categoryId: input.categoryId,
        locationId: parent ? parent.locationId : input.locationId,
        parentId: input.parentId || null,
        mgmtNo: (input.mgmtNo || '').trim(),
        serial: (input.serial || '').trim(),
        // 型式・会社・校正区分：null は引き継ぎ（型式・親・分類）。フォームが送らなかった項目は元の値を保つ
        model: keep('model', (v) => (v || '').trim(), ''),
        maker: keep('maker', (v) => (v || '').trim(), ''),
        modelId: keep('modelId', (v) => v || null, null),
        makerId: keep('makerId', (v) => v || null, null),
        calibratorId: keep('calibratorId', (v) => v || null, null),
        calType: keep('calType', (v) => v || null, null),
        range: keep('range', (r) => (r && (KK.num.clean(r.min) || KK.num.clean(r.max)) ? { min: KK.num.clean(r.min) || '', max: KK.num.clean(r.max) || '', unit: r.unit ?? null } : null), null),
        lastCalDate: input.lastCalDate || '',
        intervalMonths: input.intervalMonths === '' || input.intervalMonths == null ? null : Number(input.intervalMonths),
        // 単位・最小表示量：null は分類に従う（'' の単位は「単位なし」を選んだ状態）
        unit: input.unit === undefined ? (before?.unit ?? null) : (input.unit === '__inherit' ? null : input.unit),
        resolution: input.resolution === undefined ? (before?.resolution ?? null) : (KK.num.clean(input.resolution) || null),
        state: input.state || 'active',
        note: (input.note || '').trim(),
        props: input.props || {},
        sample: before ? before.sample : !!input.sample,
        updatedAt: U.nowIso()
      };
      const ops = [repo.put('assets', a)];
      const locName = (id) => repo.locations.path(id);
      if (!before) {
        ops.push(repo.put('events', ev(a.id, 'register', today, `${locName(a.locationId)} に登録`, { sample: a.sample })));
        if (a.lastCalDate) ops.push(repo.put('events', ev(a.id, 'calibration', a.lastCalDate, '台帳登録時の前回校正日', { sample: a.sample, source: 'ledger', ...KK.trace.stamp(input.calStandards) })));
      } else {
        if (before.locationId !== a.locationId) {
          ops.push(repo.put('events', ev(a.id, 'move', today, `${locName(before.locationId)} → ${locName(a.locationId)}`)));
          // 構成の子は一緒に持ち運ぶので、設置先をそろえる
          repo.assets.descendants(a.id).forEach((d) => {
            if (d.locationId === a.locationId) return;
            ops.push(repo.put('assets', { ...d, locationId: a.locationId, updatedAt: U.nowIso() }));
            ops.push(repo.put('events', ev(d.id, 'move', today, `親と一緒に ${locName(d.locationId)} → ${locName(a.locationId)}`)));
          });
        }
        if ((before.parentId || null) !== a.parentId) {
          const pName = (id) => { const p = id && repo.assets.get(id); return p ? `${rules.category(p).name} ${rules.identity(p)}` : 'なし'; };
          ops.push(repo.put('events', ev(a.id, 'edit', today, `構成の親：${pName(before.parentId)} → ${pName(a.parentId)}`)));
        }
        if (before.lastCalDate !== a.lastCalDate && a.lastCalDate) {
          ops.push(repo.put('events', ev(a.id, 'calibration', a.lastCalDate, '台帳で前回校正日を更新', { source: 'ledger', ...KK.trace.stamp(input.calStandards) })));
        } else if (a.lastCalDate && input.calStandards !== undefined) {
          // 校正日は同じで、使った標準器だけを直した
          const cur = KK.trace.currentCalEvent(before);
          const stamp = KK.trace.stamp(input.calStandards);
          const same = JSON.stringify(cur?.standards || []) === JSON.stringify(stamp.standards);
          if (!same) {
            ops.push(repo.put('events', cur ? { ...cur, ...stamp, editedAt: U.nowIso() }
              : ev(a.id, 'calibration', a.lastCalDate, '台帳で使用した標準器を記録', { source: 'ledger', ...stamp })));
          }
        }
        if (before.state !== a.state) {
          ops.push(repo.put('events', ev(a.id, 'state', today, `${KK.assetStates[before.state]?.label} → ${KK.assetStates[a.state]?.label}`)));
        }
      }
      await repo.commit(ops, 'assets');
      return a;
    },

    /** 状態だけを変える（廃棄・保管・使用中に戻す）。子も同じ状態にするかは呼び出し側で選ぶ */
    async setState(ids, state) {
      const repo = R(); const today = U.today();
      const ops = [];
      ids.forEach((id) => {
        const a = repo.assets.get(id);
        if (!a || a.state === state) return;
        ops.push(repo.put('assets', { ...a, state, updatedAt: U.nowIso() }));
        ops.push(repo.put('events', ev(id, 'state', today, `${KK.assetStates[a.state]?.label} → ${KK.assetStates[state]?.label}`)));
      });
      if (ops.length) await repo.commit(ops, 'assets');
    },

    /** 個体と構成の子孫を削除し、取り消し用の写しを返す */
    remove(id) {
      const repo = R();
      return repo.removeAssets([id, ...repo.assets.descendants(id).map((d) => d.id)]);
    }
  };

  KK.rules = rules;
})();
