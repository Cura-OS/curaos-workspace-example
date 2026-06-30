FAIL

P1 scripts/review-policies.ts:129
BREAK: `if (raw.includes(EM_DASH) || raw.includes(EN_DASH)) {` only checks U+2014 and U+2013; probe proved added U+2012, U+2015, and U+2212 produce 0 findings, and the blocking tree gate mirrors the same two-codepoint class at `scripts/em-dash-gate.sh:42`.
FIX: Define one shared banned-codepoint set for both dash gates, include U+2012/U+2013/U+2014/U+2015/U+2212 if that is the policy, and add tests for each codepoint.

P1 scripts/review-policies.ts:207
BREAK: ``const moduleDir = `${segs[0]}/${segs[1]}`;`` truncates `backend/services/new-service/src/main.ts` to `backend/services`, so a new service without `ai/curaos/backend/services/new-service` returns no finding; detected hits are only `warn` at `scripts/review-policies.ts:211`.
FIX: Resolve mirror roots by repo shape (`backend/services/<name>`, `backend/packages/<name>`, `frontend/apps/<name>`, `frontend/packages/<name>`, `ops/<area>`) and make missing mirrors fail, or call the workspace `scripts/check-ai-mirror.sh` as a blocking gate.

P1 scripts/review-policies.ts:272
BREAK: `if (!baseRef) {` returns only a message finding, so when `origin/main` and `main` are absent the blocking `danger-policy` skips all diff-scoped checks and `run-review-policies.ts` exits 0.
FIX: Treat missing base as fail in the merge-gate runner, or have `ci-local.sh` pass a resolved base and fail closed when absent; reserve message-only degradation for non-blocking PR comments.

P2 scripts/review-policies.ts:161
BREAK: `if (srcMode === '160000' || dstMode === '160000') {` asserts only that a gitlink changed; stale or unbumped pointers with no gitlink diff are not evaluated, while every legitimate gitlink bump is failed with no evidence escape hatch.
FIX: Split freshness and approval: fail when `.gitmodules`, gitlink entries, or submodule working tree state disagree, and allow intentional pointer bumps only when the target commit is reachable and paired evidence is present.

P2 scripts/review-stack.sh:106
BREAK: `semgrep --baseline-commit "${base}" --config "${config}" || true` makes runtime errors exit 0; observed `ca-certs: empty trust anchors` still printed "semgrep-diff complete", so `ci-local.sh` would record PASS, not WARN.
FIX: Capture semgrep rc and output; exit 1 for tool, config, baseline, or runtime errors, and exit 0 only after a completed scan while keeping findings advisory.

Rationale: FAIL because the local merge gate has P1 false-pass holes: broader dash codepoints pass, ai mirror violations can pass by path truncation and warning severity, and missing base refs skip every diff-scoped policy while the blocking job exits 0. I confirmed `danger-policy` is blocking when fail findings exist (`ci-gates.yaml` marks it blocking and `ci-local.sh` flips `OVERALL_RC`), the runner and Dangerfile share `runPolicies`, `check-ci-gates-sync.js` passes for mirrored workflows, this PR's diff has zero banned dash/trailer characters, and the sole commit subject is `feat(ci): layered local review stack replacing CodeRabbit`; those do not offset the false-pass holes above.

## Re-grill verification (2026-06-14, post-fix)

VERDICT: all three P1 false-pass holes closed. Commit `0167c0d` on `feat/review-stack-705` (pushed `ef73e00..0167c0d`).

P1-1 (dash policy too narrow): FIXED. `scripts/review-policies.ts` now bans the full long-dash family via `BANNED_DASH_CODEPOINTS = [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0x2E3A, 0x2E3B]` and a shared `hasBannedDash()` helper, replacing the 2-codepoint `EM_DASH || EN_DASH` check. ASCII hyphen-minus (U+002D) stays the sanctioned replacement and is NOT banned. Proof: a diff carrying U+2012 + U+2015 + U+2212 now yields 3 `fail` findings (was 0). Regression: one test per banned codepoint (`checkNoDashesOnDiff catches banned codepoint U+XXXX`) plus a set-membership assertion for the three glyphs the grill proved escaped, plus an assertion that U+002D is allowed. The canonical `scripts/em-dash-gate.sh` shares the same 2-codepoint narrowness but is OUTSIDE #705 owned paths; not edited here; convergence filed as foresight curaos-ai-workspace#709.

P1-2 (mirror parity false-pass): FIXED. New `mirrorModuleRoot()` resolves the real module leaf by repo shape (backend/services/<name>, backend/packages/<name>, frontend/apps/<name>, frontend/packages/<name>, ops/<area>, tools/<area>) instead of the `<root>/<type>` truncation that always existed. A missing `ai/curaos` mirror is now a BLOCKING `fail` (was `warn`), and the diff-failure path fails closed. Proof: a new `backend/services/new-svc/src/main.ts` with no mirror yields 1 `fail` (was a false-pass). Regression: missing-mirror fails, present-mirror passes, plus `mirrorModuleRoot` shape table.

P1-3 (missing base-ref skips everything): FIXED. The merge-gate runner `scripts/run-review-policies.ts` now fails closed (exit 1) when neither origin/main nor main nor an explicit `--base` resolves; message-only degradation is gated behind a new `--allow-missing-base` flag reserved for the non-blocking PR-comment path. `ci-local.sh` threads its active `--base` into the runner command. Proof: a repo with default branch `work` (no origin/main, no main) exits the runner with code 1 (was 0). Regression: missing base exits non-zero, `--allow-missing-base` degrades to 0, real dash violation with a resolvable base exits non-zero, clean diff with a resolvable base exits 0.

Evidence:
- `bun test scripts/review-policies.test.ts` => 31 pass, 0 fail (13 prior + 18 new regressions).
- `node scripts/check-ci-gates-sync.js` => 10 checks in sync, 0 problems.
- `bash scripts/ci-local.sh --tier B` => `danger-policy` step PASS (runs `bun scripts/run-review-policies.ts --base origin/main`, threaded by ci-local.sh). Other tier-B FAILs (install frozen-lockfile, typecheck/depcruise/aggregate rc=127) are the pre-existing sparse submodule-less worktree state (deps + submodules not installed), not regressions from this fix.

The Dangerfile.ts shared-module signature is unchanged; it still consumes `runPolicies()` and renders the (now-broader) findings via danger's fail/warn/message.
