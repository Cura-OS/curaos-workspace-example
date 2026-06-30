---
name: business-cases-service
description: Case management / service desk - ticket tracking, SLA enforcement, queue assignment, Temporal escalation.
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

# business-cases-service

CuraOS-native case management. SLA timers via Temporal; attachments via document-core. No BPMN engine.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.11

## Agent operating rules (module-local)

- SLA timers via Temporal workflow only - no `setTimeout`, `setInterval`, or cron in application code.
- Attachments via document-core `document_id` reference - no bytes in local PG.
- Internal comments (`is_internal = true`) are Cerbos-gated; never return them to reporter role.
- Assignment policy is a pluggable strategy (round_robin, manual, skill_based) - not hardcoded conditionals.
- Temporal workflow client only - no worker registration here.
