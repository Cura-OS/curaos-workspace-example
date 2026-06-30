---
name: healthstack-ems-service
description: HealthStack EMS - NEMSIS 3.5 ePCR→FHIR, fleet dispatch via ADR-0206, hospital arrival notification, CAD NATS bridge, SQLite offline field operation.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API), SeaweedFS S3
tooling:
  - fastify
  - hapi-fhir-sidecar
  - nats
  - kafka
  - sqlite
  - seaweedfs
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
  - ADR-0206
cluster: healthstack
depth: medium
---

# healthstack-ems-service

Emergency Medical Services overlay. NEMSIS 3.5 ePCR ingest → FHIR via healthstack-interop-service tRPC. Fleet dispatch integration via fleet-service (ADR-0206). Hospital arrival notification bundle to destination tenant HAPI partition. SQLite offline field operation with sync-on-reconnect.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Cross-tenant arrival notification: `PHI_CROSS_TENANT_TRANSFER` audit category - cross-tenant PHI always audited.
3. NEMSIS transform: delegate to healthstack-interop-service tRPC - never implement NEMSIS parsing internally.
4. Offline sync: server-wins for Patient identity fields; field-wins for clinical encounter data.
5. Hospital arrival bundle: target tenant HAPI partition (`X-Partition-Name: {destinationTenantId}`).
6. CAD bridge: NATS bidirectional with fleet-service; fallback to manual dispatch if fleet-service unavailable.
7. Codegen recipe: `healthstack:fhir-service --resources Encounter --nemsis --fleet-integration`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
