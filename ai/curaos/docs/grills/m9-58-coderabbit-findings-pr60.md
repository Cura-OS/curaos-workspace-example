# Codex grill — m9-58 CodeRabbit findings from Phase-D PRs, identity-service PR#60

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]]. PR #60 fixes 5 CodeRabbit findings captured post-merge
> (§3.13 inbox sweep) from the merged Phase-D PRs (#50/#54/#55). Two are high-risk: a HOT-PATH
> change to the #241 divergence tap loop (finding 3) + a SECURITY-class DB param-binding fix
> (finding 5) → grill MANDATORY. Issue `your-org/identity-service#58`.

- PR: https://github.com/your-org/identity-service/pull/60
- Branch: `agent/m9-58-coderabbit-findings-claude-e10840a`
- Commit: `292d7d1` → merged `9514094`. Base: `main` @ `e10840a`.

## Verdict: APPROVE — all 5 findings CLOSED, no new defect

5 findings fixed TDD (each verified red-pre-fix / green-post-fix by the worker + independently
CI-confirmed by the orchestrator).

| # | Sev | Finding | Fix | Codex verdict |
|---|---|---|---|---|
| 1 | Major | admin-target seeding fails silently → `adminTargetUserId` unset, traffic proceeds | fail-fast guard (extracted k6-free `divergence-traffic-guards.ts`) asserts before traffic | CLOSED (`divergence-traffic.ts:123-134`) |
| 2 | Major | `staging-divergence-check.sh` ignores k6 exit code → false green | capture `k6_rc`, die non-zero on k6 failure; `${BASE_URL}` brace fix (real adjacent bash-5.3 `set -u` + multibyte-ellipsis crash) | CLOSED (`:118-122`, shell test `:63-84`) |
| 3 | Major (hot-path) | tap loop: one bad message exits whole batch, drops rest | per-message try/catch isolates the bad message, swallow+log, batch continues | CLOSED (`divergence-tapping-producer.ts:323-339`) |
| 4 | Minor | fixed schema `staging_gauge_probe` races under parallel runs | per-run unique schema name + `finally` teardown drop | CLOSED (`staging-gauge-probe.test.ts:62-68`,`:356-359`) |
| 5 | Major (security) | param binding dropped in Drizzle→postgres path (SQL text rebuilt, params never reach PG) | real parameterized exec: `PgDialect.sqlToQuery` → `$1,$2…` + params array → `client.unsafe(text, params)` | CLOSED (`staging-gauge-probe.test.ts:217-225`) |

## The two high-risk verifications (Codex-confirmed)

**Finding 3 — gate interaction SAFE (no false-green).** The per-message try/catch pushes every
successfully-normalized fact BEFORE the catch boundary (`:327-332`), so the new catch cannot
false-skip a non-throwing fact → it cannot cause the #243 ledger-authoritative gate to
under-count → no false-green risk. The #241 invariants are preserved: send-first/tap-after
(`:274-276`), fire-and-forget, swallow-on-tap-error, serial single-in-flight drain (`:357-366`).
Batch test (3 msgs, middle throws → other 2 still reach `recordDurable`) is load-bearing.

**Finding 5 — REAL param binding (not interpolation).** Codex confirmed `$1/$2` placeholders
with a populated params array (`[42,'alice']`) reach postgres via `client.unsafe(text, params)`
(`:381-389`); the injection-sentinel test (`two'; DROP TABLE x; --`, `:411-427`) proves the value
is BOUND not interpolated (embedded quote does not break SQL, exact row returned). Production
`sql.raw()` path in `divergence-store.ts` is UNCHANGED — blast radius is **test-only**. This
closes a genuine SQL-injection-class surface in the test harness's executor.

## Orchestrator independent evidence
- `bun run ci` on `292d7d1`: EXIT=0, **372 pass / 24 skip / 0 fail / 997 expect** (+ new
  `test:scripts` k6-exit shell test PASS). gitleaks clean.
- Diff `e10840a..292d7d1`: 9 files, +405/-22 (3 prod/script files, 2 new guard/test files, 4 tests).
- Finding 5 fix independently confirmed genuine parameterized execution (read `toQuery`/
  `sqlToQuery`→`client.unsafe(text, params)` — placeholders + params, not string interp).
- DSN-gated tests verified by the worker against a throwaway local Postgres 17 (all green), skip
  cleanly with no DSN (as in CI).

## Finding → source CodeRabbit thread mapping (to resolve on merge)
| Finding | File | Source PR |
|---|---|---|
| 1 | `divergence-traffic.ts` | #55 |
| 2 | `staging-divergence-check.sh` | #55 |
| 3 | `divergence-tapping-producer.ts` | #54 (#241 input pump) |
| 4 | `staging-gauge-probe.test.ts` (schema) | #50 |
| 5 | `staging-gauge-probe.test.ts` (executor) | #50 |

## Lineage
- Source: live CodeRabbit review threads on merged PRs #50/#54/#55 (captured §3.13 post-merge).
- Touches: the #241 fan-out tap loop (finding 3) + the #50 staging-gauge-probe harness (4,5).
- Gate-safe vs #243 (finding 3 cannot false-skip → no false-green). Production store path untouched.
