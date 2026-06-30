---
name: personal-tracking-service
description: Personal location/activity log - location ping ingestion, geofence alerts, health-platform OAuth (HealthKit/Google Health), 90-day retention. PostGIS BRIN time-series. NestJS TypeScript. ADR-0206.
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

# personal-tracking-service

Individual location and activity log. Privacy-first; data owned by user. Geofence evaluation via geo-core. Fleet-service consumes driver location events. HealthStack home-care subscribes for proximity alerts.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Privacy invariant:** All rows tagged `user_id`; Cerbos blocks cross-user read. No location data in shared geo-core tables.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, BRIN index, retention, HealthStack wiring, commands
- [Requirements](Requirements.md) - capabilities, events, privacy, Done criteria
