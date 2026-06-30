# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 142","evidence":"2026-06-05T17:49:20.334114Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.334427Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.334431Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.334733Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.334741Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.335075Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.335079Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.335383Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.335386Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.336039Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.336043Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T17:49:20.704500Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-05T17:49:20.712317Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-05T17:49:20.712345Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\nsh: line 1: 68763 Alarm clock: 14         perl -e 'alarm 15; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 20000
GRILL-REASON: probe exited 142

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: pr-cura-care-oriented-stack-curaos-ai-workspace-500


## Re-grill verification (2026-06-05, native fallback)

GRILL: native-opposite-harness-fallback
GRILL-HARNESS: claude
GRILL-AGENT: claude-adversarial-review
VERDICT: pass-with-documented-residual
SUBJECT: pr-cura-care-oriented-stack-curaos-ai-workspace-500

Committed `opposite-harness-grill` could not persist a valid report (`opposite-harness-report-missing`), so this section records the native Claude adversarial fallback. The native review produced actionable recommendations, all auto-applied because they were reversible and in scope for workflow-defect #487:

- `scripts/lib/workflow-git.js`: validate PR refs as `owner/repo#N`; non-empty model strings such as `no PR opened` now block instead of becoming `pr-open`.
- `scripts/workflows/task-execute.workflow.js`: preserve `workflow_defect` and `workflow_defect_kind` on the done-but-missing-evidence block.
- `scripts/workflows/milestone-wave.workflow.js`: preserve `workflow_defect_kind` on inline blocked/missing-evidence/restore-failed branches.
- `scripts/workflows/tdd-implement.workflow.js`: require independent verifier `ci_ran:true` plus an exit-code paste before trusting `ci_exit:0`; continue deriving empty diff and out-of-scope paths in JS from observed `changed_paths`.
- Prompt/playbook parity updated in `docs/agents/milestone-orchestration-prompt.md`, `docs/agents/workflows/tdd-implement.md`, `docs/agents/workflows/task-execute.md`, and `docs/agents/workflows/milestone-wave.md`.
- Auto-applied decisions logged in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`.

Residual risk explicitly documented, not escalated: the workflow runtime still lacks deterministic executor shell access for `tdd-implement`, so the independent verifier remains the shell boundary of record. `docs/agents/workflows/tdd-implement.md` now states that `changed_paths` derivation should move into executor code if runner shell access becomes available.

Verification after fixes:

- `node --check scripts/workflows/tdd-implement.workflow.js`
- `node --check scripts/workflows/task-execute.workflow.js`
- `node --check scripts/workflows/milestone-wave.workflow.js`
- `node --check scripts/lib/workflow-git.js`
- `node --test scripts/workflow-truth-contract.test.js` (22 passing)
- `node scripts/check-workflow-sync.js --json` (18 workflows ok, no problems)
- `bun scripts/check-doc-graph.js` (1210 nodes, 7647 edges)
- `git diff --check`
- `agent-workflow-kit workflow-run tdd-implement --args-json '{"issue":"your-org/curaos-ai-workspace#487","branch":"mo/fix-tdd-noop-runtime","dry_run":true,"issue_spec":{"owned_paths":["scripts/workflows/tdd-implement.workflow.js"],"verification_cmds":["node --test scripts/workflow-truth-contract.test.js"]}}' --json` returned `status:"blocked"`, `workflow_defect:true`, `workflow_defect_kind:"tdd-implement-no-op-done"`.


## Re-grill verification (2026-06-05)

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-report-path-missing-or-mismatched

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: pr-cura-care-oriented-stack-curaos-ai-workspace-500
