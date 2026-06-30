# ADR-0101: Data Layer (RDBMS, Cache, Search, Object Store)

> **✅ ACCEPTED w/ DA13 AMENDMENT** — aligned w/ [ADR-0150](0150-baseline-alignment-rules.md) §5 (STANDS). PG17 / Valkey / pgvector / pg_trgm stand. **DA13 amendments (2026-05-25):**
> - **Citus extension on CNPG** (RDBMS): **10K+ tenants from day 1** per DA13 Q3 → distributed PG sharded by `tenant_id` across worker nodes replaces prior DB-per-tenant default. DB-per-tenant retained for HealthStack PHI services only. See [[curaos-postgres-rule]].
> - **PG-only search v1** per DA13 Q4 — **OpenSearch removed from v1 stack**. PG-native pgvector + tsvector + pg_trgm for ALL search across all services including HealthStack clinical. OpenSearch revisit at HealthStack M11 if FHIR search perf insufficient. **M11 revisit FIRED (2026-06-03, RESOLVED-EVAL, #327)** — conditional: PG-only stays for single-domain generic; OpenSearch 2.x re-added as **opt-in Tier 2** for M12 cross-service federated/clinical search (no in-PG federation + CNPG search+write CPU contention vs OQ-05). See [§ Search M11 revisit amendment](#search-m11-revisit-amendment-2026-06-03-327) and [m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md).
> - **SeaweedFS confirmed primary object store** per DA13 Q6 — MinIO removed as backup target due to AGPLv3 air-gap bundle risk. SeaweedFS Apache 2.0; already in stack; battle-tested distributed mode.
>
> **Other Open Questions resolution:** Patroni DCS, pgBouncer, ORM strategy → **RESOLVED-RULE** ([[curaos-postgres-rule]] + [[curaos-orm-rule]]). pg_tde + Logical replication slot policy → **DEFERRED-MILESTONE** (pre-prod). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).


## Status

Proposed. Date: 2026-05-24. Supersedes: none. Related: ADR-0100 (Backend Services Runtime — Kotlin + Spring Boot 3.4 + JVM 21).

---

## Context

CuraOS ships as a composable platform serving 91 independent backend microservices across four deployment models: cloud SaaS (per-tenant schema isolation), on-premises single-tenant, hybrid (vendor control plane + customer data plane), and air-gapped customer infra. Every service in the platform — from identity and tenancy primitives through workflow/BPM orchestration up to vertical overlays like HealthStack — depends on shared persistence infrastructure. Choosing the wrong data layer means either locking the platform into managed-cloud dependencies that violate the charter, or incurring per-service data sprawl that makes the platform operationally unmaintainable.

The data layer is therefore not a per-service concern. It is a platform contract with the following non-negotiable constraints:

**Charter constraints (from AGENTS.md §3):**
- Self-hosted first — all components must run on customer infrastructure, including fully air-gapped networks, with no mandatory calls to external managed services.
- No managed-cloud lock-in — cloud-hosted databases (AWS RDS, GCP AlloyDB, Azure Hyperscale, AWS ElastiCache, etc.) may appear as deployment options for convenience, but they cannot be the primary design target.
- Generic before vertical — the same data layer serves all 91 services regardless of domain. HealthStack overlay schemas may hold PHI; generic services hold only references and metadata.
- Multi-tenant isolation MUST be enforceable at the storage layer, not only at the application layer.

**Regulatory constraints:**
- GDPR data residency — tenant data must be isolatable to a specific geographic region with auditable controls.
- HIPAA PHI — encrypted at rest (AES-256 minimum), encrypted in transit (TLS 1.2+), access audit log, WORM-immutable audit records, BAA-capable deployments.
- OWASP ASVS Level 2 across all data-touching components.

**Architecture constraints (from event-led design):**
- Outbox pattern is the primary mechanism for reliable cross-service event publishing; the relational database must support it reliably (durable tables, WAL-readable by CDC tooling).
- Search indexes are derived views — the primary system of record is always the relational DB; search is eventually consistent.
- Object storage holds immutable binary artifacts; the relational DB holds metadata and references.
- Cache is a read-acceleration tier, never the system of record.

---

## Forces / Requirements

### RDBMS

- ACID transactions mandatory for business logic and outbox pattern.
- Schema-per-tenant isolation for SaaS profile (`tenant_<id>` schema per tenant, `app` schema for on-prem single-tenant) — must be implementable at DB level with enforcement options.
- Alternatively, row-level security (RLS) as fallback isolation when schema-per-tenant doesn't scale.
- Logical replication for CDC (Debezium) to feed Kafka outbox relay.
- Point-in-time recovery (PITR) with ≤15 min RPO target.
- HA via automatic failover — target RTO < 60 s.
- Encryption at rest (TDE or filesystem-level as minimum; extension-level preferred).
- Tamper-evident audit (pg_audit-class row logging).
- Full-text search as commodity feature (tsvector); NOT primary search tier.
- Extension ecosystem: PostGIS (geospatial services), TimescaleDB-compatible hypertables (time-series metrics), pgvector (AI/RAG embeddings future-proofing).
- Spring Data JPA / Hibernate 6 driver support — stable, well-tested, not experimental.
- Self-hosted HA tooling with active community (no proprietary cluster management mandated).
- License: permissive or OSI-approved copyleft that permits self-hosted SaaS distribution without per-tenant licensing fees.

### Cache

- Distributed cache shared across horizontally scaled service instances.
- In-process L1 cache (JVM heap) for hot read-through paths.
- Multi-tenant key namespacing — tenant data must not bleed across namespace boundaries.
- TLS in transit; encryption at rest desired but negotiable at platform level (filesystem encryption acceptable).
- HA: sentinel or cluster mode with automatic failover.
- Spring Cache abstraction compatibility and Spring Session support.
- Drop-in Redis protocol compatibility for ecosystem reuse (client libraries, Lettuce/Jedis, Spring Data Redis).
- License: OSI-approved for self-hosted SaaS distribution without royalty.

### Search

- Full-text search (BM25/TF-IDF) as primary relevance model.
- Faceted filtering (status, type, tenant-specific fields).
- Multi-tenant index isolation — a tenant's search results MUST NOT return another tenant's documents.
- Typo tolerance for user-facing product search.
- Vector/hybrid search (BM25 + embeddings) as a near-term capability for HealthStack clinical note search and knowledge management.
- Encryption at rest; TLS in transit.
- Snapshot/restore for disaster recovery.
- Sync strategy from PostgreSQL (CDC preferred; dual-write acceptable with idempotency).
- Kotlin/JVM client library that is actively maintained.
- License: Apache 2.0 or equivalent permissive for self-hosted SaaS.
- Optional: separate search index per tenant vs. shared index with tenant filter — major architectural decision (see Open Questions).

### Object Store

- S3-compatible API (de facto standard; all SDKs and frameworks target it).
- Server-side encryption (SSE-S3 or SSE-KMS) mandatory.
- WORM / Object Lock for audit log immutability (HIPAA compliance).
- Bucket or prefix isolation per tenant.
- Versioning for document lifecycle.
- Erasure coding (not just replication) for production durability.
- Multi-site replication capability (at least active-passive) for DR and hybrid deployments.
- Lifecycle rules (transition to cold-tier / delete after retention period).
- License: permissive or OSI-approved copyleft that permits self-hosted SaaS without per-tenant fees.
- Low operational footprint for SMB customer on-prem deployments.

---

## Decision Drivers (Weighted)

| Driver | Weight | Notes |
|---|---|---|
| Tenant isolation strength (storage-enforced) | Critical | GDPR / HIPAA mandate; application-layer-only isolation is insufficient |
| Encryption at rest maturity | Critical | HIPAA AES-256 requirement |
| Audit trail support / WORM | Critical | HIPAA audit immutability |
| Self-hosted on-prem readiness | Critical | Core charter; managed-cloud-only options disqualified |
| License (self-hosted SaaS permissive) | Critical | Commercial deployments on customer infra must not trigger per-tenant fees |
| OSI-approved license | High | Procurement gatekeeping at enterprise customers; BSL/SSPL/RSALv2 add friction |
| Kotlin/JVM driver + Spring Data integration | High | Runtime locked to JVM 21; runtime-native drivers reduce operational surface |
| Backup / PITR maturity | High | 99.9% availability target; RPO ≤ 15 min |
| Replication topology (HA + multi-region read replicas) | High | Availability target + geo distribution for regulated markets |
| Operational complexity at SMB infra | High | Many customers are small healthcare orgs with limited ops teams |
| Community + hiring signal | Medium | Long-term sustainability; team skills availability |
| Container footprint | Medium | Air-gap customers provision on constrained hardware |
| Extension / ecosystem breadth | Medium | Geospatial, time-series, vector search reduce additional tiers |
| Performance (P95 sub-second) | Medium | Platform target; all shortlisted options meet this baseline at modest scale |
| HTAP / analytics | Low | Not a primary CuraOS requirement; separate analytics tier assumed |

---

## Sub-decision 1: Relational Database

### Options

#### Option A: PostgreSQL 16/17 (current commitment)

**License:** PostgreSQL License (BSD-2-Clause equivalent). OSI-approved. No distribution restrictions. Commercial self-hosted SaaS fully permitted with zero royalty.

**Version note:** PostgreSQL 17 released October 2024. PostgreSQL 16 reaches EOL in November 2028. Version 17 is the recommended baseline as of this ADR date.

**PostgreSQL 17 key improvements relevant to CuraOS:**
- Logical replication failover slots: slots now synchronize to physical standbys, so Debezium CDC survives a primary failover without slot re-creation and full re-sync.
- `pg_createsubscriber` tool: simplifies provisioning a logical replica from an existing physical standby, enabling zero-downtime logical replication topology setup.
- Partitioned tables now support identity (auto-increment) columns and exclusion constraints — enables tenant-partitioned tables with unique ID generation per partition.
- `pg_maintain` role: grant per-tenant maintenance rights without superuser — security win for shared-cluster multi-tenant setups.
- Memory performance: up to 35% faster vacuum operations, improved sequential scan throughput via streaming I/O.

**Multi-tenancy patterns:**

PostgreSQL supports three tenancy models:

1. **Schema-per-tenant** (`SET search_path = tenant_42`): each tenant has identical table DDL in a private namespace. Hibernate's `MultiTenantConnectionProvider` + `CurrentTenantIdentifierResolver` implements this with `search_path` switching per connection. Effective isolation for low-to-mid tenant counts. **Scaling limit: degrades significantly beyond ~500–1000 tenants** due to PostgreSQL system catalog bloat (pg_class, pg_attribute entries multiply per schema), slower query planning, and migration complexity (DDL must fan out to every schema). PlanetScale engineering blog documents the practical ceiling at "a few hundred tenants" for schema-per-tenant before catalog overhead becomes significant.

2. **Row-level security** (shared schema, `tenant_id` column everywhere): enforces isolation inside the DB engine even when application code omits a `WHERE tenant_id = ?`. Requires `SET LOCAL app.current_tenant = ?` on every connection — must be reset before returning the connection to PgBouncer pool to prevent tenant ID leakage. Performance: with composite indexes where `tenant_id` is the leading column, RLS policy evaluation adds ~0.3 ms per query at 50 M rows across 10 K tenants. Without composite indexes, RLS is two orders of magnitude slower. Leakage risk in pooled connections if `SET LOCAL` is not properly scoped.

3. **Hybrid**: schema-per-tenant for strongly isolated HealthStack overlays; shared-schema + RLS for high-cardinality generic services (tasks, notifications, audit events). CuraOS's multi-tenant contract maps naturally to this hybrid: HealthStack PHI tables in per-tenant schemas, high-volume generic tables in shared schema with RLS.

**HA topology:** Patroni (Python, watches etcd/Consul/ZooKeeper as DCS) is the industry-standard automated failover tool. Provides leader election, automatic promotion, VIP management via HAProxy or Keepalived. Combined with pgBackRest for PITR backup and WAL archiving. PgBouncer in transaction-mode pooling between services and PostgreSQL. Typical enterprise stack: `Services → PgBouncer → Patroni (Primary + 2 replicas) + pgBackRest → S3/MinIO WAL archive`.

**Connection pooling:** PgBouncer (transaction mode, lowest overhead) vs PgCat (newer Rust implementation, multi-database aware) vs Odyssey (Yandex, multi-tenancy-aware routing). For schema-per-tenant, PgBouncer's transaction mode is preferred; session mode is required for `SET search_path` persistence but loses most pooling benefit. PgCat's query routing is worth evaluation for large-scale schema-per-tenant.

**Encryption:** `pgcrypto` extension for column-level encryption. TDE (transparent data encryption) available via Cybertec `pg_tde` extension (actively maintained, PostgreSQL 17 compatible as of 2024) or EDB Advanced Server (commercial). At minimum, LUKS/dm-crypt filesystem encryption satisfies HIPAA at-rest requirement for self-hosted deployments.

**Audit:** `pgaudit` extension provides statement-level and object-level audit logging compatible with HIPAA requirements. Output to syslog or direct file for immutable audit trail.

**Extension ecosystem relevant to CuraOS:**
- PostGIS 3.5: geospatial queries for fleet/location services — avoids a separate geospatial tier.
- TimescaleDB: hypertable-based time-series compression and continuous aggregates for metrics services.
- pgvector 0.7+: L2/cosine/inner-product vector indexes (HNSW, IVFFlat) for AI embedding search.
- pg_search / ParadeDB: BM25 full-text search natively in PostgreSQL — may reduce or eliminate need for a separate search tier for moderate document volumes.
- pg_partman: automated partition management for time-based and range-based partitions.

**Backup / PITR:** pgBackRest offers parallel backup, incremental backup, WAL archiving to S3/MinIO/GCS, point-in-time recovery, encryption (AES-256-CBC), compression (LZ4/zstd), and multi-repo support for DR. Barman is an alternative server-centric backup manager suitable for teams preferring a dedicated backup server model. Both are production-proven and actively maintained in 2024–2025.

**Observability:** `pg_stat_statements`, `pg_stat_activity`, `pg_stat_replication`, pgBadger for log analysis. prometheus-postgres-exporter for metrics. Native OpenTelemetry support via OTEL collector sidecars.

**Ecosystem / hiring:** PostgreSQL is the #1 most popular open source RDBMS by Stack Overflow developer surveys 2023–2025. Largest talent pool. Richest Kotlin/JVM driver ecosystem (JDBC, R2DBC for reactive services, Spring Data JPA, jOOQ, Exposed).

**Strengths:**
1. Permissive PostgreSQL license — zero friction for self-hosted SaaS on customer infra.
2. Schema-per-tenant + RLS both natively supported — hybrid model fits CuraOS's isolation needs.
3. Logical replication with failover slot sync in PG17 — Debezium CDC is rock solid.
4. Extension ecosystem (PostGIS, pgvector, TimescaleDB, pg_tde) reduces additional infrastructure tiers.
5. Patroni + pgBackRest HA stack is battle-tested at hyperscale (Zalando, GitLab, Shopify) and small SMB infra alike.
6. Largest community and hiring pool globally; Spring Data PostgreSQL support is first-class.
7. JSONB for semi-structured data in workflow/BPM event payloads — avoids separate document store.
8. PG17 partitioned table identity columns unlock clean tenant-sharded architectures.
9. pg_audit provides HIPAA-grade audit logging.
10. `pg_tde` extension brings column-to-tablespace TDE without proprietary EDB license for most use cases.

**Weaknesses:**
1. Schema-per-tenant ceiling: degrades at 500–1,000 tenants in a single cluster; requires Citus or horizontal shard federation beyond that.
2. No native distributed SQL — multi-region active-active requires Citus or BDR (proprietary extensions from EDB).
3. Connection model: one OS process per connection; PgBouncer is mandatory at scale (adds hop).
4. RLS + PgBouncer transaction mode requires careful `SET LOCAL` scoping; engineering discipline required to avoid tenant leakage in pools.
5. pg_tde is relatively new; column-level encryption via pgcrypto is more established but requires application-layer key management.
6. Vacuum and autovacuum tuning required at high write throughput; bloat is a production concern.
7. Logical replication slot management complexity at high churn (slot lag can block WAL recycling and grow disk usage).

**Self-hosted readiness:** Excellent. Runs on any Linux (Kubernetes, VMs, bare metal). Single binary. Active release cadence. Air-gap friendly (all tooling available as container images).

**HIPAA fit:** Strong. pg_audit, pgcrypto/pg_tde, TLS, RLS, and pgBackRest encrypted backups together satisfy HIPAA Technical Safeguard requirements.

**TCO indicators:** Memory floor ~256 MB per instance (realistic production with modest cache: 2–8 GB). Replication lag: streaming replication < 1 s on LAN. P99 read latency on indexed queries at 10 M rows: 1–5 ms.

---

#### Option B: MariaDB 11.x / MySQL 8.x

**License:** MariaDB: GPL v2 (server) — copyleft; embedding in proprietary software requires either GPL compliance or a commercial license from MariaDB Corporation. MySQL: dual-license (GPL + commercial from Oracle). For a self-hosted SaaS platform that distributes binaries, GPL v2 triggers strong copyleft provisions; legal review required before adoption.

**Multi-tenancy:** Database-per-tenant model is natural but hits connection pooling limits rapidly (see PostgreSQL Option A discussion). Schema-per-tenant lacks native enforcement. No equivalent to PostgreSQL RLS (MariaDB has no RLS until 11.x; MySQL row-level grants are coarse). Application-layer tenant filtering required with no DB-enforced backstop.

**HA topology:** InnoDB Cluster (MySQL 8.x group replication + MySQL Router + MySQL Shell) is production-ready. MariaDB Galera Cluster provides synchronous multi-primary replication (all nodes writeable) — eliminates write single-point-of-failure at cost of write latency (certification-based conflict resolution adds overhead on cross-node transactions).

**Strengths:**
1. Galera Cluster multi-primary topology eliminates write SPOF.
2. ProxySQL / MariaDB MaxScale provide mature connection pooling and read/write splitting.
3. Large talent pool (historically dominant in LAMP stacks).
4. Column-level encryption (MariaDB Data-at-Rest Encryption), tablespace encryption.
5. MariaDB 11.x active development with window functions, CTEs, invisible columns.

**Weaknesses:**
1. GPL v2 license creates legal friction for proprietary SaaS distribution; requires commercial MariaDB license for clean compliance.
2. No native RLS — tenant isolation is application-only; fails the storage-layer enforcement driver.
3. Extension ecosystem significantly thinner than PostgreSQL: no PostGIS equivalent, no pgvector, no TimescaleDB native equivalent.
4. Spring Data JPA MySQL/MariaDB dialect is less feature-rich than PostgreSQL dialect (e.g., JSONB not supported natively; JSON functions are MySQL-specific).
5. Logical replication CDC (Debezium MySQL connector) works but WAL equivalent (binlog) is less flexible than PostgreSQL logical decoding for multi-tenancy patterns.
6. Oracle's ownership of MySQL and MariaDB's corporate instability (bankruptcy filing in 2023, acquired by K1 Investment Management) create long-term governance risk.
7. Partitioned tables: partition pruning is less mature than PostgreSQL; no identity columns on partitioned tables equivalent to PG17.

**Self-hosted readiness:** Good. But license friction and weaker isolation enforcement make it a poor fit for CuraOS's requirements.

**HIPAA fit:** Marginal. No RLS means a single misconfigured query can leak PHI across tenants. Encryption at rest available but less granular. Audit logging requires MariaDB Audit Plugin (not included by default in all editions).

**Verdict for CuraOS:** Not recommended. GPL license friction + lack of storage-layer tenant isolation enforcement are disqualifying for the platform contract.

---

#### Option C: CockroachDB (self-hosted)

**License history (critical):** CockroachDB moved from Apache 2.0 to Business Source License (BSL) in 2019. In November 2024, version 24.3 retired the "Core" (free) offering entirely. Self-hosted deployments now require either:
- Enterprise Trial license (30-day, community support).
- Enterprise Free license (annually renewable; free for annual revenue < $10 M and individual/academic use).
- Commercial Enterprise license (paid) for all others.

**Bottom line for CuraOS:** Any customer tenant with revenue > $10 M requires a paid CockroachDB Enterprise license for their self-hosted on-prem deployment. This violates the self-hosted charter because the data layer imposes per-deployment licensing costs on customer infrastructure. For a platform targeting healthcare enterprise customers (hospitals, health systems), $10 M revenue threshold is easily exceeded. **Disqualifying.**

**Technical characteristics (for completeness):**
- Distributed SQL with automatic sharding and geo-partitioning — eliminates the PG schema-per-tenant ceiling.
- PostgreSQL wire protocol compatible (most Spring Data JPA / JDBC code works with minor adjustments).
- Multi-region active-active writes with configurable zone survival goals.
- Built-in change data feed (CDC) to Kafka — Debezium not required.
- Encryption at rest built in. Audit logging available.
- Operational complexity is higher than PostgreSQL for small on-prem deployments (minimum 3 nodes for consensus).

**Strengths:**
1. Distributed SQL eliminates single-node scalability ceiling.
2. Multi-region active-active is first-class, not bolted-on.
3. Geo-partitioning enables GDPR data residency at the data model level.
4. Built-in replication, backup (full, incremental), and CDC.

**Weaknesses:**
1. **License is disqualifying for CuraOS on-prem target market.** Enterprise revenue > $10M requires paid license on customer infra.
2. Operational complexity: minimum 3-node cluster for any production deployment; 5+ nodes recommended. Overkill for SMB on-prem.
3. Extension ecosystem: PostgreSQL-compat is partial; pgvector, PostGIS, pg_audit have limited or no support.
4. Spring Data JPA requires CockroachDB-specific dialect adjustments (sequences, UUID generation, transaction retry handling).
5. Memory floor: ~2 GB per node minimum; 8–16 GB recommended for production.

**Self-hosted readiness:** Technically capable but commercially restricted. **Not recommended** due to license mismatch with CuraOS charter.

---

#### Option D: YugabyteDB (self-hosted)

**License:** Apache 2.0. Fully open source. As of early 2025, previously commercial enterprise features (distributed backups, data encryption, read replicas) are all included in the open source release. No per-deployment licensing fees regardless of customer revenue.

**Technical characteristics:**
- Distributed SQL built on DocDB storage engine (RocksDB-based) with PostgreSQL-compatible query layer (YSQL).
- PostgreSQL 15 base compatibility (plans to track newer PG versions within 6 months of release).
- Multi-region deployments: synchronous replication (RF=3 minimum), async read replicas, geo-partitioning for GDPR data residency.
- Built-in change data capture to Kafka (CDC via gRPC streams).
- Encryption at rest included (AES-256). TLS in transit.
- Kubernetes-native deployment via YugabyteDB Anywhere or Helm charts.
- Connection pooling: YSQL (PostgreSQL-compat) layer works with PgBouncer and HikariCP.

**PostgreSQL compatibility gaps (relevant to CuraOS):**
- pgvector extension: not natively supported (as of 2025; tracked issue).
- PostGIS: partial support; some spatial functions missing.
- pg_audit: not available; audit logging via YugabyteDB-specific mechanisms.
- pg_tde / pgcrypto: not available; encryption at rest is node-level only.
- Logical replication slots (PG-style): not compatible; uses proprietary CDC API.
- TimescaleDB: not supported.

**Multi-tenancy:** Schema-per-tenant supported (no system catalog bloat equivalent at scale due to distributed nature — catalog is also distributed). RLS supported in YSQL. Geo-partitioning enables per-tenant data residency at table partition level.

**Strengths:**
1. Apache 2.0 — permissive license, no restrictions on self-hosted SaaS.
2. Distributed SQL eliminates schema-per-tenant scaling ceiling.
3. Multi-region active-active with geo-partitioning — strongest GDPR data residency support.
4. All enterprise features (encryption, distributed backup, read replicas) included open source as of 2025.
5. PostgreSQL wire compatibility — most JDBC/R2DBC drivers work.
6. Kubernetes-native operation model aligns with CuraOS container deployment targets.

**Weaknesses:**
1. PostgreSQL compatibility gaps — PostGIS partial, no pgvector, no TimescaleDB, no pg_tde, no logical replication slots.
2. Operational complexity: minimum RF=3 (3 nodes) for any production deployment. Not suitable for single-node on-prem at smallest customer tier.
3. CDC API is proprietary (gRPC streams), not compatible with Debezium's PostgreSQL logical replication connector; requires YugabyteDB Debezium connector.
4. Performance: distributed consensus (Raft) adds write latency overhead vs. single-region PostgreSQL. Local read paths are fast, cross-node writes add ~5–15 ms.
5. Ecosystem maturity: smaller community than PostgreSQL; fewer DBA hiring candidates familiar with YugabyteDB-specific operations.
6. Based on PostgreSQL 15; CuraOS would be on an older PG base until YugabyteDB tracks PG17.
7. Memory floor: ~4 GB per node minimum; 8–16 GB recommended.

**Self-hosted readiness:** Good for teams with Kubernetes expertise. Challenging for SMB on-prem without Kubernetes.

**HIPAA fit:** Good. Encryption at rest, TLS, audit logging (via yugabyte-specific logs). BAA not explicitly documented for self-hosted; customer runs the cluster so HIPAA responsibility is on them.

**Verdict for CuraOS:** Architecturally attractive for large multi-region deployments but the PostgreSQL compatibility gaps (no pgvector, no PostGIS-full, no logical replication slots) significantly impact the extension ecosystem that CuraOS relies on. Recommended as a **future migration path** once extension compatibility matures; not primary recommendation today.

---

#### Option E: Percona Distribution for PostgreSQL

**License:** Apache 2.0 (Percona Distribution is a packaging and tooling layer on top of open source PostgreSQL). PostgreSQL core license unchanged.

**What it provides:** Percona Distribution for PostgreSQL bundles: PostgreSQL 16/17 + pg_stat_monitor (improved pg_stat_statements with query buckets, plan info) + Patroni + pgBackRest + pgBadger + Percona Monitoring and Management (PMM) for observability. Pre-integrated, tested, single-vendor support for the entire HA + observability stack.

**Strengths:**
1. All the PostgreSQL strengths of Option A, plus pre-integrated tooling.
2. pg_stat_monitor provides histogram-based latency buckets and per-plan-node stats — superior observability to pg_stat_statements for diagnosing per-tenant slow queries.
3. Percona Monitoring and Management (PMM) provides Grafana dashboards, slow query analysis, and query analytics — valuable for SMB customers lacking dedicated DBA teams.
4. Percona is known for upstream contributions and security patches.
5. Commercial support contracts available (helpful for on-prem customer deployments needing SLA-backed DB support).

**Weaknesses:**
1. Not meaningfully different from vanilla PostgreSQL + manual tooling assembly; the value is integration and support, not new capabilities.
2. Adds a vendor (Percona) to the supply chain; customers may prefer pure upstream PostgreSQL.
3. PMM adds operational components (PMM Server, PMM Client agents) that increase container footprint in resource-constrained environments.

**Self-hosted readiness:** Excellent. Designed for on-prem and self-hosted deployments.

**Verdict for CuraOS:** Viable option and essentially a superset of Option A. Recommend adopting pg_stat_monitor from Percona distribution as a standard extension in the PostgreSQL baseline. Full Percona Distribution adoption is optional; recommend vanilla PostgreSQL 17 + manually curated extension list for maximum control.

---

#### Option F: TiDB (PingCAP)

**License:** Apache 2.0 (TiDB core, TiKV storage engine, PD).

**Technical characteristics:**
- Horizontally scalable distributed SQL with MySQL wire compatibility.
- HTAP: TiFlash columnar replica for analytical queries alongside row storage (TiKV).
- Automatic sharding and cross-shard transactions via Percolator-style distributed transactions.
- TiCDC for change data capture to Kafka.

**Strengths:**
1. Apache 2.0 license.
2. Eliminates single-node scalability ceiling.
3. HTAP reduces need for separate analytical DB (relevant for Reports service).
4. MySQL wire compatibility means most JDBC drivers work.

**Weaknesses:**
1. MySQL compatibility, not PostgreSQL — CuraOS's extension ecosystem (PostGIS, pgvector, pg_audit, pg_tde) is unavailable.
2. Minimum 3 nodes (PD + TiDB + TiKV each), realistically 6+ for production. Very high operational complexity for SMB on-prem.
3. Memory floor: ~16 GB total across nodes for minimal production deployment.
4. Hiring pool for TiDB expertise is much smaller than PostgreSQL.
5. Spring Data JPA works via MySQL dialect but loses PostgreSQL-specific features (JSONB, lateral joins, etc.).
6. CDC (TiCDC) is proprietary; Debezium MySQL connector is an alternative but less integrated.

**Self-hosted readiness:** Technically possible but complex. Kubernetes is effectively mandatory for production TiDB deployments.

**Verdict for CuraOS:** Not recommended. MySQL compat loses the PostgreSQL extension ecosystem that CuraOS depends on. Operational complexity is prohibitive for SMB on-prem deployments.

---

#### Option G: Oracle Database Free / Express Edition

**License:** Oracle Database Free (formerly XE) is free for development and limited production use with hard resource caps (2 CPU threads, 12 GB storage, 2 GB RAM). Oracle Database Standard/Enterprise require per-CPU or named user licensing — among the most expensive in the industry.

**Verdict for CuraOS:** Disqualified immediately. Resource caps in the free tier prevent production use. Commercial licensing cost is incompatible with self-hosted SMB customer deployments. Vendor lock-in is maximal. Not evaluated further.

---

#### Option H: Managed cloud RDBMS (AWS Aurora, GCP AlloyDB, Azure Hyperscale Citus)

These violate the self-hosted charter as the primary deployment target. Noted for completeness only. They may be offered as an optional convenience tier for cloud SaaS managed by the CuraOS vendor, but the platform must function identically on self-hosted PostgreSQL. No platform-layer dependency on managed DB services is permitted.

---

### Comparison Matrix (RDBMS)

| Criterion | PostgreSQL 17 | MariaDB 11 | CockroachDB | YugabyteDB | Percona PG | TiDB | Oracle Free |
|---|---|---|---|---|---|---|---|
| License | PostgreSQL (permissive) | GPL v2 (copyleft risk) | Proprietary (revenue cap) | Apache 2.0 | Apache 2.0 | Apache 2.0 | Proprietary |
| OSI-approved | Yes | Yes | No | Yes | Yes | Yes | No |
| Self-hosted SaaS fit | Excellent | Needs legal review | Disqualified (rev. cap) | Good | Excellent | Good | Disqualified |
| Storage-layer tenant isolation | RLS + Schema | Application-only | Schema/RLS (partial PG compat) | RLS + Schema | RLS + Schema | Application-only | N/A |
| Extension ecosystem | Richest | Thin | Partial PG compat | Partial PG compat | Same as PG | MySQL-only | Rich but locked |
| Distributed SQL | No (Citus extension) | Galera (multi-primary) | Yes (native) | Yes (native) | No | Yes (native) | No (RAC = proprietary) |
| Logical replication / CDC | Yes (PG17 failover slots) | Binlog (Debezium) | Built-in CDC | Proprietary CDC | Yes | TiCDC | Enterprise only |
| pgvector / PostGIS / pg_tde | Yes | No | No | Partial / No | Yes | No | No |
| Patroni HA | Yes | No (own stack) | Built-in | Built-in | Yes | Built-in | No |
| PITR maturity | pgBackRest (excellent) | mysqldump / Percona XtraBackup | Built-in | Built-in | pgBackRest | BR tool | RMAN |
| Min. memory floor | 256 MB (practical: 2–8 GB) | 256 MB | 2 GB/node | 4 GB/node | 256 MB | 4 GB/node | 2 GB cap |
| Spring Data JPA quality | First-class | Good (MySQL dialect) | PG dialect (mostly works) | PG dialect (gaps) | First-class | MySQL dialect | Good |
| Hiring / community | Largest | Large | Small | Small | Same as PG | Small | Medium |
| HIPAA fit | Excellent | Moderate | Good | Good | Excellent | Moderate | N/A |

---

### Recommendation (RDBMS)

**Recommend: PostgreSQL 17 with pg_tde + pgvector + PostGIS + pg_audit extensions.**

**HA stack: Patroni (etcd DCS) + PgBouncer (transaction mode) + pgBackRest (PITR + WAL to MinIO/S3).**

**Multi-tenancy model: Hybrid.** Schema-per-tenant for HealthStack PHI tables and any overlay requiring strong partition isolation. Shared-schema with RLS for high-cardinality generic services (audit events, notifications, tasks, workflow events). This hybrid caps the schema count at the number of overlays needing hard isolation, not the number of tenants, avoiding the system catalog scaling ceiling.

**Rationale:** PostgreSQL 17's permissive license, first-class Spring Data JPA support, richest extension ecosystem (PostGIS, pgvector, TimescaleDB, pg_tde, pg_audit), and the most mature self-hosted HA tooling chain (Patroni + pgBackRest) make it the only option that fully satisfies all weighted drivers without compromise. YugabyteDB is the strongest alternative for large multi-region deployments and should be re-evaluated when its pgvector and pg_audit compatibility matures.

---

### Open Questions (RDBMS)

1. What is the maximum expected tenant count at SaaS tier in 5 years? If >5,000 tenants, evaluate Citus extension for horizontal schema sharding on top of PostgreSQL now.
2. Which Distributed Coordination Service (DCS) for Patroni: etcd, Consul, or ZooKeeper? etcd is simplest and most common; Consul reuses existing service mesh if present.
3. PgBouncer vs PgCat for connection pooling at schema-per-tenant scale? PgCat's per-database routing is potentially superior for the hybrid multi-tenancy model.
4. pg_tde maturity: adoption should be gated by a security review of the Cybertec pg_tde extension at the PostgreSQL 17 version in use. Filesystem-level LUKS encryption is the fallback.
5. Logical replication slot management policy: how many Debezium slots per cluster? Slot lag monitoring and slot cleanup policy must be defined before production.

---

## Sub-decision 2: Cache + In-Process

### Options

#### Option A: Redis 8.x (AGPLv3, returned to OSS May 2025) + Caffeine (in-process)

**License history (critical to understand):**
- Redis ≤ 7.2: BSD-3-Clause (permissive OSS).
- Redis 7.4–7.x (March 2024): RSALv2 + SSPL dual license — NOT OSI-approved.
- Redis 8.0 (May 2025): AGPLv3 — OSI-approved open source. Redis Ltd. rehired its original creator and reversed the SSPL decision.

**Current position (Redis 8.0, May 2025):**
AGPLv3 requires that if you run a modified Redis as a network service, you must provide source of your modifications to users of that service. For CuraOS operating Redis as an internal infrastructure component (not shipping Redis as a service to end users), AGPLv3 does not trigger source disclosure — CuraOS services connect to Redis, they don't redistribute Redis or offer it as a service. **AGPLv3 is compatible with internal self-hosted SaaS use.**

**Redis 8.0 feature improvements:** Integrated JSON, Time Series, probabilistic data structures, and Vector Search (formerly Redis Stack) into the core open source release. Up to 87% faster individual commands, up to 2x higher throughput, up to 18% faster replication compared to Redis 7.2.

**However:** The community trust damage from the 2024 SSPL move created lasting fragmentation. Valkey (Option B) already has enormous momentum and is arguably the safer long-term bet regardless of the AGPLv3 reversal.

**Caffeine (in-process L1 cache):**
Caffeine is the standard JVM in-process cache. Spring Cache abstraction natively supports Caffeine via `CaffeineCacheManager`. Provides W-TinyLFU eviction policy, soft reference support, and async loading. Used as L1 (hot data, milliseconds TTL) with Redis/Valkey as L2 (shared distributed cache, seconds-to-minutes TTL). This L1+L2 two-tier architecture is the recommended pattern for JVM microservices — reduces Redis/Valkey round-trips by 60–90% for hot reads.

**Strengths of Redis 8.0:**
1. AGPLv3 — now OSI-approved; compatible with self-hosted internal use.
2. Largest ecosystem: Lettuce (async, reactive, Spring Data Redis default), Jedis (sync), Redisson (distributed locks, queues).
3. Redis Sentinel for HA (leader election, automatic failover).
4. Redis Cluster for horizontal sharding.
5. Integrated JSON, time-series, vector search in 8.0 core.
6. Up to 87% faster commands vs 7.2 in Redis 8.0.

**Weaknesses of Redis 8.0:**
1. AGPLv3: if CuraOS ever bundles or re-distributes Redis (e.g., as part of an air-gapped appliance), AGPLv3 requires making CuraOS source available — this may conflict with any future proprietary layer.
2. Community trust damage: major cloud providers (AWS, Google, Oracle) backed Valkey and are investing there; Redis 8.0 must compete for community recovery.
3. AGPLv3 is described by some (Percona's Peter Zaitsev) as "the most restrictive popular OSS license" — procurement teams at regulated institutions may require legal review.
4. Redis Cluster requires client-side cluster-aware routing; adds complexity vs Sentinel.

---

#### Option B: Valkey 8.x (recommended — Linux Foundation, BSD-3-Clause)

**License:** BSD-3-Clause. Fully permissive. Forked from Redis 7.2.x in April 2024 under Linux Foundation governance. **No license restrictions for self-hosted SaaS, embedding in appliances, or air-gapped distribution.**

**Adoption and momentum (as of 2025–2026):**
- AWS ElastiCache and Google Cloud Memorystore both offer Valkey as a managed service, with AWS pricing 20% lower than Redis OSS.
- 83% of large companies surveyed in 2024 adopted Valkey or were testing it.
- 150+ contributors, 1000+ commits in first months after fork; Valkey 8.0 released in 2024, Valkey 8.1 in March 2025.

**Performance (benchmarks, 2025):**
- Valkey 8.1 vs Redis OSS on AWS r6g.large: 1.2 M ops/sec (Valkey) vs 1.11 M ops/sec (Redis) — 8% throughput edge.
- P99 tail latency: 1.8 ms (Valkey) vs 2.3 ms (Redis OSS) on cache.m7g.large mixed read/write — 22% improvement.
- Momento benchmark on c8g.2xlarge (8 vCPU): Valkey 8.1.1 reaching 999.8K RPS on SET operations vs Redis 8.0 at 729.4K RPS — 37% higher write throughput.
- Memory efficiency: 28% less memory than Redis 8.2 in sorted set workloads (new hashtable implementation in Valkey 8.1).
- On high-core-count nodes (16 vCPUs): Valkey 8.0 achieved 1.19 M RPS — 230% increase over Valkey 7.2's 360K RPS via I/O threading improvements.

**Wire compatibility:** Drop-in replacement for Redis. All existing Redis clients (Lettuce, Jedis, Redisson, Spring Data Redis) work without code changes. All Redis commands and data structures supported.

**HA topology:** Valkey Sentinel (equivalent to Redis Sentinel) for primary/replica automatic failover. Valkey Cluster for horizontal sharding. Both are direct ports from Redis with no behavioral changes.

**Encryption at rest:** Not built into Valkey itself; relies on filesystem encryption (LUKS/dm-crypt) or OS-level encrypted volumes. For HIPAA compliance, filesystem encryption is sufficient if combined with TLS in transit.

**Spring Data Redis compatibility:** Spring Data Redis 3.x and Lettuce 6.x work with Valkey with zero configuration changes — same `RedisTemplate`, `ReactiveRedisTemplate`, Spring Session.

**Multi-tenant key namespacing:** Convention-based key prefixing (`{tenant_id}:cache_key_name`). Valkey's hash-tagging `{tenant_id}` ensures cluster-mode routing keeps tenant keys on the same slot for MULTI/EXEC atomic operations.

**Strengths:**
1. BSD-3-Clause: the most permissive license available — zero friction for self-hosted SaaS appliances, air-gapped distribution, any future proprietary layer.
2. Drop-in Redis replacement — entire Spring Data Redis ecosystem works unchanged.
3. Superior benchmark performance: 8–37% higher throughput, 22% lower P99 vs Redis OSS.
4. 20% lower memory footprint (new hashtable in 8.1) reduces infra cost.
5. Linux Foundation governance — vendor-neutral, long-term sustainability.
6. AWS and Google Cloud investment in managed Valkey signals industry commitment.
7. Active development: I/O threading, new data structures, improved cluster operations.

**Weaknesses:**
1. Valkey 8.x does not include the Redis Stack extensions (JSON, Time Series, Vector Search) natively — these are separate modules (valkey-json, valkey-bloom) not yet as mature as Redis 8.0's integrated core.
2. Ecosystem still building documentation and tutorials; Redis documentation is more comprehensive.
3. Encryption at rest: no built-in; filesystem-level required.
4. No commercial support contract from the Linux Foundation itself (Percona, Amazon, and others offer commercial Valkey support).

---

#### Option C: KeyDB (multi-threaded Redis fork)

**License:** BSD-3-Clause (KeyDB Community). However, KeyDB was acquired by Snap Inc. (Snapchat) in 2022 and community development activity has stalled. The project is effectively in maintenance mode as of 2024.

**Technical profile:** Multi-threaded Redis implementation predating Valkey; claimed 5x higher throughput than single-threaded Redis on multi-core. However, Valkey 8.0's I/O threading has closed this gap. With KeyDB's governance uncertainty, there is no compelling reason to choose it over Valkey.

**Verdict for CuraOS:** Not recommended due to governance uncertainty and community stagnation.

---

#### Option D: Microsoft Garnet (MIT License)

**License:** MIT. Fully permissive.

**Technical profile:** Released by Microsoft Research in March 2024. Written in C#/.NET 8. Implements Redis Serialization Protocol (RESP) — drop-in Redis client compatibility. Claims significantly higher throughput than Redis on Windows and comparable on Linux. Designed primarily for .NET workloads.

**Weaknesses for CuraOS:**
1. Written in .NET/C# — introduces a non-JVM runtime dependency for a JVM platform. Operational overhead of managing a .NET runtime alongside JVM services in container images.
2. Community is primarily Microsoft-internal and .NET ecosystem; Kotlin/JVM ecosystem integration is functional (RESP is client-agnostic) but secondary concern for the project.
3. Linux performance parity with Redis is not as strong as on Windows.
4. Not production-battle-tested at the scale of Redis or Valkey as of 2024–2025.

**Verdict for CuraOS:** Not recommended. .NET runtime dependency adds unnecessary operational complexity to a JVM platform.

---

#### Option E: DragonflyDB

**License:** Business Source License 1.1 (BSL). Converts to Apache 2.0 after 4 years. The BSL prohibits using DragonflyDB to offer a commercial database-as-a-service product.

**Technical profile:** Multi-threaded, lock-free architecture. Claims 25x higher throughput than Redis on multi-core servers. In independent testing, benchmarks are impressive but less dramatic: 2–5x Redis throughput on comparable hardware. Strong memory efficiency.

**License implications for CuraOS:** CuraOS is not offering DragonflyDB as a database service to customers; customers run their own CuraOS stack with DragonflyDB embedded. The BSL "production use limitation" specifically targets offering the software as a managed service — not using it internally as part of your own product. CuraOS's self-hosted deployment model is likely compatible. However, BSL is NOT OSI-approved, and enterprise procurement teams at regulated healthcare institutions may require legal review or simply reject it.

**Verdict for CuraOS:** Technically impressive but BSL adds procurement friction for exactly the customer profile CuraOS targets (regulated enterprises). Not recommended for primary selection; worth monitoring as the 4-year Apache 2.0 conversion window approaches.

---

#### Option F: Hazelcast / Apache Ignite (JVM-native In-Memory Data Grid)

**Technical profile:** These are distributed in-memory data grids (IMDG) rather than cache-only systems. They run natively on JVM, embed in Spring Boot applications as peer nodes, and provide distributed maps, queues, topics, and distributed locks without a separate process.

**Hazelcast:**
- License: Apache 2.0 (Hazelcast Community). Enterprise features behind commercial license.
- Spring Integration: `spring-boot-starter-hazelcast`; native Spring Cache and Spring Session support.
- Embedded topology: no separate cache server process; cache tier is embedded in each service pod, forming a cluster automatically.
- Strengths: no network hop for cache reads (in-process), JVM-native, Spring-native, distributed locks (IMap with TTL), distributed queues.
- Weaknesses: cache partitioned across service pods — pod restarts cause partition rebalancing, temporary cache miss spike; topology change management is complex at scale; not a Redis protocol replacement.

**Apache Ignite:**
- License: Apache 2.0.
- Provides distributed caching, compute, SQL, and ACID distributed transactions.
- More complex than Hazelcast; closer to a distributed database than a cache.
- Spring Data JPA integration exists but is less mature than Redis Spring Data integration.

**Verdict for CuraOS:** Not recommended as the primary distributed cache tier. The IMDG topology adds operational complexity (pod-level cluster management) that a simple Redis/Valkey sidecar pattern avoids. Caffeine handles in-process L1 caching; Valkey handles L2. Hazelcast could be considered for specific use cases like distributed lock coordination if a separate ZooKeeper/Redis lock manager is undesirable.

---

#### Option G: In-process only (Caffeine L1 + PostgreSQL unlogged tables as L2)

Using only Caffeine in-process cache without a distributed cache tier. L2 reads go directly to PostgreSQL (unlogged tables for speed, standard tables with TTL column for correctness).

**Strengths:** Eliminates operational dependency on a separate cache process. Reduces container count.

**Weaknesses:** Multiple service instances cannot share cache state — session data, rate limits, distributed locks require cross-instance coordination. PostgreSQL unlogged tables have no crash recovery (by design); on primary failover, all cached data is lost, causing thundering herd against the DB. Not viable for multi-instance horizontally scaled services.

**Verdict for CuraOS:** Insufficient for a distributed horizontally scaled platform. Caffeine as L1 is mandatory and complementary; a distributed L2 (Valkey) is also mandatory.

---

### Comparison Matrix (Cache)

| Criterion | Valkey 8.x | Redis 8.0 | KeyDB | Garnet | DragonflyDB | Hazelcast |
|---|---|---|---|---|---|---|
| License | BSD-3 (permissive) | AGPLv3 | BSD-3 (stagnant project) | MIT | BSL 1.1 | Apache 2.0 |
| OSI-approved | Yes | Yes | Yes | Yes | No | Yes |
| Drop-in Redis compat | Yes (100%) | N/A (is Redis) | Yes | Yes (RESP) | Yes | No |
| Self-hosted SaaS fit | Excellent | Good (AGPLv3 internal use OK) | Not recommended | Not recommended (.NET dep) | Moderate (BSL friction) | Moderate (different paradigm) |
| Throughput vs Redis 7.2 | +8–37% | +87% (cmds), +2x (ops) | +300% (multi-core, claimed) | High (.NET perf) | +25x (claimed; 2–5x realistic) | Comparable |
| Memory efficiency | 20–28% less | Similar to Redis 7.2 | Similar | Similar | Excellent | JVM heap overhead |
| Spring Data Redis compat | Yes (Lettuce/Jedis) | Yes | Yes | Yes | Yes | Via Spring Cache |
| Encryption at rest | Filesystem | Filesystem | Filesystem | Filesystem | Filesystem | Filesystem |
| HA (Sentinel / Cluster) | Yes | Yes | Yes (Sentinel) | No | No (single instance or client sharding) | Yes (cluster topology) |
| Linux Foundation governance | Yes | No | Snap (stagnant) | Microsoft | VC-backed startup | Open source + commercial |
| Valkey modules (JSON etc.) | Separate modules | Integrated core | Limited | Limited | Partial | N/A |
| Hiring pool | Growing fast | Largest | N/A | .NET only | Small | Medium |

---

### Recommendation (Cache)

**Recommend: Valkey 8.x (distributed L2) + Caffeine (in-process L1).**

Valkey's BSD-3-Clause license is unequivocally the best fit for CuraOS's self-hosted air-gapped appliance deployment model. The 8–37% throughput advantage over Redis OSS, 20–28% memory reduction, and drop-in compatibility mean there is no adoption cost and significant operational benefit. The Linux Foundation governance removes the single-vendor trust risk that caused the 2024 Redis SSPL crisis.

**Configuration guidance:**
- Valkey Sentinel for HA in single-region deployments (1 primary + 2 replicas + 3 Sentinels, can co-locate with Patroni etcd).
- Valkey Cluster for deployments exceeding ~100 GB working set or requiring horizontal write scaling.
- Multi-tenant key namespacing: `{tenant_id}:domain:key` convention enforced via Spring Cache key generator; cluster hash-tagging `{tenant_id}` ensures atomic multi-key operations stay on single shard.
- TLS in transit mandatory; filesystem encryption (LUKS) for at-rest.
- Spring Session with Valkey for stateless service-to-service auth token caching.
- Spring Cache with Caffeine as L1 (TTL: 30 s) and Valkey as L2 (TTL: 5–30 min) using `CompositeCacheManager`.

Redis 8.0 is now a viable OSS alternative with its AGPLv3 return, and its integrated JSON/Vector extensions are more mature than Valkey's separate modules. Redis 8.0 should be the fallback choice if a customer's procurement team flags BSD-3-Clause as insufficient for their open-source policy (unusual but possible in academic contexts). The platform should abstract the cache tier behind Spring Cache so switching between Valkey and Redis requires only dependency and configuration changes.

---

### Open Questions (Cache)

1. Is there a specific Valkey module requirement for JSON or Vector search at cache tier? If yes, evaluate valkey-json module maturity vs Redis 8.0's integrated JSON support.
2. Distributed lock strategy: Redisson's RLock over Valkey vs a dedicated lock manager (ZooKeeper/etcd)? Redisson's Valkey support should be confirmed before committing.
3. Cache invalidation propagation pattern for schema-per-tenant: pub/sub channel `{tenant_id}:cache-invalidate` in Valkey vs application-level TTL-only? Define this before services proliferate.

---

## Sub-decision 3: Search

### Options

#### Option A: OpenSearch 2.x / 3.x (Apache 2.0)

**License:** Apache 2.0. The Linux Foundation accepted OpenSearch under its umbrella in late 2024, cementing long-term vendor-neutral governance.

**Origin:** Forked from Elasticsearch 7.10 by AWS in 2021 after Elastic's BSL license change. OpenSearch 3.0 released 2025 with significant performance improvements.

**Performance:** OpenSearch 3.0 reports 9.5x performance improvement over version 1.3. Elasticsearch benchmarks show 40–140% faster response than OpenSearch on complex queries and 2–12x faster vector search operations. An independent Trail of Bits benchmark (March 2025) found OpenSearch faster on mixed workloads. The gap is real on specialized workloads (vector, time-series) but marginal on standard text search and log analytics.

**Multi-tenancy:**
- Index-per-tenant: complete data isolation, independent index settings, easy tenant deletion (delete index). Cost: index management overhead, shard count multiplies with tenant count.
- Shared index + tenant filter: all documents in shared index with `tenant_id` field; filtered at query time. OpenSearch security plugin enforces document-level security (DLS) — filters are applied at the engine, not the application. Risk: misconfigured DLS leaks tenant data; requires careful policy testing.
- OpenSearch security plugin provides RBAC at index, document, and field level. Free and built-in (unlike Elasticsearch which required paid tier for equivalent features).
- OpenSearchCon 2024 session specifically addressed "multi-tenancy for all workloads" — active community focus area.

**Encryption at rest:** Supported. Node-level encryption via OS/filesystem. AWS-managed index-level encryption available in managed service. Self-hosted: relies on filesystem encryption (LUKS) or encrypted block devices. The `opensearch-storage-encryption` plugin (GitHub) provides per-index key encryption with KMS backend — useful for per-tenant key isolation at search tier.

**HIPAA compliance:** AWS OpenSearch Service is HIPAA-eligible. Self-hosted OpenSearch with TLS + filesystem encryption + audit logging meets HIPAA technical safeguard requirements. OpenSearch security plugin audit logging is built in.

**Backup / DR:** Snapshot to S3/MinIO compatible. Snapshot lifecycle management built in. Cross-cluster replication (CCR) for DR — included free in OpenSearch (Elasticsearch CCR requires Platinum/Enterprise subscription).

**JVM / Kotlin client:** OpenSearch Java client (Apache 2.0) actively maintained. Kotlin-idiomatic use via coroutines wrapper. Spring Data OpenSearch project exists but is less mature than Spring Data Elasticsearch; most teams use the Java client directly with Kotlin.

**Strengths:**
1. Apache 2.0 — best license fit for self-hosted SaaS distribution.
2. RBAC, document-level security, field masking included free (no paid tier required).
3. CCR (cross-cluster replication) for DR included free.
4. Linux Foundation governance; 400+ contributing organizations, 3,300+ contributors.
5. Snapshot to MinIO/S3 for backup — integrates with object store layer.
6. OpenSearch Dashboards (Kibana fork) for visualization.
7. Vector search (k-NN plugin) for hybrid BM25 + vector workloads.
8. Multiple competing managed service providers (Amazon, Aiven, Instaclustr) — no single-vendor lock-in.
9. Searchable Snapshots included (Elasticsearch requires Enterprise tier).

**Weaknesses:**
1. Performance gap on complex queries and vector search vs Elasticsearch (40–140% slower on Elastic's benchmarks; independent tests more nuanced).
2. OpenSearch 3.0 breaks API compatibility with Elasticsearch 8.x — cross-compatibility is no longer guaranteed.
3. Spring Data integration less mature than Spring Data Elasticsearch.
4. JVM memory footprint: each OpenSearch node requires 2–8 GB heap plus off-heap storage (Lucene segments).
5. Index-per-tenant at scale (thousands of tenants) creates shard management complexity.
6. Shards are the unit of parallelism and resource allocation; poor shard planning degrades performance significantly.

---

#### Option B: Elasticsearch 9.x (AGPL / SSPL / Elastic License)

**License:** Triple-licensed as of Elasticsearch 8.x/9.x: AGPLv3, SSPL 1.0, and Elastic License v2.0. Users can choose. AGPLv3 is OSI-approved; SSPL is not. For internal self-hosted use (CuraOS infrastructure component), AGPLv3 selection is compatible. However, enterprise procurement at regulated institutions often flags AGPLv3 with the same concern as copyleft — "what if we modify it?" Legal review required.

**Performance advantage:** Elasticsearch genuinely outperforms OpenSearch on specialized workloads. If HealthStack clinical document search requires best-in-class vector search performance (sub-10ms embedding search at millions of documents), Elasticsearch 9.x has a material advantage.

**Security features:** Security is free in Elasticsearch 8+ (was behind paid tier in Elasticsearch 6/7). TLS, API key auth, and basic RBAC are included. Advanced document-level security and field masking still require paid Elastic Stack subscription.

**Verdict for CuraOS:** Technically superior on performance benchmarks but license complexity (triple-license) adds procurement friction. Document-level security is behind a paywall. For a self-hosted platform serving regulated customers, OpenSearch's cleaner Apache 2.0 with built-in free DLS is the better fit. Recommend OpenSearch as primary with a note that HealthStack search overlay can optionally adopt Elasticsearch for clinical document search performance if benchmarks demonstrate the gap matters at production scale.

---

#### Option C: Meilisearch (MIT License)

**License:** MIT. Fully permissive.

**Technical profile:** Written in Rust. Uses LMDB for disk-backed storage. Designed for typo-tolerant, faceted, fast full-text search with excellent developer experience (DX). Default ranking is not BM25 (it uses a proprietary ranking algorithm) but delivers excellent relevance for e-commerce and product catalogs.

**Multi-tenancy:** Meilisearch tenant tokens provide scoped API keys that restrict which documents a specific user or tenant can access within an index. Server-signed tenant tokens contain embedded filters applied at the search engine. This is a strong multi-tenant pattern.

**Scale limitations:** Meilisearch is designed for datasets up to tens of millions of documents per index. At hundreds of millions of documents, performance degrades. For CuraOS's generic services (products, patients, workflows), this is likely sufficient. For bulk log/event search at enterprise scale, it is insufficient.

**Vector / hybrid search:** Meilisearch added vector search (hybrid BM25 + vector) in 2024. Maturity is improving but behind OpenSearch/Elasticsearch for production RAG and clinical search use cases.

**Strengths:**
1. MIT license — permissive, zero friction.
2. Outstanding DX — easy to set up, configure, and operate.
3. Excellent typo tolerance for user-facing search (product search, patient name search).
4. Tenant tokens for multi-tenancy — clean pattern.
5. Low memory footprint relative to Elasticsearch/OpenSearch.
6. Rust implementation — excellent stability and low CPU overhead.
7. RESTful JSON API — any language/runtime integrates easily.

**Weaknesses:**
1. Not Apache-licensed; MIT means less enterprise community governance.
2. Scale ceiling: not suitable for log analytics, audit search at billions of events.
3. BM25 is not the default ranking model — relevance behavior differs from Elasticsearch; migration of existing ES queries requires work.
4. Kubernetes / distributed mode: Meilisearch is single-instance or experimental multi-node (Meilisearch Cloud uses managed multi-instance); self-hosted HA is limited.
5. Snapshot / backup: manual; no built-in snapshot-to-S3.
6. HIPAA: no documented compliance certification; encryption at rest relies on filesystem; no built-in audit logging for search queries.
7. Vector search is newer and less production-tested than OpenSearch or Elasticsearch vector capabilities.

---

#### Option D: Typesense (GPL-3 / Typesense Cloud)

**License:** GPL-3 (self-hosted). Commercial license available from Typesense.

**Technical profile:** Written in C++. Entire index in RAM — extremely fast sub-50ms response times for in-memory datasets. BM25-based ranking. Typo tolerance. Faceting.

**Multi-tenancy:** Scoped API keys restrict document access per-tenant — similar to Meilisearch tenant tokens.

**HIPAA:** Typesense Cloud is HIPAA-compliant and can sign BAAs. Self-hosted Typesense: encryption at rest via filesystem; no built-in audit logging; no specific HIPAA documentation for self-hosted.

**Scale:** RAM-resident index — large datasets require substantial memory. 1 M documents with 10 fields ≈ 10–20 GB RAM. Not suitable for log search.

**GPL-3 license concern:** GPL-3 is copyleft. For CuraOS to distribute Typesense as part of an on-prem appliance, GPL-3 requires the entire appliance to be GPL-3 licensed or a commercial license must be purchased. This is a significant friction point for a platform that may have proprietary vertical overlays.

**Verdict for CuraOS:** GPL-3 license is disqualifying for bundled on-prem distribution without commercial license. Not recommended as primary search tier.

---

#### Option E: Manticore Search (GPL-2 / Manticore Search License)

**License:** GPL-2 for the core; Manticore Search also offers an enterprise license. Similar GPL concern to Typesense for on-prem distribution.

**Technical profile:** Successor to Sphinx Search. Fast columnar storage, full-text search, JSON support, HTTP + MySQL wire protocol. Lower memory footprint than Elasticsearch.

**Strengths:** Very fast full-text search; MySQL wire compatibility for SQL queries; suitable for log-scale document volumes.

**Weaknesses:**
1. GPL-2 license — same copyleft concern as Typesense for bundled distribution.
2. Smaller community than OpenSearch/Elasticsearch.
3. Vector/hybrid search is limited compared to OpenSearch.
4. Spring/Kotlin client library is thin; most integrations via MySQL JDBC driver.

**Verdict for CuraOS:** Not recommended. GPL license friction + smaller community and ecosystem.

---

#### Option F: PostgreSQL native full-text search (tsvector + pg_trgm + pgvector + pg_search/ParadeDB)

**Technical profile:** Reuses the relational DB entirely for search. No separate search tier.

- `tsvector` + `ts_query`: standard full-text search in PostgreSQL. GIN indexes. Supports English and many language-specific dictionaries.
- `pg_trgm`: trigram similarity for typo tolerance and fuzzy matching.
- `pgvector 0.7+`: L2/cosine/dot-product vector similarity indexes (HNSW, IVFFlat) for semantic search.
- `pg_search` (ParadeDB): BM25 scoring native in PostgreSQL via `paradedb.search()`. Open source (Apache 2.0), actively maintained by ParadeDB.
- Hybrid search: BM25 (via pg_search) + vector (pgvector) combined with Reciprocal Rank Fusion (RRF) — ParadeDB documents this pattern explicitly, 100 lines of SQL.

**Strengths:**
1. No additional infrastructure tier — search runs in the DB.
2. ACID-consistent search — search results reflect committed state, not eventually consistent index.
3. Tenant isolation is inherent — PostgreSQL's RLS or schema routing applies to search queries automatically.
4. pgvector HNSW indexes at PG17 support approximate nearest neighbor search with adjustable accuracy/speed tradeoff.
5. No sync pipeline needed — search index is the table data itself.
6. Apache 2.0 (ParadeDB) + PostgreSQL License (pgvector) — fully permissive.
7. ParadeDB supports BM25 hybrid search with highlighting, facets, and custom ranking as of 2024–2025.

**Weaknesses:**
1. Not suitable for high-volume log/event search (audit events at billions of rows will degrade performance even with GIN indexes).
2. No relevance tuning UI or analytics (no equivalent to OpenSearch Dashboards).
3. GIN index build time is significant on large datasets; index maintenance adds write overhead.
4. No built-in typo tolerance beyond pg_trgm similarity (not as user-friendly as Meilisearch/Typesense for consumer-facing product search).
5. Horizontal search scaling requires Citus or application-level sharding — cannot scale independently of the DB.
6. Not suitable as a replacement for a dedicated search tier at hyperscale (>100 M documents across all tenants).

---

#### Option G: Quickwit (Apache 2.0)

**Technical profile:** Distributed log search engine using Tantivy (Rust-based Lucene alternative). Stores cold indexes on S3/MinIO — no per-node disk requirement for historical data. Elasticsearch and OpenSearch compatible API.

**Use case:** Primarily log analytics and observability search (high-volume append-only data), not transactional document search. Better positioned as a replacement for Elasticsearch in the logging pipeline (Observability service) than as the primary product search engine.

**Verdict for CuraOS:** Recommended as a future evaluation for the observability/log search use case within the logging service. Not recommended as the primary search tier for product/entity search.

---

#### Option H: Apache Solr (Apache 2.0)

**License:** Apache 2.0.

**Technical profile:** Mature, feature-rich search platform built on Lucene. Predates Elasticsearch. SolrCloud for distributed deployment.

**Weaknesses for CuraOS:**
1. Declining adoption relative to Elasticsearch/OpenSearch — Stack Overflow surveys show steady decline.
2. Configuration complexity (XML-heavy schema management) is higher than Elasticsearch/OpenSearch.
3. REST API is less ergonomic than OpenSearch.
4. Kotlin client libraries are thin; community primarily uses Java SolrJ.

**Verdict for CuraOS:** Not recommended. OpenSearch has equivalent Apache license with better DX, more active development, and larger community.

---

### Comparison Matrix (Search)

| Criterion | OpenSearch 2/3 | Elasticsearch 9 | Meilisearch | Typesense | PG native (pg_search) | Quickwit |
|---|---|---|---|---|---|---|
| License | Apache 2.0 | AGPLv3/SSPL/EL | MIT | GPL-3 | Apache 2.0 / PG License | Apache 2.0 |
| OSI-approved (all) | Yes | Partial (AGPLv3 option) | Yes | Yes | Yes | Yes |
| Self-hosted SaaS fit | Excellent | Good (AGPLv3 OK internal) | Excellent | Not recommended (GPL-3) | Excellent | Good (log-specific) |
| Multi-tenant isolation | DLS (free, built-in) | DLS (paid Elastic tier) | Tenant tokens | Scoped keys | RLS / schema routing | Index-level |
| Encryption at rest | Filesystem / plugin | Filesystem | Filesystem | Filesystem | Filesystem / pg_tde | S3 SSE |
| BM25 relevance | Yes | Yes | Proprietary (similar) | Yes | Yes (ParadeDB) | Yes (Tantivy) |
| Hybrid (BM25 + vector) | Yes (k-NN + BM25) | Yes (ELSER) | Yes (newer) | Limited | Yes (pgvector + pg_search) | Partial |
| Snapshot to MinIO/S3 | Yes | Yes | No (manual) | No | N/A (DB backup) | Yes (native) |
| Max practical document scale | Billions (cluster) | Billions (cluster) | Tens of millions | Tens of millions (RAM) | Hundreds of millions | Billions (log-focused) |
| Spring/JVM client quality | Good (Java client) | Excellent (Elasticsearch Java) | Good (HTTP REST) | Good (HTTP REST) | First-class (JDBC) | Moderate |
| Operational complexity | High (JVM, Lucene) | High | Low | Low | Lowest (no extra service) | Medium |
| Memory floor per node | 2–8 GB heap | 2–8 GB heap | 512 MB | 1–4 GB (all RAM) | Shared with PG | 1–2 GB |

---

### Recommendation (Search)

**Recommend a tiered search strategy:**

**Tier 1 (default for all services): PostgreSQL native full-text search using pg_search (ParadeDB BM25) + pgvector hybrid.** For the majority of CuraOS services — product search, patient demographic search, workflow search, task search — the document volumes are in the millions, not billions. PostgreSQL-native search with ParadeDB's BM25 + pgvector hybrid search eliminates an entire infrastructure tier, provides ACID-consistent results, and inherits all tenant isolation from the DB layer. No sync pipeline, no eventual consistency lag.

**Tier 2 (opt-in for high-volume or advanced search): OpenSearch 3.x.** Services that exceed PostgreSQL search capacity (e.g., clinical document full-text search across millions of encounters, audit event search, log analytics) graduate to OpenSearch. OpenSearch's Apache 2.0 license, built-in DLS (free), CCR (free), and Linux Foundation governance make it the right dedicated search platform. The search-service submodule (already committed as a CuraOS submodule) should implement the OpenSearch client and index management.

**Index isolation strategy:** Per-tenant index pattern for HealthStack clinical documents (strongest isolation, easy tenant offboarding). Shared index + DLS for generic services (operational efficiency at high tenant count). This decision is tenant-count dependent — see Open Questions.

**Sync from PostgreSQL:** Debezium CDC → Kafka → OpenSearch Sink Connector. This reuses the Debezium infrastructure established for the outbox pattern. Alternatively, Logstash JDBC polling for simpler deployments.

---

### Open Questions (Search)

1. What is the expected document count per tenant per service category (workflows, tasks, clinical notes, products)? This determines whether PG-native search is sufficient or OpenSearch is needed from day one.
2. Per-tenant index vs shared index + DLS for OpenSearch: per-tenant index provides maximum isolation but shard count grows O(tenants × services); shared index + DLS is operationally simpler but DLS misconfiguration is a data leak risk. Document the decision per service category.
3. HealthStack clinical document search: does sub-10ms vector search requirement justify Elasticsearch 9.x over OpenSearch? Benchmark both with realistic clinical note embedding workload before committing.
4. Quickwit for observability log search: should the logging/observability service use Quickwit (S3-backed cold storage) instead of OpenSearch for long-retention audit and log data? Evaluate independently in observability ADR.

---

### Search M11 revisit amendment (2026-06-03, #327)

The DA13 Q4 PG-only-v1 amendment scheduled an OpenSearch revisit *"at HealthStack M11 if
FHIR search perf insufficient."* That revisit has been executed —
[m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md) (issue #327),
status **RESOLVED-EVAL** in [RESOLUTION-MAP.md](RESOLUTION-MAP.md) DA13 Q4. **Verdict: conditional no-go.**

- **PG-only stays** the single-domain default for generic Documents (M11 core) and any
  single-domain clinical query — DA13 Q4 unchanged for this scope.
- **OpenSearch 2.x is re-added as the opt-in Tier 2** federated/clinical indexer for M12
  cross-service clinical-doc search. Rationale (full evidence + projection in the eval
  artifact, not restated here): PG-only has no cross-service index federation and the
  concurrent search+write CPU contention on shared CNPG pods is the workload most likely to
  cross the OQ-05 P95>200ms@50-concurrent trigger with no independent scale-out.

This restores the Tier-2 role already named in
[ADR-0201 §3.3.2](0201-cluster-platform-shared-services.md) and the tiered recommendation in
[m10-service-backend-choices.md § Spike 2](../research/m10-service-backend-choices.md).
Implementation lands in a `foresight`-labeled search-service follow-on Story gated on M11
activation; no code change in #327. Search Open Questions 1–3 above are answered by the eval
for the HealthStack/clinical scope.

---

## Sub-decision 4: Object Store

### Options

#### Option A: MinIO Community Edition (AGPL-3.0) — current commitment

**License:** AGPL-3.0. The AGPL triggers source disclosure when MinIO is used as a network service. For CuraOS's use case — CuraOS services connect to MinIO as internal infrastructure — AGPL does not require CuraOS to open-source itself. However, **significant events in 2025 have materially changed the MinIO Community Edition value proposition:**

- March 2025: MinIO removed the Web UI (management console) from Community Edition. Administrative functions now require the `mc` CLI tool. The full console is gated behind MinIO AIStor Enterprise Edition at $96,000/year.
- February 2026: MinIO Community Edition binary distribution ceased. The repository is source-only with no precompiled binaries and no security patches or bug fixes committed to the community branch. Development has fully shifted to the proprietary MinIO AIStor product.

**Bottom line:** MinIO Community Edition is effectively abandoned as of 2026. Running it in production means running an unpatched, unsupported object store. **The current commitment to MinIO must be revised.**

**MinIO's technical merits (for completeness, noting these are now only accessible via AIStor):**
- Fastest self-hosted S3-compatible throughput: 2.8 GB/s read, 2.1 GB/s write (4+4 erasure coding benchmark).
- Most comprehensive S3 API compatibility.
- WORM / Object Lock (S3 compliance mode) — critical for HIPAA audit immutability.
- SSE-S3, SSE-KMS, SSE-C encryption modes.
- Multi-site replication.
- Bucket versioning and lifecycle rules.

**Verdict:** MinIO AIStor Enterprise at $96K/year may be viable for a vendor-managed SaaS tier. For self-hosted on-prem customer deployments, the cost and license model are disqualifying. **MinIO Community Edition is not recommended** as of this ADR date. Alternatives must be evaluated.

---

#### Option B: SeaweedFS (Apache 2.0) — recommended primary

**License:** Apache 2.0. Fully permissive. Zero friction for self-hosted SaaS appliances, air-gapped distribution, proprietary overlay distribution.

**Technical profile:** Distributed file + object system inspired by Facebook's Haystack and f4 papers. Written in Go. Separates metadata (master servers) from data (volume servers). S3-compatible API gateway layer.

**Performance:** 2.3 GB/s read, 1.8 GB/s write benchmark on comparable hardware to MinIO's 2.8/2.1 GB/s. ~82% of MinIO throughput with ~50% of the memory footprint (2–4 GB RAM per volume server vs 4–32 GB for MinIO nodes).

**S3 compatibility:** Core S3 operations (PUT, GET, DELETE, multipart, presigned URLs) well supported. Some advanced lifecycle policy features require additional configuration. Object Lock / WORM: SeaweedFS supports object locking as of v3.x — critical for HIPAA audit immutability. **Verify WORM implementation completeness with a PoC before production.**

**Encryption:** Server-side encryption (SSE-S3) supported. SSE-KMS integration requires external KMS. At-rest encryption via encrypted volumes is a backup option.

**Multi-tenancy:** Bucket-per-tenant isolation via IAM policies on the S3 gateway layer. SeaweedFS IAM supports per-bucket access policies compatible with S3 IAM semantics.

**Versioning:** Supported.

**Erasure coding:** Optional feature (configurable); many deployments use replication for simplicity.

**Backup / DR:** Replication across volume servers and data centers. Snapshot not native — backup via cross-site replication + periodic full copy.

**Container footprint:** Minimal. Master server: ~256 MB RAM. Volume server: 2–4 GB. Entire small cluster (1 master + 3 volume servers) fits in 10–15 GB total RAM — suitable for SMB on-prem.

**GitHub activity:** ~37K stars, actively maintained. Apache 2.0. Production use cases at Grab, others.

**Strengths:**
1. Apache 2.0 — best permissive license for CuraOS's distribution model.
2. Low memory footprint — viable for SMB customer on-prem hardware.
3. S3 API compatible — no application code changes from MinIO migration.
4. Object locking (WORM) support for HIPAA audit immutability.
5. SSE-S3 encryption at rest.
6. Separation of metadata and data volume enables independent scaling.
7. Handles billions of small files efficiently (Haystack architecture).
8. Active development and large community.

**Weaknesses:**
1. S3 API coverage is not 100% — some advanced lifecycle features require verification.
2. Management UI is less polished than MinIO's was; primary management via CLI.
3. WORM implementation maturity should be PoC'd against HIPAA compliance requirements.
4. Cross-datacenter replication is available but requires careful configuration for active-passive DR.
5. Erasure coding is less default-configured than MinIO's built-in EC approach.

---

#### Option C: Garage (AGPL-3.0, Deuxfleurs)

**License:** AGPL-3.0. Built by the Deuxfleurs French nonprofit association. NLnet/NGI0 Commons Fund funded 1.5 FTE for 2025.

**Technical profile:** Written in Rust. Designed for geo-distributed deployment on modest hardware (even consumer-grade home servers and VPS nodes). Prioritizes resilience over raw throughput. 3x replication by default.

**Performance:** ~1.6 GB/s read, 1.2 GB/s write on equivalent hardware. ~57% of MinIO throughput.

**S3 compatibility:** Core operations supported. Garage documentation explicitly enumerates which S3 API operations are implemented and which are missing — a refreshingly honest stance. Object Lock / WORM: **not supported as of current Garage versions** (confirmed by review of feature matrix). This is a disqualifying gap for HIPAA audit immutability.

**Container footprint:** 1–2 GB RAM per node. The lightest option in this evaluation.

**Use case fit:** Home lab, edge deployments, geographically distributed nodes with unreliable connectivity. Garage's consensus model tolerates network partitions between nodes — ideal for edge, not optimal for a high-throughput datacenter deployment.

**Verdict for CuraOS:** WORM/Object Lock absence disqualifies Garage as the primary object store for HIPAA audit records. Garage could be suitable for non-regulated file storage at edge deployments. Not recommended as primary.

---

#### Option D: Ceph (LGPL-2.1 + Apache 2.0 components) with RADOS Gateway (S3)

**License:** Ceph is primarily LGPL-2.1 for librados; components vary (Apache 2.0, LGPL). LGPL does not impose strong copyleft on applications that use Ceph as an external service (linking exception). Self-hosted deployment is unrestricted.

**Technical profile:** The de-facto enterprise-grade distributed storage platform. Used by OpenStack, Kubernetes (via Rook), and major cloud providers. RADOS Gateway (RGW) provides S3 and Swift compatible APIs.

**Performance:** 1.9 GB/s read, 1.4 GB/s write (3+1 erasure coding). Lower raw throughput than MinIO/SeaweedFS but exceptional durability at petabyte scale.

**Multi-tenancy:** Excellent. Per-tenant namespace isolation, per-tenant quotas, sophisticated ACL via RADOS Gateway.

**WORM / Object Lock:** Ceph RGW supports S3 Object Lock in Compliance mode — full WORM support. Verified production feature.

**Encryption:** SSE-S3 (RADOS Gateway SSE), SSE-KMS (Vault integration). Full encryption at rest via OSD-level encryption (dm-crypt). Per-tenant encryption keys via Vault Transit.

**Backup:** Cross-cluster replication via RGW multi-site replication. Snapshots at the RADOS pool level.

**Container footprint:** Heavy. Minimum viable Ceph cluster (MON x3 + MGR x1 + OSD x3 + RGW x1): ~24–48 GB RAM. Requires dedicated infrastructure team for operation. **Unsuitable for SMB on-prem customer deployments.**

**Kubernetes:** Rook-Ceph operator provides automated Ceph lifecycle management on Kubernetes. Significantly reduces operational burden in K8s environments.

**Strengths:**
1. Battle-tested at petabyte scale. Most mature self-hosted distributed storage system.
2. Full S3 Object Lock / WORM compliance mode — definitive HIPAA fit.
3. SSE-KMS with Vault integration — per-tenant key isolation.
4. Sophisticated multi-tenancy, quotas, namespacing.
5. Multi-site replication built-in.
6. Rook operator simplifies K8s deployment significantly.

**Weaknesses:**
1. Heavy operational complexity — requires dedicated storage expertise.
2. Memory floor ~24 GB for a viable cluster — prohibitive for SMB on-prem.
3. Not suitable for single-node or 2-node deployments (requires 3+ OSDs minimum).
4. Tuning CRUSH maps, PG counts, pool settings is complex and error-prone.
5. Upgrade procedures require careful orchestration.

**Verdict for CuraOS:** Ceph is the right answer for large enterprise and vendor-managed SaaS deployments with dedicated infrastructure teams. It is not suitable for SMB on-prem customer deployments. Recommend Ceph as an optional deployment target for enterprise-tier customers with K8s + Rook.

---

#### Option E: RustFS (Apache 2.0)

**License:** Apache 2.0.

**Technical profile:** Very recently emerged (2025–2026) MinIO-compatible replacement written in Rust. Aims for full MinIO API compatibility including WORM, SSE, multi-site replication, and the management console that MinIO Community Edition dropped.

**Status concern:** RustFS is a nascent project. Production maturity at the level required for HIPAA-regulated data storage has not been established. No significant production case studies as of ADR date.

**Strengths:** Apache 2.0, MinIO API compat, Rust memory safety, includes management console.

**Weaknesses:** Very new; limited production validation; small community; WORM and SSE maturity unproven.

**Verdict for CuraOS:** Promising alternative to evaluate in 6–12 months. Not recommended for production at this ADR date due to insufficient maturity validation.

---

#### Option F: Apache Ozone (Apache 2.0)

**License:** Apache 2.0. Part of the Hadoop ecosystem.

**Technical profile:** Distributed object/key-value store designed for big data workloads (HDFS replacement). S3-compatible API. Built for high-throughput batch access patterns.

**Weaknesses for CuraOS:**
1. Designed for Hadoop ecosystem integration; operational model assumes Hadoop-familiar operations team.
2. Heavy footprint (JVM-based distributed service).
3. Community is primarily Hadoop users; limited adoption outside that ecosystem.
4. WORM support and SSE maturity require verification.

**Verdict for CuraOS:** Not recommended. Hadoop ecosystem dependency is inappropriate for a general-purpose microservices platform.

---

#### Option G: Self-hosted Rook-Ceph on Kubernetes

Not a distinct option from Ceph (Option D) — Rook is a Kubernetes operator that manages Ceph. If CuraOS adopts Kubernetes as the orchestration platform (likely for vendor-managed SaaS), Rook-Ceph is the recommended deployment pattern for Ceph. See Option D for full evaluation.

---

#### Option H: Managed cloud object stores (AWS S3, Backblaze B2, Wasabi)

Violate the self-hosted charter for the primary object store. May be offered as an optional integration for cloud SaaS managed tier (CuraOS vendor uses AWS S3 for its own cloud deployment). Platform must function identically when pointed at SeaweedFS or Ceph on customer infra.

Note: Backblaze B2 and Wasabi are S3-compatible and significantly cheaper than AWS S3. For CuraOS's vendor-managed cloud SaaS tier, these are worth evaluating as cost reduction options. Not the primary recommendation.

---

### Comparison Matrix (Object Store)

| Criterion | SeaweedFS | MinIO CE | Garage | Ceph RGW | RustFS |
|---|---|---|---|---|---|
| License | Apache 2.0 | AGPL-3.0 (abandoned CE) | AGPL-3.0 | LGPL-2.1 | Apache 2.0 |
| OSI-approved | Yes | Yes | Yes | Yes | Yes |
| Self-hosted SaaS fit | Excellent | Disqualified (abandoned) | Good (but WORM missing) | Excellent (ops heavy) | Pending maturity |
| S3 API coverage | Good (core + ext) | Best (abandoned CE) | Core (explicit gap list) | Excellent | Full MinIO compat (claimed) |
| WORM / Object Lock | Yes (v3+) | Yes (AIStor only) | No | Yes (compliance mode) | Claimed yes |
| SSE-S3 / SSE-KMS | SSE-S3 + volume encrypt | AIStor only | No native | Full SSE-S3/KMS/C | Claimed SSE |
| Multi-tenancy | IAM + bucket policies | AIStor only | Bucket ownership | Namespace isolation + quotas | IAM compat |
| Throughput | 2.3/1.8 GB/s | 2.8/2.1 (AIStor) | 1.6/1.2 GB/s | 1.9/1.4 GB/s | TBD |
| Memory floor (cluster) | 10–15 GB (4 nodes) | N/A (CE abandoned) | 4–8 GB (3 nodes) | 24–48 GB (7 nodes) | Similar to MinIO |
| Multi-site replication | Yes | AIStor | Via 3x replication | Multi-site built-in | Claimed |
| Community / maturity | High (37K stars, 2015+) | N/A for CE | Growing (NLnet funded) | Highest (OpenStack) | Very new (2025) |
| SMB on-prem viable | Yes | No (CE abandoned) | Yes | No (too heavy) | Unproven |
| HIPAA audit (WORM) fit | Yes (verify PoC) | No (CE) | No | Yes | Unproven |

---

### Recommendation (Object Store)

**Replace MinIO Community Edition with SeaweedFS (Apache 2.0) as the primary self-hosted object store.**

MinIO Community Edition is effectively abandoned as of February 2026 (no security patches, no binaries, no bug fixes). Continuing to use it is a security liability.

SeaweedFS provides:
- Apache 2.0 license — permissive, no friction for any CuraOS deployment model.
- S3-compatible API — application layer unchanged from MinIO migration.
- Object Lock (WORM) — satisfies HIPAA audit immutability requirement (verify with PoC before production use for audit records).
- SSE-S3 — encryption at rest.
- Low memory footprint — viable for SMB on-prem.
- Active development (37K GitHub stars, Go, Apache 2.0).

**For enterprise-tier deployments with Kubernetes:** Evaluate Rook-Ceph as an optional upgrade path. Ceph provides definitive WORM compliance mode, SSE-KMS with Vault, and petabyte-scale. Offer as a tier-2 deployment option.

**Migration path from MinIO:** The SeaweedFS S3 gateway is wire-compatible with MinIO. All AWS S3 SDK calls, presigned URLs, and multipart uploads work without code changes. The `mc` (MinIO client) tool works against SeaweedFS. Migration is operational, not code-level.

**RustFS** should be re-evaluated in 12 months if it demonstrates production stability and WORM compliance. Its Apache 2.0 license and MinIO-parity API make it a strong long-term candidate.

---

### Open Questions (Object Store)

1. SeaweedFS WORM / Object Lock compliance mode: run a PoC against HIPAA audit record immutability requirements before using SeaweedFS for audit storage. WORM behavior in compliance mode (cannot delete before retention expiry) must be validated.
2. SSE-KMS vs SSE-S3 for regulated data: if per-tenant encryption key isolation is required (GDPR key-per-controller, HIPAA key management), SSE-KMS with Vault Transit is needed. SeaweedFS SSE-KMS maturity must be verified. Ceph RGW SSE-KMS is more mature.
3. Encryption key management for object store: file a separate ADR or decision for the KMS layer (HashiCorp Vault Transit vs cloud KMS vs filesystem keystore). This is a cross-layer concern shared with the RDBMS encryption key management.
4. Backup strategy for object store: SeaweedFS cross-site replication covers DR but not point-in-time versioned backup. Define backup retention policy and whether MinIO-compatible snapshot tooling (e.g., rclone) covers the requirement.

---

## Cross-Layer Integration Concerns

### Connection Pooling Architecture

```
Services (JVM / Spring Boot 3.4)
    │
    ├─── HikariCP (JDBC connection pool, per-service)
    │        │
    │        └─── PgBouncer (transaction mode, external pool)
    │                  │
    │                  └─── PostgreSQL 17 (Patroni primary)
    │                            ├─ Patroni replica 1
    │                            └─ Patroni replica 2
    │
    ├─── Lettuce (async Redis/Valkey client, Spring Data Redis)
    │        │
    │        └─── Valkey 8.x (Sentinel primary)
    │                  ├─ Valkey replica 1
    │                  └─ Valkey replica 2
    │
    ├─── OpenSearch Java Client (for search-service only)
    │        │
    │        └─── OpenSearch cluster (3+ nodes)
    │
    └─── AWS S3 SDK (all services, via SeaweedFS gateway)
              │
              └─── SeaweedFS (master + volume servers)
```

**HikariCP + PgBouncer interaction:** HikariCP's connection pool manages the service-to-PgBouncer connection; PgBouncer manages the PgBouncer-to-PostgreSQL connection in transaction mode. Do NOT use PgBouncer session mode with schema-per-tenant unless `search_path` is set per query (not per session). Transaction mode requires `SET LOCAL search_path` within each transaction, not `SET search_path` at session level. Configure HikariCP's `connectionInitSql` to avoid persistent session state.

### Transaction Boundaries and Outbox Pattern

The outbox pattern couples DB write + event publish in a single local transaction:

```sql
-- Within a single ACID transaction:
INSERT INTO {tenant_schema}.orders (id, ...) VALUES (...);
INSERT INTO {tenant_schema}.outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
  VALUES (gen_random_uuid(), 'Order', :orderId, 'OrderCreated', :payload::jsonb);
-- COMMIT
-- Debezium reads WAL, publishes outbox_events rows to Kafka
-- Debezium OutboxEventRouter SMT routes to Kafka topic by aggregate_type
```

This pattern guarantees exactly-once event publishing relative to DB state. The outbox table must exist in every tenant schema (for schema-per-tenant) or in the shared schema with `tenant_id` column + RLS policy (for shared-schema services).

**Multi-tenant outbox concern:** Debezium logical replication slot monitors all changes in the PostgreSQL instance. For schema-per-tenant, the Debezium connector sees outbox rows from all tenant schemas — the `aggregate_type` field should include tenant context. For RLS shared-schema, the Debezium replication slot user must bypass RLS (replication user is a superuser by definition). This is acceptable because Debezium is trusted infrastructure, not a tenant application.

### Cache Invalidation Strategy

Cross-service cache invalidation uses Valkey pub/sub:

- Publishing service writes to DB + publishes cache invalidation event to Valkey channel `cache:invalidate:{tenant_id}:{entity_type}`.
- All service instances subscribe to their relevant channels via Valkey subscribe.
- On invalidation message receipt, Caffeine L1 cache entries for affected tenant+entity are evicted.
- Valkey L2 cache TTL provides fallback expiry if pub/sub message is missed.

This pattern requires that all service instances connected to the same Valkey cluster receive pub/sub messages — verify with Valkey Sentinel topology (messages are delivered on the current primary; replicas do not receive pub/sub).

### Search Index Synchronization (CDC Pattern)

```
PostgreSQL WAL
    │
    └─── Debezium PostgreSQL Connector (logical replication slot)
              │
              └─── Kafka topic: {tenant_id}.{entity_type}.cdc
                        │
                        └─── OpenSearch Kafka Connect Sink
                                  │
                                  └─── OpenSearch index: {tenant_id}-{entity_type}
                                            or
                                       OpenSearch shared index: {entity_type} (+ DLS filter)
```

Debezium CDC to Kafka is the recommended sync mechanism. It reuses the same Debezium connector infrastructure as the outbox pattern. The OpenSearch Kafka Connect Sink connector handles batch indexing. Lag between DB commit and search index update: typically 1–10 seconds depending on Kafka throughput and OpenSearch indexing rate.

For services using PostgreSQL native search (pg_search/pgvector), no sync pipeline is needed — search queries run directly against the table.

### Object Store — DB Metadata Relationship

All binary content lives in SeaweedFS. All references, metadata, and access control live in PostgreSQL:

```sql
CREATE TABLE {tenant_schema}.document_storage (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,  -- redundant in schema-per-tenant but useful for RLS-shared
    object_key   TEXT NOT NULL,  -- SeaweedFS bucket/key path
    bucket       TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    sha256_hash  TEXT NOT NULL,  -- content integrity
    uploaded_by  UUID REFERENCES users(id),
    uploaded_at  TIMESTAMPTZ DEFAULT now(),
    retention_until TIMESTAMPTZ,  -- for WORM-backed audit records
    encrypted_key_ref TEXT,       -- Vault Transit key ID for SSE-KMS
    CONSTRAINT fk_tenant CHECK (tenant_id = current_setting('app.current_tenant'))
);
```

Application never stores binary data in PostgreSQL. Application never returns raw object URLs without presigned URL generation (access control in the object store layer). Presigned URL TTL: 60–300 seconds for user-facing downloads.

---

## Recommendation Summary

| Layer | Decision | License | Justification |
|---|---|---|---|
| RDBMS | PostgreSQL 17 + pg_tde + pgvector + PostGIS + pg_audit | PostgreSQL License (permissive) | Only option satisfying all weighted drivers; richest extension ecosystem; best JVM/Spring Data integration; Patroni + pgBackRest HA battle-tested |
| HA stack | Patroni (etcd) + PgBouncer (txn mode) + pgBackRest | Apache 2.0 / BSD / MIT | Industry-standard PostgreSQL HA; works identically on K8s and VMs |
| Cache (distributed) | Valkey 8.x | BSD-3-Clause | Permissive license; 8–37% throughput over Redis; 20–28% memory reduction; drop-in Redis replacement; Linux Foundation governance |
| Cache (in-process) | Caffeine (Spring Cache L1) | Apache 2.0 | JVM-native; W-TinyLFU; Spring Cache first-class support |
| Search (default) | PostgreSQL native (pg_search ParadeDB + pgvector) | Apache 2.0 / PG License | No extra tier; ACID consistent; tenant isolation inherited; hybrid BM25+vector in 100 lines |
| Search (high volume) | OpenSearch 3.x | Apache 2.0 | Best license for self-hosted SaaS; free DLS and CCR; Linux Foundation; 400+ org contributors |
| Object store | SeaweedFS (replace MinIO CE) | Apache 2.0 | MinIO CE abandoned (2026); SeaweedFS Apache 2.0; S3-compat; WORM; SSE-S3; low footprint |
| Object store (enterprise) | Rook-Ceph (optional, K8s) | LGPL-2.1 | Definitive WORM compliance mode; SSE-KMS+Vault; petabyte scale |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CuraOS Service Layer (91 services)                   │
│                         Kotlin + Spring Boot 3.4 + JVM 21                  │
└──────────┬──────────────┬───────────────┬──────────────────┬───────────────┘
           │              │               │                  │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐  ┌───────▼──────┐
    │  HikariCP   │ │  Lettuce   │ │  OS/PG     │  │  AWS S3 SDK  │
    │  JDBC Pool  │ │  (async)   │ │  Java      │  │  (Spring)    │
    └──────┬──────┘ └─────┬──────┘ │  Client    │  └───────┬──────┘
           │              │        └─────┬──────┘          │
    ┌──────▼──────┐ ┌─────▼──────┐       │          ┌──────▼──────┐
    │  PgBouncer  │ │  Valkey 8  │ ┌─────▼──────┐   │  SeaweedFS  │
    │  (txn mode) │ │  Sentinel  │ │ OpenSearch │   │  S3 Gateway │
    └──────┬──────┘ │  Primary   │ │  3.x       │   └──────┬──────┘
           │        │  +replicas │ │  Cluster   │          │
    ┌──────▼──────┐ └─────┬──────┘ └─────┬──────┘   ┌──────▼──────┐
    │ PostgreSQL  │       │               │           │  SeaweedFS  │
    │ 17 (Patroni)│ ┌─────▼──────┐ ┌─────▼──────┐   │  Volume     │
    │ Primary     │ │  Caffeine  │ │  Debezium  │   │  Servers    │
    │ +2 replicas │ │  L1 (JVM) │ │  CDC (PG   │   │  (erasure   │
    │ pgBackRest  │ └────────────┘ │  → Kafka)  │   │  coded)     │
    │ PITR backup │               └────────────┘   └────────────┘
    └────────────┘
         │
    ┌────▼────────────────────────────────────────────────────────┐
    │  Extensions: pg_tde (TDE) | pgvector (AI search)           │
    │  pg_audit (HIPAA audit) | PostGIS (geospatial)             │
    │  pg_search/ParadeDB (BM25) | TimescaleDB (time-series)     │
    └─────────────────────────────────────────────────────────────┘
```

---

## Open Questions for User

1. **Maximum SaaS tenant count (5-year horizon):** Schema-per-tenant holds well to ~1,000 tenants. Beyond that, Citus extension for horizontal schema sharding or migration to YugabyteDB should be planned. What is the projected SaaS tenant ceiling?

2. **Multi-tenant key namespacing convention:** Confirm the `{tenant_id}:domain:key` Valkey namespace pattern and whether `tenant_id` is UUID, slug, or numeric. This affects hash-tag cluster routing.

3. **Encryption key management (KMS decision):** All three encryption layers (PostgreSQL pg_tde, Valkey at-rest, SeaweedFS SSE-KMS) need a key management system. Options: HashiCorp Vault (LGPL / BSL — check license for bundling), AWS KMS (violates self-hosted charter as primary), filesystem-backed keystore. A separate ADR for KMS is recommended. What is the preferred approach?

4. **Backup retention policy:** pgBackRest PITR window, Valkey RDB/AOF backup schedule, SeaweedFS versioning retention. Define per regulatory requirement: HIPAA requires 6-year records retention minimum.

5. **Search index design (per-tenant vs shared + DLS):** For OpenSearch: index-per-tenant provides maximum isolation and clean tenant offboarding but multiplies shard count O(tenants × service types). Shared index + DLS is operationally simpler but a misconfigured DLS policy is a data leak. Which isolation model is acceptable for non-PHI generic service indexes?

6. **HealthStack PHI search:** Does clinical document full-text search require a dedicated OpenSearch cluster isolated from generic service search, or can HealthStack use the same OpenSearch cluster with per-tenant PHI indexes? The BAA boundary matters here.

7. **SeaweedFS WORM PoC:** Before using SeaweedFS for HIPAA audit record storage, a PoC validating Object Lock compliance mode behavior (cannot delete before retention expiry, even by admin) is required. Is this PoC in scope for the current sprint or deferred to a hardening phase?

8. **PgBouncer vs PgCat for hybrid multi-tenancy:** PgCat (Rust, newer) offers per-database routing that may be superior for the hybrid schema-per-tenant + shared-schema model. Should PgCat be evaluated as an alternative to PgBouncer before infrastructure provisioning?

9. **Ceph as enterprise-tier option:** Is it in scope to offer Ceph / Rook-Ceph as an optional enterprise deployment tier for customers with Kubernetes + dedicated ops teams, alongside SeaweedFS as the standard tier?

10. **Logical replication slot quota per cluster:** How many Debezium connectors (one per service with outbox tables) will share the same PostgreSQL cluster? Each connector requires one replication slot. PostgreSQL `max_replication_slots` must be set appropriately. Slot lag monitoring and cleanup policy must be defined before production deployment.

11. **Valkey vs Redis 8.0 final call:** If a customer's procurement team raises AGPLv3 concerns about Redis 8.0, Valkey BSD-3-Clause is the immediate fallback. Are there any customer segments where BSD-3-Clause Valkey is also problematic (some academic institutions require specific OSI license classes)?

12. **OpenSearch DLS policy testing:** Define the testing protocol for DLS policies in the shared index model. DLS misconfigurations are silent — a policy that is overly permissive will not produce errors, only incorrect search results with leaked tenant data. Automated red-team tests that verify cross-tenant isolation must be part of the search-service CI.

---

## References

### RDBMS

- [PostgreSQL 17 Release Announcement](https://www.postgresql.org/about/news/postgresql-17-released-2936/)
- [Logical Replication Features in PG-17 — pgedge](https://www.pgedge.com/blog/logical-replication-features-in-pg-17)
- [New Logical Replication Features in PostgreSQL 17 — postgresql.fastware.com](https://www.postgresql.fastware.com/blog/new-logical-replication-features-in-postgresql-17)
- [PostgreSQL CDC Multi-Tenant Setups Done Right — Streamkap](https://streamkap.com/resources/and-guides/postgresql-cdc-multi-tenant)
- [Approaches to Tenancy in Postgres — PlanetScale](https://planetscale.com/blog/approaches-to-tenancy-in-postgres)
- [Benchmarking Multi-Tenant Architectures in PostgreSQL — EDBT 2026](https://openproceedings.org/2026/conf/edbt/paper-172.pdf)
- [PostgreSQL Row-Level Security for Multi-Tenant SaaS — DEV Community](https://dev.to/software_mvp-factory/postgresql-row-level-security-for-multi-tenant-saas-1lgp)
- [Multitenancy with Spring Boot using Postgres Row Level Security — bytefish.de](https://www.bytefish.de/blog/spring_boot_multitenancy_using_rls.html)
- [PgBouncer at Scale: 10K+ Connections Multi-Tenant Postgres — DZone](https://dzone.com/articles/database-connection-pooling-at-scale-pgbouncer-mul)
- [Scaling PostgreSQL for Multi-Tenant SaaS with Citus — Medium](https://medium.com/@parvemayur/scaling-postgresql-for-multi-tenant-saas-a-practical-and-beginner-friendly-guide-using-citus-ec89fbf3c177)
- [PostgreSQL High Availability: Patroni, pgBouncer, pgBackRest — InstaDevOps](https://instadevops.com/blog/postgresql-high-availability-patroni-pgbouncer-guide/)
- [CockroachDB License Changes November 2024 — InfoQ](https://www.infoq.com/news/2024/09/cockroachdb-license-concerns/)
- [CockroachDB Licensing FAQs](https://www.cockroachlabs.com/docs/stable/licensing-faqs)
- [YugabyteDB v2025.2 LTS Release Notes](https://docs.yugabyte.com/stable/releases/ybdb-releases/v2025.2/)
- [YugabyteDB vs CockroachDB Comparison — Yugabyte](https://www.yugabyte.com/yugabytedb-vs-cockroachdb/)

### Cache

- [Redis AGPLv3 Announcement — redis.io](https://redis.io/blog/agplv3/)
- [Redis Returns to Open Source — InfoQ](https://www.infoq.com/news/2025/05/redis-agpl-license/)
- [Redis vs Valkey in 2026 — DEV Community](https://dev.to/synsun/redis-vs-valkey-in-2026-what-the-license-fork-actually-changed-1kni)
- [Valkey 8.1 vs Redis 8.2 Memory Efficiency — Momento](https://www.gomomento.com/blog/valkey-vs-redis-memory-efficiency-at-hyperscale/)
- [Valkey vs Redis 2026 Benchmark — tech-insider.org](https://tech-insider.org/valkey-vs-redis-2026/)
- [Redis 8.0 vs Valkey 8.1 Technical Comparison — DragonflyDB](https://www.dragonflydb.io/blog/redis-8-0-vs-valkey-8-1-a-technical-comparison)
- [Valkey: Drop-in Redis Replacement — blog.elest.io](https://blog.elest.io/valkey-drop-in-redis-replacement-with-better-performance-and-no-licensing-worries/)
- [DragonflyDB License — dragonflydb.io](https://www.dragonflydb.io/docs/about/license)
- [Understanding Redis Licensing (SSPL, AGPLv3) — oneuptime.com](https://oneuptime.com/blog/post/2026-03-31-redis-licensing-sspl-agplv3-explained/view)
- [Redis Licensing Change: AWS Customers — missioncloud.com](https://www.missioncloud.com/blog/redis-licensing-change-what-aws-customers-need-to-know)

### Search

- [OpenSearch vs Elasticsearch Compared 2026 — BigData Boutique](https://bigdataboutique.com/blog/opensearch-vs-elasticsearch-compared)
- [OpenSearch in 2025: Much More Than an Elasticsearch Fork — InfoWorld](https://www.infoworld.com/article/3971473/opensearch-in-2025-much-more-than-an-elasticsearch-fork.html)
- [Elasticsearch vs OpenSearch 2025 Update — BigData Boutique](https://bigdataboutique.com/blog/elasticsearch-vs-opensearch-2025-update-5b5c81)
- [Multitenancy and Tenant Tokens — Meilisearch Documentation](https://www.meilisearch.com/docs/learn/security/multitenancy_tenant_tokens)
- [Hybrid Search in PostgreSQL: The Missing Manual — ParadeDB](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
- [BM25 Search in PostgreSQL — pedroalonso.net](https://www.pedroalonso.net/blog/postgres-bm25-search/)
- [OpenSearch Multi-Tenancy for All Workloads — OpenSearchCon 2024](https://opensearch.org/events/opensearchcon/sessions/multi-tenancy-for-all-workloads.html)
- [Multi-Tenant Healthcare System with OpenSearch — AWS Blog](https://aws.amazon.com/blogs/big-data/build-a-multi-tenant-healthcare-system-with-amazon-opensearch-service/)
- [Typesense Cloud Security — typesense.org](https://cloud.typesense.org/security)

### Object Store

- [MinIO Faces Fallout for Stripping Functions from Open Source — Futuriom](https://www.futuriom.com/articles/news/minio-faces-fallout-for-stripping-features-from-web-gui/2025/06)
- [Is It Still Open Source? MinIO Steering Users Toward Paid Subscriptions — Linuxiac](https://linuxiac.com/minio-steering-users-toward-paid-subscriptions/)
- [Self-Hosted S3 Storage in 2026: RustFS, SeaweedFS, Garage, or Ceph? — Rilavek](https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026)
- [MinIO vs Ceph vs SeaweedFS vs Garage in 2025 — onidel.com](https://onidel.com/blog/minio-ceph-seaweedfs-garage-2025)
- [MinIO Exit Plan: Moving to Ceph — kubedo.com](https://kubedo.com/minio-exit-plan-ceph-s3-storage/)
- [MinIO Alternatives: SeaweedFS, Garage, RustFS, Ceph — DEV Community](https://dev.to/arash_ezazy_f69fb13acdd37/minio-alternatives-open-source-on-prem-real-world-credible-seaweedfs-garage-rustfs-and-ceph-36om)
- [Benchmarking Self-Hosted S3-Compatible Storage — repoflow.io](https://www.repoflow.io/blog/benchmarking-self-hosted-s3-compatible-storage-a-practical-performance-comparison)
- [Garage Object Storage — deuxfleurs.fr](https://garagehq.deuxfleurs.fr/)

### Cross-Layer

- [Debezium Outbox Pattern: Reliable Event Streaming — RisingWave](https://risingwave.com/blog/debezium-outbox-pattern-microservices/)
- [Outbox Pattern with CDC and Debezium — thorben-janssen.com](https://thorben-janssen.com/outbox-pattern-with-cdc-and-debezium/)
- [Schema-Based Multi-Tenancy with Spring Data, Hibernate, Flyway — sultanov.dev](https://sultanov.dev/blog/schema-based-multi-tenancy-with-spring-data/)
- [Multitenancy With Spring Data JPA — Baeldung](https://www.baeldung.com/multitenancy-with-spring-data-jpa)
