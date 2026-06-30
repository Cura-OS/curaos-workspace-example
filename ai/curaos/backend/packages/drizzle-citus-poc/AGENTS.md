---
name: drizzle-citus-poc
description: Pre-M2 PoC verifying Drizzle ORM + Citus distributed PG (admin SQL via sql tag) per [[curaos-postgres-rule]] DA13 Q3 + open issue drizzle#3102.
tags: [poc, citus, drizzle, m2-gate]
language: typescript
framework: drizzle
infrastructure: PostgreSQL (CNPG)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
runtime: bun
package_manager: bun
---

# AGENTS.md - drizzle-citus-poc

PoC package validating M2 gate: standard Drizzle PG driver works w/ Citus distributed tables via `sql` tag (Citus admin SQL like `create_distributed_table` issued directly; no Drizzle native Citus support needed).

## Mission

Prove (or disprove) Drizzle + Citus compatibility before M2 shared-lib bootstrap commits to ORM.

## Toolchain

```bash
bun install
bun run test:poc   # against running Citus container
docker run --rm -d --name citus-poc -p 15432:5432 -e POSTGRES_PASSWORD=poc citusdata/citus:13.0
```

## Done when

- `bun run test:poc` exits 0 w/ green checkmarks at all 6 PoC steps against live Citus
- pg_dist_partition metadata confirms users = distributed by tenant_id + tenants = reference
- Drizzle SELECT against distributed table returns expected rows
- PoC findings updated in [[curaos-postgres-rule]] + [[curaos-orm-rule]]

## Companion docs

- [CONTEXT.md](CONTEXT.md) - PoC rationale + drizzle#3102 status tracking
- [Requirements.md](Requirements.md) - verification criteria
