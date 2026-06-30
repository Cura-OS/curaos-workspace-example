---
name: curaos
description: "CuraOS monorepo - NestJS microservices, React Native + Next.js clients, shared libs. AI-agent-first platform."
tags: [index, curaos]
language: TypeScript
framework: none
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3, K8s
tooling:
  - bun
  - turborepo
  - docker-compose
  - ansible
  - just
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  overview: curaos/README.md
  requirements: ai/curaos/Requirements.md
  context: ai/curaos/CONTEXT.md
  adr: ai/curaos/docs/adr/
workspaces:
  backend: curaos/backend
  frontend: curaos/frontend
  ops: curaos/ops
environments:
  - local
  - on-prem
  - saas
  - air-gap
---

# AGENTS.md - CuraOS (cross-CLI agent contract)

**Read this file before touching any code in `curaos/` or its submodules.**
**Read order:** workspace `AGENTS.md` → `ai/rules/README.md` + relevant `ai/rules/curaos_*.md` (**priority #1**) → **[docs/adr/RESOLUTION-MAP.md](docs/adr/RESOLUTION-MAP.md)** + relevant ADRs (**priority #2**) → this file → target module's `ai/curaos/<path>/AGENTS.md` + `CONTEXT.md`.

All CLI agents (Claude Code, Codex CLI, Cursor, Aider, OpenCode) read this file. Per [[curaos-agents-md-schema-rule]] split pattern: sections live in `AGENTS-sections/` and load on-demand.

**Before proposing any stack pick or implementation choice:** check relevant rule first, then [RESOLUTION-MAP.md](docs/adr/RESOLUTION-MAP.md). If question RESOLVED-RULE / RESOLVED-ADR → use it, don't re-propose. If STILL-OPEN → flag to user. See workspace `AGENTS.md` §13 (Stack-Review) + §13b (precedence).

---

## Sections (load on-demand)

| § | Topic | File |
|---|---|---|
| 1 | Mandatory baseline (Stack / Deps / AuthZ / Tenant / Events / Codegen / Provider) | [AGENTS-sections/baseline.md](AGENTS-sections/baseline.md) |
| 2 | File ownership boundaries (curaos/ vs ai/curaos/) | [AGENTS-sections/file-ownership.md](AGENTS-sections/file-ownership.md) |
| 3 | Codegen scaffolding instructions | [AGENTS-sections/codegen-scaffolding.md](AGENTS-sections/codegen-scaffolding.md) |
| 4 | Foundation product build sequence (Phase 3) | [AGENTS-sections/build-sequence.md](AGENTS-sections/build-sequence.md) |
| 5 | Agent decision weights (ADR-0099 §10) | [AGENTS-sections/decision-weights.md](AGENTS-sections/decision-weights.md) |
| 6 | HealthStack rules (PHI / SLA / HIPAA) | [AGENTS-sections/healthstack-rules.md](AGENTS-sections/healthstack-rules.md) |
| 7 | Pricing + air-gap rules | [AGENTS-sections/pricing-airgap.md](AGENTS-sections/pricing-airgap.md) |

---

## Companion documents

- [docs/README.md](docs/README.md) - docs index; its "Current state" block points at the LIVE execution state (HANDOVER + tracker win over static docs per the knowledge-persistence live-state precedence)
- [CONTEXT.md](CONTEXT.md) - current ADR state + phase status
- [Requirements.md](Requirements.md) - structured platform spec
- [Requirements-raw.md](Requirements-raw.md) - vision prose + strategic directives
- [docs/delivery-roadmap.md](docs/delivery-roadmap.md) - phased build sequence
- [docs/development-kickoff.md](docs/development-kickoff.md) - how to start coding
- [docs/adr/0099-charter-priorities-vision.md](docs/adr/0099-charter-priorities-vision.md) - canonical charter
- [docs/adr/0100-foundation-platform-runtime.md](docs/adr/0100-foundation-platform-runtime.md) - NestJS runtime decision
- [docs/adr/0150-baseline-alignment-rules.md](docs/adr/0150-baseline-alignment-rules.md) - cross-cutting rules
