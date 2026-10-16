'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.DNA_TOOL_PLAYWRIGHT || 'playwright');

// This loopback server is a test fixture only. The deployed artifact consists
// exclusively of static files and has no application server or backend.
const webRoot = path.resolve(__dirname, '../dist/web');
const prefix = '/GooseCode/';
const browserName = process.env.GOOSECODE_BROWSER || 'chromium';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.dna': 'application/octet-stream', '.fasta': 'text/plain; charset=utf-8'
};

async function staticServer() {
  await fs.access(path.join(webRoot, 'index.html')).catch(() => {
    throw Error('Missing dist/web/index.html. Run python3 scripts/prepare_web.py before this test.');
  });
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const entry = {method: request.method, url: request.url, body: '', status: null};
    requests.push(entry);
    request.setEncoding('utf8');
    request.on('data', chunk => { entry.body += chunk; });
    const finish = (status, body = '') => {
      entry.status = status;
      response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8'});
      response.end(body);
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (request.method !== 'GET' || !pathname.startsWith(prefix)) return finish(404);
      const relative = pathname.slice(prefix.length) || 'index.html';
      const file = path.resolve(webRoot, relative);
      if (!file.startsWith(webRoot + path.sep)) return finish(404);
      const contents = await fs.readFile(file);
      entry.status = 200;
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(contents);
    } catch (error) {
      finish(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {server, requests, origin: `http://127.0.0.1:${server.address().port}`};
}

async function pasteDna(page, text = ' atg gct\n tgt aaa tga ') {
  await page.fill('#dnaInput', text);
  await page.click('#pasteImport');
  assert.equal(await page.inputValue('#rna'), 'AUGGCUUGUAAAUGA');
  assert.equal(await page.inputValue('#protein'), 'MACK');
}

async function importFile(page, relative) {
  await page.setInputFiles('#file', path.join(webRoot, relative));
  await page.waitForFunction(() => {
    const message = document.getElementById('status').textContent;
    return message && !/^Reading file/.test(message);
  });
  assert.notEqual(await page.locator('#status').getAttribute('class'), 'error');
}

async function compare(page, reference, query, mode = 'local') {
  await page.selectOption('#referenceSource', 'manual');
  await page.selectOption('#matchMode', mode);
  await page.fill('#reference', reference);
  await page.fill('#query', query);
  await page.click('#matchRun');
  if (mode === 'local') await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
  else assert.equal(await page.isVisible('#exactResults'), true);
}

async function ranges(page) {
  return (await page.locator('#alignRanges .range-label span').allTextContents())
    .map(text => (text.match(/[\d,]+/g) || []).map(value => Number(value.replaceAll(',', ''))));
}

async function downloadText(page, selector, suffix) {
  const pending = page.waitForEvent('download');
  await page.click(selector);
  const download = await pending;
  assert.match(download.url(), /^blob:http:\/\/127\.0\.0\.1:/, 'browser exports must be generated as local Blob URLs');
  assert.ok(download.suggestedFilename().endsWith(suffix), `expected an exported ${suffix} file`);
  assert.equal(await download.failure(), null);
  return fs.readFile(await download.path(), 'utf8');
}

function readFasta(text) {
  assert.ok(text.startsWith('>'));
  return text.trim().split(/^>/m).filter(Boolean).map(record => {
    const [header, ...lines] = record.split(/\r?\n/);
    return {header, sequence: lines.join('')};
  });
}

function readGenPept(text) {
  assert.equal((text.match(/^LOCUS\s/gm) || []).length, 1);
  assert.match(text, /^ACCESSION\s/m);
  assert.match(text, /^\/\/\s*$/m);
  const [, origin] = text.split(/^ORIGIN\s*$/m);
  assert.ok(origin, 'GenPept must have an ORIGIN section');
  return origin.split('//')[0].replace(/[\s\d]/g, '').toUpperCase();
}

async function assertFreshPage(page) {
  // Values as well as rendered results must be cleared. Some browsers restore
  // textarea contents on reload independently of application persistence.
  for (const selector of ['#dnaInput', '#file', '#reference', '#query', '#rna', '#protein']) {
    assert.equal(await page.inputValue(selector), '', `${selector} must be empty after reload`);
  }
  assert.equal(await page.locator('#file').evaluate(element => element.files.length), 0);
  for (const selector of ['#run', '#rnaSave', '#faSave', '#gpSave', '#matchRun', '#matchSave', '#alignmentSave']) {
    assert.equal(await page.isDisabled(selector), true, `${selector} must not use pre-reload data`);
  }
  for (const selector of ['#mergedInfo', '#alignmentResults', '#exactResults', '#alignProgress']) {
    assert.equal(await page.isVisible(selector), false);
  }
  assert.equal(await page.textContent('#fileInfo'), 'No DNA imported');
}

(async () => {
  assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'GOOSECODE_BROWSER must be chromium, firefox or webkit');
  const fixture = await staticServer();
  let browser;
  try {
    browser = await playwright[browserName].launch({
      headless: true,
      ...(browserName === 'chromium' && process.env.DNA_TOOL_BROWSER_CHANNEL ? {channel: process.env.DNA_TOOL_BROWSER_CHANNEL} : {})
    });
    const context = await browser.newContext({acceptDownloads: true, viewport: {width: 1200, height: 1000}, reducedMotion: 'no-preference'});
    const page = await context.newPage();
    const errors = [], browserRequests = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => browserRequests.push({url: request.url(), method: request.method(), body: request.postData()}));
    page.on('response', response => responses.push({url: response.url(), status: response.status()}));
    page.setDefaultTimeout(15000);
    await page.goto(fixture.origin + prefix, {waitUntil: 'networkidle'});
    assert.match(await page.title(), /GooseCode/);
    assert.equal(await page.evaluate(() => Boolean(globalThis.webkit?.messageHandlers?.saveFile)), false, 'a regular browser has no macOS save bridge');
    await assertFreshPage(page);

    // Test 13: a repository prefix is mandatory for every application asset.
    // Load the favicon as an image too: headless engines vary in whether they
    // request favicon links, but the deployed path and PNG must still work.
    const imageSizes = await page.evaluate(async () => {
      const sources = [document.querySelector('link[rel="icon"]').getAttribute('href'), document.querySelector('.swim-scene image').getAttribute('href')];
      return Promise.all(sources.map(src => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
        image.onerror = () => reject(Error(`Image failed: ${src}`));
        image.src = src;
      })));
    });
    for (const [width, height] of imageSizes) assert.ok(width > 0 && height > 0);
    assert.equal(await page.locator('.swim-scene').evaluate(element => getComputedStyle(element).height), '178px');
    assert.equal(await page.locator('.swim-goose-bob').evaluate(element => getComputedStyle(element).animationName), 'goose-bob');
    await page.waitForFunction(() => document.querySelector('[data-sequence-swim]').dataset.motion === 'running');
    const initialTransform = await page.locator('[data-swim-goose]').getAttribute('transform');
    await page.waitForFunction(before => document.querySelector('[data-swim-goose]').getAttribute('transform') !== before, initialTransform);
    for (const resource of ['sequence-swim.css', 'core.js', 'app.js', 'sequence-swim.js', 'assets/swimming-goose.svg', 'assets/goosecode-icon.png']) {
      assert.ok(responses.some(response => response.url === fixture.origin + prefix + resource && response.status === 200), `missing prefix-hosted resource: ${resource}`);
    }

    // Tests 1–3: normal browser inputs, including binary SnapGene parsing.
    await pasteDna(page);
    await importFile(page, 'examples/multi-record.fasta');
    assert.match(await page.textContent('#fileInfo'), /3 records joined/);
    assert.equal(await page.inputValue('#rna'), 'AUGGCUUGUAAAUGA');
    assert.equal(await page.inputValue('#protein'), 'MACK', 'FASTA record order must be preserved across the split start codon');
    await importFile(page, 'example.dna');
    assert.match(await page.textContent('#fileInfo'), /SnapGene/);
    assert.equal(await page.inputValue('#protein'), 'MACK');

    // Tests 4–5: full-interval reverse complement and the selected reading frame.
    await page.selectOption('#strand', 'reverse');
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), 'UCAUUUACAAGCCAU');
    assert.equal(await page.inputValue('#protein'), 'SFTSH');
    await page.selectOption('#strand', 'forward');
    await page.selectOption('#frame', '1');
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), 'AUGGCUUGUAAAUGA');
    assert.equal(await page.inputValue('#protein'), 'WLVN');
    await page.selectOption('#frame', '0');
    await page.click('#run');

    // Tests 8–9: parse actual downloaded records, including RNA export.
    const protein = readFasta(await downloadText(page, '#faSave', '.protein.fasta'));
    assert.equal(protein.length, 1);
    assert.equal(protein[0].sequence, 'MACK');
    assert.match(protein[0].header, /frame=1/);
    assert.equal(readFasta(await downloadText(page, '#rnaSave', '.rna.fasta'))[0].sequence, 'AUGGCUUGUAAAUGA');
    assert.equal(readGenPept(await downloadText(page, '#gpSave', '.gp')), 'MACK');

    // Tests 6 and 10: two independent proteins, mismatches/gaps, coordinates,
    // and the full TXT alignment rather than just a displayed summary.
    await compare(page, 'PPPACDEFGHIKLMNPQRSTVWYQQQ', 'SSACDMEFGHIKLMNPQASTVWYTT');
    assert.deepEqual(await ranges(page), [[4, 23, 26], [3, 23, 25]]);
    assert.ok(await page.locator('#alignmentDetails .mismatch').count() > 0);
    assert.ok(await page.locator('#alignmentDetails .gap').count() > 0);
    const alignment = await downloadText(page, '#alignmentSave', '.alignment.txt');
    assert.match(alignment, /Reference A: 4\.\.23 \/ 26/);
    assert.match(alignment, /Query B: 3\.\.23 \/ 25/);
    assert.match(alignment, /ACD-EFGHIKLMNPQRSTVWY/);
    assert.match(alignment, /ACDMEFGHIKLMNPQASTVWY/);
    await compare(page, 'AAAA', 'AA', 'exact');
    assert.equal(await page.locator('#matchList li').count(), 3);
    const tsv = await downloadText(page, '#matchSave', '.matches.tsv');
    const rows = tsv.trim().split(/\r?\n/).filter(line => !line.startsWith('#')).map(line => line.split('\t'));
    assert.deepEqual(rows, [['match', 'start', 'end'], ['1', '1', '2'], ['2', '2', '3'], ['3', '3', '4']]);

    // Test 7: schedule cancellation before an 80M-cell job completes. Observing
    // this queued task proves that computation yields to browser interactions.
    await page.selectOption('#matchMode', 'local');
    await page.fill('#reference', 'A'.repeat(10000));
    await page.fill('#query', 'A'.repeat(8000));
    const running = await page.evaluate(() => new Promise(resolve => {
      setTimeout(() => {
        const state = {
          progress: document.getElementById('alignProgress').value,
          visible: !document.getElementById('alignProgress').hidden,
          cancel: !document.getElementById('matchCancel').hidden,
          disabled: document.getElementById('matchRun').disabled
        };
        document.getElementById('matchCancel').click();
        resolve(state);
      }, 0);
      document.getElementById('matchRun').click();
    }));
    assert.ok(running.progress > 0 && running.progress < 1);
    assert.equal(running.visible && running.cancel && running.disabled, true);
    assert.match(await page.textContent('#matchStatus'), /cancelled|canceled/i);
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.isDisabled('#matchRun'), false);

    // Offline after load: local paste, file import, calculation and download
    // remain usable. This intentionally does not promise an offline reload/PWA.
    const offlineRequestCount = browserRequests.length;
    const offlineServerCount = fixture.requests.length;
    await context.setOffline(true);
    await pasteDna(page);
    await importFile(page, 'examples/multi-record.fasta');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    await importFile(page, 'example.dna');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    await compare(page, 'MACK', 'ACK');
    assert.deepEqual(await ranges(page), [[2, 4, 4], [1, 3, 3]]);
    assert.equal(readFasta(await downloadText(page, '#faSave', '.protein.fasta'))[0].sequence, 'MACK');
    assert.equal(readGenPept(await downloadText(page, '#gpSave', '.gp')), 'MACK');
    assert.match(await downloadText(page, '#alignmentSave', '.alignment.txt'), /Reference A: 2\.\.4 \/ 4/);
    await compare(page, 'MACKACK', 'ACK', 'exact');
    assert.match(await downloadText(page, '#matchSave', '.matches.tsv'), /2\t5\t7/);
    assert.equal(browserRequests.length, offlineRequestCount, 'offline workflows must not even attempt network requests');
    assert.equal(fixture.requests.length, offlineServerCount);
    await context.setOffline(false);

    // Test 11: reload clears both file-backed results and manual protein text.
    assert.equal(await page.locator('#file').evaluate(element => element.files.length), 1);
    await page.reload({waitUntil: 'networkidle'});
    await assertFreshPage(page);
    // Check pasted input separately; importing a file intentionally clears it.
    await pasteDna(page);
    await compare(page, 'MACK', 'ACK');
    await page.reload({waitUntil: 'networkidle'});
    await assertFreshPage(page);
    await page.fill('#dnaInput', 'ATGCCCGGG');
    await page.reload({waitUntil: 'networkidle'});
    await assertFreshPage(page);

    // Test 12: every browser request must be a static same-origin GET with no
    // query string, body, or sequence upload. No remote/CDN/API calls are allowed.
    const expectedPaths = new Set(['', 'index.html', 'core.js', 'app.js', 'sequence-swim.js', 'sequence-swim.css', 'assets/swimming-goose.svg', 'assets/goosecode-icon.png'].map(relative => prefix + relative));
    for (const request of browserRequests) {
      const url = new URL(request.url);
      assert.equal(url.origin, fixture.origin, 'all application resources must be local to the static host');
      assert.ok(expectedPaths.has(url.pathname), `unexpected network request: ${url.pathname}`);
      assert.equal(url.search, '');
      assert.equal(request.method, 'GET');
      assert.equal(request.body, null);
    }
    for (const request of fixture.requests) {
      assert.equal(request.method, 'GET');
      assert.equal(request.body, '');
      assert.equal(request.status, 200, `resource request failed: ${request.url}`);
    }
    assert.deepEqual(errors, []);
    console.log(`Static web checks passed (${browserName}): all 13 requested workflows, /GooseCode/ resources and animation, local Blob downloads, offline operation after load, reload data clearing, and no sequence network traffic.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
