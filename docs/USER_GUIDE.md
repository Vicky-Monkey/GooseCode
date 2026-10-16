# GooseCode user guide

GooseCode transcribes DNA to RNA, translates selected DNA intervals, and compares amino-acid sequences. Computation happens locally in the browser or macOS app. This guide describes the current working copy and development app, including unreleased multi-record DNA FASTA support. The base version remains 1.3.0; new release ZIPs have not been generated.

## Getting started

For a hosted browser version, visit its URL in Microsoft Edge, Google Chrome or Firefox on Windows, Linux or macOS. No app installation, account, Node.js or Python is required. This working copy does not yet specify a live website URL; the [static website guide](WEB_DEPLOYMENT.md) explains how to prepare and publish one.

For local use, open `index.html` from a downloaded source folder, keeping the HTML, JavaScript, CSS and `assets/` in their original directory structure. The local copy does not need an internet connection. Both browser options use the same sequence algorithms and interface as the macOS app.

For macOS, open the current local `dev/GooseCode.app`. To create or rebuild it from source, run `bash macos/build.sh --dev` on a Mac with Apple Command Line Tools installed. This produces the development app without generating release ZIPs. See the [macOS guide](../macos/README.md) for installation, signing, and build details.

1. Select a SnapGene `.dna` file, single- or multi-record DNA FASTA, or plain DNA text. Alternatively, paste plain DNA or DNA FASTA into the text box in **Import**, then click **Use pasted DNA**. Each file or pasted input is limited to 10 MiB (10 × 1024 × 1024 bytes).
2. Choose the coding-strand direction, reading frame, and interval. The defaults are the input's forward strand, frame 1, and the complete sequence.
3. Click **Transcribe & translate** after changing a parameter. Importing a file or clicking **Use pasted DNA** calculates results automatically using the current direction, frame, and stop policy, with the interval reset to the complete new sequence.
4. Save the protein as FASTA or GenPept `.gp`. RNA can also be saved as FASTA. A browser uses its download location; the macOS app opens a system Save dialog.

Click **Try an example**, or import the included `example.dna`, to use:

```text
DNA:     ATGGCTTGTAAATGA
RNA:     AUGGCUUGUAAAUGA
Protein: MACK
```

The final `TGA` is a stop codon. The default stop policy omits it and ends translation.

### Swimming-goose illustration

The cartoon goose swims from left to right, leaving lettered amino-acid beads where a DNA double helix appeared before it. The scene animates and loops automatically. It is illustrative: it does not represent the imported sequence or the progress of a calculation. The animation respects the system's reduced-motion preference and stops when it is offscreen or the page is in the background. All artwork and animation files are included locally, so it works offline.

## DNA input and translation

DNA input accepts IUPAC DNA letters (`ACGTRYSWKMBDHVN`). Case and whitespace are ignored. RNA `U`, numbers, and punctuation are not accepted. DNA FASTA may contain one or more records, each beginning with a nonempty `>` header and containing a nonempty DNA sequence. Any malformed record rejects the whole input with record and line context. Multiple DNA records are concatenated in FASTA order before transcription and translation, without separators, so a codon may span a record boundary.

### Paste DNA

Paste a plain DNA sequence or complete DNA FASTA text into the box in **Import**, using `⌘V` on macOS or `Ctrl+V` in other systems. Click **Use pasted DNA** to import and translate it. The text limit is 10 MiB measured as UTF-8 bytes, including headers and whitespace. SnapGene binary data must be imported as a file.

The pasted text remains editable. Editing it clears RNA, protein, exports and any comparison using the translated protein until you click **Use pasted DNA** again. Comparisons between two manually entered proteins remain independent. Importing a file or loading **Try an example** clears the paste box and replaces its source.

Exports from pasted DNA use the filename base `pasted-sequence` (for example, `pasted-sequence.protein.fasta`). A single FASTA record retains its original ID in the exported sequence identifier. Multiple records follow the same DNA-first concatenation and single-record export rules described below.

All input sequences are interpreted as **5′ → 3′**. If the supplied sequence is the template strand written 5′ → 3′, select the reverse-complement direction to obtain the coding strand.

Interval coordinates start at 1 and include both endpoints. Processing follows this order:

1. Join all DNA records in file order, then take the selected interval from that combined forward sequence. For a single record, use its original forward sequence.
2. Apply the selected strand direction to that interval.
3. For protein translation, skip 0, 1, or 2 nucleotides according to the reading frame.

RNA contains the **complete oriented interval**, with `U` replacing `T`. The reading frame and stop policy affect protein translation only.

RNA and protein results contain continuous sequence text without inserted line breaks. They wrap to fit the output box on screen; copying the text preserves one uninterrupted sequence. FASTA and GenPept exports retain their usual file formatting.

### Translation rules and limitations

- The standard genetic code (NCBI table 1) is used. Mitochondrial and other alternative genetic codes are not supported. Alternative start codons are not forced to translate as methionine.
- Translation starts directly at the selected reading frame. It does not search for an `ATG` start codon or require the first codon to be `ATG`.
- CDS annotations are not interpreted. The tool does not predict genes or splice introns. Select the coding interval yourself; translating a complete plasmid or genome does not necessarily produce a biological protein.
- Circular input is recognized, but only a linear interval that does not cross the file's end can be selected. Position 1 is the first nucleotide stored in the file, not an automatically detected biological origin or start codon. With the default forward strand, Start 1 and frame 1, translation begins there; the selected interval, strand and frame determine any other start.
- By default, translation stops at the first stop codon and does not include `*`. Clear this option to retain stop codons as `*`. Both FASTA and GP exports preserve retained `*` characters; some downstream tools may not accept them.
- Any codon containing an ambiguous IUPAC base becomes `X`, without further inference, even if a more specific amino acid could be inferred.
- One or two trailing nucleotides do not form a complete codon and are not translated.

GenPept `.gp` export is a **GenPept-style protein flat file** containing a local translation result. It is not an official NCBI record and does not carry the original DNA annotations. Export metadata records the strand, interval, and translation parameters.

### Multi-record FASTA

Importing multiple DNA records automatically concatenates their DNA in FASTA order and translates the resulting sequence. The summary shows the number of input records and the combined DNA length. **Merged RNA** and **Merged Protein** show one continuous sequence each; individual records are not displayed separately and no batch action is required. Duplicate IDs do not remove or reorder records.

The included [multi-record example](../examples/multi-record.fasta) exercises this workflow.

For example, these three records:

```fasta
>part_1
AT
>part_2
GGCT
>part_3
TAAATG
```

produce joined DNA `ATGGCTTAAATG`, RNA `AUGGCUUAAAUG`, and protein `MA` with the default first-stop policy. The first `ATG` codon crosses the boundary between records 1 and 2. Clear **Stop at the first stop codon (omit *)** and click **Transcribe & translate** to produce `MA*M`, including the sequence after the stop. No linker or gap characters are inserted at record boundaries.

Start/End initially cover the full joined DNA and subsequently refer to positions in that joined forward sequence. Strand direction, reading frame and stop policy are applied once, after joining: reverse-complement mode reverses the entire selected interval, the frame skips bases once, and translation does not restart at a record boundary. RNA always includes the complete oriented selected interval, including sequence beyond a translation stop.

The merged protein is automatically selected as reference **A** in section **04**, even if a manually entered reference was selected before import. Enter query **B**, then use exact search or local alignment. Comparison coordinates refer to the merged protein, not to individual FASTA records. Search or alignment limits still apply to the combined protein length.

The usual **Save RNA FASTA**, **Save FASTA** and **Save GenPept (.gp)** buttons each export one combined record, named from the imported filename. Metadata includes `input_records=N; assembly=DNA_concatenated_before_translation; record_order=FASTA;` alongside the interval, strand, frame and stop policy. Protein export is disabled when translation produces no amino acids. Editing translation settings clears the current results until **Transcribe & translate** runs again.

Concatenation uses the supplied order directly. It does not infer overlaps, join contigs biologically, remove introns, or determine whether records belong to the same coding sequence. Use this mode when the records represent the ordered DNA fragments you intend to translate as one sequence.

## Amino-acid search and alignment

In section **04**, the translated protein is reference sequence **A** by default. For multi-record DNA input, this is the single merged protein. Paste the protein to compare into sequence **B**. Importing another multi-record file selects its merged translated protein as A and clears the preceding comparison. To compare two proteins without importing DNA, change the reference source to the option for pasting another amino-acid sequence, then enter A and B directly.

Both protein inputs accept a plain single-letter sequence or a single FASTA record. Case, spaces, and line breaks are ignored. Numbers, input gaps, and punctuation are rejected. Supported letters are the standard amino-acid codes plus `B`, `X`, `Z`, `J`, `U`, `O`, and `*`.

Changing a sequence, reference source, or comparison mode clears the previous result and cancels any running alignment. Changing translation parameters invalidates comparisons that use the translated protein. A comparison between two manually entered proteins is unaffected.

### Local alignment

Local alignment is the default comparison mode. Start the alignment to find a highest-scoring local region, allowing mismatches, insertions, and deletions.

The result shows the start and end in each sequence. For example, the aligned region may begin at A position 4 and B position 3. The sequence ends are not forced into the alignment.

The visualization includes:

- **Range bars:** the colored region is the aligned interval; gray regions are unaligned. Each bar is scaled to its own sequence's total length. The two bars do not share a common length scale.
- **Column view:** green and `|` indicate identical characters, yellow and `.` indicate mismatches, and purple with `-` in a sequence indicates a gap. Symbols supplement the colors. Each block contains up to 60 columns; long lines can be scrolled horizontally.
- **Pagination:** the first 600 columns are shown initially. Use **Show more** to reveal additional columns.
- **Metrics:** identity, coverage of A and B, mismatch count, gap count, and alignment score.

**Identity** is the number of identical columns divided by the total number of alignment columns, including gaps. **Coverage** is the number of original sequence characters participating in the aligned interval divided by the full sequence length, calculated separately for A and B. Difference columns are mismatch columns plus gap columns.

Use **Cancel alignment** to stop an ongoing calculation. **Save alignment (.txt)** exports the complete best alignment, including columns not yet expanded in the interface, along with coordinates, scoring information, and coverage.

The difference example demonstrates unaligned flanks, one insertion, and one mismatch. Loading it replaces the A and B protein inputs and switches to a manually entered reference; it does not replace the DNA above.

### How the alignment is scored

The algorithm is Smith–Waterman local alignment:

| Column type | Score |
| --- | ---: |
| Identical characters | +2 |
| Different characters | −1 |
| Each gap character | −2 |

This is a linear gap penalty, not an affine gap model. No BLOSUM substitution matrix is used. Only one best alignment is displayed. If multiple endpoints reach the same maximum score, the first endpoint encountered in A-then-B order is retained. Tied traceback choices prefer a diagonal step, then a step consuming an A character, then a step consuming a B character.

This locates similar local sequence regions. It is not a global alignment or a statistical significance test. Even one shared character can produce a positive local score. Consider identity, alignment length, and coverage together; high local identity alone does not establish homology.

Ambiguous letters such as `X`, `B`, `Z`, and `J`, as well as `*`, are compared **literally**. For example, `X` matches only `X`: it is not a wildcard, and such a match does not establish the underlying amino-acid identity.

### Coordinates

All protein coordinates are **1-based and inclusive**, relative to the corresponding input protein sequence. A retained `*` occupies one original sequence position. Inserted alignment gaps (`-`) do not occupy original positions. These are protein-input coordinates, not coordinates in the original DNA.

### Size limits and performance

For local alignment, each sequence may contain at most **200,000 characters**, and the product of the two lengths must be **80,000,000 or less**. Equality is allowed; `10,000 × 8,000` is valid. Inputs above a limit trigger an error and are not silently truncated.

The algorithm processes A length × B length comparison cells, so computation grows with that product. Traceback storage uses one byte per cell: about 80 MB (76.3 MiB) at the limit, in addition to score rows, the page, and the runtime. The calculation periodically yields to the interface so progress can update and cancellation can be handled. All computation remains local.

### Exact search

Choose exact search to find every complete occurrence of B within A, including overlapping hits. Results show the matching intervals and highlight the surrounding sequence. Twenty hits are shown at a time; use **Show more** to continue or save all positions as a TSV file.

For example, searching for `ACK` in `MACK` produces position **2–4**. If there is no complete hit, switch to local alignment to inspect partial similarity.

Exact search also uses literal character comparison. It does not allow mismatches or gaps.

## Saving and privacy

Available exports are:

| Result | Format |
| --- | --- |
| RNA sequence | FASTA (`.rna.fasta`) |
| Protein sequence | FASTA (`.protein.fasta`) |
| Protein sequence and translation metadata | GenPept-style `.gp` |
| All exact-match positions | TSV |
| Complete best local alignment and metrics | TXT |

For multi-record DNA input, each RNA/protein export above contains the one merged result, with concatenation metadata. Files and sequence results are processed in local memory. There is no sequence-upload feature, backend or database. Browser exports are created locally and saved through the browser's download mechanism; the native Mac app uses a system Save dialog. Refreshing or closing the page, or quitting the app, clears the current session; export results first if you need to keep them. External reference links open websites only when selected.

Opening a hosted copy makes ordinary requests for static application files such as HTML, JavaScript, CSS and images. DNA, protein and generated results are not included in those requests. Once these resources have loaded, the open page can continue importing files, computing and exporting while offline. Reloading offline or opening a new session offline is not guaranteed: GooseCode has no service worker or PWA cache. Use a downloaded local source folder or the macOS app when you need to start without a network connection.

## Validation and references

The automated core suite covers identical sequences, local starts, mismatches, insertions/deletions, no positive match, overlapping exact hits, input validation, length limits, cancellation, and export regression. Multi-record core tests cover record parsing and metadata, malformed input, ordered DNA concatenation, cross-record codons and global translation settings. Browser tests cover both direct local files and a staged static site hosted under `/GooseCode/`, including downloads, refresh behavior, network requests and operation after going offline. The native macOS smoke test exercises import, transcription/translation, alignment and exports, including merged-sequence content and metadata. See [development instructions](../CONTRIBUTING.md) for test commands; these descriptions do not replace checking the results of a particular build or imply testing on every browser/operating-system combination.

The existing algorithm was additionally cross-checked against Biopython `PairwiseAligner` for 160 sequence pairs, including scores, all four endpoints, and gapped alignment strings. The example SnapGene file and GenPept export were independently read with Biopython during earlier validation.

Implementation and format references:

- [Biopython SnapGene reader](https://github.com/biopython/biopython/blob/master/Bio/SeqIO/SnapGeneIO.py)
- [NCBI flat-file fields](https://www.ncbi.nlm.nih.gov/genbank/samplerecord/)
- [Biopython pairwise alignment documentation](https://biopython.org/docs/1.86/Tutorial/chapter_pairwise.html)
