/* ── トレーサビリティ：校正に使った標準器 ──
   「校正する側・される側」の関係は構成（親子）とは別に、校正の記録（events.standards）に持たせる。
   ここでは、選べる標準器・同時に使えない組合せ・校正時点での標準器の有効性・逆引きを扱う。 */
(function () {
  'use strict';
  const KK = window.KK;
  const U = KK.util;
  const R = () => KK.rules;
  const repo = () => KK.repo;

  const label = (a) => `${R().category(a).name} ${R().identity(a)}`;

  const trace = {
    label,

    /** 標準器として選べるか（大分類が標準器） */
    isStandard: (a) => R().category(a).kind === 'standard',

    /** 自分の校正記録（新しい順） */
    calibrations: (a) => repo().events.forAsset(a.id).filter((e) => e.type === 'calibration'),

    /** 前回校正日に当たる校正記録。なければ null */
    currentCalEvent(a) {
      if (!a.lastCalDate) return null;
      return trace.calibrations(a).find((e) => e.date === a.lastCalDate) || null;
    },

    /** その日の時点での前回校正日。子で記録がなければ親の記録を使う */
    calDateAsOf(a, date) {
      const own = trace.calibrations(a).map((e) => e.date).concat(a.lastCalDate ? [a.lastCalDate] : [])
        .filter((d) => d && d <= date).sort().pop();
      if (own) return own;
      const p = a.parentId && repo().assets.get(a.parentId);
      return p ? trace.calDateAsOf(p, date) : '';
    },

    /** 標準器が、校正日の時点で有効だったか */
    statusAsOf(std, date) {
      if (!date) return { key: 'unknown', label: '校正日未入力', icon: 'fa-circle-question', cls: 'muted', rank: 0 };
      const cal = trace.calDateAsOf(std, date);
      if (!cal) return { key: 'nocal', label: 'その時点の校正記録なし', icon: 'fa-circle-question', cls: 'warn', rank: 3 };
      const due = U.addMonths(cal, R().interval(std));
      if (date > due) return { key: 'overdue', label: `校正時に期限切れ（${due} 期限）`, icon: 'fa-circle-exclamation', cls: 'danger', rank: 4, due };
      return { key: 'ok', label: '校正時に有効', icon: 'fa-circle-check', cls: 'ok', rank: 2, due };
    },

    /** 選択肢：標準器の木（セットと中のゲージ）。自分自身と自分の構成は除く */
    candidates(selfId) {
      const banned = new Set();
      if (selfId) {
        banned.add(selfId);
        repo().assets.descendants(selfId).forEach((d) => banned.add(d.id));
        repo().assets.ancestors(selfId).forEach((d) => banned.add(d.id));
      }
      const ok = (a) => trace.isStandard(a) && !banned.has(a.id) && a.state !== 'retired';
      const tops = repo().assets.list().filter((a) => ok(a) && !(a.parentId && ok(repo().assets.get(a.parentId) || {})))
        .sort(R().compareIdentity);
      return tops.map((t) => ({ asset: t, children: repo().assets.descendants(t.id).filter(ok) }));
    },

    /** 選択を整える：セットを選んだら中のゲージは重複なので外す */
    normalize(ids) {
      const set = new Set(ids);
      return ids.filter((id) => !repo().assets.ancestors(id).some((p) => set.has(p.id)));
    },

    /** 属するセット：ゲージならその親の最上位、セット自体ならそれ、単独の標準器なら null */
    setOf(id) {
      const a = repo().assets.get(id); if (!a) return null;
      if (a.parentId) return repo().assets.topOf(id);
      return repo().assets.children(id).length ? a : null;
    },

    /** 同時に使えない組合せ。別のセット（セット全体・中のゲージとも）は同じ校正で使わない */
    conflict(ids) {
      const sets = new Map();
      ids.forEach((id) => { const s = trace.setOf(id); if (s) sets.set(s.id, s); });
      return sets.size > 1 ? `別のセットは同時に使えません（${[...sets.values()].map((s) => R().identity(s)).join('・')}）` : '';
    },

    /** id を選ぶとき、ほかのセット（またはその中のゲージ）が選ばれていればそのセット */
    blockingSet(id, selected) {
      const mine = trace.setOf(id); if (!mine) return null;
      const other = selected.map((x) => trace.setOf(x)).find((s) => s && s.id !== mine.id);
      return other || null;
    },

    /** 校正記録に付ける標準器の情報（削除されても名前が残るよう、名前の写しも持つ） */
    stamp(ids) {
      const list = trace.normalize(ids || []);
      return { standards: list, standardLabels: list.map((id) => { const s = repo().assets.get(id); return s ? label(s) : '（不明）'; }) };
    },

    /** 記録に書かれた標準器を、表示用に { id, asset, label } で返す */
    standardsOf(e) {
      return (e?.standards || []).map((id, i) => ({ id, asset: repo().assets.get(id), label: e.standardLabels?.[i] || '（削除済み）' }));
    },

    /**
     * 逆引き：この標準器（セットなら中のゲージ、ゲージならそのセット全体の使用も含む）で校正した記録。
     * 新しい順。latest は、その機器の現在の校正（前回校正日）に当たるか。
     */
    usages(stdId) {
      const related = new Set([stdId, ...repo().assets.descendants(stdId).map((d) => d.id), ...repo().assets.ancestors(stdId).map((d) => d.id)]);
      const out = [];
      repo().assets.list().forEach((a) => {
        trace.calibrations(a).forEach((e) => {
          const hit = (e.standards || []).filter((id) => related.has(id));
          if (!hit.length) return;
          out.push({ asset: a, event: e, via: hit, latest: e.date === a.lastCalDate, status: hit.map((id) => repo().assets.get(id)).filter(Boolean).map((s) => trace.statusAsOf(s, e.date)) });
        });
      });
      return out.sort((x, y) => y.event.date.localeCompare(x.event.date));
    },

    /** 入力の検査（rules.validate から呼ぶ） */
    validate(input) {
      const ids = input.calStandards || [];
      if (!ids.length) return {};
      if (!input.lastCalDate) return { calStandards: '標準器を記録するには前回校正日を入れてください' };
      const c = trace.conflict(ids);
      return c ? { calStandards: c } : {};
    }
  };

  KK.trace = trace;
})();
