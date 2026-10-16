import AppKit
import WebKit
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var pageURL: URL!
    private var pageLoaded = false
    private var pendingFile: URL?
    private var panelOpen = false
    private let smokeMode = CommandLine.arguments.contains("--smoke-test")
    private var smokeDirectory: URL?
    private var smokeExports: [String] = []
    private let applicationName = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "GooseCode"

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let webDirectory = Bundle.main.resourceURL?.appendingPathComponent("Web"),
              FileManager.default.fileExists(atPath: webDirectory.appendingPathComponent("index.html").path) else {
            fatalError("Application resources are missing. Extract the complete application again.")
        }
        pageURL = webDirectory.appendingPathComponent("index.html").standardizedFileURL
        makeMenus()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(self, name: "saveFile")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        let available = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1280, height: 900)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: min(1180, available.width - 60), height: min(860, available.height - 60)),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = applicationName
        window.minSize = NSSize(width: 760, height: 580)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.appearance = NSAppearance(named: .aqua)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("GooseCodeMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadFileURL(pageURL, allowingReadAccessTo: webDirectory)
        if smokeMode {
            smokeDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("GooseCode-smoke-\(UUID().uuidString)", isDirectory: true)
            do { try FileManager.default.createDirectory(at: smokeDirectory!, withIntermediateDirectories: true) }
            catch { finishSmoke(false, "Could not create the test directory: \(error)") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 40) { [weak self] in
                self?.finishSmoke(false, "Native WebKit smoke test timed out")
            }
        }
    }

    private func makeMenus() {
        let main = NSMenu()
        let appItem = NSMenuItem(), app = NSMenu()
        app.addItem(withTitle: "About \(applicationName)", action: #selector(showAbout), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide \(applicationName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Quit \(applicationName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app; main.addItem(appItem)
        let fileItem = NSMenuItem(), file = NSMenu(title: "File")
        file.addItem(withTitle: "Open DNA File…", action: #selector(openDNA), keyEquivalent: "o")
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = file; main.addItem(fileItem)
        let editItem = NSMenuItem(), edit = NSMenu(title: "Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = edit; main.addItem(editItem)
        let windowItem = NSMenuItem(), windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu; main.addItem(windowItem); NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = main
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.3.0"
        NSApp.orderFrontStandardAboutPanel(options: [.applicationName: applicationName, .applicationVersion: version,
            .credits: NSAttributedString(string: "DNA → RNA → Protein\nLocal alignment and visualization\nAll sequences are processed on your Mac. No internet connection required.")])
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        guard let filename = filenames.first else { sender.reply(toOpenOrPrint: .failure); return }
        let url = URL(fileURLWithPath: filename)
        if pageLoaded { importFile(url) } else { pendingFile = url }
        sender.reply(toOpenOrPrint: .success)
    }

    private func openPanel() -> NSOpenPanel {
        let panel = NSOpenPanel()
        panel.title = "Import DNA Sequence"
        panel.message = "Choose a SnapGene .dna file, a single- or multi-record FASTA file, or plain-text DNA (up to 10 MB)."
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = ["dna", "fasta", "fa", "fna", "txt"].compactMap { UTType(filenameExtension: $0) }
        return panel
    }

    @objc private func openDNA() {
        guard pageLoaded, !panelOpen else { return }
        panelOpen = true
        let panel = openPanel()
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.panelOpen = false
            if response == .OK, let url = panel.url { self.importFile(url) }
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard isTrusted(frame), !panelOpen else { completionHandler(nil); return }
        panelOpen = true
        let panel = openPanel()
        panel.beginSheetModal(for: window) { [weak self] response in
            self?.panelOpen = false
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    private func isTrusted(_ frame: WKFrameInfo) -> Bool {
        frame.isMainFrame && frame.request.url?.standardizedFileURL == pageURL
    }

    private func importFile(_ url: URL, after completion: (() -> Void)? = nil) {
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard size.isRegularFile == true, (size.fileSize ?? Int.max) <= 10 * 1024 * 1024 else {
                throw NSError(domain: "GooseCode", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose a sequence file no larger than 10 MB."])
            }
            let data = try Data(contentsOf: url)
            let script = """
            ++loadToken; resetImport(); $('file').value = ''; $('dnaInput').value = '';
            try {
              const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
              install(DNA.parse(bytes.buffer), filename);
              return true;
            } catch (e) { status(e.message, true); throw e; }
            """
            webView.callAsyncJavaScript(script, arguments: ["encoded": data.base64EncodedString(), "filename": url.lastPathComponent], in: nil, in: .page) { [weak self] outcome in
                switch outcome {
                case .success: completion?()
                case .failure(let error): self?.report(error)
                }
            }
        } catch {
            // Match browser imports: a rejected native file must not leave
            // the previous file's sequences or exports available.
            webView.callAsyncJavaScript("++loadToken; resetImport(); $('file').value = ''; $('dnaInput').value = ''; status(message, true);",
                arguments: ["message": error.localizedDescription], in: nil, in: .page) { [weak self] _ in
                self?.report(error)
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "saveFile", isTrusted(message.frameInfo),
              let payload = message.body as? [String: Any],
              let text = payload["text"] as? String, let filename = payload["filename"] as? String,
              !filename.isEmpty, filename.count <= 255,
              filename == URL(fileURLWithPath: filename).lastPathComponent,
              !filename.contains(":"), !filename.contains("\n"), !filename.contains("\r"),
              text.utf8.count <= 64 * 1024 * 1024 else { return }
        if smokeMode, let directory = smokeDirectory {
            do {
                try writeExport(text, to: directory.appendingPathComponent(filename))
                smokeExports.append(filename)
            } catch { finishSmoke(false, "Export smoke test failed: \(error)") }
            return
        }
        guard !panelOpen else { return }
        panelOpen = true
        let panel = NSSavePanel()
        panel.title = "Save Sequence or Alignment"
        panel.nameFieldStringValue = filename
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.panelOpen = false
            if response == .OK, let url = panel.url {
                do { try self.writeExport(text, to: url) }
                catch { self.report(error) }
            }
        }
    }

    private func writeExport(_ text: String, to url: URL) throws {
        try text.write(to: url, atomically: true, encoding: .utf8)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.standardizedFileURL == pageURL { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        if smokeMode {
            importFile(pageURL.deletingLastPathComponent().appendingPathComponent("example.dna")) { [weak self] in self?.runSmokeChecks() }
        } else if let url = pendingFile { pendingFile = nil; importFile(url) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { report(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { report(error) }

    private func report(_ error: Error) {
        if smokeMode { finishSmoke(false, error.localizedDescription); return }
        let alert = NSAlert()
        alert.messageText = "Could Not Complete the Operation"
        alert.informativeText = error.localizedDescription
        alert.alertStyle = .warning
        if let window, window.attachedSheet == nil { alert.beginSheetModal(for: window) }
        else { alert.runModal() }
    }

    private func runSmokeChecks() {
        let script = """
        const check = (ok, reason) => { if (!ok) throw new Error(reason); };
        check($('protein').value === 'MACK', 'Native DNA import or translation failed');
        check($('rna').value === 'AUGGCUUGUAAAUGA', 'RNA result failed');
        $('faSave').click(); $('gpSave').click(); $('rnaSave').click();
        $('query').value = 'ACK'; await compare();
        check(alignment.referenceStart === 2 && alignment.queryStart === 1, 'Translated reference alignment failed');
        $('referenceSource').value = 'manual'; $('matchMode').value = 'local';
        $('reference').value = 'PPPACDEFGHIKLMNPQRSTVWYQQQ';
        $('query').value = 'SSACDMEFGHIKLMNPQASTVWYTT';
        await compare();
        check(alignment.referenceStart === 4 && alignment.queryStart === 3, 'Local coordinates failed');
        check(alignment.gaps === 1 && alignment.mismatches === 1, 'Mismatch/gap failed');
        check(document.querySelectorAll('#alignmentDetails .mismatch').length > 0, 'Visualization failed');
        $('alignmentSave').click();
        $('matchMode').value = 'exact'; $('reference').value = 'AAAA'; $('query').value = 'AA';
        await compare(); check(matchResult.matches.length === 3, 'Exact search failed'); $('matchSave').click();
        const largeStart = performance.now();
        const progress = [];
        let timerRan = false;
        setTimeout(() => { timerRan = true; }, 0);
        const large = await DNA.alignProtein('A'.repeat(10000), 'A'.repeat(8000), {onProgress: p => progress.push(p)});
        check(DNA.ALIGNMENT_LIMITS.maxCells === 80000000, 'Bundled capacity is outdated');
        check(large.score === 16000 && large.referenceEnd === 8000 && large.queryEnd === 8000, '80M boundary failed');
        check(timerRan && progress.some(p => p > 0 && p < 1) && progress[progress.length - 1] === 1, 'Large-job responsiveness/progress failed');
        const elapsed = Math.round(performance.now() - largeStart);
        const abort = new AbortController();
        const pending = DNA.alignProtein('A'.repeat(10000), 'A'.repeat(8000), {signal: abort.signal});
        setTimeout(() => abort.abort(), 0);
        let cancelled = false;
        try { await pending; } catch (e) { cancelled = e.name === 'AbortError'; }
        check(cancelled, 'Large-job cancellation failed');
        $('strand').value = 'forward'; $('frame').value = '0'; $('stop').checked = true;
        const setPastedDNA = text => {
          $('dnaInput').value = text;
          $('dnaInput').dispatchEvent(new Event('input', {bubbles: true}));
        };
        $('referenceSource').value = 'translated';
        setPastedDNA('atg gct taa atg'); $('pasteImport').click();
        check($('rna').value === 'AUGGCUUAAAUG' && $('protein').value === 'MA', 'Pasted plain DNA translation failed');
        check(Number($('start').value) === 1 && Number($('end').value) === 12, 'Pasted DNA interval was not reset');
        $('matchMode').value = 'exact'; $('query').value = 'MA'; await compare();
        check(matchResult.matches.length === 1, 'Pasted protein comparison failed');
        setPastedDNA('ATGU');
        check($('rna').value === '' && $('protein').value === '' && $('faSave').disabled && $('rnaSave').disabled && $('gpSave').disabled, 'Editing pasted DNA left stale translation or exports');
        check($('run').disabled && $('matchSave').disabled && $('alignmentSave').disabled && !matchResult && !alignment, 'Editing pasted DNA left stale translated-reference comparison');
        $('pasteImport').click();
        check(!$('status').textContent.includes('Done.') && $('status').classList.contains('error') && $('run').disabled, 'Invalid pasted DNA was not rejected');
        const multiText = ['>same alpha', 'AT', '>same continuation', 'GGCT', '>third', 'TAAATG', ''].join(String.fromCharCode(10));
        setPastedDNA(multiText); $('pasteImport').click();
        check(records.length === 3 && source.dna === 'ATGGCTTAAATG' && $('protein').value === 'MA', 'Pasted multi-record FASTA recovery or DNA concatenation failed');
        check($('referenceSource').value === 'translated' && referenceText() === 'MA', 'Pasted merged protein did not become reference A');
        check($('dnaInput').value === multiText, 'Imported pasted DNA is no longer editable');
        $('dnaInput').value = '';
        install(DNA.parse(new TextEncoder().encode(multiText).buffer), 'native-multi.fasta');
        check(records.length === 3 && source.dna === 'ATGGCTTAAATG', 'Multi-record DNA was not concatenated in FASTA order');
        check(records[0].header === 'same alpha' && records[1].header === 'same continuation', 'Duplicate FASTA IDs or descriptions were lost');
        check(!$('mergedInfo').hidden, 'Merged-sequence summary is hidden');
        check($('rna').value === 'AUGGCUUAAAUG' && $('protein').value === 'MA', 'Joined RNA or global first-stop translation failed');
        check(Number($('start').value) === 1 && Number($('end').value) === 12, 'Joined interval was not reset to the full DNA length');
        check($('referenceSource').value === 'translated' && referenceText() === 'MA', 'Merged protein did not become reference A');
        $('stop').checked = false; $('stop').dispatchEvent(new Event('input')); run();
        check($('protein').value === 'MA*M' && referenceText() === 'MA*M', 'Retained-stop translation did not update reference A');
        $('matchMode').value = 'exact'; $('query').value = 'MA'; await compare();
        check(matchResult.matches.length === 1 && matchResult.matches[0].start === 1 && matchResult.matches[0].end === 2, 'Exact search failed across the joined DNA boundary');
        $('matchMode').value = 'local'; $('query').value = 'A*M'; await compare();
        check(alignment.referenceStart === 2 && alignment.referenceEnd === 4 && alignment.queryStart === 1 && alignment.queryEnd === 3, 'Joined protein local alignment failed');
        check(!$('rnaSave').disabled && !$('faSave').disabled && !$('gpSave').disabled, 'Merged exports are disabled');
        $('rnaSave').click(); $('faSave').click(); $('gpSave').click();
        return `Native import, pasted DNA and FASTA, edit invalidation and recovery, RNA/protein, local/exact alignment, visualization, export bridge, ordered DNA concatenation, cross-record codons and merged-protein comparison passed; 80M cells in ${elapsed} ms; progress and cancellation passed`;
        """
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] outcome in
            guard let self else { return }
            switch outcome {
            case .failure(let error): self.finishSmoke(false, error.localizedDescription)
            case .success(let value):
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    do {
                        let expectedMergedExports = [("native-multi.rna.fasta", ">", "AUGGCUUAAAUG"),
                                                     ("native-multi.protein.fasta", ">", "MA*M"),
                                                     ("native-multi.gp", "LOCUS", "MA*M")]
                        for (filename, prefix, expectedSequence) in expectedMergedExports {
                            let contents = try String(contentsOf: self.smokeDirectory!.appendingPathComponent(filename), encoding: .utf8)
                            let recordCount = contents.components(separatedBy: .newlines).filter { $0.hasPrefix(prefix) }.count
                            guard recordCount == 1 else {
                                self.finishSmoke(false, "Merged export \(filename) contained \(recordCount) records; expected 1")
                                return
                            }
                            let sequence: String
                            if prefix == ">" {
                                sequence = contents.components(separatedBy: .newlines).filter { !$0.hasPrefix(">") }.joined()
                            } else {
                                let sections = contents.components(separatedBy: "ORIGIN\n")
                                guard sections.count == 2 else {
                                    self.finishSmoke(false, "Merged GenPept export is missing its sequence section")
                                    return
                                }
                                sequence = sections[1].components(separatedBy: "//")[0].filter { $0.isLetter || $0 == "*" }.uppercased()
                            }
                            guard sequence == expectedSequence,
                                  contents.contains("input_records=3"),
                                  contents.contains("assembly=DNA_concatenated_before_translation"),
                                  contents.contains("record_order=FASTA") else {
                                self.finishSmoke(false, "Merged export \(filename) has incorrect sequence or concatenation metadata")
                                return
                            }
                        }
                        self.finishSmoke(self.smokeExports.count == 8 && Set(self.smokeExports).count == 8, "\(value); merged exports each contain one verified sequence and concatenation metadata; exports=\(self.smokeExports.count); directory=\(self.smokeDirectory!.path)")
                    } catch {
                        self.finishSmoke(false, "Could not read native merged exports: \(error)")
                    }
                }
            }
        }
    }

    private func finishSmoke(_ success: Bool, _ message: String) {
        print("\(success ? "PASS" : "FAIL"): \(message)")
        fflush(stdout)
        exit(success ? 0 : 1)
    }
}

@main
struct GooseCode {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.setActivationPolicy(.regular)
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
