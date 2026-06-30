# Grill: M9-S6.1 Invitation Producer — PR #66 (issue #257)

Date: 2026-05-31

Griller: Codex (cross-harness T2 adversarial)

Verdict: REQUEST-CHANGES — core invite/audit/RBAC/PHI wiring is mostly correct, but the invitation schema makes `idempotency_key` globally unique while the app lookup is tenant-scoped, creating a cross-tenant collision defect.

## Attack 1: CORRELATION-ID/TRACE-ID THREADING

**Status**: PASS

**Severity**: N-A

**Findings**:
- `POST /invitations` derives `correlationId` from `x-curaos-correlation-id` or `claims.sessionId`, and derives `traceId` from `x-curaos-trace-id` or that per-leg correlation id; it does not set correlationId to target user id or any flow-wide pairing key. See `src/identity-core/invitations/invitations.controller.ts:84-99`.
- The invite service threads `principal.traceId` and `principal.correlationId` independently: domain-event headers carry `trace_id` and `correlation_id` at `src/identity-core/invitations/invitations.service.ts:214-229`, and the audit publish input carries `correlationId` plus `traceId` at `src/identity-core/invitations/invitations.service.ts:248-254`.
- The audit publisher copies `traceId` into the envelope and into both durable-audit-outbox and in-process/Kafka-send headers. See `src/identity-core/audit/audit-publisher.service.ts:206-210`, `src/identity-core/audit/audit-publisher.service.ts:262-278`, and `src/identity-core/audit/audit-publisher.service.ts:281-298`.
- The divergence pairing key remains `correlationId=targetUserId` on the role-grant path at `src/admin/admin.controller.ts:62-68` and `src/admin/admin.controller.ts:98-106`; Invitation audit events do not enter that normalizer because only `ActorMembership` and `Identity` resource types map to operations at `src/identity-core/divergence/audit-normalizers.ts:258-273`.

**Verdict**: No regression found in the divergence pairing key; invite correlation remains per-leg and traceId is the flow key.

## Attack 2: TRANSACTIONAL DURABILITY

**Status**: PASS

**Severity**: N-A

**Findings**:
- The invite path wraps row insert, `invited.v1` enqueue, and audit enqueue in one `this.outbox.transaction(...)` block. The row insert is at `src/identity-core/invitations/invitations.service.ts:134-147`, domain outbox enqueue is called at `src/identity-core/invitations/invitations.service.ts:148-157`, and the audit enqueue is made through a tx-bound audit outbox at `src/identity-core/invitations/invitations.service.ts:158-170`.
- When DSN-backed, the domain outbox store opens a real Drizzle transaction and passes the same tx executor to callers at `src/identity-core/db/outbox.service.ts:580-594`.
- The audit outbox binding is explicitly tied to the already-open transaction at `src/identity-core/db/audit-outbox.service.ts:212-223`, and the Postgres audit store inserts through the caller's tx executor at `src/identity-core/db/audit-outbox.service.ts:595-602`.
- The audit publisher enqueues the validated envelope to `audit_outbox` inside the supplied transaction at `src/identity-core/audit/audit-publisher.service.ts:257-278`; no row-without-audit or audit-without-row path was found for the DSN-backed runtime path.

**Verdict**: DSN-backed runtime path is one transaction for invitation row, domain outbox, audit chain head, and audit outbox.

## Attack 3: PHI BOUNDARY

**Status**: PASS

**Severity**: N-A

**Findings**:
- The durable row legitimately stores `invitee_email` at `drizzle/migrations/0007_invitations_add.sql:34-45` and `src/identity-core/db/schema.ts:469-480`, but the emitted `invited.v1` schema only allows `type`, IDs, `role`, `status`, and `occurred_at` at `src/identity-core/events/invitation-event-producer.ts:44-54`.
- The `invited.v1` builder has no `inviteeEmail` or `invitee_email` field; it emits only invitation, tenant, org, role, status, and timestamp at `src/identity-core/events/invitation-event-producer.ts:72-83`.
- The audit envelope records `changedFields` as names-only and `changeValues` as role/org references at `src/identity-core/invitations/invitations.service.ts:256-262`; it does not include the invitee email.
- The audit schema restricts `changedFields` to identifier-shaped names at `src/identity-core/audit/audit-event.schema.ts:125-137`, restricts `changeValues` to closed reference keys at `src/identity-core/audit/audit-event.schema.ts:102-110` and `src/identity-core/audit/audit-event.schema.ts:144-149`, and scans value fields for DOB/SSN/name patterns at `src/identity-core/audit/audit-event.schema.ts:154-188`.
- The request DTO permits only the necessary `inviteeEmail` input and rejects extra PHI-shaped keys at `src/identity-core/invitations/invitations.dto.ts:39-83`.

**Verdict**: No emitted domain event or audit envelope PII leak found; invitee email stays in the durable row.

## Attack 4: FORWARD MIGRATION SAFETY

**Status**: DEFECT

**Severity**: P2

**Findings**:
- PASS: `0007_invitations_add.sql` is forward-only and idempotent for the table and indexes via `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` at `drizzle/migrations/0007_invitations_add.sql:34-55`.
- PASS: The runtime DDL helper mirrors the table-only initialization shape with no trigger/function side effects at `src/identity-core/db/migrations.ts:381-402`.
- PASS: `createInvitationsTable(...)` is wired into both shared `identity_core` schema ensure and per-tenant schema ensure paths at `src/identity-core/db/migrations.ts:34-47` and `src/identity-core/db/migrations.ts:62-82`.
- DEFECT: The new schema makes `idempotency_key` globally unique at `drizzle/migrations/0007_invitations_add.sql:41` and `src/identity-core/db/schema.ts:472-480`, but the repository lookup treats idempotency as tenant-scoped at `src/identity-core/invitations/drizzle-invitations.repository.ts:81-95`. Two tenants using the same client idempotency key will not find each other's cached row, then the second insert can fail the global unique constraint and bubble through the generic catch at `src/identity-core/invitations/invitations.service.ts:174-181`.
- DEFECT: Existing actor idempotency documents and implements the safe tenant-scoped key shape with `PRIMARY KEY (tenant_id, idempotency_key)` at `src/identity-core/db/schema.ts:312-340`; invitations diverge from that pattern without a compensating tenant-scoped unique index.

**Verdict**: Migration mechanics are forward/idempotent, but the idempotency key is not tenant-scoped and can create cross-tenant request collisions.

## Attack 5: NEW TOPIC + CONTRACT

**Status**: PASS

**Severity**: N-A

**Findings**:
- The topic is versioned as `curaos.core.identity.invited.v1` at `src/identity-core/events/invitation-event-producer.ts:29`.
- The payload schema is strict and version-locked to the `Invited` wire shape at `src/identity-core/events/invitation-event-producer.ts:44-54`.
- Contract tests assert the topic constant, exact snake_case payload shape, schema acceptance, strict unknown-key rejection, UUID validation, and no invitee email at `test/identity-core/invitations/invited-event.contract.test.ts:19-94`.
- The producer uses the existing transactional outbox path via `tx.enqueue(...)` rather than introducing a second Kafka producer at `src/identity-core/invitations/invitations.service.ts:194-229`; the outbox service transaction seam is the existing `IdentityCoreOutboxService.transaction(...)` at `src/identity-core/db/outbox.service.ts:130-134`.

**Verdict**: Topic name, schema contract, and outbox producer pattern are correct.

## Attack 6: RBAC

**Status**: PASS

**Severity**: N-A

**Findings**:
- `POST /invitations` is decorated with `@RequiresInvitationScope({ action: 'write', roles: INVITATION_WRITE_ROLES })` at `src/identity-core/invitations/invitations.controller.ts:53-55`.
- `RequiresInvitationScope` stamps the existing `REQUIRES_ROLE_KEY` metadata with `resource: 'identity.invitation'` and `action: 'write'` at `src/identity-core/auth/requires-invitation-scope.decorator.ts:15-24`; `INVITATION_WRITE_ROLES` is only `tenant-admin` at `src/identity-core/auth/requires-invitation-scope.decorator.ts:27-31`.
- The route is mounted through `IdentityCoreModule` controllers at `src/identity-core/identity-core.module.ts:295-300`, and the app-level `RbacGuard` is registered as an `APP_GUARD` at `src/app.module.ts:130-137`.
- `RbacGuard` authenticates before authorization at `src/rbac/rbac.guard.ts:28-35`, then denies if the caller lacks both the required role and matching policy permission at `src/rbac/rbac.guard.ts:37-52`.
- `tenant-admin` is the only role granted `identity.invitation:write` in policy at `policies/rbac-v0.yaml:19-23`, and the policy engine requires one of the decorator's accepted roles before checking permissions at `src/rbac/rbac-policy.service.ts:49-61`.

**Verdict**: The endpoint is guarded; unauthenticated and non-tenant-admin callers cannot pass the shown guard/policy path.

## Attack 7: TEST QUALITY

**Status**: PARTIAL

**Severity**: P2

**Findings**:
- PASS: The 25 invite tests are real assertion-bearing tests across migration, DTO, HTTP wiring, service behavior, and contract files. The test bodies are at `test/identity-core/invitations/invitations-migration.test.ts:23-40`, `test/identity-core/invitations/invitations.dto.test.ts:15-61`, `test/identity-core/invitations/invitations.http.test.ts:16-42`, `test/identity-core/invitations/invitations.service.test.ts:72-229`, and `test/identity-core/invitations/invited-event.contract.test.ts:19-94`.
- PASS: Service tests assert durable row storage at `test/identity-core/invitations/invitations.service.test.ts:73-85`, domain-event enqueue at `test/identity-core/invitations/invitations.service.test.ts:87-102`, audit envelope emission at `test/identity-core/invitations/invitations.service.test.ts:104-117`, trace/correlation separation at `test/identity-core/invitations/invitations.service.test.ts:119-169`, and reference-only audit payload at `test/identity-core/invitations/invitations.service.test.ts:171-184`.
- PARTIAL: The service test harness constructs `InvitationsService(repo, outbox, audit)` without `AuditOutboxService` at `test/identity-core/invitations/invitations.service.test.ts:48-60`, so it does not exercise the durable audit-outbox path used by production code at `src/identity-core/invitations/invitations.service.ts:163-170`.
- PARTIAL: The HTTP test asserts unauthenticated 4xx/non-404 only at `test/identity-core/invitations/invitations.http.test.ts:25-38`; it does not assert a tenant-admin success path or a wrong-role 403 path through the full `RbacGuard`, even though the code path is guarded.
- PARTIAL: The cross-tenant idempotency collision is not covered; the idempotency replay test only uses one tenant/key pair at `test/identity-core/invitations/invitations.service.test.ts:200-217`, while the schema defect is in the global unique key at `src/identity-core/db/schema.ts:472-480`.

**Verdict**: Tests are not vacuous, but they miss the production audit-outbox path, wrong-role RBAC, and the cross-tenant idempotency defect.

## Summary

- P2: Cross-tenant idempotency collision. `idempotency_key` is globally unique at `drizzle/migrations/0007_invitations_add.sql:41` and `src/identity-core/db/schema.ts:472-480`, but lookup is tenant-scoped at `src/identity-core/invitations/drizzle-invitations.repository.ts:81-95`; second-tenant collision bubbles through `src/identity-core/invitations/invitations.service.ts:174-181`.
- P2: Test coverage gap for production durability/RBAC. Tests omit `AuditOutboxService` in the service harness at `test/identity-core/invitations/invitations.service.test.ts:48-60` despite production durable enqueue at `src/identity-core/invitations/invitations.service.ts:163-170`, and HTTP coverage only checks unauthenticated rejection at `test/identity-core/invitations/invitations.http.test.ts:25-38`.
- Overall verdict: REQUEST-CHANGES. TraceId/correlation threading, transactional DSN durability, PHI-reference-only event shape, topic contract, and RBAC are sound, but the tenant-scoping defect on idempotency should be fixed before merge.

## Re-grill verification

**Date:** 2026-05-31

**Commit reviewed:** 75133d5 (fix) over 64614b8 (original)

**Reviewer harness:** Codex (cross-harness from Claude orchestrator)

**Verdict:** APPROVE

### Check results

| Check | Result | File:line | Notes |
|---|---|---|---|
| CHECK-1a SQL migration composite partial index | PASS | `drizzle/migrations/0007_invitations_add.sql:41`, `drizzle/migrations/0007_invitations_add.sql:56-58` | Column is `idempotency_key text`; index is `CREATE UNIQUE INDEX IF NOT EXISTS invitations_tenant_idempotency_key` on `(tenant_id, idempotency_key)` with `WHERE idempotency_key IS NOT NULL`. |
| CHECK-1b DDL identity_core path | PASS | `src/identity-core/db/migrations.ts:34-47`, `src/identity-core/db/migrations.ts:391-402` | Shared path calls `createInvitationsTable(IDENTITY_CORE_SCHEMA_NAME)`; helper emits same composite partial index. |
| CHECK-1c DDL per-tenant path | PASS | `src/identity-core/db/migrations.ts:62-82`, `src/identity-core/db/migrations.ts:391-402` | Per-tenant path calls `createInvitationsTable(schemaName)`, so it gets same DDL. |
| CHECK-1d Drizzle schema composite uniqueIndex | PASS | `src/identity-core/db/schema.ts:478`, `src/identity-core/db/schema.ts:490-492` | Drizzle uses `uniqueIndex('invitations_tenant_idempotency_key').on(table.tenantId, table.idempotencyKey).where(...)`. |
| CHECK-1e NULL unconstrained correct | PASS | `drizzle/migrations/0007_invitations_add.sql:41`, `drizzle/migrations/0007_invitations_add.sql:56-58` | Nullable column plus partial unique index means no-key invites do not collide on NULL. |
| CHECK-2a Event key tenant-namespaced | PASS | `src/identity-core/invitations/invitations.service.ts:234-236` | Uses `` `${row.tenantId}:${idempotencyKey}` `` when key exists. |
| CHECK-2b Namespace collision-free | PASS | `src/identity-core/invitations/invitations.dto.ts:22-29`, `src/identity-core/invitations/invitations.dto.ts:75-78`, `src/identity-core/db/schema.ts:473` | Tenant IDs are UUIDs, so `tenantId=a:b` collision class is outside production input/DB domain. |
| CHECK-2c No-key fallback collision-free | PASS | `src/identity-core/invitations/invitations.service.ts:129`, `src/identity-core/invitations/invitations.service.ts:234-236` | Fallback includes fresh `randomUUID()` row id: `` `Invited:${row.id}:${occurredAt}` ``. |
| CHECK-3 Repository lookup consistent | PASS | `src/identity-core/invitations/drizzle-invitations.repository.ts:84-98` | Lookup filters both `tenantId` and `idempotencyKey`. |
| CHECK-4a Cross-tenant test proves distinct rows + events | PASS | `test/identity-core/invitations/invitations.service.test.ts:290-314` | Same `SHARED_KEY` passed to both tenant calls; test asserts distinct rows and 2 events. Minor caveat: does not separately assert `row.idempotencyKey === SHARED_KEY` but functional proof is present. |
| CHECK-4b Cross-tenant test would RED on old code | PASS | `test/identity-core/invitations/invitations.service.test.ts:310-314`, `src/identity-core/db/outbox.service.ts:150-155`, `64614b8:src/identity-core/invitations/invitations.service.ts:228` | Old code used raw idempotency key; global outbox dedupe would collapse second event → 1 event instead of 2. |
| CHECK-4c Durable-enqueue test exercises real outbox | PASS | `test/identity-core/invitations/invitations.service.test.ts:30-33`, `test/identity-core/invitations/invitations.service.test.ts:265-284`, `src/identity-core/db/audit-outbox.service.ts:219-223` | Test wires `AuditOutboxService` and asserts `auditOutboxStore.all()` contains the durable audit record. |
| CHECK-5 No regression on sound areas | PASS | `src/identity-core/invitations/invitations.service.ts:214-236`, `src/identity-core/invitations/invitations.service.ts:260-269`, `src/identity-core/events/invitation-event-producer.ts:29`, `test/identity-core/rbac/invitation-scope.test.ts:52-77` | Diff only changes event idempotency key; trace/correlation, PHI/reference-only audit shape, topic name, and runtime RBAC remain intact. |

### New defects found (if any)

None.

### Summary

The tenant-scoped idempotency fix is complete across all three sources of truth (SQL migration, runtime DDL both schema paths, Drizzle schema) and the outbox event key. Repository lookup is consistent with the new composite constraint. Cross-tenant test is load-bearing. No regressions in sound areas. Targeted local HTTP/RBAC test execution was blocked by sandbox port-binding (`EADDRINUSE` on port 0) so that run is non-decisive, but the overall static review and service-layer test suite (434 pass) support approval.
