# Agent Context — education-core-service

**ADR authority:** ADR-0207 §3.1
**Stack locked:** NestJS (TypeScript), PG17, Valkey, Kafka/NATS, Temporal TS SDK
**Last updated:** 2026-06-04

---

## Role in EducationStack

Foundation layer. All other EducationStack services depend downward on this service. It owns:
- Curriculum primitives (Program → Course → Module → Lesson → ContentBlock)
- Competency framework + mapping
- Learning Record Store (xAPI 2.0, embedded Wave 1)
- Activity Definition IR and content interop adapters: LTI 1.3, SCORM 2004/1.2, cmi5, and H5P sidecar seams only

No learner-profile, progress, credentials, accreditation, or enrollment logic. Those belong in `education-personal-service` and `education-organization-service`.

---

## Stack Rules

- **Runtime:** NestJS (TypeScript). No Spring Boot / Kotlin here — stack locked to ADR-0100 NestJS.
- **Database:** PG17, schema-per-tenant. Flyway migrations. Valkey for LTI JWKS key cache + LRS hot-path.
- **Messaging:** Kafka (NATS fallback). Outbox pattern for all emitted events. Transactional outbox in same PG schema.
- **Workflow:** Temporal TS SDK via Workflow Manager (ADR-0122). Register workflows; do not run Temporal worker inline.
- **Auth/RBAC:** Better Auth (ADR-0120) + Cerbos ABAC. Tenant claim mandatory on every resource policy.
- **Audit:** Hash-chain PG audit (ADR-0104). Required on every non-learner read of education records (FERPA).
- **Observability:** OTel SDK (traces + metrics). JSON structured logs. Grafana dashboards (ADR-0107).

---

## Key Libraries

| Library | Purpose | Notes |
|---|---|---|
| `@lumieducation/h5p-server` (GPL-3.0-or-later) | H5P content server candidate | Do NOT embed in core v1; optional sidecar/legal-reviewed only |
| `ltijs@5.9.9` (Apache-2.0) | LTI 1.3 Platform + Tool adapter seam | JWKS at `/.well-known/lti-keys`; Valkey key cache; 30-day rotation |
| `scorm-again@3.0.5` (MIT) | SCORM 1.2/2004 iframe runtime shim | Sandboxed iframe; SCORM→xAPI translation via xAPI Profile for SCORM |
| `@xapi/xapi@3.0.3` + `@xapi/cmi5@1.4.0` (MIT) | xAPI/cmi5 compatibility seams | Local API validation remains Zod-first |
| `@puckeditor/core@0.21.2` + `@craftjs/core@0.2.12` (MIT) | Frontend Activity Kit authoring | Do NOT add to backend runtime dependencies |
| Temporal TS SDK | Learning pathway workflows | Register only; Workflow Manager owns worker pool |

Do NOT embed: Moodle, Canvas LMS, Sakai, or H5P's GPL Node server (GPL/AGPL).

---

## LRS Architecture

```
POST /xapi/statements
  → validate against xAPI 2.0 spec
  → validate verb against VerbRegistry (reject/warn/coerce per tenant config)
  → write PG xapi_statements (per-tenant schema)
  → transactional outbox → education.xapi.statement.recorded.v1
      → feature-flagged Debezium CDC → ClickHouse lrs_statements (analytics warm store)
GET /xapi/statements  → PG (correctness + recency)
Analytical queries    → ClickHouse via Cube (ADR-0113)
```

Target PG `xapi_statements` partitioned by month + tenant_id. PR1 may use an in-memory adapter behind the store port; upgrade path to standalone LRS keeps the same versioned event contract.

---

## LTI 1.3 Key Rotation

- 2 Ed25519 key pairs active simultaneously (30-day overlap).
- Current + previous key in Valkey; JWKS endpoint serves both.
- Temporal workflow (registered via Workflow Manager) handles rotation: generate → push to Valkey → update DID doc → retire oldest key after overlap window.

---

## Content Priority Order (ADR-0207 §4.5)

New content: **xAPI-native > cmi5 > LTI 1.3 tool embedding**. H5P waits for legal-reviewed sidecar support or a permissive implementation.
Legacy import: SCORM 2004 → SCORM 1.2 (import-only).
External tool embedding: LTI 1.3.

---

## Dependency Contracts

This service is consumed by `education-organization-service` and `education-personal-service`. Breaking changes to course, competency, or LRS APIs require versioned migration and backward-compat window.

HealthStack-education bridge (`healthstack-education-service`) consumes course catalog for CME credits. EducationStack never depends on HealthStack. Dependency direction enforced by CI import-boundary lint.

---

## Event Contract Stability

All events in Requirements.md §Events Emitted are stable contracts. Schema changes require versioned event type (`education.course.published.v2`). Old version honored until all consumers migrated.

---

## Linting / Testing Commands

```bash
# Run unit tests
bun test

# Run integration tests (requires PG + Kafka + Valkey containers)
bun test:integration

# xAPI conformance-focused tests
bun test test/xapi-statements.test.ts

# LTI 1.3 conformance
bun test test/lti-jwks.test.ts

# Import boundary lint (no reverse deps)
bun lint:boundaries

# Type check
bun run typecheck
```

---

## Files That Must Not Break

- `src/lrs/xapi-statements.controller.ts` — xAPI 2.0 endpoint; conformance-tested.
- `src/lti/lti.module.ts` — LTI 1.3 launch + JWKS; active launches depend on key continuity.
- `src/content/content-provider.port.ts` — content-provider seam; H5P sidecar binding must stay optional.
- `src/scorm/scorm-runtime.controller.ts` — SCORM iframe runtime; existing enrolled learners depend on it.
- `src/events/outbox.service.ts` — transactional outbox; event loss = LRS analytics gap.
- DB migrations in `migrations/` — irreversible once tenant schemas exist; always additive.
- `src/activities/activity-definition.schema.ts` — Activity Definition IR; Builder compatibility depends on it.

---

## AI Integration (ADR-0114)

- `/ai/recommend` — thin wrapper over ADR-0114 vLLM gateway; returns learning path recommendation.
- `/ai/assess` — formative feedback on free-text submission; Presidio PII scrub before forwarding.
- AI-generated ContentBlock tagged `generatedBy: ai`; EU AI Act Article 50 disclosure required in learner UI.

---

## Cross-Phase Dependencies

| Phase | Dependency |
|---|---|
| Wave 1 | party-core-service, org-core-service, calendar-core-service, storage-service (SeaweedFS), Workflow Manager, Forms, Analytics/ClickHouse |
| Wave 1 consumers | education-organization-service, education-personal-service, healthstack-education-service |
| Wave 2 (deferred) | Adaptive learning engine (ADR-0114 expansion), video conferencing, Ed-Fi adapter |

Research:
- [education-core-service interop foundation](../../../docs/research/2026-06-04-education-core-service-interop-foundation.md)
- [Education Activity Builder Generator Architecture](../../../docs/research/2026-06-04-education-activity-builder-generator-architecture.md)
- [H5P Replacement Options](../../../docs/research/2026-06-04-h5p-replacement-options.md)
