---
name: personal-tasks-service
description: Personal task management UX - inbox, projects, labels, recurring tasks, NLP date input, VTODO CalDAV export. Presentation layer delegating task CRUD to tasks-core-service.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - bun test
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

# personal-tasks-service

Personal task UX for CuraOS. ADR-0203 §4.5.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules apply.
Then read [CONTEXT.md](CONTEXT.md) and [Requirements.md](Requirements.md) for module-local intent.

## Quick rules

- Stack is NestJS/TS + PG17 + Valkey. Do not propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- This is a UX layer - all task CRUD delegates to tasks-core-service. Never write to tasks-core PG tables directly.
- Radicale is GPL-3.0 - sidecar only, never import into NestJS code.
- chrono-node for NLP dates - fall back to explicit date input on parse failure; no silent misparse.
- PHI zero.
- Do not add FHIR, status machine, or dependency logic here - that belongs in tasks-core-service.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0203](../../../docs/adr/0203-cluster-calendar-scheduling-tasks-events.md)
