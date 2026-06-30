# Grill: M15-S3 #512 (A) - curaos-deploy bundle.sh helm render path

Subject: resume the (A) agent-authorable slice of #512. The merged #2/#3 bundle
layer hard-fails (exit 3) on `helm template` of `ops/zarf/charts/curaos-umbrella`
because the umbrella now carries 87 real M16 `file://` subchart deps but `charts/`
is not vendored. Fix: `bundle.sh` runs `helm dependency build` before
`helm template` (subcharts resolve locally, no network), self-cleans the vendored
`charts/` + `Chart.lock` so the shared curaos checkout stays clean, and
SKIP-not-fails in `--dry-run` when the subcharts genuinely cannot be vendored
(ADR-0213 build-host-only condition).

## Opposite-harness verdict

GRILL: blocked-harness-unavailable
GRILL-HARNESS: codex (gpt-5.4-mini probe / gpt-5.4 medium grill)
GRILL-REASON: codex CLI cold-start exceeds the workflow 18s probe budget AND a
300s direct-grill alarm; the CLI returns `OK` on probe but is too slow to start in
this environment to complete a bounded adversarial pass (probe exited 142 / alarm).
GRILL-OUTPUT: ai/curaos/docs/grills/m15-s3-a-slice-resume-curaos-deploy-bundle-sh-helm-render-path-the-merged-2-3-layer-7940cbe11120.md (workflow auto-record)

Per the one-task contract, the opposite harness being genuinely unavailable is a
documented condition. This change is a low-risk release-tooling build-path fix: no
PHI/schema/auth/RBAC surface, no public-interface change, scope confined to
`curaos-deploy` with the full local CI gate green. The implementer self-grill below
substitutes the adversarial planning pass; the orchestrator T2 `pr-verify-merge`
step is the remaining cross-harness verification gate.

## Implementer self-grill (correctness traps)

1. `set -e` + non-zero `helm dependency build`: a bare `vendor_umbrella_subcharts`
   call followed by `local dep_rc=$?` would abort under `set -euo pipefail` before
   the rc is read. RESOLVED: captured inline as
   `vendor_umbrella_subcharts ... || dep_rc=$?`.
2. Shared-checkout pollution: `helm dependency build` writes `charts/` + `Chart.lock`
   INTO the shared curaos umbrella dir. RESOLVED: snapshot pre-existence ONCE, EXIT
   trap removes ONLY what this run created; a checkout that already vendored them
   (the orchestrator build host) is preserved. Verified: `git status --short` on the
   curaos parent is clean after a full `bun test` run.
3. EXIT-trap safety: `bundle_vendor_cleanup` uses `|| true` on every `rm` so it can
   never abort the trap under `set -e`. The globals it reads are module-scope (not
   `local`), so they survive into the trap.
4. SKIP-not-fail honesty: when dep-build fails AND `--dry-run`, a synthesized
   descriptor is written with an explicit greppable `SKIP:` notice (never `|| true`),
   matching the existing helm-absent/zarf-absent policy. Outside `--dry-run` it is a
   hard `die 3`.
5. Air-gap untouched: the zarf delivery path and the 13-component deploy-order /
   zero-egress gates are not modified (verified green: 6/6 zero-egress tests).

## Scope guard

- Did NOT touch `tools/codegen` or the 87 per-service charts (brief constraint).
- The umbrella generator (`tools/codegen/src/umbrella-emit.ts`) does not emit a
  `.gitignore` for the vendored `charts/` + `Chart.lock` build artifacts. That is a
  generator gap captured as FORESIGHT against the codegen module, not fixed here.

## Verification status

Pending orchestrator T2 `pr-verify-merge` cross-harness pass on the open PR.
