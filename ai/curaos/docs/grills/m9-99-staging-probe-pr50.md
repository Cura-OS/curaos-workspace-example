# Codex grill — m9-99 staging probe PR identity-service#50

**Branch:** `agent/m9-99-staging-gauge-probe`
**Files grilled:** `src/identity-core/divergence/divergence-ledger.store.ts` (dead-code removal), `test/integration/divergence/staging-gauge-probe.test.ts` (new DSN-gated probe)
**Grill date:** 2026-05-31
**Harness:** Codex (opposite-harness; Claude orchestrated)

## Verdict: APPROVE-WITH-CONDITIONS

---

## P0 findings (block merge)

None.

---

## P1 findings (must address before merge)

None.

---

## P2 findings (followups acceptable)

1. **Staging probe can pass vacuously without DSN**
   - **Where:** `test/integration/divergence/staging-gauge-probe.test.ts:46-47`
   - **What:** `const DSN = process.env.CURAOS_IDENTITY_DATABASE_URL;` + `const liveTest = DSN ? test : test.skip;` means every assertion is skipped (`test.skip`) when the staging/local Postgres DSN is absent. A DSN-absent CI run shows 0 failures with no indication the gauge was actually exercised.
   - **Why P2:** The probe's entire value is verifying the live divergence checker. A vacuous green is indistinguishable from a true green in raw CI output.
   - **Fix (followup acceptable):** Require the orchestrator to paste DSN-present stdout into the PR body as authoritative evidence before acceptance, and/or add a harness-level warning when all `liveTest` assertions are skipped.

---

## What Codex got right (counter-balance)

1. **No stale references to removed symbols.** Recursive `rg -a -n isOpaqueReferenceToken src test` → `NOT_FOUND`. Recursive `rg -a -n REFERENCE_TOKEN_RE src test` → `NOT_FOUND`. The removal is clean.
2. **`looksLikePhi` not orphaned.** Defined at `src/identity-core/divergence/divergence-ledger.store.ts:214-218`; called by `isReferenceOnlyValue` at line 230-235. Still live, still contributing to PHI detection.
3. **UUID-only correlation guard introduced by #202 work is in place.** `isReferenceOnlyCorrelationId` returns `UUID_RE.test(value)` at lines 281-282. `assertReferenceOnly` rejects non-UUID pending correlation IDs at lines 331-339. This is a narrower, more correct check than the removed broad `REFERENCE_TOKEN_RE` pattern.
4. **Closed-grammar value guard still covers all persistence paths.** `isReferenceOnlyValue` rejects PHI-shaped values via `looksLikePhi` and accepts only role/UUID/canonical `membership:<uuid>#<role>`/allowlisted resource refs at lines 230-259. Every ledger backend (in-memory at line 461, file store at 495, Postgres store at 683) calls `assertReferenceOnly` before persisting.
5. **Probe test drives real producer and checker paths.** Constructs real `AuthAuditPublisher`, `IdentityCoreAuditPublisher`, `AdminController`; calls `controller.assignRole()` to exercise the audit publisher chain; creates real `PostgresDivergenceLedgerStore` and `AuthDiamondDivergenceChecker`; reads `checker.isGreen()`, `divergenceCount()`, `pendingCount()`, and `prometheusMetrics()` without stubbing divergence machinery.

---

## Five requested checks

### CHECK-1: `isOpaqueReferenceToken` post-removal

**PASS.** `rg -a -n isOpaqueReferenceToken src test` returned `NOT_FOUND`. The function is fully removed; no callers remain.

### CHECK-2: `REFERENCE_TOKEN_RE` post-removal

**PASS.** `rg -a -n REFERENCE_TOKEN_RE src test` returned `NOT_FOUND`. The constant is fully removed; no references remain.

### CHECK-3: `looksLikePhi` live and called

**PASS.** `looksLikePhi` is defined at `src/identity-core/divergence/divergence-ledger.store.ts:214-218` and called from `isReferenceOnlyValue` at lines 230-235. Not orphaned.

### CHECK-4: PHI boundary adversarial trace

**PHI boundary: INTACT.**

Adversarial reasoning: `isOpaqueReferenceToken` was a broad opaque-token helper that checked whether a value "looked like" a reference token (via `REFERENCE_TOKEN_RE`) without being tied to the actual persistence path. The real PHI gate was never `isOpaqueReferenceToken` alone — it was `isReferenceOnlyValue`/`assertReferenceOnly`, both of which remain.

Post-removal, the persistence chain is:
- All three ledger store backends call `assertReferenceOnly(pending)` before persisting any snapshot.
- `assertReferenceOnly` applies `isReferenceOnlyValue` to every `change.value` at lines 341-346 and `isReferenceOnlyCorrelationId` to every `correlationId` at lines 331-339.
- `isReferenceOnlyValue` rejects PHI-shaped values via `looksLikePhi` first, then admits only RBAC role, UUID, `membership:<uuid>#<role>`, or allowlisted resource references.
- `isReferenceOnlyCorrelationId` admits only bare UUID-format strings (UUID_RE), which is **narrower** than the removed `REFERENCE_TOKEN_RE` (which also admitted opaque base64-like tokens).

The removal **tightened**, not loosened, the correlation-ID gate. No PHI-shaped value can now slip into the ledger on any path that was guarded before.

### CHECK-5: Staging-gauge-probe test realism and vacuity

**P2 (see findings above).** When DSN is present, the test is real: real `AdminController.assignRole()` call, real audit publisher chain, real `PostgresDivergenceLedgerStore`, real `AuthDiamondDivergenceChecker.isGreen()` read. Divergence machinery is not stubbed. When DSN is absent, the test is `test.skip` throughout — vacuously green with no evidence the gauge ran.

---

## Grill metadata

- Grill type: cross-harness Tier-2 adversarial (Codex grills Claude's PR)
- Sandbox state: read-only (no bun test runs)
- HTTP tests: not present in changed files; no sandbox port-bind issue
- Report file written by: Claude orchestrator (Codex sandbox blocked file write; report returned inline and persisted by orchestrator)
