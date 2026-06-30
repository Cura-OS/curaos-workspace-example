# PR #478 Wave Evidence Gate Grill

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: wave-evidence-gate-pr478

## Native Codex fallback review

GRILL: native-fallback
DATE: 2026-06-05
SCOPE: PR #478 (`mo/fix-task-execute-evidence-gate`)

The opposite Claude harness returned `pass` without writing the required report artifact, so this section is a same-harness fallback only. It does not satisfy the opposite-harness gate.

### Verdict

PASS WITH HARNESS RISK.

### Checks

- Evidence fallback: `scripts/workflows/tdd-implement.workflow.js` now requires `verification_evidence` from the independent verifier schema and appends it as `INDEPENDENT VERIFICATION (§8.1 fallback claim of record)` when the worker omitted its own paste.
- Empty-diff guard: the executor derives `emptyDiff` from `changedPaths.length === 0 || verify.empty_diff === true`, closing the observed impossible verifier output from `wf_18479be7-735`.
- Scope guard: unresolved scope now blocks when `ownedPaths.length === 0 || verify.spec_unresolved === true`, so a done claim cannot pass without a containment fence.
- PR-open guard: both `task-execute` and inline `milestone-wave` dispatch block before PR creation if `tdd-implement` reaches `done` without a non-empty §8.1 evidence block.
- Prompt parity: `docs/agents/milestone-orchestration-prompt.md`, `docs/agents/workflows/tdd-implement.md`, `docs/agents/workflows/task-execute.md`, and `docs/agents/workflows/milestone-wave.md` describe the same evidence/scope gates as executor code.

### Verification

- `node --check scripts/workflows/tdd-implement.workflow.js`
- `node --check scripts/workflows/task-execute.workflow.js`
- `node --check scripts/workflows/milestone-wave.workflow.js`
- `node --test scripts/workflow-truth-contract.test.js`
- `node scripts/check-workflow-sync.js --json`
- `bun scripts/check-doc-graph.js`
- `git diff --check`
- `bun test scripts/lib/dep-graph-calibration.test.js`

### Residual Risk

The independent verifier still runs through an agent shell rather than direct executor shell primitives, so the workflow remains control-flow deterministic but not fully shell-deterministic. This PR improves the gate’s accepted output contract and fail-closed checks; it does not replace the agent-based verifier with a pure JS shell runner.
