---
name: patient-core-service
description: "Neutral patient primitives (M7 first-mold output) - healthstack baseline. Schema + REST CRUD + outbox + audit envelope shipped per M7-S2."
tags: [service, core, healthstack, m7-complete]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis: []
events:
  produces: [curaos.core.audit.event.v1, curaos.core.patient.deactivated.v1, curaos.core.patient.registered.v1, curaos.core.patient.updated.v1]
  consumes: [curaos.core.audit.event.v1]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/patient-core-service/CONTEXT.md
  requirements: ai/curaos/backend/services/patient-core-service/Requirements.md
  decisions: ai/curaos/docs/m7-user-decisions.md
---

# patient-core-service - Agent Contract

> Neutral primitives for patient (patient demographics). Domain overlay:
> `healthstack`. M7-S2 closed out 2026-05-27.

## Mission

Provide vertical-agnostic patient primitives reused by
`personal-patient-service`, `business-patient-service`, and
`healthstack-patient-service`. Owns canonical patient ID + party FK + MRN
+ tenant routing. **Does NOT own any PHI** - PHI lives in
`healthstack.patients` overlay.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test` (or `bun test --coverage`)
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0
- Turbo: `bunx turbo run typecheck test --filter=@curaos/patient-core-service`

## Judgment Boundaries

- NEVER persist PHI/PII/clinical data in this neutral layer - overlay scope
- NEVER import from any `healthstack*` package - dep-cruiser CI guards this (M7-S8)
- NEVER bypass the outbox - every mutation enqueues an event in the same transaction
- NEVER push to `main` without PR review
- NEVER edit migration files post-merge
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug
- ALWAYS verify the audit envelope is PHI-free (Zod superRefine catches obvious patterns at boundary)

## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: core
related:
  audit-sdk: backend/packages/audit-sdk
  tenancy: backend/packages/tenancy
overlay_consumers:
  - healthstack-patient-service  (M7-S3 - PHI columns + patients_full pgView)
  - personal-patient-service
  - business-patient-service
event_consumers:
  - audit-core-service (7y retention)
  - billing-core-service (downstream of registered.v1)
  - scheduling-core-service (downstream of registered.v1)
notable:
  ai/: agent docs mirror - no code here
binding_decisions:
  - ai/curaos/docs/m7-user-decisions.md D1 (schema)
  - ai/curaos/docs/m7-user-decisions.md D2 (topics)
  - ai/curaos/docs/m7-user-decisions.md D5 (audit envelope)
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier)
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)
- hipaa-auditor: PHI boundary + audit-chain review (opus tier)
