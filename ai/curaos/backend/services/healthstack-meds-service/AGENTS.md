---
name: healthstack-meds-service
description: HealthStack medication management - FHIR MedicationRequest/Administration/Dispense, DDI gate tRPC, NCPDP SCRIPT e-prescribing, MAR, DEA schedule tracking.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - fastify
  - hapi-fhir-sidecar
  - cqf-ruler-sidecar
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
  - ADR-0161
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: medium
---

# healthstack-meds-service

Medication management - prescribing, MAR, dispensing, e-prescribing. DDI and drug-allergy CDS Hooks via cqf-ruler. Synchronous DDI gate tRPC called by healthstack-orders-service before medication order commit. NCPDP SCRIPT 2017071 e-prescribing via interop-service.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. DDI hard-stop: block medication order commit in orders-service; require clinician override + reason; audit as `PHI_CLINICAL_SAFETY_OVERRIDE`.
3. E-prescribing: `PHI_EXTERNAL_PRESCRIBING` audit category (PHI sent to pharmacy network).
4. Allergy list: always fetch fresh from problems-service for DDI check - never cache without TTL.
5. DEA schedule II: witness signature enforced on dispensing; PDMP query before dispense.
6. Codegen recipe: `healthstack:fhir-service --resources MedicationRequest,MedicationAdministration,MedicationDispense --eprescribe`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
