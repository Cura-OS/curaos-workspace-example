# ADR-0160 — AI Token Quota and Cost Tracking

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** ADR-0151 F-010 (Major) — AI-assisted authoring tokenization cost and quota tracking unspecified
**Supersedes:** partial mention in ADR-0121 §7 ("Per-tenant AI fill credit quota — tracked via Auth quota + LiteLLM") — that sentence is superseded by this ADR; enforcement contract lives here
**Amends:** ADR-0114 (adds §13 BYO key flow + §14 tracking infra), ADR-0099 §14 (CuraOS-internal agents use managed-LLM tier), ADR-0150 §2 (LLMProvider abstraction extended for BYO + managed)

---

## 1. Status

Accepted — v1 decisions are binding. V2/V3 items are deferred with explicit trigger criteria. No implementation starts without this ADR in place.

---

## 2. Context

Every foundation product exposes AI-assisted authoring:

| Product | Feature | ADR |
|---|---|---|
| Builder | AI fill / component suggest | ADR-0121 §8 |
| Sites | AI fill / copy suggest | ADR-0121a §6 |
| Apps | AI assist | ADR-0121b |
| Widgets | AI generate | ADR-0121c |
| Workflow Canvas | AI fill / suggest | ADR-0121d §2 |
| Forms | AI generate | ADR-0121e |
| Codegen | AI recipe gen | ADR-0123 |
| HealthStack | Symptom-checker, clinical assist | ADR-0115 |

All AI calls route through LiteLLM gateway (decided in ADR-0114 §Decision D5). LiteLLM routes to either:
- **CuraOS-managed vLLM** — self-hosted open-weight models (Qwen3 / DeepSeek / Phi-4 per ADR-0114 §D1–D2)
- **Third-party LLM APIs** — OpenAI, Anthropic, Google Gemini, AWS Bedrock (BYO)

ADR-0151 F-010 found:
1. No decision on who pays for tokens when third-party APIs are used
2. Quota enforcement mechanism undefined (hard vs. soft cap, storage, per-user vs. per-tenant)
3. Cross-product quota sharing rules absent
4. Self-hosted GPU cost visibility gap ("tenants see free AI but provision H100")

**User decision (2026-05-24):** Start with BYO LLM API key opt-out (option 4) as primary v1 model. CuraOS-managed vLLM with usage tracking (no hard cap, no billing) is also available v1. Hard caps, soft caps, per-user quota, per-feature granularity, and provider routing intelligence are deferred to v2/v3.

---

## 3. Constraints (inherited)

- **Self-hosted first** (AGENTS.md §3): No mandatory external billing dependency. Quota infra runs on-prem.
- **OpenBao** (ADR-0108): All secrets including API keys stored in OpenBao. No plaintext in DB.
- **OTel** (ADR-0107): All usage metrics emitted as OpenTelemetry spans/metrics — no bespoke pipelines.
- **Langfuse** (ADR-0114 §D7): Tenant-scoped LLM observability (prompt + completion + cost) via Langfuse self-hosted.
- **ClickHouse** (ADR-0113): Per-tenant per-feature token history stored in ClickHouse OLAP.
- **Audit hash-chain** (ADR-0104 §Audit): Usage events hash-chained via audit-service.
- **PHI boundary** (ADR-0115): PHI redaction (Presidio per ADR-0114 §D11) runs before any LLM call; its model cost is tracked separately.

---

## 4. Decision

### 4.1 V1 — BYO LLM API Key (primary v1 model)

**Decision:** Tenants who supply their own LLM provider API key pay their provider directly. CuraOS does not meter, count, or bill for those tokens.

#### Key flows

**Configuration:**
- Tenant admin stores LLM provider API key in tenant config via CuraOS Settings UI
- Key written to OpenBao (ADR-0108) under path `secret/tenants/{tenant_id}/llm/api_key`
- Key metadata stored in tenant config table: `{provider, model_preference, key_ref, created_at, rotated_at}` — key value never touches application DB
- Supported providers v1: OpenAI, Anthropic, Google Gemini, AWS Bedrock (LiteLLM natively supports all four)

**Runtime routing:**
- LiteLLM gateway (ADR-0114 §D5) reads tenant's `llm.provider` + `llm.api_key_ref` from request context (injected by NestJS tenant interceptor per ADR-0152)
- LiteLLM fetches key from OpenBao at request time (cached in-process with 5-minute TTL, invalidated on OpenBao key rotation event)
- All AI calls for that tenant route to their chosen provider using their key
- CuraOS does not proxy billing; provider invoice goes directly to tenant

**What CuraOS does NOT do in v1 BYO mode:**
- Does not count tokens on tenant's behalf
- Does not enforce quota
- Does not bill or take commission on token cost
- Does not store prompt/completion content (Langfuse off for BYO tenants by default; tenant can opt-in)

**What CuraOS DOES do in v1 BYO mode:**
- Emits OTel span per LLM call: `{tenant_id, feature, model, latency_ms, http_status}` — no token counts (provider-side)
- Emits error events on provider auth failure (key invalid, quota exceeded upstream) — surfaced in CuraOS admin as "LLM unavailable"
- Logs API key rotation events to audit-service hash-chain (ADR-0104)

**Tenant experience:**
- Tenant sees own provider invoice (OpenAI / Anthropic dashboard)
- CuraOS admin shows LLM health status (green/red) + error log
- No token usage dashboard in CuraOS for BYO tenants in v1

**Liability:** CuraOS bears no liability for AI costs in BYO mode. Terms of service clause required.

#### BYO v1 tradeoffs

| | |
|---|---|
| Pro | Zero CuraOS billing infra; tenants comfortable with own keys; zero cost-overrun risk for CuraOS |
| Con | Tenants without LLM accounts cannot use AI features; CuraOS forgoes revenue share; no centralized usage visibility |

---

### 4.2 V1 — CuraOS-Managed LLM (vLLM-hosted models)

**Decision:** Tenants without their own LLM API key use CuraOS-hosted vLLM models (Qwen3 / DeepSeek / Phi-4). Usage is tracked per-tenant and reported. V1 applies no hard cap and no per-token billing. Cost recovered via flat-tier subscription (deferred to ADR-0159 pricing when created).

#### Key flows

**Runtime routing:**
- Tenant has no `llm.api_key_ref` set → LiteLLM routes to internal vLLM cluster endpoint
- vLLM endpoint is internal-network-only (mTLS, not internet-accessible)
- LiteLLM injects `tenant_id` as metadata on every request to vLLM

**Token tracking:**
- LiteLLM `success_callback` fires after each completion: emits `{tenant_id, feature_tag, model, input_tokens, output_tokens, latency_ms, cost_usd}` to OTel collector (ADR-0107)
- `feature_tag` values: `builder.fill` / `sites.fill` / `apps.assist` / `widgets.gen` / `canvas.fill` / `forms.gen` / `codegen.recipe` / `healthstack.symptom` / `presidio.redact`
- LiteLLM cost mapping (`litellm.model_cost` dict) provides `cost_usd` estimate even for self-hosted models (operator sets cost-per-token for GPU amortization visibility)
- OTel collector routes usage spans to ClickHouse (ADR-0113) via OTLP exporter — table: `ai_usage_events(tenant_id, feature_tag, model, input_tokens, output_tokens, cost_usd, ts)`
- Langfuse (ADR-0114 §D7) receives full trace (prompt + completion, PHI-redacted) for managed tenants — tenant-scoped via `metadata.tenant_id`

**Audit:**
- audit-service (ADR-0104) receives usage summary events on Kafka topic `ai.usage.summary` (one event per call): `{tenant_id, feature_tag, model, input_tokens, output_tokens, ts}` — hash-chained for tamper evidence
- PHI redaction events emitted to `ai.phi.audit` (existing topic per ADR-0114 Integration Map)

**Usage dashboard (v1):**
- CuraOS admin → Tenant → AI Usage: shows monthly input/output token totals by feature, trend chart, GPU cost estimate
- Data source: ClickHouse query over `ai_usage_events` with 1-hour materialized view
- No hard cap enforcement in v1 — display only

**Billing model (v1):**
- Flat-tier subscription per ADR-0159 (to be created) covers managed-LLM access
- No per-token overage billing in v1
- CuraOS absorbs GPU cost; heavy users may abuse; accepted risk at v1 scale

#### Managed v1 tradeoffs

| | |
|---|---|
| Pro | Tenants without LLM accounts can use AI; CuraOS earns from flat-tier subscription; full usage visibility |
| Con | Cost-overrun risk for CuraOS at scale; flat tier may underprice power users; GPU infra operational burden |

---

### 4.3 V1 — Tenant Opt-In / Selection

Tenant onboarding flow presents two options:

```
[ ] Use my own LLM API key  →  BYO mode (paste key, select provider)
[ ] Use CuraOS AI (included in plan)  →  Managed mode
```

- Default: Managed mode (lower friction)
- Tenant can switch at any time in Settings → AI Configuration
- Mixed mode not supported in v1 (one mode per tenant)

---

### 4.4 V2 — Per-Tenant Hard Cap + Soft Cap (deferred)

**Trigger:** When first SaaS cohort reaches 10+ tenants on managed-LLM tier OR when any single tenant exceeds 2M tokens/month.

**Decisions deferred to v2 ADR:**

**Hard cap by subscription tier:**
- LiteLLM gateway enforces per-tenant monthly token budget
- Suggested tiers (to be confirmed in ADR-0159): Starter 100K, Growth 1M, Scale 10M, Enterprise unlimited
- Enforcement: LiteLLM `max_budget` per virtual key (LiteLLM supports this natively per `litellm.max_budget`)
- Over-cap response: HTTP 429 with `X-Token-Quota-Remaining: 0` header + CuraOS error message directing to upgrade

**Tenant notifications:**
- 80% consumed → email + in-app banner to tenant admin
- 100% consumed → email + in-app block with upgrade CTA
- Monthly reset notification

**Overage billing:**
- CuraOS bills tenant for tokens above cap at per-token rate (pricing TBD in ADR-0159)
- Billing pipeline: ClickHouse `ai_usage_events` → billing-service (per ADR-0152 F-007 deferred to v1.5) → Stripe invoice line item

**Per-user soft cap:**
- Tenant admin allocates token budget per user (e.g., designer 50K/mo, developer 200K/mo)
- Budget stored in tenant config table: `user_token_budgets(tenant_id, user_id, budget_tokens, feature_scope)`
- Soft warning at threshold (configurable: default 80%)
- Admin can grant budget increases without CuraOS involvement
- Per-feature scope: `feature_scope = 'all'` (shared) or specific `feature_tag`

---

### 4.5 V3 — Per-Feature Granular Quota + Provider Routing Intelligence (deferred)

**Trigger:** When per-feature pricing differentiation is commercially justified (i.e., HealthStack symptom-checker priced separately from Builder AI fill).

**Decisions deferred to v3 ADR:**

**Per-feature quota tracks:**
- Each `feature_tag` gets independent quota track and potential price multiplier
- Enables: "Builder Suite Pro: 5M builder tokens + 500K HealthStack tokens/month"
- ClickHouse `ai_usage_events.feature_tag` column already present from v1 — no schema migration needed

**Provider routing intelligence:**
- Auto-route between BYO and CuraOS-managed based on: cost estimate, latency SLA, model capability required, tenant preference
- Routing policy stored in tenant config: `{cost_weight, latency_weight, model_preference_map}`
- LiteLLM router (existing feature) selects provider per request
- Per-request override via API header `X-CuraOS-LLM-Provider`
- Cost optimization: prefer cheaper provider for low-stakes fill; route to higher-quality model for clinical use cases

---

## 5. Tracking Infrastructure (V1 ready; V2/V3 build on same foundation)

### 5.1 Data flow

```
AI Feature (Builder / Sites / Forms / Codegen / HealthStack)
  │
  ▼
LiteLLM Gateway (ADR-0114 §D5)
  ├── success_callback → OTel Collector (ADR-0107)
  │     ├── ClickHouse ai_usage_events (ADR-0113) — analytics + dashboard
  │     └── Langfuse (ADR-0114 §D7) — prompt trace + eval (managed tenants)
  ├── audit event → Kafka `ai.usage.summary` → audit-service hash-chain (ADR-0104)
  └── PHI events → Kafka `ai.phi.audit` → immutable log (ADR-0114 Integration Map)
```

### 5.2 OTel span attributes per AI call

| Attribute | Type | Notes |
|---|---|---|
| `tenant.id` | string | Tenant UUID |
| `ai.feature_tag` | string | One of the 9 feature tags above |
| `ai.model` | string | e.g. `qwen3-72b`, `gpt-4o`, `claude-opus-4` |
| `ai.provider` | string | `vllm-managed`, `openai`, `anthropic`, `gemini`, `bedrock` |
| `ai.input_tokens` | int | Prompt token count |
| `ai.output_tokens` | int | Completion token count |
| `ai.cost_usd` | float | LiteLLM cost map estimate |
| `ai.latency_ms` | int | End-to-end gateway latency |
| `ai.phi_redacted` | bool | Whether Presidio ran in path |
| `http.status_code` | int | Provider HTTP status |

### 5.3 ClickHouse schema (v1)

```sql
CREATE TABLE ai_usage_events (
  tenant_id      UUID,
  feature_tag    LowCardinality(String),
  model          LowCardinality(String),
  provider       LowCardinality(String),
  input_tokens   UInt32,
  output_tokens  UInt32,
  cost_usd       Float32,
  latency_ms     UInt32,
  phi_redacted   Bool,
  ts             DateTime64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (tenant_id, feature_tag, ts);
```

Materialized view `ai_usage_monthly_mv` aggregates by `(tenant_id, feature_tag, toYYYYMM(ts))` for dashboard queries.

### 5.4 Kafka topics

| Topic | Producer | Consumer | Payload |
|---|---|---|---|
| `ai.usage.summary` | LiteLLM callback adapter | audit-service | `{tenant_id, feature_tag, model, input_tokens, output_tokens, ts}` |
| `ai.phi.audit` | Presidio sidecar | audit-service, compliance-service | `{tenant_id, request_id, fields_redacted[], ts}` |

Both topics exist per ADR-0114 Integration Map. This ADR formalizes schema and consumer contracts.

### 5.5 LiteLLM configuration additions (v1)

```yaml
# litellm_config.yaml additions
litellm_settings:
  success_callback: ["otel", "langfuse"]   # existing; langfuse only for managed tenants
  failure_callback: ["otel"]
  callbacks: ["curaos_audit_callback"]      # NEW: emits to ai.usage.summary Kafka topic

model_list:
  - model_name: vllm-managed
    litellm_params:
      model: openai/qwen3-72b
      api_base: http://vllm-cluster-internal:8000/v1
      api_key: none
      metadata:
        provider: vllm-managed
        cost_per_input_token: 0.0000002   # GPU amortization rate; operator-set

# BYO key routing: tenant virtual keys resolved at request time via OpenBao
# No static key in config — dynamic routing per ADR-0114 §D5 + §D13 (new)
```

---

## 6. PHI Redaction Cost Tracking

Presidio (ADR-0114 §D11) runs as a sidecar model call before any LLM invocation when `phi_required=true` (set for all HealthStack tenants, opt-in for others).

**Decision:** Presidio redaction counted as a separate `feature_tag = 'presidio.redact'` usage event. Tracked in same `ai_usage_events` table with `provider = 'presidio-internal'`.

**Cost model:**
- HIPAA tenants: Presidio cost included in HealthStack tier flat fee (absorbed by CuraOS)
- Non-HIPAA tenants using Presidio: included in managed-LLM tier (no surcharge v1)
- V3: may split Presidio into its own quota track if cost exceeds flat-tier economics

**Audit:** Every Presidio call emits to `ai.phi.audit` Kafka topic (per ADR-0114 Integration Map). audit-service hash-chains these events per ADR-0104.

---

## 7. Per-Product AI Feature Inventory

Full inventory of AI features across all foundation products. All route through LiteLLM gateway.

| Product | Feature | feature_tag | Default model (managed) | PHI scope |
|---|---|---|---|---|
| Builder | Component AI fill | `builder.fill` | Qwen3-72B | No |
| Sites | Copy / content suggest | `sites.fill` | Qwen3-72B | No |
| Apps | App AI assist | `apps.assist` | Qwen3-72B | No |
| Widgets | Widget generate | `widgets.gen` | Qwen3-7B (lighter) | No |
| Workflow Canvas | Flow AI fill | `canvas.fill` | Qwen3-72B | No |
| Forms | Form AI generate | `forms.gen` | Qwen3-72B | No |
| Codegen | Recipe AI gen | `codegen.recipe` | DeepSeek-Coder-V2 | No |
| HealthStack | Symptom-checker | `healthstack.symptom` | Phi-4-medical (LoRA) | Yes — Presidio required |
| HealthStack | Clinical note assist | `healthstack.clinical` | Phi-4-medical (LoRA) | Yes — Presidio required |
| Presidio | PHI redaction (all) | `presidio.redact` | Presidio NLP models | N/A |

Notes:
- `healthstack.*` features: Presidio always in path; `phi_redacted = true` always
- `codegen.recipe`: DeepSeek-Coder-V2 preferred for code; falls back to Qwen3-72B if unavailable
- CuraOS internal agents (AI swarm dev model per ADR-0099 §14): use `provider = 'vllm-managed'`, `tenant_id = 'curaos-internal'`; tracked in same table under reserved tenant UUID

---

## 8. CuraOS-Internal Agent Usage (ADR-0099 §14)

CuraOS development AI agents (the "AI swarm" pattern per ADR-0099 §14) use the CuraOS-managed vLLM tier. They are not BYO-key tenants.

**Decision:**
- Internal agents identified by reserved `tenant_id = '00000000-0000-0000-0000-curaos-internal'`
- Same LiteLLM routing, same OTel tracking, same ClickHouse storage
- Usage dashboard available to CuraOS operators (not exposed to external tenants)
- Internal agent usage does NOT count against any subscription tier

---

## 9. Air-Gap / On-Prem Behavior

For on-prem and air-gap deployments (ADR-0099 deployment models):
- BYO mode: key stored in tenant's local OpenBao instance; LiteLLM routes to tenant-specified endpoint (may be a local LLM)
- Managed mode: tenant deploys their own vLLM instance; LiteLLM gateway points to local vLLM; usage tracking still runs via local OTel + ClickHouse
- No external billing dependency in either mode

---

## 10. Amendments

### ADR-0114 §13 (new section) — BYO Key Flow

Add to ADR-0114 after §Decision D5 (LiteLLM):

> **§13 BYO LLM API Key Flow**
>
> When a tenant configures their own LLM provider API key (ADR-0160 §4.1):
> - Key stored at `secret/tenants/{tenant_id}/llm/api_key` in OpenBao (ADR-0108)
> - LiteLLM gateway fetches key at request time via OpenBao API (5-minute in-process cache)
> - LiteLLM creates a per-tenant virtual key in its internal router mapped to the OpenBao-resolved key
> - All AI calls for that tenant use tenant's key; provider invoice goes directly to tenant
> - CuraOS emits OTel span per call (latency + http_status + provider only; no token counts for BYO tenants)
> - Token count tracking and Langfuse tracing disabled for BYO tenants by default (opt-in available)

### ADR-0114 §14 (new section) — Tracking Infrastructure

Add to ADR-0114 after §13:

> **§14 AI Usage Tracking Infrastructure**
>
> Per ADR-0160 §5:
> - LiteLLM `success_callback`: `["otel", "langfuse", "curaos_audit_callback"]`
> - OTel spans with attributes defined in ADR-0160 §5.2 → ClickHouse `ai_usage_events`
> - Kafka topic `ai.usage.summary` → audit-service hash-chain
> - Langfuse: managed tenants only; tenant-scoped via `metadata.tenant_id`
> - Presidio redaction tracked as `feature_tag = 'presidio.redact'` in same table

### ADR-0099 §14 — AI swarm dev model

Append to ADR-0099 §14:

> CuraOS internal agents use the CuraOS-managed vLLM tier (ADR-0160 §8). Reserved `tenant_id = '00000000-0000-0000-0000-curaos-internal'`. Usage tracked in `ai_usage_events` table, visible to operators only. Does not count toward subscription quota.

### ADR-0150 §2 — LLMProvider abstraction

Append to ADR-0150 §2 concrete bindings:

> `LLMProvider` abstraction (provider interface injected by LiteLLM gateway) now has two concrete binding modes per ADR-0160: `BYOKeyProvider` (resolves key from OpenBao at runtime) and `ManagedProvider` (routes to internal vLLM cluster). Mode selected by `tenant.llm_mode` config attribute. Both modes emit OTel spans; token tracking active for managed mode only in v1.

---

## 11. Action Items

| Item | Owner | ADR trigger |
|---|---|---|
| Implement `curaos_audit_callback` LiteLLM plugin (emits to `ai.usage.summary` Kafka) | AI infra team | V1 |
| OpenBao path convention `secret/tenants/{tenant_id}/llm/api_key` + rotation event hook | Security team | V1 |
| ClickHouse `ai_usage_events` table + `ai_usage_monthly_mv` materialized view | Data team | V1 |
| CuraOS admin AI Usage dashboard (ClickHouse query + UI component) | Frontend team | V1 |
| Tenant onboarding BYO vs. managed selection UI | Product / Frontend | V1 |
| LiteLLM `litellm.model_cost` GPU amortization rate config (per model, per deployment) | Ops team | V1 |
| ADR-0159 (pricing) — flat-tier cost for managed-LLM access | Product | V1.5 |
| LiteLLM `max_budget` per-tenant enforcement + 80%/100% notification hooks | AI infra | V2 trigger |
| billing-service integration for overage invoicing (ADR-0152 F-007) | Commerce team | V2 trigger |
| Per-user token budget admin UI + enforcement | Product / Backend | V2 trigger |
| Per-feature quota tracks + provider routing intelligence | AI infra | V3 trigger |

---

## 12. Open Questions

| # | Question | Status |
|---|---|---|
| OQ-1 | Should BYO tenants optionally get token tracking via LiteLLM even though CuraOS doesn't bill? (Useful for tenant's own cost visibility) | Open — recommend opt-in flag in v1.5 |
| OQ-2 | GPU amortization rate for vLLM cost estimate: who sets it and how often? (Ops config vs. automated pricing model) | Open |
| OQ-3 | Mixed-mode (some features BYO, others managed) — is this needed before v2? | Deferred to v2 scope decision |
| OQ-4 | ADR-0159 pricing: what flat-tier price covers managed-LLM cost at expected usage profiles? | Blocked on usage data from pilot |
| OQ-5 | Langfuse opt-in for BYO tenants: does tenant store their own Langfuse instance, or use CuraOS-hosted with their data isolated? | Open |
| OQ-6 | On-prem managed mode: does tenant manage their own vLLM, or does CuraOS ship a vLLM Helm chart as part of the CuraOS self-hosted bundle? | Recommend: CuraOS Helm chart includes vLLM; confirm with ops team |

---

## 13. References

| ADR | Relevance |
|---|---|
| ADR-0099 §14 | AI swarm dev model — internal agent usage |
| ADR-0104 | Hash-chained audit log — usage event tamper evidence |
| ADR-0107 | OTel collector pipeline — usage span routing |
| ADR-0108 | OpenBao — BYO API key storage |
| ADR-0113 | ClickHouse — ai_usage_events table |
| ADR-0114 §D5, §D7, §D11 | LiteLLM gateway, Langfuse, Presidio — the tracking substrate |
| ADR-0115 | HealthStack overlay — PHI-scoped AI features |
| ADR-0121 §8 | Builder AI fill — original quota mention (superseded by this ADR) |
| ADR-0121a §6 | Sites AI fill |
| ADR-0121b | Apps AI assist |
| ADR-0121c | Widgets AI gen |
| ADR-0121d §2 | Workflow Canvas AI fill |
| ADR-0121e | Forms AI gen |
| ADR-0123 | Codegen recipe AI gen |
| ADR-0150 §2 | LLMProvider abstraction — BYO + managed binding |
| ADR-0151 F-010 | Finding this ADR resolves |
| ADR-0152 F-007 | billing-service deferral — v2 billing pipeline dependency |
| ADR-0159 | Pricing tiers — flat-tier cost for managed-LLM (to be created) |
