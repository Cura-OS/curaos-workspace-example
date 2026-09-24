#!/usr/bin/env bash
# Tests for check-public-docs.py. Self-contained: a throwaway git repo with a COPY of the script
# at the same relative path, so the script's own ROOT resolution points at the fixture and no
# test-only hook is needed in production code. Dash glyphs come from byte escapes only.
#
# The regression this pins: the gate walked the whole tree, so vendored markdown under
# node_modules/ (which `bun install --frozen-lockfile` creates) was reported as a repo defect.
# It went unnoticed because the pre-push hook that runs a full scan was committed non-executable.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-public-docs.py"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

EM="$(printf '\342\200\224')"

# Fresh fixture repo carrying a copy of the script under test.
newrepo() {
  repo="$TMP/$1"
  mkdir -p "$repo/scripts"
  cp "$SCRIPT" "$repo/scripts/check-public-docs.py"
  git -C "$repo" init -q
  git -C "$repo" config user.email t@t.invalid
  git -C "$repo" config user.name t
  git -C "$repo" config core.hooksPath "$repo/.git/hooks"
  printf '%s' "$repo"
}

run() {
  ( cd "$1" && python3 scripts/check-public-docs.py 2>&1 )
  printf 'EXIT=%s\n' "$?"
}

# 1) Vendored markdown is not repo content: a dirty node_modules must not fail a clean repo.
repo="$(newrepo vendored)"
printf '# clean\n\n[self](README.md)\n' > "$repo/README.md"
git -C "$repo" add README.md scripts/check-public-docs.py
mkdir -p "$repo/node_modules/pkg"
printf '# vendored %s dash\n\n[broken](./does-not-exist.md)\n' "$EM" > "$repo/node_modules/pkg/README.md"
out="$(run "$repo")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "vendored markdown under node_modules is ignored"
else
  nok "vendored markdown ignored" "$out"
fi

# 2) A tracked banned dash still fails.
printf 'a line with %s inside\n' "$EM" > "$repo/doc.md"
git -C "$repo" add doc.md
out="$(run "$repo")"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'doc.md: banned dash'; then
  ok "tracked banned dash exits 1"
else
  nok "tracked banned dash" "$out"
fi
git -C "$repo" rm -q --cached doc.md
rm "$repo/doc.md"

# 3) A tracked broken local link still fails.
printf '[gone](./nowhere.md)\n' > "$repo/link.md"
git -C "$repo" add link.md
out="$(run "$repo")"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'link.md: missing link'; then
  ok "tracked broken local link exits 1"
else
  nok "tracked broken link" "$out"
fi
git -C "$repo" rm -q --cached link.md
rm "$repo/link.md"

# 4) Outside a git repo the gate must fail closed, never report a clean scan of nothing.
nogit="$TMP/nogit"
mkdir -p "$nogit/scripts"
cp "$SCRIPT" "$nogit/scripts/check-public-docs.py"
printf 'a line with %s inside\n' "$EM" > "$nogit/doc.md"
out="$(run "$nogit")"
# The diagnostic must say WHICH failure it is: "git could not answer" and "this repo has no
# docs" are different operator problems, and a shared message lets one guard mask the other.
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'cannot list tracked markdown'; then
  ok "outside a git repo the gate fails closed and names git as the cause"
else
  nok "no-git fail closed" "$out"
fi

# 5) A repo that tracks no markdown at all is a broken scan, not a pass.
empty="$(newrepo empty)"
printf 'x\n' > "$empty/notes.txt"
git -C "$empty" add notes.txt
out="$(run "$empty")"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'no tracked markdown found'; then
  ok "zero tracked markdown fails closed and names the empty scan"
else
  nok "empty scan fails closed" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
