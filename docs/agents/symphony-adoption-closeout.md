# Symphony Adoption Closeout Checklist

Status: verification checklist for Symphony alignment changes
Related plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Local ledger: [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md)

Run this before reporting a Symphony alignment change complete.

## Required checks

- [ ] `node scripts/check-workflow-sync.js`
- [ ] `node scripts/check-symphony-conformance.js`
- [ ] `node scripts/check-symphony-source-audit.js`
- [ ] `node scripts/generate-rule-index.js`
- [ ] `bun scripts/check-doc-graph.js --write`
- [ ] `bash scripts/check-docs.sh`
- [ ] For any workflow script/code change, red test evidence exists before implementation and green test evidence exists after implementation.
- [ ] For local issue tracker changes, SQLite schema or helper tests pass and prove zero GitHub calls for routine local operations.
- [ ] Local issue rows have a main issue or `parent_id` linkage for child work, blockers, follow-ups, and verification lanes.
- [ ] `node scripts/check-symphony-source-audit.js` proves tracked and untracked workflow markdown plus scripts contain no em dash or en dash.
- [ ] `git status --short` reviewed.
- [ ] Local ledger updated with status and reflection.
- [ ] GitHub sync queue is empty or every queued item has an exact handle.

## Evidence to report

- Changed files.
- Commands run and exit status.
- Any generated files updated.
- Any skipped check and why.
- Any GitHub sync performed.
- Any blocker that remains.

## Final local closeout evidence: 2026-06-27

- [x] `node --test scripts/lib/local-issues-db.test.js scripts/check-docs.test.js scripts/lib/symphony-conformance.test.js scripts/lib/symphony-source-audit.test.js` passed with 16 tests, 0 failures.
- [x] `node scripts/check-workflow-sync.js` passed with 48 in sync, 0 problems.
- [x] `node scripts/check-symphony-conformance.js` passed with 20 checked, 0 problems.
- [x] `node scripts/check-symphony-source-audit.js` passed with 340 tracked/untracked workflow markdown and script files checked.
- [x] `node scripts/generate-rule-index.js --write` passed and regenerated rule indexes.
- [x] `bun scripts/check-doc-graph.js --write && bun scripts/check-doc-graph.js` passed with 1511 nodes and 9415 edges.
- [x] `bash scripts/check-docs.sh` passed.
- [x] `git diff --check` passed.
- [x] `node --check` passed for changed JS/MJS/CJS files.
- [x] Changed text plus edited Hermes skill no-em/en-dash scan passed.
- [x] Local SQLite `sync_outbox` readback returned `[]`.
- [x] SAA-MAIN and SAA-15 are linked in `.scratch/state/symphony-work/local-issues.sqlite`; GitHub sync remains explicitly not queued.

## Stop conditions

Stop and report instead of forcing completion when:

- A T3 gate is reached.
- A destructive action is needed.
- A credential or permission is missing.
- A docs or workflow check fails after three focused attempts on the same file.
- A GitHub quota or rate-limit issue prevents a required sync.
