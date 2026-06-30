---
name: healthstack-education-service
description: HealthStack education overlay - FHIR Task/Communication, condition-linked content via education-core-service, patient reading-level adaptation, clinician CME via hr-service.
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
  - ADR-0099
  - ADR-0157
  - ADR-0162
  - ADR-0207
cluster: healthstack
depth: light
---

# healthstack-education-service

Thin HealthStack overlay on education-core-service (ADR-0207). Patient education assignment as FHIR `Task`. `Communication` delivery audit. Condition-linked content suggestion via SNOMED subsumption. Clinician CME tracking via hr-service (ADR-0205).

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Communication delivery records: `PHI_PATIENT_EDUCATION` audit category.
3. Content suggestions: never auto-assigned - clinician confirms before Task creation.
4. Content delivery (LMS enrollment): delegate to education-core-service; do not duplicate LMS logic.
5. CME tracking: delegate to hr-service for credit recording; emit cme-credited event.
6. Consent check via healthstack-consent-service before any patient-facing education delivery.
7. Codegen recipe: `healthstack:fhir-service --resources Task,Communication --education-overlay`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
