---
name: audit-core-service
description: "Neutral audit primitives (canonical durable audit chain head store + tamper-evident hash chain (ADR-0210 neutral root)) - neutral baseline."
tags: [service, core, neutral]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis: []
events:
  produces: [curaos.core.audit.chain.broken.v1, curaos.core.audit.chain.verified.v1]
  consumes: [curaos.workflow.events.v1]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/audit-core-service/CONTEXT.md
  requirements: ai/curaos/backend/services/audit-core-service/Requirements.md
---

# audit-core-service - Agent Contract

> Neutral primitives for audit (canonical durable audit chain head store + tamper-evident hash chain (ADR-0210 neutral root)). Domain overlay: `neutral`.
## Mission

Provide vertical-agnostic audit primitives reused by `personal-audit-service` + `business-audit-service` and any future overlay. Owns canonical audit contracts, events, storage shape. 


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

## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: core
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
overlay_consumers:
  - personal-audit-service
  - business-audit-service
notable:
  ai/: agent docs mirror - no code here
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier)
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)

