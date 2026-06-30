# CONTEXT — personal-calendar-service

**ADR-0203 §4.3 · Cluster: Calendar + Scheduling + Tasks + Events**
**Last updated:** 2026-05-24

---

## Role in Cluster

UX + sync aggregation layer on top of calendar-core-service. Reads calendar-core for CuraOS native events; bridges to Google/MS/Apple for 3rd-party calendars. Exposes CalDAV via Radicale sidecar. Does not own calendar primitives.

---

## Stack (locked by ADR-0203)

- NestJS / TypeScript — ADR-0100
- PostgreSQL 17, schema-per-tenant — ADR-0101
- Valkey (merged timeline cache per user, TTL 2 min)
- Radicale sidecar (GPL-3.0, separate process, opt-in per tenant)
- ical.js (MPL-2.0) — `.ics` parsing in sync adapter
- Google Calendar API + Microsoft Graph + Apple CalDAV (BYO OAuth, encrypted via ADR-0108)
- Kafka consumer: `calendar.event.*` — ADR-0102
- Better Auth JWT — ADR-0120
- OTel — ADR-0107

Prior CONTEXT.md referenced Spring Boot / Kotlin — superseded by ADR-0100/ADR-0203.

---

## Key Design Decisions

**Radicale is GPL-isolated sidecar:** Never import Radicale code into NestJS. The sidecar exposes CalDAV endpoints; a thin sync adapter in NestJS reconciles Radicale filesystem state with PG. GPL does not propagate to CuraOS codebase.

**3rd-party OAuth tokens in OpenBao:** Per ADR-0108, all per-user OAuth refresh tokens (Google, Microsoft) stored encrypted in OpenBao. NestJS service fetches at sync time; never caches token in Valkey.

**Conflict resolution is user-surfaced:** Automated last-write-wins by LAST-MODIFIED is the default. SEQUENCE disagreements flag the conflict in the UI — no silent overwrite. Implement conflict store (PG table) for pending user resolution.

**Timeline cache invalidation:** Valkey key `timeline:{userId}:{windowHash}` TTL 2 min. Also invalidated on `calendar.event.*` Kafka event consumed for any of the user's calendars.

---

## Integration Points

| Downstream | Mechanism | Data |
|---|---|---|
| calendar-core-service | REST CRUD + Kafka calendar.event.* | CuraOS native events |
| Google Calendar API | OAuth push + pull | User's Google events |
| Microsoft Graph | OAuth webhook + pull | User's Outlook events |
| Apple CalDAV | CalDAV poll | User's Apple events |
| Radicale sidecar | Filesystem sync adapter | CalDAV wire protocol exposure |
| notify-service | Via calendar-core VALARM events | Reminders |

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

- OQ-1: Radicale vs custom CalDAV WebDAV middleware (`webdav-server` MIT) — evaluate for Wave 2.
- OQ-2: rrule-temporal migration tracking (if ical.js sync path requires it).
