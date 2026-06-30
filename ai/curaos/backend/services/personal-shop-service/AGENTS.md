---
name: personal-shop-service
description: Lightweight solo-seller / creator storefront overlay (NestJS) on commerce-core-service (Medusa v2). Digital downloads, subscriptions, tip jars. < 30 s provisioning.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
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
---

# personal-shop-service

Lightweight solo-seller / individual creator storefront overlay on commerce-core-service (Medusa v2). Physical goods, digital downloads (SeaweedFS signed URLs), subscriptions (Temporal dunning workflow), tip jars. Target: < 30 s from signup to live shop. No B2B hierarchy, no multi-warehouse, no multi-currency at launch.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules. This file holds module-local intent only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, digital delivery, subscription billing, agent rules
- [Requirements](Requirements.md) - capabilities, constraints, DoD

## Key constraints

- Commerce primitives owned by commerce-core-service. No duplication.
- Digital download tokens must be expiry-gated (SeaweedFS signed URLs).
- Subscription state transitions via Temporal workflow only.
- No multi-currency until OQ-07 resolved.
- Upgrade path to business-shop-service: data export format required.
