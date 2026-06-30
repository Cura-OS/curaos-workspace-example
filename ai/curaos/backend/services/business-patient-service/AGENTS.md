---
name: business-patient-service
description: "Org/enterprise patient overlay (patient demographics neutral primitives) extending @curaos/patient-core-service."
tags: [service, business, healthstack]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis:
  - REST /api/v1/business/patient
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/business-patient-service/CONTEXT.md
  requirements: ai/curaos/backend/services/business-patient-service/Requirements.md
---

# business-patient-service - Agent Contract

> Org/enterprise overlay for patient (patient demographics neutral primitives). Extends `@curaos/patient-core-service`. Domain overlay: `healthstack`.
## Mission

Provide multi-user / org-scoped patient workflows on top of `patient-core-service` primitives. Business context isolation (tenant + org-unit) enforced via `business-context.ts`. - PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).




## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER bypass `business-context.ts` tenant + org isolation
- NEVER duplicate primitives owned by `patient-core-service` (extend, don't fork)
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).





## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: business
extends: patient-core-service
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
notable:
  ai/: agent docs mirror - no code here
  business-context.ts: per-tenant + per-org isolation boundary
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier - per [[curaos-model-tiering-rule]])
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)
- hipaa-auditor: PHI boundary + audit-chain review (opus tier; PHI minimum sonnet tier)
