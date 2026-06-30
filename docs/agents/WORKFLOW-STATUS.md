# WORKFLOW-STATUS

Pilot status table for the committed agent-workflow executors (remediation RP-56). One row per executor under `scripts/workflows/`. Trigger map: [workflows.md](workflows.md); library + contract: [workflows/README.md](workflows/README.md).

## Status grammar

- `ok`: no known open `workflow-defect` issue; suites green at Last verified.
- `degraded:<issue-url>`: usable, but a known open defect issue is linked; the URL is required.
- `broken:<issue-url>`: do not dispatch; the URL is required.

## Update protocol (workflow-defect closeout)

- Opening a `workflow-defect` issue against a workflow flips its row to `degraded:<issue-url>` or `broken:<issue-url>` in the same change that files the issue.
- Closing the defect flips the row back to `ok` and refreshes Last verified.
- Last verified = date the workspace JS suites (`just test-js`, which includes `scripts/workflow-truth-contract.test.js` and the live-table check in `scripts/lib/workflow-status.test.js`) last ran green while the row claimed its current status.
- Gate: `scripts/lib/workflow-status.js` parses + validates this table; a stale `ok` on a defect-tagged workflow fails with violation kind `stale-ok`. Standalone check: `node scripts/check-workflow-status.js [--defects-json <file>]`.

## Status

Open `workflow-defect` set checked 2026-06-10: none (tracker label query over `your-org/curaos-ai-workspace` returned 0 open; #508 CLOSED). Verification evidence 2026-06-28: `node scripts/check-workflow-status.js` green (48 rows, 48 executors) + `node --test scripts/workflow-truth-contract.test.js scripts/lib/symphony-conformance.test.js scripts/lib/symphony-source-audit.test.js` green.

| Workflow | Status | Last verified | Notes |
|---|---|---|---|
| breakdown | ok | 2026-06-10 | |
| context-load | ok | 2026-06-10 | |
| doc-governance | ok | 2026-06-10 | |
| fe-commit-fanned-apps | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-design-fold | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-fanout-web-apps | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-flagship-depth | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-foundation | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-foundation-repair | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-generator-depth | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-helm-chart-land | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-helm-charts | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-hosted-login | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-od-icon-set | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-pkce-tests-palette | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-reemit-fanned-apps | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-rn-icons | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-rn-recipe | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-security-propagate | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-test-regression-fix | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-audit | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-backend-deps-seed | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-closure | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-closure-2 | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-closure-3 | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-coverage-matrix | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| fe-v1-coverage-rerun | ok | 2026-06-16 | internal frontend executor; workflow-sync allowlisted |
| foresight-capture | ok | 2026-06-10 | kind:atomic since session 22 repair |
| foresight-sweep | ok | 2026-06-10 | |
| gh-issue-seed | ok | 2026-06-10 | |
| gh-issue-triage | ok | 2026-06-10 | |
| gh-pr-gate-snapshot | ok | 2026-06-11 | |
| gh-project-sync | ok | 2026-06-10 | |
| gh-roadmap-mirror | ok | 2026-06-10 | |
| gh-subissue-wire | ok | 2026-06-10 | |
| lens-review | ok | 2026-06-10 | |
| milestone-active-scan | ok | 2026-06-10 | read-only scan; no mutation |
| milestone-wave | ok | 2026-06-10 | real-agent dispatch defect #508 closed |
| opposite-harness-grill | ok | 2026-06-10 | |
| pm-triage-gate | ok | 2026-06-10 | |
| pr-verify-merge | ok | 2026-06-10 | |
| task-execute | ok | 2026-06-10 | |
| tdd-implement | ok | 2026-06-10 | |
| v1-backend-build-wave | ok | 2026-06-28 | internal executor; workflow-sync allowlisted |
| v1-backend-pr-verify | ok | 2026-06-28 | internal executor; workflow-sync allowlisted |
| v1-fe-native-wave | ok | 2026-06-28 | internal executor; workflow-sync allowlisted |
| v1-fe-wave | ok | 2026-06-28 | internal executor; workflow-sync allowlisted |
| wave-prioritize | ok | 2026-06-10 | |
