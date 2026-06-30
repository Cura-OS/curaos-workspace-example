# Agent Context — healthstack-patient-service

**ADR refs:** ADR-0208 §3.1 · ADR-0115 · ADR-0157 · ADR-0161 · ADR-0162 · ADR-0120

> **M7-S3 status (2026-05-27).** First-mold overlay shipped:
> `healthstack.patients` table (pgSchema('healthstack') + cross-schema
> FK to `core.patients(id) ON DELETE CASCADE`) + read-only
> `patients_full` view (LEFT JOIN core + overlay, ssn_encrypted excluded)
> + REST CRUD (POST/PATCH/GET) + AES-256-GCM `SsnEncryptionService` +
> reference-only audit envelope on `curaos.core.audit.event.v1` per
> [`m7-user-decisions.md`](../../../docs/m7-user-decisions.md) D1 + D5.
>
> **M7-S4 status (2026-05-27).** M5 BPM `patient-admission-v1` saga +
> `POST /healthstack/patients/:id/admit` REST endpoint +
> `CURAOS_OVERLAY_HEALTHSTACK` env-var gate landed per
> [`m7-user-decisions.md`](../../../docs/m7-user-decisions.md) D2 + D3.
> Three-step saga: await `curaos.core.patient.registered.v1` → clinician
> approval task → emit `curaos.healthstack.patient.admitted.v1` (with
> correlation-id chain). In-process saga implementation in
> `src/admission/admission-saga.ts` mirrors the Temporal workflow shipped
> by `workflow-core-service`. Out-of-order events queue inside the saga.
> AppModule moved to `forRoot()` / `withEnv(env)` dynamic-module pattern
> so the env-var gate evaluates at composition time.
>
> The full HAPI FHIR + SanteMPI + Cerbos + SMART-on-FHIR stack below
> lights up incrementally across M7-S6 (auth matrix) → M8.
> See [AGENTS.md](AGENTS.md) for the M7-S4 file map.

> **M7-S5 add-on (2026-05-27).** Contract endpoint shipped:
> `GET /api/v1/contracts/patient?tenantId={id}&overlay=healthstack&version=v1`
> returns `{version, base, overlay}` envelope per
> [`m7-user-decisions.md`](../../../docs/m7-user-decisions.md) D4. Base
> is identity-passed from `@curaos/patient-contracts.patientBaseSchema`;
> overlay is composed via `buildOverlaySchema(HEALTHSTACK_OVERLAY_PROPERTIES)`
> so it is always a structural superset of base. Endpoint is unauthed
> (public schema, no PHI). Drift gate enforced in
> `test/unit/patient-contract.test.ts`. Consumer: `@curaos/builder-studio`
> `PatientFormPage` per M7-S5 brief.

> **M7-S7 status (2026-05-27).** Overlay-side audit chain end-to-end +
> PHI envelope assertion shipped:
> `test/integration/audit-chain-e2e.test.ts` locks the three-event
> chain (overlay CREATE → admit READ → "discharge" UPDATE) per
> [`m7-user-decisions.md`](../../../docs/m7-user-decisions.md) D5.
> Hash chain: `prevHash = sha256(eventId || occurredAt || resourceId ||
> previousHash)`; `resourceId` always points at `core.patients.id`
> (NOT overlay row id) so the chain stays attached to the neutral
> entity. Tamper-detection + cross-tenant isolation + PHI scrub
> (`\d{4}-\d{2}-\d{2}` outside `occurredAt`, `\d{3}-?\d{2}-?\d{4}`,
> `ssn|social.*security`, `[A-Z][a-z]+\s[A-Z][a-z]+`) all locked.
> Coverage: `src/audit/*` at 100% lines.
> `AUDIT_PHI_SCAN_DUMP=1 bun test` writes captured envelopes to
> `.audit-phi-scan-fixtures/*.json` for the parent repo's
> `scripts/audit-phi-scan.sh` out-of-process tripwire.
>
> **Codex grill cycle-3 P1 (2026-05-27).** Same-process audit-chain
> fork race closed. Without serialization, two concurrent
> `publishAudit()` calls for the same `(tenantId, resourceId)` could
> both read the same `previousHash`, both reach `producer.send()` —
> Kafka receives BOTH envelopes — then only one CAS wins; the loser
> throws but Kafka still holds an orphan envelope with the same
> `previousHash` as the winner. `eventId` dedup does not catch it
> (event ids are unique), so downstream verifiers see a fork.
>
> **Fix (binding per user decision):** per-resource in-process
> `Map<lockKey, Promise>` keyed on `${tenantId}:${resourceId}` inside
> `AuditPublisherService` (see `src/audit/audit-publisher.service.ts`).
> Same-resource publishes serialize through the lock; different
> resources publish in parallel. try/finally cleans the map on
> success or failure so the structure does not grow unboundedly.
> Coverage in `test/integration/audit-chain-concurrent.test.ts` (in
> the `curaos/backend/services/healthstack-patient-service`
> submodule):
> contiguous-chain on concurrent same-resource publishes (no fork
> in Kafka, all hashes unique); parallel execution on
> different-resource publishes (wall < 1.6x send latency); lock-map
> cleanup after a thrown publish.
>
> **Single-instance limitation (binding, documented):** the lock
> protects against same-process concurrency only. Cross-node races
> are still possible but covered by the `FileAuditChainHeadStore` /
> `DrizzleAuditChainHeadStore` CAS on the persistent head — the
> losing node throws 409. M7 first-mold ships single-node modulith
> so this is the minimum-viable correctness guarantee. The lock
> disappears when the M9-S5 audit-core-service codegen folds outbox
> into the healthstack overlay; tracked as followup
> `[M7-S7.1] healthstack: port patient-core outbox pattern`
> (replaces temporary per-resource lock).
>
> **Generator evolution:** n/a (temporary single-instance lock;
> M9-S5 outbox via codegen retires this — do NOT fold the lock
> back into the trio template).

---

## Role

Patient master record for HealthStack. Single source of truth for patient identity, demographics, and care context. Central dependency for all 18 other HealthStack services — every clinical service calls `patients.getContext()` on session init.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify adapter |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP calls, no embedded JVM) |
| ORM | Drizzle (M7 first-mold tables + migrations) + MikroORM (M8 clinical aggregate roots per [[curaos-orm-rule]]) |
| DB | PostgreSQL 17 (CNPG), DB-per-tenant for PHI per [[curaos-postgres-rule]] HealthStack override |
| Cache | Valkey (consent state, patient context) |
| MPI | SanteMPI sidecar (HTTP) |
| Events | Kafka 4 (outbox) + NATS JetStream (low-latency) |
| API | TypeSpec REST + tRPC (internal) |
| Auth | Better Auth + SMART-on-FHIR (ADR-0120) |
| ABAC | Cerbos (clinical role policies) |
| Observability | OTel SDK → Loki / Tempo / VictoriaMetrics |
| Secrets | OpenBao |

---

## Patient-Centric Priority (ADR-0099 §15 + ADR-0161)

This service is the most critical in the cluster. Clinical SLA gate:
- P95 `/patients/:id/context` ≤ 100ms (Valkey hit)
- P95 HAPI fallback ≤ 250ms
- K8s namespace: `healthstack-clinical`; LimitRange + Capsule quota enforced
- Admin-tier traffic must not share APISIX upstream with clinical-tier

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` interceptor mandatory on **every** controller method touching Patient/RelatedPerson/Person.
- Per-tenant `phi_audit_mode`: `single-source | dual-reconciled | hapi-primary`.
- Audit record: actor, patient FHIR ID (hashed in logs), resource type, operation, timestamp, SMART scope, IP.
- Emitted to audit-service (ADR-0200) via tRPC ≤ 500ms.
- Tamper-evident hash-chain; 6-year minimum retention.

---

## Break-Glass (ADR-0208 §1.3)

- Cerbos `break-glass` role; dual sign-off via healthstack-workflow-service Temporal.
- Audit record created **before** access granted.
- Token auto-expires 4h; privacy officer notified via notify-service.
- CI test: `break-glass-expiry` — verify auto-expire ≤ 4h.

---

## Consent Cache Protocol

- Valkey key: `consent:{tenantId}:{patientId}`, TTL 15min.
- Invalidated on `healthstack.consent.updated` Kafka event.
- Lazy warm from healthstack-consent-service tRPC on cache miss.
- Force-refresh on break-glass activation.
- Never return PHI if consent cache miss AND consent-service unreachable → return 503.

---

## SanteMPI Integration

- Match thresholds: ≥ 0.95 auto-link; 0.80–0.95 manual review; < 0.80 new record.
- `POST /patients/merge` → HAPI `$replace-references` to re-point all resources.
- Dual-approval workflow for cross-tenant merges.

---

## HAPI FHIR Partition

- Every write: `X-Partition-Name: {tenantId}` header set by `TenantInterceptor`.
- Partition created at tenant activation (orchestrated by tenant-management-service).
- Validate partition exists before any write; throw 503 if missing (prevents cross-tenant leak).

---

## Key Files (once scaffolded)

```
src/
  patient/
    patient.controller.ts       # FHIR REST + merge endpoints; @HealthstackAudit() on all
    patient.service.ts          # Business logic; HAPI HTTP client calls
    patient.context.service.ts  # getContext() — Valkey cache + HAPI fallback
    patient.mpi.service.ts      # SanteMPI probabilistic match
    patient.merge.service.ts    # Duplicate merge + HAPI $replace-references
  consent/
    consent-cache.service.ts    # Valkey read/invalidate; consent.updated consumer
  persistence/
    schema.ts                   # Non-FHIR metadata (audit pointers, merge log)
  events/
    patient.events.ts           # Outbox producers: registered, merged, demographics-updated
```

---

## Event Bus

### Produced
- `healthstack.patient.registered` — Kafka, outbox
- `healthstack.patient.merged` — Kafka, outbox
- `healthstack.patient.demographics-updated` — Kafka, outbox

### Consumed
- `healthstack.consent.updated` — Kafka; triggers Valkey cache invalidation

---

## Testing

- Vitest unit: SanteMPI match logic, cache invalidation, merge logic.
- FHIR integration: recorded HAPI FHIR payloads (VCR-style mocks) for Patient CRUD + `$match`.
- SanteMPI integration: mock SanteMPI HTTP responses for threshold boundary testing.
- Latency SLA test (cache hit): P95 `/patients/:id/context` ≤ 100ms (Valkey path) under simulated load — ADR-0161 §8 clinical SLA (<=250ms canonical clinical path; <=100ms Valkey cache-hit is the service-local target).
- Latency SLA test (HAPI fallback): P95 `/patients/:id/context` ≤ 250ms (HAPI path) under simulated load.
- Break-glass expiry test: token auto-expires ≤ 4h.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all PHI-returning controller methods
- [ ] `consent.decision` called before every PHI-returning endpoint
- [ ] SMART scopes declared in TypeSpec for all FHIR endpoints
- [ ] AsyncAPI 3 schemas in Apicurio for all produced events
- [ ] ePHI field tags in MikroORM entity metadata + migration
- [ ] P95 ≤ 100ms latency-sla-cache-hit test green (Valkey path)
- [ ] P95 ≤ 250ms latency-sla test green (HAPI fallback path)
- [ ] Break-glass expiry ≤ 4h test green

---

## Cross-Service Contracts

| Service | Contract | Direction |
|---|---|---|
| healthstack-consent-service | tRPC `consent.getState(patientId)` | Outbound (warm cache) |
| healthstack-workflow-service | tRPC `workflow.startBreakGlass()` | Outbound |
| audit-service | tRPC `audit.record(event)` | Outbound |
| notify-service | Kafka `platform.notify.*` | Outbound |
| All clinical services | tRPC `patients.getContext()` | Inbound |
