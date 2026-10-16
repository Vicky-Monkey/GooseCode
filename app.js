'use strict';
const $ = id => document.getElementById(id);
let source = null, name = 'sequence', result = null, description = '', loadToken = 0;
let matchResult = null, matchShown = 0, comparedReference = '';
let alignment = null, alignmentContext = '', alignmentShown = 0;
let alignmentReferencePosition = 0, alignmentQueryPosition = 0;
let comparisonToken = 0, controller = null;
let records = [];
const MAX_DNA_INPUT_BYTES = 10 * 1024 * 1024;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').className = error ? 'error' : '';
}

function referenceText() {
  return $('referenceSource').value === 'manual' ? $('reference').value : result?.protein || '';
}

function referenceDescription() {
  return $('referenceSource').value === 'manual' ? 'Reference: manually entered protein' : `Reference: translated protein; ${description}`;
}

function updateComparisonControls() {
  const local = $('matchMode').value === 'local';
  const manual = $('referenceSource').value === 'manual';
  $('referenceInput').hidden = !manual;
  $('referenceInfo').textContent = manual
    ? 'Compare two protein sequences directly. Use plain sequences or one FASTA record per input.'
    : result?.protein ? `Reference A: ${records.length > 1 ? 'merged protein from ' + records.length + ' DNA records' : 'translated protein above'}, ${result.protein.length.toLocaleString('en-US')} characters.`
      : 'Translate a protein first, or choose Paste another protein sequence.';
  $('matchRun').textContent = local ? 'Align sequences' : 'Find exact matches';
  $('matchRun').disabled = Boolean(controller) || !referenceText().trim();
  $('matchCancel').hidden = !controller;
  $('alignProgress').hidden = !controller;
  $('matchSave').hidden = local;
  $('alignmentSave').hidden = !local;
  $('matchHelp').textContent = local
    ? 'Find the best local alignment, allowing mismatches, insertions and deletions. View start and end positions, identity, coverage and residue-level differences. Case and whitespace are ignored.'
    : 'Find every exact occurrence, including overlapping matches. Case and whitespace are ignored. Ambiguous letters such as X are literal, not wildcards. Coordinates start at 1 in the reference; * occupies a position.';
}

function resetComparison(message = 'Inputs or settings changed. Run the comparison again.') {
  ++comparisonToken;
  controller?.abort();
  controller = null;
  matchResult = null;
  matchShown = 0;
  alignment = null;
  alignmentShown = 0;
  for (const id of ['matchList', 'alignMetrics', 'alignRanges', 'alignmentDetails']) $(id).replaceChildren();
  for (const id of ['matchMore', 'alignmentMore', 'alignmentResults', 'exactResults']) $(id).hidden = true;
  $('matchSave').disabled = $('alignmentSave').disabled = true;
  $('matchStatus').className = '';
  $('matchStatus').textContent = message;
  updateComparisonControls();
}

function clear() {
  result = null;
  for (const key of ['rna', 'protein']) $(key).value = '';
  for (const key of ['rnaCount', 'proteinCount']) $(key).textContent = '';
  for (const key of ['rnaSave', 'faSave', 'gpSave']) $(key).disabled = true;
  if ($('referenceSource').value === 'translated') resetComparison('Translate a protein sequence first.');
  else updateComparisonControls();
}

function resetImport() {
  source = null;
  records = [];
  name = 'sequence';
  clear();
  $('mergedInfo').hidden = true;
  $('mergedInfo').textContent = '';
  $('rnaTitle').textContent = 'RNA';
  $('proteinTitle').textContent = 'Protein';
  $('run').disabled = true;
  $('fileInfo').textContent = 'No DNA imported';
}

function install(data, filename, {fromPaste = false} = {}) {
  resetImport();
  if (!fromPaste) $('dnaInput').value = '';
  name = filename.replace(/\.[^.]+$/, '').slice(0, 120) || 'sequence';
  records = data.records?.length ? data.records : [data];
  source = DNA.joinRecords(records);
  const merged = records.length > 1;
  $('start').value = 1;
  $('end').value = source.dna.length;
  $('start').max = $('end').max = source.dna.length;
  $('fileInfo').textContent = `${fromPaste ? 'Pasted DNA' : filename} · ${source.format} · ${merged ? records.length.toLocaleString('en-US') + ' records joined · ' : ''}${source.dna.length.toLocaleString('en-US')} nt · ${source.circular ? 'circular (read as a linear interval)' : 'linear'}`;
  $('mergedInfo').hidden = !merged;
  $('mergedInfo').textContent = merged
    ? `${records.length.toLocaleString('en-US')} DNA records joined in FASTA order before transcription and translation. Start, End, strand and reading frame apply to the joined DNA; codons may cross record boundaries. Uncheck “Stop at the first stop codon” to translate beyond stop codons.`
    : '';
  $('rnaTitle').textContent = merged ? 'Merged RNA' : 'RNA';
  $('proteinTitle').textContent = merged ? 'Merged protein' : 'Protein';
  if (merged) {
    $('referenceSource').value = 'translated';
    resetComparison('Preparing the merged protein for comparison.');
  }
  $('run').disabled = false;
  run();
}

function translationDescription(options) {
  const settings = `range=${options.start}..${options.end}; strand=${options.reverse ? '-' : '+'}; frame=${options.frame + 1}; stop=${options.stop ? 'first' : 'retain'}; table=1`;
  return settings + (records.length > 1
    ? `; input_records=${records.length}; assembly=DNA_concatenated_before_translation; record_order=FASTA; coordinates=joined_DNA`
    : source.header ? `; source_header=${source.header}` : '');
}

function run() {
  clear();
  if (!source) return;
  try {
    const options = {start: Number($('start').value), end: Number($('end').value), frame: Number($('frame').value), reverse: $('strand').value === 'reverse', stop: $('stop').checked};
    result = DNA.convert(source.dna, options);
    description = translationDescription(options);
    for (const key of ['rna', 'protein']) $(key).value = result[key];
    $('rnaCount').textContent = `${result.rna.length.toLocaleString('en-US')} nt`;
    $('proteinCount').textContent = `${result.protein.replace(/\*/g, '').length.toLocaleString('en-US')} aa`;
    $('rnaSave').disabled = !result.rna;
    $('faSave').disabled = $('gpSave').disabled = !result.protein;
    if ($('referenceSource').value === 'translated') resetComparison(result.protein ? 'Enter query B to start comparing.' : 'No protein sequence is available to compare.');
    const notes = ['Done.'];
    if (result.stoppedAt !== null) notes.push(`Stopped at codon ${result.stoppedAt}; the remaining sequence was not translated.`);
    else if (result.remainder) notes.push(`Ignored ${result.remainder} trailing nucleotide(s) that do not form a complete codon.`);
    if (result.protein.includes('X')) notes.push('Ambiguous codons are shown as X.');
    if (result.protein.includes('*')) notes.push('Retained * symbols mark stops and are excluded from the amino acid count. Exports keep these symbols.');
    if (!result.protein) notes.push('No amino acids to export. Check the interval, strand and reading frame.');
    status(notes.join(' '));
  } catch (e) { status(e.message, true); }
}

$('file').addEventListener('change', async () => {
  const token = ++loadToken;
  resetImport();
  $('dnaInput').value = '';
  const file = $('file').files[0];
  if (!file) { status('Choose a file.'); return; }
  try {
    if (file.size > MAX_DNA_INPUT_BYTES) throw Error('The file exceeds 10 MB. Choose a smaller file.');
    status('Reading file…');
    const buffer = await file.arrayBuffer();
    if (token !== loadToken) return;
    install(DNA.parse(buffer), file.name);
  } catch (e) { if (token === loadToken) status(e.message, true); }
});
$('dnaInput').addEventListener('input', () => {
  // A newer pasted draft takes precedence over any pending file read.
  ++loadToken;
  $('file').value = '';
  resetImport();
  status($('dnaInput').value.trim()
    ? 'Pasted DNA changed. Click Use pasted DNA to import and translate.'
    : 'Choose a file or paste DNA to get started.');
});
$('pasteImport').onclick = () => {
  ++loadToken;
  $('file').value = '';
  resetImport();
  try {
    const text = $('dnaInput').value;
    if (!text.trim()) throw Error('Paste a DNA sequence or FASTA records first.');
    if (text.length > MAX_DNA_INPUT_BYTES) throw Error('Pasted DNA exceeds 10 MB. Paste a smaller sequence.');
    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > MAX_DNA_INPUT_BYTES) throw Error('Pasted DNA exceeds 10 MB. Paste a smaller sequence.');
    const data = DNA.parse(bytes.buffer);
    install(data, data.format === 'FASTA' ? 'pasted-sequence.fasta' : 'pasted-sequence.txt', {fromPaste: true});
  } catch (e) { status(e.message, true); }
};
$('demo').onclick = () => {
  ++loadToken;
  $('file').value = '';
  install({dna: 'ATGGCTTGTAAATGA', format: 'Built-in example', circular: false}, 'example.dna');
};
$('run').onclick = run;
for (const key of ['start', 'end', 'strand', 'frame', 'stop']) $(key).addEventListener('input', () => {
  clear();
  status(source ? 'Settings changed. Click Transcribe & translate again.' : 'Choose a file or use pasted DNA first.');
});

function showMatches() {
  const limit = Math.min(matchShown + 20, matchResult.matches.length);
  const fragment = document.createDocumentFragment();
  for (let i = matchShown; i < limit; i++) {
    const hit = matchResult.matches[i], li = document.createElement('li');
    const title = document.createElement('strong'), context = document.createElement('div');
    title.textContent = `Positions ${hit.start}–${hit.end} (${matchResult.query.length} characters)`;
    context.className = 'match-context';
    const left = Math.max(0, hit.start - 16), right = Math.min(comparedReference.length, hit.end + 15);
    const mark = document.createElement('mark');
    mark.textContent = comparedReference.slice(hit.start - 1, hit.end);
    context.append(document.createTextNode((left ? '…' : '') + comparedReference.slice(left, hit.start - 1)), mark,
      document.createTextNode(comparedReference.slice(hit.end, right) + (right < comparedReference.length ? '…' : '')));
    li.append(title, context);
    fragment.append(li);
  }
  $('matchList').append(fragment);
  matchShown = limit;
  $('matchMore').hidden = limit === matchResult.matches.length;
  $('matchMore').textContent = `Show more (${limit} / ${matchResult.matches.length} shown)`;
}

function metric(label, value, hint) {
  const box = document.createElement('div');
  box.className = 'metric';
  for (const [tag, text] of [['span', label], ['strong', value], ['small', hint]]) {
    const node = document.createElement(tag); node.textContent = text; box.append(node);
  }
  return box;
}
const percent = value => (value * 100).toFixed(1) + '%';

function rangeOverview(label, length, start, end, query = false) {
  const box = document.createElement('div'), heading = document.createElement('div');
  box.className = 'range-item'; heading.className = 'range-label';
  const title = document.createElement('strong'), positions = document.createElement('span');
  title.textContent = label;
  positions.textContent = `${start}–${end} / ${length.toLocaleString('en-US')} total`;
  heading.append(title, positions);
  const track = document.createElement('div'), fill = document.createElement('div');
  track.className = 'range-track'; fill.className = 'range-fill' + (query ? ' query' : '');
  fill.style.left = `${(start - 1) / length * 100}%`;
  fill.style.width = `${(end - start + 1) / length * 100}%`;
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `${label}, length ${length}, aligned positions ${start} to ${end}`);
  track.append(fill);
  const caption = document.createElement('div');
  caption.className = 'range-caption';
  caption.textContent = `Unaligned prefix: ${start - 1} · Aligned span: ${end - start + 1} · Unaligned suffix: ${length - end}`;
  box.append(heading, track, caption);
  return box;
}

function columnKind(a, b) { return a === '-' || b === '-' ? 'gap' : a === b ? 'same' : 'mismatch'; }
function alignmentLine(label, start, sequence, end, kinds) {
  const line = document.createElement('div');
  line.append(document.createTextNode(`${label} ${String(start).padStart(6)}  `));
  // One span per run keeps large alignments inexpensive to display.
  for (let i = 0; i < sequence.length;) {
    let j = i + 1;
    while (j < sequence.length && kinds[j] === kinds[i]) j++;
    const span = document.createElement('span'); span.className = 'residue ' + kinds[i];
    span.textContent = sequence.slice(i, j); line.append(span); i = j;
  }
  line.append(document.createTextNode(`  ${end}`));
  return line;
}

function showAlignment() {
  if (!alignment) return;
  const limit = Math.min(alignmentShown + 600, alignment.columns), fragment = document.createDocumentFragment();
  for (let i = alignmentShown; i < limit; i += 60) {
    const a = alignment.alignedReference.slice(i, i + 60), b = alignment.alignedQuery.slice(i, i + 60);
    const kinds = Array.from(a, (ch, j) => columnKind(ch, b[j]));
    const symbols = Array.from(a, (ch, j) => kinds[j] === 'same' ? '|' : kinds[j] === 'mismatch' ? '.' : ' ').join('');
    const countA = a.replace(/-/g, '').length, countB = b.replace(/-/g, '').length;
    const block = document.createElement('div'); block.className = 'alignment-block';
    block.append(alignmentLine('A', countA ? alignmentReferencePosition : '—', a, countA ? alignmentReferencePosition + countA - 1 : '—', kinds),
      alignmentLine(' ', '', symbols, '', kinds),
      alignmentLine('B', countB ? alignmentQueryPosition : '—', b, countB ? alignmentQueryPosition + countB - 1 : '—', kinds));
    alignmentReferencePosition += countA; alignmentQueryPosition += countB; fragment.append(block);
  }
  $('alignmentDetails').append(fragment);
  alignmentShown = limit;
  $('alignmentMore').hidden = limit === alignment.columns;
  $('alignmentMore').textContent = `Show more (${limit} / ${alignment.columns} columns shown)`;
}

function renderAlignment() {
  const a = alignment;
  $('alignmentResults').hidden = false;
  $('alignMetrics').append(metric('Local identity', percent(a.identity), `${a.matches} identical / ${a.columns} columns (including gaps)`),
    metric('Query B coverage', percent(a.queryCoverage), `${a.queryEnd - a.queryStart + 1} / ${a.queryLength} characters aligned`),
    metric('Reference A coverage', percent(a.referenceCoverage), `${a.referenceEnd - a.referenceStart + 1} / ${a.referenceLength} characters aligned`),
    metric('Difference columns', String(a.mismatches + a.gaps), `${a.mismatches} mismatch(es) · ${a.gaps} gap(s) · Score ${a.score}`));
  $('alignRanges').append(rangeOverview('A · Reference', a.referenceLength, a.referenceStart, a.referenceEnd),
    rangeOverview('B · Query', a.queryLength, a.queryStart, a.queryEnd, true));
  let outcome;
  if (a.reference === a.query) outcome = 'The two sequences are identical.';
  else if (a.mismatches === 0 && a.gaps === 0 && a.queryCoverage === 1) outcome = 'The entire query B exactly matches a region of reference A.';
  else outcome = 'The sequences differ. The highest-scoring local alignment is shown below.';
  $('matchStatus').textContent = `${outcome}\nReference A: ${a.referenceStart}–${a.referenceEnd}; query B: ${a.queryStart}–${a.queryEnd}. These are 1-based, inclusive positions.`;
  const note = ['One optimal local alignment is shown; other equally scoring alignments may exist. High identity over a short region does not imply whole-sequence identity.'];
  if (/[XBZJ*]/.test(a.reference + a.query)) note.push('Ambiguous letters or * are present and scored literally. Matching X symbols do not confirm amino acid identity.');
  $('alignmentNote').textContent = note.join(' ');
  alignmentReferencePosition = a.referenceStart; alignmentQueryPosition = a.queryStart;
  showAlignment();
  $('alignmentSave').disabled = false;
}

async function compare() {
  resetComparison('Comparing…');
  const token = comparisonToken;
  try {
    if (!referenceText().trim()) throw Error('Translate or enter reference protein A first.');
    comparedReference = DNA.normalizeProtein(referenceText());
    alignmentContext = referenceDescription();
    if ($('matchMode').value === 'exact') {
      matchResult = DNA.matchProtein(comparedReference, $('query').value);
      const count = matchResult.matches.length;
      $('matchStatus').textContent = count ? `Found ${count} exact match(es). Positions refer to reference A.` : 'No exact matches found. Switch to local alignment to allow mismatches and gaps.';
      $('matchSave').disabled = !count;
      $('exactResults').hidden = false;
      showMatches();
      return;
    }
    controller = new AbortController();
    $('alignProgress').value = 0;
    updateComparisonControls();
    const computed = await DNA.alignProtein(comparedReference, $('query').value, {
      signal: controller.signal,
      onProgress: progress => {
        if (token !== comparisonToken) return;
        $('alignProgress').value = progress;
        $('matchStatus').textContent = `Computing the best local alignment… ${Math.round(progress * 100)}%`;
      }
    });
    if (token !== comparisonToken) return;
    alignment = computed;
    if (!alignment.columns) {
      $('matchStatus').textContent = 'No positive-scoring local alignment was found with these scoring rules. Check the sequences; this result does not determine homology.';
      return;
    }
    renderAlignment();
  } catch (e) {
    if (token !== comparisonToken) return;
    $('matchStatus').textContent = e.message;
    $('matchStatus').className = e.name === 'AbortError' ? '' : 'error';
  } finally {
    if (token === comparisonToken) { controller = null; updateComparisonControls(); }
  }
}

$('matchRun').onclick = compare;
$('matchCancel').onclick = () => resetComparison('Alignment cancelled. Edit the sequences or try again.');
for (const key of ['query', 'reference']) $(key).addEventListener('input', () => resetComparison());
for (const key of ['matchMode', 'referenceSource']) $(key).addEventListener('change', () => resetComparison('Comparison settings changed. Run the comparison again.'));
$('matchMore').onclick = showMatches;
$('alignmentMore').onclick = showAlignment;
$('alignDemo').onclick = () => {
  $('referenceSource').value = 'manual';
  $('matchMode').value = 'local';
  $('reference').value = 'PPPACDEFGHIKLMNPQRSTVWYQQQ';
  $('query').value = 'SSACDMEFGHIKLMNPQASTVWYTT';
  compare();
};

function alignmentText(a) {
  const output = ['Local protein alignment (Smith-Waterman)', alignmentContext,
    'Scores: literal match +2; mismatch -1; each gap -2. One optimal local alignment shown.',
    'Coordinates: 1-based, inclusive original sequence characters; * counts, gaps do not.',
    `Reference A: ${a.referenceStart}..${a.referenceEnd} / ${a.referenceLength}`,
    `Query B: ${a.queryStart}..${a.queryEnd} / ${a.queryLength}`,
    `Score: ${a.score}; identity: ${percent(a.identity)}; reference coverage: ${percent(a.referenceCoverage)}; query coverage: ${percent(a.queryCoverage)}`,
    `Matches: ${a.matches}; mismatches: ${a.mismatches}; gap columns: ${a.gaps}; columns: ${a.columns}`,
    'Ambiguous letters and * are literal. No statistical significance or homology inference.',
    'Legend: | same, . mismatch, - gap', ''];
  let r = a.referenceStart, q = a.queryStart;
  for (let i = 0; i < a.columns; i += 60) {
    const ref = a.alignedReference.slice(i, i + 60), query = a.alignedQuery.slice(i, i + 60);
    const nr = ref.replace(/-/g, '').length, nq = query.replace(/-/g, '').length;
    output.push(`A ${String(nr ? r : '-').padStart(6)}  ${ref}  ${nr ? r + nr - 1 : '-'}`,
      '          ' + Array.from(ref, (ch, j) => ch === '-' || query[j] === '-' ? ' ' : ch === query[j] ? '|' : '.').join(''),
      `B ${String(nq ? q : '-').padStart(6)}  ${query}  ${nq ? q + nq - 1 : '-'}`, '');
    r += nr; q += nq;
  }
  return output.join('\n') + '\n';
}
$('matchSave').onclick = () => {
  if (matchResult?.matches.length) save('# ' + alignmentContext + '\n# Coordinates: 1-based inclusive reference characters; * counts as a position.\n# Query: ' + matchResult.query + '\nmatch\tstart\tend\n' + matchResult.matches.map((hit, i) => `${i + 1}\t${hit.start}\t${hit.end}`).join('\n') + '\n', '.matches.tsv');
};
$('alignmentSave').onclick = () => { if (alignment?.columns) save(alignmentText(alignment), '.alignment.txt'); };

function save(text, extension, baseName = name) {
  const filename = baseName.replace(/[^A-Za-z0-9_\u4e00-\u9fff.-]/g, '_') + extension;
  // The desktop app presents a native Save dialog; ordinary browsers download.
  const nativeSave = globalThis.webkit?.messageHandlers?.saveFile;
  if (nativeSave) {
    nativeSave.postMessage({filename, text});
    return;
  }
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('rnaSave').onclick = () => { if (result) save(DNA.fasta((source.id || name) + '_rna', result.rna, 'selected oriented interval; ' + description), '.rna.fasta'); };
$('faSave').onclick = () => { if (result) save(DNA.fasta((source.id || name) + '_protein', result.protein, description), '.protein.fasta'); };
$('gpSave').onclick = () => { if (result) save(DNA.genpept((source.id || name) + '_protein', result.protein, description), '.gp'); };
updateComparisonControls();

$('alignmentLimit').textContent = DNA.ALIGNMENT_LIMITS.maxCells.toLocaleString('en-US');
