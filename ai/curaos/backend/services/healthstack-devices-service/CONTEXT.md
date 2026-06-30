# Agent Context — healthstack-devices-service

**ADR refs:** ADR-0208 §3.11 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0114

---

## Role

Medical device registry and IoT metric ingestion. FHIR Device/DeviceMetric. MQTT → NATS → HAPI batch pipeline for high-volume telemetry. Alert threshold management. GUDID UDI lookup. Wearable trend analysis via LiteLLM with Presidio PHI redaction.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| IoT ingestion | NATS JetStream (high-volume; batch before Kafka) |
| AI/Trends | LiteLLM + Presidio (ADR-0114) |
| Events | Kafka 4 (alerts/domain) + NATS (metrics) |
| API | TypeSpec REST + tRPC |

---

## IoT Ingestion Pattern

```
MQTT broker (bedside monitor / wearable / pump)
  → NATS MQTT bridge
  → NestJS NATS consumer: devices.metric-stream
  → Buffer in memory: batch 100 observations OR 5s window
  → POST HAPI FHIR /fhir/r4 (transaction bundle of Observations)
  → Evaluate thresholds per DeviceMetric.operationalStatus
  → If threshold breach: emit healthstack.devices.alert (Kafka)
```

Note: NATS JetStream for metrics (not Kafka) — volume-based routing. Kafka only for alerts and domain events.

---

## GUDID UDI Lookup

```typescript
// GET /devices/:id/udi → GET FDA GUDID FHIR API:
// https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?udi={udiDI}
// Cache result in Valkey for 24h
// Return: manufacturer, model, deviceClass, expiryDate, recallStatus
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- IoT batch: sample audit (1% of metric records + all threshold breaches).
- LiteLLM trend calls: Presidio redaction confirmed in audit.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  devices/
    devices.controller.ts       # Device/DeviceMetric; @HealthstackAudit()
    device-registry.service.ts  # FHIR Device CRUD + GUDID lookup
    metric-ingest.service.ts    # NATS consumer + batch HAPI flush
    alert.service.ts            # Threshold evaluation + Kafka emit
    trend-analysis.service.ts   # LiteLLM + Presidio wearable trends
  events/
    devices.events.ts           # Kafka outbox producers
    devices.consumers.ts        # orders.placed (DeviceRequest)
```

---

## Testing

- NATS IoT batch: 1k metrics → HAPI batch flush ≤ 5s.
- Threshold breach → Kafka alert → notify-service ≤ 5s.
- GUDID UDI lookup with mock GUDID API.
- LiteLLM trend analysis: Presidio redaction verified.
- Per-tenant DICOM modality device link (imaging-service lookup).

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Presidio redaction at LiteLLM boundary
- [ ] Alert threshold → notify ≤ 5s
- [ ] NATS vs Kafka routing: metrics = NATS, alerts = Kafka
- [ ] AsyncAPI 3 schemas in Apicurio
