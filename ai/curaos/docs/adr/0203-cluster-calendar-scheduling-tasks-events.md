# ADR-0203 — Cluster: Calendar + Scheduling + Tasks + Events (Wave 1 Lite)

**Status:** Draft
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — temporal coordination cluster
**Services:** calendar-core-service, business-scheduling-service, personal-calendar-service, tasks-core-service, personal-tasks-service, event-core-service
**Baseline:** ADR-0100 (NestJS/TS runtime) · ADR-0101 (PG17/Valkey) · ADR-0102 (Kafka/NATS outbox) · ADR-0103 (REST+GraphQL) · ADR-0120 (Auth) · ADR-0122 (Temporal/BPM) · ADR-0150 (alignment rules)
**Related:** ADR-0115 (HealthStack) · ADR-0114 (AI/agent)

---

## 1. Scope and naming disambiguation

Six services form this cluster. Two naming collisions require upfront resolution.

### 1.1 "event-core-service" — two meanings of "event"

The term *event* is overloaded in CuraOS:

| Meaning | Where used | Service responsible |
|---|---|---|
| **Domain/messaging event** — durable, versioned, Kafka/NATS payload | ADR-0102; all services | Not a service — infrastructure pattern |
| **Calendar event entity** — a meeting, appointment, or occurrence anchored to a datetime | iCalendar VEVENT, FHIR Appointment | calendar-core-service |
| **Public / community event** — a ticketed or open gathering with registration, attendance, RSVPs | CuraOS Commerce/Sales/Site domains | event-core-service |

**Decision:** `event-core-service` owns **public/community event** primitives only (registrations, attendees, RSVPs, ticketing hooks, recurrence of recurring public events). It does NOT own domain messaging infrastructure (that is ADR-0102 / Kafka) and does NOT own personal calendar events (that is calendar-core-service). The name `event-core-service` is retained because it matches the domain map in AGENTS.md §5.1 — but its scope boundary is now explicit.

### 1.2 "event sourcing" vs "event entity"

ADR-0102 governs event sourcing primitives (outbox, Debezium CDC, Apicurio schema registry). event-core-service has no involvement in that infrastructure. If any service within this cluster uses event sourcing internally, it does so via ADR-0102 patterns — no new primitives.

---

## 2. Context

### 2.1 Why a cluster ADR

These six services share:
- A common dependency on **recurrence math** (RFC 5545 RRULE) and **timezone-aware datetime** (luxon or Temporal API)
- **CalDAV** as the external interop protocol for personal calendars and tasks (VCALENDAR/VTODO)
- **FHIR resource alignment** — business-scheduling-service maps to FHIR Schedule/Slot/Appointment; tasks-core-service maps to FHIR Task (consumed by healthstack-careplans-service per ADR-0115)
- **BPM integration** — all scheduling and task assignment flows route through Temporal workflows per ADR-0122
- **Cross-service event contracts** on the same Kafka topics (slot.booked, task.assigned, calendar.event.created, public.event.registered)

Deciding each service in isolation would produce duplicated recurrence logic and incompatible slot/task models. The cluster ADR locks shared primitives first; per-service sections add specifics.

### 2.2 OSS landscape (evaluated 2026-05)

| Candidate | License | Assessment |
|---|---|---|
| Cal.com | AGPL-3.0 | Production-grade scheduling. As of 2025-2026 the main repo moved private; public fork is `calcom/cal.diy`. AGPL requires source disclosure for SaaS distribution — **cannot wrap as embedded component**. Use as UX reference + inspiration only; do not fork or bundle. |
| Radicale | GPL-3.0 | Minimal Python CalDAV/CardDAV server. GPL — cannot embed in NestJS service. Deploy as **sidecar** behind personal-calendar-service for CalDAV protocol exposure. |
| Baikal | GPL-3.0 | PHP CalDAV/CardDAV server. Same GPL constraint. Radicale preferred: pure Python, lower ops burden, better HA story. |
| Vikunja | AGPL-3.0 | Go task manager with CalDAV (VTODO) export and REST API. AGPL — cannot embed. Deploy as **optional sidecar** for personal-tasks CalDAV sync if needed; otherwise reimplement VTODO emission in personal-tasks-service directly (minimal surface). |
| rrule.js | MIT | iCalendar RRULE parser/generator. **Adopt.** Covers FREQ, BYDAY, BYMONTHDAY, BYSETPOS, EXDATE, RDATE, UNTIL, COUNT. MIT license; no distribution concern. |
| rSchedule | MIT | Date-library-agnostic recurrence; better tz support than rrule.js. **Evaluate as rrule.js complement** for complex exclusion sets; not a replacement. |
| rrule-temporal | MIT | Advances rrule.js to use TC39 Temporal instead of legacy Date. **Adopt when Temporal API reaches Node LTS stable** (expected Node 24 LTS, 2026-Q4). Until then use rrule.js + luxon. |
| luxon | MIT | Timezone-aware datetime for NestJS. **Adopt** as the project-wide datetime library. Covers IANA tz database, DST-safe arithmetic, ISO 8601, RFC 2822. |
| HAPI FHIR (R4) | Apache 2.0 | JVM FHIR server (per ADR-0150). NestJS services call HAPI FHIR REST for FHIR resource persistence where required (Appointment, Schedule, Slot, Task). |

---

## 3. Shared primitives (cluster-wide decisions)

### 3.1 Recurrence engine

All recurrence — calendar events, scheduling slots, public events, recurring tasks — uses a **single shared NestJS library package** (`@curaos/recurrence`) wrapping rrule.js + luxon. No service implements its own recurrence math.

`@curaos/recurrence` exposes:
- `parseRRule(rruleString, tzid): RecurrenceRule` — parses RFC 5545 RRULE string
- `expand(rule, window: {start, end}): DateTime[]` — bounded expansion (hard cap: 1000 instances per call to prevent runaway expansion on FREQ=DAILY COUNT=3650)
- `toICalString(rule): string` — serializes back to RFC 5545 RRULE string
- `nextOccurrence(rule, after: DateTime): DateTime | null`

Timezone resolution uses IANA tz database via luxon. All datetimes stored as UTC + original TZID string preserved for round-trip fidelity (per RFC 5545 §3.2.19).

### 3.2 CalDAV sidecar pattern

Personal-calendar-service and personal-tasks-service expose CalDAV/CardDAV interop via a **Radicale sidecar** (GPL-isolated). CuraOS NestJS service owns auth + business logic; Radicale handles the CalDAV WebDAV wire protocol only. The sidecar stores `.ics` files backed by the NestJS service's PG database via a thin sync adapter (NestJS → Radicale storage filesystem → periodic reconcile, or Radicale webhook on write). Apple Calendar, Outlook (via outlook-caldav-synchronizer), Thunderbird, and iOS Reminders connect to the Radicale endpoint.

Radicale sidecar deployment is **opt-in per tenant** (config flag). Tenants without it use the native CuraOS calendar/tasks UI or REST API.

### 3.3 Outbox + event contracts (ADR-0102 pattern)

Every state change in this cluster emits a durable domain event via the transactional outbox (Debezium CDC → Kafka). Canonical topics:

| Topic | Producer | Key consumers |
|---|---|---|
| `calendar.event.created` | calendar-core-service | notify-service, BPM engine, analytics |
| `calendar.event.updated` | calendar-core-service | personal-calendar-service (sync), business-scheduling-service |
| `scheduling.slot.booked` | business-scheduling-service | healthstack-clinical-scheduling-service, notify-service, billing |
| `scheduling.slot.cancelled` | business-scheduling-service | notify-service, waitlist processor |
| `task.created` | tasks-core-service | personal-tasks-service, healthstack-careplans-service, notify-service |
| `task.status.changed` | tasks-core-service | BPM engine (saga checkpoints), careplans |
| `public.event.registered` | event-core-service | notify-service, commerce-service, analytics |
| `public.event.cancelled` | event-core-service | notify-service, refund workflow |

All schemas versioned in Apicurio registry (ADR-0102). PHI-adjacent payloads (patient appointment data) carry only references — no PHI inline — per ADR-0115 PHI partitioning rule.

### 3.4 BPM integration (ADR-0122)

Scheduling workflows, waitlist processing, task escalation, and public event registration flows run as **Temporal workflows**. Services are Temporal activity workers; they do not implement saga logic internally. Examples:

- `BookAppointmentWorkflow` — checks availability, reserves slot (optimistic lock), sends confirmation, handles timeout+cancellation
- `TaskEscalationWorkflow` — monitors overdue tasks, escalates via notify-service with exponential backoff
- `PublicEventRegistrationWorkflow` — validates capacity, charges (commerce-service hook), confirms, queues waitlist on overflow

### 3.5 Multi-tenancy

All services: **PG schema-per-tenant** (ADR-0101). Kafka topics prefixed `{tenantId}.` (ADR-0102). CalDAV sidecar: one Radicale instance per tenant (or per-user collection isolation within a shared instance — config choice). No cross-tenant calendar or task data access.

---

## 4. Per-service decisions

### 4.1 calendar-core-service

**Responsibility:** Canonical calendar primitives. VCALENDAR containers, VEVENT entities, recurrence rules, timezone registry, free/busy computation, iCalendar import/export.

**Tech stack:**
- NestJS (TypeScript) — ADR-0100
- PostgreSQL 17 (schema-per-tenant) — ADR-0101
- `@curaos/recurrence` (§3.1) for all RRULE math
- luxon for all datetime arithmetic
- `ical.js` (MPL-2.0) for `.ics` file parsing/generation — handles VCALENDAR container, VEVENT, VTIMEZONE, VALARM components
- Valkey for free/busy cache (TTL 5 min; invalidated on event mutation)

**Data model (core entities):**

| Entity | Key fields |
|---|---|
| `Calendar` | id, tenantId, ownerId (user or org), name, color, visibility, defaultTzid |
| `CalendarEvent` | id, calendarId, uid (globally unique RFC 5545 UID), title, dtstart (UTC), dtend (UTC), tzid, rrule, exdates[], recurrenceId (for exceptions), status, location, description, attendees[] |
| `CalendarAttendee` | eventId, partyId, role (CHAIR/REQ-PARTICIPANT/OPT-PARTICIPANT), status (ACCEPTED/DECLINED/TENTATIVE/NEEDS-ACTION), rsvpRequired |
| `FreeBusyCache` | calendarId, window, slots (compressed bitset), computedAt |

**RFC 5545 compliance surface:**
- RRULE: FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), BYDAY, BYMONTH, BYMONTHDAY, BYSETPOS, UNTIL, COUNT, INTERVAL — all via `@curaos/recurrence`
- EXDATE: exception dates stored as UTC array; excluded from expansion
- RECURRENCE-ID: individual instance overrides stored as separate `CalendarEvent` row linked via `uid` + `recurrenceId`
- VTIMEZONE: stored per-calendar; served in .ics exports; luxon resolves IANA name to current tz data
- VALARM: reminder triggers stored on event; actuated by notify-service consumer

**Free/busy API:**
- `GET /calendars/free-busy?calendarIds=[]&start=&end=&tzid=` — returns busy windows; used by business-scheduling-service for conflict detection
- Response: array of `{start, end, status: BUSY|TENTATIVE|FREE}` intervals

**iCalendar import/export:**
- `POST /calendars/{id}/import` — accepts `.ics` file; parses with ical.js; stores events; emits `calendar.event.created` per VEVENT
- `GET /calendars/{id}/export` — streams `.ics` file; RFC 5545 compliant; includes VTIMEZONE blocks

**Provider abstraction (ADR-0150 §2):**
- Local: CuraOS calendar-core-service (default)
- 3rd-party: Google Calendar API / Microsoft Graph Calendar API (BYO OAuth credentials per tenant) — personal-calendar-service consumes this abstraction; calendar-core is always local

---

### 4.2 business-scheduling-service

**Responsibility:** Organization-level scheduling of bookable resources (rooms, equipment, staff, providers). Manages schedule templates, slot generation, booking, cancellation, waitlists, and no-show handling. Clinical extension point for healthstack-clinical-scheduling-service (ADR-0115).

**Tech stack:**
- NestJS (TypeScript)
- PostgreSQL 17
- Valkey (slot availability cache; optimistic-lock slot reservation)
- `@curaos/recurrence` for recurring schedule templates
- FHIR R4 resource alignment: `Schedule`, `Slot`, `Appointment` (stored in HAPI FHIR sidecar when HealthStack active; native PG otherwise)
- Temporal workflows (ADR-0122): `BookAppointmentWorkflow`, `WaitlistWorkflow`, `NoShowWorkflow`

**Scheduling patterns supported:**

| Pattern | Description | Example |
|---|---|---|
| Recurring template | Repeating availability blocks (Mon/Wed/Fri 9-12) | Staff weekly schedule |
| Episodic | One-off availability windows | Conference room special booking |
| Same-day | Real-time slot opening for urgent bookings | Walk-in or same-day clinic slot |
| Block schedule | Contiguous block reserved for procedure type | OR block time |
| Waitlist | Overflow queue; auto-offer on cancellation | Patient waitlist |

**Data model (core entities):**

| Entity | Key fields |
|---|---|
| `Resource` | id, tenantId, type (ROOM/EQUIPMENT/STAFF), name, locationId, capabilities[], timezone |
| `ScheduleTemplate` | id, resourceId, rrule, slotDuration (minutes), slotCapacity, serviceTypes[], validFrom, validUntil |
| `Slot` | id, scheduleTemplateId, resourceId, start (UTC), end (UTC), status (FREE/BUSY/BLOCKED/TENTATIVE), capacity, booked |
| `Booking` | id, slotId, bookedBy (partyId), bookedFor (partyId), serviceType, status, notes, externalRef |
| `Waitlist` | id, slotId (or templateId), partyId, priority, notifyAt, offeredAt, expiresAt |

**Slot generation strategy:**
Slots are generated lazily on-demand for the next N days (configurable, default 90) when a template is created or when a query window extends past generated range. Generation runs as a BullMQ job (ADR-0150 §3) scheduled via `@nestjs/schedule`. Generated slots cached in Valkey for fast availability reads; source of truth in PG.

**Conflict detection:**
`calendar-core-service` free/busy API (§4.1) is called during booking to detect attendee conflicts. Resource-level conflicts detected via PG row lock on `Slot.status`. Optimistic lock: slot status transitions via `UPDATE ... WHERE status = 'FREE' RETURNING *`; returns empty on collision → retry up to 3× then 409.

**FHIR alignment (HealthStack-active tenants):**
When HealthStack is active, `Slot` and `Booking` are mirrored to HAPI FHIR R4 as `Schedule`, `Slot`, and `Appointment` resources via healthstack-clinical-scheduling-service. ADR-0115 governs FHIR write paths. business-scheduling-service emits `scheduling.slot.booked` → healthstack-clinical-scheduling-service consumes and writes FHIR Appointment resource.

**AI no-show prediction (ADR-0114 integration):**
Optional module: on `scheduling.slot.booked`, an async Temporal activity calls the AI service (ADR-0114 vLLM or external LLM) with anonymized slot features (service type, lead time, day-of-week, historical no-show rate for resource). Returns `noShowProbability: float`. Stored on `Booking`; surfaced to staff UI. No PHI sent to AI service.

**Provider abstraction (ADR-0150 §2):**
- Local: CuraOS business-scheduling-service (default)
- 3rd-party: Cal.com API (cal.diy self-hosted) as scheduling engine BYO — tenant config routes booking API to external Cal.com instance. CuraOS wraps Cal.com REST API behind the same `SchedulingProvider` interface. Note: Cal.com AGPL requires the tenant to also run it self-hosted; cannot be embedded.

---

### 4.3 personal-calendar-service

**Responsibility:** Individual user calendar UX and sync. Aggregates calendars from calendar-core-service (CuraOS native), plus 3rd-party BYO calendars (Google, Apple, Outlook). Provides unified timeline view per user. Manages CalDAV sync via Radicale sidecar.

**Tech stack:**
- NestJS (TypeScript)
- PostgreSQL 17 (user preferences, sync state, external calendar metadata)
- Valkey (merged timeline cache per user, TTL 2 min)
- Radicale sidecar (GPL-isolated, CalDAV/CardDAV wire protocol)
- Google Calendar API (OAuth 2.0 per-user token, stored encrypted in PG per ADR-0108)
- Microsoft Graph Calendar API (OAuth 2.0)
- Apple CalDAV endpoint (via generic CalDAV client)
- `ical.js` for `.ics` parsing in sync adapter

**Sync model:**

| Source | Direction | Mechanism |
|---|---|---|
| CuraOS calendar-core | Bidirectional | Internal API + event subscription |
| Google Calendar | Bidirectional | Push notifications (Google Calendar push channel) + pull fallback every 15 min |
| Microsoft Graph | Bidirectional | Microsoft Graph change notifications (webhooks) + pull fallback |
| Apple / generic CalDAV | Pull-first | Poll every 15 min; push via CalDAV scheduling (RFC 6638) if server supports |
| iOS Reminders / Thunderbird | Client-initiated CalDAV | Radicale sidecar endpoint |

**Sync conflicts:** Last-write-wins by `LAST-MODIFIED` (RFC 5545 §3.8.7.3). Conflicts surfaced in UI for user resolution when `SEQUENCE` numbers disagree. No silent data loss.

**Privacy controls:**
- Per-calendar visibility: PRIVATE / CONFIDENTIAL / PUBLIC (RFC 5545 CLASS property)
- Attendee detail hiding: CONFIDENTIAL calendars show busy/free only when shared
- 3rd-party sync tokens stored per-user, encrypted (ADR-0108 OpenBao)
- No cross-user calendar data access without explicit share grant

**Provider abstraction (ADR-0150 §2):**
- Local: CuraOS native calendar-core-service (default)
- 3rd-party: Google Calendar / Microsoft Outlook / Apple CalDAV (BYO OAuth credentials per user)

---

### 4.4 tasks-core-service

**Responsibility:** Task primitives shared across all CuraOS domains and vertical overlays. Creates, assigns, transitions, and tracks tasks. FHIR Task resource alignment for HealthStack. Consumed by personal-tasks-service (user-facing UX) and healthstack-careplans-service (clinical task execution).

**Tech stack:**
- NestJS (TypeScript)
- PostgreSQL 17
- Valkey (task count aggregates per assignee/project, TTL 30s)
- FHIR R4 `Task` resource alignment (write via HAPI FHIR when HealthStack active)
- Temporal activities for task escalation (ADR-0122)

**Data model:**

| Entity | Key fields |
|---|---|
| `Task` | id, tenantId, title, description, status (DRAFT/ACTIVE/COMPLETED/CANCELLED/ON-HOLD), priority (ROUTINE/URGENT/ASAP/STAT), assigneeId (partyId), requesterId (partyId), dueAt, completedAt, contextType (FHIR_TASK/PERSONAL/PROJECT), contextRef, tags[], parentTaskId (for subtasks) |
| `TaskDependency` | id, taskId, dependsOnTaskId, type (FINISH-TO-START/START-TO-START) |
| `TaskComment` | id, taskId, authorId, body, attachments[], createdAt |
| `TaskRecurrence` | id, taskId, rrule, nextDueAt, lastGeneratedAt |

**Status machine:**
```
DRAFT → ACTIVE → COMPLETED
ACTIVE → ON-HOLD → ACTIVE
ACTIVE → CANCELLED
DRAFT → CANCELLED
```
All transitions emit `task.status.changed` Kafka event.

**FHIR Task alignment:**

| CuraOS field | FHIR R4 Task field |
|---|---|
| status | status (draft/requested/received/accepted/rejected/ready/cancelled/in-progress/on-hold/failed/completed/entered-in-error) |
| priority | priority (routine/urgent/asap/stat) |
| assigneeId | owner (Reference to Practitioner/Patient/RelatedPerson) |
| requesterId | requester |
| dueAt | restriction.period.end |
| contextRef | basedOn / focus (Reference to any FHIR resource) |

When HealthStack active: tasks-core-service emits `task.created` → healthstack-careplans-service maps to FHIR Task and writes to HAPI FHIR. Inverse: FHIR Task updates from external FHIR sources sync back via healthstack-interop-service → `task.status.changed` event.

**Dependency enforcement:**
`FINISH-TO-START` dependency: blocked task cannot transition to `ACTIVE` until all dependencies are `COMPLETED`. Checked server-side on status transition. BPM engine (Temporal) orchestrates multi-task dependency chains for clinical care plans.

---

### 4.5 personal-tasks-service

**Responsibility:** Individual user task management. GTD-class personal productivity UX (inbox capture, projects, labels, priority, due dates, recurring tasks). CalDAV VTODO export for interop with iOS Reminders, Thunderbird Tasks, etc.

**Tech stack:**
- NestJS (TypeScript)
- PostgreSQL 17
- Valkey (user task inbox count, quick-add queue)
- Radicale sidecar (VTODO CalDAV exposure, same sidecar as personal-calendar-service if co-deployed)
- `@curaos/recurrence` for recurring task generation

**UX model (Todoist/TickTick parity):**

| Feature | Implementation |
|---|---|
| Inbox capture | Default `Project = Inbox`; quick-add via API or keyboard shortcut |
| Projects | Hierarchical projects (parent/child); one task belongs to one project |
| Labels/tags | Many-to-many; color-coded |
| Priority | P1–P4 (maps to tasks-core STAT/ASAP/URGENT/ROUTINE) |
| Due dates + times | luxon; timezone-aware; reminders via notify-service |
| Recurring tasks | `@curaos/recurrence` rrule; generates next instance on completion |
| Subtasks | tasks-core-service `parentTaskId` |
| Comments | tasks-core-service `TaskComment` |
| Natural language input | Parsed client-side; structured task sent to API (date parsing via chrono-node MIT) |

**VTODO CalDAV export (Vikunja pattern):**
Tasks exposed as `VTODO` objects via Radicale sidecar. Mapping:

| CuraOS Task field | VTODO property |
|---|---|
| title | SUMMARY |
| dueAt | DUE |
| status (COMPLETED) | STATUS:COMPLETED + COMPLETED timestamp |
| priority | PRIORITY (1=STAT, 5=URGENT, 9=ROUTINE) |
| rrule | RRULE |
| tags | CATEGORIES |

iOS Reminders, Thunderbird, Evolution sync via CalDAV/VTODO. Radicale sidecar exposes `/.well-known/caldav` per RFC 6764.

**Does NOT own:** Task primitives, dependencies, FHIR alignment. Delegates to tasks-core-service. personal-tasks-service is a presentation/UX layer on top of tasks-core.

---

### 4.6 event-core-service

**Responsibility:** Public and community event primitives. Ticketed conferences, workshops, community gatherings, recurring public events. Registration, attendance, RSVP, capacity management, waitlist. Distinct from calendar events (§1.1).

**Tech stack:**
- NestJS (TypeScript)
- PostgreSQL 17
- Valkey (registration count cache, idempotency keys)
- `@curaos/recurrence` for recurring public events (weekly meetup, monthly conference)
- Temporal workflows: `PublicEventRegistrationWorkflow`, `PublicEventCancellationWorkflow`
- Commerce hook: capacity-limited events trigger payment via commerce-service (separate service, not in this cluster)

**Data model:**

| Entity | Key fields |
|---|---|
| `PublicEvent` | id, tenantId, title, description, organizerId (partyId), start (UTC), end (UTC), tzid, locationId, locationType (PHYSICAL/VIRTUAL/HYBRID), virtualUrl, capacity, registrationDeadline, rrule (for recurring), status (DRAFT/PUBLISHED/CANCELLED/COMPLETED), visibility (PUBLIC/MEMBERS/INVITE-ONLY) |
| `EventRegistration` | id, eventId, registrantId (partyId), status (CONFIRMED/WAITLISTED/CANCELLED), checkedInAt, ticketRef, customFields{} |
| `EventAttendance` | id, eventId, registrationId, checkedInAt, checkedOutAt |
| `EventCapacityLedger` | id, eventId, confirmedCount, waitlistCount, updatedAt |

**Relationship to calendar-core-service:**
On `PublicEvent` publish: event-core-service calls calendar-core-service to create a corresponding `CalendarEvent` (read-only, linked by `externalRef`). Attendees who register receive a calendar invite via CalendarAttendee addition. This is a one-way projection: source of truth is the `PublicEvent` entity; calendar entry is derived.

**Relationship to site/commerce:**
Public events appear on tenant sites via site-service rendering (ADR-0121a). Paid events route registration through commerce-service for payment collection. event-core-service holds only the event and registration state; payment state lives in commerce-service.

**Recurrence of public events:**
Recurring public events (weekly meetup) generate individual `PublicEvent` instances per occurrence via BullMQ job using `@curaos/recurrence`. Each instance is independently cancellable. Future instances are generated on-demand for the next 90 days (same strategy as business-scheduling-service slot generation).

---

## 5. Cross-service integration map

```
personal-calendar-service
  ├── reads calendar-core-service (REST: calendar CRUD, free/busy)
  ├── syncs via Radicale sidecar (CalDAV, VCALENDAR/VEVENT)
  └── consumes calendar.event.* (Kafka)

business-scheduling-service
  ├── reads calendar-core-service /free-busy (conflict detection)
  ├── emits scheduling.slot.booked → healthstack-clinical-scheduling-service (FHIR Appointment)
  ├── emits scheduling.slot.booked → notify-service (confirmation)
  └── Temporal: BookAppointmentWorkflow, WaitlistWorkflow, NoShowWorkflow

personal-tasks-service
  ├── delegates all task CRUD to tasks-core-service (REST internal)
  ├── exposes VTODO via Radicale sidecar
  └── consumes task.* (Kafka, for push sync to CalDAV clients)

tasks-core-service
  ├── emits task.created, task.status.changed → healthstack-careplans-service
  ├── emits task.created → notify-service
  └── Temporal: TaskEscalationWorkflow

event-core-service
  ├── creates CalendarEvent in calendar-core-service on publish
  ├── emits public.event.registered → notify-service, commerce-service
  └── Temporal: PublicEventRegistrationWorkflow

healthstack-clinical-scheduling-service (ADR-0115)
  ├── extends business-scheduling-service (consumes scheduling.slot.booked)
  ├── writes FHIR Appointment → HAPI FHIR sidecar
  └── maps clinical slot features for AI no-show model (ADR-0114)

healthstack-careplans-service (ADR-0115)
  ├── consumes task.created from tasks-core-service
  └── writes FHIR Task → HAPI FHIR sidecar
```

---

## 6. Non-functional requirements

| NFR | This cluster's binding |
|---|---|
| Performance | Free/busy query P95 < 200ms (Valkey cache). Slot availability P95 < 100ms. Task list P95 < 150ms. |
| Recurrence expansion | Hard cap 1000 instances per `expand()` call. No unbounded RRULE expansion in request path. |
| Timezone correctness | All datetimes stored UTC in PG. TZID preserved for display. DST transitions handled by luxon. No app-level TZ offset arithmetic. |
| CalDAV compliance | RFC 4791 (CalDAV), RFC 5545 (iCalendar), RFC 6638 (scheduling), RFC 6764 (service discovery). Tested against Apple Calendar, Outlook, Thunderbird interop matrix. |
| FHIR alignment | FHIR R4: Appointment, Schedule, Slot, Task. Alignment tested against HAPI FHIR R4 validator. |
| Multi-tenancy | PG schema-per-tenant. Radicale: per-tenant collection isolation. Kafka: `{tenantId}.` prefix. |
| Air-gap | No external dependencies in request path. 3rd-party sync (Google/MS) is opt-in BYO. Radicale self-hosted. rrule.js + luxon bundled. |
| PHI isolation | FHIR Appointment fields with PHI live in HAPI FHIR sidecar (HealthStack schema), not in business-scheduling-service PG tables. Booking entity holds partyId reference only. |
| Observability | OTel traces on all cross-service calls. `calendar.event.*`, `scheduling.slot.*`, `task.*` Kafka consumer lag monitored. Free/busy cache hit rate tracked. |

---

## 7. License compliance summary

| OSS component | License | Usage mode | SaaS distribution safe? |
|---|---|---|---|
| rrule.js | MIT | Bundled in `@curaos/recurrence` | Yes |
| rSchedule | MIT | Optional bundled complement | Yes |
| rrule-temporal | MIT | Bundled (when Temporal API stable) | Yes |
| luxon | MIT | Bundled in all services | Yes |
| ical.js | MPL-2.0 | Bundled (file-level copyleft only) | Yes — no modification required |
| Radicale | GPL-3.0 | **Sidecar only** — not linked, not bundled | Yes — separate process |
| Vikunja | AGPL-3.0 | **Not used** — VTODO implemented natively | N/A |
| Cal.com / cal.diy | AGPL-3.0 | **Not bundled** — UX reference only; optional BYO sidecar per tenant | Tenant responsibility if self-hosted |
| HAPI FHIR | Apache-2.0 | JVM sidecar (per ADR-0150) | Yes |
| chrono-node | MIT | Bundled in personal-tasks-service (NLP date parsing) | Yes |

---

## 8. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| OQ-1 | Radicale vs custom CalDAV implementation — is GPL sidecar ops overhead justified at scale? Evaluate custom CalDAV WebDAV middleware (Node `webdav-server` MIT) as alternative. | Calendar team | Wave 2 |
| OQ-2 | rrule-temporal adoption timing — track Node 24 LTS (expected 2026-Q4); plan migration from rrule.js+luxon. | Core libs team | 2026-Q4 |
| OQ-3 | Cal.com BYO sidecar support — define `SchedulingProvider` interface contract so cal.diy can be dropped in without service rewrite. | business-scheduling team | Wave 1 |
| OQ-4 | event-core-service scope boundary — confirm whether ticketed event payment flow stays as a hook to commerce-service or whether event-core should own a lightweight payment state machine. | Product | Wave 1 kickoff |
| OQ-5 | FHIR R5 / R6 migration path — FHIR R5 `Appointment` resource adds `previousAppointment` and `originatingAppointment` links relevant to clinical scheduling. Plan adoption timeline. | HealthStack team | Post-FHIR-R6-ballot (est. 2027) |

---

## 9. Decision summary

| Service | Runtime | DB | Key libraries | CalDAV | FHIR | Temporal |
|---|---|---|---|---|---|---|
| calendar-core-service | NestJS/TS | PG17 | rrule.js, luxon, ical.js | Export only | No (neutral) | No |
| business-scheduling-service | NestJS/TS | PG17 + Valkey | rrule.js, luxon | No | Schedule/Slot/Appointment (HealthStack) | Yes |
| personal-calendar-service | NestJS/TS | PG17 + Valkey | ical.js, luxon | Radicale sidecar | No | No |
| tasks-core-service | NestJS/TS | PG17 + Valkey | luxon | No | Task (HealthStack) | Yes |
| personal-tasks-service | NestJS/TS | PG17 | rrule.js, luxon, chrono-node | Radicale sidecar (VTODO) | No | No |
| event-core-service | NestJS/TS | PG17 + Valkey | rrule.js, luxon | No | No | Yes |

**Shared across all six:** `@curaos/recurrence` (rrule.js + luxon wrapper), Kafka outbox (ADR-0102), PG schema-per-tenant (ADR-0101), OTel instrumentation (ADR-0107), Better Auth JWT (ADR-0120).

---

## 10. Consequences

**Positive:**
- Single recurrence library (`@curaos/recurrence`) eliminates rrule divergence across services.
- GPL-isolated Radicale sidecar gives CalDAV interop without license contamination of NestJS codebase.
- FHIR alignment via event-driven bridge (not direct write) keeps neutral services free of HealthStack dependency.
- Lazy slot/instance generation with 90-day window + hard recurrence cap prevents runaway expansion.
- Temporal workflows for booking/task escalation ensures durability and compensability without saga logic in service code.

**Negative / trade-offs:**
- Radicale sidecar adds operational complexity (second process, sync adapter, filesystem state).
- Lazy slot generation requires a background worker and introduces a small window where future slots are not yet generated (mitigated by 90-day pre-generation).
- Cal.com BYO sidecar mode requires tenants to self-host an AGPL instance — cannot be fully managed by CuraOS SaaS.
- rrule-temporal migration (OQ-2) will require updating `@curaos/recurrence` internals; planned for 2026-Q4.

---

*Canonical reference ADRs: [ADR-0100](0100-foundation-platform-runtime.md) · [ADR-0101](0101-data-layer.md) · [ADR-0102](0102-event-messaging.md) · [ADR-0103](0103-api-surface.md) · [ADR-0114](0114-ai-agent-integration.md) · [ADR-0115](0115-healthstack-overlays.md) · [ADR-0120](0120-foundation-auth.md) · [ADR-0122](0122-foundation-workflow-manager.md) · [ADR-0150](0150-baseline-alignment-rules.md)*


---

## 2026-06-01 — calendar-core + tasks-core pulled forward to M10

`calendar-core-service` + `tasks-core-service` are seeded under the **M10** platform-shared-services Epic (#24), NOT this cluster's own milestone, per user decision 2026-06-01. The remaining ADR-0203 services (business-scheduling, personal-calendar, personal-tasks, event-core) stay in this cluster for their own milestone. See AUTO-DECISION-LOG.md.
