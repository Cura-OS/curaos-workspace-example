#!/usr/bin/env bash
# Tests for the committed .githooks/ stubs (RP-01 pre-push readiness).
# Git IGNORES a hook file that is not executable, so a hook committed 644 is a gate that
# silently never runs; .githooks/pre-push shipped that way and a red `just ci` reached a
# pushed branch because of it. These tests EXECUTE the hook against stubbed tools on PATH
# and assert on the resulting exit status and the recorded invocations, never on its text.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
HOOK="$ROOT/.githooks/pre-push"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

LEDGER="$TMP/ledger"
: > "$LEDGER"

# Stub bin: the hook calls python3, gitleaks and just by bare name, so a PATH prepend makes the
# whole run hermetic. JUST_EXIT drives the "declared gate went red" case.
mkstub() {
  bin="$1"
  mkdir -p "$bin"
  printf '#!/bin/sh\necho "python3 $*" >> "%s"\nexit ${PYTHON_EXIT:-0}\n' "$LEDGER" > "$bin/python3"
  printf '#!/bin/sh\necho "gitleaks $*" >> "%s"\nexit ${GITLEAKS_EXIT:-0}\n' "$LEDGER" > "$bin/gitleaks"
  printf '#!/bin/sh\necho "just $*" >> "%s"\nexit ${JUST_EXIT:-0}\n' "$LEDGER" > "$bin/just"
  chmod +x "$bin/python3" "$bin/gitleaks" "$bin/just"
}

run_hook() {
  ( cd "$ROOT" && PATH="$1:/usr/bin:/bin" "${@:2}" sh "$HOOK" </dev/null >/dev/null 2>&1 )
  printf '%s' "$?"
}

# 1) The index mode is what decides whether git runs the hook at all.
mode="$(git -C "$ROOT" ls-files -s .githooks/pre-push | awk '{print $1}')"
if [ "$mode" = "100755" ]; then
  ok "pre-push is executable in the index (git would ignore it otherwise)"
else
  nok "pre-push index mode" "expected 100755, got '$mode'; git silently skips a non-executable hook"
fi

# 2) A passing run reaches the declared gate, not just the doc/secret legs.
BIN="$TMP/bin-pass"
mkstub "$BIN"
: > "$LEDGER"
status="$(run_hook "$BIN")"
if [ "$status" = "0" ] && grep -q '^just ci$' "$LEDGER"; then
  ok "pre-push runs the declared gate 'just ci' and exits 0 when every leg passes"
else
  nok "pre-push runs just ci" "exit=$status ledger=$(tr '\n' '|' < "$LEDGER")"
fi

# 3) A red gate must block the push.
: > "$LEDGER"
status="$(run_hook "$BIN" env JUST_EXIT=1)"
if [ "$status" != "0" ]; then
  ok "a failing 'just ci' blocks the push"
else
  nok "red gate blocks push" "hook exited 0 while just ci exited 1"
fi

# 3b) Every earlier leg is blocking too: a public-docs or secret-scan failure must stop the push
#     AND must not fall through to the gate as if the checkout were clean.
: > "$LEDGER"
status="$(run_hook "$BIN" env PYTHON_EXIT=1)"
if [ "$status" != "0" ] && ! grep -q '^just ci$' "$LEDGER"; then
  ok "a failing public-docs check blocks the push before the gate runs"
else
  nok "public-docs leg blocking" "exit=$status ledger=$(tr '\n' '|' < "$LEDGER")"
fi

: > "$LEDGER"
status="$(run_hook "$BIN" env GITLEAKS_EXIT=1)"
if [ "$status" != "0" ] && ! grep -q '^just ci$' "$LEDGER"; then
  ok "a failing secret scan blocks the push before the gate runs"
else
  nok "secret-scan leg blocking" "exit=$status ledger=$(tr '\n' '|' < "$LEDGER")"
fi

# 4) A missing runner must fail closed, never skip.
BIN_NOJUST="$TMP/bin-nojust"
mkstub "$BIN_NOJUST"
rm "$BIN_NOJUST/just"
: > "$LEDGER"
status="$(run_hook "$BIN_NOJUST")"
if [ "$status" != "0" ]; then
  ok "a missing just runner fails closed instead of passing the push through"
else
  nok "missing runner fails closed" "hook exited 0 with no just on PATH"
fi

# 5) The documented emergency escape hatch still works.
: > "$LEDGER"
status="$(run_hook "$BIN" env LEFTHOOK=0)"
if [ "$status" = "0" ] && [ ! -s "$LEDGER" ]; then
  ok "LEFTHOOK=0 skips the hook without running any leg"
else
  nok "LEFTHOOK=0 escape hatch" "exit=$status ledger=$(tr '\n' '|' < "$LEDGER")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
