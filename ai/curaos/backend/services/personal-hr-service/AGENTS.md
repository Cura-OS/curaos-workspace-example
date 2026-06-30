---
name: personal-hr-service
description: "Individual-context hr overlay (individual worker/clinician credential ownership (licensure, DEA/NPI, PSV) extending hr-core-service) extending @curaos/hr-core-service."
tags: [service, personal, neutral]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis:
  - REST /api/v1/personal/hr
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/personal-hr-service/CONTEXT.md
  requirements: ai/curaos/backend/services/personal-hr-service/Requirements.md
---

# personal-hr-service - Agent Contract

> Individual-context overlay for hr (individual worker/clinician credential ownership (licensure, DEA/NPI, PSV) extending hr-core-service). Extends `@curaos/hr-core-service`. Domain overlay: `neutral`.
## Mission

Provide individual-scoped hr workflows (single user / single household) on top of `hr-core-service` primitives. Personal context isolation enforced via `personal-context.ts`. 


- Neutral capability: NO PHI/PII/financial rows persisted here - overlays own protected schemas.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER bypass `personal-context.ts` isolation
- NEVER duplicate primitives owned by `hr-core-service` (extend, don't fork)
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
layer: personal
extends: hr-core-service
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
notable:
  ai/: agent docs mirror - no code here
  personal-context.ts: per-user isolation boundary
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier)
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)

