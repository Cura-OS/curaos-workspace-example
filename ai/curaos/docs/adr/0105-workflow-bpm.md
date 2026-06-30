# ADR-0105: Workflow / BPM Core

> **🚫 SUPERSEDED** by [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md). CuraOS Workflow Manager = Temporal + Activepieces + cron defaults, reused CuraOS Workflow Canvas from ADR-0121, hybrid multi-tenant. BPMN deprecated per ADR-0099 §7. Flowable removed.


## Status

Superseded by [ADR-0122](0122-foundation-workflow-manager.md). Date: 2026-05-24.

---

## Context

CuraOS charter §3 ("Builder-led") establishes Workflow/BPM as a **platform pillar**: _"All experiences flow through workflow/BPM engine + app/site builder. Overlays consume same orchestration + UI primitives."_ This is not an optional service — it is the execution substrate for every clinical pathway, every operational approval chain, every patient-facing form sequence, and every system-to-system saga across all 91 microservices.

### Two distinct paradigms in this space

Understanding the distinction is critical before choosing engines:

| Paradigm | Model | Primary users | Examples |
|---|---|---|---|
| **BPMN/BPM** | Visual, declarative, standard notation. Processes modeled as flowcharts. Human tasks are first-class. | Clinicians, process analysts, compliance officers, non-devs | Camunda 7, Flowable, jBPM |
| **Durable execution / code-first** | Workflows written as functions in a general-purpose language. Execution is automatically fault-tolerant and replayed on crash. | Software engineers building distributed systems | Temporal, Conductor (Orkes) |

These paradigms are **not mutually exclusive** and they solve different problems. A production-grade platform like CuraOS needs to decide:

1. Which paradigm is **primary** for human-facing process automation (patient discharge, enrollment, procurement, case management)?
2. Which paradigm handles **distributed system sagas** (cross-service compensating transactions, eventually-consistent data pipelines, durable retries across external APIs)?
3. Whether to run a **single engine** for both concerns or maintain a **two-layer architecture** with clear seams.

### Existing commitments (must integrate with)

- **Runtime**: Kotlin + Spring Boot 3.4, JVM 21 (ADR-0100)
- **Data**: PostgreSQL 17, Valkey, SeaweedFS (ADR-0101)
- **Events**: Kafka 4.x (SaaS), NATS JetStream (SMB), Jobrunr work queue, Debezium outbox, Apicurio schema registry (ADR-0102)
- **API**: Spring MVC + virtual threads, DGS/Cosmo GraphQL, APISIX gateway, HAPI FHIR R4 (ADR-0103)
- **Identity**: Keycloak 26+, hybrid RBAC+OPA+SpiceDB, hash-chained audit log (ADR-0104)

### Service scaffolds that exist

Four submodule shells are already in place under `curaos/backend/services/`:

- `workflow-core-service` — neutral workflow primitives (definitions, instances, human-task inbox)
- `healthstack-workflow-service` — clinical pathways (admission → encounter → orders → discharge)
- `business-workflow-service` — procurement, sales, fulfillment, customer cases
- `personal-workflow-service` — patient-facing enrollment, consent, care-plan adherence

These scaffolds do not yet have an engine wired. This ADR makes that decision.

---

## Forces / Requirements

### Functional

| # | Requirement | Priority |
|---|---|---|
| F-1 | BPMN 2.0 visual modeling: clinicians and analysts must be able to read and edit process diagrams without developer help | Must |
| F-2 | DMN (Decision Model and Notation) for clinical decision rules (e.g. triage scoring, drug contraindication checks) | Should |
| F-3 | CMMN (Case Management Model and Notation) for ad-hoc, non-linear cases (complex patient cases, legal/insurance cases) | Should |
| F-4 | Human task management: task inbox, assignment, delegation, priority, escalation | Must |
| F-5 | System/service tasks: call external services, publish events, invoke Kotlin functions | Must |
| F-6 | Event-driven triggers: process starts and mid-process waits on Kafka/NATS topics (ADR-0102) | Must |
| F-7 | Scheduled triggers: cron-style, delayed start, deadline timers | Must |
| F-8 | SLA timers with escalation: boundary events, escalation emails, manager notification | Must |
| F-9 | Versioned process definitions with migration support for in-flight instances | Must |
| F-10 | Code-first durable execution for distributed sagas (cross-service compensating transactions) | Must |
| F-11 | Process definition DSAR support (GDPR right to erasure on completed process data) | Must |
| F-12 | Test-friendly: deterministic replay of process execution for unit tests | Must |
| F-13 | Visual designer accessible to non-devs, embeddable in App/Site Builder | Must |

### Non-functional

| # | Requirement | Notes |
|---|---|---|
| N-1 | **Self-hosted first, air-gap capable** | No dependency on vendor SaaS. Docker + Kubernetes compose. Footprint must fit SMB on-prem (4-8 CPU, 16-32 GB). |
| N-2 | **Multi-tenant** | Process definitions and instances isolated per tenant. Shared cluster preferred for SaaS profile. |
| N-3 | **HIPAA** | PHI in process variables encrypted at rest. Every task action (claim, complete, escalate, reassign) in hash-chained audit log (ADR-0104). |
| N-4 | **GDPR** | Data retention per process type configurable. DSAR-friendly bulk deletion of completed instance data. |
| N-5 | **Spring Boot 3.4 / Kotlin integration** | Engine embedded or connected via mature Spring Boot starter. No custom shim. |
| N-6 | **Observability** | Correlation ID propagation through process spans. OpenTelemetry traces per step. |
| N-7 | **Open-source license** | Apache 2.0 preferred. BSL/commercial must be flagged as risk. |
| N-8 | **Scaling** | SaaS: thousands of concurrent process instances across tenants. SMB on-prem: lightweight footprint. |
| N-9 | **Overlap with Jobrunr** | Jobrunr (ADR-0102) handles short work-queue jobs. BPM engine handles long-running stateful processes. Boundary must be explicit. |
| N-10 | **FHIR integration** | HealthStack workflows exchange data with HAPI FHIR R4. Processes should be able to read/write FHIR resources. |

---

## Decision Drivers (weighted)

| Driver | Weight | Rationale |
|---|---|---|
| BPMN 2.0 fidelity (full spec coverage) | High | Clinical pathways modeled by analysts, not devs |
| Visual designer quality for non-devs | High | Charter §3 "Builder-led" requires non-dev access |
| Multi-tenant patterns (isolation, scale) | High | Platform pillar for 91-service multi-tenant SaaS |
| Open-source license (Apache 2.0 preferred) | High | Self-hosted + SaaS distribution risk with BSL |
| Spring Boot 3.4 / Kotlin integration maturity | High | Entire backend on ADR-0100 stack |
| Self-hosted + air-gap deployability | High | Charter §3 self-hosted first |
| HIPAA-friendly (variable encryption, audit) | High | HealthStack overlay mandatory |
| Footprint (SMB on-prem profile) | Medium-High | SMB tier runs on commodity hardware |
| Code-first DX (saga / distributed orchestration) | Medium-High | System-side flows need durable execution |
| Process definition versioning + migration | Medium | Running instances must survive definition upgrades |
| SLA timer reliability across node failures | Medium | Clinical escalation is patient-safety relevant |
| CMMN support (case management) | Medium | Ad-hoc cases less rigid than BPMN |
| DMN support (decision tables) | Medium | Triage, drug checks, scoring |
| Learning curve | Medium | Team ramp-up cost |
| CVE history (security posture) | Medium | PHI platform requires clean security track record |
| Community pulse / ecosystem size | Medium | Hiring, external help, plugins |
| FHIR/healthcare ecosystem integrations | Medium | FHIR2BPMN research exists; reduce custom code |
| Camunda Modeler compatibility | Medium | Best-in-class desktop BPMN editor, free |

---

## Sub-decision 1: Workflow Engine

### Option A: Camunda 7 (Apache 2.0 — EOL extended to April 2030)

**Architecture**: Embedded Java process engine backed by relational DB (PostgreSQL). Runs in-process inside Spring Boot application or as a standalone server. Lightweight — single JAR deployment.

**License**: Apache 2.0 (Community Edition). Enterprise Edition available for commercial support.

**EOL status** (verified 2025-02): Camunda 7 Community Edition final release was **7.24 on October 14, 2025** — no further community updates. Enterprise Edition LTS until **April 9, 2030** with bi-annual security patches. Extended support available through April 2032 for an additional fee. For CuraOS as a self-hosted product, this means: if shipping Camunda 7 Apache 2.0, the engine is frozen as of October 2025. Enterprise license needed for continued patches.

**Strengths**:
1. BPMN 2.0 + DMN + CMMN — full standards coverage in one engine
2. Spring Boot starter mature and well-documented (`camunda-bpm-spring-boot-starter`); embed with 3 lines of config
3. Multi-tenancy first-class: single engine, tenant-id propagation across all tables OR schema-per-tenant via `databaseTablePrefix`; up to thousands of tenants per cluster
4. Camunda Modeler (free desktop app) is best-in-class BPMN editor; works with Camunda 7 XML natively
5. Tasklist, Cockpit, Admin web apps included out-of-box for task inbox + process monitoring
6. Proven at scale: financial services, insurance, healthcare deployments documented (Zürcher Kantonalbank, healthcare systems)
7. Broad ecosystem: plugins, connectors, training material, large StackOverflow/forum corpus
8. Process definition versioning with migration API for in-flight instances
9. SLA boundary timers with escalation paths (intermediate timer events, boundary events)
10. Deterministic test support: in-memory H2 mode for unit tests, replayable scenarios

**Weaknesses**:
1. Community Edition **frozen** as of October 2025 — no new features, no security patches for free users going forward
2. Horizontal scaling limited by shared relational DB — bottleneck under high concurrent instance load (SaaS thousands-of-tenants profile)
3. Migration to Camunda 8 is a **complete rewrite** (different engine, different XML, Zeebe gateway protocol); no in-place upgrade
4. No Kafka/NATS native connector — requires custom `ExternalTaskClient` or connector framework
5. Cockpit/Tasklist UI is dated and not embeddable in App/Site Builder without iframe
6. CVEs in 2024-2025 (Tomcat images CVE-2024-56337, CVE-2024-50379; DOMPurify CVE-2024-45801; spring-webmvc) — patches available in Enterprise releases
7. No native PHI variable encryption — must implement custom variable serializer

**Multi-tenant pattern**: Shared engine, tenant-id on all APIs. Each deployment tagged with `tenantId`. Queries and mutations filter by tenant. Schema-per-tenant (`databaseTablePrefix = TENANT_X.`) possible but operationally heavy at scale.

**HIPAA fit**: Audit trail via history service. Variable encryption requires custom `TypedValueSerializer`. PHI fields must be encrypted before storage. Compatible but not built-in.

**Self-hosted / air-gap**: Single JAR + PostgreSQL. Works in air-gap with no external calls. Excellent fit.

**Spring/Kotlin**: `camunda-bpm-spring-boot-starter` auto-configures engine, REST API, web apps. Kotlin usage straightforward.

**FHIR ecosystem**: No native FHIR connector. FHIR2BPMN research (FH OÖ, PubMed 35575842) demonstrates automated transformation between FHIR PlanDefinition and BPMN 2.0 — CuraOS could adopt this pipeline.

**Verdict**: Best BPMN option for self-hosted, SMB-footprint, Apache 2.0 — but Community Edition is frozen. Enterprise license needed for continued security patches. EOL path to Camunda 8 is a full rewrite (see Option B risks).

---

### Option B: Camunda 8 / Zeebe (Zeebe Community License 1.1 — BSL-equivalent for managed services)

**Architecture**: Distributed, event-sourced engine built on Zeebe broker (append-only event log, no relational DB bottleneck). Requires Zeebe broker, gateway, Operate, Tasklist as separate services. K8s-native. Replaces relational-DB persistence with internal Rocksdb + elastic snapshot.

**License**: **CRITICAL RISK FLAG**. Zeebe broker/gateway use Zeebe Community License 1.1 (not Apache 2.0). Key restriction: _"You may not provide the software to third parties as a hosted or managed service, where the service provides users with access to any substantial set of the features or functionality of the software."_ AND specifically: "You may not use the components for providing a commercial workflow service in the cloud... if the service provides users with the ability to modify process models or deploy their own."

**For CuraOS**: CuraOS is a multi-tenant SaaS platform where tenants define and deploy their own workflow processes. **This use case is explicitly prohibited by the Zeebe Community License.** Commercial license from Camunda required. Enterprise pricing: $50K–$150K+/year entry-level, scaling to $300K–$750K+ mid-market. As of Camunda 8.6 (Oct 2024), production license key required for Operate/Tasklist/Optimize even in self-managed deployments.

**Strengths**:
1. Massive throughput — Zeebe's event-sourced partitioned architecture eliminates DB bottleneck; millions of process instances/second documented
2. Modern Web Modeler with collaborative editing (commercial)
3. Horizontal scale by adding broker partitions
4. Cloud-native by design; strong K8s operator
5. Fully code-first connectors via Zeebe gateway protocol
6. gRPC-based, language-agnostic worker protocol
7. Active feature development (task listeners in 8.8, business key in 8.9 per 2025 roadmap)

**Weaknesses**:
1. **License blocks CuraOS SaaS use case without commercial agreement** — existential risk
2. Enterprise pricing ($50K–$750K+/yr) incompatible with SMB on-prem profile
3. Architecture complexity: 5+ separate services (Zeebe broker, gateway, Operate, Tasklist, Optimize) — heavy footprint for SMB
4. Camunda 8 dropped CMMN entirely — case management not available
5. Migration from Camunda 7 requires complete rewrite (no in-place migration for existing processes)
6. No embedded mode — cannot run in single Spring Boot JVM
7. Task listeners (for HIPAA audit on task events) planned for 8.8 — not available until future release
8. Business key feature missing until 8.9

**Multi-tenant pattern**: Namespaces not supported in Zeebe for multi-tenancy — tenancy handled differently; multi-tenant support is an enterprise feature requiring commercial license.

**HIPAA fit**: Audit via Operate history. Better for developer-driven compliance than analyst-driven. PHI encryption same gap as Camunda 7.

**Self-hosted / air-gap**: Technically possible but high operational complexity. Requires Elasticsearch or OpenSearch for Operate. Not SMB-friendly.

**Recommendation**: **Disqualified** for CuraOS until commercial license negotiated. License terms explicitly prohibit CuraOS's multi-tenant SaaS model where tenants deploy their own process definitions.

---

### Option C: Flowable 7 (Apache 2.0 — actively maintained)

**Architecture**: Lean embedded Java process engine forked from Activiti (which itself forked from jBPM lineage). Multiple engines in one: BPMN, CMMN, DMN, Form, Decision, Content. Spring Boot 3.x starter available. Backed by PostgreSQL (or MySQL, H2 for tests). Flowable Open Source 7.0.0 released 2023; latest 2025.2.x (July 2025 release confirmed).

**License**: Apache 2.0 (open source engine). Flowable Enterprise provides Web Modeler, AI assistant, enhanced UI — commercial. Engine itself is free for all uses including multi-tenant SaaS.

**Strengths**:
1. **Only engine in this comparison with BPMN + CMMN + DMN + Form in one Apache 2.0 artifact** — Camunda 8 dropped CMMN; jBPM's CMMN support is partial
2. Spring Boot 3.x / Jakarta EE 9+ support confirmed and production-stable (2025.1.x targets Spring Boot 3.5.7)
3. Multi-tenant: single engine, tenant isolation via tenant-id on all APIs — same pattern as Camunda 7, same scalability characteristics
4. No managed-service license restrictions — Apache 2.0 permits CuraOS to embed, redistribute, and offer as SaaS with tenant-defined processes
5. Camunda Modeler (free desktop) can edit Flowable BPMN XML (BPMN 2.0 spec-compliant)
6. Active development: regular releases 2024 and 2025; security patches ongoing
7. Clinical and healthcare use cases documented: patient admissions, discharge planning, lab result escalation, clinical trial administration
8. Flowable CMMN supports ad-hoc case management (patient cases, insurance, complex investigations) — critical for HealthStack overlay
9. Data cleanup/housekeeping built-in since v3.11 (completed process deletion with all associated data including documents + audit entries) — GDPR right-to-erasure support
10. Embedded REST API for external system integration
11. Lower learning curve for teams with Camunda 7 experience — APIs structurally similar
12. Footprint: single JAR + PostgreSQL — excellent SMB on-prem fit

**Weaknesses**:
1. Community traction lower than Camunda — Gartner Peer Insights: Flowable rated 7.0 vs Camunda 8.4
2. Enterprise UI (Web Modeler, Work task UI) requires commercial Flowable Enterprise license
3. No native Kafka/NATS event trigger — requires custom adapter (same gap as Camunda 7)
4. Horizontal scaling limited by relational-DB architecture under very high throughput (same ceiling as Camunda 7)
5. Documentation quality uneven; some advanced topics sparsely covered compared to Camunda
6. Smaller hiring pool than Camunda 7

**Multi-tenant pattern**: Single engine instance, tenant-id propagated across all process definitions, instances, tasks. Process definitions deployable per-tenant (only visible to that tenant) or as shared definitions (visible to all tenants). Queries filtered by tenant. Structurally identical to Camunda 7 multi-tenancy.

**HIPAA fit**: Audit trail via history service. Variable encryption via custom serializer (same gap as Camunda 7 — implement once, applies to both). GDPR right-to-erasure natively supported in housekeeping API.

**Self-hosted / air-gap**: Single JAR + PostgreSQL. Best possible fit — no external service dependencies. Air-gap compatible.

**Spring/Kotlin**: `flowable-spring-boot-starter` auto-configures all engines. Spring Boot 3.5.7 confirmed in 2025.1 release. Kotlin idiomatic usage.

**FHIR ecosystem**: No native connector. Same FHIR2BPMN pipeline applicable. HL7/FHIR integration requires custom service task implementations calling HAPI FHIR R4 (ADR-0103).

**Verdict**: Strongest Apache 2.0 BPMN engine choice. Better than Camunda 7 because: still actively maintained (Camunda 7 community frozen Oct 2025), CMMN support retained, no license risk. Weaker than Camunda 7 on ecosystem size and tooling polish.

---

### Option D: Activiti 8 / Activiti Cloud (Apache 2.0 — alpha, K8s-native rewrite)

**Architecture**: Complete K8s-native rewrite from Activiti 7. Microservices-first, event-driven, Spring Boot + Spring Cloud. Activiti 8 still in alpha as of November 2025 (8.8.0 alpha). Not GA.

**Strengths**:
1. Apache 2.0
2. Cloud-native, K8s-first
3. Spring Boot integration (it is the Spring-native BPM engine)
4. Active Alfresco backing

**Weaknesses**:
1. **Not production-ready**: still in alpha releases as of 2025-11; no GA announced
2. Architecture requires full K8s deployment — incompatible with SMB on-prem single-node profile
3. Development momentum slow; community smaller than Flowable
4. CMMN support minimal in Cloud rewrite
5. Flowable has matured past Activiti for all practical use cases; Activiti 7 users are migrating to Flowable, not Activiti 8

**Verdict**: Not viable for CuraOS. Not GA, K8s-only (violates SMB footprint requirement), smaller community than Flowable.

---

### Option E: Temporal (MIT) — code-first durable execution

**Architecture**: Code-first workflow orchestration platform. Workflows written as Kotlin/Java functions. Temporal server (frontend, history, matching, worker services) backed by PostgreSQL or Cassandra. MIT licensed. Originally from Uber (Cadence fork, now independent). Production use at Snap, Datadog, Coinbase, Netflix, Box, HashiCorp, Stripe.

**License**: MIT (open source, unrestricted). Temporal Cloud (managed) available separately — not required for self-hosted.

**What Temporal is NOT**: Not a BPMN engine. No visual process designer. No human task inbox. No DMN or CMMN. Temporal workflows are code — a Kotlin function annotated `@WorkflowInterface`.

**What Temporal IS**: Durable execution engine. If a JVM crashes mid-workflow, Temporal replays from event history and continues from the exact last committed step. Retries with backoff built-in. Sagas (compensating transactions) native. Timers (months-long wait states) durable. Signals and queries for external interaction.

**Spring Boot integration**: `temporal-spring-boot-starter` (official SDK). Baeldung and multiple production references confirm Spring Boot 3.x compatibility. Auto-registers workflow/activity implementations, configures worker pools.

**Multi-tenancy**: Namespace-per-tenant (max ~10,000 namespaces, practical ceiling ~50 high-value tenants for separate namespaces); Task-Queue-per-tenant in shared namespace (recommended; supports up to 250,000 tenants per namespace); Fairness keys (new feature, probabilistic weight-based distribution). Max 20,000 task queue pollers per namespace.

**Strengths**:
1. Best-in-class durable execution: automatic retry, state persistence, replay-on-crash — no boilerplate
2. MIT license — no restrictions; CuraOS SaaS distribution fully permitted
3. Deterministic replay for testing: `TestWorkflowEnvironment` mocks time and external calls
4. Signal/query protocol for human-in-the-loop interactions (custom inbox implementation required)
5. Multi-tenant at massive scale: Task-Queue-per-tenant pattern supports 250K+ tenants
6. Cross-service saga patterns native: `Saga` helper class for compensating transactions
7. Self-hosted fully supported: Helm charts for K8s; also runs without K8s on standalone server
8. Kotlin SDK available via Java SDK (`temporal-kotlin` module)
9. Strong observability: OpenTelemetry built-in, Temporal Web UI for workflow run history
10. No shared-DB bottleneck (uses Cassandra or PostgreSQL with sharded history)

**Weaknesses**:
1. **No BPMN 2.0** — clinical pathways cannot be modeled visually by analysts; workflows are developer artifacts only
2. **No human task inbox** — must build custom task management layer on top of signals/queries
3. **No visual designer** — process is code; non-devs cannot modify without developer involvement
4. **No DMN** — decision logic must be coded, not tabularized
5. **No CMMN** — no ad-hoc case management
6. Heavier server footprint than embedded BPM engine (4 separate Temporal services + persistence)
7. Learning curve for teams without Temporal experience
8. Workflow determinism constraints require careful coding (no `System.currentTimeMillis()`, no random in workflow code)
9. Limited native compliance tooling — HIPAA audit trail must be built via activity wrappers or interceptors
10. Temporal server itself requires its own operational expertise

**Multi-tenant pattern**: **Task Queue per tenant** is the recommended approach for 1,000+ tenants. Workers subscribe to tenant-specific task queues; Temporal server routes correctly. No code change when new tenant onboards — just provision a new task queue name. Namespace-per-tenant for strict isolation (<50 tenants).

**HIPAA fit**: Activity interceptors can implement audit recording. PHI encryption via custom data converter (Temporal supports custom payload codecs — encrypt entire workflow payloads at rest). `PayloadCodec` interface encrypts serialized workflow parameters before storing in history DB. Strong fit once implemented.

**Self-hosted / air-gap**: Supported but requires running 4 Temporal services. PostgreSQL backend sufficient for medium scale. Cassandra for extreme scale. Helm charts available. Air-gap compatible.

**Verdict**: **Ideal for system-side saga orchestration and distributed cross-service flows**. Not a replacement for BPMN human-task engine — the two paradigms are complementary, not competing.

---

### Option F: Netflix Conductor / Orkes Conductor (Apache 2.0 / Orkes-led)

**Architecture**: JSON-defined workflow DSL (not BPMN). Server-side workflow engine with REST API. Workers poll for tasks. Originally Netflix OSS; now stewarded by Orkes (commercial company).

**License**: Apache 2.0 (Conductor OSS). Orkes Conductor (enterprise) commercial.

**Strengths**:
1. Apache 2.0
2. REST-first design — language-agnostic workers
3. JSON workflow DSL is developer-readable
4. Good for microservice orchestration

**Weaknesses**:
1. **Not BPMN 2.0** — no visual designer usable by clinical analysts
2. **No human task management** native
3. Community driven by Orkes commercial interests; OSS feature development may lag
4. Less Spring Boot integration than Camunda/Flowable
5. No CMMN or DMN
6. Limited healthcare ecosystem

**Verdict**: Viable for system-task orchestration but lacks BPMN and human-task capabilities required for clinical workflows. Temporal is a stronger choice for the same problem domain.

---

### Option G: Apache Airflow / Prefect / Dagster

**Architecture**: DAG-based data pipeline orchestrators. Python-first.

**Weaknesses** (for CuraOS use case):
1. Designed for data engineering pipelines, not human-task BPM
2. Python runtime; incompatible with Kotlin/JVM stack (ADR-0100)
3. No BPMN, no human task inbox, no CMMN
4. CuraOS uses these as potential reporting-cluster orchestrators (see ADR-0114 scope), not as platform BPM

**Verdict**: Out of scope. May be revisited for analytics pipeline orchestration only.

---

### Option H: SpiffWorkflow

**Architecture**: Python BPMN library (embeddable, not a server). Executes BPMN process definitions in-process.

**Weaknesses**:
1. Python only — incompatible with Kotlin/JVM (ADR-0100)
2. Library, not server — no cross-service coordination
3. Small community, limited production references

**Verdict**: Out of scope. Wrong language.

---

### Option I: jBPM / KIE Platform (Apache 2.0 / Red Hat)

**Architecture**: Drools-ecosystem BPM engine. BPMN 2.0 + DMN + CMMN + Drools rules engine. KIE Workbench (web-based designer). Spring Boot integration via KIE.

**Strengths**:
1. Only OSS platform with built-in BRMS (Drools) — DMN decision engine is first-class, not bolted on
2. BPMN + CMMN + DMN all supported
3. Apache 2.0
4. Healthcare examples exist (clinical decision support rules)

**Weaknesses**:
1. **Maintenance pace declining** — Red Hat pivoting jBPM users toward Kogito (cloud-native rewrite); jBPM 7.x in maintenance mode
2. Very heavy JVM footprint — KIE Workbench is a large WildFly-based application
3. Kogito (the successor) requires K8s-native deployment; adds complexity without clear BPMN superiority over Flowable
4. Spring Boot integration possible but less mature than Camunda or Flowable
5. Lowest community search interest of BPMN engines surveyed
6. KIE Workbench UI dated; significantly inferior UX to Camunda Modeler

**Verdict**: Not recommended. Maintenance trajectory is unfavorable; Flowable is a better-maintained Apache 2.0 alternative for the same feature set.

---

### Option J: Cadence (Uber, MIT)

**Architecture**: Predecessor to Temporal. Uber open-sourced; Temporal team forked from Cadence to create Temporal.

**Weaknesses**:
1. Temporal is the actively maintained fork — Cadence receives fewer upstream contributions
2. Java SDK less mature than Temporal's
3. Uber is primary maintainer; community smaller than Temporal's

**Verdict**: Use Temporal instead. Cadence is effectively superseded.

---

### Option K: Hybrid — Flowable (BPMN human tasks) + Temporal (code-first sagas)

**Architecture**: Two-layer workflow platform:
- **Layer 1 (Flowable)**: BPMN 2.0 + CMMN + DMN. Visual process design. Human task inbox. SLA timers. Clinical pathways. Apache 2.0.
- **Layer 2 (Temporal)**: Code-first durable execution. Cross-service sagas. Long-running system integrations. External API orchestration. MIT.

**Clear seam**: Flowable manages human-centric processes where clinicians/analysts design and monitor. Temporal manages system-centric durable orchestration where developers implement distributed transactions. Flowable can call Temporal workflows as service tasks for complex system-side steps.

**Strengths**:
1. Each layer does what it does best — no compromise on BPMN fidelity OR code-first DX
2. Flowable covers clinical pathways, case management, task inbox — HIPAA and GDPR-ready patterns
3. Temporal covers saga patterns, external API retries, cross-service compensation — resilience built-in
4. Both Apache 2.0 / MIT — no license risk
5. Both self-hostable in air-gap — no external SaaS dependency
6. Both have Spring Boot 3.x starters
7. Temporal PHI encryption via custom `PayloadCodec` — encrypts entire workflow payload including variables

**Weaknesses**:
1. Two engines to operate, monitor, and upgrade
2. Teams must understand both paradigms
3. Integration seam between layers requires careful design (Flowable service task calls Temporal workflow)
4. Higher infra footprint than single-engine approach

**Verdict**: **Recommended architecture**. See Sub-decision 7 for boundary definition.

---

### Comparison Matrix — Engine Options

| Criteria | Camunda 7 (C7) | Camunda 8 (C8) | Flowable 7 (FL) | Temporal (TMP) | Activiti 8 | jBPM/KIE | Conductor |
|---|---|---|---|---|---|---|---|
| BPMN 2.0 | Full | Full | Full | None | Full | Full | None |
| DMN | Yes | Yes | Yes | No | Partial | Yes (Drools) | No |
| CMMN | Yes | **No** | Yes | No | Partial | Yes | No |
| Human task inbox | Tasklist | Tasklist | Work UI | Custom | Custom | KIE WB | Custom |
| License | Apache 2.0 | **BSL/commercial** | Apache 2.0 | MIT | Apache 2.0 | Apache 2.0 | Apache 2.0 |
| Community frozen | **Oct 2025** | Active | Active | Active | Alpha only | Maintenance | Orkes-led |
| Spring Boot 3.x | Yes | Yes | Yes | Yes | Yes | Partial | Partial |
| Embedded (no K8s) | Yes | **No** | Yes | No (4 svcs) | **No** | Partial | No |
| Multi-tenant native | Yes | Enterprise only | Yes | Namespace/TQ | Partial | Partial | Partial |
| Self-hosted / air-gap | Excellent | Complex | Excellent | Good | K8s-only | Moderate | Moderate |
| SMB footprint | Small | Heavy | Small | Medium | Heavy | Heavy | Medium |
| SaaS license risk | None | **HIGH** | None | None | None | None | None |
| Saga / durable exec | Via BPMN | Via Zeebe | Via BPMN | Native | Via BPMN | Via BPMN | Yes |
| HIPAA audit | History svc | Operate | History svc | Interceptors | History svc | History svc | Custom |
| PHI var encrypt | Custom | Custom | Custom | PayloadCodec | Custom | Custom | Custom |
| GDPR retention | Custom | Custom | **Built-in** | Custom | Custom | Custom | Custom |
| Visual designer | Modeler | Web Modeler | Modeler | **None** | Eclipse | KIE WB | None |
| Healthcare ecosystem | High | High | Medium | Growing | Low | Medium | Low |
| GA production | Yes | Yes | Yes | Yes | **No** | Maintenance | Yes |
| CVE posture 2024 | 3 CVEs (patched) | N/A | Clean | Clean | N/A | Low | Clean |

---

### Recommendation — Engine

**Primary BPMN engine: Flowable 7 (Apache 2.0)**
**Secondary saga engine: Temporal (MIT)**

Rationale:
- Flowable 7 is the only Apache 2.0 engine with BPMN + CMMN + DMN all active and maintained post-2025. It matches the SMB footprint requirement. License permits multi-tenant SaaS with tenant-defined process definitions.
- Camunda 7 Community is frozen. Camunda 8 is disqualified by license for CuraOS's multi-tenant SaaS model.
- Temporal fills the code-first durable execution gap that BPMN engines do not address well (cross-service sagas, external API retries, long-running system orchestration).
- Two engines are justified because they serve fundamentally different stakeholder populations: Flowable for clinicians/analysts/operations teams; Temporal for engineering teams building distributed system flows.

**Open questions**:
- Can commercial Flowable Enterprise license be evaluated for Web Modeler (collaborative design)?
- Is Temporal's custom `PayloadCodec` PHI encryption sufficient, or does Flowable's history DB also need column-level PG encryption?

---

## Sub-decision 2: Process Modeling Format

### Options

**BPMN 2.0** (OMG standard XML): Industry-standard visual notation. Supported by Flowable, all tooling including Camunda Modeler. Executable by engine. Clinical pathway literature and FHIR2BPMN research use BPMN 2.0 as the canonical representation. **Primary format for human-centric processes.**

**DMN 1.3** (OMG standard): Decision Model and Notation. Tabular decision logic. Paired with BPMN — process calls decision task, DMN table evaluates rules. Use for: triage scoring, drug contraindication checks, insurance eligibility, escalation logic. Flowable includes DMN engine. **Secondary format for decision logic.**

**CMMN 1.1** (OMG standard): Case Management Model and Notation. Non-sequential, event-driven case handling. Use for: complex patient cases (multiple active care streams simultaneously), legal/insurance cases with variable lifecycle. Flowable includes CMMN engine. **Tertiary format for ad-hoc cases.**

**Code-as-process (Temporal)**: Kotlin/Java functions annotated `@WorkflowInterface`. Use for: system sagas, external API orchestration, cross-service distributed transactions. Not visible to non-dev stakeholders. **Format for system-side orchestration.**

**Custom YAML/JSON DSL**: Not recommended. Reinvents BPMN without tooling ecosystem. Avoid.

### Recommendation

Adopt all three OMG standards (BPMN 2.0 + DMN 1.3 + CMMN 1.1) in the Flowable layer, and code-first Temporal workflows in the saga layer. BPMN 2.0 XML is stored in Git (primary source of truth) and deployed to Flowable engine at startup or via deployment API. DMN tables stored alongside BPMN files. CMMN models for case-management use cases.

Process definitions are versioned in Git. Migration scripts handle running instances when definitions change.

---

## Sub-decision 3: Designer / Modeler Tool

### Options

**Camunda Modeler** (free desktop app, Apache 2.0 tooling): The best-in-class BPMN 2.0 + DMN desktop editor. Runs on macOS/Windows/Linux. Produces spec-compliant BPMN 2.0 XML compatible with both Camunda 7 and Flowable (same BPMN 2.0 standard). Free, no license restriction. CMMN support exists but limited in current versions. **Recommended for developers and advanced analysts.**

**bpmn-js** (Camunda, MIT): Browser-based BPMN 2.0 renderer and editor toolkit. Powers Camunda Web Modeler and many third-party tools. 9,000+ GitHub stars. Can be embedded in CuraOS App/Site Builder as a custom workflow designer component. Produces standard BPMN 2.0 XML. **Recommended for in-product embedded designer.**

**Camunda Web Modeler** (commercial, part of Camunda 8): Collaborative, cloud-based. Requires Camunda 8 commercial license. Not available standalone. Not viable given C8 license decision.

**Flowable Designer**: Flowable Enterprise includes a web-based modeler. Commercial license required for Flowable Enterprise. OSS-only Flowable does not include a web modeler. Can use Camunda Modeler for Flowable (same BPMN XML).

**KIE Workbench**: Heavy, WildFly-based, outdated UX. Not recommended.

**Eclipse BPMN2 Modeler**: Desktop plugin, dated, poor UX compared to Camunda Modeler. Not recommended.

### Recommendation

**Dual approach**:
1. **Camunda Modeler** (desktop, free): Primary tool for developers and technical analysts creating/editing process definitions. Committed to Git, deployed via Flowable deployment API.
2. **bpmn-js embedded in CuraOS App/Site Builder**: In-product web-based viewer and editor for non-technical process designers. CuraOS engineers build a thin React wrapper around bpmn-js that reads/writes BPMN XML to `workflow-core-service`. This gives CuraOS-branded designer without commercial license dependency.

Clinical process definitions authored in Camunda Modeler by BPM specialists → committed to Git → deployed to `workflow-core-service` Flowable engine via Flowable Deployment API (REST POST) at service startup or CI/CD trigger. Non-dev users view and make minor edits via embedded bpmn-js in the App/Site Builder UI.

CMMN models: Camunda Modeler has limited CMMN support; use Flowable's built-in CMMN editor (OSS, available as standalone component in their documentation) or a text editor for CMMN XML.

---

## Sub-decision 4: Per-Tenant Scaling

### Options

**A: Single engine cluster, tenant-id as process variable**: No engine-level multi-tenancy. All tenants share same process tables. Tenant filtering done at application layer. **Risk: data leakage if application layer misconfigured. Not acceptable for HIPAA.**

**B: Single cluster, Flowable tenant-id API (first-class)**: Flowable's native multi-tenancy. All deployments, process definitions, instances, tasks, and history tagged with `tenantId`. APIs filter by tenant. Shared tables with row-level tenant column. Supported in Flowable 6+ and Flowable 7. **Recommended for SaaS profile.**

**C: Schema-per-tenant (Flowable + PostgreSQL schemas)**: Separate PG schema per tenant. Flowable engine configured with per-tenant `databaseTablePrefix` or separate engine instance per schema. More isolated but operationally heavy (1,000 tenants = 1,000 schemas). Viable for small tenant count. Not viable at 10,000+ tenants.

**D: Engine-per-tenant (separate JVM per tenant)**: Maximum isolation. Prohibitive resource cost. Only for highest-security single-tenant deployments (e.g., government air-gap installations).

**E: Temporal namespace-per-tenant**: For the Temporal saga layer. Namespace-per-tenant practical for <50 high-value tenants. Task-Queue-per-tenant for mass-market SaaS (250K+ tenants). These are orthogonal choices — Temporal and Flowable have independent multi-tenant configurations.

### Recommendation

**Flowable layer**: Flowable native tenant-id API (Option B) for SaaS profile. Schema-per-tenant (Option C) available as override for regulated-sector deployments requiring physical schema separation (e.g., HIPAA Business Associate with strict isolation requirements). `workflow-core-service` must propagate `tenantId` from Keycloak JWT (ADR-0104) to every Flowable API call. A Flowable `TenantInfoHolder` bean resolves tenant from Spring Security context.

**Temporal layer**: Task-Queue-per-tenant (Temporal's recommended pattern) for SaaS profile. New tenant onboarding provisions a task queue name (`workflow-{tenantId}`). Workers subscribe to tenant-specific queues. Namespace isolation for highest-tier tenants.

**Access control enforcement**: APISIX gateway (ADR-0103) validates `tenantId` claim on every inbound request. `workflow-core-service` enforces tenant boundary via Flowable `TenantInfoHolder` before any engine API call. No cross-tenant query possible without explicit shared-definition flag.

---

## Sub-decision 5: Human Task Inbox (Task List UI)

Clinicians, care coordinators, procurement managers, and admin staff need a unified task inbox showing all pending human tasks across all running BPM instances assigned to them.

### Options

**A: Flowable Task UI (OSS)**: Flowable open-source REST API exposes task queries (`/flowable-rest/service/runtime/tasks`). A custom SPA or the embedded App/Site Builder UI queries this API to render inbox. Full control, no license dependency.

**B: Flowable Work (Enterprise)**: Flowable's commercial task UI. Full-featured inbox, collaboration, document management. Requires Flowable Enterprise license. Evaluate cost vs build cost.

**C: Camunda Tasklist (Camunda 7)**: Not applicable — Camunda 7 engine not selected. Camunda 8 Tasklist is commercial.

**D: Aggregate via Cosmo GraphQL federation**: `workflow-core-service` exposes GraphQL schema for tasks. Cosmo supergraph (ADR-0103) federates task data with healthstack-task-service, personal-task-service. Task inbox in App/Site Builder queries supergraph — unified task list across BPM and non-BPM tasks.

### Recommendation

**Option D (federated GraphQL task inbox)** as the primary integration pattern, with **Option A (Flowable REST)** as the underlying data source.

Architecture: `workflow-core-service` exposes task data via GraphQL subgraph (DGS framework, ADR-0103). Cosmo supergraph federates with other task producers (healthstack scheduling, personal care reminders). App/Site Builder renders a unified clinical inbox via supergraph query. Flowable REST API is internal — not exposed through APISIX gateway directly. This ensures task inbox is CuraOS-branded, extensible, and not tied to Flowable's UI.

Fallback: For early development, Flowable Swagger UI (`/flowable-rest`) provides task management for engineering testing without custom UI.

---

## Sub-decision 6: Integration with App/Site Builder and Workflow Services

### Architecture: Shared Engine vs Per-Service Engine

**Option A: Single central `workflow-core-service` hosts Flowable engine**: All four workflow service scaffolds (`workflow-core`, `healthstack-workflow`, `business-workflow`, `personal-workflow`) connect to one Flowable engine via REST or shared Spring Boot embedded engine in `workflow-core-service`. Vertical services add domain-specific BPMN definitions and task handlers — they do not host engines.

**Option B: Each workflow service hosts its own Flowable engine instance**: Maximum isolation. High resource overhead. Operational complexity (4 separate Flowable databases). Definition sharing across services difficult.

**Recommendation**: Option A. Single Flowable engine instance in `workflow-core-service`. Vertical workflow services (`healthstack-workflow-service`, `business-workflow-service`, `personal-workflow-service`) contribute:
- BPMN/CMMN/DMN definition files (deployed to shared engine at startup via Flowable Deployment API)
- `JavaDelegate` / `FlowableListener` Spring beans (registered in `workflow-core-service`'s application context via component scan of shared library module or remote service task via Flowable HTTP Task)
- Event listeners (consuming Kafka/NATS for event-triggered processes)

### Where BPMN Definitions Live

**Git is source of truth.** Structure:
```
ai/curaos/backend/services/workflow-core-service/processes/
├── core/          # neutral process templates
├── healthstack/   # clinical pathways (healthstack-workflow-service contributes)
├── business/      # procurement, sales, fulfillment
└── personal/      # patient-facing flows, consent, enrollment
```

Definitions deployed to Flowable engine via deployment API at `workflow-core-service` startup (auto-deploy from classpath) and via CI/CD pipeline on definition change (zero-downtime redeployment via Flowable versioning — new version deployed, in-flight instances continue on old version, new instances start on new version).

### App/Site Builder Integration

App/Site Builder reads process definitions via `workflow-core-service` GraphQL API:
- `processDefinitions(tenantId)` — list deployable process templates
- `startProcessInstance(processDefKey, tenantId, variables)` — launch a process
- `tasksByAssignee(userId, tenantId)` — unified task inbox

For each human task form, `workflow-core-service` exposes a form schema (Flowable Form Engine or JSON schema stored in process variable) which App/Site Builder renders using its form-rendering primitives. BPMN `<userTask>` elements reference form keys; `workflow-core-service` resolves form definitions and returns them to the builder.

### Temporal Integration

Flowable service tasks can invoke Temporal workflows via a custom `JavaDelegate` that calls the Temporal `WorkflowClient` (Spring-injected). Pattern:

```kotlin
// FlowableToTemporalDelegate.kt
class StartSagaDelegate(val workflowClient: WorkflowClient) : JavaDelegate {
    override fun execute(execution: DelegateExecution) {
        val saga = workflowClient.newWorkflowStub(OrderFulfillmentSaga::class.java, ...)
        WorkflowClient.start(saga::execute, execution.getVariable("orderId"))
        execution.setVariable("sagaWorkflowId", WorkflowExecution.workflowId)
    }
}
```

Flowable process waits for saga completion via a signal event or polls via timer.

---

## Sub-decision 7: Workflow Engine vs Work-Queue Boundary

### The three-layer execution model

| Layer | Tool | Use for | Not for |
|---|---|---|---|
| **Work queue** | Jobrunr (ADR-0102) | Fire-and-forget jobs, scheduled tasks, idempotent batch operations | Long-running stateful processes, human approval chains |
| **BPM / BPMN** | Flowable | Human-task processes, clinical pathways, case management, SLA-bounded approval chains | High-frequency system tasks, saga compensation |
| **Durable execution** | Temporal | Cross-service sagas, external API orchestration, long-running integrations, compensating transactions | Human-facing task inbox, visual process design |

### Boundary rules

**Jobrunr handles**:
- Send email/SMS notification after event
- Generate and store a PDF report
- Batch import of lab results from external system
- Scheduled cleanup of expired session tokens
- Resend failed webhook delivery (retry job)
- Async image processing (compress + store in SeaweedFS)

**Flowable handles**:
- Patient admission workflow (check-in → insurance verify → room assignment → notify care team)
- Clinical encounter lifecycle (start encounter → orders → meds → documentation → billing code)
- Care plan enrollment (patient consent → care team assignment → goal setting → monitoring loop)
- Procurement approval chain (requisition → budget check → manager approval → PO generation)
- Employee onboarding (HR paperwork → IT provisioning → manager intro → system access grants)
- Escalation chains (SLA timer → notify supervisor → SLA breach → management alert)

**Temporal handles**:
- Claims submission saga (submit claim → check clearinghouse → reconcile payment → update AR → compensate on failure)
- Patient data sync saga (create patient in local PG → create FHIR resource in HAPI FHIR → sync to external EHR → compensate on partial failure)
- Order fulfillment saga (reserve inventory → charge payment → dispatch → confirm → release holds on failure)
- Long-poll integration (poll external lab system every 15 min for 72 hours until result arrives)
- Cross-tenant data migration (multi-step with compensation on each step)

### Decision rule

"If a non-developer stakeholder needs to see, design, or interact with the process visually → Flowable BPMN."
"If the process has more than 3 cross-service writes that must be atomic or compensated → Temporal saga."
"If the task is discrete, stateless, and completes in <5 minutes with no human interaction → Jobrunr."

---

## Cross-Cutting Concerns

### 1. PHI Variable Encryption

**Problem**: Flowable stores process variables (including PHI) as serialized bytes in `ACT_RU_VARIABLE` and `ACT_HI_VARINST` tables in PostgreSQL. PHI must not be plaintext at rest.

**Solution**: Implement a custom Flowable `TypedValueSerializer` that encrypts variable values before writing and decrypts on read. Use AES-256-GCM with tenant-specific key material (keys stored in Keycloak's vault or Hashicorp Vault integration). Variables marked with a custom annotation `@PHIVariable` in the process BPMN extension element trigger encryption. Non-PHI variables stored plaintext for performance.

For Temporal: The `PayloadCodec` interface encrypts the entire workflow payload (including activity parameters and results) before persisting to Temporal's history DB. Implement `EncryptionPayloadCodec` with AES-256-GCM, key per tenant retrieved from key management service on codec initialization.

### 2. Audit (Hash-Chained Log per ADR-0104)

Every task action (claim, complete, delegate, escalate, reassign) in Flowable generates a Flowable history event. A `HistoryEventHandler` bean captures these and emits them to the hash-chained audit service (ADR-0104 pattern). Events include: `taskId`, `processInstanceId`, `processDefinitionKey`, `tenantId`, `userId`, `action`, `timestamp`, `variableSnapshot` (encrypted PHI omitted, reference token included).

For Temporal: Activity completion events carry correlation IDs. A Temporal worker interceptor (`WorkerInterceptor`) wraps every activity execution and emits start/complete/fail events to audit service.

### 3. GDPR Retention and Right to Erasure

**Flowable**: Use Flowable's built-in housekeeping API (available since OSS version 3.11). Retention policy configured per process definition key: `DELETE_COMPLETED_AFTER_DAYS`. On DSAR (Data Subject Access Request), `workflow-core-service` queries history service for all process instances linked to `subjectId` variable, returns summary, then executes bulk delete via housekeeping API. Deletion cascades to all associated tasks, variables, history entries, and documents.

**Temporal**: Workflow history for closed workflow runs can be deleted via Temporal's `DeleteNamespace` API or `TerminateWorkflowExecution` + `RequestCancelWorkflowExecution`. Implement a `DataSubjectErasureWorkflow` in Temporal that receives `subjectId` signal and deletes all associated workflow history entries.

### 4. SLA Timer Reliability

Flowable timer events persist timer state in `ACT_RU_TIMER_JOB` table. Timer acquisition runs on dedicated thread pool; timers survive JVM crashes because they are DB-persisted. Async executor (Spring-managed thread pool) acquires and executes due timers. For multi-node `workflow-core-service` deployments, timer acquisition uses optimistic locking to prevent double-fire. **Reliable as long as PostgreSQL is available.** Configure `flowable.async-executor-activate=true` and tune `flowable.async-executor-core-pool-size`.

### 5. Process Definition Versioning

Flowable supports process definition versioning natively. Each deployment creates a new version of a process definition (keyed by `processDefinitionKey`). By default, new process instances start on the latest version. In-flight instances continue on the version they were started with — no forced migration. Migration API (`ProcessInstanceMigrationBuilder`) available for explicit instance migration to new version when definition changes are additive. For breaking changes (removal of task, renamed gateway), migration script required; validate against in-flight instances before deployment.

### 6. Event-Driven Process Triggers (Kafka/NATS → Flowable)

Flowable processes triggered by external events (ADR-0102 Kafka/NATS messages):
- **Start event trigger**: Kafka consumer in `workflow-core-service` receives event, calls `RuntimeService.startProcessInstanceByMessage(messageName, tenantId, businessKey, variables)`.
- **Intermediate message catch**: Flowable waits on a message catch event; Kafka consumer calls `RuntimeService.createExecutionQuery().messageEventSubscriptionName(name).processInstanceId(id).singleResult()` then `RuntimeService.messageEventReceived(messageName, executionId, variables)`.
- **Idempotency**: Kafka consumer tracks message offsets + `messageId` in dedupe table (`workflow_event_dedup`) before triggering process. Duplicate messages silently skipped.

NATS JetStream triggers follow same pattern via NATS Java client consumer.

### 7. Observability and Span Propagation

Flowable executes process steps synchronously or via async executor threads. Correlation ID from HTTP request or Kafka message header must propagate through all steps.

**Implementation**: A Flowable `ExecutionListener` on every task captures the active OpenTelemetry span context from MDC and stores it in a process variable `__spanContext`. Async executor threads restore span context from this variable before executing delegates. Temporal: `WorkflowClientInterceptor` propagates span context via workflow header on every call.

All workflow step traces reported to Jaeger/OTLP collector (ADR-0100 observability stack). Parent trace spans workflow lifecycle; child spans cover individual task executions.

### 8. Backup and Restore

Flowable state lives entirely in PostgreSQL (`ACT_*` tables, `FLW_*` tables). Covered by ADR-0101 PostgreSQL backup strategy (WAL archiving + base backup). No additional backup mechanism required for Flowable.

Temporal state lives in separate PostgreSQL database (`temporal` schema). Same WAL archiving applies. Temporal UI and history can be recovered from WAL replay. Test restore procedure quarterly.

### 9. Testing Strategy

**Flowable unit tests**: Use `FlowableRule` JUnit 5 extension + in-memory H2 database. Deploy BPMN file, start process, assert task states, complete tasks programmatically. Use `JobTestHelper.waitForJobExecutorToProcessAllJobs()` for timer tests.

**Temporal unit tests**: `TestWorkflowEnvironment` mocks all external activities, controls time (`testEnv.sleep(Duration.ofDays(7))`). Deterministic replay guaranteed by determinism checker. `@WorkflowTest` JUnit 5 extension.

**Integration tests**: Real Flowable + PostgreSQL via Testcontainers. Real Temporal server via `temporal-testing` server embedded in JVM. Kafka/NATS via Testcontainers. Process definitions deployed from test classpath. Full flow tested including event triggers, timer fires, task completion.

**Contract tests**: Flowable REST API contract captured as Pact consumer contracts; verified against live `workflow-core-service` in CI.

---

## Recommendation Summary

### Decisions

| Sub-decision | Decision |
|---|---|
| Primary BPMN engine | **Flowable 7** (Apache 2.0, embedded Spring Boot) |
| Saga / durable execution engine | **Temporal** (MIT, self-hosted) |
| Work queue (short jobs) | **Jobrunr** (already decided, ADR-0102) |
| Process modeling format | **BPMN 2.0** (primary) + **DMN 1.3** (decisions) + **CMMN 1.1** (cases) |
| Desktop designer | **Camunda Modeler** (free, Apache tooling license) |
| Embedded in-product designer | **bpmn-js** (MIT, embedded in App/Site Builder) |
| Multi-tenancy (Flowable) | Flowable native tenant-id API; schema-per-tenant option for regulated deployments |
| Multi-tenancy (Temporal) | Task-Queue-per-tenant (mass market); Namespace-per-tenant (<50 high-value) |
| Engine hosting | Single `workflow-core-service` hosts Flowable; Temporal server separate deployment |
| Task inbox | Cosmo GraphQL federated task inbox; Flowable REST as data source |
| PHI encryption | Custom `TypedValueSerializer` (Flowable) + `PayloadCodec` (Temporal) with AES-256-GCM |
| GDPR retention | Flowable housekeeping API + Temporal history deletion |
| Audit | `HistoryEventHandler` (Flowable) + `WorkerInterceptor` (Temporal) → ADR-0104 hash-chained log |
| Camunda 8 | **Disqualified** — Zeebe Community License prohibits multi-tenant SaaS with tenant-defined processes |

### Architecture Diagram (textual)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CuraOS Workflow Platform                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │          HUMAN-CENTRIC LAYER  (Flowable 7 / Apache 2.0)     │   │
│  │                                                             │   │
│  │  BPMN 2.0 processes  │  CMMN cases  │  DMN decisions       │   │
│  │                                                             │   │
│  │  workflow-core-service (Flowable engine embedded)           │   │
│  │    ├── healthstack/: admission, encounter, discharge flows  │   │
│  │    ├── business/:   procurement, fulfillment, cases         │   │
│  │    └── personal/:   consent, enrollment, care plan          │   │
│  │                                                             │   │
│  │  Human task inbox ──► Cosmo GraphQL supergraph             │   │
│  │  bpmn-js designer ──► App/Site Builder UI                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │ service task calls                                        │
│          ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │      SAGA / DURABLE EXECUTION LAYER  (Temporal / MIT)       │   │
│  │                                                             │   │
│  │  Cross-service sagas  │  External API orchestration         │   │
│  │  Long-poll integrations │ Compensating transactions         │   │
│  │                                                             │   │
│  │  Temporal server (self-hosted, PostgreSQL backend)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │ fire-and-forget discrete jobs                             │
│          ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │      WORK QUEUE LAYER  (Jobrunr / ADR-0102)                 │   │
│  │                                                             │   │
│  │  Email/SMS dispatch  │  Report generation  │  Batch ops     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─── Cross-cutting ──────────────────────────────────────────┐    │
│  │  Kafka/NATS event triggers (ADR-0102)                      │    │
│  │  Keycloak tenant-id propagation (ADR-0104)                 │    │
│  │  PHI encryption: TypedValueSerializer + PayloadCodec       │    │
│  │  Hash-chained audit log (ADR-0104)                         │    │
│  │  OpenTelemetry span propagation                            │    │
│  │  PostgreSQL WAL backup (ADR-0101)                          │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

1. **Flowable Enterprise evaluation**: Should Flowable Enterprise (commercial license) be evaluated for Web Modeler and enhanced Work UI? What is Flowable Enterprise pricing for self-hosted unlimited tenant use? If pricing is acceptable, it eliminates the need to build bpmn-js embedded designer from scratch.

2. **Camunda Modeler + CMMN**: Camunda Modeler desktop has limited CMMN authoring support compared to its BPMN support. Is CMMN required immediately for HealthStack launch, or can it be deferred until a more capable CMMN editor is identified?

3. **Flowable single-engine tenancy ceiling**: At what tenant count does the Flowable shared-engine tenant-id pattern require horizontal partitioning (multiple engine instances with a routing layer)? What is the PostgreSQL row-level write throughput ceiling for `ACT_RU_TASK` + `ACT_HI_TASKINST` tables under SaaS load?

4. **Temporal server sizing for SMB on-prem**: Temporal requires 4 services (frontend, history, matching, worker). Can Temporal be run in a combined single-process mode for SMB deployments where resource constraints are severe? (Temporal does support `all-in-one` Docker image for dev; is it production-stable?)

5. **Flowable vs Temporal for long-running human processes**: A clinical care plan may run for months with periodic human check-ins. Is Flowable's timer-based approach (intermediate timer events polling for check-in dates) robust enough, or should long-running patient-facing loops be implemented in Temporal with Flowable handling the UI tasks only?

6. **PHI encryption key management**: What key management service is used for `TypedValueSerializer` and `PayloadCodec` encryption keys? Hashicorp Vault (self-hosted, ADR not yet written), Keycloak vault SPI, or in-DB tenant key table? This ADR defers to the secrets/vault ADR (0110-secrets-vault, not yet written).

7. **FHIR PlanDefinition → BPMN auto-generation**: The MSBPMN project (GitHub: FHOOEAIST/MSBPMN) automates transformation between FHIR PlanDefinition and BPMN 2.0. Should CuraOS adopt this toolchain for HealthStack clinical pathway authoring (clinicians author in FHIR PlanDefinition; system generates BPMN)? Or is direct BPMN authoring in Camunda Modeler preferred?

8. **Flowable multi-engine for vertical isolation**: As HealthStack, ERP, and EducationStack grow, should each vertical eventually get its own Flowable engine instance for complete process isolation (at the cost of higher resource usage)? When is that threshold reached?

9. **Jobrunr ↔ Flowable boundary in care plan monitoring**: A care plan monitoring job fires daily for each enrolled patient. Is this a Jobrunr recurring job that calls Flowable task completion APIs, or an active Flowable timer event per patient? The latter creates one long-lived process instance per patient — what is the memory/DB cost at 100,000 enrolled patients?

10. **Camunda 7 migration path**: Several existing Camunda 7 customers use standard APIs. If CuraOS wants to offer a migration tool that imports Camunda 7 process definitions and instance state into Flowable, how much of the BPMN XML and database schema is compatible? Is this a value-add for the healthcare market?

11. **Audit granularity on process variables**: ADR-0104 hash-chained audit requires every action logged. Should every process variable *change* be logged (not just task actions)? This creates very high audit volume for processes with many variables. Define a minimum audit event set vs. full variable audit.

12. **Temporal determinism enforcement**: Workflow code must be deterministic (no `Random`, no `System.currentTimeMillis()`, no direct external calls). How is this enforced in CI? Temporal provides a determinism checker but it runs at test time — what static analysis gates prevent non-deterministic code from reaching production?

---

## References

### Camunda 7 EOL and Licensing
- [Camunda 7 Enterprise End of Life Extension (Feb 2025)](https://camunda.com/blog/2025/02/camunda-7-enterprise-end-of-life-extension/)
- [Camunda 7 Community Edition EOL Forum Discussion](https://forum.camunda.io/t/camunda-7-community-edition-end-of-life/48995)
- [Migrating Solutions from Camunda 7 to Camunda 8 — Strategy Update](https://camunda.com/blog/2025/02/migrating-solutions-camunda-7-camunda-8-strategy-update/)

### Camunda 8 / Zeebe Licensing
- [Zeebe License Overview and FAQ (Camunda Official)](https://camunda.com/legal/terms/cloud-terms-and-conditions/zeebe-license-overview-and-faq/)
- [Licensing Update for Camunda 8 Self-Managed (Apr 2024)](https://camunda.com/blog/2024/04/licensing-update-camunda-8-self-managed/)
- [Camunda Licensing: What You Need to Know (Oct 2024)](https://camunda.com/blog/2024/10/camunda-licensing-what-you-need-to-know/)
- [Camunda 8 Docs: Licenses](https://docs.camunda.io/docs/reference/licenses/)

### Flowable
- [Flowable Open Source 7.0.0 Release](https://www.flowable.com/blog/releases/flowable-open-source-7-0-0-release)
- [Flowable Spring Boot Documentation](https://www.flowable.com/open-source/docs/bpmn/ch05a-Spring-Boot)
- [Flowable 2025.1.x Release Notes](https://documentation.flowable.com/latest/admin/release-notes/2025.1.01-release)
- [Flowable Clinical Workflow Automation Blog](https://www.flowable.com/blog/business/transforming-clinical-workflow-automation-the-flowable-way)
- [Flowable CMMN Documentation](https://www.flowable.com/open-source/docs/cmmn/ch06-cmmn)
- [Flowable Data Cleanup / Housekeeping](https://documentation.flowable.com/latest/howto/howto/howto-housekeeping)

### Camunda vs Flowable Comparisons
- [Camunda vs Flowable: BPM Engine Comparison (ONLU AG)](https://onlu.ch/en/camunda-vs-flowable-a-comparison-of-bpm-engines/)
- [BPM Evolution 2025: Camunda 7 to CIB Seven and Beyond](https://onlu.ch/en/bpm-evolution-2025-from-camunda-7-to-cib-seven-cib-flow-to-camunda-8/)
- [Camunda and Flowable: Process and Workflow Automation Platforms (Medium/Version 1)](https://medium.com/version-1/camunda-and-flowable-process-and-workflow-automation-platforms-bf4fae4f00ed)
- [Camunda vs Flowable 2024 Gartner Peer Insights](https://www.gartner.com/reviews/market/business-process-automation-tools/compare/camunda-vs-flowable)

### Temporal
- [Temporal Multi-Tenant Application Patterns (Official Docs)](https://docs.temporal.io/production-deployment/multi-tenant-patterns)
- [Temporal Multi-Tenancy Feature Overview](https://docs.temporal.io/evaluate/development-production-features/multi-tenancy)
- [Temporal Spring Boot Integration (Official Docs)](https://docs.temporal.io/develop/java/spring-boot-integration)
- [Temporal Workflow Engine with Spring Boot (Baeldung)](https://www.baeldung.com/spring-boot-temporal-workflow-engine)
- [Camunda vs Temporal Detailed Comparison (Rosetta Digital)](https://rosettadigital.com/camunda-vs-temporal/)
- [Temporal Cloud vs Self-Hosted 2026 (Automation Atlas)](https://automationatlas.io/guides/temporal-cloud-vs-self-hosted-2026/)

### Camunda Multi-Tenancy
- [Camunda 7 Multi-Tenancy Documentation](https://docs.camunda.org/manual/7.5/user-guide/process-engine/multi-tenancy/)
- [Building Multi-Tenancy Platform Using Camunda BPM (DEV Community)](https://dev.to/lakshminarayan_r_6f07f9c0/building-a-multi-tenancy-platform-using-camunda-bpm-5g02)

### BPMN + FHIR Healthcare Integration
- [FHIR2BPMN: Delivering Actionable Knowledge (PubMed 35575842)](https://pubmed.ncbi.nlm.nih.gov/35575842/)
- [MSBPMN: Standards-based Model Transformation FHIR ↔ BPMN 2.0 (GitHub)](https://github.com/FHOOEAIST/MSBPMN)
- [Semantic Integration of BPMN Models and FHIR Data for Decision Support](https://ouci.dntb.gov.ua/en/works/98pw8ka9/)

### Security / CVEs
- [Camunda 7 Security Notices](https://docs.camunda.org/security/notices/)
- [Camunda Security CVE Details](https://www.cvedetails.com/product/82016/Camunda-Modeler.html?vendor_id=23044)

### bpmn-js (Embedded Designer)
- [bpmn-js BPMN 2.0 Toolkit (bpmn.io)](https://bpmn.io/toolkit/bpmn-js/)
- [bpmn-js GitHub Repository (MIT)](https://github.com/bpmn-io/bpmn-js)
- [Automating Clinical Protocols Using BPMN (Medium)](https://medium.com/@brijesh_deb/automating-clinical-protocol-using-business-process-models-d0a72e4ca64d)

### jBPM
- [Camunda vs Flowable vs jBPM Comparison (SourceForge)](https://sourceforge.net/software/compare/Camunda-vs-Flowable-vs-jBPM/)
- [jBPM vs Flowable (SoftStrix)](https://softstrix.com/jbpm-vs-flowable/)

### Activiti
- [Activiti GitHub (Apache 2.0)](https://github.com/Activiti/Activiti)
- [Activiti.org](https://www.activiti.org/)

### Workflow Orchestration Comparisons
- [Workflow Orchestration Showdown: Temporal vs Conductor vs Camunda (Medium)](https://medium.com/@easwaranvijayakumar/workflow-orchestration-showdown-temporal-io-vs-orkes-conductor-vs-camunda-e59fd79c2b65)
- [Comparing Top Workflow Engines: Camunda vs Airflow vs Temporal (NGXP Tech)](https://ngxptech.com/comparing-top-workflow-engines-camunda-vs-apache-airflow-vs-temporal/)
- [Camunda vs Temporal Compared April 2026 (Automation Atlas)](https://automationatlas.io/guides/camunda-vs-temporal-2026-comparison/)
- [Temporal Alternatives for Enterprise (Akka blog)](https://akka.io/blog/temporal-alternatives)

### Healthcare Compliance
- [Healthcare Automation: Camunda Solutions](https://camunda.com/solutions/industry/healthcare/)
- [Microservices in Healthcare: Camunda BPM (Vicert)](https://insights.vicert.com/microservices-in-healthcare/)

---

*ADR-0105 — Last updated: 2026-05-24*
