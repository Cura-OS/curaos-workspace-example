---
name: healthstack-quality-service
description: HealthStack quality - eCQM via cqf-ruler CQL, HEDIS 2026, CMS MIPS/APM reporting, Pathling population analytics, care gap → care plan intervention.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - fastify
  - hapi-fhir-sidecar
  - cqf-ruler-sidecar
  - pathling-sidecar
  - clickhouse
  - kafka
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
  requirements_raw: Requirements-raw.md
  readme: README.md
adr_refs:
  - ADR-0208
  - ADR-0115
  - ADR-0157
  - ADR-0162
cluster: healthstack
depth: medium
---

# healthstack-quality-service

Clinical quality measurement - eCQM execution via cqf-ruler CQL, HEDIS 2026, CMS program reporting, Pathling population FHIRPath analytics. Care gaps trigger care plan interventions. Measure results in ClickHouse for trending. Population queries: aggregate only, no patient-level PHI externally.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Population query `/quality/population-query`: return aggregate results only - never patient-level PHI.
3. CQL execution: delegate to cqf-ruler - do not implement CQL evaluation in NestJS.
4. Measure `$evaluate-measure`: individual patient call goes to cqf-ruler; population via Pathling.
5. Care gap → careplans-service: Kafka event, not tRPC (async - quality runs don't block clinical ops).
6. Codegen recipe: `healthstack:fhir-service --resources Measure,MeasureReport,Library --cql --pathling`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
