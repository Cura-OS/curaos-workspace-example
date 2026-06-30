# workflow-core-service — Agent Context

**ADR-0204** | **Updated:** 2026-06-05

---

## Role in One Line

Neutral NestJS module providing typed Temporal + Activepieces + cron primitives to all workflow overlay services. Engine lives in CuraOS Workflow Manager (ADR-0122); this service is the gateway.

---

## Stack (authoritative — use these, no substitutions)

| Layer | Choice |
|---|---|
| Runtime | NestJS (TypeScript) |
| Workflow client | `nestjs-temporal-core` + `@temporalio/client` |
| Activity lib | `@curaos/workflow-activities` (this service owns it) |
| Messaging | `@nestjs/microservices` (Kafka transport) + NATS |
| Queue | `bullmq` (cron bridge; runtime owned by Workflow Manager per ADR-0122) |
| Data | PG17 (schema-per-tenant) + Valkey |
| Auth | Better Auth + Cerbos |
| Secrets | OpenBao |
| Observability | OTel + Grafana |
| Test runner | `bun test` + `@temporalio/testing` |

---

## What This Service Does vs Does Not Do

**Does:**
- Export `WorkflowCoreModule` — imported by overlay services
- Register shared Temporal activities (`@curaos/workflow-activities`)
- Maintain workflow template registry (PG)
- Maintain process-definition YAML/JSON with tenant Payload CMS overrides (M5-S2)
- Forward workflow start/signal/query to Workflow Manager via gRPC
- Emit `workflow.*` and `ProcessDef*` events to Kafka/NATS
- Emit M14 subject-rights workflow skeleton events (`subject-rights.requested.v1`, `subject-rights.step-completed.v1`) through the durable outbox with tenant, opaque/pseudonymous subject reference only (internal UUID/token/hash; never direct PII), correlation, legal-hold, service, counts, and exception metadata
- Emit M14 break-glass lifecycle events (`curaos.security.break-glass.*.v1`) through the durable outbox with tenant, request, requester, reason, resource scope reference, approvers, expiry, review state, and correlation metadata; identity-service owns temporary privilege enforcement and audit-core-service owns tamper-evident projection
- Ship `patient-admission-v1` workflow definition + activities + signals in `src/temporal/patient-admission*.ts` — three-step saga (await `curaos.core.patient.registered.v1` → clinician approval task → emit `curaos.healthstack.patient.admitted.v1`) consumed by M7-S4 from `healthstack-patient-service` per [m7-user-decisions.md](../../../docs/m7-user-decisions.md) D2 (correlation-id chain through every event)
- Expose `PatientAdmissionSaga` in-process emulator for overlay services to drive the state machine without a Temporal cluster (per `curaos-modulith-standalone-rule`)

**Does NOT:**
- Own Temporal cluster or worker pool (→ Workflow Manager ADR-0122)
- Own Activepieces runtime (→ Workflow Manager)
- Own visual editor (→ Workflow Canvas ADR-0121d)
- Contain business or personal domain logic (→ overlay services)

**Research artifacts:**
- [research/workflow-core-service-shell-research.md](research/workflow-core-service-shell-research.md)
- [research/2026-05-26-process-definition-management-research.md](research/2026-05-26-process-definition-management-research.md)
- [research/2026-05-26-process-definition-adversarial-review.md](research/2026-05-26-process-definition-adversarial-review.md)
- [research/workflow-instance-task-state-research.md](research/workflow-instance-task-state-research.md)
- [research/2026-06-05-subject-rights-preimplementation-grill.md](research/2026-06-05-subject-rights-preimplementation-grill.md)
- [research/2026-06-05-break-glass-workflow.md](research/2026-06-05-break-glass-workflow.md)

---

## Dependency Tree

```
This service imports:
  - CuraOS Workflow Manager gRPC client (ADR-0122)
  - @nestjs/microservices (Kafka/NATS)
  - nestjs-temporal-core, @temporalio/*

Imported by:
  - business-workflow-service
  - personal-workflow-service
  - healthstack-workflow-service (ADR-0115)
```

---

## Codegen Recipes

- `workflow-core:activity` — scaffold Temporal activity class + unit test
- `workflow-core:base-workflow` — scaffold abstract `CuraOSWorkflow` + registry hook
- Both follow `.gen.ts` split (ADR-0123 §4); never touch non-`.gen.ts` files

---

## Agent Operating Rules

- Read ADR-0204 §3.1 before any implementation work.
- No BPMN, no Spring Boot, no Kotlin — those are pre-ADR-0204 artifacts; discard.
- No vertical domain logic in this service — propose extraction to overlay if tempted.
- Multi-tenant routing is Workflow Manager's responsibility; pass tenant context only.
- PHI must never appear in `@curaos/workflow-activities` payloads — flag if encountered.
- Audit every workflow lifecycle event (start/complete/fail/retry) via hash-chain PG interceptor.
- Run `bun test` for tests; `@temporalio/testing` for workflow unit tests (no live Temporal server needed).

---

## Key Events (Kafka/NATS topics)

| Event | Direction | Introduced |
|---|---|---|
| `ServiceStarted` | produced | M5-S1 |
| `workflow.template.registered` | produced | M5-S1 |
| `workflow.template.deprecated` | produced | M5-S1 |
| `workflow.instance.started` | produced | M5-S1 |
| `workflow.instance.completed` | produced | M5-S1 |
| `workflow.instance.failed` | produced | M5-S1 |
| `ProcessDefCreated` | produced | M5-S2 |
| `ProcessDefUpdated` | produced | M5-S2 |
| `ProcessDefDeleted` | produced | M5-S2 |
| `ProcessStarted` | produced | M5-S3 |
| `TaskCreated` | produced | M5-S3 |
| `TaskAssigned` | produced | M5-S3 |
| `TaskCompleted` | produced | M5-S4 |
| `SignalReceived` | produced | M5-S4 |
| `ProcessCompleted` | produced | M5-S4 |
| `SlaBreached` | produced | M5-S5 |
| `subject-rights.requested.v1` | produced | M14 |
| `subject-rights.step-completed.v1` | produced | M14 |
| `curaos.security.break-glass.requested.v1` | produced | M14 |
| `curaos.security.break-glass.approval-recorded.v1` | produced | M14 |
| `curaos.security.break-glass.rejected.v1` | produced | M14 |
| `curaos.security.break-glass.elevation-requested.v1` | produced | M14 |
| `curaos.security.break-glass.expired.v1` | produced | M14 |
| `curaos.security.break-glass.review-queued.v1` | produced | M14 |
| `curaos.security.break-glass.review-completed.v1` | produced | M14 |

---

## Event Producer / Consumer Map

| Producer | Topic | Key | Consumer |
|---|---|---|---|
| `WorkflowLifecycleService` | `curaos.workflow.events.v1` | `system` | Platform orchestration / ops consumers. |
| `AuditService` via `WorkflowAuditProducer` | `curaos.audit.events` | `verified` | audit-service per ADR-0104 / audit-sdk. |
| `TemporalWorkerService` | `curaos.workflow.events.v1` | `tenant-{id}` task queue | Workflow Manager / monitoring consumers. |
| `ProcessDefinitionService` | `curaos.workflow.events.v1` | `tenant-{id}` | business-workflow, personal-workflow, healthstack-workflow overlay services. |
| `WorkflowInstanceService` | `curaos.workflow.events.v1` | `tenant-{id}` | Workflow Manager, audit-service, overlay services. |
| `TaskEventsService` | `curaos.workflow.events.v1` | `tenant-{id}` | Workflow inbox / federated task plane (ADR-0105). |
| `SlaService` | `curaos.workflow.events.v1` | `tenant-{id}` | Monitoring, escalation handlers, audit-service. |
| `SubjectRightsWorkflowService` | `curaos.workflow.events.v1` | `tenant-{id}` | Neutral and overlay services participating in GDPR export/erasure cascades. |
| `BreakGlassWorkflowService` | `curaos.workflow.events.v1` | `tenant-{id}` | identity-service#79 for elevation/expiry, audit-core-service#12 for evidence and review projection. |

## Data Flow

1. `AppModule` installs `TenantModule.forRoot()`, `AuditModule.forRoot()`, and `@curaos/event-interceptors` lifecycle publication.
2. `WorkflowCoreModule` exports `WorkflowCoreModule`, `WorkflowEventProducer`, and `TemporalWorkerService`.
3. `WorkflowLifecycleService.onApplicationBootstrap()` sends `ServiceStarted` through `@curaos/event-interceptors`.
4. `TemporalWorkerService.registerTenantWorker({ tenantId })` computes `tenant-{id}` task queue and stores registration health.
5. `ProcessDefinitionService` loads YAML/JSON repo defaults, merges Payload CMS tenant overrides, validates via Zod, emits `ProcessDef*` audit events.
6. `WorkflowInstanceService` receives start/signal/query via gRPC forwarding to Workflow Manager; emits lifecycle events.
7. `TaskEventsService` manages task assignment, completion, and SSE delivery per M5-S4 inbox slice.
8. `SlaService` monitors SLA windows and emits `SlaBreached` on breach.
9. `SubjectRightsWorkflowService` accepts request/approval/hold/export/erasure/completion/failure transitions and enqueues idempotent M14 subject-rights events; participating services respond asynchronously with their own `subject-rights.step-completed.v1` events.
10. `BreakGlassWorkflowService` accepts request, two-person approval, rejection, expiry, review queue, and review completion transitions; it enqueues idempotent tenant-keyed break-glass events and never mutates identity roles directly.
11. `/healthz` reports HTTP, tenancy, audit, lifecycle, and Temporal worker status.

## Files That Must Not Break

| File | Contract |
|---|---|
| `src/workflow-core.module.ts` | Public module export imported by overlay services; breaking change requires semver bump + migration plan. |
| `src/index.ts` | Package barrel; consumers must use package exports, not source-relative imports. |
| `src/subject-rights/*` | M14 subject-rights lifecycle skeleton; must remain event-led, idempotent, tenant-scoped, and PHI-free. |
| `src/break-glass/*` | M14 break-glass lifecycle skeleton; must remain event-led, idempotent, tenant-scoped, PHI-free, and two-person approval only. |
| `src/temporal/tenant-task-queue.ts` | Stable `tenant-{id}` SaaS task queue naming per ADR-0122. |
| `src/temporal/hello.workflow.ts` | Deterministic sample workflow; no direct Date/random/network/process access. |
| `src/temporal/hello.activities.ts` | Activity implementation callable by Temporal worker. |
| `src/temporal/patient-admission*.ts` | M7-S4 `patient-admission-v1` workflow + activities + signals (M7-S4 D2 correlation-id chain). |
| `test/temporal-worker.integration.test.ts` | Closest executable worker/durability proof when dev compose is unavailable. |
| `@curaos/workflow-activities` activity signatures | Overlay workflow code references them; breaking changes require IR recompile for all overlay templates. |
| Template registry PG schema | Migrations must be backward-compatible. |

## Cross-Phase Dependencies

- `@curaos/workflow-activities` package (ADR-0204 P1.3) — shared by all overlay services.
- Workflow Manager gRPC surface (ADR-0122) — required for start/signal/query forwarding.
- Kafka/NATS transport (ADR-0102) — real transport replaces in-process producers once broker is wired.
- Enterprise namespace-per-tenant and on-prem cluster-per-tenant routing remain Workflow Manager responsibilities.
- Federated task inbox plane (ADR-0105) — M5-S4 REST/SSE endpoints are M5 scaffolding that backs the federated inbox.
- identity-service#79 consumes `curaos.security.break-glass.elevation-requested.v1` and `curaos.security.break-glass.expired.v1` to grant/revoke temporary emergency privilege without permanent role mutation.
- audit-core-service#12 projects workflow-core break-glass request/approval/rejection/elevation/expiry/review events plus identity break-glass use/failure events into tamper-evident evidence.
- Notification delivery remains pending; workflow-core emits lifecycle events that notify/task planes can subscribe to in later lanes.

---

## Open Questions (per ADR-0204 §11)

- OQ-1: Shared vs per-overlay Activepieces sidecar — confirm before P1.2; resolution target P2.1 (see [ADR-0204 §11](../../../docs/adr/0204-cluster-workflow-automation-overlays.md)).
- OQ-6: PHI boundary in `@curaos/workflow-activities` — verify during P4.5 security audit.
