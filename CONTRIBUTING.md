# Development and release preparation

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Browser interface and styles |
| `core.js` | DNA parsing, translation, exports, and protein comparison |
| `app.js` | Interface state, visualization, and download/save bridge |
| `example.dna` | Small SnapGene example producing `MACK` |
| `examples/multi-record.fasta` | Ordered DNA fragments for testing combined translation |
| `tests/` | Core and browser regression tests |
| `macos/` | Native WebKit wrapper, metadata, icon generator, and build script |
| `assets/goosecode-icon.png` | Source artwork for the GooseCode app icon |
| `docs/` | English user guide, screenshots and GitHub release instructions |
| `dev/` | Current local development app; generated and excluded from source packages |
| `scripts/prepare_web.py` | Copies shared browser files into a static-only `dist/web/` directory |
| `.github/workflows/pages.yml` | Builds and deploys the static artifact to GitHub Pages |

The browser app uses plain HTML, CSS and JavaScript. Open `index.html` directly while developing; no application server or web compilation is required. The macOS wrapper loads the same root files. Keep this single shared UI and `core.js`; do not create a second copy to maintain for the website.

The working copy contains unreleased multi-record DNA FASTA support; release metadata remains at 1.3.0. Use local source files or a development build while this feature is reviewed. Older local release apps and ZIPs have been removed. No new release archives are included in the current workspace.

## Tests

Run the core suite with Node.js:

```sh
node --test tests/*.test.js
```

For the browser smoke test, install the development dependency and browser once:

```sh
npm install
npx playwright install chromium
npm run test:browser
npm run test:browser:fasta
npm run build:web
npm run test:web
```

The general browser test uses a local file URL and checks example translation, comparison modes, visualization, input changes, limits, cancellation, and exports. The dedicated FASTA browser suite exercises DNA concatenation, merged translation, automatic reference A selection and single-record exports. Core FASTA tests cover parser validation, metadata, duplicate IDs, ordered concatenation, cross-record codons and global translation settings. Test dependencies are not needed to use the app.

The static website suite (`tests/static-web-browser.cjs`) starts a temporary Node HTTP server bound to loopback, serves only `dist/web/` under `/GooseCode/`, and closes it after the test. This server is a test fixture and is not part of the browser application or deployment. The suite exercises pasted DNA, FASTA/SnapGene import, reverse complement, reading frames, local alignment, progress/cancellation, all export formats, session clearing on reload, network requests and the goose animation/assets under a repository subdirectory. It also checks operation after taking the loaded page offline.

Chromium is the default engine. To test Firefox or WebKit, install the engine and select it, for example:

```sh
npx playwright install firefox
GOOSECODE_BROWSER=firefox npm run test:web
```

`GOOSECODE_BROWSER` accepts `chromium`, `firefox` or `webkit`. For Chromium, `DNA_TOOL_BROWSER_CHANNEL=chrome` or `DNA_TOOL_BROWSER_CHANNEL=msedge` selects an installed Google Chrome or Microsoft Edge. On Windows PowerShell, set an environment variable with `$env:GOOSECODE_BROWSER="firefox"` before running `npm run test:web`. Browser targets are Edge, Chrome and Firefox across Windows, Linux and macOS; record the actual engine and operating system used when reporting validation. Passing Chromium on macOS alone does not verify Edge or Windows hardware.

After native-wrapper or packaging changes, build a development app on macOS and run the smoke test in a graphical session:

```sh
bash macos/build.sh --dev
"./dev/GooseCode.app/Contents/MacOS/GooseCode" --smoke-test
```

The development build goes to `dev/GooseCode.app` and creates no release archives. Its generated cache in `macos/.build/` can be removed after the build. See [macOS build details](macos/README.md).

The native smoke test also exercises pasted plain DNA and multi-record FASTA, invalid input, edit invalidation and recovery. Keep pasted text and file imports on the same parser and translation path, enforce the 10 MiB UTF-8 limit, and clear the paste box when importing a file through either the browser or native bridge. Editing pasted DNA must invalidate DNA-derived outputs and comparisons without disturbing a manually entered protein pair.

## Changes to scientific behavior

Keep interface text, the user guide, and tests consistent with the implementation. Changes to translation tables, ambiguous-character handling, coordinate definitions, scoring, tie-breaking, or size limits need explicit regression coverage. Do not present local identity as evidence of homology or add claims of statistical significance without implementing and documenting an appropriate method.

Multi-record DNA input must preserve FASTA order, including duplicate IDs, and concatenate all DNA without separators before applying translation settings. Apply the selected interval, reverse complement, reading frame and stop policy to the joined DNA only once. Codons can span record boundaries. Do not replace this with independent translation followed by protein concatenation. Export one combined record and preserve `input_records=N`, `assembly=DNA_concatenated_before_translation` and `record_order=FASTA` metadata. Automatically select the merged translated protein as reference A on multi-record import. Keep the first-stop checkbox policy explicit, including retained `*` characters when the option is cleared. Protein comparison continues to accept one pair only.

For a bug report, include the version, operating system/browser, reproduction steps, settings, and expected versus observed output. Use a small synthetic sequence when possible instead of unpublished or sensitive sequence data.

## Package the source for a future release

When preparing a release, run `python3 scripts/package_source.py` from the project root (Python 3 is needed only for this packaging step). This creates `dist/GooseCode-source.zip` using an explicit source-file allowlist; application binaries, caches, dependencies, hidden editor files and user sequence files are excluded. Extract the archive and use the contents of `goosecode/` as the repository root.

This optional command creates or replaces the source release ZIP. Likewise, `bash macos/build.sh` without `--dev` creates or replaces the release app and macOS ZIP. Neither command is needed to prepare or use the static website. Run them only when preparing the next release.

## Prepare the static website

Run `python3 scripts/prepare_web.py`, or its convenience alias `npm run build:web`, from the project root. Python is used only to copy an explicit allowlist of nine shared runtime/sample files unchanged and add an empty `.nojekyll` file. Each run replaces the generated `dist/web/` directory. No Python code, Node dependencies, Swift files, tests or documentation are deployed.

Use `npm run test:web` after staging and before deployment. Keep all asset and script URLs relative so the same files work at a project path such as `/GooseCode/`. Browser file import uses the File API, and export uses local Blob URLs with a download link. The optional `window.webkit.messageHandlers` bridge is used only by the native app. Do not require that bridge for browser operation.

The Pages workflow builds `dist/web/` and uploads that directory as the deployment artifact. It does not build or distribute the macOS app. See [WEB_DEPLOYMENT.md](docs/WEB_DEPLOYMENT.md) for the repository setup and offline/privacy behavior.

## Before publishing to GitHub

- Choose and add a `LICENSE` file. No license has been assigned by this preparation.
- Review the source archive for personal paths, private sequence files, credentials, and build caches.
- Run the core and browser tests, including the staged website under a repository subdirectory; build and smoke-test the macOS app if distributing it.
- Confirm that the README, changelog, package metadata, and macOS bundle report the same release version.
- Include source files, documentation and the hidden `.github/` workflow directory at the repository root. Keep generated `dist/web/`, app bundles, release archives, dependency directories, and build caches out of the source commit.
- Attach `dist/GooseCode-macOS.zip` to a release if distributing the macOS app. State that the current package is ad-hoc signed and not notarized, or complete Developer ID signing and notarization separately.
- State the tested platforms accurately: Apple Silicon has been tested; Intel has been compiled and statically checked only.

These steps prepare a release. They do not create a GitHub repository, push source, or publish a release. The [GitHub release SOP](docs/GITHUB_RELEASE_SOP.md) describes the later publication steps.
