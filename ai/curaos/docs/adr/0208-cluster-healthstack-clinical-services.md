# ADR-0208 — Cluster: HealthStack Clinical Services

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — HealthStack Clinical Services (19 services)
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0102 Events & Messaging](0102-event-messaging.md)
- [ADR-0103 API Surface](0103-api-surface.md)
- [ADR-0104 Identity & Audit](0104-identity-auth.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0108 Security & Secrets](0108-security-secrets.md)
- [ADR-0109 Containers & Orchestration](0109-containers-orchestration.md)
- [ADR-0110 CI/CD & Release](0110-cicd-release.md)
- [ADR-0113 Analytics & Reporting](0113-analytics-reporting.md)
- [ADR-0114 AI & Agent Integration](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays (primary HealthStack tech ADR)](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
**Cross-cluster dependencies:**
- [ADR-0200 Identity/Party/Org/Audit cluster](0200-cluster-identity-party-org-audit.md) — audit-service (every PHI access)
- [ADR-0201 Platform Shared Services cluster](0201-cluster-platform-shared-services.md) — notify-service (clinical alerts)
- [ADR-0205 HR cluster](0205-cluster-docs-esign-crm-donation-hr-business.md) — clinician staff registry
- [ADR-0206 Fleet cluster](0206-cluster-fleet-geospatial-site-conversion-integrations.md) — EMS fleet integration
- [ADR-0207 Education cluster](0207-cluster-educationstack.md) — patient education + clinician CME

---

## 1. Context

### 1.1 What this cluster is

These 19 services are the **HealthStack vertical overlay for clinical care delivery**. They are opt-in: tenants without HealthStack receive a clean neutral-core CuraOS deployment. Every service in this cluster:

1. **Wraps HAPI FHIR 8.x** — the shared JVM sidecar (per ADR-0115 SD-1). No service runs its own FHIR server. All FHIR persistence goes through the shared HAPI JPA on PostgreSQL 17. NestJS services call HAPI via internal HTTP; they do not embed the JVM.
2. **Enforces PHI boundaries** — PHI lives only in HealthStack schemas (never in neutral service schemas). Schema-per-tenant PG isolation. Every field containing ePHI tagged in MikroORM entity metadata and migration metadata.
3. **Emits FHIR-native events** — FHIR Subscriptions bridge to Kafka via APISIX rest-hook routes (per ADR-0115 SD-2). AsyncAPI 3 schemas in Apicurio registry.
4. **Enforces HIPAA audit** — every PHI access triggers an audit record in audit-service (ADR-0200) via the shared `@healthstack/audit` interceptor. Tamper-evident hash-chain PG. 6-year minimum retention.
5. **Participates in SMART-on-FHIR** — all external-facing FHIR endpoints require SMART scopes (per ADR-0120 / ADR-0115 §6). Scope enforcement happens at APISIX route level before request reaches NestJS.

### 1.2 What this cluster is NOT

- Not independent FHIR servers per service — one shared HAPI JPA sidecar.
- Not a workflow engine — clinical pathways run on Temporal via healthstack-workflow-service, which delegates to CuraOS Workflow Manager (ADR-0122).
- Not a neutral service — all 19 services are vertical overlays. Dependency direction: HealthStack → neutral core. CI guards reverse coupling.

### 1.3 Patient-centric vision enforcement (ADR-0099 §15 + ADR-0151 F-012)

ADR-0151 finding F-012 established that tenant-built apps can degrade clinical SLA. This cluster ADR specifies concrete enforcement:

| Gate | Mechanism |
|---|---|
| Clinical service P95 latency ≤ 250ms | K8s LimitRange + Capsule (ADR-0109) resource quotas per namespace |
| Admin-tier traffic isolated from clinical-tier | APISIX upstream selectors; dedicated `healthstack-clinical` K8s namespace |
| Tenant app FHIR quota enforcement | HealthStack module quotas enforced at APISIX before FHIR call reaches HAPI |
| PHI audit on every clinical call | `@healthstack/audit` NestJS interceptor mandatory on every controller method touching FHIR resources |
| Break-glass emergency access | Dual sign-off + reason code logged; audit record created before access granted; Cerbos ABAC policy `break-glass` role; auto-expiry 4h |
| SNOMED CT licensing | `tenant.terminology_jurisdiction` (ISO 3166-1 alpha-2) validated at terminology module activation |

---

## 2. Shared Cluster Decisions

All 19 services inherit the full canonical baseline (ADRs 0100–0114) plus the HealthStack-specific stack from ADR-0115. The decisions below apply cluster-wide unless a per-service section explicitly overrides.

### 2.1 Runtime

**NestJS (TypeScript) per ADR-0100.** Fastify adapter. `@nestjs/microservices` for event consumers (Kafka + NATS transports). Each service is a NestJS modulith deployable standalone or embedded per tenant profile. JVM sidecars (HAPI FHIR, Snowstorm, dcm4chee, cqf-ruler) run as co-located pods; NestJS calls them via HTTP — no JVM code in NestJS services.

### 2.2 FHIR layer

**HAPI FHIR JPA Server 8.x** shared sidecar per ADR-0115 SD-1. R4 primary; R5 experimental endpoint on APISIX opt-in header. Each service registers a FHIR `CapabilityStatement` scoped to its supported resource types via HAPI profile registration. Services issue FHIR REST calls to HAPI; HAPI owns persistence. No service writes FHIR resources directly to PG.

### 2.3 Terminology

**Snowstorm (Apache 2.0)** for SNOMED CT (per ADR-0115 SD-3). HAPI built-in terminology for LOINC, RxNorm, ICD-10, UCUM. Per-tenant jurisdiction tracking in `tenant.terminology_jurisdiction`. Snowstorm Lite for resource-constrained on-prem.

### 2.4 Data

**PostgreSQL 17 schema-per-tenant** per ADR-0101. MikroORM for clinical aggregate roots + Drizzle migrations where table-level migration control is needed per [[curaos-orm-rule]]. Valkey for hot cache (patient context, consent state). SeaweedFS for clinical document blobs, DICOM files, note attachments. ePHI-tagged columns use Tink envelope encryption (ADR-0108). No service reads another service's PG schema — cross-service data via FHIR REST or Kafka event.

### 2.5 Events

**Kafka 4** (durable, cross-service) + **NATS JetStream** (low-latency intra-cluster) per ADR-0102. Outbox pattern on every domain event. FHIR Subscriptions (R4 rest-hook) bridge to Kafka via APISIX internal route. AsyncAPI 3 schema registry in Apicurio. DLQ on every consumer with Grafana alert.

### 2.6 API surface

**TypeSpec-first** per ADR-0103. REST primary (Fastify). FHIR REST via HAPI. SMART-on-FHIR scopes enforced at APISIX. GraphQL sidecar (`@nestjs/graphql` + Apollo) for clinical query aggregation. tRPC for internal service-to-service calls. CDS Hooks via cqf-ruler sidecar (per ADR-0115 SD-6).

### 2.7 Auth + RBAC

**Better Auth + SMART-on-FHIR** per ADR-0120 / ADR-0115 §6. Cerbos ABAC policies for clinical role hierarchy (attending, resident, nurse, pharmacist, radiologist, lab tech, patient, emergency). `X-Tenant-ID` claim extracted by shared `TenantInterceptor`. Break-glass role in Cerbos with dual-approval workflow via Temporal (healthstack-workflow-service).

### 2.8 Observability

**OTel SDK** on every service per ADR-0107. Structured JSON logs → Loki. Spans → Tempo. Metrics → VictoriaMetrics. Grafana dashboards per service + HealthStack cluster rollup. Every FHIR read/write emits span with `fhir.resource_type`, `fhir.resource_id` (hashed for log safety), `tenant.id`. Clinical latency SLA dashboard: P50/P95/P99 per service, alert at P95 > 250ms.

### 2.9 Security

Pre-commit: Gitleaks + Semgrep. SBOM: Syft. Image scan: Trivy. Runtime: Falco + Wazuh. OpenBao secrets at pod startup. All PHI in transit: TLS 1.2+ minimum (1.3 preferred). At rest: AES-256 via Tink. MFA mandatory (HIPAA 2025 NPRM). Audit trail: tamper-evident hash-chain, 6-year retention.

### 2.10 Codegen scaffolding

Each service generated via ADR-0123 cookbook recipe `healthstack:fhir-service`: NestJS FHIR module + Prisma PHI schema + TypeSpec REST spec + AsyncAPI event spec + SMART scope declarations + Cerbos clinical policy template + Vitest unit + FHIR integration test scaffold (with recorded HAPI payloads as mocks).

### 2.11 Multi-tenant isolation

Schema-per-tenant PG (SaaS) / dedicated DB (enterprise on-prem). Kafka partition key = `tenantId`. HAPI FHIR: per-tenant FHIR `Partition` (HAPI multi-tenancy mode). Snowstorm: per-tenant branch (national edition). SNOMED CT licensing validated per tenant at module activation.

### 2.12 OSS sidecar summary

| Sidecar | License | Role |
|---|---|---|
| HAPI FHIR JPA 8.x (JVM) | Apache 2.0 | Shared FHIR persistence + search + validation |
| Snowstorm (JVM + ES) | Apache 2.0 | SNOMED CT terminology |
| dcm4chee (JVM) | LGPL 2.1 | DICOM PACS |
| OHIF Viewer 3.x | Apache 2.0 | Zero-footprint DICOM viewer |
| cqf-ruler + CQL 1.5.3 (JVM) | Apache 2.0 | CDS Hooks + clinical reasoning |
| Pathling (JVM) | Apache 2.0 | FHIR population analytics |
| SanteMPI (JVM) | Apache 2.0 | Master Patient Index |
| HAPI HL7v2 + Spring Integration MLLP | Apache 2.0 | HL7v2 ingestion |
| MONAI Deploy | Apache 2.0 | Imaging AI inference |

---

## 3. Per-Service Specifications

---

### 3.1 `healthstack-patient-service`

**Role:** Patient master record. Single source of truth for patient identity within HealthStack. Delegates MPI matching to SanteMPI sidecar.

**FHIR resources:** `Patient`, `RelatedPerson`, `Person`

**Responsibilities:**
- Create/update/merge patient demographics. SanteMPI probabilistic matching on admit/register.
- Maintain **consent state cache** in Valkey (invalidated on any `Consent` resource change from healthstack-consent-service).
- Expose patient context API: resolved patient + active consents + active care team — consumed by every other clinical service on session init.
- Partition management: every patient record created in tenant's HAPI FHIR partition.

**Key APIs:**
- `GET /fhir/r4/Patient/:id` — SMART scope `patient/Patient.read`
- `POST /fhir/r4/Patient/$match` — MPI probabilistic match
- `GET /patients/:id/context` — internal tRPC: resolved patient + consent + care team
- `POST /patients/merge` — duplicate merge with audit trail

**Key events produced:**
- `healthstack.patient.registered` — new patient created
- `healthstack.patient.merged` — duplicate merge completed
- `healthstack.patient.demographics-updated`

**Key events consumed:**
- `healthstack.consent.updated` — invalidate consent state cache

**Integration points:**
- SanteMPI: HTTP calls for `$match` and merge workflows
- healthstack-consent-service: Kafka subscription for consent invalidation
- audit-service: every patient read/write
- notify-service: patient portal welcome notification on registration

**Tenant isolation:** HAPI FHIR partition per tenant. SanteMPI instance per tenant (SaaS: shared cluster with tenant namespace; on-prem: dedicated).

**Codegen recipe:** `healthstack:fhir-service --resources Patient,RelatedPerson,Person --mpi`

---

### 3.2 `healthstack-clinical-scheduling-service`

**Role:** Clinical appointment scheduling — slots, bookings, waitlists, resource calendars.

**FHIR resources:** `Appointment`, `AppointmentResponse`, `Schedule`, `Slot`

**Responsibilities:**
- Manage provider/resource `Schedule` and `Slot` availability grids.
- Book, modify, cancel `Appointment`; capture `AppointmentResponse` from each participant.
- Waitlist management: offer slot → patient response → confirm/cancel cycle via Temporal workflow.
- Integrate with calendar-service (neutral) for provider calendar blocks.
- Conflict detection: double-booking prevention via Valkey distributed lock on slot resource.

**Key APIs:**
- `GET /fhir/r4/Slot?schedule=:id&status=free` — available slots
- `POST /fhir/r4/Appointment` — book appointment (SMART `user/Appointment.write`)
- `POST /fhir/r4/Appointment/:id/$cancel`
- `GET /scheduling/provider/:id/calendar` — internal tRPC: provider availability grid

**Key events produced:**
- `healthstack.appointment.booked`
- `healthstack.appointment.cancelled`
- `healthstack.appointment.reminder-due` → consumed by healthstack-automation-service

**Key events consumed:**
- `healthstack.careplans.activity-due` — scheduled activity triggers appointment slot search

**Integration points:**
- calendar-service (neutral): provider calendar blocks
- healthstack-automation-service: reminder scheduling
- notify-service: appointment confirmation + reminder notifications
- healthstack-workflow-service: waitlist offer/accept Temporal workflow

**Codegen recipe:** `healthstack:fhir-service --resources Appointment,Schedule,Slot --locking`

---

### 3.3 `healthstack-careplans-service`

**Role:** FHIR CarePlan execution engine. Compiles `PlanDefinition` → `CarePlan` + `RequestGroup` via CQL/cqf-ruler. Tracks `Goal` progress.

**FHIR resources:** `CarePlan`, `CarePlanActivity`, `Goal`, `PlanDefinition`, `ActivityDefinition`, `RequestGroup`

**Responsibilities:**
- Apply `PlanDefinition` (clinical protocol) to a patient → instantiate `CarePlan` + `RequestGroup` via `$apply` operation on cqf-ruler.
- Track `Goal` status over time; compute progress metrics.
- Emit activity-due events that trigger downstream ordering, scheduling, or notification.
- Care team assignment: link `CareTeam` to `CarePlan`; route tasks to correct clinician role.

**Key APIs:**
- `POST /fhir/r4/PlanDefinition/:id/$apply` — instantiate care plan
- `GET /fhir/r4/CarePlan?patient=:id&status=active`
- `PATCH /fhir/r4/Goal/:id` — update goal status
- `GET /careplans/:id/progress` — internal tRPC: goal attainment summary

**Key events produced:**
- `healthstack.careplan.instantiated`
- `healthstack.careplan.activity-due`
- `healthstack.careplan.goal-achieved`
- `healthstack.careplan.goal-missed`

**Key events consumed:**
- `healthstack.orders.completed` — mark order-linked activity as satisfied
- `healthstack.lab.result-received` — evaluate goal criteria

**Integration points:**
- cqf-ruler sidecar: `$apply`, CQL expression evaluation
- healthstack-orders-service: auto-generate orders from `ActivityDefinition`
- healthstack-clinical-scheduling-service: schedule care plan appointments
- healthstack-workflow-service: care coordination Temporal workflow

**Codegen recipe:** `healthstack:fhir-service --resources CarePlan,Goal,PlanDefinition,ActivityDefinition --cqf`

---

### 3.4 `healthstack-orders-service`

**Role:** Computerized Physician Order Entry (CPOE). All clinical orders as FHIR `ServiceRequest`.

**FHIR resources:** `ServiceRequest`, `Task` (fulfillment tracking)

**Responsibilities:**
- Create, modify, cancel `ServiceRequest` (lab, imaging, referral, procedure, nursing).
- Duplicate order detection via CDS Hooks (cqf-ruler): warn on duplicate lab order within 24h window.
- Order set support: `RequestGroup` bundles multiple `ServiceRequest` resources atomically.
- Fulfillment tracking: `Task` lifecycle tied to `ServiceRequest` (requested → accepted → in-progress → completed/failed).
- Delegate to specialist services: lab orders → healthstack-lab-service; imaging orders → healthstack-imaging-service.

**Key APIs:**
- `POST /fhir/r4/ServiceRequest` — create order (SMART `user/ServiceRequest.write`)
- `POST /fhir/r4/ServiceRequest/:id/$revoke` — cancel order
- `GET /fhir/r4/Task?based-on=ServiceRequest/:id` — fulfillment status
- `POST /orders/order-set` — internal: atomic multi-order bundle

**Key events produced:**
- `healthstack.orders.placed` — triggers fulfillment in lab/imaging/scheduling
- `healthstack.orders.completed`
- `healthstack.orders.cancelled`

**Key events consumed:**
- `healthstack.careplans.activity-due` — auto-generate order from ActivityDefinition
- CDS Hooks pre-order check from cqf-ruler

**Integration points:**
- cqf-ruler: duplicate-order CDS Hook, drug-drug interaction check (for medication orders routing via healthstack-meds-service)
- healthstack-lab-service / healthstack-imaging-service: domain-specific fulfillment
- healthstack-claims-service: order → claim line-item generation

**Codegen recipe:** `healthstack:fhir-service --resources ServiceRequest,Task --cds-hooks`

---

### 3.5 `healthstack-meds-service`

**Role:** Medication management — prescribing, dispensing, administration. E-prescribing to external pharmacies.

**FHIR resources:** `MedicationRequest`, `Medication`, `MedicationAdministration`, `MedicationDispense`, `MedicationStatement`

**Responsibilities:**
- Create `MedicationRequest` (prescription); validate against RxNorm + drug-drug interaction CDS Hook.
- Track `MedicationAdministration` (MAR — Medication Administration Record) for inpatient.
- `MedicationDispense` workflow for in-house pharmacy.
- E-prescribing: translate `MedicationRequest` → NCPDP SCRIPT 2017071 XML via adapter; route to pharmacy network (Surescripts-compatible endpoint, configurable per tenant).
- Controlled substance DEA schedule tracking; state PDMP query integration (FHIR-based PDMP IG where available).

**Key APIs:**
- `POST /fhir/r4/MedicationRequest` — prescribe (SMART `user/MedicationRequest.write`)
- `POST /fhir/r4/MedicationAdministration` — record administration
- `GET /fhir/r4/MedicationRequest?patient=:id&status=active` — active meds list
- `POST /meds/eprescribe` — internal: route to e-prescribing adapter

**Key events produced:**
- `healthstack.meds.prescribed`
- `healthstack.meds.administered`
- `healthstack.meds.dispense-ready`
- `healthstack.meds.ddi-alert` — drug-drug interaction detected

**Key events consumed:**
- `healthstack.orders.placed` — medication order from CPOE
- `healthstack.lab.result-received` — renal/hepatic function alerts triggering dose review

**Integration points:**
- cqf-ruler: drug-drug interaction CDS Hook, drug-allergy check
- healthstack-problems-service: allergy list for interaction check
- healthstack-interop-service: NCPDP SCRIPT e-prescribing translation
- notify-service: pharmacist dispense-ready alert, DDI alert to prescriber

**Codegen recipe:** `healthstack:fhir-service --resources MedicationRequest,MedicationAdministration,MedicationDispense --eprescribe`

---

### 3.6 `healthstack-lab-service`

**Role:** Laboratory information system interoperability — specimen tracking, result ingestion, diagnostic report generation.

**FHIR resources:** `Specimen`, `Observation`, `DiagnosticReport`, `ServiceRequest` (reference)

**Responsibilities:**
- Receive lab orders from healthstack-orders-service; track `Specimen` collection and chain-of-custody.
- Ingest results via HL7v2 ORU^R01 (via healthstack-interop-service MLLP bridge) or FHIR `Observation` direct POST.
- Generate `DiagnosticReport` aggregating `Observation` results.
- Critical value alerting: if `Observation.interpretation` = `critical`, emit alert immediately (P95 < 500ms from ingestion to notify-service).
- Reference ranges: per-lab, per-population (age, sex, pregnancy) reference range lookup from Valkey cache.
- LIS interop: bidirectional HL7v2 (ORM^O01 outbound orders, ORU^R01 inbound results) via healthstack-interop-service.

**Key APIs:**
- `POST /fhir/r4/Specimen` — specimen registration
- `GET /fhir/r4/DiagnosticReport?patient=:id&category=LAB`
- `POST /fhir/r4/Observation` — result ingestion (internal, from interop-service)
- `GET /lab/pending?order=:serviceRequestId` — internal tRPC: pending specimens for order

**Key events produced:**
- `healthstack.lab.result-received` — triggers care plan evaluation, meds review
- `healthstack.lab.critical-value` — P99 < 1s to notify-service
- `healthstack.lab.report-finalized`

**Key events consumed:**
- `healthstack.orders.placed` — lab order triggers specimen workflow
- HL7v2 ORU^R01 via NATS (from healthstack-interop-service)

**Integration points:**
- healthstack-interop-service: HL7v2 ORU/ORM bridge
- notify-service: critical value alert to ordering provider
- healthstack-claims-service: lab result → claim diagnosis linkage

**Codegen recipe:** `healthstack:fhir-service --resources Specimen,Observation,DiagnosticReport --hl7v2-consumer`

---

### 3.7 `healthstack-imaging-service`

**Role:** Radiology and imaging management. DICOM PACS via dcm4chee sidecar. OHIF Viewer integration. MONAI Deploy AI inference pipeline.

**FHIR resources:** `ImagingStudy`, `ImagingSelection`, `BodyStructure`

**Responsibilities:**
- Receive imaging orders from healthstack-orders-service; create `ImagingStudy` stub.
- DICOM WADO-RS / QIDO-RS / STOW-RS proxy to dcm4chee sidecar.
- Serve OHIF Viewer session tokens — scoped DICOMweb URL + SMART token forwarded to OHIF.
- MONAI Deploy AI inference: on study completed, trigger configured inference pipeline (e.g. chest X-ray triage, pathology slide analysis). Attach inference `Observation` to `ImagingStudy`.
- Prior study retrieval: IHE XDS-I query via healthstack-interop-service for cross-org studies.
- UDI tracking for imaging devices (link to healthstack-devices-service).

**Key APIs:**
- `GET /fhir/r4/ImagingStudy?patient=:id`
- `GET /imaging/viewer-session/:studyId` — returns scoped OHIF launch URL
- `POST /imaging/dicom` — STOW-RS ingest (proxied to dcm4chee)
- `GET /imaging/wado/:studyUid/:seriesUid/:instanceUid` — WADO-RS proxy

**Key events produced:**
- `healthstack.imaging.study-received`
- `healthstack.imaging.study-read` — radiologist signed report
- `healthstack.imaging.inference-complete` — AI result attached

**Key events consumed:**
- `healthstack.orders.placed` — imaging order triggers ImagingStudy creation

**Integration points:**
- dcm4chee sidecar: DICOM storage, WADO-RS, QIDO-RS
- OHIF Viewer 3.x: DICOMweb datasource, SMART launch context
- MONAI Deploy: study-completed trigger → inference job → result ingestion
- healthstack-interop-service: IHE XDS-I prior study query
- healthstack-devices-service: UDI → modality device registry lookup

**Codegen recipe:** `healthstack:fhir-service --resources ImagingStudy --dicom --monai`

---

### 3.8 `healthstack-notes-service`

**Role:** Clinical documentation — structured and narrative notes, C-CDA generation, document lifecycle.

**FHIR resources:** `DocumentReference`, `Composition`, `Binary`

**Responsibilities:**
- Author, amend, sign clinical notes (`Composition` for structured; `DocumentReference` for unstructured/scanned).
- NLP-assisted note structuring: extract ICD/SNOMED codes via LiteLLM (ADR-0114) + Presidio PHI detection.
- C-CDA R2.1 generation: `Composition` → C-CDA XML via `linuxforhealth/fhir-to-cda-converter` (Apache 2.0). Store as `DocumentReference.content` in SeaweedFS.
- Addendum workflow: addendum creates new `Composition` linked to original; original is immutable.
- Template library: encounter note, H&P, discharge summary, operative note — per specialty.
- NoteTemplates stored as `PlanDefinition`-linked `Questionnaire` resources.

**Key APIs:**
- `POST /fhir/r4/Composition` — create note (SMART `user/Composition.write`)
- `POST /fhir/r4/Composition/:id/$document` — generate document bundle
- `GET /fhir/r4/DocumentReference?patient=:id&type=note`
- `POST /notes/:id/sign` — attestation workflow (Temporal)
- `GET /notes/templates` — specialty note templates

**Key events produced:**
- `healthstack.notes.created`
- `healthstack.notes.signed`
- `healthstack.notes.addendum-added`

**Key events consumed:**
- `healthstack.encounter.opened` — auto-create note stub for encounter
- `healthstack.orders.completed` — link results to note

**Integration points:**
- SeaweedFS: document blob storage
- healthstack-problems-service: code extraction linkage
- healthstack-interop-service: C-CDA export for transitions of care
- LiteLLM (ADR-0114): NLP coding assist

**Codegen recipe:** `healthstack:fhir-service --resources DocumentReference,Composition --ccda`

---

### 3.9 `healthstack-problems-service`

**Role:** Problem list management. ICD-10 and SNOMED CT coded conditions.

**FHIR resources:** `Condition`, `AllergyIntolerance`

**Responsibilities:**
- Maintain active, resolved, and historical problem list per patient.
- Allergy and intolerance registry (feeds drug-allergy check in healthstack-meds-service).
- Coding assist: free-text problem description → SNOMED CT concept lookup via Snowstorm `$lookup` + LiteLLM disambiguation.
- Chronic condition tracking: onset date, abatement, clinical status, verification status, severity.
- Problem list used by CDS Hooks: cqf-ruler retrieves `Condition` resources in care gap computation.

**Key APIs:**
- `POST /fhir/r4/Condition` — add problem (SMART `user/Condition.write`)
- `PATCH /fhir/r4/Condition/:id` — update status (resolve, correct)
- `GET /fhir/r4/Condition?patient=:id&clinical-status=active`
- `POST /fhir/r4/AllergyIntolerance`
- `GET /problems/code-suggest?text=:q` — internal: SNOMED + ICD suggestion via Snowstorm

**Key events produced:**
- `healthstack.problems.condition-added`
- `healthstack.problems.condition-resolved`
- `healthstack.problems.allergy-added`

**Key events consumed:**
- `healthstack.notes.signed` — extract coded conditions from note via NLP pipeline

**Integration points:**
- Snowstorm sidecar: SNOMED CT lookup + subsumption
- healthstack-meds-service: allergy feed for DDI/drug-allergy check
- cqf-ruler: `Condition` resources in CQL-based care gap logic

**Codegen recipe:** `healthstack:fhir-service --resources Condition,AllergyIntolerance --terminology`

---

### 3.10 `healthstack-consent-service`

**Role:** FHIR Consent management. Granular share-anywhere consent. HIPAA BPPC profiles. Break-glass authorization.

**FHIR resources:** `Consent`, `Permission` (R5 preview — informational only)

**Responsibilities:**
- Create, update, revoke `Consent` resources with granular scope (data category, purpose, recipient, expiry).
- HIPAA BPPC profiles: treatment, payment, healthcare operations, research, marketing.
- Publish consent decisions to Valkey patient context cache (healthstack-patient-service reads this on session init).
- Consent enforcement point: expose a `ConsentDecision` tRPC API for real-time consent check — called by every clinical service before PHI access.
- Break-glass: dual sign-off workflow via Temporal; emergency access granted with reason code; full audit; auto-expiry 4h; notification to privacy officer.
- Patient portal: FHIR Consent patient-facing management UI via Builder Apps (ADR-0121b) with SMART patient scopes.

**Key APIs:**
- `POST /fhir/r4/Consent` — record consent (SMART `patient/Consent.write` or `user/Consent.write`)
- `POST /fhir/r4/Consent/:id/$revoke`
- `POST /consent/decision` — internal tRPC: `{patientId, purpose, requesterId}` → `{permit|deny, basis}`
- `POST /consent/break-glass` — emergency access request, dual-sign workflow

**Key events produced:**
- `healthstack.consent.updated` — triggers cache invalidation in patient-service
- `healthstack.consent.revoked`
- `healthstack.consent.break-glass-activated`

**Key events consumed:**
- None (consent is the authority source; it does not derive from other events)

**Integration points:**
- healthstack-patient-service: consent state cache invalidation
- healthstack-workflow-service: break-glass dual-sign Temporal workflow
- audit-service: every consent decision + break-glass event
- notify-service: privacy officer alert on break-glass activation

**Codegen recipe:** `healthstack:fhir-service --resources Consent --break-glass --bppc`

---

### 3.11 `healthstack-devices-service`

**Role:** Medical device registry. FHIR Device + DeviceMetric. IoT integration. UDI tracking.

**FHIR resources:** `Device`, `DeviceMetric`, `DeviceUsage`, `DeviceRequest`

**Responsibilities:**
- Register and manage medical devices: `Device` resource with UDI (FDA UDI DI/PI parsing via GUDID lookup).
- Track `DeviceMetric` streams from connected IoT devices (bedside monitors, wearables, infusion pumps).
- IoT ingestion: MQTT → NATS bridge; FHIR `Observation` generated per metric reading; batch-flushed to HAPI FHIR.
- Alert thresholds: `DeviceMetric.operationalStatus` change → `healthstack.devices.alert` event.
- Device request and usage tracking (`DeviceRequest`, `DeviceUsage`) for durable medical equipment orders.
- UDI registry integration: GUDID FHIR API lookup for device metadata (manufacturer, model, expiry).

**Key APIs:**
- `POST /fhir/r4/Device` — register device
- `GET /fhir/r4/DeviceMetric?source=Device/:id`
- `POST /devices/metric-stream` — internal: IoT metric batch ingest
- `GET /devices/:id/udi` — GUDID UDI resolution

**Key events produced:**
- `healthstack.devices.registered`
- `healthstack.devices.metric-received` — continuous stream (NATS JetStream)
- `healthstack.devices.alert` — threshold breach

**Key events consumed:**
- `healthstack.orders.placed` — DeviceRequest fulfillment

**Integration points:**
- NATS JetStream: IoT metric ingest (not Kafka — volume-based routing; metrics batched before Kafka fan-out)
- healthstack-imaging-service: UDI → modality device lookup
- notify-service: device threshold alert to care team
- LiteLLM (ADR-0114): wearable trend analysis on historical DeviceMetric stream

**Codegen recipe:** `healthstack:fhir-service --resources Device,DeviceMetric --iot-ingest`

---

### 3.12 `healthstack-ems-service`

**Role:** Emergency Medical Services. NEMSIS 3.5 prehospital data. Prehospital FHIR overlay. Fleet integration via ADR-0206.

**FHIR resources:** `Encounter` (prehospital), `Observation`, `Condition`, `Procedure` (prehospital interventions)

**Responsibilities:**
- Receive NEMSIS 3.5 ePCR (Electronic Patient Care Report) XML; transform to FHIR `Encounter` + associated resources.
- Dispatch integration: consume fleet-service (ADR-0206) unit location + availability events; assign closest available unit.
- Prehospital FHIR overlay: extend `Encounter` with NEMSIS extensions (unit response times, trauma score, interventions).
- Hospital notification: on ambulance departure, emit arrival-notification event → destination ED receives incoming patient FHIR bundle.
- CAD (Computer-Aided Dispatch) integration: bidirectional NATS event bridge with fleet-service dispatch events.
- Offline operation: EMS units operate with local SQLite + FHIR bundle sync on reconnect (air-gap pattern for field use).

**Key APIs:**
- `POST /ems/epcr` — ingest NEMSIS 3.5 XML ePCR; returns FHIR Encounter ID
- `GET /fhir/r4/Encounter?type=ems&patient=:id`
- `POST /ems/dispatch` — internal tRPC: request unit dispatch (calls fleet-service)
- `POST /ems/arrival-notify` — push incoming patient bundle to destination hospital tenant

**Key events produced:**
- `healthstack.ems.dispatch-requested`
- `healthstack.ems.unit-on-scene`
- `healthstack.ems.patient-transport-started`
- `healthstack.ems.arrival-notification`

**Key events consumed:**
- `fleet.unit.location-updated` — from fleet-service (ADR-0206)
- `fleet.unit.available` — unit status change

**Integration points:**
- fleet-service (ADR-0206): unit dispatch + location via Kafka + tRPC
- healthstack-interop-service: NEMSIS 3.5 XML transform
- healthstack-patient-service: patient lookup on arrival at hospital
- notify-service: ED arrival alert to receiving care team

**Codegen recipe:** `healthstack:fhir-service --resources Encounter --nemsis --fleet-integration`

---

### 3.13 `healthstack-claims-service`

**Role:** Medical claims lifecycle. FHIR Claim + ClaimResponse. Da Vinci PAS/PCT IGs. X12 EDI 837/835 via clearinghouse.

**FHIR resources:** `Claim`, `ClaimResponse`, `ExplanationOfBenefit`, `Coverage`, `CoverageEligibilityRequest`, `CoverageEligibilityResponse`

**Responsibilities:**
- Assemble `Claim` from encounter, orders, lab, meds, diagnosis (ICD-10 from healthstack-problems-service).
- Prior authorization: Da Vinci PAS IG — `Claim` profile for prior auth submission; CRD (Coverage Requirements Discovery) via CDS Hook at order entry.
- Patient cost transparency: Da Vinci PCT IG — Good Faith Estimate (GFE) generation.
- X12 EDI: translate `Claim` → 837P/837I at clearinghouse boundary via licensed adapter (not generated internally — delegated to clearinghouse; pyx12 for validation only).
- ERA/EOB ingestion: clearinghouse returns 835 EDI → `ExplanationOfBenefit` via translation.
- Eligibility verification: `CoverageEligibilityRequest` → 270/271 via clearinghouse adapter before appointment or order.

**Key APIs:**
- `POST /fhir/r4/Claim` — submit claim
- `GET /fhir/r4/ClaimResponse?request=Claim/:id`
- `POST /fhir/r4/CoverageEligibilityRequest` — verify insurance eligibility
- `POST /claims/prior-auth` — Da Vinci PAS prior auth submission
- `GET /claims/patient-estimate/:encounterId` — Da Vinci PCT GFE

**Key events produced:**
- `healthstack.claims.submitted`
- `healthstack.claims.adjudicated`
- `healthstack.claims.denied`
- `healthstack.claims.prior-auth-approved`
- `healthstack.claims.prior-auth-denied`

**Key events consumed:**
- `healthstack.orders.placed` — CRD eligibility check trigger
- `healthstack.lab.report-finalized` — attach lab to claim
- `healthstack.encounter.closed` — initiate claim assembly

**Integration points:**
- healthstack-problems-service: ICD-10 diagnosis for claim
- healthstack-interop-service: X12 EDI 837/835 via clearinghouse adapter
- cqf-ruler: CRD CDS Hook at order entry
- notify-service: prior auth decision alert to ordering provider

**Codegen recipe:** `healthstack:fhir-service --resources Claim,ClaimResponse,ExplanationOfBenefit,Coverage --davinci-pas --davinci-pct`

---

### 3.14 `healthstack-interop-service`

**Role:** External interoperability gateway. HL7v2 MLLP, X12 EDI translation, C-CDA, IHE profiles (XDS/XDR/XDM/MHD), TEFCA QHIN, Carequality.

**Responsibilities:**
- **HL7v2 MLLP:** Spring Integration MLLP adapter + HAPI HL7v2 library. Inbound: ADT^A01/A08 (admit/update) → FHIR Patient/Encounter. ORU^R01 → FHIR Observation/DiagnosticReport. ORM^O01 outbound for LIS orders.
- **X12 EDI:** 837/835/270/271/278 translation at clearinghouse boundary. pyx12 (LGPL, Python sidecar) for schema validation only. Production generation delegated to clearinghouse adapter.
- **C-CDA:** `linuxforhealth/fhir-to-cda-converter` (Apache 2.0). C-CDA R2.1 → FHIR on ingest; FHIR → C-CDA on export (via healthstack-notes-service trigger).
- **IHE XDS/XDR/XDM:** document sharing for transitions of care. XDS Registry + Repository pattern; SeaweedFS as repository backend.
- **IHE MHD:** Mobile access to Health Documents — FHIR-native document sharing for mobile and modern EHR clients.
- **TEFCA QHIN:** FHIR-based query via CommonWell / Carequality network participant APIs. QHIN query: `$everything` patient summary, document query, document retrieve.
- **Carequality:** XCA query/retrieve for cross-org document sharing.
- **NEMSIS 3.5:** transform for EMS service (delegated from healthstack-ems-service).

**Key APIs:**
- MLLP listener (TCP, not HTTP): port 2575, per-tenant TLS
- `POST /interop/cda/import` — ingest C-CDA bundle → FHIR
- `GET /interop/cda/export/:patientId/:encounterId` — generate C-CDA
- `POST /interop/qhin/query` — TEFCA patient query
- `POST /interop/xds/retrieve` — IHE XDS document retrieve
- Internal only (tRPC): `nemsis-transform`, `hl7v2-to-fhir`, `x12-validate`

**Key events produced:**
- `healthstack.interop.adt-received` — patient admitted at external facility
- `healthstack.interop.oru-received` — external lab result received
- `healthstack.interop.document-imported`

**Key events consumed:**
- `healthstack.notes.signed` — trigger C-CDA generation + XDR push for transitions of care

**Integration points:**
- All HealthStack services: bidirectional translation hub
- clearinghouse partner: X12 EDI submission endpoint (configurable per tenant)
- TEFCA network: QHIN query APIs
- SeaweedFS: IHE XDS repository document storage

**Codegen recipe:** `healthstack:interop-adapter --protocols hl7v2,cda,xds,mhd,tefca`

---

### 3.15 `healthstack-terminology-service`

**Role:** Clinical terminology management. Snowstorm sidecar wrapping. Per-tenant SNOMED CT licensing. Multi-code-system operations.

**Responsibilities:**
- Expose a unified terminology API over Snowstorm (SNOMED CT) + HAPI built-in (LOINC, RxNorm, ICD-10, UCUM).
- FHIR terminology operations: `$expand`, `$lookup`, `$validate-code`, `$translate` (via ConceptMap).
- Per-tenant licensing: validate `tenant.terminology_jurisdiction` at module activation; load national SNOMED CT edition branch.
- Code translation: ICD-10-CM → SNOMED CT mapping (via NLM General Equivalence Mappings); LOINC → SNOMED CT Observable Entity mapping.
- Custom value sets: tenant-defined value sets stored in HAPI JPA; versioned in Apicurio.
- Air-gap: RF2 SNOMED CT snapshots bundled per national edition; no live SNOMED International calls in air-gap mode.

**Key APIs:**
- `GET /fhir/r4/ValueSet/:id/$expand` — expand value set (proxied to Snowstorm or HAPI)
- `GET /fhir/r4/CodeSystem/$lookup?system=:cs&code=:code`
- `POST /fhir/r4/ConceptMap/$translate` — cross-system code translation
- `GET /terminology/suggest?text=:q&system=snomed` — coding assist (used by notes + problems services)

**Key events produced:**
- `healthstack.terminology.valueset-updated` — triggers re-validation in downstream services

**Key events consumed:**
- None (pull-only; services call terminology APIs on demand)

**Integration points:**
- Snowstorm sidecar: SNOMED CT hierarchies, subsumption, ECL queries
- healthstack-problems-service: SNOMED coding assist
- healthstack-meds-service: RxNorm lookup
- healthstack-lab-service: LOINC reference range lookup
- Apicurio registry: custom value set versioning

**Codegen recipe:** `healthstack:terminology-wrapper --systems snomed,loinc,rxnorm,icd10,ucum`

---

### 3.16 `healthstack-quality-service`

**Role:** Clinical quality measurement. eCQM execution via CQL. HEDIS. CMS reporting. Population analytics via Pathling. FHIR Measure + MeasureReport.

**FHIR resources:** `Measure`, `MeasureReport`, `Library` (CQL)

**Responsibilities:**
- Execute eCQM (electronic Clinical Quality Measures) via cqf-ruler CQL engine: `Measure/$evaluate-measure` for individual patient and population.
- HEDIS measures: HEDIS 2026 Technical Specifications translated to CQL; loaded as FHIR `Library` + `Measure` resources.
- CMS program reporting: generate `MeasureReport` per CMS program (MIPS, APM, VBC) per reporting period. Submit via FHIR API to CMS endpoint (QPP FHIR API per tenant config).
- Population analytics: Pathling (Apache 2.0) sidecar for FHIR-native population-level FHIRPath aggregate queries. Feeds Superset dashboards (ADR-0113).
- Care gap identification: patients not meeting measure criteria → emit `healthstack.quality.care-gap-identified` → healthstack-careplans-service creates intervention activity.
- Measure catalog: tenant subscribes to measure bundles (preventive, chronic, behavioral health); measures activated per subscription.

**Key APIs:**
- `POST /fhir/r4/Measure/:id/$evaluate-measure?patient=:id&periodStart=&periodEnd=`
- `GET /fhir/r4/MeasureReport?measure=Measure/:id&period=:year`
- `POST /quality/submit-cms` — internal: CMS QRP submission
- `POST /quality/population-query` — Pathling FHIRPath aggregate (internal analytics)

**Key events produced:**
- `healthstack.quality.care-gap-identified`
- `healthstack.quality.measure-report-generated`
- `healthstack.quality.cms-submitted`

**Key events consumed:**
- `healthstack.lab.result-received` — refresh measure denominator/numerator
- `healthstack.meds.administered` — refresh medication adherence measures
- `healthstack.careplans.goal-achieved` — refresh care plan quality measures

**Integration points:**
- cqf-ruler sidecar: CQL evaluation, Measure execution
- Pathling sidecar: population FHIRPath analytics
- ClickHouse (ADR-0113): measure result time-series for trending
- healthstack-careplans-service: care gap → intervention
- Superset: population health dashboards

**Codegen recipe:** `healthstack:fhir-service --resources Measure,MeasureReport,Library --cql --pathling`

---

### 3.17 `healthstack-education-service`

**Role:** Patient education content delivery and clinician CME. Integrates education-core-service (ADR-0207). HealthStack-specific overlay on neutral education platform.

**FHIR resources:** `DocumentReference` (education content reference), `Task` (patient education assignment), `Communication` (education delivered)

**Responsibilities:**
- Assign patient education content: clinician assigns educational materials to patient as FHIR `Task`. Content served from education-core-service (ADR-0207).
- Condition-linked content: auto-suggest education materials based on `Condition` codes (SNOMED) from healthstack-problems-service.
- Literacy adaptation: select reading-level-appropriate content per `Patient.extension[reading-level]` (US 6th-grade default; configurable per tenant).
- Clinician CME tracking: CME credits linked to clinical role in hr-service (ADR-0205). CME completion synced to healthstack-workflow-service for credential maintenance workflows.
- FHIR `Communication` resource created on each education delivery — audit trail of what patient received and when.

**Key APIs:**
- `POST /fhir/r4/Task` — assign education material to patient
- `GET /education/recommend?condition=:snomedCode&readingLevel=:level` — content recommendation
- `POST /fhir/r4/Communication` — record education delivered
- `GET /education/cme/clinician/:staffId` — CME transcript

**Key events produced:**
- `healthstack.education.assigned`
- `healthstack.education.completed`
- `healthstack.education.cme-credited`

**Key events consumed:**
- `healthstack.problems.condition-added` — trigger condition-linked content suggestion
- `healthstack.careplans.instantiated` — auto-assign care-plan-linked education

**Integration points:**
- education-core-service (ADR-0207): content catalog, LMS enrollment, CME tracking
- healthstack-problems-service: condition codes → content suggestion
- hr-service (ADR-0205): clinician role → CME requirement tracking
- notify-service: patient education assignment notification

**Codegen recipe:** `healthstack:fhir-service --resources Task,Communication --education-overlay`

---

### 3.18 `healthstack-workflow-service`

**Role:** HealthStack-specific Temporal workflows. Clinical pathways. Care coordination. Break-glass dual-sign. Delegates engine to CuraOS Workflow Manager (ADR-0122) via workflow-core-service.

**Pattern:** Same overlay pattern as ADR-0204. Registers domain-specific Temporal workflow templates at bootstrap. Does not own Temporal cluster. Does not own visual editor (Workflow Canvas, ADR-0121d reused).

**Clinical workflow template library (v1):**

| Template | Trigger | Description |
|---|---|---|
| `clinical-pathway` | `CarePlan.instantiated` | Execute PlanDefinition steps: order → schedule → complete → evaluate goal |
| `care-coordination` | `Referral.accepted` | Multi-provider coordination: task assignment, handoff, SLA tracking |
| `discharge-planning` | `Encounter.discharge-initiated` | Discharge checklist: meds reconciliation, follow-up scheduling, education, transport |
| `break-glass-approval` | `Consent.break-glass-requested` | Dual sign-off: notify privacy officer + supervisor; time-box 15min; auto-deny on timeout |
| `medication-reconciliation` | `Encounter.opened` | Pull active meds list, compare against current prescriptions, flag discrepancies |
| `prior-auth-followup` | `Claims.prior-auth-denied` | Peer-to-peer review workflow: clinical staff appeal → payer CDS Hook → appeal decision |
| `critical-value-response` | `Lab.critical-value` | Notify ordering provider; require acknowledgement within SLA; escalate on timeout |
| `abnormal-result-review` | `Lab.result-finalized` | Clinician review + sign-off + patient notification decision |

**Key APIs:**
- `POST /workflow/pathway/start` — internal tRPC: start clinical pathway for patient
- `GET /workflow/pathway/:instanceId/status`
- `POST /workflow/break-glass/approve/:instanceId` — second signer approval

**Key events produced:**
- `healthstack.workflow.pathway-started`
- `healthstack.workflow.pathway-completed`
- `healthstack.workflow.break-glass-approved`
- `healthstack.workflow.break-glass-denied`

**Key events consumed:**
- Clinical domain events (CarePlan, Encounter, Lab, Claims) — mapped to workflow triggers

**Integration points:**
- CuraOS Workflow Manager (ADR-0122): Temporal task queues, workflow execution
- workflow-core-service (ADR-0204): template registration, shared activity library
- healthstack-consent-service: break-glass decision
- audit-service: every workflow lifecycle event
- notify-service: SLA alerts, approval requests

**Codegen recipe:** `healthstack:workflow-template --engine temporal --domain clinical`

---

### 3.19 `healthstack-automation-service`

**Role:** HealthStack-specific automations. Reminder scheduling. Alert routing. Clinical alert-to-action pipelines. Delegates engine to CuraOS Workflow Manager (ADR-0122) via automation-core-service.

**Pattern:** Thin vertical overlay on automation-core-service (ADR-0204). Registers Activepieces flows at bootstrap. Does not own Activepieces runtime.

**Clinical automation library (v1):**

| Flow | Trigger | Action |
|---|---|---|
| `appointment-reminder` | T-72h, T-24h, T-2h before appointment | SMS + push via notify-service; patient portal confirm/cancel |
| `medication-adherence-check` | Daily cron per active MedicationRequest | Check administration record; alert care team on 2+ consecutive missed doses |
| `lab-result-notify` | `healthstack.lab.report-finalized` | Notify patient via portal + email; attach PDF DiagnosticReport |
| `care-gap-outreach` | `healthstack.quality.care-gap-identified` | Patient outreach via preferred channel; schedule appointment if consented |
| `device-alert-route` | `healthstack.devices.alert` | Route to on-call clinician role; escalate on non-acknowledgement within 15min |
| `prior-auth-expiry` | Cron: 30 days before auth expiry | Alert ordering provider; trigger re-auth workflow |
| `consent-expiry` | Cron: 14 days before consent expiry | Patient notification via portal; renewal prompt |
| `preventive-care-reminder` | Cron: annual per measure gap | Patient outreach aligned to quality measure gap list |

**Key APIs:**
- `POST /automation/trigger` — internal: manual trigger for debugging
- `GET /automation/flows?scope=healthstack` — active flow registry

**Key events produced:**
- `healthstack.automation.reminder-sent`
- `healthstack.automation.alert-escalated`
- `healthstack.automation.outreach-completed`

**Key events consumed:**
- Clinical domain events as automation triggers (see flow library above)

**Integration points:**
- CuraOS Workflow Manager (ADR-0122): Activepieces runtime
- automation-core-service (ADR-0204): trigger + action SDK, piece registry
- notify-service: all outbound patient/clinician communications
- healthstack-clinical-scheduling-service: care gap → appointment booking automation

**Codegen recipe:** `healthstack:automation-flow --engine activepieces --domain clinical`

---

## 4. Event Topology Summary

```
healthstack-patient-service
  ├── produces: patient.registered, patient.merged, patient.demographics-updated
  └── consumes: consent.updated

healthstack-consent-service
  ├── produces: consent.updated, consent.revoked, consent.break-glass-activated
  └── (authority source — consumes no domain events)

healthstack-clinical-scheduling-service
  ├── produces: appointment.booked, appointment.cancelled, appointment.reminder-due
  └── consumes: careplans.activity-due

healthstack-careplans-service
  ├── produces: careplan.instantiated, careplan.activity-due, careplan.goal-achieved/missed
  └── consumes: orders.completed, lab.result-received

healthstack-orders-service
  ├── produces: orders.placed, orders.completed, orders.cancelled
  └── consumes: careplans.activity-due

healthstack-meds-service
  ├── produces: meds.prescribed, meds.administered, meds.ddi-alert
  └── consumes: orders.placed, lab.result-received

healthstack-lab-service
  ├── produces: lab.result-received, lab.critical-value, lab.report-finalized
  └── consumes: orders.placed, HL7v2 ORU (from interop-service)

healthstack-imaging-service
  ├── produces: imaging.study-received, imaging.study-read, imaging.inference-complete
  └── consumes: orders.placed

healthstack-notes-service
  ├── produces: notes.created, notes.signed, notes.addendum-added
  └── consumes: encounter.opened, orders.completed

healthstack-problems-service
  ├── produces: problems.condition-added, problems.condition-resolved, problems.allergy-added
  └── consumes: notes.signed (NLP extraction)

healthstack-devices-service
  ├── produces: devices.registered, devices.metric-received (NATS), devices.alert
  └── consumes: orders.placed (DeviceRequest)

healthstack-ems-service
  ├── produces: ems.dispatch-requested, ems.unit-on-scene, ems.arrival-notification
  └── consumes: fleet.unit.location-updated, fleet.unit.available

healthstack-claims-service
  ├── produces: claims.submitted, claims.adjudicated, claims.prior-auth-approved/denied
  └── consumes: orders.placed, lab.report-finalized, encounter.closed

healthstack-interop-service
  ├── produces: interop.adt-received, interop.oru-received, interop.document-imported
  └── consumes: notes.signed (C-CDA export trigger)

healthstack-terminology-service
  ├── produces: terminology.valueset-updated
  └── consumes: (pull-only)

healthstack-quality-service
  ├── produces: quality.care-gap-identified, quality.measure-report-generated
  └── consumes: lab.result-received, meds.administered, careplans.goal-achieved

healthstack-education-service
  ├── produces: education.assigned, education.completed, education.cme-credited
  └── consumes: problems.condition-added, careplans.instantiated

healthstack-workflow-service
  ├── produces: workflow.pathway-started/completed, workflow.break-glass-approved/denied
  └── consumes: careplan.instantiated, encounter events, lab.critical-value, claims.prior-auth-denied

healthstack-automation-service
  ├── produces: automation.reminder-sent, automation.alert-escalated
  └── consumes: appointment.reminder-due, lab.report-finalized, quality.care-gap-identified, devices.alert
```

---

## 5. Tenant Isolation Model

| Layer | SaaS (cloud) | Enterprise on-prem | Air-gap |
|---|---|---|---|
| PG schema | Schema-per-tenant | Dedicated DB per tenant | Dedicated DB |
| HAPI FHIR | Per-tenant FHIR Partition | Dedicated HAPI instance | Dedicated HAPI instance |
| Snowstorm | Per-tenant branch (national edition) | Dedicated Snowstorm instance | Bundled RF2 snapshot |
| Kafka | Partition key = tenantId | Dedicated topic namespace | N/A (NATS JetStream) |
| SNOMED CT license | Jurisdiction tracked per tenant | Per-installation license | Per-installation license |
| APISIX | Upstream selector per tenant tier | Single tenant, no selector | Single tenant |
| PHI encryption | Tink per-tenant key in OpenBao | Tink per-tenant key | Tink per-tenant key, air-gap KMS |

---

## 6. CI Guards

| Guard | What it catches |
|---|---|
| `dependency-direction` lint | Any HealthStack service importing neutral service internals (reverse coupling) |
| `phi-boundary` lint | Any neutral service schema containing ePHI-tagged fields |
| `fhir-conformance` test | HAPI CapabilityStatement validation per service profile on every PR |
| `smart-scope` coverage test | Every FHIR endpoint must declare SMART scope; missing scope = CI fail |
| `audit-interceptor` presence | Every NestJS controller touching FHIR must carry `@HealthstackAudit()` decorator |
| `consent-check` presence | Every PHI-returning endpoint must call `consent.decision` before responding |
| `latency-sla` integration test | P95 < 250ms on canonical clinical path (patient lookup + active meds + active problems) |
| `break-glass-expiry` test | Break-glass tokens auto-expire in ≤ 4h |

---

## 7. Definition of Done (cluster level)

A service in this cluster is done when:

1. FHIR `CapabilityStatement` registered in HAPI with correct supported profiles.
2. `@HealthstackAudit()` interceptor on every controller method returning PHI.
3. `ConsentDecision` check before every PHI-returning endpoint.
4. SMART scopes declared in TypeSpec spec and enforced by APISIX route config.
5. AsyncAPI 3 schema published to Apicurio for every produced event.
6. Schema-per-tenant PG migration with ePHI column tags and Atlas migration applied.
7. K8s LimitRange + Capsule quota applied to `healthstack-clinical` namespace.
8. SNOMED CT jurisdiction validation present if service calls terminology-service.
9. Unit tests (Vitest) + FHIR integration tests (recorded HAPI payloads) green.
10. Latency SLA test (P95 ≤ 250ms on canonical path) green.
11. CI guards §6 all green.
12. Codegen recipe published to ADR-0123 cookbook.
13. Submodule pointer updated in `curaos/` parent repo.
