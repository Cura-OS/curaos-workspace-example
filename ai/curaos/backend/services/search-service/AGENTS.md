---
name: search-service
description: Cross-service full-text and hybrid BM25+vector search for CuraOS - CDC-fed OpenSearch indexer, per-tenant isolation, semantic reranking.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
tooling:
  - bun
  - drizzle
  - vitest
  - typespec
  - asyncapi
apis: []
events:
  produces: []
  consumes: [curaos.party.erasure.requested.v1]
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

# search-service

Cross-service full-text + hybrid BM25+vector search - CuraOS Platform Shared Services cluster (ADR-0201).

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

Stack: NestJS 11 / TypeScript / Fastify / Drizzle / PostgreSQL 17 / OpenSearch 2 (local) / Debezium 3 CDC / Kafka 4 / OpenBao. (ORM: Drizzle for service metadata per CONTEXT.md §Stack; search-service is in the Kysely analytics/escape-hatch tier per [[curaos-orm-rule]].)
Supersedes: Kotlin/Spring Boot stub (archived).

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, module structure, behavioral rules, env vars, commands
- [Requirements](Requirements.md) - mission, index architecture, provider abstraction, events, API, DoD

## Quick-start rules for agents

1. Read CONTEXT.md before touching any file in this module.
2. Provider interfaces: `SearchProvider`, `SemanticRerankProvider` under `src/providers/`. Never add search engine calls outside a provider implementation.
3. Tenant isolation is mandatory: every OpenSearch query must include `must: term: { tenant_id }` filter. No exceptions.
4. CDC consumer idempotency: use `{source_table}.{row_id}` as OpenSearch `_id` for upsert.
5. GDPR hard-delete: `DELETE /admin/indexes/{alias}/docs/{id}` must propagate across ALL tenant indexes for the party.
6. Reranking gate: `search.rerank.enabled` must be true (from settings-service) before accepting `rerank=true` param.
7. All Kafka consumers must have a dead-letter topic configured.
8. Secrets via OpenBao only.
9. TypeSpec spec (`specs/search.tsp`) is the source of truth for REST API - update spec before controller.
