# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: workflow-runner-imports-pr471

## Native fallback review (Codex, 2026-06-05)

Verdict: pass-with-opposite-harness-blocked

Scope reviewed:
- `scripts/workflows/*` files that imported Node built-ins with top-level ESM syntax.
- `docs/agents/workflows/README.md` and `docs/agents/milestone-orchestration-prompt.md` prompt/playbook contract updates.

Adversarial checks:
- Failure mode was runner-parser specific: `agent-workflow-kit workflow-run milestone-wave --args-json '{"milestone":"active"}' --json` failed before phase 1 with `SyntaxError: Unexpected token '{'. import call expects one or two arguments.`
- Replacing only Node built-in imports with `require("node:...")` preserves the workflow runner export contract (`export const meta`, existing exported default workflow functions).
- `rg '^import \{' scripts/workflows scripts` returned no remaining top-level built-in import sites in workflow executors.
- Runner smoke passed after the patch: `agent-workflow-kit workflow-run milestone-active-scan --args-json '{"dry_run":true}' --json` completed and returned Project-derived active milestones `M8,M9,M11,M12,M15`, 6 candidates, 0 open PRs.
- Static syntax/tests/docs gates passed: `node --check` on touched workflow files, `node --test scripts/workflow-truth-contract.test.js`, `node scripts/check-workflow-sync.js --json`, `bun scripts/check-doc-graph.js`, and `git diff --check`.

Residual risk:
- The actual opposite-harness review did not complete because the configured Claude rescue agent returned no report file; this remains `blocked-harness-unavailable`, not a clean opposite-harness pass.
