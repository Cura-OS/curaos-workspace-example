# ADR Open Questions — Resolution Map

> **Status (2026-05-25 post-DA13):** Single index of every Open Question across 56 ADRs. ALL Tier 1-4 STILL-OPEN Qs RESOLVED via DA13 batch (see [ADR-0163](0163-da13-still-open-resolution-batch.md)). Remaining DEFERRED-MILESTONE / DEFERRED-V2 = not blocking.

**Read order:** read relevant `ai/rules/curaos_*.md` FIRST (priority #1), then this map + relevant ADRs (priority #2). If question marked RESOLVED-RULE → linked rule wins. If STILL-OPEN → flag to user before implementation.

**Silent decisions:** decisions an agent auto-applied (a clear recommendation existed, so it did not interrupt the user — [[curaos-recommendation-auto-apply-rule]]) are logged in [`AUTO-DECISION-LOG.md`](AUTO-DECISION-LOG.md), the quick scannable ledger. Review it to see every choice made on your behalf; revise or promote any row to a numbered ADR.

---

## Resolution categories

| Status | Meaning |
|---|---|
| **RESOLVED-RULE** | DA-walk locked answer in `ai/rules/curaos_*.md` |
| **RESOLVED-ADR** | Later ADR superseded the question (charter pattern) |
| **DEFERRED-MILESTONE** | Resolution scheduled at a specific roadmap milestone (live set on the `CuraOS Roadmap` Project; per `development-kickoff.md`); not blocking pre-implementation |
| **DEFERRED-V2** | Out of scope for v1 GA; reassess at v2/v3 |
| **STILL-OPEN** | Requires user input before code touches the area |

---

## ADR-0099 — Charter (8 open Qs, ALL RESOLVED-ADR by design)

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Foundation runtime (Go / Kotlin / TS) | RESOLVED-ADR | ADR-0100 → NestJS TS |
| 2 | Workflow paradigm | RESOLVED-ADR | ADR-0122 → Temporal + Activepieces + BullMQ |
| 3 | No-code/low-code packaging | RESOLVED-ADR | ADR-0121 + 0121a-e → 6 sub-products (Builder/Sites/Apps/Widgets/Canvas/Forms) |
| 4 | Codegen scaffolder origin | RESOLVED-ADR | ADR-0123 → custom on Backstage Templates pattern |
| 5 | Plugin language | RESOLVED-ADR | ADR-0123 → WASM + sidecar + isolated-vm hybrid |
| 6 | DB strategy SaaS scale | RESOLVED-ADR | ADR-0101 + [[curaos-postgres-rule]] → CNPG + schema-per-tenant + Citus migration path documented |
| 7 | Hospital admin integration (ERPNext) | DEFERRED-V2 | Generic ERP services (ADR-0202+) cover v1; ERPNext wrap = v2/v3 |
| 8 | MCP server surface | RESOLVED-ADR | ADR-0123 + ADR-0114 → curated per-service (not auto-expose) |

## ADR-0100 — Foundation Platform Runtime (6 open Qs, ALL RESOLVED)

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | NestJS runtime (Node 22 vs Bun) | RESOLVED-RULE | [[curaos-bun-primary-rule]] → Bun primary, Node 22 LTS fallback |
| 2 | Monorepo manager | RESOLVED-RULE | [[curaos-speed-patterns-rule]] DA12 → Turborepo + Nx generators + Bun workspaces |
| 3 | GraphQL stack on NestJS | **RESOLVED (DA13 Q1)** | ADR-0163 → Cosmo Router (Apache 2.0 federation supergraph) + per-service @nestjs/apollo subgraphs |
| 4 | tRPC vs OpenAPI internal RPC | **RESOLVED (DA13 Q2)** | ADR-0163 → tRPC internal-only; external/partner = TypeSpec→OpenAPI |
| 5 | Keycloak-as-optional-plugin | DEFERRED-V2 | Per ADR-0120; only on enterprise demand |
| 6 | Specialist tier first invocation (Go/Rust) | **RESOLVED (DA13 Q8)** | ADR-0163 → TS-only core v1; per-tool best lang/framework as hot path emerges (Phase 4 reassess) |

## ADR-0101 — Data Layer (28 open Qs)

| # Topic | Status | Resolution |
|---|---|---|
| Max tenant count 5y | **RESOLVED (DA13 Q3)** | ADR-0163 → 10K+ tenants day 1 → Citus extension on CNPG (distributed PG); HealthStack PHI retains DB-per-tenant override |
| Patroni DCS (etcd/Consul/Zk) | RESOLVED-RULE | [[curaos-postgres-rule]] → CNPG manages own |
| PgBouncer vs PgCat | RESOLVED-RULE | [[curaos-postgres-rule]] → pgBouncer always-on |
| pg_tde maturity | DEFERRED-MILESTONE | Security review pre-prod; LUKS fallback |
| Logical replication slot policy | DEFERRED-MILESTONE | Pre-prod definition |
| Valkey JSON module | DEFERRED-MILESTONE | Eval at M5 |
| Distributed lock (Redisson/Valkey) | DEFERRED-MILESTONE | Eval at M5 |
| Doc count per tenant per service | **RESOLVED (DA13 Q4)** | ADR-0163 → PG-only search v1 (pgvector + tsvector + pg_trgm); OpenSearch removed from v1; revisit HealthStack M11 |
| Search revisit (DA13 Q4 M11 trigger) | **RESOLVED-EVAL** | [m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md) (#327): **conditional no-go** — PG-only GO for single-domain generic; **no-go** for M12 cross-service federated/clinical (no in-PG federation + CNPG search+write CPU contention vs OQ-05 P95>200ms@50-concurrent) → M11 trigger fires, re-add OpenSearch 2.x as opt-in Tier 2. ADR-0101/0163/0201 §3.3.2 amended; foresight follow-on Story #336 gated on M11 activation |
| Per-tenant vs shared OpenSearch index | **RESOLVED-EVAL (DA13 Q4 M11)** | Re-opened by [m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md) (#327): index-per-tenant (`{tid}.{domain}.{entity}`) for HealthStack DB-per-tenant PHI; shared index + DLS for Citus-sharded generic — per ADR-0201 §3.3.1. Implementation in foresight follow-on Story |
| SeaweedFS WORM PoC | DEFERRED-MILESTONE | Pre-prod hardening |
| SSE-KMS vs SSE-S3 | DEFERRED-MILESTONE | Per regulated-tenant profile |
| Object store choice | **RESOLVED (DA13 Q6)** | ADR-0163 → SeaweedFS primary for ALL object storage incl PG backups (replaces MinIO; Apache 2.0; air-gap safe) |

## ADR-0102 — Event Messaging (24 open Qs)

| # Topic | Status | Resolution |
|---|---|---|
| Broker for v1 (Redpanda vs Apache Kafka) | **RESOLVED-SHIPPED (M9-S7 #104, 2026-06-01)** | **Redpanda v24.3.1 is the deployed v1 broker** (`curaos/ops/zarf/zarf.yaml` `redpanda` component, chart 5.9.0). Apache-Kafka / Strimzi-managed Kafka = NOT deployed. The earlier "Kafka 4.x Apache 2.0 = v1" baseline is reconciled with shipped Zarf reality: Redpanda (Kafka-API-compatible) is the broker; Apache Kafka 4.x remains the portable upstream target the wire contract stays compatible with. The Strimzi operator IS present but for Kafka **Connect-only** (Debezium WAL CDC → Redpanda via `KafkaConnect.spec.bootstrapServers`), NOT a Strimzi-managed broker. See [AUTO-DECISION-LOG.md](AUTO-DECISION-LOG.md) §"2026-06-01 — M9-S7 #104". |
| Redpanda BSL legal | DEFERRED-V2 (BSL reassessed) | Redpanda v24.3.1 ships under its Community/BSL terms in the air-gap bundle; the v1 self-hosted-SaaS license posture is tracked per [[curaos-local-vs-3rdparty-rule]]. Wire contract stays Apache-Kafka-portable so a swap to upstream Kafka 4.x needs no consumer change. |
| Max tenant SaaS 3y | **RESOLVED (DA13 Q5)** | ADR-0163 → Kafka key-by-tenant from day 1 (tenant UUID as partition key on shared topics); scales 10K+ tenants/cluster |
| Pulsar multi-tenancy | RESOLVED-ADR | ADR-0102 → No (Kafka chosen) |
| Avro vs Protobuf | RESOLVED-ADR | Apicurio supports both; per-service |
| Retention policy (6y HIPAA) | RESOLVED-ADR | Kafka tiered storage → SeaweedFS S3 sink |
| Job vol >10K/s (Jobrunr) | RESOLVED-ADR | BullMQ replaces Jobrunr |
| BPM task queue redundancy | RESOLVED-ADR | Temporal BPM + BullMQ non-Temporal |
| Deployment profile SKU split | **RESOLVED (DA13 Q9)** | ADR-0163 → Single SKU + feature flags + deployment profile config (Helm values + Unleash) |

## ADR-0103 — API Surface (5 open Qs)

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | typespec-graphql emitter stability | DEFERRED-MILESTONE | Recheck Q1 2026; fallback openapi-to-graphql ready |
| 2 | Connect-RPC vs raw gRPC | RESOLVED-ADR | ADR-0103 → Connect-RPC primary; gRPC for legacy |
| 3 | Bun HTTP adapter NestJS | RESOLVED-RULE | [[curaos-bun-primary-rule]] + ADR-0103 §3 fallback → Bun adapter primary; Fastify fallback |
| 4 | GraphQL federation breaking changes | DEFERRED-MILESTONE | Cosmo Router policy at M4 |
| 5 | MQTT broker (emqx vs NATS) | RESOLVED-ADR | ADR-0103 → NATS MQTT (already in stack per ADR-0102) |

## ADR-0107 — Observability (5 open Qs, ALL RESOLVED)

| # Topic | Status | Resolution |
|---|---|---|
| Grafana AGPLv3 SaaS posture | RESOLVED-RULE | [[curaos-slo-rule]] + [[curaos-error-tracking-rule]] (self-hosted OK; no binary bundling) |
| MinIO AGPLv3 air-gap bundle | **RESOLVED (DA13 Q6)** | ADR-0163 → SeaweedFS Apache 2.0 replaces MinIO entirely (zero AGPL exposure in Zarf bundle) |
| HIPAA BAA observability vendors | RESOLVED-RULE | [[curaos-agent-eval-obs-rule]] (Langfuse v3 self-hosted; PHI never leaves CuraOS) |
| GDPR erasure SLO 30d | **RESOLVED (DA13 Q7)** | ADR-0163 → 30d primary DB + sync stores; backups + HIPAA 6y audit log exempted w/ documented retention exemption (GDPR Recital 30 + Art 17(3)(b)(e)) |
| SigNoz EE multi-tenant | DEFERRED-V2 | LGTM stack v1 |

## ADR-0109 — Containers + Orchestration (4 open Qs)

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Talos vs RKE2 on-prem HA | RESOLVED-RULE | [[curaos-orchestration-rule]] → K3s default; Talos + RKE2 documented fallbacks per-customer |
| 2 | Cilium kernel floor (5.10) | RESOLVED-RULE | [[curaos-cni-rule]] → Cilium 1.14+ baseline |
| 3 | Harbor vs Nexus | DEFERRED-MILESTONE | Harbor v1; Nexus bridge if customer demands |
| 4 | vCluster HA license | DEFERRED-V2 | Capsule tenancy v1; vCluster Pro v2 if needed |

## ADR-0114 — AI/Agent Integration (6 open Qs)

| # Topic | Status | Resolution |
|---|---|---|
| Clinical LoRA accuracy gate | DEFERRED-MILESTONE | Pre-HealthStack-GA measurement |
| MCP SEP-1932/SEP-1933 migration | DEFERRED-MILESTONE | AAIF working group tracking |
| Spring AI 2.0 migration | N/A | Removed — Spring not in NestJS stack |
| MedNLP commercial license | DEFERRED-MILESTONE | Pre-HealthStack GA |
| Speculative decoding activation | DEFERRED-MILESTONE | Pre-vLLM prod tuning |
| MCP curated vs auto-expose | RESOLVED-RULE | [[curaos-mcp-stack-rule]] → CLI-first + curated must-have list |

## ADR-0120 — Foundation Auth (4 open Qs)

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Better Auth vs node-oidc-provider primary | DEFERRED-MILESTONE | M2 decision per identity-service `AGENTS-sections/baseline.md` |
| 2 | Webhook delivery guarantees | RESOLVED-ADR | at-least-once + idempotency-key + HMAC-SHA256 + versioned signature header, tiered retry/DLQ overlay (no exactly-once / strict ordering) → [notify-service webhook-delivery-contract.md](../../backend/services/notify-service/webhook-delivery-contract.md) (#328) |
| 3 | CSP per tenant branding | DEFERRED-MILESTONE | Sandboxed iframe pattern documented |
| 4 | Passwordless-only tenant tier | DEFERRED-MILESTONE | Yes likely; M3 lock |

## ADR-0121 — Builder Suite (6 open Qs)

| # Topic | Status |
|---|---|
| AppSmith deployment | RESOLVED-ADR (ADR-0121b → separate sidecar service) |
| Sites SSR strategy | DEFERRED-MILESTONE (Astro+Next both per tenant need) |
| Custom domain SSL | DEFERRED-MILESTONE (cert-manager handles; UX flow M7) |
| Git backend for design VCS | **RESOLVED (DA13 Q10)** | ADR-0163 → BYO external Git (GitHub/GitLab/Gitea via OAuth) primary; CuraOS Gitea fallback for tenants w/o; provider abstraction in @curaos/providers per ADR-0154 |
| Workflow Canvas placement | RESOLVED-ADR (ADR-0121d → shared editor lib, two surfaces) |
| Form runtime location | DEFERRED-MILESTONE (Apps/Sites embed OR standalone Forms server) |

## ADR-0122 — Workflow Manager (6 open Qs)

| # Topic | Status |
|---|---|
| Activepieces embed vs sidecar | DEFERRED-MILESTONE (sidecar default; embed for SMB) |
| Cross-tenant workflow sharing | DEFERRED-MILESTONE (per-tenant registry + opt-in publish) |
| Workflow marketplace | DEFERRED-MILESTONE (first-party + community both) |
| Compensating action UX | DEFERRED-MILESTONE (M2) |
| Worker autoscaling | RESOLVED-ADR (KEDA per ADR-0111) |
| Kestra add-on tier | DEFERRED-V2 |

## ADR-0123 — Codegen + Plugin (6 open Qs)

| # Topic | Status |
|---|---|
| Recipe distribution registry | DEFERRED-MILESTONE (CuraOS public + Harbor tenant mirror both) |
| AI-fill quality | DEFERRED-MILESTONE (self-tests + golden-output + human review) |
| Versioning conflicts | DEFERRED-MILESTONE (semver + per-service pinning) |
| Cross-recipe composition | RESOLVED-ADR (Backstage Templates pattern) |
| Dapr mandatory | RESOLVED-ADR (optional sidecar; default-on foundation, default-off tenant) |
| Plugin SDK packaging | DEFERRED-MILESTONE (separate npm pkgs) |

## ADR-0200 — Identity+Party+Org+Audit Cluster (10 open Qs)

| # | Topic | Status |
|---|---|---|
| 1-3 | TenantModule edge cases (`@SkipTenancy()` policy) | RESOLVED-RULE | ADR-0155 + identity-service `AGENTS-sections/baseline.md` |
| 4 | Hash-chain re-genesis migration | DEFERRED-MILESTONE | M2 (audit-service kickoff) |
| 5 | Party gRPC schema vs REST | DEFERRED-MILESTONE | M3 (party-service kickoff) |
| 6 | Org ltree depth limit | RESOLVED-RULE | org-service `AGENTS-sections/baseline.md` (max_depth=10 default) |
| 7-9 | Cross-cluster GDPR saga timing | DEFERRED-MILESTONE | M3 |
| 10 | **Party / Org / Identity FK ordering (M9 cluster root question)** | **RESOLVED-ADR** | **ADR-0210 → Diamond model + modulith shared schema. Spike: `research/m9-s1-diamond-model-spike.md`** |

## ADR-0164 — Zarf bundle layout (6 follow-up resolutions)

| # | Topic | Status | Resolution |
|---|---|---|---|
| 1 | `assets/cosign.pub` placeholder (was M8-S5) | **RESOLVED-ADR (2026-05-28)** | [ADR-0211](0211-cosign-offline-keyed-contract.md) → real ECDSA P-256 key + sigstore-policy-controller chart + offline-keyed ClusterImagePolicy + admission-rejection negative test. M8-S4 (#86). |
| 2 | Same-tool determinism (cross-tool parity gated?) | RESOLVED-ADR | §2.4 resolution-pin (M8-S2 #84 v4 contract) → cross-tool parity NOT gated. |
| 3 | Image-build pipeline `<digest>` resolution | **RESOLVED (2026-06-10)** | Shipped in curaos#616 / curaos PR#308 (session 36): `zarf.yaml` is generator-emitted via `gen:zarf-images` + drift gate (32 services + 31 migration images buildable); remaining digest pinning happens at the #588 image publish step (operator-gated). Row was stale-deferred; corrected by the RP-53 milestone-trigger sweep. |
| 4 | Redpanda Tiered Storage in air-gap | **RESOLVED-ADR (2026-05-28)** | ADR-0164 §2.8 + `curaos/ops/zarf/values/redpanda.yaml` pin local PVC only and set `cloud_storage_enabled=false`, `cloud_storage_enable_remote_write=false`, and `cloud_storage_enable_remote_read=false`. |
| 5 | Rollback artifact naming | **RESOLVED-ADR (2026-05-28)** | Release bundle names normalize to `/opt/curaos/bundles/curaos-vX.Y.Z.tar.zst`; retain current and N-1 bundles for Zarf-level rollback. |
| 6 | ADR numbering convention for follow-up corrections | **RESOLVED-ADR (2026-05-28)** | Preserve historical ADR numbers once assigned. Record later schedule/numbering corrections as resolution-pin rows here and in the source ADR instead of renumbering existing ADR files. |

## ADR-0211 — cosign offline-keyed contract (0 open Qs)

| # | Topic | Status | Resolution |
|---|---|---|---|
| 1 | Per-service keys (multi-key federation) | DEFERRED-MILESTONE | M9 — needs stable RBAC inside `cosign-system` first. |
| 2 | SBOM attestations (`cosign attest`) | DEFERRED-MILESTONE | M8 P2 followup — reuses the same key + workflow. |
| 3 | Cosign 3.x ed25519 support | DEFERRED-V2 | Filed upstream against sigstore/cosign; M10 rotation switches if it lands. ECDSA P-256 satisfies the contract identically. |

## ADR-0213 — M15 GA-verification infra topology (0 open Qs)

| # | Topic | Status | Resolution |
|---|---|---|---|
| 1 | Where GA #512/#516/#517 verify (cloud/on-prem/hybrid/air-gap) | **RESOLVED-ADR (2026-06-06)** | [ADR-0213](0213-m15-ga-verification-infra-topology.md) → local amd64 **build-host** (46 GB, data-plane + on-prem + air-gap clusters + bundle build) + Hetzner CX43 **example** (hybrid control-plane) joined over self-hosted **NetBird** mesh. $0 recurring. amd64 throughout. User-authorized. Rules: [[curaos-orchestration-rule]], [[curaos-airgap-rule]], [[curaos-image-build-rule]]. |
| 2 | Public customer demo (#516) | **RESOLVED-ADR (2026-06-06)** | De-scoped to an **internal demo-slice** (~15 services, NetBird-only reach) — no public IP / Cloudflare Tunnel / marketing. ADR-0213 §"Demo tenant re-scope". Rules: [[curaos-foresight-rule]] (quarantine), [[curaos-orchestration-rule]]. |
| 3 | Cloud SaaS profile deploy (EKS/GKE/AKS) | DEFERRED-V2 | Bundle is built + signed (#512); deploying to a managed cloud is a future customer concern, not this GA pass. ADR-0213 §"Profile → where it runs". Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-orchestration-rule]]. |

## ADR-0214 — Public edge for CuraOS (curaos.example.com) (0 open Qs) — AMENDS ADR-0213

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Public edge mechanism (tunnel vs Caddy) | **RESOLVED-ADR (2026-06-07)** | [ADR-0214](0214-public-edge-curaos-domain.md) D1 → reuse existing **Caddy + 15-yr CF Origin Cert** (wildcard already covers `curaos.example.com`); **NO cloudflared** (homelab DECISIONS.md #1 rejected it). Rules: [[curaos-rolling-update-rule]], [[curaos-local-vs-3rdparty-rule]]. |
| 2 | Brochure site publish (`curaos.example.com`) | **RESOLVED-ADR (2026-06-07)** | ADR-0214 D2 → 1 Caddy vhost + 1 proxied A record + 1 webhook hook reusing the `example-mirror` pattern; on-box `bun run build`. Shippable NOW (no M16 dep). |
| 3 | Live demo-slice exposure | **RESOLVED-ADR (2026-06-07)** | ADR-0214 D3/D4 → runs on **build-host**, exposed via APISIX → Caddy-over-NetBird → CF; **Pocket-ID auth-gated**, synthetic-only. M16-gated. Rules: [[curaos-orchestration-rule]], [[curaos-healthstack-vision]]. |
| 4 | Public demo profile | **RESOLVED-ADR (2026-06-07)** | ADR-0214 D5 → `values-demo-public.yaml` forward profile (NOT `-v2`); amends ADR-0213 internal-only invariant. Rules: [[curaos-rolling-update-rule]]. |

## ADR-0220 - Frontend runtime-injectable config (one image, all settings at deploy/run time) (0 open Qs) - v1.1

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Make ALL FE config runtime-injectable (one image)? | **RESOLVED-ADR (2026-06-29)** | [ADR-0220](0220-frontend-runtime-config-injection.md) -> `window.__ENV` client injection + proxy `x-forwarded-host` alignment (drops `serverActions.allowedOrigins`) + runtime CSP + Zod boot-validation; generator-emitted. Eliminates build-bake class. v1.1; v1.0 keeps targeted build-arg fix. Epic GitHub #840. |
| 2 | `next-runtime-env` vs in-house `@curaos/runtime-config`? | **RESOLVED-ADR (2026-06-30)** | v1.1 adopts pinned `next-runtime-env` through generated `src/env.ts`; an in-house package is v1.2+ only through a forward migration. |
| 3 | nginx-ingress vs APISIX for FE header-alignment snippet? | **RESOLVED-ADR (2026-06-30)** | FE app charts use APISIX `proxy-rewrite` with plugin-level `host` plus `X-Forwarded-Host` / `X-Forwarded-Proto` headers. |

## ADR-0151 — Cross-Cluster Coherence (9 open Qs → all resolved by ADR-0152-0162 except F-018/F-019)

| # | Status |
|---|---|
| F-001 to F-016 | RESOLVED-ADR (each finding got own ADR 0152-0162) |
| F-018, F-019 minor | RESOLVED-ADR (ADR-0152 batch resolution) |

## ADR-0115 — HealthStack Overlays (17 open Qs)

Mostly clinical-domain implementation details deferred to HealthStack milestones (M11+). None block Phase 3 foundation work.

| Topic clusters | Status |
|---|---|
| FHIR resource boundary decisions | DEFERRED-MILESTONE |
| Snowstorm/dcm4chee licensing edges | DEFERRED-MILESTONE |
| HAPI tenancy pattern | RESOLVED-ADR (ADR-0157 → three-mode reconciliation) |
| PHI partition rules | RESOLVED-RULE ([[curaos-postgres-rule]] DB-per-tenant + [[curaos-agent-eval-obs-rule]] Presidio scrub) |

**M12 research-tracking (2026-06-03, Story curaos-ai-workspace#329):** all 17 §6 open questions now annotated in-place in ADR-0115 §6 with `→ tracked:` refs pointing to the `ai/curaos/docs/research/m12-*.md` research set (prerequisite to M12 Epic #26 Story seeding; research informs the deferred questions, does NOT re-open the accepted §3–§5 stack). Per-question tracking:

| Q | Topic | Status | Tracked in |
|---|---|---|---|
| Q1 | FHIR R6 migration timing | DEFERRED-MILESTONE | [m12-fhir-resource-boundary.md](../research/m12-fhir-resource-boundary.md) §5 |
| Q2 | SNOMED CT jurisdiction automation | DEFERRED-MILESTONE | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §4 |
| Q3 | HIPAA Final Rule publication date | DEFERRED-MILESTONE (controls met by config) | [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §4/G2 |
| Q4 | SanteMPI cross-tenant isolation | DEFERRED-MILESTONE | [m12-fhir-resource-boundary.md](../research/m12-fhir-resource-boundary.md) §4.2/§4.3 |
| Q5 | BridgeLink long-term governance | DEFERRED-MILESTONE | ADR-0115 §7 mitigation (HAPI HL7v2 primary) |
| **Q6** | **Orthanc GPLv3 SaaS exposure** | **STILL-OPEN / needs-legal-signoff** | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §6 (dcm4chee LGPL fallback + ≥2 alts; **human legal sign-off required** — user ack 2026-06-03) |
| **Q7** | **DrugBank CC BY-NC 4.0 commercial** | **STILL-OPEN / needs-legal-signoff** | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §7 (RxNorm + OpenFDA + FDB-paid alts; DrugBank Open excluded; **human legal/cost sign-off required** — user ack 2026-06-03) |
| Q8 | FDA SaMD PCCP for MONAI | DEFERRED-MILESTONE | [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §6/G4 |
| Q9 | 42 CFR Part 2 + TEFCA QHIN filter | DEFERRED-MILESTONE (design proposed) | [m12-consent-phi-enforcement.md](../research/m12-consent-phi-enforcement.md) §5.2 |
| Q10 | NEMSIS vs FHIR Paramedicine IG | DEFERRED-MILESTONE (post-M12 EMS overlay) | ADR-0115 §6 Q10 annotation |
| Q11 | Snowstorm ES/OpenSearch distribution | DEFERRED-MILESTONE (pin tested ES; Lite fallback) | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §3 |
| Q12 | cqf-ruler version pin owner | DEFERRED-MILESTONE | ADR-0115 §6 Q12 annotation + [[curaos-version-pinning-rule]] |
| Q13 | DICOM imaging storage tiering | DEFERRED-MILESTONE (imaging milestone) | ADR-0115 §6 Q13 annotation |
| Q14 | GDPR erasure vs FHIR immutability | DEFERRED-MILESTONE (Presidio approach) | [m12-consent-phi-enforcement.md](../research/m12-consent-phi-enforcement.md) §5.3 |
| Q15 | CMS-0057-F Payer-to-Payer API | DEFERRED-MILESTONE (insurance-module, Jan 1 2027) | [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §3/G1 |
| Q16 | MONAI Deploy GPU scheduling | DEFERRED-MILESTONE (imaging milestone) | ADR-0115 §6 Q16 annotation |
| Q17 | Carequality/CommonWell membership | DEFERRED-MILESTONE (business/legal) | [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §5/G3 |

Encounter lifecycle + scheduling state model: [m12-encounter-lifecycle.md](../research/m12-encounter-lifecycle.md). FHIR resource boundary: [m12-fhir-resource-boundary.md](../research/m12-fhir-resource-boundary.md).

> **Two STILL-OPEN / needs-legal-signoff items (Q6 Orthanc, Q7 DrugBank):** these are the only §6 questions a research agent must NOT resolve — both carry license-bearing legal risk. The research surfaces the risk + ≥2 alternatives each; the binding decision requires human legal sign-off (user acknowledged 2026-06-03). M12 imaging + drug-interaction paths are NOT hard-blocked (documented fallbacks exist).

## ADR-0212 — reference-only `changeValues` on the Diamond audit envelope (amends M7-D5 / ADR-0210)

| # | Topic | Status | Resolution |
|---|---|---|---|
| 1 | Diamond audit envelope value-blindness (divergence checker reads `valuesKnown:false` on every live event; #99 Phase D live signal can't reach green) | **RESOLVED-ADR (2026-05-29)** | [ADR-0212](0212-m9-s2-changevalues-reference-only-audit.md) → optional reference-only `changeValues` (closed `z.enum(RBAC_ROLES)` + UUID + allowlisted typed refs); PHI superRefine extended to scan it (N1-N12). M9-S2 (#200). |
| 2 | M7-D5 reopening — does adding a values field violate the binding PHI-free envelope decision? | **RESOLVED-ADR (2026-05-29)** | User-authorized reopening. Legitimate narrowing, NOT value-ban reversal: RBAC codes + opaque UUIDs are not PHI (§160.103); IHE BALP v1.1.4 precedent. M7-D5 §D5 interface + hard-rule amended in `m7-user-decisions.md`. |
| 3 | First-pass open-kebab value regex admitted 18 PHI payloads (adversarial verdict-1) | **RESOLVED-ADR (2026-05-29)** | Closed-enum redesign (no open kebab branch, access-control resource-type allowlist, closed key enum) — PHI-safe by construction. ADR-0212 §2.1 + guardrails §6. |
| 4 | Value-aware role-grant parity cannot reach green: M3 (`${targetUserId}:${role}` value, `correlation_id=targetUserId`) vs Diamond (bare-role `changeValues`, request-scoped `correlationId`) never share a value-set NOR a pairing bucket; no Diamond `ActorMembership` role producer exists (grill `m9-s2-slice3-pr43.md` BLOCK) | **RESOLVED-ADR (2026-05-30)** | [ADR-0212 §7.1](0212-m9-s2-changevalues-reference-only-audit.md) → Option 3 canonical token `membership:<uuid>#<role>` assembled in the normalizer (both sides), Diamond role producer sets `correlationId=targetUserId`, UUID `tenantId`. PHI gate untouched (token is normalizer-internal). Live pairing key corrected to 2-tuple `(tenantId, correlationId)` (P0-6). Re-scopes #40/#115/#39. |

## Resolution-pin — ADR-0210 (M9 Diamond)

| # | Topic | Status | Resolution |
|---|---|---|---|
| pin-1 | Diamond audit envelope carries field NAMES only (reference-only per M7-D5) | **AMENDED (2026-05-29)** | [ADR-0212](0212-m9-s2-changevalues-reference-only-audit.md) adds optional reference-only `changeValues` for value-aware divergence parity. Numbers preserved per ADR-0164 row-6 convention; this pin records the amendment. |

---

## Aggregate count (post-DA13)

| Status | Count |
|---|---|
| RESOLVED-RULE | 18 |
| RESOLVED-ADR (incl DA13 batch ADR-0163, M9 Diamond ADR-0210, M7-D5 amendment ADR-0212) | 35 |
| DEFERRED-MILESTONE | 37 |
| DEFERRED-V2 | 7 |
| **STILL-OPEN** | **2** |

## STILL-OPEN questions

**2 — both ADR-0115 §6 clinical-overlay licensing questions, awaiting human legal sign-off (user ack 2026-06-03):**

| # | Topic | Status | Resolution path |
|---|---|---|---|
| Q6 | Orthanc GPLv3 SaaS exposure | **STILL-OPEN / needs-legal-signoff** | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §6 — dcm4chee LGPL fallback + ≥2 alts; research surfaced risk + alternatives, binding decision needs human legal sign-off. M12 imaging NOT hard-blocked. |
| Q7 | DrugBank CC BY-NC 4.0 commercial use | **STILL-OPEN / needs-legal-signoff** | [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §7 — RxNorm + OpenFDA + FDB-paid alts; research surfaced risk + alternatives, binding decision needs human legal/cost sign-off. M12 drug-interaction NOT hard-blocked. |

All 10 DA13 Tier 1-4 questions remain resolved (see [ADR-0163](0163-da13-still-open-resolution-batch.md)); the 2 STILL-OPEN above are new M12 clinical-overlay licensing items surfaced by #329 research, not DA13 regressions.

DEFERRED-MILESTONE questions (37) = scheduled at a specific roadmap milestone (live set on the `CuraOS Roadmap` Project) per `development-kickoff.md`; not blocking pre-implementation. Surface at M-trigger via service AGENTS.md frontmatter.

DEFERRED-V2 questions (7) = explicitly out of v1 scope; reassess at v2/v3 product planning.

---

## Deferred decision research (pre-ADR, no question filed yet)

Research artifacts produced ahead of an ADR, where the user has **not** yet made the paradigm-level decision. Tracked here so the doc graph stays connected and the next session can resume. These are NOT resolutions and do NOT bind any rule or ADR.

| Topic | Status | Artifact |
|---|---|---|
| Effect-TS as internal logic layer inside NestJS (coexist w/ Zod-4 seam) | **PARKED (2026-05-30)** — paradigm decision deferred by user (Effect vs neverthrow/FP-lite vs benchmark vs NestJS-native) | [research/2026-05-30-effect-internal-layer.md](../../research/2026-05-30-effect-internal-layer.md) |

---

## How agents use this file

1. **Before reading any ADR:** consult this map. If ADR's open Qs all resolved → proceed.
2. **Before implementation touches an ADR's area:** verify STILL-OPEN Qs are not blocking; if blocking → propose answer + wait for user.
3. **When proposing a stack pick:** check relevant rule in `ai/rules/` first, then this map + ADR-0099 + relevant cluster ADR.
4. **When a question gets resolved:** update this map + the source ADR's Open Questions section + relevant rule.

## How to update

- New resolution → add row to relevant ADR section above + update aggregate count + delete from STILL-OPEN list.
- New question discovered → add to ADR section w/ STILL-OPEN status; add row to STILL-OPEN list; flag to user.

## XSRC external-source enrichment ADRs (0221-0236, proposed)

Proposed ADRs from the external-source corpus-mining + tool-research program (Phase 12). Status **PROPOSED** pending user review; full program index: [external-source-enrichment/README.md](../external-source-enrichment/README.md).

| ADR | Topic | Status |
|---|---|---|
| [ADR-0221](0221-direct-reuse-vs-service-boundary-for-large-external-sys.md) | XSRC-ADR-0001  -  Direct reuse vs service boundary for large external systems | PROPOSED |
| [ADR-0222](0222-odoo-module-reuse-strategy-lgpl-port-adapt-no-copy.md) | Odoo module reuse strategy (LGPL, port-adapt, no copy) | PROPOSED |
| [ADR-0223](0223-vista-mumps-analysis-and-integration-strategy-apache-su.md) | VistA/MUMPS analysis and integration strategy (Apache substrate, CPRS apps, FHIR | PROPOSED |
| [ADR-0224](0224-openhospital-reuse-strategy-gpl-port-adapt-service-boun.md) | OpenHospital reuse strategy (GPL: port-adapt + service-boundary, no verbatim c | PROPOSED |
| [ADR-0225](0225-erpnext-frappe-reuse-strategy-gpl-mit-split.md) | ERPNext/Frappe reuse strategy (GPL/MIT split) | PROPOSED |
| [ADR-0226](0226-dolibarr-contracts-billing-reuse-strategy-gpl.md) | Dolibarr contracts/billing reuse strategy (GPL) | PROPOSED |
| [ADR-0227](0227-crm-strategy-for-broker-insurance-workflows-espocrm-sui.md) | CRM strategy for broker/insurance workflows (EspoCRM/SuiteCRM AGPL, custom-entit | PROPOSED |
| [ADR-0228](0228-workflow-automation-runtime-strategy-local-workflow-cor.md) | Workflow automation runtime strategy (local workflow-core vs Windmill/Activepi | PROPOSED |
| [ADR-0229](0229-license-and-attribution-governance-agpl-gpl-mpl-permiss.md) | License and attribution governance (AGPL/GPL/MPL/permissive matrix) | PROPOSED |
| [ADR-0230](0230-xsrc-fhir-hl7-interoperability-strategy.md) | (XSRC) FHIR/HL7 interoperability strategy | PROPOSED |
| [ADR-0231](0231-scheduling-calendar-architecture-xsrc-phase-12.md) | Scheduling/calendar architecture (XSRC Phase 12) | PROPOSED |
| [ADR-0232](0232-billing-contracts-revenue-cycle-architecture.md) | Billing / contracts / revenue-cycle architecture | PROPOSED |
| [ADR-0233](0233-human-in-the-loop-workflow-architecture.md) | Human-in-the-Loop Workflow Architecture | PROPOSED |
| [ADR-0234](0234-ui-embedding-vs-native-rebuild-person-centric-re-center.md) | UI embedding vs native rebuild (person-centric re-center) | PROPOSED |
| [ADR-0235](0235-insurance-broker-domain-modeling-new-domain-generator-f.md) | Insurance / Broker Domain Modeling (new domain, generator-first) | PROPOSED |
| [ADR-0236](0236-demo-data-from-vista-vehu-and-synthea-via-database-back.md) | Demo data from VistA-VEHU and Synthea via database-backed seeds | PROPOSED |

## XSRC own-IdM ADRs (0237-0242, proposed)

Own multi-tenant IdM (replace pocket-id) decisions; full plan: [external-source-enrichment/identity/README.md](../external-source-enrichment/identity/README.md).

| ADR | Topic | Status |
|---|---|---|
| [ADR-0237](0237-oidc-provider-lib-node-oidc-provider-wrapped-in-nestjs-.md) | OIDC-PROVIDER-LIB: node-oidc-provider wrapped in NestJS as the CuraOS OIDC/OAuth | PROPOSED |
| [ADR-0238](0238-rebac-engine-extend-curaos-policy-with-a-postgres-zanzi.md) | REBAC-ENGINE: extend @curaos/policy with a Postgres Zanzibar tuple model + Check | PROPOSED |
| [ADR-0239](0239-org-tenant-model-two-layers-curaos-tenancy-isolation-bo.md) | ORG-TENANT-MODEL: two layers - @curaos/tenancy isolation boundary + Logto-style  | PROPOSED |
| [ADR-0240](0240-self-service-flow-engine-no-declarative-flow-engine-for.md) | SELF-SERVICE-FLOW-ENGINE: no declarative flow engine for v1 (provider interactio | PROPOSED |
| [ADR-0241](0241-user-federation-curaos-identity-federation-on-our-stack.md) | USER-FEDERATION: @curaos/identity-federation on our stack (LDAP polling-sync + r | PROPOSED |
| [ADR-0242](0242-cutover-seam-reversible-pocket-id-cutover-via-the-oidc-.md) | CUTOVER-SEAM: reversible pocket-id cutover via the oidc-broker issuer-flip | PROPOSED |
