# Codex grill — m9-232 PR identity-service#51

**Harness:** Codex (opposite-harness adversarial grill, Claude → Codex)
**Date:** 2026-05-31
**Branch:** `agent/m9-232-diamond-login-producer-claude-893b1329`
**Worktree:** `/Users/dev/workspace/curaos-workspace/.worktrees/diamond-login-producer`
**Issue:** curaos-ai-workspace#232 — Diamond-path login audit producer so live logins PAIR in divergence checker

## Verdict: REJECT

One P1 finding (concurrent login CAS-drop recreates unpaired M3 facts — the exact symptom this PR is meant to fix) is unaddressed. All three high-priority invariants hold for the serial single-login path. Report is static source-trace only; no HTTP tests were executed (sandbox contract per grill README §HTTP-integration-tests).

---

## Invariant Check Results

### CHECK 1 — Pairing correctness: HOLDS (serial path)

M3 leg (`auth-audit-publisher.ts:51,53,58`):
```
tenant_id: user.tenantId,
action: 'UserLoggedIn',
correlation_id: user.id,
```

Diamond leg (`login-user.service.ts:108,112,113`):
```
tenantId: user.tenantId,
correlationId: user.id,
changedFields: ['last_login'],
```

Normalizers (`audit-normalizers.ts:86,124-125`):
- `UserLoggedIn` → `operationType:'login'`, `correlationId: event.correlation_id`, `changes: []`
- `Identity + last_login` → `operationType:'login'` (classification before filter), `correlationId: event.correlationId`, `changes: []` (after `last_login` filter)

Both legs produce identical `(operationType, tenantId, correlationId, changes)` tuples. Pairing is correct for a single serial login.

### CHECK 2 — `last_login` filter blast radius: HOLDS

`audit-normalizers.ts:177-178` — `diamondOperation` classification runs on the **full** `changedFields` before the filter:
```ts
const changedFields = [...(event.changedFields ?? [])];
const operationType = diamondOperation(event.resourceType, changedFields);
```
Filter at line 227 drops `last_login` from the change-set only. Classification outcome is unaffected.

Mixed envelope `['last_login','credential']` → `diamondOperation` reads `credential` → stays `credential-update`; `credential` survives the filter (only `last_login` is dropped, `audit-normalizers.ts:263`). No credential hiding. No mis-classification.

`last_login` is dropped for **every Diamond operation** (the filter is inside shared `diamondChanges`). Currently no M3 comparator expects `last_login` as a value-bearing field, so this is safe. Caveat: if a future operation legitimately needs `last_login` in `changes` it will be silently excluded — document this assumption.

### CHECK 3 — PHI boundary: HOLDS

Login emitter (`login-user.service.ts:104-113`) sends only `changedFields: ['last_login']` with no `changeValues`. Schema (`audit-event.schema.ts:125-133`) validates `changedFields` as identifiers only. `changeValues` is absent. No email, password, or PHI value reaches the wire or ledger.

---

## P0 findings (block merge)

None.

---

## P1 findings (must address before merge)

### P1-1 — Concurrent same-user logins: Diamond CAS-drop leaves unpaired M3 facts

**Where:** `src/auth/login-user.service.ts:76-77`
```ts
await this.auditPublisher.userLoggedIn(user);   // M3 emits (always succeeds)
await this.emitDiamondLoginAudit(user);          // Diamond: try/catch swallows
```

**Where:** `src/identity-core/audit/audit-publisher.service.ts:205-218`
```ts
const swapped = await this.store.compareAndSet(...);
if (!swapped) {
  throw new ConflictException(...);  // thrown on CAS miss
}
```

**Where:** `src/identity-core/audit/audit-chain-head.store.ts:264`
```ts
return (result.rowCount ?? 0) > 0;  // false → CAS miss
```

**What:** `IdentityCoreAuditPublisher.publish()` uses a CAS on the chain head. Two concurrent successful logins for the same user can both emit M3, then race on the Diamond CAS. The loser throws `ConflictException`, which `emitDiamondLoginAudit` swallows. Result: one M3 `UserLoggedIn` fact with no paired Diamond fact → `pendingCount > 0` → Phase D gauge RED. This is precisely the symptom this PR is meant to fix, reintroduced by an unconditional swallow.

**Why P1:** Correctness — the divergence checker's pending count can go positive again under concurrent load. Not P0 because it requires concurrent logins for the same user (non-trivial but realistic under multi-device or race-condition scenarios).

**Fix:** Retry `IdentityCoreAuditPublisher.publish()` on `ConflictException` / `AuditChainHeadConflictError` with a re-fetched chain head before swallowing. A bounded retry (e.g. 3 attempts) with fresh chain head on each attempt should be sufficient. Only swallow after retries exhausted. Add a concurrent-login parity test that drives two simultaneous `LoginUserService.login()` calls for the same user and asserts both Diamond envelopes were recorded.

---

## P2 findings (followups acceptable)

### P2-1 — `last_login` global filter is undocumented assumption

**Where:** `src/identity-core/divergence/audit-normalizers.ts:227`
```ts
.filter((field) => field !== 'last_login')
```

The filter silently excludes `last_login` from **every** Diamond change-set, not just login operations. If a future operation legitimately carries `last_login` as a value-bearing field (e.g. a profile-update that touches both `last_login` and `email`), it will be excluded without warning. Add an inline comment or a named constant (`CLASSIFICATION_ONLY_FIELDS`) documenting that `last_login` is intentionally classification-only and must never appear in `changes`.

### P2-2 — New test covers serial path only

**Where:** `test/integration/divergence/login-producer-parity.test.ts:115-156`

The new test drives the real producer → real normalizer → real checker pipeline. It is not hand-shaping facts. However, it tests a single sequential login only. No concurrent-login CAS-failure scenario is exercised, so the P1-1 defect is not caught. Add a concurrent case after fixing P1-1.

---

## What Claude got right (counter-balance)

1. **Normalizer symmetry is solid.** Both M3 and Diamond legs produce identical `(operationType, tenantId, correlationId, changes)` tuples for the serial path. The classification-before-filter ordering is correct.
2. **PHI boundary is clean.** No `changeValues`, no email/password field, schema enforces identifier-only `changedFields`. The login emitter cannot carry PHI.
3. **DI wiring is complete.** `IdentityCoreAuditPublisher` is exported from `IdentityCoreModule` and `AppModule` imports `IdentityCoreModule`. `LoginUserService` is registered in `AppModule` providers. No orphan construction sites found.
4. **Swallow-on-failure exists** and login cannot fail due to audit fan-out under the single-login path. The try/catch at `login-user.service.ts:103-118` is correct structurally.
5. **Real pipeline test** — `login-producer-parity.test.ts` drives real `LoginUserService.login()` + real publishers + real normalizers + real checker (not hand-shaped facts). This is the right testing approach.

---

_Static source-trace only. No HTTP integration tests executed (sandbox blocks ephemeral-port bind per grill README). Orchestrator should paste local `just ci` stdout as runtime evidence before re-grill._

---

## Re-grill verification (2026-05-31, post-ceedd8d)

Cross-harness adversarial re-grill. Static source-trace + test-inspection only (sandbox `read-only`; Bun test run blocked — `node_modules/@nestjs/common` not installed in worktree). All findings cite exact file:line from the ceedd8d diff.

### Findings

**1. P2 — Retry loop re-reads chain head per attempt; no double-emit possible**
Files: `src/auth/login-user.service.ts:113-137`, `src/identity-core/audit/audit-publisher.service.ts:166-176`, `src/identity-core/audit/audit-publisher.service.ts:205-227`
Verdict: OBSERVATION (correctly implemented).
`publish` re-reads chain head at the start of each call (not captured before the loop). On `ConflictException` the `continue` re-invokes `publish`, which sees the now-advanced head and chains correctly. A successful publish returns immediately at `login-user.service.ts:127` — no double-emit path exists.

**2. P2 — Retry exhaustion is finite; login resolves even under pathological contention**
File: `src/auth/login-user.service.ts:113-137`
Verdict: OBSERVATION (correctly implemented).
Boundary is `attempt <= maxAttempts` with `maxAttempts = 4`. On attempt 4 the catch `attempt < maxAttempts` is false → falls through to `return` (swallow). Login never throws. New concurrency test b (`test/integration/divergence/login-producer-parity.test.ts:237-277`) asserts login resolves and M3 leg fired, but does not assert publish was called exactly 4 times — minor coverage gap, not a bug.

**3. P2 — Non-conflict errors swallowed on first occurrence without retry**
File: `src/auth/login-user.service.ts:128-137`
Verdict: OBSERVATION (correctly implemented).
Retry branch gated by `error instanceof ConflictException && attempt < maxAttempts`; any non-conflict error hits `return` immediately. No explicit non-conflict error test added — low risk given the guard condition is unambiguous.

**4. P2 — Retry preserves PHI-safe pairing envelope; M3 leg is not retried**
Files: `src/auth/login-user.service.ts:76-77`, `src/auth/login-user.service.ts:116-126`, `src/auth/auth-audit-publisher.ts:48-61`
Verdict: OBSERVATION (correctly implemented).
M3 emits once before the Diamond retry loop. Every Diamond attempt uses identical envelope: `correlationId: user.id`, `resourceType: 'Identity'`, `changedFields: ['last_login']`, no `changeValues`. No envelope mutation between attempts.

**5. P2 — `CLASSIFICATION_ONLY_FIELDS` refactor is behavior-preserving**
File: `src/identity-core/divergence/audit-normalizers.ts:177-198`, `224-234`, `258-274`
Verdict: OBSERVATION (correctly implemented).
Set contains only `'last_login'`. Classification runs before filtering. Only `diamondChanges` uses the set. Filter behavior is identical to the prior inline filter; doc comment added per P2-1.

**6. P2 — Concurrency test mocks are realistic at the public error boundary; real store CAS contention not tested**
Files: `test/integration/divergence/login-producer-parity.test.ts:177-235`, `237-277`
Verdict: OBSERVATION (acceptable gap).
Mock throws `ConflictException` from `publish`, which matches the public error type from `IdentityCoreAuditPublisher.publish` (`audit-publisher.service.ts:212-226`). Validates retry behavior and M3 firing correctly. Does not exercise real store `compareAndSet` contention — acceptable for a unit-level concurrency test; a property-based or load test would be needed for full CAS coverage.

**7. P2 — Residual: `emitDiamondRoleGrantAudit` has the identical latent swallow pattern**
File: `src/admin/admin.controller.ts:76-95`, `115-122`, `143-154`
Verdict: OBSERVATION (out of PR #51 scope — follow-up warranted).
`emitDiamondRoleGrantAudit` still has unconditional swallow with no conflict retry, identical to the pre-fix `emitDiamondLoginAudit` pattern. Concurrent same-target role grants/revokes face the same race. Not a blocker for this PR but should be tracked as a follow-up issue against the role-grant audit producer.

### Runtime evidence

`git diff --check origin/main..HEAD` clean. `bun test` could not run — `node_modules/@nestjs/common` not installed in worktree. Orchestrator should paste local `just ci` stdout before merge per [[curaos-local-ci-first-rule]].

### Verdict

**ACCEPT-WITH-FOLLOWUP**

**P1-1 (concurrent CAS swallow): RESOLVED**

The retry loop correctly handles the CAS conflict, re-reads the advanced chain head on each attempt, bounds at 4 retries, swallows on exhaustion, and preserves login resolution in all paths. No new P0/P1 defects found. Follow-up: apply the same retry fix to `emitDiamondRoleGrantAudit` (same pattern, out of scope for this PR).
