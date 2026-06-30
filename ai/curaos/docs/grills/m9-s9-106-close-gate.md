# Codex grill — M9-S9 close-gate (curaos-ai-workspace#106)

Cross-harness adversarial review per [[curaos-verification-stack-rule]] Tier-2. Claude implementer → Codex reviewer (read-only, `--sandbox read-only`, model `gpt-5.5`, reasoning effort `medium`). Scope: `curaos/scripts/m9-verify.sh` (the close-gate doctor) + `ai/curaos/docs/m9-close-gate-checklist.md` + `curaos/.dependency-cruiser.cjs`.

> Routing note: the grill was first attempted at `high`/`xhigh` effort with model `gpt-5-codex`. `gpt-5-codex` is **not supported on a ChatGPT-account Codex auth** (`400 invalid_request_error`), and the `gpt-5.5` high/xhigh runs stalled without emitting a verdict. The `gpt-5.5` + `medium` run produced the full verdict below. Model/effort recorded per the Subagent Routing Gate.

## Verdict: APPROVE-WITH-CONDITIONS

The grill confirmed the exit contract is sound (`exit 0` iff `FAIL=0`; `cd … || exit 2`) and found NO genuine user-escalation candidates (all findings carry recommended answers from gate intent + checklist → auto-applied per `curaos_recommendation_auto_apply_rule.md`). It surfaced five real "NOT SOUND" no-false-green gaps + two doc/sweep gaps, all now fixed.

## P0 findings (no-false-green gaps — all FIXED)

1. **PR-containment token match was ambiguous / spoofable**
   - **Where:** `m9-verify.sh` `containment_check` (loose `grep -F "(#NNN)"`).
   - **What:** `(#124)` matches BOTH `43f962c` (healthstack audit-outbox pointer) AND `75bf47d` (unrelated identity bump ending `(#40) (#124)`). A token in any commit subject satisfied the check.
   - **Fix:** rewrote `containment_check` to be **SHA-pinned** — `git merge-base --is-ancestor <exact-sha> origin/main` + local-object-store presence + `Revert "…<sha-prefix>"` guard. Callers pass exact merge SHAs. "Not reverted" is proven jointly by ancestry + the artifact-presence checks ([3]-[9]). Negative-tested: a `deadbeef…` SHA → `FAIL`, exit 1.

2. **All-skipped / zero-test suites false-greened the hard test gates**
   - **Where:** `service_test_check` + the inline M3/contract/E2E/codegen checks required exit 0 + `0 fail` but NOT a positive pass count.
   - **What:** a suite that ran 0 tests (or all-skipped) reports `0 fail` and exits 0 → false PASS on a HARD gate.
   - **Fix:** added shared `is_green_test` predicate = exit 0 AND `0 fail` AND `[1-9][0-9]* pass`. Routed all five hard test gates through it. Negative-tested: `0 pass / 0 fail` and `0 pass / 41 skip / 0 fail` both → FAIL.

3. **Terminal-state sweep could exit 0 with `gh` unavailable**
   - **Where:** the gh-missing branch WARN'd and let the gate pass.
   - **What:** terminal-state is an EXPLICIT close-gate requirement; a WARN-and-exit-0 hides an open lane.
   - **Fix:** gh-unavailable now FAILs (hard dependency for this section, by design).

## P1 findings (FIXED)

4. **Terminal-state sweep omitted party/org lanes #100/#101** — the checklist lists them as M9 scaffold lanes. Fixed: loop is now `99 100 101 102 103 104 105 124 161`.
5. **k6 threshold regex ended `…|250`** — passed on any bare `250` (e.g. a comment). Fixed: require the exact literal `p(95)<250` + the `COLD_GATE_METRIC` binding.
6. **`git fetch origin main` failure was silently ignored** — a stale local ref could pass after a remote revert. Kept the fetch (offline = honest no-op) and the SHA-ancestry + object-store-presence check now reports honestly against the refreshed ref.

## P2 findings (acceptable / addressed)

- Doc: checklist run-command from the `curaos/` root is `bash scripts/m9-verify.sh` (the `bash curaos/scripts/m9-verify.sh` form is correct from the workspace root). Both checkouts are the same tree; left as-is with the from-root note.
- Suggested executable self-test mode for `containment_check`: covered by the negative-test evidence recorded in the checklist's no-false-green section + this report (synthetic missing-SHA, revert-subject, all-skipped cases).

## What Claude got right (counter-balance)

1. Exit contract sound — `set -uo pipefail`, `cd … || exit 2`, final `exit 1` iff `FAIL>0` else `0`.
2. The four cluster services' unit tests, the in-process E2E chain, the contract tests, and the dep-cruiser boundary are all **hard-PASS** (`check`, never `warn_check`) — exactly the items a close-gate must not soften.
3. Correct, principled use of `warn_check` ONLY for genuinely operator-driven / bare-checkout-absent items (k6 binary, frozen-lockfile drift, unpopulated submodules, workspace doc scripts) — no false-green by softening a real FAIL.
4. The dep-cruiser cluster-boundary rules (`no-neutral-capability-to-vertical`, `no-cross-service-src-import`, `no-neutral-to-vertical`) are verified both by presence AND by running the canonical `bun run depcruise` gate.

## Resolution

All P0/P1 fixes applied to `curaos/scripts/m9-verify.sh` in the same close-gate PR (no follow-up issues needed — single-file gate hardening). Post-fix run: **PASS: 64, FAIL: 0, WARN: 2** (exit 0). The 2 WARNs are the pre-existing frozen-lockfile drift + the absent k6 binary (operator-driven live run). No user-escalation candidates; nothing escalated.
