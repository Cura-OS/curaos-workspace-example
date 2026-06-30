# Grill — M9-S6.2 invitation accept (`accepted.v1`) — POST-IMPLEMENTATION — PR identity-service#67

- **Issue:** your-org/curaos-ai-workspace#258 ([M9-S6.2], story #103)
- **PR:** your-org/identity-service#67
- **Reviewer harness:** Codex (dispatched by Claude Code orchestrator) + Claude Code (verification pass)
- **Implementer harness:** Claude Code
- **Scope:** POST-IMPLEMENTATION Tier-2 adversarial code review of the landed diff (opposite-harness grill)
- **Date:** 2026-06-01
- **Branch under review:** `verify-258` HEAD `9052039`, base `main` `b56f924`
- **Local CI:** `bun run ci` GREEN — 459 pass / 0 fail / tsc clean
- **Plan-grill file (worker self-grill, pre-implementation):** `ai/curaos/docs/grills/m9-s6.2-258-accept-pr67.md`

---

## Verdict

**REQUEST-CHANGES**

One CRITICAL defect: `DrizzleInvitationsRepository.markAccepted` drops the `tx.db` transaction handle passed by the service and performs the `UPDATE invitations SET status='accepted'` on the shared pool connection (`this.db`) outside the `outbox.transaction` boundary. If the event enqueue or audit CAS fails and the transaction rolls back, the invitation row stays `accepted` in the DB while no `accepted.v1` event or audit envelope was ever committed. A retry then sees `status=accepted` and returns the idempotent no-op, permanently losing the event chain. This makes #259's E2E unverifiable in production (though it would pass in tests because tests use `InMemoryInvitationsRepository`).

All other attack surfaces PASS.

---

## Attack Surface Results

### Attack 1 — traceId continuity (load-bearing for #259) — **PASS**

The flow trace is correctly threaded:

1. `invitations.service.ts:361` — `const flowTraceId = existing.traceId ?? principal.traceId` reads the row's persisted `trace_id` column; `principal.traceId` is the fallback only for legacy NULL rows (rolling-safe).
2. `invitations.service.ts:386` — `flowTraceId` passed to `enqueueAcceptedEvent`.
3. `invitations.service.ts:452` — accepted.v1 outbox record carries `headers.trace_id: flowTraceId`.
4. `invitations.service.ts:393` — `publishAudit` receives `flowTraceId`; audit envelope carries `traceId: flowTraceId`.

The accepting principal's `traceId` (`'flow-trace-accept-DIFFERENT'` in tests) is correctly **not** used for the event headers. The continuity property holds in code.

**NULL handling:** `existing.traceId ?? principal.traceId` at line 361 is safe — null/undefined trace_id from a pre-migration invite falls back to the accepting request's traceId; no crash, no null emitted. This is documented in the migration SQL and service docstring.

**Test coverage:** `invitations-accept.service.test.ts:181–194` asserts `envelope.traceId === INVITE_TRACE` and `domainHeaders.trace_id === INVITE_TRACE` where the inviter's traceId (`INVITE_TRACE`) and accepter's traceId (`'flow-trace-accept-DIFFERENT'`) differ. This is a correct and load-bearing assertion.

---

### Attack 2 — Idempotency atomicity — **FAIL**

#### CRITICAL: Drizzle `markAccepted` ignores `tx.db` — UPDATE runs outside the transaction

**Evidence:**

| Location | Finding |
|---|---|
| `invitations.service.ts:365–370` | Service calls `this.repository.markAccepted(principal.tenantId, id, now, tx.db)` inside `outbox.transaction` |
| `invitations.service.ts:111–116` (interface) | Interface declares `markAccepted(tenantId, id, now, db?: unknown)` — 4-arg signature with optional `db` |
| `drizzle-invitations.repository.ts:119–123` | **Implementation accepts only 3 params** (`tenantId, id, now`) — the `db?` param is absent from the function signature |
| `drizzle-invitations.repository.ts:124` | UPDATE runs on `this.db` (the shared pool connection), not the tx handle |
| `outbox.service.ts:587–594` | `outbox.transaction` wraps via `this.db.transaction(async (txDb) => ...)` — `tx.db = txDb` IS the Drizzle transaction connection |

**Consequence:** The `UPDATE invitations SET status='accepted' WHERE ...` commits immediately on the pool when `markAccepted` is called, before `enqueueAcceptedEvent` and `publishAudit` (both operating inside the Drizzle transaction via `tx.enqueue` + `auditOutbox.bindTo(tx.db)`). If either of those subsequent operations throws and the transaction rolls back:
- The outbox and audit rows are rolled back.
- The `invitations.status` row remains `'accepted'` (committed outside the tx).
- Any retry sees `status === 'accepted'` and hits the idempotent no-op at `invitations.service.ts:344–346`, permanently suppressing the event chain.

**TypeScript does not catch this** because the interface has `db?: unknown` (optional, any) and TypeScript does not enforce that the argument is actually used by the implementer.

**In-memory implementation:** `in-memory-invitations.repository.ts:88–101` also accepts only 3 params (no `db?` arg), which is correct for in-memory (no tx semantics needed), but means ALL service tests exercise the correct in-memory path and never expose the Drizzle production defect.

**Atomicity of the SQL predicate itself is correct** — `drizzle-invitations.repository.ts:127–138` issues `UPDATE ... WHERE tenant_id=? AND id=? AND status='pending' AND (expires_at IS NULL OR expires_at > now)` with `RETURNING *`. Two concurrent calls: only one row matches `status='pending'`, so only one returns a row. The SQL-level race is closed. **The defect is that this correct SQL runs outside the tx boundary.**

---

### Attack 3 — State-machine correctness — **PASS**

| State | Behavior | Location |
|---|---|---|
| Cross-tenant / unknown | `findByTenantAndId` returns `undefined` → `NotFoundException` | `invitations.service.ts:333–338` |
| Already accepted | Idempotent no-op, returns existing row | `invitations.service.ts:344–346` |
| Revoked | `ConflictException('invitation has been revoked')` | `invitations.service.ts:350–352` |
| Expired (`expiresAt <= now`) | `ConflictException('invitation has expired')` | `invitations.service.ts:353–355` |
| Not expired, not revoked, pending | Proceeds to accept | — |

**Expiry boundary:** `existing.expiresAt.getTime() <= now.getTime()` — boundary is correct (`<=`; the instant of expiry is treated as expired, matching migration SQL comment). No timezone issue: both are `Date` objects, comparison is UTC epoch millis.

**Cross-tenant rejection:** `findByTenantAndId` at `drizzle-invitations.repository.ts:99–107` uses `WHERE tenant_id=? AND id=?`. A cross-tenant caller with tenant B gets `undefined` → `NotFoundException`. No existence leak.

**Minor observation (non-blocking):** The cross-tenant test at `invitations-accept.service.test.ts:341–344` accepts `NotFoundException || ConflictException` (an OR) rather than asserting exactly `NotFoundException`. This weakens the test — a bug that returns `ConflictException` instead of `NotFoundException` for a cross-tenant call would pass. The spec (grill P0/finding #1) is explicit: cross-tenant → 404 (NotFoundException). Consider tightening to `expect(captured).toBeInstanceOf(NotFoundException)`.

---

### Attack 4 — PHI boundary on audit envelope — **PASS**

`invitations.service.ts:393–405`:
```
changedFields: ['status'],
changeValues: { org_id: [updated.orgId] },
```

- `changedFields` carries only the field name `'status'` (identifier, not a value).
- `changeValues` carries only `org_id: [updated.orgId]` — an opaque UUID that passes `ChangeReferenceValueSchema` (UUID branch at `audit-event.schema.ts:91`).
- `inviteeEmail` is never serialized: `invitations.service.ts:393–405` and the `enqueueAcceptedEvent` payload at `:431–461` reference only UUIDs and closed enums.
- `AuditEventEnvelopeSchema` at `audit-event.schema.ts:144–149` uses `z.partialRecord(ChangeValueKeySchema, z.array(ChangeReferenceValueSchema))` — `status` is a valid key but its value must be an RBAC role-code or UUID; `'accepted'` is neither, so putting the status VALUE there would throw at publish time (the worker correctly omitted it).
- The defense-in-depth `superRefine` PHI scan at `:154–188` serializes all value fields and pattern-matches DOB/SSN/name. Invitee email is never in the payload, so this passes vacuously.

Test at `invitations-accept.service.test.ts:366` explicitly asserts:
```
expect(JSON.stringify(record.value)).not.toContain('invitee@example.com');
```

---

### Attack 5 — Forward migration correctness — **PASS**

`drizzle/migrations/0008_invitations_accept.sql:44–48`:
```sql
ALTER TABLE identity_core.invitations
  ADD COLUMN IF NOT EXISTS trace_id text;
ALTER TABLE identity_core.invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
```

- `ADD COLUMN IF NOT EXISTS` — idempotent re-run is a no-op. ✓
- Forward-only: no `DROP COLUMN`, no `RENAME`, no `_v2` table. ✓
- Wired to shared schema applier: `migrations.ts:47` calls `addInvitationAcceptColumns(IDENTITY_CORE_SCHEMA_NAME)` inside `ensureIdentityCoreSchema`. ✓
- Wired to per-tenant schema applier: `migrations.ts:83` calls `addInvitationAcceptColumns(schemaName)` inside `ensureTenantIdentityCoreSchema`. ✓

**NULL-trace interaction with Attack 1:** The null-trace fallback is safe (Attack 1 PASS). The defect in Attack 2 is independent of null trace.

---

### Attack 6 — New topic + contract — **PASS**

- Topic constant: `invitation-event-producer.ts:33` — `'curaos.core.identity.accepted.v1'`.
- Zod schema: `AcceptedEventPayloadSchema` at `invitation-event-producer.ts` (line ~100+) uses `.strict()` — unknown keys throw, preventing accidental PHI smuggling.
- Builder: `buildAcceptedEventPayload` returns snake_case wire shape.
- Wired through existing outbox pattern: `invitations.service.ts:440` uses `tx.enqueue(...)` — same pattern as `invited.v1`.
- Single producer file, no second producer.

Contract test (`accepted-event.contract.test.ts:22–96`) locks:
- Topic string constant.
- Wire shape (snake_case, exact fields).
- Schema accepts valid payload.
- Schema rejects extra keys (`.strict()`).
- Schema rejects non-UUID `invitation_id`.

---

### Attack 7 — Test coverage + red-first evidence — **PARTIAL**

**What's covered well:**

| Property | Test | Location |
|---|---|---|
| traceId continuity (same as invite) | ✓ | `invitations-accept.service.test.ts:181` |
| correlationId stays per-leg | ✓ | `:198` |
| accepted.v1 + audit share same traceId | ✓ | `:218` |
| Expired invite → 409 | ✓ | `:280` |
| Revoked invite → 409 | ✓ | `:302` |
| Unknown invite → 404 | ✓ | `:317` |
| Cross-tenant → 404-or-409 | ✓ (weak) | `:331` |
| Durable audit enqueued | ✓ | `:349` |
| PHI absent from envelope | ✓ | `:366` |
| Double-accept no second event | ✓ | (idempotency test) |

**Gaps:**

1. **No Drizzle adapter test for tx binding.** All 15 service tests use `InMemoryInvitationsRepository` (`invitations-accept.service.test.ts:65`). There is no test using `DrizzleInvitationsRepository` that would expose the Attack 2 defect. A test that verifies "if `enqueueAcceptedEvent` throws after `markAccepted` succeeds, the invitation row is rolled back to `pending`" does not exist and cannot pass with the current implementation.

2. **Cross-tenant assertion too broad.** `invitations-accept.service.test.ts:341–344` allows `NotFoundException || ConflictException`. Per the spec (finding #1 in plan grill), cross-tenant MUST be `NotFoundException` only.

3. **No test for null-trace fallback.** There is no test seeding an invite with `traceId = null/undefined` and verifying the accepted.v1 carries the accepter's traceId (the fallback branch). This is a non-crash path but the branch is untested.

**Red-first evidence:** Test names + `INVITE_TRACE` / `'flow-trace-accept-DIFFERENT'` constants suggest intentional red-first design (`invitations-accept.service.test.ts:111–113`). The contract test structure (each property isolated) is consistent with red-first discipline. However, the Drizzle tx-binding test is absent entirely — it was never red-first because it was never written.

---

## Pre-Implementation Plan Grill Cross-Check

The worker's plan grill (`m9-s6.2-258-accept-pr67.md`) lists 14 findings (rows #1–#27 odd-numbered). All were marked resolved in the plan grill. Status in the final code:

| Plan Finding | Sev | Addressed in code? |
|---|-----|---|
| #1: Cross-tenant accept hole (`findByTenantAndId`) | P0 | ✓ FULLY — `findByTenantAndId` + tenant-scoped `markAccepted` predicate |
| #3: Accepting-actor semantics (invitee vs admin) | P0 | ✓ SCOPED — documented as out-of-scope for #258; comment at controller header |
| #5: Trace continuity rolling-safe (NULL fallback) | P0 | ✓ FULLY — `existing.traceId ?? principal.traceId` at service:361 |
| #7: Double-accept race (`markAccepted` single conditional mutation) | P0 | ⚠️ PARTIAL — SQL predicate is correct; **`tx.db` is not passed to Drizzle impl** (Attack 2 defect). The in-memory path is atomic; production Drizzle is not. |
| #9: Audit CAS in same tx as status + event enqueue | P1 | ⚠️ PARTIAL — Audit and event enqueue are inside `outbox.transaction`. **Status UPDATE is not** (same root cause as #7). |
| #11: CAS conflict behavior | P1 | ✓ FULLY — `ConflictException` thrown; tx rolls back event + audit (those are inside tx; status is not — same Attack 2). |
| #13: Migration helper mismatch (schema.ts + both appliers) | P1 | ✓ FULLY — `addInvitationAcceptColumns` called in both `ensureIdentityCoreSchema` (migrations.ts:47) and `ensureTenantIdentityCoreSchema` (migrations.ts:83) |
| #15: `expires_at` null/TTL semantics | P1 | ✓ FULLY — NULLable, `expiresAt <= now` boundary, app clock |
| #17: PHI leak via response shape | P1 | ✓ FULLY — `toResource` mapper excludes `inviteeEmail`, `traceId`, `expiresAt` |
| #19: Audit schema trap (`changeValues.status='accepted'` rejected) | P1 | ✓ FULLY — status VALUE omitted; only `changedFields: ['status']` + `changeValues: { org_id: [...UUID] }` |
| #21: Divergence pairing regression (`correlationId` collapse) | P2 | ✓ FULLY — `correlationId` stays per-leg |
| #23: Accepted-event idempotency key | P2 | ✓ FULLY — `Accepted:${tenantId}:${invitationId}` at service:460 |
| #25: Conflict response ordering (404/409) | P2 | ✓ CODE — cross-tenant→404 logic is correct. Test assertion is **weak** (accepts 404 OR 409). |
| #27: Duplicate-accept audit trade-off | P2 | ✓ DOCUMENTED — replay semantics documented in service docstring |

**Summary:** Findings #7 and #9 were the P0/P1 items about atomicity. The code addresses the SQL predicate correctness (one conditional UPDATE) and the in-process path, but the Drizzle `tx.db` binding was not carried through to the repository implementation. Findings #7 and #9 are therefore **partially addressed** — the conceptual design is correct, the wiring is broken in production.

---

## Summary Table

| Attack Surface | Verdict | Highest Severity Finding |
|---|---|---|
| 1. traceId continuity | PASS | — |
| 2. Idempotency atomicity | **FAIL** | **CRITICAL: `DrizzleInvitationsRepository.markAccepted` ignores `tx.db` — UPDATE outside tx** (`drizzle-invitations.repository.ts:119–139`) |
| 3. State-machine correctness | PASS | LOW: cross-tenant test asserts `NotFoundException \|\| ConflictException` (should be exact) |
| 4. PHI boundary | PASS | — |
| 5. Forward migration | PASS | — |
| 6. New topic + contract | PASS | — |
| 7. Test coverage | PARTIAL | MEDIUM: no Drizzle tx-binding rollback test; no null-trace-fallback test |

---

## Required Fix

**`drizzle-invitations.repository.ts:119`** — add `db?: unknown` parameter and use it when provided:

```typescript
async markAccepted(
  tenantId: string,
  id: string,
  now: Date,
  db?: unknown,
): Promise<InvitationRow | undefined> {
  const executor = (db as typeof this.db | undefined) ?? this.db;
  const rows = await executor
    .update(invitations)
    // ...
```

Or use the same typed pattern that `enqueueIn` uses in `outbox.service.ts:590` (where `txDb` is already typed as the Drizzle executor).

**Add a Drizzle-adapter integration test** that verifies: when `enqueueAcceptedEvent` throws after `markAccepted`, the invitation row is rolled back to `pending` and no outbox row was committed.

**Tighten cross-tenant test** at `invitations-accept.service.test.ts:341`:
```typescript
expect(captured).toBeInstanceOf(NotFoundException);
```

**Add null-trace-fallback test:** seed invite with `traceId: undefined`, accept, assert `accepted.v1.headers.trace_id === accepterPrincipal.traceId`.

---

> This is the T2 PR gate grill (opposite-harness code review of the landed diff). Re-grill verification (if a fix PR is raised) should append a `## Re-grill verification` section to this file per `ai/curaos/docs/grills/README.md` lifecycle.

## Re-grill verification (46f44c1) — orchestrator-verified

The cross-harness re-grill agent stalled on a codex sandbox/output loop (infrastructure, not a code issue — same failure mode as the #255 re-grill). The orchestrator verified the single CRITICAL fix directly:

**CRITICAL (tx-handle drop) — CLOSED.** `git diff 9052039...46f44c1` on `drizzle-invitations.repository.ts`: `markAccepted` now takes `db?: unknown` and runs the conditional UPDATE on `const executor = (db as DrizzleDb | undefined) ?? this.db` — the passed `tx.db` (outbox transaction executor) when present, NOT the shared pool. The `WHERE status='pending'` conditional atomicity (one-winner) is preserved. Mirrors the existing `insert` executor-threading pattern. The status transition now commits on the SAME outbox transaction as the `accepted.v1` enqueue + audit CAS → all-or-nothing; no committed-without-event window.

**Load-bearing proof (worker-run, orchestrator-confirmed present):**
- `test/identity-core/invitations/invitations-accept-rollback.postgres.test.ts` (new live-Postgres test) — RED against `9052039` (`Expected: "pending" Received: "accepted"` — the row committed outside the tx despite rollback), GREEN after the fix.
- Cross-tenant test (`invitations-accept.service.test.ts:331-342`) tightened to `NotFoundException` ONLY (a 409 would leak that the row exists under another tenant) — confirmed.
- Null-trace fallback test (`:349`) added — `existing.traceId ?? principal.traceId` for pre-#257 rows.

**Independent CI:** `bun run ci` GREEN (460 no-DSN / 0 fail) + all 8 `*.postgres.test.ts` 68 pass / 0 fail (live PG).

**Prior 6 PASSes unchanged** (diff scoped to the repo method + tests): traceId continuity, state machine (expiry/revoke/cross-tenant), PHI reference-only, forward migration, topic contract.

**Effective verdict: APPROVE.** The sole CRITICAL is closed + proven by a live-PG rollback test; all other surfaces remain sound; scope clean. (The stalled codex re-grill is an infra artifact; the verification above is the equivalent adversarial check, performed directly.)
