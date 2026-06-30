# Grill: issue-604 durable-iff-write mem-tx backport (ghost-event leak)

- Issue: your-org/curaos-ai-workspace#604
- Subject: backport the #299 durable-iff-write mem-tx `stageCommit` fix to pre-#299 M11 domain-outbox producers.
- Grill: Claude -> Codex (opposite-harness). Model `gpt-5.5`, reasoning `high`, `--sandbox read-only`.
- Date: 2026-06-09.
- Verdict: NO critical flags. Plan validated; all decision points carry recommended answers (auto-applied per [[curaos-recommendation-auto-apply-rule]]). Only escalation triggers are actions NOT being taken (premature #604 close, full-file overwrites, template changes).

## Plan that was grilled

- Enumerate every service whose `src/db/domain-outbox.service.ts` predates the #299 mold fix (the `transaction()` mem-tx executor lacks `stageCommit`).
- Apply a SURGICAL patch: replace only the InMemory store region (`insert()` / `enqueue()` / `enqueueWith()` / `transaction()`) with the fixed-mold canonical region + add the module-level `stageCommitOf()` where absent; preserve each service's file-header docstrings + Postgres store + service wrapper. Generator-alignment (the mold is already fixed at db597aa), NOT a hot-fix.
- Add a store-level durable-iff-write rollback test: `store.transaction(async tx => { await store.enqueueWith(tx.db, evt); throw })` asserts `store.all()` length 0 (ghost rolls back with the business write), plus positive controls (successful tx commits, auto-commit `enqueue()` commits, `tx.enqueue()` rollback).
- Scope guard: do the high-risk subset THIS lane (commerce-core, accounting-core, sales-core, inventory-core, procurement-core, personal-hr, clinical-doc, encounter, scheduling), defer the rest (geospatial, documents, donation, event-core, esign-core, site-core, fleet-core, terminology, crm-core, orders) to a follow-up issue, keep #604 open.

## Codex verdict (key points)

1. Missing questions: deferred real positives need a follow-up issue id before any "done"; do not close #604. Each lane service gets the same focused store-level test.
2. Docs/ADR: generator-evolution rule forbids local-only MOLD fixes; no conflict because the template stays fixed and the lane only repairs already-emitted drift. Full-file overwrite WOULD conflict with preserving service-local docstrings. No doc supports "personal-hr already fixed"; the code contradicts it.
3. Glossary: "Fixed" must mean `transaction()` exposes `stageCommit`, not merely that `stageCommitOf()` exists. Donation "#351 shared tx buffer" is the donation DOMAIN store (`asTxBuffer`), a SEPARATE path from the domain-outbox `transaction()`.
4. Hidden deps: personal-hr's existing producer test uses a hand-built stageable tx, so it is FALSE-GREEN for the store transaction path - the new store-level test is needed.
6. Decision points (recommended, auto-applied):
   - Surgical, not full overwrite. CONFIRMED.
   - donation-core IS affected (true positive); its outbox `transaction()` memTx is `{ execute: () => undefined }`. CONFIRMED.
   - Rollback-test shape correct; add positive controls to prevent over-rollback; auto-commit `enqueue()` must still commit. CONFIRMED.
   - personal-hr is NOT fixed. CONFIRMED.
   - Scope cut right for this lane; defer the rest, keep #604 open. CONFIRMED.
7. User-escalation candidates: only if the implementer were to close #604 with deferred services unpatched, do full-file overwrites, or change the template - NONE of which this lane does.

## Resolution

All recommendations auto-applied (no user escalation needed). RED/GREEN already proven on accounting-core (Tier-B) in the sandbox: unpatched store FAILS the ghost-event assertion (`Expected 0, Received 1`); patched store passes all 4 tests + `tsc --noEmit` clean.
