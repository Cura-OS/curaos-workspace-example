# M15 — Live-Infra Sub-Wave: Atomic Story Breakdown

**Date:** 2026-06-06
**Parent Epic:** [#29 — M15 v1 GA packaging + launch readiness](https://github.com/your-org/curaos-ai-workspace/issues/29)
**Governing decision:** [ADR-0213](../adr/0213-m15-ga-verification-infra-topology.md) — local amd64 **build-host** + Hetzner CX43 **example** over self-hosted **NetBird** mesh.
**Prereq (DONE 2026-06-06):** build-host bootstrapped (kubectl 1.36 / k3d 5.7 / helm 3.16 / cosign 3.0 / zarf 0.77 / buildah 1.44 / podman 5.8 / docker 29 / bun 1.3); `cluster-onprem` (k3d, K3s v1.30.4, traefik/servicelb/metrics-server disabled per [[curaos-orchestration-rule]]) UP at 127.0.0.1:8443.

> **Status:** BREAKDOWN + SPEC. This file maps the 3 deferred live-infra M15 stories (#512/#516/#517) + the live-verify debt (#330/#322/#407) onto the ADR-0213 infra, splitting each into **(A) agent-authorable artifacts** (`ready-for-agent` — manifests/Helm/scripts/harness, verified by local `bun test`/dry-run) and **(B) orchestrator live-run acceptance** (deploy + observe on build-host — the orchestrator runs these over the trusted SSH key; they are now *runnable*, not blocked-by-missing-infra).

## Why the A/B split

The committed `one-task-execution-prompt` runbook authors code + runs local CI; it has **no live-remote-cluster execution model**. So each live-infra story = an **authorable artifact** a worker produces (testable in isolation: `helm template`, `zarf package create --confirm`, `bun test` on the harness) **plus** an **orchestrator live-run** that deploys the artifact to `cluster-onprem` / `cluster-airgap` / the hybrid pair and captures evidence. The (A) parts are `ready-for-agent`; the (B) parts are operator steps the orchestrator executes against build-host.

## Infra targets (from ADR-0213)

| Target | Node | Address |
|---|---|---|
| `cluster-onprem` | build-host | k3d, kube-context `k3d-onprem` @ 127.0.0.1:8443 |
| `cluster-airgap` | build-host | k3d (to create), egress default-deny |
| hybrid control-plane | Hetzner example | NetBird `100.77.0.1` |
| hybrid data-plane | build-host | NetBird `100.77.0.2` |
| bundle build | build-host | buildah/BuildKit + cosign |

## Stories

### #512 — signed v1.0.0 bundles (EXPAND, ready-for-agent)
**(A) authorable:** the `curaos-deploy` release pipeline (S1, merged) emits the 4-profile bundle set. Worker wires the bundle manifests: Helm chart bundle (cloud/on-prem), hybrid split values, Zarf air-gap package def (Buildah build path), cosign sign + SBOM. Verify locally: `zarf package create --confirm` produces the tar; `cosign verify` on the signed images; `helm template` renders each profile. **No cluster needed to BUILD.**
**(B) orchestrator live-run:** build all 4 on build-host; `cosign verify` each; stage the Zarf tar for #512-airgap.
**blocked-by:** #510 (done). **dispatch:** now.

### #516 — internal demo-slice tenant (RE-SCOPE + EXPAND, ready-for-agent)
**Re-scope:** NOT a public customer demo (ADR-0213). An **internal demo-slice** deployable to `cluster-onprem`, reachable over NetBird only.
**(A) authorable:** `values-demo.yaml` Helm profile trimming the deploy to the ~15-service slice the `@curaos/demo-seed` flow needs (identity/tenancy/party/audit/notify + encounter/clinical-doc/orders/scheduling/terminology/consent + commerce-core/crm-core + education-core + builder-core/workflow-core) + infra (CNPG, Redpanda, SeaweedFS, Valkey, OpenBao, APISIX). Verify: `helm template -f values-demo.yaml` renders ≤21 pods, no public Service/Ingress (ClusterIP + NetBird only). Wire `@curaos/demo-seed` as a post-install Job.
**(B) orchestrator live-run:** `helm install -f values-demo.yaml` to `cluster-onprem`; run demo-seed Job; assert Presidio PHI gate clean + watermark present; reach a service over the NetBird `100.77.x` IP.
**blocked-by:** #511 (done), #512-A (bundle/chart), #514 (done). **dispatch:** after #512-A.

### #517 — GA install-from-scratch E2E (EXPAND, ready-for-agent + orchestrator)
**(A) authorable:** the install-from-scratch test harness + runbook for 3 profiles (on-prem, air-gap, hybrid — cloud-deploy deferred per ADR-0213). Scripts that, given a fresh k3d cluster, install the bundle + wizard + demo-seed and assert green. Verify: harness scripts `shellcheck` + dry-run logic tests under `bun test`.
**(B) orchestrator live-run:** on-prem on `cluster-onprem`; air-gap on `cluster-airgap` (egress-blocked); hybrid across build-host↔Hetzner over NetBird. Capture evidence per profile.
**blocked-by:** #512, #514, #516. **dispatch:** after #516.

### #330 — air-gap zero-egress harness (RE-HOME M8→M15, EXPAND, ready-for-agent)
The air-gap leg of #512/#517. **(A) authorable:** `assert-zero-egress.sh` + a `cluster-airgap` k3d definition (NetworkPolicy default-deny, no registry pull). Verify: script logic + a unit test that a leaked egress fails the assertion. **(B) orchestrator:** create `cluster-airgap`, Zarf-deploy, run `assert-zero-egress.sh` against real Hubble/NetworkPolicy. **dispatch:** parallel with #512-A (different artifact).

### #322 — hybrid IDENTITY_DIAMOND_MODE live-verify (RE-HOME M9→M15, EXPAND, orchestrator)
The hybrid leg. Confirm IDENTITY_DIAMOND_MODE holds when identity-service control-plane is on Hetzner + data-plane on build-host over NetBird. Mostly **(B) orchestrator** (depends on #517 hybrid stand-up). **dispatch:** after #517 hybrid.

### #407 — live APISIX route-guard + Presidio sidecar (M12 debt, EXPAND, ready-for-agent + orchestrator)
**(A) authorable:** deploy manifests wiring APISIX route-guard + Presidio sidecar (the static config exists; the live HTTP proof was the gap). **(B) orchestrator:** deploy to `cluster-onprem`, run the #388 PHI-boundary harness Layers 3+5 live (flip from SKIP to enforced). **dispatch:** after #516 (needs the slice running).

## Dispatch order (against existing infra)
```text
NOW (parallel, agent-authorable):
  #512-A bundles   #330-A air-gap-harness   #516-A demo-slice-values
THEN (orchestrator live-run on build-host):
  #512-B build+sign  →  #516-B deploy-slice  →  #407 APISIX/Presidio live
  #330-B air-gap deploy + zero-egress assert
THEN:
  #517 GA E2E (on-prem + air-gap + hybrid)  →  #322 hybrid Diamond live
```

## Per-story DoD addendum
(A) parts: `bun test`/`helm template`/`zarf package create --confirm`/`shellcheck` green, pasted per [[curaos-local-ci-first-rule]]; ai-docs mirror; doc-graph. (B) parts: orchestrator pastes the live kubectl/cosign/zarf/assert output as the §8.1 evidence into the issue, then closes.
