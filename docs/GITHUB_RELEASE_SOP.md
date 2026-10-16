# GooseCode GitHub release SOP

Use this procedure when publishing the source or preparing a future macOS release. The current workspace contains source, documentation and `dev/GooseCode.app`; static files can be staged in `dist/web/`. No repository, live Pages site or new release has been published by local preparation. The base version is **1.3.0**, with current changes listed under **Unreleased** in the changelog.

The example repository name is `GooseCode`. Replace `X.Y.Z` below with the version selected for the next release. Publishing the browser site is independent of a tagged release or a macOS app download: follow [WEB_DEPLOYMENT.md](WEB_DEPLOYMENT.md) for the minimal static-site procedure.

## 1. Prepare the source and version

Use this project's directory as the repository root. Do not include the surrounding workspace or other projects' data.

- Review the [README](../README.md), [user guide](USER_GUIDE.md) and [changelog](../CHANGELOG.md) against the features being released.
- Choose a license, add a root `LICENSE` file, and describe it in the README. No license has been selected yet.
- Update the version and build number in `package.json` and `macos/Info.plist`, together with the README and changelog. Move completed Unreleased entries into the new version section.
- Keep `.gitignore` and `.github/workflows/pages.yml`. Exclude generated `dev/`, `dist/` (including `dist/web/`), `macos/.build/`, `node_modules/`, credentials and personal sequence data from the source repository.

Describe multi-record FASTA accurately: DNA records are joined in file order before one transcription and translation; the resulting protein becomes reference A. The default first-stop policy still applies. The goose animation is illustrative and is independent of sequence data and calculation progress.

## 2. Validate and generate the release artifacts

Run these commands from the project root when a release is ready:

```sh
node --test tests/*.test.js
npm install
npx playwright install chromium
npm run test:browser
npm run test:browser:fasta
npm run build:web
npm run test:web
bash macos/build.sh
"./dist/GooseCode.app/Contents/MacOS/GooseCode" --smoke-test
python3 scripts/package_source.py
```

These full release steps need Node.js, Python 3 and Apple Command Line Tools. The native smoke test needs a graphical macOS session. For a browser-only deployment, omit the native build, native smoke test and release ZIP commands; use the [static website instructions](WEB_DEPLOYMENT.md). See [contributing](../CONTRIBUTING.md) and the [macOS guide](../macos/README.md) for details. Browser users and users of the packaged app do not need these development tools.

| Output | Purpose |
| --- | --- |
| `dist/GooseCode.app` | Local verification of the release build |
| `dist/GooseCode-macOS.zip` | App download attached to a GitHub Release |
| `dist/GooseCode-source.zip` | Source archive generated from an explicit allowlist |
| `dist/web/` | Static browser files deployed separately through GitHub Pages |

For everyday development, use `bash macos/build.sh --dev`. It creates only `dev/GooseCode.app`, without a release ZIP.

## 3. Create the repository and upload source

Create a repository at [GitHub](https://github.com/new), or use an existing repository dedicated to GooseCode. A suitable description is: `Offline DNA transcription, protein translation, and visual local alignment for macOS and the browser.` The source already contains a README and `.gitignore`; keep those files when setting up the repository.

Upload the contents of the project directory to the repository root, preserving subdirectories. If using the optional source ZIP, extract it and upload the contents of `goosecode/`. The root should directly contain `README.md`, `index.html`, `core.js`, `app.js`, the animation files, `assets/`, `examples/`, `docs/`, `macos/`, `scripts/` and `tests/`. Include hidden `.gitignore` and `.github/workflows/pages.yml`; Finder shows hidden files with `⌘⇧.`. Do not upload the parent `TOOL BOX` workspace.

Review the license, screenshots and documentation links before committing. If using a pull request, merge the reviewed changes before creating the release tag. See GitHub's guides to [adding files](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) and [adding a license](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository).

To publish the browser site, select **Settings → Pages → Build and deployment → Source: GitHub Actions**, then run the Pages workflow. Its configured automatic branch is `main`; adjust this if needed. The workflow publishes `dist/web/`, not the entire source repository. Use the actual deployment URL reported by GitHub; `https://USERNAME.github.io/GooseCode/` is only an example. See [the complete deployment steps](WEB_DEPLOYMENT.md#3-publish-with-github-pages).

## 4. Prepare and publish the release

Create a draft release in the repository's Releases area. Use tag `vX.Y.Z`, target the validated source commit, and title it `GooseCode vX.Y.Z`.

Describe the changes, how to run the app, DNA concatenation and stop-codon behavior, tested platforms and scientific limits. Attach the newly generated `GooseCode-macOS.zip`. State that the current build is ad-hoc signed and not Apple-notarized unless Developer ID signing and notarization have been completed separately. Apple Silicon has been tested; Intel has been compiled and statically checked, but not tested on Intel hardware.

Check the draft's version, tag and attachment before publishing. GitHub provides source archives from the tag, so the manually generated source ZIP is usually unnecessary as an extra release attachment. See [GitHub's release guide](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

## 5. Verify the published download

- Add the actual repository's Releases link to the README, and confirm that its license description matches `LICENSE`.
- Download the app ZIP into a fresh folder, extract it, and check example translation, alignment and exports.
- Import `examples/multi-record.fasta` and confirm ordered DNA joining, one translation and automatic selection of the merged protein as reference A.
- Confirm that screenshots and documentation links work, and that the app version matches the tagged source.

Use a new version tag and matching build for later updates. The `"private": true` setting in `package.json` prevents accidental npm publication; it does not determine GitHub repository visibility.
