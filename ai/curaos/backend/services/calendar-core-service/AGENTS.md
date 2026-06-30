---
name: calendar-core-service
description: Canonical calendar primitives - VCALENDAR/VEVENT store, recurrence, free/busy, iCal import/export. Foundation of the ADR-0203 cluster.
tags: [service, core]
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
  adr: ai/curaos/docs/adr/
runtime: bun
adr: 0203
cluster: calendar-scheduling-tasks-events
---

# calendar-core-service

Canonical calendar primitives for CuraOS. ADR-0203 §4.1.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first - charter, NFRs, contracts, operating rules apply.
Then read [CONTEXT.md](CONTEXT.md) and [Requirements.md](Requirements.md) for module-local intent.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0203](../../../docs/adr/0203-cluster-calendar-scheduling-tasks-events.md)

## Toolchain Registry

```bash
bun install
bun test                    # unit tests (Jest)
bun test:integration        # real PG17 + Valkey
bun run lint                # ESLint
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- Call rrule.js inline in service code - all recurrence through `@curaos/recurrence`.
- Store PHI - reject and route to HealthStack overlay.
- Change the free/busy endpoint response shape without a versioned migration plan (critical dependency for business-scheduling-service).

**ASK:**
- Datetimes format changes - always UTC in PG; TZID string always preserved alongside.

**ALWAYS:**
- Use ical.js for I/O only; `@curaos/recurrence` for expansion.
- Run `bun run ci` before reporting done.
