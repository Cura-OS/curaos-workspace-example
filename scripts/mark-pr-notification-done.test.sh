#!/usr/bin/env bash
# Tests for mark-pr-notification-done.
# Self-contained (no bats). Feeds notification JSON fixtures on stdin so the
# matcher logic is exercised without touching the live GitHub inbox; the real
# DELETE path is opt-in (--apply) and not exercised here.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/mark-pr-notification-done"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n     expected: %s\n     actual:   %s\n' "$1" "$2" "$3"; }

# Fixture: three repos share PR #2; one repo has PR #12 and #21 to test the
# substring pitfall (/pulls/2 must NOT match /pulls/12 or /pulls/21).
fixture() {
cat <<'JSON'
[
  {"id":"100","repository":{"full_name":"org/repo-a"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/repo-a/pulls/2"}},
  {"id":"101","repository":{"full_name":"org/repo-b"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/repo-b/pulls/2"}},
  {"id":"102","repository":{"full_name":"org/repo-a"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/repo-a/pulls/12"}},
  {"id":"103","repository":{"full_name":"org/repo-a"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/repo-a/pulls/21"}},
  {"id":"104","repository":{"full_name":"org/repo-a"},"subject":{"type":"Issue","url":"https://api.github.com/repos/org/repo-a/issues/2"}}
]
JSON
}

run() { fixture | "$SCRIPT" "$@" 2>/dev/null; }

# --- Test 1: matches exact repo+PR, prints its thread id ---
out="$(run --stdin org/repo-a 2)"
if [ "$out" = "100" ]; then ok "T1 exact repo+PR match -> thread 100"; else nok "T1 exact repo+PR match" "100" "$out"; fi

# --- Test 2: scope-safe: same PR# in a different repo is NOT matched ---
out="$(run --stdin org/repo-b 2)"
if [ "$out" = "101" ]; then ok "T2 repo-b #2 -> 101 (not 100)"; else nok "T2 repo scoping" "101" "$out"; fi

# --- Test 3: substring pitfall: /pulls/2 must not match /pulls/12 or /pulls/21 ---
out="$(run --stdin org/repo-a 2 | tr '\n' ',')"
if [ "$out" = "100," ]; then ok "T3 /pulls/2 excludes /pulls/12,/pulls/21"; else nok "T3 substring safety" "100," "$out"; fi

# --- Test 4: only PullRequest subjects, not Issue with same number ---
out="$(run --stdin org/repo-a 2)"
if ! printf '%s' "$out" | grep -q '104'; then ok "T4 ignores Issue subject #2"; else nok "T4 PR-only" "no 104" "$out"; fi

# --- Test 5: no match -> empty output, exit 0 (idempotent) ---
out="$(run --stdin org/repo-a 999)"; rc=$?
if [ -z "$out" ] && [ "$rc" -eq 0 ]; then ok "T5 no match -> empty, exit 0"; else nok "T5 idempotent no-match" "empty + rc0" "out='$out' rc=$rc"; fi

# --- Test 6: usage guard: missing args -> non-zero exit + usage on stderr ---
"$SCRIPT" 2>/tmp/mpnd_err >/dev/null; rc=$?
if [ "$rc" -ne 0 ] && grep -qi 'usage' /tmp/mpnd_err; then ok "T6 missing args -> usage + nonzero"; else nok "T6 usage guard" "nonzero + usage" "rc=$rc"; fi

# --- Test 7: default mode is dry-run (no --apply): prints ids but DOES NOT delete ---
# Invoke the script directly (not via run(), which swallows stderr) so we can
# assert the DRY-RUN marker on stderr when --apply is absent.
fixture | "$SCRIPT" --stdin org/repo-a 2 2>/tmp/mpnd_dry >/tmp/mpnd_out
if grep -qi 'dry.run' /tmp/mpnd_dry && [ "$(cat /tmp/mpnd_out)" = "100" ]; then
  ok "T7 default is dry-run (no --apply): prints id, DELETEs nothing"
else
  nok "T7 dry-run default" "DRY-RUN on stderr + id on stdout" "err='$(cat /tmp/mpnd_dry)' out='$(cat /tmp/mpnd_out)'"
fi

# --- Test 8 (RP-07): live read path pages (--paginate), no fixed --limit cap ---
# A stub gh on PATH records the args; a fixed --limit on /notifications could
# silently truncate the inbox and false-pass "nothing to clear".
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CALLLOG="$TMP/calls"
: > "$CALLLOG"
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CALLLOG"
echo "[]"
STUB
chmod +x "$TMP/gh"
PATH="$TMP:$PATH" "$SCRIPT" org/repo-a 2 >/dev/null 2>&1; rc=$?
if [ "$rc" -eq 0 ] && grep -q -- '--paginate' "$CALLLOG" && ! grep -q -- '--limit' "$CALLLOG"; then
  ok "T8 live notifications read uses --paginate, no fixed --limit"
else
  nok "T8 paginated live read" "rc0 + --paginate, no --limit" "rc=$rc calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
