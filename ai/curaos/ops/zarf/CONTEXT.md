# Context — ops/zarf

## Mission

Pin the layout of the singular CuraOS air-gap release artifact (`curaos-vX.Y.Z.tar.zst`)
so every milestone story (M8-S1…S7, future M9+) attaches to the same component shape.

## What lives here (mirror of `curaos/ops/zarf/`)

| Code-side file        | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `zarf.yaml`           | Zarf v0.76+ `ZarfPackageConfig` — 10 components.         |
| `README.md`           | Customer install flow + decision summary.                |
| `component-budget.md` | Per-component compressed size budget.                    |

## Integration map

### Producers (services emit images / charts into the bundle)

- **M3 (Identity + tenancy):** `identity-core-service`, `tenancy-core-service`
- **M4 (Builder + workflow):** `builder-core-service`, `workflow-core-service`
- **M5 (Codegen):** `codegen-core-service`
- **M6 (Patient + HealthStack):** `patient-core-service`, `healthstack-patient-service`
- **M7 (post-wave-done):** 5 services to be added once #21 wave-done

Each service ships paired `*-migrator` image emitted by
`curaos/tools/codegen/templates/service-core/` per
[[curaos-generator-evolution-rule]].

### Consumers (downstream stories that read this layout)

- **M8-S2** — Migration job manifests + Dockerfile.migrator template
- **M8-S3** — `curaos-umbrella` Helm chart
- **M8-S4** — Image build pipeline (per-tool digests) + cosign keyed signing
  workflow + offline-verify ClusterImagePolicy (this M8-S4 lane, issue #86;
  contract pinned in [ADR-0211](../../docs/adr/0211-cosign-offline-keyed-contract.md))
- **M8-S5** — Rollback runbook + N-1 retention policy + key-rotation overlap
- **M8-S6** — `assert-zero-egress.sh` post-deploy harness (renamed from S7)
- **M9+** — Delta bundles via `zarf package create --differential=<prev>` + multi-key
  cosign federation (per-service keys) per ADR-0211 §8

### Must-not-break invariants

- **Install order.** Layers 0-4 are required base; reordering breaks chart dependency
  resolution. Migration Jobs (layer 8) MUST run before service Deployments (layer 9) via
  Helm pre-install hook weight `-5`.
- **Optional flag stability.** `--components=...` contract must keep `harbor-registry`
  and `glitchtip-pyrra` as the only optional layers.
- **Size ceiling.** Hard ceiling 12 GB compressed; soft target 8 GB. CI bundle-build
  gate fails on excess.
- **Digest pinning.** Every image carries `@sha256:<digest>` per
  [[curaos-version-pinning-rule]]. CI same-tool determinism gate
  (`repro-build.yml`, 4 jobs = 2 tools × 2 platforms) fails the release pipeline
  if any tool drifts across two consecutive runs. Cross-tool digest parity
  (BuildKit ≡ Buildah byte-identical) is infeasible by design and **NOT gated**
  per ADR-0164 §2.4 resolution-pin (M8-S2 #84 v4 contract).
- **Hard air-gap.** Zero Internet calls during `zarf package deploy` — enforced by
  `ops/zarf/manifests/airgap-zero-egress.yaml` and asserted by M8-S6's Hubble-based
  harness.
- **#535 leak-detector hardening (landed).** The `assert-zero-egress.sh` DNS suffix
  allowlist no longer whitelists the bare `.local` TLD - it previously treated any
  `*.local.` name as in-cluster, leaving a DNS-label exfil channel (e.g.
  `exfil.attacker.local`). Only `*.cluster.local` and the reverse-DNS zones
  (`in-addr.arpa`, `ip6.arpa`) now count as internal; everything else is flagged as a
  leak. Regression-tested in `assert-zero-egress.test.ts`.
- **#535 DNS/apiserver reachability policy (operator-gated, NOT resolved here).** The
  `#330-B` finding was that an app pod could not reach kube-dns / the apiserver under the
  zero-egress policy. Adversarial analysis of the policy as written found this is NOT a
  simple manifest gap: standard kube-dns/coredns is already permitted by the existing
  bare `kube-system` `toEndpoints` rule (no `toPorts` = all ports, and Cilium resolves
  the ClusterIP VIP to the backing pod identity), and host-network node-local DNS is
  reached via the already-allowed `host`/`remote-node` entities - a `toEndpoints` label
  selector cannot match a host-network pod. So a speculative DNS allow rule was NOT added
  (it would be redundant or contradictory). Whether any flow was actually dropped, and
  the correct fix, require a live Cilium cluster to reproduce - operator-gated (#535-B).

## Data flow

```
release tag
  └─> CI image build (BuildKit) ──── digest A
        │                              │
        │                              ├── cosign sign + SBOM (syft)
        │                              │
        └─> CI bundle build (Zarf) ────┴──> curaos-vX.Y.Z.tar.zst.part0/1
                                                            │
                                  (USB / sftp / courier)    │
                                                            ▼
                                      operator: zarf package deploy …
                                                            │
                                                            ├── verify cosign signature offline
                                                            ├── push images to local registry (Layer 5 if present, else customer-supplied)
                                                            ├── install Helm charts in order (Layers 0→9)
                                                            └── Layer 8 migration Jobs run BEFORE Layer 9 service Deployments
```

## Decisions captured

- **Layout:** 10 layered Zarf components (research §D1 Approach A; bumped from 9 to add `curaos-k3s-init` with Cilium-safe flags per codex grill P0-3 fix).
- **Split:** `--max-package-size 4000` for FAT32 USB transport.
- **Size:** soft 8 GB, hard 12 GB; per-component table in `component-budget.md`.
- **Migration:** Option C (per-service migrator image; Helm pre-install hook weight -5).
- **Signing:** key-based cosign (research §D4); `cosign.pub` bundled as Layer 7 file
  component. M8-S4 ([#86](https://github.com/your-org/curaos-ai-workspace/issues/86))
  extended component 7 `signing-trust` with sigstore-policy-controller chart v0.10.6
  (appVersion 0.13.1, image digest-pinned) + `ClusterImagePolicy` enforcing keyed
  cosign verification for `ghcr.io/cura-care-oriented-stack/**` images.
  Air-gap-safe: `--insecure-ignore-tlog` on verify + `--tlog-upload=false` on sign;
  NO Fulcio / NO Rekor / NO OIDC. Contract pinned in
  [ADR-0211](../../docs/adr/0211-cosign-offline-keyed-contract.md). PR-time +
  deploy-time verification harness at `curaos/tools/verify/cosign-verify.sh`.
  Release-tag signing workflow at `.github/workflows/cosign-sign.yml`
  (gated on `secrets.COSIGN_PRIVATE_KEY` — skips gracefully on fork PRs).
  Admission-rejection negative test at `.github/workflows/cosign-verify.yml`
  (ephemeral k3d cluster + policy-controller + unsigned-image-denied assertion).
- **Versioning:** forward-only Drizzle migrations + CNPG PITR (research §D5).

## Open items (handed to downstream M8 stories)

- Image digests + chart exact pins (M8-S4 image-build half; M8-S5 wires the
  CuraOS-owned image refs once the build pipeline produces real digests)
- Rollback runbook + N-1 retention policy (M8-S5)

## Landed (no longer open)

- `manifests/migration-jobs.yaml` — M8-S2 landed
- `charts/curaos-umbrella/` — M8-S3 landed
- `assets/cosign.pub` + key rotation procedure — M8-S4 landed via #86; rotation
  cadence + procedure pinned in ADR-0211 §5
- `scripts/assert-zero-egress.sh` + `tools/build/zarf-zero-egress-check.sh` — landed, M8-S6
