# Codex grill — m9-99 durable replay-complete, identity-service PR#56 (CLOSED, not merged)

> Cross-harness adversarial grill (Claude → Codex), Tier-2. PR #56 attempted to fix the
> THIRD M9 #99 Phase-D blocker (the durable modulith checker boots `awaitingReplay:true`
> forever → gauge never green). The naive fix — `markReplayComplete()` immediately after
> `rehydrate()` in `divergenceCheckerFactory` — was found to introduce **two P0 false-greens**.
> PR CLOSED unmerged; the gate-correctness design escalated to the maintainer.

- PR: https://github.com/your-org/identity-service/pull/56 (CLOSED)
- Commit grilled: `372cd92`, base main @ `6d752a9`
- Issue: `your-org/curaos-ai-workspace#99` Phase D

## Verdict: REQUEST-CHANGES → CLOSED (two P0 false-greens — gate must not lie)

The change called `await checker.markReplayComplete()` right after `await checker.rehydrate()`
in the durable (DSN) branch, on the reasoning that the modulith is "at stream-head the instant
rehydrate loads" (the #241 tap is the live feed, no Kafka offset to replay). That reasoning is
WRONG because the ledger truth can LAG the audit truth.

## P0 — V1: crash-during-drain false-green (CONFIRMED)
The #241 `DivergenceTappingProducer` tap is **fire-and-forget** (the P1-A fix: the audit `send()`
returns to the user BEFORE the background drain `recordDurable()` persists). Data flow:
- `login()` returns the token after `emitDiamondLoginAudit()` (`login-user.service.ts:76-79`).
- the tap awaits the inner audit send, ENQUEUES the fact, and returns (`divergence-tapping-producer.ts:205-227`); `recordDurable` → `ledger.persist` runs LATER on the drain queue (`audit-divergence-checker.ts:544-563`).
- **Crash window:** user sees login succeeded → fact enqueued but NOT yet persisted → process dies → restart `rehydrate()` (ledger lacks the fact) → immediate `markReplayComplete()` → `isGreen()` true **while missing a real fact that the user already observed succeed**. False green.

## P0 — V2: rolling-deploy dual-writer false-green (CONFIRMED)
A rolling deploy runs OLD + NEW pods concurrently (new comes up before old drains), both with a
DSN to the SAME ledger. The Postgres merge is correct for COUNTERS (monotonic `GREATEST`,
`divergence-ledger.store.ts:720-740`; scoped pending prune `:779-789`) — but the NEW pod's
**in-memory pending SET** is loaded ONCE at boot (`identity-core.module.ts:142`) and never
re-synced; `/internal/divergence-gate` reads only this process's in-memory checker
(`divergence-metrics.controller.ts:48-53`). The old pod persisting pending rows AFTER the new
pod's snapshot means the ledger is correct but the new pod reads **stale-green** — `GREATEST`
cannot retroactively populate the new pod's in-memory pending set with rows written post-snapshot.
(Ironic: this violates the #241 single-live-AppModule invariant — which a rolling deploy inherently breaks.)

## SAFE (verified by the grill — counter-balance)
- **V3 markReplayComplete semantics SAFE:** only flips `replayComplete=true` (`audit-divergence-checker.ts:454-456`); `isGreen()` still requires `divergence===0 && pending===0` (`:432-436`). The fail-closed test is real (pending fact → after mark, `pendingCount===1` + `isGreen()===false`, `audit-divergence-restart.test.ts:276-296`).
- **V4 no-DSN path SAFE/unchanged:** plain `new AuthDiamondDivergenceChecker()` boots warmed (constructor default `replayComplete = ledger===undefined`, `:259-265`).
- **V5 rehydrate completion SAFE:** fully awaited before mark; `load()` awaits all queries.
- **V6 startup window P2 (not P0):** an in-process green-capable window exists between factory-mark and `onModuleInit` M3-holder bind; startup facts ARE buffered by the tap; no evidence the HTTP gate is reachable before Nest init completes. Lower severity.

## Required to make replay-complete correct (the design space — for the escalation)
- **V1:** EITHER (a) drain-queue empty (`inFlight===0`) AND ledger-persisted is a precondition of green — i.e. the gauge waits for the queue to flush, not for a fixed clock; OR (b) `rehydrate()` replays an outbox/WAL of un-drained facts before marking; OR (c) defer mark until a periodic ledger-sync confirms no pending drain entries. (NOT: make the drain synchronous on the hot path — that reverts P1-A.)
- **V2:** EITHER (a) the gate endpoint re-loads pending from the ledger on read (or a periodic re-sync) rather than trusting only the in-memory snapshot; OR (b) deploy-ordering: old pods drain+terminate before the new pod marks complete and serves the gate (single-writer enforced operationally).

## Root diagnosis (valid) vs boundary assumption (wrong)
The diagnosis is correct: the durable checker would never flip green without SOME replay-complete
wiring — that IS a real third Phase-D blocker. The fix DIRECTION is right. The boundary assumption
"rehydrate from ledger == at-head" is WRONG because the fire-and-forget drain (V1) and concurrent
writers (V2) both let ledger truth lag audit truth. The honest fix must make "green" mean "the
ledger reflects every user-acknowledged fact," which requires closing the drain-durability gap
and/or making the gate ledger-authoritative on read.

## Disposition
PR #56 CLOSED unmerged. The staging infra (#55/#146) can still run a **single-pod, no-DSN
in-memory observation** (boots warmed, no false-green vectors — V1/V2 are durable-mode-only) for
a one-shot gauge read. The durable-mode gate correctness is escalated to the maintainer as a
design decision (synchronous-enough persistence vs ledger-authoritative gate vs deploy-ordering).

## Env note
Codex's own full `bun run ci` hit `EADDRINUSE`/null-port (worktree env), 19/0 on focused
divergence tests. Orchestrator's deps-present checkout CI was 335 pass / 0 fail — the P0s are
DESIGN false-greens not caught by any existing test (no test simulates crash-during-drain or
dual-writer), which is exactly why the grill matters.
