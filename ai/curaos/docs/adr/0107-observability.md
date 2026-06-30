# ADR-0107 — Observability Stack

> **✅ ACCEPTED w/ DA13 AMENDMENT** — aligned w/ [ADR-0150](0150-baseline-alignment-rules.md) §5 (STANDS). OTel Node SDK + NestJS instrumentation libs first-class. Tempo / VictoriaMetrics / Loki / Grafana / OTel all language-agnostic. SigNoz for SMB tier stands. **DA13 amendments (2026-05-25):**
> - **MinIO replaced w/ SeaweedFS S3** for ALL object storage including PG backups per DA13 Q6 — AGPLv3 air-gap bundle risk eliminated. SeaweedFS Apache 2.0; already in ADR-0101 stack. Updates [[curaos-postgres-rule]] Barman backup target.
> - **GDPR erasure SLO 30d primary + sync stores; backups exempt** per DA13 Q7 — primary DB + search indexes + caches + object storage purge w/in 30d. Backups + HIPAA 6y audit log explicitly exempted (legitimate interest + legal obligation per GDPR Recital 30 + Art 17(3)(b)(e)). Tombstone in primary DB tracks erasure.
>
> **Other resolutions:** Grafana AGPLv3 SaaS posture → **RESOLVED-RULE** ([[curaos-slo-rule]] + [[curaos-error-tracking-rule]] — self-hosted services OK, no binary bundling). HIPAA BAA obs vendors → **RESOLVED-RULE** ([[curaos-agent-eval-obs-rule]] — Langfuse v3 self-hosted; PHI never leaves CuraOS). SigNoz EE multi-tenant → **DEFERRED-V2**. Local + 3rd-party rule applies (Datadog / New Relic / Honeycomb / Grafana Cloud as 3rd-party options). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).


**Status:** Accepted  
**Date:** 2026-05-24  
**Deciders:** Platform Engineering, Security, Compliance  
**Supersedes:** —  
**Related ADRs:** ADR-0101 (Infrastructure), ADR-0102 (Event Messaging / Kafka + NATS), ADR-0103 (API Surface / APISIX), ADR-0104 (Identity + Audit), ADR-0105 (Workflow BPM), ADR-0106 (Frontend)

---

## 1. Status

Accepted — greenfield design. No prior observability stack is locked in beyond OpenTelemetry being the instrumentation standard. Prometheus/Grafana/Loki + OTel were mentioned informally; this ADR treats them as candidate options, not decisions.

---

## 2. Context

CuraOS is a composable multi-tenant platform with 91 backend services written in Kotlin + Spring Boot on JVM 21. It deploys across three profiles:

- **Cloud SaaS** — multi-tenant, horizontally scaled, vendor-managed infrastructure
- **On-Premises** — single-tenant, customer infrastructure, no external network egress
- **Air-Gapped** — same as on-prem but with zero internet connectivity; all container images pre-staged

The system processes regulated data under both **HIPAA** (PHI) and **GDPR** (PII). Stack decisions made in prior ADRs that constrain observability choices:

| Prior Decision | Observability Implication |
|---|---|
| PostgreSQL 17 | DB metrics via Postgres exporter; slow-query logs feed into log pipeline |
| Kafka 4.x (SaaS) / NATS JetStream (SMB) | Message broker metrics; consumer-lag alerts; Kafka exporter or built-in NATS metrics |
| APISIX Gateway | Gateway exposes Prometheus metrics natively; traces forward via OTel plugin |
| Keycloak 26 | Auth event logs; token-validation latency; SPI audit hooks feed audit trail |
| Flowable + Temporal BPM | Workflow execution traces; task-queue depth metrics; SLA breach alerting |
| React / Flutter / Astro Frontends | RUM / Web Vitals; Flutter performance traces; Astro SSR server-side traces |
| ADR-0104 hash-chained audit log | Observability must NOT duplicate PHI-bearing audit events; must query audit log as a data source for compliance dashboards |

### Problem Statement

With 91 microservices across three deployment profiles, the observability platform must:

1. Provide full-fidelity traces, metrics, and logs — the three pillars — with tight correlation across them.
2. Operate with zero external egress in air-gap mode (all images pre-pulled, no phone-home).
3. Never allow PHI or PII to leak into telemetry signals at rest or in transit.
4. Give each tenant isolated visibility into their own data — no cross-tenant leakage in dashboards or queries.
5. Support per-tenant retention policies and right-to-erasure (GDPR Article 17).
6. Scale from a 5-service SMB on-prem deploy to a 91-service, multi-region SaaS deploy without re-architecting.
7. Attribute compute and storage costs per tenant for chargeback/showback.
8. Carry licenses compatible with SaaS distribution (no AGPL contamination of the product binary).

---

## 3. Forces

### Hard Constraints (non-negotiable)

- **Self-hosted first.** No mandatory cloud-managed telemetry service. Hybrid acceptable as additive tier.
- **Air-gap support.** All container images must be pre-stageable. No runtime external DNS resolution for telemetry data paths.
- **HIPAA PHI redaction.** PHI must be stripped or masked at the collector before reaching any backend storage. Evidence of redaction must be auditable.
- **GDPR retention + erasure.** Per-tenant TTL must be enforceable. Tenant deletion must cascade to telemetry data within a defined SLO (e.g., 30 days).
- **OpenTelemetry as instrumentation standard.** SDK, agent, and collector form the instrumentation layer. All backends must accept OTLP.
- **License compatibility with SaaS distribution.** AGPL-licensed backends cannot be embedded into the CuraOS product binary or shipped as a mandatory SaaS dependency without a commercial license agreement. Apache 2.0, MIT, or commercial license required for bundled components.

### Strong Preferences

- **Operational simplicity over feature maximalism.** The team running 91 services cannot afford to operate 12 separate observability systems. Prefer fewer, composable components.
- **Unified signal storage.** Logs, metrics, and traces correlated by trace ID in a single query surface reduces MTTR.
- **PromQL / OTLP as common protocol layer.** Avoids vendor lock-in; enables backend swap without re-instrumentation.
- **Kubernetes-native deployment.** Helm charts, CRDs, operator patterns preferred over manual configuration.
- **Tenant-aware from day one.** Retrofitting multi-tenancy onto observability at scale is expensive and error-prone.

### Tensions

- **Unified APM (single stack) vs. best-of-breed (cherry-picked components)** — unified has lower ops cost; cherry-picked can be tuned per signal.
- **ClickHouse for everything vs. signal-specific backends** — ClickHouse offers excellent columnar compression for logs/traces but is a heavier operational dependency; Prometheus-native systems (Mimir, VictoriaMetrics) are more natural for metrics.
- **AGPL-licensed tools (OpenObserve) offer excellent economics** — but conflict with SaaS distribution requirements unless a commercial license is obtained.
- **Quickwit was acquired by Datadog (early 2025)** — long-term open-source commitment uncertain.

---

## 4. Decision Drivers (Weighted)

| Driver | Weight | Rationale |
|---|---|---|
| HIPAA/GDPR compliance — PHI redaction, per-tenant retention, erasure | 5 / 5 | Regulatory failure terminates the product |
| Self-hosted + air-gap operational viability | 5 / 5 | Core deployment promise |
| License compatibility with SaaS distribution | 5 / 5 | AGPL components cannot be bundled |
| Multi-tenant data isolation (no cross-tenant query bleed) | 5 / 5 | Data breach vector |
| OpenTelemetry native / OTLP ingest | 4 / 5 | Established as instrumentation standard; switching cost high |
| Operational simplicity (fewer components to operate) | 4 / 5 | 91 services × N backends = toil multiplier |
| Unified correlated signal query | 4 / 5 | MTTR reduction; on-call efficiency |
| Spring Boot / Kotlin / JVM integration quality | 4 / 5 | 100% of backend services affected |
| Cost efficiency at scale | 3 / 5 | Important for SaaS margin; less critical for on-prem |
| Frontend observability (React, Flutter, Astro) | 3 / 5 | RUM important for UX quality |
| Alerting sophistication | 3 / 5 | Core operational need |
| Long-term vendor / project stability | 3 / 5 | Risk of abandonment (e.g., Quickwit acquisition) |

---

## 5. Sub-Decision 1 — Distributed Tracing Backend

### 5.1 Options

#### Option A: Jaeger (v2)

Uber-originated, CNCF Graduated. The reference distributed tracing system. Jaeger v2 (released 2024) refactors the all-in-one architecture and adds native OTLP ingest.

**Strengths:**
1. CNCF Graduated — highest maturity tier; long-term viability assured
2. Rich ad-hoc query without trace ID: filter by service, operation, tags, duration, error status
3. Native multi-tenancy support in Jaeger v2 via tenant-aware storage routing
4. Jaeger Operator for Kubernetes; battle-tested production deployments at Uber, Netflix, Red Hat scale
5. Well-documented HIPAA patterns: attributes can be stripped at collector before Jaeger ingestion
6. Storage backend flexibility: ClickHouse (via plugin), Elasticsearch/OpenSearch, Cassandra — tenants can be co-located or separated
7. Active community: Red Hat maintains enterprise support track

**Weaknesses:**
1. Requires managing a stateful storage backend (ES/Cassandra/ClickHouse) — operational overhead
2. Storage cost at 100% trace volume is high; teams typically implement head/tail sampling
3. UI, while functional, is not as polished as modern alternatives (HyperDX, SigNoz)
4. ClickHouse backend for Jaeger is a community plugin, not first-party
5. Does not natively store metrics or logs — pure tracing only; separate stack for other signals

**Self-hosted readiness:** Excellent — Docker, Helm, Operator all maintained  
**Air-gap:** Excellent — all images stageable; no phone-home  
**Multi-tenant:** Good (v2) — requires routing configuration  
**HIPAA:** Good — PHI stripped at OTel Collector before ingest  
**Spring/Kotlin:** Excellent — OTel Java agent or Spring Boot starter; no Jaeger SDK needed  
**License:** Apache 2.0

---

#### Option B: Grafana Tempo

Grafana Labs product, Apache 2.0. Object-storage-native tracing backend — S3/GCS/MinIO. No built-in indexing; relies on TraceQL or trace-ID lookup plus tag search.

**Strengths:**
1. 10–100× less storage than Jaeger for same trace volume (no index overhead); enables 100% sampling
2. Object storage backend (MinIO for air-gap) — cheap, durable, horizontally scalable
3. Native Grafana integration: exemplars link metrics (Mimir/VictoriaMetrics) → traces directly in dashboards
4. TraceQL — purpose-built trace query language; powerful span set algebra for complex queries
5. Tempo Operator on Kubernetes; production-proven at large scale (Grafana.com runs it)
6. Multi-tenant isolation: X-Scope-OrgID header; per-tenant storage prefix in object store
7. Active first-party development from Grafana Labs; roadmap is public and moving fast

**Weaknesses:**
1. Ad-hoc search without trace ID is slower than Jaeger — must use tag-based index or accept full-object-scan latency
2. No dedicated UI — relies entirely on Grafana Explore; less discoverable for on-call engineers new to the platform
3. Tempo's metrics-generator (RED metrics from traces) adds compute overhead
4. Deep storage (object store) means high-latency retrieval for traces older than the in-memory cache window
5. TraceQL is powerful but has a learning curve for teams coming from Jaeger's filter UI

**Self-hosted readiness:** Excellent  
**Air-gap:** Excellent (MinIO as object store; all images pre-stageable)  
**Multi-tenant:** Excellent — native org ID isolation  
**HIPAA:** Good — PHI stripped at OTel Collector; Tempo stores whatever arrives  
**Spring/Kotlin:** Excellent — OTLP push to Tempo; no Tempo SDK  
**License:** Apache 2.0

---

#### Option C: SigNoz (Tracing component)

SigNoz is primarily evaluated as an APM all-in-one (Sub-Decision 6), but its tracing component is ClickHouse-backed. Evaluated here as a tracing-only option.

**Strengths:**
1. ClickHouse columnar storage for traces: fast analytical queries including span-level aggregation
2. OTLP-native ingest; no proprietary SDK required
3. Full-text search on span attributes — ClickHouse inverted index
4. Tight log-trace correlation at the storage layer (same ClickHouse cluster)
5. Query traces by any attribute without pre-declaring them as indexed fields
6. APM views (service map, latency percentiles, error rates) auto-generated from trace data

**Weaknesses:**
1. As a standalone tracing backend, SigNoz carries the entire APM stack — ClickHouse + query service + frontend — which is heavyweight if only tracing is needed
2. ClickHouse operational complexity: sharding, replication, ZooKeeper/ClickHouse Keeper ensemble
3. Multi-tenancy for traces is an architectural concern: SigNoz community edition does not have per-tenant trace isolation; requires custom routing or separate SigNoz instances
4. Enterprise license required for formal multi-tenant SaaS features
5. Not a drop-in replacement for a pure tracing backend — pulls in the full APM opinion

**License:** SigNoz EE — source-available for enterprise features; community edition Apache 2.0

---

#### Option D: Zipkin

Twitter-originated, stable, minimal. CNCF sandbox. OTel supports Zipkin format export.

**Strengths:**
1. Extremely simple to operate — single binary, in-memory or Cassandra/Elasticsearch backends
2. Well-understood, stable API surface
3. Low resource footprint for small deployments
4. OTel Collector Zipkin exporter available

**Weaknesses:**
1. CNCF Sandbox — lower maturity, lower investment than Jaeger
2. No native multi-tenancy
3. Weak ad-hoc query — primarily trace-ID lookup
4. UI is basic; limited service map capabilities
5. Storage backends (Cassandra/ES) require management; no object storage option
6. Community momentum has shifted decisively to Jaeger and Tempo; Zipkin is in maintenance mode

**Self-hosted readiness:** Basic  
**License:** Apache 2.0

---

#### Option E: HyperDX / ClickStack (Tracing)

HyperDX is now open-sourced as ClickStack — ClickHouse backend plus HyperDX UI. Primarily evaluated in Sub-Decision 6 as an APM all-in-one, but the tracing component is ClickHouse-native.

**Strengths:**
1. Session replay alongside distributed traces — unique capability for full-stack debugging
2. ClickHouse columnar backend: fast trace analytics
3. OTLP-native; React, Flutter, backend all unified
4. SQL access to all signals including traces
5. Excellent cross-signal correlation (log lines, traces, session replays in one view)
6. Open source (Apache 2.0)

**Weaknesses:**
1. Younger project; smaller community than Jaeger or Tempo
2. Multi-tenancy story for traces is not documented as a first-class feature
3. ClickHouse operational overhead
4. Session replay introduces HIPAA/GDPR risk surface: user interaction recordings may capture PHI in form fields
5. HIPAA compliance requires careful session replay configuration to exclude clinical forms

**License:** Apache 2.0 (ClickStack)

---

#### Option F: OpenObserve (Tracing)

Rust-based, Parquet-on-object-storage, unified logs/metrics/traces.

**Strengths:**
1. Extremely low storage cost — Parquet format with DataFusion query engine
2. Single binary for all signals — lowest ops footprint
3. OTLP-native for traces
4. Fast analytical queries via DataFusion
5. Low memory footprint vs. ClickHouse-based alternatives
6. Sub-second query on 1 PB datasets claimed by vendor

**Weaknesses:**
1. **License: AGPLv3** — SaaS distribution without commercial license agreement violates AGPL; OpenObserve also offers commercial licensing but this adds procurement complexity
2. Tracing capabilities are less mature than Jaeger/Tempo — full-fidelity TraceQL or equivalent not yet available
3. Smaller community; fewer production war stories at healthcare scale
4. Multi-tenancy story exists but is less battle-tested than Tempo or Mimir
5. OpenObserve moved from Apache to AGPL mid-2023 — history of license changes raises supply-chain risk

**License:** AGPLv3 (commercial license available) — **BLOCKER for SaaS distribution without commercial agreement**

---

### 5.2 Tracing Comparison Matrix

| Criterion | Jaeger v2 | Grafana Tempo | SigNoz | Zipkin | ClickStack | OpenObserve |
|---|---|---|---|---|---|---|
| CNCF maturity | Graduated | CNCF (via Grafana) | — | Sandbox | — | — |
| OTLP-native ingest | Yes | Yes | Yes | Via exporter | Yes | Yes |
| 100% trace volume (no forced sampling) | Costly | Yes (object store) | Yes | No | Yes | Yes |
| Ad-hoc search (no trace ID) | Excellent | Good (TraceQL) | Excellent | Poor | Excellent | Moderate |
| Multi-tenant isolation | Good (v2) | Excellent | Requires EE | None | Weak | Moderate |
| Object storage backend | Plugin | Native | No | No | No | Yes (Parquet) |
| Air-gap readiness | Excellent | Excellent | Good | Good | Good | Good |
| HIPAA (PHI redaction path) | Collector | Collector | Collector | Collector | Collector + session replay risk | Collector |
| License | Apache 2.0 | Apache 2.0 | Apache/EE | Apache 2.0 | Apache 2.0 | **AGPLv3** |
| Spring Boot integration | Excellent | Excellent | Excellent | Good | Excellent | Good |
| Ops complexity | Medium | Low-Medium | High | Low | High | Low |

### 5.3 Recommendation: Grafana Tempo

Grafana Tempo is recommended as the tracing backend.

**Rationale:**
- Object storage backend (MinIO in air-gap) enables 100% trace retention at a fraction of Jaeger's storage cost — no forced head or tail sampling decisions at initial deployment.
- Native multi-tenant isolation via X-Scope-OrgID aligns with the same pattern used by Grafana Mimir (see metrics recommendation) — single mental model across signals.
- Apache 2.0 license — no SaaS distribution concerns.
- TraceQL provides sufficient ad-hoc power for most on-call scenarios; operational teams can use Grafana Explore.
- Integrates natively with the recommended Grafana dashboard layer and with Mimir exemplars (metrics → traces linking).

**If unified APM (SigNoz) is chosen in Sub-Decision 6, Tempo can be replaced by SigNoz's ClickHouse trace backend** — the OTel Collector OTLP pipeline is compatible with both; the collector configuration changes, not the instrumentation.

---

## 6. Sub-Decision 2 — Metrics Backend

### 6.1 Options

#### Option A: Prometheus (standalone)

The reference metrics system. Pull-based, PromQL, TSDB storage.

**Strengths:**
1. CNCF Graduated; largest ecosystem; every exporter exists
2. PromQL is the lingua franca — every engineer knows it
3. Spring Boot Actuator + Micrometer emit Prometheus-format metrics natively
4. Trivial to operate for small deployments
5. APISIX, Keycloak, Flowable, Temporal all ship Prometheus endpoints
6. Massive community; extensive runbooks and battle-tested alerting rules
7. Prometheus 3.x (released 2024) adds native OTLP ingest endpoint and UTF-8 metric names

**Weaknesses:**
1. Single-node TSDB — no native horizontal scale; runs out of headroom around 5–10M active series
2. No native multi-tenancy — all metrics in one namespace; cross-tenant query bleed possible
3. Long-term storage requires external solution (Thanos, Mimir, VictoriaMetrics remote write)
4. High-availability requires federation or Thanos/Mimir sidecars — adds complexity
5. Cardinality limits: label explosion from per-tenant or per-patient labels causes OOM crashes
6. Retention limited to local disk; no object storage native

**License:** Apache 2.0

---

#### Option B: VictoriaMetrics (cluster mode)

High-performance Prometheus-compatible TSDB. Up to 10× compression vs. Prometheus.

**Strengths:**
1. Up to 10× storage compression vs. vanilla Prometheus; 50% lower memory than Prometheus at identical cardinality
2. Horizontal scaling: VMInsert → VMStorage → VMSelect cluster architecture
3. Native multi-tenancy: tenant routing via accountID/projectID in URL paths (cluster mode)
4. Up to 1M samples/sec on 8-core single node; 10M+ samples/sec cluster mode
5. PromQL compatible plus MetricsQL extensions (richer aggregation functions)
6. Remote write compatible — drop-in Prometheus replacement; Grafana dashboards unchanged
7. Low ops complexity vs. Mimir: 3 components vs. 12+ microservices
8. Benchmark (2025): VictoriaMetrics used 4× less memory than Mimir under identical 500k-series load; 30% better compression

**Weaknesses:**
1. Multi-tenancy in cluster mode is URL-routing based — less rigorous isolation than Mimir's per-tenant TSDB instances
2. Enterprise features (downsampling, anomaly detection) require commercial license
3. MetricsQL extensions reduce portability if teams write MetricsQL-specific queries
4. Community smaller than Grafana-backed Mimir
5. No native per-tenant retention policy in community edition

**License:** Apache 2.0 (community); commercial for enterprise features

---

#### Option C: Grafana Mimir

Grafana Labs product, forked from Cortex. The "production Prometheus at scale" reference design.

**Strengths:**
1. Native multi-tenancy: X-Scope-OrgID header; per-tenant TSDB instances; ingestion and query rate limits per tenant
2. Horizontal scale: ingester, distributor, compactor, ruler, store-gateway — each scaled independently
3. Object storage backend (S3/MinIO) for long-term blocks — durable, cheap
4. PromQL compatible; Grafana integration first-class
5. Per-tenant rate limiting, cardinality limits, and resource quotas configurable per tenant
6. Active Grafana Labs investment; aligns with Tempo (tracing) and Loki (logs) under the LGTM stack
7. CNCF-adjacent via Grafana ecosystem; Cortex is CNCF Incubating

**Weaknesses:**
1. Microservices architecture: 12+ components to operate in production; significant ops burden for small teams
2. Memory-bound: 500k-series benchmark showed Mimir consuming 4× the memory of VictoriaMetrics
3. Storage compression 2–3× vs. VictoriaMetrics' 10× — higher long-term storage cost
4. Query latency for recent data (30–80ms median) slightly slower than VictoriaMetrics (20–50ms)
5. Requires dedicated SRE capacity to tune; not a "set and forget" system
6. Higher resource floor — minimum viable production cluster is more expensive than VictoriaMetrics equivalent

**License:** Apache 2.0 (AGPLv3 for some enterprise tooling — verify per component)

---

#### Option D: Thanos

Sidecar/proxy architecture layered on top of existing Prometheus instances. CNCF Incubating.

**Strengths:**
1. Non-disruptive addition to existing Prometheus deployments — sidecar approach
2. Global query view across multiple Prometheus instances (federation without scrape duplication)
3. Object storage compaction (Thanos Compactor) for long-term retention
4. Deduplication of HA Prometheus pairs
5. CNCF Incubating — governance and community established

**Weaknesses:**
1. Still requires managing Prometheus instances per cluster — doesn't replace Prometheus, augments it
2. Multi-tenancy via external labels — weak isolation compared to Mimir or VictoriaMetrics
3. ~10% CPU overhead from sidecar; query latency for historical data 200ms–2s (vs. VictoriaMetrics 100–500ms)
4. Architecture complexity: sidecar + store gateway + compactor + query layer
5. Storage compression 2–4× — inferior to VictoriaMetrics

**License:** Apache 2.0

---

#### Option E: M3DB / M3 (Uber)

Uber's large-scale metrics system, open-sourced. Designed for extreme cardinality.

**Strengths:**
1. Proven at Uber's scale (hundreds of billions of metrics)
2. Native multi-tenancy in M3Aggregator
3. Retention policies per namespace
4. PromQL compatible via M3Query

**Weaknesses:**
1. Extremely complex operational profile — among the hardest metric systems to operate
2. Uber has significantly reduced investment; community momentum has shifted to VictoriaMetrics and Mimir
3. Documentation gaps; limited commercial support options
4. Resource-intensive even at small scale
5. Not recommended for teams without dedicated M3 expertise

**License:** Apache 2.0

---

#### Option F: InfluxDB v3 / IOx

Time-series database from InfluxData. v3 rewrites to Apache Arrow / DataFusion.

**Strengths:**
1. Apache Arrow columnar format; excellent analytical query performance
2. SQL interface alongside Flux/InfluxQL
3. Native time-series compression
4. Strong IoT/device metrics use case

**Weaknesses:**
1. InfluxDB 3.x licensing: core open-source but clustering and some features require InfluxDB Cloud or commercial license
2. PromQL not natively supported — dashboard tooling requires adaptation
3. Prometheus ecosystem exporters don't target InfluxDB by default
4. Spring Boot Micrometer → InfluxDB reporter exists but is less maintained than Prometheus path
5. Weaker multi-tenancy than Mimir/VictoriaMetrics for platform-level use cases

**License:** Apache 2.0 (OSS Core) — some features commercial

---

#### Option G: OpenObserve (Metrics)

See Tracing section. AGPL license is a blocker for SaaS distribution.

---

### 6.2 Metrics Comparison Matrix

| Criterion | Prometheus | VictoriaMetrics | Grafana Mimir | Thanos | M3DB | InfluxDB v3 |
|---|---|---|---|---|---|---|
| Multi-tenancy | None | URL-routing | Excellent (native) | Label-based (weak) | Moderate | Weak |
| Horizontal scale | No | Yes (cluster) | Yes (microservices) | Via Prometheus | Yes | Partial |
| Storage compression | 1× | 10× | 2–3× | 2–4× | Moderate | High |
| Ops complexity | Very Low | Low-Medium | High | Medium | Very High | Medium |
| Memory efficiency (500k series) | Baseline | 50% lower | 4× higher vs VictoriaMetrics | Baseline | Moderate | Unknown |
| PromQL compatible | Yes (native) | Yes + MetricsQL | Yes | Yes | Yes (M3Query) | No (SQL/Flux) |
| Per-tenant retention | No | Enterprise only | Yes | Weak | Yes | Yes |
| Object storage backend | No | No (local) | Yes | Yes | No | Via IOx |
| Air-gap | Yes | Yes | Yes (MinIO) | Yes (MinIO) | Yes | Yes |
| License | Apache 2.0 | Apache 2.0 | Apache 2.0 | Apache 2.0 | Apache 2.0 | Mixed |
| Spring/Micrometer path | Native | Prometheus compat | Prometheus compat | Prometheus compat | Via Prometheus | Native |

### 6.3 Recommendation: VictoriaMetrics (cluster mode) with Prometheus as scrape layer

**Primary recommendation:** VictoriaMetrics cluster mode for long-term metrics storage.

**Rationale:**
- 10× storage compression is a material cost advantage for SaaS deployment where metrics volume scales with tenant count.
- 50% lower memory than Prometheus under identical series load — important for right-sizing 91-service deployments.
- PromQL compatibility means all existing Grafana dashboards, alerting rules, and team knowledge transfer unchanged.
- Ops complexity (3 components: VMInsert, VMStorage, VMSelect) is manageable for a team that must also operate 91 services.
- Multi-tenant routing via URL is less rigorous than Mimir but sufficient when combined with OTel Collector tenant-aware pipeline routing.

**Architecture:** Prometheus (per-cluster, as scrape engine) → remote write → VictoriaMetrics cluster → Grafana.

**If strict per-tenant TSDB isolation is required** (e.g., regulated tenants demanding complete storage separation), adopt **Grafana Mimir** instead — its per-tenant TSDB instances provide stronger isolation at the cost of higher operational complexity and resource consumption.

**Prometheus 3.x** is retained as the scrape engine for compatibility with the existing exporter ecosystem (APISIX, Keycloak, PostgreSQL exporter, Kafka exporter). OTLP ingest endpoint in Prometheus 3.x is used for metrics emitted from OTLP pipelines.

---

## 7. Sub-Decision 3 — Log Storage Backend

### 7.1 Options

#### Option A: Grafana Loki

Log aggregation system designed for Prometheus parity: label-indexed, not full-text indexed.

**Strengths:**
1. Extremely low storage cost — only labels are indexed; log content stored compressed in object store
2. LogQL query language mirrors PromQL patterns — consistent mental model across metrics and logs
3. Native multi-tenant isolation: X-Scope-OrgID header (same as Tempo, Mimir)
4. Object storage backend (MinIO for air-gap) — horizontally scalable
5. Grafana integration first-class — log-metric correlation, exemplar linking
6. Loki Operator for Kubernetes; mature Helm chart
7. CNCF incubating; Grafana Labs investment

**Weaknesses:**
1. No full-text index — query performance degrades severely for exploratory searches on non-indexed fields; "grep in the cloud" pattern
2. High-cardinality labels (tenant ID, patient visit ID) cause stream explosion and dramatically degrade performance
3. Regex log queries on billions of log lines are slow — object-store scan latency
4. Not suited for compliance audit search across PHI-adjacent log fields without dedicated label design
5. LogQL is powerful for metrics-style aggregation (rate, sum) but weak for structured JSON field queries

**License:** Apache 2.0 (AGPLv3 for some Loki enterprise features — verify)

---

#### Option B: OpenSearch (Logging)

OpenSearch is already selected as the CuraOS search platform (see ADR-0103). Using it for structured log storage as well eliminates a separate log backend.

**Strengths:**
1. Already in the stack — zero additional operational component; team already has OpenSearch expertise
2. Full-text inverted index + BM25 ranking — excellent for compliance investigation, PHI-adjacent audit searches
3. OpenSearch Dashboards (Kibana fork) for log visualization; plus Grafana OpenSearch data source plugin
4. Index lifecycle management (ILM): per-tenant index, per-tenant retention, automated rollover and deletion
5. GDPR erasure: per-tenant index deletion or field-level update for right-to-erasure
6. Strong multi-tenant pattern: per-tenant index namespacing, role-based access per index
7. Security plugin (free): field-level security to prevent PHI field exposure to unauthorized users

**Weaknesses:**
1. High storage cost relative to Loki — full inverted index is 3–5× the raw log size
2. CPU-intensive indexing pipeline — OTLP → Fluent Bit → OpenSearch pipeline requires tuning at high throughput
3. JVM-based heap management — requires careful GC tuning to avoid OOM at high log volumes
4. Not purpose-built for observability log correlation (trace ID → log links) without Grafana plugin
5. Schema management: index templates must be pre-defined or dynamic mapping can explode cardinality

**License:** Apache 2.0

---

#### Option C: Quickwit

Rust-based cloud-native search engine. Acquired by Datadog in early 2025.

**Strengths:**
1. Object storage native (S3/MinIO) — 90% storage cost reduction vs. Elasticsearch/OpenSearch
2. Full-text inverted index with columnar storage — best of both worlds
3. Native OTLP ingest for logs and traces
4. Sub-second search on petabyte-scale datasets
5. PromQL-style aggregation via SQL interface

**Weaknesses:**
1. **Acquired by Datadog (early 2025)** — open-source commitment post-acquisition uncertain; Datadog has history of closing OSS projects
2. Multi-tenancy story is basic in community edition
3. Smaller community than Loki or OpenSearch
4. UI is minimal — requires Grafana or another dashboard layer
5. Production maturity for healthcare/regulated workloads is unproven

**License:** Apache 2.0 (at time of writing; post-acquisition trajectory unknown)

---

#### Option D: Vector + ClickHouse

Collect logs via Vector (high-performance Rust log router), store in ClickHouse columnar DB.

**Strengths:**
1. ClickHouse columnar storage: 10–50× compression vs. Elasticsearch for log data
2. SQL queries over logs — no proprietary query language to learn
3. Extremely fast analytics: count-distinct, time-series aggregations sub-second
4. ClickHouse is already a potential backend for SigNoz (Sub-Decision 6) — shared component
5. Arbitrary schema flexibility — store any log structure without pre-defining mappings

**Weaknesses:**
1. No out-of-the-box log exploration UI — requires Grafana ClickHouse plugin or custom dashboards
2. Full-text search in ClickHouse is tokenized and fast but less capable than OpenSearch's BM25 for free-text investigation
3. Two components to operate (Vector + ClickHouse) before getting logs visible
4. Multi-tenancy: per-tenant table partitioning possible but not first-class; requires schema design discipline
5. GDPR erasure on ClickHouse requires `ALTER TABLE ... DELETE` mutations — eventual, not instantaneous

**License:** Apache 2.0 (Vector by Datadog — same Datadog acquisition concern), ClickHouse Apache 2.0

---

#### Option E: SigNoz Logs (ClickHouse-backed)

If SigNoz APM all-in-one is adopted, logs are stored in ClickHouse alongside traces. Evaluated here as standalone log option.

**Strengths:**
1. Native trace-log correlation: same ClickHouse cluster; link from trace span to log lines by trace ID natively
2. OTLP-native log ingest
3. Full-text search on log body via ClickHouse inverted index
4. Structured JSON log field queries supported
5. Log anomaly detection features in SigNoz roadmap

**Weaknesses:**
1. Community edition lacks per-tenant log isolation — multi-tenancy requires enterprise license or separate deployment
2. SigNoz-specific log schema — migrating off requires ETL
3. ClickHouse operational burden shared with trace storage (can be a positive)
4. Log retention management via ClickHouse TTL — less user-friendly than Loki's per-stream retention

---

#### Option F: Graylog

Centralized log management platform. MongoDB + Elasticsearch/OpenSearch backend.

**Strengths:**
1. Purpose-built for log management: log streams, parsing, alerting, dashboards in one product
2. Full-text search via Elasticsearch/OpenSearch backend
3. Per-stream access control, alert conditions, dashboards
4. HIPAA mode available with audit log of all searches performed on the platform

**Weaknesses:**
1. MongoDB dependency adds another stateful component (or MongoDB Atlas cost)
2. Less integration with the OTLP/Prometheus ecosystem — custom pipelines required
3. Graylog Open (free tier) has limited multi-tenancy — team isolation but not tenant isolation
4. Graylog Enterprise required for full multi-tenancy; licensing cost on top of infrastructure
5. JVM-based; similar heap tuning requirements to OpenSearch

**License:** SSPL (Graylog Open) — **SSPL is NOT OSI-approved and has similar SaaS distribution concerns as AGPL**

---

#### Option G: Elastic (Elasticsearch)

The original log search platform. Elastic changed to SSPL + Elastic License 2.0 in 2021.

**Strengths:**
1. Best-in-class full-text search; mature ecosystem
2. Kibana rich visualization; SIEM integration
3. Elastic APM for trace correlation
4. Widespread production experience

**Weaknesses:**
1. **License: Elastic License 2.0 (ELv2) + SSPL** — not OSI open source; SaaS use requires Elastic commercial license
2. Extremely high storage cost — inverted indexes are large
3. JVM heap management is complex at scale
4. Elastic has litigated over SaaS distributions (AWS/OpenSearch fork origin)
5. Not recommended for self-hosted cost-conscious deployments

**License:** ELv2 + SSPL — **BLOCKER for SaaS distribution**

---

### 7.2 Log Backend Comparison Matrix

| Criterion | Loki | OpenSearch | Quickwit | ClickHouse (Vector) | SigNoz Logs | Graylog | Elastic |
|---|---|---|---|---|---|---|---|
| Full-text search | No | Excellent | Excellent | Good (tokenized) | Good | Excellent | Excellent |
| Storage cost | Very Low | High | Very Low | Very Low | Very Low | High | Very High |
| Multi-tenancy | Excellent | Excellent (index-per-tenant) | Basic | Manual | EE only | Enterprise | Enterprise |
| Already in stack | No | **Yes** | No | If SigNoz chosen | If SigNoz chosen | No | No |
| Object storage | Yes (MinIO) | No (local) | Yes (MinIO) | No | No | No | No |
| OTLP log ingest | Yes (via Promtail/OTel) | Via OTel exporter | Native | Via Vector | Native | Via pipeline | Via agent |
| GDPR erasure | Stream delete | Index delete | Segment delete | Mutation (async) | TTL | Stream delete | Index delete |
| Per-tenant retention | Yes | ILM per index | Basic | Manual TTL | TTL-based | Stream-based | ILM |
| License | Apache 2.0* | Apache 2.0 | Apache 2.0† | Apache 2.0 | Apache/EE | SSPL ⚠️ | ELv2+SSPL ⚠️ |
| Air-gap | Yes | Yes | Yes | Yes | Yes | Partial | Partial |

*Verify Loki enterprise licensing. †Post-Datadog acquisition status uncertain.

### 7.3 Recommendation: Grafana Loki + OpenSearch dual-path

**Primary log path: Grafana Loki** for operational/observability logs (structured service logs, request logs, error logs from the 91 services).

**Secondary path: OpenSearch** (already in stack) for compliance investigation logs and audit-adjacent queries where full-text search on log body is required.

**Routing logic at OTel Collector:**

```
OTel Collector
├── [service operational logs] → Loki OTLP endpoint  (low-cost object store)
└── [compliance/audit logs]   → OpenSearch index     (full-text search on body)
```

**Rationale:**
- Loki's label-indexed approach is perfectly suited for operational observability patterns: "show me all ERROR logs from identity-service in the last 15 minutes" — this is label-filtered, not full-text.
- OpenSearch is already operated for product search (ADR-0103); adding compliance log indices costs only storage and index template configuration, not a new operational component.
- The dual-path avoids Loki's weakness (full-text body search) without paying OpenSearch's high storage cost for high-volume operational logs.
- Both backends share the Grafana visualization layer via respective data source plugins.
- Multi-tenant isolation: Loki X-Scope-OrgID header; OpenSearch per-tenant index naming (`tenant-{id}-audit-logs-{YYYY.MM}`).

---

## 8. Sub-Decision 4 — Dashboard / Visualization Layer

### 8.1 Options

#### Option A: Grafana (OSS)

The de facto standard for observability dashboards.

**Strengths:**
1. Data source plugin ecosystem: Prometheus, VictoriaMetrics, Loki, Tempo, OpenSearch, PostgreSQL, Kafka — all supported natively
2. Dashboard-as-code via Grafonnet (Jsonnet) or Terraform Grafana provider — GitOps friendly
3. Multi-tenant dashboards via Grafana Organizations or Grafana Teams + row-level RBAC
4. Grafana SLO, incident management (Grafana OnCall), alerting — ecosystem expanding
5. LGTM stack synergy: Loki, Grafana, Tempo, Mimir — native feature integration (exemplars, correlations)
6. Grafana Scenes for building interactive application dashboards embedded in CuraOS admin UI
7. Air-gap: offline plugin installation supported; no phone-home required

**Weaknesses:**
1. Multi-tenant dashboard isolation requires careful RBAC configuration — misconfiguration can expose cross-tenant data
2. Grafana OSS has no built-in per-org data source isolation — each Organization must be manually configured with tenant-scoped data sources
3. Dashboard sprawl is common without governance tooling
4. Alerting in Grafana OSS has matured but still lacks some Alertmanager cluster HA features
5. Requires Grafana Enterprise for advanced features like reporting, fine-grained RBAC, audit log

**License:** AGPLv3 (Grafana OSS) — **NOTE: Grafana OSS UI is AGPLv3; running Grafana as a service (embedding in CuraOS) requires review**

**Important:** Grafana's AGPLv3 applies to modifications to Grafana itself. Running Grafana as a separate service alongside CuraOS (not embedding the Grafana binary into CuraOS) is generally acceptable. Confirm with legal counsel for CuraOS SaaS distribution.

---

#### Option B: SigNoz UI

Included with SigNoz APM stack. React-based, ClickHouse-backed.

**Strengths:**
1. APM-first design: service maps, latency percentiles, error rates, trace waterfall — all first-class
2. Unified interface for traces, metrics, logs — no tab-switching between tools
3. OTLP-native query design matches how data is stored
4. Exception tracking, alerts, dashboards all integrated

**Weaknesses:**
1. Less flexible than Grafana for custom business dashboards (not built for general BI use)
2. Limited data source support — primarily SigNoz's own ClickHouse backend
3. Multi-tenant isolation requires SigNoz Enterprise or separate deployments
4. Smaller plugin ecosystem than Grafana

---

#### Option C: HyperDX UI / ClickStack UI

Modern developer-first observability UI. Included with ClickStack.

**Strengths:**
1. Session replay + traces + logs in unified view — unique for full-stack debugging
2. Clean, fast React UI; modern design patterns
3. SQL-native query surface via ClickHouse
4. Team-based access control

**Weaknesses:**
1. Purpose-built for APM workflows — less suited for infrastructure / operations dashboards
2. Session replay introduces HIPAA/GDPR risk: may capture PHI in clinical form inputs
3. Multi-tenancy story is not first-class
4. Smaller ecosystem than Grafana

---

#### Option D: OpenObserve UI

Included with OpenObserve. Rust-native, lightweight.

**Strengths:**
1. Bundled with OpenObserve storage — zero additional component
2. SQL-based query interface
3. Dashboards, alerts, and data explorer integrated

**Weaknesses:**
1. OpenObserve AGPLv3 license applies to the UI — same blocker as the storage backend
2. Less mature than Grafana; fewer visualization types
3. Multi-tenancy coverage less documented

---

#### Option E: OpenSearch Dashboards

Kibana fork, ships with OpenSearch.

**Strengths:**
1. Already in stack for OpenSearch-backed compliance logs
2. Full-text search-optimized interface; excellent for log investigation
3. Per-tenant index RBAC for data isolation
4. Security analytics, SIEM-style views

**Weaknesses:**
1. Not suitable as the primary observability dashboard — no PromQL/Prometheus integration
2. Metrics visualization is weak compared to Grafana
3. Trace visualization requires OpenSearch Observability plugin — less mature than Grafana/Tempo
4. Two dashboard UIs (Grafana + OpenSearch Dashboards) is a UX split; engineers need to know which to use

---

#### Option F: Datadog (managed comparison baseline)

Included for reference as the managed market leader.

**Strengths:**
1. All-in-one, zero operational burden
2. Excellent ML-driven anomaly detection, forecasting
3. Session replay, APM, infrastructure all unified
4. Best-in-class alert correlation (correlation engine)

**Weaknesses:**
1. **No self-hosted option** — violates "self-hosted first" constraint
2. Per-host / per-service pricing is extremely expensive at 91-service scale; multi-tenant SaaS billing unpredictable
3. PHI in traces requires Datadog-specific sensitive data scanner — adds cost and complexity
4. GDPR data residency requires Datadog EU region — geographic lock-in
5. Not suitable for air-gap or on-prem deployments

---

### 8.2 Dashboard Recommendation: Grafana as Primary UI

Grafana OSS is the recommended primary dashboard and visualization layer.

**Rationale:**
- Data source plugin breadth is unmatched — covers VictoriaMetrics, Loki, Tempo, OpenSearch, PostgreSQL, Kafka all in one UI.
- Dashboard-as-code (Grafonnet / Terraform) enables GitOps-managed dashboards across 91 services.
- LGTM stack synergy: exemplar linking (metrics → trace), log-trace correlation, and alert rule management all integrated.
- Grafana Organizations model maps to CuraOS tenants — each tenant's Grafana Organization is configured with data sources scoped to that tenant's VictoriaMetrics, Loki, and Tempo namespaces.
- AGPLv3 concern: Grafana OSS running as a separate service (not embedded binary) in CuraOS is permissible; confirm with legal for embedded distribution scenarios.

**OpenSearch Dashboards** is retained as a secondary tool scoped to compliance log investigation only, not surfaced to end-tenants.

---

## 9. Sub-Decision 5 — Instrumentation Strategy

### 9.1 OpenTelemetry SDK and Collector Architecture

**OpenTelemetry Java SDK** (current stable: 1.x, BOM version 2.12.0 at time of writing) is the instrumentation standard for all 91 Kotlin + Spring Boot services. Two instrumentation paths exist:

#### Path A: Java Agent (Zero-Code / Bytecode)

Attach `opentelemetry-javaagent.jar` via JVM `-javaagent` flag. Instruments Spring, JDBC, Kafka, HTTP clients, gRPC, Netty, Hibernate, and dozens of other libraries via bytecode instrumentation — no code changes required.

**Adopt for:** All 91 services as the baseline. Agent version 2.x provides improved coroutine context propagation (see §9.3).

**Configuration:**

```yaml
# Spring Boot container env vars
JAVA_TOOL_OPTIONS: "-javaagent:/otel/opentelemetry-javaagent.jar"
OTEL_SERVICE_NAME: "identity-service"
OTEL_RESOURCE_ATTRIBUTES: "tenant.id=${TENANT_ID},deployment.environment=${ENV}"
OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4317"
OTEL_EXPORTER_OTLP_PROTOCOL: "grpc"
OTEL_LOGS_EXPORTER: "otlp"
OTEL_METRICS_EXPORTER: "otlp"
OTEL_TRACES_EXPORTER: "otlp"
```

#### Path B: Spring Boot OpenTelemetry Starter

Declarative Spring autoconfigure-based instrumentation. Preferred for Spring Native image builds where the Java agent does not work. Provides access to OpenTelemetry API for custom spans alongside auto-instrumented spans.

**Adopt for:** Services built as Spring Native images (GraalVM AOT); any service requiring custom span enrichment beyond agent capabilities.

**Dependency:**

```kotlin
// build.gradle.kts
implementation(platform("io.opentelemetry.instrumentation:opentelemetry-instrumentation-bom:2.12.0"))
implementation("io.opentelemetry.instrumentation:opentelemetry-spring-boot-starter")
```

#### Spring Boot Micrometer Pairing

Spring Boot Actuator exposes metrics via Micrometer. In Spring Boot 3.4+, the `management.otlp.metrics.export` properties enable direct OTLP export from Micrometer without a Prometheus scrape endpoint. For compatibility with VictoriaMetrics (Prometheus remote write), retain the Prometheus endpoint as primary metrics export; OTel Collector can scrape it.

```yaml
# application.yaml
management:
  metrics:
    export:
      prometheus:
        enabled: true
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
```

### 9.2 OTel Collector Pipeline Architecture

The OTel Collector is the central processing and routing layer — the single point where PHI redaction, tenant-aware routing, and signal fan-out occur.

```
┌─────────────────────────────────────────────────────────────────┐
│                    OTel Collector (DaemonSet per node)           │
│                                                                   │
│  Receivers:                                                       │
│    otlp (grpc :4317, http :4318)   ← Java Agent / Starter        │
│    prometheus                       ← Spring Actuator scrape     │
│    filelog                          ← stdout log capture         │
│                                                                   │
│  Processors (in order):                                           │
│    1. memory_limiter               ← prevent OOM                 │
│    2. batch                        ← efficiency                  │
│    3. resource_detection           ← k8s pod/namespace labels    │
│    4. redaction (PHI/PII)          ← HIPAA compliance gate       │
│    5. attributes (tenant routing)  ← inject X-Scope-OrgID       │
│    6. filter (drop health checks)  ← noise reduction            │
│    7. tail_sampling                ← SaaS cost control           │
│                                                                   │
│  Exporters:                                                       │
│    otlp/tempo      → Grafana Tempo (traces)                      │
│    prometheusremotewrite → VictoriaMetrics (metrics)            │
│    loki            → Grafana Loki (operational logs)             │
│    opensearch      → OpenSearch (compliance logs)               │
└─────────────────────────────────────────────────────────────────┘
```

**PHI Redaction Processor (HIPAA Critical):**

```yaml
processors:
  redaction:
    allow_all_keys: false
    allowed_keys:
      - trace_id
      - span_id
      - service.name
      - http.method
      - http.status_code
      - http.route
      - db.system
      - db.operation
      - tenant.id
      - environment
    blocked_values:
      # SSN pattern
      - "\\b\\d{3}-\\d{2}-\\d{4}\\b"
      # MRN patterns (example; tune per system)
      - "\\bMRN[:\\s]?\\d{6,10}\\b"
      # Date of birth in common formats
      - "\\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\\d|3[01])[-/](19|20)\\d{2}\\b"
      # Email addresses
      - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
    summary: debug
```

**Tenant Routing Processor:**

```yaml
processors:
  attributes/tenant:
    actions:
      - key: X-Scope-OrgID
        from_attribute: tenant.id
        action: insert
```

### 9.3 Kotlin Coroutine Context Propagation

**Problem:** Kotlin coroutines suspend and resume on different threads. OpenTelemetry context is stored in thread-local storage, which does not follow coroutine suspension — trace context is lost when a coroutine resumes on a different thread pool thread.

**Solution 1: OpenTelemetry Kotlin Extension (Recommended)**

```kotlin
// build.gradle.kts
implementation("io.opentelemetry.instrumentation:opentelemetry-extension-kotlin:1.x.0")
```

The extension provides `KotlinContextElement` that carries the OTel `Context` as a `CoroutineContext.Element`, ensuring trace context propagates across suspend points automatically.

```kotlin
// Usage pattern
suspend fun processPatientRequest(request: Request): Response =
    withContext(openTelemetryContext.asContextElement()) {
        // All coroutine children inherit this span context
        val result = async { fetchPatientRecord(request.patientId) }
        result.await()
    }
```

**Solution 2: Java Agent v2 (Automatic)**

Java Agent 2.x provides improved automatic context propagation for Kotlin coroutines via bytecode-level instrumentation. With the agent attached, the `CoroutineContext` propagation is handled without code changes in most Spring WebFlux / coroutine-based handlers.

**Recommendation:** Use Java Agent v2 as the primary mechanism; add the Kotlin extension explicitly for custom async dispatch patterns (e.g., `Dispatchers.IO` blocks that launch parallel coroutine trees).

### 9.4 Frontend Instrumentation

**React (Admin UI, Portal):**
- `@opentelemetry/sdk-web` with `@opentelemetry/instrumentation-fetch` and `@opentelemetry/instrumentation-xml-http-request` for request tracing
- `@opentelemetry/instrumentation-document-load` for page load timing
- Web Vitals (LCP, FID, CLS, TTFB, INP) via `web-vitals` library → OTel Collector HTTP endpoint
- RUM data routes to Grafana for frontend performance dashboards

**Flutter (Mobile/Tablet):**
- `opentelemetry-dart` SDK for traces from Flutter app
- Custom OTel HTTP exporter pointing to OTel Collector endpoint
- Crash reporting via `flutter_crashlytics` or Sentry self-hosted (see alerting section)

**Astro (Marketing/Public Site):**
- Server-side: Node.js OTel SDK on the SSR runtime
- Client-side: minimal Web Vitals collection; no SDK overhead on public pages

### 9.5 FHIR-Aware Trace Design (HealthStack Overlay)

FHIR resources carry PHI by definition. Traces that traverse HealthStack services must:

1. **Never include patient identifiers in span attributes.** Use opaque internal resource IDs (UUIDs) only. Patient MRN, name, DOB must not appear in any trace attribute.
2. **Propagate encounter context by opaque ID.** Span attribute `healthstack.encounter.id` is an internal UUID — not the FHIR `Encounter.identifier` visible to users.
3. **Audit access separately.** The ADR-0104 hash-chained audit log captures "who accessed patient X" — the observability trace captures "encounter-service responded in 45ms." These are different records with different data.
4. **PHI in logs:** HealthStack service logs must use structured logging with explicit exclusion of FHIR resource content fields. Log the resource type and operation, not the resource content.

```kotlin
// Correct — log operation metadata only
log.info("FHIR operation completed",
    kv("resource.type", "Observation"),
    kv("operation", "create"),
    kv("encounter.id", encounterId.toString()),  // opaque UUID
    kv("duration_ms", elapsed)
)

// WRONG — never log FHIR resource content
// log.info("Created observation: $observationResource")  // contains PHI
```

---

## 10. Sub-Decision 6 — APM All-in-One Alternative

### 10.1 Context

An APM all-in-one platform integrates traces, metrics, and logs in a single product. The primary tradeoff is operational simplicity (one stack) vs. flexibility (best-of-breed cherry-picking). This sub-decision evaluates whether a unified platform should replace the cherry-picked LGTM stack components.

### 10.2 Options

#### Option A: SigNoz

OpenTelemetry-native, ClickHouse-backed APM. Apache 2.0 community edition.

**Strengths:**
1. Single platform for traces, metrics, logs, alerts — one UI, one query system, one storage backend
2. OTLP-native: no vendor SDKs; OTel instrumentation works as-is
3. ClickHouse storage: 10–50× compression vs. Elasticsearch; fast analytics; full-text search on logs
4. Service map auto-generated from traces; RED metrics (Rate, Errors, Duration) computed per service
5. Exception tracking with stack trace capture
6. Alerting built-in; alert rules from any signal (trace error rate, log pattern, metric threshold)
7. Apache 2.0 community edition is genuinely open; enterprise features require SigNoz Cloud or SigNoz EE
8. Active development: funded startup with clear roadmap; ClickHouse backend is a proven choice (used by Cloudflare, Uber, ByteDance)
9. Production deployment guide well-documented; distributed ClickHouse setup documented

**Weaknesses:**
1. Multi-tenancy: community edition does not provide per-tenant data isolation; requires separate SigNoz instance per tenant or enterprise license
2. ClickHouse cluster operational complexity: ZooKeeper/ClickHouse Keeper ensemble; sharding; replication; compaction
3. GDPR erasure on ClickHouse is mutation-based (async TTL) — not instantaneous; requires compliance process acknowledgment
4. Retention management less ergonomic than Loki's per-stream or Mimir's per-tenant TTL
5. Grafana plugin available but SigNoz is designed around its own UI — integrating into existing Grafana dashboards requires duplication
6. Resource requirements at scale: ClickHouse is memory-hungry; capacity planning required

**Self-hosted:** Excellent — Docker Compose for dev; Helm chart for Kubernetes production  
**Air-gap:** Good — all images pre-stageable; document-driven setup  
**HIPAA:** Redaction at OTel Collector before SigNoz ingest; ClickHouse does not have native field-level encryption — encrypt at rest via filesystem/volume encryption  
**License:** Apache 2.0 (community)

---

#### Option B: HyperDX / ClickStack

Open-sourced as ClickStack (Apache 2.0). ClickHouse backend + HyperDX UI.

**Strengths:**
1. Session replay + logs + traces + metrics in a single interface — unique differentiator for UX debugging
2. ClickHouse backend (same as SigNoz) — shared operational knowledge if both are evaluated
3. SQL access to all signals — powerful for custom investigation
4. OTLP-native ingest
5. Modern, developer-friendly UI with collaborative features

**Weaknesses:**
1. Session replay is a significant HIPAA/GDPR risk surface: clinical form interactions may capture PHI; requires session replay masking configuration for all patient-facing screens
2. Younger project; community smaller than SigNoz
3. Multi-tenancy not first-class; shared ClickHouse instance model
4. Less Spring Boot / JVM ecosystem documentation than SigNoz
5. ClickStack (open-source) is newer rebranding; production maturity less validated

**License:** Apache 2.0

---

#### Option C: OpenObserve

Rust-based, Parquet/DataFusion, unified all-in-one.

**Strengths:**
1. Lowest storage cost per GB — Parquet + DataFusion enables petabyte-scale at minimal compute
2. Single binary for everything — minimal ops footprint (ideal for SMB on-prem deploys)
3. OTLP-native
4. Sub-second query on large datasets
5. Built-in dashboards, alerts, and log/metric/trace correlation

**Weaknesses:**
1. **AGPLv3 license — BLOCKER for SaaS distribution** (see §3)
2. Tracing and metrics capabilities less mature than SigNoz or LGTM stack
3. Multi-tenancy less battle-tested at healthcare scale
4. Smaller community; fewer production war stories
5. License has changed before (Apache → AGPL) — supply-chain risk

**License:** AGPLv3 (**BLOCKER**)

---

#### Option D: Sentry (Self-Hosted)

Error tracking and performance monitoring. Sentry can be self-hosted.

**Strengths:**
1. Best-in-class error tracking with stack trace capture, release tracking, user impact assessment
2. Self-hosted option available (Sentry On-Premise)
3. Performance traces for web and mobile (React, Flutter SDKs)
4. Session replay (same HIPAA concern as HyperDX — must be configured to mask PHI fields)
5. Alerting on error rate, performance regression

**Weaknesses:**
1. **Sentry Self-Hosted: BSL (Business Source License) 1.1** — converts to MIT after 4 years; SaaS distribution with Sentry code may have constraints — verify with legal
2. Not suitable as a primary infrastructure/backend APM — designed for application-level error tracking
3. No PromQL/metrics backend — would be additive to the stack, not a replacement
4. Heavy Python stack to self-host; significant ops burden
5. Does not replace traces, metrics, or logs backends

**License:** BSL 1.1 (verify SaaS distribution terms)

---

#### Option E: LGTM Stack (Loki + Grafana + Tempo + Mimir/VictoriaMetrics)

Cherry-picked best-of-breed stack: one tool per signal, unified via Grafana.

**Strengths:**
1. Best-in-class tool for each signal; no compromises
2. Apache 2.0 throughout (Loki, Tempo, VictoriaMetrics, Grafana OSS)
3. Each component can be scaled, replaced, or upgraded independently
4. Multi-tenancy mature at each layer (Tempo X-Scope-OrgID, Mimir/VictoriaMetrics tenant routing, Loki org ID)
5. Largest community across all components; most production war stories
6. Flexibility to adopt the best storage per signal (object store for Tempo/Loki; time-series DB for metrics)

**Weaknesses:**
1. Multiple components to operate: VictoriaMetrics cluster + Loki + Tempo + Grafana + OTel Collector + Alertmanager = ~6 systems
2. Cross-signal correlation requires Grafana configuration (exemplars, derived fields) — not automatic
3. No single "APM view" — engineers must compose the debugging workflow from multiple Grafana panels
4. Alert rule management split between Grafana Alerting and Prometheus Alertmanager

---

### 10.3 APM All-in-One Recommendation

**Recommendation: LGTM stack (cherry-picked) as the default; SigNoz as the recommended alternative for teams that prioritize a unified APM experience over signal-specific optimization.**

**Decision tree:**

- **SaaS multi-tenant deployment (primary):** LGTM stack — superior per-tenant isolation across all signal backends; avoids SigNoz EE licensing for multi-tenancy.
- **SMB on-prem / air-gap single-tenant:** SigNoz — single stack is operationally simpler; ClickHouse can be single-node; multi-tenancy is not required.
- **Developer debugging ergonomics priority:** SigNoz or ClickStack — unified trace-log-metric correlation in one UI reduces context-switching.

**Session replay (HyperDX/ClickStack/Sentry):** Can be adopted as an additive tier for the admin and public-facing React UI. Must be blocked entirely on clinical forms and any screen that renders PHI. Consult HIPAA compliance officer before enabling session replay in HealthStack context.

---

## 11. Sub-Decision 7 — Alerting

### 11.1 Options

#### Option A: Prometheus Alertmanager

The reference alerting system for Prometheus-ecosystem stacks.

**Strengths:**
1. File-driven configuration — GitOps native; alert rules and routes as YAML in version control
2. Gossip-based HA cluster — multiple Alertmanager instances share silence and notification state
3. Deduplication, grouping, inhibition, silencing — mature operational primitives
4. Integration library: PagerDuty, OpsGenie, Slack, email, webhook
5. PromQL-based alert rules — same language as dashboards and recording rules
6. Battle-tested at extreme scale (Meta, Cloudflare, GitHub all use Alertmanager)

**Weaknesses:**
1. Metrics-only — cannot alert on log patterns or trace error rates without exporting metrics first
2. UI is minimal and read-only — silences and routes managed via API/config, not UI
3. No built-in alert history — need external persistence for alert state history
4. Multi-tenant alert routing is possible via label matchers but requires careful configuration to avoid cross-tenant notifications

**License:** Apache 2.0

---

#### Option B: Grafana Alerting (Unified)

Embedded alerting engine in Grafana, routing through Alertmanager-compatible backend.

**Strengths:**
1. Multi-datasource alert rules — query Loki (log patterns), Prometheus/VictoriaMetrics (metrics), Tempo (trace error rates), PostgreSQL (business events) in one alerting system
2. UI-driven alert management — teams can create and tune alerts without editing YAML
3. Contact points, notification policies, silences all manageable via Grafana UI
4. Provisioning via YAML (alert rules, dashboards, data sources) for GitOps
5. Alert evaluation on the data already in Grafana — no metric export pipeline needed for log-based alerts
6. Grafana OnCall integration for on-call scheduling and escalation

**Weaknesses:**
1. Alertmanager HA clustering is tighter when Alertmanager runs standalone vs. embedded in Grafana
2. Grafana OSS alerting is AGPLv3 (per Grafana's overall license) — confirm SaaS distribution posture
3. Alert evaluation load adds to Grafana server resource consumption
4. Some teams find the Grafana alerting UI less intuitive than they expected; rule management at scale requires discipline

**License:** AGPLv3 (via Grafana OSS)

---

#### Option C: PagerDuty (Managed)

Market-leading incident management platform. Cloud-only.

**Strengths:**
1. Best-in-class on-call scheduling, escalation, incident timelines
2. Event intelligence: alert correlation, ML-based noise reduction
3. Bidirectional integrations with every monitoring tool

**Weaknesses:**
1. **Cloud-managed only** — violates self-hosted/air-gap constraint for on-prem deployments
2. Per-seat cost is high at scale
3. PHI must not appear in PagerDuty incident titles or descriptions — requires scrubbing before routing

---

#### Option D: OpsGenie (Atlassian, Managed)

Similar to PagerDuty. Cloud-only.

**Weaknesses:**
1. Same cloud-only constraint as PagerDuty
2. Atlassian acquisition has led to reduced investment; functionality plateau

---

#### Option E: Karma + Alertmanager

Karma is a read-only Alertmanager dashboard with multi-cluster alert aggregation.

**Strengths:**
1. Multi-cluster Alertmanager view — aggregate alerts across all deployments in one UI
2. Silence management UI over Alertmanager API
3. Alert group visualization with filter/search

**Weaknesses:**
1. Read-only — cannot manage alert rules (that is Alertmanager's job)
2. Not a replacement for Alertmanager; additive visualization layer only
3. Less actively developed

---

#### Option F: Grafana OnCall (Self-Hosted)

On-call scheduling and escalation. Available as OSS.

**Strengths:**
1. Self-hosted option (Apache 2.0 for OSS edition)
2. Shift scheduling, escalation chains, acknowledgment workflows
3. Integrates with Grafana Alerting as the downstream notification router
4. Teams can manage on-call schedules without PagerDuty

**Weaknesses:**
1. Less mature than PagerDuty/OpsGenie for complex escalation scenarios
2. Requires additional infrastructure (Grafana OnCall backend)

---

### 11.2 Alerting Recommendation

**Primary: Grafana Unified Alerting** for all alert rule management (metrics, logs, traces).

**Secondary: Prometheus Alertmanager** as the notification backend (Grafana Alerting uses Alertmanager for routing/deduplication). Run Alertmanager in HA cluster (3 nodes) for production.

**On-call routing: Grafana OnCall** (self-hosted) for shift management and escalation. Integrates with Grafana Alerting → Alertmanager → OnCall → SMS/Slack/webhook.

**Managed on-call (optional additive tier for SaaS customers who prefer PagerDuty):** Support PagerDuty as a webhook target from Alertmanager; PHI scrubbing at the webhook processor is mandatory before routing to PagerDuty.

---

## 12. Sub-Decision 8 — Distributed Tracing Storage: Cardinality, Sampling, Retention

### 12.1 Cardinality Limits

High-cardinality trace attributes (per-patient trace IDs, per-request IDs, per-tenant resource IDs) are not a cardinality problem in tracing backends the same way they are in metrics. Tracing databases (ClickHouse, Elasticsearch, object store) store individual spans — they are not doing label aggregation. However, cardinality affects:

1. **Metrics derived from traces** (Tempo's metrics-generator, SigNoz RED metrics): aggregating by high-cardinality attributes (patient ID) as a metric label dimension is dangerous — do not. Use only low-cardinality dimensions in derived metrics (service name, HTTP method, status code, tenant ID).
2. **Trace search indexes** (Tempo tag-value index, SigNoz ClickHouse secondary index): high-cardinality span attributes indexed in Tempo's tag-value index increase index size. Configure Tempo to index only designated low-cardinality attributes; use TraceQL for high-cardinality lookups (these scan span data directly, not the index).

### 12.2 Tenant-Aware Sampling

**Default strategy: Head sampling at 100% for errors and slow traces; tail sampling for normal traces.**

```yaml
# OTel Collector tail sampling processor config
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      - name: error-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-traces
        type: latency
        latency:
          threshold_ms: 1000
      - name: probabilistic-sample
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

**Per-tenant sampling overrides:** Route tenant traces through tenant-specific OTel Collector pipelines where sampling rate can be configured per-tenant. Large SaaS tenants (high volume) can have lower base sampling rates; small SMB tenants can retain 100%.

**Air-gap / On-Prem:** 100% sampling is recommended — storage cost on customer infrastructure is customer-borne; the value of full trace fidelity outweighs the cost at single-tenant scale.

### 12.3 Retention Policy

| Deployment | Trace Retention | Metrics Retention | Log Retention |
|---|---|---|---|
| SaaS (tenant default) | 30 days hot / 90 days warm (object store tier) | 1 year (downsampled after 30d) | 30 days hot / 90 days compressed |
| SaaS (regulated tenant) | 7 years (HIPAA minimum for PHI-adjacent records — verify with counsel) | 7 years | 7 years |
| On-Prem | Customer-configured; minimum 30 days | Customer-configured | Customer-configured |
| Air-Gap | Customer-configured; ship with 90-day defaults | 90 days | 90 days |

**GDPR Right-to-Erasure:** Tenant deletion cascades to:
- Loki: delete log streams matching `{tenant.id="<id>"}` via Loki delete API
- Tempo: delete all traces with `X-Scope-OrgID: <id>` via Tempo delete API (object storage key prefix purge)
- VictoriaMetrics: delete all series with `tenant_id="<id>"` label via VictoriaMetrics HTTP delete endpoint
- OpenSearch: delete tenant-specific index (`tenant-{id}-audit-logs-*`)

Erasure SLO: 30 days from request receipt (within GDPR Article 17 "without undue delay" requirement).

---

## 13. Sub-Decision 9 — Audit Trail Integration (ADR-0104 Interface)

ADR-0104 establishes a hash-chained, tamper-evident audit log. The observability stack interacts with it as follows:

### 13.1 What Goes to the Audit Log vs. the Observability Stack

| Event Type | Destination | Reason |
|---|---|---|
| "User X accessed patient Y's record" | **Audit Log only** | PHI context; tamper-evident; HIPAA required |
| "identity-service handled GET /fhir/Patient/{id} in 45ms" | **Observability (Tempo trace)** | No PHI; operational data |
| "Auth token issued for user X" | **Audit Log** | Security event; regulatory |
| "Keycloak token validation latency: 12ms" | **Observability (Metrics)** | Operational; no PII |
| "BPM workflow W transitioned from state A to B" | **Observability + Audit Log** | Observability for performance; Audit for regulatory workflow compliance |
| "Schema migration executed on tenant T's DB" | **Audit Log** | Infrastructure change event |
| "OTel Collector dropped 500 spans due to tail sampler" | **Observability (Self-telemetry)** | Pipeline health metric |

### 13.2 Compliance Dashboard Pattern

Grafana dashboards for compliance reporting query the **OpenSearch audit log index** (via Grafana OpenSearch data source), not the observability backends. This ensures:
- Compliance reports are based on tamper-evident records, not mutable observability data
- PHI context (which patient was accessed) never enters the observability pipeline
- Grafana RBAC controls which roles can view the compliance dashboard vs. the operational dashboard

### 13.3 Alert on Audit Trail Health

The OTel Collector emits self-telemetry metrics. Use these to alert if:
- Audit log write latency exceeds SLO (indicating potential audit trail gap)
- Hash-chain verification fails (alert routed to security incident response, not standard on-call)

```yaml
# Alertmanager rule example
- alert: AuditTrailHashChainFailure
  expr: audit_hash_chain_verification_failures_total > 0
  for: 0m
  labels:
    severity: critical
    team: security
  annotations:
    summary: "Audit trail hash chain verification failure — potential tampering"
```

---

## 14. Sub-Decision 10 — Multi-Tenant Data Isolation

### 14.1 Isolation Architecture

**Isolation Model:** Shared infrastructure, tenant-logically-isolated data paths. Not separate clusters per tenant (cost-prohibitive at 91-service scale for hundreds of tenants).

**Enforcement points:**

| Layer | Mechanism | Enforced By |
|---|---|---|
| Trace collection | X-Scope-OrgID header in OTel Collector | OTel Collector attributes processor |
| Trace storage | Tempo object storage prefix per tenant | Tempo multi-tenant routing |
| Metrics collection | tenant.id label; per-tenant VMInsert routing | OTel Collector attributes processor |
| Metrics storage | VictoriaMetrics accountID/projectID URL routing | VictoriaMetrics cluster |
| Log collection | X-Scope-OrgID header | OTel Collector attributes processor |
| Log storage | Loki stream label `tenant.id` | Loki multi-tenancy |
| Dashboard access | Grafana Organization per tenant | Grafana RBAC |
| Alert routing | Alertmanager label matchers per tenant | Alertmanager routing config |
| Audit log | Per-tenant OpenSearch index | OpenSearch RBAC |

### 14.2 Per-Tenant Dashboards

Each tenant gets a dedicated Grafana Organization provisioned on onboarding:

```python
# Grafana provisioning script (called by tenant onboarding service)
POST /api/orgs
{ "name": "tenant-{tenant_id}" }

# Assign data sources scoped to this tenant
POST /api/datasources (under the org)
# Loki data source with HTTP header X-Scope-OrgID: {tenant_id}
# VictoriaMetrics data source with tenant URL prefix
# Tempo data source with X-Scope-OrgID header
```

Standard dashboard templates are provisioned per-organization via Grafana dashboard provisioning (Kubernetes ConfigMap-mounted JSON). Tenant admins cannot edit these templates but can create additional dashboards within their Organization.

### 14.3 Per-Tenant Retention

- **VictoriaMetrics:** Per-tenant retention enforced via `retention_filters` in VMStorage configuration (available in community edition)
- **Loki:** Per-tenant retention via `per_tenant_override_config` in Loki compactor configuration
- **Tempo:** Object storage TTL policy on per-tenant prefix (S3 lifecycle rules on `tenants/{tenant_id}/` prefix)
- **OpenSearch:** Index lifecycle management per tenant index

### 14.4 Cost Attribution

OTel Collector emits per-tenant telemetry volume metrics (`otelcol_exporter_sent_spans{tenant.id="..."}`, `otelcol_exporter_sent_metric_points{tenant.id="..."}`) that feed into a cost attribution dashboard. Chargeback calculations:

```
Tenant Cost = 
  (spans_sent × cost_per_span) + 
  (metric_points_sent × cost_per_metric_point) + 
  (log_bytes_sent × cost_per_log_gb)
```

---

## 15. Cross-Cutting Decisions

### 15.1 Recommended Stack Summary

| Signal | Component | License | Notes |
|---|---|---|---|
| **Instrumentation** | OTel Java Agent v2 + Spring Boot Starter | Apache 2.0 | Agent for all 91 services; Starter for GraalVM native |
| **Collector** | OTel Collector Contrib | Apache 2.0 | DaemonSet per node; gateway mode for aggregation |
| **Traces** | Grafana Tempo | Apache 2.0 | Object storage (MinIO for air-gap); TraceQL |
| **Metrics** | VictoriaMetrics cluster | Apache 2.0 | 10× compression; Prometheus scrape → remote write |
| **Metrics scrape layer** | Prometheus 3.x | Apache 2.0 | Per-cluster scraper; OTLP ingest endpoint |
| **Operational logs** | Grafana Loki | Apache 2.0 | Object storage; X-Scope-OrgID multi-tenant |
| **Compliance logs** | OpenSearch (existing) | Apache 2.0 | Per-tenant index; already operated |
| **Dashboards** | Grafana OSS | AGPLv3* | Separate service; not embedded binary |
| **Alerting rules** | Grafana Unified Alerting | AGPLv3* | Multi-datasource rules |
| **Alert routing** | Prometheus Alertmanager | Apache 2.0 | HA cluster (3 nodes); Grafana Alerting backend |
| **On-call** | Grafana OnCall (OSS) | Apache 2.0 | Shift scheduling; escalation |
| **Frontend RUM** | OTel Web SDK + Web Vitals | Apache 2.0 | React + Astro |
| **Mobile tracing** | opentelemetry-dart | Apache 2.0 | Flutter |

*Confirm AGPLv3 SaaS distribution posture with legal counsel for Grafana OSS. Running Grafana as a separate service (not embedding it) is typically permissible but requires verification.

**Alternative (SMB/on-prem single-tenant):** Replace Tempo + Loki + VictoriaMetrics + Grafana with **SigNoz** (Apache 2.0 community edition) for a single-stack deployment. SigNoz's ClickHouse backend handles all three signals with lower ops overhead than the four-component LGTM stack.

### 15.2 MinIO for Air-Gap Object Storage

Tempo and Loki require object storage. In air-gap deployments, **MinIO** (AGPL for OSS, commercial license available) serves as the S3-compatible object store. MinIO images are pre-staged as part of the CuraOS air-gap bundle.

**License note:** MinIO OSS is AGPLv3. Since MinIO is a standalone deployed service (not bundled into the CuraOS binary), AGPL obligations are to MinIO's own modifications, not to CuraOS code. Verify with legal counsel for the specific deployment model.

### 15.3 Deployment Topology

```
SaaS (multi-tenant, horizontally scaled)
├── OTel Collector (DaemonSet, all nodes)
├── OTel Collector Gateway (for aggregation / tail sampling)
├── Grafana Tempo (object store → S3 or MinIO)
├── VictoriaMetrics cluster (VMInsert + VMStorage + VMSelect)
├── Prometheus (per-cluster scrape agents)
├── Grafana Loki (object store)
├── OpenSearch (existing, shared with product search)
├── Grafana (per-tenant Org provisioning)
├── Alertmanager (3-node HA)
└── Grafana OnCall

On-Prem / Air-Gap (single-tenant, simplified)
├── OTel Collector (DaemonSet)
├── SigNoz (all-in-one: ClickHouse + query service + UI)
│   ├── Traces → ClickHouse
│   ├── Metrics → ClickHouse
│   └── Logs → ClickHouse
├── Grafana (optional; SigNoz UI is primary)
└── Alertmanager
```

### 15.4 Operational Runbook Locations

Per the workspace convention, operational runbooks for the observability stack live at:

- `ai/curaos/ops/observability/` — runbooks, alert playbooks, retention management scripts
- `ai/curaos/docs/specs/observability-tenant-provisioning.md` — tenant onboarding spec
- `ai/curaos/docs/workflows/observability-incident-response.md` — incident response workflow

---

## 16. Open Questions

1. **Grafana AGPLv3 SaaS posture:** Does legal confirm that running Grafana OSS as a separate service in the CuraOS SaaS deployment (i.e., not bundling the Grafana binary into CuraOS artifacts) is permissible without a Grafana Enterprise license? What are the specific constraints on CuraOS exposing Grafana to end-tenant users?

2. **MinIO AGPLv3 in air-gap bundle:** Does bundling MinIO images into the CuraOS air-gap deployment bundle trigger AGPL obligations? What is the legal team's position on AGPLv3 services shipped as part of a deployment package but not embedded into the CuraOS application binary?

3. **HIPAA BAA with observability vendors:** If any managed telemetry service is adopted for the SaaS tier (e.g., Grafana Cloud for a "call-home" tier), is a Business Associate Agreement (BAA) in place? This question applies even if PHI redaction occurs before data leaves CuraOS infrastructure — belt-and-suspenders compliance requires confirming no PHI can reach any external service.

4. **GDPR erasure SLO:** The 30-day erasure SLO target aligns with GDPR's "without undue delay" (typically interpreted as one month). Is this confirmed by the legal/DPO team? Does it apply to backups — i.e., must observability data in object storage backups also be erased within 30 days, or do backup retention policies exempt these?

5. **SigNoz EE licensing for multi-tenant SaaS:** At what tenant count does it become cost-effective to purchase SigNoz Enterprise Edition for first-class multi-tenancy vs. operating separate SigNoz instances per tenant vs. maintaining the LGTM stack's per-signal multi-tenancy? Request pricing from SigNoz.

6. **HealthStack session replay scope:** If session replay (HyperDX/ClickStack/Sentry) is adopted for the React admin portal, which clinical screens are categorically excluded from session replay? What is the approval process for enabling/disabling session replay on specific route prefixes? Who owns the configuration?

7. **Kafka observability:** How are Kafka consumer lag metrics surfaced? Kafka exporter (Prometheus) or native Kafka metrics via JMX? With NATS JetStream for SMB, is the NATS Prometheus exporter sufficient? What consumer-lag alerting thresholds are appropriate for the BPM task queues?

8. **Flowable + Temporal trace instrumentation:** Flowable (Spring-based) is instrumentable via OTel Java agent. Temporal has native OTel support. What is the desired trace granularity for BPM workflow executions? Should individual workflow task executions be individual OTel spans, or aggregated at the workflow boundary? This affects trace volume and storage cost.

9. **Cross-region trace aggregation (SaaS):** If CuraOS SaaS runs in multiple geographic regions (EU, US, APAC) for GDPR data residency, how are traces aggregated for global service maps? Does each region have an independent observability stack, or is there a cross-region read tier (Grafana cross-datasource)?

10. **Observability of the observability stack:** The OTel Collector, VictoriaMetrics, Loki, and Tempo all emit self-telemetry. Where does this self-telemetry land? Into the same stack (recursive) or into a separate "meta-observability" Prometheus + Grafana instance? Define the monitoring of the monitoring boundary to avoid circular failure modes.

11. **Alert fatigue governance:** With 91 services and alerting across traces, metrics, and logs, what is the alert governance process? Who approves new alert rules? What is the minimum on-call notification threshold (P95 latency, error rate percentage) before an alert fires? Is there an alert review cadence?

12. **PHI redaction audit:** The OTel Collector PHI redaction processor operates on regex patterns. How are these patterns maintained, tested, and audited? Who is responsible for updating PHI patterns when new FHIR resource types are introduced in HealthStack? What is the process for detecting a PHI redaction miss post-hoc?

---

## 17. Consequences

### Positive

- **Unified X-Scope-OrgID model** across Tempo, Loki, and Mimir/VictoriaMetrics creates consistent multi-tenant semantics — one pattern to understand across all signal backends.
- **Object storage (MinIO/S3) for traces and logs** enables cost-effective 100% trace retention and log retention without the operational burden of Elasticsearch/Cassandra clusters.
- **OTel Collector as the single PHI redaction boundary** means PHI control is concentrated in one well-audited configuration rather than distributed across 91 service codebases.
- **VictoriaMetrics 10× compression** materially reduces long-term metrics storage cost at SaaS scale — a direct SaaS margin improvement.
- **Apache 2.0 throughout the primary stack** eliminates SaaS distribution licensing concerns for all primary components.
- **OpenSearch dual-use** (product search + compliance logs) removes the need for a separate log investigation tool.

### Negative / Risks

- **6+ distinct systems to operate** (OTel Collector, Tempo, VictoriaMetrics, Prometheus, Loki, Grafana, Alertmanager, OnCall) imposes meaningful SRE overhead. Mitigated by Kubernetes operators and Helm chart automation.
- **Grafana AGPLv3** requires ongoing legal review as Grafana's role in the CuraOS tenant experience evolves.
- **MinIO AGPLv3** for air-gap object store requires ongoing legal review.
- **Quickwit acquisition by Datadog** closes one future alternative for unified log/trace search — if the project is closed-sourced, fallback is OpenSearch for full-text log search (already in stack).
- **ClickHouse GDPR erasure latency** (if SigNoz is adopted for on-prem): async TTL-based deletion does not provide instantaneous erasure. Process must document this as "erasure initiated within 30 days; completion within 60 days subject to ClickHouse compaction cycle."

### Neutral

- **Dual dashboard surface** (Grafana + OpenSearch Dashboards for compliance logs) means engineers need to know which tool to use for which investigation. Mitigated by clear runbook documentation and Grafana data source plugin for OpenSearch (enabling OpenSearch log queries from within Grafana in most cases).

---

## 18. References

- [OpenTelemetry Spring Boot Starter — Official Docs](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/)
- [OpenTelemetry Handling Sensitive Data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
- [Kotlin Coroutines and OTel Tracing — Nicolas Fränkel](https://blog.frankel.ch/kotlin-coroutines-otel-tracing/)
- [OpenTelemetry with Kotlin Coroutines — Daniel Correia](https://blog.danielcorreia.net/opentelemetry-kotlin-coroutines/)
- [How to Configure OTel for Kotlin Coroutines in Spring Boot](https://oneuptime.com/blog/post/2026-02-06-opentelemetry-kotlin-coroutines-spring-boot/view)
- [Prometheus Storage Comparison 2025 — Thanos vs VictoriaMetrics vs Mimir](https://onidel.com/blog/prometheus-storage-comparison-2025)
- [CECG Multi-Tenant Metrics System Evaluation](https://www.cecg.io/blog/evaluating-large-scale-solutions-for-multi-tenant-metrics-system)
- [Grafana Tempo vs Jaeger — Last9](https://last9.io/blog/grafana-tempo-vs-jaeger/)
- [Best Practices: Migration from Jaeger to Tempo — Red Hat](https://developers.redhat.com/articles/2025/04/09/best-practices-migration-jaeger-tempo)
- [SigNoz Top Loki Alternatives 2026](https://signoz.io/blog/loki-alternatives/)
- [ClickHouse Best Open Source Observability 2026](https://clickhouse.com/resources/engineering/best-open-source-observability-solutions)
- [Altinity: Observability Vendors on ClickHouse](https://altinity.com/blog/altinity-loves-every-observability-vendor-especially-the-ones-that-use-clickhouse)
- [Grafana Mimir Multi-Tenant Deployment](https://oneuptime.com/blog/post/2026-02-09-grafana-mimir-multi-tenant/view)
- [VictoriaMetrics vs Grafana Mimir Deep Dive — Aman Kohli](https://medium.com/@aman.kohli1/grafana-mimir-vs-victoriametrics-a-deep-dive-into-architecture-performance-and-real-world-e76331404c3c)
- [Scaling Prometheus 2026: Thanos/Mimir/VictoriaMetrics](https://sanj.dev/post/prometheus-scaling-thanos-mimir-victoriametrics)
- [HIPAA Compliant Healthcare Observability with OTel](https://oneuptime.com/blog/post/2026-02-06-hipaa-compliant-healthcare-observability-opentelemetry/view)
- [OTel Collector PHI/PII Redaction Processor — Better Stack](https://betterstack.com/community/guides/observability/redacting-sensitive-data-opentelemetry/)
- [OpenObserve License — Apache to AGPL Rationale](https://openobserve.ai/blog/what-are-apache-gpl-and-agpl-licenses-and-why-openobserve-moved-from-apache-to-agpl/)
- [AGPL is a Non-Starter for Most Companies — Open Core Ventures](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies/)
- [Parseable: Best Open Source Observability 2026](https://www.parseable.com/blog/ten-best-open-source-observability-platforms-2026)
- [SigNoz, OpenObserve, Grafana Comparison — 10x.pub](https://tianpan.co/forum/t/signoz-openobserve-grafana-which-datadog-alternative-actually-works/224)
- [Grafana Mimir GitHub](https://github.com/grafana/mimir)
- [Grafana Mimir Tenants Dashboard Docs](https://grafana.com/docs/mimir/latest/manage/monitor-grafana-mimir/dashboards/tenants/)
- [Prometheus Alertmanager vs Grafana Alerting 2026](https://alexandre-vazquez.com/alertmanager-vs-grafana-alerting/)
- [Quickwit OTLP Integration Docs](https://quickwit.io/docs/distributed-tracing/send-traces/using-otel-collector)
- [Building Production Observability with SigNoz + ClickHouse](https://medium.com/@ShiveeGupta/building-a-production-grade-observability-platform-with-signoz-clickhouse-and-opentelemetry-d7f09a5250f5)
- [All-in-One Observability Stack 2026 — Tasrie IT](https://tasrieit.com/blog/all-in-one-observability-stack-cloud-native-2026)
- [Spring Boot OpenTelemetry — Spring.io Blog 2025](https://spring.io/blog/2025/11/18/opentelemetry-with-spring-boot/)
- [OTel Instrumentation BOM 2.12.0 — Spring Boot 2026](https://oneuptime.com/blog/post/2026-01-25-instrument-spring-boot-opentelemetry/view)

---

*ADR-0107 — Observability Stack. CuraOS. 2026-05-24.*
