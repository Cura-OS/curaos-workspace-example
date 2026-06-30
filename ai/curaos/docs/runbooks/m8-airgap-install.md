# M8 Air-Gap Offline Install + Rollback Runbook

**Issue:** [M8-S7 #89](https://github.com/your-org/curaos-ai-workspace/issues/89)
**Status:** operator runbook; live cluster evidence must be attached by the operator who runs it.
**Applies to:** Core Zarf bundle `curaos-vX.Y.Z.tar.zst` from [ADR-0164](../adr/0164-zarf-bundle-layout.md).

This runbook covers the offline install and rollback procedure for the M8 Zarf bundle. It does not implement or verify the zero-egress harness owned by issue #88, the Zarf layer-numbering drift owned by #139, the migration runner owned by #135, or identity/codegen work.

## Source Contracts

- [ADR-0164](../adr/0164-zarf-bundle-layout.md): Zarf manifest of record, 10 components, declaration-order deploy sequencing, digest-placeholder guard.
- [ADR-0158](../adr/0158-air-gap-bundle-sla.md): air-gap bundle tiers, size expectations, delivery/delta update model.
- [ADR-0211](../adr/0211-cosign-offline-keyed-contract.md): offline keyed cosign contract, trust root, admission policy, rotation procedure.
- [Zarf README](../../../../curaos/ops/zarf/README.md): customer-facing Zarf layout summary and component list.
- [[curaos-airgap-rule]]: Zarf is the singular air-gap packaging format.

## Operator Inputs

Prepare these files on the offline operator workstation before touching the cluster:

| Artifact | Required | Expected path on workstation | Verification |
|---|---:|---|---|
| Current bundle | yes | `/media/curaos/curaos-vX.Y.Z.tar.zst` | SHA-256 matches release manifest. |
| Previous N-1 bundle | yes for upgrade/rollback | `/media/curaos/previous/curaos-vX.Y.(Z-1).tar.zst` | SHA-256 matches previous release manifest. |
| Current SHA manifest | yes | `/media/curaos/curaos-vX.Y.Z.sha256` | Contains the bundle filename and 64-hex digest. |
| Previous SHA manifest | yes for upgrade/rollback | `/media/curaos/previous/curaos-vX.Y.(Z-1).sha256` | Same format as current. |
| Cosign public key | yes | `/media/curaos/trust/cosign.pub` | Matches `curaos/ops/zarf/assets/cosign.pub` for the release. |
| Deployment variables | yes | `/media/curaos/site.env` | Contains `TENANT_ID`, `TENANT_TIER`, `DOMAIN`, `DB_PASSWORD`, `K8S_SERVICE_HOST`, `K8S_SERVICE_PORT`. |

Retain the full N-1 bundle, SHA manifest, and cosign public key on offline media until the current release has passed smoke checks and one backup cycle. Do not rely on Helm release history alone: Zarf mirrors images and package content outside Helm, and rollback needs the prior `.tar.zst` available offline.

## Preflight

Run from the offline operator workstation.

1. Confirm tools exist.

   ```bash
   command -v zarf
   command -v kubectl
   command -v helm
   command -v sha256sum || command -v shasum
   ```

   Expected evidence: each command prints a path. If `sha256sum` is absent on macOS, use `shasum -a 256` in the checksum commands below.

2. Confirm no Internet path is required by the runbook.

   ```bash
   test -f /media/curaos/curaos-vX.Y.Z.tar.zst
   test -f /media/curaos/curaos-vX.Y.Z.sha256
   test -f /media/curaos/trust/cosign.pub
   test -f /media/curaos/site.env
   ```

   Expected evidence: exit code `0`. Missing files block deployment. Do not replace this with registry pulls, public chart downloads, or live Sigstore calls.

3. Verify bundle hash.

   ```bash
   cd /media/curaos
   sha256sum --check curaos-vX.Y.Z.sha256
   # macOS fallback:
   # shasum -a 256 --check curaos-vX.Y.Z.sha256
   ```

   Expected evidence: `curaos-vX.Y.Z.tar.zst: OK`.

4. Inspect package metadata before deploy.

   ```bash
   zarf package inspect /media/curaos/curaos-vX.Y.Z.tar.zst
   ```

   Expected evidence: package name `curaos`, version `X.Y.Z`, architecture matching the delivered flavor, and components in this order: `zarf-registry-init`, `curaos-k3s-init`, `cilium-cni`, `cnpg-operator`, `redpanda`, optional `harbor-registry`, optional `glitchtip-pyrra`, `signing-trust`, `curaos-migration-jobs`, `curaos-services`.

5. Verify offline package signature when the release includes a Zarf package signature.

   ```bash
   zarf package verify /media/curaos/curaos-vX.Y.Z.tar.zst \
     --key /media/curaos/trust/cosign.pub
   ```

   Expected evidence: verification succeeds without Fulcio, Rekor, OIDC, or Internet egress. If the release was produced before the package-signature artifact exists, record `BLOCKER: package-signature-unavailable` and continue only with explicit release-manager approval.

6. Confirm cluster access.

   ```bash
   kubectl version --client=true
   kubectl get nodes -o wide
   kubectl get ns zarf cosign-system curaos 2>/dev/null || true
   ```

   Expected evidence: `kubectl get nodes` reaches the target cluster. Namespace lookup may be empty on first install.

7. For upgrades, confirm the local Zarf registry is reachable before changing workloads.

   ```bash
   kubectl get svc -n zarf zarf-docker-registry
   kubectl get pods -n zarf -l app=zarf-docker-registry -o wide
   ```

   Expected evidence: registry Service exists and registry Pods are ready. On first install this may be absent; Zarf creates it through `zarf-registry-init`.

8. Confirm local capacity.

   ```bash
   df -h /media/curaos
   df -h /
   ```

   Expected evidence: enough free space for one current bundle, one N-1 bundle, and extracted working data. Tier 1 Core target is roughly 15-20 GB uncompressed per [ADR-0158](../adr/0158-air-gap-bundle-sla.md); keep at least 2x current bundle size free on the operator workstation and enough node storage for mirrored images and PVCs.

## Install Or Upgrade

Load variables without printing secrets:

```bash
set -a
. /media/curaos/site.env
set +a
```

Deploy required components plus the optional layers selected for the site. This example installs the required path and skips optional Harbor/observability:

```bash
zarf package deploy /media/curaos/curaos-vX.Y.Z.tar.zst \
  --components=zarf-registry-init,curaos-k3s-init,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services \
  --set TENANT_ID="${TENANT_ID}" \
  --set TENANT_TIER="${TENANT_TIER}" \
  --set DOMAIN="${DOMAIN}" \
  --set DB_PASSWORD="${DB_PASSWORD}" \
  --set K8S_SERVICE_HOST="${K8S_SERVICE_HOST}" \
  --set K8S_SERVICE_PORT="${K8S_SERVICE_PORT}" \
  --confirm \
  --log-level=debug
```

For the full bundle, omit `--components` so Zarf deploys every component in manifest order.

Expected evidence:

- Zarf exits `0`.
- Logs show no remote chart/image fetches during deploy.
- `signing-trust` lands before `curaos-migration-jobs` and `curaos-services`.
- Migration Jobs complete before service Deployments become ready.

If deploying a delta package, verify its manifest first:

```bash
zarf package inspect /media/curaos/curaos-vX.Y.Z-diff-vX.Y.(Z-1).tar.zst
```

Expected evidence: `from_version_min` / `from_version_max` or release notes permit the installed N-1 version. If the installed version falls outside the delta range, use the full current bundle instead of the delta.

## Smoke Checks

Run after `zarf package deploy` exits.

1. Check core namespaces.

   ```bash
   kubectl get pods -n kube-system
   kubectl get pods -n cnpg-system
   kubectl get pods -n redpanda
   kubectl get pods -n cosign-system
   kubectl get pods -n curaos
   ```

   Expected evidence: Pods are `Running` or `Completed`; no `ImagePullBackOff`, `CrashLoopBackOff`, or admission-denied Pods.

2. Check component-specific readiness.

   ```bash
   kubectl rollout status deployment/cilium-operator -n kube-system --timeout=180s
   kubectl rollout status deployment/cnpg-controller-manager -n cnpg-system --timeout=180s
   kubectl rollout status deployment/policy-controller-webhook -n cosign-system --timeout=180s
   kubectl get jobs -n curaos
   ```

   Expected evidence: rollouts complete; migration Jobs show `COMPLETIONS` matching desired count.

3. Confirm digest-pinned image refs reached the cluster.

   ```bash
   kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{" "}{range .spec.containers[*]}{.image}{" "}{end}{"\n"}{end}' | rg '@sha256:|zarf-docker-registry|ghcr.io/cura-care-oriented-stack'
   ```

   Expected evidence: CuraOS-owned images are digest-pinned and, in air-gap mode, rewritten through the Zarf registry shape documented in [ADR-0211](../adr/0211-cosign-offline-keyed-contract.md).

4. Check cosign admission enforcement.

   ```bash
   kubectl get clusterimagepolicy curaos-owned-images-require-cosign -o yaml
   kubectl logs -n cosign-system deploy/policy-controller-webhook --tail=100
   ```

   Expected evidence: policy mode is `enforce`; logs contain no unexpected 403 denies for signed CuraOS images. Unsigned-image rejection belongs to the cosign verify workflow and should not be claimed here unless run.

5. Record zero-egress status.

   ```bash
   test -x curaos/ops/zarf/scripts/assert-zero-egress.sh
   ```

   Expected evidence for issue #89: if the command fails because the #88 zero-egress harness is not present, record `BLOCKER: live-zero-egress-harness-unavailable (#88)` and do not claim zero-egress verification.

## Failure Triage

Collect this evidence before retrying, rolling back, or changing cluster state:

```bash
kubectl get events -A --sort-by=.lastTimestamp | tail -200
kubectl get pods -A -o wide
kubectl logs -n zarf deploy/zarf-agent --tail=200 2>/dev/null || true
kubectl logs -n cosign-system deploy/policy-controller-webhook --tail=200 2>/dev/null || true
kubectl get jobs -n curaos -o wide
```

Common failure mapping:

| Symptom | Likely cause | Operator action |
|---|---|---|
| Hash check fails | Corrupt or wrong bundle | Stop; replace media from release source. |
| `zarf package verify` fails | Wrong public key, unsigned package, or signature mismatch | Stop; compare release manifest and `cosign.pub`; do not deploy. |
| Image admission 403 | Missing `.sig` artifact, wrong key, or unsigned CuraOS-owned image | Stop product rollout; collect policy-controller logs; use N-1 rollback if upgrade was in progress. |
| Migration Job fails | Schema drift or non-idempotent migration | Stop service rollout; do not run backward SQL manually; use DB backup/PITR if data was mutated. |
| Service Pods `ImagePullBackOff` | Mirror missing image or digest placeholder leaked | Stop; inspect package images and digest guard output. |
| Interrupted deploy | Partial registry mirror or partial Helm release | Re-run the same `zarf package deploy` once after confirming media and node health; if it fails again, roll back. |

## Rollback Procedure

Rollback is not a magic Zarf command. For M8, rollback means redeploying the retained N-1 Zarf bundle and then verifying the cluster returns to the previous release's smoke state.

### Rollback Preflight

1. Confirm N-1 artifacts are present.

   ```bash
   test -f /media/curaos/previous/curaos-vX.Y.(Z-1).tar.zst
   test -f /media/curaos/previous/curaos-vX.Y.(Z-1).sha256
   cd /media/curaos/previous
   sha256sum --check curaos-vX.Y.(Z-1).sha256
   ```

   Expected evidence: prior bundle hash is `OK`.

2. Snapshot current failure state.

   ```bash
   kubectl get pods -A -o wide > /media/curaos/evidence/pre-rollback-pods.txt
   kubectl get events -A --sort-by=.lastTimestamp > /media/curaos/evidence/pre-rollback-events.txt
   kubectl get jobs -n curaos -o yaml > /media/curaos/evidence/pre-rollback-jobs.yaml
   ```

   Expected evidence: files exist on offline media. They are needed to diagnose the failed current release after service is restored.

3. Decide whether database state is rollback-safe.

   Use this rule:

   - If current release migrations did not start or all failed before mutation, redeploy N-1.
   - If migrations completed and are forward-only, do not assume service-image rollback is data-safe. Restore from the most recent verified backup/PITR point first, or hold the current release with failed services scaled down until platform engineering approves a corrective forward migration.
   - Never run ad hoc down-migration SQL in the air-gap cluster without a signed recovery artifact.

### Zarf-Level Rollback

Run with the same component selection used before the failed upgrade. Required-only example:

```bash
zarf package deploy /media/curaos/previous/curaos-vX.Y.(Z-1).tar.zst \
  --components=zarf-registry-init,curaos-k3s-init,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services \
  --set TENANT_ID="${TENANT_ID}" \
  --set TENANT_TIER="${TENANT_TIER}" \
  --set DOMAIN="${DOMAIN}" \
  --set DB_PASSWORD="${DB_PASSWORD}" \
  --set K8S_SERVICE_HOST="${K8S_SERVICE_HOST}" \
  --set K8S_SERVICE_PORT="${K8S_SERVICE_PORT}" \
  --confirm \
  --log-level=debug
```

Expected evidence:

- Zarf exits `0`.
- N-1 `signing-trust` key and policy are restored.
- N-1 service images are deployed from the local registry.
- Smoke checks below match the previous release.

### Helm-Level Recovery

Use Helm rollback only when Zarf deploy succeeded but the `curaos-services` Helm release failed after images were already mirrored and migrations are known compatible.

```bash
helm history curaos-services -n curaos
helm rollback curaos-services <N-1-REVISION> -n curaos --wait --timeout 10m
kubectl rollout status deployment -n curaos --timeout=300s
```

Expected evidence: Helm release returns to the prior revision and workloads become ready. This does not restore registry content, trust roots, CRDs, or database state; use Zarf-level rollback for package-level failures.

## Post-Rollback Smoke Checks

Run the full [Smoke Checks](#smoke-checks) section again, then add:

```bash
zarf package list
kubectl get jobs -n curaos
kubectl get pods -n curaos -o jsonpath='{range .items[*]}{.metadata.name}{" "}{range .spec.containers[*]}{.image}{" "}{end}{"\n"}{end}'
```

Expected evidence: package list and Pod image refs show the N-1 version; migrations are either unchanged/idempotent or were restored through backup/PITR before service restart.

## Rollback Rehearsal Path

Use this path in a disposable offline k3d/K3s cluster before promoting a release bundle:

1. Deploy v1.

   ```bash
   zarf package deploy /media/curaos/previous/curaos-v1.tar.zst \
     --components=zarf-registry-init,curaos-k3s-init,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services \
     --confirm \
     --log-level=debug
   ```

   Expected evidence: [Smoke Checks](#smoke-checks) pass for v1.

2. Upgrade to v2.

   ```bash
   zarf package deploy /media/curaos/curaos-v2.tar.zst \
     --components=zarf-registry-init,curaos-k3s-init,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services \
     --confirm \
     --log-level=debug
   ```

   Expected evidence: v2 deploy either passes smoke or fails in a controlled way with events/logs captured under `/media/curaos/evidence/`.

3. Roll back to v1.

   ```bash
   zarf package deploy /media/curaos/previous/curaos-v1.tar.zst \
     --components=zarf-registry-init,curaos-k3s-init,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services \
     --confirm \
     --log-level=debug
   ```

   Expected evidence: post-rollback smoke is green and Pod image refs show v1. Do not mark rehearsal complete if migrations mutated data in a way v1 cannot read.

## Verification Evidence Template

Paste this in the issue/PR status after running the runbook:

```text
STATUS: issue #89 offline install + rollback runbook
Branch:
<git status --short --branch>

Changed files:
<git diff --name-only>

Static verification:
<rg -n "rollback|zarf package deploy|cosign|sha256|smoke|offline" ai/curaos/docs/runbooks/m8-airgap-install.md ai/curaos/docs/adr/0164-zarf-bundle-layout.md curaos/ops/zarf/README.md>
<bash scripts/check-docs.sh>

Live cluster verification:
zarf package deploy: NOT RUN | RUN <date>
rollback deploy: NOT RUN | RUN <date>
smoke checks: NOT RUN | RUN <date>
zero-egress harness: NOT RUN; #88 owns harness unless attached here.

Blockers:
<exact missing environment/tool/artifact, or "none">
```

## Current Worker Evidence

This runbook was authored from static repository state only. No live k3d offline deploy, rollback deploy, or zero-egress harness run is claimed here. The exact blocker is: no prepared offline k3d/Zarf cluster, no generated current/N-1 `.tar.zst` release pair, and issue #88 zero-egress harness is out of scope for #89.
