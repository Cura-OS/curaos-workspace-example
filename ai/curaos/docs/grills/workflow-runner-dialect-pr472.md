# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: workflow-runner-dialect-pr472

## Native fallback review (Codex, 2026-06-05)

Verdict: pass-with-opposite-harness-blocked

Scope reviewed:
- Runner dialect fix for deterministic workflows that need GitHub/FS helpers.
- Prompt/playbook updates in `docs/agents/milestone-orchestration-prompt.md` and `docs/agents/workflows/README.md`.

Adversarial checks:
- The first follow-up fix (`require("node:...")`) failed under the `export const meta` workflow runner with `ReferenceError: require is not defined`.
- A dynamic top-level `await import("node:...")` approach fixed that class but broke the repo's `node --check` gate because these files are syntax-checked as scripts unless wrapped in exported async functions.
- The final fix uses `process.getBuiltinModule("node:...")` only in non-exported-meta deterministic executors and wraps `milestone-wave` / `pm-triage-gate` executable bodies in exported async functions.
- A guard search found no workflow that both uses `process.getBuiltinModule` and exports `meta`, and no remaining `import {`, `require("node:`, or top-level `await import("node:` builtin loader patterns.
- Actual runner proof passed: `agent-workflow-kit workflow-run milestone-wave --args-json '{"milestone":"active","dry_run":true}' --json` completed through Scan/Triage/Breakdown/Prioritize/Dispatch/Verify/Foresight with active milestones `M8,M9,M11,M12,M15`.
- Static gates passed: `node --check` on touched workflow files, `node --test scripts/workflow-truth-contract.test.js`, `node scripts/check-workflow-sync.js --json`, `bun scripts/check-doc-graph.js`, and `git diff --check`.

Residual risk:
- The dry-run result leaves all six candidates not-ready as `state=needs-triage, blocker=paper`; the non-dry committed wave still must run after merge to apply/verify tracker mutation.
- The configured opposite-harness path remains unavailable because Claude rescue returns no report file; this report records that block instead of claiming a completed opposite-harness pass.
