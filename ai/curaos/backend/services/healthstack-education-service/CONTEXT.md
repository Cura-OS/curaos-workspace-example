# Agent Context — healthstack-education-service

**ADR refs:** ADR-0208 §3.17 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0207

---

## Role

Thin HealthStack overlay on education-core-service (ADR-0207). Patient education task assignment by FHIR `Task`. Communication delivery audit via `Communication`. Condition-linked content suggestion via SNOMED subsumption. Clinician CME via hr-service.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| LMS/Content | education-core-service (ADR-0207) — content catalog + enrollment |
| Terminology | healthstack-terminology-service (SNOMED subsumption for content mapping) |
| HR | hr-service (ADR-0205) — clinician role + CME requirements |
| Events | Kafka 4 (outbox) |

---

## Condition-Linked Content Suggestion

```typescript
// On healthstack.problems.condition-added:
// 1. GET SNOMED code from Condition resource
// 2. healthstack-terminology-service: $expand value set for condition category
//    using SNOMED ECL to find educational content value set
// 3. Query education-core-service content catalog: /content/search?snomedCode=:code
// 4. Filter by patient reading level (Patient.extension[reading-level])
// 5. Surface suggestions to clinician UI; clinician confirms → POST /fhir/r4/Task
```

---

## CME Tracking Pattern

```typescript
// On education.completed (education-core-service event):
// if (completedBy === 'clinician') {
//   staffId = hr-service.lookupByClinicianId(completedBy)
//   cmeCredits = education-core-service.getCmeCredits(courseId)
//   hr-service.recordCME({ staffId, credits, courseId, completedAt })
//   emit healthstack.education.cme-credited
//   healthstack-workflow-service.notifyCMEProgress(staffId)
// }
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- `Communication` delivery records: `PHI_PATIENT_EDUCATION` audit category.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  education/
    education.controller.ts     # Task + Communication; @HealthstackAudit()
    education-assignment.service.ts  # Task creation + education-core LMS enrollment
    content-recommend.service.ts     # SNOMED → content catalog mapping
    communication-delivery.service.ts # Communication FHIR record
    cme-tracking.service.ts     # CME credits + hr-service + workflow
  events/
    education.events.ts         # outbox producers
    education.consumers.ts      # problems.condition-added + careplan.instantiated
```

---

## Testing

- Condition-added → content suggestion (SNOMED subsumption).
- Patient reading level filtering tested.
- Communication delivery creates FHIR Communication record.
- CME credit: education-core completion → hr-service update.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Communication delivery: `PHI_PATIENT_EDUCATION` audit
- [ ] Content suggestions not auto-assigned (clinician confirms)
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
