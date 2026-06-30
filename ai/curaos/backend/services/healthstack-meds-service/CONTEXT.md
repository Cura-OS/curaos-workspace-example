# Agent Context — healthstack-meds-service

**ADR refs:** ADR-0208 §3.5 · ADR-0115 · ADR-0157 · ADR-0161 · ADR-0162

---

## Role

Medication management — prescribing, MAR, dispensing, e-prescribing. DDI and drug-allergy CDS Hooks via cqf-ruler. NCPDP SCRIPT 2017071 e-prescribing via healthstack-interop-service. Controlled substance DEA tracking. Acts as synchronous DDI gate for healthstack-orders-service.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| CDS Hooks | cqf-ruler sidecar (JVM) — DDI + allergy |
| E-prescribing | NCPDP SCRIPT via healthstack-interop-service |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC |

---

## DDI Gate (synchronous — called by orders-service)

```typescript
// tRPC: meds.checkDDI(patientId, medicationRequestDraft)
// 1. Get active MedicationRequests for patient from HAPI
// 2. Get allergy list from healthstack-problems-service
// 3. POST to cqf-ruler CDS Hook: /cds-services/medication-prescribe
// 4. Evaluate DDI card:
//    - hard-stop: return { hardStop: true, reason, severity }
//    - warning: return { hardStop: false, warnings: [...] }
// 5. orders-service blocks commit on hardStop
```

---

## E-Prescribing Flow

```
POST /meds/eprescribe { medicationRequestId }
  → GET HAPI MedicationRequest
  → Build NCPDP SCRIPT 2017071 XML
  → POST to healthstack-interop-service tRPC: interop.sendNcpdpScript(xml, pharmacyNpi)
  → Pharmacy network delivery (Surescripts-compatible endpoint per tenant config)
  → Update MedicationRequest.status = active (confirmed sent)
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- DDI hard-stop override: `PHI_CLINICAL_SAFETY_OVERRIDE` category.
- E-prescribing: `PHI_EXTERNAL_PRESCRIBING` category (sends PHI to pharmacy network).
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  meds/
    meds.controller.ts            # MedicationRequest/Administration/Dispense; @HealthstackAudit()
    meds-prescribe.service.ts     # Prescription + cqf-ruler DDI check
    meds-administration.service.ts # MAR recording
    meds-dispense.service.ts      # In-house pharmacy dispense
    eprescribe.service.ts         # NCPDP SCRIPT adapter
    ddi.service.ts                # DDI gate tRPC endpoint
  events/
    meds.events.ts                # outbox producers
    meds.consumers.ts             # orders.placed + lab.result-received
```

---

## Testing

- DDI CDS Hook: warning card and hard-stop enforcement with cqf-ruler.
- Drug-allergy: allergy from problems-service prevents prescription.
- E-prescribing NCPDP SCRIPT: mock pharmacy endpoint.
- MAR schedule tracking: missed dose detection.
- DEA schedule II: witness signature requirement enforced.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] DDI hard-stop blocks ServiceRequest in orders-service
- [ ] E-prescribing audit: `PHI_EXTERNAL_PRESCRIBING` category
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
