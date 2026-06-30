#!/usr/bin/env bash
# Tests for scripts/session-closeout (RP-13). Self-contained: stub gh +
# agent-workflow-kit on PATH, stub convergers + backfill in a fixture scripts
# dir, fixture workspace as a real git repo so `git diff --name-only` and
# mtime checks run for real.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/session-closeout"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BIN="$TMP/bin"
STUBSCRIPTS="$TMP/stubscripts"
mkdir -p "$BIN" "$STUBSCRIPTS"

# --- PATH stubs ---------------------------------------------------------------
cat > "$BIN/gh" <<'STUB'
#!/usr/bin/env bash
if [ "${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "gh: api unreachable" >&2
  exit 1
fi
# step 7 claim verification: gh pr view <n> --repo <owner>/<repo> --json state --jq .state
if [ "${1:-}" = "pr" ]; then
  state="${GH_STUB_PR_STATE:-MERGED}"
  if [ "$state" = "notfound" ]; then
    echo "GraphQL: Could not resolve to a PullRequest with the number given" >&2
    exit 1
  fi
  printf '%s\n' "$state"
  exit 0
fi
# step 5 freshness probe: gh search prs ... --jq 'map(.closedAt) | max // empty'
printf '%s\n' "${GH_STUB_MERGED_AT:-2020-01-02T00:00:00Z}"
STUB
chmod +x "$BIN/gh"

cat > "$BIN/agent-workflow-kit" <<'STUB'
#!/usr/bin/env bash
case "${AWK_STUB_MODE:-clean}" in
  clean)
    printf '{"output":{"issue_roadmap_updated":false,"handover_updated":false,"drift":[]}}\n' ;;
  lie)
    # reports an update but writes NOTHING (the self-report failure class)
    printf '{"output":{"issue_roadmap_updated":false,"handover_updated":true,"drift":["x"]}}\n' ;;
  real-update)
    printf 'mirror: refreshed stop-state line\n' >> "$AWK_STUB_HANDOVER"
    printf '{"output":{"issue_roadmap_updated":false,"handover_updated":true,"drift":["x"]}}\n' ;;
  no-flags)
    printf '{"output":{"something":"else"}}\n' ;;
  fail)
    echo "workflow harness down" >&2
    exit 1 ;;
esac
STUB
chmod +x "$BIN/agent-workflow-kit"

# --- fixture converger + backfill stubs ----------------------------------------
for conv in sweep-closed-issue-labels sweep-project-status sweep-foresight-staging sweep-roadmap-milestone-fields; do
  cat > "$STUBSCRIPTS/$conv" <<'STUB'
#!/usr/bin/env bash
name="$(basename "$0")"
echo "$name stub dry-run"
if [ "${CONV_DRIFT:-}" = "$name" ]; then
  echo "would-FIX something stranded"
  exit 3
fi
exit "${CONV_EXIT:-0}"
STUB
  chmod +x "$STUBSCRIPTS/$conv"
done

# knowledge-drift gate stub (step 11; the real script has its own suite)
cat > "$STUBSCRIPTS/check-knowledge-drift.sh" <<'STUB'
#!/usr/bin/env bash
if [ "${DRIFT_STUB_EXIT:-0}" != "0" ]; then
  echo "DRIFT fixture: AGENTS section-15 names a rule file that does not exist"
  exit "${DRIFT_STUB_EXIT}"
fi
echo "ok fixture: knowledge stores reconcile"
STUB
chmod +x "$STUBSCRIPTS/check-knowledge-drift.sh"

cat > "$STUBSCRIPTS/backfill-calibration-outcome.js" <<'STUB'
const mode = process.env.BACKFILL_STUB_MODE || "none-pending";
if (mode === "ok") { console.log("backfill: wrote outcome"); process.exit(0); }
if (mode === "error") { console.error("backfill: log unreadable"); process.exit(2); }
console.error("backfill: no matching record (latest-without-outcome)");
process.exit(1);
STUB

# --- fixture workspace ----------------------------------------------------------
GOOD_HANDOVER='---
goal: test the closeout gate
branch: main
head_sha: abc1234
active_issues:
  - org/repo#1 a thing in flight
blockers: []
decisions:
  - decided something
next_action: run the suite
---

# HANDOVER

Body line.'

GOOD_ROADMAP='# CuraOS Issue Roadmap

Generated at 2026-06-10T00:00:00Z

| Milestone | Issue |
|---|---|'

GOOD_README='# Docs index fixture

## Current state

> Live execution state lives in HANDOVER.md + ISSUE-ROADMAP.md (pointer block fixture).'

# step-12 fixture board snapshot (RP-53): the \\u2014 escape below, so the
# rendered title carries a real em dash for the sanitizer to strip; this test
# file itself stays dash-free.
GOOD_SNAPSHOT='{
  "fetchedAtMs": 1781100000000,
  "projectNumber": 2,
  "items": [
    { "id": "PVTI_1", "status": "Done", "curaOS Milestone": "M1", "target Version": "v1",
      "labels": ["enhancement", "done"],
      "content": { "type": "Issue", "number": 30,
        "repository": "your-org/curaos-ai-workspace",
        "title": "[M1] Bun workspace \u2014 Turborepo scaffold",
        "url": "https://github.com/your-org/curaos-ai-workspace/issues/30" } },
    { "id": "PVTI_2", "status": "Backlog", "curaOS Milestone": "M16", "labels": [],
      "content": { "type": "Issue", "number": 537,
        "repository": "your-org/curaos-ai-workspace",
        "title": "[M16] chart generator story",
        "url": "https://github.com/your-org/curaos-ai-workspace/issues/537" } },
    { "id": "PVTI_3", "status": "Done",
      "content": { "type": "DraftIssue", "title": "draft fixture, no url" } }
  ]
}'

# step-13 fixture RESOLUTION-MAP (RP-53): one past-due M-keyed row, one
# future-keyed row, one keyless pre-prod row, one DEFERRED-V2 row, plus the
# category-definition table the sweep must skip.
GOOD_RESMAP='# ADR Open Questions Resolution Map fixture

## Resolution categories

| Status | Meaning |
|---|---|
| **DEFERRED-MILESTONE** | Resolution scheduled at a milestone trigger |

## ADR-0001 fixture section

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Hash-chain re-genesis | DEFERRED-MILESTONE | M2 (audit kickoff) |
| 2 | Far-future keyed row | DEFERRED-MILESTONE | M99 far future |
| 3 | Pre-prod keyless row | DEFERRED-MILESTONE | Security review pre-prod |
| 4 | V2 row stays out | DEFERRED-V2 | reassess at v2 |'

GOOD_REGISTER='# Risk Register fixture

Sweep parsing contract (RP-45): a row is unguarded iff its Guard cell starts with the literal token NONE.

| ID | Pattern | Incidents | Guard | Last recurrence |
|---|---|---|---|---|
| RR-01 | guarded fixture pattern that never ages out | fixture seed | scripts/some-guard.sh | session-20 |'

mkdir -p "$TMP/nohooks"
mk_ws() {
  WS="$TMP/ws-$1"
  DOCS="$WS/ai/curaos/docs"
  MEM="$WS/memfix"
  mkdir -p "$DOCS" "$DOCS/adr" "$MEM"
  printf '%s\n' "$GOOD_HANDOVER" > "$DOCS/HANDOVER.md"
  printf '%s\n' "$GOOD_ROADMAP" > "$DOCS/ISSUE-ROADMAP.md"
  printf '%s\n' "$GOOD_README" > "$DOCS/README.md"
  printf '%s\n' "$GOOD_REGISTER" > "$DOCS/RISK-REGISTER.md"
  printf '%s\n' "$GOOD_SNAPSHOT" > "$WS/board-snapshot.json"
  printf '%s\n' "$GOOD_RESMAP" > "$DOCS/adr/RESOLUTION-MAP.md"
  printf '# Memory Index fixture\n' > "$MEM/MEMORY.md"
  git -C "$WS" init -q
  # fixture commits must not run the operator's global hook stack (lefthook)
  git -C "$WS" config core.hooksPath "$TMP/nohooks"
  git -C "$WS" add -A
  git -C "$WS" -c user.email=t@t -c user.name=t commit -qm fixture
}

run_closeout() {
  PATH="$BIN:$PATH" \
  SESSION_CLOSEOUT_WS="$WS" \
  SESSION_CLOSEOUT_SCRIPTS="$STUBSCRIPTS" \
  SESSION_CLOSEOUT_MEMORY_DIR="$WS/memfix" \
  SESSION_CLOSEOUT_SHA_REPOS="$WS" \
  SESSION_CLOSEOUT_FORESIGHT_DIR="$WS/fxpayloads" \
  SESSION_CLOSEOUT_SNAPSHOT="${SNAPSHOT_OVERRIDE:-$WS/board-snapshot.json}" \
  AWK_STUB_HANDOVER="$WS/ai/curaos/docs/HANDOVER.md" \
  bash "$SCRIPT" "$@" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# register a memory topic file in the fixture index (keeps step 8 green while
# a test exercises step 7)
mem_index() {
  printf -- '- [%s](%s)\n' "$1" "$1" >> "$WS/memfix/MEMORY.md"
}

# 1. green path: fresh HANDOVER, clean convergers, truthful mirror, old merged-PR
mk_ws green
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'ALL CHECKS GREEN' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "green path exits 0"
else
  nok "green path" "$out"
fi

# 2. stale HANDOVER (old mtime, newer merged PR) exits nonzero
mk_ws stale
touch -t 201901010000 "$WS/ai/curaos/docs/HANDOVER.md"
out="$(GH_STUB_MERGED_AT=2026-06-10T12:00:00Z run_closeout)"
if printf '%s' "$out" | grep -q 'HANDOVER.md is STALE' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "stale HANDOVER (mtime predates newest merged PR) fails"
else
  nok "stale HANDOVER" "$out"
fi

# 3. converger dry-run drift (exit 3) fails and names the converger
mk_ws drift
out="$(CONV_DRIFT=sweep-project-status run_closeout)"
if printf '%s' "$out" | grep -q 'sweep-project-status dry-run reports DRIFT' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "converger drift (exit 3) fails the closeout"
else
  nok "converger drift" "$out"
fi

# 4. missing required frontmatter key fails (recurring schema validation)
mk_ws nokey
grep -v '^next_action:' "$WS/ai/curaos/docs/HANDOVER.md" > "$WS/h.tmp"
mv "$WS/h.tmp" "$WS/ai/curaos/docs/HANDOVER.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'missing required key (or empty value): next_action' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing frontmatter key (next_action) fails"
else
  nok "missing frontmatter key" "$out"
fi

# 5. missing required LIST key fails too
mk_ws nolist
grep -v '^blockers:' "$WS/ai/curaos/docs/HANDOVER.md" > "$WS/h.tmp"
mv "$WS/h.tmp" "$WS/ai/curaos/docs/HANDOVER.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'missing required list key: blockers' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing frontmatter list key (blockers) fails"
else
  nok "missing list key" "$out"
fi

# 6. mirror self-report lie (reports updated, writes nothing) fails
mk_ws lie
out="$(AWK_STUB_MODE=lie run_closeout)"
if printf '%s' "$out" | grep -q 'self-report not corroborated' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "mirror reported-update with no real edit fails (git/hash corroboration)"
else
  nok "mirror self-report lie" "$out"
fi

# 7. mirror real update is corroborated via git diff --name-only and passes
mk_ws realup
out="$(AWK_STUB_MODE=real-update run_closeout)"
if printf '%s' "$out" | grep -q 'corroborated (hash changed + present in git diff --name-only)' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "mirror real update corroborated and green"
else
  nok "mirror real update" "$out"
fi

# 8. unreported mirror edit (reported false, file changed) fails
mk_ws ghostedit
out="$(AWK_STUB_MODE=clean AWK_GHOST="$WS" bash -c '
  printf "ghost edit\n" >> "$1/ai/curaos/docs/HANDOVER.md"' _ "$WS"; run_closeout)"
# the ghost edit lands BEFORE the mirror runs; clean mirror reports false while
# hashes still match pre/post mirror, so this stays green; the lie class is
# covered by test 6. Assert the closeout does not false-fail on a pre-dirty file.
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "pre-dirty HANDOVER does not false-fail corroboration"
else
  nok "pre-dirty HANDOVER" "$out"
fi

# 9. HANDOVER over the 150-line cap fails
mk_ws toolong
{ printf '%s\n' "$GOOD_HANDOVER"; for i in $(seq 1 140); do echo "filler $i"; done; } \
  > "$WS/ai/curaos/docs/HANDOVER.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'exceeds the 150-line cap' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "HANDOVER over 150 lines fails"
else
  nok "150-line cap" "$out"
fi

# 10. ISSUE-ROADMAP missing its Generated at stamp fails
mk_ws nostamp
grep -v '^Generated at ' "$WS/ai/curaos/docs/ISSUE-ROADMAP.md" > "$WS/r.tmp"
mv "$WS/r.tmp" "$WS/ai/curaos/docs/ISSUE-ROADMAP.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q "missing its 'Generated at <ISO>' stamp" \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing ISSUE-ROADMAP Generated-at stamp fails"
else
  nok "roadmap stamp" "$out"
fi

# 11. merged-PR probe failure fails closed
mk_ws ghdown
out="$(GH_STUB_FAIL=1 run_closeout)"
if printf '%s' "$out" | grep -q 'merged-PR probe failed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "gh probe failure fails closed"
else
  nok "gh probe fail-closed" "$out"
fi

# 12. backfill hard error fails; "no matching record" passes
mk_ws backfill
out="$(BACKFILL_STUB_MODE=error run_closeout)"
if printf '%s' "$out" | grep -q 'backfill-calibration-outcome failed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "backfill hard error fails the closeout"
else
  nok "backfill error" "$out"
fi
out="$(BACKFILL_STUB_MODE=none-pending run_closeout)"
if printf '%s' "$out" | grep -q 'no calibration record pending backfill' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "backfill with nothing pending passes"
else
  nok "backfill none-pending" "$out"
fi

# 13. mirror harness outage fails closed (unless --skip-mirror)
mk_ws harness
out="$(AWK_STUB_MODE=fail run_closeout)"
if printf '%s' "$out" | grep -q 'gh-roadmap-mirror run failed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "mirror harness outage fails closed"
else
  nok "mirror outage" "$out"
fi
out="$(AWK_STUB_MODE=fail run_closeout --skip-mirror)"
if printf '%s' "$out" | grep -q 'SKIPPED (--skip-mirror)' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "--skip-mirror bypasses only the mirror legs"
else
  nok "--skip-mirror" "$out"
fi

# 14. mirror output without the self-report booleans fails (cannot corroborate)
mk_ws noflags
out="$(AWK_STUB_MODE=no-flags run_closeout)"
if printf '%s' "$out" | grep -q 'cannot corroborate' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "mirror output missing booleans fails"
else
  nok "missing booleans" "$out"
fi

# 15. docs README missing its Current state pointer block fails (RP-24 guard)
mk_ws noblock
printf '# Docs index without the pointer block\n' > "$WS/ai/curaos/docs/README.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q "missing its '## Current state' pointer block" \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing Current state block fails (RP-24 stale-state-doc guard)"
else
  nok "Current state block" "$out"
fi

# 16. fabricated qualified merge claim (PR not found) fails (RP-28)
mk_ws claimfiction
printf 'Wave closed: somerepo#9999 merged after grill.\n' > "$WS/memfix/claim.md"
mem_index claim.md
out="$(GH_STUB_PR_STATE=notfound run_closeout)"
if printf '%s' "$out" | grep -q 'merge claim your-org/somerepo#9999 could not be verified' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "fabricated merge claim (PR not found) fails"
else
  nok "fabricated merge claim" "$out"
fi

# 17. qualified merge claim verified MERGED passes; OPEN state fails
out="$(GH_STUB_PR_STATE=MERGED run_closeout)"
if printf '%s' "$out" | grep -q 'merge claim your-org/somerepo#9999 verified MERGED' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "verified merge claim passes"
else
  nok "verified merge claim" "$out"
fi
out="$(GH_STUB_PR_STATE=OPEN run_closeout)"
if printf '%s' "$out" | grep -q 'is NOT merged (state=OPEN)' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "open-PR merge claim fails (the #202-merged fiction class)"
else
  nok "open-PR merge claim" "$out"
fi

# 18. bare merge claim without a repo qualifier fails (unverifiable)
mk_ws clambare
printf 'Wrapped up: #202 merged.\n' > "$WS/memfix/bare.md"
mem_index bare.md
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'bare merge claim in bare.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "bare merge claim (no repo qualifier) fails"
else
  nok "bare merge claim" "$out"
fi

# 19. claims in OLD memory files (outside the window) are not scanned
mk_ws claimold
printf 'Ancient fiction: somerepo#1 merged.\n' > "$WS/memfix/old.md"
mem_index old.md
touch -t 202001010000 "$WS/memfix/old.md"
out="$(GH_STUB_PR_STATE=notfound run_closeout)"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "old memory file outside the claim window is not scanned"
else
  nok "claim window" "$out"
fi

# 20. memory file unreferenced from MEMORY.md fails index completeness
mk_ws orphan
printf 'A note with no claims at all.\n' > "$WS/memfix/orphan.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'unreferenced from MEMORY.md (index incomplete): orphan.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unreferenced memory file fails index completeness"
else
  nok "index completeness" "$out"
fi

# 21. SHA claim that resolves in no local repo fails; a real SHA passes
mk_ws shaclaim
printf 'pointer chain curaos deadbeefcafe synced\n' > "$WS/memfix/sha.md"
mem_index sha.md
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'SHA claim deadbeefcafe resolves in NO local repo' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unresolvable SHA claim fails"
else
  nok "unresolvable SHA claim" "$out"
fi
# the SHA scanner requires a hex LETTER in the token (pure-decimal runs are
# excluded by design); mint commits until the fixture short-SHA carries one
REAL_SHA="$(git -C "$WS" rev-parse --short=12 HEAD)"
tries=0
while ! printf '%s' "$REAL_SHA" | grep -q '[a-f]' && [ "$tries" -lt 20 ]; do
  git -C "$WS" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "bump-$tries"
  REAL_SHA="$(git -C "$WS" rev-parse --short=12 HEAD)"
  tries=$((tries + 1))
done
printf 'pointer chain synced %s\n' "$REAL_SHA" > "$WS/memfix/sha.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q "SHA claim $REAL_SHA resolves in a local repo" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "resolvable SHA claim passes"
else
  nok "resolvable SHA claim" "$out"
fi

# 22. claim-cap reached fails closed (RP-23 cap-reached fixture class)
mk_ws claimcap
printf 'a#1 merged, b#2 merged, c#3 merged\n' > "$WS/memfix/cap.md"
mem_index cap.md
out="$(SESSION_CLOSEOUT_CLAIM_CAP=2 run_closeout)"
if printf '%s' "$out" | grep -q 'exceed the cap (2)' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "claim cap reached fails closed"
else
  nok "claim cap" "$out"
fi

# 23. calibration log data path (RP-47): malformed log fails; sound log with
# null priority/effort passes with the capture-defect note
mk_ws callog
mkdir -p "$STUBSCRIPTS/lib"
printf '{ not json' > "$STUBSCRIPTS/lib/dep-graph-calibration-log.json"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'calibration log data path BROKEN' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "malformed calibration log fails the data-path check"
else
  nok "malformed calibration log" "$out"
fi
cat > "$STUBSCRIPTS/lib/dep-graph-calibration-log.json" <<'JSON'
{ "schemaVersion": 1, "records": [
  { "waveId": "M1-2026-01-01T00:00:00Z", "dispatchedAt": "2026-01-01T00:00:00Z",
    "candidates": [ { "issue": "o/r#1", "priority": null, "effort": null } ] }
] }
JSON
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'calibration log structurally sound' \
  && printf '%s' "$out" | grep -q 'null priority/effort' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "sound calibration log passes and surfaces the null-capture note"
else
  nok "calibration null note" "$out"
fi
rm -rf "$STUBSCRIPTS/lib"

# 24. lesson mining (RP-45): a new LESSON line appends a candidate register row;
# the ledger dedupes a second run
mk_ws mine
printf 'LESSON: always fetch submodule remotes before update on remote boxes\n' > "$WS/memfix/lesson.md"
mem_index lesson.md
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'step 9: lesson-mining sweep appended candidate register row(s): added=1' \
  && grep -q 'always fetch submodule remotes' "$WS/ai/curaos/docs/RISK-REGISTER.md" \
  && grep -q 'NONE (candidate: auto-mined' "$WS/ai/curaos/docs/RISK-REGISTER.md" \
  && grep -q 'mined-lesson' "$WS/ai/curaos/docs/RISK-REGISTER.md" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "lesson mining appends a candidate register row + ledger entry"
else
  nok "lesson mining" "$out"
fi
out="$(run_closeout)"
ROWS="$(grep -c 'always fetch submodule remotes' "$WS/ai/curaos/docs/RISK-REGISTER.md")"
if printf '%s' "$out" | grep -q 'step 9: lesson-mining sweep: no unmined LESSON/ROOT CAUSE lines' \
  && [ "$ROWS" = "1" ]; then
  ok "second mining run adds nothing (ledger dedupe)"
else
  nok "mining dedupe" "rows=$ROWS $out"
fi

# 25. aging sweep (RP-45): aged guard=NONE rows (session-form + date-form) emit
# foresight-capture payloads with asserted staging invariants; rows get stamped;
# a second run files nothing
mk_ws age
cat >> "$WS/ai/curaos/docs/RISK-REGISTER.md" <<'ROWS'
| RR-02 | unguarded fixture pattern aged by session | fixture | NONE (planned: RP-99 someday) | session-20 |
| RR-03 | unguarded fixture pattern aged by date | fixture | NONE | 2026-01-01 |
ROWS
out="$(SESSION_CLOSEOUT_SESSION=23 run_closeout)"
if printf '%s' "$out" | grep -q 'emitted=2 rows=RR-02,RR-03' \
  && [ -f "$WS/fxpayloads/RR-02-foresight-payload.json" ] \
  && [ -f "$WS/fxpayloads/RR-03-foresight-payload.json" ] \
  && printf '%s' "$out" | grep -q 'invariant ok: labels needs-triage+foresight' \
  && printf '%s' "$out" | grep -q 'invariant ok: NO ready-for-agent promotion' \
  && printf '%s' "$out" | grep -q 'invariant ok: Project status Backlog' \
  && printf '%s' "$out" | grep -q 'invariant ok: dry_run true (no live issue creation)' \
  && printf '%s' "$out" | grep -q 'route via: agent-workflow-kit workflow-run foresight-capture' \
  && grep -q 'NONE (planned: RP-99 someday) \[foresight-payload-emitted ' "$WS/ai/curaos/docs/RISK-REGISTER.md" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "aged guard=NONE rows emit asserted foresight-capture payloads (dry-run, no issues)"
else
  nok "aging sweep emission" "$out"
fi
if grep -q '"ready-for-agent"' "$WS/fxpayloads/RR-02-foresight-payload.json"; then
  nok "payload quarantine" "payload mentions ready-for-agent"
else
  ok "payload carries no ready-for-agent promotion"
fi
if grep -q '"target_version": null' "$WS/fxpayloads/RR-02-foresight-payload.json" \
  && grep -q '"parent_ref": null' "$WS/fxpayloads/RR-02-foresight-payload.json"; then
  ok "target version + parent absent when unknown"
else
  nok "absent-version/parent invariant" "$(cat "$WS/fxpayloads/RR-02-foresight-payload.json")"
fi
out="$(SESSION_CLOSEOUT_SESSION=23 run_closeout)"
STAMPS="$(grep -c 'foresight-payload-emitted' "$WS/ai/curaos/docs/RISK-REGISTER.md")"
if printf '%s' "$out" | grep -q 'no aged guard=NONE register rows pending foresight conversion' \
  && [ "$STAMPS" = "2" ] \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "second aging run files nothing (register stamp dedupe)"
else
  nok "aging dedupe" "stamps=$STAMPS $out"
fi

# 26. aging sweep with a known parent + target version threads both into the
# payload and the invariant evidence; unaged rows stay untouched
mk_ws agever
cat >> "$WS/ai/curaos/docs/RISK-REGISTER.md" <<'ROWS'
| RR-02 | versioned fixture pattern | fixture | NONE | session-19 |
| RR-03 | fresh fixture pattern, not aged | fixture | NONE | session-23 |
ROWS
out="$(SESSION_CLOSEOUT_SESSION=23 \
  SESSION_CLOSEOUT_FORESIGHT_PARENT=curaos-ai-workspace#29 \
  SESSION_CLOSEOUT_FORESIGHT_TARGET_VERSION=v1.1 run_closeout)"
if printf '%s' "$out" | grep -q 'emitted=1 rows=RR-02' \
  && grep -q '"target_version": "v1.1"' "$WS/fxpayloads/RR-02-foresight-payload.json" \
  && grep -q '"parent_ref": "curaos-ai-workspace#29"' "$WS/fxpayloads/RR-02-foresight-payload.json" \
  && printf '%s' "$out" | grep -q 'invariant ok: target version set only when known' \
  && printf '%s' "$out" | grep -q 'invariant ok: parent linkage only when a parent exists' \
  && [ ! -f "$WS/fxpayloads/RR-03-foresight-payload.json" ] \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "known parent + target version thread into the payload; unaged row untouched"
else
  nok "parent/version threading" "$out"
fi

# 27. missing register fails closed (step 9); knowledge-drift gate failure
# fails the closeout (step 11); missing drift script fails closed
mk_ws noreg
rm "$WS/ai/curaos/docs/RISK-REGISTER.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'step 9: risk register missing' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing risk register fails closed"
else
  nok "missing register" "$out"
fi
mk_ws driftfail
out="$(DRIFT_STUB_EXIT=1 run_closeout)"
if printf '%s' "$out" | grep -q 'step 11: knowledge drift detected (exit 1)' \
  && printf '%s' "$out" | grep -q 'DRIFT fixture' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "knowledge-drift gate failure fails the closeout"
else
  nok "drift gate failure" "$out"
fi
mk_ws driftmissing
out="$(SESSION_CLOSEOUT_DRIFT_SCRIPT="$WS/no-such-script.sh" run_closeout)"
if printf '%s' "$out" | grep -q 'step 11: knowledge-drift gate missing' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing knowledge-drift script fails closed"
else
  nok "missing drift script" "$out"
fi

# 28. ISSUE-ROADMAP render (RP-53): step 12 regenerates the doc from the board
# snapshot with a fresh Generated-at stamp, sanitized titles (em dash -> "-"),
# every milestone present (M16 included), draft items skipped, zero network
EMDASH="$(printf '\342\200\224')"
mk_ws render
out="$(run_closeout)"
RM="$WS/ai/curaos/docs/ISSUE-ROADMAP.md"
if printf '%s' "$out" | grep -q 'step 12: ISSUE-ROADMAP regenerated from the board snapshot' \
  && grep -Eq '^Generated at 20[0-9]{2}-[0-9]{2}-[0-9]{2}T' "$RM" \
  && ! grep -q '^Generated at 2026-06-10T00:00:00Z' "$RM" \
  && grep -q 'Bun workspace - Turborepo scaffold' "$RM" \
  && ! LC_ALL=C grep -q "$EMDASH" "$RM" \
  && grep -q '| M1 | your-org/curaos-ai-workspace | \[#30 ' "$RM" \
  && grep -q '| M16 |' "$RM" \
  && ! grep -q 'draft fixture' "$RM" \
  && printf '%s' "$out" | grep -q '2 issue rows, 1 non-issue items skipped' \
  && printf '%s' "$out" | grep -q 'zero network calls' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "step 12 renders ISSUE-ROADMAP from the snapshot (fresh stamp, sanitized, all milestones)"
else
  nok "roadmap render" "$out"
fi

# 29. missing/empty snapshot fails step 12 closed (offline render never fetches)
mk_ws nosnap
out="$(SNAPSHOT_OVERRIDE="$WS/no-such-snapshot.json" run_closeout)"
if printf '%s' "$out" | grep -q 'step 12: ISSUE-ROADMAP render failed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing board snapshot fails the render closed"
else
  nok "missing snapshot" "$out"
fi
mk_ws emptysnap
printf '{ "items": [] }\n' > "$WS/board-snapshot.json"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'refusing to blank the roadmap' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "empty board snapshot fails closed (would blank the roadmap)"
else
  nok "empty snapshot" "$out"
fi

# 30. RESOLUTION-MAP sweep (RP-53): past-due checklist emitted (M2-keyed +
# keyless rows in; M99-keyed + DEFERRED-V2 + category table out)
mk_ws resmap
out="$(run_closeout)"
CHECKLIST="$WS/.scratch/resolution-map-pastdue.md"
if printf '%s' "$out" | grep -q 'step 13: RESOLUTION-MAP past-due sweep emitted its checklist' \
  && printf '%s' "$out" | grep -q '2 past-due DEFERRED-MILESTONE row(s) of 3 scanned (completed through M15)' \
  && [ -f "$CHECKLIST" ] \
  && grep -q 'Hash-chain re-genesis' "$CHECKLIST" \
  && grep -q 'Pre-prod keyless row' "$CHECKLIST" \
  && ! grep -q 'Far-future keyed row' "$CHECKLIST" \
  && ! grep -q 'V2 row stays out' "$CHECKLIST" \
  && ! grep -q 'Resolution scheduled at a milestone trigger' "$CHECKLIST" \
  && printf '%s' "$out" | grep -q 'step 13: past-due deferrals pending' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "step 13 emits the past-due checklist (keyed + keyless in, future/V2/category out)"
else
  nok "resolution-map sweep" "$out"
fi

# 31. missing RESOLUTION-MAP fails step 13 closed; parse failure fails closed
mk_ws nomap
rm "$WS/ai/curaos/docs/adr/RESOLUTION-MAP.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'step 13: RESOLUTION-MAP missing' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "missing RESOLUTION-MAP fails closed"
else
  nok "missing map" "$out"
fi
mk_ws badmap
printf 'prose mentioning DEFERRED-MILESTONE but zero table rows\n' \
  > "$WS/ai/curaos/docs/adr/RESOLUTION-MAP.md"
out="$(run_closeout)"
if printf '%s' "$out" | grep -q 'step 13: resolution-map sweep failed (exit 3)' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unparseable map (token present, zero rows) fails closed"
else
  nok "map parse failure" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
