# Codex grill — M9-S8 login baseline (curaos-ai-workspace#105)

> Opposite-harness adversarial PLANNING grill (Claude → Codex), read-only.
> Harness: `codex exec` (gpt-5.1 default), `model_reasoning_effort=high`, `--sandbox read-only`.
> Date: 2026-06-01 · Scope: pre-implementation plan for issue #105.
> PR: _(to be appended when opened — re-grill of the PR diff appends below)._

## Verdict: APPROVE-WITH-CONDITIONS (all conditions resolved in the landed change)

The grill surfaced no blockers to the approach (k6 `constant-arrival-rate`, cold/warm/burst,
DPoP reuse-by-import) but flagged real correctness + glossary defects. All were resolved before
commit; none required user escalation (every escalation candidate had a doc/code-backed
recommendation → auto-applied per [[curaos-recommendation-auto-apply-rule]]).

## Findings + resolution

| # | Finding | Resolution |
|---|---|---|
| 1 | CAR config must use `rate/timeUnit/preAllocatedVUs>=rate/maxVUs` + no `sleep()` | Applied verbatim: `rate:1000 timeUnit:'1s' preAllocatedVUs:max(env,rate) maxVUs:ceil(pre*1.5)`, `sleep` removed (unit-tested in `login-baseline-config.test.ts`). |
| 2 | Latency-only gate can false-green a fast-failing run | Added HARD validity gates `dropped_iterations: count==0` + `checks: rate>0.99` alongside the cold `p(95)<250`. |
| 3 | "Warm = Valkey opaque-token + DPoP-replay cache priming" conflicts with code: lockout + DPoP replay are IN-MEMORY defaults in this shell (README "Storage boundary note") | Reworded driver comments + runbook: warm = process/DB/refresh-session working set, NOT a pre-claimed replay entry. |
| 4 | Warm priming must use FRESH DPoP proofs (reused `{jkt,jti}` → `DpopReplayStore` rejects) | Confirmed `signDpopProof` mints a fresh `jti` per call; documented the invariant in setup() comment + research §4. |
| 5 | Tenant resolves from body `tenantSlug` only; `Host` only builds DPoP `htu` | Corrected glossary in research §5 + runbook; driver already sends body `tenantSlug`. |
| 6 | "SLO" overloaded (SAML Single Logout vs Service Level Objective) | Runbook spells out "Service Level Objective". |
| 7 | "root justfile" = `curaos/justfile`, not workspace root | Recipe `identity-login-baseline` added to `curaos/justfile` (parent repo), delegating to a submodule script — matches the existing `staging-divergence-check` pattern. |
| 8 | Results dir must exist before `handleSummary` writes | `ops/perf/identity-service/results/.gitkeep` added; wrapper `mkdir -p`s it; `*.json` gitignored. |
| 9 | Mandatory research artifact missing | Written: `research/2026-06-01-m9-s8-login-baseline-research.md`. |
| 10 | k6-free config helper needed for `bun test` (k6 imports don't resolve) | `login-baseline-config.ts` + 14-test suite (mirrors the divergence-traffic-guards split). |

## Escalation candidates (§7) — all resolved by recommendation, NOT escalated

- **1000 arrivals/sec vs in-flight concurrency** → issue + orchestrator bindingly name
  `constant-arrival-rate` at rate 1000/s. Interpretation documented (research §1, §3). Auto-applied.
- **Add DPoP-replay/lockout Valkey adapters?** → NO; the plan must not imply they exist. Reworded
  to the in-memory reality. No new adapters (out of scope). Auto-applied.
- **Reference load environment** → recorded as an operator requirement in the runbook; the gate is
  documented as environment-dependent. No real run executed here. Auto-applied.
- **`login-baseline.ts` named exception vs canonical `soak.ts`** → orchestrator + issue bindingly
  name `login-baseline.ts` under `ops/perf/identity-service/`. Kept; documented as the named
  baseline scenario alongside the smoke/soak convention. Auto-applied.

## Grill output (verbatim): `/tmp/curaos-opposite-grill-105.md` (session-local).
