/* ── 取扱説明書 ──
   章は登録簿（KK.helpChapters）から作る。機能を足したら章も足す。 */
(function () {
  'use strict';
  const KK = window.KK;
  const { esc, norm } = KK.util;

  KK.helpChapters = KK.createRegistry('helpChapters');
  const ch = (id, order, group, title, html) => KK.helpChapters.register({ id, order, group, title, html });

  ch('quick', 1, 'はじめに', '3 分で使う', `
    <ol>
      <li>左のアイコン列の <i class="fa-solid fa-flask"></i>（サンプルデータ）を開き、<b>測定機器（ライン別）</b>を読み込みます。</li>
      <li>左の<b>設置先</b>で「第1加工ライン」を選ぶと、そのラインの機器が表に出ます。期限切れは <span class="badge badge--danger"><i class="fa-solid fa-circle-exclamation"></i>期限切れ</span> で示します。</li>
      <li>表の上の件数ボタン（期限切れ・期限間近など）を押すと、その状態だけに絞り込めます。</li>
      <li>行を選ぶと右に<b>詳細</b>が重なって開きます。期限・項目・構成・記録・写真を確認できます。</li>
      <li>右上の青いボタン「<b>〇〇 に登録する</b>」で新しい個体を登録します。</li>
      <li>試し終わったら、サンプルデータのパネルの「<b>サンプルだけを消す</b>」で消せます。自分で登録したデータは残ります。</li>
    </ol>`);
  ch('screen', 2, 'はじめに', '画面の見方', `
    <ul>
      <li><b>設置先（左）</b>：部 › 課 › ライン の木です。数字は配下を含む個体数、<i class="fa-solid fa-circle-exclamation" style="color:var(--color-danger)"></i> は期限切れ、<i class="fa-solid fa-clock" style="color:var(--color-warn)"></i> は期限間近・校正日なしの件数です。<i class="fa-solid fa-angles-left"></i> で畳めます。</li>
      <li><b>状態の札</b>：期限切れ（赤）・期限間近（30 日以内、琥珀）・校正日なし（琥珀）・有効（緑）・保管中／廃棄（灰）。色だけでなくアイコンと文字でも示します。</li>
      <li><b>構成</b>：ブロックゲージセットと中のゲージ、試験機と力計のように<b>一緒に持ち運ぶ単位</b>を親・子・孫で表します。▶ で開閉します。親の札には、構成の中で最も悪い状態を出します（<i class="fa-solid fa-sitemap"></i> 印）。</li>
      <li><b>前回校正の「親」印</b>：子の校正日が空欄なら、親の校正日を引き継いでいます。</li>
      <li><b>列の幅</b>：列見出しの右端をドラッグすると幅を変えられ、次に開いたときも保たれます。ダブルクリックでその列を自動の幅に戻します。すべて戻すには <i class="fa-solid fa-sliders"></i>（表示）から。</li>
    </ul>`);
  ch('register', 3, '登録と更新', '登録する', `
    <ul>
      <li>右上の「〇〇 に登録する」を押すと、選んでいる設置先が入った状態で登録の窓が開きます。窓を開いたまま表や詳細を操作できます。見出しをつかむと動かせます。</li>
      <li><b>分類</b>を選ぶと、その分類の項目に切り替わります。必須の番号（<span class="req">*</span>）は分類の「見分け方」で決まります（測定機器：管理番号、標準器・試験機：製造番号）。</li>
      <li>同じ設置先に同じ管理番号（使用中）があると、その場で知らせます。廃棄した番号は再利用できます。</li>
      <li>Enter で次の欄、Shift+Enter で前の欄、Ctrl+Enter で登録。日付は年 4 桁・月 2 桁で自動的に次へ移ります。<i class="fa-solid fa-calendar-day"></i> で今日を入れます。</li>
      <li>写真・書類は Ctrl+V の貼り付け、ドラッグ＆ドロップ、ファイル選択で追加できます（画像・PDF、1 件 10 MB まで）。</li>
      <li><b>セットの中身をまとめて入れる</b>：詳細の ⋮ ›「構成に子を追加」で開き、「続けて登録」に印を付けると、分類・設置先・親を引き継いだまま次々に登録できます。</li>
    </ul>`);
  ch('update', 4, '登録と更新', '編集・移動・廃棄', `
    <ul>
      <li>詳細の「編集」で項目を直します。<b>設置先を変えると「移動」として記録</b>され、構成の子も一緒に移ります。</li>
      <li>前回校正日を変えると「校正」として記録に残ります（校正記録の入力画面は今後追加します）。</li>
      <li>保管・廃棄・削除は詳細の ⋮ にあります。どれも直後の通知の「元に戻す」で戻せます。廃棄は記録を残し、削除は記録ごと消します。</li>
    </ul>`);
  ch('trace', 4.5, '登録と更新', '校正に使った標準器（トレーサビリティ）', `
    <ul>
      <li>登録・編集の窓の「<b>校正に使った標準器</b>」で、前回校正日の校正に使った標準器を選びます。「標準器を選ぶ」で一覧が開き、番号や型式で探せます。</li>
      <li>セットにチェックすると「セット全体を使用」、中のゲージを個別に選ぶこともできます。<b>同じ校正で別のセットのゲージは使えない</b>ため、選べないものには理由を表示します。</li>
      <li>各標準器には、<b>校正日の時点で有効だったか</b>を札で示します（<span class="badge badge--danger"><i class="fa-solid fa-circle-exclamation"></i>校正時に期限切れ</span> でも登録はできます）。</li>
      <li>機器の詳細の「トレーサビリティ」に、前回校正に使った標準器と、その標準器の当時と現在の状態が出ます。</li>
      <li>標準器の詳細には「<b>この標準器で校正した機器</b>」が出ます。標準器に問題が見つかったとき、影響する機器をここで確かめられます。期限切れの期間に校正した記録があると警告します。</li>
      <li>表の列「使用標準器」（表示 › 表示する列）で一覧でも確認できます。</li>
    </ul>`);
  ch('category', 5, '設定', '分類と項目', `
    <ul>
      <li><i class="fa-solid fa-shapes"></i> ›「分類と項目を編集」で、分類ごとに持つ項目（文字・数値＋単位・選択肢・日付・長い文章）、校正周期、見分け方を決めます。</li>
      <li>項目を外しても、登録済みの値は個体に残ります。</li>
      <li>使っている個体がある分類は削除できません（理由を表示します）。</li>
    </ul>`);
  ch('location', 6, '設定', '設置先', `
    <ul>
      <li><i class="fa-solid fa-shapes"></i> ›「設置先を編集」、または設置先の一覧の下の「設置先を追加・編集」で開きます。</li>
      <li>＋ でその下に追加、↑↓ で並べ替え、名前は入力して Enter で保存します。</li>
      <li><i class="fa-solid fa-arrow-right-arrow-left"></i>（付け替え）で、別の部・課の下へ移せます（組織変更など）。置いてある機器はそのまま一緒に移ります。直後なら「元に戻す」で戻せます。</li>
      <li>個体や下の設置先がある設置先は削除できません。</li>
    </ul>`);
  ch('sample', 7, 'データ', 'サンプルデータ', `
    <ul>
      <li>4 つのパターンがあります：測定機器（ライン別）、標準器（セットと子）、試験機器（親・子・孫）、大量データ（2,000 個体）。</li>
      <li>サンプルには「サンプル」の印が付きます。「サンプルだけを消す」で、自分で登録したデータを残して消せます。サンプルのセットに自分で入れた子は、親を外して残します。</li>
    </ul>`);
  ch('backup', 8, 'データ', 'バックアップ', `
    <ul>
      <li>データはこの PC のこのブラウザ（IndexedDB）にだけ保存されます。<b>ほかの PC とは共有されません。</b>ブラウザの閲覧データを消すと台帳も消えます。</li>
      <li><i class="fa-solid fa-floppy-disk"></i> ›「JSON に書き出す」で、写真を含む全データを 1 つのファイルに保存します。30 日以上書き出していないと、アイコンに印が付きます。</li>
      <li>「JSON から読み込む」は台帳全体を置き換えます。直後なら「元に戻す」で戻せます。</li>
    </ul>`);
  ch('keys', 9, '操作', 'キーボード操作', `
    <table class="mini-grid"><tbody>
      <tr><td><kbd>/</kbd></td><td>検索欄へ移る</td></tr>
      <tr><td><kbd>N</kbd></td><td>登録の窓を開く</td></tr>
      <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>表の行を選ぶ（表にフォーカスがあるとき）</td></tr>
      <tr><td><kbd>→</kbd> <kbd>←</kbd></td><td>構成を開く・閉じる</td></tr>
      <tr><td><kbd>E</kbd></td><td>選んでいる個体を編集</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>いちばん上の窓、または詳細を閉じる</td></tr>
      <tr><td><kbd>F1</kbd></td><td>この説明書を開く</td></tr>
    </tbody></table>`);
  ch('words', 10, '操作', '用語', `
    <dl class="props">
      <dt>個体</dt><dd>1 台 1 台の機器。セットの中の 1 個も個体です。</dd>
      <dt>見分け方（識別キー）</dt><dd>個体を区別する番号の決め方。「設置先＋管理番号」または「製造番号」。</dd>
      <dt>構成</dt><dd>一緒に持ち運ぶ単位の親子関係。校正する側・される側の関係とは別です。</dd>
      <dt>記録</dt><dd>登録・移動・校正・状態変更の履歴。消さずに積み上げます。</dd>
    </dl>`);

  let win = null;
  function render(id, query = '') {
    const list = KK.helpChapters.list();
    const q = norm(query);
    const hits = q ? list.filter((c) => norm(c.title + c.html.replace(/<[^>]+>/g, '')).includes(q)) : list;
    const cur = KK.helpChapters.get(id) || list[0];
    const groups = [...new Set(hits.map((c) => c.group))];
    win.querySelector('.help__toc').innerHTML = (hits.length ? groups.map((g) => `<div class="mlist__label">${esc(g)}</div>` +
      hits.filter((c) => c.group === g).map((c) => `<button class="mlist__item" data-ch="${c.id}" aria-current="${c.id === cur.id}">${esc(c.title)}</button>`).join('')).join('')
      : '<div class="sub">該当する章はありません</div>');
    win.querySelector('.help__body').innerHTML = `<h2>${esc(cur.title)}</h2>${cur.html}`;
    KK.repo.settings.set('helpChapter', cur.id).catch(() => {});
  }

  KK.help = {
    open() {
      win = KK.floating({ id: 'helpWin', title: '取扱説明書', icon: 'fa-circle-question', width: 760,
        body: `<div class="help"><div class="help__side"><label class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" data-help-q placeholder="言葉で章を探す"></label><nav class="help__toc"></nav></div><article class="help__body"></article></div>` });
      let current = KK.repo.settings.get('helpChapter', 'quick');
      render(current);
      win.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) { current = b.dataset.ch; render(current, win.querySelector('[data-help-q]').value); } });
      win.addEventListener('input', (e) => { if (e.target.matches('[data-help-q]')) render(current, e.target.value); });
    }
  };
})();
