# Grill — M11 #350 conversion-core-service domain (planning)

> Story: your-org/curaos-ai-workspace#350 · Lane: domain on merged scaffold · Phase: pre-implementation adversarial plan review
> Reviewer: fresh-context Claude (opposite-harness Codex UNAVAILABLE — ChatGPT-account usage limit; documented fallback per one-task-execution-prompt §4 direct path)
> Date: 2026-06-03

## Reviewer verdict (raw)

Now I have sufficient context. Let me produce the adversarial review.

---

# Adversarial Plan Review — Issue #350 Conversion Domain

## 1. Missing Questions

| # | Question | Why it matters |
|---|---|---|
| MQ1 | **PHI touchpoint at neutral layer:** The Hl7FhirBridge handles HL7v2 ↔ FHIR conversion. Are message payloads ever logged, cached, or persisted at this neutral service? FHIR Bundles can contain PHI (Patient resource, names, MRNs). | AGENTS.md §3: "Tenant data isolation. PHI/PII stays in overlay schemas. Neutral services = references + metadata only." If the bridge parses/transforms PHI content even transiently, the service may need HealthStack overlay classification, not neutral. |
| MQ2 | **Source/result URIs:** Are `source_uri` and `result_uri` S3 paths to SeaweedFS? Who owns the bucket/prefix namespace? Does conversion-core write to storage or just reference URIs from upstream? | Determines dependency on `@curaos/storage-sdk` or direct SeaweedFS S3 client. |
| MQ3 | **Sidecar dispatch transport:** The plan says "grpc/BullMQ" for production. Which sidecars use which? Tika = HTTP? Pandoc = CLI? HL7-FHIR = gRPC? | Affects port interface signatures + test double fidelity. |

---

## 2. Docs/ADR Conflicts

| # | Conflict | Resolution |
|---|---|---|
| DC1 | **Topic naming mismatch.** Scaffold emits `curaos.core.conversion.{created,updated,deleted}.v1`. Plan proposes `conversion.job.completed/failed`. ADR-0102 §"Topic / Subject Naming Convention" specifies `cura.<domain>.<aggregate>.<event-type>` (no `.v1` suffix in the pattern, but the scaffold uses `.v1`). | **Reconcile:** adopt `curaos.core.conversion.job.{created,completed,failed,dispatched}.v1` — keeps versioned suffix, adds `job` aggregate, aligns with scaffold namespace. The scaffold's existing `conversion.{created,updated,deleted}` events are for the *conversion resource* CRUD; job lifecycle is a separate aggregate. |
| DC2 | **Work queue choice.** ADR-0102 recommends **BullMQ + `@nestjs/schedule`** (NestJS pivot per ADR-0150 §3). Plan lists BullMQ but the scaffold has no BullMQ dep yet. | **Recommend:** add `bullmq` + `@nestjs/bullmq` as prod dep now (matches ADR-0102 NestJS work-queue decision). The port+test-double pattern applies to the *sidecar gRPC* transport, not the internal job queue. |
| DC3 | **Drizzle migration numbering.** Journal shows `0000`, `0001`. Plan proposes `0002`. Correct, but verify `drizzle-kit generate` will auto-increment; manual numbering risks collision if another PR lands first. | **Recommend:** let `drizzle-kit generate:pg` assign the number; do not hard-code `0002` in plan. |

---

## 3. Glossary Conflicts

| Term | Plan usage | Existing usage | Resolution |
|---|---|---|---|
| "Conversion" | Job orchestration entity (`conversion_job` table) | Scaffold's `conversion` table = the base domain entity (currently stub: `id, tenant_id, payload, created_at, updated_at`). | **Clarify:** the scaffold's `conversion` table is the *resource*; your `conversion_job` is a *child work-unit*. FK `conversion_job.conversion_id → conversion.id`? Or is `conversion_job` standalone? If standalone, rename to `conversion_request` or similar to avoid glossary collision. |

---

## 4. Hidden Deps / Subtasks

| # | Hidden item | Why |
|---|---|---|
| HD1 | **BullMQ Redis/Valkey connection.** BullMQ needs a Redis-compatible store. ADR-0101 commits Valkey 8.x. Scaffold has no Valkey/Redis client wired. | Subtask: add `@nestjs/bullmq` + `ioredis` + Valkey connection config (env var `VALKEY_URL`). |
| HD2 | **Idempotency interceptor wiring.** Scaffold ships `idempotency_keys` table but explicitly states "NO interceptor that reads/writes the table." Job creation must be idempotent (retry-safe). | Subtask: wire idempotency guard on `POST /conversions/jobs` using the scaffold table. |
| HD3 | **Audit event emission for job lifecycle.** The scaffold's `AuditPublisher` emits to `curaos.core.audit.event.v1`. Job state transitions (created/dispatched/completed/failed) need audit trail. | Subtask: call `auditPublisher.publish()` on each job state change with appropriate envelope. |
| HD4 | **Reaper job for idempotency keys.** Scaffold comment: "Add a reaper job (e.g. `@Cron`) that sweeps expired rows." | Subtask: add `@Cron('0 * * * *')` IdempotencyReaper in a shared infra module. |
| HD5 | **TypeSpec/AsyncAPI spec update.** The scaffold ships TypeSpec REST + AsyncAPI specs. New endpoints + events must be reflected. | Subtask: update `typespec/main.tsp` + `asyncapi/conversion-core.yaml`. |

---

## 5. Prototype Candidates

| # | Candidate | Why prototype first |
|---|---|---|
| PC1 | **SidecarDispatcher gRPC transport.** If production uses gRPC to sidecars, prototype the `@grpc/grpc-js` client + service definition against a mock Tika/Pandoc sidecar before committing the interface shape. | Avoids port interface rework after discovering gRPC streaming/unary mismatch. |
| PC2 | **BullMQ + Valkey integration test.** Run BullMQ against Valkey 8.x in a test container to confirm compatibility (BullMQ tests primarily against Redis 7.x). | Valkey 8.x is API-compatible but edge cases exist. |

---

## 6. Decision Points + Recommended Answers

| # | Decision | Recommendation | Source |
|---|---|---|---|
| **DP1** | Port + test double vs. real sidecar deps now? | **Recommend: port + test double.** The stable-core + plugin/sidecar rule (curaos_runtime_decisions.md) explicitly separates the compiled host (conversion-core) from the sidecar layer. Heavy deps (`@grpc/grpc-js`, `bullmq`, `@aws-sdk/client-s3`) are composition-root wiring — inject at modulith host layer, not in the shell service. The scaffold pattern (`ConversionEventProducer` in-process default) is the precedent. | [[curaos-runtime-decisions]] §"Stable core (host service)" + [[curaos-modulith-standalone-rule]] |
| **DP2** | Event topic naming for job lifecycle? | **Adopt:** `curaos.core.conversion.job.{created,dispatched,running,completed,failed}.v1`. Keeps `.v1` suffix (matches scaffold), adds `job` aggregate (distinguishes from resource CRUD events). | ADR-0102 §"Topic / Subject Naming Convention" pattern + scaffold precedent |
| **DP3** | Idempotency key scope: per-tenant + per-key, or per-key only? | **Per-tenant + per-key (scaffold default).** The `idempotency_keys` table has PK `(tenant_id, idempotency_key)`. This prevents cross-tenant key collision. | Scaffold `drizzle/schema.ts` line 246 |
| **DP4** | PHI boundary for FHIR/HL7 at neutral layer? | **Reference-only pattern.** The Hl7FhirBridge should accept/return *opaque payloads* (byte streams or S3 URIs) and never parse/log PHI fields. If business logic needs to inspect FHIR resources, that belongs in `healthstack-conversion-service` overlay, not neutral core. The neutral bridge is a *format transformer*, not a *clinical data processor*. | AGENTS.md §3 "PHI/PII stays in overlay schemas" + conversion-event-producer.ts §"NEUTRAL-layer only: non-clinical human label" |
| **DP5** | Migration forward-only or reversible? | **Forward-only (additive).** CuraOS convention per [[curaos-rolling-update-rule]] — no `-v2` parallel paths. `conversion_job` is a new table, not a breaking change. | [[curaos-rolling-update-rule]] |
| **DP6** | Add BullMQ as dep now or defer to modulith wiring? | **Add now as optional peer dep.** The scaffold should export the *interface* (`JobQueue` port) + an in-memory test double. `@nestjs/bullmq` is the production adapter wired at composition root. But the `bullmq` package can be devDep for integration tests that verify the real queue. | ADR-0102 §"Work Queue Recommendation" (BullMQ chosen) |
| **DP7** | State machine transitions — DB-level or app-level? | **App-level (service method guards) + DB-level CHECK constraint as backstop.** Add `CHECK (status IN ('queued','dispatched','running','completed','failed'))` + disallow illegal transitions in `ConversionJobService.transition()`. | Scaffold pattern (`audit_outbox_status_check` constraint) |

---

## 7. Genuine User-Escalation Candidates

| # | Item | Why escalate |
|---|---|---|
| **UE1** | **HL7-FHIR bridge as neutral vs overlay.** If the bridge must *parse* FHIR Patient/Encounter resources to extract clinical identifiers for routing, it crosses into PHI territory. User must confirm: is this a *byte-level format transformer* (neutral) or a *clinical-data-aware router* (HealthStack overlay)? | Irreversible architectural split; affects service ownership + compliance boundary. |
| **UE2** | **Sidecar runtime stack.** The plan lists libs for 5 sidecars (tika, pandoc, libreoffice, tesseract, hl7-fhir). Are these all in-scope for M11, or is M11 just the orchestration + one proof-of-concept sidecar? | Scope question — committing to 5 sidecars in one milestone may exceed velocity. |

---

## Summary

**Plan is mostly sound.** Key adjustments:

1. **Topic naming:** use `curaos.core.conversion.job.{state}.v1` (reconciles scaffold + plan).
2. **Port + test double:** correct approach per stable-core rule; defer heavy deps to composition root.
3. **Glossary:** clarify `conversion` (resource) vs `conversion_job` (work-unit) relationship — likely FK or rename.
4. **PHI boundary:** enforce reference-only at neutral layer; escalate if bridge needs to parse clinical content.
5. **Hidden subtasks:** BullMQ/Valkey wiring, idempotency interceptor, audit emission, spec updates.


---

## Implementer resolution (auto-applied per curaos_recommendation_auto_apply_rule.md, 2026-05-29 directive)

| Finding | Disposition | Basis |
|---|---|---|
| DP1 sidecar port+double vs heavy deps | AUTO-APPLY port+double | curaos_runtime_decisions stable-core+sidecar; matches `ConversionEventProducer` injected-seam precedent; no PG/Kafka/Redis in env |
| DP2 / DC1 topic naming | AUTO-APPLY `curaos.core.conversion.job.{created,dispatched,completed,failed}.v1` | job aggregate distinct from scaffold resource-CRUD events; keeps `.v1` |
| DP4 / UE1 PHI boundary | AUTO-APPLY reference-only byte transformer; never log payload bodies | AGENTS.md §3 + issue #350 scope ("NEUTRAL conversion mechanics here; PHI stays in payload boundary") — issue scope already resolves UE1; NOT a user escalation |
| Glossary conversion vs conversion_job | AUTO-APPLY new standalone `conversion_job` table; scaffold `conversion` stub untouched (no FK) | avoids collision; stub is generic codegen placeholder |
| DP5 forward-only additive 0002 | AUTO-APPLY | curaos_rolling_update_rule; new table only |
| DP6/DC2/HD1 BullMQ/Valkey | AUTO-APPLY `JobQueue` port + in-memory double; real BullMQ+Valkey = composition root | consistent with DP1; no Redis in env |
| HD3 audit emission on job state change | IN-SCOPE — wired via existing publisher | cheap, uses scaffold AuditPublisher |
| HD2 idempotency interceptor, HD4 reaper, PC1/PC2 prototypes, UE2 5-sidecar scope | FORESIGHT (out of this Story's acceptance) | emitted as FORESIGHT lines for orchestrator routing |
