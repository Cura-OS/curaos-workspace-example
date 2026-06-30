#!/usr/bin/env bash
# check-no-dashes.sh: reject em/en dashes in staged ADDED lines (RP-09).
# Scans `git diff --cached -U0` additions only, so pre-existing occurrences
# elsewhere in the tree never block an unrelated commit; stays fast on any
# repo size. Fail closed: a git failure blocks the commit too.
# The glyphs are built from byte escapes (em = e2 80 94, en = e2 80 93) so
# this file never contains the literal characters (PR #310 lesson).
set -uo pipefail

EM="$(printf '\342\200\224')"
EN="$(printf '\342\200\223')"

# -U0: pure added lines, no context. --diff-filter=ACMR skips deletions.
OUT="$(git diff --cached -U0 --no-color --diff-filter=ACMR 2>&1)" || {
  echo "no-dashes: git diff --cached failed; failing closed" >&2
  printf '%s\n' "$OUT" >&2
  exit 1
}

printf '%s\n' "$OUT" | LC_ALL=C awk -v em="$EM" -v en="$EN" '
  BEGIN { bad = 0; file = "?" }
  /^\+\+\+ / { file = substr($0, 5); sub(/^b\//, "", file); next }
  /^@@/ {
    hunk = $0
    sub(/^@@ -[0-9]+(,[0-9]+)? \+/, "", hunk)
    sub(/[ ,].*$/, "", hunk)
    lineno = hunk + 0
    next
  }
  /^\+/ {
    if (index($0, em) > 0 || index($0, en) > 0) {
      bad += 1
      line = substr($0, 2)
      gsub(em, "<EM-DASH>", line)
      gsub(en, "<EN-DASH>", line)
      printf "no-dashes: %s:%d: %s\n", file, lineno, line
    }
    lineno += 1
    next
  }
  END {
    if (bad > 0) {
      printf "no-dashes: %d added line(s) contain em/en dashes; use - , ; : or parentheses (curaos_no_em_dash_rule)\n", bad
      exit 1
    }
  }
'
rc=$?
if [ "$rc" -ne 0 ]; then
  exit 1
fi
echo "no-dashes: staged additions clean"
