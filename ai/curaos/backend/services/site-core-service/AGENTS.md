---
name: site-core-service
description: Physical-location primitives - structured site records, PostGIS geometry, FHIR R4 Location interop, site hierarchy (partOf). NestJS TypeScript, PG17/PostGIS. ADR-0206. (NOT website builder - see CuraOS Builder.)
tags: [service, core]
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

# site-core-service

Source of truth for addressable physical locations. Site records (address, geocoordinate, polygon, type, hierarchy), FHIR R4 Location interop, spatial queries (via geo-core). No domain-specific logic. NOT a website/app builder service.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Key constraint:** No spatial engine here - delegate to `geospatial-core-service`. No FHIR library - delegate to `conversion-core-service`.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, design decisions, FHIR mode, commands
- [Requirements](Requirements.md) - capabilities, API, events, Done criteria
