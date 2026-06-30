# Codex grill — m9-243 ledger-authoritative Phase-D gate, identity-service PR#57

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]] + orchestration §3.7 — SAFETY-CRITICAL gate change
> (the `/internal/divergence-gate` + `/metrics` answer that flips M9 #99 Phase D green).
> Invariant: the gate MUST NEVER report green when a real divergence, an unrecovered
> fact, or a durable write-failure exists — including across process restart and rolling
> (dual-writer) deploy. Fail-closed (RED) on any doubt. Issue
> `your-org/curaos-ai-workspace#243` (parent #99 Phase D). This is the
> design that REPLACED the closed PR #56 naive `markReplayComplete()` (see
> [m9-99-replay-complete-pr56.md](m9-99-replay-complete-pr56.md)).

- PR: https://github.com/your-org/identity-service/pull/57
- Branch: `agent/m9-243-ledger-authoritative-gate-claude-5c8e12`
- Commit stack: `a5dcaa5` (ledger-authoritative gate + inflight/write-fail guards) →
  `6022a7a` (durable write-failure latch + tighten inflight race) →
  `609a4e9` (gate on durable marker + fail-safe clear ordering) →
  `f5f8b4b` (resample write-failure latch after load — close mid-load race) **FINAL**
- Base: `main`. Design: `ai/research/m9-phase-d-unblock/06-RECOMMENDED-GATE-DESIGN.md`
  (Approach A — ledger-authoritative gate wins the adversarial design bake-off vs
  sync-flush / outbox-replay; staged delivery: #243 Stage 1+2 here, #244 foresight for
  the modulith crash-lost residual).

## Verdict trail: 5 grill cycles → APPROVE (converged)

REQUEST-CHANGES (P0 non-durable latch) → fix `6022a7a` → REQUEST-CHANGES (3 holes) →
fix `609a4e9` → REQUEST-CHANGES (P0 mid-load race) → fix `f5f8b4b` → **APPROVE**.

The gate is **ledger-authoritative**: each poll does one fresh single-MVCC `ledger.load()`
on the green path (NO TTL cache — a cache is an unforced false-green risk, FG-10), and
fails CLOSED (RED) on warm-up-incomplete, any tap in-flight, any write-failure latch
(in-memory OR loaded durable marker), any `load()` error, divergence count > 0, or pending
> 0. The in-memory `AuthDiamondDivergenceChecker` is the diagnostic; `isGreen()` survives
only as the no-ledger #38 path + diagnostic — the deployed gate wires
`isGreenAuthoritative()` / `gateSnapshot()`.

## Why PR #56's approach was wrong (carried into this design)
PR #56 marked replay-complete the instant `rehydrate()` loaded, on the assumption "ledger
== at-head." Codex proved that false: the #241 tap is fire-and-forget, so ledger truth can
LAG audit truth (V1 crash-during-drain) and concurrent writers desync the in-memory pending
set (V2 dual-writer). This design fixes the root cause by making the gate read the LEDGER
authoritatively on every poll rather than trusting a one-shot in-memory snapshot.

## Cycle 1 (`a5dcaa5`) — P0: non-durable write-failure latch
The ledger-authoritative read was correct, but the write-failure latch that holds the gate
RED after a tap drops a mapped durable write lived ONLY in memory → evaporated on restart →
a real dropped fact false-greened after a bounce. Fix: durable `write_failed boolean` column
on `identity_core.divergence_ledger` (migration `0004`, forward-only additive, OR-monotonic
merge), loaded by `load()`, gate-bearing.

## Cycle 2 (`6022a7a`) — 3 holes found
1. **P0-b — gate loaded the durable marker but didn't gate on it.** `load()` returned
   `snapshot.writeFailed` but neither `isGreenAuthoritative()` nor `gateSnapshot()` read it
   → a drop another pod latched (living only in the shared ledger column) false-greened any
   pod whose in-memory latch was clear. Fix: both methods gate RED on loaded
   `snap.writeFailed === true`; reported `ledgerWriteFailed = loaded || inMemory`.
2. **new-P0 — clear ordering fail-open / split-brain.** `clearDurableWriteFailure()` cleared
   in-memory before the durable clear → a throwing durable clear left in-memory GREEN-capable
   while the ledger still said failed. Fix: await DURABLE clear FIRST, clear in-memory ONLY
   on success → a throw leaves BOTH RED (durable-first fail-safe).
3. **P0-a — marker-persist failure swallowed.** `markDurableWriteFailure()` could fail its
   durable persist silently. Fix: set in-memory latch FIRST (process stays RED regardless),
   bounded-retry the persist (×3), loud error log on final failure, JSDoc names the residual
   honestly as the #244 class.

## Cycle 3 (`609a4e9`) — verified cycle-2 fixes; found ONE more P0
The 3 cycle-2 fixes confirmed CLOSED. But a **mid-load latch race** remained:
`isGreenAuthoritative()` / `gateSnapshot()` sampled the in-memory write-failure latch BEFORE
`await ledger.load()` and never re-checked after the await. A concurrent tap drain that
latches a write-failure DURING the load (and decrements its in-flight back to 0 before the
gate resumes) is caught by NEITHER the post-load in-flight resample NOR this load()'s
snapshot (whose `writeFailed` may not yet reflect the just-failed write) → **false-green in a
live process, no crash** (distinct from the documented #244 crash-lost residual).

## Cycle 4 fix (`f5f8b4b`) — post-load latch resample
Mirror the existing SAMPLE-LOAD-RESAMPLE pattern (already applied for tapInFlight) and extend
it to the in-memory latch:
- `isGreenAuthoritative()`: after `await ledger.load()` + the post-load tapInFlight re-check,
  add `if (this.writeFailureLatch.hasFailed()) return false;` (block "(3b) POST-LOAD LATCH
  RESAMPLE") before the snap===null/counters return. Pre-load check kept (defense in depth).
- `gateSnapshot()`: `const writeFailedAfter = this.ledgerWriteFailed();` post-load;
  `ledgerWriteFailedEffective = ledgerWriteFailed || writeFailedAfter || loadedWriteFailed`;
  `&& !writeFailedAfter` added to the isGreen conjunction.
Regression test `P0 mid-load latch race`: a `ControlledLedgerStore.onLoad` seam flips the
latch mid-load then resolves a CLEAN snapshot → asserts `isGreenAuthoritative()===false`,
`gateSnapshot().isGreen===false`, `.ledgerWriteFailed===true`. Verified load-bearing BOTH
halves (revert isGreen post-load check → false-green; revert gateSnapshot `!writeFailedAfter`
→ false-green).

## Cycle 5 (`f5f8b4b`) — APPROVE (converged)
Mid-load latch race CLOSED in both methods (`audit-divergence-checker.ts:627-628`,
`:722-736`). NO new defect. NO false-RED / liveness regression from the extra check.

### Convergence table (final — Codex cycle 5)
| Vector | Status |
|---|---|
| steady-state divergence (count>0) | CLOSED |
| in-flight fact (V1 live, queue not drained) | CLOSED |
| V2 rolling dual-writer (stale in-memory pending vs ledger) | CLOSED (ledger-authoritative load per poll) |
| P0 durable-write-drop across restart (write_failed column / loaded marker) | BOUNDED-RESIDUAL(#244) |
| clear-failure (durable clear throws) | CLOSED (durable-first fail-safe) |
| mid-load latch race (cycle 4) | CLOSED (post-load resample) |

The ONLY remaining residual is the honestly-documented **#244** class: a mapped durable write
drops + its marker-persist fails all 3 retries + the process crashes before restart — a
modulith fire-and-forget boundary that the foresight audit-outbox (#244) addresses. It is
documented in-code (JSDoc) and is NOT a silent green.

## Orchestrator independent evidence (§7.1 over-claim re-run, deps-present, DSN durable suite)
- `bun run ci` on `609a4e9`: EXIT=0, 364 pass / 23 skip / 0 fail / 974 expect.
- `bun run ci` on `f5f8b4b`: EXIT=0, **365 pass / 23 skip / 0 fail / 981 expect** (1 new
  regression test). DSN durable suite 11 pass. Fix diff `609a4e9..f5f8b4b`: 2 files, +76/-1
  (gate +24/-1, test +52). Within tolerance — no over-claim.

## Lineage
- Consumes: #53 (`/metrics` + `/internal/divergence-gate` endpoint), #241 (the tap input
  pump — the gate's feed), #202 (the durable `PostgresDivergenceLedgerStore`).
- Replaces: PR #56 (closed unmerged — naive markReplayComplete).
- Unblocks: a real staging gauge read can now flip M9 #99 Phase D green without a
  false-green vector in durable mode. Staging infra (#55/#146) deployable.
- Foresight: #244 (audit-outbox to close the modulith crash-lost-fact residual).

## Env note
Codex judged the CODE logic (deps present via symlinks; worktree port races ignored).
The P0 false-greens across cycles 1–4 were all DESIGN defects no pre-existing test caught
(no test simulated non-durable-latch-restart, cross-pod loaded-marker, clear-throw, or
mid-load latch flip) — which is exactly why the 5-cycle adversarial grill mattered for a
gate whose single job is to never lie.
