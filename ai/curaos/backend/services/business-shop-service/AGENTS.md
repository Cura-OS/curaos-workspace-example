---
name: business-shop-service
description: B2B/B2C storefront overlay (NestJS) on commerce-core-service (Medusa v2). Multi-channel, B2B account hierarchy, wholesale, POS. Tenant config + orchestration only.
tags: [service, business]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal
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
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  readme: README.md
---

# business-shop-service

B2B/B2C storefront overlay on commerce-core-service (Medusa v2). Owns tenant config, B2B account hierarchy, multi-channel setup, wholesale (MOQ, net terms, buyer PO intake), and web-based POS. All catalog/cart/checkout/pricing/fulfillment via commerce-core APIs.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules. This file holds module-local intent only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, event flows, agent rules
- [Requirements](Requirements.md) - capabilities, integrations, DoD

## Key constraints

- Thin orchestration layer only. Commerce primitives (catalog, cart, pricing) live in commerce-core-service.
- B2B approval flows via Temporal - no direct DB state mutation.
- Upgrade path from personal-shop-service requires data migration script.
