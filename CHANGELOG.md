# Changelog

## Unreleased

- Prepare a static browser website from the existing shared HTML/CSS/JavaScript and local assets, retaining the root source layout and the macOS wrapper.
- Add an explicit static-file staging script, a repository-subdirectory browser suite and GitHub Pages deployment instructions/workflow; no backend, framework or PWA is introduced.
- Document hosted-page privacy, browser targets and offline behavior, including the distinction between an already loaded page and an offline reload.
- Add direct DNA pasting in Import for plain sequences and single-/multi-record FASTA, with immediate translation, a 10 MiB UTF-8 limit, and invalidation of DNA-derived results when the text changes.
- Rename the app and project to GooseCode and use the supplied goose-and-DNA artwork as its app icon.
- Remove the animation control button; retain automatic animation, reduced-motion support, and offscreen/background suspension.
- Keep documentation in English and remove the Chinese quickstart.
- Support single- and multi-record DNA FASTA with ordered records, original headers, duplicate IDs, and record-specific validation errors.
- Concatenate all DNA records in FASTA order before transcription and translation, producing one continuous RNA sequence and one protein sequence without individual-record controls.
- Apply intervals, strand direction, reading frame and stop policy globally to the joined DNA. Allow codons across record boundaries and preserve the default first-stop policy.
- Export RNA FASTA, protein FASTA or GenPept as a single combined record, including input record count, concatenation method and FASTA ordering in the metadata.
- Automatically use the merged protein as reference A for the next search or alignment; retain support for manually entered protein pairs.
- Add a separate `--dev` macOS build that creates no release ZIP; retain 1.3.0 as the base version while this feature remains unreleased.
- Consolidate current examples and documentation in the project directory and remove obsolete local app bundles, release archives and build caches.

## 1.3.0

- Add an offline swimming-goose illustration: a DNA double helix ahead of the goose becomes lettered amino-acid beads behind it.
- Support the system's reduced-motion preference and suspend animation while offscreen or in the background.
- Keep the illustration independent of imported sequences and calculation progress; bundle all animation assets with browser sources and the macOS app.

## 1.2.1

- Display RNA and protein as continuous sequence text, wrapping only to fit the output box instead of inserting a line break every 60 characters.
- Copy RNA and protein results without embedded line breaks; preserve FASTA and GenPept export formatting.

## 1.2.0

- Translate the browser interface, macOS interface, messages, and documentation into English.
- Add a repository README, detailed English user guide, and development/release instructions.
- Preserve the existing translation rules, exact search, alignment scoring, coordinate conventions, export formats, and 80,000,000-cell alignment limit.

## 1.1.0

- Raise the maximum local-alignment length product from 8,000,000 to 80,000,000, inclusive.
- Retain the 200,000-character limit for each sequence.
- Preserve progress reporting, cancellation, scoring, coordinates, and results.
- Use one byte of traceback storage per comparison cell, requiring about 80 MB at the new limit, plus other runtime memory.
