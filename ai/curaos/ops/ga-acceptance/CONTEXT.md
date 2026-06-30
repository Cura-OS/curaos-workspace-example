---
node_type: context
module: ops/ga-acceptance
parent: AGENTS.md
mirrors: curaos/ops/ga-acceptance
---

# CONTEXT — ops/ga-acceptance

Integration map for the GA install-from-scratch E2E harness (#517). Mirrors `curaos/ops/ga-acceptance/`.

## Profiles → infra targets (ADR-0213)

| Profile | Cluster | Node | Address |
|---|---|---|---|
| on-prem | `cluster-onprem` | build-host | k3d, kube-context `k3d-onprem` @ 127.0.0.1:8443 |
| air-gap | `cluster-airgap` | build-host | k3d (egress default-deny), `ops/dev/k3d/k3d-airgap-config.yaml` (#330) |
| hybrid | control-plane + data-plane | Hetzner + build-host | CP NetBird `100.77.0.1` / DP NetBird `100.77.0.2` |

cloud (managed EKS/GKE) = DEFERRED-V2 per ADR-0213.

## Consumes (must-not-break dependencies)

- #512 signed bundles (`curaos/curaos-deploy/bundles/`) — the install artifact.
- #516 demo-slice (`curaos/ops/zarf/values/values-demo.yaml`) — the deploy profile.
- #511 `@curaos/demo-seed` (`curaos/tools/demo-seed`) — post-install seed.
- #514 onboarding wizard (curaos-onboarding) — first-run.
- #330 `curaos/scripts/assert-zero-egress.sh` + `ops/dev/k3d/k3d-airgap-config.yaml` — air-gap leg (called, not duplicated).

## Data flow

`ga-install-from-scratch.sh --profile X` → fresh k3d cluster → install bundle (#512) → wizard (#514) → demo-seed Job (#511) → assert pods Ready + PHI gate clean + (air-gap) zero egress + (hybrid) PHI on data plane only.

## Cross-phase dependency / known blocker

The (B) live install cannot deploy product services until per-service Helm packaging exists — the `curaos-umbrella` chart is a stub (`version: 0.1.0-stub`, empty `dependencies:`) and the codegen emits Dockerfiles but no charts. See [research 2026-06-07](../../docs/research/2026-06-07-m15-ga-service-packaging-gap.md). Substrate (DB/broker/gateway/CNI/observability) IS deployable today.

## Decisions

- Cluster-free testability via `--dry-run` + `GA_*` env injection — the (A) gate runs without a cluster ([[curaos-local-ci-first-rule]]).
- Air-gap leg reuses `assert-zero-egress.sh` ([[curaos-rolling-update-rule]]).
