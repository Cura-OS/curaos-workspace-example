# Adversarial Grill — audit-core-service PR #5 (M10 #296 audit-core lane)

**Grill type:** Cross-harness T2 adversarial (Codex reviews Claude code)
**PR:** your-org/audit-core-service#5
**Branch:** `agent/m10-296-audit-core-regen-claude-8c2au3di`
**Submodule:** `curaos/backend/services/audit-core-service`
**Session:** 2026-06-02

---

## VERDICT: REQUEST-CHANGES

**One-line reason:** P1 fresh migrate-only deploy break — migration creates `audit_core.audit_outbox` only, while runtime schema and publisher require `audit_core.audit_chain_heads` and existing service tables.

---

## Specific Concern #1 — Test Signature: COSMETIC-TEST-BUG

**Verdict:** cosmetic — the tx-publisher work DID land; the type error is test-only noise.

**Evidence:**
- `src/audit/audit-publisher.service.ts:224-227`: `AuditAuditPublisher.publish(input, tx?)` — 2-arg signature present on the class.
- `test/audit-publisher-tx.test.ts:81`, `:100`, `:118`, `:119`: call `publisher.publish(BASE_INPUT, tx)` against `AuditAuditPublisher` — matching the 2-arg signature.
- `src/db/audit-outbox-relay.ts:84-85`: separate relay port `AuditOutboxPublisher.publish(command)` — 1-arg. The IDE flagged calls against the *wrong* port type import.
- `bun run typecheck` passed clean on branch. `bun test test/audit-publisher-tx.test.ts` passed 5/5.

**Conclusion:** The test type error is an IDE type-check that mistakenly resolved the test's `publisher` variable to the 1-arg port interface rather than the concrete class. Runtime is correct.

---

## Specific Concern #2 — #300 Non-Regression: CONFIRMED

**Verdict:** non-regression confirmed; #300 hash material intact and untouched.

**Evidence:**
- `git diff --exit-code --quiet origin/main..HEAD -- src/audit/audit-chain-hash.ts src/consumer` returned exit 0 — zero diff on both files/dirs.
- `src/audit/audit-chain-hash.ts:138-139`: `CURRENT_AUDIT_HASH_VERSION = 2` — unchanged.
- `src/audit/audit-chain-hash.ts:243-249`: v2 full-envelope verification block — unchanged.
- `src/consumer/audit-chain-validator.service.ts:141-146`: dual-read validation via `auditChainHashMatchesForVersion` — unchanged.
- `src/audit/audit-publisher.service.ts:269-281`: hashes full-envelope material on branch.
- `src/audit/audit-publisher.service.ts:301-307`: stamps `hashVersion: CURRENT_AUDIT_HASH_VERSION`.

---

## Specific Concern #3 — Migration Gap: **P1**

**Verdict:** real P1 deploy break.

**Rationale:** On a fresh migrate-only deployment, `audit_chain_heads` table is not created. The tx publisher performs CAS reads/writes against it at runtime. Service startup would succeed but first publish would crash with table-not-found.

**Evidence:**
- `drizzle/schema.ts:23-29`: declares `audit` schema.
- `drizzle/schema.ts:61-82`: declares `audit_chain_heads` table.
- `drizzle/schema.ts:124-171`: declares `audit_outbox` table.
- `drizzle/schema.ts:205-230`: declares `idempotency_keys` table.
- `drizzle/migrations/0000_audit_outbox.sql:22-24`: creates schema + `audit_outbox` only.
- `drizzle/migrations/0000_audit_outbox.sql:58-71`: adds indexes for `audit_outbox` only.
- `drizzle.config.ts:4-5`: points Drizzle schema to `./drizzle/schema.ts`, migrations to `./drizzle/migrations`.
- `Dockerfile.migrator:21-24`, `:56-60`: migrator copies `drizzle.config.ts` + `drizzle/` + `src/db` — runs only migration files.
- `src/audit/audit-chain-head.store.ts:326-333`, `:365-371`: runtime reads/writes `audit_chain_heads`.
- No service `README.md`; `AGENTS.md:14-17` is placeholder — no documented push-vs-migrate mitigation exists.

**Impact:** `audit_chain_heads`, `audit`, and `idempotency_keys` are undeclared in migrations. A fresh migrate-only deploy leaves those tables absent; tx publish cannot function.

**Note — mold-faithful finding:** This is not a hand-edit regression. The mold at `tools/codegen/templates/service-core/drizzle/migrations/0000_audit_outbox.sql.hbs:22-24` also creates only `audit_outbox`. The mold itself carries this gap. Per [[curaos-generator-evolution-rule]], the fix must fold back into the generator, not be patched locally only.

---

## Specific Concern #4 — Tx-Publisher Correctness: CORRECT

**Verdict:** tx-publisher invariants landed correctly.

**Evidence:**
- `src/audit/audit-publisher.service.ts:247`: `chainDb = tx?.db` — derives tx-scoped db.
- `src/audit/audit-publisher.service.ts:253-258`: chain-head read uses `chainDb`.
- `src/audit/audit-publisher.service.ts:321-328`: CAS uses `chainDb` — tx-scoped.
- `src/audit/audit-publisher.service.ts:354-375`: enqueues via tx and returns — no producer call on tx path.
- `src/audit/audit-publisher.service.ts:381-396`: `producer.send` only on no-tx path.
- `src/db/audit-outbox.service.ts:140-160`: tx `db` binding non-optional.
- `src/db/audit-outbox.service.ts:267-280`: rejects nullish bind; returns tx carrying `db`.

Ghost-on-rollback risk: eliminated. CAS atomicity: confirmed per tx scope.

---

## Specific Concern #5 — Mold-Faithful Regen: FAITHFUL

**Verdict:** no hand-edit divergence found.

Branch tx-publisher, tx-scoped CAS, enqueue, skip-send, and outbox module match current codegen-template intent:
- Mold: `tools/codegen/templates/service-core/src/audit/audit-publisher.service.ts.hbs:224-227`, `:247`, `:321-328`, `:354-375`.
- Rendered: `src/audit/audit-publisher.service.ts:224-227`, `:247`, `:321-328`, `:354-375`.

Migration gap is mold-faithful — mold carries the same gap (see Concern #3). Not a divergence from mold; a defect in mold.

---

## Findings by Severity

### P0
None.

### P1

**[P1-MIGRATION-CHAIN-HEADS]** `drizzle/migrations/0000_audit_outbox.sql:22-24` / `drizzle/schema.ts:61-82` / `src/audit/audit-chain-head.store.ts:326-333`, `:365-371`
- Missing migration for `audit_chain_heads`. Fresh migrate-only deploy creates `audit_outbox` but not `audit_chain_heads`. Publisher CAS fails with table-not-found at first publish attempt. Deploy succeeds silently; runtime breaks on first audit event.

**[P1-MIGRATION-AUDIT-IDEMPOTENCY]** `drizzle/schema.ts:23-29`, `:205-230` / `drizzle/migrations/0000_audit_outbox.sql:22-71`
- Schema also declares `audit` and `idempotency_keys` tables absent from any migration. Fresh deploy leaves idempotency enforcement non-functional. Migration state does not match runtime schema.

**[P1-MOLD-DEFECT]** `tools/codegen/templates/service-core/drizzle/migrations/0000_audit_outbox.sql.hbs:22-24`
- Root cause of P1-MIGRATION-* is in the mold, not just this regen. Per [[curaos-generator-evolution-rule]], fix must go into generator templates + snapshot tests, not a local patch to this service only. Downstream regen of any new service inherits the same broken deploy path.

### P2
None.

### P3
None.

---

## Approval Gate

**REQUEST-CHANGES** — blocked by P1 migration gap (P1-MIGRATION-CHAIN-HEADS, P1-MIGRATION-AUDIT-IDEMPOTENCY, P1-MOLD-DEFECT).

No P0 found. Test-signature concern is cosmetic. #300 non-regression confirmed. Tx publisher landed correctly. Regen is mold-faithful.

**Required before APPROVE:**
1. Add migrations for `audit_chain_heads`, `audit`, and `idempotency_keys` to `drizzle/migrations/`.
2. Fold migration gap fix back into the mold at `tools/codegen/templates/service-core/drizzle/migrations/` + update snapshot tests per [[curaos-generator-evolution-rule]].
3. (Optional P3) Document push-vs-migrate strategy in service `README.md` or `AGENTS.md` if push is intentional for dev-only and migrate is production path.
