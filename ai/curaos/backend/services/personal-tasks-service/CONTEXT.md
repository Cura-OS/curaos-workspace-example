# CONTEXT — personal-tasks-service

**ADR-0203 §4.5 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-05-24

---

## Role in Cluster

UX presentation layer on top of tasks-core-service. Adds personal productivity features (inbox, projects, labels, NLP date parsing, CalDAV VTODO) that are not tasks-core primitives. Consumes `task.*` Kafka events for push sync to CalDAV clients.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (inbox count, quick-add queue)
- `@curaos/recurrence` (rrule.js + luxon) — recurring task generation
- Radicale sidecar (GPL-3.0, same instance as personal-calendar-service if co-deployed)
- chrono-node (MIT) — NLP date parsing
- Kafka consumer: `task.*` — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

Prior CONTEXT.md referenced Spring Boot / Kotlin — superseded by ADR-0100/ADR-0203.

---

## Key Design Decisions

**Delegation pattern:** All task CRUD → tasks-core-service REST. personal-tasks-service never writes to tasks-core PG tables directly. PG schema holds only project/label/inbox metadata local to personal UX.

**VTODO via Radicale (same sidecar as personal-calendar if co-deployed):** VTODO and VEVENT share a Radicale process when both personal-calendar-service and personal-tasks-service run together. Radicale collection isolation keeps task and calendar namespaces separate.

**Recurring task next-instance generation:** On tasks-core `task.status.changed` (→ COMPLETED), personal-tasks-service checks TaskRecurrence and enqueues next instance via tasks-core REST. `@curaos/recurrence` computes nextDueAt.

**chrono-node NLP parsing:** Runs on incoming quick-add text to extract date/time. Structured task then sent to tasks-core. Supported: "next Monday", "tomorrow 3pm", "in 2 weeks", "every Friday". Falls back to explicit date input on parse failure (no silent misparse).

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| tasks-core-service | REST internal (task CRUD delegation) | Task state |
| Radicale sidecar | VTODO CalDAV | iOS Reminders / Thunderbird sync |
| notify-service | Via tasks-core task.assigned / task.overdue events | Reminders |
| Kafka task.* | Consumer (for CalDAV push sync) | Sync external clients on state change |

---

## Linter / Test Runner

```bash
bun run lint
bun run test
bun run test:e2e    # requires Docker Compose (PG + Kafka + Valkey + Radicale sidecar)
bun run build
```

---

## Open Questions (from ADR-0203 §8)

- OQ-1: Radicale vs `webdav-server` (MIT) — evaluated at Wave 2 for both personal-calendar and personal-tasks.
- OQ-2: rrule-temporal migration tracking for `@curaos/recurrence` internals — 2026-Q4.
