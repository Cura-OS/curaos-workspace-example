---
name: settings-service
description: Canonical tenant + user settings store, feature flags (Unleash), and OPA policy hooks for CuraOS.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API)
tooling:
  - bun
  - drizzle
  - vitest
  - typespec
  - asyncapi
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
  context: CONTEXT.md
  requirements: Requirements.md
runtime: bun
cluster: ADR-0201-platform-shared-services
---

# settings-service

Canonical settings store and feature flag engine - CuraOS Platform Shared Services cluster (ADR-0201).

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

Stack: NestJS 11 / TypeScript / Fastify / Drizzle / PostgreSQL 17 / Valkey 8 / Unleash (local) / OPA-WASM / Kafka 4 / NATS JetStream / OpenBao.
Supersedes: Kotlin/Spring Boot stub (archived).

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, module structure, behavioral rules, env vars, commands
- [Requirements](Requirements.md) - mission, data model, provider abstraction, events, API, DoD

## Quick-start rules for agents

1. Read CONTEXT.md before touching any file in this module.
2. Flag provider interface: `FeatureFlagProvider` under `src/flags/providers/`. Never call flag SDK directly in service logic.
3. Resolution order is immutable: platform default → tenant override → user override. Never skip levels.
4. OPA guard (`src/policy/opa.guard.ts`) applies to all `policy_protected=true` key writes. Do not bypass.
5. `settings_audit` is append-only. Application code must never UPDATE or DELETE audit rows.
6. Valkey cache TTL is 60 s. NATS invalidation is the push path - both must be wired.
7. Other services call settings-service (or Valkey) for flag resolution - they must not embed flag SDKs directly.
8. All Kafka consumers must have a dead-letter topic configured.
9. Secrets via OpenBao only. No flag SDK keys in code or manifests.
10. TypeSpec spec (`specs/settings.tsp`) is the source of truth for REST API - update spec before controller.
