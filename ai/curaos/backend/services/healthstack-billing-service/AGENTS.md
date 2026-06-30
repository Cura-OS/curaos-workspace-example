---
name: healthstack-billing-service
description: HealthStack billing overlay service for claims, invoices, copay estimates, and payment capture.
tags: [service, healthstack, billing]
language: typescript
framework: nestjs
infrastructure: PostgreSQL, Redpanda, Kubernetes
tooling:
  - bun
  - turborepo
  - drizzle
  - typespec
apis:
  - /api/v1/healthstack-billing
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
---

# healthstack-billing-service

## Mission

This service sits inside the HealthStack boundary. Preserve PHI safeguards, consent checks, tenant isolation, generated service lock parity, and gateway route contracts.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci`

## Judgment Boundaries

- Keep PHI inside HealthStack-owned schemas and contracts.
- Preserve generated service lock parity and gateway route contracts.
- Fix generator, SDK, or contract owners before local service hot patches.
