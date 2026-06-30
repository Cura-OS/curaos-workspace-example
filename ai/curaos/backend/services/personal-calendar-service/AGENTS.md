---
name: personal-calendar-service
description: Individual user calendar UX + sync aggregation. Unifies CuraOS native + Google/Apple/Outlook calendars. CalDAV via Radicale sidecar (GPL-isolated). No calendar primitives ownership.
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

# personal-calendar-service

Individual calendar UX and sync for CuraOS. ADR-0203 §4.3.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules apply.
Then read [CONTEXT.md](CONTEXT.md) and [Requirements.md](Requirements.md) for module-local intent.

## Quick rules

- Stack is NestJS/TS + PG17 + Valkey. Do not propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- Radicale is GPL-3.0 - sidecar only, never import into NestJS code.
- OAuth tokens (Google/MS) stored in OpenBao (ADR-0108) - never Valkey, never PG plaintext.
- Conflict resolution must surface to user on SEQUENCE disagreement - no silent last-write-wins for detected conflicts.
- Calendar primitives (VEVENT, rrule, free/busy) belong in calendar-core-service - do not duplicate here.
- PHI zero.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0203](../../../docs/adr/0203-cluster-calendar-scheduling-tasks-events.md)
