# Runbook — Deploy the audit-divergence checker to staging + observe the Phase D signal

> **Owner:** identity-service · **Gates:** [M9-S2 #99](https://github.com/your-org/curaos-ai-workspace/issues/99) Phase D · **Gauge:** [#195](https://github.com/your-org/curaos-ai-workspace/issues/195) (shipped 2026-05-29) · **Hard prerequisite:** [#200](https://github.com/your-org/curaos-ai-workspace/issues/200)
>
> Purpose: stand the `AuthDiamondDivergenceChecker` up against **live** staging dual-write
> telemetry so `#99 Phase D` can clear on the real signal `auth-diamond-divergence == 0`.
> This is a **signal gate, not a time gate** — Phase D clears the instant the live gauge reads
> zero; there is NO burn-in / soak / calendar term (per [[curaos-rolling-update-rule]]
> "Signal gates only — NO time or date gates").

---

## ✅ #200 LANDED — the only remaining gate is the live staging deploy/observe leg

> **Status update (2026-05-31):** the `changeValues` prerequisite is DONE. #200 closed
> (COMPLETED 2026-05-29, ADR-0212 user-authorized); the reference-only `changeValues` field is in
> both `audit-event.schema.ts` and `audit-publisher.service.ts` (slices curaos#115/#116/#117 +
> identity-service #39/#40 merged). The durable-ledger + cross-tenant correctness fix (#202) also
> landed. **All Phase D code is merged + cross-harness grilled + locally test-proven green-capable**
> (`test/integration/divergence/audit-divergence-injection.test.ts:248` asserts
> `checker.isGreen() === true` for paired events carrying `changeValues`; the same file proves the
> pre-#200 fail-closed path at line 198–212). Nothing here is code-dispatchable anymore.

The checker is **value-aware + fail-closed** (PR #38 grill fixes P0-2 / P0-4): it diffs the
actual VALUES each path applied (role identifiers, membership/credential target references),
and treats a value-less event on one path vs a populated value on the other as **DIVERGENT**.
Before #200, the production Diamond publisher emitted `changedFields` (names) only, so every live
Diamond event arrived `valuesKnown:false` and the gate fail-closed RED. **#200 fixed that** — the
Diamond envelope now carries the reference-only `changeValues` map (RBAC role codes + opaque UUID
references only, never PHI; `assertReferenceOnly()` + the extended CI PHI scan enforce it).

> **True critical path (only the last leg remains):**
> ~~authorize #200 (PHI-boundary widening + ADR)~~ ✅ done → ~~ship `changeValues`~~ ✅ done →
> **deploy checker (this runbook) → observe `auth-diamond-divergence == 0` → Phase D
> `ready-for-agent`.** The deploy/observe leg needs a staging tenant + deploy access — it is an
> **operator/user action**, not a code task. The orchestrator cannot stand up staging in-session;
> run the 6 steps below on staging and paste the gauge output back.

---

## Preconditions

- [ ] Phase A–C merged on `identity-service` (Diamond tables + backfill + dual-write behind
      `IDENTITY_DIAMOND_MODE`). ✅ as of 2026-05-29 (#157, #170 closed).
- [ ] `IDENTITY_DIAMOND_MODE` flag available per-tenant. Default OFF.
- [ ] A staging tenant you can flip to Diamond mode + drive synthetic auth traffic through.
- [x] (For GREEN) #200 merged so live Diamond events carry `changeValues`. ✅ closed 2026-05-29 (ADR-0212).

---

## Step 1 — Enable dual-write on a staging tenant

Flip `IDENTITY_DIAMOND_MODE` ON for one staging tenant only. Production stays OFF. Both the M3
path (`auth-audit-publisher.ts` → topic `curaos.audit.events`) and the Diamond path
(`audit-publisher.service.ts` → topic `curaos.core.audit.event.v1`) now emit an audit event for
each logical auth operation (login, role grant/revoke, membership change, credential update).

## Step 2 — Wire the checker against both audit streams

The checker is a **driver-free shell** — it does not subscribe to Kafka itself. Pick the mode:

### Modulith (in-process, recommended for staging)

Bind a singleton on the `AUTH_DIAMOND_DIVERGENCE_CHECKER` DI token, wire both in-process
publishers' fan-out into `checker.record(fact)`, and wire the `onDivergence` seam to the
error-tracking SDK (GlitchTip prod / Sentry dev) + the SLO burn-rate alert:

```ts
import {
  AuthDiamondDivergenceChecker,
  AUTH_DIAMOND_DIVERGENCE_CHECKER,
} from './identity-core/divergence/audit-divergence-checker';
import {
  normalizeM3AuditEvent,
  normalizeDiamondAuditEvent,
} from './identity-core/divergence/audit-normalizers';

const checker = new AuthDiamondDivergenceChecker({
  onDivergence: (record) => {
    // PHI-free record: { tenantId, operationType, correlationId, divergentFields }
    errorTracking.captureMessage('auth-diamond-divergence', { extra: record });
    sloAlert.fireBurnRate('auth_diamond_divergence_count', record);
  },
});

// M3 publisher fan-out:
onM3AuditEvent((envelope) => {
  const fact = normalizeM3AuditEvent(envelope);
  if (fact) checker.record(fact);
});
// Diamond publisher fan-out:
onDiamondAuditEvent((envelope) => {
  const fact = normalizeDiamondAuditEvent(envelope);
  if (fact) checker.record(fact);
});
```

### Standalone (separate consumer process)

Identical checker class, fed from two Kafka consumers (one per topic), each a thin callback into
the same `checker.record(fact)`. Use this if you don't want the checker in the service hot path.

## Step 3 — Expose the metric + read the gate

- `checker.prometheusMetrics()` → Prometheus text exposition of
  `auth_diamond_divergence_count{tenant_id, operation}`. Scrape it into the existing
  observability stack (Pyrra/OpenSLO per [[curaos-slo-rule]]). Mirrors the `backfill.*`
  counter precedent already in this service.
- `checker.isGreen()` → the single boolean `auth-diamond-divergence == 0`. **This is the Phase D
  gate predicate.** Green ⇔ `divergenceCount() === 0 && pendingCount() === 0`.
- `checker.divergenceCount()` → cumulative diverged-pair count (never decays — grill P0-5).
- `checker.pendingCount()` → unpaired facts (one path emitted, the other didn't = dropped-event
  = RED).

## Step 4 — Drive synthetic auth traffic + observe

Exercise the in-scope operations on the staging tenant: login, role grant, role revoke,
membership change, credential update. Watch the metric.

| Observation | Meaning | Action |
|---|---|---|
| `isGreen() === true`, `divergenceCount() === 0`, `pendingCount() === 0` | Live parity confirmed | Phase D may go `ready-for-agent` — report the signal back. |
| `divergenceCount() > 0` with `divergentFields` = value mismatch / `unpaired` / classification | Real migration defect | File a fix issue; gate stays RED until fixed + `reset()`. |
| RED with `valuesKnown:false` on the Diamond side | Should NOT occur post-#200 (Diamond now emits `changeValues`). If seen, the publisher isn't passing `changeValues` for that op | Treat as a real wiring defect — file a fix issue; do NOT flip Phase D. |
| `pendingCount() > 0` and not draining | Dropped counterpart on one path | Investigate the publisher/consumer wiring; a dropped event is a real parity defect. |

## Step 5 — Recovery (only after a real defect is fixed)

`reset()` is **fail-closed**: while the gate is RED it THROWS
(`refusing reset() while gate is RED`). It will not silently wipe state to flip the gate green.
Sequence: fix the migration defect so no divergence/pending remains → THEN `reset()`
re-baselines the (already-green) gauge.

## Step 6 — Report back

When the live gauge reads sustained-zero (within its own paired-event sampling window — a
statistical property, not a clock), report `auth-diamond-divergence == 0` and the orchestrator
flips `#99 Phase D` to `ready-for-agent`. The downstream M9 chain
(#102 / #103 / #104 / #105 / #106 / #124) unblocks from there.

---

## What this runbook does NOT cover

- The `ops/slo/identity-service/*.yaml` Pyrra/OpenSLO definition that consumes the metric — flagged
  as a follow-up wiring note in the #195 research doc, not yet landed. Wire it when standing up
  the SLO alert in Step 2.
- ~~Durable divergence state across restarts~~ — **LANDED ([#202](https://github.com/your-org/curaos-ai-workspace/issues/202)).**
  The checker is now backed by a durable Postgres ledger (`identity_core.divergence_ledger`,
  reference-only) + a Kafka consumer-offset checkpoint. A restart rehydrates prior cumulative
  divergence + pending instead of cold-starting fresh-green. See "Durable divergence state" below.

## Durable divergence state (issue #202 — replaces the prior warm-up runbook caveat)

The checker no longer holds its gate-bearing state only in memory. When a DSN is set
(`CURAOS_IDENTITY_DATABASE_URL` / `DATABASE_URL`), `IdentityCoreModule` backs the
`AUTH_DIAMOND_DIVERGENCE_CHECKER` with a `PostgresDivergenceLedgerStore` and rehydrates on
construction. Behaviour:

- **Restart no longer false-greens.** A divergence (or pending fact) observed before a NestJS
  restart/hot-reload is reloaded from `identity_core.divergence_ledger` on the fresh instance, so
  `isGreen()` stays RED after the restart. Construction no longer bypasses the gate state.
- **Warm-up = SIGNAL, not a clock** ([[curaos-rolling-update-rule]] "signal gates only"). A
  durable checker constructs fail-closed: `awaitingReplay() === true` and `isGreen() === false`
  until the host re-derives the gap from the persisted offset cursor (`durableOffset()`) to stream
  head and calls `markReplayComplete()`. There is NO time/date warm-up window — read the gate
  only once `awaitingReplay()` is false. **Do NOT read green during warm-up.**
- **Offset commit ordering.** The host drives `recordDurable(fact, offset)` per consumed audit
  event; the snapshot (counters + pending + offset) is persisted BEFORE the call resolves, so the
  Kafka consumer offset is committed only after the divergence state it produced is durable. On a
  crash between persist and offset-commit, the host re-replays from the older committed offset and
  re-derives idempotently (RED-biased; never under-counts → never false-green).
- **Rolling-deploy overlap is safe (grill cycle-1 P0).** When the new and old pods run concurrently,
  both consume + persist to the same `divergence_ledger`. The Postgres `persist()` is a SERIALIZED,
  MONOTONIC merge — an `pg_advisory_xact_lock` serializes writers, counters merge with
  `GREATEST(existing, incoming)` (a count never decreases), and only an AUTHORITATIVE writer (its
  offset >= the committed one) may prune resolved pending or advance the offset. A STALE pod
  (started from an older snapshot) can ONLY add — it can never lower a counter, erase another pod's
  pending, nor rewind the offset. So a rolling deploy cannot false-green the gate. No operator
  action is required during the overlap window beyond the warm-up rule above.
- **PHI boundary (M7-D5 + [[curaos-postgres-rule]], BINDING).** The ledger is REFERENCE-ONLY:
  tenant/actor UUIDs, the closed-enum operation type, an opaque correlation reference, an integer
  count, an opaque offset cursor, and the pending `NormalizedAuditFact` jsonb whose
  `changes[].values` are RBAC role identifiers + canonical `membership:<uuid>#<role-code>` tokens +
  opaque UUID references only. NO raw role/credential/PHI value. `assertReferenceOnly()` enforces
  this at runtime before every persist.

## References

- Checker source: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts`
- Durable ledger: `curaos/backend/services/identity-service/src/identity-core/divergence/divergence-ledger.store.ts`
- Migration: `curaos/backend/services/identity-service/drizzle/migrations/0002_divergence_ledger_add.sql`
- Research: [`../research/2026-05-29-audit-divergence-checker.md`](../research/2026-05-29-audit-divergence-checker.md)
- ADR-0210 §D4 (correlation-id choreography), M7-D5 (reference-only audit envelope)
- [[curaos-rolling-update-rule]] · [[curaos-slo-rule]] · [[curaos-error-tracking-rule]] · [[curaos-modulith-standalone-rule]]
