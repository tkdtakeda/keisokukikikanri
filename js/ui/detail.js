/* ── 詳細（表に重ねて開く） ──
   表の幅を奪わないよう、右から重ねて出す。期限・項目・構成・記録・添付をまとめて見せる。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc } = KK.util;
  const R = KK.rules;

  let root = null;
  let shownId = null;
  const urls = [];

  const propRow = (k, v) => `<dt>${esc(k)}</dt><dd>${v === '' || v == null ? '<span class="sub">—</span>' : v}</dd>`;

  function treeHtml(top, currentId) {
    const node = (a) => {
      const kids = KK.repo.assets.children(a.id);
      return `<li><button class="tree-link${a.id === currentId ? ' is-current' : ''}" data-goto="${a.id}">${esc(R.category(a).name)} <b>${esc(R.identity(a))}</b></button>
        <span class="sub">${esc(KK.inherit.modelText(a))}</span> ${KK.badge(R.status(a))}${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`;
    };
    return `<ul class="mini-tree">${node(top)}</ul>`;
  }

  function historyHtml(a) {
    const ev = KK.repo.events.forAsset(a.id);
    if (!ev.length) return '<div class="sub">記録はまだありません</div>';
    return `<ul class="timeline">${ev.map((e) => {
      const t = KK.eventTypes.get(e.type) || { label: e.type, icon: 'fa-circle' };
      const stds = KK.trace.standardsOf(e);
      const stdLine = stds.length ? `<br><span class="sub"><i class="fa-solid fa-scale-balanced"></i> 使用標準器：${stds.map((s) => s.asset ? `<button class="tree-link" data-goto="${s.id}">${esc(s.label)}</button>` : esc(s.label)).join('、')}</span>` : '';
      return `<li><span class="timeline__date">${esc(e.date)}</span><span><i class="fa-solid ${t.icon} timeline__icon"></i><b>${esc(t.label)}</b> ${esc(e.text || '')}${e.by ? `<br><span class="sub">${esc(e.by)}</span>` : ''}${stdLine}</span></li>`;
    }).join('')}</ul>`;
  }

  /** 型式・メーカー・測定範囲・最小表示量・校正区分・校正会社（引き継いだ値には出どころの札） */
  function specRows(a) {
    const I = KK.inherit;
    const m = I.model(a);
    const link = (attr, id, text) => `<button class="tree-link" ${attr}="${id}">${esc(text)}</button>`;
    const mk = I.maker(a); const cal = I.calibrator(a); const ct = I.calType(a); const rg = I.range(a);
    const res = R.resolution(a);
    const resTag = res.resSource === 'asset' || res.unitSource === 'asset' ? '<span class="tag">この機器で上書き</span>' : (res.resSource === 'model' ? I.tag('model') : '<span class="tag">分類の既定</span>');
    return [
      propRow('型式', m ? link('data-open-model', m.id, I.modelLabel(m)) : (a.model ? `${esc(a.model)} <span class="sub">（型式の台帳に未登録）</span>` : '')),
      propRow('メーカー', mk.value ? link('data-open-company', mk.value, I.companyName(mk.value)) + I.tag(mk.source) : ''),
      propRow('測定範囲', rg.value ? esc(I.rangeText(a)) + I.tag(rg.source) : ''),
      propRow('最小表示量', R.resolutionText(a) ? `${esc(R.resolutionText(a))} ${resTag}` : ''),
      propRow('校正区分', `<i class="fa-solid ${KK.calTypes[ct.value].icon}"></i> ${KK.calTypes[ct.value].label}${I.tag(ct.source)}`),
      ct.value === 'external' ? propRow('校正会社', cal.value ? link('data-open-company', cal.value, I.companyName(cal.value)) + I.tag(cal.source) : '<span class="sub">未設定</span>') : ''
    ].join('');
  }

  /** トレーサビリティ：前回校正に使った標準器と、この標準器で校正した機器 */
  function traceHtml(a) {
    const T = KK.trace;
    const cur = T.currentCalEvent(a);
    const used = T.standardsOf(cur);
    const usedHtml = used.length ? `<div class="trace__label">前回校正（${esc(cur.date)}）に使った標準器</div><ul class="trace-list">${used.map((s) => {
      if (!s.asset) return `<li><span>${esc(s.label)}</span><span class="badge badge--muted"><i class="fa-solid fa-ban"></i>台帳から削除済み</span></li>`;
      return `<li><button class="tree-link" data-goto="${s.id}">${esc(s.label)}</button>${KK.badge(T.statusAsOf(s.asset, cur.date))}<span class="sub">現在：</span>${KK.badge(R.status(s.asset))}</li>`;
    }).join('')}</ul>` : '';
    const usages = T.isStandard(a) || KK.repo.assets.descendants(a.id).some(T.isStandard) ? T.usages(a.id) : [];
    const bad = usages.filter((u) => u.status.some((s) => s.key === 'overdue'));
    const LIMIT = 30;
    const usageHtml = T.isStandard(a) ? `<div class="trace__label">この標準器で校正した機器（${usages.length} 件）</div>
      ${bad.length ? `<div class="notice notice--warn"><i class="fa-solid fa-triangle-exclamation"></i><span>期限切れの期間に校正した記録が ${bad.length} 件あります（${bad.filter((u) => u.latest).length} 件は現在の校正）。再校正を検討してください。</span></div>` : ''}
      ${usages.length ? `<ul class="trace-list">${usages.slice(0, LIMIT).map((u) => `<li><span class="timeline__date">${esc(u.event.date)}</span>
          <button class="tree-link" data-goto="${u.asset.id}">${esc(T.label(u.asset))}</button><span class="sub">${esc(KK.repo.locations.get(u.asset.locationId)?.name || '')}</span>
          ${u.status.some((s) => s.key === 'overdue') ? KK.badge(u.status.find((s) => s.key === 'overdue')) : ''}${u.latest ? '<span class="tag">現在の校正</span>' : ''}</li>`).join('')}</ul>
        ${usages.length > LIMIT ? `<div class="sub">ほか ${usages.length - LIMIT} 件</div>` : ''}` : '<div class="sub">まだありません</div>'}` : '';
    if (!usedHtml && !usageHtml) return '';
    return `<section class="detail__section"><h4><i class="fa-solid fa-link"></i>トレーサビリティ</h4>${usedHtml}${usageHtml}</section>`;
  }

  function render() {
    const id = KK.state.get().selectedId;
    const a = id && KK.repo.assets.get(id);
    root.classList.toggle('is-open', !!a);
    document.body.classList.toggle('has-detail', !!a);
    if (!a) { root.innerHTML = ''; shownId = null; return; }
    const cat = R.category(a); const st = R.status(a); const roll = R.rollup(a);
    const top = KK.repo.assets.topOf(a.id);
    const hasTree = top.id !== a.id || KK.repo.assets.children(a.id).length;
    const parent = a.parentId && KK.repo.assets.get(a.parentId);
    const calInfo = R.calDate(a)
      ? `${esc(R.calDate(a))}${R.isCalInherited(a) ? ` <span class="tag">親（${esc(R.identity(parent))}）と同じ</span>` : ''}`
      : '<span class="sub">未入力</span>';
    root.innerHTML = `
      <div class="detail">
        <header class="detail__head">
          <div class="detail__title">${KK.kindTag(a)}<span class="detail__name">${esc(cat.name)} ${esc(R.identity(a))}</span><span class="spacer"></span>
            <button class="btn" data-edit title="編集（E）"><i class="fa-solid fa-pen"></i>編集</button>
            <button class="btn btn--ghost btn--icon" data-more title="その他の操作"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            <button class="btn btn--ghost btn--icon" data-close title="閉じる (Esc)"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="detail__meta">${esc(KK.inherit.modelText(a))}　<i class="fa-solid fa-location-dot"></i> ${esc(KK.repo.locations.path(a.locationId))}</div>
        </header>
        <div class="detail__body">
          <section class="due-card due-card--${st.cls}">
            <div><div class="due-card__label">次回期限</div><div class="due-card__date">${esc(R.dueDate(a) || '—')}</div></div>
            <div>${KK.badge(st)}${roll.viaChild ? `<div class="sub" style="margin-top:4px">構成の中に ${KK.badge(roll)} があります</div>` : ''}</div>
            <dl class="props props--compact">${propRow('前回校正', calInfo)}${propRow('校正周期', `${R.interval(a)} か月${a.intervalMonths ? '' : '（分類の既定）'}`)}</dl>
          </section>
          <section class="detail__section"><h4><i class="fa-solid fa-list"></i>項目</h4>
            <dl class="props">
              ${propRow('分類', `${esc(cat.name)}（${esc(R.kind(a).label)}）`)}
              ${propRow('管理番号', esc(a.mgmtNo))}
              ${propRow('製造番号', esc(a.serial))}
              ${specRows(a)}
              ${(cat.fields || []).map((f) => { const r = KK.inherit.prop(a, f.key); const html = KK.fieldTypes.get(f.type)?.format(r.value ?? '', f, a) ?? esc(r.value); return propRow(f.label, html ? html + KK.inherit.tag(r.source) : ''); }).join('')}
              ${propRow('状態', esc(KK.assetStates[a.state]?.label))}
              ${propRow('識別キー', `<span class="sub">${esc(KK.identityKeys.get(cat.identityKey)?.label || '')}</span>`)}
              ${a.note ? propRow('備考', esc(a.note).replace(/\n/g, '<br>')) : ''}
            </dl></section>
          ${traceHtml(a)}
          ${hasTree ? `<section class="detail__section"><h4><i class="fa-solid fa-sitemap"></i>構成（一緒に持ち運ぶ単位）
              <button class="btn btn--ghost btn--small" data-add-child><i class="fa-solid fa-plus"></i>子を追加</button></h4>${treeHtml(top, a.id)}</section>` : ''}
          <section class="detail__section"><h4><i class="fa-solid fa-paperclip"></i>写真・書類</h4>
            <div class="attach" data-attach tabindex="0" aria-label="写真・書類（Ctrl+V で貼り付け、ドラッグ＆ドロップ、ファイル選択）">
              <div class="attach__list"><span class="sub">読み込み中…</span></div>
              <label class="drop"><i class="fa-solid fa-image"></i> Ctrl+V で貼り付け／ドラッグ＆ドロップ／<u>ファイルを選ぶ</u><input type="file" multiple hidden accept="image/*,application/pdf"></label>
            </div></section>
          <section class="detail__section"><h4><i class="fa-solid fa-clock-rotate-left"></i>記録</h4>${historyHtml(a)}</section>
        </div>
      </div>`;
    if (shownId !== a.id) root.querySelector('.detail__body').scrollTop = 0;
    shownId = a.id;
    renderAttachments(a.id);
  }

  async function renderAttachments(assetId) {
    const list = await KK.repo.attachments.forAsset(assetId);
    if (KK.state.get().selectedId !== assetId) return;
    const host = root.querySelector('.attach__list'); if (!host) return;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    host.innerHTML = list.length ? list.map((x) => {
      const u = URL.createObjectURL(x.blob); urls.push(u);
      const isImg = (x.type || '').startsWith('image/');
      return `<figure class="thumb"><a href="${u}" target="_blank" rel="noopener" title="${esc(x.name)}">${isImg ? `<img src="${u}" alt="${esc(x.name)}">` : '<i class="fa-solid fa-file-pdf thumb__file"></i>'}</a>
        <figcaption>${esc(x.name)}<span class="sub">${KK.util.formatBytes(x.size || 0)}</span></figcaption>
        <button class="btn btn--ghost btn--icon thumb__del" data-del-att="${x.id}" title="削除"><i class="fa-solid fa-trash-can"></i></button></figure>`;
    }).join('') : '<span class="sub">まだありません</span>';
  }

  async function addFiles(files) {
    const id = KK.state.get().selectedId; if (!id) return;
    const ok = [...files].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (!ok.length) { KK.toast('画像または PDF を選んでください', { kind: 'warn' }); return; }
    const big = ok.find((f) => f.size > 10 * 1024 * 1024);
    if (big) { KK.toast(`「${big.name}」は 10 MB を超えるため追加できません`, { kind: 'warn' }); return; }
    for (const f of ok) {
      await KK.repo.attachments.add({ id: KK.util.uid('f'), assetId: id, name: f.name || `貼り付け_${KK.util.today()}.png`, type: f.type, size: f.size, blob: f, createdAt: KK.util.nowIso() });
    }
    KK.toast(`${ok.length} 件を追加しました`);
    await renderAttachments(id);
    KK.flash(root.querySelector('.attach'));
  }

  function moreMenu(anchor) {
    const a = KK.repo.assets.get(KK.state.get().selectedId); if (!a) return;
    const svc = KK.assetService;
    const kids = KK.repo.assets.descendants(a.id);
    const setState = (state, label) => async () => {
      const ids = [a.id, ...kids.map((k) => k.id)];
      const before = ids.map((id) => KK.repo.assets.get(id));
      await svc.setState(ids, state);
      KK.toast(`${R.identity(a)}${kids.length ? ` と構成 ${kids.length} 個` : ''}を${label}にしました`, { undo: () => KK.repo.restore({ assets: before }) });
    };
    KK.menu(anchor, [
      { icon: 'fa-plus', label: '構成に子を追加', run: () => KK.assetForm.openNew({ parentId: a.id }) },
      { icon: 'fa-copy', label: '複製して登録', run: () => KK.assetForm.openCopy(a.id) },
      { sep: true },
      a.state === 'stored' ? { icon: 'fa-box-open', label: '使用中に戻す', run: setState('active', '使用中') } : { icon: 'fa-box-archive', label: '保管にする', disabled: a.state === 'retired', reason: a.state === 'retired' ? '廃棄済みです' : '', run: setState('stored', '保管中') },
      a.state === 'retired' ? { icon: 'fa-rotate-left', label: '廃棄を取り消す', run: setState('active', '使用中') } : { icon: 'fa-ban', label: '廃棄にする', danger: true, run: setState('retired', '廃棄') },
      { sep: true },
      { icon: 'fa-trash-can', label: kids.length ? `削除（構成 ${kids.length} 個も）` : '削除', danger: true, run: async () => {
        const snap = await svc.remove(a.id);
        KK.state.set({ selectedId: null });
        KK.toast(`${R.identity(a)} を削除しました`, { kind: 'warn', undo: () => KK.repo.restore(snap) });
      } }
    ]);
  }

  function mount(node) {
    root = node;
    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-close]')) KK.state.set({ selectedId: null });
      else if (t.closest('[data-edit]')) KK.assetForm.openEdit(KK.state.get().selectedId);
      else if (t.closest('[data-more]')) moreMenu(t.closest('[data-more]'));
      else if (t.closest('[data-add-child]')) KK.assetForm.openNew({ parentId: KK.repo.assets.topOf(KK.state.get().selectedId).id });
      else if (t.closest('[data-open-company]')) KK.directoryUi.openCard(t.closest('[data-open-company]').dataset.openCompany);
      else if (t.closest('[data-open-model]')) KK.directoryUi.openModels(t.closest('[data-open-model]').dataset.openModel);
      else if (t.closest('[data-goto]')) KK.ledger.select(t.closest('[data-goto]').dataset.goto, { scroll: true });
      else if (t.closest('[data-del-att]')) {
        const id = t.closest('[data-del-att]').dataset.delAtt;
        const all = await KK.repo.attachments.forAsset(KK.state.get().selectedId);
        const snap = all.find((x) => x.id === id);
        await KK.repo.attachments.remove(id);
        renderAttachments(KK.state.get().selectedId);
        KK.toast(`「${snap?.name}」を削除しました`, { kind: 'warn', undo: async () => { await KK.repo.attachments.add(snap); renderAttachments(KK.state.get().selectedId); } });
      }
    });
    root.addEventListener('change', (e) => { if (e.target.type === 'file') { addFiles(e.target.files); e.target.value = ''; } });
    root.addEventListener('dragover', (e) => { if (e.target.closest('[data-attach]')) { e.preventDefault(); e.target.closest('[data-attach]').classList.add('is-over'); } });
    root.addEventListener('dragleave', (e) => { e.target.closest('[data-attach]')?.classList.remove('is-over'); });
    root.addEventListener('drop', (e) => { const z = e.target.closest('[data-attach]'); if (!z) return; e.preventDefault(); z.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
    // Ctrl+V：詳細を開いていて、入力欄や登録の窓にいないときは添付として受け取る
    document.addEventListener('paste', (e) => {
      if (!KK.state.get().selectedId || e.target.closest('input, textarea, .floating')) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    KK.bus.on('state:changed', ({ keys }) => { if (keys.includes('selectedId')) render(); });
    KK.bus.on('data:changed', ({ what }) => {
      if (what === 'attachments') return;
      if (KK.state.get().selectedId && !KK.repo.assets.get(KK.state.get().selectedId)) KK.state.set({ selectedId: null }); else render();
    });
    render();
  }

  KK.detail = { mount, render, addFiles };
})();
