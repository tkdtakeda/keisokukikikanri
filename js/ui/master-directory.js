/* ── 会社・型式の画面 ──
   会社：一覧＋編集（担当者は複数、追加の項目は利用者が決める）と、名前を押すと開く会社の小窓。
   型式：分類ごとの一覧＋編集（型番は空欄可、測定範囲・最小表示量・分類の項目・メーカー）。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, uid, norm } = KK.util;
  const I = KK.inherit;
  const D = KK.directory;

  const showAssets = (query) => { KK.state.set({ query, searchScope: 'all', locationId: 'ALL', statusFilter: 'all', selectedId: null }); KK.toast(`「${query}」で台帳を絞り込みました`, { kind: 'info' }); };
  const tel = (p) => (p ? `<a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a>` : '');
  const mail = (m) => (m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : '');
  const companyFields = () => KK.repo.settings.get('companyFields', []);

  // ════ 会社の小窓（詳細から開く） ════
  function openCard(id) {
    const c = KK.repo.companies.get(id); if (!c) return;
    const u = D.companyUsage(id);
    const row = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '');
    const w = KK.floating({ id: 'companyCard', title: c.name, icon: 'fa-building', width: 440, body: `
      <div class="company-card">
        <div class="company-card__roles">
          <span class="badge badge--muted"><i class="fa-solid fa-industry"></i>メーカーとして ${u.maker} 台</span>
          <span class="badge badge--muted"><i class="fa-solid fa-truck-fast"></i>校正会社として ${u.calibrator} 台</span>
          ${u.models ? `<span class="badge badge--muted"><i class="fa-solid fa-tag"></i>型式 ${u.models} 件</span>` : ''}</div>
        <dl class="props">${row('略称', esc(c.short))}${row('代表電話', tel(c.phone))}${row('住所', esc(c.address))}
          ${row('URL', c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` : '')}${row('認定', esc(c.accreditation))}
          ${companyFields().map((f) => row(f.label, KK.fieldTypes.get(f.type)?.format(c.props?.[f.key] ?? '', f) ?? esc(c.props?.[f.key]))).join('')}
          ${row('備考', esc(c.note).replace(/\n/g, '<br>'))}</dl>
        <h4 class="trace__label">担当者</h4>
        ${(c.contacts || []).length ? `<ul class="contact-list">${c.contacts.map((p) => `<li><b>${esc(p.name)}</b> <span class="sub">${esc(p.dept)}</span>
          <div>${p.phone ? `<i class="fa-solid fa-phone"></i> ${tel(p.phone)}` : ''} ${p.email ? `<i class="fa-solid fa-envelope"></i> ${mail(p.email)}` : ''}</div>${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}</li>`).join('')}</ul>` : '<div class="sub">まだ登録されていません</div>'}
      </div>`,
      foot: '<button class="btn" data-show><i class="fa-solid fa-filter"></i>この会社の機器を表示</button><button class="btn btn--primary" data-edit><i class="fa-solid fa-pen"></i>編集</button>' });
    w.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) { w.close(); openCompanies(id); }
      if (e.target.closest('[data-show]')) showAssets(c.name);
    });
  }

  // ════ 会社の一覧・編集 ════
  let coWin = null, coEdit = null, coQuery = '', editFields = false;

  function coListHtml() {
    const q = norm(coQuery);
    const list = KK.repo.companies.list().filter((c) => !q || norm(`${c.name} ${c.short} ${(c.contacts || []).map((p) => p.name).join(' ')}`).includes(q));
    return `<label class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" data-co-q value="${esc(coQuery)}" placeholder="会社・担当者で探す"></label>
      <div class="mlist__scroll">${list.map((c) => { const u = D.companyUsage(c.id); return `<button class="mlist__item" data-co="${c.id}" aria-current="${coEdit?.id === c.id}">
        <span>${esc(c.name)}</span><span class="sub" title="メーカーとして／校正会社として">${u.maker}／${u.calibrator}</span></button>`; }).join('') || '<div class="sub">該当する会社はありません</div>'}</div>
      <button class="btn btn--ghost mlist__add" data-co-new><i class="fa-solid fa-plus"></i>会社を追加</button>`;
  }

  function coEditorHtml() {
    if (!coEdit) return '<div class="empty">左の一覧から会社を選んでください</div>';
    const c = coEdit; const u = KK.repo.companies.get(c.id) ? D.companyUsage(c.id) : { maker: 0, calibrator: 0, models: 0, direct: 0 };
    const f = (k, label, span, extra = '') => `<div class="field span-${span}"><label>${label}</label><input class="input" data-co-f="${k}" value="${esc(c[k] || '')}" ${extra}></div>`;
    const fields = companyFields();
    return `
      <div class="form-grid" data-co-form>
        <div class="field span-4"><label>会社名<span class="req">*</span></label><input class="input" data-co-f="name" value="${esc(c.name)}"></div>
        ${f('short', '略称', 2)}${f('phone', '代表電話', 2, 'inputmode="tel"')}${f('url', 'URL', 4)}${f('address', '住所', 6)}
        ${f('accreditation', '認定（JCSS 登録番号など）', 6)}
        ${fields.map((fd) => `<div class="field span-${fd.type === 'longtext' ? 6 : 3}"><label>${esc(fd.label)}</label>${KK.fieldTypes.get(fd.type)?.input(fd, c.props?.[fd.key] ?? '') || ''}</div>`).join('')}
        <div class="field span-6"><label>備考</label><textarea class="input input--area" data-co-f="note" rows="2">${esc(c.note || '')}</textarea></div>
        <div class="form-sep">担当者 <button type="button" class="btn btn--ghost btn--small" data-ct-add><i class="fa-solid fa-plus"></i>担当者を追加</button></div>
        <div class="span-6">${(c.contacts || []).length ? `<table class="mini-grid"><thead><tr><th>氏名</th><th>部署</th><th>電話</th><th>メール</th><th>備考</th><th></th></tr></thead><tbody>
          ${c.contacts.map((p, i) => `<tr data-ci="${i}">${['name', 'dept', 'phone', 'email', 'note'].map((k) => `<td><input class="input" data-ct="${k}" value="${esc(p[k] || '')}"></td>`).join('')}
            <td><button class="btn btn--ghost btn--icon" data-ct-del title="外す"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('')}</tbody></table>` : '<div class="sub">まだ登録されていません</div>'}</div>
        <div class="form-sep">追加の項目（すべての会社に共通） <button type="button" class="btn btn--ghost btn--small" data-cf-toggle>${editFields ? '閉じる' : '<i class="fa-solid fa-shapes"></i>項目を編集'}</button></div>
        ${editFields ? `<div class="span-6"><table class="mini-grid"><tbody>${fields.map((fd, i) => `<tr data-cfi="${i}"><td><input class="input" data-cf="label" value="${esc(fd.label)}"></td>
            <td><select class="input" data-cf="type">${KK.fieldTypes.list().filter((t) => t.id !== 'number').map((t) => `<option value="${t.id}"${t.id === fd.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></td>
            <td><button class="btn btn--ghost btn--icon" data-cf-del title="項目を外す"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('')}</tbody></table>
          <button class="btn btn--ghost" data-cf-add><i class="fa-solid fa-plus"></i>項目を追加</button> <button class="btn" data-cf-save><i class="fa-solid fa-check"></i>項目を保存</button>
          <div class="hint">例：取引先コード・支払条件・校正の納期。項目を外しても入れた値は残ります。</div></div>` : ''}
      </div>
      <div class="editor-foot">
        <button class="btn btn--ghost" data-co-del ${u.direct ? 'disabled' : ''} title="${u.direct ? '機器・型式から使われているため削除できません' : '削除'}"><i class="fa-solid fa-trash-can"></i>会社を削除</button>
        <span class="sub">${u.direct ? `機器・型式から ${u.direct} か所で使用中のため削除できません` : ''}</span>
        <span class="spacer"></span>
        <button class="btn" data-co-show ${KK.repo.companies.get(c.id) ? '' : 'disabled'}><i class="fa-solid fa-filter"></i>機器を表示</button>
        <button class="btn btn--primary" data-co-save><i class="fa-solid fa-check"></i>会社を保存</button>
      </div>`;
  }

  function coRead() {
    const root = coWin.querySelector('[data-co-form]'); if (!root) return;
    root.querySelectorAll('[data-co-f]').forEach((el) => { coEdit[el.dataset.coF] = el.value.trim(); });
    root.querySelectorAll('[data-ci]').forEach((tr) => {
      const p = coEdit.contacts[Number(tr.dataset.ci)];
      tr.querySelectorAll('[data-ct]').forEach((el) => { p[el.dataset.ct] = el.value.trim(); });
    });
    coEdit.props = { ...(coEdit.props || {}) };
    companyFields().forEach((fd) => { const el = root.querySelector(`[data-prop="${CSS.escape(fd.key)}"]`); if (el) coEdit.props[fd.key] = KK.fieldTypes.get(fd.type)?.read(el) ?? el.value; });
  }
  function coRender() {
    coWin.querySelector('.mlist').innerHTML = coListHtml();
    coWin.querySelector('.meditor').innerHTML = coEditorHtml();
  }
  function coSelect(id) {
    const c = KK.repo.companies.get(id);
    coEdit = c ? JSON.parse(JSON.stringify({ contacts: [], props: {}, ...c })) : null;
    coRender();
  }
  async function coSave() {
    coRead();
    if (!coEdit.name) { KK.toast('会社名を入力してください', { kind: 'warn' }); return; }
    const dup = KK.repo.companies.list().find((x) => x.id !== coEdit.id && norm(x.name) === norm(coEdit.name));
    if (dup) { KK.toast(`会社「${dup.name}」は既にあります`, { kind: 'warn' }); return; }
    const before = KK.repo.companies.get(coEdit.id);
    const saved = { ...coEdit, contacts: coEdit.contacts.filter((p) => p.name || p.phone || p.email), sample: before ? before.sample : false, updatedAt: KK.util.nowIso() };
    await KK.repo.companies.save(saved);
    KK.toast(`会社「${saved.name}」を保存しました`, before ? { undo: () => KK.repo.companies.save(before) } : {});
    if (!coWin) return;
    coSelect(saved.id); KK.flash(coWin.querySelector('.editor-foot'));
  }

  function openCompanies(selectId) {
    coQuery = ''; editFields = false;
    coWin = KK.floating({ id: 'coWin', title: '会社', icon: 'fa-building', width: 900,
      body: '<div class="master"><nav class="mlist"></nav><div class="meditor"></div></div>', onClose: () => { coWin = null; coEdit = null; } });
    coSelect(selectId || KK.repo.companies.list()[0]?.id);
    coWin.addEventListener('input', (e) => { if (e.target.matches('[data-co-q]')) { coQuery = e.target.value; coWin.querySelector('.mlist').innerHTML = coListHtml(); const q = coWin.querySelector('[data-co-q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
    coWin.addEventListener('click', async (e) => {
      const t = e.target;
      const it = t.closest('[data-co]'); if (it) { coSelect(it.dataset.co); return; }
      if (t.closest('[data-co-new]')) { coEdit = { id: uid('co'), name: '', short: '', phone: '', address: '', url: '', accreditation: '', note: '', contacts: [], props: {} }; coRender(); coWin.querySelector('[data-co-f="name"]').focus(); return; }
      if (!coEdit) return;
      if (t.closest('[data-ct-add]')) { coRead(); coEdit.contacts.push({ name: '', dept: '', phone: '', email: '', note: '' }); coRender(); coWin.querySelector('[data-ci]:last-child [data-ct="name"]')?.focus(); }
      else if (t.closest('[data-ct-del]')) { coRead(); coEdit.contacts.splice(Number(t.closest('[data-ci]').dataset.ci), 1); coRender(); }
      else if (t.closest('[data-cf-toggle]')) { coRead(); editFields = !editFields; coRender(); }
      else if (t.closest('[data-cf-add]')) { coRead(); await KK.repo.settings.set('companyFields', [...readFieldDefs(), { key: uid('cp'), label: '', type: 'text' }]); coRender(); coWin.querySelector('[data-cfi]:last-child [data-cf="label"]')?.focus(); }
      else if (t.closest('[data-cf-del]')) { coRead(); const defs = readFieldDefs(); defs.splice(Number(t.closest('[data-cfi]').dataset.cfi), 1); await KK.repo.settings.set('companyFields', defs); coRender(); }
      else if (t.closest('[data-cf-save]')) { coRead(); await KK.repo.settings.set('companyFields', readFieldDefs().filter((fd) => fd.label)); editFields = false; coRender(); KK.toast('会社の項目を保存しました'); }
      else if (t.closest('[data-co-save]')) coSave();
      else if (t.closest('[data-co-show]')) showAssets(coEdit.name);
      else if (t.closest('[data-co-del]')) {
        const before = KK.repo.companies.get(coEdit.id);
        if (before) await KK.repo.commit([KK.repo.del('companies', before.id)], 'companies');
        coEdit = null; if (coWin) coRender();
        if (before) KK.toast(`会社「${before.name}」を削除しました`, { kind: 'warn', undo: () => KK.repo.companies.save(before) });
      }
    });
    coWin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); coSave(); } });
    KK.wireFormAssist(coWin);
  }
  function readFieldDefs() {
    const defs = companyFields().map((x) => ({ ...x }));
    coWin.querySelectorAll('[data-cfi]').forEach((tr) => {
      const d = defs[Number(tr.dataset.cfi)];
      tr.querySelectorAll('[data-cf]').forEach((el) => { d[el.dataset.cf] = el.value.trim(); });
    });
    return defs;
  }

  // ════ 型式の一覧・編集 ════
  let mdWin = null, mdEdit = null, mdQuery = '';

  function mdListHtml() {
    const q = norm(mdQuery);
    const groups = KK.repo.categories.list().map((c) => {
      const list = KK.repo.models.forCategory(c.id).filter((m) => !q || norm(`${m.modelNo} ${m.name} ${I.companyName(m.makerId)}`).includes(q));
      return list.length ? `<div class="mlist__label">${esc(c.name)}</div>` + list.map((m) => `<button class="mlist__item" data-md="${m.id}" aria-current="${mdEdit?.id === m.id}">
          <span>${esc(I.modelLabel(m))}</span><span class="sub">${D.modelUsage(m.id)}</span></button>`).join('') : '';
    }).join('');
    return `<label class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" data-md-q value="${esc(mdQuery)}" placeholder="型番・名称・メーカーで探す"></label>
      <div class="mlist__scroll">${groups || '<div class="sub">型式はまだありません</div>'}</div>
      <button class="btn btn--ghost mlist__add" data-md-new><i class="fa-solid fa-plus"></i>型式を追加</button>`;
  }

  function mdEditorHtml() {
    if (!mdEdit) return '<div class="empty">左の一覧から型式を選んでください</div>';
    const m = mdEdit; const cat = KK.repo.categories.get(m.categoryId);
    const used = KK.repo.models.get(m.id) ? D.modelUsage(m.id) : 0;
    const ctx = { categoryId: m.categoryId, resolution: m.resolution, unit: m.unit, modelId: null, props: {} };
    const unitLabel = KK.units.label(m.unit ?? cat?.unit ?? '');
    return `
      <div class="form-grid" data-md-form>
        <div class="field span-3"><label>分類<span class="req">*</span></label><select class="input" data-md-f="categoryId">${KK.repo.categories.list().map((c) => `<option value="${c.id}"${c.id === m.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field span-3"><label>メーカー</label>${KK.combo.html({ name: 'mdMaker', field: 'makerId', id: m.makerId, label: I.companyName(m.makerId), placeholder: '会社名で探す' })}</div>
        <div class="field span-3"><label>型番 <span class="sub">（空欄可）</span></label><input class="input" data-md-f="modelNo" value="${esc(m.modelNo || '')}" placeholder="例：SM-25D"></div>
        <div class="field span-3"><label>名称</label><input class="input" data-md-f="name" value="${esc(m.name || '')}" placeholder="例：デジタル外側マイクロ"></div>
        <div class="field span-2"><label>測定範囲</label><div class="range-row"><input class="input" data-md-f="rangeMin" inputmode="decimal" value="${esc(m.range?.min ?? '')}" placeholder="下限"><span>〜</span>
          <input class="input" data-md-f="rangeMax" inputmode="decimal" value="${esc(m.range?.max ?? '')}" placeholder="上限"><span class="unit">${esc(unitLabel === KK.units.NONE_LABEL ? '' : unitLabel)}</span></div></div>
        <div class="field span-2"><label>測定値の単位</label><select class="input" data-md-f="unit">${KK.units.options(m.unit ?? null, { inherit: `分類に従う（${KK.units.label(cat?.unit ?? '')}）` })}</select></div>
        <div class="field span-2"><label>最小表示量</label><input class="input" data-md-f="resolution" inputmode="decimal" value="${esc(m.resolution || '')}" placeholder="${esc(cat?.resolution || '0.001')}">
          <span class="hint">空欄なら分類の ${esc(cat?.resolution || '—')}</span></div>
        ${(cat?.fields || []).length ? `<div class="form-sep">${esc(cat.name)} の項目（この型式の機器に引き継ぐ）</div>` : ''}
        ${(cat?.fields || []).map((f) => `<div class="field ${f.type === 'longtext' ? 'span-6' : 'span-2'}"><label>${esc(f.label)}</label>${KK.fieldTypes.get(f.type)?.input(f, m.props?.[f.key] ?? '', ctx) || ''}</div>`).join('')}
        <div class="field span-6"><label>備考</label><textarea class="input input--area" data-md-f="note" rows="2">${esc(m.note || '')}</textarea></div>
      </div>
      <div class="editor-foot">
        <button class="btn btn--ghost" data-md-del ${used ? 'disabled' : ''} title="${used ? `${used} 台が使っているため削除できません` : '削除'}"><i class="fa-solid fa-trash-can"></i>型式を削除</button>
        <span class="sub">${used ? `${used} 台が使用中` : ''}</span><span class="spacer"></span>
        <button class="btn" data-md-show ${used ? '' : 'disabled'}><i class="fa-solid fa-filter"></i>機器を表示</button>
        <button class="btn btn--primary" data-md-save><i class="fa-solid fa-check"></i>型式を保存</button>
      </div>`;
  }

  function mdRead() {
    const root = mdWin.querySelector('[data-md-form]'); if (!root) return;
    const v = {}; root.querySelectorAll('[data-md-f]').forEach((el) => { v[el.dataset.mdF] = el.value.trim(); });
    mdEdit.categoryId = v.categoryId; mdEdit.modelNo = v.modelNo; mdEdit.name = v.name; mdEdit.note = v.note;
    mdEdit.unit = v.unit === '__inherit' ? null : v.unit;
    mdEdit.resolution = KK.num.clean(v.resolution) || (v.resolution ? v.resolution : null);
    const mn = KK.num.clean(v.rangeMin) ?? v.rangeMin, mx = KK.num.clean(v.rangeMax) ?? v.rangeMax;
    mdEdit.range = mn || mx ? { min: mn || '', max: mx || '', unit: null } : null;
    mdEdit.makerId = root.querySelector('[data-field="makerId"]')?.value || null;
    const cat = KK.repo.categories.get(mdEdit.categoryId); const props = {};
    (cat?.fields || []).forEach((f) => { const el = root.querySelector(`[data-prop="${CSS.escape(f.key)}"]`); if (el) props[f.key] = KK.fieldTypes.get(f.type)?.read(el) ?? el.value; });
    mdEdit.props = { ...(mdEdit.props || {}), ...props };
  }
  function mdRender() {
    mdWin.querySelector('.mlist').innerHTML = mdListHtml();
    mdWin.querySelector('.meditor').innerHTML = mdEditorHtml();
  }
  function mdSelect(id) { const m = KK.repo.models.get(id); mdEdit = m ? JSON.parse(JSON.stringify(m)) : null; mdRender(); }
  async function mdSave() {
    if (KK.combo.unmatched(mdWin)) { KK.toast('メーカーが一覧にありません。候補から選ぶか「新しく登録」を選んでください', { kind: 'warn' }); return; }
    mdRead();
    if (!mdEdit.modelNo && !mdEdit.name) { KK.toast('型番か名称のどちらかを入力してください', { kind: 'warn' }); return; }
    if (mdEdit.resolution && !(Number(KK.num.clean(mdEdit.resolution)) > 0)) { KK.toast('最小表示量は 0.001 のような正の数で入力してください', { kind: 'warn' }); return; }
    if (mdEdit.range && ((mdEdit.range.min && KK.num.clean(mdEdit.range.min) === null) || (mdEdit.range.max && KK.num.clean(mdEdit.range.max) === null))) { KK.toast('測定範囲は数値で入力してください', { kind: 'warn' }); return; }
    const dup = mdEdit.modelNo && KK.repo.models.list().find((x) => x.id !== mdEdit.id && x.categoryId === mdEdit.categoryId && norm(x.modelNo) === norm(mdEdit.modelNo));
    if (dup) { KK.toast(`型番「${mdEdit.modelNo}」はこの分類に既にあります`, { kind: 'warn' }); return; }
    const before = KK.repo.models.get(mdEdit.id);
    const saved = { ...mdEdit, sample: before ? before.sample : false, updatedAt: KK.util.nowIso() };
    await KK.repo.models.save(saved);
    KK.toast(`型式「${I.modelLabel(saved)}」を保存しました${D.modelUsage(saved.id) ? `（${D.modelUsage(saved.id)} 台に反映）` : ''}`, before ? { undo: () => KK.repo.models.save(before) } : {});
    if (!mdWin) return;
    mdSelect(saved.id); KK.flash(mdWin.querySelector('.editor-foot'));
  }

  function openModels(selectId, preset = {}) {
    mdQuery = '';
    mdWin = KK.floating({ id: 'mdWin', title: '型式', icon: 'fa-tag', width: 900,
      body: '<div class="master"><nav class="mlist"></nav><div class="meditor"></div></div>', onClose: () => { mdWin = null; mdEdit = null; } });
    const firstShown = KK.repo.categories.list().map((c) => KK.repo.models.forCategory(c.id)[0]).find(Boolean);
    mdSelect(selectId || firstShown?.id);
    if (!selectId && preset.categoryId && !mdEdit) { mdEdit = { id: uid('md'), categoryId: preset.categoryId, modelNo: '', name: '', makerId: null, range: null, unit: null, resolution: null, props: {}, note: '' }; mdRender(); }
    KK.combo.wire(mdWin, { mdMaker: { items: () => D.companyItems('maker'), create: (t) => D.createCompany(t) } });
    mdWin.addEventListener('input', (e) => { if (e.target.matches('[data-md-q]')) { mdQuery = e.target.value; mdWin.querySelector('.mlist').innerHTML = mdListHtml(); const q = mdWin.querySelector('[data-md-q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
    mdWin.addEventListener('change', (e) => { if (e.target.dataset.mdF === 'categoryId' || e.target.dataset.mdF === 'unit' || e.target.dataset.mdF === 'resolution') { mdRead(); mdRender(); } });
    mdWin.addEventListener('click', async (e) => {
      const t = e.target;
      const it = t.closest('[data-md]'); if (it) { mdSelect(it.dataset.md); return; }
      if (t.closest('[data-md-new]')) { mdEdit = { id: uid('md'), categoryId: mdEdit?.categoryId || KK.repo.categories.list()[0]?.id, modelNo: '', name: '', makerId: null, range: null, unit: null, resolution: null, props: {}, note: '' }; mdRender(); mdWin.querySelector('[data-md-f="modelNo"]').focus(); return; }
      if (!mdEdit) return;
      if (t.closest('[data-md-save]')) mdSave();
      else if (t.closest('[data-md-show]')) showAssets(mdEdit.modelNo || mdEdit.name);
      else if (t.closest('[data-md-del]')) {
        const before = KK.repo.models.get(mdEdit.id);
        if (before) await KK.repo.commit([KK.repo.del('models', before.id)], 'models');
        mdEdit = null; if (mdWin) mdRender();
        if (before) KK.toast(`型式「${I.modelLabel(before)}」を削除しました`, { kind: 'warn', undo: () => KK.repo.models.save(before) });
      }
    });
    mdWin.addEventListener('focusout', (e) => {
      if (!e.target.matches('[data-num]')) return;
      const d = e.target.dataset.digits === '' ? null : Number(e.target.dataset.digits);
      const r = KK.num.format(e.target.value, d); if (r.valid && r.text !== e.target.value) { e.target.value = r.text; KK.flash(e.target); }
    });
    mdWin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); mdSave(); } });
    KK.wireFormAssist(mdWin);
  }

  KK.directoryUi = { openCard, openCompanies, openModels };
})();
