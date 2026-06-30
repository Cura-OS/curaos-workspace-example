#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT/scripts/workflows/opposite-harness-grill.workflow.js"
PLAYBOOK="$ROOT/docs/agents/workflows/opposite-harness-grill.md"
ONE_TASK="$ROOT/docs/agents/one-task-execution-prompt.md"
PR_VERIFY="$ROOT/scripts/workflows/pr-verify-merge.workflow.js"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -e "$WORKFLOW" ] || fail "workflow file missing"
[ -e "$PLAYBOOK" ] || fail "playbook file missing"
[ -e "$ONE_TASK" ] || fail "one-task prompt missing"
[ -e "$PR_VERIFY" ] || fail "pr-verify-merge workflow missing"

grep -q "harness-probe" "$WORKFLOW" || fail "workflow missing harness-probe preflight"
grep -q "function ghPrCommand" "$WORKFLOW" || fail "workflow missing owner/repo#N PR command normalization"
grep -q "expected owner/repo#N or N" "$WORKFLOW" || fail "workflow missing invalid PR ref rejection"
grep -q "function gitDiffCommand" "$WORKFLOW" || fail "workflow missing diff_ref validation"
grep -q -- "--repo" "$WORKFLOW" || fail "workflow missing gh --repo command shape for owner/repo#N refs"
grep -q "blocked-harness-unavailable" "$WORKFLOW" || fail "workflow missing blocked-harness-unavailable result"
grep -q "GRILL: blocked-harness-unavailable" "$WORKFLOW" || fail "workflow report does not persist blocked harness status"
grep -q "GRILL-PROBE:" "$WORKFLOW" || fail "workflow report does not persist probe evidence"
grep -q "agent error" "$WORKFLOW" || fail "workflow missing agent rejection handling"
grep -q "grill_timeout_ms" "$WORKFLOW" || fail "workflow missing configurable grill timeout"
grep -q "allow_same_harness_fallback" "$WORKFLOW" || fail "workflow missing explicit fallback gate"
grep -q "gh pr.*--repo" "$WORKFLOW" || fail "workflow does not normalize owner/repo#N PR refs"
grep -q "same_harness_agent" "$WORKFLOW" || fail "workflow missing explicit same-harness fallback agent"
if [ "$(grep -c "same_harness_agent:" "$WORKFLOW")" -ne 1 ]; then
  fail "workflow has duplicate same_harness_agent contract input"
fi
grep -q "GRILL: same-harness-fallback" "$WORKFLOW" || fail "workflow missing same-harness fallback report marker"
grep -q "const finalReportPath = reportPath" "$WORKFLOW" || fail "workflow does not anchor missing grill report_path to executor path"
grep -q "function reportWrittenSince" "$WORKFLOW" || fail "workflow does not require a fresh grill report"
grep -q "blockedIssue.what ||" "$WORKFLOW" || fail "workflow timeout path does not handle empty blocked-harness issues"

# Codex probe inner alarm must derive from probe_timeout_ms, not be hardcoded - a hardcoded `alarm 15`
# false-negatived codex (~14s cold-start + hooks) and spuriously blocked every PR.
if grep -q "alarm 15;" "$WORKFLOW"; then fail "workflow still hardcodes a 15s codex probe alarm (false 'unavailable' on cold-start)"; fi
grep -q 'alarm ${innerAlarmSec}' "$WORKFLOW" || fail "workflow codex probe alarm is not derived from probe_timeout_ms"
grep -q "const probeTimeoutMs = timeoutNumber(cfg.probe_timeout_ms, 30000)" "$WORKFLOW" || fail "workflow probe default budget too tight for codex cold-start (expected 30000)"

# --- #493: pass + empty/missing report_path MUST fail closed (not accepted as a completed grill) ---
grep -q "function missingReportResult" "$WORKFLOW" || fail "workflow missing fail-closed missingReportResult handler"
grep -q "function pathsMatch" "$WORKFLOW" || fail "workflow missing report_path identity check"
grep -q 'workflow_defect: true' "$WORKFLOW" || fail "workflow missing machine-readable workflow_defect flag on missing report"
grep -q 'opposite-harness-report-missing' "$WORKFLOW" || fail "workflow missing stable workflow_defect_kind for missing report"
# A pass/issues-found/block verdict must route through BOTH gates: report_path identity AND fresh-write.
grep -q "if (!pathsMatch(result && result.report_path, finalReportPath))" "$WORKFLOW" || fail "workflow does not reject a verdict whose report_path is empty/mismatched"
# #706 P1b: the freshness gate now runs through a bounded poll (pollForReport) before declaring the
# report missing, then rejects via `if (!written)`. The freshness check (reportWrittenSince) is
# still the predicate (called inside pollForReport + as the degraded single check); the rejection is
# `if (!written)`.
grep -q "function pollForReport" "$WORKFLOW" || fail "workflow missing bounded poll loop for the written report (#706 P1b)"
grep -q "reportWrittenSince(finalReportPath, grillStartedAt)" "$WORKFLOW" || fail "workflow does not check a freshly-written report file"
grep -q "if (!written) {" "$WORKFLOW" || fail "workflow does not reject a verdict without a freshly-written report file (post-poll)"
grep -q "is impossible output and will be recorded as workflow_defect=true" "$WORKFLOW" || fail "workflow grill prompt does not declare empty report_path impossible output"

# Runtime proof of the fail-closed predicates: an EMPTY or MISSING report_path can never satisfy the
# gate, so a rescue agent returning verdict=pass + report_path="" is forced down missingReportResult.
node --input-type=module -e '
  import { resolve } from "node:path";
  import { existsSync, statSync } from "node:fs";
  // Mirror the workflow predicates exactly (kept in lockstep with the grep assertions above).
  const pathsMatch = (actual, expected) =>
    !!actual && typeof actual === "string" && resolve(actual) === resolve(expected);
  const reportWrittenSince = (p, startedAtMs) =>
    existsSync(p) && statSync(p).mtimeMs >= startedAtMs - 1000;
  const expected = resolve("ai/curaos/docs/grills/x-deadbeef.md");
  // empty report_path from the agent → identity gate rejects → fail closed.
  if (pathsMatch("", expected)) { console.error("FAIL: empty report_path passed identity gate"); process.exit(1); }
  // mismatched report_path → identity gate rejects.
  if (pathsMatch(resolve("ai/curaos/docs/grills/other.md"), expected)) { console.error("FAIL: mismatched report_path passed identity gate"); process.exit(1); }
  // missing file → freshness gate rejects even if a path is claimed.
  if (reportWrittenSince(resolve("ai/curaos/docs/grills/does-not-exist-" + "493test" + ".md"), Date.now())) { console.error("FAIL: missing report file passed freshness gate"); process.exit(1); }
  console.log("opposite-harness-grill #493 fail-closed predicates ok");
' || fail "workflow #493 fail-closed predicate runtime proof failed"

grep -q "blocked-harness-unavailable" "$PLAYBOOK" || fail "playbook missing blocked harness contract"
grep -q "harness-probe" "$PLAYBOOK" || fail "playbook missing harness-probe docs"
grep -q "allow_same_harness_fallback" "$PLAYBOOK" || fail "playbook missing fallback gate docs"
grep -q "same_harness_agent" "$PLAYBOOK" || fail "playbook missing same-harness fallback agent docs"

if grep -q "codex exec -m <codex-review-model>" "$ONE_TASK"; then
  fail "one-task prompt still recommends raw codex exec for the grill path"
fi
raw_grill_invocations="$(
  grep -RInE "codex exec|claude -p" \
    "$ONE_TASK" \
    "$PLAYBOOK" \
    "$ROOT/docs/agents/milestone-orchestration-prompt.md" \
    "$ROOT/docs/agents/workflows/pr-verify-merge.md" \
    | grep -Ei "grill|opposite-harness|adversarial" \
    | grep -Eiv "never|do not|not a raw|no raw|blocked-harness|probe|pgrep|check for a live|allowed only because|workflow-run" \
    || true
)"
if [ -n "$raw_grill_invocations" ]; then
  printf '%s\n' "$raw_grill_invocations" >&2
  fail "raw codex/claude opposite-harness grill invocation still present"
fi

grep -q "function ghPrCommand" "$PR_VERIFY" || fail "pr-verify-merge missing owner/repo#N PR command normalization"
grep -q "expected owner/repo#N or N" "$PR_VERIFY" || fail "pr-verify-merge missing invalid PR ref rejection"
grep -q -- "--repo" "$PR_VERIFY" || fail "pr-verify-merge missing gh --repo command shape for owner/repo#N refs"
grep -q "opposite_harness" "$PR_VERIFY" || fail "pr-verify-merge missing opposite harness input forwarding"
grep -q "grillArgs" "$ROOT/scripts/workflows/pr-verify-merge.workflow.js" || fail "pr-verify-merge does not pass explicit grill args to opposite-harness-grill"
# RP-20: milestone-wave no longer carries inline copies; the canonical owner is
# scripts/lib/merge-hygiene.js and the executor imports it DIRECTLY (loadSharedPhaseHelpers).
MERGE_HYGIENE="$ROOT/scripts/lib/merge-hygiene.js"
[ -e "$MERGE_HYGIENE" ] || fail "merge-hygiene lib missing (canonical ghPrCommand owner)"
grep -q "function ghPrCommand" "$MERGE_HYGIENE" || fail "merge-hygiene lib missing owner/repo#N PR command normalization"
grep -q "expected owner/repo#N or N" "$MERGE_HYGIENE" || fail "merge-hygiene lib missing invalid PR ref rejection"
grep -q -- "--repo" "$MERGE_HYGIENE" || fail "merge-hygiene lib missing gh --repo command shape for owner/repo#N refs"
grep -q 'localRequire("../lib/merge-hygiene.js")' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not import the canonical merge-hygiene lib"
grep -q "ghPrCommand," "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not destructure ghPrCommand from the shared helpers"
grep -q 'ghPrCommand("checkout", pr)' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave missing owner/repo#N PR command normalization at the checkout call site"
grep -q 'ghPrCommand("checks", pr)' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave missing owner/repo#N PR command normalization at the checks call site"
grep -q "local_gate_exit" "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave still lacks local-CI-first gate"
grep -q "dispatchedFailing" "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave missing manually-dispatched GH check failure handling"
grep -Fq 'cd ${ROOT} &&' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not run local gate from checked-out PR root"
! grep -Fq 'cd ${ROOT}/curaos' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave still validates a different checkout subtree"
grep -Fq 'String(c.state || "").toUpperCase() !== "SUCCESS"' "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not fail closed on pending/cancelled/non-success GH checks"
# RP-20: the blocked-harness predicate lives once in merge-hygiene.js; the wave imports it.
grep -q "function isBlockedHarnessUnavailable" "$MERGE_HYGIENE" || fail "merge-hygiene lib missing shared blocked-harness predicate"
grep -q "isBlockedHarnessUnavailable," "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not destructure isBlockedHarnessUnavailable from the shared helpers"
grep -q "grillBlockedHarnessUnavailable = isBlockedHarnessUnavailable(" "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave does not compute grillBlockedHarnessUnavailable from helper"
grep -q "grillBlockedHarnessUnavailable" "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave merge gate ignores blocked harness status"
grep -q "!checksGreen" "$ROOT/scripts/workflows/milestone-wave.workflow.js" || fail "milestone-wave merge gate ignores local CI failure"
grep -Fq 'cd ${ROOT} &&' "$PR_VERIFY" || fail "pr-verify-merge does not run local gate from checked-out PR root"
! grep -Fq 'cd ${ROOT}/curaos' "$PR_VERIFY" || fail "pr-verify-merge still validates a different checkout subtree"
grep -Fq 'String(c.state || "").toUpperCase() !== "SUCCESS"' "$PR_VERIFY" || fail "pr-verify-merge does not fail closed on pending/cancelled/non-success GH checks"
grep -q "function isBlockedHarnessUnavailable" "$PR_VERIFY" || fail "pr-verify-merge missing shared blocked-harness predicate"
grep -q "grillBlockedHarnessUnavailable = isBlockedHarnessUnavailable(" "$PR_VERIFY" || fail "pr-verify-merge does not compute grillBlockedHarnessUnavailable from helper"
grep -q "if (grillBlockedHarnessUnavailable)" "$PR_VERIFY" || fail "pr-verify-merge does not use blocked harness predicate in blockingFindings path"
grep -q "grillBlockedHarnessUnavailable" "$PR_VERIFY" || fail "pr-verify-merge merge gate ignores blocked harness status"
grep -q "!checksGreen" "$PR_VERIFY" || fail "pr-verify-merge merge gate ignores local CI failure"
grep -q "opposite_harness" "$ROOT/docs/agents/workflows/pr-verify-merge.md" || fail "pr-verify-merge playbook missing opposite harness pass-through docs"

echo "opposite-harness-grill contract ok"
