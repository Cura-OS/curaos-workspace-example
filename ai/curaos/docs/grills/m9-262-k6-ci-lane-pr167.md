# Grill — curaos#262 wire k6 into a CI lane (login-baseline cold-gate)

> Cross-harness Tier-2 adversarial grill per [[curaos-verification-stack-rule]].
> Reviewer: **Codex** (`gpt-5`-class, `model_reasoning_effort=high`, `--sandbox read-only`).
> Implementer: **Claude Code**. Scope: PLAN grill (run before final implementation per
> one-task-execution-prompt §4), against the worktree at `/tmp/curaos-262-k6` (off `origin/main`).
> Issue: your-org/curaos-ai-workspace#262.

## Verdict

**APPROVE-WITH-CONDITIONS.** No critical (P0) blocker, no user-escalation needed. Codex confirmed the
design direction is sound and the sync checker is currently clean, but flagged several correctness
conditions on the local-gate semantics. All conditions were auto-applied (recommendations grounded in
the repo files, per [[curaos-recommendation-auto-apply-rule]]).

## Findings + resolutions

### F1 (CORRECTNESS — auto-applied) — `blocking:true perf-soak + run: + local: skip` is WRONG
Codex: `local: skip` is implemented ONLY for `uses:` steps; for a `run:` step it is IGNORED, so a
`blocking:true` config job with `run: <cmd>` + `local: skip` would actually RUN the command locally
and (k6/service absent) hard-FAIL the local merge gate — a false-red. Cite:
`scripts/ci-local.sh:453,481`.
**Resolution:** REJECTED the `blocking:true`+`local:skip` shape. `perf-soak` is `blocking:false` in
`ci-gates.yaml`; its wrapper `scripts/perf-soak-ci.sh` WARN-SKIPs (exit non-zero → WARN) when no
service is reachable. The HARD cold-gate is k6's own non-zero exit INSIDE the `perf-soak.yml` lane
(where the service IS booted). Verified: real `ci-local.sh` run records
`WARN [D] perf-soak: Run k6 login cold-gate soak (non-blocking, rc=1)`.

### F2 (CORRECTNESS — auto-applied) — a no-op wrapper must NOT exit 0 (false-green smoke)
Codex: if the wrapper exits 0 when k6 is absent, `ci-local.sh` records PASS, not WARN — reading as
"smoke passed" when it never ran. Cite: `scripts/ci-local.sh:239,247`.
**Resolution:** both wrappers `exit 1` (non-zero) on a no-op (k6 / scenario / service absent). Under
`blocking:false` that surfaces as WARN (never PASS, never FAIL). Verified in the runner output.

### F3 (SYNC — auto-applied) — new gate workflow must map from `ci-gates.yaml` or sync breaks
Codex: an unmapped gate workflow with run/uses steps fails the checker; a config job mapping to a
missing workflow file also fails. Cite: `scripts/check-ci-gates-sync.js:327,489`. `grafana/setup-k6-action`
is NOT in the setup-action ignore prefixes, so it must be in config or `cloud-only.uses`; every
workflow-only run step needs a 12-hex `sha` cloud-only entry (name alone does not exempt). Cite:
`check-ci-gates-sync.js:122,418`.
**Resolution:** `perf-soak` config job carries `workflow: perf-soak.yml` + `partial-mirror: true`; the
shared `run: bash scripts/perf-soak-ci.sh` appears verbatim on both sides; the k6-install action is a
`cloud-only.uses` pin and the boot/teardown run steps are `cloud-only.sha` entries
(`ca2de27449d2`, `64896eea492b`, computed via the checker's own `sigSha(normRun(...))`).
**Verified:** `node scripts/check-ci-gates-sync.js` → `10 check(s) in sync, 0 problem(s)`, exit 0;
`perf-soak.yml: 1 run + 0 uses + 0 svc in sync (full signature)`.

### F4 (SYNC — auto-applied) — `blocking:false` ↔ `continue-on-error:true` per shared gate
Implicit from the checker's per-gate blocking comparison: config `blocking:false` must mirror a
workflow `continue-on-error:true` on the shared `run:` gate, else a `blocking/continue-on-error
mismatch` DRIFT. **Resolution:** added job-level `continue-on-error: true` to `perf-soak.yml`
(mirroring cosign-verify.yml's `blocking:false` smoke). The breached cold-gate STEP is still reported
FAILED (red) + the JSON/p95 artifact captured; the job flag keeps the manual-dispatch workflow result
green (the merge gate is the LOCAL evidence per [[curaos-local-ci-first-rule]], not this dispatch lane).

### F5 (DOC — auto-applied) — operator-driven-only docs now stale
Codex: `scripts/m9-verify.sh:232` + the runbook "CI note" document k6 as operator-driven-only.
**Resolution:** updated `m9-verify.sh` (comment + 6 new presence checks for the perf wiring) and the
runbook `ai/curaos/.../runbooks/perf-login-baseline.md` "CI note" to document the SMOKE + SOAK lanes.

### F6 (COMMAND-REUSE — auto-applied) — prefer the existing baseline contract, not a raw `k6 run`
Codex: root docs already define the hard-gate exit-code contract; prefer the existing wrapper/recipe
semantics over a divergent raw `k6 run`. Cite: `justfile:101,108`.
**Resolution:** the SOAK wrapper REUSES the existing `login-baseline.ts` scenario + its
`COLD_GATE_METRIC`/`p(95)<250` threshold (no new threshold invented); `just perf-soak`/`just perf-smoke`
recipes added next to `just identity-login-baseline`. The smoke deliberately reduces rate/duration +
disables warm/burst so it is a fast investigative run, not the 1000-VU cold gate.

## Non-issues / clarifications confirmed

- **Glossary**: `perf-smoke` stays WARN/smoke language (`blocking:false` = non-gating by contract);
  the cold gate is only ever the SOAK. `local-only:true` = excluded from workflow drift comparison.
- **Submodule empty locally**: the `backend/services/identity-service` submodule is unpopulated in a
  bare worktree; both wrappers tolerate that (scenario-presence check → WARN-SKIP). The GH lane
  checks out `submodules: recursive`.
- **No user-escalation candidates** — every flagged point had a repo-grounded recommendation, all
  auto-applied; none irreversible/destructive/T3 or unapproved-scope.

## Reviewer command

```
codex exec -c model_reasoning_effort="high" --cd "$PWD" --sandbox read-only \
  --output-last-message /tmp/curaos-262-grill.md "<plan + issue grill prompt>"
```
Tokens used: ~157k. Session id `019e83a7-d6ff-71e3-8653-8452473f2ce0`.
