---
name: scheduling-sdk
description: "Generated REST SDK package for scheduling service contracts."
tags: [backend, package, sdk, scheduling, contracts]
language: TypeScript
framework: Bun package
infrastructure: OpenAPI 3.1, AsyncAPI
tooling: Bun, TypeScript, @hey-api/openapi-ts
apis: [scheduling-service]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/backend/packages/scheduling-sdk/CONTEXT.md
  requirements: ai/curaos/backend/packages/scheduling-sdk/Requirements.md
---

# AGENTS.md - @curaos/scheduling-sdk

## Mission

Own the generated TypeScript SDK for scheduling REST and event contracts. Keep output aligned to `scheduling-service`; do not hand-author API clients here.

## Toolchain Registry

- Generate: `bun run --filter @curaos/scheduling-sdk generate`
- Test: `bun run --filter @curaos/scheduling-sdk test`
- Typecheck: `bun run --filter @curaos/scheduling-sdk typecheck`
- Build: `bun run --filter @curaos/scheduling-sdk build`

## Judgment Boundaries

- Source contracts live under `backend/services/scheduling-service/specs/`.
- Drift tests fail closed unless the explicit local CI missing-service override is set.
- Scheduling domain rules stay in service contracts, not generated package glue.
