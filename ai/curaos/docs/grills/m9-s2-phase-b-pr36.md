# Claude grill — M9-S2 Phase B PR identity-service#36

## Verdict: BLOCK

Implementation has a credible production-Postgres correctness gap, a load-bearing semantic assumption (`org_id := tenant_id`) that is not justified by ADR-0210 or an FK guarantee, a broad `ON CONFLICT DO NOTHING` on `identities` that can silently hide the wrong conflict, and no production-store test coverage.

## P0 findings

1. **Postgres production store has no real-DB test coverage**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:299`
   - **What:** `PostgresDiamondBackfillStore` is the production path, but the test suite exercises only `InMemoryDiamondBackfillStore`.
   - **Why P0:** The in-memory store does not model Postgres unique constraints, `jsonb_to_recordset`, or SQL tuple cursor behavior.
   - **Fix:** Add a real Postgres integration test for the Phase B path, with Phase A Diamond tables plus an M3 source schema seeded with users and roles.

2. **Identity insert masks the wrong conflicts**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:427`
   - **What:** `ON CONFLICT DO NOTHING` catches every unique constraint on `identities`, including `(tenant_id, email)`.
   - **Why P0:** A bad pre-existing identity can cause the backfill to silently skip a user identity instead of surfacing data drift.
   - **Fix:** Make idempotency target only the actor/id conflict that proves a row was already backfilled; fail loudly on unrelated uniqueness violations.

3. **Backfilled actor IDs conflict with UUID-v7 invariant**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:463`; `src/identity-core/db/schema.ts:30`
   - **What:** The backfill copies M3 `users.id` into `actors.id`, while the Diamond schema documents application-level UUID-v7 IDs for causation ordering.
   - **Why P0:** Historical actor rows become permanent exceptions to the ordering invariant unless the ADR explicitly allows this.
   - **Fix:** Either add a durable M3-user-to-actor mapping with generated UUID-v7 actor IDs, or pin an ADR/issue decision that backfilled M3 users preserve IDs and are exempt from the v7 ordering invariant.

4. **`org_id := tenant_id` is undocumented and may orphan memberships**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:489`
   - **What:** M3 roles have no org id, and the implementation maps membership org id to tenant id.
   - **Why P0:** ADR-0210 defines `actor_memberships.org_id` as an org reference, but no current invariant proves an org row exists with `id == tenant_id`.
   - **Fix:** Resolve the tenant root org id from org data or fail loudly; if `tenant_id == root_org_id` is the intended rule, document it and assert it before insert.

## P1 findings

1. **Multiple M3 roles are silently collapsed**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:454`
   - **What:** `actor_memberships_actor_org_type_unique` allows one `(actor_id, org_id, staff)` row, so users with `user` plus `tenant-admin` lose one role.
   - **Fix:** Choose and document a deterministic role precedence, widen the schema, or represent the role set without silent loss.

2. **Progress counters increment before writes succeed**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:160`
   - **What:** `rowsRead` increments before any insert returns.
   - **Fix:** Move success counters after the batch transaction, or split read vs processed metrics.

3. **Failed runs do not emit last-good cursor**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:612`
   - **What:** CLI error path writes only the error message.
   - **Fix:** Track and emit the last completed cursor and metrics on nonzero exit.

4. **Unknown M3 statuses are silently remapped to `pending`**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:690`
   - **What:** Unknown status values do not fail or increment a drift counter.
   - **Fix:** Fail fast or emit an explicit `backfill.identity.status.unmapped` counter and document the mapping.

5. **No per-batch transaction wraps actor, identity, and membership writes**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:169`
   - **What:** Three separate insert calls can leave partial Diamond rows during failure windows.
   - **Fix:** Wrap a page in one explicit Postgres transaction.

6. **In-memory cursor ordering differs from Postgres UUID ordering**
   - **Where:** `src/identity-core/backfill/backfill-diamond.command.ts:504`
   - **What:** JS `localeCompare` does not prove parity with Postgres UUID comparison.
   - **Fix:** Normalize UUIDs before compare or add an ordering-parity test.

## What the PR gets right

- M3 tables are read-only.
- No `-v2` or parallel replacement path was introduced.
- Tuple cursor shape is directionally correct for restartable pagination.
- Batch size is bounded.
- Happy-path idempotency is covered.

## Local verification

Orchestrator ran these locally from `/Users/dev/workspace/curaos-workspace/curaos/backend/services/identity-service`:

- `bun run typecheck` — pass
- `bun test test/identity-core/backfill` — 35 pass, 0 fail
- `bun run ci` — 171 pass, 2 skip, 0 fail

GitHub CI failure on identity-service remains the known private-parent checkout failure and is not treated as a code failure for this PR.

## Re-grill verification — 2026-05-28

### Verdict: APPROVE

Claude opposite-harness final re-grill on identity-service PR #36 after commits `896b71f`, `9bb1e36`, and `1896ada` returned `APPROVE` with no findings.

The prior `APPROVE-WITH-CONDITIONS` item is resolved: `backfill-diamond.command.test.ts` now covers the CLI structured failure output path, including `ok:false`, the error string, tenant id, partial counts, restart cursor, and Prometheus counter text. The re-grill found no merge-blocking regressions in the Phase B Diamond backfill path.

### Orchestrator verification

Run from `/Users/dev/workspace/curaos-workspace/curaos/backend/services/identity-service`:

- `bun run typecheck` — pass
- `bun test test/identity-core/backfill` — 44 pass, 6 skip, 0 fail
- `CURAOS_IDENTITY_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:52516/identity_backfill_test bun test test/identity-core/backfill/backfill-diamond.postgres.test.ts` — 6 pass, 0 fail against `postgres:16-alpine`
- `bun run ci` — 180 pass, 8 skip, 0 fail
- `git diff --check` — pass

GitHub Actions for PR #36 still reports failure in `Checkout CuraOS parent workspace` because the workflow token cannot read `your-org/curaos`; this matches the documented private-parent checkout failure and is not a code/test failure for the backfill branch.
