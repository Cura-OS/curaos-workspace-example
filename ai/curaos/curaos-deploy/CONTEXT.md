# curaos-deploy — CONTEXT

Integration map + rationale for the CuraOS release pipeline. Code: `curaos/curaos-deploy/`. Governing decision: [ADR-0110](../docs/adr/0110-cicd-release.md). Backing research: [2026-06-06-m15-s1-release-pipeline-curaos-deploy.md](../docs/research/2026-06-06-m15-s1-release-pipeline-curaos-deploy.md). Grill: [m15-s1-510](../docs/grills/m15-s1-510-release-pipeline-curaos-deploy.md). Parent epic: [#29](https://github.com/your-org/curaos-ai-workspace/issues/29).

## Pipeline (7 stages, `release.sh`)

```text
caller (workflow_dispatch OR `just release --service <svc> --version vX.Y.Z [--dry-run]`)
 1. CI gate     : (cd $CURAOS_ROOT && just ci-service <svc>)        — green required
 2. semver tag  : validate vX.Y.Z (is_semver_tag)
 3. build       : docker buildx build curaos/backend/services/<svc>/Dockerfile
                  → OCI tar; base-image digest-pin asserted (--base-image)
 4. SBOM        : syft <image> -o cyclonedx-json → sbom.cdx.json
 5. sign+attest : cosign sign <img>@<digest> ; cosign attest --type cyclonedx
 6. publish     : push image→GHCR ; package→Verdaccio ; emit zarf-image-list.txt
 7. verify      : cosign verify <img>@<digest> ; assert SBOM attestation present
```

`--dry-run` stops before any registry push and (when docker/syft are absent)
signs+verifies a synthesized release artifact + a minimal CycloneDX SBOM with an
ephemeral cosign key, so the full sign→verify contract is exercised in the local
gate with zero credentials. This is the M15-S1 acceptance path.

## Bundles (Story 3 — #512, `bundles/bundle.sh`)

`release.sh` signs per-service **images** + emits a Zarf image-list; `bundle.sh`
assembles those into the per-**profile** bundle set and cosign-signs each bundle +
attaches a CycloneDX SBOM. The four profiles map 1:1 to the AGENTS.md §4
deployment models. Governing infra: [ADR-0213](../docs/adr/0213-m15-ga-verification-infra-topology.md);
air-gap layout: [ADR-0164](../docs/adr/0164-zarf-bundle-layout.md).

```text
caller (`just bundle --version vX.Y.Z --profile <p|all> [--dry-run] [--curaos-root <dir>]`)
 per profile:
   cloud / on-prem / hybrid : helm template <curaos-root>/ops/zarf/charts/curaos-umbrella -f bundles/values/values-<p>.yaml
   air-gap                  : zarf package create <curaos-root>/ops/zarf  (ADR-0164; Buildah build path)
   then (all):  syft → CycloneDX SBOM ; cosign sign-blob + verify (bundle + SBOM)
```

| Profile | Delivery | Overlay(s) | Signing |
|---|---|---|---|
| `cloud` | helm + registry pull (no Zarf) | `values-cloud.yaml` | keyless OIDC |
| `on-prem` | helm + registry pull | `values-on-prem.yaml` | keyed |
| `hybrid` | helm (2 planes, NetBird split) | `values-hybrid-control-plane.yaml` + `values-hybrid-data-plane.yaml` | keyed |
| `air-gap` | Zarf singular `.tar.zst` | `values-air-gap.yaml` | keyed (offline, ADR-0211) |

Key invariants enforced at build time (`lib/bundle-lib.sh`):
- **Reuse, no re-author.** The bundle layer is a *profile overlay* on the in-tree
  umbrella chart + zarf.yaml; it never copies charts.
- **Live-run host.** Release, bundle, deploy, GHCR, zarf, cosign, and public-demo verification that needs live infrastructure runs on `build-host` via SSH when the current agent host is elsewhere, using `/home/mkh/workspace/example-homelab` for private operations context. See [[curaos-live-ops-substrate-rule]] and ADR-0213.
- **Hybrid split** (`assert_hybrid_split`): control-plane (Hetzner `100.77.0.1`)
  and data-plane (build-host `100.77.0.2`) must be disjoint + NetBird-pinned; PHI
  services stay on the data plane (charter §4 / tenant isolation). A public IP in
  a hybrid overlay is rejected (`is_netbird_ip`, 100.64.0.0/10 CGNAT range).
- **SeaweedFS** object store, never MinIO (ADR-0163 DA13-Q6).
- **SKIP-not-fail** tool policy: helm/zarf absent in `--dry-run` emits an explicit
  `SKIP:` (the live render is the orchestrator (B) step on the build host);
  cosign is always required.

The (B) orchestrator live-run on build-host builds all 4 with real helm/zarf/buildah,
`cosign verify`s each, and stages the air-gap tar for #330.

## Producers / consumers

- **Produces:** signed OCI images in GHCR (`ghcr.io/cura-care-oriented-stack/<svc>:<tag>@<digest>`), CycloneDX SBOM attestations, npm packages in Verdaccio, a Zarf image-list manifest, and (Story 3) the 4-profile signed bundle set. **Consumed by** Story 7 (#516 internal demo-slice; uses the chart/bundle) and the #517 GA install-from-scratch E2E.
- **Consumes:** the curaos monorepo (CI gate + per-service Dockerfile via `--curaos-root`), and — conceptually — the same cosign key + GHCR namespace + Zarf layout that `curaos/tools/verify/cosign-verify.sh` and `curaos/ops/zarf/zarf.yaml` expect.
- **No runtime domain events** — this is a build/release-time pipeline.

## Must-not-break (exact paths)

| Path | Why |
|---|---|
| `curaos/ci-gates.yaml` | Single source of truth for the curaos local gate; the release CI-gate stage invokes it via `just ci-service`. |
| `curaos/tools/verify/cosign-verify.sh` | The verify contract the release output must satisfy (`cosign verify --key cosign.pub`). |
| `curaos/ops/zarf/zarf.yaml` + `ops/zarf/signing-trust/` | The image refs + cosign key the bundle expects; the release publishes to the same GHCR namespace. |
| [[curaos-version-pinning-rule]] | Every pin exact / SHA / digest. Enforced by `lib/pin-guard.sh`. |
| GHCR + Verdaccio auth | The pipeline reads creds from env/OIDC, never hardcoded. |

## Decisions (this module)

| Decision | Choice | Source |
|---|---|---|
| Trigger | `workflow_dispatch`-only (no push/PR/schedule) | [[curaos-local-ci-first-rule]] |
| `--version` source | explicit caller-passed v-prefixed semver | ADR-0110 §3.6 |
| Image vs bundle signing | S1 signs images + SBOM; S3 (#512) signs the 4 per-profile bundles (`bundles/bundle.sh`) | M15 breakdown S1/S3 |
| Bundle location | `curaos-deploy/bundles/` (profile overlays referencing in-tree umbrella chart + zarf.yaml), NOT a copied chart | #512-A decision; [[curaos-reuse-dry-rule]] |
| Hybrid placement | control-plane Hetzner `100.77.0.1` + data-plane build-host `100.77.0.2` over NetBird; PHI on data plane | ADR-0213 |
| Local gate scope | bash+bun+cosign-dryrun; docker/syft/GHCR run only via dispatch or `--integration` | [[curaos-local-ci-first-rule]] |
| GHCR namespace | `ghcr.io/cura-care-oriented-stack` | `cosign-verify.sh`; ADR-0211 §4.6 |
| Tool-absent policy | explicit `SKIP:` in dry-run; never `\|\| true`; cosign always required | [[curaos-local-ci-first-rule]] |

## Submodule wiring

`curaos-deploy` is a real top-level submodule at `curaos/curaos-deploy/` (kebab-case, code-only). ai-docs mirror = this directory (`ai/curaos/curaos-deploy/`). The mirror checker (`scripts/check-ai-mirror.sh`) scans `backend/services`, `backend/packages`, `frontend/apps`, `frontend/packages`, `ops` — a top-level deploy submodule is outside those compared trees, so the parent submodule pointer + these ai-docs are the wiring of record.
