# CONTEXT — event-core-service

**ADR-0203 §4.6 · §1.1 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-06-03 (#352 domain landed)

---

## Scope Disambiguation (read first)

This service is NOT the Kafka/outbox infrastructure. ADR-0203 §1.1 formally resolved the naming collision:

- **event-core-service** = public/community event domain service (this file).
- **Domain/messaging events** = ADR-0102 infrastructure (Kafka, Debezium, Apicurio) — no service owns this; it is platform plumbing.
- **Calendar events (VEVENT)** = calendar-core-service.

Prior CONTEXT.md described this service as a Kafka topic provisioning layer — that was wrong. That concern belongs entirely to ADR-0102.

---

## Role in Cluster

Standalone domain service. Depends on calendar-core-service (for CalendarEvent projection on publish) and commerce-service (payment hook via Kafka). No other cluster services depend on event-core — it is a leaf in the intra-cluster dependency graph.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (registration count cache, idempotency keys)
- `@curaos/recurrence` (rrule.js + luxon) — recurring public event generation
- Temporal workflows (`PublicEventRegistrationWorkflow`, `PublicEventCancellationWorkflow`) — ADR-0122
- Kafka transactional outbox — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

---

## Key Design Decisions

**Calendar projection is derived, not authoritative:** calendar-core CalendarEvent is created on PublicEvent publish as a one-way projection. If the projection fails (calendar-core down), it is retried by Temporal activity — the PublicEvent itself is not rolled back.

**Capacity enforcement via ledger + Valkey:** `EventCapacityLedger` holds confirmed/waitlist counts in PG (source of truth). Valkey caches current count for fast availability checks. Capacity exceeded → registration moves to WAITLISTED, not rejected.

**Idempotency key on registration:** Valkey key `reg:idempotency:{eventId}:{registrantId}` prevents double-registration on client retry or network replay.

**Recurring events are instances, not expansions:** Each recurrence generates a real `PublicEvent` row (independently cancellable, independently managed). `@curaos/recurrence` computes the 90-day occurrence window; BullMQ creates rows.

**Commerce hook is Kafka-out only:** event-core emits `public.event.registered` with ticketRef; commerce-service subscribes and initiates payment. event-core never calls commerce-service synchronously — avoids tight coupling and handles payment failure via separate workflow.

---

## Implementation Status (#352 — domain landed)

The neutral-core domain shipped on branch `agent/impl-event-core-352`. What is live vs. deferred:

**Recurrence library (concrete decision):** `@curaos/recurrence` is realized as `rrule@2.8.1` (the RFC-5545 RRULE engine) + `luxon@3.7.2` (timezone-correct instant math) wrapped in `src/recurrence/recurrence.ts`. We do NOT hand-roll calendar math. `parseRecurrenceRule(rule, dtstart)` validates an RRULE against the stored event `startsAt` anchor (rejecting a body-smuggled DTSTART so the anchor stays authoritative); `expandWindow({rule, dtstart, from, to})` returns the occurrence start instants in a **half-open** `[from, to)` window (default 90 days, `MAX_OCCURRENCES`=1000). Half-open boundaries mean adjacent generation windows never double-emit the boundary occurrence. This is the pure, IO-free primitive the BullMQ 90-day materialization job at the composition root calls.

**Domain model (`src/events/`):**
- `public_event` — title, schedule (`starts_at`/`ends_at`), hard `capacity` (null = uncapped), `recurrence_rule` (RRULE anchor), `series_parent_id` (instance linkage), status `draft|published|cancelled`.
- `event_registration` — `registrant_party_id` (party reference, no PII), status `confirmed|waitlisted|cancelled`, `idempotency_key` UNIQUE.
- `event_capacity_ledger` — **append-only** signed-delta log (`confirmed_delta`/`waitlist_delta`); `SUM()` is the no-overbooking source of truth (a cancel writes a -1 row, never mutates).

**Capacity invariant (HARD, no overbooking):** the confirm-vs-waitlist branch is decided INSIDE the registration tx against a `FOR UPDATE` row lock on the parent event (`countsForUpdate`), so two concurrent registrations cannot both take the last seat — the second is WAITLISTED, never rejected. Cancelling a confirmed seat PROMOTES the oldest waitlisted registrant (`oldestWaitlisted ... FOR UPDATE`) in the SAME tx. Verified against live Postgres (`test/integration/event-domain-pg.test.ts`, gated on `EVENT_CORE_DATABASE_URL`).

**Outbox routing (durable domain events):** every mutation enqueues its `event.*` domain event into the scaffolded durable `domain_outbox` via `outbox.enqueueWith(tx.db, …)` on the SAME tx boundary (durable-iff-write); the post-commit relay ships it. The in-process producer is never called on the write path. Topic catalog (`src/events/event-domain-events.ts`, mirrors `specs/event.asyncapi.yaml` 1:1):
- `curaos.core.event.published.v1`, `curaos.core.event.cancelled.v1`
- `curaos.core.event.registration.confirmed.v1` / `.waitlisted.v1` / `.cancelled.v1` / `.promoted.v1`

Every registration event is keyed on the PublicEvent partition subject so an event's whole lifecycle keeps per-event ordering.

**Idempotency key (current form):** the registration idempotency key is the deterministic `reg:{eventId}:{partyId}` carried in the `event_registration.idempotency_key` UNIQUE column + enforced by a service-layer one-live-registration-per-party check. The Valkey-cached `reg:idempotency:{eventId}:{registrantId}` fast-path described above is the composition-root optimization, deferred (the PG UNIQUE + service check is the correctness backstop).

**Deferred to the composition root / GA wave 2 (NOT in this neutral-core lane):** the BullMQ 90-day recurrence materialization job, the Temporal `PublicEventRegistrationWorkflow`/`PublicEventCancellationWorkflow`, the Valkey count cache, the calendar-core CalendarEvent projection, and the real Kafka publisher binding. The store seam (`EVENT_STORE`) + `DomainOutboxModule.register()` are the injection points the modulith root binds these to.

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| calendar-core-service | REST POST (on PublicEvent publish) | Derived CalendarEvent projection |
| commerce-service | Kafka public.event.registered | Ticket payment initiation |
| notify-service | Kafka public.event.registered / cancelled | Confirmation, cancellation emails |
| site-service | Kafka public.event.published | Public listing rendering |
| analytics | Kafka public.event.* | Event metrics |

---

## Files That Must Not Break

- Capacity enforcement + ledger update — double-booking prevention relies on this.
- `public.event.registered` Kafka schema — commerce-service and notify-service parse it.
- Idempotency key check — must run before any write on registration endpoint.

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

- OQ-4: Confirm whether ticketed event payment state stays as commerce-service hook or whether event-core should own a lightweight payment state machine — Product decision, Wave 1 kickoff.
