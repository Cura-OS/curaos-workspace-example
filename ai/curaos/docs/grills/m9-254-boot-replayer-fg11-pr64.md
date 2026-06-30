# Codex grill — M9-S5.3c boot replayer + FG-11 markReplayComplete host-wiring, identity-service PR#64

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]]. PR#64 fixes the PR#56 boot-time false-green in the modulith
> path: the composition root used to call `markReplayComplete()` immediately after `rehydrate()`
> with nothing replayed. This PR inserts the `replayAuditOutbox()` call between them.
> Issue `your-org/curaos-ai-workspace#254`.

- id-svc PR: https://github.com/your-org/identity-service/pull/64 — branch `feat/m9-s5.3c-boot-replayer-254`, commit `b33c3f4`, base `b68b5ce`
- Issue: `your-org/curaos-ai-workspace#254` [M9-S5.3c]
- CI (orchestrator): `397 pass / 39 skip / 0 fail / tsc clean / k6 wrapper PASS`
- Grill date: 2026-05-31

## Verdict: APPROVE

No false-green vector found after reading every attacked surface end-to-end. The #243 invariant holds in all traced paths. Details below.

---

## Attack surface findings

### Attack 1 — headOffset vs checkpoint divergence (unmapped row tail)

**File:** `src/identity-core/divergence/audit-outbox-replayer.ts:184–211`

The loop sets `headOffset = offset` for EVERY row (line 209) but calls `recordDurable(fact, offset)` ONLY for mapped rows where `fact !== undefined` (line 198). The concern: if the outbox tail ends with unmapped rows, the durable checkpoint does NOT advance past them (no `recordDurable` was called), yet `headOffset` is reported at the higher seq.

**Verdict: No false-green.** The concern is real in the sense that the durable checkpoint lags behind the max seq read, but:

(a) **On next boot those rows are re-read.** `sinceSeq(lastDurableOffset)` re-fetches them; they normalize to `undefined` again and are skipped again. This is genuinely idempotent — unmapped rows carry no gate-bearing state. The code comment at line 200–208 explains this explicitly: "The checkpoint is carried by the NEXT mapped row's `recordDurable`; a tail of only-unmapped rows leaves the checkpoint where the last mapped row left it, which is correct because replaying unmapped rows is a no-op for the gate."

(b) **Can a mapped row arrive later at a lower seq than the unmapped tail?** No. `seq` is `BIGINT GENERATED ALWAYS AS IDENTITY` (verified: `src/identity-core/db/migrations.ts`). Identity sequences allocate monotonically within a session; a row allocated seq N cannot have a later-committing row at seq < N because the sequence generator is transaction-external (allocated before commit, visible in commit order). A mapped row cannot appear at a lower seq than already-checkpointed rows.

(c) **Can the gate mark replay complete while a mapped fact past the checkpoint is skipped?** No. The replayer reads ALL rows with `seq > durableOffset()` in ascending order. Any mapped row in that range is processed before the loop ends. Only rows the normalizer returns `undefined` for are skipped, and those carry no gate-bearing state by the same "unmapped = silently ignored" semantics the live tap uses.

**Result: CLEAN.**

---

### Attack 2 — recordDurable per-row persist + crash mid-replay

**File:** `src/identity-core/divergence/audit-divergence-checker.ts:880–901`

`recordDurable` at line 899 calls `await this.ledger.persist(this.snapshot(), { resolved })`. The `await` means `persist()` must resolve before `recordDurable` resolves. The checkpoint `this.lastOffset = offset` is set at line 883 before the persist call. This means:

- If the persist succeeds → checkpoint is durable at this seq.
- If the persist throws → the `await` re-throws from `recordDurable`, propagating out of `replayAuditOutbox`, which propagates out of `divergenceCheckerFactory` (no try/catch there — lines 190–222 are bare awaits), crashing the Nest provider factory.

**The dangerous direction (checkpoint-advances-but-fact-not-folded = false-green):** The in-memory state (`this.record(fact)`, `this.lastOffset = offset`) advances BEFORE the `await ledger.persist(...)`. If a crash occurs after the in-memory advance but before the persist resolves, the process dies and the durable checkpoint does NOT advance. On next boot the replayer re-reads from the PREVIOUS durable offset, which is still pointing before this row — the row is replayed again. This is safe (over-replay, not under-replay).

**Could persist succeed but the fact not be folded?** Only if `this.record(fact)` throws BEFORE persist is called. `record()` is synchronous and involves only Map operations (line 881) — it cannot throw for a well-formed fact, and the normalizer would have thrown earlier (at `replayFactFromRow`) if the payload were corrupt.

**The only false-green path would require persist to complete AND the in-memory fold to be missing.** The ordering is `record(fact)` → `lastOffset = offset` → `await persist(...)`. Persist succeeds → fold already happened → checkpoint is durable → safe.

**Result: CLEAN. The crash-safe direction is over-replay (never under).**

---

### Attack 3 — M3 camelCase→snake_case remap (m3OutboxPayloadToInput)

**File:** `src/identity-core/divergence/audit-outbox-replayer.ts:115–132`

The `m3OutboxPayloadToInput` function translates the camelCase outbox payload back to the snake_case `M3AuditEventInput` the normalizer reads. Fields mapped:

| snake_case target | camelCase sources tried | Required by normalizer/pairKey |
|---|---|---|
| `tenant_id` | `payload.tenantId ?? payload.tenant_id ?? ''` | YES — pairKey uses `tenantId` from the produced fact |
| `actor_id` | `payload.actorId ?? payload.actor_id ?? ''` | YES — carried in fact |
| `action` | `payload.action ?? ''` | YES — route to operationType |
| `resource_type` | `payload.resourceType ?? payload.resource_type ?? ''` | YES — some normalizer paths check it |
| `resource_id` | `payload.resourceId ?? payload.resource_id ?? ''` | YES — canonical token for role grants |
| `correlation_id` | `payload.correlationId ?? payload.correlation_id ?? ''` | YES — pairKey uses `correlationId` |
| `outcome` | `payload.outcome` (no default) | OPTIONAL — `normalizeOutcome(undefined)` → `'success'` (correct) |

**Attack on resource_id (role grants):** The M3 emit site (`auth-audit-publisher.ts`) stores `resourceId: \`${targetUserId}:${role}\`` in the camelCase outbox envelope. The translation: `resource_id: String(payload.resourceId ?? payload.resource_id ?? '')`. If both keys are absent (impossible for a well-formed row — the emit site always sets `resourceId`) the result is `''`. Then `m3Changes('RoleAssigned', '')` produces `[{ field: 'role', values: [''] }]` (no colon → defensive fallback at audit-normalizers.ts:158). This is a phantom value that would diverge against the Diamond path's well-formed `membership:<target>#<role>` token. Direction: **phantom DIVERGENCE (RED), not phantom MATCH (false-green)**.

**Could the translation produce a fact that matches DIFFERENTLY at replay vs live?** Only if the live tap receives a snake_case wire envelope with different `resource_id` values than the camelCase outbox payload's `resourceId`. Since both come from the same `AuthAuditPublisher.emitDurable` call that sets `resourceId: \`${targetUserId}:${role}\``, the values are structurally identical. The `??` fallback accepts either casing, so a payload using `resource_id` directly (snake_case) is also correctly translated.

**Result: The remap covers every field the normalizer needs. Silent empty-string defaults fail OPEN toward divergence, not toward false-green. CLEAN.**

---

### Attack 4 — Normalizer-throw propagation = fail-loud

**File:** `src/identity-core/divergence/audit-outbox-replayer.ts:186–192` (comment block), `src/identity-core/identity-core.module.ts:161–222`

The comment at replayer lines 186–192 explains the deliberate choice: a normalizer throw (corrupt payload, schema violation) propagates out of `replayFactFromRow`, propagates out of the `for` loop in `replayAuditOutbox`, propagates out of `await replayAuditOutbox(checker, auditOutbox)` at module line 204 — which is a bare await inside the async `divergenceCheckerFactory`. There is no try/catch in the factory.

**Does Nest swallow a provider-factory rejection?** Checked `src/main.ts` and `src/app.module.ts`:
- `main.ts` calls `await NestFactory.create(AppModule, ...)` then `await app.listen(...)`.
- NestJS provider factory rejections cause `NestFactory.create()` to reject, which propagates to the top-level async IIFE in `main.ts`, causing the process to exit with a non-zero code.
- Nest does NOT start a degraded app when a provider factory throws — it aborts module initialization.

Verified by the Codex probe: a small `bun --eval` test confirmed that a rejected async factory in a NestJS testing module causes `Test.createTestingModule().compile()` to reject, not to produce a partial module.

**Result: A normalizer throw kills the pod. Gate is RED-by-absence (no process to serve the endpoint). CLEAN.**

---

### Attack 5 — Test seam honesty

**File:** `test/identity-core/divergence/audit-outbox-replay-boot.test.ts`

`buildDivergenceCheckerForBoot(deps)` at `src/identity-core/identity-core.module.ts:231–235` calls the REAL `divergenceCheckerFactory(deps)` with the injected stores. The factory's `deps` branch at line 174–176 bypasses the DSN/Postgres path and uses the injected `ledger` and `auditOutbox` directly. The rest of the factory (rehydrate → replay → markReplayComplete) is identical to the deployed zero-arg path — there is no separate code path for the test seam.

**Does the FG-11 wiring test actually fail if markReplayComplete is moved before the replay loop?**

The test at lines 126–199 installs call-order spies on the REAL `AuthDiamondDivergenceChecker.prototype.recordDurable` and `.markReplayComplete`. It asserts `events.toEqual(['recordDurable:3','awaitingReplay:true','recordDurable:4','awaitingReplay:true','markReplayComplete'])` (line 180). If `markReplayComplete` were moved to BEFORE `replayAuditOutbox` in the factory, `events` would record `markReplayComplete` FIRST — the `toEqual` assertion fails. The spy is load-bearing: it intercepts the ACTUAL prototype methods and records them in insertion order.

**Does the seam diverge from the deployed zero-arg path?** The only difference is `deps !== undefined` at line 174, which selects the injected stores rather than constructing Postgres stores from the DSN. The `tapInFlight` / `writeFailureLatch` gate options from `gateOptions` (lines 168–171) are included in BOTH paths (line 189: `new AuthDiamondDivergenceChecker({ ledger, ...gateOptions })`). The deployed and test-seam paths exercise identical boot ordering logic.

**Result: The test seam is honest. The spy is load-bearing. Moving markReplayComplete before replay turns this RED. CLEAN.**

---

### Attack 6 — null checkpoint = replay-from-beginning (Postgres SQL null trap) ★ HIGHEST RISK

**File:** `src/identity-core/db/audit-outbox.service.ts:566–582`

This is the highest-risk attack. The concern: `parseCheckpoint(null)` → `null` → `sinceSeq(null)`. If the Postgres implementation generates `WHERE seq > NULL`, that evaluates to NULL (unknown) in SQL, returning ZERO rows — the gate marks replay complete having replayed nothing = exact false-green.

**Actual Postgres implementation (line 571–572):**
```typescript
const predicate =
  afterSeq === null ? 'TRUE' : `seq > ${String(afterSeq)}::bigint`;
```

The code EXPLICITLY handles `null`: when `afterSeq === null`, it substitutes the literal string `'TRUE'` as the predicate, producing:
```sql
SELECT ... FROM identity_core.audit_outbox WHERE TRUE ORDER BY seq ASC
```
This returns ALL rows — correct replay-from-beginning semantics. The null case NEVER reaches a `> NULL` comparison.

**InMemory implementation (line 314–319):**
```typescript
async sinceSeq(afterSeq: bigint | null): Promise<AuditOutboxRecord[]> {
  return this.state.messages
    .filter((message) => afterSeq === null || message.seq > afterSeq)
    ...
}
```
When `afterSeq === null`, the filter short-circuits to `true` for every message — all rows returned.

**Both implementations correctly handle null as "return all rows."** The SQL null-comparison trap was anticipated and explicitly avoided.

**Result: The highest-risk attack finds no defect. CLEAN.**

---

## What the PR gets right (counter-balance)

1. **The null checkpoint guard is defensive and explicit.** Rather than relying on the caller to never pass null, `sinceSeq` handles it correctly in both backends independently. The predicate substitution (`'TRUE'` vs `seq > $1`) is the right approach for raw SQL and is clearly commented.

2. **The headOffset/checkpoint asymmetry is documented and benign.** The comment block at lines 170–175 and 200–208 explains the semantics precisely: unmapped rows are a no-op for the gate, advancing past them in the durable checkpoint is unnecessary (a later replay silently skips them again), and a tail of only-unmapped rows cannot hide a real mapped fact because seq is monotonically allocated before commit.

3. **recordDurable is crash-safe in the correct direction.** In-memory fold happens before the durable persist. A crash after fold-but-before-persist leaves the checkpoint behind, triggering over-replay on next boot — the safe (RED-biased) direction. The code never advances the durable checkpoint ahead of the folded state.

4. **The test seam uses the REAL factory with real prototype spies.** No hand-built stub of the boot ordering — the test actually exercises the production code path and its call ordering is structurally enforced by the spy. Moving `markReplayComplete` before the loop fails the test immediately.

5. **Postgres SQL injection safety.** `String(bigint)` is a bare decimal integer with no quote surface; `'TRUE'` is a SQL keyword literal. Neither requires escaping, and the comment (line 569–571) explicitly calls this out.

6. **Nest provider-factory-rejection behavior.** The replayer's deliberate "let normalizer throws propagate" policy correctly kills the pod rather than producing a degraded started-but-gate-green app. This is the right fail-closed posture for a safety gate.

---

## P0 findings

None found.

## P1 findings

None found.

## P2 findings (observational — not blocking)

**P2-1:** The `headOffset` return value from `replayAuditOutbox` (`AuditOutboxReplayResult.headOffset`) is the max seq READ, not the max seq CHECKPOINTED. A caller that interprets `headOffset` as "the checkpoint is now at this offset" would have an off-by-one view when the tail ends with unmapped rows. The current caller (`divergenceCheckerFactory`) ignores `headOffset` entirely (the return value is unused at line 204), so this is not a defect in the current code — only a documentation hazard for future callers. A comment clarifying the headOffset vs checkpoint semantics in the `AuditOutboxReplayResult` interface would harden this against future misuse.

**P2-2:** The FG-11 wiring test's call-order spy patches the prototype and restores it in `finally`. If `buildDivergenceCheckerForBoot` throws mid-replay (e.g. a normalizer error), the prototype IS correctly restored (the `finally` block covers it). However, the test itself would then fail on the `checker` variable being unassigned rather than on the call-order assertion. The crash scenario is not tested in the happy-path file; crash-recovery is tested separately in the `crash-recovery acceptance` describe block. The crash-propagation behavior (pod down, gate RED-by-absence) is confirmed by static analysis but has no automated test. Low priority given the Nest bootstrap probe was run manually.

---

## Verdict: APPROVE

All six attack surfaces probed. No P0 false-green vector found. The #243 "never false-green" invariant holds across every traced path: null checkpoint → WHERE TRUE (all rows), crash mid-replay → under-checkpoint (over-replay on next boot, never skip), normalizer throw → pod down (gate RED-by-absence), unmapped row tail → idempotent re-skip (no gate-bearing state missed), M3 remap → silent mismatches fail toward divergence (RED) not match (false-green), test seam → real prototype spy catches misordering immediately.
