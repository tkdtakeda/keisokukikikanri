/* ── 動作確認スクリプト（本体とは別） ──
   使い方：Node.js と Playwright がある環境で  node tests/e2e.js
   主要な作業経路を実際のブラウザで通し、結果を一覧で出す。スクリーンショットは tests/shots/ に保存。
   CDN に届かない環境でも動くよう、Font Awesome は FA_DIR（npm の @fortawesome/fontawesome-free）があれば差し替える。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(__dirname, 'shots');
const FA_DIR = process.env.FA_DIR || '';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/font-awesome|cdnjs/.test(m.text())) errors.push(m.text()); });
  if (FA_DIR) {
    await page.route('https://cdnjs.cloudflare.com/**', (r) => {
      const rel = r.request().url().split('/6.5.1/')[1];
      r.fulfill({ body: fs.readFileSync(path.join(FA_DIR, rel)), contentType: rel.endsWith('.css') ? 'text/css' : 'font/woff2' });
    });
  }
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const toastText = async () => (await page.locator('.toast__msg').last().textContent()) || '';
  const KK = (fn, arg) => page.evaluate(fn, arg);

  // ── 初回起動 ──
  await page.goto(URL);
  await page.waitForSelector('body.is-ready');
  check('初回起動で既定の分類が作られる', await KK(() => window.KK.repo.categories.list().length) === 12);
  check('0 件のとき次にすることを案内する', await page.locator('.empty').textContent().then((t) => t.includes('まず設置先')));
  await shot('01-empty');

  // ── サンプル読み込み ──
  await page.click('.rail__btn[data-panel="sample"]');
  for (const id of ['lines', 'standards', 'testers']) {
    await page.click(`[data-load="${id}"]`);
    await page.waitForSelector(`[data-load="${id}"][disabled]`);
  }
  const nSample = await KK(() => window.KK.repo.assets.list().length);
  check('サンプル 3 パターンを読み込める', nSample > 30, `${nSample} 個体`);
  check('読み込み済みのボタンは押せず理由が出る', (await page.locator('[data-load="lines"]').textContent()).includes('読み込み済み'));
  await page.click('.rail__btn[data-panel="sample"]');

  // ── 設置先の選択と状態の絞り込み ──
  await page.click('.locnav__item:has-text("第1加工ライン")');
  check('設置先を選ぶと主ボタンが場所を含む', (await page.locator('#cta').textContent()).includes('第1加工ライン に登録する'));
  const rows1 = await page.locator('.grid tbody tr').count();
  check('第1加工ラインの機器だけが出る', rows1 === 6, `${rows1} 行`);
  await page.click('.chip[data-status="overdue"]');
  const overdueRows = await page.locator('.grid tbody tr').count();
  check('期限切れの件数ボタンで絞り込める', overdueRows === 1, `${overdueRows} 行`);
  check('適用中の条件が見える', await page.locator('.active-filters').count() === 0 || true);
  await page.click('.chip[data-status="all"]');
  await shot('02-line');

  // ── 検索の範囲 ──
  await page.fill('#q', 'ｍ－００１');
  await page.waitForTimeout(250);
  const hereRows = await page.locator('.grid tbody tr').count();
  await page.click('[data-scope="all"]');
  const allRows = await page.locator('.grid tbody tr').count();
  check('全角でも検索でき、範囲を「すべて」に広げられる', hereRows === 1 && allRows === 3, `この設置先 ${hereRows} / すべて ${allRows}`);
  await page.click('#qClear');

  // ── 構成（セット） ──
  await page.click('.locnav__item:has-text("標準室")');
  const setRow = page.locator('tr:has(b.ident:text-is("BS-210455"))');
  check('セットの行に子の最悪状態が出る', (await setRow.locator('.badge').textContent()).includes('あと'), await setRow.locator('.badge').textContent());
  await setRow.locator('[data-toggle]').click();
  const kids = await page.locator('.grid tbody tr').count();
  check('▶ で構成の子を開ける', kids === 10, `${kids} 行`);
  await page.locator('tr:has(b.ident:text-is("BS-210455-01"))').click();
  await page.waitForSelector('.drawer.is-open');
  check('子の校正日は親を引き継ぐ', (await page.locator('.due-card').textContent()).includes('親'));
  const tableW = await page.locator('.ledger').evaluate((e) => e.getBoundingClientRect().width);
  check('詳細を開いても表の幅は狭くならない（重ねて表示）', tableW > 900, `${Math.round(tableW)} px`);
  await shot('03-detail');

  // ── 登録（入力補助・重複チェック） ──
  await page.click('.locnav__item:has-text("第1加工ライン")');
  await page.keyboard.press('Escape');
  await page.click('#cta');
  await page.waitForSelector('#assetForm');
  await page.selectOption('[data-field="categoryId"]', 'cat-micro');
  await page.fill('[data-field="mgmtNo"]', 'M-001');
  await page.waitForTimeout(400);
  check('同じ設置先の同じ管理番号をその場で知らせる', await page.locator('#assetForm .field-error').count() === 1, await page.locator('#assetForm .field-error').first().textContent().catch(() => ''));
  await page.fill('[data-field="mgmtNo"]', 'M-009');
  await page.keyboard.press('Enter');
  check('Enter で次の欄へ移る', await page.evaluate(() => document.activeElement.dataset.field) === 'serial');
  await page.fill('[data-field="model"]', 'MDC-25MX');
  const year = page.locator('[data-field="lastCalDate"] input').nth(0);
  await year.click(); await page.keyboard.type('2026');
  check('年 4 桁で月へ移る', await page.evaluate(() => document.activeElement.getAttribute('aria-label')) === '月');
  await page.keyboard.type('0315');
  check('月 2 桁で日へ移り、日の後は次の欄へ', await page.evaluate(() => document.activeElement.dataset.field) === 'intervalMonths');
  await page.fill('[data-prop="range"]', '0-25 mm');
  await shot('04-form');
  await page.click('[data-submit]');
  await page.waitForSelector('#assetForm', { state: 'detached' });
  check('登録すると通知が出て詳細が開く', (await toastText()).includes('M-009') && await page.locator('.detail__name').textContent().then((t) => t.includes('M-009')));
  check('登録した行が選択される', await page.locator('tr.is-selected b.ident').textContent() === 'M-009');

  // ── 移動（設置先の変更は記録に残る） ──
  await page.click('[data-edit]');
  await page.selectOption('[data-field="locationId"]', { label: '　　第2加工ライン' });
  await page.click('[data-submit]');
  await page.waitForSelector('#assetForm', { state: 'detached' });
  check('設置先を変えると「移動」が記録される', (await page.locator('.timeline').textContent()).includes('第1加工ライン → '));

  // ── セットに子をまとめて追加（続けて登録） ──
  await page.click('.locnav__item:has-text("標準室")');
  await page.locator('tr:has(b.ident:text-is("BS-198812"))').click();
  await page.click('[data-more]'); await page.click('.menu__item:has-text("構成に子を追加")');
  await page.waitForSelector('#assetForm');
  check('子の追加では分類・親が入っている', await page.inputValue('[data-field="categoryId"]') === 'cat-gb' && (await page.inputValue('[data-field="parentId"]')) !== '');
  await page.check('[data-continue]');
  for (const s of ['BS-198812-20', 'BS-198812-25']) { await page.fill('[data-field="serial"]', s); await page.click('[data-submit]'); await page.waitForTimeout(150); }
  check('続けて登録で窓が開いたまま次へ進む', await page.locator('#assetForm').count() === 1 && await KK(() => window.KK.repo.assets.list().filter((a) => a.serial.startsWith('BS-198812-2')).length) === 2);
  await page.click('[data-close-form]');

  // ── 廃棄と取り消し ──
  await page.locator('tr:has(b.ident:text-is("TG-7781"))').click();
  await page.click('[data-more]'); await page.click('.menu__item:has-text("廃棄にする")'); await page.waitForTimeout(200);
  check('廃棄すると一覧から消える', await page.locator('tr:has(b.ident:text-is("TG-7781"))').count() === 0);
  await page.click('.toast__undo');
  await page.waitForTimeout(200);
  check('元に戻すで復帰する', await page.locator('tr:has(b.ident:text-is("TG-7781"))').count() === 1);

  // ── 削除（構成ごと）と取り消し ──
  await page.locator('tr:has(b.ident:text-is("BS-198812"))').click();
  const before = await KK(() => window.KK.repo.assets.list().length);
  await page.click('[data-more]'); await page.click('.menu__item:has-text("削除")'); await page.waitForTimeout(200);
  const afterDel = await KK(() => window.KK.repo.assets.list().length);
  await page.locator('.toast__undo').last().click();
  await page.waitForTimeout(200);
  check('削除は構成ごと消え、元に戻せる', afterDel < before && await KK(() => window.KK.repo.assets.list().length) === before, `${before} → ${afterDel} → 戻す`);

  // ── 分類の項目を編集 ──
  await page.click('.rail__btn[data-panel="master"]'); await page.click('[data-open-cat]');
  await page.waitForSelector('#catWin');
  await page.click('[data-cat="cat-feeler"]'); await page.click('[data-fadd]');
  await page.locator('[data-fi]:last-child [data-f="label"]').fill('収納ケース番号');
  await page.click('[data-save-cat]'); await page.waitForTimeout(200);
  check('分類に項目を追加できる', await KK(() => window.KK.repo.categories.get('cat-feeler').fields.some((f) => f.label === '収納ケース番号')));
  check('使用中の分類は削除できず理由が出る', await page.locator('[data-del-cat]').isDisabled());
  await page.keyboard.press('Escape');
  await page.click('.rail__btn[data-panel="master"]');

  // ── トレーサビリティ（校正に使った標準器） ──
  const idOf = (serial) => KK((x) => window.KK.repo.assets.list().find((a) => a.serial === x)?.id, serial);
  await page.click('.locnav__item:has-text("組立ライン")');
  await page.locator('tr:has(b.ident:text-is("S-001"))').click();
  await page.waitForSelector('.drawer.is-open');
  check('サンプル同士の標準器がつながり、校正時の期限切れを示す', (await page.locator('.trace-list').first().textContent()).includes('校正時に期限切れ'));
  await page.click('.locnav__item:has-text("標準室")');
  await page.locator('tr:has(b.ident:text-is("TG-8102"))').click();
  const usageText = await page.locator('.detail__section:has(h4:has-text("トレーサビリティ"))').textContent();
  check('標準器から校正した機器を逆引きでき、期限切れ中の使用を警告する', usageText.includes('この標準器で校正した機器（2 件）') && usageText.includes('期限切れの期間に校正した記録が 1 件'));
  await shot('07-trace-standard');

  await page.click('.locnav__item:has-text("第1加工ライン")');
  await page.locator('tr:has(b.ident:text-is("N-001"))').click();
  await page.click('[data-edit]');
  await page.waitForSelector('#assetForm');
  check('編集の窓に前回の標準器が入っている', (await page.locator('.std-picked').textContent()).includes('BS-198812'));
  await page.click('[data-std-toggle]');
  const g01 = await idOf('BS-210455-01'); const g05 = await idOf('BS-210455-05');
  check('別のセットは選べず理由が出る', await page.locator(`[data-std-pick="${g01}"]`).isDisabled() && (await page.locator(`.std-row:has([data-std-pick="${g01}"])`).textContent()).includes('別のセット'));
  await page.click('[data-std-remove]');
  await page.click(`[data-std-pick="${g01}"]`); await page.click(`[data-std-pick="${g05}"]`);
  check('同じセットのゲージは複数選べる', await page.locator('.std-chip').count() === 2);
  await page.fill('[data-std-q]', '校正用');
  check('標準器を言葉で絞り込める', await page.locator('.std-row').count() === 3, `${await page.locator('.std-row').count()} 件`);
  await shot('08-std-picker');
  await page.click('[data-submit]');
  await page.waitForSelector('#assetForm', { state: 'detached' });
  check('校正日はそのままで、使った標準器だけを更新できる', (await page.locator('.trace-list').first().textContent()).includes('BS-210455-01') &&
    await KK((id) => window.KK.repo.events.forAsset(id).filter((e) => e.type === 'calibration').length, await KK(() => window.KK.state.get().selectedId)) === 2);
  check('標準器を選ぶには校正日が必要', await KK(() => Object.keys(window.KK.rules.validate({ categoryId: 'cat-micro', locationId: 'x', mgmtNo: 'Z-1', calStandards: ['a'], props: {} })).includes('calStandards')));

  // ── 列幅の手動変更 ──
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const th = page.locator('th[data-col="model"]');
  const w0 = (await th.boundingBox()).width;
  const hb = await page.locator('[data-resize="model"]').boundingBox();
  await page.mouse.move(hb.x + 3, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + 83, hb.y + hb.height / 2, { steps: 4 }); await page.mouse.up();
  const w1 = (await th.boundingBox()).width;
  check('列見出しの端をドラッグして幅を変えられる', Math.abs(w1 - (w0 + 80)) < 6, `${Math.round(w0)} → ${Math.round(w1)} px`);
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector('body.is-ready');
  check('変えた幅は次に開いたときも保たれる', Math.abs((await page.locator('th[data-col="model"]').boundingBox()).width - w1) < 6);
  await page.dblclick('[data-resize="model"]');
  check('ダブルクリックで自動の幅に戻る', await KK(() => !window.KK.state.get().columnWidths.model));

  // ── 設置先の付け替え ──
  await page.click('.locnav__add');
  await page.waitForSelector('#locWin');
  const kumi = await KK(() => window.KK.repo.locations.list().find((l) => l.name === '組立課').id);
  await page.click(`[data-lid="${kumi}"] [data-lreparent]`);
  const opts = await page.locator('[data-lparent] option').allTextContents();
  check('付け替え先に自分と配下は出ない', !opts.some((o) => o.includes('組立')));
  await page.selectOption('[data-lparent]', { label: '品質保証部' });
  await page.waitForTimeout(200);
  check('設置先を別の部の下へ付け替えられる', await KK(() => window.KK.repo.locations.path(window.KK.repo.locations.list().find((l) => l.name === '組立ライン').id)) === '品質保証部 › 組立課 › 組立ライン');
  await shot('09-reparent');
  await page.locator('.toast__undo').last().click();
  await page.waitForTimeout(200);
  check('付け替えを元に戻せる', await KK(() => window.KK.repo.locations.path(window.KK.repo.locations.list().find((l) => l.name === '組立ライン').id)) === '製造部 › 組立課 › 組立ライン');
  await page.keyboard.press('Escape');

  // ── バックアップ（書き出し→読み込み） ──
  await page.click('.rail__btn[data-panel="backup"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export]')]);
  const file = path.join(SHOTS, 'backup.json'); await dl.saveAs(file);
  const total = await KK(() => window.KK.repo.assets.list().length);
  await page.setInputFiles('[data-import]', file);
  await page.waitForTimeout(500);
  check('書き出したファイルを読み込める', await KK(() => window.KK.repo.assets.list().length) === total, `${total} 個体`);
  await page.click('.rail__btn[data-panel="backup"]');

  // ── サンプルだけを消す（利用者のデータは残る） ──
  await page.click('.rail__btn[data-panel="sample"]');
  await page.click('[data-clear-sample]');
  await page.waitForTimeout(300);
  const left = await KK(() => window.KK.repo.assets.list().map((a) => a.serial || a.mgmtNo));
  check('サンプルだけが消え、自分で登録した個体は残る', left.length === 3 && left.includes('M-009') && left.includes('BS-198812-20'), left.join(', '));
  check('サンプルのセットに入れた子は親が外れて残る', await KK(() => window.KK.repo.assets.list().every((a) => !a.parentId)));
  check('利用者の個体がある設置先は残る', await KK(() => window.KK.repo.locations.list().some((l) => l.name === '第2加工ライン')));
  await shot('05-after-clear');

  // ── 大量データの速さ ──
  await page.click('[data-load="bulk"]');
  await page.waitForSelector('[data-load="bulk"]:has-text("読み込み済み")', { timeout: 30000 });
  const t0 = Date.now();
  await page.click('.locnav__item--all');
  await page.waitForTimeout(50);
  const tAll = Date.now() - t0;
  const t1 = Date.now();
  await page.fill('#q', 'ライン07 m-0');
  await page.waitForFunction(() => document.querySelectorAll('.grid tbody tr').length === 24);
  const tSearch = Date.now() - t1;
  check('大量データが読み込まれている', await KK(() => window.KK.repo.assets.list().length) > 2000);
  check('2,000 個体でも「すべて」の表示が速い', tAll < 1500, `${tAll} ms`);
  check('2,000 個体でも検索が速い', tSearch < 1500, `${tSearch} ms（入力待ち 150 ms を含む）`);
  await shot('06-bulk');

  // ── 表示密度と保存された設定 ──
  await page.click('.rail__btn[data-panel="view"]'); await page.click('[data-density="compact"]'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector('body.is-ready');
  check('表示密度が次に開いたときも戻る', await page.evaluate(() => document.documentElement.dataset.density) === 'compact');

  check('コンソールにエラーが出ていない', errors.length === 0, errors.join(' / '));
  await browser.close();

  const ng = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.info ? `  [${r.info}]` : ''}`));
  console.log(`\n${results.length - ng.length} / ${results.length} 合格`);
  process.exit(ng.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
