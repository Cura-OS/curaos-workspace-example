# ADR-0109: Container Runtime, Orchestration, and Packaging

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: Jib (JVM image builder) → `@nestjs/cli build` + Dockerfile multistage + Buildpacks. Wolfi base + K3s/Talos + APISIX Ingress + Cilium + ArgoCD/Flux + Capsule + vCluster + Longhorn + Harbor all stand. Local + 3rd-party rule applies (EKS/GKE/AKS as 3rd-party options).
>
> **Open Questions resolution (2026-05-25):** Talos vs RKE2 → **RESOLVED-RULE** ([[curaos-orchestration-rule]] — K3s default; Talos + RKE2 documented fallbacks). Cilium kernel floor 5.10 → **RESOLVED-RULE** ([[curaos-cni-rule]] — Cilium 1.14+ baseline). Image build → **RESOLVED-RULE** ([[curaos-image-build-rule]] — BuildKit dev/CI + Buildah air-gap; cosign + SBOM mandatory). Air-gap → **RESOLVED-RULE** ([[curaos-airgap-rule]] — Zarf singular format). Harbor vs Nexus + vCluster HA license → **DEFERRED-MILESTONE/V2**. See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).


## Status

Proposed — pending user approval. Date: 2026-05-24.

---

## Context

CuraOS is a composable platform with 91 Kotlin+Spring Boot 3.4 / JVM 21 microservices plus
React, Flutter, and Astro frontends. It must operate identically across four deployment profiles
from one artifact set:

| Profile | Tenancy | Scale |
|---|---|---|
| Cloud SaaS | Per-tenant schema isolation | 50–200+ replicas, auto-scale |
| On-Prem | Single tenant | 3–5 node HA cluster |
| Hybrid | Vendor control plane + customer data plane | Two-site, federated |
| Home lab / Air-gap | Single tenant, offline | Single node or 2-node |

Already committed by prior ADRs: PostgreSQL 17, Valkey, SeaweedFS, Kafka 4.x (SaaS) / NATS
JetStream (SMB), APISIX, Keycloak 26, Flowable + Temporal, Spring Boot 3.4 + JVM 21.

Current state: Docker + Compose for local development and SMB on-prem. Kubernetes mentioned as
optional in ADR-0100 but not committed. Ansible provisioning addressed separately in ADR-0111.

This ADR resolves 14 sub-decisions that together constitute the container platform layer.

---

## Forces / Requirements

- **Self-hosted first, air-gap mandatory.** All tooling must operate with zero outbound internet
  after initial bootstrap. Images must be redistributable from a private registry. Licenses must
  permit on-premises redistribution without per-node fees.
- **HIPAA/GDPR readiness.** Network segmentation enforced at the platform layer. PHI namespace
  isolation must be auditable. mTLS for all service-to-service paths where PHI transits.
- **Footprint graduation.** A single-node home lab with 8 GB RAM must be a valid target. The same
  artifact set, packaging format, and deployment toolchain must scale to a 50-node SaaS cluster
  without forking.
- **Operational simplicity at 91 services.** The number of moving parts compounds. Prefer tools
  that eliminate operational surface (immutable OS, GitOps reconciliation) over tools that add it.
- **License alignment for SaaS distribution.** Any component shipped inside the product or
  required at runtime must be OSS-licensed in a way compatible with SaaS distribution (Apache 2,
  MIT, MPL 2, CNCF-graduated). BSL / SSPL / commercial-only components require explicit approval.
- **Kubernetes ecosystem gravity.** The 91-service count, the requirement for namespace-based
  tenant isolation, and the CNCF ecosystem depth for security (OPA, Falco, Sigstore, Trivy) all
  pull toward Kubernetes as the orchestration substrate. Diverging from it requires a strong
  counter-argument.

---

## Sub-Decision 1: Container Build Tool

### Options

| Tool | Approach | Docker daemon required | Spring Boot native |
|---|---|---|---|
| **Jib** (Google) | Daemonless, Maven/Gradle plugin, layered Java-optimized | No | Native Gradle integration |
| **Cloud Native Buildpacks / Paketo** | Source-to-image, auto-detects runtime | No (but heavier) | `./gradlew bootBuildImage` |
| **Dockerfile multi-stage** | Full control, universal | Yes (or BuildKit) | Manual COPY layers |
| **Earthly** | Makefile-like, reproducible, Docker-compatible | No (own daemon) | Generic |
| **Bazel rules_docker** | Hermetic monorepo builds | No | Complex setup |
| **ko** | Go-only | N/A | N/A |
| **Nixpacks** | Nix-based, auto-detect | No | Experimental JVM |

### Decision: **Jib (primary) + Dockerfile multi-stage (escape hatch)**

**Rationale.** Jib integrates directly with Gradle, the already-committed build tool for all 91
Kotlin services. It produces layered images that separate dependencies, resources, and classes —
the dependency layer (largest) is cached across builds, reducing incremental CI build time from
minutes to seconds at 91-service scale. Jib requires no Docker daemon, which matters for CI
environments and for the daemonless container runtimes chosen below. It produces distroless-
compatible images by default, aligning with the base image decision.

Paketo Buildpacks produce significantly larger images (~200 MB vs ~80 MB for a comparable Spring
Boot app) and are slower in CI because they re-detect the runtime on every build. They are
appropriate when multi-language heterogeneity is a future concern, but the current stack is
homogeneous JVM.

Dockerfile multi-stage is retained as the escape hatch for non-JVM components (Astro static
builds, Flutter web) and for any future service that cannot be expressed cleanly in Jib.

### Implementation Notes

- All 91 services configure `jib` Gradle plugin with `jib.from.image = "chainguard/jre-lts:latest"`.
- Layer order: `dependencies → resources → classes` (Jib default). Do not override without
  benchmarking; the default maximizes cache reuse.
- `jib.container.jvmFlags` includes `-XX:+UseZGC -XX:MaxRAMPercentage=75.0` globally; per-service
  overrides allowed via `gradle.properties`.
- CI pipeline calls `./gradlew jibDockerBuild` for local; `./gradlew jib` for remote push to Harbor.
- Air-gap: Jib `from.image` resolved from internal Harbor mirror; no public registry access at
  build time in production CI.

---

## Sub-Decision 2: Base Image Strategy

### Options

| Image | glibc | Shell | CVE baseline | Size (JRE 21) | License |
|---|---|---|---|---|---|
| **Chainguard / Wolfi JRE** | Yes | No (distroless variant) | Near-zero | ~120 MB | Apache 2 |
| **gcr.io/distroless/java21** | Yes | No | Low, slower patch | ~180 MB | Apache 2 |
| **Eclipse Temurin official** | Yes | Yes (bash) | ~100+ CVEs | ~400 MB | GPL w/ CE |
| **Alpine + Temurin** | No (musl) | ash | Low | ~200 MB | Various |
| **UBI minimal** | Yes | Yes (microdnf) | Low | ~280 MB | Red Hat sub. |
| **Bellsoft Liberica** | Yes | Optional | Moderate | ~250 MB | Apache 2 |

### Decision: **Chainguard JRE (Wolfi-based) distroless variant**

**Rationale.** Wolfi-based Chainguard images maintain near-zero CVE count through daily automated
rebuilds — upstream patches land in new images within hours vs. weeks for Debian-based distroless.
They include Sigstore-signed SBOMs on every image, satisfying HIPAA supply-chain audit requirements
without additional tooling. glibc compatibility is critical for JVM performance and for native
libraries in some Spring Boot ecosystem components; Alpine's musl causes subtle JVM TLS and random
number generation edge cases that are unacceptable in a HIPAA context.

The distroless variant (no shell, no package manager) minimizes attack surface. Debug builds can
use the `-dev` Chainguard variant which includes busybox; this is explicitly blocked from production
registries via Harbor admission policy.

Eclipse Temurin official images average 100+ known CVEs at any given time — unacceptable for a
platform that must pass HIPAA technical safeguard audits. UBI minimal requires a Red Hat
subscription for production use at scale; this violates self-hosted / no per-node-fee requirements.

### Implementation Notes

- `chainguard/jre-lts:latest-nonroot` pinned by digest SHA in CI, not by tag, to prevent tag
  mutation attacks. Digest updated weekly via automated PR.
- Harbor proxy cache mirrors `cgr.dev/chainguard/` for air-gap environments. Initial mirror seeded
  during cluster bootstrap.
- Frontend containers (Astro static): `chainguard/nginx:latest-nonroot`.
- Flutter web: served via the same nginx image; build artifacts copied in Dockerfile multi-stage.

---

## Sub-Decision 3: Container Runtime (Production)

### Options

| Runtime | Rootless | CRI-compatible | OCI spec | Notes |
|---|---|---|---|---|
| **containerd** | Yes (via rootlesskit) | Yes (default K8s) | Yes | CNCF graduated |
| **CRI-O** | Yes | Yes (K8s native) | Yes | OpenShift default |
| **Docker Engine** | Partial | Via dockershim (removed) | Yes | No longer K8s CRI |
| **Podman** | Yes (rootless-first) | Via CRI-O | Yes | Red Hat ecosystem |

### Decision: **containerd**

**Rationale.** containerd is the CNCF-graduated default CRI for upstream Kubernetes, K3s, k0s,
Talos Linux, and RKE2. Every orchestrator chosen in Sub-Decision 4 ships containerd as its
default runtime. Standardizing on containerd eliminates the translation layer that dockershim
provided; Docker Engine no longer has a CRI interface since K8s 1.24 removed dockershim.

CRI-O is a valid alternative but its ecosystem tooling (crictl, ctr) is thinner than containerd's
(nerdctl, ctr, Rancher Desktop). Podman's rootless-first model is compelling for security but its
primary strength (non-root process) is superseded by Talos Linux's OS-level security model.

For local developer workstations: Docker Desktop or Rancher Desktop (both use containerd under
the hood). OrbStack on macOS. No Podman requirement imposed on developers.

---

## Sub-Decision 4: Orchestrator (Per Profile)

This is the highest-leverage decision. Options assessed:

| Orchestrator | Min footprint | HA | Air-gap | CNCF | License |
|---|---|---|---|---|---|
| Docker Compose | ~0 MB overhead | No | Yes | No | Apache 2 |
| Docker Swarm | Minimal | Limited | Yes | No | Apache 2 |
| **K3s** | ~40 MB binary | Yes (embedded etcd) | Yes | Sandbox | Apache 2 |
| **k0s** | ~80 MB binary | Yes (embedded etcd) | Yes | No | Apache 2 |
| **Talos Linux + K8s** | Full OS | Yes | Yes (first-class) | No | MPL 2 |
| **RKE2** | Medium | Yes | Yes | No | Apache 2 |
| Full upstream K8s (kubeadm) | Medium | Yes | Yes | Graduated | Apache 2 |
| OpenShift | Heavy | Yes | Yes (OKD) | No | Commercial |
| MicroK8s | ~200 MB | Yes | Yes | No | Apache 2 |
| Nomad | ~50 MB binary | Yes | Yes | No | BSL 1.1 |

### Decision: Profile-stratified orchestration

#### Home Lab / Air-Gap Single Node

**Decision: K3s**

Single binary (~40 MB), ships containerd, CoreDNS, Flannel, Traefik, and local-path-provisioner
out of the box. Embedded SQLite for single-node (no etcd overhead). CNCF sandbox project with
CNCF-certified Kubernetes compliance. Footprint: 512 MB RAM minimum, 1 GB comfortable. A
Raspberry Pi 4 (4 GB) runs a viable single-node K3s cluster with 5–8 CuraOS services.

K3s air-gap support: pre-packaged `k3s-airgap-images-amd64.tar.gz` + single binary + install
script can be seeded to USB key or NFS share. No internet required after initial seed.

Compose is NOT chosen as the canonical single-node target because it lacks the K8s API surface
that the rest of the packaging (Helm charts, ArgoCD, Kyverno policies) depends on. Maintaining
two packaging formats (Compose + Helm) doubles documentation and integration test surface.

**Docker Compose is retained for local developer inner loop only** — `docker compose up` to spin
up dependencies (PostgreSQL, Valkey, Kafka / NATS, Keycloak) alongside one or two services under
active development. This is explicitly not the deployment format.

#### SMB On-Prem (3–5 Node HA Cluster)

**Decision: K3s (HA mode, embedded etcd)**

K3s HA with embedded etcd requires 3 server nodes (odd quorum). 5 nodes total (3 server + 2
agent) is the recommended SMB topology. Embedded etcd eliminates the external etcd operational
burden. K3s `--cluster-init` flag bootstraps the first server; subsequent servers join via token.

k0s was evaluated as the alternative. k0s has a slightly cleaner declarative install config
(YAML-first vs K3s flags) and uses kube-router by default instead of Flannel, but its ecosystem
tooling, community size, and documentation depth are materially smaller than K3s. For an SMB
customer who may have only one IT person, K3s's larger community and simpler debugging path wins.

Swarm is eliminated: it is functionally deprecated (Docker Inc. has not advanced it since 2019),
does not support Helm, and cannot host the K8s-native toolchain (ArgoCD, Kyverno, Cilium).

#### SaaS Multi-Tenant (Large HA, Cloud or Hosted)

**Decision: Talos Linux + upstream Kubernetes (kubeadm-bootstrapped, managed by Talos API)**

Talos Linux is an immutable, API-driven OS purpose-built for Kubernetes. It eliminates SSH,
package managers, mutable configuration, and shell access — removing entire classes of
security risk that matter acutely in a HIPAA SaaS context. Every node is identical; upgrades
are rolling, declarative, and rollback-safe. At KubeCon EU 2025, a production case study
documented migration of 35 air-gapped clusters from kubeadm/Ansible to Talos Linux; the
operational burden dropped from weeks-per-upgrade to hours.

Talos's machine config is a single YAML file per node role (controlplane / worker), applied
via `talosctl`. This maps naturally to GitOps: machine configs live in git, ArgoCD or Flux
applies cluster-level resources, Talos API applies OS-level config.

Full upstream Kubernetes (not a distro) runs on top of Talos, giving exact version control and
CNI/CSI flexibility without distribution-specific patches.

Talos air-gap: first-class supported. `talosctl image cache-create` pre-seeds the installer
image. All Kubernetes component images (kube-apiserver, etcd, coredns) can be pre-pulled into
a Talos installer ISO, enabling fully offline bootstrap. Harbor registry mirror serves all
subsequent image pulls.

**RKE2** was considered as an alternative — it is hardened, CIS Benchmark aligned, and has
first-class air-gap support via `rke2-images.linux-amd64.tar.zst`. The deciding factor for
Talos over RKE2 is the OS immutability and the elimination of SSH/shell as an attack surface,
which is a stronger HIPAA technical safeguard posture.

OpenShift / OKD: eliminated. Commercial licensing burden (OpenShift) or heavy resource
overhead and slower release cadence (OKD) do not fit the footprint or licensing constraints.

Nomad: eliminated for primary orchestration. HashiCorp changed Nomad's license to BSL 1.1 in
2023. BSL prohibits SaaS use of Nomad as a competing product offering, which is ambiguous
enough to require legal review before redistribution. Additionally, Nomad lacks native support
for Kubernetes-native security primitives (OPA Gatekeeper, Kyverno, Pod Security Standards,
NetworkPolicy) that are load-bearing for HIPAA compliance. Nomad remains available as an
optional sidecar orchestrator for batch / non-containerized workloads in customer environments
that have existing Nomad investments — but this is an integration point, not a platform choice.

#### Hybrid (Vendor Control Plane + Customer Data Plane)

**Decision: Talos (vendor side) + K3s (customer data plane, constrained resource)**

Vendor control plane: same Talos + K8s topology as SaaS. Customer data plane: K3s HA (3-node)
or single-node depending on customer capacity. The two planes communicate via Tailscale or
WireGuard VPN tunnel; cross-cluster service discovery uses external DNS + APISIX gateway (not
K8s federation, see Sub-Decision 10).

---

## Sub-Decision 5: Packaging Format for Distribution

### Options

| Format | Templating | Release tracking | Ecosystem | Air-gap |
|---|---|---|---|---|
| **Helm 3 / Helm 4** | Go templates + values | Yes (releases) | 75% adoption (2025 CNCF survey) | Yes |
| **Kustomize** | Overlay patches | No (external) | Native kubectl | Yes |
| **Timoni** | CUE lang | Yes (module system) | Niche, early | Yes |
| **Carvel ytt + kapp** | Starlark | Yes (kapp) | VMware ecosystem | Yes |
| **Kpt** | KRM functions | No | Google-driven | Yes |
| **Raw manifests** | None | No | N/A | Yes |

### Decision: **Helm 4 (primary) + Kustomize (environment overlays)**

**Rationale.** Helm 4 (released KubeCon NA 2025) resolves Helm 3's primary operational
complaint — server-side apply is now the default, eliminating the "last-applied annotation"
conflicts that plagued Helm 3 when ArgoCD and Helm both managed the same resources. Helm's
75% adoption rate in the CNCF 2025 survey means every on-prem customer IT team will have
Helm familiarity. The `helm package` + OCI registry push workflow enables air-gap distribution:
Helm charts are pushed to Harbor as OCI artifacts alongside container images, then pulled
offline.

Kustomize is used for per-environment overlays on top of base Helm chart outputs — a mature
pattern used by large platform teams. `helm template | kustomize build` pipeline: Helm renders
the base manifest, Kustomize applies tenant-specific or environment-specific patches without
forking the chart.

Timoni (CUE-based) is technically superior for type-safety and validation but has niche
adoption and no established ecosystem for the Spring Boot / Java service pattern. Premature
adoption at 91 services creates hiring and onboarding risk.

### Implementation Notes

- One Helm chart per logical service group (not per microservice — 91 charts would be unmaintainable).
  Chart groups: `identity-stack`, `workflow-stack`, `data-platform`, `gateway-stack`,
  `storage-stack`, `frontend-stack`, `overlay-healthstack`, `overlay-educationstack`.
- Helm chart OCI push: `helm push curaos-identity-stack-*.tgz oci://harbor.internal/charts/`
- Air-gap bundle: Harbor-mirrored OCI charts + container images. Installer script: pull chart
  from Harbor, `helm install` with profile-specific values file.
- Values files per profile: `values-homelab.yaml`, `values-smb.yaml`, `values-saas.yaml`,
  `values-hybrid-vendor.yaml`, `values-hybrid-customer.yaml`.

---

## Sub-Decision 6: Service Mesh

### Options

| Mesh | Architecture | Overhead | mTLS | eBPF | License |
|---|---|---|---|---|---|
| **Cilium Service Mesh** | eBPF (no sidecar) | Lowest | Yes | Native | Apache 2 |
| **Linkerd** | Rust sidecar (linkerd2-proxy) | Low | Yes | No | Apache 2 |
| **Istio** | Envoy sidecar | High (25–50 GB RAM at 500 svcs) | Yes | Ambient mode (beta) | Apache 2 |
| **Consul** | Envoy sidecar | Medium | Yes | No | BSL 1.1 |
| **Kuma** | Envoy sidecar | Medium | Yes | No | Apache 2 |
| **None** | APISIX handles N-S; direct E-W | Zero | Manual TLS | N/A | — |

### Decision: **Cilium Service Mesh (SaaS + On-Prem HA) / None (Home Lab)**

**Rationale.** Cilium operates at the Linux kernel level via eBPF — it intercepts and processes
network traffic without injecting a sidecar proxy into every pod. At 91-service scale, avoiding
sidecars eliminates ~91 × (1 Envoy container × 50–200 MB RAM) = 4.5–18 GB of sidecar memory
overhead. Production benchmarks show 40–60% reduction in network overhead vs. traditional sidecar
meshes. Cilium is also the chosen CNI (see Sub-Decision note below), so the service mesh is an
additive feature of the already-present CNI rather than a separate deployment.

Cilium provides: mTLS via WireGuard or Cilium's own crypto, L7 policy enforcement, network policy
(Kubernetes-native + extended CiliumNetworkPolicy), observability via Hubble (Prometheus + Grafana
native). These satisfy the HIPAA network segmentation requirement without additional components.

Linkerd is the second-best choice on resource efficiency (Rust proxy, ~10× less CPU/RAM than
Istio). It would be preferred over Cilium if the team is running a CNI that does not support
eBPF (e.g., Flannel on older kernels). K3s defaults to Flannel; in K3s deployments, K3s must be
configured with `--flannel-backend=none` and Cilium installed as CNI to unlock Cilium Service Mesh.

Istio: eliminated for default deployment. Its Envoy-based sidecar model doubles the memory
footprint per pod. Istio ambient mode (sidecar-less) was beta as of 2025 and not production-
hardened at the time of this decision. Istio's operational complexity requires a dedicated
platform team — inappropriate for SMB on-prem and home lab profiles.

**Home Lab (single-node K3s):** No service mesh. APISIX handles north-south mTLS. East-west
inter-service calls use Spring Boot's embedded TLS (client certificate auth via Keycloak's
mTLS token binding) for PHI paths. The overhead of Cilium on an 8 GB node with 10–20 services
is acceptable but unnecessary; the security posture is adequate for the home lab threat model.

**CNI note:** K3s: deploy Cilium with `--set k8sServiceHost=<vip> --set k8sServicePort=6443`,
disable built-in Flannel (`--flannel-backend=none --disable-network-policy`). Talos: Cilium is
the default CNI in recommended Talos configs (Sidero Omni deploys it by default).

---

## Sub-Decision 7: Ingress Controller (K8s)

### Options

| Controller | APISIX integration | Air-gap | Resource | Notes |
|---|---|---|---|---|
| **APISIX Ingress Controller** | Native (same control plane) | Yes | Medium | Extends existing APISIX |
| Traefik | Via plugin | Yes | Low | K3s default |
| NGINX Ingress | Manual | Yes | Low–Medium | Widely used |
| Contour (Envoy) | Manual | Yes | Medium | Projectcontour |
| Istio Gateway | Istio dependency | Yes | High | Requires Istio mesh |
| Envoy Gateway | Kubernetes Gateway API | Yes | Medium | CNCF project |

### Decision: **APISIX Ingress Controller**

**Rationale.** APISIX is already committed as the API gateway (ADR-0103). The APISIX Ingress
Controller (AIC) unifies the data plane: the same APISIX instance that handles north-south API
traffic also handles ingress routing. This eliminates the operational burden of running both an
ingress controller and a separate gateway — one control plane, one observability surface, one
rate-limiting configuration.

AIC implements the Kubernetes Ingress v1 spec and the Kubernetes Gateway API (v1 stable), making
it a drop-in replacement for NGINX Ingress on existing charts. It supports the `ApisixRoute`
CRD for advanced routing (header-based, weighted, plugin-chained) that goes beyond what standard
Ingress annotations can express.

K3s default Traefik is disabled (`--disable traefik` in K3s server flags) and replaced with AIC.
This avoids running two ingress controllers simultaneously during the bootstrap phase.

---

## Sub-Decision 8: GitOps Deployment

### Options

| Tool | Model | UI | Multi-cluster | CNCF | License |
|---|---|---|---|---|---|
| **ArgoCD** | Hub-and-spoke pull | Yes (rich) | Yes (ApplicationSets) | Graduated | Apache 2 |
| **Flux** | Decentralized pull | No (Weave Gitops optional) | Yes (per-cluster) | Graduated | Apache 2 |
| Werf | Push + pull hybrid | No | Limited | No | Apache 2 |
| Spinnaker | Push | Yes | Yes | No | Apache 2 |
| CI push (custom) | Push | CI UI | Manual | N/A | — |

### Decision: **ArgoCD (primary) + Flux (edge/air-gap nodes)**

**Rationale.** ArgoCD dominates GitOps adoption with 60% of K8s clusters in 2025-2026 and 97%
production adoption among ArgoCD users (up from 93% in 2023). AWS backed ArgoCD at re:Invent 2025
with EKS Capabilities (managed ArgoCD). The hub-and-spoke model fits CuraOS SaaS: a central
ArgoCD instance in the management cluster manages ApplicationSets targeting all tenant namespaces
and all customer on-prem clusters that have network connectivity back to the vendor control plane.

ArgoCD's web UI is load-bearing for the customer onboarding experience — on-prem customers without
a dedicated GitOps engineer can observe deployment state, trigger manual syncs, and inspect drift
without CLI access.

Flux is preferred for edge and air-gap deployments where inbound network connectivity to an
ArgoCD hub is unavailable or undesirable. Flux's decentralized pull model: each K3s cluster runs
its own Flux controllers, pulling from a local Harbor OCI registry (which mirrors from the vendor
registry when connected, or operates from a pre-seeded snapshot when air-gapped). Weaveworks'
shutdown in Feb 2024 initially raised concerns, but ControlPlane, Microsoft, Cisco, and GitLab
stepped in as maintainers; Flux remains CNCF-graduated with an active 2025–2026 roadmap.

The hybrid split (ArgoCD for connected clusters, Flux for air-gap) is a documented pattern in
the GitOps community and does not require maintaining two separate deployment repos — the same
Helm charts and Kustomize overlays are consumed by both tools.

---

## Sub-Decision 9: Multi-Cluster Federation

### Options

| Tool | Approach | Complexity | License |
|---|---|---|---|
| **None (per-cluster independent)** | ArgoCD ApplicationSets target each cluster | Low | N/A |
| Karmada | Push-based federated control plane | High | Apache 2 |
| Open Cluster Management | Hub-spoke, Red Hat-backed | High | Apache 2 |
| Cluster API | Lifecycle management only | Medium | Apache 2 |
| Submariner | Cross-cluster network only | Medium | Apache 2 |
| vCluster Pro | Virtual clusters in one physical cluster | Medium | Commercial |

### Decision: **None (ArgoCD ApplicationSets) for SaaS; per-cluster Flux for air-gap**

**Rationale.** Full cluster federation (Karmada, OCM) adds a control plane above the control
plane. The operational cost is high, the failure modes are complex, and the gain — workload
portability across clusters — is not a current requirement. CuraOS's multi-cluster need is
simpler: deploy the same application version to N customer clusters, observe drift, reconcile.
ArgoCD ApplicationSets solves this with cluster generators targeting a cluster list; no
federation control plane needed.

Cluster API is noted as the right tool for cluster lifecycle management (provisioning, upgrading
Talos nodes declaratively). It is an operational tool, not an application deployment tool. It
belongs in the ops layer (ADR-0111) rather than the application packaging layer.

Submariner provides cross-cluster service connectivity (flat network). This is only needed if
services in the vendor control plane need to be called directly from the customer data plane at
the pod level. The current architecture uses APISIX as the cross-boundary gateway; Submariner
is therefore out of scope unless that design changes.

---

## Sub-Decision 10: Storage Classes (K8s)

### Options

| Solution | IOPS (4K random) | Latency | Memory/node | Complexity | License |
|---|---|---|---|---|---|
| **Longhorn** | 15–20K | 2–4ms | 200–400 MB | Low | Apache 2 |
| **OpenEBS Mayastor** | 45–60K | 0.5–1.5ms | 150–600 MB | Medium | Apache 2 |
| **local-path-provisioner** | NVMe native | <1ms | ~0 | None | Apache 2 |
| Rook-Ceph | 25–35K | 1–3ms | 1–2 GB | High | LGPL/Apache 2 |
| Portworx | High | Low | High | High | Commercial |

**Note:** Object storage (SeaweedFS) is committed (ADR-0101) and is not in scope here. These
storage classes serve block PVCs for stateful services (PostgreSQL, Valkey, Kafka,
Flowable/Temporal databases, Longhorn internal volumes).

### Decision: **Longhorn (SMB on-prem + home lab) / OpenEBS Mayastor (SaaS) / local-path-provisioner (dev)**

**Rationale.**

**Longhorn** is the default for SMB on-prem and home lab: it ships a web UI, supports
S3-compatible backup (pointing at the customer's own SeaweedFS instance), supports snapshots,
and can be installed with a single Helm chart. Its 15–20K IOPS and 2–4ms latency are sufficient
for PostgreSQL 17 with synchronous_commit = local (or off for non-critical writes). Longhorn's
primary drawback — latency spikes under write pressure — is mitigated by PostgreSQL's WAL
configuration (wal_compression, checkpoint_completion_target = 0.9).

**OpenEBS Mayastor** targets SaaS where PostgreSQL replicas and Temporal workers require
consistent low-latency I/O. Mayastor's 45–60K IOPS / 0.5–1.5ms profile is competitive with
cloud-managed SSDs. It uses NVMe-oF for data path; nodes must expose NVMe devices (bare metal
or paravirtualized NVMe in VMs). Requires kernel 5.13+ (all modern Talos nodes qualify).

**local-path-provisioner** (K3s default) is retained for developer-only workloads and CI: fast,
zero-overhead, HostPath-backed. Explicitly forbidden in production deployments via Kyverno policy
(`disallow-local-path-in-prod` policy rule).

**Rook-Ceph** was considered as a unified block+object solution but eliminated: SeaweedFS handles
object storage (ADR-0101); adding Rook-Ceph for block storage doubles the storage operator surface
and adds 1–2 GB RAM per node overhead that is unacceptable in the home lab profile.

---

## Sub-Decision 11: Container Registry

### Options

| Registry | Air-gap mirror | OCI v2 | Vulnerability scan | SBOM | License |
|---|---|---|---|---|---|
| **Harbor** | Yes (replication rules) | Yes | Yes (Trivy built-in) | Yes (auto on push) | Apache 2 |
| **Zot** | Yes (single binary) | Yes (1.1) | No (external) | No | Apache 2 |
| **Distribution (CNCF)** | Yes | Yes | No | No | Apache 2 |
| Sonatype Nexus | Yes | Yes | Limited | No | Apache 2 (OSS) |
| JFrog Artifactory OSS | Yes | Yes | No (Xray paid) | No | SSPL |
| Harbor Satellite + Zot | Yes (edge) | Yes | Via Harbor | Via Harbor | Apache 2 |

### Decision: **Harbor (primary registry) + Harbor Satellite + Zot (edge/air-gap nodes)**

**Rationale.** Harbor is the CNCF-graduated standard for self-hosted container registries. Its
built-in Trivy integration scans every pushed image and blocks promotion to the `prod` project if
CRITICAL CVEs are detected — satisfying HIPAA's requirement for technical safeguards on software
supply chain integrity. Auto-generated SBOMs on push, combined with Cosign signing (Sigstore),
provide a complete provenance chain: who built the image, from what base, with what dependencies,
signed by which CI identity.

Harbor's replication rules enable air-gap seeding: a connected Harbor instance replicates to
an offline Harbor instance on the customer's site on a schedule. The offline instance serves all
subsequent image pulls without internet access. For true USB-key offline deployments, Harbor's
export/import API creates a portable bundle.

**Harbor Satellite** (CNCF Sandbox project, 2025) extends Harbor to edge nodes. It embeds a
lightweight **Zot registry** (OCI 1.1, single binary, ~30 MB) at the edge, synchronized from
the parent Harbor. Zot can operate independently when disconnected — matching the home lab /
air-gap requirement precisely. Harbor Satellite is used for:
  - Home lab nodes (pull from local Zot, sync when USB key is refreshed)
  - K3s on-prem clusters at customer sites (Zot pulls from vendor Harbor when connected)

JFrog Artifactory OSS is SSPL-licensed — incompatible with SaaS distribution without a
commercial agreement. Eliminated.

Sonatype Nexus is retained as an alternative only if a customer already operates it; CuraOS
does not ship it as part of the platform.

### Implementation Notes

- Harbor projects: `base-images/`, `services/`, `charts/`, `prod/` (scan-gated), `dev/` (no gate).
- Admission webhook (Kyverno) blocks pods from pulling from any registry other than the internal
  Harbor hostname. Enforced in `prod` and `staging` namespaces; relaxed in `dev`.
- Cosign verifies image signatures at admission: `cosign verify --certificate-oidc-issuer
  <ci-issuer> --certificate-identity <ci-service-account> harbor.internal/services/<img>@sha256:...`

---

## Sub-Decision 12: Air-Gap Install Mechanism

### Decision: **OCI-bundled Helm charts in Harbor + offline installer script + USB-key sync**

Three-tier mechanism:

**Tier 1 — Initial seeding (internet-connected, run once):**
`curaos-airgap-seed` script runs on an internet-connected workstation. It:
1. Pulls all container images listed in the BOM (`images.lock.yaml`) into a local containerd store.
2. Packages Helm charts as OCI artifacts into a local Harbor export.
3. Creates a `curaos-airgap-bundle-<version>.tar.zst` (estimated 15–25 GB compressed for full
   platform).
4. Signs the bundle with Cosign. SHA-256 checksum written to `bundle.sha256`.

**Tier 2 — Installation on air-gapped site:**
`curaos-install` script on the target host:
1. Verifies bundle checksum + Cosign signature.
2. Bootstraps K3s (single-node) or Talos (multi-node) from embedded binaries in the bundle.
3. Loads images into containerd via `ctr images import`.
4. Starts a local Harbor Satellite / Zot instance, imports chart OCI artifacts.
5. Runs `helm install` for each chart group against the local registry.

**Tier 3 — Ongoing updates (air-gapped site):**
`curaos-update` script creates a delta bundle (`--from <previous-version>`) containing only
new/changed layers. Delta bundle fits on a USB key for sites with no network path to vendor.
Harbor Satellite syncs delta when USB-connected; Flux reconciles new chart versions.

This pattern is modeled on RKE2's air-gap install (`rke2-images.linux-amd64.tar.zst`) and Talos
Linux's `image cache-create` feature, both of which demonstrated the pattern in production.

---

## Sub-Decision 13: Tenant Isolation in Kubernetes

### Options

| Model | Isolation strength | Cost | Complexity | Notes |
|---|---|---|---|---|
| Namespace per tenant | Weak (shared API server) | Low | Low | Suitable for trusted tenants |
| **Capsule** | Medium (namespace groups + policy) | Low | Medium | CNCF project, HNC archived Apr 2025 |
| **vCluster** | Strong (own API server per tenant) | Medium | Medium | CNCF sandbox, production-proven |
| Cluster per tenant | Strongest | High | High | Cluster sprawl |

### Decision: **Two-tier: Capsule (SaaS namespace isolation) + vCluster (regulated tenant isolation)**

**Rationale.** HNC (Hierarchical Namespace Controller) is **archived as of April 2025** — not
a viable option. Capsule is now the primary CNCF-backed namespace multi-tenancy framework. It
introduces a `Tenant` CRD that groups namespaces, auto-applies RBAC, ResourceQuotas, LimitRanges,
and NetworkPolicies, and enforces inter-tenant network isolation. This satisfies the HIPAA
requirement for logical separation of tenant PHI without the cost of per-tenant clusters.

**Capsule** is the default for CuraOS SaaS multi-tenancy:
- Each CuraOS tenant maps to a Capsule `Tenant` object.
- Tenant gets namespaces: `<tenant>-prod`, `<tenant>-staging`, `<tenant>-workers`.
- Capsule enforces: no cross-tenant RoleBinding references, default-deny NetworkPolicy between
  tenants, per-tenant ResourceQuota, mandatory pod security labels (`restricted` profile).
- Platform team namespace (`curaos-platform`) is excluded from Capsule and governed directly.

**vCluster** is provisioned for tenants with elevated isolation requirements:
- HealthStack tenants handling PHI in regulated jurisdictions (EU, US covered entities) that
  require audit-demonstrable API server isolation.
- Tenants that need to install custom CRDs without impacting other tenants.
- Tenants operating under a BAA that explicitly requires dedicated control plane components.

vCluster v0.29 (Standalone) eliminated the need for a separate K8s distro underneath — it runs
directly on the host cluster as a namespace workload presenting a full K8s API server. At 80%
cost reduction over dedicated clusters (documented: $2,336/month for 32 clusters → $438/month for
6 clusters + vCluster) the economics are compelling.

**Cluster-per-tenant** is reserved for: (a) on-prem single-tenant deployments (inherent to the
profile), (b) customers with contractual requirements for dedicated infrastructure that cannot be
met by vCluster's isolation model.

### Tenant Isolation Stack (SaaS)

```
Physical cluster (Talos + K8s)
└── Cilium CNI (eBPF network policy enforcement)
└── Capsule (Tenant CRDs, namespace grouping, quota, RBAC)
    ├── Tenant A (standard): namespaces tenantA-prod, tenantA-staging
    │   └── Kyverno policies (image admission, pod security, PHI label enforcement)
    └── Tenant B (regulated, vCluster): namespace tenantB-vcluster
        └── vCluster virtual control plane
            └── tenantB workloads (full K8s API isolation)
└── ArgoCD (ApplicationSets per tenant, namespace-scoped ArgoCD instances)
└── Falco (runtime security, per-namespace rule sets)
└── OPA Gatekeeper / Kyverno (admission policies)
```

---

## Sub-Decision 14: CNI Selection

Not listed in the original 14 sub-decisions but implied by the service mesh choice.

### Decision: **Cilium**

Cilium is the CNI for all K8s profiles (K3s single-node, K3s HA, Talos+K8s). It provides:
- NetworkPolicy (standard K8s) + CiliumNetworkPolicy (extended, L7-aware)
- eBPF-based service mesh (Sub-Decision 6)
- Hubble observability (flow-level audit log — satisfies HIPAA audit control 164.312(b))
- WireGuard transparent encryption for node-to-node traffic (PHI in transit protection)
- Load balancing via eBPF kube-proxy replacement (eliminates kube-proxy on all nodes)

On K3s: install Cilium with `--set kubeProxyReplacement=strict`. Disable K3s built-in network
policy controller and Flannel as noted in Sub-Decision 6.

---

## Consequences

### Positive

- **Unified artifact set.** One set of Helm charts, one set of container images, one GitOps repo
  serves all four deployment profiles. Packaging investment amortizes across every profile.
- **Footprint graduation.** K3s single binary + Longhorn + Harbor Satellite + Flux on a single
  node with 8 GB RAM is a viable home lab. The same charts scale to Talos + Mayastor + Harbor +
  ArgoCD at 50-node SaaS without modification.
- **HIPAA-defensible posture.** Talos (no SSH/shell, immutable OS) + Cilium (mTLS + audit flows)
  + Capsule/vCluster (tenant isolation) + Kyverno (policy enforcement) + Harbor (signed images +
  SBOM) constitutes a documented, auditable technical safeguard stack with direct mapping to
  HIPAA Security Rule §164.312 controls.
- **License alignment.** All primary components are Apache 2 or MIT. No BSL, no SSPL, no
  per-node commercial license in the default stack.
- **Air-gap first-class.** The bundle mechanism is not an afterthought — it is the primary
  distribution artifact. Internet-connected installs are a subset of the air-gap install path
  (Harbor mirror replaces USB key; Harbor online replication replaces delta bundles).

### Negative / Risks

- **K3s + Cilium bootstrap complexity.** K3s's built-in Flannel and Traefik must be explicitly
  disabled before Cilium and APISIX are installed. If the install order is wrong, the node enters
  a broken networking state. Mitigated by: a tested `curaos-bootstrap-k3s` script that encodes
  the correct order; integration tests in CI against a KIND cluster simulating K3s.
- **Talos learning curve.** Teams accustomed to SSH-based server management must learn `talosctl`
  and the declarative machine config model. No escape hatch to `ssh root@node`. Mitigated by:
  comprehensive internal runbooks, and the fact that Talos eliminates most reasons to SSH (no
  package installation, no manual config edits).
- **Two GitOps tools.** ArgoCD (connected) + Flux (air-gap) means two operator codebases to keep
  updated. Mitigated by: using the same Helm charts as the source of truth for both; Flux and
  ArgoCD are both CNCF-graduated with overlapping governance.
- **Cilium eBPF kernel requirement.** Cilium's full feature set (WireGuard, kube-proxy
  replacement, L7 policy) requires Linux kernel ≥ 5.10. All Talos nodes meet this (Talos ships
  a hardened 6.x kernel). K3s on older on-prem hardware (kernel 4.x) may require the Cilium
  legacy mode or Flannel fallback. Mitigated by: hardware requirement document specifying kernel ≥
  5.10 for production K3s nodes; home lab guidance recommends Ubuntu 22.04 LTS (kernel 5.15) or
  Debian 12.
- **vCluster Pro license for HA vCluster.** vCluster Standalone HA (multi-control-plane) requires
  an enterprise license. Single-control-plane vCluster is Apache 2 OSS. For regulated tenants
  requiring HA virtual clusters, this is an accepted cost. For non-regulated tenants, Capsule
  namespace isolation is sufficient and costs nothing.
- **Harbor operational burden.** Harbor requires PostgreSQL (for its own metadata store),
  Redis/Valkey, and its own storage. In the home lab profile, Harbor can share the cluster
  PostgreSQL instance and Valkey. In production, Harbor runs on dedicated infrastructure or in a
  dedicated namespace with reserved resources. The Trivy scanner is memory-intensive (~1 GB peak)
  and should be scheduled on a dedicated node in the SaaS profile.

---

## Decision Matrix Summary

| Dimension | Home Lab / Air-gap | SMB On-Prem HA | SaaS Multi-tenant | Hybrid |
|---|---|---|---|---|
| **Orchestrator** | K3s (single-node) | K3s HA (3-server) | Talos + K8s | Talos (vendor) + K3s (customer) |
| **CNI** | Cilium | Cilium | Cilium | Cilium |
| **Ingress** | APISIX Ingress | APISIX Ingress | APISIX Ingress | APISIX Ingress |
| **Service mesh** | None | Cilium SM | Cilium SM | Cilium SM |
| **Storage** | Longhorn | Longhorn | OpenEBS Mayastor | Longhorn (customer) |
| **Registry** | Harbor Satellite + Zot | Harbor | Harbor | Harbor (vendor) + Satellite (customer) |
| **GitOps** | Flux | Flux or ArgoCD | ArgoCD | ArgoCD (vendor) + Flux (customer) |
| **Tenant model** | N/A (single tenant) | N/A (single tenant) | Capsule + vCluster | N/A (single tenant per plane) |
| **Packaging** | Helm 4 + Kustomize | Helm 4 + Kustomize | Helm 4 + Kustomize | Helm 4 + Kustomize |
| **Build tool** | Jib | Jib | Jib | Jib |
| **Base image** | Chainguard JRE | Chainguard JRE | Chainguard JRE | Chainguard JRE |
| **Runtime** | containerd (K3s) | containerd (K3s) | containerd (Talos) | containerd |

---

## Implementation Sequencing

### Phase 0 — Developer Inner Loop (Sprint 1)

- `docker compose up` stack: PostgreSQL 17, Valkey, NATS JetStream, Keycloak 26, SeaweedFS,
  APISIX. Services run locally via `./gradlew bootRun`.
- Jib configured on all 91 service Gradle builds.
- Chainguard JRE base image pinned by digest.
- Harbor instance deployed on a shared development VM (single Harbor + Trivy, no HA).

### Phase 1 — Single-Node K3s (Sprint 2–3)

- K3s installation script: `--disable traefik --disable servicelb --flannel-backend=none`.
- Cilium installed via Helm chart.
- APISIX Ingress Controller installed.
- Longhorn installed.
- Harbor Satellite / Zot for local registry mirror.
- Flux bootstrapped against the `main` branch of the gitops repo.
- First Helm chart group: `identity-stack` (Keycloak + identity-core-service + Postgres operator).

### Phase 2 — SMB On-Prem HA (Sprint 4–6)

- K3s HA cluster provisioned via Ansible (ADR-0111).
- Capsule installed (single-tenant profile, so tenant CRDs unused but Capsule policies active
  for namespace governance).
- Longhorn configured with 3-replica volumes.
- Harbor HA (2 replicas, shared PostgreSQL, Valkey).
- ArgoCD installed as alternative to Flux for connected deployments; both tested.
- Air-gap bundle v0.1 produced and tested against an isolated K3s node.

### Phase 3 — SaaS Multi-tenant (Sprint 7–12)

- Talos cluster provisioned (Sidero Omni or Cluster API + Talos provider).
- Cilium Service Mesh enabled (WireGuard encryption, Hubble).
- OpenEBS Mayastor installed; PostgreSQL moved to Mayastor StorageClass.
- Capsule installed; first tenant onboarded.
- ArgoCD ApplicationSets configured for per-tenant namespace targeting.
- Kyverno policies: image signing enforcement, PHI namespace labeling, pod security `restricted`.
- Falco deployed for runtime security audit.
- vCluster installed for first regulated HealthStack tenant.
- Harbor: production HA, Trivy scan gate on `prod` project, Cosign signing in CI.

### Phase 4 — Hybrid + Federation (Sprint 13–16)

- Customer-side K3s + Flux + Harbor Satellite documented and tested.
- APISIX cross-boundary routing (vendor gateway → customer APISIX) configured.
- Air-gap bundle v1.0: delta mechanism implemented and tested.
- WireGuard VPN tunnel between vendor Talos cluster and customer K3s cluster.

---

## Alternatives Rejected (Summary)

| Alternative | Reason rejected |
|---|---|
| Docker Swarm | Functionally deprecated; no Helm/K8s ecosystem |
| OpenShift / OKD | Commercial license burden or heavy resource overhead |
| Nomad | BSL 1.1 SaaS restriction; lacks K8s-native security primitives (Kyverno, OPA, PSS) |
| Istio (default) | 25–50 GB RAM overhead at 500 services; sidecar model; complex ops |
| Rook-Ceph (block) | Duplicates SeaweedFS (object); 1–2 GB RAM/node overhead |
| HNC | Archived April 2025 |
| JFrog Artifactory OSS | SSPL license |
| Timoni | Niche adoption; CUE expertise barrier |
| Karmada / OCM | Over-engineered for current multi-cluster need; ArgoCD ApplicationSets sufficient |
| Alpine base image | musl libc JVM edge cases; CVE patch cadence slower than Wolfi |
| Paketo Buildpacks | Larger images; slower CI; unnecessary when stack is homogeneous JVM |
| k0s | Smaller community than K3s; no differentiated feature for this use case |
| Portworx | Commercial license, per-node cost |
| Consul | BSL 1.1 license |

---

## Open Questions

1. **Talos vs. RKE2 for on-prem HA.** Some enterprise on-prem customers may have existing
   RKE2 deployments (Rancher-managed). Should CuraOS publish a Rancher/RKE2 compatibility
   profile? Decision deferred to ADR-0111 (provisioning). Current recommendation: Talos for
   greenfield, RKE2 compatibility profile for brownfield Rancher customers.

2. **Cilium kernel floor enforcement.** The minimum kernel requirement (5.10) must be encoded in
   the hardware requirements doc and checked by the installer. This work item belongs in the ops
   installer (ADR-0111).

3. **Harbor vs. Sonatype Nexus for customers with existing Nexus.** Nexus supports OCI v2 since
   version 3.38 and can serve as a Helm OCI registry. If a customer's IT policy mandates Nexus,
   the APISIX admission policy hostname allowlist must include their Nexus hostname. This is a
   configuration point, not a decision reversal.

4. **vCluster HA license cost model.** vCluster Pro pricing is per virtual cluster. At scale
   (100+ regulated tenants), the license cost may exceed the cost of dedicated clusters for that
   segment. Finance review required at 50-tenant mark.

---

## References

- Sidero Labs: [Talos Linux vs. K3s](https://www.siderolabs.com/blog/talos-linux-vs-k3s)
- Cloudraft: [K3s vs Talos Linux production comparison](https://www.cloudraft.io/blog/k3s-vs-talos-linux)
- Sidero Labs: [Air-Gapped Kubernetes with Talos Linux](https://www.siderolabs.com/blog/air-gapped-kubernetes-with-talos-linux)
- Talos Docs: [Air-gapped Environments v1.9](https://docs.siderolabs.com/talos/v1.9/platform-specific-installations/air-gapped)
- VSHN: [Best Kubernetes Distributions 2026](https://www.vshn.ch/en/blog/best-kubernetes-distributions-in-2026-and-why-you-might-not-want-to-run-them-yourself/)
- Chainguard: [Chainguard Containers Overview](https://edu.chainguard.dev/chainguard/chainguard-images/overview/)
- Minimus: [Best distroless image alternatives 2026](https://www.minimus.io/post/best-distroless-image-alternatives-2026)
- onidel: [Longhorn vs OpenEBS vs Rook-Ceph on K3s 2025](https://onidel.com/blog/longhorn-vs-openebs-rook-ceph-2025)
- iomesh: [Kubernetes Storage Capabilities & Performance Analysis](https://www.iomesh.com/blog/kubernetes_persistent_storage_comparison)
- CNCF: [Solving Kubernetes Multi-Tenancy with vCluster](https://www.cncf.io/blog/2025/09/23/solving-kubernetes-multi-tenancy-challenges-with-vcluster/)
- vCluster: [Multi-tenancy in 2025 and beyond](https://www.vcluster.com/blog/multi-tenancy-in-2025-and-beyond)
- Medium: [K8s Multi-Tenancy in 2026: 30 clusters → 6](https://medium.com/@surbhi19/kubernetes-multi-tenancy-in-2026-how-we-stopped-running-30-clusters-and-finally-got-it-right-92beabd60556)
- projectcapsule: [Capsule GitHub](https://github.com/projectcapsule/capsule)
- DEV: [ArgoCD vs FluxCD GitOps Standard 2026](https://dev.to/mechcloud_academy/the-gitops-standard-in-2026-a-comparative-research-analysis-of-argocd-and-fluxcd-46d8)
- Tasrie: [ArgoCD vs Flux: We Run Both in Production](https://tasrieit.com/blog/argocd-vs-flux-gitops-comparison-2026)
- Reintech: [Service Mesh Comparison 2026: Istio vs Linkerd vs Cilium](https://reintech.io/blog/kubernetes-service-mesh-comparison-2026-istio-linkerd-cilium)
- Medium: [Istio vs Linkerd vs Cilium 2025](https://medium.com/@DynamoDevOps/istio-vs-linkerd-vs-cilium-the-brutal-truth-about-service-meshes-in-2025-338067ac5a8d)
- Distr: [Container Registry Comparison 2026](https://distr.sh/blog/container-image-registry-comparison/)
- Harbor Satellite GitHub: [harbor-satellite](https://github.com/container-registry/harbor-satellite)
- ITNEXT: [Buildpacks vs Jib vs Dockerfile for Spring Boot](https://itnext.io/choosing-the-best-docker-image-tool-for-your-spring-boot-app-buildpacks-vs-jib-vs-dockerfile-f76f241bc0ff)
- Tasrie: [HIPAA-Compliant Kubernetes Case Study](https://tasrieit.com/case-studies/healthtech-k8s-security)
- AccountableHQ: [Kubernetes HIPAA Best Practices](https://www.accountablehq.com/post/securing-kubernetes-in-healthcare-hipaa-compliance-and-phi-protection-best-practices)
- Helm: [Helm 4 KubeCon NA 2025](https://vegastack.com/blog/helm-vs-kustomize-complete-kubernetes-application-management-comparison-2025/)
- KubeDo: [Kubernetes Storage Comparison: Ceph, Longhorn, OpenEBS](https://kubedo.com/kubernetes-storage-comparison/)
