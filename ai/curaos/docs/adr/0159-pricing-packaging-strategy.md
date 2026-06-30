# ADR-0159 — Pricing & Packaging Strategy

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** [ADR-0151 F-008 Major — Pricing tier overlap (Builder Suite 4 products vs monolithic bundles)](0151-cross-cluster-coherence.md)
**Amends:**
- ADR-0120 §4 (Auth pricing tiers)
- ADR-0121 / 0121a-e §pricing (Builder Suite product tiers)
- ADR-0122 §pricing (Workflow Manager tiers)
- ADR-0123 §pricing (Codegen Platform tiers)
- ADR-0099 §4 (each-service-is-a-product economic detail)
- ADR-0153 §recipe-inventory (emit pricing-meter-event recipes)
**Parent ADRs:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0107 Observability](0107-observability.md)
**Related:** ADR-0115 (HealthStack), ADR-0204 (Workflow overlays), ADR-0207 (EducationStack), ADR-0208 (HealthStack clinical)

---

## 1. Status

Accepted. Resolves ADR-0151 F-008: the prior ADR set described individual product tiers in some places and monolithic bundle tiers in others with no reconciliation. This ADR is the single canonical source of truth for how CuraOS is priced, packaged, and billed.

---

## 2. Context

### 2.1 Problem

ADR-0099 §4 establishes that every CuraOS service is its own sellable product. ADR-0121 ships the Builder Suite as four standalone products. ADR-0115 references a "HealthStack Suite." ADR-0122 and ADR-0123 each mention pricing tiers. None of these ADRs agreed on how tiers map across products, whether bundles exist, how individual-product buyers upgrade, or how platform-wide metered billing relates to per-product ladders.

ADR-0151 F-008 (Major) flagged this as a coherence gap that must be resolved before billing infrastructure (Stripe subscriptions, meter events, invoice generation) can be implemented.

### 2.2 User decision

Hybrid — all three sales motions operate in parallel:

1. **Individual product SKUs** — each product has its own Free / Pro / Business / Enterprise ladder.
2. **Pre-packaged bundles** — persona-driven groupings at a discount (30–40%) relative to individual SKU prices.
3. **Platform tier** — a single CuraOS Platform subscription that includes all products; differentiated by usage metering.

All three motions are first-class. A customer can start anywhere and upgrade along any path.

### 2.3 Market context

Hybrid pricing (subscription base + usage metering) is the dominant pattern in SaaS as of 2026, adopted by ~41% of SaaS companies (up from 27% in 2024), with hybrid-pricing companies reporting 38% higher net revenue retention than pure-subscription peers. The three-motion model mirrors patterns from Atlassian (individual products + bundled suite + Data Center platform tier), Stripe (per-product APIs + bundled Connect/Radar/Tax + usage metering), and HashiCorp (individual OSS tools + enterprise bundles + usage-based cloud platform). AWS-style consumption metering is the reference model for the Platform tier.

---

## 3. Decision — Three Sales Motions

### Motion 1: Individual Product SKUs

Each foundation product and each Builder Suite sub-product is independently purchasable with a four-level ladder: **Free → Pro → Business → Enterprise**.

### Motion 2: Pre-packaged Bundles

Five persona-driven bundles at fixed discount bands (30–40% vs. sum of individual SKUs). Each bundle has the same four-level ladder.

### Motion 3: Platform Tier

A single **CuraOS Platform** subscription that includes ALL products. Four tiers: **Starter → Growth → Scale → Enterprise**. Differentiated entirely by usage quotas and metering, not feature gating. AWS-style: monthly base + pay-for-consumption overages, auto-scaling tenant invoicing.

---

## 4. Per-Motion Pricing Detail

### 4.1 Individual Product SKU Ladders

Each product's ladder follows the shared schema below. Exact dollar amounts are set by go-to-market and are outside this ADR; this section defines **what is metered at each tier boundary**.

#### Schema (all products)

| Tier | Target | Metered limits | Enterprise differentiators |
|---|---|---|---|
| **Free** | Hobbyist / evaluation | Low fixed quotas, no SLA | — |
| **Pro** | Individual professional / small team | 10× Free quotas; SLA 99.5% | — |
| **Business** | Teams / SMB | 100× Free quotas; SLA 99.9%; priority support | White-label branding opt-in |
| **Enterprise** | Large org / regulated | Unlimited negotiated; SLA 99.95%; dedicated support; HIPAA BAA; air-gap option; custom legal | Full white-label; custom domain billing portal; SSO enforcement |

#### CuraOS Auth (ADR-0120)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Admin seats | 1 | 5 | 25 | Unlimited (negotiated) |
| MAU (monthly active users) | 500 | 5,000 | 50,000 | Unlimited |
| SSO connections (SAML/OIDC federation) | 0 | 1 | 5 | Unlimited |
| MFA factor types | 2 (TOTP + passkey) | 4 | All (incl. hardware key + risk-based) | All + custom factor SDK |
| SCIM provisioning | No | No | Yes | Yes |
| Cross-tenant federation | No | No | Yes | Yes |
| SMART-on-FHIR scopes | No | No | Yes (HealthStack add-on) | Yes |
| Break-glass access | No | No | Yes | Yes + audit SLA |
| GDPR DSAR tooling | No | Yes | Yes | Yes |
| Plugin SDK (custom auth flows) | No | No | No | Yes |

Overage pricing: per-MAU above tier quota billed at flat rate per 1,000 MAU/month.

#### CuraOS Builder IDE (ADR-0121)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Designer seats | 1 | 3 | 15 | Unlimited |
| Projects | 3 | 20 | Unlimited | Unlimited |
| Collab users (Yjs real-time) | 1 concurrent | 5 concurrent | 20 concurrent | Unlimited |
| AI fill / suggest (LiteLLM tokens) | 10k tokens/mo | 100k tokens/mo | 1M tokens/mo | Metered / BYO LLM key |
| Marketplace publishes | 0 | 3 | Unlimited | Unlimited + certified signing |
| Version history retention | 7 days | 30 days | 365 days | Unlimited |
| Custom component SDK | No | Yes | Yes | Yes |

#### CuraOS Sites (ADR-0121a)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Sites | 1 | 5 | 25 | Unlimited |
| Pageviews/month | 10k | 100k | 1M | Unlimited (CDN negotiated) |
| Custom domains | 0 | 2 | 10 | Unlimited |
| CMS content items | 500 | 10k | Unlimited | Unlimited |
| E-commerce products | 0 | 50 | 1,000 | Unlimited |
| Community/forum members | 0 | 500 | 10k | Unlimited |
| Storage (SeaweedFS) | 1 GB | 10 GB | 100 GB | Negotiated |
| Export to customer infra | No | Yes | Yes | Yes + air-gap bundle |

Overage: per-10k pageviews above quota.

#### CuraOS Apps (ADR-0121b)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Apps | 3 | 15 | Unlimited | Unlimited |
| App users (DAU) | 50 | 1,000 | 25,000 | Unlimited |
| Data sources connected | 2 | 10 | Unlimited | Unlimited + custom connectors |
| Marketplace app publishes | 0 | 1 | Unlimited | Unlimited |
| AppSmith runtime replicas | 1 | 2 | 5 | Negotiated |
| AI-generated app templates (LiteLLM) | 5 runs/mo | 50 runs/mo | 500 runs/mo | Metered |

Overage: per-1k DAU above quota.

#### CuraOS Widgets (ADR-0121c)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Widgets | 3 | 20 | Unlimited | Unlimited |
| Embed views/month | 5k | 100k | 2M | Unlimited |
| Submissions/month | 100 | 5k | 100k | Unlimited |
| Marketplace publishes | 0 | 5 | Unlimited | Unlimited |
| FHIR-aware patient widgets | No | No | Yes (HealthStack add-on) | Yes |
| PHI-safe iframe isolation | No | No | Yes | Yes |

Overage: per-1k embed views and per-1k submissions above quota.

#### CuraOS Workflow Canvas (ADR-0121d)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Canvases | 5 | 50 | Unlimited | Unlimited |
| Collaborators (real-time) | 1 | 5 | 20 | Unlimited |
| Canvas paradigms available | Flow/DAG only | + State Machine + Mind map | All 8 paradigms | All + custom node SDK |
| Emit targets (compile to runtime) | 1 (Temporal) | 3 | All | All + BPMN export |
| AI agent flow editor | No | No | Yes | Yes |
| Version snapshots | 7 days | 90 days | 365 days | Unlimited |

#### CuraOS Forms (ADR-0121e)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Forms | 5 | 50 | Unlimited | Unlimited |
| Submissions/month | 200 | 5k | 200k | Unlimited |
| E-signature fields | No | No | Yes (10k e-sigs/mo) | Yes + 3rd-party BYO |
| FHIR Questionnaire mode | No | No | Yes (HealthStack add-on) | Yes |
| Offline PWA mode | No | No | Yes | Yes |
| Payment fields (Stripe Connect) | No | No | Yes | Yes |
| External sinks (Google Sheets etc.) | No | Yes | Yes | Yes + custom Activepieces piece |
| AI-generated forms (LiteLLM) | 5 runs/mo | 30 runs/mo | 300 runs/mo | Metered |

Overage: per-1k submissions above quota.

#### CuraOS Workflow Manager (ADR-0122)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Workflow executions/month (Temporal) | 500 | 10k | 500k | Unlimited |
| Durable activities/month | 2k | 50k | 2.5M | Unlimited |
| Automation runs/month (Activepieces) | 200 | 5k | 200k | Unlimited |
| Cron jobs | 3 | 25 | Unlimited | Unlimited |
| Tenant isolation model | Shared task-queue | Shared task-queue | Namespace-per-tenant | Cluster-per-tenant (on-prem/air-gap) |
| Custom activity SDK (NestJS sidecar) | No | No | Yes | Yes |
| WASM plugin activities | No | No | No | Yes |

Overage: per-1k executions and per-1k automation runs above quota.

#### CuraOS Codegen Platform (ADR-0123)

| Meter | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Cookbook recipes used/month | 10 (P0 only) | 50 | Unlimited | Unlimited |
| Generation runs/month | 20 | 200 | 5k | Unlimited |
| Marketplace recipe publishes | 0 | 3 | Unlimited | Unlimited + certified signing |
| Custom template engines (Handlebars/EJS) | No | Yes | Yes | Yes |
| Per-tenant cookbook overlay | No | No | Yes | Yes |
| MCP server access (AI-agent integration) | No | No | Yes | Yes |
| OCI artifact registry storage | 500 MB | 5 GB | 50 GB | Negotiated |

Overage: per-100 generation runs above quota.

---

### 4.2 Pre-packaged Bundles

Bundles apply a fixed discount vs. the sum of constituent individual-SKU prices at the same tier. Each bundle has the same four-level ladder (Free / Pro / Business / Enterprise) with the same feature gates as the constituent products.

| Bundle | Products included | Discount vs. SKU sum | Target persona |
|---|---|---|---|
| **Builder Suite** | Builder IDE + Sites + Apps + Widgets + Workflow Canvas + Forms | 30% | Developers and designers building tenant-facing surfaces |
| **Foundation Suite** | Auth + Workflow Manager + Codegen + Builder Suite (all above) | 40% | Platform engineering teams / ISVs embedding CuraOS as their product base |
| **HealthStack Suite** | Foundation Suite + HealthStack overlay (ADR-0115 / ADR-0208) + clinical UI package + SMART-on-FHIR module + air-gap option | 40% | Health systems, clinics, EMS operators, health-tech ISVs |
| **EducationStack Suite** | Foundation Suite + EducationStack overlay (ADR-0207) + LMS UI + accreditation module | 40% | Schools, universities, ed-tech ISVs |
| **Personal Suite** | Lightweight personal-overlay services (personal-workflow-service, personal-automation-service, personal-*-service per ADR-0204) + Forms + Widgets | 25% | Individual users / freelancers / solopreneurs |

#### Bundle-specific notes

**Builder Suite:**
- Includes Workflow Canvas because it is the visual editor surface for workflow authoring inside Builder IDE.
- Forms is included because it is embedded in Sites, Apps, and Widgets by default.
- Does NOT include Auth (sold separately or via Foundation Suite) — tenants BYO auth or add CuraOS Auth.

**Foundation Suite:**
- The complete injection mold (per ADR-0099 §3): all four foundation products + the full Builder Suite.
- Recommended entry point for ISVs and platform engineering teams.
- Enterprise tier includes: HIPAA-ready config templates, SOC 2 audit package, break-glass access, dedicated support channel.

**HealthStack Suite:**
- Clinical overlay adds: FHIR R4/R5 patient/encounter/observation services, SMART-on-FHIR app launch, HAPI FHIR sidecar, clinical form templates (FHIR Questionnaire), HL7v2 ingestion, PHI-safe widget isolation, consent workflow, EMS dispatch module.
- Air-gap option mandatory for regulated on-prem deployments — included at Business and Enterprise tiers.
- HIPAA BAA included at Business and Enterprise tiers.

**EducationStack Suite:**
- Education overlay adds: student lifecycle management, course authoring (LMS), assessment engine, accreditation workflows, cohort analytics.
- FERPA-aware data isolation included at Business and Enterprise.

**Personal Suite:**
- Targets individual users / freelancers who want personal workflow automation, form collection, and embeddable widgets.
- No multi-tenant administration surface — single-user tenant context.
- Free and Pro tiers only at launch; Business tier deferred to v2.

---

### 4.3 Platform Tier

A single **CuraOS Platform** subscription includes every product. Differentiation is by usage metering only — no feature gates between tiers (except air-gap, HIPAA BAA, and enterprise support, which require Scale or Enterprise).

| Tier | Monthly base | Included allowances | Overage model |
|---|---|---|---|
| **Starter** | Fixed low base | Small quotas per meter (see table below) | Per-unit metered |
| **Growth** | Mid base | 10× Starter quotas | Per-unit metered (lower rate) |
| **Scale** | High base | 100× Starter quotas + air-gap option | Volume discounts; committed-use option |
| **Enterprise** | Negotiated / custom | Unlimited negotiated | Custom committed-use contract; HIPAA BAA; dedicated SRE |

#### Platform metered dimensions (all products combined into single invoice)

| Meter dimension | Unit | Source service |
|---|---|---|
| Admin seats | per seat | Auth + Builder IDE |
| MAU | per 1k MAU | Auth |
| Workflow executions | per 1k executions | Workflow Manager |
| Automation runs | per 1k runs | Workflow Manager (Activepieces) |
| Generation runs | per 100 runs | Codegen Platform |
| Pageviews | per 10k pageviews | Sites |
| App DAU | per 1k DAU | Apps |
| Embed views | per 1k views | Widgets |
| Form submissions | per 1k submissions | Forms |
| E-signatures | per 1k e-sigs | Forms |
| AI tokens (LiteLLM) | per 1M tokens | Builder IDE / Forms / Canvas / Codegen |
| Storage (SeaweedFS) | per GB | Sites / Apps / Forms / Widgets |
| Custom domain slots | per domain | Sites |
| Marketplace revenue share | % of published app/widget revenue | Apps / Widgets / Codegen |

Auto-scaling: as a tenant's consumption in any dimension rises, the monthly invoice increases automatically. No manual plan upgrades required. Tenants can set spending caps (Stripe Payment Intents hard limit) with alerting thresholds at 70% / 90% of cap.

---

## 5. Cross-Motion Compatibility

### 5.1 Upgrade paths

```
Individual SKU(s)
    │
    ▼ (can switch at any time)
Bundle (auto-applies if all constituent SKUs present)
    │
    ▼ (supersedes individual subscriptions)
Platform Tier (Starter → Growth → Scale → Enterprise)
```

Rules:
- A customer holding individual SKUs for all products in a bundle is automatically offered a bundle upgrade with the discount applied retroactively to the next billing cycle.
- A Platform tier subscription supersedes all individual SKU and bundle subscriptions. Unused individual sub months are prorated as credits.
- Downgrade from Platform to bundle or SKU is allowed at end of billing cycle only (no mid-cycle downgrade).
- Overlay suite add-ons (HealthStack, EducationStack) layer on top of any motion — they do not require the full Foundation Suite, but Foundation Suite inclusion is recommended and priced accordingly.

### 5.2 Tenant self-service upgrade

Tenants can upgrade motion/tier from within the CuraOS billing portal (custom-domain white-label at Enterprise). Upgrade is effective immediately; invoice is prorated. Tenant receives upgrade confirmation event (billing.subscription.upgraded) consumed by audit-service per ADR-0107 OTel pipeline.

### 5.3 Multi-product quoting for sales-led Enterprise

Sales team generates a custom quote combining any mix of SKUs + bundles + platform tier + overlay suites + professional services. Stripe Quotes API used for multi-line-item proposals with expiration dates. Accepted quote auto-provisions Stripe Subscription(s) via the billing aggregator service.

---

## 6. Billing Infrastructure

### 6.1 Stripe primitives

| Concern | Stripe primitive |
|---|---|
| Per-product subscriptions (individual SKU, bundle) | `stripe.Subscription` with `price_id` per product tier |
| Platform tier base charge | `stripe.Subscription` recurring item (monthly/annual) |
| Metered usage (all dimensions) | `stripe.billing.Meter` + `MeterEvent` per dimension per service |
| Overage charges | `stripe.Price` with `billing_scheme: tiered` or `per_unit` on same Subscription |
| Marketplace revenue share | Stripe Connect — publisher account receives payout; CuraOS takes platform commission via `application_fee_amount` |
| Multi-line enterprise quotes | Stripe Quotes API |
| Tax handling | Stripe Tax (per-tenant address; handles VAT, GST, sales tax by region) |
| Custom domain billing portal | Stripe Customer Portal with per-tenant branding |
| Spending caps | Stripe Payment Intents `amount` ceiling + webhook `payment_intent.payment_failed` → billing-service throttle |

### 6.2 Meter event flow

```
Service emits usage event
        │
        ▼
OpenTelemetry custom metric (per ADR-0107 OTel pipeline)
        │
        ▼
Billing aggregator service
  - Subscribes to OTel collector export (OTLP over gRPC)
  - Aggregates per-tenant per-dimension per-interval
  - Deduplicates by idempotency key (correlation ID from ADR-0102)
        │
        ├──▶ stripe.billing.MeterEvent (real-time, low-latency path)
        │       idempotency_key = <service>:<tenant>:<event_id>
        │
        └──▶ audit-service hash-chain (per ADR-0104)
                — tamper-evident billing audit trail
```

Every meter-event-emitting service emits via codegen recipe `billing.meter-event` (see §10 Amendments — ADR-0153). Each recipe call in codegen also emits a `billing.generation-run` meter event for Codegen Platform billing.

### 6.3 Per-tenant invoice generation

- Invoice interval: monthly (default) or annual (Enterprise committed-use option).
- Invoice includes: base subscription charge + all metered overages per dimension, itemized per meter.
- Per-tenant currency and locale from tenant settings (i18n per ADR-0099 §6 NFRs).
- Tax line: Stripe Tax, computed per billing address on file.
- Invoice PDF generated by Stripe; tenant-branded at Enterprise (white-label).
- Invoice events (`invoice.created`, `invoice.paid`, `invoice.payment_failed`) consumed by billing aggregator → notify-service → tenant admin.

### 6.4 Billing service

A new `billing-core-service` (neutral capability, per ADR-0099 §5.1) owns:
- Stripe API client (server-side, secret key in Vault per ADR-0108).
- MeterEvent emitter interface (used by all other services via shared NestJS module `@curaos/billing-client`).
- Subscription state cache (Valkey per ADR-0101) — authoritative for feature-flag gate checks (is tenant on Business tier?).
- Webhook receiver for all inbound Stripe events (signed, verified).
- Billing aggregator (OTel collector → Stripe MeterEvent batch flush every 60s).
- Tenant billing portal session creation (Stripe Customer Portal URL generation).

`billing-core-service` must NOT be a dependency blocker for product services. Feature-gate checks are done via a thin Valkey cache lookup (`tenant:<id>:plan`) that billing-core-service populates; services read it directly without calling billing-core-service synchronously.

---

## 7. OSS Community Tier

Per ADR-0099 §4 charter and OSS-leverage strategy:

- All CuraOS products are available **self-hosted under OSS license** (Apache 2.0 or MIT per per-product ADR).
- Community self-hosters pay nothing to CuraOS.
- No phone-home, no license key, no feature lockout in OSS build.
- Air-gap is fully supported in OSS build.

CuraOS revenue from community ecosystem:

| Revenue stream | Mechanism |
|---|---|
| Cloud SaaS subscriptions | Hosted CuraOS managed by CuraOS Inc. |
| Certified marketplace commission | 20% of paid app/widget/recipe revenue through CuraOS marketplace per ADR-0121b |
| Enterprise support contracts | Annual support SLA sold to self-hosters; billed outside Stripe (invoice) |
| Certification audits | CuraOS-certified plugin / recipe / overlay; annual audit fee |
| Professional services | Implementation, migration, customization; billed as one-time Stripe invoices |
| Hosted air-gap bundles | Pre-staged OCI artifact bundles + SLA — sold to regulated self-hosters who want vendor-backed air-gap packages |

**What is NOT monetized from OSS community:** feature gating, license keys, code escrow, telemetry extraction. OSS build is clean.

---

## 8. Marketplace Revenue Share

Revenue share applies to all three marketplaces:

| Marketplace | Products sold | CuraOS share | Publisher share | Notes |
|---|---|---|---|---|
| App Marketplace (ADR-0121b) | Tenant-published apps (one-time / subscription) | 20% | 80% | Stripe Connect; per-install or per-subscription |
| Widget Marketplace (ADR-0121c) | Tenant-published widgets (free / paid / per-submission) | 20% | 80% | Same; per-submission overage billed to embedding host |
| Recipe Marketplace (ADR-0123) | Community codegen recipes (free / paid per-use) | 20% | 80% | Per generation-run meter event; cosign-signed OCI artifacts |

Certified tier (security-audited + CuraOS-signed):
- CuraOS charges a certification fee (annual) for publisher.
- Certified badge displayed in marketplace; higher trust, higher discovery ranking.
- Certification does not change revenue split.

Enterprise marketplace (private):
- Tenants at Business/Enterprise can create private marketplace channels — curated set of apps/widgets/recipes visible only to invited tenants.
- No CuraOS commission on private-channel transactions if tenant self-hosts marketplace infra.
- CuraOS commission applies to any transaction routed through CuraOS-hosted marketplace infra.

---

## 9. Amendments to Prior ADRs

### ADR-0099 §4 — Each service is its own product

Append: "Pricing-tier definition, meter dimensions, and upgrade compatibility for every product are canonical in ADR-0159. Per-product ADRs hold their own tier tables by reference to ADR-0159 schema."

### ADR-0120 (Auth) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Auth tier table. Meter events emitted: `auth.mau` (per authenticated user session per calendar month, deduplicated), `auth.sso_connection` (per active SSO federation config)."

### ADR-0121 (Builder IDE) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Builder IDE tier table. Meter events emitted: `builder.ai_token` (per LiteLLM token consumed in AI fill/suggest), `builder.marketplace_publish` (per OCI artifact signed + published)."

### ADR-0121a (Sites) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Sites tier table. Meter events emitted: `sites.pageview` (per CDN-served request, sampled at 1%), `sites.storage_gb` (daily snapshot of total storage bytes / 1e9)."

### ADR-0121b (Apps) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Apps tier table. Meter events emitted: `apps.dau` (per distinct authenticated user per calendar day), `apps.marketplace_publish`."

### ADR-0121c (Widgets) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Widgets tier table. Meter events emitted: `widgets.embed_view` (per iframe/shadow-DOM init), `widgets.submission` (per form submission received)."

### ADR-0121d (Workflow Canvas) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Workflow Canvas tier table. Meter events emitted: `canvas.collaborator_session` (per Yjs Hocuspocus session open, per user per canvas per day)."

### ADR-0121e (Forms) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Forms tier table. Meter events emitted: `forms.submission` (per QuestionnaireResponse / FormSubmission record written), `forms.esig` (per e-signature completion), `forms.ai_run` (per LiteLLM-powered form generation invocation)."

### ADR-0122 (Workflow Manager) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Workflow Manager tier table. Meter events emitted: `workflow.execution` (per Temporal workflow run start), `workflow.activity` (per Temporal activity invocation), `workflow.automation_run` (per Activepieces flow execution start)."

### ADR-0123 (Codegen Platform) — Add §8 Pricing

"Canonical pricing: ADR-0159 §4.1 CuraOS Codegen Platform tier table. Meter events emitted: `codegen.generation_run` (per codegen engine invocation regardless of recipe count), `codegen.marketplace_publish` (per OCI recipe artifact signed + published), `codegen.storage_gb` (daily snapshot of recipe registry storage)."

### ADR-0153 (Codegen Recipe Coverage) — Add recipe `billing.meter-event`

New P0 recipe: `billing.meter-event`

**Purpose:** Scaffold the NestJS `@curaos/billing-client` module integration into any service. Emits a typed `MeterEvent` DTO to the billing aggregator via shared Valkey pub channel. Ensures every service emitting meter events uses the same idempotency-key convention: `<service-name>:<tenant-id>:<event-uuid>`.

**Output targets:** NestJS interceptor (wraps controller action) + NestJS module registration snippet + Vitest unit test for deduplication behavior.

**Idempotency convention:** `<service>:<tenant>:<correlation-id-from-ADR-0102>` — correlation ID already carried on every Kafka/NATS message per ADR-0102; billing client reads it from request context.

---

## 10. Action Items

| # | Item | Owner | Blocking |
|---|---|---|---|
| A-1 | Create `billing-core-service` scaffold using `backend.nestjs-service` recipe (ADR-0153) + `billing.meter-event` recipe | Platform engineering | Stripe meter event flow |
| A-2 | Add `billing.meter-event` recipe to ADR-0153 P0 recipe inventory (formal amendment) | Architecture | A-1 |
| A-3 | Add `@curaos/billing-client` shared NestJS module to ADR-0209 (shared backend libs cluster) | Architecture | A-1 |
| A-4 | Add §8 Pricing sections to ADR-0120, 0121, 0121a-e, 0122, 0123 referencing this ADR | Architecture | — |
| A-5 | Implement Stripe Meter definitions for all 14 meter dimensions (§6.1) | Platform engineering | A-1 |
| A-6 | Implement `billing.subscription.upgraded` / downgraded event schema in AsyncAPI registry (per ADR-0102 contract) | Platform engineering | A-1 |
| A-7 | Wire Stripe Tax per-tenant address from tenant-settings-service | Platform engineering | Invoice generation |
| A-8 | Implement spending-cap webhook handler (`payment_intent.payment_failed` → throttle) | Platform engineering | Enterprise SLA |
| A-9 | White-label billing portal: Stripe Customer Portal branding config per tenant at Enterprise tier | Platform engineering | Enterprise launch |
| A-10 | Define HIPAA BAA template + countersigning workflow in e-sign service (ADR-0121e) | Legal + Platform engineering | HealthStack Suite launch |

---

## 11. Open Questions

| # | Question | Decision needed by |
|---|---|---|
| OQ-1 | Dollar amounts for each tier — to be set by go-to-market team after unit economics modelling. This ADR defines meters and tier boundaries only. | Pre-launch pricing review |
| OQ-2 | Annual committed-use discount bands for Platform Scale/Enterprise — typically 15–25% vs. monthly. To be confirmed with finance. | Enterprise launch |
| OQ-3 | Personal Suite: should it support multi-seat (e.g., family plan)? Currently modelled as single-user. | v2 scoping |
| OQ-4 | Marketplace certification audit fee amount and cadence — ballpark $500–$2k/yr; confirm with legal + trust & safety. | Marketplace launch |
| OQ-5 | Stripe Connect payout cadence for marketplace publishers (weekly / monthly) — Stripe default is weekly; may need to match publisher expectations. | Marketplace launch |
| OQ-6 | HealthStack Suite: air-gap bundle delivery mechanism (USB / private registry mirror / presigned S3 URL) — separate ops ADR needed. | HealthStack launch |
| OQ-7 | `sites.pageview` meter: 1% sampling is an approximation. Confirm with product whether tenants expect exact counts or accept statistical estimation with stated ±2% error. | Sites launch |

---

## 12. References

| ADR | Title | Relationship |
|---|---|---|
| ADR-0099 | Charter, Vision, Priorities | Parent — each-service-is-a-product mandate |
| ADR-0107 | Observability Stack | OTel pipeline carries meter events to billing aggregator |
| ADR-0115 | HealthStack Overlays | Defines HealthStack Suite add-on scope |
| ADR-0120 | Foundation Auth | Auth meters: MAU, SSO connections, MFA factors |
| ADR-0121 | Foundation Builder Suite | Builder IDE meters |
| ADR-0121a | CuraOS Sites | Sites meters |
| ADR-0121b | CuraOS Apps | Apps meters + marketplace revenue model |
| ADR-0121c | CuraOS Widgets | Widgets meters + marketplace |
| ADR-0121d | CuraOS Workflow Canvas | Canvas meters |
| ADR-0121e | CuraOS Forms | Forms meters: submissions, e-sigs, AI runs |
| ADR-0122 | Foundation Workflow Manager | Workflow meters: executions, activities, automation runs |
| ADR-0123 | Foundation Codegen Platform | Codegen meters: generation runs, recipe publishes |
| ADR-0151 | Cross-Cluster Coherence Scan | Source of F-008 that this ADR resolves |
| ADR-0153 | Codegen Recipe Coverage | Amended to add `billing.meter-event` P0 recipe |
| ADR-0204 | Workflow + Automation Overlays | Personal Suite personal-*-service scope |
| ADR-0207 | EducationStack | EducationStack Suite overlay scope |
| ADR-0208 | HealthStack Clinical Services | HealthStack Suite clinical add-on scope |
| ADR-0209 | Frontend Packages + Backend Libs | `@curaos/billing-client` shared module home |

**External references:**
- [Stripe Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based/advanced/about) — billing meter + MeterEvent API used in §6.1
- [Stripe Recurring Pricing Models](https://docs.stripe.com/products-prices/pricing-models) — subscription + tiered pricing primitives
- [Hybrid Pricing Guide — Flexprice 2026](https://flexprice.io/blog/hybrid-pricing-guide) — market context for three-motion model
- [SaaS Pricing Models — Metronome 2026](https://metronome.com/blog/saas-pricing-models-guide) — metered billing patterns

---

*Last updated: 2026-05-24*
