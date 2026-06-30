# ADR-0158 — Air-Gap Bundle SLA + Composition

**Status:** Accepted
**Date:** 2026-05-24
**Deciders:** Platform Engineering, Product
**Resolves:** [ADR-0151 F-006 Major — Air-gap bundle SLA unspecified](0151-cross-cluster-coherence.md)
**Amends:**
- [ADR-0109](0109-containers-orchestration.md) §13 — replaces open-ended OCI bundle spec with 3-tier + custom build
- [ADR-0110](0110-cicd-release.md) §M9 — adds bundle build pipeline + portal
- [ADR-0111](0111-infra-automation.md) — customer-export pattern (per ADR-0121a Sites pattern)
- [ADR-0115](0115-healthstack-overlays.md) — bundle delivery for terminology data licensing
**Related ADRs:**
- [ADR-0099](0099-charter-priorities-vision.md) §9 — Air-gap mandatory commitment
- [ADR-0110](0110-cicd-release.md) §3.9 — OCI bundle + cosign-signed Helm (baseline)
- [ADR-0115](0115-healthstack-overlays.md) §4.3.3 — Snowstorm + SNOMED CT offline
- [ADR-0152](0152-minor-info-findings-resolutions.md) — F-015 Snowstorm bundle size resolution
- [ADR-0153](0153-codegen-recipe-coverage.md) — Phase 1 cookbook recipes (bundled in Core)
- [ADR-0208](0208-cluster-healthstack-clinical-services.md) — 19 HealthStack clinical services

---

## 1. Context

ADR-0099 §9 declares air-gap support mandatory across all four deployment profiles (Cloud SaaS, On-Prem, Hybrid, Air-gap). Multiple downstream ADRs (0109, 0110, 0115, 0121, 0122) each reference air-gap considerations in isolation but no ADR has ever specified:

1. What goes in the air-gap bundle (component manifest)?
2. How large the bundle is (size SLA)?
3. How bundles are delivered (offline media, portal download)?
4. How bundles are updated without internet access (delta strategy)?
5. What tiering structure keeps bundle sizes manageable?

ADR-0151 F-006 flags this as a Major gap: without a size SLA, teams over-provision storage; without tiering, air-gap customers receive a monolithic 80+ GB blob whether they need HealthStack or not; without a delta-update mechanism, security patches require full re-downloads.

**User decision (2026-05-24):** 3-tier default bundles (Core / HealthStack add-on / AI add-on) plus a per-customer custom build option via a self-service portal or offline CLI.

---

## 2. Decision

### 2.1 Three-tier default bundle structure

| Tier | Label | Compressed | Uncompressed | Target customer |
|---|---|---|---|---|
| Tier 1 | **Core** | ~5–7 GB | ~15–20 GB | All deployments; required base |
| Tier 1 + Tier 2 | **Core + HealthStack** | ~20–30 GB | ~60–90 GB | Clinical / HIPAA tenants |
| Tier 1 + Tier 2 + Tier 3 Lite | **Core + HealthStack + AI Lite** | ~30–40 GB | ~80–110 GB | Clinical + embedded AI (14B) |
| Tier 1 + Tier 2 + Tier 3 Pro | **Core + HealthStack + AI Pro** | ~60–80 GB | ~130–170 GB | Clinical + full AI (70B) |
| Custom | **Custom** | variable | variable | Regulated / bespoke |

Sizes are build-time estimates. CI pipeline emits verified sizes as bundle metadata on every release. Customers must verify against published manifest SHA-256.

### 2.2 Custom build option

Customers may request a custom bundle via:
- **Connected:** self-service portal at `https://bundles.cura.os/build` (CuraOS-managed)
- **Disconnected:** `curaos-bundle-builder` CLI run on an internet-connected machine, then transferred via USB/courier

Custom builds support: tier defaults as baseline + per-product enable/disable + per-overlay enable/disable + model tier selection + tenant config baked in (theme, custom TLS certs, license keys, tenant ID seed).

Every custom build runs the full CI signing pipeline (per ADR-0110) and emits a signed OCI bundle with SLSA L3 provenance.

---

## 3. Per-Tier Inventory

### Tier 1 — Core (~5–7 GB compressed)

**Foundation product images (4)**
- `curaos/auth` — NestJS + Better Auth + SMART-on-FHIR launcher (per ADR-0120)
- `curaos/builder` — GrapesJS + Payload CMS + Yjs (per ADR-0121)
- `curaos/workflow-manager` — Temporal worker shell + Activepieces runtime (per ADR-0122)
- `curaos/codegen` — NestJS engine + Phase 1 cookbook recipes (per ADR-0153)

**Cluster service images**

Neutral core services bundled at Core tier:

| Domain group | Services |
|---|---|
| Identity / Party / Org / Audit | identity-service, party-service, org-service, audit-service |
| Platform shared | notify-service, storage-service, search-service, settings-service, reports-service |
| Commerce (6) | commerce-core-service, personal-commerce-service, business-commerce-service, inventory-service, procurement-service, accounting-service |
| Scheduling / Tasks (6) | calendar-service, tasks-service, personal-calendar-service, business-calendar-service, personal-tasks-service, business-tasks-service |
| Workflow overlays (6) | workflow-core-service, personal-workflow-service, business-workflow-service, automation-service, integration-service, conversion-service |
| Docs / CRM / HR (9) | documents-service, esign-service, crm-core-service, personal-crm-service, business-crm-service, hr-core-service, personal-hr-service, business-hr-service, donation-service |
| Fleet / Site / Integrations (9) | fleet-service, geospatial-service, site-service, event-service, personal-event-service, business-event-service, integrations-core-service, personal-integrations-service, business-integrations-service |
| EducationStack (3) | education-core-service, student-service, course-service |
| Frontend / libs | curaos-admin-ui, curaos-portal-ui, curaos-site-ui, @curaos/* shared libs |

**Infrastructure**

| Component | Purpose |
|---|---|
| K3s (pinned release) | Lightweight Kubernetes distribution |
| Cilium (eBPF CNI) | Network policy + mTLS mesh |
| APISIX + APISIX Ingress | API gateway + ingress |
| ArgoCD | GitOps reconciliation |
| Harbor mirror | OCI registry (offline) |
| OpenBao | Secret management (per ADR-0108) |
| Velero | Backup + restore |
| NetBird | WireGuard overlay (hybrid mesh) |
| KEDA | Event-driven autoscaling |

**Data layer**

| Component | Notes |
|---|---|
| PostgreSQL 17 | Primary relational store |
| Valkey | Cache + session store |
| SeaweedFS | Object / BLOB storage |
| Kafka 4 | Event streaming (SaaS profile) |
| NATS JetStream | Event streaming (SMB / air-gap profile) |
| Apicurio Schema Registry | Schema compatibility enforcement |
| OpenSearch (base) | Full-text search |

**Observability**

| Component | Notes |
|---|---|
| Tempo | Distributed tracing |
| VictoriaMetrics | Metrics TSDB |
| Loki | Log aggregation |
| Grafana | Dashboards + alerting |
| OpenTelemetry Collector | Unified telemetry pipeline |

**Workflow runtime**

| Component | Notes |
|---|---|
| Temporal Go binary | Workflow orchestration (per ADR-0122) |
| Activepieces | Low-code automation pieces |
| NestJS @nestjs/schedule | Cron scheduling |
| BullMQ | Queue-based job runner |

**Codegen**

- NestJS engine + Phase 1 cookbook recipes (per ADR-0153)

**Package registry**

- Verdaccio npm registry mirror pre-loaded with all `@curaos/*` packages

**Signing keys**

- Cosign verification public keys (all tiers)
- SLSA L3 provenance attestation bundle

---

### Tier 2 — HealthStack Add-on (~15–25 GB compressed)

Requires Tier 1. Adds clinical overlay images and terminology data.

| Component | Compressed size | Notes |
|---|---|---|
| HAPI FHIR 8.x JVM sidecar | ~500 MB | JPA on PG17; per-tenant pod (per ADR-0208) |
| Snowstorm JVM sidecar | ~800 MB image | Terminology server (Apache 2.0) |
| SNOMED CT International Edition RF2 | ~5 GB compressed (~22 GB uncompressed) | F-015 resolution (ADR-0152); jurisdiction extensions ordered separately |
| dcm4chee LGPL sidecar | ~1 GB | DICOM image archive (LGPL 2.1) |
| OHIF Viewer static bundle | ~50 MB | Zero-footprint DICOM viewer (MIT) |
| Pathling FHIR analytics | ~300 MB | HL7 FHIR R4 analytics (Apache 2.0) |
| ClickHouse | ~500 MB | Analytics backing store for Pathling + Langfuse |
| cqf-ruler / CDS Hooks engine | ~200 MB | Clinical decision support |
| Mirth Connect / BridgeLink | ~400 MB | HL7v2 + HL7v3 interop (per ADR-0115 amended) |
| SMART-on-FHIR launcher | included in `curaos/auth` | No separate image |
| 19 HealthStack clinical services | ~3 GB combined | Per ADR-0208 cluster manifest |

**Terminology licensing note:** SNOMED CT International Edition is included under the SNOMED International affiliate license. National extensions (US, UK, AU) are NOT included in the default bundle; customers must obtain jurisdiction-specific files from their national release center and apply via `curaos-install terminology import`.

**LGPL obligation:** dcm4chee is LGPL 2.1. CuraOS ships it as a separate sidecar image (not statically linked). Source code for the LGPL component is available at `https://source.cura.os/lgpl/dcm4chee`.

---

### Tier 3 — AI Add-on (~20–80 GB compressed; varies by model sub-tier)

Requires Tier 1. HealthStack imaging AI sub-component also requires Tier 2.

**Runtime and gateway**

| Component | Notes |
|---|---|
| vLLM serving runtime | Primary LLM inference engine (per ADR-0114) |
| LiteLLM gateway | Unified LLM routing (local + 3rd-party per ADR-0150) |
| Langfuse self-hosted | Observability for LLM calls (PG + ClickHouse-backed) |
| Presidio PHI redaction | Microsoft (MIT); pre-processing layer before LLM |

**Embedding models (all sub-tiers)**

| Model | Compressed size | Purpose |
|---|---|---|
| Qwen3-Embedding-8B | ~5 GB | General semantic search |
| BGE-M3 | ~2.5 GB | Multilingual retrieval |
| BioLORD-2023 | ~1 GB | Clinical/biomedical embeddings |

**Vector stores**

- pgvector extension (ships with PG17 image; no separate image)
- Qdrant image (~300 MB)

**LLM model weights — sub-tier selection (one per deployment)**

| Sub-tier | Model | Quantization | Compressed | GPU VRAM req | Notes |
|---|---|---|---|---|---|
| **Lite** | Phi-4 14B | Q4_K_M | ~9 GB | 12 GB | CPU-fallback viable |
| **Standard** | Qwen3 32B | Q4_K_M | ~20 GB | 24 GB | Recommended for most on-prem |
| **Pro** | DeepSeek-R1-Distill-Llama-70B | Q4_K_M | ~45 GB | 48 GB | High-reasoning tasks |
| **Clinical** | Med42-v2 70B | Q4_K_M | ~45 GB | 48 GB | On-prem ONLY per Llama 2 license; NOT available for Cloud SaaS |

**Imaging AI (optional; requires Tier 2)**

- MONAI Deploy (~2 GB) — medical imaging AI inference runtime

**Llama 2 license note:** Med42-v2 (Clinical sub-tier) is built on Llama 2 weights. The Llama 2 Community License prohibits use in services with >700 M monthly active users. CuraOS ships it in on-prem bundles only. Cloud SaaS tenants requiring clinical AI must select Lite/Standard/Pro sub-tier or bring their own compliant model.

---

## 4. Custom Build Portal

### 4.1 Connected workflow (`https://bundles.cura.os/build`)

1. Authenticate with CuraOS tenant credentials + license key.
2. Select base tier (Core required; HealthStack and AI are opt-in toggles).
3. Configure per-product toggles (individual services can be excluded for resource-constrained deployments).
4. Select AI model sub-tier (if AI tier enabled).
5. Upload optional tenant config package: TLS certs, theme assets, license keys, tenant ID seed, custom hostname map.
6. Submit — triggers CI build pipeline (per ADR-0110).
7. Pipeline emits signed OCI bundle + SLSA L3 provenance + SHA-256 manifest.
8. Download link (authenticated, 72-hour TTL) + optional USB-delivery request.

### 4.2 Offline workflow (`curaos-bundle-builder` CLI)

For customers whose policy prohibits internet access even on the build machine:

```bash
# On internet-connected machine (one-time or quarterly)
curaos-bundle-builder fetch --tier core,healthstack --ai-model standard \
  --tenant-config ./my-tenant.yaml --output ./bundle-2026-Q3/

# Verify bundle integrity
curaos-bundle-builder verify --bundle ./bundle-2026-Q3/ \
  --pubkey curaos-cosign.pub

# Transfer to air-gap media (USB / courier)
# On air-gap target machine
curaos-install apply --bundle /media/usb/bundle-2026-Q3/
```

`curaos-bundle-builder` is an open-source Go CLI published to `https://github.com/curaos/bundle-builder` (Apache 2.0). Customers may audit and compile from source.

### 4.3 Build pipeline integration (ADR-0110 amendment — §M9)

Bundle build CI adds to ADR-0110's reusable workflow catalog:

- `bundle-build.yml` — assembles OCI images per tier manifest, runs `cosign sign`, emits SLSA L3 provenance, packages Verdaccio mirror snapshot, writes `bundle.manifest.json`
- `bundle-delta.yml` — computes delta tarball between two bundle versions; signs delta; emits `delta.manifest.json` with `min_from_version` + `max_from_version` metadata
- `bundle-verify.yml` — verifies bundle integrity; usable offline (embeds cosign public key)

---

## 5. Delivery Mechanisms

| Deployment profile | Delivery method | Notes |
|---|---|---|
| **Cloud SaaS** | N/A — vendor-hosted | No bundle; tenants receive managed service |
| **On-prem connected** | HTTPS download from `bundles.cura.os`; cosign verify on target | Portal or CLI; automated verify step in `curaos-install` |
| **Hybrid** | HTTPS download + tenant-specific config layer applied at install | Control plane config overlay injected post-download |
| **Air-gap occasional** | Customer pulls full bundle quarterly; cosign verify offline | Delta updates between quarterly pulls for security patches |
| **Air-gap permanent** | USB key sealed delivery; quarterly cadence; security courier for regulated tenants (HIPAA, defense) | Courier manifest matches `bundle.manifest.json` SHA-256 |

**USB delivery SLA:** CuraOS ships USB media within 10 business days of a signed delivery order. Emergency security courier (critical CVE) ships within 3 business days. Courier delivery is a paid add-on on Enterprise and Custom tiers.

---

## 6. Update Mechanism

### 6.1 Release cadence

| Channel | Cadence | LTS support |
|---|---|---|
| Stable | Quarterly (Q1/Q2/Q3/Q4) | 18 months from release date |
| Security patch | Monthly (or on-demand for critical CVE) | Applies to all in-LTS stable releases |
| Custom | Per-customer SLA (Enterprise only) | Negotiated |

### 6.2 Delta updates

Security patches between quarterly stable releases are delivered as **cosign-signed delta tarballs** rather than full bundle re-downloads.

Delta manifest metadata:

```json
{
  "delta_version": "2026.3.1-patch.2",
  "from_version_min": "2026.3.0",
  "from_version_max": "2026.3.1-patch.1",
  "sha256": "<hash>",
  "cosign_signature": "<sig>",
  "affected_images": ["curaos/auth:2026.3.1-patch.2", "curaos/workflow-manager:2026.3.1-patch.2"],
  "slsa_provenance_uri": "..."
}
```

Customers applying a delta outside the `from_version_min` / `from_version_max` range must first apply a full quarterly bundle.

### 6.3 Update CLI

```bash
# Connected: pull and apply delta
curaos-install upgrade --channel stable

# Air-gap: apply pre-downloaded delta
curaos-install upgrade --delta /media/usb/delta-2026.3.1-patch.2.tar.zst

# Rolling node-by-node (K3s / Talos)
curaos-install upgrade --strategy rolling --max-unavailable 1
```

`curaos-install upgrade` handles:
- K3s or Talos node-by-node rolling upgrade
- ArgoCD image update in Git repo (cosign-verified)
- Pre/post upgrade health checks (readiness + liveness probes per service)
- Automatic rollback trigger if post-upgrade health check fails within 5 minutes

### 6.4 Rollback

Previous bundle retained on-disk for **90 days** after upgrade. Rollback command:

```bash
curaos-install rollback --to 2026.3.0
```

Rollback restores prior image tags in ArgoCD manifests and re-reconciles. Data migrations that ran between versions are NOT automatically reversed — rollback is image-only. Customers requiring data rollback must restore from Velero backup (per ADR-0109 Velero decision).

---

## 7. SLA + Size Budgets

### 7.1 Compressed / uncompressed size budgets

| Bundle composition | Compressed | Uncompressed | Build time (CI) | Initial install time |
|---|---|---|---|---|
| Core only | ~5–7 GB | ~15–20 GB | ~20 min | ~30–45 min |
| Core + HealthStack | ~20–30 GB | ~60–90 GB | ~30 min | ~1–2 hours |
| Core + HealthStack + AI Lite | ~30–40 GB | ~80–110 GB | ~35 min | ~1.5–2.5 hours |
| Core + HealthStack + AI Standard | ~45–55 GB | ~100–130 GB | ~40 min | ~2–3 hours |
| Core + HealthStack + AI Pro | ~60–80 GB | ~130–170 GB | ~50 min | ~2–3.5 hours |
| Custom | variable | variable | ~20–90 min | deployment-dependent |

Install time assumes: 3-node K3s cluster (4 vCPU / 16 GB RAM / 500 GB SSD per node) for Core; 5-node cluster for HealthStack+; 5-node cluster with GPU nodes for AI+.

**Single-node home lab (Core only):** viable on 8 GB RAM / 4 vCPU / 120 GB SSD (minimal observability + no AI tier). Install time ~45–60 min.

### 7.2 Storage allocation guidance

| Tier | OCI image cache | Runtime data (PG + SeaweedFS) | Observability retention | Rollback copy | Total recommended |
|---|---|---|---|---|---|
| Core | 20 GB | 100 GB+ (grows with use) | 30 GB | 20 GB | 200 GB min |
| Core + HealthStack | 90 GB | 500 GB+ (FHIR + DICOM) | 50 GB | 90 GB | 800 GB min |
| Core + HealthStack + AI | 170 GB | 500 GB+ | 50 GB | 170 GB | 1 TB min |

SNOMED CT uncompressed (~22 GB) is included in HealthStack runtime data estimate.

### 7.3 Network bandwidth for connected installs

| Bundle | Download time at 100 Mbps | Download time at 1 Gbps |
|---|---|---|
| Core (7 GB) | ~9 min | ~1 min |
| Core + HealthStack (30 GB) | ~40 min | ~4 min |
| Core + HealthStack + AI Pro (80 GB) | ~107 min | ~11 min |

---

## 8. Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| Bundle truncated / corrupt | `curaos-install verify` SHA-256 + cosign check before apply; fails hard | Re-download or re-request USB delivery |
| Delta applied to incompatible base version | `min_from_version` / `max_from_version` check in `curaos-install upgrade`; fails with clear error | Apply full quarterly bundle first |
| Install fails mid-way (node crash, power loss) | ArgoCD reconciliation re-applies on restart; `curaos-install` is idempotent | Re-run `curaos-install apply`; no re-download needed |
| Post-upgrade health check fails | `curaos-install upgrade` monitors readiness for 5 min post-rollout; auto-triggers rollback | Rollback to previous image set; retain failed upgrade log |
| SNOMED CT terminology missing / corrupted | Terminology health check on Snowstorm startup; clinical services degrade gracefully (coding lookups return `unknown`, never block encounter write) | `curaos-install terminology verify --repair` |
| Model weight file corrupt (AI tier) | vLLM startup checksum; fails to load model; LiteLLM gateway routes to fallback or returns 503 | Re-apply delta for AI tier images only; no full bundle re-download |
| USB media defective (air-gap permanent) | `curaos-install verify` on receipt; customer reports to support within 5 business days | Emergency courier replacement |
| Cosign key compromise | CuraOS publishes new keys via out-of-band channel (HTTPS + PGP-signed advisory); customers must update trust bundle before next upgrade | `curaos-install trust update --key <new-pubkey>` |

---

## 9. Amendments to Existing ADRs

### ADR-0109 §13 amendment

**Old:** Open-ended OCI bundle air-gap spec ("Harbor images + cosign sign; no further detail").

**New:** Replace with: "Air-gap bundle composition, tiering, sizing, and delivery governed by ADR-0158. ADR-0109 container build and registry tooling (Harbor, cosign, BuildKit) remain unchanged. The OCI bundle assembled by ADR-0158 uses Harbor as the offline registry mirror."

### ADR-0110 §M9 amendment

**Old:** §M9 placeholder: "Air-gap delivery: OCI bundle + cosign-signed Helm. Bundle composition TBD."

**New:** Replace with: "Air-gap bundle build pipeline governed by ADR-0158 §4.3. Three reusable workflows added to the catalog: `bundle-build.yml`, `bundle-delta.yml`, `bundle-verify.yml`. Bundle portal (`https://bundles.cura.os/build`) is a separate CuraOS-managed service (not part of the CI/CD platform itself). CI gates include: bundle size regression check (fail if tier exceeds size SLA defined in ADR-0158 §7.1 by more than 5%), SLSA L3 provenance attestation, cosign signature."

### ADR-0111 (Infra automation) amendment

**Add to §customer-export pattern:** "Air-gap customers export tenant configuration (theme, TLS certs, license keys, tenant ID seed) via `curaos-bundle-builder --tenant-config` flag (ADR-0158 §4.2). Infrastructure automation playbooks (Ansible, Terraform-equivalent) are embedded in the Core bundle under `/opt/curaos/ops/`. No external fetching required post-install."

### ADR-0115 (HealthStack) amendment

**Add to §4.3.3 (Snowstorm):** "SNOMED CT International Edition RF2 (~5 GB compressed, ~22 GB uncompressed) is included in the Tier 2 HealthStack bundle (ADR-0158 §3). National extensions are NOT bundled; customers must import separately via `curaos-install terminology import`. Jurisdiction license compliance is the customer's responsibility. Snowstorm Lite variant (single-concept lookup only) is available as an alternative for deployments where full RF2 is impractical — select via `curaos-bundle-builder --terminology lite`."

**Add to §delivery:** "HL7v2 interop via Mirth Connect / BridgeLink is included in Tier 2 (ADR-0158 §3). LGPL 2.1 source obligations met via separate source bundle at `https://source.cura.os/lgpl/`."

---

## 10. Action Items

| ID | Action | Owner | Target |
|---|---|---|---|
| B-001 | Build `bundle-build.yml`, `bundle-delta.yml`, `bundle-verify.yml` reusable workflows (ADR-0110 amendment) | Platform Engineering | Wave 1 M6 |
| B-002 | Implement `curaos-install` CLI: `apply`, `upgrade`, `rollback`, `verify`, `terminology` subcommands | Platform Engineering | Wave 1 M6 |
| B-003 | Implement `curaos-bundle-builder` CLI (Go; Apache 2.0; published to GitHub) | Platform Engineering | Wave 1 M7 |
| B-004 | Stand up `bundles.cura.os` portal (CuraOS-managed; Auth + signed download links) | Platform Engineering | Wave 2 M1 |
| B-005 | Establish USB delivery fulfillment process + courier SLA contracts | Operations | Before first air-gap GA customer |
| B-006 | Validate Tier 1 Core bundle size against 5–7 GB target via CI size gate | Platform Engineering | Wave 1 M6 |
| B-007 | Validate Tier 2 HealthStack bundle size (SNOMED CT included) against 15–25 GB target | Platform Engineering | Wave 1 M8 |
| B-008 | Validate Tier 3 AI Lite bundle size against ~30–40 GB target (Core + HealthStack + Lite) | Platform Engineering | Wave 1 M9 |
| B-009 | Add cosign trust update workflow for key-rotation scenario | Security | Wave 1 M6 |
| B-010 | Write LGPL source bundle for dcm4chee; publish to `source.cura.os` | Legal / Engineering | Before Tier 2 GA |
| B-011 | Confirm Med42-v2 (Clinical) Llama 2 license compliance for on-prem-only shipping | Legal | Before Tier 3 Clinical GA |
| B-012 | Update ADR-0109 §13, ADR-0110 §M9, ADR-0111, ADR-0115 §4.3.3 with amendment text from §9 | Platform Engineering | This sprint |

---

## 11. Open Questions

| ID | Question | Priority | Notes |
|---|---|---|---|
| Q-001 | Should EducationStack be a separate Tier 4 add-on rather than bundled in Core? | Medium | Currently in Core (3 services); if EducationStack grows significantly, extract to Tier 4 to keep Core lean |
| Q-002 | Delta update strategy for SNOMED CT RF2 (jurisdiction-level releases ship independently from SNOMED International)? | Medium | SNOMED International releases twice yearly; national extensions release on their own schedule. Delta tarballs may need per-terminology-component granularity |
| Q-003 | Med42-v2 Clinical sub-tier: can a future model with a more permissive license replace it for SaaS use? | High | Llama 2 license restriction currently blocks Cloud SaaS. Track Llama 3 / open-weight medical models (BioMistral, OpenBioLLM) for replacement |
| Q-004 | Should `curaos-bundle-builder` CLI support partial tier downloads (resume interrupted large downloads)? | Low | Relevant for slow connections; HTTP Range requests + checksum-on-resume |
| Q-005 | Tier 3 AI Pro (70B) on CPU-only hardware: acceptable fallback or blocked? | Medium | 70B Q4_K_M requires ~48 GB VRAM; CPU inference at ~0.5 tok/s is technically functional but clinically unusable. Document minimum GPU requirement; block install if no GPU detected |
| Q-006 | Bundle portal authentication: use CuraOS Auth (self-hosted) or vendor-managed IdP? | Low | Portal is CuraOS-managed; vendor-managed IdP (Auth0 / Entra) is pragmatic for the portal itself; does not affect what is inside bundles |

---

## 12. References

- [ADR-0099 Charter, Vision, Priorities & OSS-Leverage Strategy](0099-charter-priorities-vision.md)
- [ADR-0109 Container Runtime, Orchestration, and Packaging](0109-containers-orchestration.md)
- [ADR-0110 CI/CD + Release Stack](0110-cicd-release.md)
- [ADR-0111 Infrastructure Automation](0111-infra-automation.md)
- [ADR-0114 AI / Agent Integration Stack](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Wave 2 Cross-Cluster Coherence Scan](0151-cross-cluster-coherence.md) — F-006 source
- [ADR-0152 Minor + Info Findings Resolutions](0152-minor-info-findings-resolutions.md) — F-015 SNOMED size
- [ADR-0153 Codegen Recipe Coverage](0153-codegen-recipe-coverage.md)
- [ADR-0208 Cluster: HealthStack Clinical Services](0208-cluster-healthstack-clinical-services.md)
- SNOMED International Release Statistics — https://www.snomed.org/releases
- SLSA Framework — https://slsa.dev/spec/v1.0/
- Cosign / Sigstore — https://docs.sigstore.dev/cosign/overview/
- OCI Image Spec — https://github.com/opencontainers/image-spec
- Llama 2 Community License — https://ai.meta.com/llama/license/

---

*Last updated: 2026-05-24. Owner: Platform Engineering.*
