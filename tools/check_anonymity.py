"""Refuse to publish anything that names a client, a site, a colleague or an internal system.

Scans every text file in the repository (the embedded client report included) against
the patterns in tools/denylist.local.txt and exits non-zero if any matches. Run it
before every commit:

    python tools/check_anonymity.py

The deny-list is kept out of the repository on purpose: a public list of the names to
hide would itself be the leak. Without it the check fails rather than passing empty.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DENYLIST = ROOT / "tools" / "denylist.local.txt"
TEXT_SUFFIXES = {".html", ".js", ".css", ".json", ".md", ".txt", ".py", ".toml", ".csv", ".svg", ".yml", ".yaml"}
SKIP_DIRS = {".git", "__pycache__", "node_modules"}

# Known innocent matches: Plotly's country-name table lists the Heard and McDonald Islands.
ALLOWED = [re.compile(r"heard\.\*mcdonald", re.IGNORECASE)]


def load_patterns() -> list[tuple[str, re.Pattern]]:
    if not DENYLIST.exists():
        sys.exit(f"Missing {DENYLIST.relative_to(ROOT)}: the check cannot run without its deny-list.")
    patterns, group = [], "pattern"
    for raw in DENYLIST.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            group = line[1:-1]
            continue
        patterns.append((group, re.compile(line, re.IGNORECASE)))
    if not patterns:
        sys.exit("The deny-list is empty.")
    return patterns


def files():
    skip = {DENYLIST.resolve(), Path(__file__).resolve()}
    for path in ROOT.rglob("*"):
        if (path.is_file() and path.suffix.lower() in TEXT_SUFFIXES and path.resolve() not in skip
                and not any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts)):
            yield path


def main() -> int:
    patterns = load_patterns()
    findings = scanned = 0
    for path in files():
        scanned += 1
        text = path.read_text(encoding="utf-8", errors="replace")
        for group, pattern in patterns:
            for match in pattern.finditer(text):
                start = max(0, match.start() - 40)
                context = text[start:match.end() + 40].replace("\n", " ")
                if any(allowed.search(context) for allowed in ALLOWED):
                    continue
                line = text.count("\n", 0, match.start()) + 1
                print(f"{path.relative_to(ROOT)}:{line}: {group}: {match.group(0)!r} … {context}")
                findings += 1
    print(f"{scanned} files scanned against {len(patterns)} patterns, {findings} finding(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
