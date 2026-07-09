#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
bad = []

for path in ROOT.rglob("*.md"):
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "\u2013" in text or "\u2014" in text:
        bad.append(f"{path.relative_to(ROOT)}: banned dash")
    for match in LINK.finditer(text):
        target = match.group(1).split("#", 1)[0].strip("<>")
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError:
            continue
        if not resolved.exists():
            bad.append(f"{path.relative_to(ROOT)}: missing link {target}")

if bad:
    print("\n".join(bad))
    sys.exit(1)

print("public docs ok")
