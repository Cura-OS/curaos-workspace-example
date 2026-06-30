---
name: identity-service
description: "CuraOS Auth foundation product - NestJS/TypeScript 5.x identity, authorization, and token service (ADR-0120). Replaces all prior Kotlin/Spring Boot stubs."
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling: Bun
apis:
  - REST /api/v1/identity
events:
  produces: [curaos.audit.events, curaos.core.identity.invited.v1, curaos.identity.events.v1, curaos.identity.user.activated, curaos.identity.user.erased, curaos.security.break-glass.elevation-requested.v1, curaos.security.break-glass.expired.v1, curaos.security.break-glass.failed.v1, curaos.security.break-glass.used.v1]
  consumes: [curaos.audit.events, curaos.core.audit.event.v1, curaos.identity.events.v1]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/identity-service/CONTEXT.md
  requirements: ai/curaos/backend/services/identity-service/Requirements.md
runtime: bun
package_manager: bun
test_runner: bun
---

# AGENTS.md - identity-service

**Foundation Product:** ADR-0120 | **Cluster:** ADR-0200 | **Runtime:** ADR-0100
**Last updated:** 2026-05-25

Cross-CLI agent contract for Claude Code, Codex, Gemini CLI, OpenCode operating on identity-service. Per [[curaos-agents-md-schema-rule]] split pattern: sections live in `AGENTS-sections/` and load on-demand.

---

## Sections (load on-demand)

| § | Topic | File |
|---|---|---|
| 1 | Baseline rules (Tenancy / Audit / Token / AuthZ / HIPAA / Provider) | [AGENTS-sections/baseline.md](AGENTS-sections/baseline.md) |
| 2 | Codegen commands (ADR-0153 recipes) | [AGENTS-sections/codegen.md](AGENTS-sections/codegen.md) |
| 3 | File ownership (gen vs hand) | [AGENTS-sections/file-ownership.md](AGENTS-sections/file-ownership.md) |
| 4 | ESLint rules (`@curaos/eslint-config`) | [AGENTS-sections/eslint.md](AGENTS-sections/eslint.md) |
| 5 | Test + build commands | [AGENTS-sections/commands.md](AGENTS-sections/commands.md) |
| 6 | Key dependencies (per ADR-0120 + ADR-0150) | [AGENTS-sections/dependencies.md](AGENTS-sections/dependencies.md) |
| 7 | Service ports + sidecars | [AGENTS-sections/ports.md](AGENTS-sections/ports.md) |
| 8 | PR + commit conventions | [AGENTS-sections/pr-conventions.md](AGENTS-sections/pr-conventions.md) |
| 9 | Forbidden actions | [AGENTS-sections/forbidden.md](AGENTS-sections/forbidden.md) |

---

## Companion documents

- [CONTEXT.md](CONTEXT.md) - integration map, ADR rationale, decisions, build milestones
- [Requirements.md](Requirements.md) - full service spec
- [Requirements-raw.md](Requirements-raw.md) - original vision prose

---

## Mission (1-line)

NestJS identity, authorization, and token service for CuraOS - replaces all prior Kotlin/Spring stubs. Current code: NestJS 11 + Drizzle + jose + @node-rs/argon2 + WebAuthn w/ audit hash chain. The ADR-0120 target stack (Better Auth, OPA-WASM, Cerbos, OpenFGA, SPIRE, SAML, SCIM, SMART-on-FHIR, MCP) is planned, do not import; see `AGENTS-sections/dependencies.md`.

## Read order

1. Workspace `AGENTS.md` (rules + §15 rule index)
2. This file (frontmatter + TOC)
3. Relevant section files from §1-9 as task demands
4. `CONTEXT.md` if integration / rationale needed
