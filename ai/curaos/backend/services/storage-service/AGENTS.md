---
name: storage-service
description: Blob/object storage management for CuraOS - presigned URLs, virus scan, WORM retention, lifecycle tiers.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), SeaweedFS S3
tooling:
  - bun
  - drizzle
  - vitest
  - typespec
  - asyncapi
apis: []
events:
  produces: [curaos.storage.object.uploaded.v1]
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  context: CONTEXT.md
  requirements: Requirements.md
runtime: bun
cluster: ADR-0201-platform-shared-services
---

# storage-service

Blob and object storage management - CuraOS Platform Shared Services cluster (ADR-0201).

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

Stack: NestJS 11 / TypeScript / Fastify / Drizzle / PostgreSQL 17 / SeaweedFS (local) / ClamAV (local) / Kafka 4 / BullMQ / OpenBao.
Supersedes: Kotlin/Spring Boot stub (archived).

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, module structure, behavioral rules, env vars, commands
- [Requirements](Requirements.md) - mission, data model, provider abstraction, events, API, DoD

## Quick-start rules for agents

1. Read CONTEXT.md before touching any file in this module.
2. Provider interfaces: `StorageProvider`, `VirusScanProvider`, `ColdTierProvider` under `src/providers/`. Never add storage logic outside a provider implementation.
3. WORM enforcement is non-negotiable: DELETE on locked objects returns 403. Test this path explicitly.
4. Objects with `scan_status != 'clean'` must not be downloadable. Enforce in `objects.service.ts`.
5. Checksum verification required after every presigned upload completion.
6. All Kafka consumers must have a dead-letter topic configured.
7. Secrets via OpenBao only. No S3 credentials in code or manifests.
8. TypeSpec spec (`specs/storage.tsp`) is the source of truth for REST API - update spec before controller.
