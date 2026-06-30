# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: m12-workflow-project-truth-pr470

## Native Claude companion fallback review (2026-06-05)

GRILL: opposite-harness-native-fallback
HARNESS: Claude Code companion review
SUBJECT: m12-workflow-project-truth-pr470
PR: https://github.com/your-org/curaos-ai-workspace/pull/470
VERDICT: issues-found; blocking findings fixed, remaining findings non-blocking/accepted

The committed `opposite-harness-grill` workflow correctly failed closed because the `claude-rescue` agent returned `verdict=pass` but did not persist `report_path`. Native fallback used the Claude Code companion review command:

```bash
node /Users/dev/.codex/plugins/cache/claude-code/claude/1.0.6/scripts/claude-companion.mjs review --wait --base main --scope branch
```

Findings and resolutions:

| Finding | Severity | Resolution |
|---|---:|---|
| `roadmap-project-item-sync` returned desired `CuraOS Milestone` as if it were board truth, allowing unmapped single-select values to pass as bound. | High | Fixed. `milestoneAfterReconcile()` now returns `NONE` for unmapped/skipped/mismatched values and tests cover `M16` -> `NONE`. |
| `gh-issue-triage` deterministic prefetch could throw before fallback on GitHub API/transient failure. | High | Fixed. Triage prefetch now strips `GITHUB_TOKEN`, retries transient failures, and returns structured `blocked_by_external` for API/quota/transient failure. |
| Dry-run Project sync synthesized `{set}` for unmapped single-select values. | Medium | Fixed. `plannedFieldWrites()` mirrors `reconcileFields()` and returns `{unmapped}` for invalid single-select options. |
| `project_items_cache` was load-bearing but absent from machine-readable workflow contract. | Medium | Fixed. Added to JS and Markdown contracts. |
| Pre-existing grill report could satisfy a later missing-report run. | Low | Fixed. `opposite-harness-grill` now requires `report_path` to be written or appended after the current grill starts. |
| Cache-miss sync may write all desired fields because current board values are unknown. | Medium | Accepted. Active candidates normally come from the same Project scan and are present in the wave cache; cache misses are treated as newly-added/currently-unknown rows and GraphQL mutation failure remains the fail-closed guard for invalid options. |
| `set` writes are trusted after successful GraphQL mutation, not re-read. | Low | Accepted. Unmapped single-select values are blocked before mutation; GraphQL mutation errors throw. The returned value is documented as existing in-sync board value or successful set write, not unconditional post-write read-back. |

Verification after fixes:

```bash
node --check scripts/workflows/gh-issue-triage.workflow.js
node --check scripts/workflows/gh-project-sync.workflow.js
node --check scripts/workflows/milestone-wave.workflow.js
node --check scripts/workflows/pm-triage-gate.workflow.js
node --check scripts/workflows/opposite-harness-grill.workflow.js
node --check scripts/roadmap-project-item-sync.js
node --test scripts/workflow-truth-contract.test.js
node scripts/check-workflow-sync.js --json
bash scripts/opposite-harness-grill.test.sh
bun scripts/check-doc-graph.js
git diff --check
```
