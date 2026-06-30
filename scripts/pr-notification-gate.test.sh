#!/usr/bin/env bash
# Tests for pr-notification-gate. Self-contained: a stub `gh` on PATH returns
# canned /pulls/N, graphql, and swallows DELETE (logging to a marker). Exercises
# the per-PR safety predicate (terminal? threads? needs-human? outdated?) end to
# end without touching GitHub. A stub mark-pr-notification-done records applies.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/pr-notification-gate"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
DELLOG="$TMP/applied"; : > "$DELLOG"

# stub gh: pulls state + graphql threads, keyed by PR number.
#   #10 merged, 0 unresolved             -> CLEAR (exit 0)
#   #11 open                             -> BLOCK terminal (exit 2)
#   #12 merged, 1 unresolved non-outdated-> BLOCK threads (exit 3)
#   #13 merged, 1 unresolved OUTDATED    -> BLOCK default / CLEAR --allow-unresolved
#   #14 merged, 1 unresolved needs-human -> BLOCK needs-human (exit 3) always
#   #15 merged, graphql FAILS (exit 1 + errors JSON) -> BLOCK (exit 4) fail closed
#   #16 merged, hasNextPage=true (truncated page)    -> BLOCK (exit 4) fail closed
#   #17 merged, outdated thread, needs-human in REPLY-> BLOCK (exit 3) even w/ --allow-unresolved
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
shift # drop 'api'
if [ "\$1" = "graphql" ]; then
  q="\$*"; num="\$(printf '%s' "\$q" | sed -n 's/.*number:\([0-9][0-9]*\).*/\1/p')"
  case "\$num" in
    12) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":false,"comments":{"nodes":[{"body":"major bug"}]}}]}}}}}' ;;
    13) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"isResolved":false,"isOutdated":true,"comments":{"nodes":[{"body":"old"}]}}]}}}}}' ;;
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
case "\$1" in
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

# stub mark-pr-notification-done: record an apply, succeed.
cat > "$TMP/mark-pr-notification-done" <<MARK
#!/usr/bin/env bash
echo "\$*" >> "$DELLOG"
exit 0
MARK
chmod +x "$TMP/mark-pr-notification-done"
# gate calls the helper by its own dir; symlink the real gate into TMP next to the stub helper.
ln -sf "$SCRIPT" "$TMP/pr-notification-gate"

run() { PATH="$TMP:$PATH" bash "$TMP/pr-notification-gate" "$@" 2>&1; rc=$?; echo "EXIT=$rc"; }

# T1 #10 clean dry-run -> exit 0, no apply
: > "$DELLOG"; out="$(run org/r 10)"
if printf '%s' "$out" | grep -q 'would-CLEAR org/r#10' && printf '%s' "$out" | grep -q 'EXIT=0' && [ ! -s "$DELLOG" ]; then ok "T1 clean dry-run exit0 no apply"; else nok "T1" "$out applied=$(cat "$DELLOG")"; fi

# T2 #11 open -> exit 2 BLOCK
out="$(run org/r 11)"
if printf '%s' "$out" | grep -q 'BLOCK org/r#11' && printf '%s' "$out" | grep -q 'EXIT=2'; then ok "T2 open -> exit2"; else nok "T2" "$out"; fi

# T3 #12 unresolved non-outdated -> exit 3 BLOCK
out="$(run org/r 12)"
if printf '%s' "$out" | grep -q 'BLOCK org/r#12' && printf '%s' "$out" | grep -q 'EXIT=3'; then ok "T3 live thread -> exit3"; else nok "T3" "$out"; fi

# T4 #13 outdated -> exit 3 by default
out="$(run org/r 13)"
if printf '%s' "$out" | grep -q 'EXIT=3'; then ok "T4 outdated blocks by default"; else nok "T4" "$out"; fi

# T5 #13 outdated CLEARS with --allow-unresolved (apply records)
: > "$DELLOG"; out="$(run --apply --allow-unresolved org/r 13)"
if printf '%s' "$out" | grep -q 'CLEAR org/r#13' && printf '%s' "$out" | grep -q 'EXIT=0' && grep -q '13' "$DELLOG"; then ok "T5 --allow-unresolved clears outdated + applies"; else nok "T5" "$out applied=$(cat "$DELLOG")"; fi

# T6 #14 needs-human -> exit 3 even with --allow-unresolved
out="$(run --allow-unresolved org/r 14)"
if printf '%s' "$out" | grep -q 'needs-human' && printf '%s' "$out" | grep -q 'EXIT=3'; then ok "T6 needs-human blocks always"; else nok "T6" "$out"; fi

# T7 #10 --apply actually calls mark-done
: > "$DELLOG"; run --apply org/r 10 >/dev/null
if grep -q '10' "$DELLOG"; then ok "T7 --apply calls mark-pr-notification-done"; else nok "T7" "applied=$(cat "$DELLOG")"; fi

# T8 #15 GraphQL failure (exit 1 + errors JSON) -> exit 4 BLOCK, not false-clear
out="$(run org/r 15)"
if printf '%s' "$out" | grep -q 'BLOCK org/r#15' && printf '%s' "$out" | grep -q 'EXIT=4'; then ok "T8 graphql failure -> exit4 BLOCK"; else nok "T8" "$out"; fi

# T9 #15 --apply under the failing stub performs ZERO mutations
: > "$DELLOG"; out="$(run --apply org/r 15)"
if printf '%s' "$out" | grep -q 'EXIT=4' && [ ! -s "$DELLOG" ]; then ok "T9 graphql failure --apply mutates nothing"; else nok "T9" "$out applied=$(cat "$DELLOG")"; fi

# T10 #16 hasNextPage=true -> exit 4 BLOCK, --apply mutates nothing
: > "$DELLOG"; out="$(run --apply org/r 16)"
if printf '%s' "$out" | grep -q 'BLOCK org/r#16' && printf '%s' "$out" | grep -q 'EXIT=4' && [ ! -s "$DELLOG" ]; then ok "T10 truncated thread page -> exit4 BLOCK, no apply"; else nok "T10" "$out applied=$(cat "$DELLOG")"; fi

# T11 #17 needs-human in a REPLY (not first comment) blocks even with --allow-unresolved
out="$(run --allow-unresolved org/r 17)"
if printf '%s' "$out" | grep -q 'needs-human' && printf '%s' "$out" | grep -q 'EXIT=3'; then ok "T11 needs-human reply seen via comments(last:10)"; else nok "T11" "$out"; fi

echo ""; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
