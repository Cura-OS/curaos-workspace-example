# Agent Context — healthstack-claims-service

**ADR refs:** ADR-0208 §3.13 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0120

---

## Role

Medical claims lifecycle — FHIR Claim assembly from encounter data, prior auth via Da Vinci PAS, cost transparency via Da Vinci PCT, X12 EDI via clearinghouse adapter (healthstack-interop-service), eligibility verification. Claims contain dense ePHI — full audit on every operation.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| X12 | healthstack-interop-service (pyx12 validation + clearinghouse) |
| CDS Hooks | cqf-ruler sidecar (CRD at order entry) |
| Credentials | OpenBao (clearinghouse per-tenant) |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC |

---

## Claim Assembly Pattern

```typescript
// Triggered by healthstack.encounter.closed:
// 1. GET encounter from HAPI (Encounter resource)
// 2. GET ServiceRequests linked to encounter
// 3. GET Conditions for patient (ICD-10 from problems-service via FHIR)
// 4. GET lab DiagnosticReports linked to encounter
// 5. Build FHIR Claim resource: encounter, procedures, diagnoses, items
// 6. POST to HAPI /fhir/r4/Claim
// 7. Route to clearinghouse via interop-service: interop.submitX12({ claim, type: '837P' })
// 8. Emit healthstack.claims.submitted
```

---

## Da Vinci PAS Prior Auth

```typescript
// POST /claims/prior-auth:
// 1. Build Claim resource per Da Vinci PAS profile
// 2. POST to payer FHIR endpoint (PAS IG endpoint per tenant payer config)
// 3. Receive ClaimResponse: approved → emit prior-auth-approved
// 4. Denied → emit prior-auth-denied → healthstack-workflow-service prior-auth-followup
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Claims: densest ePHI — diagnosis, procedure, provider, patient identifiers.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.
- Clearinghouse submission: `PHI_EXTERNAL_CLAIMS` audit category.

---

## Key Files (once scaffolded)

```
src/
  claims/
    claims.controller.ts        # Claim/ClaimResponse/EOB/Coverage; @HealthstackAudit()
    claim-assembly.service.ts   # Encounter → FHIR Claim
    prior-auth.service.ts       # Da Vinci PAS PA submission
    gfe.service.ts              # Da Vinci PCT GFE
    eligibility.service.ts      # CoverageEligibilityRequest → 270/271
  events/
    claims.events.ts            # outbox producers
    claims.consumers.ts         # encounter.closed, orders.placed, lab.report-finalized
```

---

## Testing

- Claim assembly from encounter close tested.
- Da Vinci PAS prior auth: mock payer endpoint.
- Da Vinci PCT GFE generation.
- Eligibility 270/271 via interop-service mock.
- Clearinghouse credential injection from OpenBao.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Clearinghouse submission `PHI_EXTERNAL_CLAIMS` audit
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
- [ ] OpenBao credential injection tested
