---
name: healthstack-lab-service
description: HealthStack lab - FHIR Specimen/Observation/DiagnosticReport, HL7v2 ORU NATS ingestion, critical value P99 < 1s, LOINC coding, reference ranges.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - fastify
  - hapi-fhir-sidecar
  - nats
  - valkey
  - gotenberg
  - seaweedfs
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

# healthstack-lab-service

LIS interoperability and lab result management. HL7v2 `ORU^R01` ingestion via NATS relay from healthstack-interop-service. Critical value alerting P99 < 1s to notify-service. `DiagnosticReport` generation with PDF. LOINC coding via healthstack-terminology-service.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Critical value: `PHI_CLINICAL_ALERT` audit category; Kafka emit must complete ≤ 500ms from ingestion.
3. HL7v2 ORU: consume from NATS relay - do not implement MLLP directly.
4. Reference ranges: Valkey cache per `{tenantId}:{loincCode}:{ageGroup}:{sex}:{pregnancyState}`.
5. DiagnosticReport PDF: Gotenberg + SeaweedFS; never inline binary in FHIR resource.
6. Codegen recipe: `healthstack:fhir-service --resources Specimen,Observation,DiagnosticReport --hl7v2-consumer`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
