# ADR-0121b — CuraOS Apps (Standalone Product)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099](0099-charter-priorities-vision.md), [ADR-0100](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0106 Frontend](0106-frontend.md), [ADR-0150 Baseline](0150-baseline-alignment-rules.md)

---

## 1. Context

**CuraOS Apps** = sellable standalone product under Builder Suite (per ADR-0121). Max-scope per user direction: internal tools + customer-facing apps + **multi-tenant app templates marketplace**. Retool / AppSmith Cloud / Bubble.io / Glide class — plus marketplace economy.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Scope (v1)** | Internal tools + customer-facing apps + app templates marketplace (tenants discover, install, customize) |
| **Runtime v1** | **AppSmith sidecar (Apache-2.0)** with NestJS adapter for tenant SSO + theme + audit |
| **Runtime parallel (v2)** | **CuraOS-native runtime** built on shadcn/ui + Reactflow + Formily — runs alongside AppSmith; tenant picks per app |
| **Additional runtimes (v2/v3)** | Refine + ILLA Builder (also Apache-2.0) + Lowcoder (AGPL — legal review) as plugin-loadable runtimes per ADR-0123 plugin model |
| **Data sources** | All CuraOS data (PG/Valkey/SeaweedFS) + REST/GraphQL/gRPC (any CuraOS service) + external REST/SQL (BYO) + FHIR connectors (HealthStack) + Kafka/NATS event streams + AI-agent-as-data-source (LiteLLM per ADR-0114) |
| **Distribution model** | Per-app config: tenant-private OR published to CuraOS marketplace |
| **Marketplace tiers** | First-party CuraOS-curated + Community-published + Certified (security-audited + signed) + Uncertified (caveat lector) |
| **Multi-tenancy per published app** | Each marketplace-installed app runs in installing tenant's namespace (no cross-tenant data leak) |
| **Revenue share** | Per-app monetization (one-time / subscription); CuraOS platform takes commission on community-published paid apps |
| **Auth-gated app access** | Per ADR-0120 (OIDC + Cerbos/OPA policies) |
| **Build emission** | Codegen recipe `app.appsmith` (sidecar manifest) + `app.curaos-native` (NestJS module + React+Next UI) — per ADR-0123 |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CuraOS Builder IDE                                             │
│  - Tenant builds app via canvas + data binding + workflows      │
│  - Per-app runtime picker: AppSmith / CuraOS-native / future    │
│  - Per-app distribution flag: private / marketplace             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Apps Build Service (NestJS sidecar)                            │
│  - Per chosen runtime, invokes Codegen recipe                   │
│  - Output: signed OCI artifact in Harbor                        │
└──────┬────────────────────────┬─────────────────────────────────┘
       │                        │
       ▼                        ▼
┌──────────────┐    ┌──────────────────────────┐
│  AppSmith    │    │  CuraOS-native runtime   │
│  sidecar     │    │  (NestJS module +        │
│  (Apache 2.0)│    │   React+Next UI built    │
│  + NestJS    │    │   on shadcn/ui + Reactflow│
│  adapter     │    │   + Formily + Ant Design)│
│              │    │                           │
│  - Auth pass-│    │  - Full CuraOS UI stack   │
│    through   │    │  - Same components as     │
│  - Theme     │    │    other CuraOS UIs       │
│    overlay   │    │  - Tenant theme overlay   │
│  - Audit     │    │  - End-to-end typed       │
│    interceptor│   │    via OpenAPI/Apollo     │
└──────────────┘    └──────────────────────────┘
       │                        │
       └────────┬───────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Apps Marketplace (NestJS + Payload CMS)                        │
│  - Search / browse / preview                                    │
│  - Install (per-tenant namespace)                               │
│  - Updates (semver per app; signed via cosign)                  │
│  - Reviews + ratings                                            │
│  - Revenue sharing (Stripe Connect; per ADR-0121a payment ADR) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data source matrix

| Source | Connector | Notes |
|---|---|---|
| **CuraOS PG (any tenant table)** | Per-tenant Prisma client | Schema-per-tenant per ADR-0101 |
| **CuraOS Valkey** | ioredis | Sessions, cache, ephemeral state |
| **CuraOS SeaweedFS** | aws-sdk/client-s3 (S3-compat) | Files, attachments |
| **Any CuraOS service REST** | OpenAPI-derived TypeScript client via Codegen | Service registry per ADR-0123 |
| **Any CuraOS service GraphQL** | Apollo Client → Cosmo federation supergraph | Per ADR-0103 |
| **Any CuraOS service gRPC** | Connect-RPC client | Per ADR-0103 |
| **External REST** | Per-tenant credentials in OpenBao (per ADR-0108); APISIX rate-limit | BYO |
| **External SQL** | Per-tenant connection string in OpenBao | Postgres / MySQL / SQL Server / Oracle / MongoDB |
| **FHIR R4 (HealthStack)** | `@medplum/core` + HAPI FHIR client (per ADR-0115) | Patient / Encounter / Observation / etc. |
| **Kafka topics** | KafkaJS + per-tenant consumer group | Event-driven apps |
| **NATS subjects** | nats.js + per-tenant account | JetStream + KV |
| **AI agent / LLM** | LiteLLM SDK (per ADR-0114) | App queries LLM; tenant brings own provider or uses CuraOS-local Qwen3/DeepSeek |
| **CuraOS Auth (user/role/tenant)** | NestJS guard exposes user context | Per ADR-0120 |
| **CuraOS Workflow Manager** | Temporal client (per ADR-0122) | Trigger workflows from apps; observe run state |

---

## 5. Marketplace tiers

| Tier | Examples | Trust | Distribution |
|---|---|---|---|
| **First-party** | CuraOS Patient Intake App, CuraOS Inventory Console, CuraOS HR Onboarding | CuraOS-built, signed, fully supported | Default-installed on relevant tier subscriptions |
| **Certified** | Third-party apps that pass security audit + accessibility review | CuraOS-audited, cosign-signed by CuraOS | Highlighted in marketplace search |
| **Community** | Any tenant-published app | Self-signed by publisher tenant; reviewed by community ratings | Installable with caveat warning |
| **Private** | Tenant-internal apps not published | Not in marketplace; only installable within tenant | N/A |

---

## 6. Revenue model

- **Free apps** — Community tier; CuraOS doesn't take commission
- **Paid one-time apps** — Stripe Connect routes to publisher; CuraOS takes 20% commission (industry-standard)
- **Subscription apps** — Same Stripe Connect; recurring revenue with commission per cycle
- **Enterprise-only apps** — Certified tier; CuraOS sales-assist; custom revenue split
- **CuraOS-curated bundles** — CuraOS packages multiple community apps; revenue split per included app

---

## 7. Per-app multi-tenant isolation

- Each installed app runs in installing tenant's K8s namespace (Capsule per ADR-0109)
- Per-tenant DB schema for app data
- Per-tenant Valkey namespace for cache
- Per-tenant FHIR scopes (if HealthStack) per ADR-0120
- Per-tenant rate limits at APISIX
- Per-tenant resource quotas (CPU, memory, network egress)
- WASM plugin per-tenant fuel + epoch (per ADR-0123)
- Audit per app invocation (per ADR-0104)

---

## 8. Local + 3rd-party rule applied

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| App runtime | AppSmith / CuraOS-native (both self-hosted) | Refine / ILLA / Lowcoder via plugin OR external Retool / Glide / Bubble (BYO embed) |
| Data sources | All CuraOS data layer (ADR-0101) | External PG / MySQL / Mongo / Snowflake / external REST/GraphQL (BYO credentials) |
| LLM data source | vLLM-hosted Qwen3/DeepSeek/Phi4 self-hosted | OpenAI / Anthropic / Bedrock / Gemini via LiteLLM (BYO) |
| App hosting | CuraOS K8s (per ADR-0109) | Vercel / Cloudflare Workers / customer K8s |
| App distribution | CuraOS Marketplace (Harbor + custom marketplace UI) | Tenant private bundle export to anywhere |
| Payment for paid apps | Stripe Connect (BYO publisher Stripe account) | Adyen / Square / Lemon Squeezy (BYO via plugin) |
| Search across marketplace | OpenSearch self-hosted | Algolia (BYO) |

---

## 9. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | Apps Build Service NestJS sidecar + Payload schema for app definitions |
| M2 | AppSmith sidecar integration + NestJS auth/theme/audit adapter |
| M3 | Data source connectors (CuraOS PG / Valkey / SeaweedFS / REST/GraphQL/gRPC clients) |
| M4 | External data sources (PG / MySQL / Mongo / REST/SQL BYO) |
| M5 | FHIR connectors (HealthStack scope) |
| M6 | Kafka / NATS event-source bindings |
| M7 | LiteLLM data source for AI-first apps |
| M8 | Marketplace v0 (search, browse, install, ratings) |
| M9 | Cosign signing + tier classification (first-party / certified / community) |
| M10 | Stripe Connect for paid apps + revenue share |
| M11 | Per-tenant install + namespace isolation + resource quotas |
| M12 | CuraOS-native runtime v0 (shadcn/ui + Reactflow + Formily) — parallel to AppSmith |
| M13 | Codegen recipes (ADR-0123): `app.appsmith`, `app.curaos-native` |
| M14 | Future-runtime plugin SDK (Refine, ILLA, Lowcoder loadable) |
| M15 | AI fill / suggest for app generation (Vercel AI SDK + LiteLLM) |
| M16 | Air-gap install bundle |
| M17 | v1 GA — sellable standalone |

---

## 10. Open questions

1. **AppSmith license drift** — Apache-2.0 today; monitor for changes (some commercial moves recently).
2. **CuraOS-native runtime feature parity with AppSmith** — exact UX features to target by v2. Initial bar: forms + tables + dashboards.
3. **Marketplace certification process** — automated (Trivy + axe-core + Cerbos policy check) + manual security audit. SLA?
4. **Stripe Connect alternatives** — for tenants in regions where Stripe isn't available (Iran, etc.). Likely region-specific BYO.
5. **App migration / export** — if tenant published app and wants to leave CuraOS, how do they export? Bundle download + redeploy elsewhere.
6. **App preview / sandbox** — try-before-buy: ephemeral preview environment per app (vCluster per ADR-0109).

---

## 11. References

- [ADR-0121 Builder Suite umbrella](0121-foundation-builder.md)
- [ADR-0121a Sites](0121a-foundation-sites.md)
- [ADR-0106 Frontend](0106-frontend.md)
- [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
- AppSmith: https://www.appsmith.com/
- Refine: https://refine.dev/
- ILLA Builder: https://www.illacloud.com/
- Lowcoder: https://lowcoder.cloud/
- Reactflow / @xyflow/react: https://reactflow.dev/
- Formily: https://formilyjs.org/
- shadcn/ui: https://ui.shadcn.com/
- Ant Design: https://ant.design/
- Stripe Connect: https://stripe.com/connect
- Capsule (multi-tenant K8s): https://capsule.clastix.io/
