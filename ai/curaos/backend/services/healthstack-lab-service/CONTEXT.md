# Agent Context — healthstack-lab-service

**ADR refs:** ADR-0208 §3.6 · ADR-0115 · ADR-0157 · ADR-0161 · ADR-0162

---

## Role

LIS interoperability and lab result management. Specimen chain-of-custody. HL7v2 ORU^R01 ingestion via NATS relay from healthstack-interop-service. Critical value alerting P99 < 1s. DiagnosticReport generation. LOINC coding via healthstack-terminology-service.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| HL7v2 relay | NATS JetStream (from interop-service) |
| Reference ranges | Valkey (per-lab, per-population cache) |
| Report PDF | Gotenberg + SeaweedFS |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC |

---

## Critical Value Alert Pattern

```typescript
// On Observation ingestion:
// if (observation.interpretation.some(code => code.code === 'critical')) {
//   await kafka.emit('healthstack.lab.critical-value', { observationId, patientId, orderId })
//   // P99 < 1s: this Kafka emit must complete within 500ms
//   // Downstream: automation-service critical-value-response workflow via Temporal
//   // If ordering provider not acknowledged within SLA → escalate
// }
```

---

## HL7v2 ORU Ingestion Pipeline

```
External LIS → MLLP → healthstack-interop-service (HAPI HL7v2 JVM)
  → NATS JetStream: lab.hl7v2.oru message
  → NestJS lab-service NATS consumer
  → Parse ORU^R01: OBX segments → FHIR Observation[]
  → POST Observations to HAPI FHIR
  → Generate DiagnosticReport aggregating Observations
  → Emit healthstack.lab.result-received + (if critical) lab.critical-value
```

---

## Reference Range Cache

```
Valkey key: refrange:{tenantId}:{loincCode}:{ageGroup}:{sex}:{pregnancyState}
TTL: 24h (refreshed from tenant lab config on miss)
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Critical value: `PHI_CLINICAL_ALERT` audit category.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  lab/
    lab.controller.ts            # Specimen/Observation/DiagnosticReport; @HealthstackAudit()
    specimen.service.ts          # Specimen workflow + chain of custody
    result-ingest.service.ts     # ORU ingestion + FHIR Observation creation
    diagnostic-report.service.ts # DiagnosticReport generation + PDF
    critical-value.service.ts    # Critical value detection + emit
  nats/
    oru-consumer.ts              # NATS ORU^R01 consumer
  events/
    lab.events.ts                # outbox producers
    lab.consumers.ts             # orders.placed consumer
```

---

## Testing

- HL7v2 ORU^R01 → FHIR Observation via NATS relay.
- Critical value P99 < 1s end-to-end.
- DiagnosticReport PDF generation via Gotenberg.
- Reference range per-population lookup from Valkey.
- LOINC code validation via terminology-service.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Critical value P99 < 1s tested
- [ ] Critical value `PHI_CLINICAL_ALERT` audit category
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
