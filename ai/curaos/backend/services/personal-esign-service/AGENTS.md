---
name: personal-esign-service
description: Lightweight personal e-signing UX - self-sign, countersignature requests, signing queue.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), Temporal
tooling:
  - bun
  - typespec
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

# personal-esign-service

Personal-tier e-sign overlay. Thin orchestration over esign-core-service - no HIPAA BAA, no multi-party workflow engine.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.5

## Agent operating rules (module-local)

- All queries scoped to `owner_party_id = current_user.party_id` - never return other users' documents.
- No direct crypto operations - delegate all signing to esign-core-service.
- No Temporal dependency - simple two-party flow only.
- No HIPAA-specific enforcement - that belongs to business-esign-service.
