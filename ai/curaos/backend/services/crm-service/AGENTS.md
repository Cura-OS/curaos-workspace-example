---
name: crm-service
description: CuraOS-native CRM - leads, contacts, opportunities, configurable pipelines. No AGPL/GPL import.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - typespec
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  adr: ai/curaos/docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: nodejs
---

# crm-service

CuraOS-native CRM module. Party-service owns person identity; crm-service owns CRM-specific attributes and pipeline mechanics.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint (hard):** EspoCRM (GPLv3), SuiteCRM/Twenty (AGPL) are rejected. Never import them. CI SBOM gates this.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, dependency graph, constraints
- [Requirements](Requirements.md) - entities, pipeline, API, events, DoD
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.6

## Toolchain Registry

```bash
bun install
bun test                    # unit tests
bun test:integration        # real PG17 + Valkey
bun run lint                # Biome / TypeSpec lint
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Store name, email, or phone in crm-service PG - reference party-service UUID only. Denormalize to Valkey cache with TTL + event invalidation.
- Hardcode pipeline stages in source - stages are tenant data (jsonb array), mutable via API.
- Enable `crm_ai_scoring` by default - feature flag only.
- Add a dependency without SBOM check (no AGPL/GPL) - propose + confirm first.

**ALWAYS:**
- Emit audit entry on every opportunity stage change via `@curaos/audit` interceptor.
- Run `bun run ci` before reporting done.
