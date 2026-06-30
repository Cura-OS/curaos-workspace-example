---
name: healthstack-notes-service
description: HealthStack clinical notes - FHIR Composition/DocumentReference, C-CDA R2.1, NLP code extraction via LiteLLM+Presidio, attestation Temporal, specialty templates.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - fastify
  - hapi-fhir-sidecar
  - seaweedfs
  - presidio
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
  - ADR-0114
  - ADR-0157
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: light
---

# healthstack-notes-service

Clinical documentation - structured/narrative notes, C-CDA R2.1 generation, attestation via Temporal. NLP code extraction via LiteLLM with Presidio PHI redaction. Immutable original + addendum pattern. Triggers C-CDA export + XDR push via healthstack-interop-service on note signing.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Presidio PHI redaction mandatory before any note text sent to LiteLLM.
3. Original `Composition` immutable after signing - addendum = new Composition with `relatesTo`.
4. NLP code suggestions: never auto-committed to FHIR - always require clinician confirmation.
5. C-CDA generation: delegate to healthstack-interop-service (linuxforhealth converter); do not run converter in NestJS.
6. Codegen recipe: `healthstack:fhir-service --resources DocumentReference,Composition --ccda`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
