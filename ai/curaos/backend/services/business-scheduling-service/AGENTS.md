---
name: business-scheduling-service
description: Organization-level resource scheduling - schedule templates, slot generation, booking, waitlists, no-show handling. HealthStack extension point via event bridge to healthstack-clinical-scheduling-service.
tags: [service, business]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - jest
  - eslint
  - docker-compose
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
runtime: bun
adr: 0203
cluster: calendar-scheduling-tasks-events
---

# business-scheduling-service

Organization scheduling for CuraOS. ADR-0203 §4.2.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules apply.
Then read [CONTEXT.md](CONTEXT.md) and [Requirements.md](Requirements.md) for module-local intent.

## Quick rules

- Stack is NestJS/TS + PG17 + Valkey. Do not propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- HealthStack extension is event-driven only - this service never calls HAPI FHIR.
- Slot booking uses optimistic lock (`UPDATE ... WHERE status = 'FREE' RETURNING *`) - do not introduce advisory locks.
- PHI zero - partyId references only; no patient or clinical data in PG tables.
- `scheduling.slot.booked` Kafka schema is a cross-service contract - version changes require migration plan.
- Cal.com AGPL: never bundle or embed; BYO sidecar interface only.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0203](../../../docs/adr/0203-cluster-calendar-scheduling-tasks-events.md)
- [ADR-0115](../../../docs/adr/0115-healthstack-overlays.md)
