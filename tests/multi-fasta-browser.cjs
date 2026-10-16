'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.DNA_TOOL_PLAYWRIGHT || 'playwright');

// The first codon deliberately crosses a record boundary. Translating each
// record independently, then joining proteins, cannot produce these results.
const fasta = '>alpha\r\nAT\r\n\r\n>beta\r\nGGCT\r\n>gamma\r\nTAAATG\r\n';
const joinedRna = 'AUGGCUUAAAUG';

async function upload(page, contents, name = 'multiple.fasta') {
  await page.setInputFiles('#file', {name, mimeType: 'text/plain', buffer: Buffer.from(contents)});
  await page.waitForFunction(() => {
    const text = document.getElementById('status').textContent;
    return text && !/^Reading file/.test(text);
  });
}

async function pasteDna(page, contents) {
  await page.fill('#dnaInput', contents);
  await page.click('#pasteImport');
}

async function downloadText(page, selector, expectedFilename) {
  const pending = page.waitForEvent('download');
  await page.click(selector);
  const downloaded = await pending;
  if (expectedFilename) assert.equal(downloaded.suggestedFilename(), expectedFilename);
  return fs.readFile(await downloaded.path(), 'utf8');
}

function readFasta(text) {
  assert.ok(text.startsWith('>'), 'FASTA must begin with a header');
  return text.trim().split(/^>/m).filter(Boolean).map(record => {
    const [header, ...lines] = record.split(/\r?\n/);
    const sequence = lines.join('').trim();
    assert.ok(sequence, 'exported FASTA records must not have empty sequences');
    return {header, id: header.split(/\s/, 1)[0], sequence};
  });
}

function readGenPept(text) {
  return text.split(/^\/\/\s*$/m).filter(record => record.trim()).map(record => {
    assert.equal((record.match(/^LOCUS\s/gm) || []).length, 1);
    assert.match(record, /^ACCESSION\s/m);
    const parts = record.split(/^ORIGIN\s*$/m);
    assert.equal(parts.length, 2, 'each GenPept record needs one ORIGIN');
    return {
      text: record,
      id: record.match(/^ACCESSION\s+(\S+)/m)[1],
      sequence: parts[1].replace(/[\s\d]/g, '').toUpperCase()
    };
  });
}

function assertMergedMetadata(text, count = 3) {
  assert.match(text, new RegExp(`input_records=${count};`));
  assert.match(text, /assembly=DNA_concatenated_before_translation;/);
  assert.match(text, /record_order=FASTA(?:;|\s|$)/);
}

async function assertRanges(page, expected) {
  const ranges = await page.locator('#alignRanges .range-label span').allTextContents();
  assert.deepEqual(ranges.map(text => (text.match(/[\d,]+/g) || []).map(value => Number(value.replaceAll(',', '')))), expected);
}

async function align(page, query) {
  await page.selectOption('#matchMode', 'local');
  await page.fill('#query', query);
  await page.click('#matchRun');
  await page.waitForFunction(() => !document.getElementById('alignmentResults').hidden);
}

async function assertClearedOutputs(page) {
  for (const selector of ['#rna', '#protein']) assert.equal(await page.inputValue(selector), '');
  assert.equal(await page.isVisible('#alignmentResults'), false);
  assert.equal(await page.isVisible('#exactResults'), false);
  for (const selector of ['#rnaSave', '#faSave', '#gpSave', '#matchSave', '#alignmentSave', '#matchRun']) {
    assert.equal(await page.isDisabled(selector), true, `${selector} must not use stale translated results`);
  }
}

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.DNA_TOOL_BROWSER_CHANNEL ? {channel: process.env.DNA_TOOL_BROWSER_CHANNEL} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    assert.equal(await page.locator('#recordPicker, #batchPanel').count(), 0, 'the joined workflow has no individual-record or batch panel');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(await page.isChecked('#stop'), true);

    // Import creates one global DNA interval and translates it immediately.
    await upload(page, fasta);
    assert.equal(await page.isVisible('#mergedInfo'), true);
    assert.match(await page.textContent('#fileInfo'), /3 records/i);
    assert.match(await page.textContent('#fileInfo'), /12 nt/);
    const mergeSummary = await page.textContent('#mergedInfo');
    assert.match(mergeSummary, /3/);
    assert.match(mergeSummary, /DNA/i);
    assert.match(mergeSummary, /join|concatenat|combin|merg/i);
    assert.match(mergeSummary, /FASTA|file order|input order/i);
    assert.equal(await page.inputValue('#start'), '1');
    assert.equal(await page.inputValue('#end'), '12');
    assert.equal(await page.getAttribute('#start', 'max'), '12');
    assert.equal(await page.getAttribute('#end', 'max'), '12');
    assert.equal(await page.inputValue('#rna'), joinedRna);
    assert.equal(await page.inputValue('#protein'), 'MA', 'a stop in the third record terminates the combined translation');
    assert.equal(await page.inputValue('#referenceSource'), 'translated');
    assert.match(await page.textContent('#referenceInfo'), /2 characters/);
    assert.equal(await page.isDisabled('#matchRun'), false);
    await align(page, 'MA');
    await assertRanges(page, [[1, 2, 2], [1, 2, 2]]);
    assert.match(await page.textContent('#matchStatus'), /identical/i);

    // Default exports contain one record with a filename-based identity and
    // explicit provenance explaining that DNA was joined before translation.
    const rna = readFasta(await downloadText(page, '#rnaSave', 'multiple.rna.fasta'));
    assert.equal(rna.length, 1);
    assert.equal(rna[0].id, 'multiple_rna');
    assert.equal(rna[0].sequence, joinedRna);
    assertMergedMetadata(rna[0].header);
    const protein = readFasta(await downloadText(page, '#faSave', 'multiple.protein.fasta'));
    assert.equal(protein.length, 1);
    assert.equal(protein[0].id, 'multiple_protein');
    assert.equal(protein[0].sequence, 'MA');
    assertMergedMetadata(protein[0].header);
    assert.match(protein[0].header, /range=1\.\.12/);
    const gp = readGenPept(await downloadText(page, '#gpSave', 'multiple.gp'));
    assert.equal(gp.length, 1);
    assert.equal(gp[0].id, 'multiple_protein');
    assert.equal(gp[0].sequence, 'MA');
    assertMergedMetadata(gp[0].text);

    // Retaining stops applies globally and permits comparison across the
    // second record boundary; edited settings invalidate earlier results.
    await page.uncheck('#stop');
    await assertClearedOutputs(page);
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), joinedRna);
    assert.equal(await page.inputValue('#protein'), 'MA*M');
    await align(page, 'A*M');
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);
    assert.deepEqual(await page.locator('#alignMetrics .metric strong').allTextContents(), ['100.0%', '100.0%', '75.0%', '0']);
    const alignmentExport = await downloadText(page, '#alignmentSave');
    assert.match(alignmentExport, /Reference A: 2\.\.4 \/ 4/);
    assertMergedMetadata(alignmentExport);
    await page.selectOption('#matchMode', 'exact');
    await page.click('#matchRun');
    assert.equal(await page.locator('#matchList li').count(), 1);
    assert.match(await page.locator('#matchList li strong').textContent(), /2–4/);
    const retained = readFasta(await downloadText(page, '#faSave'));
    assert.equal(retained.length, 1);
    assert.equal(retained[0].sequence, 'MA*M');
    assert.equal(readGenPept(await downloadText(page, '#gpSave'))[0].sequence, 'MA*M');

    // The interval is on the concatenated forward DNA, including codons that
    // cross the old record boundary. There are no per-record coordinate resets.
    await page.fill('#start', '2');
    await page.fill('#end', '8');
    await assertClearedOutputs(page);
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), 'UGGCUUA');
    assert.equal(await page.inputValue('#protein'), 'WL');
    const interval = readFasta(await downloadText(page, '#faSave'));
    assert.equal(interval.length, 1);
    assert.equal(interval[0].sequence, 'WL');
    assert.match(interval[0].header, /range=2\.\.8/);
    assertMergedMetadata(interval[0].header);
    await page.fill('#start', '1');
    await page.fill('#end', '12');
    await page.selectOption('#frame', '1');
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), joinedRna, 'reading frame changes only protein, not RNA');
    assert.equal(await page.inputValue('#protein'), 'WLK');
    await page.selectOption('#frame', '0');
    await page.selectOption('#strand', 'reverse');
    await assertClearedOutputs(page);
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), 'CAUUUAAGCCAU');
    assert.equal(await page.inputValue('#protein'), 'HLSH', 'reverse-complement the entire joined interval, not each fragment in original order');
    await page.selectOption('#frame', '1');
    await page.click('#run');
    assert.equal(await page.inputValue('#rna'), 'CAUUUAAGCCAU');
    assert.equal(await page.inputValue('#protein'), 'I*A');

    // Importing multiple records directs the next comparison to the newly
    // joined protein even when the previous session used a manual reference.
    await page.selectOption('#strand', 'forward');
    await page.selectOption('#frame', '0');
    await page.selectOption('#referenceSource', 'manual');
    await page.fill('#reference', 'MACK');
    await align(page, 'ACK');
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);
    await upload(page, fasta);
    assert.equal(await page.inputValue('#referenceSource'), 'translated');
    assert.equal(await page.isVisible('#referenceInput'), false);
    assert.equal(await page.isChecked('#stop'), false, 'import must preserve the chosen stop rule');
    assert.equal(await page.inputValue('#protein'), 'MA*M');
    assert.equal(await page.isVisible('#alignmentResults'), false);
    assert.equal(await page.isDisabled('#alignmentSave'), true);
    await align(page, 'A*M');
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);

    // Duplicate IDs and descriptions that resemble HTML remain plain metadata;
    // they neither change record order nor create executable page elements.
    const hostile = '>duplicate <img src=x onerror="window.__headerExecuted=true">\nAT\n>duplicate\nGGCT\n>tail\nTAAATG\n';
    await upload(page, hostile);
    assert.equal(await page.inputValue('#rna'), joinedRna);
    assert.equal(await page.inputValue('#protein'), 'MA*M');
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.__headerExecuted)), false);
    assert.equal(readFasta(await downloadText(page, '#faSave')).length, 1);

    // Every record must validate before joined results can be displayed. A bad
    // later record must clear both exports and the previous comparison.
    await align(page, 'A*M');
    await upload(page, '>valid\nATG\n>middle\nGCT\n>broken\nAT1\n', 'invalid.fasta');
    assert.equal(await page.locator('#status').getAttribute('class'), 'error');
    assert.match(await page.textContent('#status'), /record 3|broken/i);
    await assertClearedOutputs(page);
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(await page.isDisabled('#run'), true);
    await upload(page, fasta);
    await upload(page, '>valid\nATG\n>empty\n', 'empty.fasta');
    assert.equal(await page.locator('#status').getAttribute('class'), 'error');
    assert.match(await page.textContent('#status'), /record 2|empty/i);
    await assertClearedOutputs(page);
    assert.equal(await page.isDisabled('#run'), true);

    // Long output strings remain continuous; the mobile page must wrap the
    // joined-workflow explanation and keep controls within the viewport.
    await page.check('#stop');
    const longFasta = '>first\nAT\n>second\n' + 'GAT'.repeat(70) + '\n';
    await upload(page, longFasta);
    assert.equal(await page.inputValue('#rna'), 'AU' + 'GAU'.repeat(70));
    assert.equal(await page.inputValue('#protein'), 'M'.repeat(70));
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.isVisible('#mergedInfo'), true);
    assert.equal(await page.isVisible('#run'), true);
    assert.equal(await page.isVisible('#protein'), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, 'joined UI must not create horizontal page overflow on mobile');
    await align(page, 'MMM');
    await assertRanges(page, [[1, 3, 70], [1, 3, 3]]);
    await page.setViewportSize({width: 1200, height: 1000});

    // One-record FASTA, plain DNA and the example retain their original flow.
    await upload(page, '>single one record\nATGGCTTGTAAATGA\n', 'single.fasta');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(await page.inputValue('#protein'), 'MACK');
    assert.equal(await page.inputValue('#end'), '15');
    const single = readFasta(await downloadText(page, '#faSave'));
    assert.equal(single.length, 1);
    assert.equal(single[0].sequence, 'MACK');
    assert.doesNotMatch(single[0].header, /assembly=DNA_concatenated_before_translation/);
    await upload(page, 'ATGGCTTGTAAATGA', 'plain.txt');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(await page.inputValue('#protein'), 'MACK');
    await page.click('#demo');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(await page.inputValue('#protein'), 'MACK');
    assert.equal(await page.isDisabled('#faSave'), false);

    // Pasting is an explicit import using the same parser and translation
    // pipeline. Editing a draft first invalidates DNA-derived results.
    assert.equal(await page.isVisible('#dnaInput'), true);
    assert.equal(await page.isVisible('#pasteImport'), true);
    assert.equal(await page.getAttribute('#dnaInput', 'maxlength'), null, 'large pasted text must be rejected explicitly, never silently truncated');
    await align(page, 'ACK');
    const plainDraft = '  atg gct\n tgt\t aaa tga  ';
    await page.fill('#dnaInput', plainDraft);
    await assertClearedOutputs(page);
    assert.equal(await page.isDisabled('#run'), true);
    await page.click('#pasteImport');
    assert.equal(await page.inputValue('#dnaInput'), plainDraft);
    assert.equal(await page.inputValue('#rna'), 'AUGGCUUGUAAAUGA');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    assert.equal(await page.inputValue('#start'), '1');
    assert.equal(await page.inputValue('#end'), '15');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    assert.equal(readFasta(await downloadText(page, '#faSave', 'pasted-sequence.protein.fasta'))[0].sequence, 'MACK');

    // A pasted multi-record FASTA joins DNA before translating, including a
    // boundary-spanning codon, and feeds the merged protein to comparison.
    await pasteDna(page, fasta);
    assert.equal(await page.inputValue('#rna'), joinedRna);
    assert.equal(await page.inputValue('#protein'), 'MA');
    assert.equal(await page.isVisible('#mergedInfo'), true);
    assert.equal(await page.inputValue('#referenceSource'), 'translated');
    await align(page, 'MA');
    await assertRanges(page, [[1, 2, 2], [1, 2, 2]]);
    const pastedRna = readFasta(await downloadText(page, '#rnaSave', 'pasted-sequence.rna.fasta'));
    assert.equal(pastedRna.length, 1);
    assert.equal(pastedRna[0].sequence, joinedRna);
    assertMergedMetadata(pastedRna[0].header);
    const pastedProtein = readFasta(await downloadText(page, '#faSave', 'pasted-sequence.protein.fasta'));
    assert.equal(pastedProtein.length, 1);
    assert.equal(pastedProtein[0].sequence, 'MA');
    assertMergedMetadata(pastedProtein[0].header);
    const pastedGp = readGenPept(await downloadText(page, '#gpSave', 'pasted-sequence.gp'));
    assert.equal(pastedGp.length, 1);
    assert.equal(pastedGp[0].sequence, 'MA');
    assertMergedMetadata(pastedGp[0].text);
    await page.uncheck('#stop');
    await page.click('#pasteImport');
    assert.equal(await page.inputValue('#protein'), 'MA*M');
    assert.equal(await page.isChecked('#stop'), false);
    await align(page, 'A*M');
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);

    // Import resets the interval but preserves translation preferences.
    await page.fill('#start', '2');
    await page.fill('#end', '8');
    await page.selectOption('#strand', 'reverse');
    await page.selectOption('#frame', '1');
    await page.click('#pasteImport');
    assert.equal(await page.inputValue('#start'), '1');
    assert.equal(await page.inputValue('#end'), '12');
    assert.equal(await page.inputValue('#strand'), 'reverse');
    assert.equal(await page.inputValue('#frame'), '1');
    assert.equal(await page.isChecked('#stop'), false);
    assert.equal(await page.inputValue('#rna'), 'CAUUUAAGCCAU');
    assert.equal(await page.inputValue('#protein'), 'I*A');
    await page.selectOption('#strand', 'forward');
    await page.selectOption('#frame', '0');
    await page.check('#stop');
    await pasteDna(page, '>pasted_header single record\natggcttgtaaatga\n');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    assert.equal(await page.isVisible('#mergedInfo'), false);
    const pastedSingle = readFasta(await downloadText(page, '#faSave', 'pasted-sequence.protein.fasta'));
    assert.equal(pastedSingle.length, 1);
    assert.equal(pastedSingle[0].sequence, 'MACK');
    assert.doesNotMatch(pastedSingle[0].header, /assembly=DNA_concatenated_before_translation/);

    // Invalid and blank drafts cannot reuse an earlier protein or comparison.
    // The byte-size limit also covers multibyte text, without truncating it.
    for (const invalidDraft of ['>valid\nATG\n>invalid\nAT1\n', ' \n\t ']) {
      await align(page, 'ACK');
      await pasteDna(page, invalidDraft);
      assert.equal(await page.locator('#status').getAttribute('class'), 'error');
      await assertClearedOutputs(page);
      assert.equal(await page.isDisabled('#run'), true);
      assert.equal(await page.isDisabled('#pasteImport'), false);
      assert.equal(await page.inputValue('#dnaInput'), invalidDraft);
      await pasteDna(page, plainDraft);
    }
    const oversizedLength = Math.floor(10 * 1024 * 1024 / 3) + 1;
    await page.evaluate(length => {
      const input = document.getElementById('dnaInput');
      input.value = '\u754c'.repeat(length);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }, oversizedLength);
    await page.click('#pasteImport');
    assert.equal(await page.locator('#status').getAttribute('class'), 'error');
    assert.match(await page.textContent('#status'), /10\s*MB/i);
    assert.equal(await page.evaluate(() => document.getElementById('dnaInput').value.length), oversizedLength);
    await assertClearedOutputs(page);
    assert.equal(await page.isDisabled('#pasteImport'), false);

    // Editing DNA does not discard a comparison of two manual proteins.
    await page.selectOption('#referenceSource', 'manual');
    await page.fill('#reference', 'MACK');
    await align(page, 'ACK');
    await page.fill('#dnaInput', 'ATGGCT');
    assert.equal(await page.isVisible('#alignmentResults'), true);
    assert.equal(await page.isDisabled('#alignmentSave'), false);
    assert.equal(await page.isDisabled('#matchRun'), false);
    await assertRanges(page, [[2, 4, 4], [1, 3, 3]]);
    await page.selectOption('#referenceSource', 'translated');
    await assertClearedOutputs(page);

    // File and example imports discard an unsubmitted draft; a later pasted
    // import replaces either source and clears the file chooser selection.
    await upload(page, fasta);
    assert.equal(await page.inputValue('#dnaInput'), '');
    assert.equal(await page.inputValue('#protein'), 'MA');
    await pasteDna(page, plainDraft);
    assert.equal(await page.inputValue('#file'), '');
    assert.equal(await page.inputValue('#protein'), 'MACK');
    await page.fill('#dnaInput', 'ATG');
    await page.click('#demo');
    assert.equal(await page.inputValue('#dnaInput'), '');
    assert.equal(await page.inputValue('#protein'), 'MACK');

    // A file read that finishes after the user starts a new draft must not
    // revive the old result, even before the new draft is submitted.
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      window.__restoreFileRead = () => { File.prototype.arrayBuffer = original; };
      File.prototype.arrayBuffer = function () {
        const pending = original.call(this);
        return this.name === 'delayed.fasta'
          ? pending.then(buffer => new Promise(resolve => { window.__releaseFileRead = () => resolve(buffer); }))
          : pending;
      };
    });
    await page.setInputFiles('#file', {name: 'delayed.fasta', mimeType: 'text/plain', buffer: Buffer.from(fasta)});
    await page.waitForFunction(() => typeof window.__releaseFileRead === 'function');
    await page.fill('#dnaInput', plainDraft);
    await page.evaluate(async () => {
      window.__releaseFileRead();
      window.__restoreFileRead();
      await new Promise(resolve => setTimeout(resolve, 0));
      delete window.__releaseFileRead;
      delete window.__restoreFileRead;
    });
    await assertClearedOutputs(page);
    assert.equal(await page.isDisabled('#run'), true);
    assert.equal(await page.inputValue('#dnaInput'), plainDraft);
    await page.click('#pasteImport');
    assert.equal(await page.inputValue('#protein'), 'MACK');

    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.isVisible('#dnaInput'), true);
    assert.equal(await page.isVisible('#pasteImport'), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, 'the paste controls must stay within the mobile viewport');
    assert.deepEqual(errors, []);
    console.log('Joined-record and pasted-DNA browser checks passed: ordered DNA concatenation, boundary-spanning codons, comparison and export provenance, global translation settings, plain and FASTA paste, byte-size and invalid-input validation, stale-state and asynchronous file-read protection, manual-reference preservation, file/example transitions and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
