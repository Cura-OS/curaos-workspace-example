---
name: orders-sdk
description: "Generated REST SDK package for orders service contracts."
tags: [backend, package, sdk, orders, contracts]
language: TypeScript
framework: Bun package
infrastructure: OpenAPI 3.1, AsyncAPI
tooling: Bun, TypeScript, @hey-api/openapi-ts
apis: [orders-service]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/backend/packages/orders-sdk/CONTEXT.md
  requirements: ai/curaos/backend/packages/orders-sdk/Requirements.md
---

# AGENTS.md - @curaos/orders-sdk

## Mission

Own the generated TypeScript SDK for orders REST and event contracts. Keep output aligned to `orders-service`; do not hand-author API clients here.

## Toolchain Registry

- Generate: `bun run --filter @curaos/orders-sdk generate`
- Test: `bun run --filter @curaos/orders-sdk test`
- Typecheck: `bun run --filter @curaos/orders-sdk typecheck`
- Build: `bun run --filter @curaos/orders-sdk build`

## Judgment Boundaries

- Source contracts live under `backend/services/orders-service/specs/`.
- Drift tests fail closed unless the explicit local CI missing-service override is set.
- Order lifecycle policy stays in service contracts, not generated package glue.
