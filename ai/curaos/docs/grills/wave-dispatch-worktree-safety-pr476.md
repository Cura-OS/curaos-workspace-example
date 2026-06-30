# PR #476 Wave Dispatch Worktree Safety Grill

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: wave-dispatch-worktree-safety-pr476

## Native Codex fallback grill

Verdict: PASS with residual harness risk.

Scope: same-harness adversarial review of PR #476 after the Claude opposite-harness leg returned `pass` without a report path. This section is fallback evidence only; it does not convert the opposite-harness leg into a completed review.

Evidence:
- `wf_e9856b69-fd1` completed with `verdict=skipped-harness-unavailable`, `grill=blocked-harness-unavailable`, and this report path.
- The defect being fixed was observed live after the REST fallback dispatch attempt: multiple worker agents shared the primary checkout, changed root/submodule branches, and left `curaos` as a modified submodule pointer even though no code edits were made.
- `scripts/workflows/milestone-wave.workflow.js` no longer calls `parallel(partition.lanes.map(...))` around branch-changing dispatch. It logs `DISPATCH-SERIAL` and uses `for (const issue of partition.lanes)` to run each inline lane from the single workflow checkout.
- `docs/agents/milestone-orchestration-prompt.md`, `docs/agents/workflows/milestone-wave.md`, and `docs/agents/workflows/task-execute.md` now distinguish lane planning from actual branch-changing execution: single-checkout workflow dispatch serializes; native/orchestrator fan-out requires distinct git worktrees.
- Static gates passed before PR creation: `node --check scripts/workflows/milestone-wave.workflow.js`, `node --test scripts/workflow-truth-contract.test.js`, `node scripts/check-workflow-sync.js --json`, `bun scripts/check-doc-graph.js`, and `git diff --check`.

Adversarial checks:
- Same-root branch races are removed from committed workflow dispatch because branch-changing work is no longer started concurrently inside one checkout.
- Parallel capacity is not lost from the project contract: `wave-prioritize` still emits all collision-free lanes, and external/native orchestration can run them concurrently only when it provisions separate worktrees.
- The truth-contract test fails if `parallel(partition.lanes.map(...))` returns to `milestone-wave.workflow.js` or if the prompt/playbooks stop documenting the worktree requirement.

Residual risk:
- This is same-harness fallback, not the required opposite-harness grill. Treat the Claude leg as `blocked-harness-unavailable` until the harness writes a report file.
