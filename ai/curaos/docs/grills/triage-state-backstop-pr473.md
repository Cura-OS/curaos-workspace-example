# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: triage-state-backstop-pr473

## Native fallback review (Codex, 2026-06-05)

Verdict: pass-with-opposite-harness-blocked

Scope reviewed:
- `gh-issue-triage.workflow.js` deterministic state-label backstop.
- `docs/agents/workflows/gh-issue-triage.md` gate documentation.

Adversarial checks:
- The active wave failure was reproduced by runs `wf_179d3a10-7ba` and `wf_ec797fa9-347`: six Project-ready issues returned `needs-triage/paper`.
- Atomic repro `wf_6f9c9b32-9d4` showed the agent returning `needs-triage/paper` with empty rationale while deterministic metadata saw ready frontmatter fields.
- Fix preserves `ready-for-agent` only when all guard predicates hold: exactly one live state label is `ready-for-agent`, no `foresight` marker label, no `blocked` marker label, no `blocked-by` frontmatter, and the agent did not classify a real blocker.
- Foresight and real-blocker protections are not weakened: `foresight`, `blocked`, `blocked-by`, or `blocker_kind: real` prevent the deterministic ready override.
- Smoke `wf_7e048611-d40` returned `state_label=ready-for-agent` and `blocker_kind=none` for #317.
- Dry-run wave `wf_9c06b7c3-840` cleared the prior paper blockers; the remaining `subissue-unwired` status is expected in dry-run because native wiring is not mutated.
- Static gates passed: `node --check`, `node --test scripts/workflow-truth-contract.test.js`, `node scripts/check-workflow-sync.js --json`, `bun scripts/check-doc-graph.js`, and `git diff --check`.

Residual risk:
- Non-dry committed wave still must run after merge to create/confirm native sub-issue links before dispatch.
- The configured opposite-harness path remains unavailable because Claude rescue returns no report file; this is recorded as blocked, not accepted as a completed opposite-harness pass.
