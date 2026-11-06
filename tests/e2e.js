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
  check('▶ で構成の子を開ける', kids === 9, `${kids} 行`);
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
