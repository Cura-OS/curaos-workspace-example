---
name: healthstack-careplans-service
description: HealthStack care plan engine - FHIR CarePlan/Goal/PlanDefinition, cqf-ruler $apply, CQL goal evaluation, activity-due events, care coordination Temporal.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), Temporal
tooling:
  - fastify
  - hapi-fhir-sidecar
  - cqf-ruler-sidecar
  - kafka
  - temporal
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
  - ADR-0099
  - ADR-0157
  - ADR-0161
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: medium
---

# healthstack-careplans-service

FHIR CarePlan execution engine. `PlanDefinition/$apply` via cqf-ruler instantiates `CarePlan` + `RequestGroup`. CQL goal evaluation on lab results. Activity-due events drive ordering + scheduling. Care coordination Temporal workflow on instantiation.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. `$apply` delegates to cqf-ruler - NestJS does not implement CQL evaluation internally.
3. Activity-due timers: use Temporal timers (not cron) for per-patient schedule precision.
4. Goal evaluation: CQL expressions via cqf-ruler - never hard-code goal criteria in service logic.
5. NLP code suggestions from notes-service: never auto-committed; clinician confirmation required.
6. Codegen recipe: `healthstack:fhir-service --resources CarePlan,Goal,PlanDefinition,ActivityDefinition --cqf`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
