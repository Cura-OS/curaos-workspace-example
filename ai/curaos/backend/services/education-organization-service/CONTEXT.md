# Agent Context — education-organization-service

**ADR authority:** ADR-0207 §3.2
**Stack locked:** NestJS (TypeScript), PG17, Valkey, Kafka/NATS, Temporal TS SDK
**Last updated:** 2026-06-04

---

## Role in EducationStack

Institutional layer. Sits above `education-core-service` (curriculum primitives) and alongside `education-personal-service` (learner profile). Owns institution registry, accreditation lifecycle, enrollment management, faculty/staff assignments, and external SIS roster sync. Does not duplicate the people model — all human entities anchor in neutral-core services (Org, Party, HR).

---

## Stack Rules

- **Runtime:** NestJS (TypeScript). Stack locked by ADR-0100 + ADR-0207.
- **Database:** PG17, schema-per-tenant. Drizzle-owned migrations. Valkey for enrollment waitlist sorted-set.
- **Messaging:** Kafka (NATS fallback). Outbox pattern. Transactional outbox in same PG schema.
- **Workflow:** Temporal TS SDK via Workflow Manager (ADR-0122). All accreditation + enrollment workflows registered here.
- **Auth/RBAC:** Better Auth (ADR-0120) + Cerbos ABAC. Institution-scoped roles (accreditation coordinator, department head, institution admin).
- **Federated identity:** CuraOS acts as SAML SP for inbound institutional IdP. Configuration per Institution entity.
- **Audit:** Hash-chain PG audit (ADR-0104). Mandatory on enrollment record reads by non-learner principal (FERPA).

---

## Key Architecture Notes

### Current Foundation Implementation

Issue #413 established the service-local TypeScript package and tested ports/adapters for institution references, accreditation transitions, enrollment/waitlist lifecycle, FERPA read audit, and OneRoster 1.2 inbound/outbound mapping. The current implementation stays framework-light internally so unit tests run without PG/Kafka/Valkey/Temporal/Cerbos, while package dependencies and ports preserve the locked NestJS/Drizzle/Zod/Temporal/Cerbos runtime direction.

Upstream verification on 2026-06-04 found `org-core-service` and `party-core-service` have concrete packages and DTO/service surfaces, while `education-core-service` and `hr-service` are still clean-slate README-only submodules in this checkout. Until those contracts land, this service must keep education-core and HR interactions behind reference ports and must not invent local program, learner, employee, or person profile models.

### No Duplicate People Model

`FacultyAssignment` stores only `staffId` (FK to hr-service) + `courseId` + `role`. HR attributes never copied into this service. Teaching load aggregation happens in ClickHouse.

### Institution as Org Extension

`Institution` entity extends `org-core-service` Org via institutionId = orgId (same ID). Education-specific attributes (type, accreditationStatus[], enrollmentCapacity) stored in this service's schema. Org lifecycle events consumed to sync base attributes.

### Accreditation Workflow Architecture

```
AccreditationCycle (PG)
  → Temporal workflow (registered via Workflow Manager)
  → 9 stages with SLA timers per AccreditingBody config
  → Evidence attached at any stage (SeaweedFS + PG manifest)
  → Forms questionnaire submission → Temporal signal
  → Breach alert → Workflow Manager escalation → notify-service
```

Stage transitions are Cerbos-gated ABAC checks. Store only transition events in PG `accreditation_transitions` table; full history queryable.

### Enrollment Waitlist

Valkey sorted-set key: `waitlist:{tenantId}:{programId}:{cohortId}`. Score = `application_timestamp_ms + (priority_delta * 1e12)`. On seat opening: `ZPOPMIN` → promote to ACCEPTED → emit `education.enrollment.accepted`.

### OneRoster Sync

- Inbound (SIS → CuraOS): Temporal scheduled workflow, configurable cron per institution. Diff against `EnrollmentRecord` table. Errors → `oneroster_sync_errors` PG table; operator review UI via Builder.
- Outbound (CuraOS → external consumer): REST + CSV provider endpoints at `/oneroster/v1p2/*`. OAuth 2.0 bearer token auth.

---

## Dependency Contracts

Upstream (consumed): `education-core-service` program catalog. Any breaking change to Course/Program API = coordinated migration.

Downstream consumers: `education-personal-service` reads enrollment records from this service (EnrollmentRecord subset cached in personal service). Event-driven cache invalidation via `education.enrollment.accepted` / `education.enrollment.withdrawn`.

---

## Files That Must Not Break

Current foundation:

- `src/index.ts` — reference-only domain services, ports, in-memory adapters, OneRoster mapping, and test harness.
- `test/institution.spec.ts` — org-core reference-only institution behavior.
- `test/accreditation.spec.ts` — workflow-owned and Cerbos-gated stage transitions.
- `test/enrollment.spec.ts` — enrollment/waitlist lifecycle events and FERPA read audit.
- `test/oneroster.spec.ts` — OneRoster 1.2 inbound sync and outbound provider mapping.

Planned live adapters:

- `src/accreditation/accreditation.workflow.ts` — Temporal workflow; active cycles in-flight.
- `src/enrollment/enrollment.service.ts` — Enrollment lifecycle; learner data integrity.
- `src/enrollment/waitlist.service.ts` — Valkey sorted-set; loss = waitlist corruption.
- `src/oneroster/oneroster.provider.ts` — OneRoster REST API; external SIS consumers depend on it.
- `src/events/outbox.service.ts` — Transactional outbox; event loss = enrollment sync gap.
- DB migrations in `migrations/` — always additive once tenant schemas exist.

---

## Linting / Testing Commands

```bash
bun test                    # unit tests
bun test:integration        # requires PG + Kafka + Valkey + Temporal
bun test:accreditation      # workflow stage traversal tests
bun test:oneroster          # OneRoster 1.2 conformance (CSV + REST)
bun lint:boundaries         # no reverse deps, no HealthStack imports
bun type-check
```

---

## Cross-Phase Dependencies

| Phase | Dependency |
|---|---|
| Wave 1 | education-core-service, org-core-service, hr-service, Workflow Manager, Forms, Auth, calendar-core-service, storage-service, commerce-service, notify-service |
| Wave 1 consumers | education-personal-service (enrollment record cache), healthstack-education-service (institution roster for clinical training cohorts) |
| Wave 2 (deferred) | Ed-Fi K-12 adapter, proctoring/exam integrity, fee/tuition billing beyond commerce hook |
