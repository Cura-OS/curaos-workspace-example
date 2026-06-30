---
name: geospatial-core-service
description: Spatial primitive backbone - PostGIS 3.5/PG17, Nominatim geocoding, GraphHopper/OSRM routing, PMTiles tile serving. NestJS TypeScript. ADR-0206.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), K8s
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

# geospatial-core-service

Spatial primitive backbone for all geospatial-aware services. Provides geocoding, routing, spatial queries, and PMTiles tile serving. No vertical domain logic.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first (charter, NFRs, operating rules). This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot. ADR-0206 mandates NestJS for all 10 cluster services.

**Do not** import overlay modules (fleet, tracking, site, HealthStack). Overlays import `GeospatialCoreModule`.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, tooling, design decisions, commands
- [Requirements](Requirements.md) - capabilities, API surface, events, Done criteria
