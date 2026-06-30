# ADR-0111 — Infrastructure Automation and Provisioning

> **✅ ACCEPTED** — aligned with [ADR-0150](0150-baseline-alignment-rules.md) §5 (STANDS). Ansible + Talos + Tinkerbell + ClusterAPI + Karmada + NetBird + Velero + Crossplane + KEDA all runtime-agnostic infrastructure. Local + 3rd-party rule applies (cloud managed K8s + provider operators as 3rd-party).


**Status:** Accepted  
**Date:** 2026-05-24  
**Deciders:** Platform Engineering, Operations  
**Supersedes:** —  
**Related:** ADR-0108 (OpenBao), ADR-0109 (K3s/Talos/Cilium/ArgoCD/Harbor), ADR-0110 (CI/CD)

---

## 1. Context

CuraOS runs 91 backend services and ~25 frontend packages across four deployment profiles:

| Profile | Tenancy | Notes |
|---|---|---|
| Cloud SaaS | Per-tenant schema/DB isolation | Vendor-managed, horizontal scale |
| On-Prem | Single tenant | Customer infra, overlays opt-in |
| Hybrid | Vendor control plane + customer data plane | Audit/secrets handoff on customer infra |
| Home lab / air-gap | Single tenant offline | No external calls, USB-key provisioning |

ADR-0109 committed to K3s (home lab + SMB), Talos+upstream K8s (SaaS), Cilium, ArgoCD+Flux GitOps, and Harbor registry. ADR-0108 committed to OpenBao for secrets. ADR-0110 committed to GitHub Actions + ARC for CI/CD.

Outstanding: how nodes are provisioned, how bare metal is enrolled, how the OS images are built, how the hybrid control-plane→data-plane bridge works, how the overlay mesh network is established, how backups and DR work, how tenants are onboarded automatically, what the on-prem installer UX looks like, how updates are delivered to air-gap sites, how customer customisation layers on, how autoscaling is driven, and what the tenant admin surface is.

### Hard constraints
- Terraform is **out of scope** per charter: proprietary cloud-only IaC excluded.
- Self-hosted first; air-gap mandatory for home-lab profile.
- License alignment for SaaS redistribution.
- HIPAA: audit trail on every provisioning action.
- All four deployment profiles must be viable from one codebase/playbook set.

---

## 2. Sub-Decisions

### 2.1 Configuration Management and Provisioning

**Options evaluated:**

| Option | Speed | Air-gap | Tag support | Production maturity | Verdict |
|---|---|---|---|---|---|
| Ansible | Moderate | Yes | Yes (--tags) | Very high, large module ecosystem | Chosen |
| Pyinfra | ~10× faster than Ansible | Yes | No (see below) | Growing; bugs remain (temp-file leaks, credential exposure in ps) | Rejected |
| Salt | High | Yes | Yes (grain targeting) | High; agent model adds ops cost | Rejected |
| Chef | N/A | N/A | Yes | Commercial only for production | Excluded (license) |
| Puppet | Moderate | Yes | Yes | Declining adoption | Rejected |
| cdist / shell + cloud-init | Fast | Yes | No | Minimal abstraction; scales poorly to 91 services | Rejected |

**Decision: Ansible.**

Pyinfra is notably faster (sub-second SSH fan-out vs. Ansible's Python module startup overhead that can reach 30+ minutes on zero-change runs for large inventories) and uses native Python rather than YAML. However, production evaluation (Nov 2025 testing) found: no built-in tag system, credential exposure in process listings without `hidepid`, and unresolved bugs including ~115 MB temp-file leaks per Deb operation. For a HIPAA environment where audit-clean provisioning is mandatory, these gaps are disqualifying today.

Ansible provides:
- `--tags` / `--limit` scope control essential for targeted remediation across 91 services
- `no_log: true` for credential tasks (HIPAA-required audit masking)
- Huge module library for Kubernetes (community.kubernetes, ansible.posix)
- Native vault integration (`ansible-vault`) bridges to OpenBao via lookup plugin
- Air-gap: roles bundle cleanly as tarballs, no outbound call required

Ansible is used for Day-0 (bare-metal prep, OS hardening, K3s single-node) and Day-2 (node patching, cert rotation, software upgrades outside GitOps scope). Kubernetes-native resources (Deployments, ConfigMaps, CRDs) are managed by ArgoCD/Flux, not Ansible, after cluster bootstrap.

Ansible lint and `ansible-playbook --check` run in CI (ADR-0110 ARC runners).

---

### 2.2 OS Image Building

**Options evaluated:**

| Option | Immutability | Air-gap | K8s-native | Verdict |
|---|---|---|---|---|
| Packer | No | Yes (local builders) | No | Rejected |
| mkosi | Yes (systemd-based) | Yes | No | Rejected (niche) |
| debootstrap + custom | No | Yes | No | Rejected (manual toil) |
| **Talos Image Factory** | Yes (API OS) | Yes (offline workflow) | Yes | **Chosen for SaaS/on-prem K8s nodes** |
| **Kairos** | Yes (meta-distro) | Yes (OCI-distributed) | Yes | **Chosen for edge/home-lab** |
| Ignition/CoreOS | Yes | Yes | No | Rejected (RHEL ecosystem coupling) |
| cloud-init + kickstart | No | Yes | No | Rejected (mutable) |

**Decision: Talos Image Factory for SaaS/on-prem K8s nodes; Kairos for edge and home-lab profiles.**

**Talos Image Factory** (factory.talos.dev) produces custom installer container images from a declarative schematic: extensions, firmware, kernel arguments. For air-gap:
1. On connected machine: `talosctl images default > images.txt`, then `talosctl images cache-create` to download all container images into a local cache directory.
2. Build ISO via the Talos imager container with the pre-seeded cache. Resulting ISO embeds a `registryd` pull-through cache, eliminating need for a separate registry in-cluster post-install.
3. USB boot. `machine.features.imageCache.localEnabled: true` in machineconfig activates the on-disk cache.
4. Upgrades: new ISO produced via Image Factory on connected machine, transferred as OCI artifact via Harbor to the air-gap site.

Talos Linux v1.9+ (2025) introduced first-class image cache support, making the above workflow production-grade. The image is immutable (read-only root, API-only admin, no SSH).

**Kairos** is chosen for home-lab and edge because:
- Distribution-agnostic (OCI layer on top of any Linux distro).
- P2P mesh bootstrap via distributed ledger: nodes discover each other and form the cluster without a pre-configured bootstrap node—critical for home-lab where no DHCP/PXE infrastructure exists.
- Air-gapped upgrades via in-cluster OCI registry.
- CNCF Sandbox project; Spectro Cloud (commercial maintainer) provides long-term support signal.
- Integrates with Kamaji (hosted control plane CRD), enabling multi-tenant cluster-per-customer isolation with low overhead.

Both image types are built in CI (ADR-0110) and pushed to Harbor (ADR-0109).

---

### 2.3 Cluster Bootstrap (Day-0)

**Options evaluated:**

| Option | Air-gap | Talos compat | K3s compat | Verdict |
|---|---|---|---|---|
| **Talos native** (`talosctl`) | Yes | Yes (native) | N/A | **Chosen for SaaS/on-prem** |
| k3sup | Yes | No | Yes | Considered for K3s |
| **k0s** (single binary) | Yes | N/A | Shared DNA | **Chosen for on-prem installer** |
| kubeadm | Yes | No | No | Rejected (mutable OS assumption) |
| Sidero Metal (CAPI provider) | Yes | Yes | No | Rejected (complexity vs value for small installs) |
| Kairos native | Yes | N/A | Yes (K3s distribution option) | Chosen for home-lab |
| RKE2 (Rancher) | Yes | No | No | Rejected (SUSE lock-in risk) |
| MicroK8s | Partial | No | No | Rejected (snap dependency, offline issues) |

**Decision: Talos native bootstrap for SaaS; k0s for on-prem installer; Kairos+K3s for home-lab.**

**Talos native:** `talosctl gen config` produces machineconfig YAML. Config applied to nodes via `talosctl apply-config`. Entirely API-driven, no SSH, no mutable state. Bootstrap sequence:
1. Boot from Talos ISO (air-gap: USB with pre-seeded image cache).
2. Apply controlplane machineconfig → `talosctl bootstrap` on first controlplane.
3. Worker machinconfigs applied; nodes auto-join via `kubeconfig`.
4. ArgoCD bootstrapped from a sealed initial Application pointing to GitOps repo (ADR-0109).

**k0s** is chosen as the basis for the on-prem self-hosted installer (see §2.10) because it ships as a single static binary with zero host OS dependencies beyond the kernel. Mirantis offers enterprise support; the project is actively maintained and CNCF-conformant. k0s supports the same GitOps surface (ArgoCD, Flux) as the SaaS profile, maintaining one codebase.

**Kairos + K3s** for home-lab uses Kairos's P2P mesh bootstrap with K3s as the embedded distribution. No external bootstrap infrastructure required.

---

### 2.4 Bare-Metal Provisioning (On-Prem Customer Racks)

**Options evaluated:**

| Option | CNCF | PXE | Workflow engine | Cluster API provider | Air-gap | Verdict |
|---|---|---|---|---|---|---|
| **Tinkerbell** | Sandbox | Yes | Yes (tink workflows) | Yes (CAPT) | Yes | **Chosen** |
| MAAS (Canonical) | No | Yes | No | Yes (CAPI provider) | Partial | Rejected |
| Foreman/Katello | No | Yes | Limited | No | Yes | Rejected |
| Cobbler | No | Yes | No | No | Yes | Rejected |
| Sidero Metal | No | Yes | No | Yes (CAPI provider) | Yes | Rejected |
| Custom PXE | N/A | Yes | No | No | Yes | Rejected |

**Decision: Tinkerbell.**

Tinkerbell (CNCF Sandbox) is the only option that is:
1. Cloud-native (runs as K8s workloads in a bootstrap cluster).
2. Workflow-driven (tink workflows = reproducible, auditable provisioning sequences).
3. Equinix Metal production-validated across millions of hardware provisions at dozens of global sites.
4. Compatible with Cluster API via the CAPT (Cluster API Provider Tinkerbell) provider.
5. Genuinely self-hostable with no proprietary cloud dependency.

MAAS (Canonical) is the most mature alternative with a polished UI and CAPI provider, but its cloud-init model produces mutable OS state and its PXE stack couples to Ubuntu by preference. Foreman/Katello and Cobbler are legacy tools with no Kubernetes-native model.

Tinkerbell CNCF Sandbox status (accepted Nov 2020) is acceptable here because the project has production provenance at scale. The `tink` sub-repo was deprecated and consolidated into the main `tinkerbell/tinkerbell` repo, which is the current deployment target.

**HIPAA audit note:** Every tink workflow execution is recorded as a Kubernetes event; event streams pipe to the observability stack (ADR-0107). Each workflow action must emit a structured audit log line with: tenant-id, hardware-id, action-name, actor, timestamp, result. An Ansible role enforces this requirement on workflow templates during enrollment.

---

### 2.5 Hybrid Control-Plane / Data-Plane Mechanism

**Options evaluated:**

| Option | Kubernetes-native | No Terraform | Tenant isolation | Self-hosted | Verdict |
|---|---|---|---|---|---|
| **Karmada** | Yes | Yes | Push/pull model | Yes | **Chosen for workload distribution** |
| **Cluster API (CAPI)** | Yes | Yes | Cluster-per-tenant | Yes | **Chosen for cluster lifecycle** |
| Crossplane | Yes | Yes | Composition-based | Yes | Considered; rejected as primary |
| ArgoCD multi-cluster | Yes | Yes | App-level only | Yes | Used as delivery layer |
| Custom bridge | N/A | Yes | Custom | Yes | Rejected |

**Decision: Cluster API for cluster lifecycle + Karmada for workload propagation, with ArgoCD as delivery layer.**

These are not competing tools: Cluster API handles _provisioning_ (creating/destroying/upgrading clusters), Karmada handles _scheduling_ (which workloads run on which cluster), and ArgoCD handles _delivery_ (GitOps sync from repo to cluster).

**Cluster API (CAPI):** manages the cluster lifecycle of customer data-plane clusters from the vendor control plane. A management cluster running CAPI controllers provisions customer clusters declaratively. For bare-metal on-prem: CAPT (Tinkerbell provider) provisions nodes; for Talos: CAPI Talos bootstrap/controlplane providers. No Terraform required; all infra expressed as Kubernetes CRDs.

**Karmada v1.16+ (2025):** CNCF Incubating project. Manages workload propagation across the SaaS multi-cluster topology:
- Push model: Karmada controller in hub pushes to spoke clusters with direct connectivity.
- Pull model: `karmada-agent` in spoke clusters pulls from hub, used for customer data-plane clusters where firewall rules prevent hub→spoke initiation.
- PropagationPolicy CRDs define per-tenant scheduling constraints (affinity, spread, replication count).
- v1.15/1.16 adds enhanced resource awareness and multi-component workload scheduling for coherent tenant bundle placement.

**Crossplane** is used as a _supplementary_ tool for composing tenant infrastructure (Keycloak realm, DB schema, namespace, monitoring dashboards) as a single composite resource (XR). It is not the primary cluster lifecycle manager because the Cluster API split of responsibilities is cleaner and better-documented for multi-cluster topologies.

---

### 2.6 Edge / Customer Site Network

**Options evaluated:**

| Option | Self-hosted | Kubernetes operator | ACL/policy | HIPAA-suitable audit | Verdict |
|---|---|---|---|---|---|
| **NetBird** | Yes (full stack) | Yes (K8s operator) | Yes (group ACL + SSO) | Partial (API logs) | **Chosen** |
| Headscale | Yes (control plane only) | No (community) | Limited | No GUI | Rejected |
| WireGuard (raw) | Yes | No | No | No | Rejected |
| Tailscale | Partial (SaaS coord) | Yes | Yes | Partial | Rejected (SaaS coord) |
| ZeroTier | Yes (self-hosted moon) | No | No | No | Rejected |
| OpenZiti | Yes | Partial | Yes | Yes | Considered |
| Nebula (Slack) | Yes | No | Yes (cert-based) | No UI | Rejected |
| Twingate | No (SaaS only) | No | Yes | No | Excluded |

**Decision: NetBird.**

NetBird provides the full self-hosted mesh VPN stack: management server, signal server, relay (STUN/TURN), and clients — nothing routes through a third-party cloud. Critical for HIPAA: PHI must not traverse vendor-operated infrastructure.

Key differentiators over Headscale:
- Official Kubernetes operator for ephemeral peer management in autoscaling workloads.
- Built-in web UI (HIPAA audit trail for network access changes).
- Native IdP federation (OIDC) → integrates with Keycloak (the CuraOS IdP).
- Group-based ACLs with device posture checks.
- Scales to large networks; Headscale is documented as "limited" for dynamic node counts.

NetBird creates the encrypted overlay tunnel between the vendor control plane and the customer data-plane cluster. The Karmada pull-agent in the customer cluster reaches the hub exclusively over this tunnel. All tunnel establishment events log to the audit stack.

**OpenZiti** was considered as an alternative with stronger zero-trust primitives (application-embedded SDK, no OS-level routing). Rejected because its Kubernetes integration is less mature and the operational model is significantly more complex for 91 services.

---

### 2.7 Backup and DR Orchestration

**Options evaluated:**

| Option | K8s-native | PVC snapshots | Object storage | HIPAA encryption | Verdict |
|---|---|---|---|---|---|
| **Velero + CSI snapshots** | Yes | Yes (via VolumeSnapshot) | Yes (S3/MinIO) | Yes (server-side, in-transit) | **Chosen** |
| Kasten K10 | Yes | Yes | Yes | Yes | Rejected (commercial license) |
| Stash | Yes | Yes | Yes | Yes | Considered |
| CloudCasa | Partial (SaaS) | Yes | Yes | Yes | Rejected (SaaS coord) |
| Custom (pgBackRest + Longhorn snapshots + SeaweedFS versioning) | No | Partial | Partial | Manual | Rejected |

**Decision: Velero with Longhorn CSI snapshots and MinIO (self-hosted S3) as backup target.**

The Velero + Longhorn + MinIO combination is the canonical self-hosted Kubernetes backup stack for 2025-2026:

- Velero uses the `velero-plugin-for-csi` to trigger Longhorn VolumeSnapshots via the CSI interface.
- Longhorn v2 Data Engine (2025) adds linked-clone: Velero's temporary backup PVC is created almost instantly, reducing backup windows significantly on large volumes.
- MinIO is the backup target for all profiles including air-gap (runs in-cluster or on a dedicated NAS).
- Backup schedule expressed as Velero `Schedule` CRDs, managed via GitOps (ArgoCD).

**HIPAA requirements on backups:**
- Backup data encrypted at rest (MinIO server-side encryption with OpenBao-managed KMS key).
- Backup data encrypted in transit (TLS enforced on MinIO endpoint).
- Every Velero backup/restore operation emits a structured audit event to the central audit log (ADR-0108 audit chain).
- Restore test schedule: automated restore-and-verify Job runs weekly in a ephemeral namespace, deletes itself on success, alerts on failure.
- Retention: 30-day minimum for PHI-adjacent backups; configurable per tenant via annotation on the Backup Schedule CRD.

Stash (Appscode) is technically sound but has a more complex operator model and the free tier excludes some enterprise features relevant here.

---

### 2.8 Disaster Recovery Scenarios

Three distinct DR patterns emerge from the four deployment profiles:

#### 2.8.1 SaaS — Region Failover

- Karmada PropagationPolicy defines a secondary region spread rule per tenant tier.
- Velero backups replicate to a secondary MinIO endpoint in the standby region via MinIO site replication.
- RTO target: < 4 hours (config-driven, not manual). RPO target: < 1 hour (hourly incremental snapshots).
- Failover trigger: automated via Prometheus alert → runbook → ArgoCD sync targeting standby cluster.
- HIPAA: failover activity logged to audit trail with reason codes.

#### 2.8.2 On-Prem — Bare-Metal Restore

- Velero backup stored on customer-controlled MinIO (on-prem, separate physical node from cluster).
- Tinkerbell re-provisions replacement hardware from a stored workflow and hardware descriptor CRD.
- Talos machineconfig re-applied from Git; cluster re-bootstraps.
- ArgoCD re-syncs all applications from the GitOps repo.
- Velero restore re-hydrates PVCs.
- Runbook tests executed quarterly; results archived in audit log.
- RTO target: < 8 hours for full cluster restore. RPO: 1 hour.

#### 2.8.3 Air-Gap — Local Backup Recovery

- Velero backup target: MinIO running on a dedicated local appliance (NAS or SBC with USB-attached storage).
- No external network dependency for backup or restore.
- Recovery process identical to on-prem (§2.8.2) except Tinkerbell and Harbor are also local.
- USB-key delta update bundle (see §2.11) carries the Velero binary and restore plugin alongside cluster artifacts.
- RTO target: < 12 hours (manual hardware dependency). RPO: 4 hours (hourly snapshots to local storage).

---

### 2.9 Tenant Onboarding Automation

**Pattern: GitOps-driven Composite Provisioning via Crossplane XR + ArgoCD ApplicationSet + Capsule**

When a new tenant is created (SaaS), a single Git commit to the `tenants/` directory triggers the full stack:

```
tenants/
  <tenant-slug>/
    tenant.yaml          # Crossplane Composite Resource (XR)
    argocd-app.yaml      # ArgoCD Application pointing at tenant Helm values
```

The Crossplane XR composition provisions (in dependency order, enforced by readiness probes):

1. **Capsule Tenant CRD** — creates the Kubernetes namespace group with resource quotas, RBAC, and network policies. Owner: `tenant-admin@<slug>.curaos.io`.
2. **Keycloak Realm + Organization** — via Crossplane Keycloak provider: realm, OIDC client, default roles, branding realm-settings (colours, logo URL).
3. **PostgreSQL schema** — via Crossplane postgresql provider: creates `<tenant_slug>` schema in the tenant-tier DB cluster, grants service accounts, applies baseline migrations via init Job.
4. **OpenSearch index** — via Crossplane Job: creates tenant-namespaced index with ILM policy.
5. **Karmada PropagationPolicy** — assigns tenant workloads to the correct cluster region/tier based on tenant SLA label.
6. **Monitoring dashboards** — Grafana dashboard provisioned from a ConfigMap template, datasource scoped to tenant's Prometheus label selector.
7. **Branding bundle** — ConfigMap with logo, colour tokens, locale defaults; mounted into the app-builder service for that tenant's namespace.
8. **NetBird peer group** — tenant admin SSO group mapped to a NetBird ACL group; grants access to tenant namespace resources.

ArgoCD ApplicationSet (cluster generator) creates an Application per tenant namespace, targeting the tenant's Helm values override file. `syncPolicy.automated.prune: true` ensures deprovisioning mirrors provisioning.

**Audit requirement:** each step in the Crossplane composition emits a structured event with `provisioningAction`, `tenantId`, `actor` (CI service account + PR author from git metadata), `timestamp`, `result`. These events are forwarded to the immutable audit log via the observability pipeline (ADR-0107/ADR-0108).

**Deprovisioning:** reverse order, soft-delete first (namespaces annotated `deletion-timestamp`, resources moved to a quarantine namespace for 30 days), then hard-delete. PHI data handling during deprovisioning follows GDPR right-to-erasure and HIPAA decommission procedures.

---

### 2.10 On-Prem Installer UX

**Options evaluated:**

| Option | Air-gap | Single artefact | Custom branding | Verdict |
|---|---|---|---|---|
| Single binary (k0s-based) | Yes | Yes | Partial | **Chosen** |
| OCI bundle + shell script | Yes | Yes | Yes | Supplementary layer |
| ISO with embedded installer | Yes | Yes | Limited | Considered |
| Helm umbrella + Ansible playbook | Yes | No (multi-step) | No | Rejected for customer UX |
| Custom CLI (Go) | Yes | Yes | Yes | Build on top of k0s |

**Decision: `curaos-install` — a Go CLI wrapping k0s bootstrap and ArgoCD initial sync, distributed as a single static binary bundled in an OCI artifact.**

Architecture:
- `curaos-install` binary (Go, statically compiled, ~30 MB).
- OCI artifact (`harbor.curaos.io/install/curaos-installer:<version>`) bundles: binary, k0s binary, Talos ISO (if bare-metal profile), Helm chart defaults, ArgoCD bootstrap Application, Harbor registry CA, OpenBao bootstrap config.
- Customer downloads the OCI artifact via `docker pull` (online) or receives USB/ISO (air-gap).
- `curaos-install preflight` validates hardware minimums (CPU, RAM, disk, network ports).
- `curaos-install init --profile [saas|onprem|hybrid|homelab]` bootstraps k0s (on-prem) or joins to a Talos cluster (SaaS-managed data plane).
- `curaos-install configure` applies OpenBao bootstrap, Harbor registry, Keycloak, and triggers ArgoCD initial sync.
- Progress rendered as a structured log + a web UI on `localhost:8080` (local only) showing phase completion. No external telemetry without explicit opt-in.
- Every `curaos-install` action writes a timestamped audit event to a local append-only log (`/var/log/curaos/install-audit.jsonl`); uploaded to the control plane on first connectivity.

For truly air-gapped sites: `curaos-install bundle export --output ./bundle.tar` on a connected machine produces a self-contained tarball; `curaos-install bundle import ./bundle.tar` on the isolated site applies it.

---

### 2.11 Update and Patch Delivery

**Rolling strategy:** In-place rolling update (default for all stateless services via Kubernetes rolling deployment strategy, configured in ArgoCD). Zero-downtime target.

**Blue-green:** Used for stateful services and database schema migrations. Argo Rollouts manages the switch; traffic shifted via Cilium network policy update, not load-balancer reconfiguration (no proprietary cloud LB dependency).

**Canary:** Optional per-service via Argo Rollouts `CanaryStrategy` with KEDA-metric analysis gates (see §2.14). Enabled by default for services touching PHI.

**Air-gap update delivery:**

Two mechanisms, customer chooses based on connectivity window:

1. **USB-key delta bundle:** `curaos-install bundle export --since <last-version>` produces a signed OCI tarball containing only the image layers and Helm chart diffs since the last applied bundle. Customer imports on-site via `curaos-install bundle import`. Signature verified against CuraOS release signing key (cosign, key stored in OpenBao).

2. **Scheduled connected sync:** A `maintenance-window` CronJob in the cluster opens a time-bounded NetBird tunnel to the vendor update endpoint, pulls delta bundles into the local Harbor mirror, then closes the tunnel. Frequency configurable (weekly default). Suitable for sites with intermittent connectivity (e.g., clinic with a 4G uplink during business hours).

**OS patch delivery:**
- Talos nodes: new Talos image produced by Image Factory, pushed to Harbor, applied by a `talosctl upgrade` Ansible role triggered from CI on a maintenance schedule.
- k0s nodes (on-prem): k0s binary update via Ansible role; workers drained, updated, re-joined sequentially.
- Kairos nodes (home-lab): OCI image update consumed from local Harbor mirror; Kairos handles A/B partition upgrade atomically.

---

### 2.12 Per-Customer Customisation

**Layering model: Base → Profile → Tenant → Site**

| Layer | Contents | Mechanism |
|---|---|---|
| Base | Default Helm values, stock branding tokens, global feature flags | Helm chart defaults in GitOps repo |
| Profile | Deployment-profile overrides (SaaS vs on-prem network config, storage class, replica counts) | Helm values file per profile in `profiles/` |
| Tenant | Branding (logo, colours, locale), enabled overlays (HealthStack, ERP, etc.), feature flag overrides, integration configs (FHIR endpoint, ERP connector) | Crossplane XR annotation + ConfigMap per tenant namespace |
| Site | Local hardware quirks, air-gap registry mirror, maintenance window schedule | `site-config.yaml` applied by `curaos-install`, stored in cluster ConfigMap |

The App/Site Builder (ADR-0106 frontend) reads tenant-scoped ConfigMaps at runtime to apply branding without re-deploying the application image. Feature flags are served by a flagd sidecar (OpenFeature provider) reading from a ConfigMap backed by the tenant's feature-flag store.

Tenant-layer customisation is self-service via the Tenant Admin UI (§2.13). Site-layer customisation requires `curaos-install configure --site` re-run.

**No forking:** all customisation expressed as configuration overlays on the stock distribution. Custom code requires an approved integration point (webhook, plugin API, or BPM workflow extension). Direct binary forks are unsupported.

---

### 2.13 Self-Service Tenant Admin UI

**Decision: Extend the existing admin app (ADR-0106) with a tenant-scoped admin module, not a separate surface.**

Rationale: the App/Site Builder (ADR-0106) already generates admin surfaces from BPM definitions and domain contracts. A separate tenant admin SPA would duplicate the shell, auth plumbing, and design system.

Tenant admin module exposes (scoped to the authenticated tenant admin's Keycloak role):
- User and group management (via Keycloak SCIM API).
- Branding customisation (logo, colours, locale) with live preview.
- Enabled overlay toggle (HealthStack, ERP) with provisioning status.
- Integration configuration (FHIR endpoint, ERP connector, outbound webhooks).
- Backup schedule and retention settings (Velero Schedule CRDs via the platform API; admin cannot disable backups entirely — HIPAA constraint).
- Audit log viewer (read-only, scoped to tenant's namespace events, 90-day window).
- Resource usage dashboard (Grafana panel embed, tenant Prometheus label selector).

RBAC: `tenant-admin` Keycloak role maps to a Kubernetes ClusterRole scoped to the tenant's Capsule namespace group. Tenant admin cannot see or modify other tenants' resources. All API calls through the platform API layer which enforces tenant boundary checks and logs every mutation.

---

### 2.14 Capacity Planning and Autoscaling

**Options evaluated:**

| Option | Event-driven | Air-gap | K3s support | On-prem viable | Verdict |
|---|---|---|---|---|---|
| HPA (CPU/memory) | No | Yes | Yes | Yes | Baseline |
| VPA | No | Yes | Yes | Yes | Supplementary |
| **KEDA** | Yes | Yes | Yes | Yes | **Chosen** |
| Karpenter (native) | No | No (AWS) | No | No | Rejected |
| vCluster Auto Nodes | Yes (KEDA-based) | Partial | Partial | Partial | Considered |

**Decision: KEDA as primary autoscaler, HPA as fallback for non-event-driven workloads, VPA for right-sizing in dev environments.**

KEDA (CNCF Graduated) scales any Kubernetes workload based on external event sources, including scale-to-zero. Critical for CuraOS because:
- 91 services with highly variable load (e.g., claims processing spikes, batch lab result imports, BPM workflow bursts).
- Event sources map directly to CuraOS messaging infrastructure: NATS JetStream consumer lag, PostgreSQL queue depth, Prometheus metrics (custom KEDA Prometheus scaler).
- Scale-to-zero for background services in home-lab profile reduces resource footprint.
- K3s support: KEDA runs identically on K3s (tested; no cloud-provider dependency).
- Air-gap: KEDA images pre-seeded in Harbor, KEDA ScaledObject CRDs in GitOps repo.

**2025 KEDA enhancements applicable:**
- OpenTelemetry metrics emission (KEDA v2.12+) for scaling decision observability.
- TriggerAuthentication with OpenBao secret store (via ESO sync to K8s Secret).
- Admission webhooks for validation of ScaledObject configs before apply.

**Karpenter** is rejected for the core CuraOS platform because native Karpenter requires cloud-provider node provisioners (AWS, Azure). The vCluster Auto Nodes approach (Karpenter + KubeVirt on bare metal, announced Sep 2025) is architecturally interesting but adds significant complexity (virtual clusters within a physical cluster) and is at early production maturity. Re-evaluate in 12 months.

**Capacity planning for bare-metal on-prem:**
- Initial sizing delivered as a `curaos-install preflight` sizing report based on expected tenant count and service profile (small/medium/large/healthcare).
- Longhorn storage capacity tracked via Prometheus; alert at 75% utilisation.
- Horizontal node scale-out: new bare-metal nodes enrolled via Tinkerbell + Ansible, joined to cluster via CAPI. Manual trigger by customer; `curaos-install node add` command wraps this.

---

## 3. Rejected Patterns (Summary)

| Pattern | Reason |
|---|---|
| Terraform for any infra lifecycle | Proprietary cloud-only IaC; excluded by charter. OpenTofu is the FOSS fork but still carries the same cloud-provider-first paradigm — deferred pending community maturity signal. |
| MAAS bare-metal | Mutable OS model; Ubuntu-preference coupling; cloud-init model incompatible with Talos immutable OS strategy. |
| Helm umbrella as sole on-prem installer | Multi-step, requires pre-installed Kubernetes. Insufficient for Day-0 customer experience. |
| Kasten K10 | Commercial license; self-host requires vendor relationship. |
| Twingate / Tailscale (SaaS coordination) | PHI must not traverse vendor-operated coordination plane. |
| RKE2 | SUSE ecosystem coupling; Rancher Manager adds commercial dependencies. |
| Pyinfra as Ansible replacement | No tag system, credential exposure in process listings, active bugs in package operations (2025 evaluation). |
| Karpenter bare-metal (native) | AWS cloud-provider dependency not resolved for on-prem without vCluster wrapper; deferred. |

---

## 4. Integration Map

### 4.1 Tool Dependency Graph

```
[Git repo]
    │
    ├─► ArgoCD / Flux (ADR-0109)  ─────────────────────────────────────────────────────────────────────┐
    │       │                                                                                           │
    │       ├─► Crossplane XR compositions ──────────────── [Tenant provisioning pipeline]             │
    │       │       ├─► Capsule Tenant CRD                                                             │
    │       │       ├─► Keycloak realm (OIDC)                                                          │
    │       │       ├─► PostgreSQL schema (via Job)                                                    │
    │       │       ├─► OpenSearch index (via Job)                                                     │
    │       │       ├─► Karmada PropagationPolicy                                                      │
    │       │       ├─► Grafana dashboard ConfigMap                                                    │
    │       │       └─► NetBird peer group (API call via ESO-synced token)                             │
    │       │                                                                                           │
    │       ├─► KEDA ScaledObjects ──────────────────────── [Event-driven autoscaling]                 │
    │       │       └─► TriggerAuthentication (ESO → OpenBao)                                          │
    │       │                                                                                           │
    │       └─► Velero Schedule CRDs ───────────────────── [Backup orchestration]                     │
    │               └─► MinIO (in-cluster or external NAS)                                             │
    │                                                                                                   │
    ├─► Ansible (Day-0 + Day-2)                                                                        │
    │       ├─► Tinkerbell workflow templates (bare-metal enrollment)                                   │
    │       ├─► Talos machineconfig apply (node provisioning)                                           │
    │       ├─► k0s bootstrap (on-prem installer)                                                      │
    │       ├─► Talos upgrade playbook (OS patch delivery)                                              │
    │       └─► OpenBao PKI / approle seeding                                                          │
    │                                                                                                   │
    ├─► Tinkerbell (bare-metal)                                                                        │
    │       └─► CAPT (Cluster API Provider Tinkerbell)                                                 │
    │               └─► Cluster API (cluster lifecycle)                                                │
    │                       └─► Karmada (workload propagation)                                        │
    │                                                                                                   │
    ├─► NetBird overlay mesh ────────────────────────────── [Hub ↔ data-plane tunnel]                 │
    │       └─► Keycloak OIDC (peer auth)                                                              │
    │                                                                                                   │
    └─► OpenBao (ADR-0108) ──────────────────────────────── [Secrets for all tools above]             │
            └─► ESO (External Secrets Operator) → K8s Secrets for KEDA, Velero, Crossplane
```

### 4.2 Files That Must Not Break

| File/Path | Owner | Notes |
|---|---|---|
| `ai/curaos/ops/Requirements.md` | Ops | Canonical ops charter; this ADR is derived from it |
| `ai/curaos/docs/adr/0108-security-secrets.md` | Platform | OpenBao decisions are upstream of §2.9 ESO sync |
| `ai/curaos/docs/adr/0109-containers-orchestration.md` | Platform | K3s/Talos/ArgoCD/Harbor commitments constrain §2.2, §2.3, §2.10 |
| `ai/curaos/docs/adr/0110-cicd-release.md` | Platform | ARC runner strategy constrains §2.1 Ansible CI integration |

### 4.3 Cross-Phase Dependencies

- ADR-0108 (OpenBao): KEDA TriggerAuthentication, Velero MinIO credentials, Crossplane provider credentials, Ansible vault lookup, `curaos-install` bootstrap secrets — all depend on OpenBao being bootstrapped first.
- ADR-0109 (ArgoCD/Harbor): GitOps delivery of Crossplane compositions, KEDA ScaledObjects, Velero Schedules, Capsule Tenant CRDs — all depend on ArgoCD running and Harbor accessible.
- ADR-0107 (Observability): KEDA OpenTelemetry metrics, Velero backup audit events, Tinkerbell workflow events, Ansible playbook structured logs — all feed the observability pipeline.

### 4.4 HIPAA Audit Chain

Every provisioning action must produce a structured log line on the immutable audit log (ADR-0108 audit store):

```jsonc
{
  "ts": "<RFC3339>",
  "action": "<toolname>.<operation>",
  "actor": "<service-account | user-email>",
  "tenant_id": "<slug | null>",
  "resource": "<CRD kind>/<name>",
  "namespace": "<k8s namespace>",
  "result": "success | failure",
  "correlation_id": "<UUID from ArgoCD sync wave or CI run>"
}
```

Tools and their audit emission mechanism:

| Tool | Audit mechanism |
|---|---|
| Ansible | `callback_plugins/audit_log.py` → structured JSON to stdout; ARC log aggregation picks up |
| Tinkerbell | Kubernetes events → Fluent Bit → audit store |
| Crossplane | Kubernetes events + Managed Resource conditions → Fluent Bit |
| ArgoCD | Application sync events → Fluent Bit |
| Velero | Backup/Restore CRD events → Fluent Bit |
| KEDA | ScaledObject events + OTel metrics → Prometheus + Fluent Bit |
| `curaos-install` | Append-only local JSONL → uploaded on first connectivity |

---

## 5. Decision Summary

| Sub-decision | Decision |
|---|---|
| Configuration management | Ansible |
| OS image building (SaaS/on-prem) | Talos Image Factory |
| OS image building (edge/home-lab) | Kairos |
| Cluster bootstrap (SaaS) | Talos native (`talosctl`) |
| Cluster bootstrap (on-prem) | k0s |
| Cluster bootstrap (home-lab) | Kairos + K3s |
| Bare-metal provisioning | Tinkerbell (CAPI Tinkerbell provider) |
| Hybrid control/data plane | Cluster API (lifecycle) + Karmada (propagation) + ArgoCD (delivery) |
| Edge/site overlay network | NetBird (self-hosted, full stack) |
| Backup + DR | Velero + Longhorn CSI + MinIO |
| DR scenarios | Per-profile runbooks (§2.8) |
| Tenant onboarding | Crossplane XR + ArgoCD ApplicationSet + Capsule |
| On-prem installer UX | `curaos-install` Go CLI wrapping k0s, distributed as OCI artifact |
| Update/patch delivery | Rolling (default) + blue-green (stateful) + canary (PHI services); USB-key or connected-sync for air-gap |
| Per-customer customisation | Four-layer overlay (Base / Profile / Tenant / Site) via Helm + ConfigMap |
| Tenant admin UI | Tenant-scoped module in existing admin app (ADR-0106) |
| Autoscaling | KEDA (primary) + HPA (fallback) + VPA (dev right-sizing) |

---

## 6. Consequences

### Positive

- Full four-profile coverage from one playbook/chart set; no per-profile forks.
- All tooling is FOSS-licensed and self-hostable; no proprietary cloud dependency (Terraform excluded, Kasten excluded, Tailscale SaaS excluded).
- HIPAA audit chain covers every provisioning action across all tools via a consistent structured-log contract.
- Talos + Kairos immutable OS eliminates SSH-attack surface; API-only admin reduces credential sprawl.
- GitOps (ArgoCD) as the single reconciliation loop means provisioning state is always version-controlled and auditable.
- Crossplane XR tenant onboarding is idempotent and reversible; supports GDPR right-to-erasure.

### Negative / Risks

- **Tinkerbell is still CNCF Sandbox.** Production-proven at Equinix Metal scale, but community support is smaller than MAAS. Mitigate: mirror the full Tinkerbell repo in Harbor; pin versions; maintain internal runbook for hardware enrollment without Tinkerbell (manual PXE fallback).
- **Ansible Day-0 complexity.** 91 services × 4 profiles is a large playbook surface. Mitigate: module-per-service structure, mandatory Ansible lint in CI, molecule testing for each role.
- **Crossplane composition depth.** Tenant onboarding XR is an 8-step composition; a mid-chain failure leaves partial state. Mitigate: each composition step implements `observe` on its downstream resource; Crossplane's managed resource lifecycle handles retry and orphan cleanup.
- **Karmada propagation latency.** Pull model for customer data-plane clusters adds ~seconds of propagation delay. Acceptable for config/deployment changes; real-time operational data still flows directly tenant-to-tenant.
- **NetBird operational overhead.** Self-hosted NetBird requires a management server, signal server, and relay cluster. These are K8s Deployments in the vendor control plane; they must be HA (3 replicas minimum) and monitored. SPOF risk if the NetBird management server is unavailable blocks new peer enrollment (existing tunnels remain active).

### Deferred

- OpenTofu (Terraform fork) re-evaluation when community reaches equivalent provider coverage for bare-metal + self-hosted stacks. Track against OpenTofu v2.x roadmap.
- Karpenter bare-metal via vCluster Auto Nodes: re-evaluate at 12-month mark (Sep 2026) when production maturity signal is clearer.
- Kairos upgrade from CNCF Sandbox to Incubating: track; if stalled, re-evaluate Talos as sole image strategy with a custom Kairos-equivalent boot layer.

---

## 7. Alternatives Ruled Out Permanently

- **Terraform / OpenTofu as primary IaC** — charter exclusion (proprietary cloud-only IaC); re-evaluation deferred per §6.
- **Chef** — commercial-only for production use.
- **MAAS as primary bare-metal tool** — mutable OS model incompatible with immutable OS strategy (Talos, Kairos).
- **Kasten K10** — commercial license incompatible with self-hosted redistribution.
- **Tailscale (SaaS coordination)** — PHI must not transit vendor-operated infrastructure; permanently excluded.

---

## 8. References

- [Pyinfra vs Ansible evaluation (Nov 2025)](https://jakski.github.io/posts/2025-11-18.html)
- [Tinkerbell CNCF project page](https://www.cncf.io/projects/tinkerbell/)
- [Talos Image Factory](https://factory.talos.dev/)
- [Air-Gapped Kubernetes with Talos Linux — Sidero Labs](https://www.siderolabs.com/blog/air-gapped-kubernetes-with-talos-linux)
- [Kairos — immutable Linux meta-distribution for edge Kubernetes](https://kairos.io/)
- [Immutable Kubernetes Nodes with Kairos and Kamaji — Clastix](https://clastix.io/post/immutable-kubernetes-nodes-with-kairos-and-kamaji-a-security-first-architecture-for-the-edge-and-beyond/)
- [NetBird vs Headscale — House of FOSS (2025)](https://blog.houseoffoss.com/post/netbird-vs-headscale-choosing-the-right-mesh-vpn-in-2025)
- [Velero + Longhorn v2 backup (Longhorn blog, Sep 2025)](https://longhorn.io/blog/20250902-k8s-backup-solutions-and-longhorn/)
- [Karmada v1.16 release — CNCF (Dec 2025)](https://karmada.io/blog/2025/12/05/karmada-v1.16/karmada-v1.16/)
- [Tenant Provisioning with Capsule and ArgoCD — NashTech](https://blog.nashtechglobal.com/how-to-automate-tenant-provisioning-in-kubernetes-with-capsule-and-argocd/)
- [KEDA — KubeCon London 2025](https://kedify.io/community/kubecon-london-2025-keda/)
- [OpenBao + External Secrets Operator integration](https://external-secrets.io/latest/provider/openbao/)
- [vCluster Auto Nodes — Karpenter for bare metal (Sep 2025)](https://www.vcluster.com/blog/introducing-vcluster-auto-nodes-karpenter-based-dynamic-autoscaling-anywhere)
- [k0s — single binary Kubernetes for bare metal](https://k0sproject.io/)
- ADR-0108: Security + Secrets (OpenBao)
- ADR-0109: Containers + Orchestration (K3s, Talos, Cilium, ArgoCD, Harbor)
- ADR-0110: CI/CD + Release (GitHub Actions + ARC)
