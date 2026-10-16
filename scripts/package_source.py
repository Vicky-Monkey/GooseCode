#!/usr/bin/env python3
"""Create a source-only release ZIP from an explicit allowlist."""
from pathlib import Path
import json
import os
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "index.html", "core.js", "app.js", "example.dna", ".gitignore",
    "sequence-swim.css", "sequence-swim.js", "assets/swimming-goose.svg", "assets/goosecode-icon.png",
    "package.json", "README.md", "CHANGELOG.md", "CONTRIBUTING.md",
    "examples/multi-record.fasta",
    "docs/USER_GUIDE.md", "docs/GITHUB_RELEASE_SOP.md", "docs/WEB_DEPLOYMENT.md",
    "docs/screenshots/alignment.png", "docs/screenshots/merged-sequence.png", "docs/screenshots/swimming-goose.png",
    "macos/README.md", "macos/Main.swift",
    "macos/Info.plist", "macos/GenerateIcon.swift", "macos/build.sh",
    "tests/alignment.test.js", "tests/fasta.test.js", "tests/browser-smoke.cjs", "tests/multi-fasta-browser.cjs",
    "tests/static-web-browser.cjs",
    "scripts/package_source.py", "scripts/prepare_web.py", ".github/workflows/pages.yml",
]
OPTIONAL = ["LICENSE", "package-lock.json"]


def main():
    paths = list(REQUIRED)
    paths.extend(name for name in OPTIONAL if (ROOT / name).exists())
    for name in paths:
        path = ROOT / name
        if not path.is_file() or path.is_symlink() or path.resolve() != path.absolute():
            raise SystemExit(f"Missing or unsafe source path: {name}")
    version = json.loads((ROOT / "package.json").read_text())["version"]
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    output = destination / "GooseCode-source.zip"
    handle, temporary = tempfile.mkstemp(prefix="source-", suffix=".zip", dir=destination)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(paths):
                archive.write(ROOT / name, f"goosecode/{name}")
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise SystemExit("Source ZIP validation failed.")
            if len(archive.namelist()) != len(paths):
                raise SystemExit("Source ZIP file-count mismatch.")
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Source archive v{version}: {output} ({len(paths)} files)")


if __name__ == "__main__":
    main()
