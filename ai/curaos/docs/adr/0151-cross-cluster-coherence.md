# ADR-0151 — Wave 2 Cross-Cluster Coherence Scan

**Status:** Informational (audit complete; all findings resolved by ADR-0152 through ADR-0162 — see [RESOLUTION-MAP.md §ADR-0151](RESOLUTION-MAP.md))
**Date:** 2026-05-24
**Scope:** ADRs 0099, 0100, 0102, 0104, 0114, 0115, 0120–0123, 0150 (skip archived 0096/0097/0098)
**Audit method:** Coherence persona (internal consistency across sections)

---

## Executive summary

| Metric | Count |
|---|---|
| **Total findings** | 19 |
| **Critical** | 2 |
| **Major** | 8 |
| **Minor** | 7 |
| **Info** | 2 |

### Severity distribution

- **Critical (architecture broken, must fix before code):** 2
  - F-001: Tenant routing ambiguity (NestJS vs Keycloak multi-tenancy model)
  - F-004: HAPI FHIR JVM sidecar PHI audit pathway gap

- **Major (significant integration gap, fix in Wave 1):** 8
  - F-002: Auth token flow → Builder/Workflow missing explicit interchange spec
  - F-003: Codegen recipes incomplete for foundation products
  - F-005: Provider abstraction naming inconsistency across ADRs
  - F-006: Air-gap bundle SLA unspecified
  - F-008: Pricing tier overlap (Builder suite 4 products vs monolithic bundles)
  - F-010: MCP server coverage per foundation product not defined
  - F-012: Tenant-built Apps (0121b) clinical-grade SLA enforcement gap
  - F-016: Consent workflow ↔ Auth federation unresolved

- **Minor (polish/clarity):** 7
  - F-007, F-009, F-011, F-013, F-014, F-015, F-017

- **Info (awareness):** 2
  - F-018, F-019

---

## Methodology

Read all non-archived ADRs (0099, 0100, 0102, 0104, 0114, 0115, 0120–0123, 0150) in full. Cross-audit against 8 dimensions:

1. Cross-product integration seams
2. End-to-end clinical pathway trace
3. Provider abstraction consistency
4. Codegen recipe coverage
5. Pricing/packaging coherence
6. Air-gap bundle composition
7. AI-agent dev model viability
8. Patient-centric SLA enforcement

For each finding: identify affected ADRs, describe inconsistency, cite evidence, assess impact.

---

## Findings by dimension

### Dimension 1: Cross-product integration seams

---

#### Finding F-001: Tenant routing ambiguity — NestJS per-tenant schema isolation vs Keycloak/Better Auth multi-tenancy model

**Severity:** **CRITICAL**

**Affected ADRs:**
- ADR-0120 (Auth) §4: "Per-tenant DB schema (aligned with ADR-0101 PG schema-per-tenant)"
- ADR-0121 (Builder) §7: "Per-tenant project storage in Payload CMS + per-tenant PG schema"
- ADR-0122 (Workflow) §5: "SaaS: Task-queue-per-tenant in shared Temporal namespace"
- ADR-0150 §3: Adds library swaps, does NOT explicitly resolve tenant routing architecture

**Description:**

ADR-0120 commits to NestJS + Better Auth (pure TS) with **per-tenant DB schema** (not realm-per-tenant). ADR-0101 (already committed) specifies **schema-per-tenant isolation in PostgreSQL**. These match.

However, ADR-0122 describes Temporal multi-tenancy as **three patterns** (task-queue-per-tenant / namespace-per-tenant / cluster-per-tenant), but does NOT explicitly wire how:
- NestJS HealthStack service (tenant interceptor) extracts tenant ID from Auth token
- Tenant ID routes to correct Temporal task queue
- Token refresh/revocation cascades to active Temporal workflow runs

The foundation products (Auth, Builder, Workflow Manager) all need a **shared tenant-routing interceptor** that:
1. Extracts tenant ID from JWT
2. Validates tenant access to resource
3. Routes Kafka/NATS event to correct tenant key-partition
4. Passes tenant context to downstream service calls

**ADR-0120 references `Better Auth` but does NOT specify the Temporal cron lease key or Activepieces metadata structure for tenant scoping.**

**Impact:**
- High. Without explicit tenant-routing spec, implementation teams will diverge. Temporal workflows may leak cross-tenant task queues. Auth token introspection calls may target wrong tenant.

**Recommended fix:**
- ADR-0152 (new): "Tenant routing interceptor + context propagation spec" — defines shared NestJS module that all foundation products consume. Spec includes:
  - JWT claim for tenant ID + verification
  - Tenant-scoped claims in token (roles, SMART scopes, data access boundaries)
  - Temporal task-queue naming convention (`t-{tenant_id}-{service}`)
  - Kafka partition key strategy (tenant ID as first key field)
  - NATS account/subject namespace (account ID = tenant ID)

---

#### Finding F-002: Auth token flow → Builder/Workflow missing explicit interchange spec

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0120 (Auth) §6 checklist: "REST + GraphQL + tRPC + webhooks" API surface
- ADR-0121 (Builder) §2: "NestJS backend" per ADR-0100; references Auth for "tenant SSO"
- ADR-0122 (Workflow) §4: "NestJS shell handles routing: tenant ID → namespace + task queue"

**Description:**

ADR-0120 specifies Auth exposes **REST + GraphQL + tRPC + webhooks**. Builder (ADR-0121) says "auth per ADR-0120" but does NOT specify:
- Does Builder call Auth REST or GraphQL? Which endpoint?
- Does Builder UI embed Auth login component (Lit Web Component per ADR-0106) or redirect to Auth-hosted login?
- What is the token exchange flow when Builder calls Workflow Manager?
- Are Bearer tokens stored in Valkey session store or only Cookies?

Similarly, Workflow Manager (ADR-0122) references "Auth (ADR-0120)" but does NOT specify how a Temporal workflow verifies it can access a patient record (FHIR Patient/:id) — does it call Auth introspection? Does it use the tenant ID from the workflow context?

**Evidence:**
- ADR-0120 §6: "API surface: REST + GraphQL + tRPC + webhooks ... OpenAPI 3.1 spec auto-generated"
- ADR-0121 §5: "Auth — per ADR-0120" (no further detail on which endpoint, which flow)
- ADR-0122 §3: "Persistence + events: ... Auth (ADR-0120)" (no explicit dependency on Auth introspection)

**Impact:**
- Medium-High. Implementation will guess. Likely outcomes: (1) Builder always redirects to Auth (fragmented UX), (2) Builder calls Auth REST but Workflow calls graphQL (API contract drift), (3) Workflows can't verify PHI access because Auth introspection isn't wired.

**Recommended fix:**
- In ADR-0152 (tenant routing spec): define standard Auth invocation patterns:
  - Builder UI embeds `CuraOS Auth` login component (ADR-0120) as Lit Web Component over iframe
  - Backend-to-backend calls (Builder service → Workflow service) use Auth REST `/introspect` to verify token
  - Temporal activity that accesses PHI calls Auth `/introspect` before proceeding (audit logged)
  - Valkey session store keyed by Auth session ID; cache invalidated on Auth revocation event

---

#### Finding F-003: Codegen recipes incomplete for foundation products

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0123 (Codegen) §4: Lists Phase 1 recipes (16 total)
- ADR-0120 (Auth): No recipe mentioned; how is CuraOS Auth v1 generated?
- ADR-0121 (Builder): Mentions "Codegen integration (emit Temporal TS)" but no recipe for Builder-as-a-generated-service

**Description:**

ADR-0123 lists 16 Phase 1 recipes:
```
backend.nestjs, ui.react-next, data.drizzle, data.mikroorm-clinical, data.kysely-analytics, api.openapi, api.asyncapi,
events.nestjs-kafka, events.nestjs-nats, tests.vitest, tests.playwright,
interceptor.nestjs, plugin.wasm-component, plugin.nestjs-sidecar,
workflow.temporal-ts, workflow.activepieces-flow, cookbook.recipe
```

But ADR-0120 (Auth) says it's a "pure NestJS product" composed of Better Auth + SimpleWebAuthn + node-saml + Passport + SCIM + SMART-on-FHIR modules. How is the initial scaffolding generated? Is it:
- Templated from `backend.nestjs` recipe (but Auth has no HTTP endpoints, only gRPC/REST)?
- Hand-written, then fed into Codegen to generate client SDKs?
- A special recipe `foundation.auth` not listed?

Similarly, ADR-0121 (Builder) embeds GrapesJS + Payload CMS. Does `backend.nestjs` recipe scaffold a Payload CMS + Yjs/Hocuspocus NestJS module? Or is Builder hand-written, then Codegen generates client SDKs from its OpenAPI spec?

**Evidence:**
- ADR-0123 §10 build sequence M3: "First 5 Phase 1 recipes" — lists 5, not 16
- ADR-0120 §9: "Build sequence M1–M15" — no mention of Codegen recipe used
- ADR-0121 §13 build sequence M1: "Shared core: NestJS shell + Payload CMS" — no Codegen recipe referenced

**Impact:**
- Medium. Unclear whether foundation products are the "users" of Codegen or the "exemplars" that Codegen recipes are based on. If users, then Auth/Builder/Workflow/Codegen are hand-written + post-hoc generated (expensive). If exemplars, then recipes are derived from them (can't generate until they're built).

**Recommended fix:**
- ADR-0124 (new): "Codegen Phase 1 recipes detailed design" — for each recipe, specify:
  - Input spec (OpenAPI, AsyncAPI, Drizzle schema, TypeSpec model, etc.)
  - Output template files
  - Post-gen action hooks
  - Self-tests (golden-output snapshot)
  - Which foundation product(s) it targets
  - Example invocation + output
- Clarify whether foundation products bootstrap from recipes or recipes are derived from foundation products.

---

#### Finding F-004: HAPI FHIR JVM sidecar PHI audit pathway gap

**Severity:** **CRITICAL**

**Affected ADRs:**
- ADR-0115 (HealthStack) §4.1.2: "HAPI FHIR JPA on PostgreSQL 17"
- ADR-0150 §3: "HAPI FHIR (JVM) stays as NestJS sidecar for HealthStack"
- ADR-0104 (legacy) §Sub-decision 4: "Audit log (Tamper-Evident)" — specifies hash-chained PG audit
- ADR-0120 (Auth) §6 checklist: "Audit: Hash-chained PG audit — every auth event"

**Description:**

ADR-0115 commits HAPI FHIR 8.x as JVM sidecar. It specifies FHIR Subscription → Kafka rest-hook pattern (§4.2.2) and CDS Hooks cqf-ruler plugin (§4.2.2). However:

1. **PHI write audit gap:** When HealthStack service calls HAPI FHIR to write a Patient/:id or Observation, HAPI FHIR writes directly to its own PostgreSQL schema (~130 tables per ADR-0115 §4.2.1). The audit event is:
   - Option A: NestJS HealthStack service emits audit event to Kafka → audit-service writes hash-chained entry
   - Option B: HAPI FHIR publishes audit event to Kafka via its native audit sink (not specified in ADR-0115)
   - Option C: Both (distributed audit with reconciliation overhead)

   **ADR-0115 does NOT specify which.** ADR-0104 specifies hash-chained audit, but only for auth-service. Does HAPI FHIR audit integrate into the same chain, or separate?

2. **HAPI FHIR JPA tables exempt from audit interceptor:** NestJS Interceptors (per ADR-0123 §5.3) wrap every NestJS service call. But HAPI FHIR runs in a separate JVM process. How do `@curaos/event-interceptors` hooks on HAPI writes?
   - Answer: They don't. HAPI FHIR audit is HAPI-native (ConsentInterceptor, etc.), not NestJS Interceptor wired.
   - This means HIPAA §164.312(b) audit trail is **split into two systems**: NestJS hash-chained Kafka audit + HAPI FHIR native audit. Reconciliation on access review is complex.

3. **Per-tenant PHI partition enforcement:** ADR-0115 does NOT specify how HAPI FHIR's per-tenant isolation is enforced. Does HAPI FHIR:
   - Run one per-tenant instance (Kubernetes pod per tenant)? (Ops overhead at SaaS scale with 1000+ tenants)
   - Run one shared HAPI instance with per-tenant schema + Row-Level Security? (HAPI JPA doesn't natively support schema-per-tenant; adds bespoke work)
   - Run one shared HAPI instance per-organization, not per-tenant? (Violates ADR-0099 multi-tenant requirement)

**Evidence:**
- ADR-0115 §4.2.2: "HAPI FHIR JPA on PostgreSQL 17. Use Atlas (ADR-0110) for all schema migrations." (No mention of per-tenant isolation strategy)
- ADR-0104 §Sub-decision 4: "Hash-chained PostgreSQL table ... per-tenant chain head" (Assumes single audit table for all tenants, but HAPI FHIR schema is separate)
- ADR-0123 §5.3: "NestJS Interceptors + event-bus interceptor abstraction wrapping Kafka/NATS consumers" (Does NOT include HAPI FHIR call interception)

**Impact:**
- Critical. HIPAA audit trail is incomplete. At compliance audit, can't produce a single ordered audit log of PHI access (some events in NestJS Kafka audit, some in HAPI FHIR native audit). PHI partition enforcement is unspecified — SaaS could accidentally serve Patient/1 from Tenant A to Tenant B if HAPI instance scoping is wrong.

**Recommended fix:**
- ADR-0125 (new): "HAPI FHIR multi-tenant integration spec" — resolve:
  1. **Audit integration:** HAPI FHIR ConsentInterceptor + any HL7 v2 MLLP access publishes to Kafka `healthstack.audit.fhir` topic with signature matching auth-service audit event schema. Central audit-service consumer merges into hash-chained ledger.
  2. **Per-tenant scoping:** HAPI FHIR runs **one pod per tenant** (K8s Capsule namespace per tenant per ADR-0109). No shared instance. Ops overhead addressed via Helm chart templating + infrastructure-as-code.
  3. **HAPI consentInterceptor configuration:** Specify how CuraOS Consent service (loaded from HealthStack overlay) feeds into HAPI ConsentInterceptor to veto/allow reads per patient consent. 

---

### Dimension 2: End-to-end clinical pathway trace

---

#### Finding F-005: Provider abstraction naming inconsistency across ADRs

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0150 §2: "provider abstraction interface" (e.g., `LLMProvider`, `StorageProvider`, `EmailProvider`)
- ADR-0120 (Auth) — no mention of provider pattern; Better Auth + SAML/Passport are hard-wired, no swappable interface
- ADR-0121 (Builder) §3: "GrapesJS canvas dependencies imported as libraries (not commercial SDKs)"
- ADR-0115 (HealthStack) §3: "Local + 3rd-party rule" — mentions "local default | 3rd-party option" but NO provider interface declared
- ADR-0150 §3 table: Lists "local default | 3rd-party option" for every concern but does NOT specify interface class name

**Description:**

ADR-0150 introduces the **local + 3rd-party rule**: every integratable area must offer both a local/self-hosted default + a 3rd-party/external option. ADR-0150 §2 says this is enforced via "provider abstraction interface" with `CuraOSLocalProvider` and `External3rdPartyProvider` implementations.

However:
1. **No interface naming convention:** ADR-0150 gives examples (`LLMProvider`, `StorageProvider`, `EmailProvider`) but does NOT specify:
   - Is it `{X}Provider` or `{X}Service` or `{X}Adapter`?
   - Where does the interface live? (`@curaos/providers` npm package?)
   - How is it discovered at runtime? (dependency injection, registry, environment flag?)

2. **Auth violates the rule unintentionally:** ADR-0120 says "Better Auth integration + SAML + Passport" but does NOT offer a swappable provider interface for "use Keycloak IdP instead". Per ADR-0150 §3, Keycloak is "deferred to v2/v3 as optional plugin". But there's no provider interface that would make this swap plug-and-play.

3. **Builder doesn't declare provider interfaces:** ADR-0121 lists four products (Sites, Apps, Widgets, Workflow Canvas) and mentions "GrapesJS OSS" + "Payload CMS". But does Builder expose provider interfaces for:
   - `CanavsProvider` (swap GrapesJS for another canvas)?
   - `CmsProvider` (swap Payload for another CMS)?
   - These aren't mentioned in ADR-0121.

4. **Naming collision risk:** If one service uses `StorageProvider` (per ADR-0150) and another uses `ObjectStoreProvider` (different name, same concept), they can't be composed without wrapper adapters.

**Evidence:**
- ADR-0150 §2: "provider abstraction interface (e.g., `LLMProvider`, `StorageProvider`, `EmailProvider`)" — examples only; no spec
- ADR-0120 §6 checklist: No provider interface listed; Auth is monolithic composition
- ADR-0121 §2 decision summary: Canvas = GrapesJS, CMS = Payload. No provider pattern.
- ADR-0150 §2 table row for 0103 (API): "Tenant-owned API gateway (Cloudflare / AWS API Gateway) for edge routing" — there's no local default, only 3rd-party option. Does provider pattern apply here, or is it out-of-scope?

**Impact:**
- Medium-High. Without a named, discoverable provider interface convention, tenants can't reliably swap components. Custom integration code and wrappers proliferate. The "modulith + microservice topology" (per ADR-0150 §7) becomes harder because provider swapping isn't enforced at compile-time.

**Recommended fix:**
- ADR-0126 (new): "Provider interface specification" — define:
  1. **Interface naming convention:** All provider interfaces inherit from base `@curaos/providers: CuraOSProvider<T>` with `type: 'local' | 'external' | 'custom'`.
  2. **Interface location:** Each service defines interfaces in `lib/{service-name}-providers/` package, published to npm.
  3. **Discovery mechanism:** ServiceRegistry at runtime (via NestJS DI or Dapr component config per ADR-0123 Dapr sidecar).
  4. **Per-ADR enforcement:** For each ADR's integratable areas, list required provider interfaces + default implementations.
  5. **Examples:** `@curaos/auth-providers: AuthProvider`, `@curaos/storage-providers: StorageProvider`, etc.

---

#### Finding F-006: Air-gap bundle SLA unspecified

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0099 §9: "Air-gap support — Mandatory for home lab + regulated deployment profiles"
- ADR-0109 (Containers): No explicit OCI bundle air-gap strategy (K3s/Talos/Cilium/ArgoCD/Harbor listed but no bundle consolidation)
- ADR-0110 (CI/CD): No artifact caching strategy for air-gap; mentions GHA self-hosted runners but not offline mirror
- ADR-0121 (Builder) §10: "Air-gap considerations — static SSG bundle, served from CuraOS distro (no external CDN); component marketplace mirror = local registry pre-loaded in air-gap bundle"
- ADR-0122 (Workflow) §9 checklist: "Air-gap: Temporal self-hosted air-gap install + Activepieces local piece registry + Jobrunr embedded"
- ADR-0115 (HealthStack): "Terminology snapshots bundleable offline. Imaging server must run with local storage."

**Description:**

Multiple ADRs reference air-gap support, but NO ADR specifies:
1. **What goes in the air-gap bundle?** All foundation products (Auth, Builder, Workflow, Codegen) + all required sidecars (Temporal, HAPI FHIR, Snowstorm, dcm4chee, AppSmith, Activepieces) + all infrastructure (K3s, Talos, Cilium, Harbor, OpenBao, Grafana, Prometheus, Loki, Tempo, VictoriaMetrics, ClickHouse, Pathling, Verdaccio npm mirror, PostgreSQL, Valkey)?

2. **Size estimate?** 
   - K3s base: ~1.5 GB
   - Node.js runtime: ~150 MB per app, × 4 foundation products = 600 MB
   - Temporal: ~200 MB
   - HAPI FHIR: ~500 MB
   - dcm4chee: ~2 GB
   - Snowstorm (Elasticsearch): ~1.5 GB
   - Harbor: ~800 MB
   - Prometheus + Grafana + Loki + Tempo + VictoriaMetrics: ~2 GB combined
   - ClickHouse: ~500 MB
   - npm registry mirror (Verdaccio) with preloaded deps: ~5+ GB
   - PostgreSQL + Valkey + SeaweedFS: ~500 MB binaries (data is runtime-dependent)
   - **Rough total: 15–20 GB OCI image**, plus runtime data (PG/SeaweedFS grow with use)

   No ADR specifies this trade-off: 20 GB airgap bundle is acceptable, or is it too large?

3. **Update strategy for air-gap?**
   - Can tenants apply security patches after install (e.g., Temporal v1.0.1 → v1.0.2 CVE fix) without re-downloading entire 20 GB bundle?
   - Is there a delta-update mechanism, or is re-deployment the only path?

4. **Redundancy for air-gap HA?**
   - ADR-0099 §4 says each service is sellable standalone. Can a hospital buy just "CuraOS Auth" in air-gap mode? That's 4–5 GB (Auth + K3s + PostgreSQL + Valkey + Prometheus). Or is air-gap only viable as a full stack?

**Evidence:**
- ADR-0099 §9: "Air-gap support — Mandatory" (no size SLA, no component list)
- ADR-0121 §10: "Air-gap considerations — static SSG bundle, served from CuraOS distro" (no size)
- ADR-0122 §9: "Air-gap: Temporal self-hosted air-gap install + Activepieces local piece registry" (no estimate of total bundle size)
- ADR-0115 (HealthStack): "Terminology snapshots bundleable offline" (SNOMED CT RF2 release is ~5 GB alone; not mentioned in ADRs 0109/0110/0111)

**Impact:**
- Medium. Air-gap deployments are high-value for regulated (HIPAA) and disconnected (defense, maritime) customers, but bundle size/update strategy unclear. Teams will over-provision storage (burn cost at scale) or discover post-build that bundle doesn't fit customer's offline media (DVD / sneakernet sized).

**Recommended fix:**
- ADR-0127 (new): "Air-gap bundle composition + sizing spec" — define:
  1. **Foundation tier (Auth-only):** ~5 GB (K3s + Auth + PG + Valkey + observability stubs)
  2. **Builder tier (+Builder):** ~12 GB
  3. **Full HealthStack tier (+HAPI FHIR + Snowstorm + dcm4chee + DICOM imaging):** ~25 GB
  4. **Tiered bundles** (not monolithic) to support per-tenant startup costs
  5. **Delta-update strategy:** Helm Chart + kustomize for in-place upgrade (new image + config; data persists)
  6. **Offline registry:** Verdaccio + Harbor images preloaded; new packages behind "contact support" wall

---

#### Finding F-007: Payment processor scope unresolved (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0121a (Sites) §4.6: "Payment integration ADR (deferred — separate ADR-XXXX needed)"
- ADR-0121b (Apps) §6 table: "Revenue share: per-app monetization ... CuraOS platform takes commission"

**Description:**

ADR-0121a (Sites) and ADR-0121b (Apps) both reference payment-gated content + marketplace monetization, but explicitly defer the decision. ADR-0121a §6 says:
```
| Payment processor | (none default — payment is regulated, no local OSS replaces Stripe) | Stripe / Adyen / Square / Lemon Squeezy (BYO) |
```

But this defers to v1 or v2? Is payment-gated content out of scope for v1 GA?

**Evidence:**
- ADR-0121a §4.6: "Payment-gated content + subscription billing — Payment integration ADR (deferred, separate ADR-XXXX needed)"
- ADR-0121a §8 build sequence M12: "Payment-gated + subscription billing (Stripe + webhook → Auth)" — suggests v1, but "deferred" contradicts.

**Impact:**
- Low. Just needs clarification. If payment-gating is v1 scope, needs decision on provider (Stripe-only or multi-provider). If v2, ADR-0121a §8 M12 should move to post-v1 list.

---

#### Finding F-008: Pricing tier overlap — Builder Suite 4 products vs monolithic bundles

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0121 (Builder) §6: "4-product sellable economics" — Sites, Apps, Widgets, Workflow Canvas each have independent tier examples
- ADR-0121a (Sites) §5: "Sites Free | Starter | Pro | Enterprise"
- ADR-0121b (Apps) — no pricing mentioned in detail
- ADR-0122 (Workflow) — no standalone pricing mentioned
- ADR-0099 §4: "Each service is its own product — Independent SaaS, on-prem, hybrid, air-gap"

**Description:**

ADR-0121 says "ship as four separately sellable products" with independent pricing. ADR-0121a then details Sites pricing:
- Free (1 site, marketing-only)
- Starter (3 sites, marketing + docs)
- Pro (unlimited sites, all dynamic features)
- Enterprise

But there's **cross-product discount conflict:**
- Can a customer buy "Sites Free + Apps Free + Workflow Free"? If all are zero cost, CuraOS makes zero revenue.
- Or is "Sites Free" only free when bundled with paid "Builder Suite" subscription?
- If bought standalone, is "Auth Free" a tier? Or must you buy Auth + Sites + Apps as a bundle?

The problem: ADR-0121 says "four separately sellable" but ADR-0121 §6 also says "package discount" for "umbrella CuraOS Builder Suite." What's the actual pricing matrix?

Example confusion:
- Scenario A: Customer buys "CuraOS Sites Pro ($99/mo) + CuraOS Apps Pro ($199/mo) + Workflow Manager Pro ($149/mo)" = $447/mo. Bundle discount applies: 20% off = $358/mo.
- Scenario B: Same customer buys "CuraOS Builder Suite Enterprise" which includes all four products. Price is $X/mo. Is $X < $358 (incentivizing suite) or $X ≥ $358 (suite is just convenience, no discount)?

**Evidence:**
- ADR-0121 §6: "Each product: Independent install path, Independent docs site, Independent SDK, Independent free + paid tiers, All four compose into umbrella 'CuraOS Builder Suite' with package discount"
- ADR-0121a §5: "Tiers: Free | Starter | Pro | Enterprise" (no mention of bundle pricing)
- ADR-0121b (Apps): No tier pricing specified at all

**Impact:**
- Medium-High. Sales operations can't quote. Tax/billing systems don't know whether to invoice as 4 line items or 1. Churn risk if customer feels cheated (bought 4 separate tiers, then discovers suite is cheaper).

**Recommended fix:**
- ADR-0128 (new): "Builder Suite pricing matrix" — specify:
  1. **Standalone tier prices** for each product (Sites, Apps, Widgets, Workflow Canvas)
  2. **Bundle tier prices** (suite-only offerings with bundle names: "Teams", "Enterprise", "Custom")
  3. **Bundle discount structure** (e.g., "Suite = 20% off sum of standalone tiers, capped at X")
  4. **Free tier scope** (all four products have a "Free" tier? Or just one entry-point product?)
  5. **Cross-product usage rights** — if customer buys "Sites Pro", can they embed Widgets for free? Or is that a separate line item?

---

### Dimension 3: Provider abstraction consistency

*(See Finding F-005 above.)*

---

### Dimension 4: Codegen recipe coverage

*(See Finding F-003 above.)*

---

### Dimension 5: Pricing/packaging conflicts

*(See Finding F-008 above.)*

---

### Dimension 6: Air-gap bundle composition

*(See Finding F-006 above.)*

---

### Dimension 7: AI-agent dev model viability

---

#### Finding F-009: MCP server coverage per foundation product not defined (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0099 §14: "MCP server pattern: CuraOS services expose tool surfaces via MCP so external agents can drive them"
- ADR-0114 (AI/Agent): No mention of MCP servers exposed by foundation products
- ADR-0123 (Codegen) §8: "MCP server exposing query + generate operations" — Codegen only

**Description:**

ADR-0123 specifies that Codegen exposes an MCP server for external agents to query/generate. But what about Auth, Builder, Workflow Manager?

- **Auth**: Does it expose MCP tools for "list tenants," "create user," "revoke session"? If agents manage Auth state, these are necessary.
- **Builder**: Does it expose "list projects," "deploy site," "inspect canvas"? Or only REST API?
- **Workflow Manager**: Does it expose "create workflow," "trigger run," "inspect execution"? Or only REST API?

ADR-0099 §14 says "CuraOS-internal agents also consume external MCP servers per tenant config" and "services expose tool surfaces via MCP." But which services, which tools? Unspecified.

**Evidence:**
- ADR-0123 §8: "CuraOS Codegen exposes an MCP server" (Codegen only)
- ADR-0099 §14: "MCP server pattern: ... every service auto-exposes MCP tools, or curated subset?" (Open question; not decided)

**Impact:**
- Low. Doesn't block Wave 1 foundation build; can be added post-v1. But if AI-agent swarm is supposed to drive 200+ services, MCP surfaces need to be designed in, not bolted on.

---

#### Finding F-010: AI-assisted authoring tokenization cost and quota tracking unspecified (Major)

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0121 (Builder) §8: "AI-assisted authoring ... Vercel AI SDK 6 (MIT) inside Builder UI → LiteLLM gateway → tenant's chosen LLM"
- ADR-0121a (Sites) §6: "AI fill / suggest (Vercel AI SDK 6 → LiteLLM)"
- ADR-0121b (Apps) — mentions Vercel AI SDK 6 but no quota
- ADR-0121d (Canvas) §2: "AI fill / suggest via Vercel AI SDK 6"
- ADR-0114 (AI/Agent) §D1: "vLLM as primary; SGLang as secondary"

**Description:**

All Builder products (Sites, Apps, Widgets, Canvas) + Codegen expose AI fill/suggest features. But:

1. **Who pays for LLM tokens?**
   - If tenant uses vLLM self-hosted (default per ADR-0114), no cost.
   - If tenant uses OpenAI/Anthropic via LiteLLM gateway (BYO per ADR-0150 §2), tenant pays OpenAI directly (via their API key).
   - Does CuraOS take a commission on token cost? No mention.

2. **Quota enforcement:**
   - ADR-0121 §7: "Per-tenant AI fill credit quota — tracked via Auth quota + LiteLLM"
   - But HOW is it tracked? Per-user per-month? Per-tenant per-month? Is it hard-capped (reject requests over quota) or soft (log overage and bill)?
   - Where is the quota stored? Auth service or separate quota-service?

3. **Cross-product quota sharing:**
   - If customer has "Builder Suite Pro" with "1000 AI fill credits per month", can they use all 1000 in Sites, or do they split across Sites + Apps + Canvas?
   - Or does each product have separate quota?

**Evidence:**
- ADR-0121 §7: "Per-tenant AI fill credit quota — tracked via Auth quota + LiteLLM" (mentions tracking, doesn't define enforcement)
- ADR-0121 §8: "Vercel AI SDK 6 (MIT) inside Builder UI → LiteLLM gateway" (routes to LLM but no billing logic)
- ADR-0114 (AI/Agent): No mention of quota enforcement

**Impact:**
- Medium-High. Without quota tracking, SaaS can't bill accurately. Tenants can't predict AI feature cost (if using OpenAI). Self-hosted tenants don't understand vLLM GPU cost (they see "free AI" but actually have to provision H100 nodes).

**Recommended fix:**
- ADR-0129 (new): "AI features quota + billing spec" — define:
  1. **Per-product quota:** Builder Suite Pro = 5000 AI fill tokens/month shared across all four products (or separate per product).
  2. **Enforcement:** Hard cap on requests (reject over-quota) OR soft cap (warn + track overages for invoice).
  3. **Storage:** Auth service stores tenant quota + consumed; LiteLLM gateway calls Auth before invoking LLM.
  4. **Cost model:** Self-hosted vLLM = 0 token cost (tenant pays GPU infra). Managed LLM (OpenAI/Anthropic) = tenant's direct API cost (CuraOS doesn't intermediary).
  5. **Monitoring:** Dashboards for tenant quota usage; alerts when approaching limit.

---

#### Finding F-011: MCP payload consistency across services (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0123 (Codegen) §8: "MCP server exposing query + generate operations"
- ADR-0121d (Canvas) §6.2: "MCP server (per ADR-0114 + ADR-0123) exposes canvas state + edit operations"

**Description:**

ADR-0123 and ADR-0121d both expose MCP servers, but don't specify the request/response envelope. Are they:
- OpenAI MCP spec (JSON-RPC 2.0 over stdio/HTTP)?
- Anthropic MCP spec (same, de facto standard)?
- Something else?

If different services use different MCP flavors, multi-service agents can't chain calls (e.g., Codegen generate recipe → Builder Canvas invoke).

**Evidence:**
- ADR-0123 §8: "MCP server for AI-agent integration" (no spec reference)
- ADR-0121d §6.2: "MCP server (per ADR-0114 + ADR-0123)" (assumes consistency but doesn't enforce)

**Impact:**
- Low. MCP is de facto standard (JSON-RPC 2.0 via Claude ecosystem). Likely all implementations will converge there anyway. But worth explicit spec.

---

#### Finding F-012: Tenant-built Apps (0121b) clinical-grade SLA enforcement gap

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0099 §15: "Hospital management = supporting tier. Builds **around** clinical core. Fully integrated but **never compromises clinical quality**."
- ADR-0121b (Apps) §1: "Internal tools + customer-facing apps + multi-tenant app templates marketplace. Retool / AppSmith Cloud / Bubble.io / Glide class"
- ADR-0121b §3 architecture: "Tenant builds app via canvas + data binding + workflows"
- ADR-0115 (HealthStack): No mention of how AppSmith/Retool-class apps interact with clinical data

**Description:**

ADR-0121b (Apps) allows tenants to build arbitrary internal tools + customer-facing apps via AppSmith / CuraOS-native runtime. Tenants can bind these apps to any data source:
- CuraOS PG (any table, including FHIR Patient/Encounter/Observation)
- FHIR R4 endpoints
- External REST APIs
- Kafka/NATS event streams (per ADR-0121b §4 data source matrix)

However:

1. **Clinical SLA violation risk:** A hospital admin, building a "Patient Intake Dashboard" app, could:
   - Accidentally expose PHI (Patient MRN, SSN) in an unencrypted export to CSV
   - Bypass consent checks (query Patient records without FHIR authorization)
   - Create a bottleneck: all admit clerks query the same app, which crashes, halting patient intake

2. **Access control enforcement:** ADR-0121b §3 says "Auth-gated app access per ADR-0120 (OIDC + Cerbos policies)" but does NOT specify:
   - Are patient-level access controls enforced when app accesses FHIR? (Does app verify patient X is in app's allowed list before returning data?)
   - Or does the app builder have to manually add role-checks? (Likely, and likely to be buggy)
   - Can a hospital admin modify a clinician's app to add a debug button that exports all patients? (Yes, if they have edit access.)

3. **HealthStack patient-centric guarantee:** ADR-0099 §15 says "Patient = priority #1, healthcare workers = #2, hospital management = supporting tier that never degrades clinical UX/perf." But if hospital admin publishes a poorly-written app that slows down FHIR queries, clinical UX IS degraded.

**Evidence:**
- ADR-0121b §1: "Internal tools + customer-facing apps ... Retool / AppSmith ... — plus marketplace economy" (Retool is known for customer-built security issues because it's so low-code)
- ADR-0121b §4: Data source matrix lists FHIR connectors but no mention of patient-level isolation or consent checks
- ADR-0099 §15: "Hospital management = supporting tier ... never compromises clinical quality" (contradiction with 0121b allowing admins to build arbitrary apps accessing FHIR)

**Impact:**
- High. A hospital's app marketplace could ship dozens of poorly-built clinical apps, each one a HIPAA risk (accidental PHI export) or SLA risk (slow query, blocks clinician workflows). CuraOS ships the capability but doesn't enforce clinical guardrails.

**Recommended fix:**
- ADR-0130 (new): "Clinical-grade app safety gates" — for HealthStack tenant apps:
  1. **Data access policy enforcement:** Apps calling FHIR endpoints must pass OPA/Cerbos policy checks (not optional; enforced in gateway).
  2. **Audit on data access:** Every FHIR read via app-driven query logged to PHI audit trail (per ADR-0104).
  3. **Consent check mandatory:** Apps accessing Patient resource must verify patient has consented to the clinician/team. Consent check is gated in APISIX before FHIR endpoint (can't be bypassed by app code).
  4. **Performance SLA tier:** Apps flagged as "clinical-grade" get strict resource quotas (CPU, memory, concurrent connections); non-compliant apps are rate-limited.
  5. **Marketplace certification:** Apps using FHIR data must pass security audit + accessibility audit before publish (auto-flagged for manual review).

---

### Dimension 8: Patient-centric guarantee enforcement

*(See Finding F-012 above.)*

---

#### Finding F-013: Patient consent workflow → Auth federation unresolved (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0120 (Auth) §4.1: "Cross-tenant federation (opt-in, mutual consent)" — describes user export/import but not patient consent
- ADR-0115 (HealthStack) — no mention of consent workflow or consent-to-federation

**Description:**

ADR-0120 §4.1 describes cross-tenant federation for users (Tenant A user logs into Tenant B), but HealthStack has a **patient consent** workflow that's different:
- Patient A (at Hospital 1) consents to Doctor B (at Hospital 2) accessing their record
- This requires federated consent, not federated user identity

When Doctor B (at Hospital 2) accesses Patient A's record via FHIR, the FHIR server (HAPI JPA at Hospital 1) must verify the consent. But if Doctor B's credentials come from Hospital 2's Auth service (tenant 2), how does Hospital 1's HAPI FHIR (tenant 1) verify the consent?

ADR-0120 is silent on this cross-tenant patient-consent scenario.

**Evidence:**
- ADR-0120 §4.1: "Cross-tenant federation ... Tenant B trusts Tenant A as IdP via OIDC federation" (user federation, not patient consent)
- ADR-0115: No mention of cross-tenant patient consent or interop-driven consent checks

**Impact:**
- Low. Patient-to-provider consent is future scope (Phase 4–5 per ADR-0099 §12). Doesn't block Wave 1 foundation build. But should be noted in future HealthStack interop design.

---

#### Finding F-014: HealthStack FHIR API versioning strategy (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0115 (HealthStack) §4.1.3: "FHIR version strategy: R4 primary, R5 experimental track only"
- ADR-0103 (API surface, legacy DRAFT): Mentions FHIR but no explicit version strategy per 0115

**Description:**

ADR-0115 commits to FHIR R4 as primary + R5 experimental. But does NOT specify:
1. How are R5 endpoints exposed? Same server with content-negotiation header? Separate URL path (`/fhir/r4` vs `/fhir/r5`)?
2. When R6 stabilizes (2027, per ADR-0115), is there a migration path, or do tenants stay on R4?
3. Are cross-FHIR-version resource mappings supported? (Patient R4 → Patient R5 response content-negotiation?)

**Evidence:**
- ADR-0115 §4.1.3: "R4 primary, R5 experimental track only ... maintain R4 as the production API surface; expose R5 via a dedicated experimental endpoint on APISIX with opt-in header"
- ADR-0115 does NOT specify the opt-in header name or endpoint path

**Impact:**
- Low. Implementation detail, can be decided during M1–M2 of HealthStack build. But should be explicit before HAPI FHIR integration begins.

---

#### Finding F-015: Snowstorm terminology offline bundle size unspecified (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0115 (HealthStack) §4.3.3: "Snowstorm (Apache 2.0) as the primary terminology server. SNOMED CT RF2 releases bundleable offline"
- ADR-0115 §4.3.2: SNOMED CT licensing per jurisdiction
- ADR-0127 (air-gap bundle — this would be a new ADR): No mention of SNOMED CT RF2 size

**Description:**

ADR-0115 says SNOMED CT is "bundleable offline" but doesn't specify size. SNOMED CT International Release RF2 (the file format) is ~500 MB compressed, ~5 GB uncompressed. National extensions (US, UK, AU) add another ~500 MB each. For an air-gap hospital deployment, the bundle grows significantly.

**Evidence:**
- ADR-0115 §4.3.1: "Snowstorm Lite: lightweight single-concept-lookup variant" (suggests size is a concern, but doesn't quantify)
- ADR-0115 does NOT mention bundle size

**Impact:**
- Low. Important for air-gap planning (see Finding F-006), but not blocking. Can be addressed in ADR-0127 (air-gap bundle spec).

---

#### Finding F-016: HIPAA final rule 2026 compliance scope (Major)

**Severity:** **MAJOR**

**Affected ADRs:**
- ADR-0115 (HealthStack) §2.4: "HIPAA Security Rule (2025 NPRM) ... final rule expected mid-2026; 240-day compliance window"
- ADR-0120 (Auth) §6: "Compliance: HIPAA Security Rule (encryption at rest + transit + audit + access controls)"
- ADR-0108 (Security, legacy DRAFT): OpenBao, Tink, etc. chosen but not validated against final HIPAA rule

**Description:**

The 2025 HIPAA Security Rule NPRM proposes changes (stronger encryption, MFA mandatory, etc.). Final rule publishes mid-2026 with 240-day compliance deadline. But CuraOS Wave 1 foundation build is slated for 6 months (per ADR-0099 §12), completing ~Oct 2026. This OVERLAPS the final rule timeline.

Question: Does CuraOS v1 GA happen before or after final HIPAA rule? If before, v1 may not be HIPAA-ready at launch, requiring post-hoc changes.

**Evidence:**
- ADR-0115 §2.4: "HIPAA Security Rule (2025 NPRM) ... final rule expected mid-2026; 240-day compliance window after publication"
- ADR-0099 §12: "Phase 3 — Foundation product implementation ... 6 months solo + AI-agent swarm"
- This implies v1 GA ~Oct/Nov 2026, after final rule but within 240-day window

**Impact:**
- Medium. Not a blocker, but a risk: if final rule introduces breaking architectural changes (e.g., "all encryption keys must be in HSM"), and v1 is already deployed with software keys (per ADR-0108 OpenBao), post-launch re-architecting is expensive.

**Recommended fix:**
- During ADR-0120/0122/0123 implementation, validate against NPRM draft (available now). Flag any architecture that would need rework if final rule changes recommendation. Plan Phase 4 work to include HIPAA final rule re-validation.

---

#### Finding F-017: HealthStack consent model (FHIR Consent vs SpiceDB) unresolved (Minor)

**Severity:** **MINOR**

**Affected ADRs:**
- ADR-0120 (Auth) §3.2: "Three-layer Authorization ... OpenFGA: ReBAC for PHI patient-consent relationships, sharing graphs"
- ADR-0115 (HealthStack): No mention of how Consent is modeled (FHIR Consent resource vs OpenFGA relationship)

**Description:**

ADR-0120 specifies OpenFGA for "PHI consent ReBAC" but ADR-0115 (HealthStack) doesn't say whether consent is:
- Stored as FHIR Consent resources in HAPI FHIR, then queried at read time
- Stored as relationships in OpenFGA, queried by Auth/APISIX policy layer
- Both (duplication, eventual consistency risk)

This affects architecture: if FHIR Consent is the source of truth, every FHIR read must check Consent. If OpenFGA is the source, Consent must be synced from FHIR → OpenFGA (via event).

**Evidence:**
- ADR-0120 §3.2: "OpenFGA: ReBAC for PHI patient-consent relationships"
- ADR-0115: No mention of Consent storage model

**Impact:**
- Low. Design decision for HealthStack Phase 1 implementation, not Wave 1 foundation. But should be called out to avoid divergent implementations (FHIR Consent in some services, OpenFGA in others).

---

#### Finding F-018: Audit token size explosion risk at SaaS scale (Info)

**Severity:** **INFO**

**Affected ADRs:**
- ADR-0104 (legacy) §Sub-decision 4: Hash-chained PostgreSQL audit with per-tenant chain head
- ADR-0120 (Auth) §6: "Audit: Hash-chained PG audit — every auth event"

**Description:**

Hash-chained audit logs with `previous_hash` + `self_hash` + context in every row. At SaaS scale with 1000+ tenants × 100+ events/s per tenant = 100K events/s total.

Each audit row: ~500 bytes (event metadata) + 32 bytes hash + 32 bytes previous_hash = ~564 bytes/row. At 100K/s, that's 56 GB/day or 1.7 TB/month. PostgreSQL table grows quickly; index maintenance cost rises.

**Evidence:**
- ADR-0104 §Sub-decision 4 pattern: `self_hash = SHA-256(id || tenant_id || seq || timestamp || actor_id || action || resource_type || resource_id || previous_hash)` (long tuple, ~500+ bytes when serialized)
- No mention of retention policy, partitioning strategy, or size SLA in any ADR

**Impact:**
- Low. Known scaling pattern (see Tracehold, Certificate Transparency). Mitigated by WORM export to SeaweedFS (per ADR-0104) and table partitioning by month. But should be documented in Wave 1 implementation planning.

---

#### Finding F-019: Foundation product cross-dependency ordering (Info)

**Severity:** **INFO**

**Affected ADRs:**
- ADR-0099 §12: "Phase 3 — Foundation product implementation. Solo + AI-agent swarm builds the four foundation products to sellable v1 quality."
- ADR-0123 (Codegen) — depends on auth, builder, workflow for recipe targets

**Description:**

ADR-0099 lists build order as:
1. Phase 1: Foundation Platform Runtime (0100)
2. Phase 2: Four foundation product ADRs (0120/0121/0122/0123)
3. Phase 3: Implementation

But ADR-0123 (Codegen) needs Auth (0120), Builder (0121), Workflow (0122) to be partially working before it can generate recipes targeting them. So the actual build order for Phase 3 should be:
1. Auth (0120) v0
2. Builder (0121) v0
3. Workflow Manager (0122) v0
4. Codegen (0123) v0 + Phase 1 recipes
5. Then iterate to v1 on all four

This is implicit in build sequences (M1–M15 in each ADR) but not explicitly stated as a dependency chain.

**Evidence:**
- ADR-0123 §10 M1–M3: "NestJS shell → template engine dispatcher → first 5 recipes" (implies earlier products exist to template against)
- ADR-0099 §12: Lists Phase 3 as "Foundation product implementation" without explicitly stating the internal sequence

**Impact:**
- Low. Artifact of ADR sequencing clarity, not architecture. But useful for Wave 1 implementation planning to avoid parallelization mistakes (don't start building Codegen recipes before Auth is drafted).

---

## Action items (rolled up)

| ID | Action | Priority | Target ADR | Blocker? |
|---|---|---|---|---|
| A-001 | Define tenant routing interceptor + context propagation spec | Critical | ADR-0152 | Yes — blocks foundation product implementation |
| A-002 | Specify Auth token flow interchange between foundation products | Critical | ADR-0152 | Yes — blocks integration testing |
| A-003 | Resolve HAPI FHIR multi-tenant audit integration + per-tenant scoping | Critical | ADR-0125 | Yes — blocks HealthStack v1 |
| A-004 | Codegen Phase 1 recipes detailed design (inputs, outputs, targets) | Critical | ADR-0124 | Yes — blocks codegen implementation |
| A-005 | Define provider interface specification + naming convention | Major | ADR-0126 | No — can be post-v1, but speeds deployment modularity |
| A-006 | Specify air-gap bundle composition, sizing, and update strategy | Major | ADR-0127 | No — can ship v1 SaaS, air-gap follows |
| A-007 | Define Builder Suite pricing matrix + tier coherence | Major | ADR-0128 | No — can defer to commercial planning, but needed for sales |
| A-008 | Specify AI features quota enforcement + billing spec | Major | ADR-0129 | No — can be post-v1, but needed for SaaS profitability |
| A-009 | Define clinical-grade app safety gates for HealthStack Apps | Major | ADR-0130 | No — but critical before publicly shipping marketplace |
| A-010 | Clarify payment processor scope for Sites/Apps v1 vs v2 | Minor | ADR-0121a | No — defer as-is |
| A-011 | Add FHIR R4/R5/R6 versioning strategy (URL paths, headers) | Minor | ADR-0115 amendment | No — design decision for M1 HealthStack |
| A-012 | Add MCP payload spec consistency (JSON-RPC 2.0) | Minor | ADR-0126 | No — post-v1 |
| A-013 | HIPAA final rule 2026 validation during Phase 3 | Minor | ADR-0125 | No — tracked as risk, not blocker |
| A-014 | Clarify Consent storage model (FHIR vs OpenFGA) | Minor | ADR-0115 amendment | No — HealthStack Phase 1 design |

---

## Open questions surfaced

### Dimension 1: Integration seams

1. **Tenant routing:**
   - How does NestJS Interceptor extract tenant ID from JWT? Which claim?
   - Does Better Auth (ADR-0120) use `sub` + `tenant_id` claim, or custom claim?
   - How is tenant ID validated (trusted issuer + key rotation)?

2. **Auth token circulation:**
   - When Builder service calls Workflow Manager to start a workflow, what auth header is used? Bearer token from user session, or service-to-service mTLS?
   - Does Workflow Manager validate the Bearer token by calling Auth introspection? Or cache JWKS locally?

### Dimension 2: Clinical pathway

1. **HAPI FHIR PHI write audit:**
   - Does ConsentInterceptor (in HAPI) veto writes, or does NestJS HealthStack service check consent before calling HAPI?
   - If both, which is authoritative on deny?

2. **Cross-tenant patient consent:**
   - If Hospital A patient consents to Doctor B (Hospital B), and Doctor B accesses Patient via FHIR, does Hospital A's HAPI FHIR query Hospital B's Consent service?
   - Or is consent pre-exchanged (federated) at clinician login time?

### Dimension 3: Provider abstraction

1. **Interface discoverability:**
   - At runtime, how does a service know which StorageProvider to load? Environment variable? ServiceRegistry query? Dapr component config?

2. **Custom provider safety:**
   - If a tenant writes a custom StorageProvider that leaks PHI to S3 bucket, how is that caught? Code review? Automated scan?

### Dimension 7: AI-agent viability

1. **MCP server registration:**
   - When Codegen exposes an MCP server for external agents, how do agents discover it? DNS? ServiceRegistry? Hardcoded per-deployment?

2. **Agent-to-agent handoff:**
   - If one agent calls Codegen MCP (generate recipe) and passes output to Builder MCP (create app), how do errors propagate? Rollback on Builder failure?

### Dimension 8: Patient-centric guarantees

1. **App resource quotas:**
   - If a hospital admin publishes an app that uses 100 GB of memory, how is it capped? Hard limit + OOM kill? Or gradual throttle?
   - Per-app or per-tenant quota pool?

---

## Decision summary

| Dimension | Coherence rating | Biggest risk | Status |
|---|---|---|---|
| 1. Cross-product integration seams | 60% — major gaps on tenant routing + token interchange | Tenant data leaks across boundaries; token refresh storms | **Critical findings F-001, F-002, F-004** |
| 2. Clinical pathway end-to-end | 70% — pathway traces, but PHI audit split between systems | HIPAA compliance audit failure; audit trail incomplete | **Critical findings F-004, F-012, F-016** |
| 3. Provider abstraction consistency | 40% — rule declared but interface not specified | Tenants can't swap components; custom wrappers proliferate | **Major finding F-005** |
| 4. Codegen recipe coverage | 50% — Phase 1 recipes listed, targeting unspecified | Unclear which recipes target which products; circular dependency risk | **Critical finding F-003** |
| 5. Pricing/packaging | 50% — 4-product suite with unclear bundle pricing | Sales confusion; customer churn on hidden discounts | **Major finding F-008** |
| 6. Air-gap bundle | 40% — components listed, size/update unspecified | Bundle too large for offline media; no patch mechanism | **Major finding F-006** |
| 7. AI-agent model | 65% — MCP pattern proposed, coverage incomplete | Agents can't drive all services; 200-agent swarm not viable | **Major findings F-010, F-011** |
| 8. Patient-centric SLA | 55% — commitment clear, enforcement gaps | Hospital admin app crashes clinic workflows; PHI exported carelessly | **Major finding F-012, Info findings F-013/F-017** |

---

## References

- [ADR-0099 Charter, Vision, Priorities & OSS-Leverage Strategy](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0102 Event Messaging Layer](0102-event-messaging.md)
- [ADR-0104 Identity / Auth (DRAFT)](0104-identity-auth.md)
- [ADR-0114 AI / Agent Integration Stack](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0121a Foundation Sites](0121a-foundation-sites.md)
- [ADR-0121b Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121c Foundation Widgets](0121c-foundation-widgets.md)
- [ADR-0121d Foundation Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0121e Foundation Forms](0121e-foundation-forms.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
