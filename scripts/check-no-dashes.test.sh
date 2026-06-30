#!/usr/bin/env bash
# Tests for check-no-dashes.sh (RP-09). Self-contained: throwaway git repo;
# dash glyphs are produced from byte escapes only (never literals in source).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-no-dashes.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

EM="$(printf '\342\200\224')"
EN="$(printf '\342\200\223')"

REPO="$TMP/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email t@t.invalid
git -C "$REPO" config user.name t
# Keep the fixture isolated from any global core.hooksPath (lefthook).
git -C "$REPO" config core.hooksPath "$REPO/.git/hooks"

run() {
  (cd "$REPO" && bash "$SCRIPT" 2>&1)
  printf 'EXIT=%s\n' "$?"
}

# 1) staged file with an em dash is rejected
printf 'a line with %s inside\n' "$EM" > "$REPO/em.md"
git -C "$REPO" add em.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'em.md:1: a line with <EM-DASH> inside'; then
  ok "staged em dash exits 1 with file:line"
else
  nok "em dash rejected" "$out"
fi
git -C "$REPO" rm -q --cached em.md
rm "$REPO/em.md"

# 2) staged file with an en dash is rejected
printf 'range 1%s2\n' "$EN" > "$REPO/en.md"
git -C "$REPO" add en.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'en.md:1: range 1<EN-DASH>2'; then
  ok "staged en dash exits 1 with file:line"
else
  nok "en dash rejected" "$out"
fi
git -C "$REPO" rm -q --cached en.md
rm "$REPO/en.md"

# 3) clean staged file passes
printf 'plain hyphen-only line\n' > "$REPO/clean.md"
git -C "$REPO" add clean.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'staged additions clean'; then
  ok "clean staged file passes"
else
  nok "clean staged file" "$out"
fi
git -C "$REPO" commit -qm 'seed clean file'

# 4) added-lines-only: a pre-existing dash in the tree does not block an
#    unrelated staged change
printf 'legacy %s dash\n' "$EM" > "$REPO/legacy.md"
git -C "$REPO" add legacy.md
git -C "$REPO" commit -qm 'seed legacy dash'
printf 'new clean line\n' >> "$REPO/clean.md"
git -C "$REPO" add clean.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "pre-existing dash elsewhere does not block unrelated commit"
else
  nok "added-lines-only scope" "$out"
fi

# 5) editing the legacy file WITHOUT touching its dash line still passes
#    (only added lines are scanned), but adding a dash line fails
printf 'appended clean line\n' >> "$REPO/legacy.md"
git -C "$REPO" add legacy.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "clean addition to a dash-bearing file passes"
else
  nok "clean addition to dash-bearing file" "$out"
fi
printf 'second %s dash\n' "$EN" >> "$REPO/legacy.md"
git -C "$REPO" add legacy.md
out="$(run)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q '<EN-DASH>'; then
  ok "new dash line in a dirty file exits 1"
else
  nok "new dash line in dirty file" "$out"
fi

# 6) fails closed outside a git repo
out="$( (cd "$TMP" && bash "$SCRIPT" 2>&1); printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'failing closed'; then
  ok "git failure fails closed"
else
  nok "fail closed" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
