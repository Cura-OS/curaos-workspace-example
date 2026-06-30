# Codex grill — m9-233 role-grant CAS-retry parity, identity-service PR#52

> Cross-harness adversarial grill (Claude orchestrator → Codex rescue), Tier-2 per
> [[curaos-verification-stack-rule]] + orchestration §3.7 (auth-touching change → grill
> MANDATORY pre-merge). Issue: `your-org/curaos-ai-workspace#233`
> (parent #99 Phase D). Closes the residual P2 surfaced by the #232 login-producer grill:
> `emitDiamondRoleGrantAudit` had the same unconditional `ConflictException` swallow the
> login producer fixed in #232.

- PR: https://github.com/your-org/identity-service/pull/52
- Branch: `agent/m9-233-rolegrant-cas-retry-claude-9d4b1c`
- Commits grilled: `027e750` (fix) → `baa3057` (P2 convergence test, post-grill)
- Base: `main` @ `6ef5cca`

## Verdict: APPROVE-WITH-CONDITIONS (no P0/P1) — MERGEABLE; residual P2 CLOSED pre-merge

The fix extracts a shared bounded-retry helper `publishDiamondAuditWithCasRetry`
(`src/identity-core/audit/publish-with-cas-retry.ts`, maxAttempts=4) and routes BOTH Diamond
audit producers through it — login (`emitDiamondLoginAudit`, refactored off the inline #232
loop) and role-grant (`emitDiamondRoleGrantAudit`, the #233 fix). Concurrent same-resource
emits race the audit-chain-head CAS; the loser's `ConflictException` is now RETRIED (each
`publish()` re-reads the advanced head and chains after the concurrent emit) instead of
swallowed → the no-CAS M3 fact pairs → `pendingCount` stays 0 → #99 Phase D gauge can read
GREEN under live concurrent traffic.

All 8 grilled invariants PASS. The one P2 (test stubbed `publish` itself → didn't prove the
REAL publisher re-reads the advanced head) was closed pre-merge with a real-publisher-against-
fake-store convergence test in `baa3057`.

## P0 findings (block merge)
None.

## P1 findings (must address before merge)
None.

## P2 findings — CLOSED pre-merge
1. **Retry-convergence not proven against the real publisher** — RAISED by Codex, CLOSED in `baa3057`.
   - **Where:** `test/integration/divergence/role-grant-producer-parity.test.ts` — the retry test
     stubbed `IdentityCoreAuditPublisher.publish` directly, proving the producer ROUTES through
     the helper (and would fail the old unconditional-swallow code) but NOT that the real
     `publish()` genuinely re-reads the ADVANCED chain head on attempt #2 (could mask a future
     publisher regression that replays a stale `previousHash`).
   - **Fix landed:** `test/identity-core/audit/publish-with-cas-retry.test.ts` gained a
     `REAL publish convergence under a concurrent CAS race` block driving the REAL helper → REAL
     `IdentityCoreAuditPublisher.publish` against a fake `AuditChainHeadStore` whose first
     `compareAndSet` returns `false` (CAS loss) and whose `get` returns an advanced head after
     the first read. Load-bearing assertion: the `expectedPrevious` passed into CAS flips from
     `null` (attempt #1) to the advanced head (attempt #2) — direct proof the real `publish()`
     re-reads `store.get` rather than replaying a stale hash, and the retried envelope chains
     `previousHash = advanced head`. Convergence claim verified TRUE; not a defect.

## P3 findings (nits)
None.

## What's correct (counter-balance — Codex-verified)
1. **Retry count exact** (`publish-with-cas-retry.ts`): exactly `maxAttempts` publish() calls on
   persistent conflict (no off-by-one on `attempt < maxAttempts`); unit test asserts 4 calls.
2. **Helper never throws**: conflict-exhaustion and non-conflict errors both `return` without
   rethrow → audit fan-out can never fail the user-facing op (M7-D5: replayable from source).
3. **Retry genuinely converges**: `publish()` re-reads head (`store.get`) at the top of every
   call, recomputes hash against the advanced `previousHash`, CASes; throws the exact Nest
   `ConflictException` on CAS loss. No stale-head reuse → no livelock.
4. **Payloads byte-identical pre/post refactor** — role-grant: `ActorMembership` /
   `correlationId = targetUserId` / `changedFields ['role']` / `changeValues {role:[role]}`;
   login: `Identity` / `correlationId = user.id` / `changedFields ['last_login']` / NO
   `changeValues`. No drift → pairing + PHI boundary preserved.
5. **PHI boundary**: `changeValues` stays closed-enum reference-only (bare RBAC code); target id
   stays in `correlationId`, never in `changeValues`; login carries no `changeValues`.
6. **dualWrite gate** short-circuits BEFORE the helper on both producers; off-path tested.
7. **Swallow-on-non-conflict preserved**: non-`ConflictException` failure swallowed in ONE call,
   no retry; helper unit test proves it.
8. **Tests non-tautological**: the role-grant retry test (publish called twice, one success,
   `correlationId = TARGET`, grant resolves) would FAIL against the old unconditional-swallow
   code (which stops after the first thrown conflict).

## Orchestrator independent evidence (§7.1 over-claim re-run, deps-present parent checkout)
- `git diff 6ef5cca..027e750 -- src/`: shared helper added; both producers route through it;
  payloads byte-identical; unused `ConflictException` import dropped from login-user.service.ts.
- `git diff 027e750..baa3057`: **test-only** (1 file, +136/-1); zero `src/` change.
- `bun run ci` (no DSN) on `027e750`: exit 0, **305 pass / 19 skip / 0 fail / 755 expect**.
- `bun run ci` (no DSN) on `baa3057`: exit 0, **307 pass / 19 skip / 0 fail / 762 expect**.
  Within tolerance, matches worker claim — no over-claim.
- The 43-test Citus `pg_dist_partition does not exist` failure is the known pre-existing
  bare-DSN environmental artifact, not exercised here (ran without DSN → full green).

## Env / worktree artifacts (not code defects)
- Codex reviewed via `git diff`/`git show` on SHAs (branch locked by worker worktree) — no
  checkout collision. `bun run ci` not re-run by Codex; orchestrator's deps-present exit-0
  accepted. Worktree `bun install @curaos/*` Verdaccio-401 (§3.9) — not encountered (read-only review).
- Untracked `.claude/` `.turbo/` `packages/auth-sdk/.turbo/` caches — ignored.

## Lineage
- Source defect class: #232 login-producer grill residual P2
  (`ai/curaos/docs/grills/m9-232-login-producer-pr51.md`).
- This fix generalizes the #232 retry into a shared helper both producers (and any future
  Diamond audit producer) reuse — DRY per [[curaos-reuse-dry-rule]].
