---
name: business-docs-service
description: B2B document workflow overlay - template library, approval routing, counterparty delivery, document rooms.
tags: [service, business]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - bun
  - typespec
  - temporal-client
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
  adr: ai/curaos/docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: nodejs
---

# business-docs-service

B2B document workflow overlay on document-core-service. Owns template metadata and approval workflows; delegates bytes and signing to core services.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.2

## Agent operating rules (module-local)

- No raw file bytes in this service - all document storage via document-core-service.
- Temporal workflows via `@curaos/workflow-client` only - no worker registration here.
- Counterparty delivery URL TTL: 48h default; configurable per tenant between 1h and 7d.
- Document room participants set by room creator only; Cerbos enforces viewer/admin split.
