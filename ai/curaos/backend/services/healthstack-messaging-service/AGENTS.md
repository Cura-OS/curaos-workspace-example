---
name: healthstack-messaging-service
description: HealthStack secure clinical messaging service.
tags: [service, healthstack, messaging]
language: typescript
framework: nestjs
infrastructure: PostgreSQL, Redpanda, Kubernetes
tooling:
  - bun
  - turborepo
  - drizzle
  - typespec
apis:
  - /api/v1/healthstack-messaging
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
---

# healthstack-messaging-service

## Mission

This service owns secure HealthStack messaging surfaces. Preserve PHI safeguards, consent checks, tenant isolation, generated service lock parity, and gateway route contracts.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci`

## Judgment Boundaries

- Keep PHI inside HealthStack-owned schemas and contracts.
- Preserve generated service lock parity and gateway route contracts.
- Fix generator, SDK, or contract owners before local service hot patches.
