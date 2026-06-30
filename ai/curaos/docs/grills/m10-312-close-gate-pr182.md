# Cross-harness grill — M10 close-gate (#312) `m10-verify.sh`

> Reviewer: **Codex** (gpt-5 default, reasoning effort high), read-only, `--sandbox read-only`.
> Subject: `curaos/scripts/m10-verify.sh` (M10 Platform Shared Services + SDK Packages close-gate doctor).
> Implementer: Claude (this worker). Date: 2026-06-02.
> Focus per task: (a) does the gate FAIL when it should (no false-green)? (b) is the PASS-vs-WARN split honest (build-completeness items PASS-gated, operator-driven items WARN)?

## Verdict (initial): **BLOCK**

> "BLOCK — hard build-completeness proof can degrade to WARN and still exit 0."

## Findings + resolution

| # | Codex finding | Severity | Resolution |
|---|---|---|---|
| 1 | SDK missing `package.json` → WARN; `FAIL=0` can still exit 0 (`sdk_typecheck_check`) | **Critical (false-green)** | **FIXED.** SDKs are first-party workspace packages (committed, NOT submodules) — present in every checkout. Absent `package.json` is now a hard **FAIL** ("first-party SDK package absent … cannot be deferred"). Negative-tested: breaking the dir var → 7× FAIL, exit 1. |
| 2 | Service missing `package.json` skips the hard `src/` + `specs/*.tsp` checks and WARNs | **Critical (false-green)** | **FIXED.** The `src/` + `specs/<name>.tsp` checks now run **unconditionally** (hard `check`, outside the population guard). An uninitialized service submodule → those checks FAIL **plus** an explicit "submodule not populated … close-gate cannot certify" FAIL. Negative-tested: → FAIL, exit 1. |
| 3 | Integration harness missing `package.json` skips the green in-process test and WARNs | **Critical (false-green)** | **FIXED.** The harness is a first-party in-repo workspace package — absent `package.json` is now a hard **FAIL** ("the cross-service integration harness (#285) is a hard M10 deliverable, cannot be deferred"). |
| 4 | Unanchored/token greps — a comment could satisfy barrel-export / OpenSLO checks | **Major** | **FIXED.** Barrel-export greps anchored to line-leading `^export \* from './rest'` + `^export \{ client \}` (a commented `// export { client }` no longer matches — negative-tested). OpenSLO grep anchored to `^apiVersion: openslo/v1` (a `# apiVersion:` comment no longer matches). `.gitmodules` registration grep left token-based (a `.gitmodules` line is `path = backend/services/<svc>` — a comment can't form a registered submodule). |
| 5 | `git fetch origin main \|\| true` swallows fetch failure → containment can judge against stale `origin/main` | Minor (by-design) | **ACCEPTED as m9-parity, documented.** Mirrors `m9-verify.sh` exactly: offline/air-gap = no-op fetch, then `containment_check` runs `git cat-file -e` (FAILs if the SHA is absent from the local object store) + `merge-base --is-ancestor` (exact, cannot match an unrelated commit) + a `Revert …<sha>` scan. A stale `origin/main` cannot false-PASS a pinned ancestor SHA; only a revert pushed AFTER an offline fetch would be missed — the same documented residual m9-verify carries. |
| — | No 0-test / all-skip false-green | (clean) | Confirmed by Codex: `is_green_test` requires exit 0 + `0 fail` + positive pass count. |
| — | Operator-driven items (live cluster, Verdaccio #307, real k6 soak, real-infra integration) correctly WARN | (clean) | Confirmed by Codex: none wrongly hard-FAIL'd. |

## No-false-green proof (post-fix, negative-tested)

| Negative test | Expected | Observed |
|---|---|---|
| Containment SHA replaced with `deadbeef…` | FAIL, exit 1 | ✅ FAIL:1, exit 1 ("commit deadbeef… not present in local object store") |
| `specs/<name>.tsp` → `specs/<name>.NOPE.tsp` | FAIL, exit 1 | ✅ FAIL:64, exit 1 |
| OPEN story (#287) added to the terminal range | FAIL, exit 1 | ✅ "#287 NOT closed (state=OPEN)", exit 1 |
| Absent SDK `package.json` (post-fix) | FAIL, exit 1 | ✅ 7× FAIL, exit 1 |
| Unpopulated service submodule (post-fix) | FAIL, exit 1 | ✅ 7× FAIL, exit 1 |
| Commented `// export { client }` vs anchored grep | rejected | ✅ "anchored-grep-correctly-rejects-comment" |

## Post-fix close-gate run

`bash curaos/scripts/m10-verify.sh` (populated workspace checkout) → **PASS: 127, FAIL: 0, WARN: 4** (exit 0). The 4 WARNs are exactly the 4 operator-driven residuals; no build-completeness item is WARN.

## Verdict (post-fix): **APPROVE**

All three false-green vectors Codex flagged (unpopulated SDK / service / harness degrading to WARN) are now hard FAIL; the comment-matching greps are anchored. The build-completeness items are PASS-or-FAIL; only the genuinely operator-driven items are WARN. The split is honest and the gate is not a false-green.
