---
name: encounter-sdk
description: "Generated REST SDK package for encounter service contracts."
tags: [backend, package, sdk, encounter, contracts]
language: TypeScript
framework: Bun package
infrastructure: OpenAPI 3.1, AsyncAPI
tooling: Bun, TypeScript, @hey-api/openapi-ts
apis: [encounter-service]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/backend/packages/encounter-sdk/CONTEXT.md
  requirements: ai/curaos/backend/packages/encounter-sdk/Requirements.md
---

# AGENTS.md - @curaos/encounter-sdk

## Mission

Own the generated TypeScript SDK for encounter REST and event contracts. Keep output aligned to `encounter-service`; do not hand-author API clients here.

## Toolchain Registry

- Generate: `bun run --filter @curaos/encounter-sdk generate`
- Test: `bun run --filter @curaos/encounter-sdk test`
- Typecheck: `bun run --filter @curaos/encounter-sdk typecheck`
- Build: `bun run --filter @curaos/encounter-sdk build`

## Judgment Boundaries

- Source contracts live under `backend/services/encounter-service/specs/`.
- Drift tests fail closed unless the explicit local CI missing-service override is set.
- Clinical data semantics stay in service contracts, not generated package glue.
