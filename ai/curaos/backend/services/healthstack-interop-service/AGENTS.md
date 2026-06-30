---
name: healthstack-interop-service
description: HealthStack external interop gateway - HL7v2 MLLP, X12 EDI, C-CDA R2.1, IHE XDS/MHD, TEFCA QHIN, Carequality, NEMSIS 3.5.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), SeaweedFS S3
tooling:
  - fastify
  - hapi-hl7v2-jvm-sidecar
  - pyx12-python-sidecar
  - fhir-to-cda-converter
  - seaweedfs
  - kafka
  - nats
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
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
  - ADR-0120
cluster: healthstack
depth: deep
---

# healthstack-interop-service

External interoperability gateway for HealthStack. All other services speak FHIR internally; this service handles HL7v2 MLLP (port 2575 per-tenant TLS), X12 EDI 837/835/270/271, C-CDA R2.1, IHE XDS/XDR/MHD, TEFCA QHIN, Carequality XCA, and NEMSIS 3.5 transform.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on every controller method.
2. MLLP listener: TCP port 2575; per-tenant TLS with client cert. Never expose plain-text MLLP.
3. pyx12: validation only - never generate production 837/835 EDI internally; delegate to clearinghouse.
4. TEFCA/Carequality: disabled in air-gap profile (`TEFCA_ENABLED=false`).
5. Cross-tenant exchange (TEFCA, arrival notification): `PHI_EXTERNAL_EXCHANGE` audit category.
6. NEMSIS transform: internal tRPC only - not exposed via HTTP.
7. Codegen recipe: `healthstack:interop-adapter --protocols hl7v2,cda,xds,mhd,tefca`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
