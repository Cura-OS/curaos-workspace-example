---
name: plugin-runtime-service
description: Runtime service for CuraOS plugin execution and lifecycle APIs.
tags: [service, neutral, plugins]
language: typescript
framework: nestjs
infrastructure: PostgreSQL, Kubernetes
tooling:
  - bun
  - turborepo
  - drizzle
  - typespec
apis:
  - /api/v1/plugins
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
---

# plugin-runtime-service

## Mission

This neutral service exposes plugin runtime lifecycle APIs. Keep sandbox boundaries, tenant isolation, generated service lock parity, and gateway route contracts intact.

## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci`

## Judgment Boundaries

- Keep plugin sandbox boundaries and tenant isolation intact.
- Preserve generated service lock parity and gateway route contracts.
- Fix generator, SDK, or contract owners before local service hot patches.
