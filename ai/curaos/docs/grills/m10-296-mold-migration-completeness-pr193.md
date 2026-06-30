# Adversarial Grill — PR #193 mold migration completeness

**Reviewer:** Codex (cross-harness adversarial — Codex reviewing Claude code)
**PR:** curaos#193 — `agent/m10-296-mold-migration-completeness-claude-8c2au3di`
**Commit:** b9d40c9
**Date:** 2026-06-02
**Scope:** `tools/codegen/templates/service-{core,personal,business}/drizzle/migrations/0000_audit_outbox.sql.hbs` + `meta/0000_snapshot.json.hbs` + snapshot test

---

## Verdict: REJECT

---

## P0 (blocking)

### 1 — CONFIRMED: SQL creates `audit_outbox_status_check` constraint absent from schema.ts and snapshot (DDL ≠ schema ≠ snapshot)

All three layer migration templates emit a `CHECK` constraint on `audit_outbox.status` that appears in no other artifact:

**SQL (replicated identically in core/personal/business):**
- `tools/codegen/templates/service-core/drizzle/migrations/0000_audit_outbox.sql.hbs:65-66`
- `tools/codegen/templates/service-personal/drizzle/migrations/0000_audit_outbox.sql.hbs:65-66`
- `tools/codegen/templates/service-business/drizzle/migrations/0000_audit_outbox.sql.hbs:65-66`

```sql
CONSTRAINT audit_outbox_status_check
CHECK (status IN ('pending','published','failed'))
```

**Emitted schema.ts.hbs (all three layers) — unconstrained text, no check:**
- `tools/codegen/templates/service-core/drizzle/schema.ts.hbs:143`
- `tools/codegen/templates/service-personal/drizzle/schema.ts.hbs:148`
- `tools/codegen/templates/service-business/drizzle/schema.ts.hbs:148`

```typescript
status: text('status').notNull().default('pending'),
```

**Snapshot JSON (all three layers) — explicitly empty check constraints:**
- `tools/codegen/templates/service-core/drizzle/migrations/meta/0000_snapshot.json.hbs:316`
- `tools/codegen/templates/service-personal/drizzle/migrations/meta/0000_snapshot.json.hbs:322`
- `tools/codegen/templates/service-business/drizzle/migrations/meta/0000_snapshot.json.hbs:322`

```json
"checkConstraints": {},
```

**Impact:** The snapshot accurately reflects the schema (no check constraint), but the SQL baseline creates a constraint the snapshot does not know about. This is the critical approval gate failure:

- `drizzle-kit check` will diverge permanently: the live DB has a check constraint; the snapshot says there is none → drizzle-kit generates a spurious `ALTER TABLE … DROP CONSTRAINT audit_outbox_status_check` in every next migration for every generated service.
- Any `drizzle-kit generate` run after initial deploy will produce a migration that drops the check constraint, silently removing the DB-level guard on `status` values.
- The platform-wide blast radius is every service generated from this mold — all will inherit the broken drift.

This violates the approval gate: _"migration DDL matches schema.ts for all 4 tables across all 3 layers + snapshot is accurate."_

---

## P1 (high)

None beyond P0.

---

## P2 (medium)

### 1 — CONFIRMED: Snapshot test does not assert SQL/schema/snapshot constraint equivalence; misses the P0 drift

The test checks four-table presence and index names, and trio symmetry of column + index sets, but does NOT cross-check SQL DDL constraints against the snapshot `checkConstraints` field.

Relevant test lines (all PASS even with the P0 drift present):
- `tools/codegen/__tests__/templates/migration-0000-snapshot.test.ts:68` — asserts 4-table key set only
- `tools/codegen/__tests__/templates/migration-0000-snapshot.test.ts:78` — asserts outbox index names only
- `tools/codegen/__tests__/templates/migration-0000-snapshot.test.ts:156` — SQL cross-check only verifies `CREATE SCHEMA IF NOT EXISTS`
- `tools/codegen/__tests__/templates/migration-0000-snapshot.test.ts:184-185` — trio symmetry only compares columns + indexes (not checkConstraints)

The test is RED for missing tables (correctly guards the original bug) but GREEN for the SQL-only constraint that breaks the snapshot baseline.

---

## P3 (low/nit)

None.

---

## Per-vector summary

| Vector | Verdict | Notes |
|---|---|---|
| 1. DDL vs schema field-by-field | **REJECT** | SQL creates `audit_outbox_status_check`; schema.ts emits unconstrained text; snapshot records empty checkConstraints |
| 2. meta/0000_snapshot.json accuracy | **REJECT** | Snapshot is accurate to schema but NOT to SQL migration — drizzle-kit will generate spurious DROP CONSTRAINT on every next migration |
| 3. Base-column divergence across trio | **PASS** | core has no base layer column for user/org; personal adds `user_id`; business adds `org_id` — each confirmed in respective `0000_audit_outbox.sql.hbs:90-96` |
| 4. Idempotency / re-run safety | **PASS** | All table, schema, and index CREATE statements use `IF NOT EXISTS` (`service-core/.../0000_audit_outbox.sql.hbs:37,39,73,77,81,85,90,106,115,122,133`) |
| 5. Regression for already-deployed services | **PASS** | `IF NOT EXISTS` guards prevent conflicts; Drizzle's `migrate()` hash-checks the journal so the 0000 file will not re-execute against services that already ran the old 0000 |
| 6. Snapshot test coverage | **PARTIAL** | Test is RED for missing tables (correct), GREEN for SQL-only constraint (misses P0) |

---

## Required fix before merge

Either:

**Option A** (preferred — align SQL to schema):
Remove `CONSTRAINT audit_outbox_status_check … CHECK (…)` from all three `0000_audit_outbox.sql.hbs` files. The schema and snapshot already agree there is no check constraint. The DB-level guard is an optional hardening that belongs in a forward migration, not the baseline that must match the snapshot exactly.

**Option B** (if check constraint is intentional):
Add `checkConstraints` to `0000_snapshot.json.hbs` for all three layers AND add a Drizzle `check()` call to `schema.ts.hbs` for `audit_outbox.status`. Then update the snapshot test to assert `checkConstraints` is non-empty for `audit_outbox`. All three must be in sync.

In either case, update the snapshot test to assert SQL `CONSTRAINT` presence/absence matches the snapshot `checkConstraints` field — so this class of drift is caught in CI going forward.

---

## Re-grill verification

**Fix applied:** 2026-06-02 · commit `3eed2e4` (curaos#193) · agent `claude-8c2au3di`

**Chosen: Option B** (keep the DB-level status guard; make all three artifacts agree byte-identically across the trio).

### P0 — resolved

For all three layers (`service-core`/`-personal`/`-business`):

1. **schema.ts.hbs** — added `check` to the `drizzle-orm/pg-core` import + appended to the `audit_outbox` table extra-config array:
   ```ts
   check('audit_outbox_status_check', sql`status IN ('pending','published','failed')`),
   ```
2. **meta/0000_snapshot.json.hbs** — added the matching entry to the `audit_outbox` table's `checkConstraints`:
   ```json
   "checkConstraints": { "audit_outbox_status_check": { "name": "audit_outbox_status_check", "value": "status IN ('pending','published','failed')" } }
   ```
3. **0000_audit_outbox.sql.hbs** — unchanged (its `CONSTRAINT audit_outbox_status_check CHECK (status IN ('pending','published','failed'))` was already correct; name + expression now match schema + snapshot exactly).

**Empirical proof (real `drizzle-kit generate@0.31.10` on a freshly-rendered core service):**
- **Fixed state:** `4 tables … No schema changes, nothing to migrate 😴` — no 0001 emitted, no spurious `DROP/ADD CONSTRAINT`.
- **Negative control** (snapshot `checkConstraints` stripped back to `{}`): generate emitted `0001` with `ALTER TABLE … ADD CONSTRAINT audit_outbox_status_check` — confirming the snapshot entry is load-bearing and the original drift was real.

### P2 — resolved

New drift-catch test `every SQL CHECK constraint is mirrored in the snapshot AND schema.ts (#296 P0 drift-catch)` in `tools/codegen/__tests__/templates/migration-0000-snapshot.test.ts`: parses every `CONSTRAINT … CHECK (…)` out of each layer's `0000_audit_outbox.sql.hbs` and asserts each is present (name + normalized expression) in both the snapshot `checkConstraints` and the rendered `schema.ts` `check('<name>', …)`, across the full trio. **RED before the fix** (`snapshot is missing checkConstraint "audit_outbox_status_check"`), **GREEN after**.

### Downstream propagation

- **audit-core#5** (`agent/m10-296-audit-core-regen-claude-8c2au3di`, commit `84b0e62`): same drift (copied the mold). Fixed via the same Option-B alignment in its tracked `drizzle/schema.ts` (its `meta/` snapshot is `.gitignore`d in the rendered service, so it regenerates locally to match). `drizzle-kit generate` → "No schema changes". Caught + corrected a table-ordering mistake (audit-core orders `audit_outbox` BEFORE `audit_chain_heads`, opposite of the mold) via the live generate run.
- **party-core#6**: inspected — it ships hand-authored sequential SQL migrations with **NO `schema.ts` and NO `0000_snapshot.json`** (its `meta/` holds only `_journal.json`). With no schema-vs-snapshot pair, the drizzle-kit `DROP CONSTRAINT` drift class **cannot occur**; its `CHECK` is a plain forward migration with nothing to diverge from. **Left untouched** (no same drift).

**Verdict: P0 + P2 RESOLVED.** Re-grill recommended by orchestrator before merge.

## Re-grill verification (2026-06-02, post-3eed2e4) — REJECT (test-rigor, original P0 fixed)

Original P0 (CHECK DDL-vs-schema-vs-snapshot drift) STATICALLY FIXED: all 3 artifacts agree across all 3 layers (name `audit_outbox_status_check`, expr `status IN ('pending','published','failed')`, valid Drizzle snapshot object-map shape, on the correct `audit_outbox` table). REJECT stands on verifiability/test-rigor:
- **P1 — drift-catch test too weak:** `migration-0000-snapshot.test.ts:248-249` flattens snapshot checks across ALL tables (a constraint on the WRONG table passes); `:260-263` checks schema.ts for the constraint NAME only (an expression typo under the same name passes). Harden: table-scoped assertion + cross-check the SQL expression against schema.ts + snapshot expression.
- **P1 — runtime proof not committed:** the `drizzle-kit generate` "No schema changes" + negative-control claims are not committed artifacts (plausible from static alignment, but unverifiable from git).
- **P0-adjacent — audit-core snapshot gitignored:** `drizzle/migrations/meta/` is `.gitignore`d, so commit 84b0e62 can't PROVE audit-core's 3-artifact alignment (local disk agrees). This is the pre-existing gitignored-meta foresight (meta/ ignored but Docker-COPYed) — a standing codegen-service convention issue, NOT introduced by #296. Route to its own foresight, not a #296 blocker (SQL+schema — what actually runs — agree).

Required: harden the drift-catch test (table-scoped + expression-match). The gitignored-meta convention → separate foresight decision.
