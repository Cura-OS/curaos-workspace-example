---
name: business-esign-service
description: HIPAA-grade multi-signer envelope orchestration - sequential/parallel workflows, counterparty mgmt, BAA enforcement.
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

# business-esign-service

Multi-signer envelope orchestration. Delegates signature primitives to esign-core-service; orchestrates ceremonies via Temporal.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.4

## Agent operating rules (module-local)

- HIPAA BAA check is a hard gate - never send envelope with `hipaa_baa_required = true` without confirmed BAA.
- No signature logic in this service. All crypto operations go through esign-core-service.
- Temporal workflow client only - do not register Temporal workers here.
- Envelope void is terminal - no status can follow `voided`. Compensation workflow handles notifications.
- External signer OTP tokens must have explicit TTL (default 72h); reject expired tokens with `401`.
- Audit every envelope status transition via `@curaos/audit` interceptor.
