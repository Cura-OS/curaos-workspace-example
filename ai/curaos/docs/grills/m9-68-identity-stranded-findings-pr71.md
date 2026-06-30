# Grill — identity-service#68: 11 stranded CodeRabbit findings (PRs #57/#61/#62/#63/#65/#66)

- **Reviewer harness:** Codex (`codex-cli 0.135.0`, default model, `model_reasoning_effort=high`, `--sandbox read-only`)
- **Author harness:** Claude Code
- **Branch:** `agent/fix-stranded-findings-68`
- **Commit at grill time:** `fab515a` (11-finding fix)
- **Date:** 2026-06-01
- **Scope:** working-tree diff of the 11-finding resolution commit

## Verdict

**2 non-blocking refinements, both on finding #5 (migration uniqueness). No blocking defects on findings 1, 2, 3, 4, 6, 7, 8, 9, 10, 11.** Both refinements auto-applied per `ai/rules/curaos_recommendation_auto_apply_rule.md` (clear recommendation, reversible, not T3) in follow-up commit `65a567b`.

## Findings raised

### G1 — `drizzle/migrations/0005_audit_identity_uniqueness.sql` (finding #5) — dedupe vs concurrent-insert race
Codex: the dedupe `DELETE` and `CREATE UNIQUE INDEX CONCURRENTLY` are separate statements (CONCURRENTLY cannot share a tx), so a writer inserting a NEW duplicate federated row in the window between the dedupe and the build reaching VALID can still fail the build (leaving an INVALID index). The "cannot fail mid-flight" comment over-claimed.

**Resolution (auto-applied, `65a567b`):** corrected the comment — the dedupe removes only PRE-EXISTING duplicates and cannot (without locking writers) prevent a fresh racing duplicate; documented the recoverable re-run-until-clean loop (`DROP INDEX CONCURRENTLY IF EXISTS` → re-dedupe → rebuild until VALID). New federated writes were never guaranteed-unique pre-#250, so a brief race during the one-time backfill is a safe, retryable condition, not data loss. Cited: PostgreSQL CONCURRENTLY semantics.

### G2 — `src/identity-core/db/migrations.ts` (finding #5) — runtime applicator on an existing populated table
Codex: `createIdentitiesTable` runs the plain unique index inside `db.transaction` even when `CREATE TABLE IF NOT EXISTS` found an EXISTING populated table (the documented "Phase C enabled before the boot migrator ran" path), so duplicates could abort boot. The "empty, no possible duplicates" comment held only for a FRESH deploy.

**Resolution (auto-applied, `65a567b`):** added a dedupe pre-clean (same canonical-keep rule as 0005) before the plain index in `createIdentitiesTable`, so the in-tx build can never abort the bootstrap on a populated table. Documented that for an already-live populated deployment the 0005 CONCURRENTLY migration is the non-blocking path and should be applied instead of relying on this boot DDL. The brief in-tx lock is acceptable: boot-time DDL already holds the `identity_core_ddl` advisory lock and is not serving steady traffic.

## Items explicitly cleared (no defect)
- Finding 1 (invitations idempotent concurrent-retry): `lookupCalls`/`isUniqueViolation` logic correct; only the unique-violation+have-key case is swallowed, every other error still audits + rethrows.
- Finding 3 (relay markFailed per-key try/catch): isolation correct, no cross-key starvation.
- Finding 4 (auth-audit-publisher swallow on tx path): swallow scoped to the tx path only; no-tx path still propagates. The durable row is authoritative; a swallowed transient emitNow is best-effort + logged via `console.warn`.
- Finding 6 (gateSnapshot always-load): `forcedRed` folds the old RED preconditions into the verdict while reporting true ledger counts; `!replayComplete` is now explicitly represented (it was only implicit before).
- Findings 7, 2, 8, 9, 10, 11: no defects.

## Post-fix verification
- `bun run typecheck` → exit 0
- `bun run ci` (lint + typecheck + test + build) → 483 pass / 41 skip / 0 fail, exit 0
- `bun run depcruise:bulk` → exit 0 (1 pre-existing unrelated orphan warning)
- `node scripts/check-ci-gates-sync.js` (curaos root) → 9 in sync, 0 problems
- Postgres-backed `.postgres.test.ts` (41 skips) did NOT run — no local PG (port 5432 closed, no DSN). The changed gate/relay/divergence logic is exercised by the in-memory test doubles that DID run.
