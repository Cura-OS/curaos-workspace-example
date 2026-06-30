---
name: personal-donation-service
description: Personal donation ledger - tax year summaries, deductibility tracking, CSV export for tax filing.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
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

# personal-donation-service

Personal donation ledger overlay on donation-core-service. Read-only categorization + tax record keeping.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.9

## Agent operating rules (module-local)

- All queries scoped to `user_party_id = current_user.party_id` - never return other users' records.
- No campaign or grant management - strictly personal tax record keeping.
- Donation records originate in donation-core; only add categorization metadata here.
