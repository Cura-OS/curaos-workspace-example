# Codex grill — m9-241 divergence fan-out input pump, identity-service PR#54

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]] + orchestration §3.7 — AUDIT HOT-PATH change
> (every audit emit now flows through a decorating producer) + process-global mutable
> singleton → grill MANDATORY. Issue `your-org/curaos-ai-workspace#241`
> (parent #99 Phase D). The LOAD-BEARING Phase-D input pump: before this, the divergence
> checker had no feed in the deployed app → gauge read false-green.

- PR: https://github.com/your-org/identity-service/pull/54
- Branch: `agent/m9-241-divergence-fanout-claude-c3ce68b8`
- Commits: `a2a763a` (initial) → `500315b` (P1 fix) → `3775d02` (P2 close, final)
- Base: `main` @ `3aed3a4`
- Design: `ai/research/m9-phase-d-unblock/05-fanout-wiring-design.md`

## Verdict trail: REQUEST-CHANGES (4×P1) → fix → APPROVE-WITH-CONDITIONS (P2 only) → P2 closed → MERGEABLE

A decorating `DivergenceTappingProducer` wraps BOTH audit producers (M3 via
`@curaos/audit-sdk` `AuditModule.forRoot({producer})`; Diamond via `AUDIT_EVENT_PRODUCER`
token). After a successful `send()`, it parses each envelope, routes by topic to
`normalizeM3AuditEvent`/`normalizeDiamondAuditEvent`, and feeds `checker.recordDurable()`.
M3 leg uses a late-bound checker holder (audit-sdk has only sync `forRoot`).

## Round 1 (commit a2a763a) — REQUEST-CHANGES: 4 genuine P1 hot-path defects

All 4 confirmed real by orchestrator (not confabulation):
1. **P1-A — tap awaited on the hot path.** `send()` awaited `tap()` awaited `recordDurable()`
   → a slow/locked ledger STALLS the login/admin HTTP response after the audit already
   succeeded. The tap is instrumentation; must not block the caller.
2. **P1-B — process-global holder cross-contamination.** `m3DivergenceCheckerHolder` had no
   reset/teardown → multiple TestingModule/AppModule instances cross-bind (flaky/false-pass).
3. **P1-C — startup-window + tap-failure facts permanently dropped.** `rehydrate()` reads ONLY
   the `divergence_ledger`, never the audit topic → a fact dropped pre-bind or on tap-failure
   never reaches the ledger and is gone after restart. "Replayable from source" was
   aspirational, not implemented → false-green/false-red.
4. **P1-D — concurrent `recordDurable` race.** Concurrent taps raced the record-then-persist
   window → a stale pending snapshot could persist a durable false-RED surviving restart.

## Round 2 (commit 500315b) — unified serial-drain-queue fix → APPROVE-WITH-CONDITIONS

One mechanism solved A+C+D; lifecycle fixed B:
- **P1-A RESOLVED** — `send()` awaits ONLY `inner.send`, then `enqueue()`s facts and returns;
  `recordDurable` runs on a background queue, never awaited by the caller. A test with a
  hanging `recordDurable` proves `send()` still resolves promptly.
- **P1-D RESOLVED** — serial promise-chain mutex `tail = tail.then(() => drainOne(fact))` →
  exactly one `recordDurable` in-flight. 12-concurrent-send test asserts `maxConcurrent === 1`.
- **P1-C PARTIALLY-RESOLVED** — startup buffer (checker undefined → re-enqueue, never drop) +
  bounded retry (max 3) on `recordDurable` throw. Honest durability boundary documented;
  full topic-replay correctly scoped OUT (not silently built as a Kafka consumer).
- **P1-B PARTIALLY-RESOLVED** — `clear()` on `onModuleDestroy` + double-bind WARN + two-holder
  isolation test. Holder stays process-global (forced by sync-only sdk `forRoot`; async would
  fork the sdk → forbidden under [[curaos-rolling-update-rule]]).

Re-grill confirmed no P0/P1 remained; new defects were P2 edge-cases only.

## Round 3 (commit 3775d02) — P2 residuals CLOSED pre-merge

1. **P2 livelock safety valve** — permanent-unbound-checker re-enqueued forever (misconfig).
   Added `STARTUP_MAX_REQUEUE = 1000` (constructor-injectable) + per-fact attempt counter →
   after the cap, swallow+WARN instead of spin. Test (cap=3) proves no livelock + `drained()`
   resolves + fact dropped + WARN fired.
2. **P2 durability-contract doc honesty** — comment now enumerates all FOUR intentional
   no-retry drops (malformed JSON, null value, unmapped action→normalizer-undefined, never-bind
   past cap) vs the bounded-retry+ledger boundary that applies only to MAPPED facts. "The
   checker measures parity of KNOWN operations, not coverage."
3. **P2 single-live-module invariant** — JSDoc on the holder + `tapM3AuditProducer`: exactly one
   live AppModule per process; active-active co-resident AppModules explicitly unsupported
   (would need sdk async producer injection first).

## What's correct (Codex-verified, final)
- Hot-path durable stall gone; `recordDurable` genuinely serial; transient failures retried ×3;
  pre-bind startup facts drain on bind; `inFlight` accounting sound; `drained()` is test-only
  (grep-confirmed no production caller); tail-chain links GC-able (no memory leak).
- Topic routing constants align (M3 `curaos.audit.events`, Diamond `AUDIT_TOPIC`); envelope
  shapes match their normalizers (M3 snake_case, Diamond camelCase); M3-no-`outcome`→`'success'`
  matches the Diamond success leg → they pair. `as unknown as AuditKafkaProducer` cast safe
  (sdk requires only `send()`).
- Live-pairing integration test drives REAL `LoginUserService.login` + `AdminController.assignRole`
  through the REAL tapping producer → dual-write ON: `pendingCount===0` + `isGreen()` true (paired
  via the tap); dual-write OFF: `pendingCount>0` + `isGreen()` false (proves the gauge correctly
  goes RED on a single leg — the false-green this whole PR fixes). Would FAIL against pre-tap code.

## Orchestrator independent evidence (§7.1 over-claim re-run, deps-present parent checkout, no DSN)
- `bun run ci` on `a2a763a`: exit 0, 323 pass / 0 fail.
- `bun run ci` on `500315b`: exit 0, 332 pass / 0 fail (9 new tests — one per P1 + isolation).
- `bun run ci` on `3775d02`: exit 0, **333 pass / 19 skip / 0 fail / 824 expect**.
- P1-fix diff: queue internals + lifecycle (6 files). P2-fix diff: 3 files (`tapping-producer.ts`
  code+docs, `m3-divergence-tap.ts` JSDoc, test). All within tolerance — no over-claim.

## Residual followups (P2, non-blocking — tracked, not merge gates)
- Owner-token on the holder (vs the documented single-live-module invariant) — only if active-active
  topology is ever needed (would require sdk `forRootAsync` first).
- Full topic-replay durability in `rehydrate()` (consume the audit topic) — the larger Kafka-consumer
  change explicitly scoped OUT of this PR; the in-memory queue + bounded retry + #202 ledger is the
  current honest durability boundary.

## Lineage
- Consumes: #53 (the `/metrics` + `/internal/divergence-gate` endpoint, merged `3aed3a4`).
- Unblocks: the staging deploy infra (Dockerfile/compose/k6/check-script) is now meaningful — a
  deployed pod under traffic produces paired facts the gauge reflects. Design:
  `ai/research/m9-phase-d-unblock/05-fanout-wiring-design.md`. Runbook Step 2.
