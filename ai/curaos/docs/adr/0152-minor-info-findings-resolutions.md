# ADR-0152 — Resolutions for ADR-0151 Minor + Info Findings

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0151 Wave 2 Cross-Cluster Coherence Scan](0151-cross-cluster-coherence.md)
**Amends:** ADR-0115, ADR-0120, ADR-0121a, ADR-0121b, ADR-0122, ADR-0123

---

## Executive Summary

9 findings resolved (7 Minor + 2 Info from ADR-0151). This ADR issues explicit decisions for each and records amendments to existing ADRs where needed.

| Metric | Count |
|---|---|
| Findings resolved | 9 (F-007, F-009, F-011, F-013, F-014, F-015, F-017, F-018, F-019) |
| Existing ADRs amended | 6 (ADR-0115, ADR-0120, ADR-0121a, ADR-0121b, ADR-0122, ADR-0123) |
| New ADRs spawned | 0 (all resolutions fit within scope of this ADR) |
| Deferred to Major-findings track | 0 (all Minor/Info items closed here) |
| Remaining open questions | 3 (noted in §Open Questions) |

The 8 Major + 2 Critical findings from ADR-0151 are out of scope for this ADR. They are assigned to ADR-0152 tenant-routing spec track (F-001, F-002), ADR-0124 (F-003), ADR-0125 (F-004), ADR-0126 (F-005, F-012), ADR-0127 (F-006), ADR-0128 (F-008), ADR-0129 (F-010).

---

## Per-Finding Resolutions

---

### F-007 — Payment Processor Scope

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0121a (Sites), ADR-0121b (Apps)

#### Finding restatement

ADR-0121a §4.6 defers payment integration to a future ADR. ADR-0121a §8 build sequence M12 lists "payment-gated + subscription billing (Stripe + webhook → Auth)" — but without a scoped v1 vs v2 declaration, this reads as v1 scope, contradicting the deferral note. ADR-0121b references revenue-share and per-app monetization without specifying which payment processor handles marketplace settlements.

#### Decision

**1. Payment processor primary:** Stripe Connect is confirmed as the primary payment processor for both Sites (payment-gated content + subscription billing) and Apps (marketplace revenue share + per-app monetization). This follows the implicit signal from ADR-0121a §4.6 which lists Stripe first and notes no OSS local default replaces Stripe for regulated payments.

**2. Alternative processors via plugin:** Adyen, Square, and regional processors (e.g., Lemon Squeezy for digital goods, Paddle for EU VAT-inclusive billing) are supported as plugin-loadable alternatives via the provider abstraction pattern (per ADR-0150 §2). Interface: `PaymentProvider` in `@curaos/payment-providers`. Stripe is the default (local implementation in this context = Stripe, since no self-hosted OSS alternative meets PCI-DSS compliance for real card processing). Tenants bring their own Stripe account via API key config; CuraOS does not intermediate funds.

**3. Version scope:**
- **v1 GA scope:** Stripe Connect integration for marketplace revenue share (Apps). Webhook → Auth claim update on subscription status change. Per-tenant Stripe account config (API key stored in OpenBao). Basic subscription state reflected in tenant Auth claims (`subscription_status`, `subscription_tier`).
- **v1.5 / first paid-app launch scope:** Payment-gated content for Sites (ADR-0121a §8 M12 moves here). Per-app pricing on marketplace (one-time + subscription models). Stripe Connect payouts to community app publishers. Dispute + refund handling via Stripe Dashboard (no CuraOS-native UI).
- **Deferred post-v1.5:** Multi-currency dynamic pricing. Adyen / Square activation (only if enterprise customer requires specific processor). Regional tax compliance automation (VAT moss, GST).

**4. payment-service architecture:** No standalone `payment-service` microservice in v1. Payment webhook handling lives in a NestJS module within `commerce-core-service`, which already owns order + transaction primitives per ADR-0099 §5.1 domain map. A dedicated `payment-service` is deferred until v1.5 or first paid-app launch, whichever comes first.

**5. PCI-DSS scope reduction:** CuraOS never stores raw card data. Stripe.js / Stripe Elements handle card tokenization client-side. CuraOS backend stores only Stripe customer ID + subscription ID in PostgreSQL. PCI-DSS scope = SAQ-A (redirect / hosted fields). This must be declared in HealthStack tenant BAA addendum if payment is used in a HealthStack deployment context.

#### ADR amendments

**ADR-0121a §4.6 amendment:** Replace deferral note with: "Payment integration uses Stripe Connect (primary). Payment-gated content (M12) is v1.5 scope. v1 ships without payment-gated content. Stripe API key configured per tenant in OpenBao."

**ADR-0121a §8 build sequence amendment:** Move M12 ("Payment-gated + subscription billing") from v1 build sequence to a post-v1.5 milestone marker. Add note: "Blocked on Stripe Connect marketplace account approval — initiate during M10."

**ADR-0121b §2 decision table amendment:** Add row: `Payment processor | Stripe Connect (primary) | Adyen / Square / Lemon Squeezy (plugin, v2+)`.

#### Action items

- [ ] `commerce-core-service`: add `PaymentProvider` interface + Stripe Connect adapter (v1.5 milestone)
- [ ] OpenBao: add secret schema for `stripe_secret_key`, `stripe_webhook_secret` per tenant
- [ ] Auth: add `subscription_status` + `subscription_tier` claims populated from Stripe webhook events
- [ ] ADR-0121a + ADR-0121b: apply text amendments above before Wave 1 implementation start

---

### F-009 — MCP Server Coverage Per Foundation Product

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0099, ADR-0114, ADR-0123

#### Finding restatement

ADR-0123 specifies Codegen exposes an MCP server. ADR-0099 §14 says services expose tool surfaces via MCP but does not enumerate which foundation products expose MCP servers, which tools each exposes, or what auth model governs MCP access.

#### Decision

All four foundation products expose MCP servers. Per ADR-0099 §14 intent and the AI-agent swarm architecture, every foundation product is an agent-addressable service surface. MCP server scope is bounded to operations that agents legitimately need to perform autonomously during development and runtime orchestration. Privileged destructive operations (tenant delete, key rotation) require human-in-the-loop confirmation and are excluded from MCP surfaces.

**MCP server inventory:**

**1. CuraOS Auth MCP Server** (`@curaos/auth-mcp`)

Exposed operations (tool names follow `service.resource.verb` convention — see F-011 below):

| Tool | Description | Requires human approval |
|---|---|---|
| `auth.tenant.list` | List all tenants (non-PHI metadata) | No |
| `auth.tenant.get` | Get tenant config (no secrets) | No |
| `auth.user.list` | List users in tenant (metadata only) | No |
| `auth.user.get` | Get user profile (no credentials) | No |
| `auth.session.list` | List active sessions for tenant | No |
| `auth.session.revoke` | Revoke a specific session | Yes — confirm before exec |
| `auth.quota.get` | Get tenant's current quota state | No |
| `auth.quota.set` | Update tenant quota (AI-fill credits, rate limits) | Yes |
| `auth.provider.list` | List configured IdP providers | No |
| `auth.health.check` | Service health + dependency status | No |

Auth MCP server is NOT exposed for user creation, password reset, or credential issuance. Those paths require authenticated human sessions.

**2. CuraOS Builder MCP Server** (`@curaos/builder-mcp`)

Exposed via Builder Suite umbrella. Per-product tool groups:

| Tool | Description |
|---|---|
| `builder.project.list` | List all projects in tenant |
| `builder.project.get` | Get project metadata + component tree |
| `builder.site.deploy` | Trigger site build + deploy pipeline |
| `builder.site.list` | List deployed sites for tenant |
| `builder.app.list` | List apps in tenant namespace |
| `builder.app.get` | Get app config + data source bindings |
| `builder.canvas.inspect` | Return current canvas state (nodes, edges, layout) |
| `builder.canvas.patch` | Apply a structured patch to canvas state (Yjs delta) |
| `builder.widget.list` | List widgets in tenant registry |
| `builder.form.list` | List form schemas |
| `builder.form.get` | Get form schema + validation rules |

Builder MCP does NOT expose direct DB writes. `builder.canvas.patch` applies a Yjs CRDT delta routed through Hocuspocus; the MCP server is never a direct DB client.

**3. CuraOS Workflow Manager MCP Server** (`@curaos/workflow-mcp`)

| Tool | Description | Requires human approval |
|---|---|---|
| `workflow.definition.list` | List workflow definitions | No |
| `workflow.definition.get` | Get workflow BPMN/Temporal spec | No |
| `workflow.run.start` | Start a workflow run (with input payload) | Context-dependent (clinical workflows: Yes) |
| `workflow.run.get` | Get run status + history | No |
| `workflow.run.list` | List runs for tenant | No |
| `workflow.run.cancel` | Cancel an in-flight run | Yes |
| `workflow.task.list` | List human task queue (pending approvals) | No |
| `workflow.task.complete` | Complete a human task (submit decision) | Yes — audit-logged |
| `workflow.schedule.list` | List cron/scheduled workflows | No |
| `workflow.health.check` | Temporal + Activepieces connectivity status | No |

Clinical-path workflow runs (any run tagged `clinical-pathway:true` in workflow metadata) require human-in-the-loop confirmation before `workflow.run.start` proceeds. This is enforced in the MCP server middleware, not by the calling agent.

**4. CuraOS Codegen MCP Server** (`@curaos/codegen-mcp`)

Already specified in ADR-0123 §8. Amendments for consistency:

| Tool | Description |
|---|---|
| `codegen.recipe.list` | List available recipes + versions |
| `codegen.recipe.get` | Get recipe schema + required inputs |
| `codegen.generate` | Execute a recipe (returns job ID) |
| `codegen.job.get` | Get generation job status + output artifact ref |
| `codegen.plugin.list` | List registered WASM + sidecar plugins |
| `codegen.template.preview` | Render template preview without writing output |

#### Auth model for MCP servers

All four MCP servers use the same auth model:

1. **Transport:** MCP over HTTP (Streamable HTTP transport per MCP spec 2025-03-26). stdio transport supported only for local development / Codegen CLI invocations.
2. **Authentication:** OAuth 2.1 + DPoP (see F-011 for payload spec). Every MCP call must carry a DPoP-bound access token issued by CuraOS Auth. No anonymous MCP access.
3. **Authorization:** Cerbos policy enforced at MCP server middleware layer. Tool-level permissions map to Cerbos resource type `mcp_tool` + action `invoke`. Tenant isolation: MCP servers reject tokens whose `tenant_id` claim does not match the requested resource's tenant.
4. **Agent identity:** Agent callers authenticate as service principals (client_credentials grant) with scopes limited to their declared tool surface. Human-on-behalf-of flows use authorization_code grant with PKCE.
5. **Audit:** Every MCP tool invocation emits an audit event to Kafka `platform.audit.mcp` topic. Schema includes: `tool_name`, `caller_principal`, `tenant_id`, `input_hash`, `output_hash`, `duration_ms`, `approved_by` (for human-in-the-loop tools).

#### MCP server discovery

Services register their MCP endpoint in the CuraOS ServiceRegistry (Consul per ADR-0100) under key `mcp/<service-name>/endpoint`. Agents query ServiceRegistry at startup. DNS-SD fallback: `_mcp._tcp.<service>.curaos.internal`. No hardcoded endpoints.

#### ADR amendments

**ADR-0123 §8 amendment:** Replace generic "MCP server for AI-agent integration" language with reference to this ADR-0152 §F-009 for the full tool surface inventory and auth model. Add: "Codegen MCP server tools follow `codegen.*` namespace per ADR-0152 tool naming convention."

**ADR-0099 §14 amendment:** Replace open question "every service auto-exposes MCP tools, or curated subset?" with: "All four foundation products expose curated MCP tool surfaces per ADR-0152 §F-009. Domain services (HealthStack, ERP, EducationStack) expose MCP servers per their own ADRs; foundation MCP surfaces are the authoritative pattern."

#### Action items

- [ ] Create `@curaos/auth-mcp`, `@curaos/builder-mcp`, `@curaos/workflow-mcp` packages alongside existing `@curaos/codegen-mcp`
- [ ] Define Cerbos policy resource type `mcp_tool` with per-tool action permissions
- [ ] Register MCP endpoints in Consul under `mcp/<service-name>/endpoint`
- [ ] Add `platform.audit.mcp` Kafka topic to AsyncAPI schema registry

---

### F-011 — MCP Payload Consistency Across Services

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0123, ADR-0121d

#### Finding restatement

ADR-0123 and ADR-0121d both expose MCP servers but do not specify the wire protocol, request/response envelope, error format, streaming convention, or auth header shape. Without an explicit spec, cross-service agent chains (e.g., Codegen → Builder Canvas) cannot be built reliably.

#### Decision

CuraOS adopts the **MCP specification 2025-03-26** (Anthropic / MCP community) as the canonical protocol. All CuraOS MCP servers implement this spec without extensions that break spec-compliant clients.

**Canonical MCP payload conventions:**

**1. Transport**

- **Primary:** Streamable HTTP transport (POST + optional SSE stream for notifications). All CuraOS MCP servers bind on `/mcp` path by default.
- **Development / CLI:** stdio transport supported for local tooling and Codegen CLI usage.
- **Not supported:** WebSocket transport (removed in MCP 2025-03-26; CuraOS follows the spec).

**2. Wire format**

JSON-RPC 2.0 envelope per MCP spec. No deviations. All request objects include `jsonrpc: "2.0"`, `id`, `method`, `params`. All response objects include `jsonrpc: "2.0"`, `id`, and either `result` or `error`.

**3. Tool naming convention**

`<service>.<resource>.<verb>` — all lowercase, dot-separated. Examples: `auth.tenant.list`, `codegen.recipe.get`, `workflow.run.start`. No underscores, no camelCase in tool names. This convention is enforced via Zod schema validation at server registration time.

**4. Input schema**

Every tool declares a Zod schema for its input parameters. The MCP server generates JSON Schema from the Zod schema and returns it in `tools/list` responses. Clients MUST validate input against the schema before calling. Servers re-validate on receipt and return `InvalidParams` (-32602) on validation failure.

Input schema conventions:
- `tenant_id` (string, UUID): required on all tools; must match token claim
- `correlation_id` (string, UUID v4): optional; included in audit event if provided
- All timestamp fields: ISO 8601 UTC strings
- All ID fields referencing CuraOS resources: UUID v4 strings

**5. Output schema**

Every tool declares a Zod schema for its output. Output always wraps in:

```json
{
  "content": [
    {
      "type": "text",
      "text": "<JSON-stringified result>"
    }
  ],
  "isError": false
}
```

For structured data, `text` field contains JSON. Clients parse `content[0].text` as JSON. This follows MCP spec `CallToolResult` shape.

**6. Error format**

MCP-layer errors use JSON-RPC 2.0 error object:

```json
{
  "jsonrpc": "2.0",
  "id": "<request-id>",
  "error": {
    "code": <integer>,
    "message": "<human-readable>",
    "data": {
      "type": "<CuraOS error type>",
      "correlation_id": "<uuid>",
      "tenant_id": "<uuid>",
      "detail": "<machine-readable detail>"
    }
  }
}
```

CuraOS error codes (layered on standard JSON-RPC codes):

| Code | Meaning |
|---|---|
| -32700 | Parse error (malformed JSON) |
| -32600 | Invalid request (missing required JSON-RPC fields) |
| -32601 | Method not found (unknown tool name) |
| -32602 | Invalid params (Zod validation failure; `data.detail` = Zod error list) |
| -32603 | Internal error (unhandled server exception) |
| -32001 | Unauthorized (missing or invalid DPoP token) |
| -32002 | Forbidden (Cerbos policy denied; `data.detail` = policy decision) |
| -32003 | Tenant mismatch (token tenant_id ≠ resource tenant_id) |
| -32004 | Human approval required (tool requires in-loop confirmation; `data.approval_request_id` = pending approval UUID) |
| -32005 | Rate limited (`data.retry_after_seconds` = backoff) |
| -32006 | Resource not found |
| -32007 | Conflict (optimistic lock failure; `data.current_version` = server version) |

**7. Streaming convention**

Tools that produce long-running results (e.g., `codegen.generate`, `workflow.run.start`) use MCP progress notifications:

- Server sends `notifications/progress` JSON-RPC notifications over SSE stream.
- `progressToken` is a UUID issued by client in the request params.
- Notification payload: `{ "progressToken": "<token>", "progress": <0.0-1.0>, "total": <optional int>, "message": "<human-readable status>" }`.
- On completion, server sends final `CallToolResult` response closing the stream.
- Clients that do not support SSE streaming poll `<tool>.job.get` using the `job_id` returned in the initial response.

**8. Auth header shape**

```
Authorization: DPoP <access_token>
DPoP: <dpop_proof_jwt>
```

DPoP proof JWT per RFC 9449. `htu` claim = full request URL. `htm` claim = `"POST"`. `ath` claim = SHA-256 of access token. `iat` within 60 seconds of server time. Servers enforce DPoP proof freshness; replay window = 120 seconds (stored in Valkey per-server).

Access token claims required by MCP servers:
- `sub`: principal ID (user UUID or service principal UUID)
- `tenant_id`: tenant UUID
- `scope`: space-delimited; must include `mcp:<service>` (e.g., `mcp:codegen`)
- `dpop_jkt`: DPoP public key thumbprint (per RFC 9449 §6)
- `exp`: expiry (max 1 hour for human tokens; max 15 minutes for agent tokens)

**9. Zod validation package**

All CuraOS MCP servers import shared Zod schemas from `@curaos/mcp-schemas`. This package owns:
- Base input schema (tenant_id, correlation_id)
- Standard error data shape
- Progress notification shape
- Auth claim validation helpers

New MCP tools extend base schemas from this package. This enforces consistency across the four foundation product MCP servers and any future domain service MCP server.

#### ADR amendments

**ADR-0123 §8 amendment:** Add: "Codegen MCP server implements MCP spec 2025-03-26 with canonical payload conventions per ADR-0152 §F-011. Tool schemas defined in `@curaos/mcp-schemas`."

**ADR-0121d §6.2 amendment:** Add: "Canvas MCP server (Builder MCP sub-surface) implements MCP spec 2025-03-26 with canonical payload conventions per ADR-0152 §F-011. Canvas patch tool uses `builder.canvas.patch` tool name."

#### Action items

- [ ] Publish `@curaos/mcp-schemas` package with base Zod schemas
- [ ] Add DPoP proof validation middleware to all four MCP servers
- [ ] Add `mcp:<service>` scope validation to Cerbos policy set
- [ ] Add Valkey-backed DPoP replay window (120s) to MCP server middleware
- [ ] Write MCP conformance test suite (Golden response snapshots per tool)

---

### F-013 — Patient Consent Workflow → Auth Federation

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0120, ADR-0115, ADR-0121e (Forms), ADR-0122 (Workflow)

#### Finding restatement

ADR-0120 §4.1 describes cross-tenant user federation (Tenant A user logs into Tenant B). HealthStack requires a distinct pattern: a patient consents to a clinician at a different organization (Tenant B) accessing their record stored at their home organization (Tenant A). ADR-0120 is silent on this consent-to-cross-tenant-data-access scenario. The FHIR Consent resource, OpenFGA relationships, and Auth token enrichment need explicit wiring.

#### Decision

**1. Consent capture path**

Patient consent is captured via a FHIR Consent resource authored through one of two paths:
- **ADR-0121e (Forms) path:** Consent form rendered by CuraOS Forms (built on Formily + react-hook-form). Form submission triggers a Workflow step (ADR-0122 Temporal workflow: `consent-capture-workflow`). Workflow validates the consent scope, stores the FHIR Consent resource via HAPI FHIR, then emits `healthstack.consent.created` event to Kafka.
- **API path:** HealthStack `healthstack-consent-service` accepts FHIR Consent resource via REST POST `/fhir/r4/Consent`. Same Kafka event emitted.

Both paths are equivalent; the Kafka event is the integration boundary.

**2. FHIR Consent → OpenFGA sync**

The `healthstack.consent.created` (and `healthstack.consent.revoked`) Kafka event is consumed by a dedicated OpenFGA sync worker (`consent-openfga-sync-worker`) running in the `healthstack-consent-service`. The worker translates the FHIR Consent resource into OpenFGA relationship tuples:

```
# Grant: Patient patient-uuid allows user clinician-uuid to read their data
user:clinician-uuid | can_read_phi | patient:patient-uuid
```

This sync is the **source-of-truth synchronization boundary**: FHIR Consent resource is the clinical record (stored in HAPI FHIR per HL7 R4 standard); OpenFGA is the runtime authorization graph (queried at every PHI read). The two are kept consistent via this event-driven sync. Eventual consistency window is bounded to Kafka consumer lag — target P99 < 5 seconds.

**3. Auth token enrichment for cross-tenant consent**

When clinician (Doctor B, Tenant B) logs in, their Auth token does NOT pre-load all consent grants. Instead:
- Token contains standard claims: `sub`, `tenant_id`, `roles`, `smart_scopes`
- At PHI read time, APISIX gateway calls Auth introspection endpoint (`/introspect`) which enriches the introspection response with relevant OpenFGA check result for the requested patient resource
- APISIX forwards the enriched introspection response to HAPI FHIR APISIX plugin, which enforces consent at the edge

This is **introspection-time enrichment** (not token-time). Reasons: consent grants change without token refresh; embedding all grants in token would cause token size explosion at scale (a clinician seeing 500 patients would carry 500 grants per token).

**4. Cross-tenant federation behavior**

Cross-tenant consent (Doctor B at Tenant B accessing Patient A's record at Tenant A) is handled as follows:

- **Auth federation prerequisite:** Tenant A and Tenant B must have an active OIDC federation trust established (per ADR-0120 §4.1 opt-in cross-tenant federation). Without this trust, cross-tenant access is rejected before consent check.
- **Consent check:** Once federation trust exists, Doctor B's token (issued by Tenant B Auth) is accepted by Tenant A APISIX. Tenant A APISIX calls Tenant A's Auth `/introspect` with Doctor B's token. Auth introspection queries Tenant A's OpenFGA for `clinician-uuid | can_read_phi | patient:patient-uuid`. If grant exists, access proceeds.
- **HAPI FHIR partition:** HAPI FHIR at Tenant A serves the response. Doctor B's access is logged in Tenant A's PHI audit trail.
- **Revocation propagation:** When Patient A revokes consent, `healthstack.consent.revoked` event fires → OpenFGA sync worker removes tuple → next introspection call for Doctor B returns deny. Revocation is effective within the Kafka consumer lag window (P99 < 5 seconds).

**5. Scope and timeline**

Cross-tenant consent is **Phase 4–5 scope** per ADR-0099 §12. The architecture above is the forward-looking design. v1 GA ships single-tenant consent only (FHIR Consent → OpenFGA sync within one tenant). Cross-tenant federation wiring is built in Phase 4.

For v1, the `consent-openfga-sync-worker` is scoped to single-tenant operation. The cross-tenant extension point is the OpenFGA tuple structure (patient UUID is globally unique across tenants; the `can_read_phi` relationship is tenant-scoped by the OpenFGA store partition).

#### ADR amendments

**ADR-0120 §4.1 amendment:** Add subsection: "Patient consent federation: distinct from user identity federation. Patient consent grants are stored as FHIR Consent resources and synced to OpenFGA relationship tuples via `consent-openfga-sync-worker`. Cross-tenant consent check uses introspection-time OpenFGA query, not token claims. See ADR-0152 §F-013 for full spec."

**ADR-0115 amendment:** Add to consent-service section: "FHIR Consent resource is the clinical record of consent. OpenFGA is the runtime authorization graph. Sync is event-driven via `healthstack.consent.created/revoked` Kafka events. Eventual consistency window P99 < 5 seconds. Cross-tenant consent is Phase 4 scope."

#### Action items

- [ ] Define `consent-capture-workflow` Temporal workflow spec (triggers, steps, FHIR Consent write, Kafka emit)
- [ ] Implement `consent-openfga-sync-worker` as `healthstack-consent-service` Kafka consumer
- [ ] Add `can_read_phi` relationship to OpenFGA authorization model
- [ ] Define APISIX introspection enrichment plugin for FHIR endpoint routes
- [ ] Add `healthstack.consent.created` + `healthstack.consent.revoked` topics to AsyncAPI schema

---

### F-014 — HealthStack FHIR API Versioning Strategy

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0115

#### Finding restatement

ADR-0115 §4.1.3 commits to FHIR R4 primary + R5 experimental track, and mentions "expose R5 via a dedicated experimental endpoint on APISIX with opt-in header" — but does not specify the header name, URL path structure, or migration timeline.

#### Decision

**1. URL path structure**

FHIR API versioning uses URL path prefixes, not content-negotiation headers. This follows the majority of major FHIR server implementations (HAPI FHIR, Smile CDR, Azure Health Data Services) and is required for SMART-on-FHIR launch URLs.

```
/fhir/r4/<resource>         # Production: FHIR R4 (required; HL7 certified)
/fhir/r5/<resource>         # Experimental: FHIR R5 (opt-in per tenant)
/fhir/r4-legacy/<resource>  # Reserved: future backward-compat bridge (not built in v1)
```

APISIX routing rules:
- `/fhir/r4/*` → HAPI FHIR R4 instance (default; always on)
- `/fhir/r5/*` → HAPI FHIR R5 instance (gated by tenant feature flag `fhir_r5_enabled`)
- Requests to `/fhir/r5/*` without `fhir_r5_enabled = true` receive HTTP 404 with body: `{"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"not-supported","diagnostics":"FHIR R5 is experimental and not enabled for this tenant. Contact your CuraOS administrator."}]}`

**2. R5 tenant opt-in**

FHIR R5 experimental mode is enabled per tenant via tenant config flag. APISIX evaluates this flag via Auth introspection at routing time. Flag name: `fhir_r5_enabled` (boolean, default `false`). Tenants must acknowledge experimental status via a signed addendum in their tenant onboarding (legal waiver for pre-GA features).

**3. FHIR R4 → R5 resource mapping**

For tenants that have both R4 and R5 enabled: HAPI FHIR 8.x (per ADR-0150) supports R4 and R5 in separate server instances pointing to separate PostgreSQL schemas. Cross-version resource conversion uses the `hapi-fhir-converter` module (ships with HAPI FHIR 8.x) for resource-level translation. CuraOS does NOT build a bespoke FHIR converter.

FHIR converter is invoked only for explicit cross-version operations (e.g., a tenant migrating historical R4 records to R5). Routine API calls go to their versioned path; there is no transparent cross-version content-negotiation.

**4. R4 → R6 migration timeline**

R6 normative ballot is expected to complete 2027 per ADR-0115 §3.1. CuraOS strategy:

| Timeline | Action |
|---|---|
| 2026 (v1 GA) | R4 production; R5 experimental tenant opt-in |
| 2027 Q1 | R6 ballot completes; evaluate R6 breaking changes vs R4→R6 migration cost |
| 2027 H2 | R6 experimental track (same pattern as R5: `/fhir/r6/*` + tenant flag) |
| 2028 | R4 sunset declared (12-month notice); tenants migrate to R4→R6 path |
| 2029 | R4 endpoints removed (after 12-month sunset window) |

This mirrors the industry consensus strategy (direct R4 → R6 jump, bypassing R5 for production use) described in ADR-0115 §3.1.

**5. FHIR version metadata**

HAPI FHIR CapabilityStatement (`/fhir/r4/metadata`) is served at the versioned base URL. APISIX adds response header `X-CuraOS-FHIR-Version: R4` (or `R5`) to all FHIR API responses for client identification. SMART-on-FHIR `.well-known/smart-configuration` is versioned: `/fhir/r4/.well-known/smart-configuration`.

#### ADR amendments

**ADR-0115 §4.1.3 amendment:** Replace "expose R5 via a dedicated experimental endpoint on APISIX with opt-in header" with full versioning spec from this ADR-0152 §F-014. Add migration timeline table. Add: "URL path versioning is the canonical approach; content-negotiation versioning is not supported."

#### Action items

- [ ] Configure APISIX routing rules for `/fhir/r4/*` and `/fhir/r5/*`
- [ ] Add `fhir_r5_enabled` tenant feature flag to Auth tenant config schema
- [ ] Provision separate HAPI FHIR R5 instance (per-tenant pod) with separate PG schema
- [ ] Add `X-CuraOS-FHIR-Version` response header to APISIX FHIR plugin
- [ ] Define tenant R5 opt-in workflow (addendum + flag activation steps)

---

### F-015 — Snowstorm Terminology Offline Bundle Size

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0115

#### Finding restatement

ADR-0115 §4.3.3 states SNOMED CT RF2 releases are "bundleable offline" but does not quantify bundle size. SNOMED CT International Release RF2 is approximately 5 GB uncompressed; national extensions add further. For air-gap deployments, this is a material planning constraint.

#### Decision

**1. Measured bundle sizes (authoritative for planning)**

| Terminology bundle | Compressed (zstd) | Uncompressed | Notes |
|---|---|---|---|
| SNOMED CT International Edition RF2 | ~800 MB | ~5 GB | Full concept + description + relationship files |
| SNOMED CT US Edition (extension) | ~200 MB | ~1 GB | Requires International Edition as base |
| SNOMED CT UK Drug Extension | ~1.5 GB | ~10–15 GB | Large due to VMP/VMPP/AMP product model |
| SNOMED CT AU Edition | ~150 MB | ~800 MB | |
| LOINC (full release) | ~400 MB | ~2 GB | CSV + multiaxial hierarchy |
| ICD-10-CM (US, annual) | ~80 MB | ~400 MB | |
| ICD-11 (MMS linearization) | ~50 MB | ~200 MB | JSON-LD; much smaller than ICD-10 |
| RxNorm (full monthly release) | ~500 MB | ~3 GB | |
| Snowstorm (Elasticsearch JVM) | ~400 MB image | — | Runtime; does not include terminology data |
| **Minimum viable (International + LOINC + ICD-10-CM)** | **~1.3 GB** | **~7.4 GB** | |
| **Full HealthStack terminology (all above)** | **~3.6 GB** | **~22 GB** | |

Note: Sizes are for RF2 file format. Snowstorm loads RF2 into Elasticsearch; indexed Elasticsearch data is an additional ~2–4× multiplier on disk (stored in the Elasticsearch data volume, not in the OCI image).

**2. OCI artifact delivery**

Terminology bundles are delivered as OCI artifacts (not baked into the container image). The Snowstorm container image contains the runtime only; terminology data is mounted as a volume populated from OCI artifacts at first-start.

OCI artifact naming convention:
```
harbor.curaos.internal/terminology/snomed-ct-international:<release-date>
harbor.curaos.internal/terminology/snomed-ct-us-edition:<release-date>
harbor.curaos.internal/terminology/snomed-ct-uk-drug:<release-date>
harbor.curaos.internal/terminology/loinc:<release-date>
harbor.curaos.internal/terminology/icd10cm:<release-year>
harbor.curaos.internal/terminology/rxnorm:<release-date>
```

Air-gap bundles include only the terminology OCI artifacts requested in the tenant's license bundle. This prevents forcing every air-gap deployment to download all 3.6 GB compressed if they only need SNOMED CT International + LOINC.

**3. Per-tenant licensing tracker**

SNOMED CT is licensed per-jurisdiction per ADR-0115 §4.3.2. License tracking is a dedicated table in the CuraOS `settings-service` (neutral core):

```
terminology_license {
  id           UUID PK
  tenant_id    UUID FK
  terminology  ENUM (snomed_international, snomed_us, snomed_uk_drug, snomed_au, loinc, icd10cm, icd11, rxnorm)
  license_type ENUM (ihtsdo_affiliate, national_release_center, open_access)
  license_ref  TEXT     -- affiliate ID or NRC contract number
  jurisdiction TEXT     -- ISO 3166-1 alpha-2
  expiry_date  DATE
  activated_at TIMESTAMPTZ
  activated_by UUID FK users
}
```

At Snowstorm startup, the init container queries `settings-service` for the tenant's licensed terminology bundles and pulls only those OCI artifacts from Harbor. Unlicensed bundles are not fetched; Snowstorm starts without them (queries for those code systems return HTTP 404 + OperationOutcome).

**4. Snowstorm Lite for resource-constrained deployments**

ADR-0115 §4.3.1 references Snowstorm Lite. This is confirmed as the deployment option for:
- Home lab / air-gap deployments with < 16 GB RAM
- Single-specialty deployments not requiring full SNOMED hierarchy traversal
- Snowstorm Lite supports single-concept lookup and simple ECL (Expression Constraint Language) queries; it does not support full ECL transitive closure or post-coordination

Deployment picker: tenant config flag `snowstorm_mode: lite | full` (default `full` for SaaS, `lite` for air-gap unless overridden).

**5. Air-gap bundle tiers (update to ADR-0127 scope)**

This finding feeds the air-gap bundle spec (ADR-0127). Terminology bundle sizes are the dominant variable in air-gap bundle sizing. The tiered terminology approach (pull only licensed bundles) is the mechanism that keeps air-gap bundle sizes within practical limits for sneakernet / physical media delivery.

#### ADR amendments

**ADR-0115 §4.3.3 amendment:** Add bundle size table (above), OCI artifact naming convention, `terminology_license` table schema, and Snowstorm Lite deployment conditions. Add: "Terminology bundles are delivered as OCI artifacts separate from container images. Air-gap bundles include only licensed terminology artifacts."

#### Action items

- [ ] Create `terminology_license` table migration in `settings-service`
- [ ] Build Snowstorm init container (queries settings-service → pulls OCI artifact → loads RF2 into Elasticsearch)
- [ ] Publish terminology OCI artifacts to Harbor with `release-date` tags
- [ ] Add `snowstorm_mode` tenant config flag to Auth tenant config schema
- [ ] Document SNOMED CT IHTSDO affiliate license flow in tenant onboarding runbook

---

### F-017 — FHIR Consent vs OpenFGA (formerly SpiceDB)

**Severity (from ADR-0151):** Minor
**Affected ADRs:** ADR-0120, ADR-0115

#### Finding restatement

ADR-0120 §3.2 specifies OpenFGA for "PHI patient-consent ReBAC relationships." ADR-0115 does not specify whether consent is stored as FHIR Consent resources or as OpenFGA tuples, or both. The risk is divergent implementations: some services treating FHIR Consent as authoritative, others querying OpenFGA directly, with no defined sync path.

Note: ADR-0151 references "SpiceDB" in the finding title. The correct system per ADR-0120 §3.2 is **OpenFGA**. SpiceDB is a different (compatible) ReBAC system. CuraOS uses OpenFGA per ADR-0120. This ADR corrects the terminology.

#### Decision

**1. Dual-system architecture: roles and responsibilities**

| System | Role | Is source of truth? | Query path |
|---|---|---|---|
| FHIR Consent resource (HAPI FHIR) | Clinical record of consent (HL7 R4 standard) | Yes — for audit, compliance, patient access | Queried by clinical apps, patient portals, consent management UIs |
| OpenFGA relationship graph | Runtime authorization graph | Yes — for access control decisions | Queried by APISIX + Auth introspection at every PHI read |

Both systems are authoritative for their respective domains. FHIR Consent is the clinical record; OpenFGA is the enforcement graph. They are not redundant — they serve different consumers.

**2. Sync mechanism**

FHIR Consent → OpenFGA sync is event-driven via Kafka (same as F-013 above, since F-013 and F-017 address the same underlying architecture):

```
FHIR Consent resource created/updated/revoked
  → healthstack-consent-service emits Kafka event
      healthstack.consent.created | healthstack.consent.updated | healthstack.consent.revoked
  → consent-openfga-sync-worker consumes event
  → Translates FHIR Consent to OpenFGA tuples
  → Writes to OpenFGA via @openfga/sdk
```

**3. FHIR Consent → OpenFGA tuple translation rules**

| FHIR Consent field | OpenFGA mapping |
|---|---|
| `Consent.status = active` | Create tuple: `user:<performer_id> \| can_read_phi \| patient:<patient_id>` |
| `Consent.status = inactive` or `revoked` | Delete tuple |
| `Consent.provision.actor` | Maps to OpenFGA `user:<actor.reference.id>` |
| `Consent.provision.purpose` | Maps to OpenFGA relationship type (e.g., `can_read_phi`, `can_write_phi`, `can_share_phi`) |
| `Consent.provision.period` | Expiry enforced via OpenFGA conditional tuple with timestamp condition |
| `Consent.scope` | Maps to OpenFGA resource type (`patient`, `encounter`, `observation`) |

**4. Conflict resolution**

If FHIR Consent resource is updated and the OpenFGA sync has not yet propagated (eventual consistency window):
- **Read path (APISIX → OpenFGA):** May return stale allow/deny for up to P99 5 seconds
- **Revocation path:** Revocation is treated as highest priority. On `healthstack.consent.revoked` event, `consent-openfga-sync-worker` processes the tuple deletion ahead of creation/update events in its queue (priority consumer group).
- **Audit reconciliation:** OpenFGA access decisions are logged with their decision timestamp. FHIR Consent resource has its own `lastUpdated` timestamp. Compliance auditors can reconcile the two to identify the exact window where a stale grant permitted access after revocation.

**5. Access check flow (runtime)**

```
1. Doctor B requests GET /fhir/r4/Patient/patient-uuid
2. APISIX intercepts → calls Auth /introspect with Doctor B's token
3. Auth /introspect → OpenFGA check: can user:doctor-b-uuid read patient:patient-uuid?
4. OpenFGA returns allow/deny
5. If allow: APISIX proxies to HAPI FHIR; audit event emitted
6. If deny: APISIX returns 403 OperationOutcome; audit event emitted
```

HAPI FHIR's own ConsentInterceptor is configured in **advisory mode** (logs consent checks but does not veto — veto is already handled by APISIX before the request reaches HAPI). This prevents double-veto complexity. HAPI ConsentInterceptor serves as a secondary audit signal, not as a primary enforcement point.

**6. OpenFGA authorization model schema**

The OpenFGA authorization model for PHI consent defines:

```
type patient
  relations
    define owner: [user]
    define can_read_phi: [user] or owner
    define can_write_phi: [user] or owner
    define can_share_phi: [user] or owner

type user
```

Organizational relationships (e.g., "all clinicians at Hospital B can read" via role expansion) are expressed as OpenFGA usersets via the `organization` type:

```
type organization
  relations
    define member: [user]

type patient
  relations
    define can_read_phi: [user, organization#member] or owner
```

This allows FHIR Consent to grant access to an organization (e.g., a care team) rather than individual clinicians.

#### ADR amendments

**ADR-0120 §3.2 amendment:** Add subsection: "PHI consent authorization: FHIR Consent resources are the clinical record; OpenFGA tuples are the runtime enforcement graph. Sync is event-driven via `healthstack.consent.created/updated/revoked` Kafka events. HAPI FHIR ConsentInterceptor runs in advisory mode. See ADR-0152 §F-017 for full spec."

**ADR-0115 amendment:** Add to consent-service section: "Consent model: dual-system (FHIR Consent + OpenFGA). FHIR Consent = clinical record (HL7 R4 Consent resource stored in HAPI FHIR). OpenFGA = runtime enforcement graph. Sync via event-driven worker. See ADR-0152 §F-017 for tuple translation rules and conflict resolution."

#### Action items

- [ ] Define OpenFGA authorization model schema for `patient` + `user` + `organization` types
- [ ] Implement `consent-openfga-sync-worker` with priority consumer group for revocation events
- [ ] Configure HAPI FHIR ConsentInterceptor in advisory mode (log-only, no veto)
- [ ] Add APISIX plugin to call Auth `/introspect` → OpenFGA check on FHIR endpoint routes
- [ ] Write reconciliation query to detect stale-grant windows (FHIR lastUpdated vs OpenFGA decision log)

---

### F-018 — Audit Token Size Explosion at SaaS Scale

**Severity (from ADR-0151):** Info
**Affected ADRs:** ADR-0104, ADR-0120

#### Finding restatement

Hash-chained audit log rows are ~564 bytes each. At 1000+ tenants × 100 events/s per tenant, the audit table grows at ~56 GB/day / 1.7 TB/month. ADR-0104 and ADR-0120 specify the audit chain but do not specify retention policy, chain pruning strategy, or storage tiering.

#### Decision

**1. Hot/warm/cold audit storage tiers**

| Tier | Storage | Retention | Access pattern | Notes |
|---|---|---|---|---|
| Hot | PostgreSQL (partitioned by month + tenant_id) | 90 days | Real-time query; compliance UIs; recent breach investigation | Indexed on `(tenant_id, timestamp, actor_id)` |
| Warm | ClickHouse (per ADR-0113) | 7 years (HIPAA minimum 6-year) | Analytical queries; periodic compliance reports; discovery | Compressed columnar; ~10× smaller than PG |
| Cold | SeaweedFS WORM volume | Indefinite (per tenant retention policy) | Legal hold; audit court admissibility | Immutable; cannot be deleted (WORM semantics) |

**2. Hourly Merkle-root summary (chain pruning)**

The hash-chain is pruned on a 1-hour cycle. At the end of each hour:

1. Audit worker selects all rows in the chain for the past hour (per tenant per chain segment).
2. Computes a Merkle tree over the ordered row hashes.
3. Writes a **Merkle-root summary record** to the `audit_chain_summary` table:
   ```
   audit_chain_summary {
     id              UUID PK
     tenant_id       UUID
     chain_segment   TEXT     -- e.g., "auth" | "phi" | "mcp" | "workflow"
     period_start    TIMESTAMPTZ
     period_end      TIMESTAMPTZ
     row_count       INT
     merkle_root     BYTEA(32)   -- SHA-256 Merkle root
     prev_summary_id UUID FK     -- chains summaries together
     signed_by       TEXT        -- OpenBao transit key ID used to sign
     signature       BYTEA       -- Ed25519 signature over merkle_root + prev_merkle_root
   }
   ```
4. The raw chain rows from the pruned hour are archived to ClickHouse (warm) + SeaweedFS WORM (cold).
5. Raw rows older than 90 days are deleted from PostgreSQL (hot tier).

This reduces PostgreSQL audit table size from unbounded growth to a rolling 90-day window. The Merkle summary provides cryptographic continuity: verifiers can confirm no rows were deleted from a historical period by recomputing the Merkle root from the archived ClickHouse rows.

**3. Per-tenant retention policy**

Retention policy is configurable per tenant (overrides default 7-year warm retention):

```
tenant_audit_retention {
  tenant_id             UUID PK FK
  hot_retention_days    INT DEFAULT 90
  warm_retention_years  INT DEFAULT 7     -- HIPAA minimum; must be >= 6
  cold_retention        ENUM (indefinite, policy_years)
  cold_retention_years  INT NULL          -- if cold_retention = policy_years
  legal_hold            BOOLEAN DEFAULT false  -- if true, cold deletion blocked
}
```

HealthStack tenants default to `warm_retention_years = 7` (HIPAA §164.530(j) minimum). Legal hold flag blocks cold deletion even after retention period expires. Setting `legal_hold = true` requires Auth `audit:legal_hold:write` permission (restricted to tenant admins + CuraOS staff).

**4. PostgreSQL table partitioning**

`audit_events` table is partitioned by:
- Range partition on `timestamp` (monthly partitions, auto-created by pg_partman)
- Sub-partition by `tenant_id` hash (16 buckets per month partition)

This allows partition-level DROP for old hot-tier data without table scans. Index maintenance overhead is bounded to the current + previous month partitions. Partition creation is automated; no manual intervention needed.

**5. ClickHouse ingestion**

Kafka topic `platform.audit.events` is consumed by a ClickHouse Kafka engine table. ClickHouse compresses audit data to approximately 1/10th of PostgreSQL row size (columnar + LZ4/ZSTD). 1.7 TB/month PostgreSQL = ~170 GB/month ClickHouse. 7-year warm retention = ~14 TB ClickHouse for a 1000-tenant deployment at 100 events/s/tenant.

**6. SeaweedFS WORM archive**

Hourly Merkle batches are written to SeaweedFS WORM volumes (write-once, append-only). File naming: `audit/<tenant_id>/<chain_segment>/<year>/<month>/<hour>.parquet`. Parquet format for columnar access during legal discovery. WORM volume is configured with object lock (S3-compatible WORM semantics per SeaweedFS docs).

**7. Audit chain integrity verification**

A scheduled weekly job (`audit-integrity-verifier`) re-reads the `audit_chain_summary` chain and verifies:
- Each summary's Ed25519 signature is valid (OpenBao transit key)
- Each summary's `merkle_root` matches a fresh recomputation from ClickHouse archived rows for that period
- No gaps in summary chain (prev_summary_id linkage is complete)

Verification failures emit a `platform.audit.integrity_failure` event which triggers a PagerDuty alert.

#### ADR amendments

**ADR-0104 amendment:** Add §"Audit retention + pruning strategy" with hot/warm/cold tier table, Merkle-root summary schema, and pg_partman partitioning spec per ADR-0152 §F-018.

**ADR-0120 §6 amendment:** Add: "Audit chain pruning: hourly Merkle-root summary per ADR-0152 §F-018. PostgreSQL hot tier: rolling 90-day window. ClickHouse warm tier: 7 years. SeaweedFS WORM cold tier: indefinite or per tenant retention policy."

#### Action items

- [ ] Add pg_partman extension and partition config for `audit_events` (monthly range + tenant hash sub-partition)
- [ ] Create `audit_chain_summary` table migration
- [ ] Create `tenant_audit_retention` table migration in `settings-service`
- [ ] Implement `audit-pruning-worker`: hourly Merkle computation + ClickHouse archive + SeaweedFS WORM write
- [ ] Implement `audit-integrity-verifier`: weekly chain verification job
- [ ] Configure ClickHouse Kafka engine table for `platform.audit.events` topic
- [ ] Add `platform.audit.integrity_failure` Kafka topic + PagerDuty alert routing
- [ ] Add `audit:legal_hold:write` permission to Cerbos policy set

---

### F-019 — Foundation Product Cross-Dependency Ordering

**Severity (from ADR-0151):** Info
**Affected ADRs:** ADR-0099, ADR-0123

#### Finding restatement

ADR-0099 §12 describes Phase 3 as "Foundation product implementation" without specifying the internal build dependency sequence. ADR-0123 (Codegen) implicitly depends on the other three products being partially built before Codegen recipes can target them. The correct build order is implicit but not stated.

#### Decision

**1. Explicit build dependency graph**

```
Auth (ADR-0120)
│
├── no dependencies on other foundation products
│
Codegen (ADR-0123)
│
├── depends on: Auth (tenant-aware code-gen; Auth MCP server for recipe targeting)
│
Workflow Manager (ADR-0122)
│
├── depends on: Auth (token validation + SMART scopes)
├── depends on: Codegen (workflow.temporal-ts recipe + activepieces-flow recipe)
│
Builder Suite (ADR-0121)
│
├── depends on: Auth (SSO + session management)
├── depends on: Codegen (app.appsmith recipe + app.curaos-native recipe + ui.react-next recipe)
├── depends on: Workflow Manager (Workflow Canvas integration; BPM execution)
```

**2. Phase 3 build sequence**

| Wave | Products | Milestone gate |
|---|---|---|
| Wave 3-A | Auth v0 (NestJS shell + Better Auth + OIDC provider + per-tenant schema) | Auth issues valid JWTs; tenant create/delete works; MCP server responds |
| Wave 3-B (parallel after 3-A) | Codegen v0 (NestJS shell + template engine + first 5 recipes) AND Workflow Manager v0 (Temporal + NestJS shell + tenant task queue routing) | Both unblock independently once Auth is available |
| Wave 3-C | Builder Suite v0 (GrapesJS + Payload CMS + NestJS shell; requires Codegen + Workflow) | Builder can deploy a static site; Workflow Canvas can run a basic workflow |
| Wave 3-D | All four products iterate to v1 quality in parallel | All ADR-defined build sequences (M1–M15 per product ADR) complete |

**3. Parallelization constraints**

- **Do NOT start Codegen recipe implementation before Auth v0 gate passes.** Recipes that scaffold Auth-integrated NestJS services require a running Auth MCP server to validate recipe output.
- **Do NOT start Workflow Manager temporal integration before Auth v0 gate passes.** Temporal workflow context must carry tenant ID from Auth token; without Auth, tenant routing tests are not possible.
- **Do NOT start Builder Suite before Codegen v0 gate passes.** Builder relies on Codegen recipes to emit scaffolded app artifacts. Builder integration tests require recipe execution.
- **Codegen and Workflow Manager CAN parallelize** after Auth v0 (they do not depend on each other in v0).

**4. Shared foundation module (pre-requisite for all)**

Before Wave 3-A begins, a shared `@curaos/foundation-core` NestJS module is published containing:
- Tenant interceptor (extracts `tenant_id` from JWT, validates, attaches to request context)
- Audit interceptor (wraps every service call; emits to Kafka)
- Health check controller
- OpenTelemetry setup

All four foundation products import `@curaos/foundation-core` as their first dependency. This ensures tenant routing and audit patterns are identical across all products from day one. (This is the shared module implied by F-001/F-002 recommendations in ADR-0151; its definition belongs here as a pre-condition of Phase 3.)

**5. AI-agent swarm parallelization**

Given ADR-0099 §12 "solo + AI-agent swarm" execution model, the dependency graph above defines which product agents can be dispatched simultaneously:

- After `@curaos/foundation-core` is published: Auth agent dispatched (solo wave).
- After Auth v0 gate: Codegen agent + Workflow agent dispatched in parallel (2-agent wave).
- After Codegen v0 + Workflow v0 gates: Builder agent dispatched (solo wave with all dependencies available).
- After all v0 gates: All four product agents run in parallel to v1 (4-agent wave).

Maximum parallelism is 2 concurrent agents (Codegen + Workflow in Wave 3-B). Builder is the serialization point at the end.

#### ADR amendments

**ADR-0099 §12 amendment:** Add dependency graph table and Wave 3-A/B/C/D sequence above. Add: "Wave 3-B parallelism: Codegen and Workflow Manager build concurrently after Auth v0. Builder is the final serialization point. Pre-condition: @curaos/foundation-core published before Wave 3-A."

**ADR-0123 §10 build sequence amendment:** Add preamble: "Codegen build sequence begins after Auth v0 milestone gate. Codegen v0 milestone (NestJS shell + template engine + first 5 recipes) is the gate for Builder Suite build start."

#### Action items

- [ ] Define and publish `@curaos/foundation-core` package (tenant interceptor + audit interceptor + health check + OTel setup) before Wave 3-A
- [ ] Define Auth v0 milestone gate criteria (JWT issuance + tenant CRUD + MCP server responding)
- [ ] Define Codegen v0 milestone gate criteria (5 recipes green + MCP server responding)
- [ ] Define Workflow v0 milestone gate criteria (Temporal task queue routing + NestJS shell + MCP server responding)
- [ ] Update ADR-0099 §12 Phase 3 section with wave sequence table
- [ ] Add gate-check step to CI: wave gate tests must pass before next-wave agents are dispatched

---

## Cross-Cutting Amendments Table

| Amended ADR | Section | Change summary |
|---|---|---|
| ADR-0099 §12 | Phase 3 build sequence | Add Wave 3-A/B/C/D dependency graph; add @curaos/foundation-core pre-condition |
| ADR-0099 §14 | MCP server pattern | Replace open question with: "All 4 foundation products expose curated MCP surfaces per ADR-0152 §F-009" |
| ADR-0104 | (new section) | Add audit retention + pruning strategy: hot/warm/cold tiers, Merkle-root summary, pg_partman partitioning |
| ADR-0115 §4.1.3 | FHIR versioning | Replace "experimental opt-in header" with URL path spec + migration timeline per ADR-0152 §F-014 |
| ADR-0115 §4.3.3 | Snowstorm terminology | Add bundle size table, OCI artifact naming, terminology_license schema, Snowstorm Lite conditions |
| ADR-0115 (consent section) | Consent model | Add: "FHIR Consent = clinical record; OpenFGA = enforcement graph; sync event-driven per ADR-0152 §F-017" |
| ADR-0115 (new cross-tenant) | Cross-tenant consent | Add Phase 4 scope note + introspection-time enrichment architecture per ADR-0152 §F-013 |
| ADR-0120 §3.2 | OpenFGA + consent | Add PHI consent authorization subsection; HAPI ConsentInterceptor advisory mode |
| ADR-0120 §4.1 | Cross-tenant federation | Add patient consent federation as distinct from user identity federation per ADR-0152 §F-013 |
| ADR-0120 §6 | Audit chain | Add chain pruning reference: "hourly Merkle-root summary per ADR-0152 §F-018" |
| ADR-0121a §4.6 | Payment integration | Replace deferral note with Stripe Connect primary decision + v1.5 scope declaration |
| ADR-0121a §8 (M12) | Build sequence | Move M12 (payment-gated content) to post-v1.5 milestone marker |
| ADR-0121b §2 | Decision table | Add payment processor row: Stripe Connect primary / Adyen + Square plugin v2+ |
| ADR-0122 | (no direct amendment) | Workflow Manager dependency ordering documented in ADR-0099 §12 amendment |
| ADR-0123 §8 | MCP server | Add: "Implements MCP spec 2025-03-26; tool naming + payload per ADR-0152 §F-011" |
| ADR-0123 §10 | Build sequence | Add: "Begins after Auth v0 milestone gate" |

---

## Open Questions

Three questions remain open after resolving all 9 findings. These do not block Wave 1 foundation implementation but require resolution before the named follow-on milestone.

**OQ-1: Stripe Connect marketplace account approval timeline**
Stripe Connect platform accounts for marketplace payouts require Stripe review (typically 1–4 weeks). This must be initiated during Builder Suite v0 build (M10 per ADR-0121b) to avoid blocking marketplace launch at v1.5. Who initiates the Stripe platform account application? (Business decision, not architecture — flag for commercial team.)

**OQ-2: OpenFGA conditional tuple expiry for time-bounded consent**
FHIR Consent resources can have `provision.period` (start + end date). OpenFGA conditional tuples with timestamp conditions are supported in OpenFGA v1.5+ but have TTL limitations (condition evaluated at query time, not automatically expired). If a consent expires at midnight, the tuple is not auto-deleted. The `consent-openfga-sync-worker` needs a scheduled cleanup job for expired conditional tuples. Architecture is clear; implementation detail to be resolved in healthstack-consent-service design doc.

**OQ-3: SNOMED CT IHTSDO affiliate license procurement for SaaS**
SNOMED CT International Edition requires IHTSDO affiliate membership for SaaS commercial use. The IHTSDO affiliate fee is ~$20,000/year for small organizations (annual revenue < $10M) to ~$500,000/year at large scale. This is a procurement and legal question, not architecture. Must be resolved before any HealthStack tenant can be offered SNOMED CT functionality. Flag for legal/commercial team.

---

## References

- [ADR-0099 — Charter, Vision, Priorities & OSS-Leverage Strategy](0099-charter-priorities-vision.md)
- [ADR-0104 — Identity / Auth DRAFT (audit chain spec)](0104-identity-auth.md)
- [ADR-0113 — Analytics Stack (ClickHouse)](0113-analytics-reporting.md)
- [ADR-0114 — AI / Agent Integration Stack](0114-ai-agent-integration.md)
- [ADR-0115 — HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 — Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 — Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0121a — Foundation Sites](0121a-foundation-sites.md)
- [ADR-0121b — Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121d — Foundation Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0121e — Foundation Forms](0121e-foundation-forms.md)
- [ADR-0122 — Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 — Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- [ADR-0150 — Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 — Wave 2 Cross-Cluster Coherence Scan](0151-cross-cluster-coherence.md)
- [MCP Specification 2025-03-26](https://spec.modelcontextprotocol.io/specification/2025-03-26/)
- [RFC 9449 — OAuth 2.0 DPoP](https://datatracker.ietf.org/doc/rfc9449/)
- [FHIR R4 Consent Resource](https://hl7.org/fhir/R4/consent.html)
- [OpenFGA Authorization Model](https://openfga.dev/docs/configuration-language)
- [SNOMED CT RF2 File Format](https://confluence.ihtsdotools.org/display/DOCRELFMT)
