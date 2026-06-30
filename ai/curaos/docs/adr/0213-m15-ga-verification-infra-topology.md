---
adr-id: 0213
title: M15 GA-verification infra topology — local amd64 PC + Hetzner control-plane over self-hosted NetBird
status: Accepted
date: 2026-06-06
supersedes: []
superseded-by: null
amends: []
tags: [m15, infra, ga, orchestration, airgap, hybrid, netbird, deploy]
parent-adrs: [0109, 0110, 0164]
issue: your-org/curaos-ai-workspace#517
coordinates-with: [your-org/curaos-ai-workspace#512, your-org/curaos-ai-workspace#516]
authorized-by: user (2026-06-06) — chose local-PC + cheap-server + self-hosted-NetBird path; no public customer demo yet
---

# ADR-0213 — M15 GA-verification infra topology

> **Status:** Accepted. Pins the concrete, near-zero-cost infrastructure the three live-infra M15 stories (#512 signed bundles, #516 demo tenant, #517 GA install-from-scratch) verify against, using hardware/services the user already owns. No new recurring cost.

## Context

The M15 agent-safe wave (S1/S2/S4/S5/S6) shipped — release pipeline, demo-seed, docs-site, onboarding wizard, website — but three stories require a **real** running cluster that agents cannot synthesize:

- **#512** signed v1.0.0 bundles across 4 deployment profiles (cloud SaaS / on-prem / hybrid / air-gap).
- **#516** a demo tenant (originally public/customer-facing).
- **#517** GA install-from-scratch E2E on cloud + air-gap + hybrid.

The user explicitly de-scoped the **public customer demo / marketing** (#516 becomes an internal demo-slice, not a public site) and chose a **local-PC + cheap-online-server + self-hosted-NetBird** path over any paid managed cloud.

## Decision

GA verification runs on **two existing amd64 nodes joined over the user's self-hosted NetBird mesh** (`netbird.example.com`). No new infrastructure, no new recurring spend.

### Node inventory (confirmed 2026-06-06)

| Node | LAN IP | NetBird IP | FQDN | Specs | Role |
|---|---|---|---|---|---|
| **build-host** | 192.168.1.88 | `100.77.0.2` | `build-host.netbird.selfhosted` | amd64, 32 threads, 46 GB RAM, 1.1 TB free | Data-plane; bundle builds; on-prem + air-gap clusters |
| **example** (Hetzner CX43) | public 203.0.113.10 | `100.77.0.1` | `example.netbird.selfhosted` | amd64, 8 vCPU, 16 GB RAM | Hybrid control-plane; NetBird relay/signal/auth; public ingress (Cloudflare origin) |

Both run the self-hosted NetBird mesh (management/signal/relay at `*.example.com` → the Hetzner box). DNS authoritative at Cloudflare (zone `example.com`, token in `example-homelab/secrets/cf-token`); Hetzner managed via `example-homelab/secrets/hcloud-token`.

### Profile → where it runs

| Deployment profile (per [[curaos-orchestration-rule]]) | Verification target | How |
|---|---|---|
| **Bundle build** (#512, all 4 profiles) | build-host | BuildKit/Buildah + cosign per ADR-0110 / [[curaos-image-build-rule]]; bundles are artifacts, no cluster needed to *produce* them |
| **On-prem** (#517) | build-host `cluster-onprem` (k3d/K3s, amd64) | Normal K3s install with the rule's `--disable=traefik,servicelb,local-path,metrics-server` flags so defaults never become load-bearing |
| **Air-gap** (#512/#517 + closes #330) | build-host `cluster-airgap` (2nd k3d, egress default-deny) | Zarf bundle deploy with no registry pull; `assert-zero-egress.sh` proves zero egress. Air-gap testing is inherently offline → free, local |
| **Hybrid** (#517 — vendor control-plane + customer data-plane, charter §4) | control-plane on Hetzner `100.77.0.1`, data-plane (PG/PHI/heavy services) on build-host `100.77.0.2` | K3s server on Hetzner, agent on build-host, joined over the NetBird overlay (private `100.77.x` IPs). This is literally the charter's hybrid model: audit/secrets/data stay on the customer (build-host) plane |
| **Cloud SaaS** (#512 bundle only) | n/a for now | Bundle is built + signed; deploying to a managed EKS/GKE is a future customer concern, not this GA verification |

### Demo tenant re-scope (#516)

**Public customer demo DROPPED for now** (user directive). #516 becomes an **internal demo-slice**: the ~15-service slice the `@curaos/demo-seed` flow needs (identity/tenancy/party/audit/notify + health: encounter/clinical-doc/orders/scheduling/terminology/consent + commerce-core/crm-core + education-core + builder-core/workflow-core) + infra (CNPG PG, Redpanda, SeaweedFS, Valkey, OpenBao, APISIX) ≈ 21 pods ≈ 5-7 GB RAM. Runs on `cluster-onprem`, reachable over the NetBird mesh only — **no public IP, no Cloudflare Tunnel, no marketing surface**. build-host's 46 GB also fits the **full 87-service** install if a complete GA E2E is wanted.

### Networking / exposure

- **Internal reach** = NetBird overlay (`100.77.x`). No public ingress for CuraOS by default.
- **If a subdomain is ever needed** (internal dev convenience): add an `A`/`CNAME` under `example.com` via `cf-token` pointing at the Hetzner box (which already fronts `auth/dev/home/netbird/relay/signal/turn.example.com` → 203.0.113.10) + Caddy reverse-proxy + Cloudflare origin cert (`secrets/origin-cert.pem`). Gated, not public marketing. Deferred until a concrete need.

### Tooling bootstrap (build-host)

Operational source of truth: `/home/mkh/workspace/example-homelab` on `build-host`. The local macOS mirror is `/Users/dev/workspace/example-homelab`, but live deployment and server work should use the `build-host` checkout first. The repo is private and holds homelab deployment config, service manifests, Caddy routes, Cloudflare/Hetzner/NetBird/Pocket ID operations, GHCR/cosign signing material, plaintext secrets by design, personal website source and assets, and CuraOS demo/brochure exposure glue. See [[curaos-live-ops-substrate-rule]] for host selection and secret handling.

Present: docker 29, podman 5.8, bun 1.3.10. Install (all free, amd64): **k3d, kubectl, helm, zarf, cosign, buildah**. Idempotent bootstrap script run over the trusted SSH key. No change to the Hetzner box until the hybrid step.

## Consequences

- **Cost: $0 recurring** beyond hardware the user already owns + the already-running Hetzner CX43. No managed-k8s bill, no demo-hosting bill.
- **amd64 throughout** — eliminates the ARM image-coverage risk of the rejected Oracle-Always-Free path; every CuraOS `oven/bun` + CNPG/Redpanda/APISIX image runs native.
- The hybrid split is a **real, faithful exercise** of charter §4 (vendor control-plane + customer data-plane), not a simulation — the two planes are genuinely separate machines on separate networks joined only by the private mesh.
- Air-gap verification is **stronger** than a cloud test would be: a truly offline second cluster on the same box is the canonical air-gap condition.
- **Not covered:** real public cloud (EKS/GKE/AKS) deploy of the bundle, and any public customer-facing demo — both explicitly out of scope until the user wants them. The bundle's cloud profile is *built + signed* but not *deployed to a managed cloud* in this GA pass.

## Alternatives rejected

- **Paid managed k8s (Civo/DOKS/LKE)** — recurring cost for no benefit over a local k3d cluster for verification.
- **Oracle Cloud Always-Free (24 GB ARM)** — ARM64 image-coverage risk + region capacity uncertainty; the user already has ample amd64 hardware.
- **Cloudflare Tunnel public demo** — only needed for a *public* demo, which is de-scoped; the NetBird mesh already gives private multi-node reach.
- **Hetzner-only** — the 16 GB CX43 alone is tight for the full stack; build-host's 46 GB is the natural data-plane / heavy-lift node, with Hetzner as the lean control-plane.

## References

- Issue #517 (GA install-from-scratch), #512 (bundles), #516 (demo tenant, re-scoped internal)
- [[curaos-orchestration-rule]], [[curaos-airgap-rule]], [[curaos-image-build-rule]], ADR-0109, ADR-0110, ADR-0164
- `example-homelab` (Hetzner + Cloudflare creds, NetBird mesh, Caddy patterns)
- Node inventory confirmed live 2026-06-06 via SSH to build-host + Cloudflare/Hetzner API
