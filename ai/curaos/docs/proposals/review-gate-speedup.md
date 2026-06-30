# Review Gate And Workflow Speedup Proposal

Date: 2026-06-12

## Problem

The current PR verification path still treats external-review timing as a dependency even though the local workflow already says external review findings were advisory and the binding authority is the local gate, 3-lens review, opposite-harness grill, review-thread state, and exact SHA checks.

The highest-cost idle step was the external-review wait gate:

- `scripts/workflows/pr-verify-merge.workflow.js` documents that external review output could arrive minutes after checks went green, and the old flow waited on it before reading threads.
- `scripts/workflows/gh-pr-gate-snapshot.workflow.js` polls every 60 seconds by default while waiting for that bot review.
- `docs/agents/workflows/pr-verify-merge.md` says external review was advisory, not a binding gate.

That means a private-repo paid trial ending should not block CuraOS merges, and the idle wait should be removed from the critical path.

Secondary time sinks:

- `pr-verify-merge` currently runs expensive read-only review and grill work before the local blocking gate, so a simple `just ci` failure can waste 3 lens reviews plus a cross-harness grill.
- `milestone-wave` already emits every collision-safe lane when `max_lanes` is absent, but the same-checkout executor serializes branch-changing dispatch. Worktree isolation should be the default for real lane execution.
- Polling remains as a safety net in places where org webhooks can drive convergence. The existing webhook design already says event convergers should run on-event and polling should be demoted to a 6-hour safety net.

## Current Tool Landscape

external paid-review:

- Free plan exists, but the current free tier is summarization-oriented with limited review allowance.
- Open source public repositories can receive free reviews.
- Self-hosting exists only in Enterprise according to external paid-review docs and pricing.

Free or local replacements:

- PR-Agent is open source and can run locally by Docker, pip, or source CLI. It can also run as a GitHub Action or local GitHub App.
- PR-Agent supports local models through Ollama or VLLM, but its own docs warn that local open-source models are mostly suitable for experimentation, not production-level code analysis.
- reviewdog is open source and posts diff-scoped comments from any linter output. It also runs locally to filter findings by diff.
- Danger JS is open source policy automation for repeated review chores. It is not an AI reviewer, but it is good for deterministic repository rules.
- Semgrep CE can run locally and in CI with open-source components using `semgrep scan`.
- CodeQL CLI can run locally and generate SARIF, subject to GitHub licensing and repository type constraints.
- SonarQube Community Build is self-hosted and free, useful for broad quality and security signals, but it is not a drop-in LLM PR reviewer.

Local availability on this machine:

- Installed: `paid-external-review`, `semgrep`, `ollama`, `gh`, `bun`, `just`, `agent-workflow-kit`, `codex`, `claude`.
- Missing: `pr-agent`, `reviewdog`, `danger`, `codeql`, `litellm`.

## Recommendation

Use a harness-native review gate as the binding replacement for external paid-review:

1. Remove external paid-review calls from active workflows; installed CLIs are ignored by the merge gate.
2. Remove the removed external-review settle wait from the merge-critical path.
3. Make local deterministic gates run before expensive LLM review.
4. Use 3-lens review plus opposite-harness grill as the binding AI review layer.
5. Add Semgrep CE as a local T1.5 security signal.
6. Add PR-Agent only as an optional advisory provider, not a blocking gate, unless it uses a proven hosted model and passes a small golden-set calibration.

## Proposed Workflow

For `pr-verify-merge`:

1. Read PR head SHA and mergeability facts.
2. Checkout PR in an isolated worktree.
3. Run the local blocking gate first: `just ci` or repo-local equivalent, plus drift self-gates.
4. If the local gate fails, return `block` immediately and skip lenses and grill.
5. Run Security, Architecture, and QA lens review in parallel.
6. Run the opposite-harness grill only after lenses do not hard-block, or run it in parallel only when the user opts into fastest-wall-clock mode.
7. Read review threads and human escalation state.
8. Require grill `verified_sha` to match current PR head SHA.
9. Merge only when local gate, lenses, grill SHA, thread gate, and human-escalation gate are clean.

For `milestone-wave`:

1. Keep current uncapped lane planning.
2. Default real dispatch to `isolation: worktree`.
3. Use one worktree per lane, with runtime cap `min(16, cores - 2)` and a disk-space guard.
4. Keep same-checkout mode only as a fallback or explicit low-resource mode.
5. Store per-phase timings in an append-only local evidence file so the next bottleneck is measured, not guessed.

For webhooks:

1. Treat `pull_request`, `pull_request_review`, `pull_request_review_thread`, `issues`, `label`, and `projects_v2_item` events as triggers for targeted convergers.
2. Keep launchd polling as a 6-hour safety net only.
3. Add idempotency keys per delivery plus per PR head SHA so duplicate deliveries do not spawn duplicate work.

## Implementation Plan

Detailed task-by-task plan: [review-gate-speedup-implementation-plan](../planning/review-gate-speedup-implementation-plan.md).

1. Add timing instrumentation to workflow executors:
   - Append phase start, phase end, duration, and idle reason to `.cache/workflow-step-timings.jsonl`.
   - Files: `scripts/workflows/pr-verify-merge.workflow.js`, `scripts/workflows/milestone-wave.workflow.js`, shared helper under `scripts/lib/`.

2. Replace external-review-specific wait semantics with generic review evidence:
   - Rename the gate concept from "external advisory reviewed head" to "external advisory review observed".
   - Do not block on advisory review absence.
   - Do not preserve external paid-review findings as active workflow outputs when available.
   - Files: `scripts/workflows/gh-pr-gate-snapshot.workflow.js`, `docs/agents/workflows/gh-pr-gate-snapshot.md`, `scripts/workflows/pr-verify-merge.workflow.js`, `docs/agents/workflows/pr-verify-merge.md`.

3. Reorder `pr-verify-merge`:
   - Head snapshot and local gate happen before LLM lenses and grill.
   - Lenses remain parallel.
   - Grill remains SHA-bound and fail-closed.
   - Update inline milestone-wave merge verification copy to match.

4. Add local security advisory signal:
   - Use `semgrep scan` in a non-cloud mode for PR changed files or repo slices.
   - Surface high-confidence findings in `blocking_findings` only when severity and rule policy say so.
   - Keep `semgrep` as deterministic evidence, not a replacement for the PHI/security lens.

5. Make worktree dispatch the default:
   - Add or reuse shared worktree helper in `scripts/lib/workflow-git.js`.
   - Ensure branch restore, stash handling, submodule updates, and parent pointer rules still fail closed.
   - Update `docs/agents/workflows/milestone-wave.md`.

6. Wire event-driven re-entry:
   - Extend `scripts/lib/webhook-listener.js` convergers for PR review and review-thread events.
   - Trigger only the smallest needed workflow step: snapshot, thread gate, PR verify, or milestone scan.
   - Keep launchd polling as a 6-hour fallback.

## Acceptance Criteria

- A private PR can reach `merge-ok` with External paid-review unavailable, provided local CI, lenses, grill, SHA, and thread gates pass.
- A failing local gate exits before any expensive LLM review or grill starts.
- `removed advisory-review field` reports external review presence; it is advisory and never controls `verdict`.
- `milestone-wave` uses worktree isolation by default for real dispatch.
- Workflow timings show phase duration and idle reason for every PR verification.
- `scripts/check-workflow-sync.js` and `scripts/workflow-truth-contract.test.js` pin doc and executor parity after the change.

## Open Decision

Choose one binding review profile:

- Recommended: harness-native binding review, optional PR-Agent and external paid-review advisory input.
- Faster but riskier: run lenses and grill concurrently after local gate passes.
- More tool-heavy: add PR-Agent plus reviewdog first, then later remove external paid-review references.
