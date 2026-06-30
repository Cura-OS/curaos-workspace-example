# ADR-0201 — Cluster: Platform Shared Services

**Status:** Accepted
**Date:** 2026-05-24
**Wave:** Wave 1 Lite — Cluster A
**Parent baseline:** [ADR-0100 Runtime](0100-foundation-platform-runtime.md) · [ADR-0101 Data](0101-data-layer.md) · [ADR-0102 Events](0102-event-messaging.md) · [ADR-0103 API](0103-api-surface.md) · [ADR-0107 Observability](0107-observability.md) · [ADR-0108 Security](0108-security-secrets.md) · [ADR-0110 CI/CD+Flags](0110-cicd-release.md) · [ADR-0120 Auth](0120-foundation-auth.md) · [ADR-0122 Workflow](0122-foundation-workflow-manager.md) · [ADR-0123 Codegen](0123-foundation-codegen-plugin.md) · [ADR-0150 Baseline Rules](0150-baseline-alignment-rules.md)

---

## 1. Scope

Five neutral-capability services. All reusable across every vertical overlay (HealthStack, EducationStack, ERP). No vertical logic lands here.

| Service | Primary job |
|---|---|
| `notify-service` | Multi-channel notification delivery: email, push, SMS, in-app, webhooks |
| `storage-service` | File management on SeaweedFS; signed URLs; virus scan; lifecycle tiers |
| `search-service` | Cross-service OpenSearch indexer + query API; hybrid BM25 + vector |
| `settings-service` | Tenant + per-user settings storage; feature flags (Unleash) |
| `reports-service` | On-demand + scheduled report generation; Gotenberg PDF; Superset embedded |

---

## 2. Shared Cluster Decisions

All five services inherit the full canonical baseline. The decisions below apply to every service in this cluster unless a per-service section explicitly overrides.

### 2.1 Runtime

NestJS (TypeScript) per ADR-0100. Fastify adapter. `@nestjs/microservices` for event consumers (Kafka + NATS transports). Each service is a **NestJS modulith** deployable standalone or embedded in a parent monolith per tenant profile.

### 2.2 Data layer

PostgreSQL 17 (schema-per-tenant) per ADR-0101. Valkey for hot cache + pub/sub. SeaweedFS for blob/object storage. OpenSearch for full-text + vector indexes. Drizzle schema + drizzle-kit migrations by default per [[curaos-orm-rule]]. No service reaches into another service's schema — read via event or TypeSpec-generated client.

### 2.3 Events

Kafka 4 (durable, cross-service) + NATS JetStream (low-latency, intra-cluster) per ADR-0102. Outbox pattern via `@nestjs/schedule` + PG outbox table for every domain event. AsyncAPI 3 schema registry per ADR-0103. Dead-letter queue (DLQ) on every consumer with alerting.

### 2.4 API surface

TypeSpec-first per ADR-0103. REST primary (Fastify). GraphQL sidecar (`@nestjs/graphql` + Apollo) for consumer queries. SSE endpoint for real-time push (notify-service in-app channel). All external-facing routes protected by NestJS Guards → Cerbos ABAC → OPA-WASM per ADR-0120.

### 2.5 Auth + tenant routing

JWT Bearer. `X-Tenant-ID` claim extracted by shared `TenantInterceptor` NestJS module (per ADR-0151 F-001 fix direction). Tenant routes to correct PG schema + Kafka partition key + OpenSearch index prefix. PHI boundaries enforced at service + schema boundary (overlay-only data never in neutral schemas).

### 2.6 Provider abstraction

Every integratable area exposes a typed NestJS provider interface (per ADR-0150 §2). Two default implementations per interface:
- `CuraOSLocal<Provider>` — default, self-hosted OSS component.
- `External<Provider>` — configurable per tenant via `settings-service` tenant config key.

Runtime config (`PROVIDER_<AREA>=local|external`) selects implementation. No conditional branching in business logic.

### 2.7 Observability

OTel SDK on every service per ADR-0107. Structured JSON logs → Loki. Spans → Tempo. Metrics → VictoriaMetrics. Grafana dashboards per service + cluster rollup. Every Kafka consumer emits `consumer.lag`, `dlq.count`, `processing.duration_ms`.

### 2.8 Security gates

Pre-commit: Gitleaks + Semgrep. SBOM: Syft on every image. Image scan: Trivy. Runtime: Falco + Wazuh per ADR-0108. OpenBao secrets injection at pod startup (never env vars for secrets).

### 2.9 Codegen scaffolding

Each service generated from ADR-0123 cookbook recipes: NestJS CRUD module + Drizzle schema + TypeSpec REST spec + AsyncAPI event spec + Vitest unit + integration test scaffold + Temporal workflow shell.

---

## 3. Per-Service Decisions

---

### 3.1 notify-service

#### Purpose

Abstracts all outbound notification channels behind a single internal API. Upstream services emit `notification.requested` events or call the TypeSpec REST endpoint; notify-service handles routing, templating, deduplication, delivery, and retry.

#### 3.1.1 Data model (key tables, schema-per-tenant)

| Table | Purpose |
|---|---|
| `notification_templates` | Channel + locale + content (Handlebars body); versioned |
| `notification_queue` | Outbox rows: channel, recipient, template_ref, payload, status, attempt_count |
| `notification_log` | Immutable delivery log: timestamp, channel, status, provider_response |
| `notification_preferences` | Per-user per-channel opt-out + quiet-hours config |
| `webhook_subscriptions` | Tenant-registered webhook endpoints + secret + retry policy |

#### 3.1.2 Channels + providers

| Channel | Local default | 3rd-party BYO |
|---|---|---|
| Email | Postfix + Haraka relay (self-hosted) | SendGrid / Postmark / Mailgun (per-tenant SMTP or API key via OpenBao) |
| Push (mobile) | Expo Push Notifications OSS server | OneSignal / FCM direct (BYO FCM credentials) |
| SMS | **No default** — HIPAA risk; PHI must not transit SMS without explicit consent + BAA | Twilio / Vonage (non-PHI only; BAA required for PHI tenants; explicit tenant opt-in) |
| In-app | SSE stream on `/notifications/stream` (NestJS EventSource) | — (first-party only; SSE not delegated) |
| Webhooks | Self-hosted signed retry queue (HMAC-SHA256, BullMQ, exponential backoff) | — (first-party; tenant registers endpoint) |

SMS for PHI tenants: disabled by default. Tenant operator must enable via `settings-service` flag `notify.sms.phi_enabled=true` with documented consent trail.

#### 3.1.3 Key events (Kafka topics)

| Topic | Direction | Producer → Consumer |
|---|---|---|
| `curaos.notify.requested.v1` | Inbound | Any service → notify-service |
| `curaos.notify.delivered.v1` | Outbound | notify-service → audit, analytics |
| `curaos.notify.failed.v1` | Outbound | notify-service → ops alerts, DLQ |
| `curaos.notify.preference.updated.v1` | Inbound | user-service → notify-service (preference sync) |
| `curaos.webhook.delivered.v1` | Outbound | notify-service → tenant integration log |

#### 3.1.4 Key API endpoints (TypeSpec)

```
POST /notifications           # enqueue single notification (REST fast-path)
POST /notifications/batch     # bulk enqueue
GET  /notifications/{id}      # delivery status
GET  /notifications/stream    # SSE in-app stream (authenticated user)
GET  /templates               # list templates
PUT  /templates/{id}          # upsert template + locale variant
GET  /preferences/{userId}    # user preferences
PUT  /preferences/{userId}    # update preferences
POST /webhooks/subscriptions  # register webhook endpoint
DEL  /webhooks/subscriptions/{id}
```

#### 3.1.5 Integration points

- Consumes `curaos.notify.requested.v1` from any upstream service (party, task, order, clinical, workflow).
- Reads template locale from `settings-service` (tenant default locale).
- Emits to audit-service via `curaos.notify.delivered.v1`.
- Push tokens stored in `notify-service` schema (not identity-service); synced via `curaos.user.device.registered.v1`.
- Webhook delivery state tracked in `notification_queue`; success ACK removes row, failure retries via BullMQ queue `notify-webhook-retry`.

#### 3.1.6 HIPAA notes

- Email body: no PHI in default templates. PHI summary links back to app (click-through auth required).
- Push: no PHI in notification payload. Deep-link only.
- SMS: disabled for PHI by default (see §3.1.2).
- In-app SSE: PHI-safe (authenticated stream, TLS, no persistence outside DB).

---

### 3.2 storage-service

#### Purpose

Manages all binary/blob storage. Issues signed URLs for direct client upload/download. Runs virus scan pipeline. Manages lifecycle tiers (hot → warm → cold). Enforces per-tenant bucket isolation. WORM retention for HIPAA audit files.

#### 3.2.1 Data model

| Table | Purpose |
|---|---|
| `storage_objects` | Metadata: tenant_id, bucket, key, size, mime_type, checksum (SHA-256), scan_status, lifecycle_tier, retention_until |
| `storage_access_log` | Immutable access log: object_id, actor_id, action (upload/download/delete), timestamp |
| `storage_policies` | Per-tenant per-bucket retention policy; WORM flag; cold-tier transition rules |
| `virus_scan_results` | Scan engine, result, timestamp, quarantine path |

#### 3.2.2 Storage providers

| Layer | Local default | 3rd-party BYO |
|---|---|---|
| Object store | SeaweedFS (self-hosted, S3-compatible API) per ADR-0101 | AWS S3 / Backblaze B2 / Wasabi (S3-compatible; per-tenant credentials via OpenBao) |
| Virus scan | ClamAV (self-hosted, open source) OR Trivy FS scan | VirusTotal API / Cloudmersive (BYO API key) |
| Cold tier | SeaweedFS volume TTL + rack awareness | S3 Glacier / Backblaze B2 cold (BYO; lifecycle rule emitted to provider) |

HIPAA WORM: `storage_policies.worm=true` locks object for `retention_until` duration. Delete API returns 403 on locked objects. Audit files (e-sign, clinical docs) default to WORM=true, 7-year retention.

#### 3.2.3 Key events (Kafka topics)

| Topic | Direction | Producer → Consumer |
|---|---|---|
| `curaos.storage.object.uploaded.v1` | Outbound | storage-service → search-service (index metadata), notify-service (upload confirmation), clinical (doc ready) |
| `curaos.storage.object.quarantined.v1` | Outbound | storage-service → notify-service (alert), ops |
| `curaos.storage.object.deleted.v1` | Outbound | storage-service → search-service (deindex), audit |
| `curaos.storage.lifecycle.transitioned.v1` | Outbound | storage-service → ops metrics |

#### 3.2.4 Key API endpoints (TypeSpec)

```
POST /objects/upload-url       # issue presigned upload URL (direct-to-store)
POST /objects/download-url     # issue presigned download URL (time-limited)
GET  /objects/{id}             # metadata
DEL  /objects/{id}             # delete (WORM check enforced)
GET  /objects/{id}/scan        # virus scan status
POST /objects/{id}/reprocess   # re-trigger scan pipeline
GET  /buckets                  # list tenant buckets
POST /buckets/{id}/policy      # set retention / WORM / lifecycle policy
```

#### 3.2.5 Integration points

- Presigned URL flow: client uploads directly to SeaweedFS/S3; storage-service verifies checksum post-upload and emits `uploaded` event.
- Virus scan pipeline: BullMQ worker `storage-scan` picks up new object → ClamAV → sets `scan_status`; quarantine on threat.
- Clinical docs: HealthStack overlay registers listener on `curaos.storage.object.uploaded.v1` filtered by `mime_type=application/pdf AND bucket_prefix=clinical/`.
- Reports PDF: reports-service writes rendered PDF → storage-service via internal API → gets signed download URL back.

---

### 3.3 search-service

#### Purpose

Cross-service full-text + hybrid BM25+vector search. CDC-fed indexer from PG via Debezium. Per-tenant index isolation. Faceted + filtered query API. Optional AI-powered semantic re-ranking.

#### 3.3.1 Data model

OpenSearch indexes (not PG tables). Per-tenant index naming convention: `{tenant_id}.{domain}.{entity}` (e.g., `acme.identity.party`). Index aliases enable zero-downtime reindex.

| Index alias | Source domain | Key fields indexed |
|---|---|---|
| `{tid}.identity.party` | party-service | name, email, phone, tags, role |
| `{tid}.clinical.encounter` | encounter-service (HealthStack) | patient_id, date, diagnosis_codes, note_excerpt |
| `{tid}.documents.storage` | storage-service | filename, mime_type, tags, upload_date |
| `{tid}.tasks.task` | task-service | title, assignee, status, due_date |
| `{tid}.reports.report` | reports-service | title, tags, created_by, created_at |

Schema is open: new domains register index mappings via `search-service` admin API without code changes.

#### 3.3.2 Search stack

| Component | Local default | 3rd-party BYO |
|---|---|---|
| Search engine | OpenSearch 2 self-hosted per ADR-0101 | Algolia / Elastic Cloud / Meilisearch Cloud (BYO API key) |
| CDC source | Debezium 3 (Kafka Connect) per ADR-0102 | — (Debezium is infra-layer; BYO replaces OpenSearch target only) |
| Hybrid vector | ParadeDB `pg_search` + `pgvector` on PG17 (BM25 + ANN) | OpenSearch k-NN plugin (built-in on self-hosted) |
| Semantic rerank | vLLM embedding model per ADR-0114 (opt-in) | OpenAI `text-embedding-3-small` / Cohere Embed (BYO) |

ParadeDB note: ParadeDB `pg_search` + `pgvector` extension runs on the PG17 cluster per ADR-0101. Used for single-domain hybrid search (within one service's schema). Cross-service federated search routes through OpenSearch after CDC sync.

> **M11 search-revisit amendment (2026-06-03, #327):** ADR-0101 DA13 Q4 removed OpenSearch from the v1 stack; the scheduled HealthStack M11 revisit has now **fired (RESOLVED-EVAL)**. The tiered split this section already encodes is **confirmed** — PG-only `pg_search`/`pgvector` stays the single-domain default; **OpenSearch 2.x is the opt-in Tier 2** federated/clinical indexer re-introduced at M11 for M12 cross-service clinical-doc search. Evidence + go/no-go: [m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md); amendment owner: [ADR-0101 § Search M11 revisit amendment](0101-data-layer.md#search-m11-revisit-amendment-2026-06-03-327). Implementation lands in a `foresight` follow-on search-service Story gated on M11 activation.

#### 3.3.3 Key events (Kafka topics)

| Topic | Direction | Producer → Consumer |
|---|---|---|
| `curaos.search.index.requested.v1` | Inbound | Any service → search-service (manual re-index trigger) |
| `curaos.search.index.completed.v1` | Outbound | search-service → ops monitoring |
| `curaos.search.index.error.v1` | Outbound | search-service → DLQ, ops alert |
| CDC topics (via Debezium) | Inbound | PG WAL → Kafka → search-service Kafka consumer → OpenSearch bulk index |

#### 3.3.4 Key API endpoints (TypeSpec)

```
POST /search                      # federated cross-domain query
POST /search/{domain}             # single-domain query
POST /search/suggest              # autocomplete (prefix + fuzzy)
POST /admin/indexes               # register new index mapping
PUT  /admin/indexes/{alias}/reindex  # trigger full reindex
GET  /admin/indexes/{alias}/status   # index health, doc count, lag
DEL  /admin/indexes/{alias}/docs/{id}  # hard-delete doc (GDPR)
```

#### 3.3.5 Integration points

- Debezium connectors configured per-domain via `search-service` admin API; connector config stored in Kafka Connect cluster (per ADR-0102).
- GDPR right-to-erasure: party-service emits `curaos.party.erasure.requested.v1`; search-service consumer hard-deletes all matching docs across tenant indexes.
- AI reranking: optional `rerank=true` param routes result set to vLLM embedding API (per ADR-0114) for semantic score fusion.

---

### 3.4 settings-service

#### Purpose

Canonical store for tenant configuration and per-user preferences. Feature flag integration (Unleash local / LaunchDarkly / Flagsmith BYO). OPA policy hooks for settings access control. Single source of truth consumed by all other services at startup and runtime.

#### 3.4.1 Data model

| Table | Purpose |
|---|---|
| `settings_tenant` | Tenant-level key-value with schema validation (JSON Schema per key namespace) |
| `settings_user` | Per-user preference key-value (overrides tenant default for same key) |
| `settings_defaults` | Platform-shipped default values per key namespace (read-only, shipped with service) |
| `settings_audit` | Immutable log of every write: actor_id, key, old_value_hash, new_value_hash, timestamp |
| `feature_flag_overrides` | Local Unleash toggle state cache + per-tenant override map |

Key namespacing: `{service}.{area}.{key}` (e.g., `notify.sms.phi_enabled`, `storage.worm.default_retention_days`, `search.rerank.enabled`).

#### 3.4.2 Feature flag stack

| Component | Local default | 3rd-party BYO |
|---|---|---|
| Feature flags | Unleash self-hosted per ADR-0110 | LaunchDarkly / Flagsmith Cloud (BYO SDK key) |
| Flag evaluation | Unleash Node SDK embedded in settings-service | LaunchDarkly Node SDK (swap via `FLAG_PROVIDER=launchdarkly`) |

Flag resolution order: platform default → tenant override → user override. Settings-service is the single resolution point; other services call settings-service (or use its published Valkey cache key) — they do not embed flag SDKs directly.

#### 3.4.3 OPA policy hooks

Settings keys marked `policy_protected=true` require OPA policy evaluation before write. OPA-WASM bundle per ADR-0120/0123 loaded at startup. Example policy: only `role=tenant_admin` may set `notify.sms.phi_enabled=true`.

#### 3.4.4 Key events (Kafka topics)

| Topic | Direction | Producer → Consumer |
|---|---|---|
| `curaos.settings.tenant.updated.v1` | Outbound | settings-service → all services (invalidate local cache) |
| `curaos.settings.flag.toggled.v1` | Outbound | settings-service → all services (hot reload flag state) |
| `curaos.settings.user.updated.v1` | Outbound | settings-service → notify-service (preference changes), search-service |

#### 3.4.5 Key API endpoints (TypeSpec)

```
GET  /settings/tenant/{key}             # resolve key (tenant + user merged)
PUT  /settings/tenant/{key}             # set tenant value (OPA enforced)
DEL  /settings/tenant/{key}             # reset to default
GET  /settings/user/{userId}/{key}      # user preference
PUT  /settings/user/{userId}/{key}      # set user preference
GET  /settings/flags                    # all flag evaluations for current tenant+user
GET  /settings/flags/{flagKey}          # single flag evaluation
POST /admin/settings/schema/{namespace} # register key namespace + JSON Schema
```

#### 3.4.6 Caching strategy

Valkey: every resolved key cached at `settings:{tenant_id}:{key}` with TTL 60 s. `curaos.settings.*.updated.v1` events trigger immediate Valkey key invalidation via NATS JetStream (low-latency path). Services may hold a local in-process cache of flag states with 5 s TTL before re-querying Valkey.

#### 3.4.7 Integration points

- All five cluster services call settings-service at startup to load tenant config.
- Notify-service reads `notify.{channel}.enabled`, `notify.sms.phi_enabled`, default locale.
- Storage-service reads `storage.worm.default_retention_days`, `storage.cold_tier.transition_days`.
- Search-service reads `search.rerank.enabled`, `search.provider`.
- Reports-service reads `reports.pdf.engine`, `reports.superset.embedded_url`.

---

### 3.5 reports-service

#### Purpose

On-demand and scheduled report generation across all CuraOS domains. Pulls data via TypeSpec-generated API clients (never direct DB access into other schemas). Renders PDF via Gotenberg. Serves embedded Superset dashboards. Per-tenant report library with access control.

#### 3.5.1 Data model

| Table | Purpose |
|---|---|
| `report_definitions` | Report template: name, query spec, output format, schedule cron, owner, access policy |
| `report_runs` | Run log: definition_id, triggered_by (user/schedule/event), status, started_at, completed_at, storage_object_id (output file) |
| `report_schedules` | Cron-based schedule config per definition; NestJS schedule job metadata |
| `report_subscriptions` | Users subscribed to receive report on completion (notified via notify-service) |
| `report_library` | Published report catalog per tenant with RBAC tags |

#### 3.5.2 Report generation stack

| Component | Local default | 3rd-party BYO |
|---|---|---|
| PDF rendering | Gotenberg 8 (self-hosted Docker sidecar) per ADR-0113 | Puppeteer Cloud / wkhtmltopdf (rarely needed; Gotenberg preferred) |
| Dashboard embed | Apache Superset self-hosted per ADR-0113; row-level security via Superset guest token | Metabase Cloud / Grafana Cloud (BYO embed token) |
| Query data source | TypeSpec-generated HTTP clients targeting other CuraOS services | External JDBC/ODBC via Superset native connectors (BYO) |
| Schedule runner | `@nestjs/schedule` + BullMQ per ADR-0102 | Temporal cron (for long-running report workflows; opt-in per ADR-0122) |

Gotenberg: stateless HTTP PDF microservice (LibreOffice + Chromium). `reports-service` POSTs HTML/markdown + assets; receives PDF binary; uploads to `storage-service`; returns signed download URL.

#### 3.5.3 Key events (Kafka topics)

| Topic | Direction | Producer → Consumer |
|---|---|---|
| `curaos.reports.run.completed.v1` | Outbound | reports-service → notify-service (email + in-app), storage-service (register object) |
| `curaos.reports.run.failed.v1` | Outbound | reports-service → notify-service (alert), ops DLQ |
| `curaos.reports.scheduled.v1` | Inbound | schedule trigger → reports-service |
| `curaos.reports.definition.published.v1` | Outbound | reports-service → search-service (index report catalog) |

#### 3.5.4 Key API endpoints (TypeSpec)

```
POST /reports/run                        # trigger on-demand run
GET  /reports/runs/{runId}               # status + download URL when complete
GET  /reports/runs/{runId}/download      # redirect to storage signed URL
GET  /reports/definitions                # list tenant report library
POST /reports/definitions                # create/register report definition
PUT  /reports/definitions/{id}           # update
DEL  /reports/definitions/{id}           # delete
POST /reports/definitions/{id}/schedule  # set cron schedule
GET  /reports/embed/{dashboardId}        # Superset guest token for embedded dashboard
```

#### 3.5.5 Integration points

- Data pull: report definitions reference TypeSpec operation IDs from target services. Codegen (ADR-0123) emits typed HTTP client per operation. Report runner calls client → serializes → passes to template.
- PDF pipeline: HTML template (Nunjucks per ADR-0123) rendered server-side → POST to Gotenberg → PDF blob → POST to storage-service upload API → object stored → `run.completed` event with `storage_object_id`.
- Superset embed: guest token endpoint calls Superset REST API (`/api/v1/security/guest_token`); token scoped to tenant RLS filter. Dashboard URL + token returned to frontend for iframe embed.
- Notify on completion: `run.completed` event consumed by notify-service; sends email + in-app to `report_subscriptions` list.
- HealthStack reports: overlay registers FHIR-sourced report definitions (e.g., population health, quality measures) in report library. Same pipeline; data pull uses HAPI FHIR REST client.

---

## 4. Cross-Service Integration Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Platform Shared Services Cluster                  │
│                                                                     │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐  │
│  │ notify-service │     │storage-service │     │ search-service │  │
│  │                │     │                │     │                │  │
│  │ ← notify.      │     │ ← upload       │     │ ← CDC (Debez.) │  │
│  │   requested    │     │   (presigned)  │     │   from all PG  │  │
│  │                │     │ → uploaded.v1  │     │   schemas      │  │
│  │ → delivered.v1 │     │ → quarantined  │     │ → indexed.v1   │  │
│  └────────┬───────┘     └────────┬───────┘     └────────────────┘  │
│           │                      │                                  │
│           │ notify on             │ store PDF output                 │
│           │ run.completed         │                                  │
│           ▼                      ▼                                  │
│  ┌────────────────┐     ┌────────────────┐                          │
│  │ reports-service│────▶│settings-service│                          │
│  │                │     │                │                          │
│  │ PDF → Gotenberg│     │ flag resolution│                          │
│  │ embed → Superset│    │ config cache   │                          │
│  │ data pull via  │     │ (Valkey TTL)   │                          │
│  │ typed clients  │     └────────────────┘                          │
│  └────────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘

External producers → notify.requested: identity, task, order, clinical,
                                       workflow, e-sign, any overlay
CDC sources → search indexes: party, encounter, task, storage, reports
```

### 4.1 Shared event bus contracts

All five services share the `curaos.platform.*` Kafka namespace. AsyncAPI 3 schemas registered in schema registry (per ADR-0102). Breaking schema changes require version bump + 30-day sunset of old version. Consumer groups named `{service}-{topic-suffix}-cg`.

### 4.2 Tenant isolation enforcement

| Layer | Mechanism |
|---|---|
| PG | Schema-per-tenant; `search_path` set by TenantInterceptor on connection checkout |
| Kafka | Partition key = `tenant_id`; consumer group offset scoped per topic partition |
| OpenSearch | Index prefix = `{tenant_id}.`; query filter `term: {tenant_id}` on all cross-tenant indexes |
| Valkey | Key prefix `settings:{tenant_id}:` + `notify:{tenant_id}:` etc. |
| Signed URLs | JWT claim `tenant_id` verified in storage-service before presigning |
| SeaweedFS | Volume tag `tenant={tenant_id}`; replication rack = tenant data-residency zone |

---

## 5. Cluster-Level Shared Concerns

### 5.1 HIPAA readiness

| Control | Implementation |
|---|---|
| PHI in email/SMS | Disabled by default; click-through auth links only |
| File retention (WORM) | `storage_policies.worm=true` for clinical, audit, e-sign buckets |
| Audit log | Hash-chained PG rows on every write in notify + storage + settings + reports |
| Access log | `storage_access_log` immutable; 7-year retention per HIPAA §164.312 |
| Encryption at rest | SeaweedFS volume encryption; PG TDE via `pgcrypto`; OpenBao-managed keys |
| BAA | SMS provider BAA required before `notify.sms.phi_enabled=true` can be set |

### 5.2 GDPR / right-to-erasure

1. `party-service` emits `curaos.party.erasure.requested.v1` with `party_id`.
2. Each service in cluster handles erasure consumer:
   - `notify-service`: purges `notification_preferences`, anonymizes `notification_log`.
   - `storage-service`: deletes objects not under WORM; marks WORM objects as pending expiry.
   - `search-service`: hard-deletes docs across all tenant indexes for that party.
   - `settings-service`: purges `settings_user` rows for that user.
   - `reports-service`: purges `report_subscriptions`; anonymizes `report_runs` actor field.
3. Erasure completion event `curaos.party.erasure.completed.v1` emitted per service; aggregated by compliance-service (future cluster).

### 5.3 Rate limiting + backpressure

All five services expose rate-limit headers per RFC 9110. NestJS `ThrottlerModule` (per ADR-0100) + Redis/Valkey sliding window. Kafka consumer backpressure: `pause()` / `resume()` on partition when BullMQ queue depth exceeds configured threshold.

### 5.4 Local + 3rd-party summary

| Service | Local default | 3rd-party BYO |
|---|---|---|
| notify (email) | Postfix + Haraka | SendGrid / Postmark / Mailgun |
| notify (push) | Expo OSS server | OneSignal / FCM |
| notify (SMS) | None (HIPAA gate) | Twilio / Vonage (non-PHI / BAA) |
| storage | SeaweedFS (S3 API) | AWS S3 / Backblaze B2 / Wasabi |
| storage (scan) | ClamAV | VirusTotal API |
| search | OpenSearch 2 | Algolia / Elastic Cloud / Meilisearch |
| search (vector) | pgvector + ParadeDB | OpenSearch k-NN |
| search (embed) | vLLM (opt-in) | OpenAI / Cohere |
| settings (flags) | Unleash self-hosted | LaunchDarkly / Flagsmith |
| reports (PDF) | Gotenberg 8 | Puppeteer Cloud |
| reports (dashboard) | Apache Superset | Metabase Cloud / Grafana Cloud |

---

## 6. Per-Service Tech Stack Summary

All five services are NestJS (TypeScript) with the following per-service additions:

| Service | Key NestJS modules / libs | External sidecars |
|---|---|---|
| notify | `@nestjs/bull` (BullMQ), `nodemailer`, `expo-server-sdk`, `twilio` (opt-in) | Postfix/Haraka, Expo OSS |
| storage | `@aws-sdk/client-s3` (S3-compatible), `multer`, `formidable` | SeaweedFS, ClamAV, Trivy |
| search | `@opensearch-project/opensearch`, `kafka-connect-debezium` (infra) | OpenSearch, Debezium/Kafka Connect |
| settings | `unleash-client`, `opa-wasm` | Unleash server, OPA-WASM bundle |
| reports | `@nestjs/schedule`, `@nestjs/bull`, `nunjucks`, `got` (Gotenberg HTTP) | Gotenberg 8, Apache Superset |

---

## 7. Open Questions

| # | Service | Question | Resolution target |
|---|---|---|---|
| OQ-01 | notify | Expo OSS server supports web push (VAPID)? Or need separate web-push lib (`web-push` npm)? | Spike in Phase 1 impl |
| OQ-02 | notify | In-app SSE: Redis Pub/Sub via Valkey for multi-instance fan-out, or NATS JetStream subject per user? | Decide before notify-service impl |
| OQ-03 | storage | Virus scan async (post-upload background) vs sync (block upload until scanned)? | Risk trade-off: recommend async with quarantine hold |
| OQ-04 | search | Debezium connector per domain service, or single connector per PG cluster with topic routing? | Single connector preferred (less Kafka Connect overhead) |
| OQ-05 | search | ParadeDB `pg_search` vs OpenSearch for single-domain queries — perf threshold for routing decision? | Benchmark in search-service spike |
| OQ-06 | settings | Settings-service as sidecar embedded in each service vs standalone microservice vs shared NestJS module? | Standalone preferred; shared module as client SDK |
| OQ-07 | reports | Superset embedded: row-level security (RLS) granularity — per-tenant only or per-user within tenant? | Per-tenant default; per-user RLS in v2 |
| OQ-08 | reports | Long-running reports (10+ min) — Temporal cron workflow vs BullMQ delayed job? | Temporal for >5 min; BullMQ for ≤5 min |

---

## 8. References

| ADR | Title |
|---|---|
| [ADR-0099](0099-charter-priorities-vision.md) | Charter, Priorities, Vision |
| [ADR-0100](0100-foundation-platform-runtime.md) | Foundation Platform Runtime (NestJS) |
| [ADR-0101](0101-data-layer.md) | Data Layer (PG17 / Valkey / SeaweedFS / OpenSearch) |
| [ADR-0102](0102-event-messaging.md) | Event + Messaging (Kafka 4 / NATS / BullMQ / Debezium) |
| [ADR-0103](0103-api-surface.md) | API Surface (TypeSpec / REST / GraphQL / SSE) |
| [ADR-0107](0107-observability.md) | Observability (OTel / Loki / Tempo / VictoriaMetrics / Grafana) |
| [ADR-0108](0108-security-secrets.md) | Security + Secrets (OpenBao / Trivy / Falco / Coraza) |
| [ADR-0110](0110-cicd-release.md) | CI/CD + Release (GitHub Actions / Unleash / Renovate) |
| [ADR-0113](0113-analytics-reporting.md) | Analytics + Reporting (ClickHouse / Superset / Gotenberg) |
| [ADR-0120](0120-foundation-auth.md) | Foundation Auth (Better Auth / Cerbos / OPA / SpiceDB) |
| [ADR-0122](0122-foundation-workflow-manager.md) | Foundation Workflow Manager (Temporal / Activepieces) |
| [ADR-0123](0123-foundation-codegen-plugin.md) | Foundation Codegen + Plugin Architecture |
| [ADR-0150](0150-baseline-alignment-rules.md) | Baseline Alignment Rules (NestJS propagation + local/3rd-party) |
| [ADR-0151](0151-cross-cluster-coherence.md) | Wave 2 Cross-Cluster Coherence Scan |


---

## 2026-06-01 — Scope boundary widened (user override)

M10 platform-shared-services wave includes **calendar-core-service + tasks-core-service** (pulled forward from ADR-0203) in addition to the 5 services above, per user decision 2026-06-01 (Epic #24 seed). They inherit this ADR's §2 shared baseline; their domain models come from ADR-0203 §4. See AUTO-DECISION-LOG.md.
