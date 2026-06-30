---
name: subscription-core-service
description: "Neutral Subscription and Plan service using shared recurrence cadence."
tags: [service, core, neutral, subscription]
language: typescript
framework: NestJS 11
infrastructure: PostgreSQL, Bun
tooling: Bun, Drizzle, Zod, Turborepo
apis: [TypeSpec]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
---

# subscription-core-service

Neutral subscription and plan service. Billing policy stays outside this core unless generic.

## Mission

Own neutral subscription and plan primitives for reusable recurring workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/subscription-core-service typecheck`
- Test: `bun run --filter @curaos/subscription-core-service test`
- Build: `bun run --filter @curaos/subscription-core-service build`

## Judgment Boundaries

- Do not move billing-specific policy into neutral core.
- Do not edit migrations after merge.
- Do not bypass recurrence primitives for cadence.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing contracts or storage.
- Keep migrations forward-only and verified on a fresh database.

## Commands

```bash
bun run --filter @curaos/subscription-core-service typecheck
bun run --filter @curaos/subscription-core-service test
bun run --filter @curaos/subscription-core-service build
```
