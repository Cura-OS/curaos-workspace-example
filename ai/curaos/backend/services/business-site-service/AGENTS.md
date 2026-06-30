---
name: business-site-service
description: B2B multi-location physical-site management overlay - location groups, chain metadata, staff/inventory allocation per site, MapLibre map view. NestJS TypeScript. ADR-0206. (NOT website builder.)
tags: [service, business]
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
  readme: README.md
runtime: node22
adr: 0206
---

# business-site-service

B2B multi-location management overlay on `site-core-service`. Hospital networks, retail chains, franchise location groups. MapLibre map view, cross-location analytics, staff/inventory allocation per site.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Key constraint:** Site records authoritative in `site-core-service`. This service adds chain metadata FK only - no data duplication.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, design decisions, commands
- [Requirements](Requirements.md) - capabilities, events, Done criteria
