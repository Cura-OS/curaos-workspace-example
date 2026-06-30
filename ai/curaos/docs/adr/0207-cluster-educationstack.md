# ADR-0207 — Cluster: EducationStack

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — EducationStack
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0102 Event & Messaging](0102-event-messaging.md)
- [ADR-0103 API Surface](0103-api-surface.md)
- [ADR-0113 Analytics & Reporting](0113-analytics-reporting.md)
- [ADR-0114 AI Agent Integration](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md) — pattern mirror
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121b Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121c Foundation Widgets](0121c-foundation-widgets.md)
- [ADR-0121e Foundation Forms](0121e-foundation-forms.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)

---

## 1. Context

### 1.1 What EducationStack Is

EducationStack is the education vertical overlay for CuraOS. It is opt-in: tenants that do not activate EducationStack receive a clean neutral-core deployment. EducationStack extends, never forks, the neutral core per workspace charter §3.

This ADR covers three services:

| Service | Tier | Purpose |
|---|---|---|
| `education-core-service` | Vertical overlay | Curriculum / course / lesson / competency primitives; content interop standards; LRS |
| `education-organization-service` | Vertical overlay | Institution registry; accreditation tracking; faculty/staff; enrollment management |
| `education-personal-service` | Vertical overlay | Learner profile; competency tracking; achievements + digital credentials |

These services sit above the neutral stack (identity, org, party, HR, calendar, forms, workflow, analytics) and depend downward only. The HealthStack-Education bridge (`healthstack-education-service`, ADR-0115) bridges patient education + clinical training scenarios; it depends on both clusters but lives in the HealthStack namespace.

### 1.2 Learner-Centric Priority (§15 mirror)

Mirroring ADR-0099 §15 (patient-centric):

1. **Learner** — primary. Every UX decision, data model, and privacy control optimizes for learner outcomes and agency.
2. **Teacher / Faculty** — secondary. Empowered through tooling, not privileged over learner data.
3. **Institution Admin** — supporting. Operational capability without learner surveillance.

This priority order resolves conflicts. When learner privacy and institutional reporting interests collide, learner privacy wins unless a law (FERPA, GDPR Article 9, national equivalents) compels disclosure.

### 1.3 OSS Landscape and License Analysis

Education OSS evaluated for reuse vs. inspire-only:

| System | License | Verdict |
|---|---|---|
| Moodle | GPLv3 | **Inspire only.** SaaS distribution triggers GPL copyleft; wrapping as sidecar propagates to CuraOS shell. Do not embed. |
| Canvas LMS | AGPL-3.0 | **Inspire only.** AGPL network-use trigger; any CuraOS service that links or wraps Canvas inherits AGPL. Do not embed. |
| Sakai | ECL-2.0 (Educational Community License) | **Inspire only.** ECL is Apache 2.0-derived but has patent retaliation clause differences; safe to read design patterns, not to bundle without legal sign-off. |
| Chamilo | GPLv3 | **Inspire only.** Same as Moodle. |
| OpenSIS | GPL-2.0 | **Inspire only.** GPL-2.0; do not bundle. |
| Gibbon | GPLv3 | **Inspire only.** |
| Open edX | Apache 2.0 (core) + AGPL (parts) | **Selective.** `edx-platform` LMS is AGPL; however isolated Apache 2.0 libraries (e.g., `openedx-events`, `ccx-keys`, `taxonomy-connector`) are safe to depend on after per-package audit. Pattern-borrow freely from Open edX's XBlock content model and learning context architecture. |
| OpenOLAT | Apache 2.0 | **Safe.** Pattern-borrow architecture freely; no embedding required — CuraOS builds native primitives. |
| Fedena | Apache 2.0 | **Safe.** Pattern-borrow SIS domain model (enrollment, timetable, batch/section). No embedding required. |
| H5P | GPL-3.0-or-later for the current Node server package | **Optional sidecar / legal-reviewed only.** Live 2026-06-04 npm check found `h5p-server` is not installable and `@lumieducation/h5p-server@10.0.4` is GPL-3.0-or-later, so it is not embedded in core v1. Interactive content remains supported through standards seams; H5P waits for legal clearance or a permissive implementation. |

**Decision:** Build CuraOS-native EducationStack on NestJS (ADR-0100). Do not wrap Moodle, Canvas, Sakai, or H5P's GPL Node server in core. Borrow domain model patterns from Open edX and Fedena. Ship xAPI, LTI 1.3, SCORM/cmi5, Open Badges, CLR, and OneRoster as the v1 standards surface. Keep H5P as optional sidecar/legal-reviewed content support until licensing is cleared or a permissive implementation is selected. Use Open edX Apache 2.0 libraries only after per-package license confirmation.

### 1.4 Interoperability Standards

| Standard | Role in CuraOS |
|---|---|
| **LTI 1.3** (1EdTech) | Native launcher: external LMS tools embedded in CuraOS courses; CuraOS acts as both Platform and Tool. OAuth 2.0 + JWKS; deep linking (Content-Item). |
| **xAPI / Tin Can API** | Learning Record Store (LRS) built into `education-core-service`; Actor→Verb→Object statements; custom verb registry per tenant; downstream to ClickHouse (ADR-0113). |
| **SCORM 2004** | Legacy content adapter in `education-core-service`; SCORM package import + runtime shim (scorm-again, MIT) served in sandboxed iframe. |
| **cmi5** | Preferred over SCORM for new content; xAPI profile; AU launch + completion lifecycle. |
| **IMS Caliper 1.2** | Optional analytics envelope; maps Caliper events to internal xAPI statements before LRS write. |
| **Open Badges 3.0** (1EdTech + W3C VC DM 2.0) | Badge issuance in `education-personal-service`; cryptographic signing (Ed25519); wallet-portable; compatible with Comprehensive Learner Record (CLR). |
| **CLR Standard** (1EdTech) | Aggregate learner record bundling multiple OB3 assertions + course transcripts; export as Verifiable Presentation. |
| **OneRoster 1.2** | Roster sync between `education-organization-service` and external SIS or parent institution. CSV + REST profiles. |
| **Ed-Fi** | Optional US K-12 district interop adapter; plug-in via integration service (ADR future). |

### 1.5 Dependency Direction

```
education-core-service
  ──▶ CuraOS Workflow Manager (ADR-0122)   [learning pathways, assessment flows]
  ──▶ CuraOS Forms (ADR-0121e)             [assessments, surveys, rubrics]
  ──▶ Analytics / ClickHouse (ADR-0113)    [xAPI LRS → ClickHouse CDC consumer]
  ──▶ party-core-service / org-core-service (ADR-0200)
  ──▶ calendar-core-service (ADR-0203)     [timetabling, deadlines]
  ──▶ storage-service (ADR-0101)           [SeaweedFS for course assets]

education-organization-service
  ──▶ education-core-service               [curriculum templates, program catalog]
  ──▶ hr-service (ADR-0205)               [faculty/staff reuse — no duplicate people model]
  ──▶ org-core-service (ADR-0200)         [institution as Org entity]
  ──▶ CuraOS Workflow Manager (ADR-0122)   [accreditation workflows, enrollment approvals]
  ──▶ CuraOS Auth (ADR-0120)             [SSO, federated student identity, SAML/OIDC]

education-personal-service
  ──▶ education-core-service               [course enrollment, competency framework]
  ──▶ education-organization-service       [institution membership, enrollment records]
  ──▶ party-core-service (ADR-0200)       [learner as Party — no duplicate identity]
  ──▶ CuraOS Auth (ADR-0120)             [federated identity, OIDC learner token]
  ──▶ Analytics / ClickHouse (ADR-0113)   [progress, engagement dashboards]
  ──▶ notify-service (ADR-0201)           [deadline alerts, badge issuance notifications]

healthstack-education-service (ADR-0115)
  ──▶ education-core-service              [clinical training courses, CME credits]
  ──▶ healthstack-* services              [patient education content, care plan linkage]
```

Rule: vertical → neutral. Never reverse. CI must guard with import-boundary lint.

---

## 2. Decision Summary

| Decision | Pick | Applies to |
|---|---|---|
| **Runtime** | NestJS (TS) per ADR-0100 | All 3 services |
| **Database** | PG17 schema-per-tenant + Valkey per ADR-0101 | All 3 |
| **Messaging** | Kafka/NATS + outbox per ADR-0102 | All 3 |
| **Workflow** | Temporal TS SDK via Workflow Manager (ADR-0122) | All 3 |
| **Auth + RBAC** | Better Auth + Cerbos ABAC per ADR-0120 | All 3 |
| **Audit** | Hash-chain PG per ADR-0104 | All 3 |
| **Observability** | OTel + Grafana per ADR-0107 | All 3 |
| **Interactive content** | xAPI-native, cmi5, SCORM, and LTI tool embedding in core; H5P only as optional legal-reviewed sidecar (`@lumieducation/h5p-server` is GPL-3.0-or-later as of 2026-06-04) | education-core-service |
| **SCORM runtime** | scorm-again (MIT) — sandboxed iframe shim | education-core-service |
| **LRS storage** | Custom NestJS LRS backed by PG17 (statements table) + ClickHouse (analytics) | education-core-service |
| **xAPI conformance** | xAPI 2.0 spec; tenant-scoped verb registry in PG | education-core-service |
| **LTI 1.3** | `ltijs` (Apache 2.0) NestJS-wrapped; Platform + Tool roles | education-core-service |
| **Open Badges 3.0** | `@digitalcredentials/vc` (BSD-3-Clause) + `@noble/ed25519` (MIT) for signing | education-personal-service |
| **CLR export** | Custom VC bundler unless a live audited CLR package is found (`@1edtech/clr` was not installable in the 2026-06-04 npm check) | education-personal-service |
| **OneRoster sync** | Custom NestJS adapter + PG staging table; CSV + REST 1.2 | education-organization-service |
| **Accreditation workflows** | Temporal workflows registered in Workflow Manager; no bespoke engine | education-organization-service |
| **Faculty/Staff** | Reuse hr-service (ADR-0205) — no duplicate people model | education-organization-service |
| **Codegen scaffold** | ADR-0123 recipes per service | All 3 |
| **Modulith topology** | Single NestJS codebase; runtime flag picks modulith vs microservice | All 3 |
| **Multi-tenant isolation** | PG schema-per-tenant (SaaS); dedicated schema (enterprise/on-prem) | All 3 |

---

## 3. Per-Service Specification

### 3.1 `education-core-service`

**Role:** Curriculum/course/lesson/competency primitives. Content interop adapter hub. Learning Record Store. Owned by EducationStack platform team. No institution-specific or learner-specific domain logic.

#### 3.1.1 Domain Model

```
Program
  └── Course (versioned)
        └── Module
              └── Lesson
                    └── ContentBlock  ← H5P | SCORM | cmi5 | Video | Text | Link
Competency (framework-scoped)
  └── CompetencyLevel
CompetencyMap  (Course → Competency[])
Assessment  (owned by Forms ADR-0121e; referenced here by ID)
Rubric       (owned by Forms ADR-0121e; referenced here by ID)
LTITool      (registered external tools; JWKS + LTI 1.3 config)
LTILaunch    (per-learner launch record; state + deep-link result)
XAPIStatement (raw; replicated async to ClickHouse LRS analytics table)
VerbRegistry  (tenant-scoped custom verbs + canonical ADL verb refs)
ContentPackage (SCORM/cmi5 zip; stored SeaweedFS; manifest parsed to Lessons)
```

#### 3.1.2 Learning Record Store (LRS)

- Implements xAPI 2.0 REST endpoint (`/xapi/statements`, `/xapi/activities`, `/xapi/agents`, `/xapi/state`).
- **Write path:** NestJS controller validates statement → writes to PG `xapi_statements` table (per-tenant schema) → publishes `xapi.statement.stored` Kafka event → ClickHouse consumer (CDC via Debezium or direct Kafka connector per ADR-0113) materializes into `lrs_statements` ClickHouse table for analytics queries.
- **Read path:** xAPI GET queries served from PG for correctness + recency; analytical queries (aggregations, funnels, completion rates) served from ClickHouse via Cube (ADR-0113).
- **Governance:** Per-tenant verb registry enforces controlled vocabulary. Verb drift ("completed" vs. "finished") prevented at write-time by registry validation with configurable reject/warn/coerce modes.
- **Embedded vs. standalone:** LRS is embedded in `education-core-service` (not a separate deployment for Wave 1). If tenant volume exceeds ~10M statements/month, extraction to standalone LRS service is the upgrade path (same Kafka topic contract; no API change for producers).

#### 3.1.3 Interactive Content

- Core v1 supports xAPI-native content, cmi5 launch, SCORM runtime import, and LTI 1.3 external tools.
- H5P is not embedded in the core EducationStack service. The current Node implementation is `@lumieducation/h5p-server@10.0.4` under GPL-3.0-or-later; any H5P support must be a legal-reviewed optional sidecar or a future permissive implementation.
- Content artifacts are stored in SeaweedFS (ADR-0101); metadata stays in PG.
- Interaction events are normalized to xAPI statements and forwarded to the local LRS endpoint.

#### 3.1.4 LTI 1.3

- `ltijs` (Apache 2.0) NestJS-wrapped as `LtiModule`.
- CuraOS acts as **Platform** (hosts courses; external tools launch inside iframe) and **Tool** (CuraOS courses embedded in external LMS via LTI deep link).
- JWKS endpoint published at `/.well-known/lti-keys`; key rotation via Valkey-cached key pairs (30-day rotation; 2 keys active simultaneously).
- Deep linking (Content-Item message) creates `LTILaunch` record; grade passback via Assignment and Grade Services (AGS) writes completion to LRS as xAPI statement.

#### 3.1.5 SCORM / cmi5

- **SCORM 2004:** `scorm-again` (MIT) served as JS runtime in sandboxed iframe; package manifest parsed by `education-core-service` on import; SCORM data model interactions translated to xAPI statements via xAPI Profile for SCORM.
- **cmi5:** Native AU (Assignable Unit) launch; `education-core-service` generates launch URL with `actor`, `activityId`, `registration`, `returnURL` params; AU sends xAPI statements directly to LRS endpoint.
- SCORM 1.2 legacy supported via scorm-again (same library, runtime mode flag).

#### 3.1.6 Events Emitted

| Event | Payload key fields |
|---|---|
| `education.course.published` | courseId, version, programId, tenantId |
| `education.course.archived` | courseId, archivedAt, tenantId |
| `education.lesson.completed` (from LRS) | learnerId, lessonId, courseId, xapiStatementId |
| `education.competency.mapped` | competencyId, courseId, tenantId |
| `xapi.statement.stored` | statementId, actor, verb, objectId, tenantId |
| `education.lti.launch.started` | launchId, toolId, learnerId, deploymentId |
| `education.content.package.imported` | packageId, format (scorm2004/cmi5/h5p), courseId |

#### 3.1.7 API Surface

- REST + tRPC: `GET /programs`, `POST /programs`, `GET /courses/:id`, `POST /courses`, `POST /courses/:id/publish`, `GET /competencies`, `POST /competencies`, `GET /lessons/:id`, `POST /lessons`, `GET /lti/tools`, `POST /lti/tools/register`
- xAPI REST: `/xapi/statements` (POST/GET), `/xapi/activities/state` (PUT/GET/DELETE), `/xapi/agents/profile`, `/xapi/about`
- SCORM runtime: `/scorm/runtime/:packageId` (serves scorm-again + manifest); internal only
- LTI: `/lti/login`, `/lti/launch`, `/.well-known/lti-keys`

#### 3.1.8 Codegen Recipes (ADR-0123)

- `education-core:course` — scaffold Course entity + CRUD module
- `education-core:competency` — scaffold CompetencyFramework + mapping table
- `education-core:lti-tool` — scaffold external LTI tool registration flow
- `education-core:xapi-verb` — scaffold tenant verb registry entry + statement validator

---

### 3.2 `education-organization-service`

**Role:** Institution registry; accreditation lifecycle management; enrollment management; faculty/staff (delegated to hr-service). Reuses `org-core-service` Org entity as institution anchor; adds education-specific attributes.

#### 3.2.1 Domain Model

```
Institution  (extends Org from org-core-service; adds: type, accreditationStatus[], enrollmentCapacity)
  └── Department
        └── Program  ← references education-core-service Program by ID
Campus (physical + virtual)
  └── Room / Space (scheduling resource; refs calendar-core-service)
AccreditationRecord
  ├── AccreditingBody (name, jurisdiction, recognized standards)
  ├── AccreditationCycle (submission → review → site-visit → decision → renewal)
  ├── EvidenceDocument (stored SeaweedFS; metadata PG)
  └── AccreditationDecision (granted | conditional | denied | withdrawn; expiry)
EnrollmentApplication (learner applies to program/cohort)
  └── EnrollmentRecord (accepted; links learnerId → programId → institutionId; status; dates)
Cohort (a named group of learners in a program/term)
AcademicTerm (institution-scoped; start/end dates; calendar-service ref)
FacultyAssignment  (staffId [from hr-service] → courseId → role: instructor|ta|auditor)
OneRosterSync  (sync job record; source type; last cursor; error log)
```

#### 3.2.2 Accreditation Workflow

- Accreditation cycle modeled as Temporal workflow registered in Workflow Manager (ADR-0122).
- Stages: `DRAFT_SELF_STUDY → EVIDENCE_COLLECTION → INTERNAL_REVIEW → SUBMISSION → SITE_VISIT_PREP → SITE_VISIT → DECISION_AWAIT → DECISION_RECEIVED → RENEWAL_PLANNING`.
- Each stage transition guarded by ABAC policy (Cerbos): accreditation coordinator, department head, and institution admin roles scoped.
- Evidence documents attached at any stage; versioned in SeaweedFS; manifest in PG.
- SLA timers on each stage: configurable per AccreditingBody; Workflow Manager handles breach escalation.
- CuraOS Forms (ADR-0121e) renders self-study questionnaires; submission creates Temporal signal.

#### 3.2.3 Enrollment Management

- `EnrollmentApplication` lifecycle: `DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED | REJECTED | WAITLISTED → ENROLLED → WITHDRAWN | COMPLETED`.
- Approval workflow via Temporal (registered in Workflow Manager); conditional steps for program capacity check, prerequisite check (queries education-core-service CompetencyMap), and payment gate (commerce-service hook, ADR-0202).
- Waitlist managed as sorted Valkey sorted-set (priority score = application timestamp + manual priority delta).
- OneRoster 1.2 sync: scheduled Temporal workflow pulls roster from external SIS; diffs against `EnrollmentRecord`; emits `education.enrollment.synced` event; errors quarantined in `oneroster_sync_errors` PG table for operator review.

#### 3.2.4 Faculty/Staff

- No duplicate people model. Faculty and staff are `hr-service` employees (ADR-0205) with education-specific role assignments stored in `FacultyAssignment`.
- `education-organization-service` holds only the assignment record (staffId FK + courseId + role). HR attributes (name, contract, payroll) remain in hr-service.
- Teaching load reports query both services; aggregated view materialized in ClickHouse (ADR-0113).

#### 3.2.5 Events Emitted

| Event | Payload key fields |
|---|---|
| `education.institution.registered` | institutionId, tenantId, type |
| `education.accreditation.stage.advanced` | accreditationId, fromStage, toStage, institutionId |
| `education.accreditation.decision.received` | accreditationId, decision, expiryDate, institutionId |
| `education.enrollment.submitted` | applicationId, learnerId, programId, institutionId |
| `education.enrollment.accepted` | enrollmentId, learnerId, cohortId, startDate |
| `education.enrollment.withdrawn` | enrollmentId, learnerId, reason |
| `education.roster.synced` | syncJobId, institutionId, addedCount, removedCount, errorCount |
| `education.faculty.assigned` | staffId, courseId, role, institutionId |

#### 3.2.6 API Surface

- REST + tRPC: `GET /institutions`, `POST /institutions`, `GET /institutions/:id/accreditations`, `POST /institutions/:id/accreditations`, `GET /programs/:id/enrollment`, `POST /enrollment-applications`, `PATCH /enrollment-applications/:id/status`, `GET /cohorts`, `POST /cohorts`, `GET /faculty-assignments`, `POST /faculty-assignments`
- OneRoster: `/oneroster/v1p2/orgs`, `/oneroster/v1p2/enrollments`, `/oneroster/v1p2/users` (server-side; acts as OneRoster provider for external consumers)

#### 3.2.7 Codegen Recipes (ADR-0123)

- `education-org:institution` — scaffold Institution entity + accreditation bootstrap
- `education-org:accreditation-workflow` — scaffold Temporal accreditation cycle workflow
- `education-org:enrollment-flow` — scaffold enrollment application + approval workflow
- `education-org:oneroster-sync` — scaffold OneRoster sync job + diff logic

---

### 3.3 `education-personal-service`

**Role:** Learner profile; competency progress tracking; achievements and digital credentials (Open Badges 3.0 + CLR). Learner = Party from party-core-service; this service adds education-specific profile attributes and tracks all learning progress.

#### 3.3.1 Domain Model

```
LearnerProfile  (partyId FK → party-core-service; education-specific attrs)
  ├── LanguagePreference[], accessibilityNeeds[]
  ├── LearningGoal[]
  └── PortfolioVisibility (private | institution | public)
Enrollment  (ref to education-organization-service EnrollmentRecord by ID; cached subset)
CourseProgress
  ├── lessonProgress[]: {lessonId, status, completedAt, score, attempts}
  ├── overallProgress: percent
  └── lastActivityAt
CompetencyAchievement
  ├── competencyId (ref education-core-service)
  ├── level: (novice|developing|proficient|advanced|expert)
  ├── evidencedBy: xapiStatementId[] | badgeId[]
  └── assessedAt, assessedBy (staffId | automated)
Badge  (Open Badges 3.0 OpenBadgeCredential)
  ├── achievementId (issuer-defined)
  ├── issuerId (institutionId or tenantId)
  ├── recipientIdentifier (hashed email or DID)
  ├── proof: Ed25519Signature2020
  ├── validFrom, validUntil?
  └── evidence[]: {url, narrative}
CLRRecord  (Comprehensive Learner Record)
  ├── assertions: Badge[]
  ├── courseTranscripts: CourseProgress[]
  └── verifiablePresentation: W3C VP JSON-LD
CredentialWallet  (learner-controlled; stores CLR + individual badges)
  └── ShareLink  (expiring signed URL → public verifier endpoint)
```

#### 3.3.2 Open Badges 3.0

- **Issuing:** `education-personal-service` issues OB3 `OpenBadgeCredential` JSON-LD on achievement trigger (competency mastered, course completed, assessment passed).
- **Signing:** `@noble/ed25519` (MIT) signs credential. Issuer DID (`did:web:<tenant-domain>`) resolved via `/.well-known/did.json` served by this service.
- **Storage:** Badge JSON + proof stored in PG; SeaweedFS for baked PNG (OB3 allows embedding in image `iTXt` chunk, optional).
- **Wallet portability:** Learner can export individual badge or full CLR as JSON-LD VC. `ShareLink` generates a signed expiring URL; verifier fetches credential + resolves issuer DID for proof check.
- **Revocation:** StatusList2021 (W3C) revocation list published at `/.well-known/status/<listId>`. Revoked badges marked in list; verifiers check on demand.

#### 3.3.3 Comprehensive Learner Record (CLR)

- CLR bundles: multiple OB3 assertions + course transcripts + competency achievements into a W3C Verifiable Presentation.
- Export formats: JSON-LD VP (primary), PDF transcript (Gotenberg per ADR-0113), QR-linked verifier URL.
- Cross-institution portability: CLR is learner-owned; institution cannot revoke learner's copy (only mark individual badge revoked in issuer StatusList).

#### 3.3.4 Progress Tracking + Analytics

- `CourseProgress` updated on `education.lesson.completed` Kafka event (published by education-core-service LRS consumer).
- Competency advancement triggered by: assessment score threshold (Forms ADR-0121e result event) OR explicit instructor assessment via `CompetencyAchievement` API.
- Personal dashboards built on CuraOS Builder Apps (ADR-0121b) + Cube API (ADR-0113) serving ClickHouse-materialized learning analytics: completion funnel, time-on-task, competency radar, engagement heatmap.
- Superset (ADR-0113) provides institution-level cohort analytics (opted-in, learner-aggregated only — no individual surveillance without consent).

#### 3.3.5 Privacy Controls (FERPA / GDPR)

- Learner controls `PortfolioVisibility` per credential and per profile section.
- Institution analytics queries enforce aggregation floor (minimum 5 learners) to prevent re-identification.
- GDPR right-to-erasure: `DELETE /learner-profiles/:id/gdpr-erase` triggers Temporal workflow — nullifies PG PII fields, removes SeaweedFS files, tombstones xAPI statements (per xAPI 2.0 void statement spec), emits `education.learner.erased` event consumed by downstream caches.
- FERPA: education records access log written to hash-chain audit (ADR-0104) on every read of `CourseProgress` or `CLRRecord` by non-learner principal.

#### 3.3.6 Events Emitted

| Event | Payload key fields |
|---|---|
| `education.learner.enrolled` | learnerId, enrollmentId, courseId, tenantId |
| `education.lesson.progress.updated` | learnerId, lessonId, courseId, progressPct |
| `education.course.completed` | learnerId, courseId, completedAt, score |
| `education.competency.achieved` | learnerId, competencyId, level, evidencedBy[] |
| `education.badge.issued` | badgeId, learnerId, achievementId, issuerId |
| `education.badge.revoked` | badgeId, learnerId, revokedAt, reason |
| `education.clr.exported` | learnerId, clrId, exportFormat, sharedWith |
| `education.learner.erased` | learnerId (pseudonymized), erasedAt, tenantId |

#### 3.3.7 API Surface

- REST + tRPC: `GET /learner-profiles/:id`, `PATCH /learner-profiles/:id`, `GET /learner-profiles/:id/progress`, `GET /learner-profiles/:id/competencies`, `GET /learner-profiles/:id/badges`, `POST /learner-profiles/:id/badges/export`, `GET /learner-profiles/:id/clr`, `POST /learner-profiles/:id/clr/export`, `GET /verify/badges/:badgeId` (public verifier), `DELETE /learner-profiles/:id/gdpr-erase`

#### 3.3.8 Codegen Recipes (ADR-0123)

- `education-personal:learner-profile` — scaffold LearnerProfile entity + privacy controls
- `education-personal:badge-issuer` — scaffold OB3 issuance + Ed25519 signing + DID doc
- `education-personal:clr-export` — scaffold CLR bundler + VP serializer
- `education-personal:gdpr-erase-workflow` — scaffold Temporal GDPR erasure workflow

---

## 4. Cross-Cutting Concerns

### 4.1 Multi-Tenant Isolation

- SaaS: PG schema per tenant for all three services. Cross-tenant queries forbidden at application layer; Cerbos policies enforce tenant claim on every resource access.
- Enterprise / on-prem: dedicated PG schema or dedicated DB; same codebase, env flag selects isolation mode.
- ClickHouse analytics: tenant column on every row; row-level security via ClickHouse user policies (ADR-0113).

### 4.2 Auth and Federated Identity

- Learner SSO via Better Auth (ADR-0120) + SAML 2.0 / OIDC federation (institution IdP, e.g., Azure AD, Google Workspace, Shibboleth).
- LTI 1.3 identity: `sub` claim from LTI launch mapped to CuraOS learnerId on first launch; subsequent launches resolve by claim.
- `education-organization-service` acts as SAML SP for inbound institutional IdP federation.

### 4.3 Observability

- OTel traces span across all three services on every learner action (enrollment → lesson open → xAPI statement → badge award).
- Per-service Grafana dashboards: LRS statement ingestion rate, course completion rate, accreditation workflow stage distribution, credential issuance rate.
- SLO targets: P95 < 300ms on learner-facing reads; LRS write P99 < 500ms; badge issuance end-to-end < 2s.

### 4.4 AI Integration (ADR-0114)

- `education-core-service` exposes `/ai/recommend` (learning path recommendation) and `/ai/assess` (formative feedback on free-text submission) as thin wrappers over ADR-0114 vLLM gateway.
- `education-personal-service` uses ADR-0114 Presidio for PII scrubbing before any learner text forwarded to AI inference.
- AI-generated content flagged with `generatedBy: ai` metadata in ContentBlock; learner-visible disclosure per EU AI Act Article 50.

### 4.5 Content Interop Adapter Priority

For new content: **H5P > cmi5 > xAPI-native**. For legacy import: SCORM 2004 → SCORM 1.2. LTI 1.3 for external tool embedding. SCORM 1.2 import-only (no new authoring).

### 4.6 HealthStack Bridge

`healthstack-education-service` (ADR-0115) consumes `education-core-service` course catalog for clinical training modules (CME credits, certification tracking). It depends on EducationStack services; EducationStack services do NOT depend on HealthStack. Dependency direction preserved.

---

## 5. Not In Scope (Wave 1)

| Capability | Rationale |
|---|---|
| Synchronous video conferencing (BigBlueButton / Jitsi integration) | ADR-0203 covers calendar + meeting primitives; specific LMS video embed deferred |
| Plagiarism detection integration | Third-party API connector; deferred to Integrations service |
| Adaptive learning engine | AI recommendation stub in ADR-0114 sufficient; full adaptive engine = Wave 2 |
| Ed-Fi adapter (US K-12 district) | OneRoster covers primary interop; Ed-Fi deferred pending US-district tenants |
| Proctoring / exam integrity | Regulatory and privacy complexity; deferred to dedicated ADR |
| Fee / tuition billing | Routes through commerce-service (ADR-0202); no billing logic in EducationStack |
| Mobile offline content sync | PWA/Flutter offline sync; deferred to Foundation Mobile ADR |

---

## 6. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Open edX Apache 2.0 library has AGPL transitive dependency | Medium | High | Per-package SPDX audit in CI (`license-checker`); block build on AGPL transitive |
| xAPI verb drift across tenants corrupts analytics | High | Medium | Write-time verb registry validation; controlled vocab enforced by default; UI for tenant vocab management |
| LRS statement volume exceeds PG write throughput | Medium | Medium | ClickHouse is the analytics store; PG LRS table partitioned by month + tenant; extraction to standalone LRS service documented as upgrade path |
| OB3 issuer DID key compromise | Low | High | Automated 90-day Ed25519 key rotation; old keys retained in DID doc `verificationMethod` for historical badge verification; rotation workflow in Workflow Manager |
| FERPA / GDPR conflict on cross-institution CLR sharing | Medium | High | Learner-controlled sharing only; institution cannot initiate CLR export to third party without explicit learner consent token |
| LTI 1.3 JWKS key rotation breaks active launches | Low | Medium | 2 JWKS keys active simultaneously (30-day overlap); Valkey-cached; rotation Temporal workflow handles transition |

---

## 7. Revision Triggers

Revisit this ADR when:

- 1EdTech publishes Open Badges 4.0 or CLR 2.0 normative spec
- xAPI 3.0 specification exits draft
- LTI Advantage adds new service (e.g., Names and Role Provisioning Services v3)
- Any chosen library (ltijs, h5p-server, scorm-again) reaches end-of-life or license change
- EU AI Act Article 50 implementing regulations impose new disclosure requirements on AI-generated educational content
- HealthStack-Education bridge volume justifies extracting `healthstack-education-service` into a EducationStack-native clinical training service

---

## 8. References

- [1EdTech Open Badges 3.0 Specification](https://www.imsglobal.org/spec/ob/v3p0)
- [1EdTech LTI 1.3 Core Specification](https://www.imsglobal.org/spec/lti/v1p3)
- [xAPI 2.0 Specification — ADL Initiative](https://adlnet.gov/projects/xapi/)
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
- [μEd API — Towards a Shared API for EdTech Microservices (arxiv 2603.10014)](https://arxiv.org/abs/2603.10014)
- [Open edX Events (Apache 2.0)](https://github.com/openedx/openedx-events)
- [H5P Server (MIT)](https://github.com/Lumieducation/H5P-Nodejs-library)
- [scorm-again (MIT)](https://github.com/jcputney/scorm-again)
- [ltijs (Apache 2.0)](https://github.com/Cvmcosta/ltijs)
