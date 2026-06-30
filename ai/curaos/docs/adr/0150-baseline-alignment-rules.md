# ADR-0150 — Baseline Alignment Rules for DRAFT ADRs 0101-0115

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter](0099-charter-priorities-vision.md), [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md), [ADR-0120 Auth](0120-foundation-auth.md), [ADR-0121 Builder](0121-foundation-builder.md), [ADR-0122 Workflow](0122-foundation-workflow-manager.md), [ADR-0123 Codegen+Plugin](0123-foundation-codegen-plugin.md)

---

## 1. Purpose

ADRs 0101-0115 were drafted before the NestJS foundation was locked. They were marked DRAFT pending re-validation. This ADR is the **canonical re-validation reference** — instead of rewriting all 15 ADRs in full, ADR-0150 declares the alignment rules each DRAFT inherits.

Read ADR-0150 alongside any DRAFT ADR (0101-0115).

---

## 2. Cross-cutting rule — Local + 3rd-party for every integratable area

**Mandatory across all ADRs:** every integratable area must offer BOTH:

1. **Local / self-hosted / first-party** (CuraOS-managed component) — default for SaaS + on-prem + air-gap
2. **3rd-party / external / provider** integration (BYO provider via config)

Implementation: every CuraOS service exposes a **provider abstraction interface** (e.g., `LLMProvider`, `StorageProvider`, `EmailProvider`) with two default implementations:
- `CuraOSLocalProvider` (default; uses CuraOS-bundled OSS)
- `External3rdPartyProvider` (configurable per tenant)

Modulith + microservice requirement — same code, runtime config picks provider.

### Concrete bindings per ADR

| ADR | Local default | 3rd-party option |
|---|---|---|
| 0101 — Data | PG17 / Valkey / SeaweedFS / OpenSearch self-hosted | AWS RDS / Redis Cloud / S3 / Elastic Cloud (BYO credentials per tenant) |
| 0102 — Events | Kafka 4 / NATS JetStream self-hosted | Confluent Cloud / AWS MSK / Aiven Kafka (BYO) |
| 0103 — API | NestJS REST + Apollo / Mercurius GraphQL + tRPC self-hosted | Tenant-owned API gateway (Cloudflare / AWS API Gateway) for edge routing |
| 0104 — Identity | (Superseded by ADR-0120 — CuraOS Auth NestJS-pure) | Tenant federates Okta / Azure AD / Google Workspace |
| 0105 — Workflow | (Superseded by ADR-0122 — Temporal + Activepieces + cron) | Temporal Cloud / Inngest Cloud / Trigger.dev Cloud (BYO) |
| 0106 — Frontend | React+Next / Flutter / Astro / Lit self-built + hosted | Tenant hosts on Vercel / Netlify / Cloudflare Pages |
| 0107 — Observability | Tempo + VictoriaMetrics + Loki + Grafana + OTel self-hosted | Datadog / New Relic / Honeycomb / Grafana Cloud (BYO) |
| 0108 — Security/secrets | OpenBao + Tink + Trivy + Coraza + Falco + Wazuh self-hosted | HashiCorp Vault Cloud / AWS Secrets Manager / Snyk (BYO) |
| 0109 — Containers | K3s / Talos + Cilium + ArgoCD + Harbor self-hosted | EKS / GKE / AKS + ECR / GCR / ACR (BYO) |
| 0110 — CI/CD | GitHub Actions self-hosted runners (ARC) + Atlas + Renovate + Unleash | GitHub-hosted runners / CircleCI / Buildkite / LaunchDarkly (BYO) |
| 0111 — Infra | Ansible + Talos + Tinkerbell + Crossplane + KEDA self-hosted | AWS / GCP / Azure managed K8s + cloud-provider operators (BYO) |
| 0112 — i18n | Weblate + ICU + Helsinki-NLP MT self-hosted | Crowdin / Lokalise / Phrase / DeepL (BYO) |
| 0113 — Analytics | ClickHouse + Superset + Cube + Pathling self-hosted | Snowflake / BigQuery / Databricks / Metabase Cloud (BYO) |
| 0114 — AI/agent | vLLM + Qwen3 / DeepSeek / Phi4 self-hosted | OpenAI / Anthropic / Bedrock / Gemini via LiteLLM gateway (BYO) |
| 0115 — HealthStack | HAPI FHIR + Snowstorm + dcm4chee + OHIF self-hosted | Medplum Cloud / Smile CDR Cloud / external EHR FHIR endpoint / Google Healthcare DICOM (BYO) |

---

## 3. NestJS baseline propagation

Per ADR-0100, **all foundation products + the standard "default" downstream service tier** use NestJS (TypeScript). Per ADR-0123, codegen cookbook supports emitting other targets (Kotlin/Quarkus, Go/Echo, Rust/Axum, etc.) for specialist downstream services.

### Library swaps per ADR (TS-native replacements for JVM-only picks)

| ADR | JVM-only pick (now obsolete for foundation tier) | NestJS replacement |
|---|---|---|
| 0102 | Jobrunr (JVM, LGPL) | `@nestjs/schedule` + BullMQ + Temporal cron (per ADR-0122) |
| 0102 | Spring Cloud Stream | NestJS `@nestjs/microservices` (Kafka + NATS transports built-in) |
| 0103 | Spring MVC + virtual threads | NestJS controllers + Fastify adapter (sub-ms overhead) |
| 0103 | DGS (Netflix Domain Graph Service) | Apollo Server / Mercurius / @nestjs/graphql |
| 0103 | WunderGraph Cosmo Router | Stands — language-agnostic federation router |
| 0103 | HAPI FHIR (JVM) | Stays — but as NestJS sidecar for HealthStack (per 0115) |
| 0104 | Keycloak Java + Spring Security | Superseded by ADR-0120 — Better Auth + SimpleWebAuthn + SAML + Passport NestJS-native |
| 0105 | Flowable 7 (JVM) | Superseded by ADR-0122 — Temporal TS SDK + Activepieces |
| 0108 | Google Tink JVM | Tink Node (`@google-cloud/security-private-ca` style) OR pure-JS `jose` per ADR-0120 |
| 0109 | Jib (JVM-only image builder) | `@nestjs/cli build` + Dockerfile multistage + Buildpacks |
| 0110 | Gradle remote cache + Develocity | Nx remote cache (per ADR-0121) + Turbo OR custom cache server |
| 0110 | Sonatype Nexus (JVM artifacts) | Verdaccio (npm registry mirror) + Harbor (OCI artifacts) — both already chosen |
| 0112 | Moneta (JVM Money library) | `dinero.js` (TS Money library) |
| 0114 | Spring AI + LangGraph4j | Vercel AI SDK 6 + LangChain.js + LangGraph.js (per ADR-0114 TS equivalents — fully covered) |
| 0115 | Flowable for clinical pathways | Temporal (per ADR-0122) — clinical pathways as Temporal workflows; FHIR PlanDefinition maps to CuraOS IR → compiled to Temporal TS |

### Stays as JVM sidecar (NestJS wraps via HTTP/admin REST)

| Service | Why JVM stays | NestJS integration |
|---|---|---|
| HAPI FHIR (R4) | Only mature JVM FHIR server; HealthStack-only sidecar | NestJS HealthStack module calls HAPI FHIR Admin REST |
| Snowstorm (SNOMED CT) | Only mature SNOMED CT terminology server | NestJS Terminology module proxies Snowstorm REST |
| dcm4chee (DICOM PACS) | Only enterprise-grade OSS PACS | NestJS HealthStack-Imaging module proxies DICOM-Web REST |

These three are **HealthStack-overlay-only** — never required for non-healthcare deployments.

---

## 4. Foundation product references replacing standalone-ADR scope

Some sections of DRAFT ADRs are fully replaced by foundation product ADRs. Read foundation ADR as canonical:

| DRAFT ADR section | Canonical replacement |
|---|---|
| ADR-0103 §Sub-decision 5 BFF strategy | ADR-0121 (CuraOS Builder = Sites + Apps + Widgets BFF surfaces) |
| ADR-0103 §Sub-decision 6 Spec / schema management | ADR-0123 (codegen handles spec ↔ code round-trip) |
| ADR-0104 entire ADR | ADR-0120 (CuraOS Auth NestJS-pure) |
| ADR-0105 entire ADR | ADR-0122 (CuraOS Workflow Manager Temporal + Activepieces + cron) |
| ADR-0106 §Sub-decision 7 App/Site Builder | ADR-0121 (CuraOS Builder Suite — 4 products) |
| ADR-0106 §Sub-decision 11 Real-time channel | ADR-0103 (SSE) + ADR-0121 (Yjs/Hocuspocus for Builder collab) |
| ADR-0114 §Sub-decision 5 RAG / agent framework | LangChain.js + LangGraph.js + Vercel AI SDK 6 (TS native) |
| ADR-0115 §Sub-decision 6 CDS | Temporal workflows (per ADR-0122) for clinical pathways; CDS Hooks as JVM sidecar |

---

## 5. ADRs that fully STAND (no content change needed)

| ADR | Why stands |
|---|---|
| 0101 Data layer | PG17 / Valkey / SeaweedFS / OpenSearch all language-agnostic infra; TS clients mature |
| 0107 Observability | OpenTelemetry Node SDK + NestJS instrumentation libs first-class |
| 0108 Security | Infrastructure tools (Trivy, Gitleaks, Falco, etc.) language-agnostic |
| 0111 Infra | Ansible + Talos + ClusterAPI + Karmada + NetBird + Velero — runtime-agnostic |
| 0113 Analytics | ClickHouse + Superset + Cube + Iceberg — infrastructure-level |

These ADRs need only the "DRAFT → ACCEPTED with NestJS baseline" status bump.

---

## 6. Status updates per DRAFT ADR

| ADR | New status |
|---|---|
| 0100 | DRAFT (recommendation superseded by 0100-foundation-platform-runtime.md REDO) |
| 0101 | ACCEPTED (aligned with ADR-0150 §5 — STANDS) |
| 0102 | ACCEPTED with addendum (per ADR-0150 §3 swaps Jobrunr→@nestjs/schedule+BullMQ+Temporal; Spring Cloud Stream → @nestjs/microservices) |
| 0103 | ACCEPTED (canonical NestJS rewrite at `0103-api-surface.md` — TypeSpec IDL + Bun HTTP + Apollo/Cosmo + Connect-RPC + APISIX + SSE/WS/MQTT/Webhooks; legacy DRAFT archived at `0096-archived-api-surface-research.md`) |
| 0104 | SUPERSEDED by ADR-0120 |
| 0105 | SUPERSEDED by ADR-0122 |
| 0106 | ACCEPTED (canonical Frontend rewrite at `0106-frontend.md` — React+Next web + React Native (replaces Flutter v1) + Astro sites + Lit Widgets + Style Dictionary + Tailwind toggleable + shadcn/ui + Ant Design; legacy DRAFT archived at `0097-archived-frontend-research.md`) |
| 0107 | ACCEPTED (aligned with ADR-0150 §5 — STANDS) |
| 0108 | ACCEPTED with addendum (per ADR-0150 §3 Tink JVM → jose/Tink Node) |
| 0109 | ACCEPTED with addendum (per ADR-0150 §3 Jib → NestJS Docker multistage) |
| 0110 | ACCEPTED with addendum (per ADR-0150 §3 Gradle cache → Nx remote cache; Nexus → Verdaccio + Harbor) |
| 0111 | ACCEPTED (aligned with ADR-0150 §5 — STANDS) |
| 0112 | ACCEPTED with addendum (per ADR-0150 §3 Moneta → dinero.js) |
| 0113 | ACCEPTED (aligned with ADR-0150 §5 — STANDS) |
| 0114 | ACCEPTED with addendum (per ADR-0150 §3 Spring AI / LangGraph4j → Vercel AI SDK 6 + LangChain.js + LangGraph.js) |
| 0115 | ACCEPTED with addendum (per ADR-0150 §3 HAPI FHIR / Snowstorm / dcm4chee stay as JVM sidecars wrapped by NestJS HealthStack core; Flowable → Temporal per 0122) |

---

## 7. Cross-cutting requirements added (apply to ALL ADRs going forward)

1. **Local + 3rd-party rule** (per §2 above) — every integratable area must offer both.
2. **Modulith + microservice topology** (per ADR-0099 §5) — same code, runtime mode flag picks layout.
3. **Foundation-first sequencing** (per ADR-0099 §12) — implementation order locked: Auth → Builder → Workflow → Codegen → downstream services.
4. **Each service is a product** (per ADR-0099 §4) — every service sellable standalone + composable.
5. **Plugin/sidecar/event-interceptor** (per ADR-0099 §6 + ADR-0123) — extension pattern across all services.
6. **Codegen Engine + Cookbook** (per ADR-0123) — every service scaffolded via codegen; manual coding only when codegen can't.
7. **Patient-centric HealthStack** (per ADR-0099 §15) — clinical UX first; admin layer second; never compromises clinical quality.
8. **AI-agent friendliness** weight 5.0 — every stack pick verified against this.

---

## 8. Re-evaluation methodology going forward

When any new ADR is drafted OR existing DRAFT ADR is reopened for revision:

1. Read ADR-0099, ADR-0100 redo, ADR-0120, ADR-0121, ADR-0122, ADR-0123 first.
2. Read this ADR-0150 next for alignment rules.
3. Apply the funnel methodology (per ADR-0099 §11): paradigm → family → candidate → tactical.
4. Apply the local + 3rd-party rule (§2).
5. Recommendation stays DRAFT until user explicitly approves.

---

## 9. Wave 1 + Wave 2 of original plan

- **Wave 1 (per-module deep dives)** — DEFERRED until at least one foundation product (e.g., CuraOS Auth) reaches v1 implementation, so per-module decisions can use the actual scaffolds + interceptor framework.
- **Wave 2 (cross-cluster conflict scan)** — partial work done in this ADR-0150 (§6 status updates surfaced obvious conflicts). Full Wave 2 deferred until Wave 1 progresses.

---

## 10. References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime (REDO)](0100-foundation-platform-runtime.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- Memory: `curaos_local_vs_3rdparty_rule.md`, `curaos_architecture_vision.md`, `curaos_decision_methodology.md`, `curaos_stack_priorities.md`, `curaos_runtime_decisions.md`, `curaos_healthstack_vision.md`, `curaos_foundation_runtime_directives.md`
