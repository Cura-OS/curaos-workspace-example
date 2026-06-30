# Codex grill — m9-59 refresh-session import cycle break, identity-service PR#61 (+ curaos PR#151 follow-up)

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]]. PR #61 breaks a real contract↔impl import cycle in
> identity-service auth (surfaced by curaos #245 making the dep-cruiser gate enforce). The
> coupled curaos follow-up (PR #151) drops the cycle's pathNot placeholder + bumps the pointer.
> Issue `your-org/identity-service#59`.

- id-svc PR: https://github.com/your-org/identity-service/pull/61 — merged `76b5142`
- curaos follow-up PR: https://github.com/your-org/curaos/pull/151 — merged `5b44ca4`
- Commits: `e2f59ee` (cycle fix) → `5040aaa` (test-gap fix) → merged. Base id-svc main `9514094`.

## Verdict trail: REQUEST-CHANGES (test bypass) → fix → APPROVE (id-svc) | REQUEST-CHANGES (over-suppress) → fix → APPROVE (curaos)

## The cycle (real, found by the now-enforcing #245 dep-cruiser no-circular + tsPreCompilationDeps)
```
src/auth/refresh-session-store.ts  →(VALUE) valkey-refresh-session-store.ts   (connectValkeyRefreshSessionStore)
src/auth/valkey-refresh-session-store.ts →(type-only) refresh-session-store.ts (RefreshSessionStore, *Input/*Result …)
```
Contract module statically imported the Valkey IMPL as a value; impl type-imported the contract back.

## Fix (id-svc PR #61)
Convert the static value import to a LAZY dynamic import at its single call site (the `'valkey'`
branch of the already-async `defaultRefreshSessionStore()`):
`const { connectValkeyRefreshSessionStore } = await import('./valkey-refresh-session-store')`.
The contract module becomes a pure types leaf; the back-edge was already `import type` (erased).
Runtime cycle broken.

## Round 1 (id-svc, `e2f59ee`) — REQUEST-CHANGES: test BYPASSES the changed path
The cycle break + behavior were CONFIRMED, but the regression test imported
`valkey-refresh-session-store` directly + constructed `new ValkeyRefreshSessionStore(...)` — it
never drove the lazy `await import` via `defaultRefreshSessionStore()`. A broken lazy import /
renamed export would have left the test GREEN → not load-bearing.

## Round 2 fix (id-svc, `5040aaa`) — APPROVE
New test file `test/refresh-session-default-store.test.ts` routes via the REAL env vars
(`CURAOS_REFRESH_SESSION_STORE=valkey` + URL/timeout), calls `await defaultRefreshSessionStore()`,
drives the REAL lazy `await import` + REAL `connectValkeyRefreshSessionStore` (stubbing ONLY the
external `@valkey/valkey-glide` GLIDE client, file-scoped so no leak), asserts a
`ValkeyRefreshSessionStore` instance + create/list round-trip. Load-bearing proof: breaking the
lazy specifier → `Cannot find module` → test FAILED → restored. Codex re-grill APPROVE: gap closed,
fix byte-intact, stub scoped, env restored, no new defect.

## curaos follow-up (PR #151) — the over-suppression catch
The coupled parent change drops the `#59` cycle pathNot + bumps the id-svc pointer. The FIRST
attempt added `viaOnly: { dependencyTypesNot: ['dynamic-import','type-only'] }` to the no-circular
`to` block. **Grill REQUEST-CHANGES — real over-suppression:** dep-cruiser 16.10.4 `matchesToViaOnly`
suppresses a cycle if ANY edge matches an excluded type, so a real MIXED cycle (`A→B` static value
+ `B→A` dynamic-import) ANYWHERE would silently pass — the #245-defect-2 blanket-suppression class.
The orchestrator's first enforce-probe (both-static) missed it; Codex named the mixed shape.

**Fix (`eb3a9db`):** dropped the repo-wide `viaOnly`; restored a narrow per-file `from.pathNot`
scoped to exactly the 2 refresh-session files (the runtime cycle is gone at source; only the
nominal dep-cruiser loop remains under tsPreCompilationDeps). Same proven-safe pattern as the
builder-sdk generated carve-out. **Enforce-proof:** injected the EXACT mixed cycle
(`__probe_a →(static value) __probe_b →(dynamic-import) __probe_a`) → `no-circular` FIRED (error,
non-zero) → removed. Re-grill APPROVE: over-suppression closed, #59 covered, no new blind spot.

## Orchestrator independent evidence
- id-svc `bun run ci` on `5040aaa`: EXIT=0, 374 pass / 24 skip / 0 fail / 1003 expect.
- id-svc diff: 3 files (the lazy-import fix + 2 test files). Fix byte-intact across the test-fix commit.
- curaos `bun run depcruise` on `eb3a9db`: GREEN (bulk 573/0). Mixed-cycle enforce-proof fired correctly.
- curaos `scripts/ci-local.sh`: depcruise PASS + aggregate-ci (turbo) PASS. (Pre-existing Tier-A
  failures — oxlint on untracked `.stryker-tmp/`, a workflow-sdk TS error — unrelated; this diff is
  config + pointer only.)

## Lineage
- Filed by: curaos #245 (dep-cruiser enforce — the now-live gate found this real cycle).
- Source fix: id-svc #61. Coupled parent: curaos #151 (carve-out + pointer).
- Both grills caught a real defect the first attempt missed (test-bypass; viaOnly over-suppress) —
  why the cross-harness grill matters even for a "small" 4-line fix.

## Note for future cycle carve-outs
`viaOnly: { dependencyTypesNot: [...] }` on `no-circular` is REPO-WIDE and suppresses a cycle if
ANY edge matches the excluded type → use a narrow per-file `from.pathNot` for a specific known
non-runtime loop instead. Reserve `dependencyTypesNot` exclusions for `type-only` (erased) at most,
never `dynamic-import` repo-wide (masks mixed static+dynamic runtime cycles).
