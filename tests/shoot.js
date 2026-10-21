const { chromium } = require('playwright');
(async () => {
  const [, , file, outDir] = process.argv;
  const browser = await chromium.launch();
  const errors = [];
  for (const [label, w] of [['desktop', 1280], ['phone', 390]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    page.on('pageerror', e => errors.push(label + ': ' + e.message));
    await page.goto('file://' + file);
    await page.waitForSelector('table.list');
    await page.screenshot({ path: `${outDir}/${label}-list.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) errors.push(label + ': page scrolls horizontally');
    // 比較：5人を選ぶ（6人目は選べない）
    for (let i = 0; i < 6; i++) { await page.locator("input[data-pick]").nth(i).click(); }
    const picked = await page.$$eval('input[data-pick]:checked', e => e.length);
    if (picked !== 5) errors.push(label + ': picked ' + picked);
    await page.click('[data-view-go="compare"]');
    await page.screenshot({ path: `${outDir}/${label}-compare.png`, fullPage: true });
    // 詳細
    await page.click('[data-open]');
    await page.waitForSelector('#d-memo');
    await page.fill('#d-memo', 'テスト');
    await page.click('#d-save');
    await page.screenshot({ path: `${outDir}/${label}-detail.png`, fullPage: true });
    // 区分で絞り込み & 要確認
    await page.click('nav.tabs button[data-view="list"]');
    await page.selectOption('#f-rank', '要確認');
    const n = await page.$$eval('table.list tbody tr', r => r.length);
    if (n !== 1) errors.push(label + ': 要確認 filter rows = ' + n);
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
})();
