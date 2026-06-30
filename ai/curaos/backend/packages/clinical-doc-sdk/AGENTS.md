---
name: clinical-doc-sdk
description: "Generated REST SDK package for clinical document service contracts."
tags: [backend, package, sdk, clinical-doc, contracts]
language: TypeScript
framework: Bun package
infrastructure: OpenAPI 3.1, AsyncAPI
tooling: Bun, TypeScript, @hey-api/openapi-ts
apis: [clinical-doc-service]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/backend/packages/clinical-doc-sdk/CONTEXT.md
  requirements: ai/curaos/backend/packages/clinical-doc-sdk/Requirements.md
---

# AGENTS.md - @curaos/clinical-doc-sdk

## Mission

Own the generated TypeScript SDK for clinical document REST and event contracts. Keep output aligned to `clinical-doc-service`; do not hand-author API clients here.

## Toolchain Registry

- Generate: `bun run --filter @curaos/clinical-doc-sdk generate`
- Test: `bun run --filter @curaos/clinical-doc-sdk test`
- Typecheck: `bun run --filter @curaos/clinical-doc-sdk typecheck`
- Build: `bun run --filter @curaos/clinical-doc-sdk build`

## Judgment Boundaries

- Source contracts live under `backend/services/clinical-doc-service/specs/`.
- Drift tests fail closed unless the explicit local CI missing-service override is set.
- PHI policy stays in HealthStack service contracts, not generated package glue.
