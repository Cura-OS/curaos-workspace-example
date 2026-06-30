# ADR-0113 — Analytics, Reporting, and Data Warehouse Stack

> **✅ ACCEPTED** — aligned with [ADR-0150](0150-baseline-alignment-rules.md) §5 (STANDS). ClickHouse + Iceberg + SQLMesh + Superset + Cube.dev + ECharts + Jobrunr (replaced by NestJS schedule + BullMQ + Temporal per 0102 addendum) + Gotenberg + Pathling + OpenDP all stand at infrastructure level. Local + 3rd-party rule applies (Snowflake / BigQuery / Databricks / Metabase Cloud as 3rd-party options).


**Status:** Accepted
**Date:** 2026-05-24
**Deciders:** Platform Engineering, Data Engineering, Clinical Informatics, Compliance, Security
**Supersedes:** —
**Related ADRs:** ADR-0101 (Infrastructure), ADR-0102 (Event Messaging), ADR-0103 (API Surface), ADR-0104 (Identity + Audit), ADR-0105 (Workflow BPM), ADR-0107 (Observability), ADR-0108 (Security + Secrets), ADR-0109 (Containers + Orchestration)

---

## 1. Status

Accepted — greenfield design. No prior analytics stack is locked in. The `reports-service` submodule exists as a structural placeholder with no committed technology. This ADR covers the full analytics + reporting + data-warehouse stack across all CuraOS verticals and establishes the authoritative decisions.

---

## 2. Context

CuraOS is a composable multi-tenant platform. Its 91 backend services (Kotlin + Spring Boot, JVM 21) produce business, clinical, and operational events across three deployment profiles: Cloud SaaS, On-Premises, and Air-Gapped. The analytics layer must serve fundamentally different consumer types from a single stack:

| Consumer | Access Pattern | Data Sensitivity |
|---|---|---|
| Tenant ops staff | Real-time operational dashboards | Business data, some PII |
| Clinical staff (HealthStack) | Quality measures, outcomes reports | PHI — maximum sensitivity |
| Finance/billing | Revenue analytics, AR aging | Financial PII |
| Tenant power users (self-service BI) | Ad-hoc query, dashboard authoring | Business data |
| Tenant developers | Embedded charts in CuraOS UI | Business + operational |
| CuraOS platform team | Cross-tenant SaaS metrics | Aggregated only — no cross-tenant PHI |
| Auditors / compliance officers | HIPAA audit reports, GDPR DSAR packs | PII/PHI with controlled access |

### Prior Decisions That Constrain This ADR

| Decided | Implication for Analytics |
|---|---|
| PostgreSQL 17, per-tenant schema (OLTP) | CDC source; Debezium already ships change events |
| Kafka 4.x (SaaS) / NATS JetStream (SMB/on-prem) | Event bus analytics pipelines must support both |
| Debezium CDC (outbox pattern) | OLTP-to-OLAP replication mechanism is settled |
| ParadeDB + OpenSearch (search) | Full-text search on operational data handled separately; OLAP not for search |
| SeaweedFS (object storage, already chosen) | S3-compatible store available for cold OLAP tiers and lakehouse format |
| Observability: Tempo + VictoriaMetrics + Loki + Grafana + OTel (ADR-0107) | Grafana is already deployed; operational dashboards (SRE-facing) already handled; analytics layer serves business/clinical users with different access model |
| Jobrunr (job scheduler, already chosen) | Report scheduling can delegate job dispatch to Jobrunr |
| APISIX (API gateway) | Tenant analytics API routing and rate-limiting already handled |
| Keycloak 26 (IdP) | RBAC + ABAC tokens flow through analytics authorization layer |
| ADR-0104 hash-chained audit log | Compliance reporting reads the audit log as a first-class data source |

### Problem Statement

With 91 microservices across three deployment profiles producing continuous event streams, the analytics platform must:

1. Provide sub-second P95 query response for pre-built tenant dashboards.
2. Support ad-hoc SQL exploration for power users without degrading dashboard performance.
3. Ingest CDC events from PostgreSQL and domain events from Kafka/NATS with < 60-second end-to-end latency for operational metrics.
4. Handle PHI in HealthStack analytics with the same encryption, audit, and access-control rigor as OLTP.
5. Enforce strict tenant isolation — no cross-tenant data leakage in any query path.
6. Operate without external network egress in air-gap mode.
7. Carry licenses compatible with SaaS distribution (no AGPL contamination of the product binary).
8. Support GDPR right-to-erasure for analytics data; support HIPAA minimum-necessary for report access.
9. Scale from a 3-service SMB on-prem deployment to a 91-service multi-region SaaS deployment without re-architecting the analytics layer.
10. Export data in CSV, Excel, PDF, and FHIR Bulk Data formats.

---

## 3. Forces

### Hard Constraints (non-negotiable)

- **Self-hosted first, air-gap support.** All container images must be stageable offline. No runtime external DNS for data paths.
- **HIPAA PHI in OLAP.** PHI entering the analytical store must have encryption-at-rest (AES-256), field-level masking for unprivileged roles, and every PHI read must be audit-logged. Same bar as OLTP.
- **GDPR tenant isolation + erasure.** Tenant data must be queryably isolated. Right-to-erasure (Article 17) must cascade to OLAP within a defined SLO (30-day default).
- **License: no AGPL for SaaS embedding.** AGPL forces open-sourcing of the product if linked at the SaaS layer. All components in the data path must be Apache 2.0, MIT, BSL (with acceptable terms), or commercial with self-hosted rights.
- **Dual-bus support.** The ELT/streaming layer must handle both Kafka 4.x (SaaS) and NATS JetStream (SMB) without forking the pipeline architecture.
- **Vertical dependency direction.** HealthStack, EducationStack, and ERP analytics extend generic analytics; the reverse dependency is forbidden. The OLAP schema and pipeline architecture must enforce this at the data-model layer.

### Soft Constraints (strong preferences)

- Minimize operational complexity: fewer moving parts per deployment profile.
- Prefer solutions the existing Kotlin/JVM team can operate without a dedicated data-engineering guild.
- Reuse SeaweedFS (already deployed) for object storage tiers.
- Avoid forking at the SMB/SaaS boundary; the same pipeline code must run against both event buses via configuration.

---

## 4. Decision Areas and Options Considered

---

### 4.1 OLAP / Data Warehouse Engine

#### Options

| Engine | License | Model | Self-Host | Air-Gap | Notes |
|---|---|---|---|---|---|
| **ClickHouse** | Apache 2.0 | Columnar, distributed | Yes | Yes | Best-in-class ingestion throughput; native Kafka engine; proven multi-tenant row policies |
| DuckDB | MIT | Embedded, single-process | Yes (in-process) | Yes | Zero infra overhead; single-writer constraint; no concurrent multi-user serving |
| Apache Druid | Apache 2.0 | Columnar, distributed, real-time | Yes | Yes | Deep Lambda architecture; high operational complexity; aging community momentum |
| Apache Pinot | Apache 2.0 | Columnar, distributed, real-time | Yes | Yes | LinkedIn-born; strong for time-series; smaller community than ClickHouse; more ops burden |
| StarRocks / Apache Doris | Apache 2.0 | MPP columnar | Yes | Yes | MySQL-wire-compatible; strong ETL-less ingestion; smaller Western ecosystem; Doris is the ASF fork |
| HydraDB (Hydra) | Apache 2.0 | Columnar PG extension | Yes | Yes | Columnar PG via columnar storage engine; limited throughput vs dedicated OLAP; loses ground at scale |
| PG + cstore_fdw | Apache 2.0 | PG foreign table | Yes | Yes | Mature but deprecated (columnar_fdw replaced it); not a first-class OLAP engine |

#### Decision: **ClickHouse** (primary OLAP engine)

**Rationale:**

- **Ingestion:** ClickHouse's native Kafka table engine consumes Kafka topics directly — no Spark cluster or Flink job required for the base streaming path. A NATS-to-Kafka bridge (or NATS-native plugin via community connector) covers the SMB bus.
- **Query performance:** Sub-second aggregation on billions of rows on a single node is well-documented in production (Cloudflare, Contentsquare, OneUptime run ClickHouse at multi-TB scale).
- **Multi-tenancy:** Row-level policies (`CREATE ROW POLICY ... USING tenant_id = currentSetting('analytics.tenant_id') TO role_x`) isolate tenants within shared tables. For SaaS deployments with stable schema, shared-table + row-policy is the recommended pattern (scales to millions of tenants). For enterprise on-prem tenants with divergent schemas, separate databases per tenant are supported.
- **Partitioning for erasure:** Partitioning by `(tenant_id, toYYYYMM(event_time))` allows `ALTER TABLE DROP PARTITION` for GDPR erasure of a tenant's data without full table scan — O(1) deletion of a partition.
- **License:** Apache 2.0. No SaaS distribution restriction.
- **Air-gap:** Single Docker image; ships as `clickhouse/clickhouse-server`. No external calls at runtime.
- **PHI:** ClickHouse supports AES-256 encryption at rest (disk-level + column-level `encrypt`/`decrypt` functions). Per-column masking via row policies allows clinical users to see PHI while ops users see `[REDACTED]` via the same policy mechanism.

**DuckDB role (secondary, not primary):** DuckDB is adopted as the embedded analytics engine within the `reports-service` JVM process for per-tenant report generation jobs (ad-hoc query against Iceberg snapshots, CSV/Excel export rendering). It is not a serving layer for concurrent dashboard queries. The "analytics logic everywhere" consistency debt noted in benchmarks is mitigated by routing all serving queries through ClickHouse and using DuckDB only in isolated job contexts.

**Rejected:**
- Druid/Pinot: high operational complexity, Lambda-architecture overhead, smaller community momentum vs ClickHouse in 2025-2026.
- StarRocks/Doris: strong technical merit but smaller Western community; support and recruiting risk for a healthcare platform.
- HydraDB / cstore_fdw: insufficient at-scale throughput; not a replacement for a dedicated OLAP engine at 91-service event volume.

---

### 4.2 Lakehouse Format

#### Options

| Format | License | Catalog Options | ClickHouse Support | Notes |
|---|---|---|---|---|
| **Apache Iceberg** | Apache 2.0 | REST catalog, Hive, AWS Glue, Nessie | Via S3 + Iceberg REST | SeaweedFS ships built-in Iceberg REST catalog |
| Delta Lake | Apache 2.0 (since 2023) | Unity Catalog, Delta Standalone | Community connector | Historically Databricks-centric; catalog not as neutral |
| Apache Hudi | Apache 2.0 | Hive Metastore, custom | Limited | Better for incremental upserts; weaker OLAP query support |
| Parquet + metastore | Apache 2.0 | Hive, custom | Native Parquet reads | No ACID transactions; no time-travel; schema evolution fragile |

#### Decision: **Apache Iceberg on SeaweedFS** (for cold tier and inter-system data exchange)

**Rationale:**

The lakehouse pattern is adopted for two specific purposes only, not as the primary serving layer:

1. **Cold-tier archival.** ClickHouse data older than configurable TTL (default: 90 days hot, 1 year warm) is moved to Iceberg tables on SeaweedFS via ClickHouse's `S3Queue` or direct S3 writes. DuckDB (in `reports-service` jobs) queries Iceberg snapshots for historical report generation without touching ClickHouse.
2. **Inter-system data exchange.** HealthStack FHIR Bulk Data Export (NDJson) lands on SeaweedFS as Iceberg-registered Parquet files consumable by external analytics tools (Pathling, Spark).

SeaweedFS ships a built-in Iceberg REST Catalog (confirmed in 2025; MinIO transitioned to maintenance-only/archived in late 2025 making SeaweedFS the natural default). No separate metastore (Hive, Glue) is required — catalog + object storage are one deployment unit.

Iceberg is chosen over Delta Lake because its REST catalog is engine-neutral (ClickHouse, DuckDB, Trino, Spark, RisingWave all speak it) and its dependency on Databricks-specific tooling is lower. Hudi is rejected because its primary strength (row-level upserts) is already handled by ClickHouse's ReplacingMergeTree.

**Scope guard:** Iceberg is not the primary query path. Tenant dashboards and real-time reports always go through ClickHouse. Iceberg serves archival, export, and inter-tool exchange only.

---

### 4.3 Storage Backend for OLAP

#### Decision: **Tiered — Local NVMe (hot) + SeaweedFS (warm/cold)**

ClickHouse supports multi-volume storage policies natively. The tiering policy:

- **Hot tier:** Local NVMe attached to ClickHouse nodes. Data < 90 days. Query latency target: sub-second P95.
- **Warm tier:** SeaweedFS S3-compatible endpoint. Data 90 days–1 year. ClickHouse reads via `s3` table function or S3-backed disks. Slightly higher latency (acceptable for scheduled reports).
- **Cold tier:** SeaweedFS Iceberg tables. Data > 1 year. Queried via DuckDB in report jobs, not via ClickHouse serving path.

This avoids a separate object store deployment (SeaweedFS is already chosen in ADR-0101 / ops stack). Air-gap: SeaweedFS runs fully on-prem.

---

### 4.4 CDC + ELT Pipeline

#### Options

| Tool | License | Real-time CDC | Batch ELT | Kafka Native | NATS Support | Notes |
|---|---|---|---|---|---|---|
| **Debezium + ClickHouse Kafka Engine** | Apache 2.0 | Yes | Via materializations | Yes (native) | Via Kafka bridge | Already chosen for outbox; zero new dependencies |
| Airbyte | MIT (core) + commercial (enterprise features) | Partial | Yes (300+ connectors) | Yes | No native | High connector count but heavy Kubernetes footprint; CDC limited to batch-style |
| Meltano | Apache 2.0 | No | Yes (Singer taps) | Via plugins | No native | Code-first ELT; good for external SaaS sources; not a streaming CDC tool |
| Estuary Flow | BSL (core) | Yes | Yes | Yes | Partial | Best real-time alternative; BSL restricts competitive SaaS use |
| Materialize | BSL + cloud-only | Yes | No | Yes | No | No self-hosted option; eliminated |
| Flink + custom jobs | Apache 2.0 | Yes | Yes | Yes | Via connector | Full power but high operational complexity; overkill for base CDC path |

#### Decision: **Debezium → Kafka/NATS → ClickHouse Kafka Table Engine** (primary); **Airbyte** (external source connectors only)

**Primary pipeline (OLTP → OLAP):**

```
PostgreSQL 17 (WAL) → Debezium → Kafka/NATS → ClickHouse Kafka Engine → MergeTree tables
```

Debezium is already deployed for the outbox pattern (ADR-0102). Extending it to feed ClickHouse adds zero new infrastructure. ClickHouse's built-in Kafka engine consumes topics and writes to MergeTree with sub-second latency. For NATS JetStream deployments, a lightweight Kafka-compatible bridge (`nats-kafka-bridge` or NATS server's built-in Kafka-compat layer in NATS 2.10+) translates JetStream subjects to Kafka topic format consumed by ClickHouse — no fork in the pipeline logic.

**External source connectors (SaaS integrations, third-party data):**

Airbyte OSS (MIT core) handles batch ingestion of external SaaS sources (Salesforce CRM, external billing, HIS/EHR integrations). Airbyte writes to the SeaweedFS warm tier (Parquet/Iceberg) or directly to ClickHouse via the ClickHouse destination connector. Airbyte is scoped to external-source ELT only — it does not replace Debezium for internal OLTP CDC.

**Rejected for primary path:**
- Flink: operational complexity exceeds the benefit for a standard CDC-to-columnar-store pattern where ClickHouse's built-in engine covers the use case.
- Estuary: strong real-time capability but BSL restricts SaaS embedding.
- Materialize: no self-hosted option; eliminated per hard constraints.

---

### 4.5 Transformation and Data Modeling

#### Options

| Tool | License | State-Aware | Column Lineage | Self-Hosted UI | Notes |
|---|---|---|---|---|---|
| **SQLMesh** | Apache 2.0 | Yes (virtual envs) | Yes (compile-time) | OSS VSCode ext | dbt-compatible; 9× faster incremental builds; acquired by dbt Labs 2025 but remains Apache 2.0 |
| dbt Core | Apache 2.0 (core) | No | No (runtime only) | No (Cloud only) | BSL on dbt Server/Cloud; core remains Apache 2.0; stateless; no virtual dev environments without workarounds |
| Dataform | Apache 2.0 | No | Partial | Google Cloud UI | Open source core but cloud-first; GCP dependency in practice |
| Custom SQL in repo | N/A | No | No | N/A | Brittle at scale; no CI integration; no lineage |

#### Decision: **SQLMesh** (Apache 2.0)

**Rationale:**

SQLMesh is backwards-compatible with dbt models and macros, de-risking migration of any existing dbt assets. Key advantages:

- **Compile-time SQL validation** via SQLGlot catches schema errors before deployment — critical in a healthcare context where a broken transformation can corrupt clinical reports.
- **Virtual dev environments** allow data engineers to test transformations against production-scale ClickHouse data without materializing full table copies (50-80% compute cost reduction vs dbt's physical dev schemas).
- **Column-level lineage** is automatic — required for HIPAA minimum-necessary audits (which columns contain PHI, which models touch them).
- **Apache 2.0** — no BSL risk. dbt Labs acquired Tobiko Data (SQLMesh's creator) in 2025; the Apache 2.0 license is preserved. However, the project's independence roadmap is actively monitored. If SQLMesh ever re-licenses, the migration path is to dbt Core (same SQL model files, same macros).
- **Incremental-by-default** semantics minimize ClickHouse write amplification — important for large MergeTree tables.

SQLMesh transformation models define:
- Generic OLAP layer: `gold.tenant_revenue`, `gold.task_throughput`, `gold.sla_compliance`
- HealthStack layer (extends generic): `healthstack.quality_measures`, `healthstack.patient_outcomes`, `healthstack.claim_analytics`
- EducationStack layer: `educationstack.course_progression`, `educationstack.accreditation_metrics`
- ERP layer: `erp.inventory_turns`, `erp.crm_funnel`

All HealthStack models carry a `@phi = true` annotation enforced by a SQLMesh macro that gates column access to roles with `phi_access` claim in Keycloak JWT.

---

### 4.6 BI / Dashboard Tool (Tenant-Facing, End-User)

#### Options

| Tool | License | Embedded SDK | Row-Level Security | Self-Hosted | ClickHouse Native | HIPAA Path |
|---|---|---|---|---|---|---|
| **Apache Superset** | Apache 2.0 | Yes (iframe + guest token) | Yes (Jinja RLS) | Yes | Via SQLAlchemy driver | OSS self-hosted; HIPAA via deployment controls |
| Metabase | AGPL (community) / Commercial (Enterprise) | Yes (Enterprise SDK) | Yes (Enterprise) | Yes (OSS) | Yes (official driver) | AGPL eliminated for SaaS; Enterprise commercial viable |
| Lightdash | MIT | Partial | Yes | Yes | Limited | Tightly coupled to dbt; switching to SQLMesh adds friction |
| Evidence.dev | MIT | No (static site) | No | Yes | Via DuckDB | Static generation model; no real-time |
| Redash | BSD | No (iframe only) | Partial | Yes | Yes | Less active development; fewer features |
| Grafana | AGPL (OSS) / Apache 2.0 (enterprise plugins) | Yes | Yes | Yes | Yes (official plugin) | Already deployed for SRE; AGPL contamination risk for SaaS product embedding |
| Cube.dev (as BI layer) | Apache 2.0 | Yes (headless) | Yes (semantic layer) | Yes | Yes | Semantic layer + API; requires separate visualization |

#### Decision: **Apache Superset** (Apache 2.0) for tenant self-service BI; **Cube.dev** as the semantic layer + embedded analytics API

**Rationale:**

Two separate tools serve two different access modes:

**Apache Superset** — Self-service BI for power users within tenant organizations who want to build and explore dashboards themselves. Deployed as a standalone service per deployment profile. Connects to ClickHouse via the official `clickhouse-connect` SQLAlchemy driver. Guest tokens + Jinja-templated RLS rules enforce `{{ current_user.tenant_id }}` isolation. PHI-bearing datasets are filtered to roles holding the `phi_access` claim.

Metabase is rejected: AGPL community edition cannot be embedded in a SaaS product without open-sourcing CuraOS (eliminated by hard constraint). Metabase Enterprise is commercial and viable as a future tier-2 option for tenants who want managed BI, but not the default stack.

Grafana OSS is AGPL. The observability Grafana instance (ADR-0107) is an internal SRE tool, not embedded in the product UI — AGPL is acceptable there. A separate analytics-facing Grafana embed in tenant UI pages would trigger AGPL contamination. Superset (Apache 2.0) is used instead for tenant-facing dashboards.

Lightdash requires dbt as its data modeling layer; switching to SQLMesh breaks Lightdash's core assumption. Rejected.

**Cube.dev** — Semantic layer and headless API for embedded analytics in the CuraOS React UI (embedded charts, KPI widgets, drill-down panels within CuraOS application pages). Cube Core is Apache 2.0. It exposes a REST API, GraphQL API, and SQL API that tenant application UIs call. Cube enforces the semantic layer (metric definitions, tenant scoping, PHI access rules) so that every chart in the CuraOS UI queries through a governed, consistent definition of `revenue`, `patient_count`, or `task_completion_rate`. This prevents the "analytics logic everywhere" consistency debt that arises from each frontend component querying ClickHouse directly.

Cube connects to ClickHouse as its query engine. Multi-tenancy is enforced via Cube's `securityContext` (populated from the Keycloak JWT `tenant_id` claim) injected into every generated SQL query as a `WHERE tenant_id = '{{tenant_id}}'` filter.

---

### 4.7 Embedded Analytics for Tenant Apps (Charts in CuraOS UI)

#### Options

| Library | License | SSR Support | Bundle Size | Notes |
|---|---|---|---|---|
| **ECharts (Apache)** | Apache 2.0 | Yes | ~1MB (tree-shakeable) | Widest chart type coverage; React wrapper `echarts-for-react` |
| Recharts | MIT | Yes | ~300KB | React-native; smaller chart type coverage |
| Plotly.js | MIT | Yes | ~3MB | Heavy; strong scientific/clinical chart types |
| Highcharts | Commercial | Yes | ~300KB | Commercial license required for SaaS; eliminated |
| Victory | MIT | Yes | ~200KB | Limited chart types; no heatmaps or Sankey |

#### Decision: **Apache ECharts** via `echarts-for-react`, driven by **Cube.dev API**

ECharts covers all required chart types (line, bar, scatter, heatmap, Sankey for care pathways, funnel for CRM, gauge for SLA indicators) under Apache 2.0. Components are data-source-agnostic — they receive JSON from the Cube.dev REST API and render locally. No direct ClickHouse calls from the browser. Recharts is used only for lightweight sparkline/mini-chart contexts where bundle size matters.

---

### 4.8 Report Scheduling and Delivery

#### Options

| Tool | License | JVM Integration | Self-Hosted | Cron + Event | Notes |
|---|---|---|---|---|---|
| **Jobrunr** (already chosen) | Apache 2.0 | Native (JVM library) | Yes (embedded) | Yes | Already chosen as the JVM job framework; zero new infrastructure |
| Apache Airflow | Apache 2.0 | Python-native; JVM via HTTP | Yes | Yes | Large operational footprint; Python ecosystem; overkill for scheduled reports |
| Dagster | Apache 2.0 | Python-native | Yes | Yes | Better than Airflow for asset-based scheduling; still Python-native; separate stack |
| Prefect | Apache 2.0 (Prefect 2) | Python-native | Yes | Yes | Similar to Dagster; adds another ops surface |
| Argo Workflows | Apache 2.0 | Kubernetes-native | Yes | Yes | K8s-first; good for complex DAGs; adds K8s CRD complexity |
| Custom cron-on-K8s | N/A | Yes | Yes | Cron only | No retry, no observability, no lineage |

#### Decision: **Jobrunr** (already chosen) for all report scheduling and delivery dispatch

**Rationale:**

Jobrunr is already the job-scheduling framework for CuraOS services. Extending it to handle report scheduling is zero net operational cost:

- Scheduled reports: `@Recurring` jobs in `reports-service` fire at tenant-configured cadences.
- On-demand reports: `BackgroundJob.enqueue()` from the reports API layer.
- Delivery: job handlers email (SMTP), push to tenant storage (SeaweedFS presigned URL), or write to Kafka topic for downstream webhook delivery.
- Retry semantics: Jobrunr's built-in exponential backoff covers transient ClickHouse or PDF-render failures.
- Dashboard: Jobrunr ships its own web UI for job monitoring — one less ops tool.

Airflow/Dagster/Prefect are Python-native. Introducing a Python orchestration stack alongside the JVM services adds a separate runtime, dependency management surface, and operational domain that the current team does not own. They are retained as future considerations if data-pipeline complexity grows beyond what Jobrunr can model.

---

### 4.9 PDF and Export Rendering

#### Options

| Tool | License | JS Rendering | Performance | Container Size | Notes |
|---|---|---|---|---|---|
| **Gotenberg** | Apache 2.0 | Yes (Chromium) | 2-15s per doc | ~1.5GB | Microservice API; handles HTML→PDF, Office→PDF; production-hardened |
| WeasyPrint | BSD | No | Slow on complex docs (~100s for 52pp) | ~300MB | Python; CSS Paged Media; good for print-styled reports |
| Apache PDFBox | Apache 2.0 | No | Fast for programmatic PDF | Minimal | JVM-native; no HTML rendering; good for structured data PDFs |
| iText (community) | AGPL | No | Fast | Minimal | AGPL community; iText7 commercial license required for SaaS |
| PrinceXML | Commercial | No | Fast; CSS Paged Media | N/A | Excellent CSS Paged Media; commercial license; per-server pricing |
| Carbone | LGPL | No | Fast (template-based) | Small | Template engine (DOCX/XLSX/ODS → PDF); not HTML rendering |

#### Decision: **Gotenberg** (Apache 2.0) for HTML-based reports; **Apache PDFBox** for programmatic structured PDFs

**Rationale:**

Two rendering paths serve different report types:

**Gotenberg** handles HTML-template reports where layout fidelity and chart rendering matter (clinical summaries, quality measure reports, patient-facing documents). Deployed as a sidecar container in `reports-service`. The `reports-service` renders a React/HTML template (via Thymeleaf or a lightweight template engine) and POSTs it to Gotenberg's Chromium endpoint. Gotenberg's 2-15 second latency is acceptable for scheduled and on-demand reports where users are not waiting synchronously. For high-volume batch (e.g., 10,000 tenant invoices nightly), the Jobrunr-managed worker pool distributes render tasks across multiple Gotenberg replicas.

**Apache PDFBox** (JVM-native) handles programmatic structured PDFs — HIPAA audit reports, GDPR DSAR export packs, compliance summary pages — where layout is tabular and chart rendering is not needed. PDFBox avoids the Chromium cold-start overhead and runs in-process.

WeasyPrint is rejected: slow on complex documents (100 seconds for 52 pages in benchmark), Python runtime, and no JavaScript support eliminates it from chart-bearing report templates.

iText community is AGPL — eliminated. PrinceXML is commercial and per-server licensed — acceptable as an enterprise tier upgrade path for tenants needing advanced CSS Paged Media rendering, but not the default.

**Export formats beyond PDF:**

- **CSV / TSV:** `reports-service` streams ClickHouse query results via `clickhouse-java` client with `FORMAT CSVWithNames`. Streamed directly to HTTP response or SeaweedFS, never fully materialized in JVM heap.
- **Excel (XLSX):** Apache POI (Apache 2.0, JVM-native) generates XLSX from ClickHouse result sets. Streamed via streaming workbook API to avoid OOM on large exports.
- **FHIR Bulk Data Export:** Covered in §4.13.

---

### 4.10 OLAP Multi-Tenancy Pattern

#### Options

| Pattern | Isolation | Scale | GDPR Erasure | PHI Risk | Notes |
|---|---|---|---|---|---|
| **Shared table + row policy** | Logical (policy-enforced) | Unlimited tenants | Partition drop by tenant | Medium (misconfigured policy = leak) | ClickHouse recommended default |
| Schema-per-tenant | Physical (schema boundary) | ~1000s of tenants | `DROP SCHEMA` | Low | Higher management overhead; schema explosion |
| DB-per-tenant | Physical (DB boundary) | ~100s of tenants | `DROP DATABASE` | Lowest | Per-tenant ClickHouse instance; most isolation; highest ops cost |

#### Decision: **Tiered isolation by tenant profile**

| Tenant Profile | Pattern | Rationale |
|---|---|---|
| SaaS multi-tenant (standard) | Shared table + row policies + `currentSetting('analytics.tenant_id')` | Scales to unlimited tenants; ClickHouse row policies are enforced at the engine level, not application level |
| Enterprise on-prem (single-tenant) | Separate ClickHouse database | Customer owns the node; physical isolation eliminates cross-tenant risk |
| HealthStack SaaS tenants (PHI) | Shared table + row policies + **column-level encryption** for PHI columns | PHI columns encrypted at rest with tenant-specific key derivation (key per tenant stored in Vault); even a policy misconfiguration cannot expose plaintext PHI of another tenant |
| Air-gapped on-prem | Separate ClickHouse instance (single-tenant by definition) | Air-gap implies single-tenant; no multi-tenancy concern |

**Partitioning strategy:** All shared tables partition on `toYYYYMM(event_time)` as the primary partition key. Tenant-scoped data removal for GDPR (erasure of specific data subjects within a tenant) requires a different mechanism — ClickHouse's `ALTER TABLE DELETE WHERE data_subject_id = X` lightweight delete (available since ClickHouse 23.x as asynchronous lightweight mutations). A GDPR erasure job (`GdprErasureJob` in `reports-service` / `audit-service`) tracks pending erasure requests and dispatches lightweight deletes within the 30-day SLO.

---

### 4.11 Real-Time vs Batch Boundary

#### Options

| Approach | Latency | Complexity | Self-Hostable | Notes |
|---|---|---|---|---|
| **ClickHouse Kafka Engine (near-real-time)** | 5-60 seconds end-to-end | Low | Yes | Already in decision; handles operational dashboards |
| RisingWave (streaming SQL) | < 1 second | Medium | Yes (Apache 2.0) | Materialized views over Kafka; strong PostgreSQL wire compatibility |
| Materialize (streaming SQL) | < 1 second | Low | **No** | Cloud-only; eliminated |
| Apache Flink SQL | < 1 second | High | Yes | Full streaming SQL; large operational surface |
| Scheduled ClickHouse queries (batch) | Minutes | Minimal | Yes | Acceptable for report generation; not for operational dashboards |

#### Decision: **ClickHouse Kafka Engine for operational dashboards (near-real-time); RisingWave for complex streaming SQL materialized views; scheduled ClickHouse queries for heavy reports**

**Boundary definition:**

| Use Case | Approach | Latency SLO |
|---|---|---|
| Operational dashboards (task count, SLA status, revenue today) | ClickHouse Kafka Engine → MergeTree → Superset/Cube query | < 60 seconds |
| Complex streaming aggregations (running patient census, real-time bed availability, live CRM pipeline) | RisingWave materialized views → ClickHouse (sink) | < 5 seconds |
| Scheduled reports (daily revenue, monthly quality measures) | Jobrunr job → ClickHouse SQL query → PDF/XLSX render | Minutes (async) |
| Ad-hoc power user queries | Superset → ClickHouse direct | Best-effort; query timeout 30s |
| Cold historical reports (> 1 year data) | Jobrunr job → DuckDB → Iceberg on SeaweedFS | Minutes (async) |

**RisingWave role:** RisingWave is Apache 2.0 and fully self-hostable (single binary or Kubernetes Helm chart; state in object storage via Hummock on SeaweedFS S3). It is adopted for the specific subset of streaming SQL materialized views that exceed ClickHouse's Kafka engine capabilities — primarily stateful joins, windowed aggregations across multiple event streams, and low-latency computed metrics that must survive ClickHouse restarts without reprocessing. RisingWave sinks to ClickHouse tables, keeping ClickHouse as the sole query serving layer (no tenant query traffic hits RisingWave directly). RisingWave is a conditional adoption: it is not deployed in SMB on-prem profiles (too operationally heavy for small deployments); only SaaS and enterprise on-prem profiles include it.

Materialize is eliminated: no self-hosted option (confirmed as cloud-only in 2025-2026).

---

### 4.12 Semantic Layer

#### Options

| Tool | License | ClickHouse | Self-Hosted | Embedded API | Notes |
|---|---|---|---|---|---|
| **Cube.dev** | Apache 2.0 (Core) | Yes | Yes | REST, GraphQL, SQL | Already selected in §4.6 |
| dbt metric layer (MetricFlow) | Apache 2.0 (MetricFlow) | Partial | Yes | dbt Cloud UI only for UI; SQL via dbt | Tightly coupled to dbt serving layer |
| LookML / Looker | Commercial (Google) | Yes | No | REST API | Cloud-only; commercial; eliminated |
| Lightdash | MIT | Limited | Yes | REST | dbt-only; eliminated per §4.6 |
| Holistics | Commercial | Yes | No | REST | SaaS-only; eliminated |
| Custom metric definitions | N/A | Yes | Yes | N/A | Consistency debt; rejected |

#### Decision: **Cube.dev Core** (Apache 2.0) — already established in §4.6

Cube.dev serves as the canonical semantic layer for all CuraOS-embedded analytics. Metric definitions (`revenue`, `patient_count`, `bed_occupancy_rate`, `task_completion_rate`) are defined once in Cube's data model (YAML or JavaScript) and consumed by:
- ECharts components in the React UI (via Cube REST API)
- Superset (via Cube SQL API — Superset connects to Cube as if it were a PostgreSQL database)
- External BI tools (via Cube SQL API or REST)
- AI/agent integrations (via Cube's MCP server, available as of Cube Core 0.35+)

This single-definition approach prevents the divergence where `revenue` means different things in the dashboard, the report PDF, and the API export.

---

### 4.13 FHIR Analytics (HealthStack)

#### Options

| Tool | License | Approach | Production Signals |
|---|---|---|---|
| **Pathling** | Apache 2.0 | FHIRPath/SQL on Spark; FHIR Bulk export; terminology-aware | CSIRO/AEHRC; PubMed-published; Python/R/Java SDK; SQL-on-FHIR spec aligned |
| Aidbox analytics | Commercial | Built-in FHIR SQL views | Cloud-hosted primarily; Aidbox self-hosted has separate licensing |
| Smile CDR analytics | Commercial | CDR-native analytics; FHIR Bulk | Heavy commercial; HIE market |
| PSC FHIR Bulk + custom Spark | Apache 2.0 | Raw FHIR JSON → Spark → Parquet | Maximum flexibility; maximum implementation cost |
| ClickHouse FHIR tables (custom) | N/A (custom) | Flatten FHIR JSON into ClickHouse columns | High ETL complexity; FHIR version coupling |

#### Decision: **Pathling** for FHIR-native analytics + cohort queries; **SQL-on-FHIR (ViewDefinition) spec** for tabular FHIR export

**Rationale:**

Pathling (Apache 2.0, CSIRO AEHRC) is the only open-source, FHIR-native analytics library with production credibility (peer-reviewed publication, SQL-on-FHIR working group participation, SDKs across Python/R/Java). It loads FHIR R4/R5 resources into Apache Spark DataFrames and exposes FHIRPath-based aggregation, terminology-aware filtering (via Ontoserver integration), and measure evaluation.

**Integration pattern:**

```
HealthStack FHIR Server (existing) 
  → FHIR Bulk Data Export ($export operation → NDJson on SeaweedFS)
  → Pathling (Spark, reads NDJson from SeaweedFS)
  → Iceberg tables on SeaweedFS (materialized views)
  → ClickHouse (via S3 Iceberg reader) for dashboard serving
```

Pathling handles the FHIR-to-tabular flattening that would otherwise require thousands of lines of custom ETL. Its terminology-aware aggregation (e.g., "count patients with SNOMED-CT code hierarchy X or descendants") is not reproducible in plain SQL without a terminology server integration.

**FHIR Bulk Data Export** (HL7 SMART App Launch v2 / Bulk Data IG) is implemented in the HealthStack FHIR Server as the standard patient-data export API. CuraOS's export endpoint wraps this, adding: tenant-scoped access control (Keycloak-mediated), rate limiting, and download-link delivery via signed SeaweedFS URLs.

SQL-on-FHIR ViewDefinitions (FHIR Implementation Guide, standardized 2024-2025) provide engine-agnostic tabular views of FHIR resources. CuraOS ships a library of standard ViewDefinitions (patients, encounters, conditions, observations) that can be executed by Pathling, DuckDB, or ClickHouse against NDJson exports without vendor lock-in.

---

### 4.14 Privacy and Pseudonymization for Analytics

#### Decision: **Layered privacy controls — aggregation floor + OpenDP for cohort queries + field-level masking in ClickHouse**

| Mechanism | Scope | Implementation |
|---|---|---|
| **Aggregation floor** | All cross-tenant queries; any cohort query with count < 10 | ClickHouse row policy + Cube.dev post-processor suppress cells where `count(*) < 10` |
| **k-anonymity (k≥5)** | Clinical cohort exports (HealthStack) | Pathling + custom privacy filter on demographic quasi-identifiers before Iceberg write |
| **Differential privacy (OpenDP)** | Population-level statistics, research exports | OpenDP Python library (Harvard, Apache 2.0) applied in `reports-service` Python sidecar for research cohort APIs; calibrated ε ≤ 1.0 per query |
| **Field-level pseudonymization** | Data subjects in OLAP (name, DOB, MRN) | Debezium `field.renames` + custom SMT (Single Message Transform) replaces PHI identifiers with HMAC-SHA256 pseudonym before Kafka topic write; pseudonym-to-real mapping stays in OLTP only |
| **PHI column encryption** | PHI columns in ClickHouse (shared-table SaaS) | ClickHouse `encrypt('aes-256-gcm', value, tenant_derived_key)` at insert time; decryption only for roles with `phi_access` claim |

OpenDP is adopted for research-facing APIs and HealthStack population analytics where formal differential privacy guarantees are required by IRB protocols or data-sharing agreements. It is not applied to operational dashboards (low re-identification risk; access already gated by RBAC).

---

### 4.15 HIPAA Audit Reporting

#### Decision: **Queryable audit log (ADR-0104) + ClickHouse audit projection + pre-built compliance report pack**

The hash-chained audit log (ADR-0104) is the canonical record. A projection of that log is streamed into ClickHouse via Debezium (same CDC pipeline), enabling fast SQL aggregation for compliance reporting without touching the OLTP audit store.

**Pre-built compliance report pack** (implemented in `reports-service`):

| Report | HIPAA Requirement | Source |
|---|---|---|
| PHI Access Log | §164.312(b) — Audit controls | ClickHouse `audit_events` where `resource_type IN ('Patient', 'Encounter', 'Observation', ...)` |
| Minimum Necessary Access Report | §164.514(d) | ClickHouse aggregation on `accessed_fields` column per user per role |
| Failed Access Attempts | §164.308(a)(5) | ClickHouse `audit_events` where `outcome = 'denied'` |
| User Activity Summary | §164.312(a)(2)(i) | ClickHouse aggregation by `user_id`, `tenant_id`, date range |
| Business Associate Disclosures | §164.528 | `disclosure_log` table, populated by `audit-service` on PHI-sharing events |
| Breach Notification Incident Log | §164.404 | `incident_events` table in ClickHouse; Jobrunr job generates 60-day lookback PDF on demand |

All compliance reports are generated as PDF (Gotenberg) and optionally XLSX (Apache POI), stamped with a report ID traceable to the generating user's audit entry (meta-audit).

---

### 4.16 GDPR Subject Rights (DSAR Fulfillment)

#### Decision: **Automated DSAR pipeline in `reports-service` with data lineage from SQLMesh column lineage**

GDPR Data Subject Access Requests (Article 15) and erasure requests (Article 17) require knowing where a data subject's data lives across all systems.

**Discovery:** SQLMesh's automatic column-level lineage graph maps which OLAP tables and columns derive from which OLTP columns containing PII. This lineage graph is exported to a queryable JSON artifact at pipeline deploy time, consumed by the DSAR fulfillment job.

**DSAR export pipeline:**

```
DSAR request (via tenant portal) 
  → identity-service validates data subject identity
  → reports-service: DSARJob dispatched via Jobrunr
  → DSARJob queries lineage graph for all tables containing data_subject_id
  → parallel ClickHouse queries across identified tables
  → PostgreSQL OLTP queries for live operational data
  → FHIR Patient/$everything for HealthStack data
  → aggregated into structured JSON export + PDF summary
  → encrypted export package deposited in tenant SeaweedFS bucket (presigned URL, 7-day TTL)
  → data subject notified via notify-service within GDPR 30-day SLO
```

**Erasure pipeline (Article 17):**

- OLAP: ClickHouse lightweight deletes (`ALTER TABLE ... DELETE WHERE data_subject_id = ?`) dispatched as Jobrunr batch; verified by a post-delete audit query.
- Lakehouse: Iceberg time-travel snapshots older than the erasure effective date are expired; Iceberg compaction removes deleted rows from Parquet files.
- SeaweedFS archival: objects tagged with `data_subject_id` metadata are deleted via SeaweedFS S3 object delete.
- A `GdprErasureAuditRecord` is written to the audit log for each erasure, timestamped and signed.

---

## 5. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EVENT SOURCES (91 services)                                                 │
│  PostgreSQL 17 WAL ──► Debezium ──► Kafka 4.x / NATS JetStream             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
           ┌─────────────────────▼─────────────────────┐
           │  STREAMING LAYER                           │
           │  RisingWave (SaaS/Enterprise only)        │
           │  Complex streaming SQL materialized views  │
           │  Sinks ──► ClickHouse                     │
           └────────────────┬──────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────────────┐
│  OLAP SERVING LAYER                                                        │
│  ClickHouse (Apache 2.0)                                                  │
│  ├── Hot tier: local NVMe (< 90 days)                                     │
│  ├── Warm tier: SeaweedFS S3 (90 days – 1 year)                           │
│  ├── Row policies: tenant isolation                                        │
│  ├── Column encryption: PHI (tenant-derived AES-256-GCM key)              │
│  └── Kafka Table Engine: direct Kafka/NATS stream ingestion               │
└──────────────────────────┬────────────────────────────────────────────────┘
                           │
     ┌─────────────────────┼──────────────────────────┐
     │                     │                           │
     ▼                     ▼                           ▼
┌─────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐
│ SEMANTIC    │  │  SELF-SERVICE BI      │  │  REPORTS SERVICE             │
│ LAYER       │  │  Apache Superset      │  │  Jobrunr scheduling          │
│ Cube.dev    │  │  (Apache 2.0)         │  │  DuckDB (ad-hoc/Iceberg)     │
│ (Apache 2.0)│  │  Guest tokens + RLS  │  │  Gotenberg (HTML→PDF)        │
│ REST/GQL API│  │  Tenant power users   │  │  PDFBox (structured PDFs)    │
└──────┬──────┘  └──────────────────────┘  │  Apache POI (XLSX)           │
       │                                    │  Pathling (FHIR analytics)   │
       ▼                                    │  OpenDP (DP for research)    │
┌─────────────────┐                         └──────────────────────────────┘
│ EMBEDDED UI     │
│ Apache ECharts  │                    ┌───────────────────────────────────┐
│ (echarts-for-   │                    │  COLD TIER + LAKEHOUSE             │
│ react)          │                    │  Apache Iceberg on SeaweedFS       │
│ in CuraOS React │                    │  (REST Catalog built-in)           │
└─────────────────┘                    │  DuckDB queries from reports-svc   │
                                       │  FHIR Bulk Data Export (NDJson)    │
                                       └───────────────────────────────────┘

TRANSFORMATION LAYER (runs on schedule + CI):
  SQLMesh (Apache 2.0) ──► models ──► ClickHouse gold/healthstack/erp/education schemas
  Column lineage ──► DSAR data discovery map
```

---

## 6. Deployment Profile Matrix

| Component | Cloud SaaS | Enterprise On-Prem | SMB On-Prem | Air-Gap |
|---|---|---|---|---|
| ClickHouse | Cluster (3+ nodes, replicated) | Single node or 3-node | Single node | Single node |
| RisingWave | Yes (K8s Helm) | Yes | **No** (too heavy) | **No** |
| SeaweedFS warm/cold tier | Yes | Yes | Yes (local) | Yes (local) |
| Apache Iceberg on SeaweedFS | Yes | Yes | Optional | Optional |
| Cube.dev | Yes | Yes | Yes | Yes |
| Apache Superset | Yes | Yes | Yes | Yes (images pre-staged) |
| Pathling (HealthStack only) | Yes | Yes | Yes | Yes |
| Gotenberg | Yes | Yes | Yes | Yes (image pre-staged) |
| Airbyte (external sources) | Yes | Optional | Optional | **No** |
| OpenDP (research DP) | Yes | HealthStack only | **No** | **No** |
| SQLMesh | CI-time (not runtime) | CI-time | CI-time | Offline CI |

---

## 7. License Compliance Summary

| Component | License | SaaS Distribution | AGPL Risk |
|---|---|---|---|
| ClickHouse | Apache 2.0 | Clear | None |
| Apache Iceberg | Apache 2.0 | Clear | None |
| SeaweedFS | Apache 2.0 | Clear | None |
| Debezium | Apache 2.0 | Clear | None |
| RisingWave | Apache 2.0 | Clear | None |
| SQLMesh | Apache 2.0 | Clear | None |
| Cube.dev Core | Apache 2.0 | Clear | None |
| Apache Superset | Apache 2.0 | Clear | None |
| Apache ECharts | Apache 2.0 | Clear | None |
| Gotenberg | Apache 2.0 | Clear | None |
| Apache PDFBox | Apache 2.0 | Clear | None |
| Apache POI | Apache 2.0 | Clear | None |
| DuckDB | MIT | Clear | None |
| Pathling | Apache 2.0 | Clear | None |
| OpenDP | Apache 2.0 | Clear | None |
| Airbyte (OSS core) | MIT | Clear | None |
| Grafana OSS | **AGPL** | **Do not embed** | High — kept in SRE-internal only |
| Metabase Community | **AGPL** | **Do not embed** | High — rejected |
| iText Community | **AGPL** | **Do not embed** | High — rejected |

---

## 8. Security Controls Summary

| Control | Implementation | Regulatory Basis |
|---|---|---|
| PHI column encryption | ClickHouse `encrypt()` with tenant-derived AES-256-GCM key (Vault) | HIPAA §164.312(a)(2)(iv) |
| PHI access audit | Every ClickHouse query on PHI tables logged to `audit_events`; forwarded to ADR-0104 audit trail | HIPAA §164.312(b) |
| Tenant row isolation | ClickHouse row policies + `currentSetting()` context; Cube.dev `securityContext` JWT injection | HIPAA §164.312(a)(1); GDPR Article 25 |
| PHI masking for non-privileged roles | ClickHouse row policy returns `'[REDACTED]'` for `phi` columns absent `phi_access` claim | HIPAA Minimum Necessary §164.514(d) |
| DSAR automation | DSARJob discovers data via SQLMesh lineage graph; exports within 30 days | GDPR Article 15/17 |
| Aggregation floor | Superset/Cube post-processor suppresses counts < 10 | GDPR re-identification risk |
| Differential privacy | OpenDP (ε ≤ 1.0) on research export APIs | GDPR pseudonymization; IRB requirements |
| Erasure (GDPR Art. 17) | ClickHouse lightweight deletes + Iceberg snapshot expiry + SeaweedFS object delete | GDPR Article 17 |
| Network isolation | ClickHouse not exposed externally; only Cube.dev API and Superset API are tenant-reachable | Defense in depth |
| TLS everywhere | ClickHouse TLS listener; Cube.dev TLS; all inter-service mTLS (ADR-0108) | HIPAA §164.312(e)(1) |

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLMesh re-licenses (dbt Labs acquisition) | Low (Apache 2.0 preserved; monitored) | High | Migration path to dbt Core is one-command; same SQL model files |
| ClickHouse row-policy misconfiguration → cross-tenant PHI exposure | Medium | Critical | PHI column encryption provides second layer; policy tests in CI via `EXPLAIN` and query log assertions |
| Cube.dev semantic layer becomes a bottleneck at high query concurrency | Medium | High | Cube.dev supports pre-aggregations (materialized rollups in ClickHouse); scale Cube.dev horizontally |
| RisingWave operational complexity at SMB scale | High (if deployed) | Medium | SMB profile excludes RisingWave; near-real-time via ClickHouse Kafka engine only |
| Gotenberg memory spike on concurrent large reports | Medium | Medium | Jobrunr concurrency limit on report jobs; horizontal Gotenberg replicas; reject > 100MB HTML inputs |
| Pathling Spark cluster cost (HealthStack) | Medium | Medium | Pathling runs as a scheduled job (not always-on); Spark in local mode for SMB; cluster mode only SaaS |
| Iceberg catalog single point of failure (SeaweedFS built-in) | Low | High | SeaweedFS runs with replication factor ≥ 3; catalog metadata backed up daily to secondary SeaweedFS volume |
| GDPR erasure SLO breach (30 days) | Low | High | Jobrunr `GdprErasureJob` SLO alert at 25 days; escalation workflow via notify-service |

---

## 10. Implementation Sequence

### Phase 1 — Core OLAP + Operational Dashboards (Milestone 1)

1. Deploy ClickHouse (single node dev; 3-node SaaS). Configure TLS, RBAC, row policies template.
2. Extend Debezium deployment (ADR-0102) to add ClickHouse Kafka Table Engine sinks for core events (tasks, workflows, audit events).
3. Define SQLMesh project structure; implement `bronze` (raw CDC), `silver` (deduped, typed), `gold` (tenant-scoped aggregates) layer models.
4. Deploy Cube.dev Core; define initial metrics (`task_count`, `sla_compliance_rate`, `workflow_throughput`).
5. Implement `tenant_id` row policies and `phi_access` column masking policies.
6. Wire APISIX → Cube.dev API for tenant-scoped analytics endpoint.
7. Integrate ECharts components in CuraOS React UI against Cube.dev REST API.

### Phase 2 — Self-Service BI + Reporting (Milestone 2)

1. Deploy Apache Superset; configure ClickHouse SQLAlchemy connection; set up guest token flow via Keycloak.
2. Publish initial dashboard library (revenue overview, task throughput, SLA heatmap).
3. Implement `reports-service` with Jobrunr-scheduled PDF report generation (Gotenberg + PDFBox).
4. Implement CSV/XLSX streaming export from ClickHouse via `reports-service`.
5. Configure SeaweedFS warm tier in ClickHouse storage policy; implement TTL-based data movement.

### Phase 3 — Clinical Analytics + Privacy (Milestone 3, HealthStack)

1. Deploy Pathling (Spark local mode for SMB; Spark cluster for SaaS).
2. Implement FHIR Bulk Data Export pipeline → SeaweedFS → Iceberg → Pathling.
3. Implement SQL-on-FHIR ViewDefinitions for standard HealthStack cohorts.
4. Add PHI column encryption (Vault-derived tenant keys) for shared-table SaaS.
5. Implement HIPAA compliance report pack (6 standard reports) in `reports-service`.
6. Implement OpenDP research export API (ε-DP with privacy budget tracking per tenant per month).

### Phase 4 — DSAR Automation + Advanced Streaming (Milestone 4)

1. Deploy RisingWave (SaaS profile only); configure Kafka source connectors; implement streaming materialized views for complex metrics.
2. Implement DSAR fulfillment pipeline (`DSARJob`); wire SQLMesh lineage graph to data discovery.
3. Implement GDPR erasure pipeline (`GdprErasureJob`); verify cascade across ClickHouse + Iceberg + SeaweedFS.
4. Configure SeaweedFS Iceberg cold tier; implement ClickHouse → Iceberg archival TTL.
5. Deploy Airbyte for external SaaS source connectors (Salesforce, external EHR integrations).

### Phase 5 — EducationStack + ERP Analytics (Milestone 5)

1. Add SQLMesh models for EducationStack: `educationstack.course_progression`, `educationstack.accreditation_metrics`.
2. Add SQLMesh models for ERP: `erp.inventory_turns`, `erp.crm_funnel`, `erp.ar_aging`.
3. Publish Superset dashboard templates for education and ERP tenants.
4. Implement embedded analytics ECharts components for ERP and education UIs.

---

## 11. Component Inventory

| Component | Version Target | Helm Chart / Image | Notes |
|---|---|---|---|
| ClickHouse Server | 24.x LTS | `clickhouse/clickhouse-server` | Track LTS channel; avoid tip-of-tree |
| ClickHouse Java client | `0.6.x` | Maven (`com.clickhouse:clickhouse-jdbc`) | Used by `reports-service` for streaming result sets |
| RisingWave | `2.x` | `risingwavelabs/risingwave` (Helm) | SaaS + enterprise on-prem only |
| SQLMesh | `0.120+` | PyPI `sqlmesh`; run in CI container | dbt Labs acquisition; monitor license |
| Cube.dev Core | `0.35+` | `cubejs/cube` Docker | Apache 2.0; LTS releases only |
| Apache Superset | `4.x` | `apache/superset` | Pinned; upgrade tested in staging |
| Apache ECharts | `5.x` | npm `echarts` + `echarts-for-react` | Tree-shake by chart type |
| Gotenberg | `8.x` | `gotenberg/gotenberg` | Chromium-based; pin Chromium version |
| Apache PDFBox | `3.x` | Maven `org.apache.pdfbox:pdfbox` | JVM-native |
| Apache POI | `5.x` | Maven `org.apache.poi:poi-ooxml` | JVM-native; streaming SXSSF workbook |
| DuckDB | `1.x` | Maven `org.duckdb:duckdb_jdbc` | In-process; single writer |
| Pathling | `7.x` | PyPI `pathling` + Maven | Spark dependency; version-lock Spark compat |
| OpenDP | `0.11+` | PyPI `opendp` | Python sidecar in `reports-service` |
| Airbyte | `1.x` (OSS) | `airbyte/airbyte` | External sources only |
| SeaweedFS | `3.x` | `chrislusf/seaweedfs` | Already deployed; Iceberg REST catalog built-in |
| Apache Iceberg | `1.6+` | via Pathling/Spark/DuckDB dependencies | REST Catalog via SeaweedFS |

---

## 12. Consequences

### Positive

- **Zero AGPL surface** in the tenant-facing product: every component in the data path carries Apache 2.0 or MIT. The SaaS distribution is clean.
- **Single query-serving layer** (ClickHouse) reduces operational complexity: dashboards, self-service BI, and report generation all hit one engine rather than three.
- **Semantic layer governance** (Cube.dev) prevents metric drift across UI, reports, and exports — all definitions are version-controlled in one place.
- **GDPR erasure is O(1) per tenant** via partition drops; per-data-subject erasure is handled by lightweight deletes tracked by Jobrunr.
- **PHI has defense in depth**: row policies + column encryption + audit logging — a single misconfiguration does not expose plaintext PHI.
- **Pathling eliminates FHIR-to-SQL ETL complexity** for HealthStack analytics: FHIRPath queries replace thousands of lines of JSON flattening code.
- **SQLMesh column lineage** enables DSAR automation without a separate data-catalog product.

### Negative / Trade-offs

- **Operational breadth is high at full deployment**: ClickHouse + RisingWave + Superset + Cube.dev + Gotenberg + Pathling + Airbyte is 7 additional services. SMB profile drops RisingWave, Pathling, and Airbyte to 4 additions.
- **Pathling requires a Spark cluster** (or local mode for small workloads) — non-trivial for on-prem HealthStack tenants; mitigated by Spark local mode for clinical cohorts < 1M patients.
- **SQLMesh is now under dbt Labs ownership**. Apache 2.0 is contractually preserved but community trajectory requires monitoring. The migration path (dbt Core) is low-friction but is still a migration.
- **Cube.dev pre-aggregation management** adds ongoing data-engineering maintenance as the metric library grows.
- **DuckDB single-writer constraint** means `reports-service` must manage write concurrency for Iceberg writes through DuckDB — mitigated by making DuckDB write-only in report jobs (ClickHouse owns all concurrent reads).

---

## 13. Rejected Alternatives (Summary)

| Component | Rejected Alternative | Reason |
|---|---|---|
| ClickHouse | Apache Druid | High operational complexity; Lambda architecture overhead; declining community momentum vs ClickHouse |
| ClickHouse | Apache Pinot | Smaller community; similar complexity to Druid; ClickHouse better documented for multi-tenant healthcare |
| ClickHouse | StarRocks / Doris | Strong technical merit; smaller Western ecosystem; support and recruiting risk |
| Lakehouse | Delta Lake | Databricks-centric catalog; less engine-neutral than Iceberg REST |
| Streaming | Materialize | No self-hosted option — cloud-only; hard constraint violated |
| Transformation | dbt Core (primary) | Stateless; no virtual dev environments; BSL on dbt Server/Cloud layer |
| BI Tool | Metabase Community | AGPL — cannot embed in SaaS product |
| BI Tool | Grafana (for tenant BI) | AGPL — SRE-internal use only; separate instance from analytics-facing use |
| Scheduling | Apache Airflow | Python-native; large operational footprint; Jobrunr already provides JVM-native job scheduling |
| PDF | WeasyPrint | Slow on complex documents (100s for 52pp); no JavaScript; Python runtime |
| PDF | iText Community | AGPL — eliminated |
| Semantic Layer | LookML / Looker | Commercial, Google Cloud-hosted — eliminated |
| FHIR Analytics | Aidbox analytics | Commercial licensing; cloud-first — eliminated for default stack |
| ELT (primary) | Airbyte (for OLTP CDC) | Airbyte's CDC is batch-style; Debezium is already deployed and provides true streaming CDC |

---

## 14. Open Questions

| Question | Owner | Resolution Target |
|---|---|---|
| ClickHouse replication topology for SaaS (ClickHouse Keeper vs ZooKeeper) | Platform Engineering | Phase 1 |
| RisingWave Hummock state backend: SeaweedFS S3 endpoint configuration and performance validation | Data Engineering | Phase 4 |
| Pathling Spark local vs cluster threshold (patient count at which local mode becomes inadequate) | Clinical Informatics | Phase 3 |
| OpenDP privacy budget accounting: per-tenant per-month cap and reset policy | Compliance | Phase 3 |
| Cube.dev pre-aggregation refresh cadence for HealthStack metrics (PHI access audit implications of pre-agg reads) | Clinical Informatics + Compliance | Phase 3 |
| SQLMesh dbt Labs acquisition trajectory: 12-month license review checkpoint | Platform Engineering | 2026-Q3 review |

---

## Sources

Research conducted 2026-05-24. All findings confirmed via primary sources.

- [ClickHouse Multi-Tenancy Best Practices](https://clickhouse.com/docs/cloud/bestpractices/multi-tenancy)
- [Pathling — Analytics on FHIR](https://pathling.csiro.au/)
- [RisingWave vs Materialize Comparison](https://risingwave.com/risingwave-vs-materialize/)
- [RisingWave Materialize Alternatives 2026](https://risingwave.com/blog/materialize-alternatives-2026/)
- [Cube.dev — Open Source Semantic Layer](https://github.com/cube-js/cube)
- [Cube.dev 2025 GigaOm Radar Leader](https://cube.dev/blog/cube-cloud-named-leader-and-outperformer-in-2025-gigaom-radar-for-semantic)
- [SQLMesh GitHub — Apache 2.0](https://github.com/SQLMesh/sqlmesh)
- [dbt vs SQLMesh — SYNQ comparison](https://www.synq.io/blog/dbt-vs-sqlmesh-a-comparison-for-modern-data-teams)
- [dbt BSL Licensing announcement](https://www.getdbt.com/blog/licensing-dbt)
- [Superset Embedded SDK](https://github.com/apache/superset/tree/master/superset-embedded-sdk)
- [Superset Row-Level Security for Embedded Dashboards](https://dwickyferi.medium.com/implementing-row-level-security-for-embedded-apache-superset-dashboards-bc2df0692a3a)
- [Gotenberg — Docker PDF API](https://gotenberg.dev/)
- [Gotenberg HTML→PDF latency discussion](https://github.com/gotenberg/gotenberg/discussions/743)
- [SeaweedFS Iceberg support](https://github.com/seaweedfs/seaweedfs)
- [Self-Hosted S3 Comparison 2026 (SeaweedFS, RustFS, Garage, Ceph)](https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026)
- [Estuary vs Airbyte vs Meltano 2025](https://estuary.dev/blog/meltano-vs-airbyte-vs-estuary/)
- [DuckDB vs ClickHouse OLAP comparison](https://www.dbpro.app/blog/duckdb-vs-clickhouse)
- [ClickHouse vs DuckDB for Embedded Analytics](https://oneuptime.com/blog/post/2026-03-31-clickhouse-clickhouse-vs-duckdb-for-embedded-analytics/view)
- [OpenDP Differential Privacy Deployments Registry 2025](https://opendp.org/2025/11/25/launching-the-differential-privacy-deployments-registry/)
- [SQL on FHIR — npj Digital Medicine 2025](https://www.nature.com/articles/s41746-025-01708-w)
- [Building Streaming Lakehouse: Kafka → Iceberg → Trino → Superset](https://gamov.io/posts/streaming-lakehouse/)
