---
name: tasks-core-service
description: Neutral task primitives - status machine, dependencies, recurrence, FHIR R4 Task alignment via event bridge. Foundation for personal-tasks-service and healthstack-careplans-service.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - bun-test
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

# tasks-core-service

Neutral task primitives for CuraOS. ADR-0203 §4.4.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules apply.
Then read [CONTEXT.md](CONTEXT.md) and [Requirements.md](Requirements.md) for module-local intent.

## Quick rules

- Stack is NestJS/TS + PG17 + Valkey. Do not propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- All recurrence via `@curaos/recurrence`. No inline rrule.js in service code.
- Status machine is server-authoritative - never relax transition rules client-side.
- FHIR write path is event-only - tasks-core never calls HAPI FHIR; healthstack-careplans-service owns that bridge.
- PHI zero - contextRef holds a reference string; PHI lives in HealthStack overlay.
- Do not add FHIR SDK as a direct dependency - defeats HealthStack isolation.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0203](../../../docs/adr/0203-cluster-calendar-scheduling-tasks-events.md)
