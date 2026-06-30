---
name: curaos-airgap-rule
title: Air-gap (Zarf singular format)
description: Air-gap packaging - Zarf is the singular release format; one `curaos-vX.Y.Z.tar.zst` per release bundles K3s + Cilium + CNPG + GlitchTip + Pyrra + Harbor mirror + 96 service Helm charts + signed images + SBOM; mutating webhook auto-rewrites image refs at deploy
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, after Decision-10 walkthrough - grounded in D0/D3/D4/D5/D6/D9 stack picks):

## The rule

**Zarf is the only air-gap packaging format for CuraOS.** ONE artifact per release: `curaos-vX.Y.Z.tar.zst`. Customer command to install/upgrade: `zarf package deploy curaos-vX.Y.Z.tar.zst`.

| Deployment context | Tool |
|---|---|
| Air-gap on-prem release delivery | **Zarf** |
| Home lab single-node install (per AGENTS.md §4) | **Zarf** w/ `init --components=k3s` |
| Cloud SaaS deploy (network OK) | Helm + ArgoCD directly (Zarf overkill; just registry pull) |
| Hybrid (vendor control plane network OK + customer data plane air-gap) | both: ArgoCD for control plane; Zarf for customer data plane |
| Per-tenant package customization | Zarf variables in `zarf.yaml` |

## Banned

- Manual tarball releases (no signing/SBOM by default; no image-ref rewrite; agent-unfriendly)
- Per-tenant custom packaging formats (one Zarf bundle; per-tenant via variables)
- Air-gap deploys without cosign signature verification (admission controller rejects)
- Cloud-only IaC for any deployment profile (per AGENTS.md §4 all profiles same artifacts)
- Skipping SBOM in release package (mandatory)

<!-- fold: rationale, non-binding -->

## Why Zarf (vs Hauler / Carvel imgpkg / manual tarball)

| Capability | Zarf | Hauler | Carvel imgpkg | Manual |
|---|---|---|---|---|
| Single binary install | yes | yes | yes (needs kapp-controller) | n/a |
| Image registry mirror auto-rewrite (mutating webhook) | yes | manual | partial | manual |
| K3s embedded for net-new cluster install | yes (`--init-package`) | no | no | manual |
| SBOM auto-emit (per [[curaos-image-build-rule]]) | yes | partial | partial | manual |
| Cosign signing of package + components | yes | yes | yes | manual |
| Helm chart bundling (96 services) | yes | yes | yes | yes |
| Multi-arch image bundling (amd64 + arm64) | yes | yes | yes | manual |
| OpenSSF/CNCF affiliation | OpenSSF graduated (Defense Unicorns) | none | CNCF Incubating | n/a |
| 2025-2026 momentum | very high | growing | stable VMware-tied | n/a |
| Codegen recipe friendliness (per ADR-0123) | excellent (zarf.yaml template) | medium | medium | brittle |
| Per-tenant customization variables | declarative `zarf.yaml` | declarative | declarative | manual |
| Versioning + delta updates | yes | partial | yes | manual |
| Agent training data 2025-2026 | growing fast | low | medium | low |
| Customer install simplicity | `zarf package deploy <pkg>` | multi-step | multi-step | error-prone |

## `zarf.yaml` package definition (per release)

```yaml
# packages/curaos/zarf.yaml
kind: ZarfPackageConfig
metadata:
  name: curaos
  version: 1.2.3
  description: "CuraOS - Care Oriented Stack"
  url: https://github.com/your-org/curaos-ai-workspace
  architecture: multi  # amd64 + arm64

components:
  - name: k3s
    required: true
    import:
      url: oci://defenseunicorns.com/packages/init:v0.x.y
      name: k3s

  - name: cilium
    required: true
    description: "CNI per ai/rules/curaos_cni_rule.md (D3)"
    charts:
      - name: cilium
        url: https://helm.cilium.io
        version: 1.16.x
        namespace: kube-system
        valuesFiles:
          - values/cilium.yaml
    images:
      - quay.io/cilium/cilium:v1.16.x
      - quay.io/cilium/hubble-relay:v1.16.x

  - name: cnpg-operator
    required: true
    description: "PostgreSQL operator per ai/rules/curaos_postgres_rule.md (D4)"
    charts:
      - name: cloudnative-pg
        url: https://cloudnative-pg.io/charts/
        version: 0.24.0
        namespace: cnpg-system
    images:
      # CNPG 1.29.1 fixes CVE-2026-44477 (CVSS 9.4) - bumped M9-S7 #104. Pin
      # exact + digest per [[curaos-version-pinning-rule]]; Renovate refreshes.
      - ghcr.io/cloudnative-pg/cloudnative-pg:1.29.1
      - ghcr.io/cura-care-oriented-stack/postgresql-citus:17.2-citus13-curaos0.1.0

  # Strimzi operator - Kafka CONNECT-ONLY (Debezium WAL CDC → Redpanda). NOT a
  # Strimzi-managed broker; Redpanda stays the one broker. Added M9-S7 #104.
  - name: strimzi-connect
    required: true
    description: "Strimzi Kafka Connect-only + Debezium PG plugin per ai/rules/curaos_airgap_rule.md (D7)"
    charts:
      - name: strimzi-kafka-operator
        url: https://strimzi.io/charts/
        version: 0.46.1
        namespace: redpanda
    images:
      - quay.io/strimzi/operator:0.46.1
      - quay.io/strimzi/kafka:0.46.1-kafka-3.8.0

  - name: glitchtip
    required: true
    description: "Error tracking per ai/rules/curaos_error_tracking_rule.md (D5)"
    charts:
      - name: glitchtip
        localPath: ./charts/glitchtip
        version: 4.x.x
        namespace: observability
    images:
      - glitchtip/glitchtip:v4.x.x

  - name: pyrra
    required: true
    description: "SLO mgmt per ai/rules/curaos_slo_rule.md (D6)"
    charts:
      - name: pyrra
        url: https://pyrra-dev.github.io/pyrra/
        version: 0.x.x
        namespace: observability
    images:
      - ghcr.io/pyrra-dev/pyrra:v0.x.x

  - name: harbor
    required: true
    description: "Local image registry mirror"
    charts:
      - name: harbor
        url: https://helm.goharbor.io
        version: 1.15.x
        namespace: registry
    images:
      - goharbor/harbor-core:v2.x.x
      - goharbor/harbor-portal:v2.x.x
      # ... full Harbor image set

  - name: curaos-services
    required: true
    description: "All 72 backend services + 22 frontend apps + foundation"
    charts:
      - name: curaos-umbrella
        localPath: ./charts/curaos-umbrella
        version: 1.2.3
        namespace: curaos
    images:
      # 96 service images (auto-generated from service list)
      - harbor.curaos-ops/services/identity-service:v1.2.3
      # ...

variables:
  - name: TENANT_TIER
    description: "tenant tier: smb | enterprise | regulated"
    default: smb
  - name: DOMAIN
    description: "cluster base domain"
    default: curaos.local
  - name: BACKUP_TARGET_S3_ENDPOINT
    description: "MinIO endpoint for CNPG Barman backup (per D4)"
    default: minio.curaos-ops.svc.cluster.local
  - name: ERROR_TRACKER_DSN
    description: "GlitchTip DSN (per D5)"
```

## Build pipeline (per [[curaos-image-build-rule]] D9)

```yaml
# .github/workflows/release-zarf.yml
on:
  push:
    tags: ['v*']
jobs:
  zarf-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: defenseunicorns/setup-zarf@main
      - uses: sigstore/cosign-installer@v3
      - uses: anchore/sbom-action@v0
      - name: Build Zarf package
        run: |
          zarf package create packages/curaos \
            --confirm \
            --max-package-size=2000 \
            --skip-sbom=false \
            --differential=v1.2.2  # delta from previous release
      - name: Sign package
        run: |
          cosign sign-blob --yes --output-signature curaos-v1.2.3.tar.zst.sig curaos-v1.2.3.tar.zst
      - name: Upload to releases
        uses: softprops/action-gh-release@v2
        with:
          files: |
            curaos-v1.2.3.tar.zst
            curaos-v1.2.3.tar.zst.sig
            sbom.cdx.json
```

## Customer install flow

```bash
# Customer downloads package via secure channel (USB, sftp, etc.)
zarf package deploy curaos-v1.2.3.tar.zst \
  --set TENANT_TIER=enterprise \
  --set DOMAIN=cluster.mercy-hospital.example \
  --confirm

# Zarf:
# 1. Verifies cosign signature
# 2. Initializes K3s if not present (init-package)
# 3. Pushes images to local Zarf registry (or pre-existing Harbor)
# 4. Mutating webhook rewrites image refs at deploy time (no Helm chart edits)
# 5. Installs Cilium → CNPG → GlitchTip → Pyrra → Harbor → curaos-services
# 6. Reports status; rolls back on failure
```

## Delta updates (versioning)

```bash
# v1.2.3 → v1.2.4 patch
zarf package create packages/curaos --differential=v1.2.3
# Produces minimal patch package (only changed images + chart diffs)

# Customer applies
zarf package deploy curaos-v1.2.4-diff-v1.2.3.tar.zst --confirm
```

## Per-tenant customization

Variables in `zarf.yaml` injected at deploy time. Per-tenant `values-tenant.yaml` overrides on top of base chart values. Tenant onboarding pipeline generates per-tenant Helm value file + applies via Zarf component variable.

## Cloud SaaS path (no Zarf)

Per [[curaos-orchestration-rule]] D0 + [[curaos-local-vs-3rdparty-rule]]:
- Cloud SaaS profile (network OK; CuraOS-managed cluster): ArgoCD ApplicationSet pulls Helm charts from internal Harbor; images pulled directly from Harbor; NO Zarf bundle
- Hybrid profile: vendor control plane = ArgoCD path; customer data plane = Zarf bundle

Same Helm charts source-of-truth (in curaos/helm/) for both paths. Zarf packages the charts + images for offline delivery; ArgoCD pulls them online.

## Modulith ↔ standalone compliance

Per [[curaos-modulith-standalone-rule]]:
- Standalone clone single service: NOT a Zarf concern; standalone clone uses docker-compose.dev.yml per D0
- Modulith mode: same; dev infra Compose
- Prod air-gap: Zarf bundle (single artifact)
- Prod cloud SaaS: ArgoCD + Helm direct (no Zarf)

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | Zarf OSS (OpenSSF); no cloud dependency |
| AGENTS.md §4 air-gap (Home lab + single-tenant offline) | Zarf is designed for this; single artifact + K3s embedded |
| AGENTS.md §8 security gates | cosign signing + SBOM attestation in package metadata |
| [[curaos-orchestration-rule]] (D0) | K3s embedded in init-package; same K3s + Cilium + CNPG stack |
| [[curaos-cni-rule]] (D3) | Cilium Helm chart + images bundled as component |
| [[curaos-postgres-rule]] (D4) | CNPG operator + CNPG-PostgreSQL images bundled |
| [[curaos-error-tracking-rule]] (D5) | GlitchTip chart + image bundled |
| [[curaos-slo-rule]] (D6) | Pyrra chart + image bundled |
| [[curaos-image-build-rule]] (D9) | Per-service images signed (cosign) + SBOM (syft) → Zarf bundles signed images + attestations |
| [[curaos-local-vs-3rdparty-rule]] | Local provider default (Zarf bundles all CuraOS-managed components); tenant 3rd-party (e.g., external PG) handled via deploy-time variables |
| [[curaos-ai-mirror-rule]] | packages/curaos/zarf.yaml lives in curaos/ops/zarf/; ai-doc mirror at ai/curaos/ops/zarf/ documents per-release contents |

## Agentic-tool friendliness

Why Zarf wins for AI agents specifically:
- Declarative `zarf.yaml` → agents author packages from spec; predictable schema
- Single CLI (`zarf`) w/ predictable subcommands (`create`, `deploy`, `inspect`, `tools`)
- Mutating webhook is hidden complexity → agents don't write per-Helm-chart image-rewrite logic
- Differential updates → agents reason about minimal patches between releases
- Variables system → agents inject per-tenant values declaratively
- Pairs w/ kubernetes-mcp-server (per [[curaos-orchestration-rule]]) to inspect deploys post-install
- Predictable artifact format (one .tar.zst) → CI artifact handling trivial

## How to apply

- One `packages/curaos/zarf.yaml` per release at curaos/ops/zarf/
- Codegen Engine recipe (per ADR-0123) emits per-component Zarf manifest entries automatically from service list
- CI builds Zarf package on tag push (`.github/workflows/release-zarf.yml`)
- Customer delivery: GitHub Release artifact + sigstore signature
- Customer install: single `zarf package deploy <pkg>` command + tenant-tier variable
- AI-doc per release `ai/curaos/docs/releases/vX.Y.Z.md` documents what bundled + variable defaults
- Per-tenant `values-tenant-<name>.yaml` injected at deploy via Zarf variables

## ADRs

The actual filed air-gap ADR is `0158-air-gap-bundle-sla.md`. Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for current ADR<->rule mapping. ADR-0145/0144/0136 were never filed at those numbers.
