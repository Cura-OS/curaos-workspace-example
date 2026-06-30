---
name: commerce-core-service
description: Foundation commerce engine (Medusa.js v2, NestJS) - catalog, cart, checkout, pricing, promotions, tax, fulfillment, payment gateway abstraction for CuraOS.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - biome
  - temporal
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  readme: README.md
  adr: ai/curaos/docs/adr/
engine: medusa-v2
---

# commerce-core-service

Foundation commerce engine for CuraOS. Medusa.js v2 (MIT) embedded as NestJS module library. Provides catalog, cart, checkout, pricing, promotions, tax, fulfillment, and payment gateway abstraction reused by all commerce overlays and HealthStack supply chain.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules. This file holds module-local intent only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, provider wiring, event flows, agent rules
- [Requirements](Requirements.md) - capabilities, provider map, event topics, DoD
- [ADR-0202](../../../docs/adr/0202-cluster-commerce-sales-procurement-inventory.md) - canonical commerce cluster spec

## Toolchain Registry

```bash
bun install
bun test                    # unit tests
bun test:integration        # real PG17 + Kafka (never mock infra)
bun run lint                # Biome (no Prettier/ESLint)
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Omit RLS guard on any query - every query passes tenant schema through MikroORM context.
- Store monetary values as floats - integer minor units + ISO 4217 code only.
- Enable payment features without the `payments-spec-ready` feature flag (Unleash) - see CONTEXT.md.
- Cross-tenant data access - OQ-06 integration test must confirm zero leakage before first release.
- Use Prettier or ESLint - Biome only.

**ASK:**
- Any new provider interface addition or capability removal from an existing provider.
- Changes to Medusa module adoption order (Core module list in Requirements.md).

**ALWAYS:**
- Read `Requirements.md` before any implementation task.
- Run `ctx7 medusajs` before writing Medusa v2 module integration code.
- Implement `CuraOSProvider<TConfig>` (ADR-0154) for all swappable integrations.
- Run `bun run ci` before reporting done.
