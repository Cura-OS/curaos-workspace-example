---
name: party-service
description: "CuraOS neutral party registry - NestJS/TypeScript 5.x. Persons, orgs, devices, relationships. PII-encrypted. gRPC contracts with identity-service and org-service."
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal
tooling: Bun
apis:
  - REST /api/v1/party
events:
  produces: [curaos.audit.events, curaos.party.person.erased, curaos.party.person.merged]
  consumes: [curaos.party.person.created]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/party-service/CONTEXT.md
  requirements: ai/curaos/backend/services/party-service/Requirements.md
runtime: bun
package_manager: bun
test_runner: vitest
---

# AGENTS.md - party-service

**Cluster:** ADR-0200 | **Runtime:** ADR-0100 | **Tenancy:** ADR-0155
**Last updated:** 2026-06-10

Cross-CLI agent contract for party-service. Per [[curaos-agents-md-schema-rule]] split pattern: sections live in `AGENTS-sections/` and load on-demand.

---

## Sections (load on-demand)

| § | Topic | File |
|---|---|---|
| 1 | Baseline rules (Neutrality / PII / Tenancy / Audit / GDPR) | [AGENTS-sections/baseline.md](AGENTS-sections/baseline.md) |
| 2 | Codegen instructions (ADR-0153) | [AGENTS-sections/codegen.md](AGENTS-sections/codegen.md) |
| 3 | File ownership (gen vs hand) | [AGENTS-sections/file-ownership.md](AGENTS-sections/file-ownership.md) |
| 4 | ESLint rules | [AGENTS-sections/eslint.md](AGENTS-sections/eslint.md) |
| 5 | Test commands | [AGENTS-sections/commands.md](AGENTS-sections/commands.md) |
| 6 | Key dependencies | [AGENTS-sections/dependencies.md](AGENTS-sections/dependencies.md) |
| 7 | Forbidden actions | [AGENTS-sections/forbidden.md](AGENTS-sections/forbidden.md) |

---

## Mission (1-line)

Neutral party registry (persons, orgs, devices, relationships) with PII-encrypted storage and gRPC contracts to identity-service and org-service; vertical packages never import it backwards.

## Companion documents

- [CONTEXT.md](CONTEXT.md) - integration map, decisions
- [Requirements.md](Requirements.md) - full service spec
