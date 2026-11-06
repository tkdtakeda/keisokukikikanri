/* ── モック共通の表示部品 ──
   各案で同じ部品を使い、違いを「配置の考え方」だけにするための共通処理。 */
(function () {
  'use strict';
  const D = window.MockData;

  // ── 参照 ──
  const byId = (list, id) => list.find((x) => x.id === id);
  const cat = (a) => byId(D.categories, a.cat);
  const loc = (id) => byId(D.locations, id);
  const locPath = (id) => {
    const names = [];
    for (let l = loc(id); l; l = loc(l.parent)) names.unshift(l.name);
    return names.join(' › ');
  };
  const children = (id) => D.assets.filter((a) => a.parent === id);
  const roots = () => D.assets.filter((a) => !a.parent);
  const descendants = (id) => children(id).flatMap((c) => [c, ...descendants(c.id)]);
  const locDescendants = (id) => [id, ...D.locations.filter((l) => l.parent === id).flatMap((l) => locDescendants(l.id))];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── 期限と状態 ──
  const addMonths = (iso, m) => {
    const [y, mo, da] = iso.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + m, da));
    return d.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const dueDate = (a) => addMonths(a.lastCal, cat(a).interval);

  /** 個体単体の状態。保管・廃棄は期限判定の対象外 */
  function status(a) {
    if (a.state === '廃棄') return { key: 'retired', label: '廃棄', icon: 'fa-ban', cls: 'muted', rank: 0 };
    if (a.state === '保管') return { key: 'stored', label: '保管中', icon: 'fa-box-archive', cls: 'muted', rank: 1 };
    const days = daysBetween(D.TODAY, dueDate(a));
    if (days < 0) return { key: 'overdue', label: `期限切れ ${-days}日`, icon: 'fa-circle-exclamation', cls: 'danger', rank: 4, days };
    if (days <= 30) return { key: 'soon', label: `あと${days}日`, icon: 'fa-clock', cls: 'warn', rank: 3, days };
    return { key: 'ok', label: '有効', icon: 'fa-circle-check', cls: 'ok', rank: 2, days };
  }
  /** 親は自分と子孫のうち最も悪い状態を示す */
  function rollupStatus(a) {
    return [a, ...descendants(a.id)].map(status).reduce((w, s) => (s.rank > w.rank ? s : w));
  }
  const badge = (s) => `<span class="badge badge--${s.cls}"><i class="fa-solid ${s.icon}"></i>${esc(s.label)}</span>`;
  const kindHtml = (a) => {
    const k = D.KIND[cat(a).kind];
    return `<span class="kind kind--${cat(a).kind}"><i class="fa-solid ${k.icon}"></i>${k.label}</span>`;
  };
  /** 利用者が見分けに使う番号。測定機器は管理番号、標準器・試験機は製造番号 */
  const identity = (a) => (a.no ? a.no : a.serial);
  const counts = (list) => {
    const c = { overdue: 0, soon: 0, ok: 0, stored: 0, retired: 0 };
    list.forEach((a) => { c[status(a).key] += 1; });
    return c;
  };
  /** 件数の札（期限切れ・30日以内） */
  const countBadges = (c) => {
    const parts = [];
    if (c.overdue) parts.push(`<span class="badge badge--danger"><i class="fa-solid fa-circle-exclamation"></i>期限切れ ${c.overdue}</span>`);
    if (c.soon) parts.push(`<span class="badge badge--warn"><i class="fa-solid fa-clock"></i>30日以内 ${c.soon}</span>`);
    return parts.length ? parts.join(' ') : '<span class="badge badge--ok"><i class="fa-solid fa-circle-check"></i>期限の近いものはありません</span>';
  };

  // ── 詳細（項目・構成・記録） ──
  function treeHtml(rootId, currentId) {
    const node = (a) => {
      const kids = children(a.id);
      const cls = a.id === currentId ? ' class="is-current"' : '';
      return `<li><span${cls}>${esc(cat(a).name)} ${esc(identity(a))}</span> <span class="sub">${esc(a.model)}</span> ${badge(status(a))}${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`;
    };
    return `<ul class="mini-tree">${node(byId(D.assets, rootId))}</ul>`;
  }
  const topOf = (a) => (a.parent ? topOf(byId(D.assets, a.parent)) : a);

  function propsHtml(a) {
    const rows = [
      ['分類', `${esc(cat(a).name)}（${D.KIND[cat(a).kind].label}）`],
      ['管理番号', esc(a.no) || '<span class="sub">なし</span>'],
      ['製造番号', esc(a.serial) || '<span class="sub">未登録</span>'],
      ['型式・仕様', esc(a.model)],
      ['メーカー', esc(a.maker)],
      ['設置先', esc(locPath(a.loc))],
      ['校正周期', `${cat(a).interval} か月`],
      ['前回校正日', esc(a.lastCal)],
      ['次回期限', `${dueDate(a)} ${badge(status(a))}`],
      ['識別キー', `<span class="sub">${esc(cat(a).key)}</span>`]
    ];
    return `<dl class="props">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  function historyHtml(a) {
    const ev = D.events.filter((e) => e.asset === a.id);
    if (!ev.length) return '<div class="sub">記録はまだありません</div>';
    return `<ul class="timeline">${ev.map((e) => `<li><span class="date">${e.date}</span><span><b>${esc(e.type)}</b> ${esc(e.result)}<br><span class="sub">${esc(e.by)}${e.std ? '／使用標準器 ' + esc(e.std) : ''}</span></span></li>`).join('')}</ul>`;
  }

  function detailHtml(a, opt = {}) {
    const top = topOf(a);
    const showTree = top.id !== a.id || children(a.id).length;
    return `
      <div class="detail${opt.fluid ? ' detail--fluid' : ''}">
        <div class="detail__head">
          <div class="detail__title">${kindHtml(a)}<span>${esc(cat(a).name)} ${esc(identity(a))}</span><span class="spacer"></span>
            <button class="btn btn--icon btn--ghost" title="編集"><i class="fa-solid fa-pen"></i></button>
            ${opt.closable ? '<button class="btn btn--icon btn--ghost" data-close-detail title="閉じる (Esc)"><i class="fa-solid fa-xmark"></i></button>' : ''}
          </div>
          <div class="detail__meta">${esc(a.model)}　${esc(locPath(a.loc))}</div>
        </div>
        <div class="detail__body">
          <div class="detail__section"><h4><i class="fa-solid fa-list"></i>項目</h4>${propsHtml(a)}</div>
          ${showTree ? `<div class="detail__section"><h4><i class="fa-solid fa-sitemap"></i>構成（一緒に持ち運ぶ単位）</h4>${treeHtml(top.id, a.id)}</div>` : ''}
          <div class="detail__section"><h4><i class="fa-solid fa-clock-rotate-left"></i>記録</h4>${historyHtml(a)}</div>
        </div>
      </div>`;
  }

  // ── 登録フォーム（非モーダル・入力補助の見本） ──
  function registerFormHtml() {
    const catOpts = D.categories.map((c) => `<option value="${c.id}">${c.name}（${D.KIND[c.kind].label}）</option>`).join('');
    const locOpts = D.locations.map((l) => `<option value="${l.id}">${locPath(l.id)}</option>`).join('');
    return `
      <div class="floating" id="registerForm" role="dialog" aria-label="個体を登録">
        <div class="floating__head"><i class="fa-solid fa-plus"></i>個体を登録<span class="spacer"></span>
          <button class="btn btn--icon btn--ghost" data-close-register title="閉じる (Esc)"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="floating__body">
          <div class="form-grid">
            <div class="field span-3"><label>分類<span class="req">*</span></label><select class="input" data-next>${catOpts}</select></div>
            <div class="field span-3"><label>設置先<span class="req">*</span></label><select class="input" data-next>${locOpts}</select></div>
            <div class="field span-2"><label>管理番号</label><input class="input" data-next placeholder="M-004"></div>
            <div class="field span-2"><label>製造番号</label><input class="input" data-next></div>
            <div class="field span-2"><label>親（構成）</label><input class="input" data-next placeholder="なし"></div>
            <div class="field span-4"><label>型式・仕様</label><input class="input" data-next></div>
            <div class="field span-2"><label>メーカー</label><input class="input" data-next></div>
            <div class="field span-3"><label>前回校正日</label>
              <div class="date-row"><input class="input" size="4" maxlength="4" data-len="4" placeholder="2026">/<input class="input" size="2" maxlength="2" data-len="2" placeholder="11">/<input class="input" size="2" maxlength="2" data-len="2" placeholder="06"></div></div>
            <div class="field span-3"><label>校正周期</label><input class="input" data-next value="12 か月（分類の既定）"></div>
            <div class="form-sep">分類で決まる項目（例：マイクロメータ）</div>
            <div class="field span-2"><label>測定範囲</label><input class="input" data-next placeholder="0-25 mm"></div>
            <div class="field span-2"><label>最小表示量</label><input class="input" data-next placeholder="0.001 mm"></div>
            <div class="field span-2"><label>器差許容値</label><input class="input" data-next placeholder="±2 µm"></div>
            <div class="field span-6"><label>写真・書類</label><div class="drop"><i class="fa-solid fa-image"></i> Ctrl+V で貼り付け／ドラッグ＆ドロップ／<u>ファイルを選ぶ</u></div></div>
          </div>
        </div>
        <div class="floating__foot"><span class="sub" style="margin-right:auto">Enter で次の欄へ／Shift+Enter で前へ</span>
          <button class="btn" data-close-register>閉じる</button><button class="btn btn--primary"><i class="fa-solid fa-check"></i>登録する</button></div>
      </div>`;
  }

  /** 入力補助：全選択、桁数での自動移動、Enter で次へ */
  function wireFormAssist(root) {
    const fields = () => [...root.querySelectorAll('input, select')];
    root.addEventListener('focusin', (e) => { if (e.target.select) e.target.select(); });
    root.addEventListener('input', (e) => {
      const len = Number(e.target.dataset.len || 0);
      if (len && e.target.value.length >= len) { const f = fields(); f[f.indexOf(e.target) + 1]?.focus(); }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const f = fields(); const i = f.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      f[i + (e.shiftKey ? -1 : 1)]?.focus();
    });
  }

  function mountRegisterForm() {
    document.body.insertAdjacentHTML('beforeend', registerFormHtml());
    const form = document.getElementById('registerForm');
    wireFormAssist(form);
    form.querySelectorAll('[data-close-register]').forEach((b) => b.addEventListener('click', () => form.classList.remove('is-open')));
    document.querySelectorAll('[data-open-register]').forEach((b) => b.addEventListener('click', () => {
      form.classList.add('is-open'); form.querySelector('select').focus();
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') form.classList.remove('is-open'); });
  }

  // ── 脇パネル（アイコン列から開閉） ──
  function wireRail(panelEl, contents) {
    const btns = [...document.querySelectorAll('.rail__btn[data-panel]')];
    btns.forEach((b) => b.addEventListener('click', () => {
      const open = b.getAttribute('aria-pressed') !== 'true';
      btns.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      if (open) {
        b.setAttribute('aria-pressed', 'true');
        panelEl.querySelector('.sidepanel__inner').innerHTML = contents[b.dataset.panel] || '';
      }
      panelEl.classList.toggle('is-open', open);
    }));
  }

  /** 脇パネルの中身の見本（全案共通） */
  function panelContents() {
    const c = counts(D.assets);
    const kinds = Object.entries(D.KIND).map(([k, v]) => {
      const n = D.assets.filter((a) => cat(a).kind === k).length;
      return `<label class="chk"><input type="checkbox" checked><i class="fa-solid ${v.icon}"></i>${v.label}<span class="count">${n}</span></label>`;
    }).join('');
    return {
      filter: `<h3><i class="fa-solid fa-filter"></i> 絞り込み</h3>
        <div class="panel-group"><div class="panel-group__label">状態</div>
          <label class="chk"><input type="checkbox" checked>期限切れ<span class="count">${c.overdue}</span></label>
          <label class="chk"><input type="checkbox" checked>30日以内<span class="count">${c.soon}</span></label>
          <label class="chk"><input type="checkbox" checked>有効<span class="count">${c.ok}</span></label>
          <label class="chk"><input type="checkbox" checked>保管中<span class="count">${c.stored}</span></label>
          <label class="chk"><input type="checkbox">廃棄<span class="count">${c.retired}</span></label></div>
        <div class="panel-group"><div class="panel-group__label">大分類</div>${kinds}</div>`,
      view: `<h3><i class="fa-solid fa-sliders"></i> 表示</h3>
        <div class="panel-group"><div class="panel-group__label">表示密度</div>
          ${['compact:コンパクト', 'standard:標準', 'comfortable:ゆったり'].map((s) => { const [v, l] = s.split(':'); return `<label class="chk"><input type="radio" name="den" ${v === 'standard' ? 'checked' : ''} onchange="document.documentElement.dataset.density='${v}'">${l}</label>`; }).join('')}</div>
        <div class="panel-group"><div class="panel-group__label">表示する列</div>
          ${['状態', '管理番号', '製造番号', '分類', '型式・仕様', '設置先', '次回期限'].map((l) => `<label class="chk"><input type="checkbox" checked>${l}</label>`).join('')}</div>`,
      master: `<h3><i class="fa-solid fa-shapes"></i> 分類と項目</h3><div class="sub">分類ごとの項目テンプレート・校正周期・識別キーを編集（本実装で用意）</div>`,
      sample: `<h3><i class="fa-solid fa-flask"></i> サンプルデータ</h3><div class="panel-group">
          <button class="btn" style="width:100%;margin-bottom:6px"><i class="fa-solid fa-download"></i>測定機器（ライン別）</button>
          <button class="btn" style="width:100%;margin-bottom:6px"><i class="fa-solid fa-download"></i>標準器（セットと子）</button>
          <button class="btn" style="width:100%;margin-bottom:6px"><i class="fa-solid fa-download"></i>試験機器（親・子・孫）</button>
          <button class="btn" style="width:100%"><i class="fa-solid fa-eraser"></i>サンプルだけを消す</button></div>`,
      backup: `<h3><i class="fa-solid fa-floppy-disk"></i> バックアップ</h3><div class="panel-group">
          <button class="btn" style="width:100%;margin-bottom:6px"><i class="fa-solid fa-file-export"></i>JSON に書き出す</button>
          <button class="btn" style="width:100%"><i class="fa-solid fa-file-import"></i>JSON から読み込む</button>
          <div class="sub" style="margin-top:6px">前回の書き出し：2026-10-30</div></div>`
    };
  }

  /** アイコン列（全案共通の並び：作業 → 設定 → データ） */
  const railHtml = (extra = '') => `
    ${extra}
    <button class="rail__btn" data-panel="filter" data-tip="絞り込み" aria-pressed="false"><i class="fa-solid fa-filter"></i></button>
    <button class="rail__btn" data-panel="view" data-tip="表示" aria-pressed="false"><i class="fa-solid fa-sliders"></i></button>
    <div class="rail__sep"></div>
    <button class="rail__btn" data-panel="master" data-tip="分類と項目" aria-pressed="false"><i class="fa-solid fa-shapes"></i></button>
    <button class="rail__btn" data-panel="sample" data-tip="サンプルデータ" aria-pressed="false"><i class="fa-solid fa-flask"></i></button>
    <button class="rail__btn" data-panel="backup" data-tip="バックアップ" aria-pressed="false"><i class="fa-solid fa-floppy-disk"></i></button>
    <div style="flex:1"></div>
    <button class="rail__btn" data-tip="取扱説明書"><i class="fa-solid fa-circle-question"></i></button>`;

  window.MockUtil = {
    cat, loc, locPath, children, roots, descendants, locDescendants, esc,
    dueDate, status, rollupStatus, badge, kindHtml, identity, counts, countBadges, topOf,
    detailHtml, treeHtml, propsHtml, historyHtml, mountRegisterForm, wireFormAssist, wireRail, panelContents, railHtml
  };
})();
