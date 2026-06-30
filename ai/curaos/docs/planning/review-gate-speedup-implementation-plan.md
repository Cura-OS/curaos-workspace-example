# Implementation Plan

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the former external-review-dependent PR verification path with a free, local, harness-native flow that preserves or improves verification quality and cuts PR verification wall time by at least 2x, with a stretch target of 3x.

**Architecture:** Commercial SaaS reviewers are excluded from the active flow; optional external experiments stay outside merge-critical workflows. The binding merge gate becomes deterministic local evidence plus parallel CuraOS harness review: local CI, Semgrep CE signal, 3-lens review, opposite-harness grill, exact PR head SHA binding, unresolved-thread gate, and human-escalation gate. Speed comes from removing advisory-review waits, running cheap deterministic gates before LLM work, instrumenting every phase, and defaulting real milestone dispatch to isolated worktrees.

**Tech Stack:** Bun, Node.js workflow executors, GitHub CLI, Agent Workflow Kit, Codex, Claude, Semgrep CE, existing CuraOS workflow library, Git worktrees.

## Non-Negotiable Quality Bar

- [ ] No merge path may require a paid external paid-review PR review.
- [ ] No merge path may treat missing advisory review output as proof of cleanliness.
- [ ] No merge path may skip local CI, drift gates, 3-lens review, opposite-harness grill for high-risk changes, exact SHA binding, review-thread state, or human-escalation checks.
- [ ] Local or Ollama-backed PR-Agent output is advisory until it passes a CuraOS golden-set calibration. It must not become a binding gate in this plan.
- [ ] Semgrep CE is additive. Its limitations mean it cannot replace the Security lens or PHI review.
- [ ] Any speed claim must be backed by workflow timing records before and after the change.
- [ ] Any workflow failure to read GitHub state, parse tool output, or enumerate files fails closed.

## Approach Analysis

### Option A: Recommended, Harness-Native Binding Gate

Remove external-review waiting from the critical path. Do not call external review CLI tools from active workflows. Add local Semgrep CE. Reorder `pr-verify-merge` so local gates run before expensive LLM review. Preserve cross-harness grill and exact SHA checks.

Why this wins: highest speedup with no quality downgrade. It uses already-binding CuraOS gates instead of trusting a new tool.

### Option B: PR-Agent First

Install PR-Agent and replace external paid-review with PR-Agent review output.

Rejected for binding use in this plan: PR-Agent is useful, but local models are not reliable enough for production-grade code review without calibration. It can be added later as advisory.

### Option C: Deterministic-Only Review

Use Semgrep, reviewdog, Danger, CodeQL, and local CI without LLM lenses or grill.

Rejected: faster, but lower quality for architecture, PHI, cross-service contracts, and generated-code defects. It violates the user's quality constraint.

## Source Facts Used

- external paid-review Free includes PR summarization and limited review allowance; Pro is the paid PR review tier; Enterprise includes self-hosting.
- external paid-review public open-source repos can receive free Pro+ features, but CuraOS private-repo review should not rely on that.
- Semgrep CE can run with open-source components using `semgrep scan`.
- reviewdog can post diff-scoped comments from linter output and can run locally.
- Ollama exposes a local API at `http://localhost:11434/api`, useful for experiments, not binding review quality in this plan.

## Files

Create:

- `scripts/lib/workflow-timing.js`
- `scripts/lib/workflow-timing.test.js`
- `scripts/lib/local-review-signal.js`
- `scripts/lib/local-review-signal.test.js`
- `scripts/check-workflow-speedup.js`
- `scripts/check-workflow-speedup.test.js`

Modify:

- `scripts/workflows/pr-verify-merge.workflow.js`
- `scripts/workflows/gh-pr-gate-snapshot.workflow.js`
- `scripts/workflows/milestone-wave.workflow.js`
- `scripts/lib/workflow-git.js`
- `scripts/workflow-truth-contract.test.js`
- `docs/agents/workflows/pr-verify-merge.md`
- `docs/agents/workflows/gh-pr-gate-snapshot.md`
- `docs/agents/workflows/milestone-wave.md`
- `ai/curaos/docs/proposals/review-gate-speedup.md`
- `ai/curaos/docs/DOC-GRAPH.md`

Must not break:

- `scripts/check-workflow-sync.js`
- `scripts/check-workflow-portability.js`
- `scripts/check-docs.sh`
- `scripts/check-no-dashes.sh`
- `scripts/workflows/opposite-harness-grill.workflow.js`
- `scripts/lib/merge-hygiene.js`
- `scripts/lib/triage-status.js`
- `scripts/lib/gh-project.js`
- `scripts/lib/workspace-root.js`

## Data Flow

1. `pr-verify-merge` reads PR metadata through `gh-pr-gate-snapshot`.
2. It records phase timing using `workflow-timing`.
3. It checks out the PR into an isolated worktree.
4. It runs the repo-local blocking gate before LLM work.
5. It runs Semgrep CE through `local-review-signal`.
6. It runs the Security, Architecture, and QA lenses in parallel.
7. It runs opposite-harness grill with `verified_sha`.
8. It reads thread and human-escalation state.
9. It merges only when all binding gates pass for the same PR head SHA.
10. It appends timing records to `.cache/workflow-step-timings.jsonl`.

## Cross-Phase Dependencies

- Phase 2 cannot remove external paid-review waiting until Phase 1 timing instrumentation can prove the old wait path and new path.
- Phase 3 local-gate reordering must land before Phase 4 optional Semgrep blocking policy, so failures remain cheap and clear.
- Phase 5 worktree default depends on `workflow-git` branch restore tests, or milestone lanes may collide.
- Phase 6 webhook re-entry must depend on idempotent timing and per-head SHA state, or duplicate deliveries may spawn duplicate reviews.
- Phase 7 quality calibration must happen before PR-Agent or Ollama output can influence `verdict`.

## Step 1: Pin Current Behavior With Tests

- [ ] Add a failing fixture to `scripts/workflow-truth-contract.test.js` proving missing external paid-review review does not block when binding gates pass.
- [ ] Add a failing fixture proving a failing local gate should stop before lenses and grill.
- [ ] Add a failing fixture proving missing PR head SHA still blocks merge.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.
- [ ] Expected result before implementation: the new local-gate-before-review assertion fails.

## Step 2: Add Workflow Timing Library

- [ ] Create `scripts/lib/workflow-timing.js`.
- [ ] Export `createWorkflowTimer({ workflow, subject, outputPath })`.
- [ ] Implement `timer.phase(name, fn)` to record start time, end time, duration, status, and error classifier.
- [ ] Write append-only JSONL records to `.cache/workflow-step-timings.jsonl` by default.
- [ ] Redact PR bodies, tokens, secrets, payloads, and model output. Store only workflow name, phase, subject ref, head SHA if supplied, duration, status, and idle reason.
- [ ] Create `scripts/lib/workflow-timing.test.js`.
- [ ] Test successful phase record.
- [ ] Test failed phase record.
- [ ] Test output directory creation.
- [ ] Test secret-like values are redacted.
- [ ] Run `rtk bun test scripts/lib/workflow-timing.test.js`.

## Step 3: Add Speedup Regression Gate

- [ ] Create `scripts/check-workflow-speedup.js`.
- [ ] Input: `.cache/workflow-step-timings.jsonl`.
- [ ] Output: phase summary by workflow, median, p90, p95, and idle reason counts.
- [ ] Add `--baseline <json>` support for comparing old and new p50 or p95.
- [ ] Fail if the post-change median PR verification wall time is not at least 2x faster than the recorded baseline when the baseline file is supplied.
- [ ] Create `scripts/check-workflow-speedup.test.js`.
- [ ] Test normal summary.
- [ ] Test 2x pass.
- [ ] Test 2x fail.
- [ ] Test malformed JSONL fails closed.
- [ ] Run `rtk bun test scripts/check-workflow-speedup.test.js`.

## Step 4: Remove external paid-review From The Binding Gate

- [ ] Modify `scripts/workflows/gh-pr-gate-snapshot.workflow.js`.
- [ ] Keep PR head SHA and minutes-since-last-push reads.
- [ ] Rename external paid-review-specific output internally to advisory review metadata.
- [ ] Remove the external-review head helper entirely from active workflow contracts.
- [ ] Remove polling wait from merge-critical mode. A caller may request `removed wait flag` only for diagnostics.
- [ ] Update `docs/agents/workflows/gh-pr-gate-snapshot.md`.
- [ ] Add tests in `scripts/workflow-truth-contract.test.js` proving missing external paid-review review does not block when all binding gates pass.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.

## Step 5: Reorder `pr-verify-merge`

- [ ] Modify `scripts/workflows/pr-verify-merge.workflow.js`.
- [ ] Phase order becomes: snapshot, checkout, local gate, Semgrep signal, lenses, grill, thread gate, SHA gate, merge hygiene.
- [ ] Local gate failure returns `verdict: "block"` with `source: "local-gate"` and skips lenses and grill.
- [ ] Lenses still run in parallel.
- [ ] Grill remains required for high-risk changes and all normal merge verification unless `grill:false` is explicitly passed by an approved caller.
- External review presence is reported as `removed advisory-review field`, and it must not control `verdict`.
- [ ] Preserve exact SHA binding: `verified_sha` must equal current PR head SHA.
- [ ] Update `docs/agents/workflows/pr-verify-merge.md`.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.
- [ ] Run `rtk node scripts/check-workflow-sync.js`.

## Step 6: Add Semgrep CE Advisory And Blocking Policy

- [ ] Create `scripts/lib/local-review-signal.js`.
- [ ] Detect whether `semgrep` is installed.
- [ ] Run `semgrep scan --json` with open-source rules only.
- [ ] Prefer changed-file scoped scans when a PR diff is available.
- [ ] Parse JSON structurally.
- [ ] Fail closed on malformed Semgrep output when Semgrep is configured as required.
- [ ] Default policy: high or critical security findings on changed lines block; medium and low findings are advisory.
- [ ] Create `scripts/lib/local-review-signal.test.js`.
- [ ] Test missing Semgrep yields advisory unavailable, not pass.
- [ ] Test malformed JSON fails closed when required.
- [ ] Test high finding blocks.
- [ ] Test low finding is advisory.
- [ ] Wire this signal into `pr-verify-merge`.
- [ ] Run `rtk bun test scripts/lib/local-review-signal.test.js`.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.

## Step 7: Make Worktree Dispatch The Default

- [ ] Inspect `scripts/lib/workflow-git.js` for existing worktree helpers.
- [ ] Add or extend helper for `createIsolatedLaneWorktree({ issue, branch, repoRoot })`.
- [ ] Add disk-space guard before creating worktrees.
- [ ] Add cleanup policy that never deletes uncommitted evidence or grill artifacts.
- [ ] Modify `scripts/workflows/milestone-wave.workflow.js` so real dispatch defaults to worktree isolation.
- [ ] Keep same-checkout dispatch available only through explicit low-resource mode.
- [ ] Update `docs/agents/workflows/milestone-wave.md`.
- [ ] Add contract test proving absent `max_lanes` still emits all collision-safe lanes, but execution uses worktree isolation.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.

## Step 8: Add Event-Driven Re-Entry Without Polling Dependence

- [ ] Modify `scripts/lib/webhook-listener.js`.
- [ ] Handle `pull_request`, `pull_request_review`, `pull_request_review_thread`, `issues`, `label`, and `projects_v2_item` events.
- [ ] Use delivery ID idempotency plus `{repo, pr, head_sha, event_kind}` idempotency.
- [ ] Trigger the smallest workflow step that can make progress: snapshot, thread gate, PR verify, or milestone scan.
- [ ] Keep launchd polling as the 6-hour safety net described in `docs/agents/webhook-listener.md`.
- [ ] Add tests to `scripts/lib/webhook-listener.test.js`.
- [ ] Run `rtk bun test scripts/lib/webhook-listener.test.js`.

## Step 9: Optional PR-Agent Adapter, Advisory Only

- [ ] Do not install PR-Agent in this phase unless a separate issue approves dependency changes.
- [ ] Add an adapter interface in `scripts/lib/local-review-signal.js` for future `pr-agent`.
- [ ] Gate PR-Agent output behind `CURAOS_ADVISORY_PR_AGENT=1`.
- [ ] Parse PR-Agent output as advisory findings only.
- [ ] Add a pending calibration requirement in `ai/curaos/docs/proposals/review-gate-speedup.md`.
- [ ] Confirm no code path lets PR-Agent alter `verdict`.

## Step 10: Golden-Set Calibration For Any New AI Reviewer

- [ ] Extend the existing T1 judge or grills golden set with examples covering security, architecture, QA, generated-code drift, PHI boundary, and false-positive noise.
- [ ] Require any candidate reviewer to beat the current harness stack before it can become binding.
- [ ] Metrics: no missed criticals in the golden set, lower or equal false-positive rate than current lenses, and structured output parse success above 95 percent.
- [ ] Run `rtk bun scripts/check-golden-set.js`.

## Step 11: Documentation And Rule Sync

- [ ] Update `ai/curaos/docs/proposals/review-gate-speedup.md` to point to this implementation plan.
- [ ] Update workflow docs for every changed executor.
- [ ] Regenerate doc graph with `rtk bun scripts/check-doc-graph.js --write`.
- [ ] Run `rtk bash scripts/check-docs.sh`.
- [ ] Run `rtk bash scripts/check-no-dashes.sh`.

## Step 12: End-To-End Verification

- [ ] Run `rtk bun test scripts/lib/workflow-timing.test.js`.
- [ ] Run `rtk bun test scripts/lib/local-review-signal.test.js`.
- [ ] Run `rtk bun test scripts/check-workflow-speedup.test.js`.
- [ ] Run `rtk bun test scripts/workflow-truth-contract.test.js`.
- [ ] Run `rtk node scripts/check-workflow-sync.js`.
- [ ] Run `rtk bash scripts/check-docs.sh`.
- [ ] Run `rtk bash scripts/check-no-dashes.sh`.
- [ ] Run a dry-run PR verification fixture with External paid-review unavailable.
- [ ] Confirm output: `verdict` is controlled only by local gate, Semgrep policy, lens verdicts, grill verdict and SHA, thread state, human-escalation state, and merge hygiene.
- [ ] Run timing comparison with `rtk node scripts/check-workflow-speedup.js --baseline .cache/workflow-speed-baseline.json`.

## Expected Speedup

Baseline waste removed:

- removed external-review settle wait: up to 12 minutes removed from critical path.
- Polling interval: 60-second sleeps removed from normal merge path.
- Failing local gate: lenses and grill skipped, saving the full LLM review leg.
- Milestone dispatch: branch-changing lanes move from same-checkout serialization to worktree isolation.

Conservative target:

- PRs with failing local gates: greater than 3x faster because they stop before LLM review.
- PRs with passing local gates and no external-review wait: at least 2x faster when prior run waited for the settle window.
- Milestone waves with multiple independent lanes: 2x to 3x faster when two or more lanes are collision-safe and cores plus disk allow worktree parallelism.

## Rollback Plan

- [ ] External paid-review code paths stay out of active workflows; experiments must live outside the merge-critical path.
- [ ] Keep same-checkout milestone dispatch behind explicit low-resource mode.
- [ ] If timing or correctness regressions appear, restore old `pr-verify-merge` order while keeping `workflow-timing` instrumentation.
- [ ] Never rollback by weakening local CI, grill SHA binding, thread gate, or fail-closed GitHub state reads.

## Done Criteria

- [ ] External paid-review unavailable does not block a PR that passes all binding gates.
- [ ] External paid-review presence does not contribute to active workflow verdicts.
- [ ] Failing local CI exits before LLM lenses and grill.
- [ ] Semgrep CE high or critical changed-line security findings block.
- [ ] Lenses remain parallel and fail closed on missing output.
- [ ] Opposite-harness grill remains SHA-bound and fail closed.
- [ ] Milestone real dispatch defaults to worktree isolation.
- [ ] Workflow timing evidence proves at least 2x speedup against baseline.
- [ ] All listed verification commands pass.
