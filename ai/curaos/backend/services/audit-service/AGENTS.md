---
name: audit-service
description: "CuraOS tamper-evident audit platform - NestJS/TypeScript 5.x. Sole consumer of curaos.audit.events. Hash-chained PG → ClickHouse → SeaweedFS WORM. HIPAA-critical."
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  runtime: bun
  package_manager: bun
  test_runner: vitest
apis:
  - REST /api/v1/audit
events:
  produces: [curaos.audit.events]
  consumes: [curaos.audit.events]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/audit-service/CONTEXT.md
  requirements: ai/curaos/backend/services/audit-service/Requirements.md
---

# AGENTS.md - audit-service

**Cluster:** ADR-0200 | **HIPAA-Critical:** ADR-0162 | **Core spec:** ADR-0157
**Last updated:** 2026-05-25

Cross-CLI agent contract. Per [[curaos-agents-md-schema-rule]] split pattern: sections live in `AGENTS-sections/` and load on-demand.

---

## Sections (load on-demand)

| § | Topic | File |
|---|---|---|
| 1 | Baseline rules (Sole consumer / Hash chain / Tenancy / WORM / Self-audit / HIPAA CI) | [AGENTS-sections/baseline.md](AGENTS-sections/baseline.md) |
| 2 | Codegen commands (ADR-0153 recipes) | [AGENTS-sections/codegen.md](AGENTS-sections/codegen.md) |
| 3 | File ownership (gen vs hand) | [AGENTS-sections/file-ownership.md](AGENTS-sections/file-ownership.md) |
| 4 | ESLint rules | [AGENTS-sections/eslint.md](AGENTS-sections/eslint.md) |
| 5 | Test + build commands | [AGENTS-sections/commands.md](AGENTS-sections/commands.md) |
| 6 | Key dependencies | [AGENTS-sections/dependencies.md](AGENTS-sections/dependencies.md) |
| 7 | Service ports + sidecars | [AGENTS-sections/ports.md](AGENTS-sections/ports.md) |
| 8 | PR + commit conventions | [AGENTS-sections/pr-conventions.md](AGENTS-sections/pr-conventions.md) |
| 9 | Forbidden actions | [AGENTS-sections/forbidden.md](AGENTS-sections/forbidden.md) |

---

## Companion documents

- [CONTEXT.md](CONTEXT.md) - integration map, ADR rationale, decisions
- [Requirements.md](Requirements.md) - full service spec

---

## Mission (1-line)

NestJS tamper-evident audit platform - sole consumer of `curaos.audit.events`. Hash-chained PG insert → ClickHouse warm tier → SeaweedFS WORM cold tier. HIPAA §164.312(c) critical; chain integrity gates all changes.

## Read order

1. Workspace `AGENTS.md` (rules + §15 rule index)
2. This file (frontmatter + TOC)
3. Relevant section files from §1-9 as task demands
4. `CONTEXT.md` if integration / rationale needed
