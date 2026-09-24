#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
bad = []

# Scan only markdown git tracks. A plain rglob also walked node_modules/, .cache/ and .scratch/,
# so vendored package READMEs were reported as repo defects the moment anything ran an install;
# the full-tree run happens in .githooks/pre-push, which was committed non-executable and so
# never surfaced it. Fail closed when git cannot answer or the repo tracks no markdown at all:
# a gate that silently scans nothing is not a gate.
try:
    listing = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z", "--", "*.md"],
        capture_output=True,
        check=True,
    ).stdout
except (OSError, subprocess.CalledProcessError) as error:
    print(f"check-public-docs: cannot list tracked markdown ({error}); failing closed")
    sys.exit(1)

paths = [ROOT / name.decode("utf-8") for name in listing.split(b"\0") if name]
if not paths:
    print("check-public-docs: no tracked markdown found; failing closed")
    sys.exit(1)

for path in paths:
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

print(f"public docs ok ({len(paths)} tracked file(s))")
