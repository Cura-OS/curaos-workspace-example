# ADR-0200 — Cluster: Identity + Party + Org + Audit (Wave 1 Lite)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** ADR-0099 / ADR-0100 / ADR-0120 / ADR-0150 / ADR-0151
**Implements:** Wave 1 Lite execution plan

---

## 1. Scope

This ADR binds four tightly coupled identity-domain services into a single cluster decision. Each service has a one-liner role:

| Service | Role |
|---|---|
| **identity-service** | Authoritative Auth/IdP, OIDC, session, RBAC/ABAC/ReBAC, MFA, SCIM, federation. IS the CuraOS Auth foundation product (ADR-0120). |
| **party-service** | Master data registry for persons, organisations, contacts, and location records used across all CuraOS services. |
| **org-service** | Tenant-specific org hierarchy — units, departments, positions, reporting lines, cost centres. Feeds RBAC scopes and analytics. |
| **audit-service** | Immutable, hash-chained audit trail for every service. Consumes Kafka events; persists to PG + WORM SeaweedFS archive. |

All four services are Wave 1 Lite because nothing else in the platform can start without them:
identity → everyone; party → CRM/HR/HealthStack; org → RBAC scopes; audit → compliance baseline.

---

## 2. Shared Cluster Decisions

All four services inherit the full baseline stack. No overrides at cluster level.

| Concern | Decision | Source ADR |
|---|---|---|
| Runtime | NestJS (TypeScript 5.x) | ADR-0100 |
| Primary DB | PG17, schema-per-tenant (`tenant_<id>`), `public.tenants` registry | ADR-0101 |
| Cache | Valkey (Redis-compatible) | ADR-0101 |
| Object storage | SeaweedFS (local); S3-compatible BYO (3rd-party) | ADR-0101 |
| Messaging | Kafka 4 (durable events) + NATS JetStream (low-latency RPC/fan-out); Apicurio schema registry | ADR-0102 |
| API surface | TypeSpec → OpenAPI 3.1 + GraphQL + Connect-RPC; APISIX gateway; SSE + WS + Webhooks | ADR-0103 |
| AuthZ | OPA-WASM (global) + Cerbos PDP sidecar (ABAC) + OpenFGA sidecar (ReBAC) | ADR-0120 |
| Workflow | Temporal TS SDK for sagas; Activepieces for automation flows | ADR-0122 |
| Observability | OTel SDK → Tempo (traces) + VictoriaMetrics (metrics) + Loki (logs) + OpenSearch (search) + Grafana (dashboards) | ADR-0107 |
| Security | OpenBao (secrets); `jose` (JWT); Tink-Node (envelope encryption); Coraza (WAF); Falco + Tetragon (runtime); Wazuh (SIEM); hash-chain audit | ADR-0108 |
| Containers | K3s/Talos nodes; APISIX Ingress; Cilium CNI; ArgoCD/Flux GitOps; Capsule tenancy; vCluster (dev isolation) | ADR-0109 |
| Codegen | NestJS codegen engine + cookbook (Backstage template pattern); `.gen.ts` split convention | ADR-0123 |
| Plugin runtime | WASM (Wasmtime/napi-rs) + NestJS microservice sidecar (NATS) + isolated-vm | ADR-0123 |

**Cluster-level defaults:**

- DB schema naming: `tenant_<uuid>` per tenant; `public` for cross-tenant registry tables.
- Event topic naming: `curaos.<service-name>.<entity>.<event>` (e.g., `curaos.identity.user.created`).
- Every service mounts a `AuditInterceptor` that publishes a structured `AuditEvent` to `curaos.audit.events` Kafka topic.
- Every service registers OTel tracer with service name matching its kebab-case identifier.
- Codegen cookbook recipes cover: NestJS module scaffold, Drizzle schema, TypeSpec/OpenAPI spec, Vitest tests, Temporal workflow shell, AsyncAPI spec.

---

## 3. Per-Service Variants

### 3.1 identity-service

**Primary spec:** ADR-0120. This section captures cluster-ADR integration points only; ADR-0120 remains the canonical source.

**Role in cluster:** Identity is the root dependency. It issues JWTs consumed by every other service and is the OIDC issuer for APISIX gateway validation.

**Key data model (PG, per-tenant schema):**

| Table | Purpose |
|---|---|
| `users` | Core account — UUID, email, phone, status, created_at |
| `credentials` | Argon2id password hash + pepper ref; per-user |
| `mfa_factors` | TOTP secrets (encrypted), WebAuthn credentials, recovery codes |
| `sessions` | Active sessions; revocation list in Valkey |
| `oauth_clients` | Registered OIDC/OAuth2 clients per tenant |
| `federation_configs` | SAML SP / OIDC RP configs per tenant |
| `roles` + `role_assignments` | RBAC role definitions + user assignments |
| `permissions` | Fine-grained resource permissions (Cerbos policy sync) |
| `audit_log` | Local hash-chained log for auth events (mirrors to audit-service) |

**Key events produced** (Kafka, `curaos.identity.*`):

| Topic | Trigger |
|---|---|
| `curaos.identity.user.created` | New user registered or provisioned via SCIM |
| `curaos.identity.user.updated` | Profile, role, or MFA change |
| `curaos.identity.user.deleted` | Hard delete or GDPR erasure request |
| `curaos.identity.session.created` | Successful sign-in |
| `curaos.identity.session.revoked` | Sign-out or token revocation |
| `curaos.identity.federation.linked` | External IdP linked to local account |
| `curaos.identity.audit.event` | Every auth event → also published to `curaos.audit.events` |

**Key APIs:**

- OIDC well-known, JWKS, authorize, token, introspect, revoke, userinfo, device endpoints
- SCIM 2.0 Users + Groups (filter, patch, ETag)
- Admin REST: tenant provisioning, role management, federation config, SMART-on-FHIR config
- GraphQL: user lookup, role query (internal consumer API)

**Integration points in cluster:**

- Consumed by: every service (JWT validation via APISIX + local `jose` verify); org-service (role-scope population); party-service (person identity link); audit-service (actor metadata enrichment)
- Consumes: audit-service (publishes to `curaos.audit.events`); notify-service (magic link, OTP, SCIM welcome email)

**Local + 3rd-party:**

| | Local | 3rd-party |
|---|---|---|
| OIDC provider | Better Auth + node-oidc-provider (NestJS) | Okta / Azure AD / Google Workspace (tenant BYO federation) |
| SAML | node-saml + samlify | External SAML IdP (Ping, ADFS, etc.) |
| Passkeys | SimpleWebAuthn | Platform authenticators (TouchID, Windows Hello, YubiKey) |
| Secrets | OpenBao | AWS Secrets Manager / HCP Vault (BYO) |

**Open questions:**

1. Which OIDC library is primary for issuer surface — Better Auth or node-oidc-provider? (ADR-0120 says "both"; needs v1 scoping decision.)
2. SMART-on-FHIR scope mapper: NestJS module ported from zedwerks — confirm porting scope before HealthStack sprint.

---

### 3.2 party-service

**Role:** Canonical master data hub for persons, organisations, contacts, and location records. Neutral — no clinical data. All HealthStack patient demographics reference a party record.

**Key data model (PG, per-tenant schema):**

| Table | Purpose |
|---|---|
| `parties` | UUID, type (person/org/contact/location), status |
| `identifiers` | External ID records per party (national ID, passport, employee ID, MRN ref) |
| `names` | Structured given/family/preferred names + effective dates |
| `contact_methods` | Email, phone, address — typed, ranked, verified flag |
| `addresses` | Structured postal + geo coordinates |
| `relationships` | Typed party-to-party graph (guardian, employer, next-of-kin, etc.) |
| `merge_log` | Dedup merge/unmerge history; golden record tracking |
| `consent_flags` | Non-clinical consent (marketing, data sharing) |

**Key events produced** (Kafka, `curaos.party.*`):

| Topic | Trigger |
|---|---|
| `curaos.party.party.created` | New party record |
| `curaos.party.party.updated` | Name, contact, or identifier change |
| `curaos.party.party.merged` | Dedup merge completed |
| `curaos.party.relationship.created` | New party relationship |
| `curaos.party.audit.event` | Change events → `curaos.audit.events` |

**Key events consumed:**

| Topic | Purpose |
|---|---|
| `curaos.identity.user.created` | Auto-create or link party record for new user |
| `curaos.org.unit.assigned` | Link party to org unit for enrichment |

**Key APIs:**

- REST: CRUD for parties, identifiers, contact methods, relationships
- GraphQL: fuzzy search, enrichment query (for CRM, HR, HealthStack consumers)
- Merge/unmerge workflow (Temporal saga — cross-service if golden record affects identity-service)
- GDPR subject-rights endpoint (right of erasure, export)

**Integration points in cluster:**

- Feeds: crm-service, hr-service, HealthStack patient-service (party UUID as foreign key), org-service
- Consumes: identity-service (user creation events to link user ↔ party)
- Pushes audit events to: audit-service

**Local + 3rd-party:**

| | Local | 3rd-party |
|---|---|---|
| Search / fuzzy match | OpenSearch (per ADR-0101) | Elasticsearch Cloud (BYO) |
| External CRM/ERP enrichment | integrations-service connector | Salesforce / SAP / HubSpot (via integrations-service) |
| Address validation | Local geocoder (Nominatim/Pelias) | Google Maps / Smarty / Loqate (BYO per tenant) |

**Open questions:**

3. Dedup merge workflow: Temporal saga or in-service state machine? (Recommend Temporal for cross-service consistency — needs confirmation.)
4. Party-to-identity link: is the link table in party-service or identity-service? (Recommendation: `party_id` FK column in identity-service `users` table; party-service holds no auth data.)

---

### 3.3 org-service

**Role:** Tenant-specific organisational hierarchy — units, departments, positions, cost centres, reporting lines. Feeds RBAC scope resolution in identity-service and staffing in hr-service / scheduling.

**Key data model (PG, per-tenant schema):**

| Table | Purpose |
|---|---|
| `org_units` | UUID, name, type (division/dept/team/cost-centre), parent_id (self-ref tree) |
| `positions` | Job titles, FTE count, unit assignment |
| `unit_members` | user_id (from identity-service) + party_id + position + effective dates |
| `cost_allocations` | Cost centre split rules for analytics |
| `tags` | Cross-cutting classification (region, function, etc.) |

**Key events produced** (Kafka, `curaos.org.*`):

| Topic | Trigger |
|---|---|
| `curaos.org.unit.created` | New org unit |
| `curaos.org.unit.updated` | Rename, reparent, or type change |
| `curaos.org.member.assigned` | User/party assigned to unit + position |
| `curaos.org.member.removed` | Assignment end |
| `curaos.org.audit.event` | All changes → `curaos.audit.events` |

**Key events consumed:**

| Topic | Purpose |
|---|---|
| `curaos.identity.user.deleted` | Cascade remove from unit_members |
| `curaos.party.party.merged` | Update party references in unit_members |

**Key APIs:**

- REST: CRUD org units, positions, memberships
- GraphQL: hierarchy query (ancestors, descendants, subtree), scope resolution (which org units does user X manage?)
- Bulk import (CSV/XLSX) via async Temporal workflow
- HRIS sync connector endpoint (integrations-service façade)

**Integration points in cluster:**

- Feeds: identity-service (scope data for RBAC policy evaluation); hr-service; business-projects-service; business-scheduling-service; reports-service
- Consumes: identity-service (user lifecycle events); party-service (party merge events)
- Pushes audit events to: audit-service

**Local + 3rd-party:**

| | Local | 3rd-party |
|---|---|---|
| HRIS sync | integrations-service connector (Activepieces flow) | Workday / BambooHR / SAP SuccessFactors (BYO via integrations-service) |
| Hierarchy storage | PG adjacency list (ltree extension for fast subtree queries) | — (no 3rd-party graph DB in v1; SpiceDB handles ReBAC, not org tree) |

**Open questions:**

5. Hierarchy storage: PG `ltree` vs closure table vs PG recursive CTE — needs benchmarking against expected depth/breadth for large tenants.
6. RBAC scope resolution: does org-service compute scope sets on demand (sync API) or pre-materialize them to Valkey? (Latency budget for APISIX guard call determines answer.)

---

### 3.4 audit-service

**Role:** Platform-wide immutable audit trail. All services emit structured `AuditEvent` messages to `curaos.audit.events` Kafka topic. audit-service is the sole consumer, persists hash-chained records to PG, and archives cold bundles to SeaweedFS with WORM semantics.

**Key data model (PG, per-tenant schema):**

| Table | Purpose |
|---|---|
| `audit_entries` | id (UUIDv7), tenant_id, actor_id, actor_type, action, resource_type, resource_id, timestamp, payload (JSONB), hash_prev, hash_curr, seq |
| `chain_checkpoints` | Periodic checkpoint records for O(log n) verification |
| `retention_policies` | Per-tenant/deployment retention rules (days, archive trigger) |
| `archive_refs` | SeaweedFS object references for archived bundles |

**Hash-chain mechanics:**
- `hash_curr = SHA-256(seq || tenant_id || actor_id || action || resource_id || timestamp || payload || hash_prev)`
- Chain verifiable offline: export entries + recompute chain end-to-end.
- Checkpoint every 10,000 entries; store checkpoint hash in a separate tamper-evident table.

**WORM archive:**
- On retention trigger (configurable; default 90 days active → cold archive): bundle entries into signed NDJSON, compress (zstd), upload to SeaweedFS with object-lock TTL.
- Bundle manifest includes Merkle root of all entry hashes in bundle. cosign-signed manifest stored alongside bundle.

**Key events consumed** (Kafka, `curaos.audit.events`):

All services publish here. Event schema (Apicurio-registered):

```json
{
  "specversion": "1.0",
  "type": "curaos.audit.event",
  "source": "identity-service",
  "tenantId": "<uuid>",
  "actorId": "<uuid>",
  "actorType": "user | service | system",
  "action": "user.created | session.revoked | ...",
  "resourceType": "User | Party | OrgUnit | ...",
  "resourceId": "<uuid>",
  "timestamp": "<ISO8601>",
  "payload": { ... }
}
```

**Key APIs:**

- REST: query audit entries (tenant-scoped, filters: actor, action, resource, time range)
- REST: chain verification endpoint (returns OK/FAIL + first broken link if FAIL)
- REST: export (CSV/JSON, async for large ranges)
- REST: retention policy admin
- GraphQL: audit query surface (for Builder-generated audit dashboards)

**Integration points in cluster:**

- Consumes from: every service via `curaos.audit.events` Kafka topic
- Enriches actor metadata: calls identity-service REST (sync, cached in Valkey) to resolve actor display names at query time (not at ingest — keep ingest hot path minimal)
- Publishes metrics: OTel metrics (entry rate, chain lag, archive lag) → VictoriaMetrics

**Local + 3rd-party:**

| | Local | 3rd-party |
|---|---|---|
| Primary store | PG17 (hash-chained entries) | — (no 3rd-party for primary; integrity requires local control) |
| Archive | SeaweedFS (object lock / WORM) | S3 with Object Lock (BYO per deployment) |
| External compliance forward | — (v1: not in scope) | Splunk / IBM QRadar / AWS CloudTrail (BYO via Activepieces connector, v2) |
| Log search | OpenSearch (full-text on payload JSONB) | Elastic Cloud (BYO) |

**Open questions:**

7. Actor metadata enrichment: cache TTL for actor display name in Valkey? (Suggest 5 min; stale name acceptable for audit display, not for auth.)
8. Chain verification: on-demand endpoint only, or periodic background job that publishes chain health metric? (Recommend background job + OTel gauge `audit.chain.healthy` per tenant.)
9. WORM archive on SeaweedFS: SeaweedFS object lock support is maturing — confirm version + lock API coverage before audit-service sprint start.

---

## 4. Cross-Service Integration (Within Cluster)

```
identity-service
  │
  ├─[curaos.identity.user.created]──────────────────────────────────────────────────────►party-service
  │   party-service creates/links party record; emits curaos.party.party.created
  │
  ├─[curaos.identity.user.deleted]──────────────────────────────────────────────────────►org-service
  │   org-service removes unit_members entries
  │
  ├─[sync REST: scope resolution]───────────────────────────────────────────────────────►org-service
  │   APISIX guard calls org-service to resolve which org units a token's roles cover
  │
  ├─[curaos.audit.events]────────────────────────────────────────────────────────────────►audit-service
  │   all auth events (sign-in, MFA, token issue, revoke, federation, SCIM)
  │
party-service
  ├─[curaos.party.party.merged]──────────────────────────────────────────────────────────►org-service
  │   org-service updates unit_members party references
  │
  ├─[curaos.audit.events]────────────────────────────────────────────────────────────────►audit-service
  │
org-service
  ├─[curaos.org.member.assigned / removed]────────────────────────────────────────────────►identity-service (policy refresh signal)
  │
  ├─[curaos.audit.events]────────────────────────────────────────────────────────────────►audit-service
  │
audit-service
  ├─[sync REST: actor lookup]────────────────────────────────────────────────────────────►identity-service (display name enrichment at query time)
```

**Saga flows (Temporal):**

| Saga | Orchestrator | Steps |
|---|---|---|
| User onboarding | identity-service Temporal worker | 1. Create user; 2. Link/create party; 3. Assign to default org unit; 4. Emit audit events |
| Party merge | party-service Temporal worker | 1. Lock both parties; 2. Merge records; 3. Notify org-service (event); 4. Notify identity-service if user-linked; 5. Emit audit; 6. Unlock |
| GDPR erasure | identity-service Temporal worker | 1. Anonymise user; 2. Anonymise party; 3. Remove org assignments; 4. Write GDPR erasure audit entry (non-erasable) |

---

## 5. Cluster-Level Shared Concerns

### 5.1 Tenant routing

All services enforce tenant context on every request:

- **HTTP:** `X-CURA-TENANT` header (validated by APISIX JWT guard; tenant claim in JWT must match header).
- **PG:** NestJS middleware sets `search_path = tenant_<id>` on every DB connection checkout.
- **Valkey:** key prefix `t:<tenant_id>:` on all cache keys.
- **Kafka:** topic per service is shared; `tenantId` field in CloudEvents envelope is mandatory. Consumers filter by tenant.
- **On-prem/local:** single-tenant; `search_path = app`; no `X-CURA-TENANT` requirement.

### 5.2 Per-service DB schema naming

| Service | Schema (cloud SaaS) | Schema (on-prem) |
|---|---|---|
| identity-service | `tenant_<uuid>` | `app` |
| party-service | `tenant_<uuid>` | `app` |
| org-service | `tenant_<uuid>` | `app` |
| audit-service | `tenant_<uuid>` | `app` |

Cross-tenant registry tables (tenants list, cluster config) live in `public` schema, accessed only by identity-service admin module and audit-service bootstrap.

### 5.3 Event topic naming convention

Pattern: `curaos.<service-name>.<entity>.<verb>` — all lowercase, dots as separators.

Shared cross-cluster topic: `curaos.audit.events` — every service in this cluster AND all future services publish here. audit-service is the sole consumer.

### 5.4 Audit integration per service

Every service MUST:
1. Mount `AuditInterceptor` at controller level (provided by `@curaos/audit-sdk` shared library).
2. Publish `AuditEvent` CloudEvents envelope to `curaos.audit.events` Kafka topic on every mutating operation.
3. Include `correlationId` (OTel trace ID) in every audit event for trace ↔ audit join.
4. NOT write directly to audit-service DB — only via Kafka topic.

### 5.5 Codegen recipe applicability

| Recipe | Applies to |
|---|---|
| `nestjs-service-scaffold` | All 4 services |
| `prisma-schema-tenant` | All 4 services |
| `openapi-spec` | All 4 services |
| `asyncapi-spec` | All 4 services (producer side) |
| `vitest-unit` | All 4 services |
| `temporal-workflow-shell` | identity-service (onboarding/erasure sagas), party-service (merge saga) |
| `wasm-plugin-shell` | identity-service (custom auth rule plugins), audit-service (custom forwarder plugins) |
| `nestjs-sidecar-shell` | audit-service (external compliance forwarder sidecar, v2) |

### 5.6 Plugin / sidecar extension points per service

| Service | Extension point | Mechanism |
|---|---|---|
| identity-service | Custom auth rules (e.g., IP allowlist, device trust) | isolated-vm (tenant JS rules) |
| identity-service | Custom OIDC claim enrichment | WASM plugin (Wasmtime) |
| identity-service | Custom federation attribute mapper | WASM plugin |
| party-service | Custom dedup matching logic | WASM plugin |
| party-service | Address enrichment connector | NestJS microservice sidecar (NATS) |
| org-service | HRIS sync connector | NestJS microservice sidecar (NATS) via Activepieces flow |
| audit-service | External compliance forwarder (v2) | NestJS microservice sidecar (NATS) |
| audit-service | Custom retention policy evaluator | isolated-vm (tenant JS rules) |

---

## 6. Per-Service Tech (Deviations from Baseline)

All four services run the NestJS baseline. No specialist runtime tier (Kotlin/Quarkus, Go, Rust) is required for any service in this cluster.

| Service | Specialist component | Why kept/excluded |
|---|---|---|
| identity-service | None in v1 | Pure NestJS per ADR-0120; Keycloak deferred to v2 |
| party-service | OpenSearch for fuzzy match | Already baseline per ADR-0101; not a deviation |
| org-service | PG `ltree` extension | PG extension, not a runtime deviation; NestJS + Drizzle/Kysely raw SQL helper for ltree ops |
| audit-service | None | PG + SeaweedFS + Kafka consumer — all baseline |

**ORM tier:** All four services use Drizzle by default per [[curaos-orm-rule]]. Audit-service uses typed raw SQL inside the repository for hash-chain insert to ensure atomic `SELECT last_hash → INSERT` within a transaction.

---

## 7. Local + 3rd-Party Summary (Per Service)

| Service | Integratable area | Local default | 3rd-party option |
|---|---|---|---|
| identity-service | Auth core | Better Auth + node-oidc-provider | Okta / Azure AD / Google federation |
| identity-service | Secrets | OpenBao | AWS Secrets Manager / HCP Vault |
| identity-service | MFA delivery (SMS) | notify-service (SMTP/push default) | Twilio / AWS SNS (BYO) |
| party-service | Search | OpenSearch | Elastic Cloud (BYO) |
| party-service | Address validation | Nominatim/Pelias (self-hosted) | Google Maps / Loqate (BYO per tenant) |
| party-service | External CRM/ERP | integrations-service connector | Salesforce / SAP / HubSpot |
| org-service | HRIS sync | integrations-service + Activepieces | Workday / BambooHR / SAP SuccessFactors |
| audit-service | Cold archive | SeaweedFS (object lock) | S3 with Object Lock (BYO) |
| audit-service | Compliance forward (v2) | — | Splunk / QRadar / CloudTrail |
| audit-service | Full-text search | OpenSearch | Elastic Cloud (BYO) |

All provider bindings follow ADR-0150 §2 `ProviderAbstraction` interface pattern: `CuraOSLocalProvider` (default) + `External3rdPartyProvider` (configurable per tenant).

---

## 8. Open Questions (Numbered)

1. **identity-service:** Better Auth vs node-oidc-provider as primary OIDC issuer surface — needs v1 scoping before sprint start. (Both are listed in ADR-0120; primary must be pinned.)
2. **identity-service:** SMART-on-FHIR NestJS port scope — confirm before HealthStack sprint, not Wave 1 Lite blocker.
3. **party-service:** Temporal saga vs in-service state machine for dedup merge workflow.
4. **party-service / identity-service:** Ownership of `party_id` FK — recommend `users.party_id` in identity-service; needs explicit schema decision.
5. **org-service:** PG `ltree` vs closure table vs recursive CTE for hierarchy — benchmark needed at >10k node depth.
6. **org-service:** RBAC scope resolution: on-demand sync API vs Valkey-materialised set — latency budget drives answer; target <5ms for APISIX guard.
7. **audit-service:** Actor display-name cache TTL in Valkey (suggest 5 min).
8. **audit-service:** Chain verification: endpoint-only vs periodic background OTel gauge job.
9. **audit-service:** SeaweedFS object-lock API maturity — verify version + lock coverage before audit-service sprint.

---

## 9. References

| ADR | Title | Relevance |
|---|---|---|
| ADR-0099 | Charter, Priorities, Vision | Charter values; injection-mold metaphor; build sequence |
| ADR-0100 | Foundation Platform Runtime | NestJS mandate; four foundation products |
| ADR-0101 | Data Layer | PG17 schema-per-tenant; Valkey; SeaweedFS |
| ADR-0102 | Event + Messaging | Kafka 4; NATS JetStream; Apicurio; CloudEvents |
| ADR-0103 | API Surface | TypeSpec; APISIX; OpenAPI; GraphQL; Connect-RPC |
| ADR-0107 | Observability | OTel; Tempo; VictoriaMetrics; Loki; Grafana |
| ADR-0108 | Security + Secrets | OpenBao; jose; Tink-Node; Coraza; Falco; hash-chain |
| ADR-0109 | Containers + Orchestration | K3s/Talos; Cilium; ArgoCD; Capsule; vCluster |
| ADR-0120 | Foundation Auth | identity-service primary spec |
| ADR-0122 | Foundation Workflow Manager | Temporal sagas; Activepieces automation |
| ADR-0123 | Codegen + Plugin | Cookbook recipes; WASM + sidecar + isolated-vm |
| ADR-0150 | Baseline Alignment Rules | Local + 3rd-party mandate; NestJS lib swaps |
| ADR-0151 | Cross-Cluster Coherence | F-001 tenant routing; F-016 consent+auth |

**Per-service Requirements docs (workspace-side):**

- `ai/curaos/backend/services/identity-service/Requirements.md`
- `ai/curaos/backend/services/party-service/Requirements.md`
- `ai/curaos/backend/services/org-service/Requirements.md`
- `ai/curaos/backend/services/audit-service/Requirements.md`
