# Codex grill — m10-294 PR curaos#183

**Branch:** `agent/m10-294-audit-outbox-claim-lease-fence-claude-196dc778`
**Closes:** curaos-ai-workspace#294
**Scope:** codegen MOLD templates `tools/codegen/templates/service-{core,personal,business}/src/db/audit-outbox.service.ts.hbs` + `audit-outbox-relay.ts.hbs` + snapshot test
**Blast radius:** defect replicates to every generated service on next `codegen run`

## Verdict: BLOCK

Two P1 merge blockers. No P0. Trio symmetry passes. SQL injection passes. Threading passes (no undefined-collapse path). Test adequacy is partial.

---

## P0 findings (block merge)

_None._

---

## P1 findings (must address before merge)

### P1-1 — NULL lease is an ownership bypass for any unclaimed row

- **Where:** `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs` — `markPublished` / `markFailed` WHERE clause + in-memory guard (lines containing `locked_until IS NULL` and `null === null` equivalence)
- **What:** The Postgres fence is `WHERE id = $id AND (locked_until = $claimedLease OR locked_until IS NULL)`. The in-memory store allows the mark when `row.lockedUntil === claimedLease` — and both `null === null` (JS strict equality) and `NULL = NULL` (Postgres, via the `IS NULL` arm) are truthy. A caller that never invoked `pending()` — e.g. one that reads row IDs via a side-channel or the `all()` accessor — can call `markPublished(id, null)` and the fence accepts it unconditionally on any row that has never been claimed (`locked_until IS NULL`). That includes rows that were inserted but not yet picked up by any relay replica.
- **Failing scenario:** Row `{id: 'r1', status: 'pending', locked_until: NULL}` is sitting in the outbox, not yet claimed. Rogue/stale worker calls `markPublished('r1', null)`. Postgres: `locked_until IS NULL` arm matches → row set to `published`. In-memory: `null === null` → same result. No claim was issued; the legitimate relay may never have seen this row.
- **Why P1:** Ownership invariant is bypassed for the entire unclaimed-row population, which is the majority of rows at any point in time. Not a corner case.
- **Fix:** Remove the `IS NULL` arm from the fence WHERE clause and from the in-memory guard. If unclaimed-row recovery is needed, expose a separate `recoverStale()` method with explicit staleness check (`locked_until < NOW()`) and a distinct caller contract. Relay-facing `markPublished`/`markFailed` must require a non-null, non-undefined lease obtained from `pending()`.

### P1-2 — Zero-length lease creates equality-boundary false-negative

- **Where:** `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs` — `pending()` lease calculation (lines computing `lockedUntil = new Date(now + leaseMs)`) + fence WHERE comparison
- **What:** When `CURAOS_AUDIT_OUTBOX_LEASE_MS=0` (or the env var is unset and the default resolves to 0), `lockedUntil` equals `now`. The lease token is a timestamp, not a unique token. Two relay replicas calling `pending()` at the same millisecond receive the same `lockedUntil` value. Worker A holds a lease of `T`; its lease has effectively already expired (duration=0). Worker B claims at `T`, also gets `locked_until=T`. Worker A calls `markPublished(id, T)` — the fence compares `locked_until = T` and passes, even though Worker A is the stale replica.
- **Failing scenario:** `leaseMs=0`, two replicas clock-synchronized. Worker A and B both receive `lockedUntil = 1717200000000`. Worker B's claim is newer (same timestamp, last write wins at DB). Worker A calls `markPublished(id, 1717200000000)`. Postgres fence: `locked_until = 1717200000000` — matches. Stale worker A transitions a row Worker B owns.
- **Why P1:** A zero-duration or clock-collision lease is a realistic misconfiguration. It silently disables the fence for the entire equality boundary. If `leaseMs` defaults to 0 anywhere in the config templates, this is a day-one regression.
- **Fix:** (a) Validate `leaseMs > 0` at service startup and throw if not. (b) Long-term: replace the timestamp-as-token model with a unique `claim_id` (UUID/ulid) stored alongside `locked_until`. The fence becomes `WHERE claim_id = $claimId` — immune to clock skew and equality collision.

---

## P2 findings (followups acceptable)

### P2-1 — SQL uses escaped string interpolation, not `$N` parameter binding

- **Where:** `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs` — `markPublished` / `markFailed` SQL construction (lines using `sql.raw(...)` + custom `literal()` for the lease value)
- **What:** The lease timestamp is escaped and interpolated via a `literal()` helper rather than being passed as a `$N` positional parameter in a Drizzle parameterized query. No concrete injection scenario was found because `literal()` wraps in single quotes, but this is structural debt: any future change to `literal()` that relaxes escaping would silently open a SQL injection vector on the lease path of every generated service.
- **Why P2:** No confirmed injection path today; risk is in the fragility of the escape dependency.
- **Fix:** Bind `claimedLease` as a Drizzle `sql.param(claimedLease)` / `$N` parameter instead of interpolating via `literal()`.

### P2-2 — Snapshot tests are structural, not behavioral

- **Where:** `tools/codegen/__tests__/templates/audit-outbox-claim-lease-fence.test.ts` (lines containing regex assertions on WHERE-clause snippets and trio byte comparison)
- **What:** Tests assert that the emitted TypeScript source contains the expected WHERE-clause text and that all three service types (core/personal/business) emit byte-identical fence logic. They do NOT: (a) compile and execute the emitted code, (b) assert the mismatch no-op path (`rowsAffected === 0` → no state change), (c) assert that `null`/`undefined` lease is rejected at the service boundary, or (d) verify the zero-lease startup guard if one is added.
- **Why P2:** Structural string-matching tests can pass even if the fence logic is logically inverted (e.g. `NOT (locked_until = $lease)` would still match a regex looking for `locked_until`). Behavioral coverage is missing.
- **Fix:** Add behavioral unit tests against the emitted in-memory store that exercise: matching-token commit succeeds, mismatched-token no-ops, null/undefined lease rejects, stale-vs-current replica ordering.

### P2-3 — Process-clock lease stamp vs. Postgres `NOW()` skew is unmitigated

- **Where:** `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs` — `pending()` lease stamping (lines using `new Date(Date.now() + leaseMs)`)
- **What:** The lease expiry is computed in Node.js process time and stored in Postgres. The WHERE fence for `pending()` is `WHERE locked_until IS NULL OR locked_until <= NOW()` — Postgres `NOW()`. Under NTP correction or VM clock drift, Node process time and Postgres server time can diverge by seconds. A relay on a host with a slow clock can stamp a `lockedUntil` in the past relative to Postgres, causing the row to be immediately reclaimable by another replica.
- **Why P2:** Requires actual clock drift; not an always-on failure mode.
- **Fix:** Compute lease expiry via `SELECT NOW() + interval '$leaseMs ms'` in the same transaction as the `UPDATE`, or use `locked_until = NOW() + interval` in the SQL itself so both the comparison and the stamp use the same Postgres clock.

---

## P3 findings

### P3-1 — Comments claim parameterized binding but code uses literal interpolation

- **Where:** `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs` (inline comments near `markPublished`/`markFailed` SQL), `tools/codegen/__tests__/templates/audit-outbox-claim-lease-fence.test.ts` (test description strings)
- **What:** Comments and test descriptions refer to `$claimedLease` as a placeholder parameter, but the generated code uses `literal(claimedLease)` interpolation. Misleading for the next person reading either the template or the test output.
- **Fix:** Align comments/test descriptions with actual binding mechanism used; or fix the binding and let comments become accurate (see P2-1).

---

## What Claude got right (counter-balance)

1. **Trio symmetry is exact.** Core/personal/business templates emit byte-identical fence logic. SHA comparison of the emitted service file confirms no drift across the three service types — the most important blast-radius property of a mold change.
2. **Relay threading is clean.** `pending()` returns `lockedUntil` alongside each row, and the relay passes `row.lockedUntil` to both `markPublished` and `markFailed`. There is no code path where the lease is not captured — `undefined` does not silently collapse the WHERE clause (it would throw in `literal(undefined)` rather than silently bypass).
3. **Locked-forever scenario is mitigated.** The mark methods clear `locked_until` on success, and the `pending()` query re-acquires expired rows (`locked_until <= NOW() OR locked_until IS NULL`). A relay crash after DB update but before broker ack is recoverable by the next `pending()` sweep when the lease expires.
4. **In-memory and Postgres stores are symmetric.** The in-memory fence mirrors the Postgres fence (including the `IS NULL` arm). This means unit tests on the in-memory path validly test the same logic as the Postgres path — once the fence semantics are corrected (P1-1), both stores will be corrected together by a single template fix.
5. **The directional intent is correct.** The PR correctly identifies that id-only keying was insufficient and that a lease token tied to ownership prevents the core stale-write scenario. The fence architecture is sound; the identified issues are fixable within the same template structure without a redesign.

---

## Attack checklist summary

| Vector | Result | Severity |
|---|---|---|
| Null lease bypasses fence | FAIL — ownership bypass for all unclaimed rows | P1 |
| Zero/equality-timestamp collision | FAIL — stale worker passes fence at boundary | P1 |
| IS NULL branch opens window for unowned mark | FAIL (same as null lease, root of P1-1) | P1 |
| Relay threading: undefined lease collapses WHERE | PASS — `literal(undefined)` throws, no silent bypass | — |
| Trio symmetry: core/personal/business byte-identical | PASS — confirmed by SHA comparison | — |
| Snapshot tests assert fence WHERE + mismatch no-op | PARTIAL — structural regex only, no behavioral execution | P2 |
| SQL injection / param binding | PARTIAL — escaped interpolation, not `$N` binding; no confirmed injection path | P2 |
| Process clock vs. Postgres NOW() skew | PARTIAL — hypothesis; fix recommended | P2 |
| Locked-forever after relay crash | PASS — expiry-based re-acquisition covers this | — |

---

_Grill produced by Codex (opposite-harness adversarial review per [[curaos-verification-stack-rule]] Tier-2). Date: 2026-06-02._

## Re-grill verification (2026-06-02, post-9acaad8)

Grounding note: live `gh pr diff` failed with `error connecting to api.github.com`; review used local git object `9acaad8` and local PR diff `origin/main...9acaad8`. Generated service outputs are not in the diff; mold verification is against the `.hbs` templates at `9acaad8`.

### 1. P1-1 CLOSED — evidence from diff

PASS. The mark-path `locked_until IS NULL` ownership bypass is closed in the trio mold.

Evidence:
- All three store templates are byte-identical at `9acaad8`: `service-core`, `service-personal`, and `service-business` `audit-outbox.service.ts.hbs` share the same content.
- Diff hunk `@@ -555,44 +618,101 @@` adds `leaseGuard(claimedLease)`; at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:650-653`, `claimedLease === null` returns `AND FALSE`, while non-null leases render exact `locked_until = <lease>`.
- Postgres `markPublished` and `markFailed` both call `leaseGuard(claimedLease)` at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:901-919` and `:924-947`.
- In-memory update rejects null and mismatch before mutation at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:521-544`.
- Relay happy path passes the `pending()`-returned `row.lockedUntil` into both marks at `tools/codegen/templates/service-core/src/db/audit-outbox-relay.ts.hbs:326-346`.

Checklist:
- **A: PASS.** No mark-fence `locked_until IS NULL` arm remains in any trio store template. Remaining `locked_until IS NULL` occurrences are comments or the legitimate `pending()` claim/recovery predicate at `audit-outbox.service.ts.hbs:852`.
- **B: PASS for legitimate worker path.** `pending()` stamps non-null `lockedUntil`, relay passes it, and matching leases still mutate. Null is now no-op/false, not a bypass. Runtime `undefined` is not a legitimate typed mark token; Postgres would throw through `literal(undefined)`, while in-memory no-ops unless corrupted state also used `undefined`.

### 2. P1-2 NOT CLOSED — evidence from diff

FAIL. Zero/non-positive env/default paths are fixed, but the claimed "positive finite integer" guard is not implemented for explicit constructor injection.

Evidence:
- Diff hunk `@@ -555,44 +618,101 @@` adds `assertLeaseMs`, but the condition is only `!Number.isFinite(leaseMs) || leaseMs <= 0`; no `Number.isInteger(leaseMs)` check exists at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:696-704`.
- Both constructors call that incomplete guard: in-memory at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:384-391`, Postgres at `:730-752`.
- `pending()` computes timestamp lease tokens with `new Date(nowMs + this.leaseMs)` / `new Date(now.getTime() + this.leaseMs)` at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:424` and `:842-843`.
- Local Node probe confirms sub-millisecond values truncate to the same millisecond: `new Date(1000 + 0.5).getTime() === 1000`.

Impact: An explicit `leaseMs = 0.5` is accepted, stamps `lockedUntil === now`, and can recreate the same equality-boundary stale-worker pass the prior P1 described. Env-derived and default construction are safe (`resolveLeaseMs()` uses `parsed > 0` and default `30_000` at `audit-outbox.service.ts.hbs:678-685`), but the explicit construction path remains a live bypass.

Checklist:
- **C: FAIL.** Guard covers env-derived/default and constructor call sites, but not the promised integer invariant.
- **D: PASS** for strictly positive integer milliseconds; fast successive `pending()` calls cannot collide before expiry. **FAIL** for accepted positive sub-ms explicit leases. Foresight #315 can cover claim-id hardening, but this explicit sub-ms hole is still live.
- **E: PASS for P1-1 regressions.** The new test executes extracted `leaseGuard` and in-memory guard logic, asserting null maps to `AND FALSE` and `skips(null, null)` is true at `tools/codegen/__tests__/templates/audit-outbox-claim-lease-fence.test.ts:186-263`. It would go red if the `IS NULL` arm were re-added or the in-memory guard removed. It does not test fractional explicit `leaseMs`.

### 3. New issues found

**P0:** None found.

**P1 — Explicit sub-millisecond lease still accepted**
- Evidence: `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:696-704` checks finite and `> 0`, but not integer; `pending()` uses Date millisecond timestamps at `:424` and `:842-843`.
- Impact: `leaseMs = 0.5` can stamp `lockedUntil === now`, allowing immediate reclaim with the same timestamp token and reopening the stale-worker equality false-negative.
- Recommendation: change guard to `if (!Number.isFinite(leaseMs) || !Number.isInteger(leaseMs) || leaseMs <= 0)` and add emitted behavioral coverage for explicit `0.5`.

**P2:** None found.

**P3:** None found.

### 4. Overall verdict: BLOCK

BLOCK — P1-1 is closed, but P1-2 is not closed because explicit positive fractional leases still bypass the intended positive-integer startup guard and can recreate the equality-boundary stale-worker pass.

_Reviewed by Codex (opposite harness), appended by Claude Code, 2026-06-02._

## Re-grill verification cycle 2 (2026-06-02, post-e8e320c)

**Verdict: APPROVED**

Grounding note: `env -u GITHUB_TOKEN gh pr diff 183 --repo your-org/curaos` failed with `error connecting to api.github.com` in the Codex sandbox; verification used local object `e8e320c48820e9cd2ebbc3974779140dba86a22e` and local diff `9acaad8..e8e320c`. No builds, tests, or codegen were run.

### Findings

| Level | Finding | Status | Evidence |
|---|---|---|---|
| P0 | Any new P0 | NOT FOUND | Diff touches only `tools/codegen/__tests__/templates/audit-outbox-claim-lease-fence.test.ts` and the three trio `audit-outbox.service.ts.hbs` templates. |
| P1 | P1-2: explicit fractional lease bypass | **CLOSED** | All three trio templates contain `!Number.isInteger(leaseMs)` — confirmed at `service-core/src/db/audit-outbox.service.ts.hbs:697`, `service-personal/...:697`, and `service-business/...:697`. |
| P1 | Non-integer/sub-ms path still reaches `lockedUntil` | **CLOSED** | Explicit constructors call `assertLeaseMs(leaseMs)` before stamping (service-core `:386-391` and `:744-752`); default/env path uses `DEFAULT_AUDIT_OUTBOX_LEASE_MS = 30_000` and `resolveLeaseMs()` at `:676-684`; stamping uses `this.leaseMs` at `:424` and `:843`. |
| P1 | Legitimate default rejected by new guard | NOT FOUND | Default is integer `30_000` at service-core `:676`; behavioral test asserts `assertLeaseMs(30000)` passes at `audit-outbox-claim-lease-fence.test.ts:179`. |
| P2 | Residual timestamp-token equality collision | ACCEPTED FOLLOW-UP | Template documents longer-term unique `claim_id` UUID/ulid follow-up at service-core `:671-674`. Exact foresight issue `#315` not locally verified (GitHub network unavailable), but `claim_id` commentary is present. Current integer guard closes the explicit `0.5` vector; `pending()` uses `FOR UPDATE SKIP LOCKED` at `:855`. Same-millisecond collision is accepted-with-foresight P2, not a live P1. |
| P3 | Adjacent comment omits integer wording | NEW (minor) | Guard at service-core `:697-699` enforces positive finite integer, but nearby comment at `:688-694` still mentions only "strictly positive / non-finite". Non-blocking docs polish. |

### Attack checklist

- **A (trio completeness): PASS.** `!Number.isInteger(leaseMs)` present in service-core, service-personal, and service-business template diffs.
- **B (all paths funnel through assertLeaseMs): PASS.** Env/default and explicit injection paths all route through validation before `lockedUntil` stamping.
- **C (residual equality-collision): ACCEPTED P2.** `claim_id` follow-up documented locally. Same-millisecond collision is not a remaining P1 from this diff; explicit fractional vector is closed.
- **D (test goes red without isInteger): PASS.** Test includes `expect(() => assertLeaseMs(0.5)).toThrow()` at `audit-outbox-claim-lease-fence.test.ts:173`; removing `!Number.isInteger` would fail that assertion.
- **E (legitimate default not rejected): PASS.** `30000` passes; no regression.

### Rationale

P1-2 is confirmed closed in all three mold templates. The `0.5` behavioral regression test would fail without `Number.isInteger`. No new P0 or P1 was introduced. Residual same-millisecond timestamp-token debt is accepted-with-foresight P2. Guard change has no false-positive effect on the integer default.

**APPROVED** — P1-2 closed across trio templates, `0.5` regression covered, no new P0/P1.

_Re-grilled by Codex (opposite harness), appended by Claude Code, 2026-06-02._
