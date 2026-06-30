# Grill: m16 workflow-speedup (#706) PR #708

Cross-harness Tier-2 adversarial grill of the grill/workflow speedup PR (issue #706, PR #708)
against [[curaos-verification-stack-rule]]. The speedup landed real wins (bounded poll, exhaustive
first grill, affected-scoped CI, parity manifest) but the grill-gate SOUNDNESS regressions below make
a weakened gate that can wave a stale or unproven verdict through to merge. A weakened grill gate is
worse than a slow one.

GRILL: opposite-harness (Codex adversary)
GRILL-VERDICT: BLOCK

## Findings

### P1-1 (MUST FIX) - grill cache key not head-bound

`scripts/workflows/opposite-harness-grill.workflow.js` built `cacheKey` from
`${cfg.pr}|${diffCmd}|${dimensionLabel}`, but `grillCacheKey(headSha, ...)` and the docs claim the
key binds `(head_sha, prompt-template-hash, cache_bust)`. The PR ref never changes across commits on
one PR, so a second commit on the SAME PR hits the same cache entry and reuses a stale PASS.

### P1-2 (MUST FIX) - post-regrill stale local-gate

`scripts/workflows/pr-verify-merge.workflow.js`: `checksGreen` was computed BEFORE the re-grill fix
worker commits+pushes; the post-loop merge decision reused that stale value. A fix commit that BREAKS
the local gate could still reach `merge-ok` if the delta grill passes and the SHA matches.
`milestone-wave.workflow.js` already deferred a re-grilled lane; `pr-verify-merge` did not.

### P1-3 (MUST FIX) - delta re-grill drops prior findings

`pr-verify-merge.workflow.js`: the delta re-grill changed `subject` (forking a fresh report file),
passed no stable `report_path`, and fed no prior findings to the verifier. A delta-only pass could
REPLACE unresolved full-review findings.

### P1-4 (MUST FIX) - parallel fan-in first-SHA + swallowed errored dimension

`opposite-harness-grill.workflow.js`: `consensusSha = dimResults.map(...).find(Boolean)` took the
FIRST valid SHA, so mixed-head dimension reviews aggregated under one SHA. An errored dimension could
also be folded toward a pass.

### P2 (FIX) - dedup key too coarse

`opposite-harness-grill.workflow.js`: the dedup key `severity::title` collapsed distinct findings
sharing a severity+title but pointing at different evidence/location, dropping a real second issue.

### P3 (FIX) - literal em dash

`scripts/opposite-harness-grill.test.sh:41` carried one literal U+2014 em dash in a comment, against
[[curaos-no-em-dash-rule]].

## Re-grill verification (2026-06-14, post-fix)

GRILL: opposite-harness (re-grill)
GRILL-VERDICT: APPROVE

All six findings fixed with a real per-fix contract assertion each; the four named RED demonstrations
(cache-key P1-1, stale-gate P1-2, plus P1-3 and P1-4) were confirmed to FAIL against the pre-fix
workflow sources and to pass with the fix. The headline stale-report freshness guard is unchanged
(kept). Verification: 96/96 `node --test scripts/workflow-truth-contract.test.js`, 149/149 bun test,
workflow-sync 20/20, portability clean, grill test.sh ok, zero em/en dashes across the diff.

- **P1-1 head-bound cache key.** Added `resolveHeadSha(verifiedShaCmd)` (runs the same head-pin
  command the adversary uses, normalizes to 40-hex) and resolve it BEFORE the key; the call site now
  passes `resolvedHeadSha` (not `cfg.pr`) into `grillCacheKey`, with the dimension label moved into
  the `cache_bust` component. Assertion: `opposite harness grill cache key is head-bound, not
  PR-bound (#706 P1-1)` - executes `resolveHeadSha` + `grillCacheKey` and proves two commits on one
  PR yield distinct keys; a MUTANT shows the old PR-ref key collides. RED pre-fix confirmed.

- **P1-2 post-regrill stale-gate defer.** `pr-verify-merge` now mirrors `milestone-wave`:
  `if (regrillCycles > 0 && verdict === "merge-ok") verdict = "changes-requested";`. A re-grilled
  lane never merges on the pre-loop `checksGreen`/head snapshot. Assertion: `pr-verify-merge defers a
  re-grilled lane instead of merging the stale gate snapshot (#706 P1-2)` - runs the real body to
  `changes-requested` + `merged:false`, with a MUTANT (guard stripped) reaching `merge-ok`. RED
  pre-fix confirmed.

- **P1-3 delta re-grill carries prior findings.** Stable `report_path` across all cycles (append,
  never fork), `prior_findings` threaded into each re-grill, new grill input `prior_findings` +
  output `unresolved_findings`, and an executor backstop `mergeUnresolvedFindings` that folds any
  un-re-asserted prior finding forward unless the verdict is pass/block. Mirrored into
  `milestone-wave`. Assertions: `opposite harness grill carries unresolved prior findings across a
  clean delta (#706 P1-3)` (executes `mergeUnresolvedFindings`) plus the both-paths source pins and
  the e2e `prior_findings`/stable-`report_path` checks. RED pre-fix confirmed.

- **P1-4 fan-in consensus sha + errored dimension blocks.** New `fanInConsensusSha` requires ALL
  dimensions to return the SAME 40-hex head sha (divergent or missing => fail-closed BLOCK), and the
  fan-out blocks any dimension that errored or returned no recognized verdict (never folded into a
  pass). Assertions: `opposite harness grill fan-out blocks divergent or missing dimension shas
  (#706 P1-4)` (executes `fanInConsensusSha`) + `opposite harness grill fan-out fails closed on
  errored or divergent dimension (#706 P1-4)` (drives the real fan-out body). RED pre-fix confirmed.

- **P2 location-aware dedup key.** The dedup key now includes a `grillFindingEvidenceKey` hash over
  `location`/`path`/`line` (falling back to `evidence`), so same-title-different-location findings
  both survive while a true duplicate still collapses. Assertion extends `opposite harness grill
  fan-in dedups + ranks parallel dimensions (#706 P5a)` with the two-survive + same-location-collapse
  cases.

- **P3 em dash.** Replaced the U+2014 in `opposite-harness-grill.test.sh:41` with a hyphen; a
  node-based scan over the whole PR diff (committed + working tree) reports zero U+2014/U+2013.

## Re-grill verification (2026-06-14, post-fix 1e518d68)

GRILL: opposite-harness fallback (same-harness adversarial reviewer per [[curaos-verification-stack-rule]] §3.7 allow_same_harness_fallback; codex async path is the subject under fix so it is not self-grilled here)
GRILL-VERDICT: PASS (all 4 P1 + P2 + P3 CLOSED)

Each hole closed with a traceable code path AND an executed mutant-tested assertion (79/79 truth-contract green, grill shell test passes, zero em/en dashes in changed files):

- P1-1 cache key head-binding: CLOSED. `grillCacheKey(resolvedHeadSha, ...)` keys on the real head (gh pr view headRefOid / git rev-parse HEAD), normalized to 40-hex; `cfg.pr` removed from the key. Two commits on one PR yield two distinct keys; the PR-bound mutant collides (proves head-binding load-bearing).
- P1-2 post-regrill stale local-gate: CLOSED. `if (regrillCycles > 0 && verdict === "merge-ok") verdict = "changes-requested"` fires after the loop for any re-grilled lane; SHA-binding snapshot rebinds to fresh head. Guard-stripped mutant reaches merge-ok+merged (proves guard necessary). Mirrored in milestone-wave l.1169.
- P1-3 delta re-grill keeps report_path + carries prior findings: CLOSED. Single pinned `report_path` (append never fork); `carriedFindings` union across cycles; `mergeUnresolvedFindings` backstop folds un-re-asserted priors into unresolved on issues-found. A finding cannot vanish across cycles.
- P1-4 consensus single shared head: CLOSED. `fanInConsensusSha` blocks on empty / missing-or-non-40hex / >1 unique sha; returns sha only when all dimensions share one. First-valid `.find(Boolean)` removed.
- P2 dedup key: CLOSED. key now `severity::what::evidenceKey(location|path|line|file)`; same-title-different-location findings stay separate.
- P3 em-dash in test comment: CLOSED. replaced with hyphen; zero U+2014/U+2013 in changed files.

Residual (non-blocking, by-design): a re-grilled PR always needs a second pr-verify-merge pass to merge (the defer is intentional; next pass re-reads checksGreen against fresh head). gh-flakiness yields empty-sha cache key (fail-safe miss, perf not soundness).
