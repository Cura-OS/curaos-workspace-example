---
name: reports-service
description: On-demand and scheduled report generation - Gotenberg PDF, Superset embedded dashboards, per-tenant report library.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), Temporal
tooling:
  - bun
  - drizzle
  - vitest
  - typespec
  - asyncapi
apis:
  - REST /api/v1/security/guest_token
events:
  produces: [curaos.reports.definition.published.v1, curaos.reports.run.completed.v1]
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

# reports-service

On-demand and scheduled report generation - CuraOS Platform Shared Services cluster (ADR-0201).

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

Stack: NestJS 11 / TypeScript / Fastify / Drizzle / PostgreSQL 17 / Gotenberg 8 (local) / Apache Superset (local) / Nunjucks / BullMQ / Temporal (long runs) / Kafka 4 / OpenBao. (ORM: Drizzle per [[curaos-orm-rule]]; reports-service is in the Kysely analytics/escape-hatch tier - see CONTEXT.md §Stack.)
Supersedes: Kotlin/Spring Boot stub (archived).

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, module structure, behavioral rules, env vars, commands
- [Requirements](Requirements.md) - mission, data model, provider abstraction, pipeline, events, API, DoD

## Quick-start rules for agents

1. Read CONTEXT.md before touching any file in this module.
2. Provider interfaces: `PDFRenderProvider`, `AnalyticsProvider` under `src/providers/`. Never call Gotenberg or Superset directly outside a provider implementation.
3. Data pull contract: report definitions reference TypeSpec operation IDs. Use `client-factory.service.ts` typed clients. No direct DB access into other service schemas - ever.
4. PDF pipeline is strictly sequential (see CONTEXT.md §Key Behavioral Rules). Do not parallelize steps.
5. Superset guest token must always include tenant RLS filter. Never return an unscoped token.
6. PHI boundary: HealthStack reports use HealthStack-service typed clients only. Raw clinical data must not land in `report_runs` table.
7. Run routing: ≤ 5 min → BullMQ; > 5 min → Temporal. Routing based on `report_definitions.estimated_duration_seconds`.
8. All Kafka consumers must have a dead-letter topic configured.
9. Secrets via OpenBao only. No Superset or storage credentials in code or manifests.
10. TypeSpec spec (`specs/reports.tsp`) is the source of truth for REST API - update spec before controller.
