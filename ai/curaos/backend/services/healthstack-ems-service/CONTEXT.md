# Agent Context — healthstack-ems-service

**ADR refs:** ADR-0208 §3.12 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0206

---

## Role

Emergency Medical Services overlay. NEMSIS 3.5 ePCR ingest → FHIR via healthstack-interop-service. Fleet dispatch via fleet-service (ADR-0206). Hospital arrival notification bundle. SQLite offline field operation. Prehospital FHIR Encounter with NEMSIS extensions.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| Fleet | fleet-service (ADR-0206) tRPC + Kafka |
| NEMSIS transform | healthstack-interop-service tRPC |
| Field offline | SQLite + FHIR bundle sync |
| Events | Kafka 4 (outbox) + NATS (CAD bridge) |
| Storage | SeaweedFS (ePCR attachments) |

---

## NEMSIS Transform Flow

```typescript
// POST /ems/epcr { xml: string }
// 1. Validate NEMSIS 3.5 XSD
// 2. Call healthstack-interop-service tRPC: nemsis.transform(xml)
//    → Returns FHIR Bundle: Encounter + Observation[] + Procedure[]
// 3. POST Bundle to HAPI (transaction) in tenant partition
// 4. Store ePCR attachments (ECG, photos) in SeaweedFS
// 5. Return { encounterId }
```

---

## Hospital Arrival Notification

```typescript
// POST /ems/arrival-notify { destinationTenantId, encounterId }
// 1. Build FHIR Bundle: Patient demographics + Observation (vitals) + Condition (complaint)
// 2. Audit: PHI_CROSS_TENANT_TRANSFER category (sending PHI to another tenant)
// 3. POST Bundle to destination tenant HAPI partition (X-Partition-Name: {destinationTenantId})
// 4. Notify destination ED via notify-service
// 5. Emit healthstack.ems.arrival-notification
```

---

## Offline Field Operation

```
Field device (EMS tablet) → SQLite local storage
On network reconnect:
  1. Check server timestamp vs local timestamp per ePCR record
  2. Conflict resolution: server-wins for Patient identity fields
     field-wins for clinical encounter/procedure data
  3. Batch sync: POST pending ePCRs to /ems/epcr
  4. Mark synced in local SQLite
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Cross-tenant arrival notification: `PHI_CROSS_TENANT_TRANSFER` category.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  ems/
    ems.controller.ts           # ePCR ingest, dispatch, arrival; @HealthstackAudit()
    nemsis.service.ts           # NEMSIS 3.5 XSD validation + interop tRPC
    dispatch.service.ts         # fleet-service tRPC + NATS CAD bridge
    arrival.service.ts          # Hospital arrival notification bundle
    offline-sync.service.ts     # SQLite sync + conflict resolution
  events/
    ems.events.ts               # outbox producers
    ems.consumers.ts            # fleet.unit.location-updated + fleet.unit.available
```

---

## Testing

- NEMSIS 3.5 sample ePCR XML → FHIR Encounter round-trip.
- Fleet dispatch via mock fleet-service.
- Hospital arrival bundle: cross-tenant HAPI partition write.
- Offline SQLite sync: capture offline, reconnect, sync.
- Cross-tenant PHI transfer audit category verified.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Cross-tenant arrival: `PHI_CROSS_TENANT_TRANSFER` audit
- [ ] NEMSIS 3.5 XSD validation enforced
- [ ] Offline sync conflict resolution tested
- [ ] AsyncAPI 3 schemas in Apicurio
