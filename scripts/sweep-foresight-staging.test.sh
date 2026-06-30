#!/usr/bin/env bash
# Tests for sweep-foresight-staging. Self-contained: a stub gh on PATH returns
# canned project/search data. RP-07: each capped read (field-list / item-list /
# search) must fail closed (exit 2, ZERO mutations) when it fills its --limit,
# because a full page hides rows past the cap (a truncated member set makes
# on-project foresight look off-project and --apply would mis-stage it).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-foresight-staging"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CALLLOG="$TMP/calls"
: > "$CALLLOG"

# GH_STUB_ITEMS = project members org/r#1..N (all staged with milestone M1);
# GH_STUB_SEARCH = open foresight issues org/r#1..N. Issue #1 is fully staged
# (member + M1 + parented + no needs-triage); any issue past the member count
# is an off-project strand whose body frontmatter derives milestone M1.
cat > "$TMP/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_CALLLOG"
case "$1 $2" in
  "project list")
    echo '{"projects":[{"number":2,"id":"PROJ-ID","title":"CuraOS Roadmap"}]}'
    ;;
  "project field-list")
    echo '{"fields":[{"id":"STATUS-FIELD","name":"Status","options":[{"id":"ff47fcf0","name":"Backlog"},{"id":"95441b7d","name":"Done"}]},{"id":"CM-FIELD","name":"CuraOS Milestone","options":[{"id":"OPT-M1","name":"M1"}]}]}'
    ;;
  "project item-list")
    jq -nc --argjson n "${GH_STUB_ITEMS:-1}" \
      '{items:[range($n) | {id:("ITEM-\(.)"),content:{repository:"org/r",number:(.+1)},"curaOS Milestone":"M1"}]}'
    ;;
  "search issues")
    for i in $(seq 1 "${GH_STUB_SEARCH:-1}"); do echo "org/r#$i"; done
    ;;
  "issue view")
    # RP-41 merged read: ONE --json body,labels call per issue. Frontmatter
    # derives milestone M1; no fixture issue carries needs-triage.
    echo '{"body":"milestone: M1","labels":[]}'
    ;;
  "api graphql")
    if printf '%s' "$*" | grep -q '__type'; then
      # RP-79 schema probe; GH_STUB_NO_HIERARCHY=1 simulates an API surface
      # without Issue.parent/subIssues (sweep must fail closed).
      if [ "${GH_STUB_NO_HIERARCHY:-0}" = "1" ]; then
        echo '{"data":{"__type":{"fields":[{"name":"id"}]}}}'
      else
        echo '{"data":{"__type":{"fields":[{"name":"parent"},{"name":"subIssues"}]}}}'
      fi
    else
      # RP-79 batched aliased hierarchy read: every fixture issue is parented
      # under issue 1; answer one alias (i0..iN-1) per repository(...) node.
      n=$(printf '%s' "$*" | grep -o 'repository(owner:' | wc -l | tr -d ' ')
      jq -nc --argjson n "$n" '{data: ([range($n) | {("i\(.)"): {issue: {databaseId: (100 + .), parent: {number: 1, repository: {nameWithOwner: "org/r"}}}}}] | add)}'
    fi
    ;;
  "project item-add")
    echo "ITEM-NEW"
    ;;
  "project item-edit")
    ;;
  "issue edit")
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 2
    ;;
esac
STUB
chmod +x "$TMP/gh"

run() {
  STUB_CALLLOG="$CALLLOG" PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1
  printf 'EXIT=%s\n' "$?"
}
mutated() { grep -Eq 'project item-add|project item-edit|issue edit' "$CALLLOG"; }

# Fail-closed fixture class 3 (cap-reached) per [[curaos-quality-gates-rule]] "Fail-closed convention + mandatory failure fixtures"
# --- item-list cap-reached fixture: --apply fails closed, mutates NOTHING ---
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=2 GH_STUB_SEARCH=1 SWEEP_ITEM_LIMIT=2 run --apply)"
if printf '%s' "$out" | grep -q 'item list filled' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! mutated; then
  ok "item-list cap-reached --apply fails closed (exit 2, zero mutations)"
else
  nok "item-list cap --apply" "$out calls=$(cat "$CALLLOG")"
fi

# --- search cap-reached fixture: --apply fails closed, mutates NOTHING ---
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=1 GH_STUB_SEARCH=2 SWEEP_SEARCH_LIMIT=2 run --apply)"
if printf '%s' "$out" | grep -q 'foresight search filled' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! mutated; then
  ok "search cap-reached --apply fails closed (exit 2, zero mutations)"
else
  nok "search cap --apply" "$out calls=$(cat "$CALLLOG")"
fi

# --- field-list cap-reached fixture: --apply fails closed, mutates NOTHING ---
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=1 GH_STUB_SEARCH=1 SWEEP_FIELD_LIMIT=2 run --apply)"
if printf '%s' "$out" | grep -q 'field list filled' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! mutated; then
  ok "field-list cap-reached --apply fails closed (exit 2, zero mutations)"
else
  nok "field-list cap --apply" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap, fully-staged foresight: clean dry-run (no false truncation trip) ---
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=1 GH_STUB_SEARCH=1 run)"
if printf '%s' "$out" | grep -q 'dry-run: 0 improperly-parked' \
  && printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! mutated; then
  ok "under-cap staged foresight passes clean (exit 0)"
else
  nok "under-cap clean dry-run" "$out calls=$(cat "$CALLLOG")"
fi

# --- under-cap --apply DOES stage a strand (proves the mutation grep above is live) ---
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=1 GH_STUB_SEARCH=2 run --apply)"
if printf '%s' "$out" | grep -q 'STAGE    org/r#2' \
  && printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q 'project item-add' "$CALLLOG"; then
  ok "under-cap --apply stages the off-project strand and exits 0"
else
  nok "under-cap --apply stages" "$out calls=$(cat "$CALLLOG")"
fi

# --- RP-41 per-issue call ledger: 1 merged view per issue; parent probe batched ---
# 3 foresight issues, all staged: exactly 3 `issue view` calls and every one is
# the merged --json body,labels read; the parent lookup rides gh-project.js
# issueHierarchy (schema probe + ONE aliased document = at most 2 graphql calls
# TOTAL, not per issue), and no raw `/parent` REST probe exists at all.
: > "$CALLLOG"
out="$(GH_STUB_ITEMS=3 GH_STUB_SEARCH=3 run)"
views=$(grep -c '^issue view' "$CALLLOG" || true)
merged=$(grep -c '^issue view .*--json body,labels' "$CALLLOG" || true)
gqls=$(grep -c '^api graphql' "$CALLLOG" || true)
if [ "$views" -eq 3 ] && [ "$merged" -eq 3 ] && [ "$gqls" -le 2 ] \
  && ! grep -q '/parent' "$CALLLOG" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "RP-41 ledger: 1 merged view per issue; <=2 batched graphql; no /parent REST probe"
else
  nok "RP-41 per-issue ledger" "views=$views merged=$merged gqls=$gqls out=$out calls=$(cat "$CALLLOG")"
fi

# --- RP-41 hierarchy unavailable: fail closed (exit 2, zero mutations) ---
# When Issue.parent/subIssues are schema-gated away, tree-linking (invariant 4)
# is unverifiable: the sweep must refuse to run rather than mis-report.
: > "$CALLLOG"
out="$(GH_STUB_NO_HIERARCHY=1 GH_STUB_ITEMS=1 GH_STUB_SEARCH=2 run --apply)"
if printf '%s' "$out" | grep -q 'cannot verify tree-linking' \
  && printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! mutated; then
  ok "hierarchy-fields-unavailable --apply fails closed (exit 2, zero mutations)"
else
  nok "hierarchy unavailable fail-closed" "$out calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
