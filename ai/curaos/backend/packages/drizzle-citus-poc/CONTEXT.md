# drizzle-citus-poc — Agent Context

## Status

PoC scaffolded 2026-05-25. Pre-M2 gate per [[curaos-postgres-rule]] DA13 Q3.

## Why this PoC

Drizzle ORM 0.45.2 (as of 2026-05-25) does NOT have native Citus distributed-table support per [open issue drizzle#3102](https://github.com/drizzle-team/drizzle-orm/issues/3102). Open since 2024-10-11.

CuraOS post-DA13 commits to Citus distributed PG for 10K+ tenant scale per [[curaos-postgres-rule]]. Need to verify Drizzle works *anyway* via standard PG driver + `sql` tag for Citus admin commands.

## Hypothesis

Citus = PostgreSQL extension. Citus distributed tables are still PG tables (different storage layer). Standard PG drivers (postgres-js, pg, postgres) see distributed tables as normal tables. Citus admin SQL (`create_distributed_table`, `create_reference_table`, etc.) = standard `SELECT function()` calls. Drizzle `sql` tag passes through arbitrary SQL.

Expected: PoC PASSES.

## Failure modes to verify

1. **DDL conflict**: Drizzle migration `CREATE TABLE` works pre-distribution; `create_distributed_table` after table create works. Order matters.
2. **Foreign key constraints**: distributed↔reference FK works; distributed↔distributed FK requires both sharded on same key.
3. **JOIN performance**: distributed table JOIN on `tenant_id` co-located = fast; cross-shard JOIN = slow (verify Citus query plan).
4. **Transaction semantics**: 2PC across shards supported; verify Drizzle transaction wrapping respects this.

## If PoC PASS

- Continue M2 w/ Drizzle as default per [[curaos-orm-rule]]
- Add Citus admin SQL examples to codegen recipes per ADR-0153
- Document `sql` tag workaround pattern in [[curaos-postgres-rule]] §How Citus shards work

## If PoC FAIL

- Re-evaluate Drizzle vs MikroORM vs Kysely vs Prisma for Citus compatibility
- May require [[curaos-orm-rule]] amendment

## Integration map

```
drizzle-citus-poc
  ├── depends on: drizzle-orm 0.45.2 + postgres-js 3.4.5 (PoC-locked as of 2026-05-25)
  ├── runs against: Citus 13.0 (PostgreSQL 17 + Citus extension; PoC-locked as of 2026-05-25)
  └── informs: M2 shared-lib bootstrap (@curaos/tenancy uses Drizzle if PoC passes)
```

## Decisions (PoC-locked)

- D-001: Use postgres-js driver (not node-postgres pg). Reason: Drizzle's recommended PG driver; lower overhead; matches [[curaos-bun-primary-rule]].
- D-002: Citus 13.0 image as PoC target. Latest stable per Citus release cadence.
- D-003: `sql` tag for admin SQL (NOT raw query). Reason: SQL injection safety + Drizzle template tag standard.

## Banned

- Native Drizzle Citus integration attempt (open issue not yet implemented; don't fork)
- Bypass Drizzle for Citus-touching code (defeats ORM purpose)
- Citus enterprise features (HA, multi-tenancy via Citus's own scheme) — CuraOS uses Citus community + app-layer tenant routing
