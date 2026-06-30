# Codex grill — m9-S5.3b audit-outbox relay poller, identity-service PR#65

> Cross-harness adversarial grill (Claude orchestrator → Codex worker), Tier-2 per
> [[curaos-verification-stack-rule]]. PR#65 introduces the post-commit relay poller that
> drains `identity_core.audit_outbox` (status=pending) → Kafka topic
> `curaos.core.audit.event.v1` (partition key = tenantId). Durability + ordering change
> for M9-S5.3b (issue your-org/curaos-ai-workspace#253).

- PR: https://github.com/your-org/identity-service/pull/65
- Commit grilled: `11b3cb8`, base main @ `e7b4996`
- Branch: `verify-253`
- Issue: `your-org/curaos-ai-workspace#253`

## Verdict: REQUEST-CHANGES

**Two real defects found. One (P1) is a known design choice that needs an explicit HIPAA
durability alert to be acceptable; one (P1) is a partial starve risk on markPublished
failure that contradicts the relay's own comment. No P0: no path where a row is marked
published without a publish attempt, no ordering violation for normal handled failures,
no second kafkajs client, no deadlock.**

---

## Attack Surface Results

### Attack 1 — markPublished failure after successful publish (mark-vs-publish gap)

**Finding:** REAL but bounded. `relayPendingBatch` wraps `publish()` in a try/catch at
`src/identity-core/db/audit-outbox-relay.ts:217-231`. `markPublished()` is called at
line 233-235 OUTSIDE that catch — if it throws, the exception propagates up through
`relayPendingBatch` to `tick()`'s bare swallow at lines 176-183.

**Consequence (a) — double-publish:** The row stays pending → re-published next poll.
This is safe by design: S5.2 consumer is idempotent on `idempotency_key` (= `payload.eventId`).
Confirmed at `test/identity-core/db/audit-outbox-relay.test.ts:145-188` (test (c)).

**Consequence (b) — key starvation:** When `markPublished` for a row in key-group K_A
throws, the entire remaining batch (all other per-key groups after K_A in the Map
iteration order) is skipped that poll because the exception escapes the outer for-loops
and is swallowed by `tick()`. If K_A's first row reliably fails markPublished every poll
(persistent DB blip), NO subsequent key-group (K_B, K_C, …) is ever processed until
K_A stops failing.

**Severity: P1** — this is a starvation vector, not a data-loss vector. The starvation
persists only as long as the DB blip persists (if markPublished fails persistently the
deploy already has much bigger problems). But the relay's own doc-comment at lines
192-193 says "Independent keys proceed regardless of another key's failure" — which is
ONLY true for caught publish failures (line 231 `break`), NOT for uncaught markPublished
failures. The comment is a false contract.

**Repro:** In a test, inject a markPublished that always throws for tenant-A's first row.
Enqueue rows for tenant-A and tenant-B. Call `relayPendingBatch()`. Tenant-B's rows are
never published despite having no publish failures.

**Fix:** Wrap `markPublished` in its own try/catch inside the inner for-loop. On throw,
log + break that key (treat it like a publish failure — per-row, not per-batch). This
preserves the per-key ordering contract for the failing key and lets other keys drain.

---

### Attack 2 — maxRetries exhaustion → failed → silent row loss

**Finding: REAL defect.** `markFailed` at `src/identity-core/db/audit-outbox.service.ts:332-349`
(InMemory) and lines 597-616 (Postgres) both flip `status = 'failed'` when
`retryCount >= maxRetries`. Default `maxRetries = 10` at
`src/identity-core/db/audit-outbox-relay.ts:143-144`. `pending()` at lines 295-305
filters strictly `status === 'pending'`. A `failed` row is never returned by `pending()`
→ never published → never retried.

There is no log statement, no dead-letter enqueue, no metric, no alert when a row
transitions to `failed`. The row is silently abandoned.

An audit event that fails 10 times becomes a permanent HIPAA durability gap: the audit
fact is in the outbox but will never reach Kafka or the consumer. This is not an acceptable
silent behavior for a HIPAA-relevant audit trail.

**Severity: P1** — not P0 because: (1) reaching 10 retries requires a Kafka outage
lasting `retryBackoffMs * 10 = 10s` at defaults, (2) the SYSTEM already has a problem if
Kafka is unreachable for that long. But the failure mode is silent. Any operator reviewing
a HIPAA audit trail needs to know rows lapsed. This needs either: an error log at ERROR
level when status flips to `failed`, or a metric counter increment, or both. Existence of
the `failed` status column in the DB is not sufficient alerting.

**Note on "acceptable documented behavior":** The PR description and code comments do not
mention the maxRetries→failed terminal path at all. This is an undocumented data-loss
condition. The claim "NEVER dropped" in the relay's doc-comment at line 221 is false when
maxRetries is exhausted.

**Repro:**
```
const relay = new AuditOutboxRelayService(service, failingPublisher, {
  maxRetries: 2, retryBackoffMs: 0
});
await service.enqueue({ ... });
await relay.relayPendingBatch(); // retryCount = 1, pending
await relay.relayPendingBatch(); // retryCount = 2 >= maxRetries → status = 'failed'
const pending = await service.pending();
// pending.length === 0 — row gone from relay path, no log emitted
```

**Fix:** In `markFailed` (both InMemory and Postgres implementations), emit an ERROR-level
log when the row transitions to `'failed'`. Separately, a dead-letter pattern (re-enqueue
to a `dlq.audit_outbox` or emit a `AuditOutboxRowExhausted` event) is worth tracking as a
follow-up issue but is not required to unblock merge if the logging fix is applied.

---

### Attack 3 — Ordering under markFailed without break-coverage

**Finding: CLEAN.** The `break` at `src/identity-core/db/audit-outbox-relay.ts:231`
exits the inner row loop for the failing key, ensuring seq=N+1 does not publish ahead of
a failed seq=N for the same key. The outer per-key loop continues to the next key (Map
entry), which is correct.

For the re-publish scenario (publish seq=5 succeeded, markPublished(seq=5) throws →
seq=5 still pending): on the next poll `pending()` returns seq=5 first (ascending sort at
line 304), seq=6 second. The relay publishes 5 then 6. Per-key order is preserved across
the re-publish cycle.

`pending()` at lines 295-305 sorts by `seq` ascending. `byKey` grouping at lines 203-211
iterates `rows` in the sorted order, so each group's array is in ascending seq order.
Map insertion preserves the first-seen-seq key ordering. The design is correct for the
normal handled-failure path.

**Severity: OK** — no defect. (The markPublished-throw starvation of attack 1 is a
separate concern.)

---

### Attack 3b — Cross-key fairness / Map ordering

**Finding: CONDITIONALLY CLEAN.** The outer `for (const group of byKey.values())` at
line 215 proceeds through all keys. The only path that exits the outer loop early is an
uncaught exception from `markPublished` (attack 1). For caught publish failures (the
`break` at line 231), the inner loop breaks but the outer loop continues — tenant-B
rows are published even when tenant-A fails. This is correct.

The Map insertion-order guarantee holds in V8 / Bun for string keys. No ordering defect
for the normal failure path.

**Severity: OK** — no defect beyond the already-noted attack 1 consequence.

---

### Attack 4 — Non-overlap guard correctness

**Finding: CLEAN in deployed wiring.** `tick()` at lines 172-185 sets `this.running = true`
before calling `relayPendingBatch`, resets in `finally`. `relayPendingBatch` is public but:

- `onModuleInit()` at lines 156-163 starts exactly ONE `setInterval` → only one call site
  for `tick()`.
- `identity-core.module.ts:367` registers `AuditOutboxRelayService` as a provider. NestJS
  instantiates one instance. The module does not wire any additional caller of
  `relayPendingBatch`.
- Tests call `relayPendingBatch()` directly but are sequential (single-threaded Bun test
  runner, no concurrent calls).

A theoretical second direct caller of `relayPendingBatch` (bypassing `tick`) would not
be guarded by `running`. But no such caller exists in the PR. The risk is documentation-
only; not a deployed defect.

**Severity: OK** — no deployed defect. Recommend adding a JSDoc note on `relayPendingBatch`
warning that it is not re-entrant-safe if called concurrently (currently only safe because
it is only called through `tick`).

---

### Attack 5 — Module adapter: does it reach Kafka or is it a no-op?

**Finding: EXPECTED BEHAVIOR, BUT NEEDS DOCUMENTATION.** The `AUDIT_OUTBOX_PUBLISHER`
provider at `src/identity-core/identity-core.module.ts:357-358` calls
`auditOutboxPublisherFactory()` with NO argument. The factory signature at line 166-168 is:

```typescript
function auditOutboxPublisherFactory(
  producer: KafkaSendProducer = actorEventProducer,
): AuditOutboxPublisher
```

The default is `actorEventProducer` — the in-process singleton at
`src/identity-core/events/actor-event-producer.ts:89`. Its `send()` at lines 65-74
pushes to an in-memory `sent[]` array. It does NOT reach Kafka. No second kafkajs client
is created (confirmed).

This means: in the standalone shell and in all unit/integration tests, the relay marks
rows `published` after successfully "publishing" to an in-memory array. No bytes reach
a real Kafka broker. This is NOT a false-durability defect for the deployed modulith
(the PR comment at lines 149-155 explicitly documents that the modulith host swaps the
underlying producer at composition time), but it IS a gap: there is no integration test
that verifies the modulith-level wiring actually swaps to a real producer. A misconfigured
modulith could ship with the in-memory stub in prod.

The doc-comment at `identity-core.module.ts:149-155` is clear about the design intent.
The `app.module.ts` and any modulith composition file are out of scope for this PR's diff.

**Severity: P2** — not a bug in this PR's code, but a missing integration smoke test
(does the modulith wire a real producer before this relay goes live?) should be tracked
as a follow-up issue. The relay correctly defers real-Kafka wiring to the composition
layer by design.

---

### Attack 6 — Test honesty

**Finding: MOSTLY HONEST, ONE GAP.**

**Uses real implementations:** Tests at `test/identity-core/db/audit-outbox-relay.test.ts`
construct `InMemoryAuditOutboxStore` + `AuditOutboxService` directly (lines 77-86). No
store mock. Correct.

**Durability test (b) is honest:** Lines 131-136 call `service.pending()` a SECOND time
after the failed batch and assert the row is still readable with `status === 'pending'`
and `retryCount === 1`. This proves true store persistence of the pending state, not just
that markFailed was called. Correct.

**Ordering test (d) is honest about wire order:** Lines 204-208 check that tenant-B's
row published and tenant-A's rows did not. Lines 214-217 verify the second batch
publishes in the exact wire order `['b1', 'a1', 'a2']` by checking `publisher.eventIds()`
(the actual call order on the FakePublisher). This is wire-order proof, not just
membership proof. Correct.

**Gap: maxRetries exhaustion is not tested.** No test covers the `retryCount >= maxRetries
→ status = 'failed'` transition. The attack 2 defect (silent loss) is present in the
code but invisible in the test suite. A test that drives `maxRetries` retries and then
asserts: (1) `service.pending()` returns empty, (2) some observable signal (log/metric)
was emitted — is needed to lock the behavior.

**Severity: P1** (same as attack 2) — the test gap is the observability of the
terminal-failure path.

---

## Summary

**Three items must be addressed before merge:**

1. **(P1) markPublished failure exits the entire batch, starving other keys.** Wrap
   `markPublished` in its own try/catch inside the inner row loop.
   File: `src/identity-core/db/audit-outbox-relay.ts:233-235`. The relay's own doc
   comment at lines 192-193 promises per-key isolation but does not deliver it for
   markPublished throws.

2. **(P1) maxRetries exhaustion silently drops audit rows with no observable signal.**
   Emit an ERROR-level log (at minimum) in `markFailed` when `retryCount >= maxRetries`.
   The relay comment at line 221 says rows are "NEVER dropped" — that claim is false
   after 10 retries. HIPAA-relevant audit trails must not silently discard facts.
   Files: `src/identity-core/db/audit-outbox.service.ts:344` (InMemory) and `:611-612`
   (Postgres). Add a test covering the terminal-failure path.

3. **(P2, followup acceptable) No integration smoke test for the modulith producer swap.**
   The in-process `actorEventProducer` default is Kafka-free by design, but there is
   no test ensuring the modulith composition layer correctly injects a real producer.
   Track as a follow-up issue before this relay is enabled in prod.

**What the PR gets right:**
- Per-key ordering logic is correct: `pending()` sorts by seq ascending, grouping
  preserves seq order within a key, caught publish failures break only the failing key.
- No second kafkajs client — the adapter correctly reuses the existing producer port.
- At-least-once safety is real: double-publish is a documented no-op via idempotency_key,
  and test (c) proves it with the real store.
- The `running` guard in `tick()` correctly prevents overlap from the interval; the
  deployed wiring has exactly one caller of `tick()`.
- Tests use real `InMemoryAuditOutboxStore` + `AuditOutboxService` — no store mocking.
- `bun run ci`: 401 pass / 39 skip / 0 fail / tsc clean / k6 PASS (verified locally).

---

## Re-grill verification

**Verdict: APPROVE**

Re-grill date: 2026-05-31. Reviewed commits: base `11b3cb8` → fixes `ed5683b`.
Fixes-only scope: `git diff 11b3cb8...ed5683b` touches exactly four files —
`src/identity-core/db/audit-outbox-relay.ts`, `src/identity-core/db/audit-outbox.service.ts`,
`test/identity-core/db/audit-outbox-relay.test.ts`,
`test/identity-core/db/audit-outbox.postgres.test.ts`. Nothing else changed.
`bun run ci`: 403 pass / 40 skip / 0 fail / tsc clean (verified locally by worker).

---

### Fix 1 — markPublished starvation (P1 closed)

**(a) Escape path eliminated.**
`audit-outbox-relay.ts:238–253` wraps `markPublished` in its own inner `try/catch`.
The catch body does `failed += 1; break;` and does NOT re-throw. There is no path by
which a `markPublished` throw can escape `relayPendingBatch` and starve later keys.

**(b) Break scope is correct — inner row loop only.**
The loop structure at lines 220–256 is:
```
for (const group of byKey.values()) {   // outer — over keys
  for (const row of group) {            // inner — over rows in one key
    ...
    try { await markPublished(...) } catch {
      failed += 1;
      break;  // ← exits the INNER for-loop (this key's rows only)
    }
    published += 1;
  }
  // outer loop continues to the next key regardless
}
```
`break` at line 252 exits the inner `for (const row of group)` loop. The outer
`for (const group of byKey.values())` loop continues to the next key. Confirmed:
no `return`, no `continue` on the outer loop, no labelled break targeting the outer
loop.

**(c) Counter accounting.**
When `markPublished` throws: `failed += 1` fires (line 251); `published += 1`
(line 255) is SKIPPED because the `break` exits before reaching it. The row is
correctly NOT counted as published. `tick()` (line 177) discards the result entirely
— it is only surfaced to direct test callers. Test `(e)` at line 280–281 asserts
`result.published === 1` (b1 fully marked) and `result.failed === 1` (a1 blipped),
confirming the counter semantics are correct and tested.

**(d) No double-markPublished within one batch.**
The `break` at line 252 stops processing `group` after the first `markPublished`
throw. `a1` is not marked in this poll; `pending()` still returns it next poll; the
next poll calls `markPublished(a1.id)` once and successfully marks it. No single-batch
double-mark path exists.

**(e) Per-key seq ordering preserved on re-publish.**
`a1` stays `pending` with its original `seq`. `a2` (same key, higher seq) was never
published because the `break` stopped the inner loop after `a1`. On the next poll,
`pending()` returns rows ordered by `seq ASC` (line 613 in `audit-outbox.service.ts`);
grouping reconstructs `[a1, a2]` in seq order for key-A; `a1` publishes before `a2`.
Test `(e)` line 294 asserts `publisher.eventIds() === ['a1', 'b1', 'a1', 'a2']`
confirming seq ordering on the re-publish poll.

**Fix 1 verdict: CORRECT AND COMPLETE.**

---

### Fix 2 — silent maxRetries drop (P1 closed)

**(a) Alert fires exactly on terminal transition, not every retry.**
`InMemoryAuditOutboxStore.markFailed` (lines 380–409):
- Computes `retryCount = message.retryCount + 1` (line 388).
- Sets `status = retryCount >= maxRetries ? 'failed' : 'pending'` (lines 389–390).
- Guards the alert on `status === 'failed' && message.status !== 'failed'` (line 401) —
  the `message.status !== 'failed'` check means the alert fires ONLY when the row is
  crossing INTO failed FOR THE FIRST TIME, not on every retry and not on re-calls
  against an already-failed row.
- Test `(f)` at lines 317–319 confirms no alert fires on poll 1 (retryCount 1, still
  pending); alert fires exactly once on poll 2 (retryCount 2 = maxRetries).

**(b) Postgres RETURNING-based detection — correctness and transition-specificity.**
`PostgresAuditOutboxStore.markFailed` (lines 662–688):
- The `UPDATE` increments `retry_count + 1`, sets `status = CASE WHEN (retry_count + 1) >= maxRetries THEN 'failed' ELSE 'pending' END` (lines 672–677), and `RETURNING` the updated row (line 679).
- Check at line 685: `if (updated && updated.status === 'failed')` — fires the alert.
- **Transition specificity gap (low severity, not a production defect):** InMemory has
  an explicit `message.status !== 'failed'` guard (line 401); Postgres does not. If
  `markFailed` were called on a row already in `failed` state (e.g. via a direct store
  call bypassing the relay), the `UPDATE` would increment `retry_count` again (no
  `WHERE status = 'pending'` guard), RETURNING `status = 'failed'`, and the alert would
  fire a second time. However, **this path is not reachable in production**: `pending()`
  at line 610 filters `WHERE status = 'pending'`, so the relay never feeds a
  `failed`-status row back to `markFailed`. No external callers of `markFailed` exist
  in this codebase (`grep` confirms relay is the sole caller). The asymmetry between
  InMemory and Postgres is a minor correctness inconsistency, not a live defect. It is
  noted but does not block approval.
- The postgres live test (lines 317–350) exercises this correctly: first `markFailed`
  leaves row `pending`, no alert; second crosses the threshold, alert fires once,
  `pending()` returns empty.

**(c) Logger signature match.**
`AuditOutboxLogger` interface at line 56–58: `error(message: string, ...meta: unknown[]): void`.
`console` default implements `console.error(message?, ...optionalParams)` which matches
`error(string, ...unknown[])`. `logTerminalFailure` calls `logger.error(string, cause)`
at line 79–86 — single meta arg, matches the variadic rest parameter. No signature
mismatch.

**(d) Alert names enough to locate the lost fact.**
`logTerminalFailure` at lines 79–86 logs: `id=`, `topic=`, `idempotencyKey=`, `tenant=`,
and `retryCount=`, plus the raw `cause` as a second argument to `logger.error`. This
gives an operator all fields needed to locate the abandoned audit row and identify the
failure. Test `(f)` at lines 336–339 asserts each of these fields is present in the
message string.

**(e) RETURNING did not alter the non-terminal retry path.**
Before this fix, `markFailed` executed the same `UPDATE` without `RETURNING`. The `SET`
clause is unchanged; only `RETURNING ${SELECT_COLUMNS}` was appended (line 679). The
non-terminal branch (`(retry_count + 1) < maxRetries`) still sets `status = 'pending'`,
increments `retry_count`, sets `scheduled_at`, and clears `locked_until` — all
identical to pre-fix. The `RETURNING` result is only read for alert-gating; it is not
used to alter any other relay logic. Non-terminal path unchanged.

**(f) Row correctly latches `failed` — no loop-forever regression.**
The `CASE` expression (lines 676–677) and InMemory `status` derivation (line 390) both
latch `status = 'failed'` when `retryCount >= maxRetries`. `pending()` filters `WHERE
status = 'pending'` (Postgres line 610; InMemory line 348), so a latched row is
permanently excluded from the relay path. Confirmed by test `(f)` lines 324–330:
`pending()` is empty after terminal latch; `all()` shows `status = 'failed'`,
`retryCount = 2`. No loop-forever path introduced.

**Fix 2 verdict: CORRECT AND COMPLETE.** Minor Postgres/InMemory asymmetry on
transition guard noted above — low severity, not reachable via relay, does not block.

---

### Test load-bearing check

**Test (e) — markPublished-throw isolation (`audit-outbox-relay.test.ts:247–296`):**
- Uses `MarkPublishedThrowingStore` (lines 89–98) which extends `InMemoryAuditOutboxStore`
  and throws on `markPublished` for the chosen row id.
- Against `11b3cb8` (unfixed): no inner try/catch — the `markPublished` throw would
  propagate, kill the outer `for (group of byKey.values())` loop, b1 would never
  publish. Assertion `expect(publisher.eventIds()).toContain('b1')` at line 277 would
  **FAIL** on `11b3cb8`. Green on `ed5683b`.
- Asserts real behavior: key-B drains despite key-A's blip (line 277); a1+a2 still
  pending (line 287); `retryCount === 0` (line 289 — markFailed NOT called); second
  poll re-publishes a1, then a2 in order (line 294).

**Test (f) — terminal-failure loud alert (`audit-outbox-relay.test.ts:298–340`):**
- Injects `CaptureLogger` (lines 75–79) into `InMemoryAuditOutboxStore`; checks
  `logger.errors` after each poll.
- Against `11b3cb8` (unfixed): `InMemoryAuditOutboxStore` had no logger seam and no
  `logTerminalFailure` call — `logger.errors` would remain empty. Assertion
  `expect(logger.errors).toHaveLength(1)` at line 333 would **FAIL** on `11b3cb8`.
  Green on `ed5683b`.
- Asserts real behavior: exactly one error (line 333); message contains all four
  locating fields id / topic / idempotencyKey / tenant (lines 335–339).

**Postgres live test (`audit-outbox.postgres.test.ts:316–351`):**
- Exercises real SQL `CASE + RETURNING` against a live Postgres instance.
- Against `11b3cb8`: no `RETURNING`, no alert call — `logger.errors` empty. Assertion
  at line 343 would **FAIL** on `11b3cb8`. Green on `ed5683b`.

All three tests are load-bearing: they fail on the unfixed code and pass on the fix.

---

### Scope check

`git diff --name-status 11b3cb8...ed5683b` touches exactly:
- `src/identity-core/db/audit-outbox-relay.ts` — Fix 1 (inner try/catch)
- `src/identity-core/db/audit-outbox.service.ts` — Fix 2 (logger seam + alert)
- `test/identity-core/db/audit-outbox-relay.test.ts` — tests (e) + (f) + helper classes
- `test/identity-core/db/audit-outbox.postgres.test.ts` — Postgres live test

The gate (`audit-divergence-checker.ts`), the replayer (not yet implemented, #254),
the at-least-once design, and the `tick()`/`onModuleInit`/`onModuleDestroy` wiring
are all untouched. No scope creep.

---

### New defects

**Minor inconsistency (low severity, not blocking):** `PostgresAuditOutboxStore.markFailed`
lacks the `previous_status !== 'failed'` transition guard that `InMemoryAuditOutboxStore`
has at line 401. If `markFailed` were ever called directly on a row already in `failed`
state, the Postgres store would emit a duplicate terminal alert; the InMemory store would
not. This path is not reachable through the relay (pending() hard-filters to
`status='pending'`), and there are no other callers in this codebase. The asymmetry is
a correctness inconsistency worth a follow-up but does not constitute a production defect
and does not block this PR.

**No other new defects found.**

---

### Final verdict

**APPROVE.** Both P1 defects from the original grill are correctly and completely fixed.
Fix 1 contains the `markPublished` throw with an inner try/catch that breaks only the
failing partition key while other keys continue. Fix 2 adds a testable logger seam with
a loud terminal alert that fires exactly once at the `maxRetries` crossing in both
stores. All three new tests are load-bearing. The fix is tightly scoped. One minor
Postgres/InMemory alert-transition asymmetry is noted for follow-up but does not affect
production correctness.
