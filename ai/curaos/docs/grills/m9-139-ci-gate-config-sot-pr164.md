# Codex grill — m9-139 CI gate-config SoT (curaos#139)

- **Issue:** [your-org/curaos#139](https://github.com/your-org/curaos/issues/139)
- **Branch:** `agent/fix-ci-gate-config-sot-139`
- **Reviewer harness:** Codex (opposite-harness adversarial code grill), default account model `gpt-5.5` (note: `gpt-5` and `gpt-5-codex` are NOT supported on this ChatGPT account — confirmed via 400 `invalid_request_error` probes; the default model resolves to `gpt-5.5`), `model_reasoning_effort=high`, `--sandbox read-only`.
- **Scope under review:** `scripts/check-ci-gates-sync.js`, `scripts/ci-local.sh`, `scripts/check-ci-gates-sync.test.js` (working-tree diff vs `origin/main`).
- **Verdict:** `APPROVE-WITH-CONDITIONS` — the 3 core fixes are correct; the grill surfaced 2 residual false-negatives + 1 env-leak risk + 1 weak regression test. ALL FOUR addressed in the same PR (see Implementer resolution).

## Reviewer output (verbatim)

> 1. Correctness bugs:
> - Residual false negative: `localSkipUses` is still keyed only by normalized action pin. If one config occurrence of `uses:x` is explicit `local: skip` and another occurrence of same `uses:x` is an ordinary gate, line 462 skips the cross-side blocking comparison for both. Cite: `scripts/check-ci-gates-sync.js:447-462`.
> - Residual false negative: markdown guard proves only that `BASE_REF` resolves, not that `git diff "${BASE_REF}"...HEAD` succeeds. Valid ref with no merge-base/shallow missing base can still make diff fail, stderr is suppressed, and the job can skip as "no md changes." Cite: `scripts/ci-local.sh:391-400`.
>
> 2. Env-var path overrides:
> - Yes, production risk if these env vars can leak into a real gate run. `CI_GATES_CONFIG`, `CI_GATES_WF_DIR`, `CI_GATES_CILOCAL` can redirect the checker to synthetic files; `CI_GATES_CILOCAL` only needs to contain the string `ci-gates.yaml` to satisfy the config-driven check. Cite: `scripts/check-ci-gates-sync.js:52-54`, `scripts/check-ci-gates-sync.js:263-274`, `scripts/check-ci-gates-sync.test.js:54-61`.
>
> 3. `divergent` reduction:
> - Mostly correct. `occurrences` preserves per-job copies, `divergent` reports intra-side mixed blocking states, and `nonBlocking = anyNonBlocking` keeps the existing cross-side comparison deterministic. Cite: `scripts/check-ci-gates-sync.js:167-170`, `scripts/check-ci-gates-sync.js:222-239`, `scripts/check-ci-gates-sync.js:460-468`.
> - Caveat is the `localSkipUses` key-wide exemption above; that can still bypass cross-side comparison for mixed skip/non-skip occurrences of same `uses:` key.
>
> 4. Valid base with no md changes:
> - Guard avoids false-failing that case: resolvable base passes `rev-parse`, then no md changes falls through to skip. Cite: `scripts/ci-local.sh:391-400`, `scripts/check-ci-gates-sync.test.js:222-227`.
>
> 5. Tests that pass both old and new:
> - `an EXPLICIT local: skip uses step IS still exempted`: old also exempted explicit `local: skip`. Cite: `scripts/check-ci-gates-sync.test.js:114-127`.
> - `uniform blocking across jobs does NOT falsely report divergence`: old had no divergent report either. Cite: `scripts/check-ci-gates-sync.test.js:176-197`.
> - `a resolvable --base does NOT trigger the fail-closed guard`: old had no guard, so no guard failure. Cite: `scripts/check-ci-gates-sync.test.js:222-227`.
> - Weak regression: finding-2 positive test is not the exact old false-green. With non-blocking occurrence last, old last-write-wins would already produce cross-side mismatch; it only lacks the new `divergent` wording. Cite: `scripts/check-ci-gates-sync.test.js:150-171`.

## Implementer resolution (all four addressed, same PR)

1. **Residual finding-1 (mixed skip/ordinary key collapse)** — FIXED. `localSkipUses` now pairs with an `ordinaryUses` set; a `uses:` key is exempt from the cross-side blocking comparison ONLY when it is cloud-only on EVERY config occurrence (`localSkipUses.has(key) && !ordinaryUses.has(key)`). A key that is `local: skip` in one job and an ordinary gate in another is no longer exempt. New regression test `mixed skip + ordinary occurrence of the SAME action is NOT key-wide exempted` (RED on old logic, GREEN on new). `scripts/check-ci-gates-sync.js` localSkipUses/ordinaryUses block.

2. **Residual finding-3 (diff command failure, not just ref resolution)** — FIXED. The markdown guard now captures `git diff "${BASE_REF}"...HEAD` with its exit status (`base_diff_rc`) and fails closed (HARD FAILURE + `OVERALL_RC=1`) when the diff command itself errors (shallow clone / missing merge-base), not only when `rev-parse` fails. Empty output is trusted ONLY when the diff succeeded. `scripts/ci-local.sh` markdown-changed case.

3. **Env-var override leak risk** — FIXED. The three path overrides are now gated behind an explicit `CI_GATES_SELFTEST=1` opt-in. A stray `CI_GATES_*` env var can no longer redirect a real gate run — verified: `CI_GATES_CONFIG=/tmp/bogus.yaml node scripts/check-ci-gates-sync.js` (without the opt-in) still reads the repo's own config and reports `9 in sync, 0 problems`. The test harness sets `CI_GATES_SELFTEST=1`. `scripts/check-ci-gates-sync.js` selftest gate.

4. **Weak finding-2 regression test** — FIXED. Restructured the finding-2 fixture so the config declares the gate `blocking:false` and the workflow lists a blocking copy FIRST then a `continue-on-error:true` copy. Under the OLD last-write-wins flattening the workflow-side `nonBlocking` collapsed to `true`, matching the config → cross-side comparison read "in sync" (a genuine false green). Only the new `divergent` check now catches it. Added a `regression guard` assertion confirming the cross-side mismatch problem does NOT fire (so the divergence problem is the sole catcher). `scripts/check-ci-gates-sync.test.js` finding-2 block.

## What the grill confirmed correct (counter-balance)

- The `divergent` reduction (`occurrences` per-job + `anyNonBlocking` + distinct-set) is correct and keeps the existing cross-side `nonBlocking` comparison deterministic.
- The fail-closed guard does NOT false-fail a valid base with no markdown changes (resolvable ref → falls through to legitimate skip).
- The core finding-1 fix (`local === 'skip'` only) correctly stops exempting ordinary `uses:` gates.

## Regression evidence (RED → GREEN)

On `origin/main` source (old logic), the 4 detection tests are RED; the 4 behavior-unchanged guards are GREEN (they assert no-change-from-old). On the fixed source all 8 pass.

```
old logic: 4 fail / 4 pass
  (fail) finding 1 > ordinary uses step (no local hint) is NOT exempted
  (fail) finding 1 > mixed skip + ordinary occurrence of the SAME action is NOT key-wide exempted
  (fail) finding 2 > same gate, divergent continue-on-error across jobs IS detected
  (fail) finding 3 > a typoed --base hard-fails the docs gate (does NOT skip it)
fixed logic: 8 pass / 0 fail
```

## See also

- [[curaos-verification-stack-rule]] — 3-tier verification (T1 auto / T2 PR / T3 HITL)
- [[curaos-local-ci-first-rule]] — local `just ci` is the merge gate; GH auto-CI off
