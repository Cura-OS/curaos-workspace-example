---
name: curaos-orchestration-rule
title: Orchestration (K8s prod + Compose/Bun dev + Zarf air-gap)
description: Foundational orchestration - K8s everywhere prod (K3s default; Talos/RKE2 documented fallbacks) + Hybrid dev (Compose infra + Bun --hot host + k3d/Tilt for integration); containerd runtime + oven/bun:1 images + Zarf air-gap installer
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-0 walkthrough - elevated foundational pick that gates D3/D4/D5/D6/D9/D10):

## The rule

**CuraOS production runs on Kubernetes across every deployment profile. K3s is the default distro. Docker Compose is for dev only (infra deps + standalone-clone boot). k3d + Tilt are the integration-test layer.**

### Production (all 4 deployment profiles per AGENTS.md §4)

| Profile | K8s distro | Container runtime | Air-gap installer |
|---|---|---|---|
| Cloud SaaS | K3s default; customer EKS/GKE/AKS via local-vs-3rdparty | containerd | Zarf or Helm (network ok) |
| On-Prem (enterprise hospital) | K3s default; Talos OR RKE2 as documented fallback for regulated/FedRAMP/STIG tenants | containerd | Zarf single archive |
| Hybrid (control plane + data plane) | K3s both sides | containerd | Zarf |
| Home lab / Air-gap | K3s single-binary, 1-node SQLite mode | containerd | Zarf single archive |

**Fallback distros** (Talos for immutable on-prem, RKE2 for FedRAMP/STIG): documented in code + ADR but not built initially. Switching K3s ↔ Talos ↔ RKE2 = low friction (all CNCF-conformant; same Helm + manifests + CRDs) IF we follow the addon-disable rule below.

### Mandatory K3s install flags

Every K3s cluster boots with built-in addons DISABLED so we install portable replacements:

```bash
INSTALL_K3S_EXEC="--disable=traefik --disable=servicelb --disable=local-path --disable=metrics-server" k3s server
```

Then install our own:
- Ingress: ingress-nginx OR APISIX (decided separately)
- LoadBalancer: MetalLB (bare-metal) OR cloud LB
- Storage class: Longhorn / OpenEBS / Rook-Ceph / Piraeus (decided separately)
- Metrics: VictoriaMetrics (decided separately)

This rule eliminates the ONE migration footgun: K3s-specific addons becoming load-bearing. Don't depend on Traefik/ServiceLB/local-path defaults.

### Banned / off-default

- Docker Swarm (legacy, sparse 2025-2026 ecosystem)
- Bare systemd units for app code (orchestration-less, no self-healing)
- Compose as PROD orchestrator at scale (anti-pattern past v0.1 per research)
- K3s built-in addons (Traefik/ServiceLB/local-path/metrics-server) - disabled at install
- Kaniko for image builds (Google archived June 2025; replaced by BuildKit+Buildah per [[curaos-image-build-rule]])
- Per-service custom orchestrator picks (one platform, no snowflakes)

<!-- fold: rationale, non-binding -->

### Dev model - Hybrid Pattern 4 (DEFAULT)

| Layer | Tool | Purpose |
|---|---|---|
| Shared infra | Root `infra/docker-compose.yml` | PostgreSQL (CNPG image), Kafka/NATS, Valkey, MinIO, OpenBao, Verdaccio, observability stack - boots in ~5s; ~1-2GB RAM |
| Per-service runtime | `bun --hot run src/main.ts` natively on host | Sub-second hot reload; no container build cycle; native debugging |
| Subset orchestration | Turborepo `turbo dev --filter=<svc>...` | Boots service + transitive deps |
| Standalone-clone boot (per modulith_standalone_rule) | Per-service `docker-compose.dev.yml` shipped IN service repo | `git clone <single-service> && bun install && docker compose -f docker-compose.dev.yml up -d && bun start` works without monorepo |
| Pre-PR integration | `k3d cluster create curaos-dev` + Tilt | Deploy actual prod Helm charts to local K8s; verify chart correctness; ~6-10GB RAM |
| Agent introspection | `kubectl` + `k9s` TUI via Bash (per [[curaos-mcp-stack-rule]] CLI-first; Kubernetes MCP banned) | Agents query cluster state, apply manifests, exec into pods |

### Dev model - Always-on k3d Pattern 3 (DOCUMENTED ALTERNATIVE, not built yet)

Some dev setups w/ ample RAM (M3 Max+ 36GB+ etc.) MAY prefer always-on k3d:
- Boot k3d cluster once
- `helm install infra ./infra/helm-charts/` to deploy PG/Kafka/Valkey/MinIO/etc as Helm releases
- Tilt watches all services + live-updates pods on file change
- Single tool (K8s) for everything; zero Compose

Trade-off: ~6-10GB RAM cost + ~30-60s cold boot vs Pattern 4's ~2GB + ~5s. Document the option in `docs/dev/` later; not the default.

### Why we keep Docker Compose despite K8s-everywhere prod

Two needs Compose still earns:

1. **Standalone-clone boot** per [[curaos-modulith-standalone-rule]] - single service cloned alone should boot in seconds w/o k3d install. Per-service `docker-compose.dev.yml` declares its direct deps + `bun start` runs.
2. **Daily dev infra layer** - `docker compose up infra` is ~5s vs `k3d + helm install` ~30-60s. Faster iteration on the 80% of dev sessions that touch 1-3 services.

### Container runtime + image base

- **Runtime**: containerd (K3s default; standard OCI; supports `oven/bun:1` images cleanly)
- **Image base**: `oven/bun:1-alpine` (multi-stage; use `--mount=type=cache` for Bun deps layer) per [[curaos-bun-primary-rule]]
- **Build tool**: BuildKit (`docker buildx`) dev/CI + Buildah in-cluster/air-gap per [[curaos-image-build-rule]] (Kaniko banned)
- **Image registry**: Harbor self-hosted (decision pending air-gap mirror story)

### Air-gap installer

**Zarf** (OpenSSF project; single statically compiled binary; bundles Helm + images + CRDs + K3s embedded) is the packaging format for every CuraOS release per AGENTS.md §4 air-gap requirement (D10 to be formalized but already aligned here).

One Zarf package per CuraOS release. Tenant runs `zarf package deploy curaos-vX.Y.Z.tar.zst` offline.

### Modulith ↔ standalone compliance

Per [[curaos-modulith-standalone-rule]]:

**Standalone mode** (single submodule cloned alone):
```bash
git clone git@github.com:your-org/identity-service.git
cd identity-service
bun install
docker compose -f docker-compose.dev.yml up -d  # brings PG + Kafka + auth-service dep
bun start
```

**Modulith mode** (full monorepo via submodule init):
```bash
git clone --recurse-submodules git@github.com:your-org/curaos.git
cd curaos
docker compose -f infra/docker-compose.yml up -d  # all shared infra
turbo dev --filter=identity-service...  # service + deps via Turborepo
```

**Prod mode** (cluster deploy):
```bash
# Zarf one-shot:
zarf package deploy curaos-vX.Y.Z.tar.zst
# OR Helm/ArgoCD:
helm install curaos ./helm/curaos-umbrella
```

### Local + 3rd-party rule compliance

Per [[curaos-local-vs-3rdparty-rule]]:
- **Local provider (default)**: CuraOS K3s cluster (single-node SMB or multi-node enterprise) - self-hosted, air-gap viable
- **3rd-party provider**: tenant brings EKS/GKE/AKS connection; CuraOS Helm charts deploy unchanged (all 3 are CNCF-conformant K8s); customer's CNI replaces Cilium for that cluster
- **K8s API abstraction**: write all manifests against vanilla K8s + Helm; no K3s-specific CRDs (per addon-disable rule above)

### Agentic-tool friendliness

Why K8s wins for AI agents specifically:
- Dominant 2025-2026 corpus (CNCF survey: 82% prod K8s adoption); agents have highest training data abundance
- agents query cluster state, apply manifests, and exec into pods via `kubectl`/`k9s` (CLI-first per [[curaos-mcp-stack-rule]]; Kubernetes MCP server banned)
- Helm `values.yaml` agents tune predictably; declarative CRDs (Cluster, Database, Pooler, Backup, ScheduledBackup, CiliumNetworkPolicy, etc.) agents author from spec
- Single manifest format across all services (live count from `curaos/.gitmodules`) + 4 deployment profiles → Codegen Engine recipe (per ADR-0123) emits ONE Helm chart format
- Tilt + Bun --hot dev loop: agents iterate at ~500ms-2s in pod via Tilt `live_update`
- `kubectl logs`, `kubectl describe`, `kubectl get events` agents know

### How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter "self-hosted first, no managed-cloud lock-in" | K3s OSS, multi-vendor; cloud K8s = 3rd-party path per local-vs-3rdparty rule |
| AGENTS.md §4 all 4 profiles from same artifacts | Same Helm charts deploy to K3s on every profile; Zarf air-gap installer |
| [[curaos-local-vs-3rdparty-rule]] | Local K3s default + tenant cloud K8s via standard Helm; provider abstraction at infra layer |
| [[curaos-modulith-standalone-rule]] | Per-service docker-compose.dev.yml for standalone; infra/docker-compose.yml + Turborepo for modulith; Helm/Zarf for prod |
| [[curaos-bun-primary-rule]] | All images base oven/bun:1; bun --hot for dev; containerd runs them |
| [[curaos-ai-mirror-rule]] | Helm charts + Compose files mirrored under curaos/ + ai/curaos/ at matching paths |
| [[curaos-orm-rule]] | Drizzle/MikroORM/Kysely all run on top of K8s-deployed PG (CNPG when D4 unblocks) |

### How to apply

- Codegen Engine (per ADR-0123) recipes for K8s manifests = ONE Helm chart format per service; ONE docker-compose.dev.yml template per standalone-clone scenario
- Every service AGENTS.md frontmatter declares:
  ```yaml
  deploy:
    prod: k8s-helm
    dev: bun-hot
    standalone: docker-compose
    image_base: oven/bun:1-alpine
    runtime: containerd
  ```
- Root infra Compose at `curaos/infra/docker-compose.yml` (when scaffolded); per-service Compose at `curaos/<area>/<svc>/docker-compose.dev.yml`
- Helm charts at `curaos/helm/<chart>/`; ArgoCD ApplicationSets at `curaos/ops/argocd/`
- Tiltfile at repo root + per-service `Tiltfile.local` for ad-hoc dev clusters
- CI: GitHub Actions matrix per affected pkg; integration-test job spins ephemeral K3s
- Air-gap release: Zarf package built nightly + per-tag; pushed to releases

### Resolved follow-ups (locked by sibling rules)

- D3 (CNI) → LOCKED by [[curaos-cni-rule]] (Cilium primary + sidecar-less mTLS)
- D4 (PG operator) → LOCKED by [[curaos-postgres-rule]] (CNPG + Citus)
- D5 (error tracking) → LOCKED by [[curaos-error-tracking-rule]] (GlitchTip prod + Sentry SaaS dev)
- D6 (SLO mgmt) → LOCKED by [[curaos-slo-rule]] (Pyrra + OpenSLO)
- D9 (image build) → LOCKED by [[curaos-image-build-rule]] (BuildKit dev/CI + Buildah in-cluster/air-gap; Kaniko banned)
- D10 (air-gap packaging) → LOCKED by [[curaos-airgap-rule]] (Zarf singular format)

### Live operations cross-reference

Deployment, live-server, public-demo, image-publish, signing, DNS, Caddy, Pocket ID, NetBird, APISIX, k3d, kubectl, zarf, Docker, cosign, GHCR, and VPS work follows [[curaos-live-ops-substrate-rule]]: use `build-host`, SSH there first if needed, and use `/home/mkh/workspace/example-homelab` for private operations context before declaring a blocker.

### Open follow-ups (genuinely pending)

- Storage class default (Longhorn vs OpenEBS vs Rook-Ceph) → separate decision
- Ingress controller (APISIX vs ingress-nginx vs Envoy Gateway) → separate decision
- LoadBalancer (MetalLB bare-metal default) → separate decision

### ADRs queued

Per digest §6:
- **ADR (NEW, K8s stack)** - number TBD (0135 unverified in RESOLUTION-MAP; use next free number ≥0212): full version of this rule + per-distro detailed picks
- **ADR-0099 (charter)**: amend to reference orchestration foundation
- **ADR (NEW, GitOps)** - number TBD (0136 unverified in RESOLUTION-MAP; use next free number ≥0212): ArgoCD vs Flux to fit on top of this
- **ADR-0137 (NEW, multi-tenancy K8s)**: Capsule + vCluster + CNPG Database CRD per tenant
