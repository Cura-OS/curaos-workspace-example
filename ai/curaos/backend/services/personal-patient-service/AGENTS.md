---
name: personal-patient-service
description: "Individual-context patient overlay (patient demographics neutral primitives) extending @curaos/patient-core-service."
tags: [service, personal, healthstack]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis:
  - REST /api/v1/personal/patient
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/personal-patient-service/CONTEXT.md
  requirements: ai/curaos/backend/services/personal-patient-service/Requirements.md
---

# personal-patient-service - Agent Contract

> Individual-context overlay for patient (patient demographics neutral primitives). Extends `@curaos/patient-core-service`. Domain overlay: `healthstack`.

## Mission

Provide individual-scoped patient workflows (single user / single household) on top of `patient-core-service` primitives. Personal context isolation enforced via `personal-context.ts`.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER bypass `personal-context.ts` isolation
- NEVER duplicate primitives owned by `patient-core-service` (extend, don't fork)
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).


## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: personal
extends: patient-core-service
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
- hipaa-auditor: PHI boundary + audit-chain review (opus tier)
