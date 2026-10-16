#!/usr/bin/env python3
"""Copy shared browser files unchanged into a static-only deployment directory."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "index.html", "app.js", "core.js", "sequence-swim.js", "sequence-swim.css",
    "assets/goosecode-icon.png", "assets/swimming-goose.svg",
    "example.dna", "examples/multi-record.fasta",
]
OUTPUT = ROOT / "dist" / "web"


def main():
    for name in FILES:
        source = ROOT / name
        if not source.is_file() or source.resolve() != source.absolute():
            raise SystemExit(f"Missing or unsafe web resource: {name}")
    if OUTPUT.resolve() != OUTPUT.absolute():
        raise SystemExit("The generated web directory must not be a symbolic link.")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for name in FILES:
        target = OUTPUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Static website: {OUTPUT} ({len(FILES)} unchanged files + .nojekyll)")


if __name__ == "__main__":
    main()
