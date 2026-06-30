# CONTEXT — calendar-core-service

**ADR-0203 §4.1 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-05-24

---

## Role in Cluster

Foundation service. All other cluster services read calendar-core; it reads none of them. Provides the free/busy API that business-scheduling-service uses for conflict detection and the CalendarEvent API that event-core-service projects public events into.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (free/busy cache, TTL 5 min)
- `@curaos/recurrence` — shared library wrapping rrule.js + luxon; 1000-instance expansion cap
- ical.js (MPL-2.0) — VCALENDAR/VEVENT parse + generate
- luxon — all datetime arithmetic; IANA tz database
- Kafka transactional outbox (Debezium CDC, Apicurio registry) — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

No Spring Boot. No Kotlin. Prior CONTEXT.md referenced wrong runtime — superseded by ADR-0100/ADR-0203.

---

## Key Design Decisions

**UTC + TZID storage:** dtstart/dtend stored as UTC timestamptz in PG; original TZID string preserved in a separate column for RFC 5545 round-trip fidelity. Never derive display timezone from UTC offset alone.

**Recurrence via @curaos/recurrence only:** No service-local rrule logic. All expansion goes through `@curaos/recurrence.expand()` with the hard 1000-instance cap. Unbounded expansion (e.g. FREQ=DAILY;COUNT=3650) is rejected at the library boundary.

**Instance override pattern:** Recurring event exceptions stored as a sibling `CalendarEvent` row with matching `uid` + non-null `recurrenceId`. Do not modify the base event's rrule for single-instance overrides.

**Free/busy cache invalidation:** Valkey key `freeBusy:{tenantId}:{calendarId}:{windowHash}` invalidated on any `CalendarEvent` mutation within the calendar. Write-through invalidation, not TTL-only.

**ical.js for parse/generate only:** ical.js (MPL-2.0) is the I/O layer. Do not use it for recurrence expansion — use `@curaos/recurrence` instead. ical.js handles VCALENDAR container, VTIMEZONE, VALARM components correctly; rrule.js handles expansion.

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| business-scheduling-service | REST GET /calendars/free-busy | Busy intervals for conflict detection |
| personal-calendar-service | Kafka calendar.event.* + REST CRUD | Event sync |
| event-core-service | REST POST (create CalendarEvent on public event publish) | Derived calendar projection |
| notify-service | Kafka calendar.event.created (VALARM triggers) | Reminder dispatch |
| analytics | Kafka calendar.event.* | Event metrics |

---

## Files That Must Not Break

- Free/busy endpoint — business-scheduling-service calls this on every booking attempt.
- `calendar.event.created` Kafka schema — notify-service and personal-calendar-service depend on it.
- ical.js import parser — `.ics` import is a user-facing feature; parse errors surface as 400.

---

## Linter / Test Runner

```bash
bun run lint        # ESLint + Prettier check
bun run test        # Jest unit tests
bun run test:e2e    # NestJS e2e (Docker Compose up required)
bun run build       # tsc compile check
```

---

## Open Questions (from ADR-0203 §8)

- OQ-1: Radicale vs custom CalDAV WebDAV middleware — evaluate `webdav-server` (MIT) as Radicale alternative for Wave 2.
- OQ-2: rrule-temporal adoption — track Node 24 LTS (est. 2026-Q4); plan migration from rrule.js+luxon to rrule-temporal.
