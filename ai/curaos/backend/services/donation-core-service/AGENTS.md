---
name: donation-core-service
description: Neutral donation primitives - campaigns, recurring schedules, payment-ref integration.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
tooling:
  - bun
  - typespec
  - bullmq
apis: []
events:
  produces: [curaos.core.commerce.order.paid.v1]
  consumes: [curaos.core.donation.receipt.issued.v1, curaos.core.donation.received.v1, curaos.core.donation.recurring.due.v1]
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

# donation-core-service

Neutral donation infrastructure. Shared by business-donation-service and personal-donation-service. No payment credentials stored.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.7

## Agent operating rules (module-local)

- Never store payment credentials - store only `payment_ref` UUID from commerce-core-service (Payment provider).
- `donor_party_id` is a party-service UUID reference - no name or email in donation-core PG.
- Recurring schedule uses BullMQ delayed jobs - no cron strings in code.
- Compute `next_due_at` from frequency at schedule creation time; update on each fire.
