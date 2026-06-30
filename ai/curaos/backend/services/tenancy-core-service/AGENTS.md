---
name: tenancy-core-service
description: "Neutral tenancy primitives (Neutral tenant lifecycle + isolation metadata (no PHI/PII)) - neutral baseline."
tags: [service, core, neutral]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis:
  - /api/v1/tenancy
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/tenancy-core-service/CONTEXT.md
  requirements: ai/curaos/backend/services/tenancy-core-service/Requirements.md
---

# tenancy-core-service - Agent Contract

> Neutral primitives for tenancy (Neutral tenant lifecycle + isolation metadata (no PHI/PII)). Domain overlay: `neutral`.
## Mission

Own the tenant LIFECYCLE (CRUD + activation/suspension state machine + soft-delete) and per-tenant isolation/quota METADATA. tenancy-core is the canonical owner of which tenants exist; neutral capabilities + vertical overlays provision/tear-down per-tenant resources off the lifecycle events emitted here. NEUTRAL ONLY ([[curaos-triplet-split-rule]]): no personal/business triplet - tenancy has no divergent personal/business subject owner. Primary consumer: admin-app.


- Neutral capability: NO PHI/PII/financial rows persisted here - overlays own protected schemas.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER edit migration files post-merge
- NEVER persist PHI/PII/financial rows in this neutral layer (overlay schemas only)
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug



- Neutral capability: NO PHI/PII/financial rows persisted here - overlays own protected schemas.


## Migration Authoring

The mold ships a table-only seed migration (`drizzle/migrations/0000_audit_outbox.sql`:
`CREATE SCHEMA` + `audit_outbox` table + indexes - NO trigger). Keep that contract for
every migration you add:

- **Init/table migrations stay table-only.** A `0001_init.sql` (and any later
  schema-changing migration) contains PURE `CREATE TABLE` / `CREATE INDEX` / FK DDL.
- **NEVER put the outbox LISTEN/NOTIFY trigger inline in an init migration.** The
  `pg_notify` publisher trigger (`CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER`) belongs
  in its OWN forward-only, idempotent `0002_outbox_publisher.sql` (`DROP TRIGGER IF EXISTS`
  then `CREATE TRIGGER`), applied AFTER the table it targets exists.
- Why: org-core-service#2 + party-core-service#226 both hand-authored a trigger-bearing
  `0001_init.sql` and had to split it out post-merge. Authoring table-first keeps the apply
  order safe and the init migration replay-clean ([[curaos-generator-evolution-rule]] §3.11).

## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: core
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
overlay_consumers:
  - personal-tenancy-service
  - business-tenancy-service
notable:
  ai/: agent docs mirror - no code here
```

## Personas Registry

- explorer: read-only codebase analysis (Haiku 4.5)
- implementer: feature + bugfix worker (Sonnet 4.6)
- reviewer: PR review w/ architecture lens (Sonnet 4.6)
