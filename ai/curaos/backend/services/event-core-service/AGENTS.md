---
name: event-core-service
description: Public/community event primitives - ticketed gatherings, registration, RSVP, capacity, waitlist, recurring events. NOT Kafka infrastructure. NOT calendar VEVENT. See ADR-0203 §1.1.
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
  produces: [curaos.core.event.cancelled.v1, curaos.core.event.published.v1]
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

# event-core-service

Public/community event domain service for CuraOS. ADR-0203 §4.6.

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
bun test                    # unit tests (bun test, Jest-compat)
bun test:integration        # real PG17 + Valkey
bun run lint                # oxlint + Biome (lint+format) per [[curaos-quality-gates-rule]]
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Propose Spring Boot or Kotlin - superseded by ADR-0100/ADR-0203.
- Add Kafka/outbox infrastructure, topic provisioning, or schema registry features - that is ADR-0102 territory.
- Add VEVENT or free/busy - owned by calendar-core-service.
- Make calendar projection synchronously required - one-way, eventually consistent.
- Store PHI - partyId references only.

**ALWAYS:**
- Run idempotency key check before any write on the registration endpoint - non-negotiable.
- Run `bun run ci` before reporting done.
