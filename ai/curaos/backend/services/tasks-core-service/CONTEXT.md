# CONTEXT — tasks-core-service

**ADR-0203 §4.4 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-05-24

---

## Role in Cluster

Shared task primitive layer. personal-tasks-service is a UX presentation layer on top of tasks-core. healthstack-careplans-service consumes task.created events and maps them to FHIR Task resources. tasks-core itself is HealthStack-agnostic at code level — the FHIR bridge is entirely event-driven.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (task count aggregates, TTL 30s)
- `@curaos/recurrence` (rrule.js + luxon) — recurring task generation
- Temporal activities (`TaskEscalationWorkflow`) — ADR-0122
- Kafka transactional outbox (Debezium CDC, Apicurio registry) — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

No Spring Boot. No Kotlin. Prior CONTEXT.md referenced wrong runtime — superseded by ADR-0100/ADR-0203.

---

## Key Design Decisions

**Status machine is server-authoritative:** All status transitions validated server-side with explicit allowed-transition matrix. Clients cannot force arbitrary status jumps. Transition emits `task.status.changed` regardless of caller.

**Dependency enforcement is synchronous:** On status transition to ACTIVE, server checks all FINISH-TO-START dependencies synchronously before committing. Does not delegate to BPM engine — the check is cheap (indexed FK lookup). BPM engine orchestrates multi-step dependency chains above this layer.

**FHIR alignment is event-only:** tasks-core never calls HAPI FHIR directly. No FHIR SDK in this service. The healthstack-careplans-service consumes Kafka events and owns the FHIR write. This keeps tasks-core deployable without HealthStack active.

**Recurring task generation via BullMQ:** On task COMPLETED transition, if `TaskRecurrence` row exists, a BullMQ job enqueues to generate the next instance. Next instance gets a fresh `id`; old instance is marked COMPLETED. This avoids RRULE expansion in the request path.

**contextRef is a polymorphic reference:** contextType enum (FHIR_TASK / PERSONAL / PROJECT) disambiguates what contextRef points to. Do not embed domain-specific data in the task row.

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| personal-tasks-service | REST internal (task CRUD delegation) + Kafka task.* | Task state |
| healthstack-careplans-service | Kafka task.created, task.status.changed | FHIR Task mapping |
| notify-service | Kafka task.created, task.assigned, task.overdue | Reminders, escalation |
| BPM engine (Temporal) | TaskEscalationWorkflow activity | Overdue escalation |

---

## Files That Must Not Break

- Status transition validator — personal-tasks-service and healthstack both depend on correct machine output.
- `task.created` Kafka schema — healthstack-careplans-service parses it to produce FHIR Task.
- TaskDependency enforcement — clinical care plan task chains depend on FINISH-TO-START semantics.

---

## Linter / Test Runner

```bash
bun run lint
bun run test
bun run test:e2e    # requires Docker Compose (PG + Kafka + Temporal dev server)
bun run build
```

---

## Open Questions (from ADR-0203 §8)

- OQ-2: rrule-temporal migration — track Node 24 LTS (2026-Q4); update `@curaos/recurrence` internals.
- OQ-5: FHIR R5 `Task` adds `requestedPerformer` and `location`; plan adoption after R5 ballot.
