---
name: pr-verify-merge
kind: composite
version: 0.1.0
models:
  gate: sonnet
composes: [lens-review, opposite-harness-grill, gh-pr-gate-snapshot]
inputs:
  pr: { type: string, required: true, description: "owner/repo#N PR to verify + (if clean) merge" }
  subject: { type: string, required: false, description: "grill subject label (default derived from PR)" }
  grill: { type: boolean, required: false, description: "run the adversarial grill (default true)" }
  max_regrill_cycles: { type: number, required: false, description: "P2a/P2b BINDING cap (default 3) on the in-workflow delta re-grill fix-cycle loop: on grill issues-found, dispatch a fix worker then re-grill the delta in-workflow up to this many cycles before returning to the orchestrator." }
  auto_merge: { type: boolean, required: false, description: "merge if all gates pass (default false - report verdict, let orchestrator merge)" }
  opposite_harness: { type: string, required: false, description: "which harness runs the adversarial grill; forwarded to opposite-harness-grill" }
  opposite_harness_agent: { type: string, required: false, description: "rescue agent override forwarded to opposite-harness-grill" }
  probe_timeout_ms: { type: number, required: false, description: "harness probe timeout forwarded to opposite-harness-grill" }
  grill_timeout_ms: { type: number, required: false, description: "adversarial grill timeout forwarded to opposite-harness-grill" }
  allow_same_harness_fallback: { type: boolean, required: false, description: "same-harness fallback override forwarded to opposite-harness-grill" }
outputs:
  verdict: { type: string, description: "merge-ok | changes-requested | block" }
  lens_verdicts: { type: array, description: "the 3 lens verdicts" }
  grill_verdict: { type: string, description: "the adversarial grill verdict" }
  merged: { type: boolean, description: "true if auto_merge and merged" }
  notification_cleared: { type: boolean, description: "true if the merged PR's inbox notification was cleared (gated on threads-resolved + no needs-human)" }
  workspace_ready: { type: string, description: "clean | stashed | blocked | n/a after restoring the checkout to the default branch post-merge" }
  blocking_findings: { type: array, description: "any block-level findings" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: github
verification: T2
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---

# pr-verify-merge

T2 verification and merge gate for a PR: fail-fast local blocking gate -> local deterministic review signal -> 3-lens multi-model review (composed `lens-review` x3, parallel) -> adversarial grill (composed `opposite-harness-grill`) -> programmatic merge gate. Per [[curaos-verification-stack-rule]].

## When To Invoke

Use this workflow when a PR needs the standard CuraOS T2 closeout path. It reports a verdict by default. It merges only when `auto_merge=true` and every binding gate passes.

## Phases

0. **Fail-fast local blocking gate** - checkout the PR and run the repo-local blocking gate before any expensive LLM review. If local CI or a manually-dispatched GH check is red, return `block` with `source:local-gate` and skip lenses and grill.
0.5. **Local deterministic review signal** - run the local Semgrep or equivalent free deterministic review signal before expensive LLM review. High or critical changed-line findings block with `source:local-review-signal`. Tool unavailability is reported explicitly and is covered by the remaining T2 gates.
1. **3-lens review** (parallel) - Security + Architecture + QA via composed `lens-review`. Any `block` verdict blocks the merge.
2. **Adversarial grill** (if `grill`) - composed `opposite-harness-grill` (fresh opposite-harness adversary), verdict persisted to `ai/curaos/docs/grills/`. Pass `opposite_harness`, `opposite_harness_agent`, `probe_timeout_ms`, `grill_timeout_ms`, and `allow_same_harness_fallback` through when the caller must route a specific harness pair.
2.5. **In-workflow delta re-grill fix-cycle loop** (P2a/P2b, issue #706) - on a grill verdict of `issues-found`, dispatch ONE fix worker against the carried findings, then RE-GRILL IN-WORKFLOW scoped to the DELTA `git diff <prev-grill-sha>..HEAD`, capped at `max_regrill_cycles` (default 3, BINDING per [[curaos-verification-stack-rule]]). Each cycle threads a distinct `cache_bust` so the grill cache recomputes. This collapses the 5-cycle / 2+hr PR-337 case toward 1 review + 1 batch fix + 1 delta re-grill instead of returning to the orchestrator for a fresh full pass.
   - **Stable report + carried findings (P1-3):** every cycle keeps ONE stable `report_path` (the canonical PR grill file; re-grills APPEND a `## Re-grill verification` section, never fork a fresh file that could replace the full-review verdict) and threads the accumulated unresolved `prior_findings` into each re-grill so a clean delta that did not touch a prior finding's code does NOT silently drop it. The grill's `unresolved_findings` output carries the still-open set forward across cycles.
   - **Stale-snapshot defer (P1-2):** a re-grill cycle pushes fix commits, so the PR head moves PAST the pre-loop `checksGreen` + grill-SHA snapshot (`checksGreen` was read BEFORE the fix worker committed). A re-grilled lane (`regrillCycles > 0`) is therefore NEVER auto-merged on that stale-green snapshot; the gate defers to `changes-requested` so the next pass re-runs the local gate and re-binds the grill verdict against the fresh head. This mirrors the `milestone-wave` verify leg.
3. **Merge gate** (programmatic) - merge-ok only if: the fail-fast local blocking gate is green, the local deterministic review signal has no blocking changed-line finding, all three lenses are not `block`, grill is not `block`, the grill's `verified_sha` equals the PR's current REST `head.sha`, review threads are resolved, and no `needs-human` thread is open. Missing, malformed, or mismatched SHA evidence blocks fail-closed.
4. **Merge** (only if `auto_merge` and merge-ok) - use the REST merge endpoint with the verified head SHA (`gh api -X PUT repos/OWNER/REPO/pulls/N/merge -f merge_method=squash -f sha=<verified-head-sha>`), so a push after the gate snapshot fails closed instead of merging an unreviewed head. After merge, verify the remote PR branch is actually gone: `git ls-remote --exit-code --heads origin <branch>` must return no match (exit 2); a surviving branch is deleted (`gh api -X DELETE repos/OWNER/REPO/git/refs/heads/<branch>`) and re-verified. Else report verdict for the orchestrator.
4.5. **Close-path label hygiene** (only if `merged`) - resolve linked issues REST-first from PR body closing keywords and issue timeline/events; use targeted `closingIssuesReferences` GraphQL only when REST evidence is ambiguous. Strip every workflow-state label (`ready-for-agent`, `needs-triage`, `needs-info`, `ready-for-human`, `agent-PR-open`, `agent-claimed:*`) from each auto-closed linked issue, in one idempotent `gh issue edit --remove-label` call, preserving category (`bug`, `enhancement`) and markers (`foresight`, `blocked`). A closed issue must carry zero state labels.
4.6. **Close-path board-status hygiene** (only if `merged`) - auto-closing the linked issue does not advance its `CuraOS Roadmap` Project Status field. Run `bash scripts/sweep-project-status --apply` so closed or completed Project items stuck at `Ready`, `In Progress`, or `In Review` advance to `Done`.
5. **Clear inbox notification** (only if `merged`, threads-resolved, and no `needs-human`) - `bash scripts/pr-notification-gate --apply OWNER/REPO N` re-checks unresolved threads and needs-human fail-closed before delegating to `mark-pr-notification-done`. Directly-merged PRs that bypass this workflow are handled by the orchestrator inbox sweep.
6. **Default-branch readiness** (only if `merged`) - fetch and prune, switch the local checkout used for verification back to the repository default branch (`main` unless repo metadata says otherwise), fast-forward pull, sync submodules when this is a parent workspace, and verify `git status --short --branch` is clean. If local residue exists, preserve it with a named stash or land it through a separate PR before reporting terminal. Sets `workspace_ready`.

## Gates

- **`"merged" alone is insufficient`:** a merged-state PR is not done while reviewer threads are unresolved or a `needs-human` thread is open. Notification-clear is `safe-to-clear-notification` on the same predicate.
- Default `auto_merge=false`; orchestrator owns the merge decision unless explicitly enabled.
- Grill verdict must persist to `ai/curaos/docs/grills/`.
- **Grill-SHA binding gate (binding, fail-closed):** the grill verdict carries `verified_sha`. The merge gate fetches the PR's current REST `/pulls/N` `head.sha` and blocks when `verified_sha` is missing, malformed, or differs. The `milestone-wave` inline verify leg mirrors this check.
- **Default-branch readiness gate:** a merged PR is not a clean local closeout while the verification checkout remains on the merged or deleted PR branch or reports `[gone]`. `workspace_ready` must be `clean`, or the workflow reports `blocked` or `stashed` for orchestrator follow-up.

## Determinism

Lens reviews and grill are best-effort LLM review. The merge gate is a deterministic AND of their verdicts plus the local `curaos/ci-gates.yaml` blocking-gate run (`just ci` or `bash scripts/ci-local.sh` plus `node scripts/check-ci-gates-sync.js` exit codes), the local deterministic review signal, the REST PR head snapshot, and the reviewer-thread gate. A manually-dispatched GH check, when present, must also pass; `gh pr checks` alone is not the gate with GH auto-CI off.

The gate's deterministic helper core (`ghPrCommand`, `isBlockedHarnessUnavailable`, and `grillShaMismatch`) is single-owned in `scripts/lib/merge-hygiene.js` (RP-20). This executor's Claude-style body also runs under `new Function` harnesses (no `require()` or `import.meta`), so it keeps inline copies that must stay byte-identical to the lib; `scripts/workflow-truth-contract.test.js` pins equality, and `milestone-wave` imports the lib directly instead of carrying copies.
