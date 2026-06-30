---
name: org-service
description: "CuraOS neutral org structure service - NestJS/TypeScript 5.x. Org units, hierarchy (PG ltree), memberships, GDPR membership removal. No HealthStack imports."
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling: Bun
apis:
  - REST /api/v1/org
events:
  produces: [curaos.audit.events, curaos.org.membership.granted, curaos.org.membership.removed]
  consumes: [curaos.org.membership.granted, curaos.org.membership.revoked, curaos.org.unit.created]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/org-service/CONTEXT.md
  requirements: ai/curaos/backend/services/org-service/Requirements.md
runtime: bun
package_manager: bun
test_runner: vitest
---

# AGENTS.md - org-service

**Cluster:** ADR-0200 | **Runtime:** ADR-0100 | **Tenancy:** ADR-0155
**Last updated:** 2026-05-25

Cross-CLI agent contract. Per [[curaos-agents-md-schema-rule]] split pattern: sections live in `AGENTS-sections/` and load on-demand.

---

## Sections (load on-demand)

| § | Topic | File |
|---|---|---|
| 1 | Baseline rules (Neutrality / ltree / Tenancy / Audit / GDPR / OpenFGA contract) | [AGENTS-sections/baseline.md](AGENTS-sections/baseline.md) |
| 2 | Codegen commands (ADR-0153 recipes) | [AGENTS-sections/codegen.md](AGENTS-sections/codegen.md) |
| 3 | File ownership (gen vs hand) | [AGENTS-sections/file-ownership.md](AGENTS-sections/file-ownership.md) |
| 4 | ESLint rules | [AGENTS-sections/eslint.md](AGENTS-sections/eslint.md) |
| 5 | Test + build commands | [AGENTS-sections/commands.md](AGENTS-sections/commands.md) |
| 6 | Key dependencies | [AGENTS-sections/dependencies.md](AGENTS-sections/dependencies.md) |
| 7 | Forbidden actions | [AGENTS-sections/forbidden.md](AGENTS-sections/forbidden.md) |

---

## Companion documents

- [CONTEXT.md](CONTEXT.md) - integration map, ADR rationale
- [Requirements.md](Requirements.md) - full service spec

---

## Mission (1-line)

NestJS neutral org structure - org units, hierarchy (PG ltree), memberships, GDPR membership removal. No HealthStack imports; FHIR Organization created by healthstack-fhir-service via event consumer.

## Read order

1. Workspace `AGENTS.md` (rules + §15 rule index)
2. This file (frontmatter + TOC)
3. Relevant section files from §1-7 as task demands
4. `CONTEXT.md` if integration / rationale needed
