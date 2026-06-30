---
name: terminology-sdk
description: "Generated REST SDK package for terminology service contracts."
tags: [backend, package, sdk, terminology, contracts]
language: TypeScript
framework: Bun package
infrastructure: OpenAPI 3.1, AsyncAPI
tooling: Bun, TypeScript, @hey-api/openapi-ts
apis: [terminology-service]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/backend/packages/terminology-sdk/CONTEXT.md
  requirements: ai/curaos/backend/packages/terminology-sdk/Requirements.md
---

# AGENTS.md - @curaos/terminology-sdk

## Mission

Own the generated TypeScript SDK for terminology REST and event contracts. Keep output aligned to `terminology-service`; do not hand-author API clients here.

## Toolchain Registry

- Generate: `bun run --filter @curaos/terminology-sdk generate`
- Test: `bun run --filter @curaos/terminology-sdk test`
- Typecheck: `bun run --filter @curaos/terminology-sdk typecheck`
- Build: `bun run --filter @curaos/terminology-sdk build`

## Judgment Boundaries

- Source contracts live under `backend/services/terminology-service/specs/`.
- Drift tests fail closed unless the explicit local CI missing-service override is set.
- Terminology domain rules stay in service contracts, not generated package glue.
