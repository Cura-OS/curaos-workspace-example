---
name: healthstack-devices-service
description: HealthStack devices - FHIR Device/DeviceMetric, MQTT→NATS IoT ingestion, alert thresholds, GUDID UDI, LiteLLM+Presidio wearable trends.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API)
tooling:
  - fastify
  - hapi-fhir-sidecar
  - nats
  - kafka
  - presidio
  - valkey
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
  - ADR-0114
  - ADR-0157
  - ADR-0162
cluster: healthstack
depth: medium
---

# healthstack-devices-service

Medical device registry and IoT metric ingestion. MQTT → NATS JetStream → HAPI batch pipeline for high-volume telemetry. Alert threshold management. FDA GUDID UDI lookup. LiteLLM wearable trend analysis with Presidio PHI redaction. Modality device link for healthstack-imaging-service.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. IoT metrics: NATS JetStream (not Kafka) for high-volume path; Kafka only for alerts and domain events.
3. Presidio PHI redaction mandatory before any DeviceMetric data sent to LiteLLM.
4. GUDID lookup: cache in Valkey 24h; never call live GUDID on every device metric.
5. Batch HAPI flush: 100 observations OR 5s window - never flush single observation at IoT rates.
6. Alert threshold: Kafka `healthstack.devices.alert` emit; alert-escalation via automation-service.
7. Codegen recipe: `healthstack:fhir-service --resources Device,DeviceMetric --iot-ingest`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
