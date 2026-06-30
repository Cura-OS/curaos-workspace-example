---
name: healthstack-imaging-service
description: HealthStack imaging - dcm4chee DICOM PACS proxy, OHIF Viewer SMART sessions, MONAI Deploy AI inference, IHE XDS-I prior studies, UDI device link.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), SeaweedFS S3
tooling:
  - fastify
  - dcm4chee-jvm-sidecar
  - ohif-viewer
  - monai-deploy
  - presidio
  - hapi-fhir-sidecar
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
  - ADR-0114
  - ADR-0157
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: deep
---

# healthstack-imaging-service

DICOM PACS proxy via dcm4chee sidecar (LGPL 2.1). OHIF Viewer 3.x zero-footprint viewer with SMART token session. MONAI Deploy AI inference on study completion. PHI redaction via Presidio at MONAI boundary. IHE XDS-I prior study retrieval via interop-service.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on every controller method - including DICOM proxy calls.
2. Presidio PHI redaction mandatory before any DICOM metadata sent to MONAI.
3. OHIF session tokens scoped to specific studyUID; expire 4h.
4. dcm4chee per-tenant study root: `{tenantId}_` AE title prefix.
5. WADO-RS/QIDO-RS: validate tenant scope before serving DICOM data (cross-tenant block at proxy).
6. dcm4chee is LGPL 2.1 - do not embed; HTTP proxy only.
7. Air-gap: dcm4chee + OHIF functional; MONAI Deploy optional (disable if no GPU).
8. Codegen recipe: `healthstack:fhir-service --resources ImagingStudy --dicom --monai`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
