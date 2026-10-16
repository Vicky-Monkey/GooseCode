# GooseCode for macOS

Current development app: **1.3.0 + unreleased changes**. The app supports offline DNA transcription, protein translation, exact search and visual local alignment, including multi-record DNA concatenation and up to 80,000,000 comparison cells.

## Install and use

1. Open the current local **GooseCode.app** in `dev/`. If starting from source without a built app, follow the development build instructions below.
2. Optionally drag the app to Applications. It is self-contained and can be moved without the source directory.
3. Choose a DNA file in the window, or use **File → Open DNA File…** (`⌘O`). You can also paste plain DNA or single-/multi-record DNA FASTA into the **Import** text box with `⌘V`, then click **Use pasted DNA**.
4. Run a translation or compare proteins. See the [user guide](../docs/USER_GUIDE.md).
5. Save buttons open native Save dialogs for RNA FASTA, protein FASTA, GenPept `.gp`, exact-match TSV, and alignment TXT.

Requires **macOS 12 or later**. The default build includes Apple Silicon and Intel. Apple Silicon has been tested; Intel has been compiled and statically checked, but not run on Intel hardware. No Python, Node.js, browser extension, or server is required to run the packaged app.

Save any results before quitting. Sequence data is held in memory and is cleared on exit. External reference links open in the default browser.

The bundled swimming-goose illustration works offline. It shows DNA turning into lettered amino-acid beads as a decorative loop, independent of sequence data and calculation progress. It animates automatically in the app and browser, respects the system's reduced-motion preference, and stops while offscreen or in the background.

## Build the development app

Install Apple Command Line Tools and run from the project root:

```sh
bash macos/build.sh --dev
# Optional single-architecture build:
bash macos/build.sh --dev arm64
```

This builds and verifies only `dev/GooseCode.app`, with Apple Silicon and Intel binaries unless an architecture is specified. It uses the bundle identifier `local.goosecode.dev` and the display name **GooseCode**, set in the staged bundle's `Info.plist`. The source `macos/Info.plist` and its base version stay unchanged. No ZIP is created. Existing development builds remain in place until the new app passes verification. The ignored `dev/` directory is for local use and is excluded from source packages.

`macos/.build/` is a generated build cache. It can be removed after a build and is recreated when needed. A build-local filesystem overlay handles a known duplicate module-map issue in some upgraded Command Line Tools installations without editing the toolchain.

## Optional future release build

The current workspace retains the development app and source; older release bundles and ZIPs have been removed. Only when preparing a new release, run:

```sh
bash macos/build.sh
```

The default produces a universal app. Pass `arm64` or `x86_64` to build a single architecture. The script generates the icon from `assets/goosecode-icon.png`, copies web assets, compiles the native WebKit wrapper, signs the app, verifies the bundle and ZIP, and only then creates or replaces these outputs:

```text
dist/GooseCode.app
dist/GooseCode-macOS.zip
```

This command does not publish to GitHub. See [release preparation](../CONTRIBUTING.md) and the [GitHub SOP](../docs/GITHUB_RELEASE_SOP.md) before packaging a release.

## Verify

In a graphical macOS session, run:

```sh
"./dev/GooseCode.app/Contents/MacOS/GooseCode" --smoke-test
```

After explicitly creating a future release build, use `"./dist/GooseCode.app/Contents/MacOS/GooseCode" --smoke-test` to verify that app as well.

This opens a temporary test window, imports the bundled synthetic example, checks file and pasted DNA import, transcription, translation, alignment, visualization, 80-million-cell processing and cancellation, and writes eight test exports to a temporary directory. Paste checks cover plain DNA, multi-record FASTA, edit invalidation, invalid-input rejection and recovery. The multi-record checks concatenate DNA before translation, verify a codon spanning record boundaries, exercise both stop policies and compare against the merged protein. The test reads merged RNA FASTA, protein FASTA and GenPept exports back to check that each contains one record, the expected sequence and concatenation metadata. It exits with a status code and prints its results. Normal launches do not run these tests.

## Signing and distribution

The current build uses a local **ad-hoc signature**. It is not signed with an Apple Developer ID and is not notarized. Downloaded copies may receive developer-verification prompts. For a public macOS release with verified developer identity, complete Developer ID signing and Apple notarization separately. Do not disable Gatekeeper to distribute the app.

Do not modify bundled files after signing. Change the project source and rebuild instead. To upgrade, save results and quit the old app, then replace any copy in Applications with the newly built app. Open **GooseCode.app** to use the current local development version.
