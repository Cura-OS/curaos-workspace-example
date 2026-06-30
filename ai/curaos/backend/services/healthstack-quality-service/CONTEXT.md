# Agent Context — healthstack-quality-service

**ADR refs:** ADR-0208 §3.16 · ADR-0115 · ADR-0157 · ADR-0162

---

## Role

eCQM execution and care gap identification. CQL via cqf-ruler. HEDIS 2026 measures. CMS program reporting. Population analytics via Pathling. Care gaps trigger care plan interventions. Measure results in ClickHouse for trending.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| CQL | cqf-ruler sidecar (JVM) — Measure/$evaluate-measure |
| Population analytics | Pathling sidecar (JVM) |
| Time-series | ClickHouse (ADR-0113) |
| Dashboards | Superset (ADR-0113) |
| Events | Kafka 4 (outbox) |

---

## eCQM Evaluation Pattern

```typescript
// POST /fhir/r4/Measure/:id/$evaluate-measure?patient=:id&...
// 1. Forward to cqf-ruler: POST /fhir/r4/Measure/:id/$evaluate-measure
// 2. cqf-ruler evaluates CQL: queries HAPI for Observation, Condition, MedicationRequest
// 3. Returns MeasureReport FHIR resource
// 4. POST MeasureReport to HAPI
// 5. If patient NOT in numerator (care gap): emit quality.care-gap-identified
// 6. Persist MeasureReport time-series to ClickHouse
```

---

## Pathling Population Query

```typescript
// POST /quality/population-query { fhirpathExpression, cohortCriteria }
// 1. POST to Pathling: /fhir/r4/$aggregate
// 2. Pathling executes FHIRPath aggregate across population
// 3. Returns de-identified aggregate result
// 4. Cache in ClickHouse; serve to Superset dashboard
// Note: Patient-level PHI never returned from population-query endpoint
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Population queries: aggregate only; patient-level PHI not exposed externally.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  quality/
    quality.controller.ts       # Measure, MeasureReport; @HealthstackAudit()
    measure-eval.service.ts     # cqf-ruler $evaluate-measure
    care-gap.service.ts         # Care gap detection + event emit
    cms-submit.service.ts       # QPP FHIR API submission
    pathling.service.ts         # Population FHIRPath analytics
  events/
    quality.events.ts           # outbox producers
    quality.consumers.ts        # lab.result-received, meds.administered, goal-achieved
```

---

## Testing

- HEDIS measure evaluation: sample measure + patient data → MeasureReport.
- Care gap: patient not in numerator → care-gap-identified event.
- Pathling population query on 10k patient test dataset.
- CMS QPP submission: mock endpoint.
- Population query returns aggregates only (no PHI).

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Population query: no patient-level PHI in response
- [ ] Care gap → careplans-service intervention end-to-end
- [ ] AsyncAPI 3 schemas in Apicurio
