# Agent Context — healthstack-interop-service

**ADR refs:** ADR-0208 §3.14 · ADR-0115 · ADR-0157 · ADR-0162

---

## Role

External interoperability gateway. Translation hub between FHIR R4 and HL7v2, X12 EDI, C-CDA, IHE, TEFCA, NEMSIS. All other HealthStack services call this for external-standard operations.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| HL7v2 | HAPI HL7v2 + Spring Integration MLLP (JVM sidecar) |
| X12 | pyx12 (Python sidecar, validation only) |
| C-CDA | linuxforhealth/fhir-to-cda-converter (Apache 2.0) |
| IHE XDS | SeaweedFS as repository backend |
| Events | Kafka 4 (outbox) + NATS (HL7v2 relay) |
| API | TypeSpec REST + tRPC (internal) |
| Secrets | OpenBao (QHIN/Carequality credentials) |

---

## Critical Patterns

### HL7v2 MLLP Relay
```
External LIS → MLLP TCP 2575 → HAPI HL7v2 JVM sidecar → NATS message
  → NestJS translation worker → FHIR Observation POST to healthstack-lab-service
```

### C-CDA Export Trigger
```
healthstack.notes.signed (Kafka)
  → interop-service consumer
  → GET /fhir/r4/Composition/:id/$document → FHIR bundle
  → linuxforhealth converter → C-CDA XML
  → SeaweedFS storage + XDR push to receiving provider
```

### NEMSIS Transform (internal tRPC)
```
healthstack-ems-service POST /ems/epcr
  → calls interop tRPC: nemsis.transform(xml)
  → NEMSIS 3.5 XML → FHIR Encounter + Observation + Procedure
  → return FHIR resources to ems-service → HAPI POST
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on every controller method.
- External exchange audit: protocol, direction, endpoint (hashed), patient FHIR ID (hashed).
- Cross-tenant exchange (TEFCA, Carequality): `PHI_EXTERNAL_EXCHANGE` category.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Air-Gap Profile

- `TEFCA_ENABLED=false`, `CAREQUALITY_ENABLED=false` in air-gap mode.
- HL7v2 MLLP + C-CDA + IHE XDS fully functional in air-gap.
- Clearinghouse X12: tenant configures on-prem clearinghouse endpoint.

---

## Key Files (once scaffolded)

```
src/
  mllp/
    mllp.gateway.ts           # NATS consumer from JVM MLLP sidecar
    hl7v2-to-fhir.service.ts  # HL7v2 → FHIR translation
  cda/
    cda-import.service.ts     # C-CDA → FHIR
    cda-export.service.ts     # FHIR → C-CDA via linuxforhealth
  x12/
    x12-validation.service.ts # pyx12 validation calls
  xds/
    xds.service.ts            # IHE XDS submit/retrieve via SeaweedFS
  qhin/
    qhin.service.ts           # TEFCA QHIN query
  nemsis/
    nemsis.service.ts         # NEMSIS 3.5 transform (tRPC)
  events/
    interop.events.ts         # outbox producers
```

---

## Testing

- HL7v2 round-trip: ADT^A01 → FHIR Patient + Encounter; ORU^R01 → FHIR Observation.
- C-CDA: CCDA 2.1 sample import → FHIR; FHIR → CCDA 2.1 export round-trip.
- IHE XDS: document submit + retrieve via SeaweedFS mock.
- NEMSIS: sample ePCR XML → FHIR Encounter.
- Air-gap profile: TEFCA disabled; HL7v2 + C-CDA functional.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] MLLP per-tenant TLS tested
- [ ] Air-gap profile: TEFCA disabled
- [ ] AsyncAPI 3 schemas in Apicurio
