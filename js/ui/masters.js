/* ── マスタの編集：分類と項目・設置先 ──
   どちらも非モーダルの窓。開いたまま台帳を操作できる。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, uid } = KK.util;

  // ════ 分類と項目 ════
  let catWin = null;
  let editing = null; // 編集中の分類（写し）

  function catListHtml() {
    return KK.kinds.list().map((k) => {
      const cats = KK.repo.categories.list().filter((c) => c.kind === k.id);
      return `<div class="mlist__group"><div class="mlist__label"><i class="fa-solid ${k.icon}"></i>${esc(k.label)}</div>
        ${cats.map((c) => `<button class="mlist__item" data-cat="${c.id}" aria-current="${editing?.id === c.id}">${esc(c.name)}<span class="sub">${KK.repo.categories.usage(c.id)}</span></button>`).join('')}</div>`;
    }).join('') + '<button class="btn btn--ghost mlist__add" data-new-cat><i class="fa-solid fa-plus"></i>分類を追加</button>';
  }

  function catEditorHtml() {
    if (!editing) return '<div class="empty">左の一覧から分類を選んでください</div>';
    const c = editing;
    const used = KK.repo.categories.usage(c.id);
    const types = KK.fieldTypes.list();
    return `
      <div class="form-grid" data-cat-form>
        <div class="field span-3"><label>分類名<span class="req">*</span></label><input class="input" data-c="name" value="${esc(c.name)}"></div>
        <div class="field span-3"><label>大分類</label><select class="input" data-c="kind">${KK.kinds.list().map((k) => `<option value="${k.id}"${k.id === c.kind ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}</select></div>
        <div class="field span-3"><label>見分け方（識別キー）</label><select class="input" data-c="identityKey">${KK.identityKeys.list().map((k) => `<option value="${k.id}"${k.id === c.identityKey ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}</select>
          <span class="hint">重複は使用中の個体の中で調べます</span></div>
        <div class="field span-3"><label>校正周期（既定）</label><div class="unit-input"><input class="input" data-c="intervalMonths" inputmode="numeric" value="${esc(c.intervalMonths)}"><span class="unit">か月</span></div></div>
        <div class="form-sep">項目（この分類の個体が持つ情報）</div>
        <div class="span-6">
          <table class="mini-grid"><thead><tr><th>項目名</th><th>型</th><th>単位・選択肢</th><th>必須</th><th></th></tr></thead><tbody>
          ${(c.fields || []).map((f, i) => `<tr data-fi="${i}">
            <td><input class="input" data-f="label" value="${esc(f.label)}"></td>
            <td><select class="input" data-f="type">${types.map((t) => `<option value="${t.id}"${t.id === f.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></td>
            <td>${f.type === 'number' ? `<input class="input" data-f="unit" value="${esc(f.unit || '')}" placeholder="mm など">`
              : f.type === 'select' ? `<input class="input" data-f="options" value="${esc((f.options || []).join('、'))}" placeholder="「、」で区切る">` : '<span class="sub">—</span>'}</td>
            <td class="center"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}></td>
            <td class="nowrap"><button class="btn btn--ghost btn--icon" data-fmove="-1" title="上へ" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
              <button class="btn btn--ghost btn--icon" data-fmove="1" title="下へ" ${i === c.fields.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
              <button class="btn btn--ghost btn--icon" data-fdel title="項目を外す"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('')}
          </tbody></table>
          <button class="btn btn--ghost" data-fadd><i class="fa-solid fa-plus"></i>項目を追加</button>
          <div class="hint">項目を外しても、登録済みの値は個体に残ります（項目を戻すと再び表示されます）</div>
        </div>
      </div>
      <div class="editor-foot">
        <button class="btn btn--ghost" data-del-cat ${used ? 'disabled' : ''} title="${used ? `${used} 個体が使っているため削除できません` : ''}"><i class="fa-solid fa-trash-can"></i>分類を削除</button>
        ${used ? `<span class="sub">${used} 個体が使用中のため削除できません</span>` : ''}
        <span class="spacer"></span>
        <button class="btn btn--primary" data-save-cat><i class="fa-solid fa-check"></i>分類を保存</button>
      </div>`;
  }

  function readCatForm() {
    const root = catWin.querySelector('[data-cat-form]'); if (!root) return;
    root.querySelectorAll('[data-c]').forEach((el) => { editing[el.dataset.c] = el.value; });
    root.querySelectorAll('[data-fi]').forEach((tr) => {
      const f = editing.fields[Number(tr.dataset.fi)];
      tr.querySelectorAll('[data-f]').forEach((el) => {
        const k = el.dataset.f;
        if (k === 'required') f.required = el.checked;
        else if (k === 'options') f.options = el.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
        else f[k] = el.value;
      });
    });
  }

  function renderCat() {
    catWin.querySelector('.mlist').innerHTML = catListHtml();
    catWin.querySelector('.meditor').innerHTML = catEditorHtml();
  }

  function selectCat(id) {
    const c = KK.repo.categories.get(id);
    editing = c ? JSON.parse(JSON.stringify(c)) : null;
    if (editing && !editing.fields) editing.fields = [];
    renderCat();
  }

  async function saveCat() {
    readCatForm();
    const name = (editing.name || '').trim();
    if (!name) { KK.toast('分類名を入力してください', { kind: 'warn' }); return; }
    const dup = KK.repo.categories.list().find((c) => c.id !== editing.id && c.name === name);
    if (dup) { KK.toast(`分類名「${name}」は既にあります`, { kind: 'warn' }); return; }
    const iv = Number(String(editing.intervalMonths).normalize('NFKC'));
    if (!(iv > 0)) { KK.toast('校正周期は 1 以上の月数で入力してください', { kind: 'warn' }); return; }
    const fields = editing.fields.filter((f) => (f.label || '').trim()).map((f) => ({ ...f, label: f.label.trim() }));
    const before = KK.repo.categories.get(editing.id);
    const saved = { ...editing, name, intervalMonths: iv, fields, sample: false };
    await KK.repo.categories.save(saved);
    KK.toast(`分類「${name}」を保存しました`, before ? { undo: () => KK.repo.categories.save(before) } : {});
    if (!catWin) return; // 保存中に窓が閉じられた
    editing = JSON.parse(JSON.stringify(saved));
    renderCat();
    KK.flash(catWin.querySelector('.editor-foot'));
  }

  function openCategories(selectId) {
    catWin = KK.floating({ id: 'catWin', title: '分類と項目', icon: 'fa-shapes', width: 860,
      body: '<div class="master"><nav class="mlist"></nav><div class="meditor"></div></div>', onClose: () => { catWin = null; editing = null; } });
    selectCat(selectId || KK.repo.categories.list()[0]?.id);
    catWin.addEventListener('click', async (e) => {
      const t = e.target;
      const c = t.closest('[data-cat]'); if (c) { selectCat(c.dataset.cat); return; }
      if (t.closest('[data-new-cat]')) {
        editing = { id: uid('c'), name: '新しい分類', kind: 'measure', intervalMonths: 12, identityKey: 'locationNo', fields: [] };
        renderCat(); catWin.querySelector('[data-c="name"]').select(); return;
      }
      if (!editing) return;
      if (t.closest('[data-fadd]')) { readCatForm(); editing.fields.push({ key: uid('p'), label: '', type: 'text' }); renderCat(); catWin.querySelector('[data-fi]:last-child [data-f="label"]')?.focus(); }
      else if (t.closest('[data-fdel]')) { readCatForm(); editing.fields.splice(Number(t.closest('[data-fi]').dataset.fi), 1); renderCat(); }
      else if (t.closest('[data-fmove]')) {
        readCatForm(); const i = Number(t.closest('[data-fi]').dataset.fi); const j = i + Number(t.closest('[data-fmove]').dataset.fmove);
        [editing.fields[i], editing.fields[j]] = [editing.fields[j], editing.fields[i]]; renderCat();
      } else if (t.closest('[data-save-cat]')) saveCat();
      else if (t.closest('[data-del-cat]')) {
        const before = KK.repo.categories.get(editing.id);
        if (!before) { editing = null; renderCat(); return; }
        await KK.repo.categories.remove(editing.id);
        editing = null; if (catWin) renderCat();
        KK.toast(`分類「${before.name}」を削除しました`, { kind: 'warn', undo: () => KK.repo.categories.save(before) });
      }
    });
    catWin.addEventListener('change', (e) => { if (e.target.dataset.f === 'type') { readCatForm(); renderCat(); } });
    catWin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveCat(); } });
    KK.wireFormAssist(catWin);
  }

  // ════ 設置先 ════
  let locWin = null;

  function locTreeHtml() {
    const repo = KK.repo;
    const counts = new Map();
    repo.assets.list().forEach((a) => counts.set(a.locationId, (counts.get(a.locationId) || 0) + 1));
    const row = (l, depth, siblings, i) => {
      const kids = repo.locations.children(l.id);
      const n = counts.get(l.id) || 0;
      const blocked = n ? `${n} 個体があるため削除できません` : kids.length ? '下に設置先があるため削除できません' : '';
      return `<div class="loc-row" data-lid="${l.id}" style="--depth:${depth}">
          <i class="fa-solid ${kids.length ? 'fa-folder-open' : 'fa-location-dot'} sub"></i>
          <input class="input" data-lname value="${esc(l.name)}" aria-label="設置先名">
          <span class="sub loc-row__n">${n ? `${n} 個体` : ''}</span>
          <button class="btn btn--ghost btn--icon" data-ladd title="この下に追加"><i class="fa-solid fa-plus"></i></button>
          <button class="btn btn--ghost btn--icon" data-lmove="-1" title="上へ" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button class="btn btn--ghost btn--icon" data-lmove="1" title="下へ" ${i === siblings.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button class="btn btn--ghost btn--icon" data-ldel ${blocked ? 'disabled' : ''} title="${blocked || '削除'}"><i class="fa-solid fa-trash-can"></i></button>
        </div>` + kids.map((k, j) => row(k, depth + 1, kids, j)).join('');
    };
    const tops = repo.locations.children(null);
    return (tops.length ? tops.map((l, i) => row(l, 0, tops, i)).join('') : '<div class="empty">設置先がまだありません。下のボタンから追加してください。</div>') +
      '<button class="btn btn--ghost" data-ladd-top><i class="fa-solid fa-plus"></i>最上位に追加（部・課など）</button>' +
      '<div class="hint">名前は入力して Enter またはほかへ移ると保存します。削除できない理由はボタンに表示します。</div>';
  }

  function renderLoc(focusId) {
    locWin.querySelector('.floating__body').innerHTML = locTreeHtml();
    if (focusId) { const i = locWin.querySelector(`[data-lid="${focusId}"] [data-lname]`); i?.focus(); i?.select(); }
  }

  async function addLoc(parentId) {
    const siblings = KK.repo.locations.children(parentId);
    const loc = { id: uid('l'), name: parentId ? '新しいライン' : '新しい部・課', parentId, order: siblings.length };
    await KK.repo.locations.save(loc);
    if (locWin) renderLoc(loc.id);
  }

  function openLocations() {
    locWin = KK.floating({ id: 'locWin', title: '設置先', icon: 'fa-location-dot', width: 560, body: '', onClose: () => { locWin = null; } });
    renderLoc();
    locWin.addEventListener('click', async (e) => {
      const t = e.target; const rowEl = t.closest('[data-lid]'); const id = rowEl?.dataset.lid;
      if (t.closest('[data-ladd-top]')) addLoc(null);
      else if (t.closest('[data-ladd]')) addLoc(id);
      else if (t.closest('[data-lmove]')) {
        const l = KK.repo.locations.get(id); const sib = KK.repo.locations.children(l.parentId);
        const i = sib.findIndex((x) => x.id === id); const j = i + Number(t.closest('[data-lmove]').dataset.lmove);
        const ops = sib.map((x, k) => ({ ...x, order: k === i ? j : k === j ? i : k })).map((x) => KK.repo.put('locations', x));
        await KK.repo.commit(ops, 'locations'); if (locWin) renderLoc();
      } else if (t.closest('[data-ldel]')) {
        const before = KK.repo.locations.get(id);
        await KK.repo.commit([KK.repo.del('locations', id)], 'locations');
        if (KK.state.get().locationId === id) KK.state.set({ locationId: 'ALL' });
        if (locWin) renderLoc();
        KK.toast(`設置先「${before.name}」を削除しました`, { kind: 'warn', undo: async () => { await KK.repo.locations.save(before); if (locWin) renderLoc(); } });
      }
    });
    const saveName = async (input) => {
      const id = input.closest('[data-lid]').dataset.lid; const l = KK.repo.locations.get(id);
      const name = input.value.trim();
      if (!l || name === l.name) return;
      if (!name) { input.value = l.name; KK.toast('設置先名は空にできません', { kind: 'warn' }); return; }
      await KK.repo.locations.save({ ...l, name, sample: false });
      KK.flash(input);
    };
    locWin.addEventListener('focusout', (e) => { if (e.target.matches('[data-lname]')) saveName(e.target); });
    locWin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('[data-lname]')) { e.preventDefault(); saveName(e.target); }
    });
    locWin.addEventListener('focusin', (e) => { if (e.target.matches('[data-lname]')) e.target.select(); });
  }

  KK.masters = { openCategories, openLocations };
})();
