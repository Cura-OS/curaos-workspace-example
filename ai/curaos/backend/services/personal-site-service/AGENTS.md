---
name: personal-site-service
description: Personal property records - home/work/place address book, FK to site-core-service, HealthStack home-care consent integration. NestJS TypeScript. ADR-0206. (NOT personal website builder.)
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API)
tooling:
  - bun
  - vitest
  - eslint
  - prettier
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
runtime: node22
adr: 0206
---

# personal-site-service

Individual property records (home, work, personal places). FK overlay on `site-core-service`. Emits home-address events for HealthStack home-care. User-owned data; Cerbos enforces no cross-user access.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Privacy invariant:** Patient home coordinates stored here (personal tier), not in geo-core shared tables. Clinician access requires OpenFGA consent-relationship grant (ADR-0120 ReBAC layer).

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, HealthStack wiring, commands
- [Requirements](Requirements.md) - capabilities, events, privacy, Done criteria
