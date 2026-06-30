# Agent Context — education-personal-service

**ADR authority:** ADR-0207 §3.3
**Stack locked:** NestJS (TypeScript), PG17, Valkey, Kafka/NATS, Temporal TS SDK
**Last updated:** 2026-06-04

---

## Role in EducationStack

Learner layer. Owns learner profile (anchored in party-core-service), course progress tracking, competency achievement, Open Badges 3.0 issuance, and Comprehensive Learner Record (CLR) export. The learner is the primary principal and controls all credential sharing.

No duplicate identity model — learner = Party from `party-core-service`.
No duplicate enrollment model — EnrollmentRecord source-of-truth is `education-organization-service`; cached subset only.

---

## Stack Rules

- **Runtime:** NestJS (TypeScript). Stack locked by ADR-0100 + ADR-0207.
- **Database:** PG17, schema-per-tenant. Flyway migrations. Valkey for hot-path progress cache.
- **Messaging:** Kafka (NATS fallback). Outbox pattern. Consumes events from `education-core-service` and `education-organization-service`.
- **Workflow:** Temporal TS SDK via Workflow Manager (ADR-0122). GDPR erasure workflow + OB3 key rotation workflow registered here.
- **Auth/RBAC:** Better Auth (ADR-0120) + Cerbos ABAC. Learner claim mandatory on own data access. Non-learner access → FERPA audit.
- **Observability:** OTel SDK (traces + metrics). JSON structured logs. Grafana dashboards (ADR-0107).

---

## Key Libraries and Signing

```
Badge issuance signing stack:
  node:crypto Ed25519               — #414 foundation key ops; sign + verify
  @noble/ed25519 (MIT)              — only approved third-party signer if service dependency install is repaired
  Custom Data Integrity serializer   — W3C VC DataModel 2.0 / OB3-compatible JSON
  Issuer DID: did:web:<tenant-domain>
  DID document served at: /.well-known/did.json
  StatusList2021 at: /.well-known/status/<listId>

CLR export:
  Custom VP bundler (primary)
  @1edtech/clr — not installable in 2026-06-04 npm check; do not use until installable + audited
  Gotenberg (MIT) — PDF transcript via HTML → PDF pipeline
```

## Issue #414 Foundation Implementation

Implemented paths:

- `src/profiles/learner-profile.service.ts` anchors learner profile to `party-core-service` by `partyId`; stores education-only attributes and no name/email identity copy.
- `src/progress/progress.consumer.ts` handles `education.lesson.completed`, updates `CourseProgress`, emits `education.lesson.progress.updated` / `education.course.completed`, and triggers badge issuance once required lessons complete.
- `src/badges/badge-issuer.service.ts`, `src/did/did-document.service.ts`, and `src/badges/status-list.service.ts` issue and verify OB3-like W3C credentials with Ed25519 Data Integrity proof and StatusList2021 revocation seam.
- `src/clr/clr-bundler.service.ts` exports a custom CLR-flavored W3C Verifiable Presentation; no `@1edtech/clr` dependency.
- `src/ai/learner-ai-gateway.service.ts` enforces Presidio/PII scrubber seam before learner text reaches AI gateway.
- `src/progress/progress-query.service.ts` and `src/clr/clr-query.service.ts` write FERPA audit records for non-learner reads.
- `src/gdpr/erasure.workflow.ts` is idempotent, revokes learner badge status entries, and emits one pseudonymized `education.learner.erased` event.

Dependency-install note: `bun install --filter @curaos/education-personal-service` still resolves unrelated workspace placeholder packages (`@curaos/calendar-core-service`, `@curaos/tasks-core-service`, etc.) from npm and fails with 404. Keep the #414 code path dependency-light until the parent workspace package graph is repaired.

---

## OB3 Key Rotation Architecture

- Temporal workflow registered via Workflow Manager; runs on 90-day schedule.
- Flow: generate new Ed25519 key pair → add to DID doc `verificationMethod` array → update signing key in Valkey → retire oldest key (keep ≥ 2 in DID doc for historical verification).
- Old keys never deleted from DID doc; historical badges signed with expired keys must still verify.

---

## GDPR Erasure Workflow Architecture

```
DELETE /learner-profiles/:id/gdpr-erase
  → Temporal workflow (registered via Workflow Manager)
  → Step 1: PG nullify PII fields (name, email, accessibilityNeeds[], learningGoals[])
  → Step 2: SeaweedFS delete badge PNGs + portfolio assets
  → Step 3: POST void statement to education-core-service LRS endpoint (xAPI 2.0 void)
  → Step 4: Update badge StatusList2021 (revoke all learner badges)
  → Step 5: Emit education.learner.erased (learnerId pseudonymized)
  → Step 6: Invalidate Valkey progress cache for learnerId
```

GDPR erasure is irreversible. Temporal workflow must be idempotent (retry-safe with step markers).

---

## Progress Update Event Flow

```
education-core-service LRS
  → publishes education.lesson.completed
      → education-personal-service Kafka consumer
          → update CourseProgress in PG
          → check badge trigger conditions
          → if threshold met → issue OB3 badge → emit education.badge.issued
          → notify-service ← badge notification
```

---

## Aggregation Floor (Privacy)

Institution analytics queries (`GET /institutions/:id/analytics/...`) enforce minimum 5 learners per cohort/segment. Implemented as query-layer check before returning ClickHouse data. Below floor → return `{"error": "AGGREGATION_FLOOR_NOT_MET"}`. Not configurable.

---

## Files That Must Not Break

- `src/badges/badge-issuer.service.ts` — OB3 signing; credential integrity.
- `src/badges/status-list.service.ts` — StatusList2021; revocation list public endpoint.
- `src/did/did-document.service.ts` — Issuer DID resolution; historical badge verification depends on it.
- `src/clr/clr-bundler.service.ts` — CLR VP serializer; learner data portability.
- `src/gdpr/erasure.workflow.ts` — GDPR erasure; irreversible; must be idempotent.
- `src/progress/progress.consumer.ts` — Kafka consumer for lesson.completed; progress staleness = bad learner UX.
- DB migrations in `migrations/` — always additive once tenant schemas exist.

---

## Linting / Testing Commands

```bash
bun test                      # unit tests
bun run test:badges           # OB3/Data Integrity issuance + Ed25519 proof verification
bun run test:clr              # CLR export + VP validation
bun run test:gdpr-erasure     # idempotent erasure workflow
bun run test:privacy          # Presidio/PII scrub + FERPA audit seams
bun run test:progress         # lesson completion progress + badge trigger
bun run lint                  # oxlint over src + test
bun run typecheck             # TypeScript noEmit
```

---

## Cross-Phase Dependencies

| Phase | Dependency |
|---|---|
| Wave 1 | education-core-service, education-organization-service, party-core-service, Auth, Analytics/ClickHouse, notify-service, storage-service, Workflow Manager, AI gateway (ADR-0114) |
| Wave 1 consumers | healthstack-education-service (CLR/badge data for CME credits) — one-way dependency only |
| Wave 2 (deferred) | Mobile offline CLR sync, adaptive learning dashboard enhancements |

---

## AI Integration (ADR-0114)

- Presidio PII scrub mandatory before any learner text forwarded to vLLM gateway.
- AI-generated content (formative feedback) tagged `generatedBy: ai`; EU AI Act Article 50 disclosure in learner UI.
- AI integration is thin wrapper; no AI model embedded in this service.
