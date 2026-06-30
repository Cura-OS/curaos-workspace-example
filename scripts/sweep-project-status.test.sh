#!/usr/bin/env bash
# Tests for sweep-project-status. Self-contained: a stub gh on PATH returns
# canned project data. RP-07: a full item page means rows past the --limit cap
# were silently dropped (a stuck item could false-pass), so the sweep must fail
# closed (exit 2, ZERO mutations) instead of sweeping a partial board.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-project-status"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CALLLOG="$TMP/calls"
: > "$CALLLOG"

# GH_STUB_ITEMS controls how many "In Review" items the item-list page returns;
# every linked issue reads back CLOSED/COMPLETED so each item is advanceable.
cat > "$TMP/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_CALLLOG"
case "$1 $2" in
  "project list")
    echo '{"projects":[{"number":2,"id":"PROJ-ID","title":"CuraOS Roadmap"}]}'
    ;;
  "project field-list")
    echo '{"fields":[{"id":"STATUS-FIELD","name":"Status","options":[{"id":"95441b7d","name":"Done"}]}]}'
    ;;
  "project item-list")
    jq -nc --argjson n "${GH_STUB_ITEMS:-2}" \
      '{items:[range($n) | {id:("ITEM-\(.)"),content:{repository:"org/r",number:(.+1)},status:"In Review"}]}'
    ;;
  "issue view")
    echo '{"state":"CLOSED","stateReason":"COMPLETED"}'
    ;;
  "project item-edit")
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

# --- cap-reached fixture: --apply at the cap fails closed, mutates NOTHING ---
: > "$CALLLOG"
out="$(run 3 3 --apply)"
if printf '%s' "$out" | grep -q 'TRUNCATED' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! grep -q 'item-edit' "$CALLLOG"; then
  ok "cap-reached --apply fails closed (exit 2, zero mutations)"
else
  nok "cap-reached --apply" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap dry-run still detects stuck items (no false truncation trip) ---
: > "$CALLLOG"
out="$(run 5 2)"
if printf '%s' "$out" | grep -q 'would-ADVANCE  org/r#1' \
  && printf '%s' "$out" | grep -q 'EXIT=3' \
  && ! grep -q 'item-edit' "$CALLLOG"; then
  ok "under-cap dry-run reports stuck items, exits 3, mutates nothing"
else
  nok "under-cap dry-run" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap --apply DOES advance (proves the zero-mutation grep above is live) ---
: > "$CALLLOG"
out="$(run 5 2 --apply)"
if printf '%s' "$out" | grep -q 'ADVANCE  org/r#1' \
  && printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q 'item-edit' "$CALLLOG"; then
  ok "under-cap --apply advances to Done and exits 0"
else
  nok "under-cap --apply" "$out calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
