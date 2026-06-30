# Grill — M15-S517-A GA install-from-scratch E2E harness (curaos PR pending)

Subject: `ops/ga-acceptance/ga-install-from-scratch.sh` + `ga-install-from-scratch.test.ts` + `README.md` (#517-A authorable artifact).

## Opposite-harness leg: BLOCKED

```markdown
GRILL: blocked-harness-unavailable
GRILL-PROBE: codex probe returned "OK" but exceeded the 18s default alarm on cold start (probe exited 142); on retry with probe_timeout_ms=60000 the codex:codex-rescue agent returned verdict=pass with 12 tokens and an EMPTY report_path (short-circuit), so the workflow recorded workflow_defect=opposite-harness-report-missing.
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: workflow-defect (codex rescue short-circuited without writing the report — session-23 #508 class: codex CLI stub returns pass-without-work). Two bounded retries; both non-conforming.
```

Per `ai/rules/curaos_verification_stack_rule.md`, the T2 opposite-harness leg is recorded as a **blocked adversarial leg**, NOT as completed review. The merge gate must not treat this as a clean grill; CodeRabbit on the PR is the remaining automated adversarial reviewer for this change.

## Authoring-harness adversarial self-review (Claude, high effort)

Because the opposite-harness path is a known workflow-defect, I ran the adversary checklist against my own change. The design survived; findings below are the trade-offs I confirmed are intentional and documented.

## Verdict: PASS (with the opposite-harness leg explicitly blocked)

### P0 findings (block merge)
None.

### P1 findings (must address before merge)
None confirmed. Candidates I tried to break and resolved:

1. **Reuse drift with #330** — Tried: re-implement the jq leak filters locally for speed. Rejected — `assert_zero_egress_clean` shells out to the reused `scripts/assert-zero-egress.sh --analyze-only`, and the test asserts the harness source does NOT contain `reserved:world` (a duplicated-filter sentinel). So the two cannot silently diverge. OK.
2. **Submodule-pointer race** — `curaos-deploy/bundles/bundle.sh` is NOT yet present at `curaos` `origin/main` (the #512 pointer bump is pending). Tried: have the harness read/validate it at plan time → would make the bun test fail in a clean checkout. Rejected — presence is checked ONLY on the live (non-dry-run) path (`die 3` if absent), so `--dry-run`/`--plan-only` (the CI-tested modes) pass regardless of pointer state. OK.
3. **#256 file collision** — Confirmed the change adds only `ops/ga-acceptance/*` and touches NONE of `ops/zarf/values/values-demo.yaml` / `ops/zarf/values-demo.test.ts` (the open-PR #256 surface). `git diff --stat` is the evidence. OK.

### P2 findings (followups acceptable)
1. The concrete live kubectl/helm/zarf invocations are intentionally NOT in this (A) artifact — they are the orchestrator's (B) step per ADR-0213 + the wave breakdown. The live path returns `exit 3` with a clear blocker rather than half-installing. This is by design; when the (B) executor lands it wires `plan_steps` + `assert_*` to live output. Acceptable.
2. `assert_phi_gate_clean` treats any non-zero demo-seed exit as "gate dirty OR run errored" — it cannot distinguish a true PHI catch from an unrelated crash. For a fails-closed gate, conflating both to FAIL is the safe direction (never green on doubt). Acceptable.

### What the change got right (counter-balance)
1. **Single source of truth for the air-gap leak logic** — delegates to #330's detector; zero jq duplication; test enforces the no-duplication invariant.
2. **Cluster-free logic testability** — `--plan-only` (machine-readable plan) + `--dry-run` (GA_* env fixtures) make every assertion + the per-profile sequencing bun-testable with no k8s, and a SIMULATED failure (dirty PHI / pods-not-ready / hybrid PHI on control plane / leaked egress) is proven to exit non-zero.
3. **Charter §4 / ADR-0213 fidelity** — hybrid plan pins the real NetBird node IPs (control 100.77.0.1 / data 100.77.0.2) and asserts PHI-on-data-plane-only; cloud is rejected as DEFERRED-V2, matching the ADR exactly.

### Acceptance coverage check
- on-prem / air-gap / hybrid each: plan ordering, green dry-run, dirty-PHI fail, pods-not-ready fail. Hybrid additionally: PHI-on-control-plane fail + empty-data-plane fail. Air-gap additionally: real clean/leaked Hubble flow logs through the reused detector. 24 tests, 0 skip (jq present). Coverage is adequate for the (A) gate.
