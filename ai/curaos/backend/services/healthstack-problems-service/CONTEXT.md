# Agent Context — healthstack-problems-service

**ADR refs:** ADR-0208 §3.9 · ADR-0114 · ADR-0115 · ADR-0120 · ADR-0157 · ADR-0162

---

## Role

Problem list and allergy registry. FHIR `Condition` + `AllergyIntolerance`. Coding assist via healthstack-terminology-service. NLP code suggestion pipeline from healthstack-notes-service. Allergy feed to healthstack-meds-service DDI/allergy CDS Hooks.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| Terminology | healthstack-terminology-service (SNOMED + ICD-10) |
| AI assist | LiteLLM + Presidio (via notes-service pipeline) |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC |

---

## Coding Assist Pattern

```typescript
// GET /problems/code-suggest?text=:q
// 1. Call healthstack-terminology-service: /terminology/suggest?text=q&system=snomed
// 2. Call healthstack-terminology-service: /terminology/suggest?text=q&system=icd10
// 3. Merge + rank by concept hierarchy + tenant usage frequency
// 4. Return: [{ code, display, system, confidence }]
// Note: No PHI in this request — plain text problem description only
// If patient-context text is included → Presidio redaction first
```

---

## Allergy Feed to Meds-Service

```
POST /fhir/r4/AllergyIntolerance
  → Create HAPI FHIR AllergyIntolerance
  → Emit healthstack.problems.allergy-added (Kafka)
  → healthstack-meds-service consumer: refresh in-memory allergy list for patient
  → Next DDI CDS Hook check uses updated allergy list
```

---

## NLP Code Suggestion Integration

```
healthstack.notes.signed (Kafka) includes { suggestedCodes: [...] }
  → problems-service consumer displays suggestions in clinician problem list UI
  → Clinician confirms → POST /fhir/r4/Condition (for each confirmed code)
  → NLP suggestions never auto-committed
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  problems/
    problems.controller.ts      # Condition + AllergyIntolerance; @HealthstackAudit()
    condition.service.ts        # FHIR Condition CRUD
    allergy.service.ts          # AllergyIntolerance + allergy-added event
    code-suggest.service.ts     # Terminology-service proxy + ranking
  events/
    problems.events.ts          # outbox producers
    problems.consumers.ts       # notes.signed NLP suggestion consumer
```

---

## Testing

- Allergy-added: meds-service DDI check updated.
- Coding assist: ranked SNOMED + ICD-10 results for free-text.
- NLP suggestion from notes-service: displayed but not auto-committed.
- Condition status transition tested.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] NLP codes never auto-committed to Condition
- [ ] Allergy-added event → meds-service DDI refresh
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
