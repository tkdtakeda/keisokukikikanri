/* ── 個体の登録・編集フォーム（非モーダル） ──
   分類を選ぶと、その分類の項目と必須の番号が切り替わる。
   「続けて登録」で、分類・設置先・親を引き継いだまま次の個体を入れられる（セットの中身の登録向け）。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;
  const R = KK.rules;

  let win = null;
  let ctx = null; // { mode: 'new'|'edit', id, pending: [File] }

  // ── 選択肢 ──
  function categoryOptions(sel) {
    return KK.kinds.list().map((k) => {
      const cats = KK.repo.categories.list().filter((c) => c.kind === k.id);
      return cats.length ? `<optgroup label="${esc(k.label)}">${cats.map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
  }
  function locationOptions(sel) {
    const out = [];
    const walk = (pid, depth) => KK.repo.locations.children(pid).forEach((l) => {
      out.push(`<option value="${l.id}"${l.id === sel ? ' selected' : ''}>${'　'.repeat(depth)}${esc(l.name)}</option>`); walk(l.id, depth + 1);
    });
    walk(null, 0);
    return '<option value="">選んでください</option>' + out.join('');
  }
  function parentOptions(locationId, sel, selfId) {
    const banned = new Set(selfId ? [selfId, ...KK.repo.assets.descendants(selfId).map((d) => d.id)] : []);
    const cands = KK.repo.assets.list().filter((a) => a.state !== 'retired' && !banned.has(a.id) && (a.locationId === locationId || a.id === sel))
      .sort(R.compareIdentity);
    return '<option value="">なし（単独）</option>' + cands.map((a) => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(R.category(a).name)} ${esc(R.identity(a))}</option>`).join('');
  }
  const I = KK.inherit;

  /** 桁・引き継ぎの基準にする「入力中の個体」（まだ保存していない値で決める） */
  function ctxAsset(v) {
    return {
      categoryId: v.categoryId, parentId: v.parentId || null, modelId: v.modelId || null,
      resolution: KK.num.clean(v.resolution || '') || null, unit: v.unit === '__inherit' || v.unit === undefined ? null : v.unit,
      makerId: v.makerId || null, calibratorId: v.calibratorId || null, calType: v.calType || null,
      range: v.range && (v.range.min || v.range.max) ? v.range : null, props: v.props || {}
    };
  }
  /** 自分の値を外したときに引き継ぐ値（placeholder に出す） */
  function inheritedCtx(v) {
    return { ...ctxAsset(v), resolution: null, unit: null, range: null, makerId: null, calibratorId: null, calType: null, props: {} };
  }
  const fromText = (r, text) => (text ? `${I.SOURCE[r.source] || ''}：${text}` : '');
  /** 「1 → 1.000 mm」の表示の例 */
  function resSample(v) {
    const a = ctxAsset(v);
    const d = R.digits(a); const unit = R.resolution(a).unit;
    if (d == null) return '<span class="sub">最小表示量を決めると、桁をそろえて表示します</span>';
    return `<b>1</b> → <b>${esc(KK.num.format('1', d).text)}</b>${unit ? ' ' + esc(unit) : ''}`;
  }

  /** 型式・メーカー・測定範囲・単位・最小表示量・校正区分・校正会社 */
  function modelSectionHtml(v, cat) {
    const own = ctxAsset(v); const inh = inheritedCtx(v);
    const model = KK.repo.models.get(v.modelId);
    const mk = I.maker(inh); const cal = I.calibrator(inh); const ct = I.calType(inh);
    const r = I.range(inh); const res = I.resolution(inh); const un = I.unit(inh);
    const external = I.calType(own).value === 'external';
    const unitLabel = KK.units.label(I.unit(own).value);
    return `
        <div class="field span-4"><label>型式 <span class="sub">（型番・名称。一覧にない型番はその場で登録できます）</span></label>
          ${KK.combo.html({ name: 'model', field: 'modelId', id: v.modelId, label: I.modelLabel(model), placeholder: '型番で探す（空欄可）' })}
          ${!model && v.model ? `<span class="hint">旧い記述：${esc(v.model)}</span>` : ''}</div>
        <div class="field span-2"><label>メーカー</label>
          ${KK.combo.html({ name: 'maker', field: 'makerId', id: v.makerId, label: I.companyName(v.makerId), placeholder: fromText(mk, I.companyName(mk.value)) || '会社名で探す' })}</div>
        <div class="field span-2"><label>測定範囲</label><div class="range-row">
          <input class="input" data-field="rangeMin" inputmode="decimal" value="${esc(v.range?.min ?? '')}" placeholder="${esc(r.value?.min ?? '下限')}" data-next><span>〜</span>
          <input class="input" data-field="rangeMax" inputmode="decimal" value="${esc(v.range?.max ?? '')}" placeholder="${esc(r.value?.max ?? '上限')}" data-next><span class="unit">${esc(unitLabel === KK.units.NONE_LABEL ? '' : unitLabel)}</span></div>
          <span class="hint">${r.value ? `空欄なら${I.SOURCE[r.source]}の値（${esc(I.rangeText(inh))}）` : '例：0〜25、0.01〜0.5'}</span></div>
        <div class="field span-2"><label>測定値の単位</label><select class="input" data-field="unit" data-next>${KK.units.options(v.unit ?? null, { inherit: `${I.SOURCE[un.source]}に従う（${KK.units.label(un.value)}）` })}</select></div>
        <div class="field span-2"><label>最小表示量</label><input class="input" data-field="resolution" inputmode="decimal" value="${esc(v.resolution || '')}" placeholder="${esc(res.value || '0.001')}" data-next>
          <span class="hint" data-res-sample>${resSample(v)}${res.value ? `（空欄なら${I.SOURCE[res.source]}の ${esc(res.value)}）` : ''}</span></div>
        <div class="field span-2"><label>校正区分</label><select class="input" data-field="calType" data-next>
          <option value="">引き継ぐ（${I.SOURCE[ct.source]}：${KK.calTypes[ct.value].label}）</option>
          ${Object.entries(KK.calTypes).map(([k, t]) => `<option value="${k}"${v.calType === k ? ' selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="field span-4"><label>校正会社 ${external ? '' : '<span class="sub">（社内校正のため不要）</span>'}</label>
          ${KK.combo.html({ name: 'calibrator', field: 'calibratorId', id: v.calibratorId, label: I.companyName(v.calibratorId), disabled: !external,
            placeholder: external ? (fromText(cal, I.companyName(cal.value)) || '会社名で探す') : '社内校正' })}</div>`;
  }

  // ── フォーム本体 ──
  function bodyHtml(v) {
    const cat = KK.repo.categories.get(v.categoryId);
    const idKey = KK.identityKeys.get(cat?.identityKey);
    const req = (f) => (idKey?.required.includes(f) ? '<span class="req" title="必須">*</span>' : '');
    const parent = v.parentId && KK.repo.assets.get(v.parentId);
    const defInterval = cat?.intervalMonths || 12;
    return `
      <form class="form-grid" novalidate autocomplete="off">
        <div class="field span-3"><label>分類<span class="req">*</span></label><select class="input" data-field="categoryId" data-next>${categoryOptions(v.categoryId)}</select>
          <span class="hint">見分け方：${esc(idKey?.label || '')}</span></div>
        <div class="field span-3"><label>設置先<span class="req">*</span></label>
          <select class="input" data-field="locationId" data-next ${parent ? 'disabled' : ''}>${locationOptions(parent ? parent.locationId : v.locationId)}</select>
          ${parent ? '<span class="hint">親と一緒に置く（親の設置先に合わせます）</span>' : '<span class="hint">ライン・課のどの階層にも置けます</span>'}</div>
        <div class="field span-2"><label>管理番号${req('mgmtNo')}</label><input class="input" data-field="mgmtNo" value="${esc(v.mgmtNo)}" data-next></div>
        <div class="field span-2"><label>製造番号${req('serial')}</label><input class="input" data-field="serial" value="${esc(v.serial)}" data-next></div>
        <div class="field span-2"><label>親（構成）</label><select class="input" data-field="parentId" data-next>${parentOptions(parent ? parent.locationId : v.locationId, v.parentId, ctx.id)}</select></div>
        ${modelSectionHtml(v, cat)}
        <div class="field span-3"><label>前回校正日</label>${KK.dateInputHtml('lastCalDate', v.lastCalDate)}
          <span class="hint">${parent ? '空欄なら親の校正日を引き継ぎます' : '空欄なら「校正日なし」として表示します'}</span></div>
        <div class="field span-1"><label>周期</label><div class="unit-input"><input class="input" data-field="intervalMonths" inputmode="numeric" value="${esc(v.intervalMonths ?? '')}" placeholder="${defInterval}" data-next><span class="unit">か月</span></div></div>
        <div class="field span-2"><label>状態</label><select class="input" data-field="state" data-next>${Object.entries(KK.assetStates).map(([k, s]) => `<option value="${k}"${k === (v.state || 'active') ? ' selected' : ''}>${s.label}</option>`).join('')}</select></div>
        ${I.calType(ctxAsset(v)).value === 'external'
          ? '<div class="field span-6"><label>校正に使った標準器</label><span class="hint"><i class="fa-solid fa-truck-fast"></i> 外部校正のため、標準器は記録しません（校正会社の成績書を「写真・書類」に添付してください）</span></div>'
          : '<div class="field span-6"><label>校正に使った標準器 <span class="sub">（前回校正日の校正で使ったもの）</span></label><div data-std-host></div></div>'}
        ${(cat?.fields || []).length ? `<div class="form-sep">${esc(cat.name)} の項目 <button type="button" class="btn btn--ghost btn--small" data-edit-cat title="この分類の項目を編集"><i class="fa-solid fa-shapes"></i>項目を編集</button></div>` : ''}
        ${(cat?.fields || []).map((f) => `<div class="field ${f.type === 'longtext' ? 'span-6' : 'span-2'}"><label>${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</label>
          ${KK.fieldTypes.get(f.type)?.input(f, v.props?.[f.key] ?? '', ctxAsset(v)) || ''}</div>`).join('')}
        <div class="field span-6"><label>備考</label><textarea class="input input--area" data-field="note" rows="2">${esc(v.note)}</textarea></div>
        ${ctx.mode === 'new' ? `<div class="field span-6"><label>写真・書類</label>
          <label class="drop" data-form-drop><i class="fa-solid fa-image"></i> Ctrl+V で貼り付け／ドラッグ＆ドロップ／<u>ファイルを選ぶ</u><input type="file" multiple hidden accept="image/*,application/pdf"></label>
          <div class="pending">${ctx.pending.map((f, i) => `<span class="pending__item"><i class="fa-solid fa-paperclip"></i>${esc(f.name)}<button type="button" class="btn btn--ghost btn--icon" data-unpend="${i}" title="外す"><i class="fa-solid fa-xmark"></i></button></span>`).join('')}</div></div>` : ''}
      </form>`;
  }

  function footHtml() {
    const isNew = ctx.mode === 'new';
    return `<span class="sub foot__hint">Enter で次の欄／Shift+Enter で前／Ctrl+Enter で${isNew ? '登録' : '保存'}</span>
      ${isNew ? `<label class="chk"><input type="checkbox" data-continue ${ctx.cont ? 'checked' : ''}>続けて登録</label>` : ''}
      <button type="button" class="btn" data-close-form>閉じる</button>
      <button type="button" class="btn btn--primary" data-submit><i class="fa-solid fa-check"></i>${isNew ? '登録する' : '保存する'}</button>`;
  }

  /** フォームから値を読む */
  function read() {
    const f = win.querySelector('form');
    const v = {};
    f.querySelectorAll('[data-field]').forEach((el) => {
      v[el.dataset.field] = el.hasAttribute('data-date') ? KK.readDateInput(el) : el.value;
    });
    const props = {};
    const cat = KK.repo.categories.get(v.categoryId);
    (cat?.fields || []).forEach((fd) => {
      const el = f.querySelector(`[data-prop="${CSS.escape(fd.key)}"]`);
      if (el) props[fd.key] = KK.fieldTypes.get(fd.type)?.read(el) ?? el.value;
    });
    v.props = props;
    v.range = { min: v.rangeMin ?? '', max: v.rangeMax ?? '', unit: null };
    delete v.rangeMin; delete v.rangeMax;
    // 外部校正では標準器を記録しない
    v.calStandards = I.calType(ctxAsset(v)).value === 'external' ? [] : ctx.std.selected.slice();
    if (v.parentId) v.locationId = KK.repo.assets.get(v.parentId)?.locationId || v.locationId;
    if (v.intervalMonths !== '') v.intervalMonths = String(v.intervalMonths).normalize('NFKC');
    return v;
  }

  function showErrors(err) {
    ctx.std.error = err.calStandards || '';
    stdCtl && stdCtl.redraw();
    win.querySelectorAll('.field-error').forEach((x) => { if (!x.closest('[data-std-host]')) x.remove(); });
    win.querySelectorAll('.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
    Object.entries(err).forEach(([k, msg]) => {
      const sel = k.startsWith('prop:') ? `[data-prop="${CSS.escape(k.slice(5))}"]` : `[data-field="${k}"]`;
      const el = win.querySelector(sel); if (!el) return;
      el.classList.add('is-invalid');
      el.closest('.field').insertAdjacentHTML('beforeend', `<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i>${esc(msg)}</span>`);
    });
    const first = win.querySelector('.is-invalid') || (err.calStandards ? win.querySelector('[data-std-toggle]') : null);
    return first;
  }

  /** 値を保ったまま描き直す（分類や親を変えたとき） */
  function rerender(v) {
    const focusKey = document.activeElement?.dataset?.field;
    win.querySelector('.floating__body').innerHTML = bodyHtml(v);
    mountStd();
    applyPlaceholders(v);
    win.querySelectorAll('[data-num]').forEach(formatNum);
    if (focusKey) win.querySelector(`[data-field="${focusKey}"]`)?.focus();
  }

  /** 分類の項目：空欄なら型式の値を placeholder に出す */
  function applyPlaceholders(v) {
    const inh = inheritedCtx(v);
    const cat = KK.repo.categories.get(v.categoryId);
    (cat?.fields || []).forEach((f) => {
      const el = win.querySelector(`[data-prop="${CSS.escape(f.key)}"]`); if (!el || el.tagName === 'SELECT' || el.hasAttribute('data-date')) return;
      const r = I.prop(inh, f.key);
      if (!r.value) return;
      const text = f.type === 'number' ? KK.num.format(r.value, KK.num.fieldDigits(f, ctxAsset(v))).text : r.value;
      el.placeholder = `${I.SOURCE[r.source]}：${text}`;
    });
  }

  let stdCtl = null;
  function mountStd() {
    const host = win.querySelector('[data-std-host]');
    if (!host) { stdCtl = null; return; }
    stdCtl = KK.stdPicker.mount(host, ctx.std, {
      getDate: () => KK.readDateInput(win.querySelector('[data-field="lastCalDate"]')),
      selfId: ctx.id
    });
  }

  async function submit() {
    const bad = KK.combo.unmatched(win);
    if (bad) { bad.focus(); KK.toast('一覧にない名前があります。候補から選ぶか、「新しく登録」を選んでください', { kind: 'warn' }); return; }
    const v = read();
    const err = R.validate(v, ctx.id);
    const first = showErrors(err);
    if (first) { (first.querySelector?.('input') || first).focus(); KK.toast('入力を確認してください', { kind: 'warn' }); return; }
    try {
      const saved = await KK.assetService.save(v, ctx.id);
      for (const f of ctx.pending) {
        await KK.repo.attachments.add({ id: KK.util.uid('f'), assetId: saved.id, name: f.name || '貼り付け.png', type: f.type, size: f.size, blob: f, createdAt: KK.util.nowIso() });
      }
      const label = `${R.category(saved).name} ${R.identity(saved)}`;
      KK.bus.emit('asset:saved', { id: saved.id });
      if (ctx.mode === 'new' && saved.parentId) KK.state.toggleExpanded(KK.repo.assets.topOf(saved.id).id, true);
      KK.repo.settings.set('lastCategoryId', saved.categoryId).catch(() => {});
      KK.ledger.render();
      if (ctx.mode === 'new' && ctx.cont) {
        KK.toast(`${label} を登録しました（続けて入力できます）`);
        ctx.pending = [];
        rerender({ ...v, mgmtNo: '', serial: '', props: {}, note: '' });
        KK.flash(win.querySelector('.floating__head'));
        win.querySelector(`[data-field="${KK.identityKeys.get(R.category(saved).identityKey)?.required[0] || 'mgmtNo'}"]`)?.focus();
      } else {
        KK.toast(`${label} を${ctx.mode === 'new' ? `${KK.repo.locations.path(saved.locationId)} に登録` : '保存'}しました`);
        win.close();
        KK.state.set({ selectedId: saved.id });
      }
    } catch (e) {
      KK.toast(`保存できませんでした：${e.message}`, { kind: 'danger' });
    }
  }

  function open(v, mode, id, title, standards = []) {
    ctx = { mode, id: id || null, pending: [], cont: ctx?.cont || false, std: { selected: standards.slice(), open: false, query: '', error: '' } };
    win = KK.floating({ id: 'assetForm', title, icon: mode === 'new' ? 'fa-plus' : 'fa-pen', width: 600, body: '', foot: footHtml() });
    win.querySelector('.floating__body').innerHTML = bodyHtml(v);
    mountStd();
    applyPlaceholders(v);
    KK.wireFormAssist(win);
    KK.combo.wire(win, {
      model: { items: () => KK.directory.modelItems(read().categoryId), create: (t) => KK.directory.createModel(read().categoryId, t, { makerId: read().makerId || null }) },
      maker: { items: () => KK.directory.companyItems('maker'), create: (t) => KK.directory.createCompany(t) },
      calibrator: { items: () => KK.directory.companyItems('calibrator'), create: (t) => KK.directory.createCompany(t) }
    });
    wire();
    setTimeout(() => (mode === 'new' && v.categoryId ? win.querySelector(`[data-field="${KK.identityKeys.get(KK.repo.categories.get(v.categoryId)?.identityKey)?.required[0] || 'mgmtNo'}"]`) : win.querySelector('[data-field="categoryId"]'))?.focus(), 0);
  }

  function wire() {
    const live = KK.util.debounce(() => {
      const v = read(); const err = R.validate(v, ctx.id);
      const pick = {}; ['mgmtNo', 'serial'].forEach((k) => { if (err[k] && (v[k] || '').trim()) pick[k] = err[k]; });
      win.querySelectorAll('[data-field="mgmtNo"],[data-field="serial"]').forEach((el) => { el.classList.remove('is-invalid'); el.closest('.field').querySelector('.field-error')?.remove(); });
      Object.entries(pick).forEach(([k, msg]) => { const el = win.querySelector(`[data-field="${k}"]`); el.classList.add('is-invalid'); el.closest('.field').insertAdjacentHTML('beforeend', `<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i>${esc(msg)}</span>`); });
    }, 250);
    win.addEventListener('input', (e) => { if (['mgmtNo', 'serial'].includes(e.target.dataset.field)) live(); });
    // 数値：欄を出たら桁をそろえる。桁を超えていれば警告だけ出し、丸めない
    win.addEventListener('focusout', (e) => { if (e.target.matches('[data-num]')) formatNum(e.target); });
    win.addEventListener('change', (e) => {
      const k = e.target.dataset.field;
      if (['categoryId', 'parentId', 'locationId', 'resolution', 'unit', 'modelId', 'calType'].includes(k)) {
        const v = read();
        if (k === 'categoryId' && v.modelId && KK.repo.models.get(v.modelId)?.categoryId !== v.categoryId) v.modelId = '';
        if (k === 'parentId' && v.parentId) v.locationId = KK.repo.assets.get(v.parentId).locationId;
        rerender(v);
      }
      if (e.target.matches('[data-continue]')) ctx.cont = e.target.checked;
      if (e.target.closest('[data-field="lastCalDate"]')) stdCtl && stdCtl.redraw();
      if (e.target.type === 'file') { addPending(e.target.files); e.target.value = ''; }
    });
    win.addEventListener('click', (e) => {
      if (e.target.closest('[data-submit]')) submit();
      else if (e.target.closest('[data-close-form]')) win.close();
      else if (e.target.closest('[data-unpend]')) { ctx.pending.splice(Number(e.target.closest('[data-unpend]').dataset.unpend), 1); rerender(read()); }
      else if (e.target.closest('[data-edit-cat]')) KK.masters.openCategories(read().categoryId);
    });
    win.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); submit(); } });
    win.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length && ctx.mode === 'new') { e.preventDefault(); addPending(files); }
    });
    win.addEventListener('dragover', (e) => { if (e.target.closest('[data-form-drop]')) e.preventDefault(); });
    win.addEventListener('drop', (e) => { if (e.target.closest('[data-form-drop]')) { e.preventDefault(); addPending(e.dataTransfer.files); } });
  }
  function formatNum(input) {
    const field = input.closest('.field');
    field.querySelector('.field-warn')?.remove();
    const d = input.dataset.digits === '' ? null : Number(input.dataset.digits);
    const r = KK.num.format(input.value, d);
    if (!r.valid) return;
    if (r.text !== input.value) { input.value = r.text; KK.flash(input); }
    if (r.excess) field.insertAdjacentHTML('beforeend', `<span class="field-warn"><i class="fa-solid fa-triangle-exclamation"></i>${esc(KK.num.excessText(d))}</span>`);
  }
  function addPending(files) {
    const ok = [...files].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (!ok.length) { KK.toast('画像または PDF を選んでください', { kind: 'warn' }); return; }
    ctx.pending.push(...ok);
    rerender(read());
    KK.flash(win.querySelector('.pending'));
  }

  // ── 開き方 ──
  KK.assetForm = {
    openNew(preset = {}) {
      const st = KK.state.get();
      const parent = preset.parentId && KK.repo.assets.get(preset.parentId);
      const siblings = parent ? KK.repo.assets.children(parent.id) : [];
      const lastCat = KK.repo.settings.get('lastCategoryId', '');
      const categoryId = preset.categoryId || siblings[siblings.length - 1]?.categoryId || (KK.repo.categories.get(lastCat) ? lastCat : KK.repo.categories.list()[0]?.id);
      const locationId = parent ? parent.locationId : (st.locationId !== 'ALL' ? st.locationId : '');
      if (!KK.repo.categories.list().length) { KK.toast('先に「分類と項目」で分類を作ってください', { kind: 'warn' }); KK.masters.openCategories(); return; }
      if (!KK.repo.locations.list().length) { KK.toast('先に設置先を作ってください', { kind: 'warn' }); KK.masters.openLocations(); return; }
      open({ categoryId, locationId, parentId: parent?.id || '', state: 'active', props: {}, mgmtNo: '', serial: '', model: '', maker: preset.maker || '', note: '', lastCalDate: '' },
        'new', null, parent ? `${R.identity(parent)} の構成に追加` : '個体を登録');
    },
    openEdit(id) {
      const a = KK.repo.assets.get(id); if (!a) return;
      open({ ...a, parentId: a.parentId || '', intervalMonths: a.intervalMonths ?? '' }, 'edit', id, `${R.category(a).name} ${R.identity(a)} を編集`,
        KK.trace.currentCalEvent(a)?.standards || []);
    },
    openCopy(id) {
      const a = KK.repo.assets.get(id); if (!a) return;
      open({ ...a, mgmtNo: '', serial: '', lastCalDate: a.lastCalDate, parentId: a.parentId || '', intervalMonths: a.intervalMonths ?? '', props: { ...a.props } }, 'new', null, `${R.identity(a)} を複製して登録`,
        KK.trace.currentCalEvent(a)?.standards || []);
    }
  };
})();
