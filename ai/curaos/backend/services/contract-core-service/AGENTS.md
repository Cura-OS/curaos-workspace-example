---
name: contract-core-service
description: "Neutral Contract, ContractLine, Renewal, and ContractParty service."
tags: [service, core, neutral, contracts]
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

# contract-core-service

Neutral contract lifecycle service. E-sign remains a reference to esign-core.

## Mission

Own neutral contract lifecycle primitives for reusable contract workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/contract-core-service typecheck`
- Test: `bun run --filter @curaos/contract-core-service test`
- Build: `bun run --filter @curaos/contract-core-service build`

## Judgment Boundaries

- Do not rebuild e-sign in this service.
- Do not edit migrations after merge.
- Do not persist vertical-only protected records in neutral storage.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing contracts or storage.
- Keep migrations forward-only and verified on a fresh database.

## Commands

```bash
bun run --filter @curaos/contract-core-service typecheck
bun run --filter @curaos/contract-core-service test
bun run --filter @curaos/contract-core-service build
```
