#!/usr/bin/env bash
# Tests for sweep-pr-notifications. Self-contained (no bats, no live inbox).
# A stub `gh` on PATH returns canned /notifications, /pulls/N, and graphql
# responses keyed by PR number, so the safe-to-clear predicate is exercised
# end-to-end (terminal? threads? needs-human? outdated?) without touching
# GitHub. The DELETE path is asserted via a marker file the stub writes.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-pr-notifications"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DELLOG="$TMP/deletes"
: > "$DELLOG"

# --- stub gh ---------------------------------------------------------------
# Fixtures, one PR per scenario in repo "org/r":
#   #10 merged, 0 unresolved             -> CLEAR
#   #11 open                             -> HELD (not terminal)
#   #12 merged, 1 unresolved non-outdated-> HELD (real finding)
#   #13 merged, 1 unresolved OUTDATED    -> HELD by default, CLEAR w/ --allow-unresolved
#   #14 merged, 1 unresolved needs-human -> HELD (needs-human) always
#   #15 merged, graphql FAILS (exit 1 + errors JSON) -> HELD (fail closed)
#   #16 merged, hasNextPage=true (truncated page)    -> HELD (fail closed)
#   #17 merged, outdated thread, needs-human in REPLY-> HELD even w/ --allow-unresolved
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
# args: api [graphql|<path>] ... ; we ignore env -u wrapper (called as 'gh api ...')
shift # drop 'api'
# DELETE marker
for a in "\$@"; do case "\$a" in
  /notifications/threads/*) echo "\${a##*/}" >> "$DELLOG"; exit 0 ;;
esac; done
# graphql: find the name:"r" + number:N in the query string
if [ "\$1" = "graphql" ]; then
  q="\$*"
  num="\$(printf '%s' "\$q" | sed -n 's/.*number:\([0-9][0-9]*\).*/\1/p')"
  case "\$num" in
    12) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":false,"comments":{"nodes":[{"body":"major bug"}]}}]}}}}}' ;;
    13) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":true,"comments":{"nodes":[{"body":"old finding"}]}}]}}}}}' ;;
    14) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":false,"comments":{"nodes":[{"body":"left for needs-human review"}]}}]}}}}}' ;;
    # Fail-closed fixture class 1 (external-call failure) per [[curaos-quality-gates-rule]] "Fail-closed convention + mandatory failure fixtures"
    15) echo '{"data":null,"errors":[{"type":"RATE_LIMITED","message":"API rate limit exceeded"}]}'; exit 1 ;;
    # Fail-closed fixture class 4 (truncated search/probe) per [[curaos-quality-gates-rule]] "Fail-closed convention + mandatory failure fixtures"
    16) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":true},"nodes":[]}}}}}' ;;
    17) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":true,"comments":{"nodes":[{"body":"nitpick: rename this"},{"body":"escalating: needs-human"}]}}]}}}}}' ;;
    *)  echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}}}' ;;
  esac
  exit 0
fi
# /notifications list
case "\$1" in
  /notifications)
    cat <<'JSON'
[
 {"id":"910","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/10"}},
 {"id":"911","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/11"}},
 {"id":"912","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/12"}},
 {"id":"913","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/13"}},
 {"id":"914","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/14"}},
 {"id":"915","repository":{"full_name":"org/r"},"subject":{"type":"Issue","url":"https://api.github.com/repos/org/r/issues/10"}},
 {"id":"916","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/15"}},
 {"id":"917","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/16"}},
 {"id":"918","repository":{"full_name":"org/r"},"subject":{"type":"PullRequest","url":"https://api.github.com/repos/org/r/pulls/17"}}
]
JSON
    ;;
  repos/org/r/pulls/10) echo "closed true" ;;
  repos/org/r/pulls/11) echo "open false" ;;
  repos/org/r/pulls/12) echo "closed true" ;;
  repos/org/r/pulls/13) echo "closed true" ;;
  repos/org/r/pulls/14) echo "closed true" ;;
  repos/org/r/pulls/15) echo "closed true" ;;
  repos/org/r/pulls/16) echo "closed true" ;;
  repos/org/r/pulls/17) echo "closed true" ;;
esac
STUB
chmod +x "$TMP/gh"

run() { PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1; }

# --- T1: dry-run default deletes nothing ---
: > "$DELLOG"
out="$(run)"
if [ ! -s "$DELLOG" ] && printf '%s' "$out" | grep -q 'DRY-RUN'; then ok "T1 dry-run deletes nothing"; else nok "T1 dry-run" "no deletes + DRY-RUN marker; got: $out"; fi

# --- T2: #10 (merged, clean) would-clear; #11 (open) held ---
if printf '%s' "$out" | grep -q 'would-CLEAR org/r#10' && printf '%s' "$out" | grep -q 'HELD  org/r#11 - open'; then ok "T2 clean-merged clears, open held"; else nok "T2" "$out"; fi

# --- T3: #12 (unresolved non-outdated) held as real finding ---
if printf '%s' "$out" | grep -q 'HELD  org/r#12'; then ok "T3 unresolved finding held"; else nok "T3" "$out"; fi

# --- T4: #13 (unresolved OUTDATED) held by DEFAULT ---
if printf '%s' "$out" | grep -q 'HELD  org/r#13'; then ok "T4 outdated held by default"; else nok "T4" "$out"; fi

# --- T5: #13 CLEARS with --allow-unresolved (outdated == moot) ---
out2="$(run --allow-unresolved)"
if printf '%s' "$out2" | grep -q 'would-CLEAR org/r#13'; then ok "T5 --allow-unresolved clears outdated"; else nok "T5" "$out2"; fi

# --- T6: #14 (needs-human) held EVEN WITH --allow-unresolved ---
if printf '%s' "$out2" | grep -q 'HELD  org/r#14'; then ok "T6 needs-human always held"; else nok "T6" "$out2"; fi

# --- T7: Issue subject (#915) never touched ---
if ! printf '%s' "$out" | grep -q '915'; then ok "T7 ignores non-PR Issue subject"; else nok "T7" "$out"; fi

# --- T8: --apply actually DELETEs the clean one (#10 -> thread 910) ---
: > "$DELLOG"
run --apply >/dev/null
if grep -q '^910$' "$DELLOG" && ! grep -q '^911$' "$DELLOG" && ! grep -q '^912$' "$DELLOG"; then ok "T8 --apply deletes only safe-to-clear (910), not held (911,912)"; else nok "T8 apply" "deletes=$(tr '\n' ',' <"$DELLOG")"; fi

# --- T9: #15 graphql failure (exit 1 + errors JSON) HELD, not false-cleared ---
if printf '%s' "$out" | grep -q 'HELD  org/r#15' && ! printf '%s' "$out" | grep -q 'would-CLEAR org/r#15'; then ok "T9 graphql failure held fail-closed"; else nok "T9" "$out"; fi

# --- T10: #16 hasNextPage=true (truncated thread page) HELD ---
if printf '%s' "$out" | grep -q 'HELD  org/r#16'; then ok "T10 truncated thread page held"; else nok "T10" "$out"; fi

# --- T11: #17 needs-human in a REPLY held even with --allow-unresolved ---
if printf '%s' "$out2" | grep -q 'HELD  org/r#17'; then ok "T11 needs-human reply seen via comments(last:10)"; else nok "T11" "$out2"; fi

# --- T12: --apply performed ZERO mutations on the fail-closed fixtures (916,917,918) ---
# DELLOG still holds the T8 --apply run.
if ! grep -q '^916$' "$DELLOG" && ! grep -q '^917$' "$DELLOG" && ! grep -q '^918$' "$DELLOG"; then ok "T12 --apply mutates nothing under failing/truncated/needs-human-reply stubs"; else nok "T12 apply" "deletes=$(tr '\n' ',' <"$DELLOG")"; fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
