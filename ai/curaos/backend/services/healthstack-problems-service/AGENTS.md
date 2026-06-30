---
name: healthstack-problems-service
description: HealthStack problem list - FHIR Condition/AllergyIntolerance, SNOMED+ICD-10 coding assist, allergy feed to meds-service DDI, NLP code suggestion pipeline.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - fastify
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
  - ADR-0114
  - ADR-0157
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: light
---

# healthstack-problems-service

Problem list management - FHIR `Condition` + `AllergyIntolerance`. Allergy registry feeds healthstack-meds-service DDI/allergy CDS Hooks. SNOMED + ICD-10 coding assist via healthstack-terminology-service. NLP code suggestions from healthstack-notes-service (clinician-confirmed only).

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. NLP code suggestions from notes-service: never auto-commit to Condition - always require clinician confirmation.
3. Allergy-added event: Kafka; meds-service must refresh DDI allergy list promptly on receipt.
4. Coding assist: delegate to healthstack-terminology-service - do not embed SNOMED/ICD-10 search locally.
5. Presidio redaction if coding assist request contains patient-context text snippets.
6. Codegen recipe: `healthstack:fhir-service --resources Condition,AllergyIntolerance --terminology`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
