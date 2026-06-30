# Grill — M10 #276 calendar-core-service scaffold (PR #1)

- **Story:** your-org/curaos-ai-workspace#276 — calendar-core-service scaffold + iCalendar VEVENT + recurrence
- **Branch:** `agent/scaffold-calendar-core-276` (submodule `calendar-core-service`)
- **Reviewer (opposite harness):** Codex (`codex exec`, default model, `model_reasoning_effort=high`, `--sandbox read-only`)
- **Date:** 2026-06-02
- **Verdict:** PROCEED — all Major findings addressed in-PR; no user-escalation candidates (Codex item 7: "None").

## Scope reviewed

Filled calendar domain on top of the hardened codegen mold (curaos `2d2379e`, `--core-only`): `drizzle/schema.ts`, `src/calendars/calendar.dto.ts`, `src/calendars/calendars.service.ts`, `src/calendars/calendars.controller.ts`, `src/events/calendar-event-producer.ts`, `src/index.ts`, `test/calendars.service.test.ts` — vs ADR-0203 §4.1.

## Codex findings + resolutions

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | Duplicate master events allowed — `(tenant_id, uid, recurrence_id)` unique lets multiple `NULL recurrence_id` rows share a uid (Postgres NULLs distinct) | Major | **FIXED** — added partial unique index `calendar_event_tenant_uid_master_unique ... WHERE recurrence_id IS NULL` (schema + regen `0001` migration). |
| 2 | VEVENT envelope omits `exdates` + attendees | Major | **FIXED** — added `exdates` + `attendee_count` to the VEVENT payload (attendee party ids stay reference-only off the wire). |
| 3 | Update can create invalid interval (one-sided dtstart/dtend patch) | Major | **FIXED** — `updateEvent` revalidates the MERGED `dtstart`/`dtend` and throws 400. Test added. |
| 4 | RRULE guard allows SECONDLY/MINUTELY/HOURLY; ADR §4.1 lists DAILY/WEEKLY/MONTHLY/YEARLY | Major | **FIXED** — narrowed `RRULE_FREQ` to the ADR set; HOURLY-reject test added. |
| 5 | Timezone contract not enforced (no luxon; any string tzid) | Major | **DEFERRED (documented)** — `@curaos/recurrence` (rrule.js + luxon) is a stub (README only); IANA TZID validation ships with the engine. Scaffold stores tzid verbatim. |
| 6 | Tenant isolation not FK-enforced (child rows can drift tenant_id) | Major | **DEFERRED (documented)** — composite-tenant FK / app-layer hard check is a follow-up; core layer stores `tenant_id` on every row + the app layer (modulith host) enforces tenant scope via `TenantInterceptor` (ADR-0201 §2.5). |
| 3 (glossary) | `CalendarEvent` overloads "calendar resource event" vs RFC 5545 VEVENT; generic `curaos.core.calendar.*` topics coexist with VEVENT `calendar.event.*` | — | **FIXED** — renamed the generic container surface to `CalendarContainer*` + `buildCalendarContainerMessage`; VEVENT surface stays `CalendarVevent*` + `buildCalendarVeventMessage`. |
| attendees | DTO/service/event omit attendees entirely | — | **FIXED** — minimal `CalendarAttendeeSchema` (RFC 5545 ROLE + PARTSTAT) wired into the create DTO + record + event count. |
| PATCH persistence | `PATCH` requires `request.calendarEvent`; no app-layer interceptor wired | — | **DEFERRED (documented)** — the persistence interceptor is the modulith host's job ([[curaos-modulith-standalone-rule]]); the core scaffold returns 400 rather than fabricate a record. |

Deferred items: recurrence EXPANSION, free/busy, `.ics` import/export, IANA TZID validation, composite-tenant FK, app-layer repository + transactional-outbox wiring — all gated on `@curaos/recurrence` (stub) + the modulith host. Codex confirmed (item 4): "`@curaos/recurrence` is stub-only, so deferring expansion/free-busy/import-export is defensible."

## CodeRabbit (free CLI, committed-vs-main)

5 findings — Critical 1, Major 2, Minor 2:
- **Major (domain): null-pointer when `input.dtend` is null** — FIXED: `dtend` made nullable in the update schema (clears the end time) + null-safe `?.toISOString() ?? null` in the service + test.
- **Critical: jose@6 ESM-only vs `"type": "commonjs"`** — MOLD-emitted (`package.json`); affects every scaffolded service identically. Flagged to orchestrator (mold-class).
- **Major: `src/main.ts` bootstrap lacks `.catch`** — MOLD-emitted. Flagged to orchestrator.
- **Minor: dead SSN assertion in `audit-chain-e2e.test.ts`** — MOLD-emitted test. Flagged.
- **Minor: hardcoded dev `DATABASE_URL` fallback in `drizzle.config.ts`** — MOLD-emitted dev-only fallback. Flagged.

## Verdict

PROCEED to PR. Every domain-code Major/Critical from both reviewers is fixed (master-uniqueness, interval revalidation, RRULE FREQ set, attendees + exdates payload, dtend-null safety, glossary disambiguation). Deferred items are gated on the unpublished `@curaos/recurrence` engine + modulith host and are documented in the PR body + FORESIGHT. Mold-class CodeRabbit findings flagged to the orchestrator (no tools/codegen edits — concurrent sibling scaffold worker).
