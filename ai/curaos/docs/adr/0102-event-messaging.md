# ADR-0102: Event / Messaging Layer (Stream + Queue + Outbox)

> **🔄 RESOLUTION-PIN (M9-S7 #104, 2026-06-01):** the broker actually shipped in
> the air-gap bundle is **Redpanda v24.3.1** (`curaos/ops/zarf/zarf.yaml`
> `redpanda` component, chart 5.9.0), Kafka-API-compatible — NOT a Strimzi-managed
> Apache Kafka cluster. The "Kafka 4.x = v1; Redpanda → DEFERRED-V2" wording below
> is reconciled with that reality: **Redpanda v24.3.1 = the deployed v1 broker**;
> Apache Kafka 4.x is the portable upstream the wire contract stays compatible
> with (a future swap needs no consumer change). The Strimzi operator is present
> for Kafka **Connect-ONLY** (Debezium WAL CDC → Redpanda via
> `KafkaConnect.spec.bootstrapServers`), not as a broker. Authoritative record:
> [AUTO-DECISION-LOG.md](AUTO-DECISION-LOG.md) §"2026-06-01 — M9-S7 #104" +
> [RESOLUTION-MAP.md](RESOLUTION-MAP.md) ADR-0102 row.

> **✅ ACCEPTED w/ DA13 AMENDMENT** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: swap Jobrunr → `@nestjs/schedule` + BullMQ + Temporal cron (per ADR-0122); Spring Cloud Stream → `@nestjs/microservices` (Kafka + NATS transports built-in). Kafka 4 / NATS JetStream / Debezium / Apicurio stand. **DA13 amendments (2026-05-25):**
> - **Kafka topology: key-by-tenant from day 1** per DA13 Q5 — tenant UUID as partition key on shared topics (e.g., `curaos.audit.events`). Scales to 10K+ tenants per cluster w/o partition explosion. Per-tenant consumer filtering via Kafka Streams or app-layer filter. Matches ADR-0200 cluster convention.
> - **Deployment: single SKU + feature flags** per DA13 Q9 — one codebase; deployment-profile flag (cloud/on-prem/hybrid/air-gap) drives broker topology (Kafka SaaS / NATS SMB) via Helm values + Unleash feature flags per ADR-0110. Matches injection-molding metaphor per ADR-0099.
>
> **Other Open Questions resolution:** Pulsar multi-tenancy → **RESOLVED-ADR** (no; Kafka chosen). Avro vs Protobuf → **RESOLVED-ADR** (Apicurio supports both; per-service choice). HIPAA 6y retention → **RESOLVED-ADR** (Kafka tiered storage → SeaweedFS S3 sink per [[curaos-postgres-rule]]). Job vol >10K/s + BPM queue redundancy → **RESOLVED-ADR** (BullMQ + Temporal). Redpanda BSL → **DEFERRED-V2**. Local + 3rd-party rule applies (Confluent Cloud / AWS MSK as 3rd-party). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).


## Status

Proposed. Date: 2026-05-24.

---

## Context

CuraOS is a composable platform spanning 91 backend microservices across neutral-core and vertical-overlay domains. ADR-0100 committed to Kotlin + Spring Boot 3.4 on JVM 21. ADR-0101 committed to PostgreSQL 17 as the primary transactional store, Valkey 8.x as the distributed cache, SeaweedFS as object storage, and ParadeDB + OpenSearch for search indexing.

The workspace charter (AGENTS.md §3) declares event-led architecture a first-class value: "Durable messaging primary; direct sync APIs secondary. Versioned contracts. Traceable schemas." This ADR defines the concrete infrastructure that makes that charter operative.

### Why event-led for 91 services

With 91 services spanning neutral-core (Identity, Tenancy, Org, Party, Audit, Notify, Storage, Calendar, Commerce, HR, CRM, etc.) and HealthStack / EducationStack / ERP overlays, synchronous fan-out is a reliability anti-pattern: the slowest consumer sets the latency ceiling and cascading timeouts propagate failures across domains. Durable messaging decouples producers from consumers in space (address), time (availability), and rate. Events become the shared lingua franca that:

- **Drives cross-service eventual consistency.** OrderPlaced → InventoryReserved → InvoiceCreated → NotifySent each flow via topic, not HTTP chain.
- **Backs saga orchestration.** BPM engine listens for domain events; compensation events roll back sagas without two-phase commit.
- **Feeds CDC-to-search-index.** PostgreSQL row changes stream via CDC into OpenSearch / ParadeDB keeping full-text search indexes fresh without dual-write.
- **Provides tamper-evident audit trail.** Every PHI write in HealthStack produces an immutable audit event with hash-chaining; the event log is the audit log. HIPAA §164.312(b) requires audit controls; a durable event stream fulfills that requirement when events are signed and append-only.
- **Enables replay.** Event sourcing patterns and backfill jobs (re-index after schema migration, re-populate a downstream store) require seeking back in time and re-consuming events from an arbitrary offset.
- **Supports multi-tenant isolation.** Per-tenant topic namespacing or key-by-tenant routing ensures one tenant's write storm does not starve another's consumption.

### Deployment profiles that must remain viable

| Profile | Typical scale | Constraint |
|---|---|---|
| Cloud SaaS | Hundreds of tenants, thousands of events/s | Horizontal scale; Kafka/Redpanda cluster natural |
| On-prem enterprise | 10-50 tenants, 50-500 events/s | Single-server or 3-node cluster; footprint matters |
| SMB on-prem / home lab | 1-5 tenants, <50 events/s | Single binary; Kafka JVM heap unacceptable |
| Air-gap | Any of above; no internet | Zero SaaS dependencies; all images must ship |

This constraint drives a key tension: Kafka/Redpanda fit the SaaS profile well but are heavy for SMB on-prem. The messaging layer must either support two profiles with different backing systems, or select a broker that spans both.

---

## Forces / Requirements

| # | Requirement | Weight |
|---|---|---|
| F1 | At-least-once delivery; exactly-once where ordering mandated (financial, clinical) | Critical |
| F2 | Versioned schemas (Avro / Protobuf / JSON Schema) + schema registry | Critical |
| F3 | Multi-tenant topic/subject isolation; single tenant cannot starve others | Critical |
| F4 | Air-gap: zero SaaS/cloud-only dependencies in control path | Critical |
| F5 | HIPAA: PHI event payloads encrypted in transit and at rest; topic-level ACL isolation | Critical |
| F6 | Outbox pattern: event emission atomic with DB write; no dual-write | Critical |
| F7 | CDC from PostgreSQL 17 → topic (Debezium or equivalent) | Critical |
| F8 | Replay / seek to arbitrary offset (event sourcing, backfill) | High |
| F9 | Spring Boot 3.4 / Kotlin: mature client, idiomatic, observable | High |
| F10 | OpenTelemetry: distributed traces across producer → broker → consumer | High |
| F11 | Container footprint: single-broker mode viable on 4 vCPU / 8 GB | High |
| F12 | DLQ: native or easily composable; dead-letter routing with reason metadata | High |
| F13 | Multi-tenant partition strategy: scalable past hundreds of tenants | High |
| F14 | License: Apache 2.0 or OSI-approved; no license restrictions on self-hosted SaaS distribution | High |
| F15 | Quorum-based HA without external coordination service (no ZooKeeper dependency) | Medium |
| F16 | Hiring pool / ecosystem maturity; not a niche ecosystem | Medium |

---

## Decision Drivers (weighted)

| Driver | Weight | Notes |
|---|---|---|
| License fitness (SaaS + on-prem distrib.) | 5 | BSL, SSPL, or proprietary = disqualifying for SaaS distribution |
| Throughput at SMB scale (50-500 msg/s) | 4 | Even lightweight broker must handle burst |
| Spring Boot 3.x starter / Kotlin client maturity | 4 | ADR-0100 committed stack; friction = defects |
| Single-broker / small-footprint mode | 4 | SMB on-prem can't run 3-broker JVM cluster |
| Multi-tenant isolation patterns | 4 | 91 services × N tenants = partition explosion risk |
| Ops complexity (day-2) | 3 | Rolling upgrades, config hot-reload, backup/restore |
| HIPAA-ready: ACLs + encryption | 3 | Encryption at rest, mTLS, fine-grained ACLs |
| OpenTelemetry instrumentation | 3 | OTEL spans across broker boundary |
| Replay / offset management | 3 | Event sourcing + search backfill require it |
| Schema registry (versioned, self-hosted) | 3 | Avro or Protobuf + registry = broken API detection |
| Exactly-once semantics maturity | 2 | EOS needed for financial/clinical; hard to implement |
| Throughput ceiling (SaaS high-scale) | 2 | 50K-500K msg/s satisfies CuraOS SaaS tier |
| Ecosystem / hiring pool | 2 | Kafka > Pulsar > NATS > Redpanda |
| CDC sink compatibility | 2 | Debezium supports Kafka, Redpanda, NATS, RabbitMQ sinks |

---

## Sub-decision 1: Event Streaming Backbone

The streaming backbone is the durable log that every domain event, CDC event, audit event, and saga message flows through. It is the highest-leverage infrastructure choice in this ADR.

### Options

#### Option A: Apache Kafka 4.x (KRaft mode, no ZooKeeper) — current commitment baseline

**License:** Apache 2.0.

**Current state (2026):** Kafka 4.0 (March 2025) removed ZooKeeper entirely; KRaft is the only supported metadata mode. Kafka 4.2 is current stable as of March 2026. Spring for Apache Kafka 4.0 (aligned with Spring Boot 3.4) tracks Kafka 4.x. Kafka 3.7 — the previous "current commitment" — is approaching end-of-life; new deployments should target 4.x.

**Security note:** CVE-2024-56128 (SCRAM auth nonce bypass, low severity, only over plaintext), CVE-2025-27819 (JMX RCE if JMX port exposed without auth — always disable public JMX in production), CVE-2025-27817 (SASL OAUTHBEARER SSRF via config injection). All are mitigatable with standard hardening: TLS-only listeners, JMX disabled or firewalled, and upgrading kafka-clients >= 3.8.0. Not disqualifying but require operational checklist.

**Strengths:**
1. Largest ecosystem: Kafka Connect connectors (thousands), Kafka Streams, ksqlDB, all CDC tools (Debezium, Flink CDC, Spark).
2. Spring Cloud Stream Kafka binder + Spring Kafka are first-class, actively maintained, and deeply integrated with Spring Boot 3.x autoconfigure.
3. Exactly-once semantics (EOS) via idempotent producers + transactional API — most mature EOS of any open-source broker.
4. ACL system (topic-level, per-principal) maps directly to HIPAA topic isolation requirements.
5. KRaft (no ZooKeeper) reduces cluster to brokers-only; HA quorum via Raft built-in.
6. Deep OpenTelemetry support via OpenTelemetry Kafka instrumentation and Spring Micrometer Kafka metrics.
7. Replay: offset commit / seek-to-beginning / timestamp seek fully supported via consumer API.
8. Massive hiring pool; Kafka expertise widely available.
9. Schema registry ecosystem: Confluent Schema Registry (commercial), Apicurio Registry (Apache 2.0), Karapace (MIT).

**Weaknesses:**
1. JVM-based broker: minimum practical single-broker heap 2-4 GB; single-node "laptop" profile is painful.
2. KRaft requires minimum 3 controllers for HA quorum; single-controller mode is possible but not recommended for production.
3. Configuration surface is large; new operators routinely misconfigure log retention, partition counts, or replication.
4. Partition limits: Confluent recommends max 2,000-4,000 partitions per broker, total cluster partition count in low tens of thousands. Topic-per-tenant for 1,000 tenants × 10 topic types = 10,000 topics → approaches limits on small clusters.
5. Consumer group rebalance (classic protocol) is slow and causes stop-the-world pauses; KIP-848 new rebalance protocol is GA in 4.0 but adoption requires updated clients.
6. CVE surface: JVM dependency means inherited Java ecosystem CVEs; JMX must be hardened.

**Self-hosted SaaS distribution:** Apache 2.0 — no restrictions. Fully viable.

**SMB on-prem footprint:** 3-node cluster minimum for HA: ~12 GB RAM + 3 JVMs. Single-node mode possible (replication.factor=1) but no HA. Heavy for SMB appliance.

**Multi-tenant fit:** Topic-per-tenant viable up to ~hundreds of tenants on a medium cluster; key-by-tenant scales further. Gong's engineering blog explicitly rejected topic-per-tenant at scale due to partition explosion and administrative overhead; they repartition by tenant key with batch balancing.

**HIPAA fit:** TLS in transit (configurable per listener), disk encryption at rest (OS-level; Kafka does not encrypt payload natively — use field-level encryption in application for PHI payload). ACLs per topic per principal. Audit log via Kafka's own request logs + JMX metrics.

---

#### Option B: Redpanda (Kafka API-compatible, C++ single binary)

**License (critical — must evaluate carefully):** Redpanda uses a dual-license model:
- **Community Edition (BSL 1.1):** Source-available. Key restriction: "You may not use the Licensed Work for a Streaming or Queuing Service," defined as "a commercial offering that allows third parties to access the functionality of the Licensed Work by creating a topic in it." BSL converts to Apache 2.0 four years after each code merge.
- **Enterprise Edition:** Redpanda Community License (RCL) — proprietary for enterprise features.

**License impact for CuraOS:** If CuraOS SaaS offering allows tenants to create topics (e.g., via multi-tenant topic isolation where each tenant has named topics), Redpanda's legal team may interpret this as violating the BSL "Streaming or Queuing Service" clause. This is a material legal risk. On-prem distribution (customer runs Redpanda on their own infra, no third-party "service" exposure) is safer but still requires legal review. **Do not adopt Redpanda Community without legal sign-off on BSL terms relative to multi-tenant SaaS model.**

**Strengths:**
1. C++ single binary, thread-per-core architecture (Seastar framework); no JVM, no GC pauses.
2. Footprint: ~256 MB RAM for a development node; production single-broker feasible on 2 GB.
3. Kafka protocol 100% compatible: Spring Cloud Stream Kafka binder, Spring Kafka, Debezium — all work without code changes (Kafka Streams has partial compatibility caveats).
4. Tiered storage built-in with S3-compatible backend — SeaweedFS (from ADR-0101) is S3-compatible, enabling cheap long-term retention at object-store cost.
5. 10x lower p99 latency vs Kafka at equivalent load (sub-millisecond p99 at moderate throughput; Redpanda's own benchmarks, partially confirmed by independent comparisons).
6. Single-broker mode viable for SMB: runs on 2-4 vCPU / 2-4 GB RAM.
7. Built-in Schema Registry and Kafka Connect compatibility.
8. No external coordination service; Raft-based metadata built-in (predating Kafka's KRaft by years).
9. OpenTelemetry metrics exportable; Prometheus endpoint built-in.

**Weaknesses:**
1. **BSL license risk for multi-tenant SaaS distribution** — see above. Material blocker without legal clearance.
2. Kafka Streams not fully supported (Redpanda has stated Kafka Streams is not a target; use NATS or Flink if stream processing needed).
3. Schema registry is built-in (Pandaproxy) but less mature than Confluent/Apicurio for complex governance workflows.
4. Smaller hiring pool than Kafka; C++ internals means contributing to or debugging the broker requires C++ expertise.
5. Tiered storage with SeaweedFS requires validation; Redpanda officially supports AWS S3, GCS, Azure; community-tested with MinIO / SeaweedFS but not Redpanda-supported.
6. Enterprise features (RBAC, audit log API, TLS client cert rotation) require RCL license.

**Self-hosted SaaS distribution:** BSL — legally uncertain for multi-tenant SaaS. **Provisionally disqualified pending legal review.**

**SMB on-prem footprint:** Excellent. Single binary, 2 GB RAM single-node. Best-in-class for SMB profile.

**HIPAA fit:** TLS in transit, disk encryption OS-level. RBAC gating and audit log API are Enterprise features (RCL).

---

#### Option C: Apache Pulsar 3.x / 4.x

**License:** Apache 2.0.

**Current state:** Pulsar 4.0 LTS released 2025; Pulsar 4.1.0 current. StreamNative is the primary commercial backer. Active Apache PMC.

**Strengths:**
1. Multi-tenancy is first-class: namespaces and tenants are top-level concepts (`persistent://tenant/namespace/topic`). Per-tenant isolation is architectural, not bolted on.
2. Geo-replication built-in; useful for multi-region SaaS deployments.
3. Tiered storage (offload to S3-compat) built-in; integrates with SeaweedFS (S3 compatible).
4. Pulsar Functions: lightweight serverless compute on broker nodes for simple stream transforms.
5. Schema registry built-in (per-namespace, versioned, Avro/Protobuf/JSON Schema).
6. JVM-based broker: Spring Boot / Kotlin Pulsar client (`pulsar-client-reactive`) available; Spring for Apache Pulsar (spring-pulsar) added to Spring portfolio in 2023.
7. Apache 2.0: no SaaS distribution restrictions.
8. Persistent messaging with BookKeeper: write-ahead log architecture separates storage (BookKeeper) from serving (broker), enabling independent scaling.

**Weaknesses:**
1. **Highest operational complexity of all options.** Pulsar cluster = Pulsar brokers + Apache BookKeeper cluster + ZooKeeper (or etcd in newer versions) — three separate subsystems to operate. For air-gap SMB on-prem, this is a significant burden.
2. JVM-based; footprint similar to Kafka but amplified because BookKeeper is also JVM.
3. Spring for Apache Pulsar is newer and less battle-tested than Spring Kafka; community is smaller.
4. `spring-pulsar` starter is not yet in the same maturity tier as Spring Cloud Stream Kafka binder for production patterns (DLQ, error handling, exactly-once).
5. Exactly-once semantics less mature than Kafka; transactions supported but fewer production war stories.
6. Pulsar standalone mode (single JVM for all roles) exists for development but is not production-suitable for HA.
7. Kafka ecosystem tools (ksqlDB, many Kafka Connect connectors) don't work with Pulsar without adapters.
8. Hiring: Pulsar expertise significantly rarer than Kafka in the job market.

**Self-hosted SaaS distribution:** Apache 2.0 — no restrictions.

**SMB on-prem footprint:** Heavy. BookKeeper + ZooKeeper + Brokers = 3-5 JVM processes, 8-16 GB RAM minimum for HA. **Disqualified for SMB on-prem profile without standalone-mode trade-off.**

**Multi-tenant fit:** Best-in-class architecture. Tenant-namespace-topic hierarchy natively.

**HIPAA fit:** TLS in transit; BookKeeper encrypts data at rest (AES-256 configurable). Per-namespace ACLs, token-based auth (JWT, mTLS). Audit events via broker log.

---

#### Option D: NATS JetStream

**License:** Apache 2.0.

**Backer:** Synadia (NATS maintainer). CNCF incubating project.

**Current state (2026):** NATS 2.10+ with JetStream is production-stable. Synadia Cloud is the managed offering. NATS Server is a single Go binary.

**Strengths:**
1. **Smallest footprint** of all options: NATS Server binary ~25-30 MB; production single-node starts at 256 MB RAM.
2. JetStream adds durable persistence, streams, consumer groups, key-value store, object store — all in the same binary. No external dependencies.
3. Multi-tenancy via Accounts: NATS 2.0 Accounts are cryptographically isolated communication contexts; JetStream domains are account-scoped. First-class isolation without topic naming conventions.
4. Apache 2.0 license. No SaaS distribution restriction.
5. Benchmark (2025, 4 vCPU / 8 GB NVMe): 200,000-400,000 persistent msg/s; sub-millisecond p50/p99 latency with JetStream on NVMe. Exceeds CuraOS SaaS throughput requirements.
6. JetStream "WorkQueue" stream consumer semantics: exactly-once processing per message per consumer group — avoids separate work-queue infrastructure.
7. NATS by Example shows Debezium Server with NATS JetStream sink fully supported and documented for PostgreSQL CDC.
8. Air-gap: single binary, no external coordination service, embedded Raft-based clustering (`nats-server --cluster`).
9. Leaf Nodes: edge/branch-office nodes that forward to a hub cluster — useful for multi-region or on-prem → cloud bridge.
10. OpenTelemetry: NATS Server 2.11+ exposes OTEL metrics; client libraries provide trace context propagation.

**Weaknesses:**
1. **No Spring Cloud Stream NATS binder in the official Spring portfolio.** Spring Kafka binder is mature; NATS requires either community binder or direct `nats.java` client integration with `@NatsMessageHandler` patterns.
2. Kafka protocol not supported: cannot reuse Kafka Connect connectors. Debezium Server with NATS JetStream sink is the CDC path.
3. Schema registry: NATS has no built-in schema registry. Must deploy Apicurio Registry separately (Apicurio supports NATS as a storage backend in newer versions, or use PostgreSQL-backed Apicurio).
4. Kafka Streams, ksqlDB, and Kafka ecosystem tooling do not apply. Stream processing via Benthos/Redpanda Connect or custom JVM code.
5. Replay semantics differ from Kafka: JetStream Streams retain messages by policy (time or count); direct offset seek is supported but API differs from Kafka consumer API — application code must be written for NATS.
6. Smaller ecosystem and hiring pool vs Kafka.
7. EOS (exactly-once delivery) via JetStream is emerging; idempotent publish via message deduplication window (configurable TTL), but full two-phase transactional EOS is not as mature as Kafka.
8. Large-scale Kafka-style topic fan-out (millions of partitions equivalent) not the design target; Kafka is more suitable for very high throughput data pipelines at extreme scale.

**Self-hosted SaaS distribution:** Apache 2.0 — no restrictions. Fully viable.

**SMB on-prem footprint:** Best-in-class. 3-node NATS cluster on 3 × 1 GB RAM VMs. Single-node dev mode on <512 MB.

**Multi-tenant fit:** Accounts provide cryptographic isolation. Cross-account data sharing via import/export. Scales to thousands of accounts without partition explosion because NATS subjects are not partitioned the way Kafka topics are.

**HIPAA fit:** TLS in transit (configurable per port). JetStream file-based storage with OS-level encryption (NATS does not encrypt on-disk natively; use encrypted filesystem or volume). JWT-based auth with account-scoped permissions. Audit logging via server log + monitoring endpoint. PHI isolation via account boundaries.

---

#### Option E: Valkey Streams (from ADR-0101 Valkey 8.x)

**License:** BSD 3-Clause.

**Rationale:** Since Valkey 8.x is already committed in ADR-0101, Valkey Streams add zero net infrastructure for the messaging layer. XADD/XREAD semantics, consumer groups with ACK, pending entry list (PEL) for at-least-once.

**Strengths:**
1. Zero additional infrastructure: reuses Valkey cluster from ADR-0101.
2. Sub-millisecond latency (Valkey 8.1: ~0.8 ms p99 at 999K ops/s on 8 vCPU).
3. Consumer groups with ACK semantics support at-least-once delivery.
4. Simple API; Spring Data Redis (works with Valkey) has `ReactiveRedisTemplate` and `StreamOperations`.
5. Acceptable for lightweight event buses between services within a single bounded context.
6. MAXLEN cap on streams provides bounded memory use; XAUTOCLAIM for reclaiming stuck messages.

**Weaknesses:**
1. **No native replay / seek by offset or timestamp.** XRANGE by ID (which encodes timestamp) is available, but there is no consumer group "seek to beginning" equivalent.
2. **No schema registry integration.** Payload is raw bytes or string.
3. **No partitioned log.** A single stream is a single writer-serialized log; no parallel partitions. Throughput ceiling ~50K-100K msg/s per stream.
4. **No CDC sink.** Debezium does not produce to Redis/Valkey Streams natively (Kafka output only in standard Debezium; Debezium Server supports HTTP/NATS/Kinesis but not Redis Streams).
5. Memory-bound: large retention requires large RAM or OBJECT ENCODING changes; not a log store.
6. Single point of failure if Valkey node fails; Valkey cluster mode partitions streams across nodes but multi-key transactions don't span slots.
7. No built-in DLQ; must implement manually.
8. Not suitable as primary event backbone for 91 services at SaaS scale.

**Verdict:** Suitable only as a lightweight supplementary bus for intra-service or low-volume inter-service events within a single deployment cell. **Not recommended as the primary streaming backbone.**

---

#### Option F: RabbitMQ 4.x (Quorum Queues + Streams)

**License:** Mozilla Public License 2.0 (MPL-2.0).

**Current state:** RabbitMQ 4.0 (2024) promoted Quorum Queues (Raft-based) as the production default; Classic Mirrored Queues removed. RabbitMQ Streams (log-semantics, replay) GA since 3.9. RabbitMQ 4.3 (April 2026) adds 32 strict priority levels and delayed retry on Quorum Queues.

**Strengths:**
1. AMQP 0.9.1 + AMQP 1.0 (native since 4.0) + MQTT + STOMP: widest protocol coverage of any broker.
2. Quorum Queues provide strong HA via Raft without external coordination.
3. Streams add Kafka-like log replay semantics with offset seek.
4. Spring AMQP and Spring Cloud Stream RabbitMQ binder are mature and widely used.
5. MPL-2.0: self-hosted SaaS distribution is permitted.
6. Shovel + Federation plugins for cross-datacenter bridging.
7. Management UI built-in; intuitive for ops teams familiar with traditional messaging.
8. HIPAA: TLS in transit; disk persistence on Quorum Queues / Streams; client certificate auth.

**Weaknesses:**
1. **Erlang runtime:** broker requires Erlang/OTP; adds an unfamiliar runtime for Java-centric teams. Debugging or tuning requires Erlang knowledge.
2. **Streams are add-on, not the primary abstraction.** RabbitMQ was designed around queues; streams are bolted on. Kafka/Redpanda/NATS are designed log-first.
3. No built-in schema registry; must integrate Apicurio or Confluent externally.
4. Multi-tenancy: virtual hosts (vhosts) provide isolation but are coarse-grained; per-topic ACLs require careful vhost design.
5. Debezium's RabbitMQ sink in Debezium Server requires extra configuration; Kafka Connect (Kafka target) is the primary Debezium path.
6. Memory pressure: RabbitMQ can page messages to disk but RAM usage spikes under large queues.
7. Throughput ceiling lower than Kafka/Redpanda/NATS: 50K-100K msg/s typical on durable Quorum Queues.
8. Streams partition model (super-streams / partitioned streams) less mature than Kafka.
9. Smaller Spring/JVM community momentum than Kafka for new greenfield projects.

**Self-hosted SaaS distribution:** MPL-2.0 — permitted.

**SMB on-prem footprint:** Moderate. Single-node RabbitMQ: 512 MB RAM minimum; 1-2 GB practical. Erlang runtime adds ~100-200 MB. Better than Kafka, worse than NATS.

---

#### Option G: Memphis.dev (now Memphis by Superstream / NATS-based)

**License:** Apache 2.0 (core); some features proprietary.

**Current state (2026):** Memphis v1.x rebranded under Superstream. NATS JetStream under the hood with a developer-experience layer. Still early-stage for production enterprise deployments.

**Weaknesses:**
1. Layer on top of NATS; if adopting NATS anyway, Memphis adds abstraction without guarantee of maintenance continuity.
2. Production maturity at enterprise scale unproven.
3. Schema registry, DLQ, and observability tooling still maturing.

**Verdict:** Interesting for developer experience but not recommended as primary backbone for a 91-service platform. Monitoring closely; revisit if NATS is selected and Memphis matures.

---

#### Option H (managed comparison, excluded): Confluent Cloud / AWS MSK / Aiven for Kafka

Violates F4 (air-gap: zero managed-cloud dependencies). Listed for completeness only. All are viable for cloud SaaS deployments that accept vendor dependency; none are acceptable for CuraOS's self-hosted and air-gap profiles.

---

### Streaming Comparison Matrix

| Criterion | Kafka 4.x | Redpanda | Pulsar 4.x | NATS JetStream | Valkey Streams | RabbitMQ 4.x |
|---|---|---|---|---|---|---|
| License | Apache 2.0 | BSL ⚠️ | Apache 2.0 | Apache 2.0 | BSD 3-Clause | MPL-2.0 |
| SaaS distrib. safe | Yes | Risky (legal) | Yes | Yes | Yes | Yes |
| Spring Boot starter | Excellent | Via Kafka binder | Good (spring-pulsar) | Community only | Via Spring Data | Good (spring-amqp) |
| Kotlin client | kotlin-coroutines-kafka | Same as Kafka | pulsar-client-kotlin | nats.java + coroutines | spring-data-redis | spring-amqp |
| EOS maturity | High | Moderate | Moderate | Emerging | None | Low |
| Replay / seek | Full | Full | Full | Full (policy-based) | Partial (XRANGE) | Partial (Streams) |
| Schema registry | Apicurio / Confluent | Built-in + Apicurio | Built-in | Apicurio (external) | None | External only |
| Multi-tenant | Topic prefix + ACLs | Same as Kafka | Native (tenant/ns/topic) | Accounts (cryptographic) | None | vhosts (coarse) |
| CDC (Debezium) | Primary target | Kafka-compat | Via adapter | Debezium Server sink | Not supported | Debezium Server sink |
| Single-node footprint | 2-4 GB JVM | ~256 MB | 4-8 GB (BookKeeper+) | ~256-512 MB | Part of Valkey | ~512 MB + Erlang |
| HA without ZooKeeper | Yes (KRaft) | Yes (Raft built-in) | BookKeeper+ZK (legacy) / etcd | Yes (embedded Raft) | Yes (cluster mode) | Yes (Quorum Queues) |
| OTel support | Good | Good (Prometheus) | Moderate | Good (2.11+) | Via Spring Micrometer | Moderate |
| Air-gap viable | Yes | Yes | Yes | Yes | Yes | Yes |
| Hiring pool | Largest | Small | Small | Small-medium | N/A | Medium |
| Throughput ceiling | 500K-1M msg/s | 500K-1M msg/s | 200K-500K msg/s | 200K-400K msg/s | 50K-100K/stream | 50K-100K msg/s |
| CVE surface (2024-25) | Several (mitigable) | Few | Few | Few | Few | Few |

---

### Multi-Tenant Strategy Deep Dive

This decision materially affects partition count, Debezium slot count, and schema naming — worth treating separately.

**Topic-per-tenant:**
- Kafka: 100 tenants × 20 topics/tenant = 2,000 topics. At 10 partitions each = 20,000 partitions. Confluent guidance: max 4,000 partitions/broker → needs 5+ brokers for HA. Partition count grows linearly with tenant count; untenable at 1,000 tenants.
- Each tenant topic needs its own consumer group membership, ACL entry, and schema registry subject namespace.
- **Verdict:** Viable up to ~50-100 tenants on a medium Kafka cluster. Hard ceiling beyond that.

**Key-by-tenant-id (shared topics):**
- All tenants share topics; tenant ID is the message key (or in the payload header).
- Partition count stays fixed; tenant isolation is logical, not physical.
- Gong engineering (reference in research): explicitly chose this model at scale because topic-per-tenant "was too costly in terms of scale, coding, deployment, administration, and cost-efficiency." Their solution: repartition by tenant key with batch-balanced consumers.
- **Weakness:** Fairness problem — high-volume tenant can monopolize partitions. Requires weighted rate limiting or repartitioning layer.
- **Verdict:** Recommended for SaaS profile beyond 50 tenants. Requires tenant-ID in headers, consumer-side filtering, and rate limiter in the publish path.

**NATS Account-per-tenant:**
- NATS 2.0 Accounts are cryptographically isolated; JetStream streams are account-scoped. Each tenant account has its own streams, consumers, and subject namespace.
- Scales to thousands of accounts without partition explosion.
- Management via NATS operators + JWT credentials, or via Synadia Control Plane.
- **Verdict:** Best multi-tenant story of all options for the SMB → SaaS range. Accounts do not hit a partition ceiling.

**Recommendation:** Use key-by-tenant-id with tenant-id in the Kafka record header for SaaS/Kafka profile; use NATS Accounts for per-tenant cryptographic isolation on the NATS profile.

---

### Streaming Recommendation

**Split by deployment profile:**

**SaaS / enterprise (≥50 tenants, >500 msg/s, 3+ nodes):**

Recommend **Apache Kafka 4.x** (KRaft, no ZooKeeper).

Rationale:
- Apache 2.0, no SaaS distribution risk.
- Spring Cloud Stream Kafka binder is the most mature JVM event streaming integration available.
- CVEs in 2024-2025 are mitigable with standard hardening (TLS-only, disable public JMX, upgrade clients ≥3.8).
- Kafka 4.0's new consumer group rebalance protocol (KIP-848) fixes the stop-the-world rebalance pain.
- Exactly-once semantics most mature of all options — required for financial and clinical event chains.
- Massive hiring pool; long-term sustainability.
- Reject Redpanda for primary SaaS deployment until BSL legal risk is resolved. If legal clears Redpanda, revisit: its lower latency and footprint are material advantages.

**SMB on-prem / air-gap / home lab (1-50 tenants, <500 msg/s, 1-3 nodes):**

Recommend **NATS JetStream**.

Rationale:
- Single ~30 MB binary; 3-node cluster fits on 3 × 1 GB VMs.
- Apache 2.0; zero SaaS distribution risk.
- JetStream Accounts provide cryptographic tenant isolation without partition explosion.
- Debezium Server NATS JetStream sink is documented and production-tested.
- Throughput ceiling (200K-400K msg/s) far exceeds SMB requirements.
- Air-gap: ship one binary, no external coordination service.
- Trade-off accepted: no Spring Cloud Stream official binder; requires `nats.java` client integration with Spring Boot manual configuration. This is manageable via an internal `nats-spring-boot-starter` module.
- Trade-off accepted: schema registry requires separate Apicurio Registry (which already uses PostgreSQL — aligns with ADR-0101).

**Bridge pattern:** Services can be written to a shared messaging interface (`EventPublisher`, `EventConsumer`) backed by either Kafka or NATS depending on deployment profile. The abstraction layer is thin (topic name, payload, headers) and swappable via Spring configuration. This is the preferred architecture for CuraOS's multi-profile requirement.

---

### Open Questions (Streaming)

1. Has legal reviewed Redpanda BSL "Streaming or Queuing Service" clause against CuraOS multi-tenant SaaS model? If cleared, revisit Redpanda for SaaS profile.
2. What is the maximum tenant count per SaaS deployment in the 3-year roadmap? Answer determines whether topic-per-tenant remains viable or key-by-tenant is mandatory from day 1.
3. Is Pulsar's multi-tenancy native architecture worth its operational overhead for SaaS? (Recommendation: no, given Pulsar's BookKeeper + ZooKeeper complexity vs Kafka + Apicurio.)
4. Schema format choice: Avro vs Protobuf? Avro requires schema registry for deserialization; Protobuf schemas are self-describing. Protobuf preferred for air-gap if registry connectivity is unreliable.
5. What is the event retention policy? HIPAA audit events require 6-year retention (45 CFR §164.316(b)(2)(i)); long-term retention on Kafka requires either large disks or tiered storage (S3/SeaweedFS). Tiered storage available on Redpanda (BSL) and Kafka 4.x (Apache 2.0 via Connect to SeaweedFS S3 sink). SeaweedFS S3-compat + Kafka tiered storage = viable air-gap long-retention.
6. Maximum message size? Kafka default 1MB per message; HealthStack clinical documents (CDA, FHIR Bundle) may exceed this. Configure `max.message.bytes` or use reference-by-ID pattern (event carries ID + metadata; full payload in SeaweedFS).
7. Will HealthStack PHI events require field-level encryption within the payload (beyond TLS + disk encryption)? If yes, this requires application-level encryption before publish, and key management strategy (separate ADR).
8. KIP-848 new consumer rebalance: require all services to upgrade to Kafka client 3.8+ before adopting new protocol. Is there a migration plan?

---

## Sub-decision 2: Command / Work Queue

The work queue is distinct from the streaming backbone. It handles discrete, short-lived, possibly scheduled jobs: send notification, generate PDF, run batch import, execute BPM timer tick, send email. These have different semantics than event streaming: they are consumed once, retried on failure, have deadlines, and often need dashboards.

### Options

#### Option A: Use the streaming backbone for everything (Kafka or NATS for work queues)

**Pattern:** Publish job to topic/stream; worker consumes and processes.

**Pros:**
- Single infrastructure; no additional ops burden.
- Durability and replay come for free.
- Kafka's new "Share Groups" (KIP-932, Early Access in 4.0) add queue semantics (cooperative consumption without partition assignment) to Kafka topics — exactly work-queue behavior.

**Cons:**
- Kafka/NATS are not optimized for low-cardinality "send 1 email" jobs; partition assignment, consumer groups, and offset management add complexity for simple task dispatch.
- No built-in retry-with-backoff, job priority, cron scheduling, or job dashboard.
- Kafka Share Groups are Early Access in 4.0; not production-ready for 2026.
- For scheduled/cron tasks, a streaming backbone has no native scheduler.

**Verdict:** Acceptable as a starting point for simple async tasks. Insufficient for long-running, scheduled, or retry-heavy workloads.

---

#### Option B: Jobrunr (JVM, PostgreSQL-backed)

**License:** LGPL-3.0 (open source core). JobRunr Pro is commercial.

**Current state (2026):** Jobrunr 8.5.x. Native Kotlin support consolidated in `jobrunr-kotlin-support` targeting Kotlin 2.2 baseline. Spring Boot 3.x starter (`jobrunr-spring-boot-3-starter`). PostgreSQL storage provider supported and auto-migrated on startup.

**Strengths:**
1. Reuses PostgreSQL 17 (ADR-0101) as the backing store — zero additional infrastructure.
2. Spring Boot 3.x autoconfigure: `@Job` + `@Recurring` annotations for cron jobs; lambda-based job enqueue.
3. Native Kotlin coroutine support via `jobrunr-kotlin-support` (8.5+).
4. Built-in dashboard (port 8000 by default) for job monitoring, retry management, DLQ inspection.
5. Distributed: multiple Spring Boot instances share the same PostgreSQL job store; automatic leader election for recurring jobs.
6. Exponential backoff retry policy configurable per job type.
7. Carbon-aware job scheduling (8.0+): optional feature for green compute alignment.
8. LGPL-3.0 core: usable in commercial products with dynamic linking (standard Spring Boot JAR packaging qualifies).

**Weaknesses:**
1. Not a message broker; cannot fan-out a job to multiple consumers.
2. PostgreSQL polling overhead: default 15-second polling interval (configurable to 1s); adds DB load under high job throughput.
3. At very high throughput (>10K jobs/s), PostgreSQL becomes the bottleneck; not designed for high-cardinality event streaming.
4. No built-in topic/partition concept; work items are flat rows.
5. JobRunr Pro (commercial) required for some advanced features (job chaining, workflow, priority queues).

**Recommended for:** Scheduled tasks (notification digests, report generation, BPM timer ticks, batch imports), low-to-medium throughput async work (<10K jobs/s), single-platform deployments.

---

#### Option C: Spring Batch + Spring Scheduling + Quartz Cluster

**License:** Apache 2.0 (Spring); Apache 2.0 (Quartz).

**Strengths:**
1. Spring-idiomatic; zero additional library beyond what ADR-0100 committed.
2. Quartz cluster mode uses a JDBC JobStore (PostgreSQL); distributed, clustered cron scheduling.
3. Spring Batch: chunked processing, restartable jobs, step-level retry — ideal for large data imports.
4. Spring Scheduling (`@Scheduled`): simple in-process scheduling for single-node use.

**Weaknesses:**
1. No built-in dashboard; requires custom UI or external tool (Quartz Scheduler UI is separate project).
2. Quartz is showing its age (2000s-era Java patterns); configuration is verbose XML or complex Spring beans.
3. Distributed locking for Quartz cluster adds operational complexity vs Jobrunr's auto-configured approach.
4. Spring Batch is heavy for simple async task dispatch; better suited for bulk data pipeline processing.

**Recommended for:** Batch data pipeline jobs (ETL, search re-index). Use alongside Jobrunr, not instead of it.

---

#### Option D: NATS JetStream WorkQueue streams

**License:** Apache 2.0.

**Pattern:** JetStream stream with `retention=WorkQueue` semantics. Each message delivered to exactly one consumer in the consumer group; no re-delivery to other consumers after ACK.

**Strengths:**
1. If NATS JetStream is selected for the SMB streaming backbone (per Sub-decision 1), work queues are free — same broker.
2. At-least-once delivery; idempotent consumer pattern.
3. Retry via re-delivery configuration (max-deliveries, nak with delay).
4. Scales with NATS throughput ceiling.

**Weaknesses:**
1. No built-in cron scheduling. NATS has no scheduler; must pair with an external trigger (Kubernetes CronJob, Jobrunr `@Recurring`, or custom).
2. No job dashboard; NATS monitoring API is low-level.
3. Not a replacement for Jobrunr's backoff retry, priority queues, or job status tracking.

**Recommended for:** Simple async task dispatch in the NATS profile. Pair with Jobrunr for scheduled/recurring jobs even on NATS deployments.

---

#### Option E: Temporal (workflow + work queue)

**License:** MIT (Temporal OSS server). Client SDKs: MIT.

**Current state:** Temporal 1.x production-stable. Temporal Cloud is managed. Temporal for Spring Boot (`temporal-spring-boot-starter`) available.

**Strengths:**
1. Durable workflows: workflow code is replayed from history, making it naturally fault-tolerant.
2. Activity retries, timeouts, heartbeats, and signals built-in.
3. Long-running workflow support (months/years) without polling.
4. Excellent fit for saga orchestration, order lifecycle, clinical care plan workflows.

**Weaknesses:**
1. **Overlaps with BPM/workflow engine** that CuraOS intends to adopt (ADR-0105 scope). Running both Temporal and a BPMN engine creates dual workflow infrastructure.
2. Adds operational overhead: Temporal server requires Cassandra or PostgreSQL + Elasticsearch.
3. Heavier learning curve; workflow-as-code pattern requires team training.
4. If a BPMN workflow engine (Flowable, Camunda, Zeebe) is adopted in ADR-0105, Temporal's role shrinks to zero.

**Verdict:** Do not adopt Temporal in this ADR. Defer to ADR-0105 (BPM / Workflow engine). If the BPM ADR selects Temporal, work-queue semantics come along. If BPMN engine selected, Temporal is redundant. Track as future option.

---

#### Option F: Apache Airflow / Prefect / Dagster

**License:** Apache 2.0 (Airflow, Prefect Community); BSL (Dagster Cloud).

**Verdict:** Data pipeline orchestration tools, not service work queues. Out of scope for real-time async task dispatch. May be relevant for ETL / analytics pipeline scheduling as a separate ADR. Not recommended here.

---

### Work Queue Comparison Matrix

| Criterion | Jobrunr | Spring Quartz | NATS WorkQueue | Temporal | Backbone only |
|---|---|---|---|---|---|
| License | LGPL-3.0 | Apache 2.0 | Apache 2.0 | MIT | N/A |
| PostgreSQL reuse | Yes | Yes | No | Yes (option) | N/A |
| Cron scheduling | Yes (@Recurring) | Yes | No (external needed) | Yes | No |
| Dashboard | Yes (built-in) | No | No | Yes (Temporal UI) | No |
| Kotlin native | Yes (8.5+) | Via Spring | Via nats.java | Via SDK | N/A |
| Distributed HA | Yes | Yes (cluster) | Yes (NATS cluster) | Yes | Yes |
| Retry + backoff | Yes (built-in) | Manual | Via re-delivery config | Yes (built-in) | No |
| Priority queues | Pro only | No | No | Yes | No |
| Saga / long-running | No | No | No | Yes | No |
| Operational overhead | Low | Medium | Zero (if NATS chosen) | High | Zero |

---

### Work Queue Recommendation

**Primary:** **Jobrunr** (open-source core, LGPL-3.0) backed by PostgreSQL 17.

- Reuses ADR-0101 PostgreSQL; zero additional infrastructure.
- Spring Boot 3.x + Kotlin 2.x native (8.5+).
- Built-in dashboard, retry, cron — covers 90% of CuraOS async task requirements.
- LGPL-3.0 is compatible with commercial distribution via standard JAR linking.

**Supplementary:** **NATS JetStream WorkQueue streams** for the SMB profile where NATS is the streaming backbone — handles burst dispatch without polling overhead.

**Deferred:** Temporal deferred to ADR-0105 (BPM/Workflow). Do not adopt now.

**For batch data processing:** Spring Batch alongside Jobrunr for chunked, restartable large-scale data jobs (search re-index, ETL, archive export). These are not in conflict; Jobrunr handles task dispatch, Spring Batch handles step-chunked execution.

---

### Open Questions (Work Queue)

1. What is the expected job volume at SaaS peak? If >10K jobs/s, PostgreSQL-backed Jobrunr will need connection pool tuning and potentially a dedicated PG instance for the job store.
2. Does the BPM engine (ADR-0105) expose its own task queue / timer mechanism? If yes, Jobrunr may be redundant for BPM-triggered async work.
3. Priority queues required? If yes, Jobrunr Pro needed or custom PG-backed priority queue.
4. Dead-letter handling: who owns the DLQ for failed jobs — Jobrunr's built-in "Failed" state is sufficient for most cases, but PHI-related failed events need audit trail.

---

## Sub-decision 3: Outbox / Change-Data-Capture Pattern

The outbox pattern ensures that database writes and event publications are atomic — the event is written to an `outbox` table in the same transaction as the domain entity, then asynchronously forwarded to the messaging backbone.

### Why outbox is mandatory for CuraOS

The charter (AGENTS.md §6) requires "idempotent writes, correlation IDs, outbox/inbox patterns, retries with backoff, dead-letter handling." Without the outbox pattern, dual-write between database and broker risks:
- Lost events: DB write succeeds, broker publish fails → downstream services never learn of the change.
- Phantom events: broker publish succeeds, DB write fails → consumers process an event for a change that was rolled back.

The outbox solves this by making the event a DB row in the same ACID transaction, then reliably forwarding it.

### Options

#### Option A: Debezium PostgreSQL Connector → Kafka Connect Cluster → Topic (standard)

**Pattern:** PostgreSQL logical replication → Debezium connector in Kafka Connect cluster → Kafka/Redpanda topic.

**PostgreSQL 17 compatibility:** Debezium 3.x supports PostgreSQL 12-18, including 17. Known issue: PostgreSQL 17.5 has a logical decoding bug that can cause memory allocation failures in Debezium; PostgreSQL 17.6 resolves it. Use PostgreSQL 17.6+.

**Failover slot support:** PostgreSQL 16+ added logical replication from standby; Debezium 2.7+ and Debezium 3.x support failover slots, meaning the Debezium connector can follow the primary after a failover.

**Strengths:**
1. Most mature CDC path: battle-tested at LinkedIn, Airbnb, Netflix, and thousands of other deployments.
2. Zero application code for event emission from legacy/existing tables; Debezium captures WAL changes automatically.
3. Schema evolution: Debezium translates DDL changes (ALTER TABLE, ADD COLUMN) into schema-change events.
4. Kafka Connect sink connectors enable fan-out: PG → Kafka → multiple downstream sinks (OpenSearch, SeaweedFS, analytics).
5. Outbox Event Router SMT (Single Message Transform): Debezium ships a built-in Outbox Event Router SMT that flattens the outbox table rows into domain events with correct topic routing, aggregate ID keying, and schema registry integration.
6. PG 17 logical replication via `pgoutput` plugin (no extensions required).
7. Full replay: reset consumer offset on Kafka to reprocess all outbox events.

**Weaknesses:**
1. Operational overhead: requires a Kafka Connect cluster (JVM workers) in addition to the Kafka cluster. Adds 1-2 GB RAM for the Connect cluster.
2. Replication slot must be managed carefully: if the slot is not consumed (consumer lag), WAL files accumulate and can fill the PG disk (pg_wal fill — production incident vector).
3. Kafka-only sink in standard Debezium Connect; changing the streaming backbone requires replacing the connector.
4. Schema Registry must be configured separately (Apicurio or Confluent).
5. Exactly-one delivery from WAL: Debezium delivers at-least-once; idempotent consumers required.

**Recommended for:** SaaS / enterprise profile where Kafka 4.x is the streaming backbone.

---

#### Option B: Debezium Server (standalone, no Kafka Connect cluster)

**Pattern:** Debezium Server is a standalone Quarkus application that embeds Debezium engine and sends events directly to a sink (NATS JetStream, HTTP, Kinesis, Pub/Sub, RabbitMQ) without requiring Kafka Connect.

**Strengths:**
1. **No Kafka Connect cluster required.** Reduces operational footprint for non-Kafka profiles.
2. NATS JetStream sink: documented and production-tested (2024 Debezium 2.7+ improved JWT/seed auth for NATS sink).
3. Single Quarkus application (~150 MB image); much lighter than Kafka Connect cluster.
4. Same Debezium connector semantics (Outbox Event Router, SMTs) as Option A.
5. Configurable via properties file; runs as Docker container or Kubernetes pod.
6. Ideal for SMB / air-gap profile: single container, no Kafka dependency.

**Weaknesses:**
1. Single-process; no built-in horizontal scaling (one Debezium Server per PG instance). HA requires process supervisor or Kubernetes restart policy.
2. Fewer sink options than Kafka Connect (no sink connectors ecosystem); primarily suited for streaming backbone sinks.
3. No Kafka Connect SMT ecosystem; Outbox Event Router must be configured explicitly.
4. NATS sink support in Debezium Server: available but less widely deployed than Kafka sink; requires validation.

**Recommended for:** SMB / air-gap profile where NATS JetStream is the streaming backbone.

---

#### Option C: PostgreSQL LISTEN/NOTIFY → in-app relay

**Pattern:** Outbox table with an `ON INSERT` trigger that fires `NOTIFY <channel>, payload`. The Spring Boot application subscribes to the channel via JDBC LISTEN and forwards to the broker.

**Strengths:**
1. No additional infrastructure (no Debezium, no Kafka Connect).
2. Sub-millisecond notification latency; nearly synchronous with the write.
3. Simple to implement; standard PostgreSQL feature.

**Weaknesses:**
1. **Throughput ceiling ~100-200 NOTIFY payloads/s per channel** (PostgreSQL NOTIFY uses synchronous signaling on the shared memory channel). High-write services will saturate this.
2. NOTIFY payload is limited to 8000 bytes; large events must be passed by reference (notify with ID, consumer reads from table).
3. If the Spring Boot application is down when NOTIFY fires, the notification is lost — no durability. Must fall back to polling for missed events.
4. Not suitable as the primary outbox mechanism; can serve as a low-latency trigger to wake the polling loop.

**Recommended for:** Only as a latency-optimization layer on top of the polling publisher (Option D) for low-volume services. Not as a standalone outbox mechanism.

---

#### Option D: Transactional Outbox + Application-Side Polling

**Pattern:** Outbox table row written in the same transaction as the domain entity. A Spring Scheduling job polls `SELECT ... WHERE status='PENDING' LIMIT N` every 100-500 ms, publishes to broker, marks rows as `PROCESSED`.

**Strengths:**
1. Simplest possible implementation; no Debezium dependency.
2. Works with any broker (Kafka, NATS, RabbitMQ, Valkey Streams).
3. Survives application restart; unprocessed rows remain in table.
4. Exactly-once feasible if publish is idempotent and marking uses atomic UPDATE with row-level lock.

**Weaknesses:**
1. **Polling latency:** 100-500 ms default polling interval adds delivery latency to every event. Kafka CDC-based approach is near-real-time (~50-100 ms).
2. **DB polling overhead:** SELECT on outbox table every 100ms adds read load to PostgreSQL. With 91 services, 91 polling loops = significant read load. Mitigate with table partitioning or dedicated PG read replica.
3. Polling interval is a tension: faster polling = more DB load; slower polling = higher event latency.
4. Cleanup: processed rows accumulate; requires periodic TRUNCATE or DELETE + archival.
5. At-least-once: if application crashes between publish and mark-processed, event publishes again on restart. Idempotent consumers required.

**Recommended for:** Services where Debezium setup is not justified (low-event-frequency services), or as a bootstrap before CDC is operational.

---

#### Option E: PostgreSQL WAL2JSON (no Debezium, bare-bones CDC)

**Pattern:** Use the `wal2json` PostgreSQL plugin directly, read from replication slot in application code, publish to broker.

**Weaknesses:**
1. Requires `wal2json` extension installed on PG (not always available in managed PG; fine for self-hosted PG 17).
2. Debezium uses `pgoutput` natively (no extension) and handles more of the WAL decoding safely. Rolling custom WAL reader is error-prone.
3. No ecosystem of transforms (SMTs), schema evolution handling, or Outbox Router.

**Verdict:** Not recommended. Debezium's pgoutput-based connector (no extension required) is strictly better.

---

#### Option F: RisingWave / Materialize / ksqlDB (streaming SQL on CDC)

**Pattern:** Deploy a streaming SQL engine that reads from Debezium CDC topics and materializes derived views, publishing to downstream topics.

**Verdict:** This is a stream-processing tier on top of CDC, not the outbox mechanism itself. Potentially valuable for CuraOS analytics, search index hydration, or FHIR data transformation in HealthStack. Defer to a future ADR (data pipelines / stream processing). Not in scope here.

---

### Outbox/CDC Comparison Matrix

| Criterion | Debezium + Kafka Connect | Debezium Server | PG LISTEN/NOTIFY | App Polling | wal2json bare |
|---|---|---|---|---|---|
| Infrastructure added | Kafka Connect cluster | Single container | None | None | None |
| Delivery latency | ~50-200 ms | ~50-200 ms | <10 ms (notify) | 100-500 ms | ~50-200 ms |
| At-least-once | Yes | Yes | No (lost if app down) | Yes | Yes |
| PG 17 support | Yes (Debezium 3.x) | Yes (Debezium 3.x) | Native | Native | Requires wal2json |
| Failover slot | Yes (PG 16+) | Yes | N/A | N/A | No |
| Outbox Event Router | Yes (built-in SMT) | Yes (built-in) | Manual | Manual | Manual |
| Schema evolution | Yes (DDL events) | Yes | No | No | Partial |
| Air-gap viable | Yes | Yes | Yes | Yes | Yes |
| Broker agnostic | Kafka/Redpanda only | Kafka/NATS/RabbitMQ/HTTP | Any | Any | Any |
| Operational burden | High (Connect cluster) | Low (one container) | Zero | Zero | Low |
| Throughput | High | High | ~100 msg/s/channel | Moderate | High |

---

### Outbox/CDC Recommendation

**SaaS profile (Kafka 4.x streaming backbone):**
- **Debezium 3.x PostgreSQL connector via Kafka Connect cluster.**
- Use `pgoutput` plugin (no PG extension required).
- Deploy Outbox Event Router SMT for domain event routing from outbox table.
- Pin to PostgreSQL 17.6+ (avoids 17.5 logical decoding bug).
- Enable PG 16+ failover slots so Debezium follows primary after failover.
- Kafka Connect cluster: 2 workers (JVM) with 2 GB heap each; dedicated namespace in Kubernetes.

**SMB / air-gap profile (NATS JetStream streaming backbone):**
- **Debezium Server** (standalone Quarkus container) with NATS JetStream sink.
- Single container (~150 MB image); runs as a sidecar to the database.
- Configure `debezium.sink.type=nats-jetstream` with JWT auth.
- Outbox table per service; Debezium Server publishes to NATS subjects matching Outbox Event Router naming convention.

**Bootstrap / fallback (both profiles):**
- Application-side polling (Option D) as a bootstrap mechanism before CDC is operational, or for services with event frequency <10/s where CDC overhead is not justified.
- Add PG LISTEN/NOTIFY trigger as a latency optimization wake-up for the polling loop (reduces 500ms polling to near-real-time with minimal PG overhead).

---

## Cross-Layer Integration Concerns

### Topic / Subject Naming Convention

Adopt a universal naming scheme that works across Kafka topics and NATS subjects:

```
cura.<domain>.<aggregate>.<event-type>
```

Examples:
- `cura.identity.user.created`
- `cura.healthstack.encounter.completed`
- `cura.commerce.order.cancelled`
- `cura.audit.entity.changed`

For NATS JetStream subjects, the dot separator is native. For Kafka topics, use dots or hyphens consistently (pick dots for consistency; avoid dots in Kafka group IDs).

**Tenant-scoped variant** (if topic-per-tenant strategy adopted for SaaS):
```
cura.<tenant-id>.<domain>.<aggregate>.<event-type>
```

**Recommendation:** Use key-by-tenant in record headers for Kafka SaaS profile; use NATS Accounts for NATS SMB profile. Do not embed tenant-id in the topic name for SaaS (partition explosion risk).

### Schema Versioning

**Recommended:** **Apicurio Registry** (Apache 2.0, CNCF project).

Rationale:
- Apache 2.0: no license restrictions vs Confluent Schema Registry (source available for Community, proprietary for governance features).
- PostgreSQL-backed persistence: integrates with ADR-0101 PostgreSQL, zero additional storage infrastructure.
- Confluent Schema Registry API compatibility: existing Avro/Protobuf serializers targeting Confluent Registry work with Apicurio without code changes (change URL only).
- Supports Avro, Protobuf, JSON Schema, AsyncAPI, OpenAPI — covers all CuraOS contract types.
- OIDC (Keycloak) auth: aligns with CuraOS Identity Stack.

**Schema format recommendation:**
- **Protobuf** for inter-service events where schema registry connectivity may be unreliable (air-gap edge case: Protobuf message descriptors are self-describing for field names; parsing possible without registry lookup if field IDs used correctly).
- **Avro** for high-throughput Kafka topics where compact serialization matters and registry connectivity is guaranteed.
- **JSON Schema** for HealthStack FHIR-adjacent events where JSON wire format is mandated by HL7 FHIR specifications.

### HIPAA: PHI Topic Isolation

HealthStack PHI events (patient records, encounter data, lab results, medication orders) require:

1. **Separate topic namespace:** `cura.healthstack.*` topics must be isolated from neutral-core topics. In Kafka, this means separate ACLs: only HealthStack services have produce/consume permissions on `cura.healthstack.*` topics.
2. **Payload-level encryption:** TLS protects data in transit; disk encryption protects data at rest on the broker. For HIPAA compliance, **field-level encryption of PHI fields within the event payload** is the defensive layer for breaches. Apply AES-256-GCM with a key per tenant, managed by the Secrets / Key Management service (separate ADR).
3. **Audit trail:** All PHI events must flow through the `cura.audit.*` topic (written by the Audit service, not by application code directly). The Audit service consumes PHI domain events and writes tamper-evident audit records with hash-chaining.
4. **Retention:** HIPAA requires audit log retention of 6 years (45 CFR §164.316(b)(2)(i)). Configure `cura.audit.*` topics with 6-year retention. Use Kafka tiered storage (SeaweedFS S3 sink) for cost-effective long-term retention.
5. **Dedicated Kafka cluster option:** For very high-compliance deployments, consider a dedicated Kafka cluster for HealthStack (separate broker JVMs from neutral-core). Cost vs isolation trade-off; not mandatory if ACLs are correctly applied.

### Air-Gap Operation

All selected components must ship as container images with no runtime internet calls:

| Component | Air-gap image | Notes |
|---|---|---|
| Apache Kafka 4.x | `apache/kafka:4.x` | Pull and host in private registry |
| NATS JetStream | `nats:alpine` | ~10 MB image |
| Debezium Server | `quay.io/debezium/server:3.x` | ~150 MB image |
| Debezium Kafka Connect | `quay.io/debezium/connect:3.x` | ~500 MB image |
| Apicurio Registry | `quay.io/apicurio/apicurio-registry:3.x` | ~250 MB image |
| Jobrunr | In-process (part of app JAR) | No separate image |

No external telemetry SDKs that phone home; no auto-update mechanisms in production images.

### DLQ Pattern

**Kafka profile:** Configure Spring Cloud Stream's native DLQ: failed messages route to `<topic>.DLT` (dead-letter topic) after max retry attempts. Retain DLQ topics with the same retention policy as the source topic. Alert on DLQ consumer lag > 0.

**NATS profile:** JetStream consumer `max_deliver` + `nack_backoff` configures re-delivery with delay. After max deliveries, messages flow to a separate error stream (configure `DeadLetterPolicy` via JetStream consumer). Custom consumer processes DLQ stream for alerting and manual replay.

**Jobrunr:** Failed jobs enter the `Failed` state (permanent failure after retry exhaustion). Jobrunr dashboard surfaces these; PHI-related failed jobs must trigger an alert to the compliance team.

### OpenTelemetry Instrumentation

| Layer | OTEL path |
|---|---|
| Kafka producer/consumer | `opentelemetry-instrumentation-kafka` (Java agent auto-instrumentation) injects/extracts W3C TraceContext in Kafka record headers |
| NATS client | Manual trace context propagation via nats.java `Headers` object; `opentelemetry-sdk` spans around publish/consume |
| Debezium | Debezium 2.6+ emits OTEL spans for connector operations; sink to OTEL Collector |
| Jobrunr | `jobrunr-opentelemetry` integration available (manual); wraps job execution in OTEL span |
| Spring Boot | Micrometer + Micrometer Tracing bridge to OTEL Collector; auto-instruments Spring Kafka template |

All traces should include `tenant_id`, `correlation_id`, `domain`, and `aggregate_id` as span attributes. These attributes flow from the event header through the trace context.

### Replay / Event Sourcing

**Kafka:** `consumer.seekToBeginning(partitions)` or `consumer.seek(partition, offset)` for offset replay. Timestamp-based replay via `offsetsForTimes` API. Spring Kafka's `SeekToCurrentErrorHandler` + `DefaultAfterRollbackProcessor` for transactional replay.

**NATS JetStream:** Consumer `DeliverPolicy.All` or `DeliverPolicy.ByStartSequence` or `DeliverPolicy.ByStartTime` covers all replay use cases. Time-based seek via `OptStartTime`.

**Important:** Replay consumers must handle idempotency. The Inbox pattern (deduplication table in PostgreSQL keyed on `event_id`) provides idempotent processing even when the same event is delivered multiple times during replay.

---

## Recommendation Summary

### Final Decisions

| Sub-decision | SaaS / Enterprise | SMB / On-Prem / Air-Gap |
|---|---|---|
| Streaming backbone | **Apache Kafka 4.x** (KRaft, Apache 2.0) | **NATS JetStream** (Apache 2.0) |
| Schema registry | **Apicurio Registry** (Apache 2.0, PG-backed) | **Apicurio Registry** (same, smaller instance) |
| Outbox / CDC | **Debezium 3.x + Kafka Connect cluster** | **Debezium Server** (NATS JetStream sink) |
| Work queue | **Jobrunr** (LGPL-3.0, PG-backed) | **Jobrunr** (same) + NATS WorkQueue streams |
| Schema format | Protobuf (primary) + Avro (high-throughput) | Protobuf (self-describing, no registry dependency) |
| Multi-tenant strategy | Key-by-tenant-id in headers (shared topics) | NATS Accounts per tenant |
| PHI isolation | Separate ACLs on `cura.healthstack.*` + field-level encryption | NATS Account isolation + field-level encryption |

### Data Flow Diagram

```
Service (Kotlin/Spring Boot)
│
├── Domain Write
│   └── PostgreSQL 17 (ADR-0101)
│       ├── Entity row (ACID write)
│       └── Outbox row (same transaction)
│
├── CDC Path (async, near-real-time)
│   │
│   ├── [SaaS] Debezium 3.x Kafka Connect ──► Kafka 4.x topic
│   │                                              │
│   └── [SMB]  Debezium Server ──────────────► NATS JetStream subject
│                                                  │
│                                    ┌─────────────┼──────────────────┐
│                                    ▼             ▼                  ▼
│                             Consumers     OpenSearch CDC      Audit Service
│                             (domain)      sink connector      (hash-chain)
│
├── Work Queue Path
│   └── Jobrunr → PostgreSQL job table → Spring worker bean
│       (email, PDF, batch import, BPM timer ticks)
│
└── Schema Registry
    └── Apicurio Registry (PostgreSQL-backed)
        ├── Avro / Protobuf schemas per domain event type
        └── Confluent-compatible API (existing tooling works)
```

---

## Open Questions for User

1. **Deployment profile split:** Should CuraOS ship as a single deployment SKU that configures itself (Kafka for SaaS profile, NATS for SMB profile via feature flag), or are these separate product SKUs with separate packaging? This affects how deeply the broker abstraction layer needs to be built.

2. **Redpanda legal review:** Is there appetite to obtain legal sign-off on Redpanda BSL terms relative to CuraOS's multi-tenant SaaS model? If yes, Redpanda is the preferred SaaS broker (lower latency, simpler ops, SeaweedFS tiered storage fit).

3. **Schema format:** Avro vs Protobuf as the primary schema format for inter-service events? Recommendation is Protobuf for air-gap resilience, but Avro is more common in Kafka ecosystems.

4. **Maximum tenant count at SaaS launch:** What is the expected tenant count at SaaS GA and at 3-year horizon? This determines whether topic-per-tenant is viable at launch (fine up to 50-100 tenants) or key-by-tenant must be enforced from day 1.

5. **PHI field-level encryption:** Should HealthStack PHI event payloads be encrypted at the field level (per-tenant key, AES-256-GCM) before publishing? This is the defensible HIPAA posture. Requires a Key Management Service ADR (propose ADR-0103-security).

6. **Audit event retention:** 6 years HIPAA minimum. How should long-term event retention be managed — Kafka tiered storage to SeaweedFS, periodic archival to cold object storage, or a dedicated audit database? This affects Kafka storage planning.

7. **Event replay ownership:** Which team / service owns the replay infrastructure? Event sourcing via replay requires a defined protocol for "who can seek to offset 0 on production topics." Without governance, replay in production can overwhelm downstream services.

8. **NATS Spring Boot starter:** Should an internal `cura-nats-spring-boot-starter` module be built to provide Spring-idiomatic NATS JetStream publish/consume, DLQ routing, and OTEL trace propagation? Estimated effort: 1-2 weeks. Without it, each service integrates NATS directly — inconsistent and error-prone.

9. **Jobrunr Pro:** Are priority queues, job chaining, or SLA-based scheduling required? If yes, Jobrunr Pro license must be budgeted. If no, open-source LGPL-3.0 core is sufficient.

10. **Debezium replication slot monitoring:** WAL accumulation from unconsumed replication slots is a production incident vector (disk fill). Who owns the monitoring alert for PG WAL lag? This should be in the CuraOS ops runbook; flag for ADR-0110 (observability).

11. **Maximum event payload size:** FHIR Bundles and CDA documents can exceed 1 MB. Kafka default `max.message.bytes` is 1 MB; NATS default max payload is 1 MB (configurable). Recommend reference-by-ID pattern: event carries `document_id` + metadata; consumer fetches from SeaweedFS. Or raise limit to 4-8 MB with corresponding broker and client config changes.

12. **Inbox pattern for idempotency:** Every event consumer must implement idempotent processing. Recommend a shared `cura-event-idempotency` library backed by a PostgreSQL deduplication table (keyed on `event_id + consumer_group`). Should this be part of the messaging ADR scope or a separate framework ADR?

---

## References

### Kafka / KRaft
- [KIP-833: Mark KRaft as Production Ready](https://cwiki.apache.org/confluence/display/KAFKA/KIP-833:+Mark+KRaft+as+Production+Ready)
- [Apache Kafka 4.0.0 Release Announcement](https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/)
- [Apache Kafka 4.0: KRaft, New Features, and Migration](https://github.com/AutoMQ/automq/wiki/Apache-Kafka-4.0:-KRaft,-New-Features,-and-Migration)
- [Kafka CVE List](https://kafka.apache.org/cve-list.html)
- [CVE-2024-56128: SCRAM replay](https://support.confluent.io/hc/en-us/articles/36274930137108-CONFSA-2025-01-CVE-2024-56128)
- [Spring for Apache Kafka 4.0.0-M2 Available](https://spring.io/blog/2025/04/23/spring-kafka-4-0-0-M2-and-3-3-5-available-now/)
- [How to Choose Partitions in a Kafka Cluster](https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster/)
- [HIPAA-Compliant Kafka Setup](https://www.accountablehq.com/post/kafka-healthcare-security-configuration-hipaa-compliant-setup-and-best-practices)
- [Kafka Security Best Practices](https://www.confluent.io/blog/secure-kafka-deployment-best-practices/)
- [Kafka Scalability Pitfalls](https://www.ibm.com/think/topics/kafka-scalability)

### Redpanda
- [Redpanda Licensing Overview](https://docs.redpanda.com/current/get-started/licensing/overview/)
- [Redpanda BSL Source Available Blog](https://www.redpanda.com/blog/bsl-source-available-license)
- [Redpanda BSL license text](https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md)
- [Redpanda vs Kafka deep dive](https://www.automq.com/blog/redpanda-vs-apache-kafka-event-streaming)
- [Redpanda vs Kafka TCO](https://www.redpanda.com/blog/is-redpanda-better-than-kafka-tco-comparison)

### NATS JetStream
- [NATS JetStream documentation](https://docs.nats.io/nats-concepts/jetstream)
- [NATS Multi-Tenancy via Accounts](https://docs.nats.io/running-a-nats-service/configuration/securing_nats/accounts)
- [NATS JetStream vs RabbitMQ vs Kafka 2025 benchmarks](https://onidel.com/blog/nats-jetstream-rabbitmq-kafka-2025-benchmarks)
- [NATS by Example: Debezium CDC integration](https://natsbyexample.com/examples/integrations/debezium/cli)
- [Microservices Sync with PG + Debezium + NATS](https://www.glassflow.dev/blog/microservices-data-synchronization-using-postgresql-debezium-and-nats)
- [Capture data change PG + Debezium + NATS JetStream](https://wearenotch.com/blog/capture-data-change-in-postgresql-debezium-nats-jetstream/)

### Apache Pulsar
- [Apache Pulsar 4.1.0 Release Notes](https://pulsar.apache.org/release-notes/versioned/pulsar-4.1.0/)
- [Kafka vs Pulsar 2025 comparison](https://markaicode.com/apache-kafka-vs-pulsar-2025-comparison/)

### RabbitMQ
- [RabbitMQ 4.0 Quorum Queue Features](https://www.rabbitmq.com/blog/2024/08/28/quorum-queues-in-4.0)
- [RabbitMQ 4.3 Highlights](https://www.rabbitmq.com/blog/2026/04/23/rabbitmq-4.3-release)
- [RabbitMQ Streams documentation](https://www.rabbitmq.com/docs/streams)

### Debezium / CDC / Outbox
- [Debezium PostgreSQL Connector documentation](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)
- [Debezium Server documentation](https://debezium.io/documentation/reference/stable/operations/debezium-server.html)
- [Debezium 3.0.1 Final Released](https://debezium.io/blog/2024/10/28/debezium-3-0-1-final-released/)
- [Debezium Server NATS JetStream sink](https://debezium.io/documentation/reference/stable/operations/debezium-server.html)
- [Postgres CDC with Debezium tutorial](https://blog.sequinstream.com/postgres-cdc-with-debezium-complete-step-by-step-tutorial/)
- [PG 17 logical decoding failover slots](https://www.decodable.co/blog/logical-replication-from-postgres-16-stand-by-servers-part-2-of-2)

### Multi-Tenancy
- [Gong: Kafka Multi-Tenant Isolation at Scale](https://medium.com/gong-tech-blog/how-we-use-kafka-to-maintain-tenant-data-isolation-at-scale-ad501f2dc572)
- [Kafka Topic Capacity Scaling](https://dattell.com/data-architecture-blog/kafka-topic-capacity/)

### Schema Registry
- [Apicurio vs Confluent Schema Registry](https://axonops.com/blog/comparing-kafka-schema-registries/)
- [Kafka Schema Registry 2026 comparison](https://www.automq.com/blog/kafka-schema-registry-confluent-aws-glue-redpanda-apicurio-2025)
- [Apicurio Confluent compatibility](https://www.apicur.io/registry/docs/apicurio-registry/3.3.x/getting-started/assembly-confluent-schema-registry-compatibility.html)

### Work Queue / Jobrunr
- [Jobrunr 8.0 release: Kotlin support + carbon-aware](https://www.infoq.com/news/2025/08/jobrunr-8-carbon-aware/)
- [Jobrunr 8.5 Kotlin support](https://www.jobrunr.io/en/blog/v8-release/)
- [Jobrunr Spring Boot starter documentation](https://www.jobrunr.io/en/documentation/configuration/spring/)

### Valkey Streams
- [Valkey Streams introduction](https://valkey.io/topics/streams-intro/)
- [Reliable Queue vs Valkey Stream comparison](https://dev.to/mrniko/feature-comparison-reliable-queue-vs-valkey-and-redis-stream-g0n)
