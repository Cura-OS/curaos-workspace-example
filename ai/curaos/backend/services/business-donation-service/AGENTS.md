---
name: business-donation-service
description: Nonprofit donor management - donor CRM, recurring donations, grant tracking, tax receipt generation.
tags: [service, business]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), Temporal
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

# business-donation-service

Nonprofit donor management overlay on donation-core-service. Adds donor CRM, grant tracking, and tax receipt PDF generation.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.8

## Agent operating rules (module-local)

- Use `pdf-lib` (MIT) for receipt PDF rendering - no AGPL PDF library.
- Donor entity references party-service UUID - no name/email in local PG.
- Receipt numbers are PG-sequence-generated per tenant - never application-layer sequential (race condition risk).
- Temporal grant-reporting workflow: client only, no worker registration here.
- OQ-5 (receipt localization) is tracked - implement US 501(c)(3) template first; leave jurisdiction hook for later.
