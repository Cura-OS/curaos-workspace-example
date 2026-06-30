# Grill Report — M10 #260 Audit Template TX+CAS (PR #190)

**Harness:** Codex reviewing Claude code (cross-harness T2)
**PR:** your-org/curaos#190
**Closes:** curaos-ai-workspace#260
**Branch:** `agent/m10-260-audit-template-tx-cas-claude-4d260e1f`
**Commit:** `86f352b`
**Date:** 2026-06-02
**Reviewer:** Codex (adversarial grill)

---

## Verdict: REJECT

P0 defects remain. The Postgres happy path is closer, but the templates still expose truthy transaction objects with missing `db`, and the in-memory transaction path rolls back the outbox draft without rolling back the chain head.

---

## P0 Findings

### P0-1: Truthy `tx` with `tx.db === undefined` silently degrades to auto-commit while suppressing synchronous fan-out

**Evidence:**
- `AuditOutboxTransaction.db` is optional at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:140-148`
- `bindTo(db)` accepts `undefined` and returns a truthy tx at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:245-249`
- Publisher resolves `const chainDb = tx?.db` at `tools/codegen/templates/service-core/src/audit/audit-publisher.service.ts.hbs:233-240`, then branches only on `if (tx)` and returns before `producer.send` at lines `330-351`
- Postgres chain/outbox paths fall back to auto-commit executors via `db ?? this.db` at `tools/codegen/templates/service-core/src/audit/audit-chain-head.store.ts.hbs:324-326`, `354-365`, and `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:813-820`

**Impact:** `publish(input, auditOutbox.bindTo(undefined))` or any tx-like object missing `db` advances the chain head and inserts the outbox row outside the caller transaction, then skips direct producer send. If the business tx rolls back, the relay can emit a committed ghost audit row for a non-durable business mutation.

### P0-2: In-memory `transaction()` rolls back the outbox draft but not the chain head

**Evidence:**
- `InMemoryAuditOutboxStore.transaction()` clones outbox state and only commits `this.state = draft` after the operation succeeds, but its tx object has only `enqueue`, no `db`, at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:509-518`
- `InMemoryAuditChainHeadStore.compareAndSet()` ignores `_db` and mutates `this.heads` immediately at `tools/codegen/templates/service-core/src/audit/audit-chain-head.store.ts.hbs:144-160`
- Publisher advances CAS before `tx.enqueue` at `tools/codegen/templates/service-core/src/audit/audit-publisher.service.ts.hbs:287-304`, then skips producer send and returns inside the tx branch at lines `330-351`

**Impact:** In default no-Postgres tests/standalone shells, an operation that calls `publish(input, tx)` and then throws leaves the chain head advanced while the outbox draft is discarded. Next publish chains from a phantom hash.

---

## P1 Findings

None separate from the P0 atomicity/ghost-event failures above.

---

## P2 Findings

### P2-1: New #260 tests are structural/template checks, not rollback/transaction behavior

**Evidence:**
- Test asserts raw `.hbs` templates at `tools/codegen/__tests__/templates/audit-template-tx-cas-260.test.ts:10-31`
- Checks `toContain`/regex for `chainDb`, `exec`, `producer.send`, and `throw new Error` at lines `102-135`, `170-214`, `220-233`
- No test simulates rollback, `tx.db === undefined`, or in-memory transaction rollback

---

## P3 Findings

None.

---

## Attestations

| # | Attack Vector | Result | Evidence |
|---|---|---|---|
| 1 | TX-THREADING COMPLETENESS | **FAIL** | Happy path threads `chainDb` through all publisher `get`/CAS calls at `audit-publisher.service.ts.hbs:246-311`, but optional/missing `db` still falls back to auto-commit executors |
| 2 | CHAINDB UNDEFINED SLIP | **FAIL** | Standalone `tx === undefined` falls back intentionally, but truthy tx with missing db is accepted by `bindTo(undefined)` and uses `db ?? this.db` |
| 3 | #294 REGRESSION CHECK | **PASS** | Lease guard remains: `leaseGuard(null) => AND FALSE` at `audit-outbox.service.ts.hbs:630-653`; `markPublished`/`markFailed` use it at lines `901-958`; relay passes `row.lockedUntil` at `audit-outbox-relay.ts.hbs:325-346` |
| 4 | TRANSACTION() THROW LEGITIMACY | **FAIL** | Postgres `transaction()` correctly throws on non-tx executor at `audit-outbox.service.ts.hbs:966-993`, but the legitimate in-memory override is not atomic with chain head rollback |
| 5 | TRIO SYMMETRY | **PASS** | Actual paths are `tools/codegen/templates/service-{core,personal,business}`. New test asserts byte identity at `audit-template-tx-cas-260.test.ts:239-247`; shasum confirmed identical core/personal/business audit templates |
| 6 | SNAPSHOT TEST QUALITY | **FAIL** | #260 coverage is template-string/structure only; no emitted behavioral rollback test |
| 7 | GHOST EVENT ON ROLLBACK | **FAIL** | Proper Postgres `transaction()` creates `tx.db` and `tx.enqueue` on one boundary at `audit-outbox.service.ts.hbs:986-991`, but missing-db and in-memory tx paths still allow head/outbox divergence |
| 8 | POST-COMMIT FAN-OUT ORDERING | **PASS** | Relay drains `pending()` rows in ascending `seq`, groups by `messageKey`, stops a key on first failure at `audit-outbox-relay.ts.hbs:267-365` |

---

## Summary

**Actual template paths** (note: `src/tools/codegen/templates/nest-service-*` does not exist at `86f352b`; actual templates are under `tools/codegen/templates/service-{core,personal,business}`).

**Reject until:**
1. Tx objects cannot exist without a real tx executor on Postgres paths (`bindTo()` must reject `undefined` or `AuditOutboxTransaction.db` must be non-optional and validated at construction time).
2. The in-memory transaction path either makes chain-head changes transactional (buffer them inside `transaction()` and apply on commit) or refuses tx-mode publishing when no atomic chain-head rollback is available.
3. Behavioral tests are added that fail on rollback/head-lead, `bindTo(undefined)`, and missing `tx.db`.

**P0 count:** 2 | **P1 count:** 0 | **P2 count:** 1 | **P3 count:** 0

## Re-grill verification cycle 1 (2026-06-02, post-4f27183)

**Overall verdict: APPROVE.** Both prior P0s CLOSED in the actual `4f27183` templates.

- **P0-1 CLOSED** — `AuditOutboxTransaction.db` non-optional (`audit-outbox.service.ts.hbs:140-160`); `bindTo()` rejects absent executors (`:267-279`); Postgres `transaction()` binds real `txDb` (`:1001-1027`); chain-head read/CAS receive `chainDb`; tx publish branch enqueues + returns with no synchronous send; no-tx path still sends synchronously.
- **P0-2 CLOSED** — `InMemoryAuditOutboxStore.transaction()` throws (refuses the impossible mixed-store rollback) (`:529-553`); non-tx in-memory use remains; Postgres tx mode has one rollback boundary.
- **New holes:** only P3 (publisher trusts the TS interface; a hand-forged untyped `as any` tx with `db:undefined` could slip — but NO generated call-site path exists; both constructors carry `db`). No new P0/P1.
- **Test quality:** genuine behavioral coverage (transpiles+evals runtime classes; snapshot-rollback fake executor; asserts `bindTo(undefined)` throws, in-memory `transaction()` throws, rollback leaves head unchanged). RED-against-86f352b credible from old code.
- **Trio symmetry: PASS** — git-object hashes match across all 3 layers.
- **#294 lease-fence: INTACT** — `leaseGuard()` + markPublished/markFailed WHERE clauses unchanged.

PR #190 at `4f27183` approved to merge. P3 → foresight follow-up.
