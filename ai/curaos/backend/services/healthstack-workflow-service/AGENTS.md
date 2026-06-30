---
name: healthstack-workflow-service
description: HealthStack clinical Temporal workflows - 8 templates (clinical-pathway, break-glass, discharge-planning, etc.), delegates to CuraOS Workflow Manager ADR-0122.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), Temporal
tooling:
  - fastify
  - temporal
  - hapi-fhir-sidecar
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
  - ADR-0099
  - ADR-0120
  - ADR-0157
  - ADR-0162
  - ADR-0122
cluster: healthstack
depth: light
---

# healthstack-workflow-service

HealthStack-specific Temporal workflow template library. Registers 8 clinical templates in CuraOS Workflow Manager (ADR-0122) at bootstrap. Does NOT own Temporal cluster. Break-glass dual-sign: 15min approval window, auto-deny on timeout. All workflow lifecycle events audited.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Break-glass workflow: `PHI_EMERGENCY_ACCESS_WORKFLOW` audit category.
3. Break-glass: auto-deny on 15min timeout - Temporal `sleep('15 minutes')` with `Promise.race`.
4. This service does NOT own Temporal cluster - use CuraOS Workflow Manager task queues.
5. Template registration: ALL 8 templates must be registered at startup before service is ready.
6. PlanDefinition-linked storage in HAPI for template auditability (not just in-memory).
7. Codegen recipe: `healthstack:workflow-template --engine temporal --domain clinical`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
