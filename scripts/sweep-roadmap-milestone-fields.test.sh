#!/usr/bin/env bash
# Tests for sweep-roadmap-milestone-fields. Self-contained: a stub gh on PATH
# returns canned project data. RP-07: a full item page means the board may hold
# more rows than the --limit cap fetched, so the sweep must fail closed (exit 2,
# ZERO mutations) instead of converging a partial board.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-roadmap-milestone-fields"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CALLLOG="$TMP/calls"
: > "$CALLLOG"

# GH_STUB_ITEMS controls how many (milestone-less, title-derivable) items the
# item-list page returns; the graphql case answers the field query and records
# any updateProjectV2ItemFieldValue mutation in the call log.
cat > "$TMP/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_CALLLOG"
case "$1 $2" in
  "project list")
    echo '{"projects":[{"number":2,"id":"PROJ-ID","title":"CuraOS Roadmap"}]}'
    ;;
  "project item-list")
    jq -nc --argjson n "${GH_STUB_ITEMS:-2}" \
      '{items:[range($n) | {id:("ITEM-\(.)"),content:{repository:"r",number:(.+1),title:("[M1] story \(.+1)")},"curaOS Milestone":""}]}'
    ;;
  "api graphql")
    if printf '%s' "$*" | grep -q 'updateProjectV2ItemFieldValue'; then
      echo '{"data":{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"x"}}}}'
    else
      echo '{"data":{"organization":{"projectV2":{"field":{"id":"MS-FIELD","options":[{"id":"OPT-M1","name":"M1"}]}}}}}'
    fi
    ;;
  "issue view")
    echo ""
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 2
    ;;
esac
STUB
chmod +x "$TMP/gh"

run() {
  local limit="$1" items="$2"; shift 2
  STUB_CALLLOG="$CALLLOG" GH_STUB_ITEMS="$items" SWEEP_ITEM_LIMIT="$limit" \
    PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# Fail-closed fixture class 3 (cap-reached) per [[curaos-quality-gates-rule]] "Fail-closed convention + mandatory failure fixtures"
# --- cap-reached fixture: --apply at the cap fails closed, mutates NOTHING ---
: > "$CALLLOG"
out="$(run 3 3 --apply)"
if printf '%s' "$out" | grep -q 'TRUNCATED' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! grep -q 'updateProjectV2ItemFieldValue' "$CALLLOG"; then
  ok "cap-reached --apply fails closed (exit 2, zero mutations)"
else
  nok "cap-reached --apply" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap dry-run still converges (no false truncation trip) ---
: > "$CALLLOG"
out="$(run 5 2)"
if printf '%s' "$out" | grep -q 'WOULD-SET r#1 -> M1' \
  && printf '%s' "$out" | grep -q 'EXIT=3' \
  && ! grep -q 'updateProjectV2ItemFieldValue' "$CALLLOG"; then
  ok "under-cap dry-run derives milestones, exits 3, mutates nothing"
else
  nok "under-cap dry-run" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap --apply DOES mutate (proves the zero-mutation grep above is live) ---
: > "$CALLLOG"
out="$(run 5 2 --apply)"
if printf '%s' "$out" | grep -q 'SET r#1 -> M1' \
  && printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q 'updateProjectV2ItemFieldValue' "$CALLLOG"; then
  ok "under-cap --apply issues the field mutations and exits 0"
else
  nok "under-cap --apply" "$out calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
