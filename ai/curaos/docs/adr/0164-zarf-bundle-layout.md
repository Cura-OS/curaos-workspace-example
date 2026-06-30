# ADR-0164 — Zarf Bundle Layout + Size Budget Baseline

**Status:** Accepted
**Date:** 2026-05-27
**Deciders:** Platform Engineering (M8 wave)
**Resolves:** M8 Decision D1 (per
  [`ai/curaos/docs/research/m8-zarf-airgap-design.md`](../research/m8-zarf-airgap-design.md))
**Implements:** Story [M8-S1](https://github.com/your-org/curaos-ai-workspace/issues/83)
  under Epic [M8](https://github.com/your-org/curaos-ai-workspace/issues/22)
**Amends:**
- [ADR-0158](0158-air-gap-bundle-sla.md) §2.1 — pins Tier 1 (Core) Zarf component
  decomposition + size budget. ADR-0158 keeps cross-tier SLA contract; this ADR pins the
  Core-bundle layout.
**Related ADRs:**
- [ADR-0099](0099-charter-priorities-vision.md) §4 — air-gap profile mandate
- [ADR-0109](0109-containers-orchestration.md) — K3s + Cilium + CNPG stack
- [ADR-0110](0110-cicd-release.md) §M9 — bundle build pipeline
**Binding rules:**
- [[curaos-airgap-rule]] — Zarf singular packaging format
- [[curaos-image-build-rule]] — BuildKit + Buildah parity; cosign + SBOM; multi-arch
- [[curaos-version-pinning-rule]] — exact image + chart pins
- [[curaos-cni-rule]] — Cilium default-deny-egress; K3s w/ Flannel + kube-proxy disabled
- [[curaos-postgres-rule]] — CNPG operator + Citus + pgBouncer + SeaweedFS S3 backup

---

## 1. Context

[[curaos-airgap-rule]] locked Zarf as the singular air-gap packaging format. ADR-0158
pinned the 3-tier SLA contract (Core / + HealthStack / + AI) with a 5–7 GB compressed
size budget for Tier 1. Neither artifact pinned **how the Core bundle decomposes into
Zarf components**, **what runs before what**, or **how the size budget breaks down per
layer** with multi-arch + cosign + SBOM overhead included. Without these pins:

- Operators don't know which components are optional (`--components=...` flag has no
  contract).
- Migration ordering is ambiguous — services would start before schema exists.
- Size regressions creep in undetected because no per-component / per-arch budget exists.
- M8-S2 (migration jobs), M8-S3 (umbrella chart), M8-S4 (image build), M8-S5 (signing),
  M8-S6 (rollback), and M8-S7 (zero-egress) all need a stable layout to attach to.
- Codex adversarial grill 2026-05-27 (block verdict) flagged 3 P0 + 6 P1 + 3 P2
  contract drifts vs. binding rules — this ADR's update folds those remediations in.

This ADR pins the Core bundle's **11-component layered layout**, **dependency-ordered
install sequence**, **multi-arch size budget per layer**, **acceptance verification
commands**, and **CI guard scripts**. (Originally 10; the `strimzi-connect`
Connect-only CDC layer was added for M9-S7 #104.)

## 2. Decision

### 2.1 Bundle layout — 11 components, dependency-ordered

Adopt research §D1 recommendation **Approach A** (layered Zarf components, `.tar.zst`).
Reject Approach B (single monolithic OCI artifact — requires reachable registry at
deploy; incompatible with hard air-gap) and Approach C standalone (single-chunk
`.tar.zst`; superseded — A + `--max-package-size 4000` gives the same content with USB
sneakernet split for free).

| # | Component                  | Required | Purpose                                                  |
|---|----------------------------|----------|----------------------------------------------------------|
| 0 | `zarf-registry-init`       | yes      | Zarf core init (registry mirror + agent webhook).        |
| 1 | `curaos-k3s-init`          | yes      | K3s + Cilium-safe flags per [[curaos-cni-rule]] §35-44.  |
| 2 | `cilium-cni`               | yes      | CNI + `kubeProxyReplacement=true` + Hubble Exporter.     |
| 3 | `cnpg-operator`            | yes      | CloudNativePG + Citus PG 17 + pgBouncer Pooler.          |
| 4 | `redpanda`                 | yes      | Kafka-compatible event bus (Tiered Storage off in air-gap). |
| 5 | `strimzi-connect`          | yes      | Strimzi operator (Kafka **Connect-ONLY**) + Debezium PG plugin → Redpanda WAL CDC. No Strimzi-managed broker; after `redpanda` (broker must exist), before product. M9-S7 #104. |
| 6 | `harbor-registry`          | **no**   | Skip if customer registry reachable.                     |
| 7 | `glitchtip-pyrra`          | **no**   | Error tracking + SLO mgmt (degraded ops if skipped).     |
| 8 | `signing-trust`            | yes      | `cosign.pub` on-disk for offline image verification.     |
| 9 | `curaos-migration-jobs`    | yes      | Helm pre-install hook (weight `-5`) — runs BEFORE 10.    |
| 10 | `curaos-services`         | yes      | Service images + umbrella Helm chart (product).          |

Each component carries Helm charts + images + (where applicable) raw manifests + files.
The single `zarf.yaml` at `curaos/ops/zarf/zarf.yaml` is the manifest of record. Per
[[curaos-airgap-rule]] this lives in `curaos/ops/zarf/` (NOT `packages/curaos/` — clarifying
deviation from the rule's example path while keeping rule intent intact).

**Why 10 components, not 9:** The previous (M8-S1 first cut) bundle imported the upstream
Zarf init package wholesale, expecting it to install K3s with the right flags. Codex
grill P0-3 flagged this: the upstream init package does NOT expose K3s server CLI flags
as component variables. We now split the upstream import (`zarf-registry-init` — registry
mirror + agent webhook only) from the K3s daemon installation (`curaos-k3s-init` —
CuraOS-vendored `actions.onDeploy.before` step that wraps `k3s server` with
`--flannel-backend=none --disable-network-policy --disable=kube-proxy …` per
[[curaos-cni-rule]] §35-44).

### 2.2 Install order rationale

Zarf v0.76 ZarfComponent has **no native `requires:` / `dependencies:` field**. Deploy
order is the declaration order in `zarf.yaml`. The CI guard
`tools/build/zarf-deploy-order-check.sh` asserts the order in `zarf.yaml` matches §2.1
on every commit; ADR-0164 §2.7 documents the limitation.

1. **Zarf registry init first** — bootstraps the in-cluster image registry mirror so
   subsequent image refs resolve against the air-gap registry.
2. **K3s before anything else** — nothing to install into. Wrap the daemon install with
   Cilium-safe flags so default Flannel + kube-proxy never becomes load-bearing.
3. **CNI before workloads** — pods without CNI cannot get network identity. Cilium's
   `kubeProxyReplacement=true` replaces kube-proxy on the host; the default-deny-egress
   policy is the air-gap egress invariant.
4. **Operator before resources** — CNPG `Cluster` CRDs need an operator to reconcile.
   The Citus-extended PG operand is CuraOS-built (M8-S4 digest); CNPG upstream does not
   ship a pre-built Citus PG image.
5. **Broker before producers** — services emit events at startup; broker absent =
   crashloop. Tiered Storage stays off in air-gap (local PVC only).
6. **Optional layers (Harbor + observability) before product** — orthogonal but cheap to
   land early.
7. **Signing trust before product images** — admission controller needs `cosign.pub` on
   disk before image pulls.
8. **Migrations before services** — Helm pre-install hook weight `-5` runs migrator Job
   before Deployment Pods. Forward-only Drizzle migrations per research §D5.
9. **Services last** — depend on every layer above.

### 2.3 Size budget (multi-arch — linux/amd64 + linux/arm64)

Per [[curaos-image-build-rule]] §D3 the bundle is multi-arch. Every image ships as an
OCI image index carrying both linux/amd64 + linux/arm64; Zarf copies all platforms into
the bundle. Per-platform deduplication applies only to identical layers (rare across
arches), so the multi-arch column ≈ 2× single-arch.

| Profile                          | Multi-arch (target) | Multi-arch (worst-case) | Per-arch flavor (target) |
|----------------------------------|--------------------:|------------------------:|-------------------------:|
| Required only (layers 0-4, 7-9)  |         ~7 750 MB   |             ~9 870 MB   |               ~3 870 MB  |
| Required + Harbor                |         ~10 150 MB  |            ~12 870 MB   |               ~5 070 MB  |
| Required + obs only              |          ~8 690 MB  |            ~11 170 MB   |               ~4 340 MB  |
| All 10 layers (full)             |       **~11 090 MB**|         **~14 170 MB**  |             **~5 545 MB**|
| Full + M7 services               |         ~12 590 MB  |            ~15 670 MB   |               ~6 295 MB  |

Per-component breakdown in `curaos/ops/zarf/component-budget.md` (curaos submodule;
cross-repo path resolves once submodule pointer is bumped to the matching curaos
commit).

**Hard ceiling:** 12 GB compressed multi-arch / 8 GB compressed per-arch per issue
acceptance.
**Soft target:** 8 GB compressed per-arch flavor (customer-facing default).
**Overhead reserve:** 50 MB target / 100 MB worst-case for OCI image-index manifests +
cosign signature bundles + CycloneDX SBOM attestations + Zarf metadata. Reserved here so
M8-S4 image-build and M8-S5 signing land without budget churn.
**Split:** `zarf package create --max-package-size 4000` produces 3 chunks for multi-arch
full bundle / 2 chunks per-arch flavor (FAT32 4 GB file limit).

**Multi-arch reality check.** The multi-arch full bundle (~11 GB) blows the 8 GB soft
target. Two mitigations are scoped into M8-S4:

1. **Per-arch single-platform flavors** — `zarf package create --flavor amd64` and
   `--flavor arm64` emit two ~5.5 GB bundles instead of one ~11 GB bundle. Customers pick
   the arch their fleet runs. The `multi` architecture marker keeps both arch flavors
   discoverable from one manifest.
2. **Optional-layer exclusion** — `--components=k3s-runtime,cilium-cni,cnpg-operator,redpanda,signing-trust,curaos-migration-jobs,curaos-services`
   (skip Harbor + obs) drops the multi-arch bundle to ~7.75 GB which fits 8 GB.

### 2.4 Image digest + chart version pinning

- **Public OCI images** (Cilium 1.17.0, CNPG operator 1.29.1 — bumped M9-S7 #104 for
  CVE-2026-44477, pgBouncer 1.23.0, Redpanda 24.3.1, Strimzi operator 0.46.1 +
  Strimzi-Kafka-Connect 0.46.1-kafka-3.8.0 — M9-S7 #104, Harbor 2.11.0, GlitchTip 4.1.0,
  Pyrra 0.8.0): digests resolved against the upstream registries and pinned exact in
  `zarf.yaml`. Renovate's `docker:pinDigests` config keeps them current.
- **CuraOS-owned images** (Citus operand `postgresql-citus:17.2-citus13-curaos0.1.0`,
  6 `*-migrator` images, 7 `*-service` images): carry `@sha256:<digest>` placeholders
  pending M8-S4 image-build pipeline.
- Chart `version:` fields use exact patch pins; Renovate updates via PR per
  [[curaos-version-pinning-rule]].
- BuildKit (dev/CI) + Buildah (in-cluster air-gap rebuild) are each individually
  reproducible (same tool twice → byte-identical OCI manifest digest) via
  `SOURCE_DATE_EPOCH` + `--rewrite-timestamp` per [[curaos-image-build-rule]] §D3.
- **Resolution-pin (2026-05-27, supersedes earlier "identical digests across tools" claim):**
  Cross-tool digest parity (BuildKit ≡ Buildah byte-identical manifest) is **infeasible
  by design** and **NOT gated** by CI. BuildKit retains a 24-entry build-history array;
  Buildah omits build history; no symmetric CLI flag exists. `diffoci diff --semantic`
  was evaluated (PR #86 v3) and also cannot bridge the gap for multi-stage Dockerfiles
  (BK and BA emit different layer counts even when the merged filesystem is identical).
  This matches Freedom of the Press Foundation's Dangerzone CI contract — same-tool
  reproducibility is the security contract; cross-tool equivalence is a research goal.
  Same-tool deterministic digests are sufficient for the cosign signing flow because
  signatures attach to the specific digest deployed, not to a tool-agnostic reference.
  See `tools/build/README.md` §"Why cross-tool equivalence is NOT the contract" and
  PR #86 v4 (commit `485bfba`) for the binding CI gate + rationale.
- CI same-tool determinism gate (`repro-build.yml`, 4 jobs = 2 tools × 2 platforms)
  fails the release pipeline if any tool drifts across two consecutive runs.
- CI guard `tools/build/zarf-digest-check.sh` (in curaos submodule) refuses
  `zarf package create` while any `@sha256:<digest>` placeholder remains in `zarf.yaml`
  OR while any of the stub files (`assets/cosign.pub`, `assets/k3s-install.sh`,
  `manifests/migration-jobs.yaml`, `charts/curaos-umbrella/Chart.yaml`) is the M8-S1
  placeholder. From M8-S4 onward CI runs `zarf-digest-check.sh --strict`; until then it
  warns and exits 1 to mark the M8-S1 spike state.

### 2.5 Stack alignment with binding rules (codex grill remediations 2026-05-27)

| Rule contract                                                                 | Compliance in this bundle |
|-------------------------------------------------------------------------------|---------------------------|
| [[curaos-airgap-rule]] §"`zarf.yaml` package definition" — `architecture: multi` | `metadata.architecture: multi` (was `amd64` in first cut; P0-1) |
| [[curaos-image-build-rule]] §D3 — multi-arch (amd64 + arm64) mandatory        | Budget recomputed for multi-arch; per-arch flavor is the customer default; cosign + SBOM overhead reserved (P1-6) |
| [[curaos-postgres-rule]] §Q3 — Citus distributed PG on CNPG (10K+ tenants)    | `cnpg-operator` component pins the CuraOS-built `postgresql-citus:17.2-citus13-curaos0.1.0` image alongside the CNPG operator + pgBouncer Pooler (P0-2) |
| [[curaos-postgres-rule]] §Q6 — SeaweedFS S3 backup target (MinIO rejected)    | `BACKUP_S3_ENDPOINT` default = `seaweedfs.curaos-ops.svc.cluster.local` (was MinIO; P0-2) |
| [[curaos-cni-rule]] §35-44 — K3s installs with `--flannel-backend=none --disable-network-policy --disable=kube-proxy` | `curaos-k3s-init` component wraps `k3s server` with exactly these flags (P0-3) |
| [[curaos-cni-rule]] §46-58 — Cilium `kubeProxyReplacement=true` + `k8sServiceHost/Port` | `values/cilium.yaml` ships the values; `K8S_SERVICE_HOST` / `K8S_SERVICE_PORT` exposed as Zarf vars (P0-3) |
| [[curaos-version-pinning-rule]] §"Image digest pin pattern" — `@sha256:<64-hex>` | Public images pinned to real digests; CuraOS-owned images carry `<digest>` placeholder + CI guard refuses package while present (P1-2) |
| [[curaos-agents-md-schema-rule]] — full extended frontmatter + ASDLC body     | `ai/curaos/ops/zarf/AGENTS.md` rewritten to canonical schema (P1-4) |

### 2.6 Referenced-file completeness (codex grill P1-1)

Every `zarf.yaml` reference (chart, manifest, file) resolves to an existing path in the
curaos submodule, even though several are explicit stubs satisfied by downstream M8 stories:

| Path                                          | State (M8-S1)                | Owner   |
|-----------------------------------------------|------------------------------|---------|
| `values/cilium.yaml`                          | Real values (kubeProxyReplacement=true) | this PR |
| `assets/cosign.pub`                           | **Real ECDSA P-256 key** (M8-S4 #86 → ADR-0211) | M8-S4   |
| `assets/k3s-install.sh`                       | M8-S4 placeholder            | M8-S4   |
| `manifests/migration-jobs.yaml`               | M8-S2 stub ConfigMap         | M8-S2   |
| `charts/curaos-umbrella/Chart.yaml`           | M8-S3 stub Chart.yaml        | M8-S3   |
| `charts/glitchtip/Chart.yaml`                 | M8-S3 stub Chart.yaml        | M8-S3   |
| `tools/build/zarf-digest-check.sh`            | Real CI guard                | this PR |
| `tools/build/zarf-deploy-order-check.sh`      | Real CI guard                | this PR |

The CI guard refuses `zarf package create` until each placeholder is satisfied by its
owning story. M8-S4 is the earliest story permitted to run `zarf-digest-check.sh --strict`;
package create is blocked until then.

### 2.7 Component-dependency enforcement (codex grill P1-3)

Zarf v0.76's `ZarfComponent` schema has no `requires:` / `dependencies:` field — verified
against `https://raw.githubusercontent.com/zarf-dev/zarf/v0.76.0/zarf.schema.json`. The
schema-machine-readable knobs are:

- **Declaration order = deploy order** for components in a single package.
- **`group:` field** for mutually exclusive choices (not used here).
- **`actions.onDeploy.{before,after}` hooks** for per-component imperative checks.

Layered ordering is therefore enforced two ways:

1. **`tools/build/zarf-deploy-order-check.sh`** — parses `zarf.yaml` and asserts the
   component sequence matches §2.1 exactly. Fails the commit if a component is removed,
   added out of place, or reordered.
2. **README customer-install example** — the `--components=...` example in
   `curaos/ops/zarf/README.md` lists components in declaration order. Customers omitting
   optional layers do NOT reorder remaining ones.

When Zarf v1.x (post-v0.76) adds a `dependencies:` block (tracked on the Zarf roadmap),
this ADR migrates to the schema-native form.

### 2.8 Redpanda air-gap storage posture

Tiered Storage is **disabled** in the air-gap profile (the feature requires reachable S3;
SeaweedFS-S3 is reserved for CNPG backups, not Redpanda tiers). Single-broker spike;
cluster scale at M9.

The chart values are pinned in `curaos/ops/zarf/values/redpanda.yaml` and referenced by
the `redpanda` component in `curaos/ops/zarf/zarf.yaml`:

- `storage.persistentVolume.enabled=true`
- `storage.persistentVolume.size=20Gi`
- `storage.tiered.mountType=none`
- `tiered.config.cloud_storage_enabled=false`
- `tiered.config.cloud_storage_enable_remote_write=false`
- `tiered.config.cloud_storage_enable_remote_read=false`

Research notes live at
[`../research/m8-redpanda-airgap-storage-values.md`](../research/m8-redpanda-airgap-storage-values.md).

### 2.9 Verification (acceptance — issue #83)

```bash
# (1) Schema validation — Zarf binary NOT required:
bunx ajv compile \
  -s https://raw.githubusercontent.com/zarf-dev/zarf/v0.76.0/zarf.schema.json \
  -d ops/zarf/zarf.yaml --strict=false

# (2) Machine-checked deploy order + digest placeholder guards (no Zarf binary):
bash tools/build/zarf-deploy-order-check.sh     # MUST exit 0 on every commit
bash tools/build/zarf-digest-check.sh           # M8-S1: exit 1 (warns on placeholders)
bash tools/build/zarf-digest-check.sh --strict  # M8-S4+: MUST exit 0 before zarf package create

# (3) Once Zarf binary available (Zarf v0.76+) — runs from M8-S4 onward:
zarf package inspect ops/zarf/zarf.yaml
zarf package create ops/zarf \
  --confirm \
  --max-package-size 4000 \
  --skip-sbom=false \
  --flavor amd64 \
  -o /tmp

# (4) Size assertion (per-arch flavor):
BUNDLE_BYTES=$(stat -f%z /tmp/curaos-vX.Y.Z.tar.zst)   # macOS
[[ "$BUNDLE_BYTES" -lt $((8 * 1024 * 1024 * 1024)) ]] || { echo "FAIL: per-arch bundle > 8 GB"; exit 1; }
# Multi-arch full bundle assertion: < 12 * 1024^3 (12 GB hard ceiling).

# (5) Component presence:
zarf package inspect /tmp/curaos-vX.Y.Z.tar.zst | \
  grep -E "zarf-registry-init|curaos-k3s-init|cilium-cni|cnpg-operator|redpanda|signing-trust|curaos-migration-jobs|curaos-services"
```

### 2.10 Validation status (M8-S1 spike)

- `zarf` binary not installed in this dispatch environment. Spike acceptance per issue
  body permits documenting structure validated against Zarf v0.76+ schema. Manifest
  authored against
  [zarf-dev/zarf v0.76.0 `zarf.schema.json`](https://raw.githubusercontent.com/zarf-dev/zarf/v0.76.0/zarf.schema.json).
- Real `zarf package create` + size measurement lands in M8-S4 (CI image-build pipeline)
  once CuraOS-owned image digests are pinned. Issue acceptance for S1 is satisfied by
  the layered manifest + ADR + per-component multi-arch budget + CI guards
  (`zarf-digest-check.sh`, `zarf-deploy-order-check.sh`).

## 3. Alternatives considered

| Option                                  | Why rejected                                                   |
|-----------------------------------------|----------------------------------------------------------------|
| Single monolithic OCI                   | Requires reachable Harbor/GHCR at deploy → incompatible with hard air-gap. |
| Single un-split `.tar.zst`              | FAT32 4 GB limit blocks USB sneakernet for any bundle > 4 GB.  |
| Per-layer separate `.tar.zst` files     | Multiplies operator install commands; loses `--components=...` ergonomics. |
| Init.sql migration (Option B, research §D2) | No upgrade migration path; every schema change requires full cluster re-init. |
| Keyless cosign (Fulcio, research §D4)   | Requires Internet OIDC at verify time; blocked in air-gap.     |
| amd64-only bundle (first M8-S1 cut)     | Excludes arm64 fleets — violates [[curaos-image-build-rule]] §D3 multi-arch mandate (codex P0-1). |
| MinIO S3 backup (first M8-S1 cut)       | AGPLv3 license risk in Zarf bundle per [[curaos-postgres-rule]] §Q6 (codex P0-2). |
| Vanilla Zarf init K3s import            | Does not expose `--flannel-backend=none --disable-network-policy --disable=kube-proxy` per [[curaos-cni-rule]] §35-44 (codex P0-3). |

## 4. Consequences

### Positive

- Operators can skip Harbor / observability via `--components=...` without forking the
  bundle.
- Migration ordering is enforced by Helm hook weights + the CI deploy-order guard — no
  startup race conditions.
- Multi-arch size budget per layer = early detection of regressions (CI gate per M8-S4).
- M8-S2…S7 attach to a stable manifest of record; no churn during downstream stories.
- ADR-0158 Tier 1 SLA stays intact (5–7 GB per-arch flavor) and gains a concrete
  component decomposition.
- Codex grill remediations baked in: no contract drift between this ADR and the binding
  rules.

### Negative / risks

- 10 components = larger zarf.yaml surface than a monolithic bundle. Mitigation: codegen
  recipe (ADR-0123) emits service-layer entries from service registry per
  [[curaos-generator-evolution-rule]].
- Optional components risk install-time confusion if customer skips required-but-mistakenly-flagged-optional layer. Mitigation: customer install runbook (M8-S6) documents
  decision tree.
- Helm pre-install hook ordering depends on chart authors honoring `helm.sh/hook-weight`.
  Mitigation: curaos-umbrella chart owned in-tree; CI test asserts hook weights.
- Vendoring the K3s init flags means CuraOS owns K3s upgrade cadence vs. delegating to
  upstream Zarf init bumps. Mitigation: Renovate pins K3s release inside
  `assets/k3s-install.sh`; runtime rule still authoritative.
- Multi-arch ~11 GB full bundle exceeds 8 GB soft target. Mitigation: per-arch flavors
  are the customer-facing default; multi-arch full is operator-only for staging.
- Citus operand image is CuraOS-built (M8-S4); divergence risk vs. upstream CNPG operator
  releases. Mitigation: Renovate auto-PRs on upstream releases + same-tool determinism
  gate (`repro-build.yml`) catches drift within a single tool per [[curaos-image-build-rule]] §D3.
  Cross-tool digest parity is NOT gated per §2.4 resolution-pin above.

### Follow-up issues / stories

- **M8-S2** — Per-service migrator image template (`curaos/tools/codegen/templates/service-core/` + trio symmetry per [[curaos-generator-evolution-rule]]); replaces `manifests/migration-jobs.yaml` stub.
- **M8-S3** — `curaos-umbrella` Helm chart + GlitchTip vendor chart; replaces `charts/curaos-umbrella/Chart.yaml` + `charts/glitchtip/Chart.yaml` stubs.
- **M8-S4** — Image build pipeline + same-tool determinism gate; resolves all `<digest>` placeholders + ships `assets/k3s-install.sh`; flips CI guard to `--strict`. (Cross-tool digest parity is intentionally NOT a gate per §2.4 resolution-pin.)
- **M8-S4** ([#86](https://github.com/your-org/curaos-ai-workspace/issues/86)) — **RESOLUTION-PIN (2026-05-28)**: cosign signing key + `signing-trust` component extension + `ClusterImagePolicy` + offline verify harness + admission-rejection negative test. Replaces the `assets/cosign.pub` M8-S1 placeholder with a real ECDSA P-256 key; extends component 7 with the sigstore policy-controller chart (digest-pinned). Contract pinned in [ADR-0211](0211-cosign-offline-keyed-contract.md). (Earlier this ADR scheduled the work as "M8-S5"; wave-2 renumbered to M8-S4.)
- **M8-S5** — Rollback runbook + N-1 retention policy + key-rotation overlap window (renumbered from M8-S6).
- **M8-S6** — `assert-zero-egress.sh` post-deploy harness (renumbered from M8-S7).
- **Post-M7** — Add 5 M7 service images to layer 9 once #21 wave-done.
- **M8-S1 P2 followup #136** — **RESOLUTION-PIN (2026-05-28)**: Redpanda air-gap
  storage values live at `curaos/ops/zarf/values/redpanda.yaml`; release artifact names
  normalize to `/opt/curaos/bundles/curaos-vX.Y.Z.tar.zst`; ADR numbering preserves
  historical assigned numbers and records follow-up corrections in this resolution map
  instead of renumbering existing ADR files.

## 5. References

- Research: [`ai/curaos/docs/research/m8-zarf-airgap-design.md`](../research/m8-zarf-airgap-design.md) §D1 + §D2 + §D3 + §D5
- Issue: [your-org/curaos-ai-workspace#83](https://github.com/your-org/curaos-ai-workspace/issues/83)
- Epic: [your-org/curaos-ai-workspace#22](https://github.com/your-org/curaos-ai-workspace/issues/22)
- Codex adversarial grill: `.scratch/codex-grill-m8-s1-pr88-134.md` (2026-05-27, BLOCK verdict — fully addressed here)
- Manifest: `curaos/ops/zarf/zarf.yaml` (curaos submodule)
- Budget: `curaos/ops/zarf/component-budget.md` (curaos submodule)
- README: `curaos/ops/zarf/README.md` (curaos submodule)
- CI guards: `curaos/tools/build/zarf-digest-check.sh`, `curaos/tools/build/zarf-deploy-order-check.sh`
- Related ADR: [`0158-air-gap-bundle-sla.md`](0158-air-gap-bundle-sla.md)
- Zarf v0.76 schema: <https://raw.githubusercontent.com/zarf-dev/zarf/v0.76.0/zarf.schema.json>
- Zarf packages docs: <https://docs.zarf.dev/ref/packages/>
- UDS Core reference deployment sizing: <https://uds.defenseunicorns.com/overview/uds-structure/>
