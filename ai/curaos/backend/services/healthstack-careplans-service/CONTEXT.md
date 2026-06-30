# Agent Context — healthstack-careplans-service

**ADR refs:** ADR-0208 §3.3 · ADR-0115 · ADR-0157 · ADR-0161 · ADR-0162

---

## Role

FHIR CarePlan execution engine. Compiles `PlanDefinition` → `CarePlan` + `RequestGroup` via cqf-ruler `$apply`. Tracks Goal progress via CQL evaluation. Emits activity-due events that drive ordering, scheduling, and quality measurement.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| CQL | cqf-ruler sidecar (JVM) — $apply + CQL eval |
| Workflow | healthstack-workflow-service → Temporal |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC |

---

## PlanDefinition Apply Pattern

```typescript
// POST /fhir/r4/PlanDefinition/:id/$apply?patient=:patientId
// 1. Forward $apply to cqf-ruler: POST /fhir/r4/PlanDefinition/:id/$apply
// 2. cqf-ruler returns CarePlan + RequestGroup FHIR Bundle
// 3. POST Bundle to HAPI (transaction)
// 4. Emit healthstack.careplan.instantiated
// 5. Start Temporal care-coordination workflow via healthstack-workflow-service
// 6. Schedule activity-due timers per CarePlan.activity.detail.scheduledTiming
```

---

## Goal Evaluation Pattern

```
healthstack.lab.result-received (Kafka)
  → evaluate linked Goal criteria via cqf-ruler CQL
  → if goal met: PATCH Goal.lifecycleStatus = completed
    → emit healthstack.careplan.goal-achieved
  → if goal deadline passed unmet: emit healthstack.careplan.goal-missed
    → healthstack-quality-service care gap logic triggered
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  careplans/
    careplans.controller.ts     # PlanDefinition $apply, CarePlan, Goal; @HealthstackAudit()
    careplan-apply.service.ts   # cqf-ruler $apply delegation
    goal-tracking.service.ts    # Goal lifecycle + CQL evaluation
    activity-scheduler.service.ts # Activity-due timer management
  events/
    careplans.events.ts         # outbox producers
    careplans.consumers.ts      # orders.completed + lab.result-received consumers
```

---

## Testing

- `$apply`: PlanDefinition → CarePlan + RequestGroup via cqf-ruler mock.
- Activity-due timer fires at correct schedule.
- Goal evaluation: lab result → CQL → goal-achieved event.
- Care coordination Temporal workflow started on instantiation.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] `$apply` tested with cqf-ruler
- [ ] Activity-due event emitted at correct schedule
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
