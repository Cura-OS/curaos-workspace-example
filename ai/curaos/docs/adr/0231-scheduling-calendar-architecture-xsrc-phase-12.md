# ADR-0231: Scheduling/calendar architecture (XSRC Phase 12)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


Status: Proposed (2026-06-29)
Target Version: v1 (calendar-core + tasks-core already in M10 working set; scheduling/queue/recurrence enrichments file forward where they exceed v1 acceptance)
Phase: XSRC mining pipeline Phase 12 (ADR synthesis). Complements, does not supersede, ADR-0203 (Wave 1 Lite cluster decision).
Extends: ADR-0203 (calendar/scheduling/tasks/events cluster) - ADR-0102 (event/outbox) - ADR-0101 (data layer) - ADR-0122 (Temporal/BPM) - ADR-0115 (HealthStack overlays) - ADR-0153/0154 (codegen recipe + provider abstraction).
Precedence note: where this ADR touches stack picks, banned/permitted OSS, generator order, or naming, the canonical `ai/rules/curaos_*.md` rules win (rule > ADR per AGENTS.md §13b). This ADR records the scheduling/calendar mining decision and its evidence; it does not restate rule text.

---

## 1. Context

ADR-0203 already locked the temporal-coordination cluster (calendar-core, business-scheduling, personal-calendar, tasks-core, personal-tasks, event-core) as a Wave 1 design. This ADR is the Phase 12 synthesis over the XSRC external-corpus mining: it answers the narrower question "given what the cloned OSS systems actually contain and what we already have built, how should scheduling/calendar evolve, and what (if anything) do we port versus reject?" under the binding person-centric, no-feature-loss lens.

### 1.1 Local state (what we have - inventory evidence)

`.ai-analysis/local-project-inventory.json` reports these scheduling/calendar/task modules as already `real-working` first-party services, not scaffolds:

- `calendar-core-service` (real-working) + `calendar-sdk` (real-working) - `curaos/backend/services/calendar-core-service`
- `scheduling-service` (real-working) + `scheduling-sdk` (real-working)
- `tasks-core-service` (real-working) + `tasks-sdk` (real-working)
- `event-core-service` (real-working)
- `personal-calendar-service` (real-working); `automation-core-service` (real-working)
- `personal-tasks` app (real-working)

Still scaffold-only (so any new capability lands here, generator-first, not as a parallel store): `business-projects-service`, `business-scheduling-service`, `personal-tasks-service`, `personal-calendar` app.

Note a naming reality the mining surfaced: the live booking service is `scheduling-service` (real-working), while ADR-0203's `business-scheduling-service` is still scaffold-only. This ADR treats `scheduling-service` as the canonical booking owner and `business-scheduling-service` as a name to reconcile, not a second engine (see Risks, rolling-update rule).

### 1.2 Source state (what the corpus contains - mining evidence)

`.ai-analysis/generated-analysis/source-feature-index.json` (609 features) yields 115 scheduling/calendar/task/recurrence/queue/cron features across the corpus. Concrete high-signal records:

- VistA-M (`permissive`): Scheduling package = 1,179 routines, FileMan Files 44/44.001/44.002; RPCs `ORWSCH SCHEDULE`, `ORWSCH FIND NEXT SLOT`; wait-list escalation workflow. Source files `Packages/Scheduling/Routines`, `Packages/Order Entry Results Reporting/Routines (ORWSCH*)`.
- OpenMRS reference app (`agpl`): `esm-appointments-app` + `esm-service-queues-app` (Appointment & Queue Management, QueueEntry/QueueRoom).
- OpenEMR (`gpl`): `openemr_postcalendar_events` appointment/calendar model.
- RAPTOR (`Apache-2.0`): room/technician resource scheduling (`raptor_schedule_location`).
- Odoo/ERPNext (`LGPL-3`/`GPL-3`): `project_project`, `project_task`, `project_milestone`, `project_task_recurrence`, `task.json`, `project.json` - the project/milestone/stage envelope around tasks.
- Windmill (`AGPL-3`): `NewSchedule` struct (cron + timezone + retry + error_handler) - the most complete machine-schedule shape. Frappe (`MIT`): `auto_repeat.py`, RQ background-job/task-queue.
- Dolibarr (`GPL-3`): `bookcal` calendar/availabilities cards (mis-tagged as a task feature).

### 1.3 Person-centric lens (binding, from PERSON-CENTRIC-LENS.md)

The corpora are org-centric (provider grids, cashier desks, admin calendars). The lens forces every mined capability to yield BOTH surfaces over one shared contract: a person-facing journey surface AND a management/compliance surface, with no source feature dropped. From `source-to-local-map.json` for `calendar-core-service`:

- `person_centric_reshape`: "Provider-grid scheduling becomes the person's own calendar (my upcoming/past appts, self-book, reschedule); the provider/room scheduling grid is the management complement."
- `person_surface`: "personal/patient app: my calendar, self-book/reschedule"
- `management_surface`: "calendar-core: provider/room/resource scheduling, RRULE, occurrence expansion"
- `no_loss_check`: "Recurrence, occurrence expansion, appointment model present; provider/room scheduling is the scheduling-service overlay (separate domain) but primitives exist here."

---

## 2. Decision options

### Option A - Reference-only, hold the line (status quo + mark complete)

Treat the entire scheduling/calendar surface as already first-party and stronger-than-source; consume the corpus as pattern reference only; port nothing. Mining backs part of this: `source-to-local-map.json` tags the Dolibarr "agenda events on business objects" row `integration_mode=reject`, `local_maturity=stronger-than-source` ("Local calendar-core + scheduling-service are stronger than this source row"); and the calendar primitives row is `reuse_value=low`, `integration_mode=pattern-reference-only` ("calendar-core-service ... covers source scheduling primitives. Reference-only.").

### Option B - Targeted port-adapt of the genuine deltas (recommended)

Keep calendar-core/scheduling primitives first-party (no port), but port-adapt the specific shapes the corpus has and we measurably lack, each generator-first into contracts/SDK before service code:

1. Queue / waiting-room model (OpenMRS `QueueEntry`/`QueueRoom`) and find-next-slot RPC pattern (VistA `ORWSCH FIND NEXT SLOT`) and room/technician resource scheduling (RAPTOR) -> enrich `scheduling.tsp`. Mapping reuse_value=medium, mode=pattern-reference-only -> port-adapt, `gf=contract-typespec`; `no_loss_check`: "Queue/waiting-room, room+technician scheduling, recurrence, find-next-slot all mappable onto existing scheduling+calendar contracts; nothing dropped."
2. Machine schedule entity (cron + timezone + enabled + retry + error_handler) from Windmill `NewSchedule` -> `automation-core` contract. Mapping is `present-weak`, reuse=medium, mode=port-adapt, `gf=contract-typespec`. Keep cron for machine triggers, RRULE for human/calendar recurrence; document the split (do not duplicate recurrence math).
3. Project/milestone/stage envelope + task recurrence from Odoo/ERPNext -> `business-projects-service` (scaffold) as a read-model + governance overlay over `tasks-core` (which stays the single Task entity owner). Mapping `partial`, reuse=high, mode=port-adapt, `gf=contract-typespec`.
4. Premium-schedule / installment cadence (insurance) - reuse the single donation/subscription/contract cadence primitive, not a new recurrence engine (gap-analysis cross-cutting note: "one cadence primitive ... for donation+subscription+contract+recurring-invoice").

### Option C - Service-boundary integration of an OSS scheduler (Cal.com / Radicale BYO)

Run an external scheduler (Cal.com `cal.diy`) or CalDAV server (Radicale) as a sidecar behind the existing provider abstraction (ADR-0154), per-tenant opt-in, for interop reach without re-implementing CalDAV/booking.

### Option D - Big-bang consolidation (rejected outright)

Collapse calendar-core + scheduling-service + business-scheduling-service into one mega-service and re-derive from a single generator pass. Rejected: it would rewrite real-working code, violates rolling-update (no parallel `-v2` path), and the mining shows the existing split is sound.

---

## 3. Recommended option

**Option B (targeted port-adapt of the genuine deltas), with Option C as an opt-in provider-abstraction sidecar where interop demands it.** Option A is correct for the primitives (we do not re-port iCal/RRULE/occurrence-expansion/booking - those are stronger-than-source) but wrong as a whole answer, because mining identifies four real deltas with `port-adapt` modes and high/medium reuse. Option D is rejected.

Concretely:

- Do NOT port: calendar event/RRULE/occurrence expansion, FHIR Appointment/Slot booking, double-booking prevention - first-party and ahead of source (reuse_value=low/none, mode pattern-reference-only/reject).
- DO port-adapt, generator-first (contract/SDK first, then service, then FE via ui-app-emit): queue/waiting-room + find-next-slot + room/technician resource scheduling into `scheduling.tsp`; machine `Schedule` entity into `automation-core`; project/milestone/stage + task-recurrence envelope into `business-projects-service` as an overlay over `tasks-core`.
- Reuse, never duplicate: one cadence primitive for premium-schedule/installment; one recurrence engine (`@curaos/recurrence` / RRULE) for human recurrence, cron only for machine triggers.
- Provider abstraction (Option C) stays available: Cal.com / Radicale as per-tenant BYO sidecars behind the existing `SchedulingProvider`/CalDAV seam (ADR-0203 §3.2, ADR-0154), never embedded.

Generator order is binding (gap-analysis authored note): feature -> codegen template/emitter (`tools/codegen`) -> `@curaos/contracts` (`.tsp` + AsyncAPI) -> `@curaos/<name>-sdk` -> service controller/drizzle -> FE via `ui-app-emit`. New domain models go in the service `specs/<name>.tsp`, not the mold.

---

## 4. Source evidence (cited)

- `.ai-analysis/generated-analysis/source-feature-index.json`: 115 cluster features; VistA Scheduling (1,179 routines, Files 44/44.001/44.002, `ORWSCH SCHEDULE`/`ORWSCH FIND NEXT SLOT`); OpenMRS `esm-appointments-app` + `esm-service-queues-app` (QueueEntry/QueueRoom); Frappe `frappe/utils/background_jobs.py` RQ job queue + `auto_repeat.py`.
- `.ai-analysis/source-to-local-map.json` (163 mappings): `calendar-core-service` primitives row (reuse=low, pattern-reference-only); `scheduling-service + calendar-core-service` appointment/slots/queue row (reuse=medium, port-adapt of queue/find-next-slot/room scheduling); `automation-core-service + calendar-core-service` cron row (present-weak, port-adapt Windmill `NewSchedule`); `tasks-core (+ business-projects)` Project+Task row (partial, port-adapt Odoo/ERPNext); Dolibarr agenda row (`reject`, stronger-than-source).
- Source files cited in mappings: `odoo/addons/project/models/{project_project,project_task,project_milestone,project_task_recurrence}.py`; `erpnext/projects/doctype/{task,project}`; `windmill/backend/windmill-types/src/schedule.rs`; `frappe/automation/doctype/auto_repeat/auto_repeat.py`; `openemr (postcalendar)`; `vista-m File 44 APPOINTMENT (ORWSCH)`; `raptor_schedule_location`; `dolibarr/htdocs/bookcal/*`.
- `.ai-analysis/code-reuse-ledger.json` mode distribution: E:port-adapt=99, G:pattern-reference-only=51, D:api-adapter=4, C:run-as-background-service=3, H:reject=6. Cluster entries: Windmill schedule = "G pattern-reference-only" -> automation-core; Odoo project module = "E port-adapt" -> business-projects.

## 5. Local evidence (cited)

- `.ai-analysis/local-project-inventory.json`: calendar-core/scheduling/tasks-core/event-core/personal-calendar/automation-core = `real-working` services; calendar-sdk/scheduling-sdk/tasks-sdk = `real-working` packages; `business-projects-service`, `business-scheduling-service`, `personal-tasks-service`, `personal-calendar` app = `scaffold-only` (land new work here). Stack: TypeScript 5.9, NestJS 11, Drizzle (primary), Zod 4, TypeSpec 1.12 -> OpenAPI 3.1, AsyncAPI 3 over Kafka/Redpanda, Bun, Turborepo + Nx.
- `.ai-analysis/gap-analysis.json` (`_computed.absent_or_weak_mappings`): "Cron / scheduled triggers (timezone, enable/disable, recurrence)" = present-weak; "Activities: tasks, calls, meetings, notes with parent polymorphic links + reminders + calendar" = stub; "Premium schedules & installments" = present-weak. Cross-cutting reuse note: "Activity=Task+calendar (polymorphic parent, not parallel types) ... one cadence primitive ... for donation+subscription+contract+recurring-invoice."
- Existing decision record: ADR-0203 (cluster lock) and its 2026-06-01 amendment (calendar-core + tasks-core pulled forward to M10 Epic #24).

## 6. Consequences

Positive:
- No rewrite of real-working scheduling/calendar code; the deltas are additive and generator-first, so the mold absorbs every edge case (generator-evolution rule).
- One Task entity (`tasks-core`), one recurrence engine (RRULE/`@curaos/recurrence`), one cadence primitive - no parallel stores, satisfying reuse-DRY and rolling-update.
- Person + management surfaces both delivered from one contract, satisfying the binding lens with explicit `no_loss_check` per mapping.
- Queue/waiting-room + find-next-slot + room/technician + machine-schedule entity close the named present-weak/stub gaps without GPL/AGPL contamination (all ported as fresh TS over standard shapes).

Negative / trade-offs:
- `scheduling-service` vs `business-scheduling-service` naming must be reconciled (one is real, one scaffold) before the queue/resource enrichments land, or the overlap re-emerges.
- `business-projects-service` overlay must stay a read-model + governance layer; a careless port could recreate a second task store.
- Cron (machine) vs RRULE (human) split is a documentation-enforced boundary; if undocumented, two recurrence sources drift.
- Provider-abstraction sidecars (Cal.com/Radicale) move ops burden to tenants for AGPL/GPL isolation.

## 7. Risks

- Overlap ambiguity (from mapping `risk`): "Must keep tasks-core the single task entity owner; business-projects is a project/milestone overlay + read model, not a parallel task store (rolling-update rule)." Mitigation: business-projects reads tasks-core; no Task table of its own.
- Two recurrence sources (from mapping `risk`): "keep cron for automation triggers, RRULE for calendar; document the split." Mitigation: contract-level note + lint.
- Naming collision `scheduling-service` (real) vs `business-scheduling-service` (scaffold, ADR-0203): risk of a second booking engine. Mitigation: pick one canonical owner before enrichment (recommend `scheduling-service`); retire or alias the scaffold via forward migration, never a `-v2` path.
- FHIR alignment correctness (queue/appointment) is HealthStack-overlay sensitive; PHI must stay in overlay schemas, events carry refs only (ADR-0115).

## 8. License implications

`.ai-analysis/license-risk-register.json` verdicts gate every port:

- VistA-M, RAPTOR, vista-dashboard-rules, fhir-on-vista: Apache-2.0 -> `safe-to-vendor-or-copy`. Find-next-slot + room/technician resource patterns are safe to port directly.
- Frappe: MIT -> `safe-to-vendor-or-copy` (RQ job-queue / auto_repeat shapes portable).
- Odoo: LGPL-3 / ERPNext: GPL-3-only / OpenEMR, OpenHospital, Dolibarr: GPL-3 -> `port-adapt-or-service-boundary`. No verbatim copy; re-express data model + state machine as fresh TypeSpec/TS. The Odoo/ERPNext project/milestone/task-recurrence port must be a clean-room re-model, not a code lift.
- OpenMRS reference-app: AGPL-3 -> `service-boundary-only-or-reference`. The queue/waiting-room CONCEPT is mined; AGPL code is not embedded - QueueEntry/QueueRoom re-modeled fresh.
- Windmill: AGPL-3 (backend/frontend) + Apache-2.0 (clients/OpenAPI) -> `service-boundary-only-or-reference`. The `NewSchedule` struct SHAPE (cron/tz/retry/error_handler) is a reference; re-express in `automation.tsp`, do not lift Rust.
- Cal.com / cal.diy (AGPL-3) and Radicale/Baikal (GPL-3): provider-abstraction SIDECARS only (separate process), never linked or bundled (ADR-0203 §7). Bundled libs stay MIT/MPL-2.0 (rrule.js, luxon, ical.js).

Conforms to `[[curaos-local-vs-3rdparty-rule]]` (local-first + dual-surface) and `[[curaos-reuse-dry-rule]]` (single canonical owner per primitive).

## 9. Validation needed

- Resolve `scheduling-service` vs `business-scheduling-service` canonical-owner question (blocks queue/resource enrichment landing). Open question for product/architecture.
- Confirm queue/waiting-room belongs on `scheduling.tsp` neutral contract vs HealthStack overlay (PHI boundary check per ADR-0115).
- FHIR R4 conformance of enriched Slot/Appointment + queue against HAPI FHIR validator (ADR-0203 NFR).
- Snapshot/contract tests: find-next-slot RPC parity (VistA semantics), cron<->RRULE non-duplication, project-milestone read-model consistency over tasks-core.
- Verify-before-build: prove the enriched scheduling contract renders real seeded data on both person and management surfaces before any image build (`[[curaos-verify-before-build-rule]]`).
- Version gate: confirm each delta against its Target Version; calendar-core/tasks-core enrichments fit v1 (M10); queue/resource/project-envelope deltas that exceed v1 acceptance file forward to v1.1, never crammed (`[[curaos-version-planning-rule]]`).

## 10. Implementation follow-up (XSRC backlog epic)

File the Phase 12 deltas as child Stories under the XSRC mining backlog Epic (XSRC-EPIC, the `generated_for` owner across all `.ai-analysis/` Phase 4-12 artifacts; Phase 10 backlog is the parent that this ADR feeds). Each Story carries `Target Version` and `generator_first_target`:

1. XSRC-SCHED-1 - Enrich `scheduling.tsp`: queue/waiting-room (`QueueEntry`/`QueueRoom`), find-next-slot RPC, room/technician resource scheduling. `gf=contract-typespec`. Blocked on canonical-owner resolution (§9). Target: v1/v1.1.
2. XSRC-SCHED-2 - `automation-core` machine `Schedule` entity (cron + tz + enabled + retry + error_handler) from Windmill shape; document cron-vs-RRULE split. `gf=contract-typespec`. Target: v1.
3. XSRC-SCHED-3 - Promote `business-projects-service` scaffold: project/milestone/stage + task-recurrence read-model/governance overlay over `tasks-core` (Odoo/ERPNext clean-room port). `gf=contract-typespec`. Target: v1.1.
4. XSRC-SCHED-4 - Reuse single cadence primitive for premium-schedule/installment (no new recurrence engine). `gf=contract-typespec`. Target: v1.1.
5. XSRC-SCHED-0 (blocker) - Reconcile `scheduling-service` vs `business-scheduling-service` naming via forward migration; gate Stories 1-4. Target: v1.

Each Story folds every uncovered edge case back into the generator/SDK/contract owner per `[[curaos-generator-evolution-rule]]`; per-service hot-fixes forbidden. Link this ADR from the XSRC Phase 13 final report and the backlog Epic body.

---

Canonical reference: ADR-0203 (cluster) - ADR-0102/0101/0122/0115/0153/0154. Rules: `[[curaos-generator-evolution-rule]]`, `[[curaos-local-vs-3rdparty-rule]]`, `[[curaos-reuse-dry-rule]]`, `[[curaos-rolling-update-rule]]`, `[[curaos-version-planning-rule]]`, `[[curaos-verify-before-build-rule]]`.