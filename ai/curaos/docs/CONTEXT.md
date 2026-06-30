# CONTEXT — Docs Layer (ADR Inventory + Cross-Reference Index)

**Last updated:** 2026-05-29
**Total ADRs:** 53 (0096-archived → 0211)
**Canonical root:** ADR-0099

---

## 1. ADR Status Summary

| Range | Count | All Accepted? |
|---|---|---|
| 0096–0098 (archived research) | 3 | N/A (archived) |
| 0099–0100 (charter + runtime) | 2 | Yes |
| 0101–0115 (cross-cutting baseline) | 15 | Yes (addenda per ADR-0150) |
| 0120–0123 (foundation products) | 6 (+5 sub-ADRs) | Yes |
| 0150–0151 (alignment + coherence) | 2 | Accepted (0151 informational) |
| 0152–0162 (finding resolutions) | 11 | Yes |
| 0163–0164 (DA13 resolutions + Zarf layout) | 2 | Accepted |
| 0200–0209 (Wave 1 clusters) | 10 | 9 Accepted + 1 Draft (0203) |
| 0210–0211 (M9 Diamond model + cosign offline) | 2 | Accepted |

---

## 2. Cross-Reference Index by Topic

### Runtime + stack
- **NestJS foundation decision** → ADR-0100
- **TypeScript 5.x + Bun primary** → [[curaos-bun-primary-rule]], ADR-0100 §3
- **Fastify adapter** → ADR-0100, ADR-0201 §2.1
- **Turborepo task runner + Nx generators** → [[curaos-speed-patterns-rule]], ADR-0209 §1.2
- **React Native migration (from Flutter)** → ADR-0106, ADR-0209

### Data layer
- **PostgreSQL 17 + schema-per-tenant** → ADR-0101, ADR-0155
- **Valkey (Redis-compatible)** → ADR-0101
- **SeaweedFS** → ADR-0101, ADR-0201 (storage-service)
- **pgvector + OpenSearch** → ADR-0101, ADR-0201 (search-service)
- **TimescaleDB** → ADR-0101
- **Drizzle / MikroORM / Kysely ORM tiers** → [[curaos-orm-rule]]
- **Atlas (DB migrations)** → ADR-0100 §4, ADR-0123

### Event messaging
- **Kafka 4 (durable events)** → ADR-0102
- **NATS JetStream (low-latency)** → ADR-0102, ADR-0123 (plugin sidecar transport)
- **Outbox pattern** → ADR-0102, ADR-0201 §2.3
- **Apicurio schema registry** → ADR-0102
- **BullMQ (replaces Jobrunr)** → ADR-0102 addendum, ADR-0150 §3
- **Dead-letter queue** → ADR-0102, ADR-0201 §2.3

### API surface
- **TypeSpec → OpenAPI 3.1** → ADR-0103
- **APISIX gateway** → ADR-0103
- **GraphQL (Apollo/Mercurius)** → ADR-0103, ADR-0150 §3
- **Connect-RPC + Buf** → ADR-0103, ADR-0123
- **tRPC (internal)** → ADR-0100, ADR-0103
- **SSE / WebSocket / MQTT** → ADR-0103

### Auth + authorization
- **CuraOS Auth (NestJS-pure)** → ADR-0120 (supersedes ADR-0104)
- **Better Auth** → ADR-0120 §3.1
- **SimpleWebAuthn (passkeys/FIDO2)** → ADR-0120 §3.1
- **node-saml + samlify (SAML 2.0)** → ADR-0120 §3.1
- **SCIM 2.0** → ADR-0120 §3.1
- **SMART-on-FHIR** → ADR-0120 §3.1
- **OPA-WASM (global policies)** → ADR-0120 §3.2
- **Cerbos PDP (ABAC)** → ADR-0120 §3.2
- **OpenFGA (ReBAC/PHI)** → ADR-0120 §3.2
- **JWT + Opaque tokens + mTLS** → ADR-0156
- **`@curaos/tenancy` module** → ADR-0155
- **Keycloak status (deferred)** → ADR-0100 §5, ADR-0120 §2

### Builder Suite
- **CuraOS Builder IDE** → ADR-0121
- **CuraOS Sites (GrapesJS + Payload CMS)** → ADR-0121a
- **CuraOS Apps (AppSmith sidecar)** → ADR-0121b
- **CuraOS Widgets (Lit + Formily + Puck)** → ADR-0121c
- **CuraOS Workflow Canvas (@xyflow/react)** → ADR-0121d
- **CuraOS Forms (Formily + SurveyJS)** → ADR-0121e
- **Yjs + Hocuspocus (real-time collab)** → ADR-0121

### Workflow
- **Temporal TS SDK (durable sagas)** → ADR-0122 (supersedes ADR-0105)
- **Activepieces (visual automation)** → ADR-0122
- **`@nestjs/schedule` + BullMQ (cron)** → ADR-0122
- **Workflow Canvas reuse** → ADR-0121d, ADR-0122

### Codegen + plugin
- **Codegen Engine + Cookbook** → ADR-0123, ADR-0100 §4
- **57 Phase 1 recipes** → ADR-0153
- **Backstage Software Templates pattern** → ADR-0100 §4, ADR-0123
- **WASM Component Model (Wasmtime/napi-rs)** → ADR-0099 §6, ADR-0123
- **isolated-vm (tenant JS rules)** → ADR-0123
- **Dapr (sidecar backbone, optional)** → ADR-0123
- **`.gen.ts` file split convention** → ADR-0123, ADR-0153
- **Provider abstraction `@curaos/providers`** → ADR-0154

### Observability
- **OpenTelemetry Node SDK** → ADR-0107, ADR-0150 §5
- **Tempo (traces)** → ADR-0107
- **VictoriaMetrics (metrics)** → ADR-0107
- **Loki (logs)** → ADR-0107
- **Grafana (dashboards)** → ADR-0107

### Security
- **OpenBao (secrets, Vault-compatible)** → ADR-0108
- **Tink-Node (envelope encryption)** → ADR-0108, ADR-0150 §3
- **Coraza (WAF)** → ADR-0108
- **Falco + Tetragon (runtime security)** → ADR-0108
- **Wazuh (SIEM)** → ADR-0108
- **Gitleaks + Trivy (CI scanning)** → ADR-0108
- **HIPAA 2026 roadmap** → ADR-0162

### Containers + infra
- **K3s / Talos** → ADR-0109
- **Cilium CNI + mTLS (SPIFFE/SPIRE)** → ADR-0109, ADR-0156
- **ArgoCD / Flux GitOps** → ADR-0109
- **Harbor OCI registry** → ADR-0109, ADR-0123 (recipe OCI artifacts)
- **Capsule tenancy** → ADR-0109
- **vCluster (dev isolation)** → ADR-0109
- **Air-gap bundle SLA** → ADR-0158

### CI/CD
- **GitHub Actions self-hosted (ARC)** → ADR-0110
- **Atlas (DB migrations in CI)** → ADR-0110, ADR-0123
- **Renovate** → ADR-0110
- **Unleash (feature flags)** → ADR-0110, ADR-0201 (settings-service)
- **Verdaccio (npm mirror, air-gap)** → ADR-0110, ADR-0150 §3

### i18n
- **Weblate + ICU** → ADR-0112
- **dinero.js (replaces Moneta)** → ADR-0112, ADR-0150 §3
- **Helsinki-NLP MT (self-hosted)** → ADR-0112

### Analytics
- **ClickHouse + Superset + Cube** → ADR-0113
- **Pathling (FHIR analytics)** → ADR-0113, ADR-0208

### AI / LLM
- **vLLM + Qwen3/DeepSeek/Phi4 (local)** → ADR-0114
- **LiteLLM gateway (BYO 3rd-party)** → ADR-0114
- **Vercel AI SDK 6** → ADR-0114, ADR-0150 §3
- **LangChain.js + LangGraph.js** → ADR-0114, ADR-0150 §3
- **AI token quota + cost tracking** → ADR-0160
- **MCP server pattern** → ADR-0099 §14, ADR-0123

### HealthStack clinical
- **HAPI FHIR 8.x (JVM sidecar)** → ADR-0115, ADR-0208
- **Snowstorm (SNOMED CT, JVM sidecar)** → ADR-0115, ADR-0208
- **dcm4chee + OHIF (DICOM/PACS, JVM sidecar)** → ADR-0115, ADR-0208
- **PHI audit reconciliation** → ADR-0157
- **Clinical SLA enforcement** → ADR-0161
- **HIPAA compliance** → ADR-0162

### Pricing + packaging
- **Canonical pricing source** → ADR-0159
- **Meter events** → ADR-0159 (`curaos.billing.meter.event` Kafka topic)
- **Air-gap bundle tiers** → ADR-0158

### Cluster decisions
- **Identity + Party + Org + Audit** → ADR-0200
- **Platform Shared Services** → ADR-0201
- **Commerce (Medusa.js v2)** → ADR-0202
- **Calendar + Scheduling + Tasks** → ADR-0203
- **Workflow + Automation Overlays** → ADR-0204
- **Documents + E-sign + CRM + HR** → ADR-0205
- **Fleet + Geospatial + Integrations** → ADR-0206
- **EducationStack** → ADR-0207
- **HealthStack Clinical** → ADR-0208
- **Frontend Pkgs + Backend Libs** → ADR-0209

### M9 Diamond model + resolution batch
- **Diamond model/actors root (M9 Identity rolling-update)** → ADR-0210 (Implementation Plan amended for rolling-update per [[curaos-rolling-update-rule]])
- **GraphQL federation + tRPC resolution (DA13)** → ADR-0163
- **Zarf bundle layout** → ADR-0164
- **cosign offline keyed contract** → ADR-0211

---

## 3. Question Status Index

No stack-pick question is currently `STILL-OPEN`; see [RESOLUTION-MAP.md](adr/RESOLUTION-MAP.md). Rules are priority #1; ADRs are priority #2. One `needs-info` open question blocks M9-S2 tenant execution (see table).

| Question | Location | Blocking |
|---|---|---|
| Bun runtime | [[curaos-bun-primary-rule]], ADR-0100 | RESOLVED-RULE |
| Turborepo + Nx generators | [[curaos-speed-patterns-rule]], ADR-0209 | RESOLVED-RULE |
| GraphQL federation topology | ADR-0163 DA13 Q1 | RESOLVED-ADR: Cosmo router + Apollo subgraphs |
| tRPC scope | ADR-0163 DA13 Q2, ADR-0103 | RESOLVED-ADR: internal-only |
| First downstream service to prove the mold | ADR-0100 §7 M7 | RESOLVED: M7 shipped |
| Keycloak-as-optional-plugin timeline | ADR-0100 §10, ADR-0120 §2 | Deferred v2/v3 |
| WASM vs sidecar for first tenant plugin | ADR-0123 §plugin-runtime | RESOLVED-ADR: WASM + sidecar + isolated-vm by plugin class |
| ADR-0203 Calendar cluster (DRAFT) | ADR-0203 | Phase 4 calendar work |
| **Ambiguous multi-role M3 tenant semantics** | [#161](https://github.com/your-org/curaos-ai-workspace/issues/161), [HANDOVER.md](HANDOVER.md) | **STILL-OPEN** (`needs-info`): blocks M9-S2 Phase D tenant execution; Phase B backfill fails closed on ambiguous rows pending resolution |
| M9 Diamond rolling-update pivot | ADR-0210 §Implementation Plan, [[curaos-rolling-update-rule]] | RESOLVED-RULE: forward migration + feature flag + semver bump; no -v2 paths |
