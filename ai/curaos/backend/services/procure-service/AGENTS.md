---
name: procure-service
description: Parked procurement overlay placeholder. Neutral procure-to-pay ownership stays in procurement-core-service until a scoped overlay issue promotes this module.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - bun
  - biome
  - temporal
apis: []
events:
  produces: []
  consumes: [curaos.core.procurement.*.v1]
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
adrs:
  - 0202
  - 0150
  - 0154
---

# procure-service

Parked procurement overlay placeholder. `procurement-core-service` owns neutral procure-to-pay behavior, events, storage, and optional ERPNext mirror seams. This module must not duplicate neutral procurement logic unless a future issue promotes a specific overlay role.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules. This file holds module-local intent only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, event flows, ERPNext bridge wiring, agent rules
- [Requirements](Requirements.md) - capabilities, provider map, event topics, HealthStack extension, DoD

## Key constraints

- Do not implement neutral procure-to-pay behavior here; extend `procurement-core-service` first.
- No submodule rename, removal, or deinit without same-turn explicit confirmation.
- If promoted, this service consumes `curaos.core.procurement.*.v1` and stores overlay-only fields.
- Optional ERPNext bridge work belongs in `procurement-core-service` unless a future issue proves overlay ownership.
