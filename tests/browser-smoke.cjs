'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.DNA_TOOL_PLAYWRIGHT || 'playwright');

async function assertRanges(page, expected) {
  const ranges = await page.locator('#alignRanges .range-label span').allTextContents();
  assert.deepEqual(ranges.map(text => (text.match(/[\d,]+/g) || []).map(value => Number(value.replaceAll(',', '')))), expected);
}

async function assertEnglishUI(page) {
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const nonEnglish = await page.evaluate(() => {
    const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, input, textarea') || !parent.getClientRects().length) continue;
      if (getComputedStyle(parent).visibility === 'hidden') continue;
      if (cjk.test(node.textContent)) found.push(node.textContent.trim());
    }
    // Accessible names, tooltips, and prompts are user-facing too. Input values
    // remain unrestricted so users can retain their own filenames and headers.
    for (const element of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
      for (const attribute of ['aria-label', 'title', 'placeholder']) {
        const value = element.getAttribute(attribute) || '';
        if (cjk.test(value)) found.push(value);
      }
    }
    if (cjk.test(document.title)) found.push(document.title);
    return found;
  });
  assert.deepEqual(nonEnglish, [], 'visible interface text and accessible labels must be English');
}

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.DNA_TOOL_BROWSER_CHANNEL ? {channel: process.env.DNA_TOOL_BROWSER_CHANNEL} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await assertEnglishUI(page);
    assert.equal(await page.isDisabled('#matchRun'), true);
    await page.click('#demo');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    await page.fill('#query', 'ACK');
    await page.click('#matchRun');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);
    assert.deepEqual(await page.locator('#alignMetrics .metric strong').allTextContents(), ['100.0%', '100.0%', '75.0%', '0']);
    await assertEnglishUI(page);

    await page.click('#alignDemo');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    await assertRanges(page, [[4, 23, 26], [3, 23, 25]]);
    assert.equal(await page.locator('#alignMetrics .metric strong').last().textContent(), '2');
    assert.equal(await page.locator('#alignmentDetails .mismatch').count() > 0, true);
    assert.equal(await page.locator('#alignmentDetails .gap').count() > 0, true);
    assert.equal(await page.locator('.range-fill').count(), 2);
    await assertEnglishUI(page);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#alignmentSave');
    const download = await downloadPromise;
    const exported = await fs.readFile(await download.path(), 'utf8');
    assert.match(exported, /Reference A: 4\.\.23 \/ 26/);
    assert.match(exported, /Query B: 3\.\.23 \/ 25/);
    assert.match(exported, /ACD-EFGHIKLMNPQRSTVWY/);
    assert.match(exported, /ACDMEFGHIKLMNPQASTVWY/);
    await page.locator('#comparison').screenshot({path: path.join(os.tmpdir(), 'goosecode-desktop.png')});

    await page.selectOption('#matchMode', 'exact');
    assert.equal(await page.isVisible('#alignmentResults'), false);
    await page.fill('#reference', 'AAAA');
    await page.fill('#query', 'AA');
    await page.click('#matchRun');
    assert.equal(await page.locator('#matchList li').count(), 3);
    assert.match(await page.locator('#matchList li strong').last().textContent(), /3–4/);
    await assertEnglishUI(page);
    await page.selectOption('#matchMode', 'local');
    await page.fill('#reference', 'AAAA');
    await page.fill('#query', 'CCCC');
    await page.click('#matchRun');
    await page.waitForFunction(() => document.getElementById('alignProgress').hidden);
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.locator('#matchStatus').getAttribute('class'), '');
    assert.equal(await page.isDisabled('#alignmentSave'), true);
    await page.fill('#query', '>q\nA-C');
    await page.click('#matchRun');
    await page.waitForFunction(() => document.getElementById('matchStatus').className === 'error');
    assert.match(await page.textContent('#matchStatus'), /numbers|digits/i);
    assert.match(await page.textContent('#matchStatus'), /gaps/i);
    await assertEnglishUI(page);

    // Pagination must preserve original coordinates and export the entire result.
    await page.fill('#reference', 'A'.repeat(700));
    await page.fill('#query', 'A'.repeat(700));
    await page.click('#matchRun');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    assert.equal(await page.locator('.alignment-block').count(), 10);
    await page.click('#alignmentMore');
    assert.equal(await page.locator('.alignment-block').count(), 12);
    assert.match(await page.locator('.alignment-block').last().textContent(), /A\s+661\s+A+\s+700/);
    assert.equal(await page.isVisible('#alignmentMore'), false);
    await page.fill('#query', 'A'.repeat(700) + '1');
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.isDisabled('#alignmentSave'), true);

    // Reject work above the new limit and complete a previously rejected job.
    await page.fill('#reference', 'A'.repeat(9000));
    await page.fill('#query', 'A'.repeat(9000));
    await page.click('#matchRun');
    await page.waitForFunction(() => document.getElementById('matchStatus').className === 'error');
    assert.match(await page.textContent('#matchStatus'), /80,000,000/);
    await page.fill('#reference', 'A'.repeat(3000));
    await page.fill('#query', 'A'.repeat(3000));
    await page.click('#matchRun');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    await assertRanges(page, [[1, 3000, 3000], [1, 3000, 3000]]);
    assert.match(await page.textContent('#alignMetrics'), /100\.0%/);

    // An 80-million-cell job must report progress and let a queued UI task cancel it.
    await page.fill('#reference', 'A'.repeat(10000));
    await page.fill('#query', 'A'.repeat(8000));
    const runningState = await page.evaluate(() => new Promise(resolve => {
      setTimeout(() => {
        const state = {
          progress: document.getElementById('alignProgress').value,
          progressVisible: !document.getElementById('alignProgress').hidden,
          runDisabled: document.getElementById('matchRun').disabled,
          cancelVisible: !document.getElementById('matchCancel').hidden
        };
        document.getElementById('matchCancel').click();
        resolve(state);
      }, 0);
      document.getElementById('matchRun').click();
    }));
    assert.ok(runningState.progress > 0 && runningState.progress < 1);
    assert.equal(runningState.progressVisible, true);
    assert.equal(runningState.runDisabled, true);
    assert.equal(runningState.cancelVisible, true);
    assert.match(await page.textContent('#matchStatus'), /cancelled|canceled/i);
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.isDisabled('#matchRun'), false);
    assert.equal(await page.isVisible('#matchCancel'), false);
    await page.fill('#query', 'ACDE');
    await page.click('#matchRun');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    assert.match(await page.textContent('#alignMetrics'), /25\.0%/);

    await page.selectOption('#referenceSource', 'translated');
    await page.fill('#query', 'ACK');
    await page.click('#matchRun');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    await page.fill('#start', '2');
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.isDisabled('#matchRun'), true);
    await page.click('#alignDemo');
    await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
    await assertEnglishUI(page);
    for (const width of [320, 768, 390]) {
      await page.setViewportSize({width, height: 844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `page must not overflow at ${width}px`);
    }
    await page.locator('#comparison').screenshot({path: path.join(os.tmpdir(), 'goosecode-mobile.png')});
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: English interface, translated/manual input, mismatch/gap visual, both coordinate ranges, exact matches, exports, pagination, validation, 9M-cell completion, 80M-cell progress/responsiveness/cancellation, stale-state clearing, 320/390/768px overflow.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
