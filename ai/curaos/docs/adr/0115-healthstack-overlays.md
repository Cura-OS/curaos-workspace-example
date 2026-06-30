# ADR-0115 — HealthStack Overlays: Tech Stack Decisions

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: HAPI FHIR + Snowstorm + dcm4chee STAY as JVM sidecars (CuraOS HealthStack NestJS core wraps them via HTTP/admin REST); Flowable → Temporal per ADR-0122 (clinical pathways = Temporal workflows; FHIR PlanDefinition compiled to CuraOS IR → Temporal TS); CDS Hooks remain as JVM sidecar. OHIF Viewer + CQL + SanteMPI + MONAI + Da Vinci IGs stand. Local + 3rd-party rule applies (Medplum Cloud / Smile CDR / Google Healthcare DICOM / external EHR FHIR endpoint as 3rd-party options). Patient-centric per ADR-0099 §15.


| Field        | Value                                      |
|--------------|--------------------------------------------|
| Status       | Accepted                                   |
| Date         | 2026-05-24                                 |
| Authors      | CuraOS Architecture Guild                  |
| Supersedes   | —                                          |
| Superseded by| —                                          |
| Relates to   | ADR-0100 through ADR-0114 (all apply as baseline) |

---

## 1. Status

**Accepted.** All sub-decisions in this ADR are binding for HealthStack overlay services. Revisit triggers: FHIR R6 normative ballot completes (expected 2027), HIPAA Security Rule Final Rule publishes and 240-day clock starts, or any sub-decision's chosen tool reaches end-of-life.

---

## 2. Context

### 2.1 What HealthStack Is

HealthStack is the healthcare vertical overlay for CuraOS. It is an opt-in layer: tenants who do not activate HealthStack receive a clean neutral-core CuraOS deployment. HealthStack extends, never forks, the neutral core per workspace charter §3.

The overlay spans approximately 21 microservices:

- **Patient & Encounter**: healthstack-patient-service, healthstack-encounter-service
- **Scheduling**: healthstack-scheduling-service, healthstack-clinical-scheduling-service
- **Clinical Documentation**: healthstack-notes-service, healthstack-problems-service
- **Orders & Results**: healthstack-orders-service, healthstack-lab-service, healthstack-observations-service
- **Medications**: healthstack-meds-service
- **Imaging**: healthstack-imaging-service
- **Interoperability**: healthstack-interop-service
- **Care Coordination**: healthstack-careplans-service, healthstack-workflow-service
- **Claims & Finance**: healthstack-claims-service
- **Regulatory & Safety**: healthstack-consent-service, healthstack-quality-service, healthstack-audit-service
- **Specialty**: healthstack-ems-service, healthstack-terminology-service, healthstack-devices-service
- **Education**: healthstack-education-service (clinical education, not EdStack)

All 21 services share a common FHIR layer and HIPAA controls defined in this ADR.

### 2.2 Baseline (ADRs 0100–0114 apply unchanged)

| Concern                | Chosen Stack (from prior ADRs)                                        |
|------------------------|-----------------------------------------------------------------------|
| Runtime                | Kotlin + Spring Boot 3.4 + JVM 21 (ADR-0100)                         |
| Primary DB             | PostgreSQL 17 (ADR-0101)                                              |
| Cache                  | Valkey (ADR-0101)                                                     |
| Object storage         | SeaweedFS (ADR-0101)                                                  |
| Search                 | ParadeDB / OpenSearch (ADR-0101)                                      |
| Messaging              | Kafka 4.x / NATS + Jobrunr + Debezium + Apicurio (ADR-0102)          |
| API layer              | Spring MVC + virtual threads + DGS/Cosmo + APISIX + HAPI FHIR (ADR-0103) |
| Identity               | Keycloak 26+ SMART-on-FHIR + hybrid auth (ADR-0104)                  |
| BPM                    | Flowable 7 + Temporal (ADR-0105)                                      |
| Frontend               | React / Flutter / Astro (ADR-0106)                                    |
| Observability          | Tempo + VictoriaMetrics + Loki + Grafana + OTel (ADR-0107)            |
| Security platform      | OpenBao + Tink + Opengrep + SonarQube + Trivy + Coraza + Falco + Tetragon + cert-manager + Wazuh (ADR-0108) |
| Containers             | K3s/Talos + Cilium + ArgoCD/Flux + Capsule + vCluster + Harbor (ADR-0109) |
| CI/CD                  | GHA + ARC + Atlas + Renovate + cosign/SLSA + vCluster previews (ADR-0110) |
| Infra                  | Ansible + Talos + Tinkerbell + ClusterAPI + Karmada + NetBird + Velero + Crossplane + KEDA (ADR-0111) |
| i18n                   | Weblate + ICU MF1 + next-intl + Paraglide + flutter intl + Moneta + Helsinki-NLP (ADR-0112) |
| Analytics              | ClickHouse + Iceberg + SQLMesh + Superset + Cube + ECharts + Jobrunr + Gotenberg + Pathling + OpenDP (ADR-0113) |
| AI                     | vLLM + SGLang + Qwen3/DeepSeek/Phi4 + pgvector + Qdrant + SpringAI + LangGraph4j + LiteLLM + MCP + Langfuse + Presidio (ADR-0114) |

This ADR adds only the healthcare-vertical-specific stack on top of that foundation.

### 2.3 Deployment Models

All four deployment models from AGENTS.md §4 must remain viable:

- **Cloud SaaS** — multi-tenant PG schema isolation; HealthStack overlays activate per tenant subscription
- **On-Prem** — single tenant; all FHIR + imaging + terminology services run locally; no outbound calls required
- **Hybrid** — control plane vendor-managed; data plane (including FHIR store + imaging) on customer infra
- **Air-Gap** — full offline operation; terminology snapshots bundled in release artifacts; no tx.fhir.org calls

### 2.4 Regulatory Baseline

| Regulation                     | Scope                                      | Status (2026-05-24)                       |
|--------------------------------|--------------------------------------------|-------------------------------------------|
| HIPAA Security Rule (2025 NPRM)| All US ePHI handling                       | NPRM published Jan 2025; final rule expected mid-2026; 240-day compliance window after publication |
| HIPAA Privacy Rule             | PHI access, minimum necessary              | Current; no material 2025 changes         |
| CMS-0057-F Interoperability    | Patient Access, Prior Auth APIs            | Final; FHIR APIs mandatory Jan 1, 2027    |
| 21 CFR Part 11                 | Electronic records for clinical trials     | Applies if HealthStack used in trials     |
| FDA SaMD (AI/ML guidance)      | AI-enabled diagnostic decision support     | Draft guidance Jan 2025; finalization pending |
| GDPR Art. 9                    | EU health data special category            | Applies to EU-deployed tenants            |
| USCDI v3                       | Minimum data set for certified APIs        | Mandatory from Jan 1, 2026               |

---

## 3. Forces

### 3.1 Healthcare-Specific Forces (layered on ADR-0100–0114)

**HIPAA fit** — ePHI must be encrypted at rest (AES-256) and in transit (TLS 1.2+). MFA is no longer addressable; it is mandatory under the 2025 NPRM. Audit trails must be tamper-evident with minimum 6-year retention for covered entities.

**FHIR ecosystem depth** — FHIR R4 is the regulatory standard (USCDI, CMS-0057-F, ONC g10 certification). R5 adoption is in the single digits globally; most major EHR vendors have not adopted R5. R6 normative ballot is scheduled for January 2026 with completion expected 2027. The dominant industry strategy is R4 now, planning a direct jump to R6 when it stabilizes. Building on R5 today creates a migration burden with no regulatory payoff.

**Healthcare standards-body alignment** — IHE profiles (XDS, MHD, XCA, ATNA, PIXm, PDQm), HL7 v2 (still ubiquitous in lab and ADT), X12 EDI (mandated for claims), DICOM (mandatory for imaging), and SMART on FHIR (mandatory for patient access APIs) all carry compliance weight. Diverging from these standards creates certification blockers.

**Clinical-grade testing rigor** — healthcare systems cannot tolerate data corruption. Idempotency, transactional integrity, and integration contract tests against real FHIR payloads are non-negotiable.

**Self-hosted air-gap readiness** — terminology (SNOMED CT, LOINC, RxNorm) snapshots must be bundleable offline. Imaging server must run with local storage. No hard dependency on any cloud-managed service.

**SNOMED CT licensing complexity** — SNOMED CT is free for IHTSDO member countries. Non-member countries require a commercial license. Multi-tenant SaaS must track licensing jurisdiction per tenant. National extensions (US, UK, AU, etc.) layer on top of the international release.

**21 services, shared FHIR layer** — individual services must not instantiate independent FHIR stacks. A shared FHIR JPA server or FHIR gateway pattern is required to keep schema consistent, reduce operational cost, and enforce data contracts.

### 3.2 Decision Weights

| Weight | Factor                             |
|--------|------------------------------------|
| 5      | HIPAA/GDPR compliance fit          |
| 5      | Air-gap / self-hosted support      |
| 4      | FHIR R4 depth + correctness        |
| 4      | HL7/IHE standards body alignment   |
| 4      | License permissibility for SaaS    |
| 3      | Operational complexity             |
| 3      | Community momentum + CVE velocity  |
| 3      | Integration with ADR-0100–0114 stack |
| 2      | Cross-tenant MPI accuracy          |
| 2      | Vendor/cloud independence          |

---

## 4. Sub-Decisions

---

### SD-1: FHIR Server

#### 4.1.1 Options Evaluated

**Option A — HAPI FHIR JPA Server (already chosen ADR-0103)**
- Apache 2.0. Java. The reference implementation of HL7 FHIR.
- Version 8.8.0 (February 2026). Minimum Java 17 required; Java 21 supported.
- Production deployments: VA, NHS Digital test environments, hundreds of HIEs worldwide.
- Strengths: deepest FHIR R4 correctness; JPA persistence on PG (aligns ADR-0101); MDM module for patient matching; SMART on FHIR 2.0 server capabilities; CQL/CDS Hooks via cqf-ruler plugin; subscription R4B support; Bulk Data Export; active CVE patching; largest OSS FHIR community; Spring Boot native (aligns ADR-0100).
- Weaknesses: high memory footprint at scale; JPA schema is complex (100+ tables); upgrade migrations require Atlas scripts; clinical reasoning module deprecated in 8.4.0 (replaced by cqf-ruler); some R5 features incomplete.
- 8.x breaking changes: Java 11 dropped; contained resource ID prefix changed; Patient compartment exports exclude Group/List; ConsentInterceptor REJECT now blocks writes.

**Option B — Medplum**
- Apache 2.0. TypeScript/Node.js. FHIR R4 native.
- Strengths: developer-friendly; modern API; built-in auth; active startup community.
- Weaknesses: TypeScript runtime conflicts with Kotlin/JVM ADR-0100; no JVM library integration; smaller enterprise deployment track record; no HL7v2 or X12 built-in.

**Option C — Aidbox (Health Samurai)**
- Commercial (free tier limited). FHIR R4/R5. PostgreSQL-native storage (JSONB single-table per resource type).
- Strengths: very fast PG queries; compact schema vs HAPI JPA; good SMART support.
- Weaknesses: commercial license conflicts with SaaS distribution model without per-tenant fees; vendor lock-in; not open-source.

**Option D — Smile CDR Community**
- HAPI-based commercial product with a community edition. Java.
- Strengths: enterprise support; hardened HAPI core.
- Weaknesses: community edition is feature-limited; commercial full version has per-core pricing incompatible with self-hosted air-gap model.

#### 4.1.2 Comparison Matrix

| Factor                     | HAPI FHIR | Medplum | Aidbox | Smile CDR CE |
|----------------------------|-----------|---------|--------|--------------|
| FHIR R4 correctness        | 5         | 4       | 4      | 5            |
| FHIR R5 support            | 3         | 3       | 4      | 3            |
| License for SaaS           | Apache 2  | Apache 2| Comm.  | Limited CE   |
| JVM / Spring integration   | 5         | 1       | 1      | 5            |
| PG persistence             | 5         | 4       | 5      | 5            |
| Air-gap readiness          | 5         | 3       | 2      | 3            |
| HL7v2 / X12 bridge support | 4         | 2       | 2      | 4            |
| MDM / MPI built-in         | 4         | 2       | 2      | 3            |
| Community CVE patching      | 5         | 3       | N/A    | 3            |
| HIPAA audit hooks          | 5         | 3       | 3      | 4            |

#### 4.1.3 Decision

**Confirmed: HAPI FHIR JPA Server 8.x (ADR-0103 choice stands).**

FHIR version strategy: **R4 primary, R5 experimental track only.** R5 adoption is below 5% globally as of 2025. No regulatory mandate references R5. R6 normative ballot scheduled January 2026 with completion expected 2027. Strategy: maintain R4 as the production API surface; expose R5 via a dedicated experimental endpoint on APISIX with opt-in header; plan direct R4→R6 migration when R6 reaches normative status.

Capability statement strategy: publish a `CapabilityStatement` per service profile using FHIR profiling (StructureDefinition + ImplementationGuide). Each HealthStack service registers its supported profiles so the FHIR gateway can route accordingly.

---

### SD-2: FHIR Persistence

#### 4.2.1 Options Evaluated

**Option A — HAPI FHIR JPA on PostgreSQL 17 (default)**
- Standard HAPI JPA schema on PG. ~130 tables. JPA entity model.
- Strengths: all HAPI features work; Atlas migrations supported; full SQL query access; PG 17 logical replication for Debezium CDC; ParadeDB FTS on PG (ADR-0101) applies natively.
- Weaknesses: complex schema; large tables at high resource volume; requires HAPI-specific migration scripts on upgrades.

**Option B — HAPI FHIR with MongoDB (deprecated)**
- HAPI deprecated MongoDB persistence in 6.x. Not viable.

**Option C — Custom PG schema + HAPI as REST adapter**
- Store FHIR resources as JSONB in a simple schema; use HAPI's RESTful layer as facade.
- Strengths: simpler schema; portable.
- Weaknesses: loses all HAPI JPA search parameters, MDM, subscription, and Bulk Export built-ins; extreme custom development cost.

**Option D — Aidbox PG (JSONB single-table)**
- Single table per FHIR resource type. Very query-efficient.
- Weaknesses: commercial license (see SD-1).

**FHIR Subscription strategy:**

- R4 Subscription (polling/rest-hook): supported by HAPI 8.x; used for real-time FHIR notifications.
- R4B/R5 SubscriptionTopic: HAPI 8.x has partial support. Use Kafka (ADR-0102) as the durable event bus instead; FHIR Subscription rest-hooks post to an internal APISIX route that fans out to Kafka topics. This decouples FHIR subscription from Kafka consumer groups.

**CDS Hooks support:**

cqf-ruler plugin (Apache 2.0) adds CDS Hooks endpoint on top of HAPI JPA. Integrates with HAPI's existing patient data. Deploy cqf-ruler as a sidecar alongside the HAPI JPA server within the same Kubernetes pod group.

#### 4.2.2 Decision

**HAPI FHIR JPA on PostgreSQL 17.** Use Atlas (ADR-0110) for all schema migrations. Expose Debezium CDC on the HAPI resource tables for downstream analytics (ClickHouse, ADR-0113). FHIR Subscriptions bridge to Kafka via APISIX rest-hook routes.

---

### SD-3: Terminology Server

#### 4.3.1 Options Evaluated

**Option A — Snowstorm (IHTSDO, Apache 2.0)**
- Built on Elasticsearch. SNOMED CT native. Supports FHIR Terminology Service operations ($expand, $lookup, $validate-code).
- Production use: SNOMED International Browser, ~14 national editions, NHS Digital authoring platform.
- Snowstorm Lite: lightweight single-concept-lookup variant; no subsumption, no transitive closure. Suitable for resource-constrained deployments.
- Strengths: authoritative SNOMED CT support; FHIR $expand correct for SNOMED hierarchies; subsumption queries; national extension loading; Apache 2.0; active IHTSDO maintenance; September 2025 SNOMED CT production release tested.
- Weaknesses: Elasticsearch dependency (resource-heavy for air-gap); LOINC and RxNorm are secondary citizens; not a full multi-terminology server.
- Air-gap: Elasticsearch bundleable; SNOMED CT RF2 releases bundleable as offline snapshots; feasible with 16GB+ RAM per node.

**Option B — HAPI FHIR Built-in Terminology Service + tx.fhir.org sync**
- HAPI JPA includes terminology operations. Can load SNOMED CT, LOINC, RxNorm, ICD-10 via NPM packages or direct import.
- Strengths: no separate service; integrated with FHIR resource validation.
- Weaknesses: SNOMED CT expansion at scale is slow on JPA; tx.fhir.org calls break air-gap; subsumption queries are limited; not a replacement for Snowstorm at national scale.

**Option C — Ontoserver (CSIRO)**
- FHIR-native multi-terminology server. Commercial (free for Australian government use; licensed elsewhere).
- Strengths: excellent FHIR conformance; best-in-class $expand performance.
- Weaknesses: commercial license; vendor dependency; not viable for SaaS redistribution without per-instance licensing.

**Option D — tx.fhir.org (HL7 public terminology service)**
- Public FHIR endpoint. Not viable for production: no SLA, rate-limited, air-gap incompatible, no PHI safe.

#### 4.3.2 SNOMED CT Licensing

| Scenario                               | License Required                          |
|----------------------------------------|-------------------------------------------|
| Deployment in IHTSDO member country    | Free (national license covers members)    |
| Deployment in non-member country       | Commercial license from IHTSDO            |
| SaaS with mixed jurisdictions          | Track per-tenant jurisdiction; national license applies per tenant country |
| Air-gap / on-prem single tenant        | License applies per country of installation |
| SNOMED CT national extension           | Separate license from national release center |

Implementation: store `tenant.terminology_jurisdiction` (ISO 3166-1 alpha-2) in tenant config. Snowstorm branch per national edition. License validation on terminology module activation, not at query time.

LOINC: free for use under LOINC license. Load via HAPI LOINC NPM package.
RxNorm: public domain (NLM). Load via NLM RxNorm full monthly release.
ICD-10: WHO ICD-10 (free); ICD-10-CM/PCS (US, NLM, public domain).
UCUM: public (Regenstrief). Bundle with HAPI.
Custom value sets: stored in HAPI JPA; versioned via Apicurio schema registry (ADR-0102).

#### 4.3.3 Decision

**Snowstorm (Apache 2.0) as the primary terminology server.** HAPI built-in terminology for validation of LOINC/RxNorm/custom value sets (no Elasticsearch dependency for these). Snowstorm Lite in resource-constrained on-prem deployments. Per-tenant jurisdiction tracking mandatory.

---

### SD-4: HL7 v2 / Interop Bridge

#### 4.4.1 Options Evaluated

**Option A — HAPI HL7v2 (JVM, Apache 2.0)**
- Part of the HAPI project. JVM-native HL7 v2 parser/builder. Covers HL7 2.1 through 2.8.
- Strengths: JVM-native (aligns ADR-0100); same project as HAPI FHIR; no separate process; Apache 2.0; actively maintained; battle-tested in thousands of US hospital integrations.
- Weaknesses: pure library — no MLLP server, no routing engine, no GUI. Must build MLLP listener on top (Netty or Spring Integration).
- Integration: use Spring Integration's MLLP adapter + HAPI HL7v2 library. Route HL7v2 messages to Kafka (ADR-0102) for fan-out. FHIR transform layer converts HL7v2 ADT→Patient/Encounter, ORM/ORU→ServiceRequest/Observation.

**Option B — BridgeLink (Apache 2.0, Innovar Healthcare)**
- Open-source fork of Mirth Connect 4.5.4. Emerged March 2025 after NextGen Healthcare made Mirth Connect commercial.
- Strengths: full routing engine with GUI; HL7v2, X12, FHIR, DICOM channels; large existing Mirth channel library portable; Apache 2.0; active development (4.5.4 released July 2025 with security patches).
- Weaknesses: Java-based separate service; adds operational complexity; GUI admin surface is an attack vector; channel configuration not declarative/GitOps-friendly; separate upgrade track from core stack.
- War story: NextGen's March 2025 commercial transition stranded thousands of healthcare organizations; BridgeLink emerged as the credible OSS successor within 4 months.

**Option C — Mirth Connect 4.6+ (Commercial, NextGen)**
- Proprietary as of March 2025. Weaknesses: commercial license; vendor lock-in; incompatible with SaaS redistribution model.

**Option D — Custom Netty MLLP + HAPI HL7v2 (build-it approach)**
- Full control; zero third-party routing engine.
- Strengths: minimal surface area; GitOps-friendly; integrates natively with Spring Boot.
- Weaknesses: rebuilds routing, retry, dead-letter, alerting that BridgeLink provides; significant engineering investment.

**X12 EDI note:** X12 spec is a closed standard (paid schema access required). No complete open-source X12 toolkit exists. For claims (837), eligibility (270/271), remittance (835), and prior auth (278): use Da Vinci FHIR IGs as the native interface; translate to/from X12 at the clearinghouse boundary. CMS enforcement discretion (2025) explicitly permits all-FHIR prior auth APIs without X12 278. X12 translation remains necessary for clearinghouse submission but is delegated to a licensed clearinghouse adapter. pyx12 (Python, LGPL) for validation only; not for production generation.

**C-CDA:** Use HAPI Structures CDA (Apache 2.0) for C-CDA R2/R2.1 parsing and generation. Transform C-CDA → FHIR DocumentReference via linuxforhealth/fhir-to-cda-converter (Apache 2.0).

#### 4.4.2 Decision

**HAPI HL7v2 library + Spring Integration MLLP adapter for HL7 v2 ingestion.** BridgeLink as the optional integration engine for legacy channel-based integrations (brownfield hospital onboarding). For greenfield HealthStack deployments, build MLLP listener natively in Spring Integration; avoid BridgeLink for new services. X12 EDI delegated to clearinghouse adapter; Da Vinci IGs used as the native FHIR interface for prior auth and claims.

---

### SD-5: DICOM / Imaging

#### 4.5.1 Options Evaluated

**Option A — Orthanc (GPLv3 / commercial exceptions available)**
- C++ DICOM server. Lightweight. REST API. Plugin ecosystem.
- Production footprint: small-to-medium clinics; research PACS; routing nodes.
- Strengths: very low RAM (vs dcm4chee Java); fast deployment (0.5 day vs 1 week for dcm4chee); REST/DICOMweb native; Python and C++ plugins; scales to 15TB+; responsive community.
- Weaknesses: GPLv3 license — plugin code that extends Orthanc and is distributed must also be GPLv3 (copyleft; affects SaaS distribution); commercial exceptions require Orthanc SARL licensing; partial DICOM Worklist support; less comprehensive IHE compliance than dcm4chee; limited HL7 integration built-in.
- License risk for SaaS: distributing Orthanc in SaaS requires either (a) keeping all Orthanc plugin code AGPL/GPL-compatible or (b) purchasing a commercial exception. This is a real constraint.

**Option B — dcm4chee (LGPL 2.1)**
- Java enterprise PACS. IHE-compliant. HL7 v2 integration built-in.
- Production footprint: large hospitals (1000+ beds), national imaging repositories.
- Strengths: LGPL 2.1 (SaaS-safe; modifications to dcm4chee itself must be shared but applications using it need not); comprehensive IHE compliance (XDS-I, MHD, WADO, QIDO, STOW); full DICOM Worklist; HL7 integration; enterprise access control; all DICOM SOP classes; multi-modality (endoscopy, dermatology, ECG, PDF).
- Weaknesses: complex setup (1 week vs 0.5 day for Orthanc); high RAM; Java dependency (aligns with ADR-0100 but adds JVM overhead for imaging); slower community response; documentation gaps.

**Option C — DCM4CHE library only + custom DICOM server**
- Use the dcm4che Java library (LGPL) as parsing/networking primitives; build a lean DICOM server with Spring Boot.
- Strengths: LGPL-safe; full control; JVM-native (ADR-0100); minimal footprint.
- Weaknesses: reimplements PACS functionality available for free in dcm4chee; high development cost.

**Option D — Commercial PACS (Ambra, Sectra, etc.)**
- Not viable: violates self-hosted + SaaS redistribution model.

**DICOMweb (WADO-RS, QIDO-RS, STOW-RS):** Required for OHIF Viewer integration and modern PACS workflows. Both Orthanc (with DICOMweb plugin) and dcm4chee support DICOMweb. Prefer dcm4chee for full IHE compliance.

**Imaging viewer — OHIF Viewer 3.x (Apache 2.0):**
- Zero-footprint, browser-based. Cornerstone3D rendering engine (MIT).
- v3.10 (April 2025): Local AI Enhanced Segmentation.
- v3.9 (November 2024): Cornerstone3D 2.0 + 3D Labelmaps.
- v3.8 (May 2024): 4D Visualization + Volume Rendering.
- Production use: basis for multiple FDA-cleared viewers. Apache 2.0 — SaaS-safe.
- Integration: connect OHIF to dcm4chee or Orthanc via DICOMweb datasource configuration.

#### 4.5.2 Decision

**dcm4chee (LGPL 2.1) as the primary DICOM/PACS server.** LGPL 2.1 is SaaS-safe without copyleft on application code. Full IHE compliance and HL7 integration justify the operational complexity for a healthcare platform of HealthStack's scope.

**OHIF Viewer 3.x (Apache 2.0)** as the standard DICOM viewer. Connect via DICOMweb (WADO-RS / QIDO-RS).

**Air-gap:** dcm4chee + OHIF Viewer both self-contained; no cloud dependency. SeaweedFS (ADR-0101) as the backing object store for DICOM file blobs.

---

### SD-6: Clinical Decision Support (CDS)

#### 4.6.1 Options Evaluated

**Option A — CDS Hooks (HL7 specification) + cqf-ruler + CQL engine**
- CDS Hooks: open HL7 spec for integrating clinical decision support at workflow points.
- cqf-ruler (Apache 2.0): FHIR Clinical Reasoning Module server; extends HAPI FHIR JPA; provides CQL evaluation, Measure operations, CDS Hooks endpoint.
- CQL (Clinical Quality Language v1.5.3 current; v2.0.0 in ballot 2025): HL7 standard for expressing clinical logic.
- Strengths: standards-aligned; CQL is used in eCQMs (CMS quality reporting); integrates with HAPI JPA data; CDS Hooks supported by Epic, Cerner, major EHRs; cqf-ruler active.
- Weaknesses: clinical reasoning module removed from core HAPI 8.4.0 (now cqf-ruler sidecar); CQL evaluation at scale can be slow; complex authoring workflow.
- Note: HAPI 8.4.0 "removed all deprecated Clinical Reasoning logic" from the core JPA server. cqf-ruler must be deployed as a separate Spring Boot application pointing at the same HAPI FHIR endpoint.

**Option B — Drools (Apache 2.0) + custom rule authoring**
- JVM-native rule engine. Fast inference. Used in many clinical decision systems.
- Strengths: very fast rule evaluation; JVM-native; Spring Boot integration; capable of expressing complex branching logic.
- Weaknesses: non-standard clinical format; no CDS Hooks native support; authoring requires Java; not interoperable with national eCQM programs.

**Option C — Open Policy Agent (OPA, Apache 2.0)**
- Policy-as-code engine. Rego language.
- Strengths: fast; lightweight; already used for RBAC/ABAC in ADR-0104.
- Weaknesses: Rego is not a clinical authoring language; no FHIR data model awareness; inappropriate for bedside clinical logic.

**Option D — FHIRPath engine standalone**
- FHIRPath (HL7): expression language for traversing FHIR resources.
- Use case: invariant validation, rule triggers on FHIR data fields.
- Not a CDS Hooks replacement; use as a component within CQL expressions.
- HAPI FHIR includes a FHIRPath engine; use it directly.

#### 4.6.2 Decision

**CDS Hooks + cqf-ruler (Apache 2.0) + CQL 1.5.3.** Deploy cqf-ruler as a sidecar to HAPI FHIR JPA. Use Drools for internal fast-path rules (allergy checking, formulary filtering) where CQL overhead is unacceptable. CDS Hooks as the EHR integration surface. FHIRPath embedded in HAPI for resource validation.

---

### SD-7: Care Plan + Pathway Templates

#### 4.7.1 Options Evaluated

**Option A — BPMN-modeled pathways via Flowable 7 (ADR-0105)**
- Pathways as BPMN 2.0 process definitions. Flowable orchestrates clinical tasks.
- Strengths: already chosen in ADR-0105; uniform process runtime across neutral core and HealthStack; BPMN tooling (Flowable Modeler); human task assignment; SLA timers; audit trail in Flowable history tables; integrates with Spring Boot.
- Weaknesses: BPMN not a FHIR native format; clinical teams unfamiliar with BPMN; pathway definitions in BPMN cannot be directly shared as FHIR resources with external systems.

**Option B — FHIR PlanDefinition + ActivityDefinition + GuidanceResponse (FHIR-native)**
- FHIR R4 resources for computable clinical guidelines. CPG-on-FHIR Implementation Guide.
- Strengths: standard FHIR format; shareable as FHIR resources; interpretable by FHIR-aware EHRs; aligns with HL7 Clinical Practice Guidelines project.
- Weaknesses: no built-in execution engine in HAPI FHIR; requires custom $apply operation; immature tooling for runtime execution; no native human task assignment; no SLA timer management.

**Option C — Hybrid: BPMN orchestrates, FHIR documents**
- BPMN drives the execution. FHIR CarePlan + Task resources created/updated as process milestones.
- Strengths: execution power of Flowable; interoperability of FHIR; clinicians see standard FHIR CarePlan in EHR; external systems can query FHIR CarePlan without understanding BPMN.
- Weaknesses: dual representation; must keep BPMN and FHIR CarePlan in sync; complexity in the mapper layer.

**Option D — Temporal (ADR-0105) for long-running care coordination workflows**
- Already chosen for complex durable workflows in ADR-0105.
- Use when care plans span months and require retry logic, checkpointing, and multi-system orchestration beyond BPMN's human-task focus.

#### 4.7.2 Decision

**Hybrid (Option C): Flowable 7 executes; FHIR CarePlan/Task documents.** Process definition in BPMN. At each milestone, a FHIR Task resource is created/updated in HAPI FHIR. CarePlan is synthesized from active Task resources. External EHRs and patients access the FHIR representation; internal workflow runs on Flowable. For multi-month population health coordination, escalate to Temporal workflows.

---

### SD-8: Patient Identity Matching / MPI

#### 4.8.1 Options Evaluated

**Option A — HAPI FHIR MDM Module**
- Built into HAPI FHIR JPA. Rule-based + probabilistic patient matching. Configurable blocking and scoring.
- Strengths: no separate service; integrated with FHIR resource lifecycle; FHIR $match operation; configurable rules via JSON config; IHE PIXm/PDQm compatible.
- Weaknesses: limited ML-based matching; probabilistic accuracy lags dedicated MPI products; less configurable than SanteMPI; limited cross-tenant MPI if tenants share a FHIR server.

**Option B — SanteMPI (SantéSuite, Apache 2.0)**
- National-scale MPI. Used in production in Namibia, CIFF programs, and multiple national health registries.
- Strengths: Apache 2.0; HL7 FHIR, HL7v2, GS1, OpenMRS API support; >90% true record linkage accuracy with 100% specificity in published validation; ML-optimized blocking; deterministic + probabilistic matching; designed for national-scale identity resolution; actively maintained.
- Weaknesses: separate service (Go/C#); different tech stack from Kotlin/JVM; requires Elasticsearch or ANTLR-based blocking index; integration complexity with HAPI FHIR.

**Option C — OpenEMPI (Apache 2.0)**
- Java MPI, smaller community.
- Strengths: JVM-native; Apache 2.0.
- Weaknesses: low community activity (few commits 2023-2025); limited ML matching; OpenCR preferred in recent national health evaluations over OpenEMPI.

**Option D — OpenCR (Open Client Registry, MPLv2)**
- Part of OpenHIE stack. FHIR-native patient registry. Node.js.
- Strengths: FHIR IHE PIXm/PDQm native; active OpenHIE community.
- Weaknesses: Node.js runtime conflicts with JVM stack; MPLv2 license has file-level copyleft implications.

#### 4.8.2 Decision

**HAPI FHIR MDM Module for single-tenant and small-scale deployments.** **SanteMPI for national-scale or multi-tenant deployments** where cross-organizational patient matching is required. Deploy SanteMPI as a standalone service; integrate via IHE PIXm $match FHIR operation. Per-tenant MPI vs shared MPI: configuration option, not hard architecture. Tenant isolation enforced by SanteMPI domain segmentation.

---

### SD-9: ePrescribing / Prescribing Integration

#### 4.9.1 Options Evaluated

**Option A — SureScripts (US, commercial gateway)**
- Mandatory for certified US eRx. Requires SureScripts certification and per-transaction fees.
- Strengths: US regulatory requirement for eRx in certified EHR; largest US pharmacy network.
- Weaknesses: US-only; commercial; per-transaction cost; certification process; not applicable to non-US deployments.

**Option B — National eRx networks (per-country)**
- UK: NHS Electronic Prescription Service (EPS) via NHS Spine.
- AU: eRx Exchange (Fred IT Group, commercial).
- NO/SE/DK: national eRx infrastructures.
- Each requires country-specific integration + certification.
- Integration pattern: abstract eRx connector interface; country-specific adapters implement it.

**Option C — OpenFDA drug data + custom prescribing (non-certified)**
- OpenFDA (public domain): drug labeling, adverse events, recalls.
- DailyMed (NLM, public domain): structured product labeling.
- DrugBank (commercial for complete data; limited open data): drug-drug interactions.
- Use for formulary display and interaction checking; NOT a replacement for certified eRx network submission.

**Option D — Internal formulary management only (no external eRx)**
- Build formulary management on FHIR MedicationKnowledge + CoveragePlan resources. No external eRx submission.
- Suitable for on-prem/air-gap deployments with local pharmacy dispensing only.

#### 4.9.2 Drug Interaction Checking

| Source            | License              | Coverage                                  |
|-------------------|----------------------|-------------------------------------------|
| OpenFDA           | Public domain        | US drug labeling, recalls, adverse events |
| DailyMed (NLM)    | Public domain        | Structured product labeling               |
| DrugBank Open     | CC BY-NC 4.0         | Limited interactions; non-commercial only |
| FDB (First Databank)| Commercial          | Comprehensive; US-centric                 |
| RxNorm (NLM)      | Public domain        | Drug normalization / codes                |

For SaaS (commercial use): DrugBank Open CC BY-NC 4.0 is NOT usable in SaaS distribution. FDB required for comprehensive US clinical drug interaction checking in commercial deployments. OpenFDA + RxNorm sufficient for formulary display in non-commercial or on-prem.

#### 4.9.3 Decision

**eRx via country-specific certified gateways using an abstract connector interface.** US: SureScripts (commercial, required for ONC certification). Non-US: per-country adapter. Drug interaction checking: FDB for commercial SaaS; RxNorm + OpenFDA for on-prem/air-gap. FHIR MedicationRequest + MedicationKnowledge as the native data model.

---

### SD-10: Lab / Orders / Observations

#### 4.10.1 Decision

**FHIR R4 native for data model.** ServiceRequest (orders), DiagnosticReport + Observation (results). HL7 v2 ORM/ORU messages ingested via HAPI HL7v2 + Spring Integration MLLP adapter (SD-4); transformed to FHIR Observation resources.

**LOINC mapping:** LOINC loaded in HAPI built-in terminology. LOINC codes mandatory on all Observation resources. Use FHIR ValueSet binding enforcement at the HAPI JPA level.

**IHE profiles:** IHE LAB-1 (Laboratory Information Management) and LAB-3 (Laboratory Code Set Distribution). IHE PIX/PDQ for patient identity cross-referencing with lab systems.

**Lab connectivity patterns:**
- HL7v2 ORM (order) → ServiceRequest via transformer
- HL7v2 ORU (result) → DiagnosticReport + Observation via transformer
- FHIR Subscription on ServiceRequest status changes → notify ordering clinician
- ASTM 1394 (point-of-care instruments): adapter layer converting ASTM to HL7v2 then to FHIR

---

### SD-11: Medication Management

#### 4.11.1 Decision

**FHIR MedicationRequest + MedicationAdministration + MedicationStatement** as native data model. RxNorm codes on all Medication resources (NLM, public domain). SNOMED CT for clinical drug concepts where RxNorm insufficient.

**Barcode scanning:** GS1 DataMatrix / GS1-128 barcodes on medication packages. Scan-to-verify workflow via Flutter mobile (ADR-0106); decode with ZXing (Apache 2.0); resolve to FHIR Medication resource via RxNorm NDC mapping.

**Formulary management:** FHIR MedicationKnowledge + CoveragePlan. Drug-drug interaction: FDB for SaaS (commercial); OpenFDA adverse events + RxNorm for on-prem.

---

### SD-12: EMS / Dispatch

#### 4.12.1 Options Evaluated

**Option A — NEMSIS 3.5 native schema + FHIR Encounter overlay**
- NEMSIS (National EMS Information System) 3.5: US standard for prehospital data capture.
- Map NEMSIS data elements to FHIR Encounter (prehospital class) + Observation + Procedure.
- Strengths: US-regulatory compliance for EMS agencies; bidirectional: NEMSIS for state reporting, FHIR for hospital handoff.
- Weaknesses: complex NEMSIS schema; US-centric (international EMS uses different standards: EN 13606, HL7 FHIR Paramedicine profiles).

**Option B — FHIR Paramedicine IG (HL7)**
- HL7 International Patient Summary (IPS) + Paramedicine Patient Summary (PPS) IG.
- International applicability.
- Weaknesses: IG still in development (STU 1 published 2024); limited tooling.

**Option C — CAD (Computer-Aided Dispatch) integration**
- CAD systems (Tyler Technologies, Motorola PremierOne, etc.) are commercial. Integration via REST or HL7v2 ADT.
- HealthStack provides an abstract CAD connector; vendor-specific adapters.

#### 4.12.2 Decision

**NEMSIS 3.5 + FHIR Encounter (prehospital profile) hybrid.** NEMSIS for US state reporting; FHIR for hospital handoff and cross-system care continuity. Fleet integration via geospatial service (neutral core fleet-service, per ADR-0111 + Geospatial module). CAD integration via abstract connector interface. International deployments: HL7 FHIR Paramedicine IG when available and tooling matures.

---

### SD-13: Quality Measures + Reporting

#### 4.13.1 Decision

**eCQMs via CQL (already integrated via cqf-ruler, SD-6).** FHIR MeasureReport resource for reporting results. Pathling (already chosen ADR-0113) for population-level FHIR analytics; Pathling supports FHIRPath analytics over Parquet-encoded FHIR bundles exported via Bulk Data.

**NCQA HEDIS:** Implement HEDIS measures as CQL libraries. NCQA publishes HEDIS eCQM value sets (licensed; NCQA membership required for some measures).

**CMS quality reporting (MIPS, ACO):** FHIR-based quality reporting via DEQM (Data Exchange for Quality Measures) IG. Submit MeasureReport bundles to CMS via FHIR.

**Bulk Data Export (FHIR $export):** Already supported in HAPI FHIR 8.x. Pathling consumes FHIR Bulk Data NDJSON exports for population analytics. OpenDP (ADR-0113) for differential privacy on population health metrics.

---

### SD-14: Consent + Privacy

#### 4.14.1 Options Evaluated

**Option A — FHIR Consent resource (R4)**
- Standard FHIR Consent resource for patient consent management. Supports HIPAA Privacy Rule consent, BPPC (Basic Patient Privacy Consents), granular purpose-of-use constraints.
- Strengths: FHIR-native; integrates with HAPI JPA; ConsentInterceptor in HAPI enforces consent at query time (enforced in HAPI 8.x: write operations blocked on REJECT).
- Weaknesses: R4 Consent model is complex; R5 Consent is significantly revised; mapping real-world consent policies to FHIR Consent is non-trivial; not executable without a consent enforcement engine.

**Option B — IHE BPPC (Basic Patient Privacy Consents)**
- IHE profile for consent document exchange via XDS.
- Strengths: well-established in European and US HIE deployments.
- Weaknesses: document-centric; less granular than FHIR Consent; requires XDS infrastructure.

**Option C — Patient-Mediated Exchange (PME) via SMART on FHIR**
- Patient authorizes app access via SMART on FHIR scopes. Keycloak (ADR-0104) manages authorization.
- Strengths: SMART-aligned; CMS-0057-F compliant for patient access API.
- Weaknesses: SMART scopes are coarse; not a replacement for clinical consent management.

**Option D — Granular Consent with FHIR Bulk Data + Consent**
- FHIR Consent resources govern which data is included in Bulk Data exports.
- Strengths: full data-level consent enforcement; suitable for research de-identification workflows.
- Weaknesses: complex implementation; Consent enforcement on Bulk Export requires custom HAPI interceptor logic.

#### 4.14.2 Per-Jurisdiction Consent

| Jurisdiction | Key Requirement                                          |
|--------------|----------------------------------------------------------|
| US / HIPAA   | Minimum necessary; patient right to restrict disclosure  |
| EU / GDPR    | Explicit consent for sensitive health data (Art. 9); right to erasure |
| UK / GDPR UK | Post-Brexit UK GDPR; similar to EU                      |
| AU / Privacy Act | Australian Privacy Principles; Health Records Act 2001 (VIC) |
| CA / PIPEDA  | Consent + purpose limitation                             |
| 42 CFR Part 2| Substance use disorder records: stricter than HIPAA      |

Consent model must carry `purpose.ofUse` (HL7 ActReason codes), `actor` (performer/recipient), `provision` (permit/deny + data class + resource type). Per-jurisdiction consent templates versioned in HAPI FHIR as Consent resource templates.

#### 4.14.3 Decision

**FHIR Consent resource (R4) + HAPI ConsentInterceptor for enforcement.** SMART on FHIR scopes for patient-facing app authorization (Keycloak, ADR-0104). IHE BPPC for legacy HIE consent document exchange. Per-tenant jurisdiction consent templates. 42 CFR Part 2 compliance via enhanced access control on substance-use-disorder data classifications.

---

### SD-15: Patient App + Portal

#### 4.15.1 Decision

**SMART on FHIR 2.0 + 2.2 app launch flow via Keycloak (ADR-0104) + HAPI FHIR.** Flutter patient app (ADR-0106) uses fhir_r4 Dart library for FHIR data access. Web portal: React (ADR-0106) with fhirclient.js.

**ONC g10 / USCDI v3 certification readiness:**
- USCDI v3 mandatory from January 1, 2026 (TEFCA/CMS).
- SMART App Launch 2.0 / 2.2 for certified API.
- US Core 6.1.0 profiles on FHIR resources for USCDI v3.
- Plan voluntary re-certification for US Core 7.0 (USCDI v4) when ready.

**CMS-0057-F Patient Access API:** Implement Patient Access API per Da Vinci CARIN IG for Blue Button. Must be live January 1, 2027 per final rule. Payer-to-Payer and Provider Access APIs on same timeline.

---

### SD-16: Clinical Document Management (CDA)

#### 4.16.1 Decision

**HAPI Structures CDA (Apache 2.0)** for C-CDA R2 + R2.1 parsing and generation. **linuxforhealth/fhir-to-cda-converter (Apache 2.0)** for bidirectional C-CDA ↔ FHIR DocumentReference transforms.

**IHE profiles:**
- XDS (Cross-Enterprise Document Sharing): for HIE document registry/repository integration.
- MHD (Mobile access to Health Documents): FHIR-native XDS equivalent. Implemented on HAPI FHIR via IHE MHD IG.
- XDR (Direct messaging): for point-to-point document exchange.
- XDM (Removable media): for offline exchange (air-gap transfer).

**IHE MHD on HAPI FHIR:** Deploy IHE MHD IG as HAPI FHIR profile set. Provides FHIR-native document submission and retrieval as an alternative to XDS for modern clients.

---

### SD-17: Imaging AI Inference

#### 4.17.1 Options Evaluated

**Option A — MONAI Deploy (Apache 2.0, NVIDIA/community)**
- Medical Open Network for AI. Packaging standard for clinical AI apps (MONAI Application Packages, MAPs).
- Integrates with dcm4chee/DICOM via DICOMweb. Executes MAPs on NVIDIA GPUs or CPU.
- Production use: Mayo Clinic Florida radiology workflows; Siemens Healthineers AI-Rad Companion.
- Strengths: Apache 2.0; DICOM-native input/output; NVIDIA NIM integration; active 2024-2025 development; Kubernetes-native deployment; integrates with OHIF Viewer for AI overlay display.
- Weaknesses: GPU dependency for performance (CPU inference slow for large models); requires NVIDIA runtime in K8s (nvidia-device-plugin); MONAI application ecosystem still maturing.

**Option B — Direct vLLM/SGLang (ADR-0114) for vision-language models**
- Vision-language models (VLMs) via vLLM (e.g., Qwen2-VL, LLaVA-Med) for radiology report generation.
- Strengths: already chosen in ADR-0114; unified inference runtime for text + vision.
- Weaknesses: VLMs not a replacement for task-specific MONAI segmentation models (e.g., nnU-Net for organ segmentation); different model format (MONAI MAPs vs vLLM LLM formats).

**Option C — Custom Python inference service**
- Custom FastAPI service wrapping PyTorch/ONNX models.
- Strengths: full control.
- Weaknesses: reimplements MONAI packaging; no standardized DICOM integration; operational overhead.

**Specific OSS models:**
- **CheXNet**: DenseNet-121 for chest X-ray pathology detection. Research use; not FDA-cleared.
- **nnU-Net**: self-configuring medical image segmentation. MIT license. Production segmentation quality.
- **TotalSegmentator**: whole-body CT organ segmentation. Apache 2.0.
- **MONAI Bundles**: pre-trained task-specific models (spleen, liver, etc.) available on MONAI Model Zoo.

**FDA SaMD consideration:** Any AI model used for diagnostic decision-making in US clinical workflows may require FDA 510(k) clearance or De Novo authorization. The January 2025 FDA draft guidance on AI/ML-Based Device Software Functions requires Predetermined Change Control Plans for adaptive models. For clinical use, deploy only FDA-cleared or FDA-exempt models unless HealthStack deployment is outside US clinical use. MONAI Deploy itself is not a medical device; individual AI apps deployed via MONAI may be.

#### 4.17.2 Decision

**MONAI Deploy (Apache 2.0) as the AI inference packaging and orchestration layer.** vLLM/SGLang (ADR-0114) for vision-language model inference (radiology report generation, multimodal Q&A). Task-specific MONAI Bundle models (nnU-Net, TotalSegmentator) for segmentation. DICOM-to-AI pipeline: dcm4chee → DICOMweb → MONAI Deploy → structured AI output → FHIR DiagnosticReport (AI findings). OHIF Viewer 3.x renders AI overlays (segmentation masks, bounding boxes) via Cornerstone3D.

**Regulatory gate:** AI clinical decision support features gated by deployment region. US clinical use: only FDA-cleared models in production. Research/pilot mode: unrestricted. Configuration flag per tenant: `tenant.ai.fda_cleared_only`.

---

### SD-18: Healthcare-Specific Scheduling

#### 4.18.1 Decision

**FHIR Appointment + Slot + Schedule resources** as the data model. Extend neutral-core calendar-service with HealthStack scheduling rules:

- Clinical resource scheduling: rooms (Location), equipment (Device), clinicians (Practitioner), patients (Patient).
- Appointment types: recurring (chronic care), episodic (acute), same-day/urgent, telehealth.
- No-show prediction: ML model (Python FastAPI microservice using historical appointment data from ClickHouse, ADR-0113) scores appointment no-show risk; exposed as FHIR Appointment extension.
- IHE SDC (Structured Data Capture): FHIR Questionnaire + QuestionnaireResponse for pre-appointment intake forms. SDC IG implemented on HAPI FHIR.
- Overbooking policy: configurable per clinic (tenant config); Flowable BPM rule (SD-7) governs appointment approval workflow.

---

### SD-19: Insurance / Claims

#### 4.19.1 Decision

**Da Vinci FHIR IGs as native interface:**
- Prior Authorization Support (PAS) IG v2.1.0 (STU 2.0.1 recommended by CMS-0057-F).
- Coverage Requirements Discovery (DTR) IG.
- Patient Cost Transparency (PCT) IG.
- Clinical Data Exchange (CDex) IG.

**X12 EDI at clearinghouse boundary only:**
- 837P (professional claims), 837I (institutional), 837D (dental): generated by clearinghouse adapter from FHIR Claim resource.
- 835 (remittance): parsed by clearinghouse adapter into FHIR ExplanationOfBenefit.
- 270/271 (eligibility): FHIR Coverage resource; X12 translation at payer gateway.
- 278 (prior auth): CMS enforcement discretion permits all-FHIR PA API without X12 278 (2025).
- pyx12 (Python, LGPL) for X12 validation only; not for production generation.

**FHIR APIs mandatory by January 1, 2027 (CMS-0057-F):** Patient Access, Provider Access, Payer-to-Payer, Prior Authorization APIs.

**Clearinghouse connectivity:** Abstract ClearinghouseConnector interface. Provider-specific adapters (Availity, Change Healthcare/Optum, Office Ally, etc.) implement it. No hardcoded clearinghouse dependency in core.

---

### SD-20: Audit / Accountability (HIPAA-Specific)

#### 4.20.1 Decision

**IHE ATNA (Audit Trail and Node Authentication)** + **FHIR AuditEvent** as the dual audit surface.

ATNA requirements: TLS with mutual certificate authentication between all HealthStack services. Syslog audit messages to dedicated ATNA audit repository. HAPI FHIR IHE ATNA IG implemented.

**FHIR AuditEvent:** Every FHIR resource read/write generates an AuditEvent resource in HAPI FHIR. AuditEvent records: who accessed, what resource, when, from where (IP + device), outcome. Tamper-evident: hash-chained audit log (Merkle-tree structure per ADR-0104) stored in append-only PG table with Wazuh integrity monitoring (ADR-0108).

**HIPAA 2025 Security Rule (NPRM):**
- ePHI encryption at rest: AES-256 (Tink, ADR-0108) — implemented.
- ePHI encryption in transit: TLS 1.3 (cert-manager, ADR-0108) — implemented.
- MFA: mandatory for all ePHI access; Keycloak MFA required (ADR-0104). No exception for service-to-service paths that carry ePHI (mTLS counts as MFA equivalent for machine access).
- Technology asset inventory: automated via Falco + Tetragon (ADR-0108) runtime discovery; exported to Wazuh SIEM.
- Compliance window: 240 days after final rule publication. Final rule expected mid-2026. Target: HealthStack compliant by Q1 2027.

**Break-glass access:** Flowable BPM workflow (ADR-0105) gates break-glass escalation. Approval required from second authorized clinician. All break-glass access logged with reason code in FHIR AuditEvent + Wazuh alert. Automatic notification to privacy officer.

**Clinical RBAC + ABAC extension (beyond ADR-0104):**
- HIPAA Minimum Necessary enforcement: ABAC policies on FHIR Consent resources limit data returned per role.
- Purpose-of-use enforcement: OPA (ADR-0104) policies include `purpose.ofUse` from FHIR Consent.
- Role separation: treating clinician vs administrative staff vs billing vs research — distinct FHIR resource access profiles.
- 42 CFR Part 2: substance use disorder records tagged with FHIR security label `SUBSTABUSE`; OPA policy denies access unless explicit consent or emergency override.

**Retention:** HIPAA requires minimum 6-year retention for covered entities. AuditEvent records retained 6 years in ClickHouse (ADR-0113). FHIR resources: soft-delete with version history; hard purge only after GDPR right-to-erasure request with anonymization of audit references.

---

### SD-21: Interop Networks (Country-Specific)

#### 4.21.1 TEFCA / QHIN (United States)

Status as of May 2026: 11 QHINs operational; 21,000+ participating organizations; 81,000+ unique connections. TEFCA live since December 2023. USCDI v3 mandatory from January 1, 2026. QHIN-to-QHIN FHIR exchange (Stage 3) scheduled for 2026. Patient Access, Provider Access, Payer-to-Payer FHIR APIs mandatory January 1, 2027 (CMS-0057-F).

**HealthStack integration:** APISIX gateway (ADR-0103) exposes TEFCA-compliant FHIR endpoints. QHIN connectivity via TEFCA-compatible FHIR API conformance. USCDI v3 → US Core 6.1.0 profiles enforced on all public-facing FHIR endpoints.

#### 4.21.2 NHS Spine FHIR (United Kingdom)

NHS Digital FHIR APIs: PDS (Personal Demographics Service), GP Connect, NRL (National Record Locator), eRS (e-Referral Service). Authentication: NHS CIS2 (Care Identity Service 2) federated with Keycloak via OIDC. NHS SMART on FHIR launch for clinical apps.

#### 4.21.3 Carequality + CommonWell (United States HIE)

Carequality: network of networks for cross-organization FHIR exchange. CommonWell: health data network focused on patient identity. Integration via IHE XCA (Cross-Community Access) + IHE XCPD (Cross-Community Patient Discovery). Abstract HIE connector interface; Carequality and CommonWell adapters.

#### 4.21.4 Country Profiles

| Country | Network / Standard                    | Notes                                    |
|---------|---------------------------------------|------------------------------------------|
| DK      | MedCom (HL7 FHIR DK)                 | Danish national health data network      |
| NL      | Nuts (decentralized, open)            | Privacy-first distributed health data    |
| NO      | Norsk Helsenett (NHN)                 | Norwegian health network                 |
| AU      | ADHA FHIR APIs, My Health Record      | FHIR R4; SMART on FHIR for MHR access   |
| DE      | Telematikinfrastruktur (TI) / gematik | ePA (electronic patient file) FHIR APIs  |
| SE      | Nationell patientöversikt (NPÖ)       | National patient overview API            |

**Pattern:** Abstract `NationalHealthNetworkConnector` interface. Country adapters implement connection, authentication, and FHIR profile conformance per national specification. Adapters activated per-tenant by country config.

#### 4.21.5 IHE Profiles Adopted

| Profile | Description                                   | Status in HealthStack |
|---------|-----------------------------------------------|-----------------------|
| PIXm    | Patient Identity Cross-Reference for Mobile   | Implemented (HAPI MDM + SanteMPI) |
| PDQm    | Patient Demographics Query for Mobile         | Implemented (HAPI FHIR) |
| MHD     | Mobile access to Health Documents             | Implemented (HAPI FHIR IHE MHD IG) |
| XDS     | Cross-Enterprise Document Sharing             | Adapter for legacy HIE |
| XCA     | Cross-Community Access                        | Carequality adapter   |
| XCPD    | Cross-Community Patient Discovery             | Carequality adapter   |
| ATNA    | Audit Trail and Node Authentication           | Implemented (SD-20)   |
| SDC     | Structured Data Capture                       | Implemented (SD-18)   |
| LAB-1/3 | Laboratory profiles                           | Implemented (SD-10)   |

---

### SD-22: HealthStack-Specific NFRs

#### 4.22.1 Performance

- FHIR resource read P95 < 200ms at 1,000 concurrent patients.
- FHIR resource write P95 < 500ms.
- Terminology $expand P95 < 100ms (Snowstorm Elasticsearch-backed).
- DICOM study retrieval (WADO-RS) P95 < 2s for studies < 100MB.
- AI inference latency: chest X-ray classification P95 < 5s; CT segmentation P95 < 60s.

#### 4.22.2 HIPAA Security Rule (2025 NPRM) Compliance Checklist

| Control                          | Implementation                                | Status   |
|----------------------------------|-----------------------------------------------|----------|
| MFA for all ePHI access          | Keycloak MFA required; mTLS for service-to-service | Planned  |
| Encryption at rest (AES-256)     | Tink (ADR-0108); PG TDE via pg_crypto        | Planned  |
| Encryption in transit (TLS 1.3)  | cert-manager (ADR-0108); APISIX TLS          | Planned  |
| Technology asset inventory       | Falco + Tetragon runtime discovery           | Planned  |
| Comprehensive risk analysis      | Annual; Wazuh SIEM + SonarQube (ADR-0108)    | Planned  |
| Tamper-evident audit             | Hash-chained AuditEvent (SD-20)              | Planned  |
| 6-year audit retention           | ClickHouse cold tier (ADR-0113)              | Planned  |
| Break-glass with approval        | Flowable BPM workflow (SD-20)                | Planned  |
| Documented compensating controls | Required before deviation; stored as ADR     | Process  |

#### 4.22.3 FDA SaMD

HealthStack clinical AI features (SD-17) gated by `tenant.ai.fda_cleared_only` flag. US clinical production: only FDA-cleared models. Research/international: configurable. Track AI model version + hash in FHIR Device resource per FDA guidance. Predetermined Change Control Plan (PCCP) required for any adaptive model updates in US clinical use.

#### 4.22.4 21 CFR Part 11 (Clinical Trials)

Applicable when HealthStack is used as a clinical trial data collection system. Requirements: electronic signature with identity binding (Keycloak + HAPI FHIR AuditEvent as e-signature record), audit trail, version-controlled document management (IHE MHD + HAPI FHIR). Activate via tenant feature flag `tenant.compliance.cfr11`.

#### 4.22.5 GDPR Art. 9 (EU Health Data)

EU-deployed tenants: health data is special category. Legal basis must be explicit (Art. 9(2)(h) — medical treatment; Art. 9(2)(j) — research with safeguards). FHIR Consent resource carries legal basis code. Right to erasure: anonymization (Presidio, ADR-0114) rather than deletion where deletion breaks referential integrity. Data minimization: FHIR Consent `provision.class` limits which resource types are accessible per purpose.

---

## 5. Cross-Cutting Concerns

### 5.1 PHI Boundary Enforcement

Neutral-core services hold **references and metadata only**. HealthStack services hold PHI in HealthStack schemas (separate PG schemas per tenant). Cross-schema JOINs prohibited; cross-service PHI access only via FHIR API with Consent enforcement. Enforced at:
- PG role-level: healthstack schema readable only by healthstack service accounts.
- APISIX: routes to HealthStack FHIR endpoints require `HealthStack-Active: true` tenant flag.
- CI: Opengrep (ADR-0108) rule blocks imports of healthstack PG schemas in neutral-core service code.

### 5.2 FHIR as Integration Surface

All 21 HealthStack services use HAPI FHIR as the shared data layer. No service-to-service direct DB calls. Cross-service data access: FHIR REST API or FHIR Subscription events via Kafka. This enforces the FHIR contract as the stable API surface and enables external EHR integration without service-specific adapters.

### 5.3 Air-Gap Artifact Bundling

| Artifact                        | Bundling Method                              |
|---------------------------------|----------------------------------------------|
| SNOMED CT RF2 (international)   | Offline snapshot in release; branch-per-edition |
| LOINC                           | HAPI NPM package; bundled in container image |
| RxNorm (monthly)                | NLM download script; bundled in release     |
| ICD-10-CM/PCS                   | NLM download; bundled in release            |
| OHIF Viewer 3.x                 | Static build in Harbor (ADR-0109)           |
| dcm4chee                        | Container image in Harbor                   |
| Snowstorm                       | Container image + Elasticsearch data volume snapshot |
| MONAI Bundle models             | OCI artifact in Harbor; version-pinned      |

### 5.4 Multi-Tenant HealthStack Activation

HealthStack is opt-in per tenant. Activation via tenant provisioning workflow (Flowable BPM). On activation:
1. Create HealthStack PG schema for tenant.
2. Seed Snowstorm branch with tenant jurisdiction's SNOMED CT edition.
3. Activate Keycloak SMART on FHIR scopes for tenant realm.
4. Register tenant's FHIR CapabilityStatement with APISIX routing.
5. Activate Da Vinci IG endpoints.
6. Set `tenant.terminology_jurisdiction`, `tenant.ai.fda_cleared_only`, `tenant.compliance.cfr11` flags.

### 5.5 Upgrade and Migration Strategy

HAPI FHIR 8.x breaking changes per SD-1: Atlas (ADR-0110) manages all HAPI JPA schema migrations. HAPI 8.2.0+ requires Java 17 minimum (JVM 21 already chosen, ADR-0100 — no action needed). Contained resource ID prefix change: migration script updates stored resource JSON.

Snowstorm major version upgrades: Elasticsearch index snapshots; test upgrade in vCluster preview (ADR-0110) before production rollout.

dcm4chee upgrades: DICOM data portable across versions; test in staging K3s cluster before production.

---

## 6. Open Questions

1. **FHIR R6 migration timing**: When R6 reaches normative status (expected 2027), what is the migration path for HAPI FHIR JPA schemas? Is HAPI planning a R4→R6 migration toolkit? Who owns this migration in HealthStack?
   → tracked: [m12-fhir-resource-boundary.md](../research/m12-fhir-resource-boundary.md) §5 (R6 = post-GA forward migration via Atlas + vCluster; decision DEFERRED-MILESTONE per RESOLUTION-MAP §ADR-0115).

2. **SNOMED CT jurisdiction automation**: How is tenant jurisdiction validated at provisioning time? Is there a registry API for IHTSDO member countries, or is it a static list requiring manual update?
   → tracked: [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §4 (bundled static member-list + scheduled human review; validate at module activation; refresh-cadence DEFERRED-MILESTONE).

3. **HIPAA Final Rule publication date**: The NPRM comment period closed March 2025. The final rule has not yet been published (as of May 2026). Who monitors HHS for final rule publication and triggers the 240-day compliance countdown?
   → tracked: [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §4 / G2 (controls met by config; compliance-watch owner monitors HHS; DEFERRED-MILESTONE watch).

4. **SanteMPI cross-tenant isolation**: When multiple tenants share a SanteMPI instance, how is patient identity isolated? Does SanteMPI's domain segmentation provide sufficient cryptographic isolation, or is a per-tenant SanteMPI instance required for high-assurance deployments?
   → tracked: [m12-fhir-resource-boundary.md](../research/m12-fhir-resource-boundary.md) §4.2/§4.3 (Patient↔Party MPI is the SanteMPI concern; DEFERRED-MILESTONE per RESOLUTION-MAP §ADR-0115).

5. **BridgeLink long-term governance**: BridgeLink (Innovar Healthcare) is a young fork (July 2025 first release). What is the sustainability model? Is there a foundation or CNCF-equivalent? What is the contingency if Innovar discontinues maintenance?
   → tracked: RESOLUTION-MAP §ADR-0115 — DEFERRED-MILESTONE (mitigation already in ADR-0115 §7: HAPI HL7v2 + Spring Integration primary; BridgeLink legacy-channel only). Not an M12 clinical-core blocker.

6. **Orthanc license for SaaS**: For air-gap on-prem single-tenant, GPLv3 Orthanc is viable (no distribution). For SaaS distribution, the copyleft concern is real. Has legal confirmed that deploying Orthanc in SaaS without distributing modified plugin code avoids GPLv3 obligations? If not, switch to dcm4chee for all deployments.
   → tracked: [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §6 — **STILL-OPEN / needs-legal-signoff** (GPLv3-as-a-service risk documented; dcm4chee LGPL 2.1 fallback + ≥2 alternatives; agent does NOT resolve — human legal sign-off required, user acknowledged 2026-06-03).

7. **DrugBank CC BY-NC 4.0 in commercial SaaS**: CC BY-NC is explicitly non-commercial. Confirm that the commercial SaaS deployment of HealthStack cannot use DrugBank Open data directly. Is FDB the only viable comprehensive drug interaction source for commercial US deployments?
   → tracked: [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §7 — **STILL-OPEN / needs-legal-signoff** (NC conflict documented; RxNorm public-domain backbone + OpenFDA + FDB-paid alternatives; DrugBank Open excluded from commercial SaaS; agent does NOT resolve — human legal/cost sign-off required, user acknowledged 2026-06-03).

8. **FDA SaMD PCCP for MONAI Bundle updates**: When a MONAI Bundle model is retrained or updated, does the existing FDA clearance cover the new version under a PCCP, or does a new 510(k) submission apply? Who manages the FDA clearance registry for HealthStack AI models?
   → tracked: [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §6 / G4 (gated by `tenant.ai.fda_cleared_only`; regulatory-affairs-owned; out of M12 clinical-core; DEFERRED-MILESTONE).

9. **42 CFR Part 2 consent with TEFCA**: TEFCA exchange does not automatically satisfy 42 CFR Part 2 requirements for substance use disorder data. What is the policy for filtering Part 2 data at the QHIN boundary? Does HealthStack need to implement a FHIR security label filter on TEFCA outbound exchange?
   → tracked: [m12-consent-phi-enforcement.md](../research/m12-consent-phi-enforcement.md) §5.2 (yes — build a DS4P/`42CFRPart2` security-label outbound filter gated by `Consent`; binding compliance policy DEFERRED-MILESTONE, compliance-review).

10. **NEMSIS 3.5 vs FHIR Paramedicine IG for EMS**: The FHIR Paramedicine IG is STU 1 (2024) with limited tooling. For international EMS deployments, when does the Paramedicine IG reach sufficient maturity to replace NEMSIS as the primary data model?
    → tracked: RESOLUTION-MAP §ADR-0115 — DEFERRED-MILESTONE (EMS overlay is post-M12; gated on Paramedicine IG tooling maturity; not M12 clinical-core scope).

11. **Snowstorm Elasticsearch version pinning**: Snowstorm has specific Elasticsearch version requirements. As Elasticsearch continues licensing evolution (Elastic License vs OpenSearch fork), which distribution does HealthStack use for Snowstorm's backing store? OpenSearch is Apache 2.0 but Snowstorm compatibility is not guaranteed.
    → tracked: [m12-terminology-licensing.md](../research/m12-terminology-licensing.md) §3 (pin Snowstorm's tested ES version, bundle for air-gap; do NOT swap OpenSearch unless IHTSDO supports it; Snowstorm Lite for constrained/edge; ES-version pin floats DEFERRED-MILESTONE).

12. **HAPI FHIR 8.4.0 clinical reasoning removal**: cqf-ruler is now the supported CDS/CQL path, but cqf-ruler's release cadence and HAPI version compatibility must be tracked. Who owns the cqf-ruler version pin in HealthStack's dependency manifest?
    → tracked: RESOLUTION-MAP §ADR-0115 — DEFERRED-MILESTONE (cqf-ruler version pin owned by the clinical-reasoning/terminology lane per [[curaos-version-pinning-rule]]; deploy as sidecar per ADR-0115 §7; not M12 clinical-core blocker).

13. **Imaging storage tiering**: DICOM objects can be multi-GB per study. What is the SeaweedFS tiering policy for DICOM blobs (hot/warm/cold)? When does a DICOM study move to cold storage, and what is the WADO-RS latency for cold retrieval?
    → tracked: RESOLUTION-MAP §ADR-0115 — DEFERRED-MILESTONE (imaging-store tiering is an imaging-milestone concern, downstream of the Q6 imaging-store decision; not M12 clinical-core scope).

14. **GDPR right-to-erasure vs FHIR immutability**: FHIR resources are versioned and immutable by design (history). GDPR requires erasure. The anonymization approach (Presidio, ADR-0114) resolves this for most cases, but what is the policy for FHIR AuditEvent records that reference an erased patient? Can AuditEvent references be pseudonymized post-erasure?
    → tracked: [m12-consent-phi-enforcement.md](../research/m12-consent-phi-enforcement.md) §5.3 (erasure = Presidio anonymization preserving FHIR/audit integrity; AuditEvent patient refs pseudonymized to a tombstone id — reference-only envelope ADR-0212 makes this safe; key-management detail DEFERRED-MILESTONE).

15. **CMS-0057-F Payer-to-Payer API**: The January 1, 2027 deadline requires Payer-to-Payer FHIR API. HealthStack's claims service would need to implement this if tenants are payers. Which FHIR IGs are required (Da Vinci HRex + PDEX)? Is this in HealthStack scope, or is it a neutral-core insurance module extension?
    → tracked: [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §3 / G1 (IGs = Da Vinci PDEX + HRex [+ PAS/DTR/CRD]; placement = payer-tenant insurance module, NOT M12 clinical-core; M12 produces US-Core clinical FHIR data; Jan 1 2027 date tracked; DEFERRED-MILESTONE).

16. **MONAI Deploy GPU scheduling in K3s/Talos**: The air-gap on-prem profile may not have NVIDIA GPUs. MONAI Deploy with CPU fallback is significantly slower. What is the minimum acceptable inference latency for clinical use without GPU? Is CPU inference acceptable for lower-throughput deployments?
    → tracked: RESOLUTION-MAP §ADR-0115 — DEFERRED-MILESTONE (imaging-AI latency is an imaging-milestone perf concern, gated by `tenant.ai.fda_cleared_only`; not M12 clinical-core scope).

17. **Carequality / CommonWell participation costs**: Carequality and CommonWell participation requires organizational membership and fees. For multi-tenant SaaS, does each tenant need separate membership, or can HealthStack obtain a single platform membership covering all tenants? What is the legal structure?
    → tracked: [m12-regulatory-deadlines.md](../research/m12-regulatory-deadlines.md) §5 / G3 (business/legal membership decision; likely single platform/connector membership with tenant sub-participants — needs counsel; out of M12 code scope; DEFERRED-MILESTONE).

---

## 7. Consequences

### Positive

- HAPI FHIR 8.x as the single FHIR layer for all 21 services eliminates schema drift and reduces operational surface.
- FHIR R4 primary strategy avoids premature R5 migration cost with no regulatory payoff; direct R6 path planned.
- Apache 2.0 / LGPL stack (HAPI, Snowstorm, dcm4chee, OHIF, MONAI Deploy, BridgeLink) is SaaS-redistributable without per-instance royalties.
- Snowstorm + HAPI terminology covers SNOMED CT, LOINC, RxNorm, ICD-10, UCUM with open licenses.
- Da Vinci IGs as native claims interface positions HealthStack ahead of the January 2027 CMS-0057-F mandate.
- MONAI Deploy + OHIF Viewer + vLLM/SGLang creates a complete clinical AI pipeline from DICOM ingestion to viewer overlay.
- HIPAA 2025 NPRM controls (MFA mandatory, AES-256 at rest, TLS 1.3 in transit) align with ADR-0104/0108 already chosen; no new infrastructure required, only configuration enforcement.

### Negative / Risks

- Snowstorm requires Elasticsearch (resource-heavy). Air-gap deployments need 16GB+ RAM per terminology node. Mitigation: Snowstorm Lite for resource-constrained deployments.
- dcm4chee operational complexity (~1 week setup vs Orthanc 0.5 day). Mitigation: Helm chart + Ansible playbook (ADR-0111) automation.
- BridgeLink (Mirth fork) is a young project (2025). Mitigation: HAPI HL7v2 + Spring Integration as the primary HL7v2 path; BridgeLink only for legacy brownfield channel migrations.
- cqf-ruler is now a separate service from HAPI 8.4.0. Adds a deployment unit. Mitigation: deploy as sidecar in same Kubernetes pod group.
- FDA SaMD requirement adds per-model regulatory overhead for US clinical AI. Mitigation: `tenant.ai.fda_cleared_only` flag; non-US and non-clinical-decision deployments unrestricted.
- X12 EDI schema is a closed paid standard; no complete OSS X12 toolkit. Mitigation: clearinghouse boundary delegation; Da Vinci FHIR IGs as the native interface.

---

## 8. References

### Standards Bodies

- HL7 FHIR R4: https://hl7.org/fhir/R4/
- HL7 FHIR R5: https://hl7.org/fhir/R5/
- SMART App Launch 2.2.0: https://build.fhir.org/ig/HL7/smart-app-launch/
- CDS Hooks specification: https://cds-hooks.org/
- CQL Specification v1.5.3: https://cql.hl7.org/
- IHE Profiles: https://profiles.ihe.net/
- USCDI v3: https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi

### Regulatory

- HIPAA Security Rule NPRM (Jan 2025): https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/factsheet/index.html
- CMS-0057-F Interoperability and Prior Authorization Final Rule: https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f
- FDA AI/ML SaMD Draft Guidance (Jan 2025): https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-software-medical-device
- TEFCA QHIN status (May 2026): https://rce.sequoiaproject.org/

### Tools and Projects

- HAPI FHIR 8.x changelog: https://hapifhir.io/hapi-fhir/docs/introduction/changelog.html
- HAPI FHIR GitHub: https://github.com/hapifhir/hapi-fhir
- Snowstorm GitHub: https://github.com/IHTSDO/snowstorm
- Snowstorm Lite: https://github.com/IHTSDO/snowstorm-lite
- dcm4chee: https://www.dcm4che.org/
- OHIF Viewer: https://ohif.org/ — https://github.com/OHIF/Viewers
- BridgeLink (Mirth fork): https://nirmitee.io/blog/bridgelink-open-source-mirth-connect-fork-migration-guide/
- MONAI Deploy: https://monai.io/deploy.html
- cqf-ruler: https://github.com/cqframework/cqf-ruler (see also: https://github.com/mattStorer/cqf-ruler)
- SanteMPI: https://help.santesuite.org/product-overview/santesuite-products/master-patient-index-santempi
- HAPI HL7v2: https://hapifhir.io/hapi-hl7v2/

### Research / Industry Reports

- State of FHIR 2025 Survey (Firely): https://fire.ly/blog/the-state-of-fhir-in-2025/
- FHIR R4 vs R5 vs R6 analysis (Health Samurai 2026): https://www.health-samurai.io/articles/fhir-r4-vs-fhir-r5-choosing-the-right-version-for-your-implementation
- HIPAA MFA + Encryption mandate analysis: https://www.cyera.com/blog/new-hipaa-rules-mandate-mfa-and-encryption-for-ephi--is-your-organization-ready
- SanteMPI ML accuracy (NIH): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10365597/
- MONAI Deploy at Mayo Clinic / Siemens: https://developer.nvidia.com/blog/taking-ai-into-clinical-production-with-monai-deploy/
- TEFCA 2025 priorities: https://www.healthit.gov/buzz-blog/health-information-exchange-2/tefca-priorities-and-plans-for-the-remainder-of-2025
- Orthanc vs dcm4chee community comparison: https://discourse.orthanc-server.org/t/how-does-orthanc-compare-to-dcm4chee/2275
- BridgeLink fork analysis: https://www.healthcareittoday.com/2025/08/14/a-look-at-bridgelinks-fork-of-the-open-source-mirth-connect/

---

*ADR-0115 — CuraOS HealthStack Overlays — 2026-05-24*
