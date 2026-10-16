# GooseCode static website

The browser version uses the existing shared application. A user opens its URL in Microsoft Edge, Google Chrome or Firefox on Windows, Linux or macOS. There is no application installation, backend, database, API, framework or PWA. The macOS app continues to load the same HTML/CSS/JavaScript through its Swift WKWebView wrapper.

Local preparation does not publish a website. No GitHub repository or live URL has been configured by these changes. `https://USERNAME.github.io/GooseCode/` below is a placeholder.

## Inspection and required changes

| Item | Finding |
| --- | --- |
| A. Shared browser files | `index.html`, `app.js`, `core.js`, `sequence-swim.js`, `sequence-swim.css` and the two files in `assets/` already work in a normal browser. The sequence algorithms and UI remain unchanged. |
| B. macOS dependencies | `macos/Main.swift`, native menus/dialogs and app packaging belong only to the macOS wrapper. The existing JavaScript checks for `window.webkit.messageHandlers` before using the optional native bridge. Browser import already uses a file input and the File API; browser export already uses `Blob`, `URL.createObjectURL()` and a link's `download` attribute. |
| C. Necessary additions | Stage an explicit set of static files, test them through an HTTP repository subdirectory, add documentation and a minimal GitHub Pages workflow after browser validation. No source relocation or biological algorithm changes are required. |
| D. GitHub Pages paths/APIs | Existing script, stylesheet, image and icon paths are relative. They work under `/GooseCode/` without a root-path assumption. The hosted tests verify asset responses, animation, imports and Blob downloads without a native bridge. |

The root source layout is retained to avoid maintaining separate browser and macOS copies.

## 1. Prepare the static directory

From the GooseCode project directory, run:

```sh
python3 scripts/prepare_web.py
```

`npm run build:web` is a convenience alias for the same command. Python 3 is a packaging tool only; it is not a runtime or a backend. The script replaces `dist/web/` and copies these nine files unchanged:

```text
dist/web/
├── index.html
├── app.js
├── core.js
├── sequence-swim.js
├── sequence-swim.css
├── assets/
│   ├── goosecode-icon.png
│   └── swimming-goose.svg
├── example.dna
├── examples/
│   └── multi-record.fasta
└── .nojekyll
```

The empty `.nojekyll` marker is added during staging. Swift files, Node/Python tools, tests, documentation, app bundles and release archives are excluded. Commit the source and workflow, not the generated `dist/web/` directory.

## 2. Test before publishing

Install the development dependency and a browser, then run the preserved core/browser tests and the new hosted suite:

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
npm run test:browser:fasta
npm run build:web
npm run test:web
```

The hosted test uses a temporary loopback HTTP server to serve the staged files from `/GooseCode/`. This server exists only for testing and is never deployed. The suite checks all 13 requested workflows: pasted DNA, FASTA, SnapGene, reverse complement, reading frames, Smith–Waterman comparison, progress/cancellation, FASTA, GenPept, TSV/TXT, session clearing on refresh, no sequence-bearing network requests, and relative assets/animation. It also checks that the loaded page continues working offline.

To run the same hosted suite in Firefox:

```sh
npx playwright install firefox
GOOSECODE_BROWSER=firefox npm run test:web
```

Use `$env:GOOSECODE_BROWSER="firefox"` in Windows PowerShell, then run `npm run test:web`. `GOOSECODE_BROWSER` accepts `chromium` (default), `firefox` or `webkit`. With Chromium, `DNA_TOOL_BROWSER_CHANNEL=chrome` or `DNA_TOOL_BROWSER_CHANNEL=msedge` selects an installed Chrome or Edge instead of Playwright's bundled Chromium.

For this implementation, the hosted suite passed in **Google Chrome (Chromium engine) and Playwright Firefox 153 on macOS**, including all 13 workflows and the additional offline checks. Windows, Linux and Microsoft Edge are browser targets but were not directly tested in this environment. No new macOS binary build was needed because shared runtime files and `Main.swift` were unchanged.

## 3. Publish with GitHub Pages

1. Create or use a GitHub repository for GooseCode. Put the **contents of this project directory** at the repository root; do not upload the surrounding `TOOL BOX` workspace or nest the project one level below the root. Keep the hidden `.github/workflows/pages.yml` and `.gitignore` files. If using the optional source ZIP, upload the contents of its `goosecode/` directory.
2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. This is the configuration used by GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
3. Push the source and workflow to `main`, or open **Actions → Deploy GooseCode to GitHub Pages → Run workflow**. The supplied workflow runs for pushes to `main` and manual dispatch. If the repository uses another branch, adjust the workflow's `push.branches` value before relying on automatic deployment.
4. Wait for the workflow to succeed. It runs the standard-library Python staging script and uploads **only `dist/web/`** using the Pages artifact/deployment actions. It does not build a macOS app or create a release ZIP. Local browser validation should pass before pushing changes; the minimal deployment workflow does not repeat Playwright tests.
5. Open the actual deployment URL shown by GitHub Pages. For a repository named `GooseCode`, the usual project URL is `https://USERNAME.github.io/GooseCode/`. Replace `USERNAME` and the repository name with the actual values; capitalization and any custom domain must match the configured site.
6. On the published site, check **Try an example**, pasted DNA, file import, one comparison and a download. Confirm that the goose and icon load at the project URL. Add the verified live URL to the README only after deployment succeeds.

GitHub's [publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) explains the repository setting. Hosting availability and repository policies are controlled by the GitHub account. The same `dist/web/` contents can be served by another static host without changes to GooseCode.

## Offline use and privacy

Visiting a hosted site requests static HTML, scripts, CSS and image files. Files selected by the user, pasted sequences and generated results are processed in browser memory. They are not posted to a server or included in application network requests. Exports are created locally as Blob downloads. No external libraries are loaded from a CDN.

After the page and its resources have loaded, the open page continues computing and exporting offline. **An offline reload or a new offline session is not guaranteed.** No service worker, installation manifest or PWA cache is provided. For startup without a network connection, download the project files and open `index.html` locally, or use the macOS app.

Refresh or close the page to clear the working session. Export any results you want to retain first. A download remains on the user's computer after the browser session ends.
