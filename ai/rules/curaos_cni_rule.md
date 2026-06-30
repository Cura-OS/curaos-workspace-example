---
name: curaos-cni-rule
title: CNI (Cilium primary + sidecar-less mTLS)
description: Cilium primary CNI all deployment profiles; sidecar-less mTLS replaces Linkerd/Istio default; Calico documented fallback for legacy customer migrations only; Flannel + kube-proxy iptables banned
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-3 walkthrough - locked AFTER D0 orchestration foundation):

## The rule

**Cilium is the only Kubernetes CNI for every CuraOS deployment profile.** No exceptions for default deploys.

| Deployment profile (per AGENTS.md §4) | CNI |
|---|---|
| Cloud SaaS | Cilium |
| On-Prem (enterprise/regulated) | Cilium |
| Hybrid (control plane + data plane) | Cilium both sides |
| Home lab / Air-gap | Cilium |
| 3rd-party cloud K8s (EKS/AKS via local-vs-3rdparty rule) | Cilium addon if available; else cloud CNI w/ Cilium primitives polyfill documented |

**Service mesh**: Cilium 1.14+ sidecar-less mTLS replaces Linkerd/Istio as DEFAULT. NO separate mesh sidecars for the 96 services. Per-service Linkerd OPT-IN only if a service hits a Cilium L7 gap (advanced Envoy filter chains, gRPC-Web translation, custom JWT mid-proxy).

**Fallback**: Calico permitted ONLY for customer-arrives-with-Calico legacy migration where in-place CNI swap is out of scope. Document as fallback in service migration plan, never as a default.

**Banned for new clusters**: Flannel (L3 only, project dormant), kube-proxy iptables mode (Cilium replaces it via `kubeProxyReplacement=true`).

## Banned

- Flannel (L3 only, no NetworkPolicy enforcement, dormant project)
- kube-proxy iptables mode (Cilium replaces it; `kubeProxyReplacement=true` mandatory)
- Calico for new deployments (legacy migration only)
- Per-service Linkerd/Istio sidecar as default (opt-in only when Cilium L7 insufficient)
- Multiple CNIs in same cluster (not Cilium + Calico simultaneous; pick one)

<!-- fold: rationale, non-binding -->

## K3s + Cilium install sequence

Per [[curaos-orchestration-rule]] (D0), K3s built-in addons are disabled. Cilium is the FIRST add-on installed:

```bash
# K3s server install w/ Flannel + kube-proxy disabled (NetworkPolicy too - Cilium takes over)
INSTALL_K3S_EXEC="server \
  --flannel-backend=none \
  --disable-network-policy \
  --disable=traefik \
  --disable=servicelb \
  --disable=local-path \
  --disable=metrics-server \
  --disable-kube-proxy" \
curl -sfL https://get.k3s.io | sh -

# Then install Cilium via Helm (matches D0 air-gap rule: Cilium chart + images bundled in Zarf)
helm install cilium cilium/cilium \
  --version 1.16.x \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<api-server-ip> \
  --set k8sServicePort=6443 \
  --set hubble.enabled=true \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set authentication.mutual.spire.enabled=false \
  --set authentication.mutual.cilium.enabled=true \
  --set ipam.mode=kubernetes
```

For Talos: same Cilium Helm install; Talos already ships w/o Flannel/kube-proxy.
For RKE2: disable Canal CNI in config; install Cilium same as K3s.

## Why Cilium wins (research grounding)

| Capability | Cilium | Calico | Flannel |
|---|---|---|---|
| eBPF data path (no iptables) | yes native | optional | no |
| kube-proxy replacement | yes (`kubeProxyReplacement=true`) | optional | no |
| L3-L7 NetworkPolicy (HTTP/gRPC/Kafka match) | yes native | L3-L4 only; L7 via Envoy addon | L3 only |
| Sidecar-less mTLS (replaces Linkerd/Istio) | yes (1.14+ stable) | needs separate mesh | needs separate mesh |
| Hubble multi-tenant L3-L7 flow observability | yes native | partial | no |
| FQDN egress allow-list (`api.openai.com` only) | yes | no | no |
| Cluster mesh (multi-cluster L3-L7) | yes | needs Calico Enterprise | no |
| K3s/Talos/RKE2 distro support | yes all | yes all | yes (default but banned per D0) |
| Helm install for air-gap (Zarf bundling) | yes | yes | yes |
| GKE Dataplane v2 = Cilium (3rd-party K8s alignment) | yes | n/a | n/a |
| CNCF Graduated | yes | yes | dormant |
| 2025-2026 momentum | very high | stable | declining |
| Agent training data 2025-2026 | high + growing | high (stable) | low |

## HIPAA fit (clinical L7 segmentation)

Cilium L7 NetworkPolicy enables clinical-grade rules:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: only-clinician-app-can-write-patient
  namespace: healthstack-patient-service
spec:
  endpointSelector:
    matchLabels:
      app: healthstack-patient-service
  ingress:
  - fromEndpoints:
    - matchLabels:
        k8s:io.kubernetes.pod.namespace: clinician-app
    toPorts:
    - ports:
      - port: "8080"
        protocol: TCP
      rules:
        http:
        - method: POST
          path: "/fhir/Patient"
        - method: PUT
          path: "/fhir/Patient/.*"
```

This level of HIPAA-grade segmentation IS NOT possible w/ Calico's L3-L4 NetworkPolicy alone - Calico needs Envoy addon AND additional configs. Cilium native = one CRD.

## FQDN egress (per local-vs-3rdparty rule)

Per [[curaos-local-vs-3rdparty-rule]], tenants may BYO LLM/email/storage. Cilium FQDN egress controls outbound:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-tenant-llm-egress
spec:
  endpointSelector:
    matchLabels:
      app: ai-orchestrator
  egress:
  - toFQDNs:
    - matchName: "api.openai.com"
    - matchName: "api.anthropic.com"
    - matchPattern: "*.amazonaws.com"
    toPorts:
    - ports:
      - port: "443"
        protocol: TCP
```

Air-gap profile = zero FQDN allow → outbound deny by default → safe.

## Service mesh decision rolled in

Per research 06 §4 + Cilium 1.14+ stable release: Cilium sidecar-less mTLS via eBPF + Hubble identity = production-ready 2025-2026. CuraOS DEFAULT = NO Linkerd/Istio sidecars.

Trade-offs accepted:
- Some advanced features (heavy Envoy filter chains, gRPC-Web translation, custom JWT validation in proxy) require Linkerd sidecar
- Per-service opt-in via AGENTS.md frontmatter `network.mesh: linkerd` (rare)
- Saves ~50-200MB RAM per pod × 96 services × multi-tenant = significant cluster RAM savings
- One CRD model agents learn instead of two (Cilium + Linkerd/Istio)

## 3rd-party cloud K8s path (per local-vs-3rdparty rule)

| Cloud K8s | CNI default | Cilium availability |
|---|---|---|
| GKE | Dataplane v2 IS Cilium under hood | native - no install needed |
| EKS | AWS VPC CNI | Cilium chained mode addon available |
| AKS | Azure CNI | Cilium dataplane v2 addon (preview 2025) |

For tenant-managed cloud K8s without Cilium support: document fallback = use cloud CNI's native NetworkPolicy (L3-L4 only); CuraOS Cilium-specific L7 features unavailable; tenant accepts reduced HIPAA-grade segmentation OR migrates to self-hosted K3s.

## Modulith ↔ standalone compliance

Per [[curaos-modulith-standalone-rule]]:
- **Standalone-clone boot** (`docker-compose.dev.yml` per service per D0): NO Cilium - Docker bridge networking; service connects to compose deps via localhost. Network policy not enforced at dev - declare in service AGENTS.md frontmatter `network.policy` for prod-time application.
- **Modulith mode** (root infra Compose + Bun --hot host): same - Docker bridge; no Cilium
- **Prod mode** (K8s): Cilium enforces all CiliumNetworkPolicy CRDs

Dev-vs-prod parity: NetworkPolicy not enforced at dev = expected; ALL services tested for policy correctness at k3d/Tilt integration layer (per D0 dev model).

## Agentic-tool friendliness

Why Cilium wins for AI agents specifically:
- ONE CNI CRD model (CiliumNetworkPolicy) for all clusters → agents author from spec w/o per-distro syntax differences
- Hubble structured event stream is OTel-compatible → agents query L7 events via VictoriaLogs/Loki alongside app logs (per D-future observability)
- Hubble UI runs in cluster → agents inspect tenant flow isolation visually if needed
- Cilium-CLI predictable subcommands; training data sufficient
- CRD docs at docs.cilium.io are excellent
- Codegen Engine recipes (per ADR-0123) emit one CiliumNetworkPolicy per service - agents read schema once, generate everywhere

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first, no cloud lock-in | Cilium OSS; multi-vendor; CNCF Graduated |
| AGENTS.md §4 all 4 profiles same artifacts | Cilium Helm chart deploys to any K8s; Zarf bundles for air-gap |
| AGENTS.md §6 reliability + security | L7 segmentation + mTLS + FQDN egress = defense in depth |
| [[curaos-orchestration-rule]] (D0) | K3s addon-disable pattern: Cilium installed first via Helm; no distro lock-in |
| [[curaos-local-vs-3rdparty-rule]] | Cilium IS local default; 3rd-party cloud K8s uses Cilium addon when available, falls back to cloud CNI w/ degraded features documented |
| [[curaos-healthstack-vision]] (patient-centric → no PHI cross-tenant) | L7 + FQDN segmentation enforces HIPAA-grade tenant isolation |
| [[curaos-ai-mirror-rule]] | Cilium Helm values + CiliumNetworkPolicy manifests live in curaos/ops/ + curaos/helm/; ai/curaos/ mirrors |

## How to apply

- Codegen Engine recipes for K8s manifests include per-service CiliumNetworkPolicy w/ deny-all default + explicit allow-list
- Service AGENTS.md frontmatter declares:
  ```yaml
  network:
    cni: cilium
    policy:
      ingress: [<NS allow-list>]
      egress:
        fqdns: [<api.external.com>]
        ports: [<L4 allow-list>]
    mesh: cilium  # default; rare opt-in to linkerd
    l7:
      enabled: true
      rules: [{method: POST, path: /endpoint}]
  ```
- ops/ codebase: single Cilium Helm release per cluster profile; per-tenant CiliumNetworkPolicy CRDs generated from tenant onboarding pipeline
- Tilt dev cluster (per D0): k3d clusters install Cilium too - dev tests policies before prod
- AI-doc per service ai/curaos/<svc>/AGENTS.md references this rule when declaring `network:` block

## ADRs

ADR-0135/0136/0137 were never filed at those numbers. The K8s/orchestration ADR is `0109-containers-orchestration.md`. Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for current CNI/K8s ADR mapping.
