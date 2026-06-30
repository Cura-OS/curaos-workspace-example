# CONTEXT — business-scheduling-service

**ADR-0203 §4.2 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-05-24

---

## Role in Cluster

Organization scheduling layer. Reads calendar-core free/busy for conflict detection. Emits `scheduling.slot.booked` consumed by healthstack-clinical-scheduling-service for FHIR Appointment write. Never calls HAPI FHIR directly — HealthStack bridge is event-driven.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (slot availability cache, optimistic-lock reservation)
- `@curaos/recurrence` (rrule.js + luxon) — schedule template expansion
- Temporal workflows (`BookAppointmentWorkflow`, `WaitlistWorkflow`, `NoShowWorkflow`) — ADR-0122
- Kafka transactional outbox — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

Prior CONTEXT.md referenced Spring Boot / Kotlin — superseded by ADR-0100/ADR-0203.

---

## Key Design Decisions

**Lazy slot generation:** Slots not pre-generated for the entire template validity window. BullMQ job generates 90 days ahead on template creation and on rolling expiry. Query windows beyond generated range trigger on-demand generation (synchronous for small windows, async for large).

**Optimistic lock for booking:** No advisory locks. `UPDATE slots SET status = 'BUSY' WHERE id = $1 AND status = 'FREE' RETURNING id` — empty result means collision → retry up to 3×. After 3 failures → HTTP 409.

**Temporal for durable booking:** `BookAppointmentWorkflow` wraps slot reservation + confirmation + cancellation-timeout as a compensatable Temporal workflow. Service code has no saga logic — it is a Temporal activity worker.

**Cal.com BYO sidecar:** `SchedulingProvider` interface abstracts local vs Cal.com backend. OQ-3 in ADR-0203 §8: interface contract needs finalizing in Wave 1.

**AI no-show (ADR-0114):** Opt-in per tenant. Temporal async activity post-booking. Anonymized features only — no PHI transmitted. Result stored as `noShowProbability` float on Booking row.

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| calendar-core-service | REST GET /calendars/free-busy | Attendee conflict detection |
| healthstack-clinical-scheduling-service | Kafka scheduling.slot.booked | FHIR Appointment write |
| notify-service | Kafka scheduling.slot.booked / cancelled | Booking confirmations, reminders |
| billing | Kafka scheduling.slot.booked | Charge trigger |
| AI service (ADR-0114) | Temporal async activity (opt-in) | No-show probability |

---

## Files That Must Not Break

- Slot optimistic lock logic — concurrent booking safety depends on it.
- `scheduling.slot.booked` Kafka schema — healthstack-clinical-scheduling-service parses it.
- calendar-core free/busy call — attendee conflict detection depends on it.

---

## Linter / Test Runner

```bash
bun run lint
bun run test
bun run test:e2e    # requires Docker Compose (PG + Kafka + Valkey + Temporal dev server)
bun run build
```

---

## Open Questions (from ADR-0203 §8)

- OQ-3: Finalize `SchedulingProvider` interface contract for Cal.com BYO sidecar — Wave 1.
- OQ-5: FHIR R5 `Appointment` adds `previousAppointment` / `originatingAppointment` — plan post-R5-ballot.
