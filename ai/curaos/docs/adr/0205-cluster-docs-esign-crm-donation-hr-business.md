# ADR-0205 - Cluster: Documents + E-sign + CRM + Donation + HR + Business Management

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite - Relationship & Business Management
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Storage & Data Tier](0101-data-layer.md)
- [ADR-0102 Messaging & Events](0102-event-messaging.md)
- [ADR-0104 Audit](0104-identity-auth.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0114 AI / LLM Gateway](0114-ai-agent-integration.md)
- [ADR-0120 Auth, RBAC & ABAC](0120-foundation-auth.md)
- [ADR-0121b Builder Apps](0121b-foundation-apps.md)
- [ADR-0121e Forms & Signatures](0121e-foundation-forms.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)

---

## 1. Context

### 1.1 Cluster purpose

This cluster delivers the relationship and business management surface of CuraOS: structured documents, legally binding e-signatures, CRM pipelines, donation management, HR personnel records, project management, case/ticket tracking, and personal note-taking. Thirteen services span document infrastructure through high-level business applications.

These services share three structural properties:

1. **Document-centric.** Every service either stores documents (document-core), signs them (esign), annotates them (personal-notes), routes them via workflow (business-docs, business-esign), or references them by ID from business records (crm, hr, donation).
2. **Workflow-dependent.** Multi-step flows (multi-signer approval, deal pipeline, HR review, project kanban) delegate orchestration to ADR-0122 Workflow Manager (Temporal). No service reimplements its own saga engine.
3. **Party-identity anchored.** Every entity - contact, employee, donor, counterparty - resolves to a Party record (ADR-0200) with a stable UUID. No service duplicates person/org resolution logic.

### 1.2 OSS license evaluation (decision rationale)

Every OSS product evaluated was assessed against CuraOS's self-hosted SaaS deployment model (ADR §4). AGPL and GPL are not safe for SaaS without purchasing a commercial license. The table below records the outcome:

| Product | License | Decision |
|---|---|---|
| EspoCRM | GPLv3 | Reject - GPL triggers for SaaS distribution |
| SuiteCRM | AGPL | Reject - AGPL triggers on network access |
| Twenty CRM | AGPL | Reject - AGPL; flag for future legal review if they change |
| Vtiger CE | Vtiger Public License (custom) | Reject - non-OSI restrictive |
| Mautic | GPLv3 | Reject - GPL |
| OpenSign | AGPL | Reject - AGPL |
| Documenso | AGPL | Reject - AGPL |
| DocSeal | AGPL | Reject - AGPL |
| PaperMerge | Apache 2.0 | Safe - not imported; used as reference architecture only |
| OnlyOffice | AGPL | Reject for SaaS default; allowed as **opt-in tenant sidecar** where tenant accepts AGPL terms |
| Collabora Online | MPL-2.0 | Accept as **default document collaboration sidecar** (MPL-2.0 allows proprietary linking with modifications shared) |
| Frappe HR | GPL | Reject |
| OrangeHRM CE | GPL | Reject |
| Kimai | AGPL | Reject |
| Plane | AGPL | Reject; used as UX reference only |
| AppFlowy | AGPL | Reject |
| AFFiNE / BlockSuite | MIT (editor framework) | Accept for personal-notes-service; backend server dir has separate license - use frontend editor packages only |

**Outcome:** Build CuraOS-native NestJS modules for CRM, HR, project management, and case management. Use Collabora Online (MPL-2.0) as default document collaboration plugin. Accept BlockSuite MIT editor packages for personal-notes-service.

### 1.3 Thirteen services in scope

| Service | Tier | Purpose |
|---|---|---|
| `document-core-service` | Neutral core | Document storage primitives: versioning, metadata, lifecycle, retention |
| `business-docs-service` | Business overlay | B2B document workflows on document-core |
| `esign-core-service` | Neutral core | Detached signature/hash binding, byte-free verification, revocation, audit |
| `business-esign-service` | Business overlay | HIPAA-grade multi-signer workflows, counterparty management, compliance, business document-byte embedding |
| `personal-esign-service` | Personal overlay | Lightweight individual signing UX, owner-scoped document-byte embedding |
| `crm-service` | Business overlay | Lead / contact / opportunity / pipeline management |
| `donation-core-service` | Neutral core | Donation primitives shared across tiers |
| `business-donation-service` | Business overlay | Donor mgmt, recurring donations, grant tracking, tax receipts |
| `personal-donation-service` | Personal overlay | Individual donation tracking, tax record |
| `hr-service` | Business overlay | Employee directory, roster, compensation, leave, performance |
| `business-cases-service` | Business overlay | Case management / service desk / ticket tracking |
| `business-projects-service` | Business overlay | Project management: Kanban + Gantt + dependencies |
| `personal-notes-service` | Personal overlay | Block-based personal note-taking |

---

## 2. Decision summary

| Decision | Pick | Applies to |
|---|---|---|
| **Runtime** | NestJS (TS) per ADR-0100 | All 13 |
| **Primary DB** | PG17 schema-per-tenant + Valkey per ADR-0101 | All 13 |
| **Blob / document storage** | SeaweedFS per ADR-0101 (S3-compatible; object versioning + object lock enabled) | document-core, esign-core, business-docs, business-esign |
| **Messaging** | Kafka/NATS + outbox per ADR-0102 | All 13 |
| **Auth + RBAC** | Better Auth + Cerbos ABAC per ADR-0120 | All 13 |
| **Audit** | Hash-chain PG per ADR-0104; esign adds cryptographic signature receipt | All 13; esign-core extends |
| **Workflow orchestration** | Temporal TS SDK via ADR-0122 Workflow Manager | business-esign, business-docs, hr, crm, business-cases, business-projects |
| **API spec** | TypeSpec → REST + tRPC + gRPC per ADR-0123 | All 13 |
| **Codegen scaffolds** | ADR-0123 recipes per cluster | All 13 |
| **Observability** | OTel traces + Grafana per ADR-0107 | All 13 |
| **Document collaboration** | Collabora Online MPL-2.0 sidecar (default); OnlyOffice AGPL opt-in for willing tenants | document-core plugin surface |
| **E-sign stack** | signature_pad (MIT, canvas capture) + @signpdf/signpdf (MIT, PDF embedding) + xadesjs (MIT, XAdES-BES) + pdf-lib (MIT, PDF manipulation) | esign-core |
| **CRM implementation** | CuraOS-native NestJS module; no AGPL/GPL import | crm-service |
| **HR implementation** | CuraOS-native NestJS module extending party-service + identity-service | hr-service |
| **Project mgmt implementation** | CuraOS-native NestJS module | business-projects-service |
| **Personal notes editor** | BlockSuite MIT editor packages (PageEditor + EdgelessEditor) | personal-notes-service |
| **Local + 3rd-party** | Local: Collabora Online CE; 3rd-party: DocuSign / Adobe Sign as Activepieces-connected fallback for esign | per ADR-0150 §2 |
| **Modulith topology** | Same NestJS codebase; runtime flag picks modulith vs microservice per ADR-0099 §5 | All 13 |

---

## 3. Per-service specification

### 3.1 `document-core-service`

**Role:** Neutral document infrastructure. All other services reference documents by stable UUID. No service stores raw file bytes except via this service.

**Responsibilities:**
- Accept document uploads via multipart POST; stream bytes to SeaweedFS. Return stable `document_id` (UUID v7).
- Maintain PG metadata: `document_id`, `tenant_id`, `owner_party_id`, `name`, `mime_type`, `size_bytes`, `storage_key`, `version`, `parent_version_id`, `status` (draft | active | archived | deleted), `retention_until`, `classification` (public | internal | confidential | restricted), `created_at`, `updated_at`.
- Version branching: `POST /documents/:id/versions` creates new version chained to parent. SeaweedFS object versioning preserves all byte snapshots.
- Lifecycle: retention policies enforced by scheduled job (BullMQ + `@nestjs/schedule`): mark expired documents for deletion, emit `document.retention.expired`; SeaweedFS object lock prevents premature deletion on WORM-locked documents.
- Collaboration plugin surface: mount Collabora Online (MPL-2.0) sidecar at `/docs/edit/:id` via WOPI protocol. OnlyOffice sidecar available as tenant opt-in flag (`feature_flags.document_collab = 'onlyoffice'`). CuraOS never modifies Collabora/OnlyOffice source; integration is WOPI-protocol only.
- Search: document metadata indexed in Meilisearch (per ADR-0201 neutral search) on create/update events.

**Key libraries:**
- `@aws-sdk/client-s3` (SeaweedFS S3-compatible endpoint)
- `multer` + `@fastify/multipart` (upload handling)
- `bullmq` (retention lifecycle jobs)
- `@nestjs/schedule` (cron triggers)
- `mime-types` (MIT)

**Events emitted:** `document.created`, `document.version.created`, `document.status.changed`, `document.retention.expired`, `document.deleted`

**Events consumed:** none (downstream services react to document events; document-core does not depend on them)

**API surface:**
- `POST /documents` - upload + register
- `GET /documents/:id` - metadata
- `GET /documents/:id/download` - presigned SeaweedFS URL (short TTL)
- `POST /documents/:id/versions` - new version
- `GET /documents/:id/versions` - version history
- `PATCH /documents/:id/status` - lifecycle transitions
- `GET /docs/edit/:id` - WOPI collaboration redirect

**Codegen recipes (ADR-0123):** `document-core:upload-handler`, `document-core:retention-policy`

**Does NOT own:** signature state, workflow routing, access policies beyond classification - those belong to esign-core and Cerbos.

---

### 3.2 `business-docs-service`

**Role:** B2B document workflow overlay on document-core. Manages template libraries, approval routing, and delivery to external counterparties.

**Responsibilities:**
- Maintain a **document template library**: org-level templates (contracts, NDAs, proposals, SOWs) stored as document versions in document-core with template metadata in local PG table.
- Document workflow orchestration via Temporal (ADR-0122): draft → review → approve → countersign → distribute → archive. Each stage is a Temporal activity calling document-core status transitions.
- Counterparty delivery: generate time-limited signed URL (SeaweedFS presigned, 48h TTL) and send via notify-service; track open + download events.
- Link to business-esign-service: after approval, initiate signing envelope for the approved document version.
- Maintain document rooms (deal rooms): bundle of documents + participants with access-controlled shared view.

**Events emitted:** `business.document.template.created`, `business.document.workflow.stage-changed`, `business.document.delivered`, `business.document.room.opened`

**Events consumed:** `business.esign.envelope.completed` (mark document as signed), `crm.opportunity.stage-changed` (trigger contract generation workflow)

**Workflow templates registered into ADR-0122:**
- `contract-approval` - draft → legal review → exec sign → countersign (reuses template from ADR-0204)
- `document-expiry-renewal` - track contract expiry, trigger renewal workflow at T-90d/T-30d/T-0

**Codegen recipes:** `business-docs:template`, `business-docs:workflow-stage`

---

### 3.3 `esign-core-service`

> Resolution pin (2026-06-11, curaos-ai-workspace#674 from #373): document-byte embedding belongs to personal/business e-sign overlays. Neutral esign-core owns detached signature/hash binding and byte-free verification outputs only. See [[curaos-triplet-split-rule]].

**Role:** Neutral signature primitive library. All signing operations are routed through this service regardless of tier.

**Core signature stack:**
- `node-forge` - X.509 certificate parsing and detached PKCS#7/CMS construction
- `pkijs`, `@peculiar/x509`, `asn1js` - certificate-chain, revocation, and timestamp-token verification
- `webcrypto` (Node built-in) - hash + key operations

**Overlay byte-embedding stack:**
- `signature_pad` - canvas-based wet-signature capture; exports as SVG or PNG
- `pdf-lib` - PDF manipulation in personal/business overlays
- `@signpdf/signpdf` - PAdES/PDF byte embedding in personal/business overlays
- `xadesjs` - XAdES-BES XML byte embedding in personal/business overlays

**Signature types supported:**
| Type | Standard | Use case |
|---|---|---|
| Wet capture | SVG/PNG | Overlay-owned capture and embedding flow |
| Detached digital (PKCS#7/CMS) | CMS / RFC 5652 | Core-owned detached artifact over document hash |
| PAdES-B-B embedding | ETSI EN 319 142 | Overlay-owned PDF byte embedding around core artifact |
| XAdES-BES embedding | ETSI EN 319 132 | Overlay-owned XML byte embedding around core artifact |
| Qualified (future) | eIDAS QES via HSM | Core key-provider swap to PKCS#11; overlay still owns bytes |

**Signature record schema (PG):**
```
signature_id (UUID v7), document_id, version_id, signer_party_id,
signature_type, algorithm, certificate_fingerprint, signature_bytes_ref (SeaweedFS key),
signed_at, ip_address, device_fingerprint, geo_data, status (pending|completed|revoked),
revocation_reason, audit_chain_hash
```

**Audit:** every signature event appended to hash-chain audit log (ADR-0104). Chain covers: signer identity, document hash at signing time, certificate used, timestamp. Any subsequent document modification invalidates the chain hash - tamper-evident by construction.

**Verification endpoint:** `POST /signatures/:id/verify` compares an overlay-supplied live SHA-256 hash to the signing-time hash, validates detached PKCS#7 chain, checks certificate revocation (OCSP/CRL), and returns `{valid, reason, signer, signed_at}`. It does not fetch or persist document bytes.

**Revocation:** `POST /signatures/:id/revoke` - marks revoked in PG, emits `esign.signature.revoked`, does NOT delete bytes (retained for audit).

**Events emitted:** `esign.signature.initiated`, `esign.signature.completed`, `esign.signature.failed`, `esign.signature.revoked`, `esign.signature.verified`

**Key libraries:** core uses `node-forge` (BSD-3-Clause arm elected), `pkijs`, `@peculiar/x509`, `asn1js`, and WebCrypto for detached artifacts and byte-free verification. Personal/business overlays own `signature_pad`, `pdf-lib`, `@signpdf/signpdf`, and `xadesjs` for document-byte embedding when their triplet split is justified.

**Codegen recipes:** `esign-core:signature-type`, `esign-core:verify-handler`

---

### 3.4 `business-esign-service`

**Role:** HIPAA-grade multi-signer workflow and counterparty management for B2B contexts.

**Document-byte ownership:** business-esign-service owns envelope document-core access, retention coordination, and business byte-embedding flows. It passes references, hashes, detached artifact requests, and verification material to esign-core.

**Envelope model:**
An *envelope* is the unit of a signing ceremony: one document version + one or more signers + ordered signing sequence + expiry deadline.

```
envelope_id, document_id, version_id, created_by_party_id, tenant_id,
status (draft|sent|in_progress|completed|declined|expired|voided),
signing_order (sequential|parallel), expires_at, completed_at,
hipaa_baa_required (bool), compliance_tags[]
```

**Signer record:**
```
signer_id, envelope_id, party_id, email, signing_order_position,
status (pending|notified|viewed|signed|declined), notified_at,
viewed_at, signed_at, signature_id (FK → esign-core)
```

**Multi-signer workflow (Temporal):**
- `multi-signer-sequential` - signer N+1 notified only after signer N completes; compensation on decline (void envelope, notify all).
- `multi-signer-parallel` - all signers notified simultaneously; complete when all sign.
- `notary-witness` - sequential with notary inserted at configurable position.

**HIPAA compliance controls:**
- BAA requirement flag on envelope; if set, `business-esign-service` verifies a valid BAA exists with the counterparty org (via hr-service or crm-service party lookup) before releasing document access.
- Audit trail retained ≥ 6 years (45 CFR 164.530(j)) - enforced by document-core retention policy `retention_until = signed_at + 6 years`.
- Signer authentication: require authenticated CuraOS session (Better Auth, ADR-0120) for internal signers; external signers receive OTP-validated magic link.
- No PHI in envelope metadata fields; document bytes in SeaweedFS with restricted classification label.

**Events emitted:** `business.esign.envelope.created`, `business.esign.envelope.sent`, `business.esign.signer.viewed`, `business.esign.signer.signed`, `business.esign.signer.declined`, `business.esign.envelope.completed`, `business.esign.envelope.voided`

**Events consumed:** `business.document.workflow.stage-changed` (trigger envelope after approval), `crm.contract.approved` (initiate signing), `hr.document.onboarding-ready` (trigger employee doc signing)

**API surface:**
- `POST /envelopes` - create envelope
- `POST /envelopes/:id/send` - send to signers
- `GET /envelopes/:id/status` - polling + webhook
- `POST /envelopes/:id/void` - void with reason
- `GET /sign/:token` - external signer landing page (magic-link validated)

**Codegen recipes:** `business-esign:envelope-workflow`, `business-esign:signer-notification`

---

### 3.5 `personal-esign-service`

**Role:** Lightweight signing UX for individual users (self-signing, signing documents sent by others, requesting a single countersignature).

**Scope differential vs business-esign:**
- No HIPAA BAA enforcement (personal tier; PHI is healthstack responsibility)
- No sequential multi-party orchestration beyond one counterparty
- Simpler storage: document + signature stored via document-core; no envelope workflow

**UI:** CuraOS Builder App personal layout - "My documents to sign" queue, "Sent for signature" tracking, signature capture modal (signature_pad canvas).

**Events emitted:** `personal.esign.signature.completed`, `personal.esign.request.sent`

**Events consumed:** `business.esign.envelope.sent` where recipient is the personal-tier user (shared notification path; business sends, personal receives)

---

### 3.6 `crm-service`

**Role:** CuraOS-native lead, contact, opportunity, and pipeline management. No AGPL/GPL import.

**Core entities:**

```
Contact: contact_id, party_id (FK → party-service), tenant_id,
  lead_source, status (lead|prospect|qualified|customer|churned),
  assigned_to_party_id, tags[], custom_fields (jsonb), created_at

Opportunity: opportunity_id, tenant_id, contact_id, account_id,
  name, stage (configurable per-pipeline), value_amount, currency,
  probability, expected_close_date, assigned_to_party_id,
  pipeline_id, created_at, updated_at

Pipeline: pipeline_id, tenant_id, name, stages (jsonb array: {id, name, order, probability}),
  default_currency, active

Activity: activity_id, tenant_id, related_entity_type, related_entity_id,
  party_id, type (call|email|meeting|note|task), subject, body, occurred_at
```

**Party resolution:** contact.party_id and opportunity.account_id resolve to Party (ADR-0200). CRM does not store name/email/phone independently - it reads from party-service to avoid duplication. Custom CRM-specific fields live in `custom_fields (jsonb)`.

**Pipeline engine:**
- Configurable stages per pipeline (no hardcoded stages).
- Stage transitions emit `crm.opportunity.stage-changed`; Temporal workflow `deal-pipeline` (ADR-0204 business-workflow-service) responds to move through approval sub-flows.
- Probability scoring: manual override or AI-assisted (LiteLLM via ADR-0114, optional).

**Integrations (via Activepieces, ADR-0204 automation-core):**
- HubSpot / Salesforce sync pieces: available as optional automation flows; CRM-service is source of truth; external CRM is secondary read.
- Email threading: Activepieces email-received trigger → attach to CRM contact activity log.

**Events emitted:** `crm.contact.created`, `crm.contact.status-changed`, `crm.opportunity.created`, `crm.opportunity.stage-changed`, `crm.opportunity.won`, `crm.opportunity.lost`, `crm.activity.logged`

**Events consumed:** `party.created` (auto-create contact shell), `business.esign.envelope.completed` (link signed contract to opportunity), `business.document.delivered` (log delivery as activity)

**API surface:** REST + tRPC; `GET /contacts`, `POST /contacts`, `GET /opportunities`, `POST /opportunities`, `PATCH /opportunities/:id/stage`, `GET /pipelines`, `POST /activities`

**Codegen recipes:** `crm:entity`, `crm:pipeline-stage`, `crm:activity-type`

---

### 3.7 `donation-core-service`

**Role:** Neutral donation primitives shared between business-donation-service and personal-donation-service.

**Core entities:**
```
Donation: donation_id, tenant_id, donor_party_id, campaign_id (nullable),
  amount, currency, payment_ref (FK → commerce-payment-service, ADR-0202),
  type (one_time|recurring), status (pending|completed|refunded|failed),
  tax_deductible (bool), receipt_issued_at, donated_at

Campaign: campaign_id, tenant_id, name, goal_amount, currency,
  start_date, end_date, status (draft|active|completed|archived)

RecurringSchedule: schedule_id, donation_id, frequency (monthly|quarterly|annual),
  next_due_at, active
```

**Responsibilities:**
- Process donation record creation and status transitions.
- Emit events for downstream receipt generation and tax record creation.
- Integrate with commerce-payment-service (ADR-0202) for payment processing; donation-core never handles raw payment credentials.

**Events emitted:** `donation.created`, `donation.completed`, `donation.recurring.due`, `donation.refunded`

---

### 3.8 `business-donation-service`

**Role:** Nonprofit donor management, recurring donation administration, grant tracking, and tax receipt generation.

**Additional entities beyond core:**
```
Donor: donor_id, party_id, tenant_id, segment (individual|foundation|corporate),
  total_donated, first_donation_at, last_donation_at, lifetime_value,
  communication_preferences, custom_fields (jsonb)

Grant: grant_id, tenant_id, funder_party_id, name, amount, currency,
  start_date, end_date, reporting_due_dates (jsonb), status, notes

TaxReceipt: receipt_id, donation_id, donor_id, receipt_number,
  issued_at, document_id (FK → document-core), void_reason
```

**Tax receipt generation:**
- On `donation.completed` event: compute receipt content, render PDF via pdf-lib, store via document-core, issue signed receipt to donor via notify-service.
- Receipt numbering: tenant-scoped sequential with configurable format.

**Grant tracking:** milestone-based Temporal workflow `grant-reporting` (registered into ADR-0122); activity tasks remind grant manager of upcoming reporting deadlines.

**Events emitted:** `business.donation.donor.created`, `business.donation.receipt.issued`, `business.donation.grant.milestone-due`

**Events consumed:** `donation.completed` (from donation-core), `donation.recurring.due` (trigger payment retry + receipt)

---

### 3.9 `personal-donation-service`

**Role:** Individual donation tracking and personal tax record maintenance.

**Scope:** Personal ledger of donations made. No campaign management, no grant tracking.

**Entities:** thin overlay on donation-core + local `PersonalDonationRecord` (donation_id, user_id, category (charity|religious|political), deductibility_jurisdiction, tax_year).

**Tax year summary:** `GET /donations/summary?tax_year=2025` - aggregated by organization and deductibility category; exportable as CSV for tax filing.

**Events consumed:** `donation.completed` (record to personal ledger)

---

### 3.10 `hr-service`

**Role:** Employee directory, roster, compensation, leave, performance, and time tracking. Extends identity + party + org; does NOT duplicate person/org records.

**Architecture principle:** `hr-service` owns HR-specific attributes. Person data (name, email, photo) lives in party-service (ADR-0200). Org structure (department, reporting line) lives in org-service (ADR-0200). `hr-service` holds the HR overlay linking them.

**Core entities:**
```
Employee: employee_id, party_id (FK → party-service), tenant_id,
  org_unit_id (FK → org-service), employment_type (full_time|part_time|contractor|intern),
  employment_status (active|on_leave|terminated), start_date, end_date,
  job_title, job_code, manager_party_id, work_location_id

Compensation: compensation_id, employee_id, effective_date, base_salary,
  currency, pay_frequency (monthly|biweekly|weekly), allowances (jsonb),
  equity_units, benefits_plan_id

Leave: leave_id, employee_id, type (annual|sick|parental|unpaid),
  start_date, end_date, status (pending|approved|rejected|cancelled),
  approved_by_party_id, balance_before, balance_after

PerformanceReview: review_id, employee_id, review_period, reviewer_party_id,
  status (draft|submitted|acknowledged), rating, goals_met (jsonb),
  document_id (FK → document-core)

TimeEntry: entry_id, employee_id, date, hours, project_id (nullable → business-projects), notes
```

**No AGPL import:** Frappe HR, OrangeHRM, and Kimai are all GPL/AGPL. `hr-service` is built CuraOS-native on NestJS + PG17. Time tracking re-uses BullMQ scheduler; no Kimai dependency.

**Leave workflow:** Temporal `leave-approval` workflow registered into ADR-0122: submit → manager review → HR confirm → calendar block (emits `calendar.event.created` to calendar-core-service, ADR-0203).

**Payroll export:** `hr-service` generates structured payroll export (JSON/CSV); actual payroll processing is out of scope (external system integration via Activepieces payroll piece).

**Events emitted:** `hr.employee.created`, `hr.employee.status-changed`, `hr.leave.requested`, `hr.leave.approved`, `hr.leave.rejected`, `hr.performance.review.completed`, `hr.time.entry.submitted`

**Events consumed:** `identity.user.created` (create employee shell for internal users), `org.unit.restructured` (update employee org_unit_id), `business.esign.envelope.completed` where tag = `hr.onboarding` (mark onboarding docs signed)

**Codegen recipes:** `hr:entity`, `hr:leave-policy`, `hr:review-cycle`

---

### 3.11 `business-cases-service`

**Role:** Case management / service desk / ticket tracking. Zendesk/Intercom-class internal tool.

**Core entities:**
```
Case: case_id, tenant_id, reporter_party_id, assigned_to_party_id, queue_id,
  type (support|complaint|feature|inquiry|internal), status (open|in_progress|pending|resolved|closed),
  priority (low|medium|high|critical), subject, description, tags[],
  sla_due_at, resolved_at, created_at

CaseComment: comment_id, case_id, author_party_id, body, is_internal (bool), created_at

CaseAttachment: attachment_id, case_id, document_id (FK → document-core)

Queue: queue_id, tenant_id, name, default_sla_hours, assignment_policy (round_robin|manual|skill_based)
```

**SLA enforcement:** Temporal `case-sla` workflow registered into ADR-0122; timer fires at `sla_due_at - 1h` (warning) and `sla_due_at` (breach); emits `business.case.sla.breached`; escalates via business-workflow-service `customer-escalation` template.

**Events emitted:** `business.case.created`, `business.case.assigned`, `business.case.status-changed`, `business.case.sla.breached`, `business.case.resolved`

**Events consumed:** `crm.opportunity.lost` (optionally auto-create case for churn investigation), `business.donation.complaint.received` (donor complaint → case)

**Codegen recipes:** `business-cases:queue`, `business-cases:sla-policy`

---

### 3.12 `business-projects-service`

**Role:** Project management with Kanban, Gantt, and dependency tracking. Asana/Trello-class. CuraOS-native; Plane (AGPL) used as UX reference only.

**Core entities:**
```
Project: project_id, tenant_id, name, description, owner_party_id, status,
  start_date, due_date, budget_amount, currency

ProjectMember: project_id, party_id, role (owner|member|viewer)

Task: task_id, project_id, assignee_party_id, name, description,
  status (backlog|todo|in_progress|in_review|done|cancelled),
  priority, due_date, estimated_hours, actual_hours, parent_task_id (subtasks),
  position (float, for ordered lists), created_at

TaskDependency: task_id, depends_on_task_id, type (finish_to_start|start_to_start|finish_to_finish)

Sprint: sprint_id, project_id, name, start_date, end_date, status (planning|active|completed)

TaskSprint: task_id, sprint_id
```

**Kanban view:** column layout driven by `task.status` field; drag-and-drop emits `PATCH /tasks/:id` with new status + position. No separate board entity.

**Gantt view:** computed from `start_date`, `due_date`, and `TaskDependency` graph; rendered by Builder App (ADR-0121b); no backend Gantt engine - client receives task + dependency flat lists and renders.

**Critical path:** `GET /projects/:id/critical-path` - server computes longest dependency chain; returns ordered task list with float.

**Time tracking:** `TimeEntry` in hr-service links `project_id` to project tasks; project reports aggregate hours from hr-service events.

**Events emitted:** `project.created`, `project.task.created`, `project.task.status-changed`, `project.task.dependency.added`, `project.sprint.completed`

**Events consumed:** `hr.employee.status-changed` (re-assign tasks if employee departs), `business.case.resolved` (optionally link resolution to project task)

**Codegen recipes:** `business-projects:board`, `business-projects:dependency-type`

---

### 3.13 `personal-notes-service`

**Role:** Block-based personal note-taking. Notion/Obsidian-class. BlockSuite MIT editor packages only (no AFFiNE backend).

**Editor stack:**
- `@blocksuite/editor` (MIT) - PageEditor for structured docs; EdgelessEditor for canvas/whiteboard mode
- `@blocksuite/store` (MIT) - CRDT store (Yjs-based); powers real-time collaborative editing if multiple devices
- `@blocksuite/blocks` (MIT) - block type library: paragraph, heading, list, code, image, embed, divider, callout, database (table/kanban/gallery)
- BlockSuite is framework-agnostic web components; integrated into CuraOS Builder App (ADR-0121b) via custom element import

**Note:** AFFiNE's `packages/backend/server` directory carries a non-OSS license. Only `@blocksuite/*` packages from the `packages/` frontend tree (MIT) are imported. Backend persistence is CuraOS-native.

**Persistence model:**
```
Note: note_id, owner_party_id, tenant_id, title, doc_state (binary, Yjs snapshot),
  tags[], workspace_id, parent_note_id (for hierarchy), pinned (bool),
  created_at, updated_at
```

**Yjs persistence:** `y-indexeddb` for offline-first client; periodic snapshot sync to backend via `POST /notes/:id/sync` (sends Yjs binary update); server stores snapshot in PG (`doc_state bytea`). Full-text search: on each sync, server extracts plain text from Yjs doc, indexes in Meilisearch.

**Attachments:** embedded images/files stored via document-core-service (`POST /documents`); note references `document_id`.

**Export:** `GET /notes/:id/export?format=markdown|html|pdf` - server-side BlockSuite renderer serializes Yjs doc to target format.

**Events emitted:** `personal.note.created`, `personal.note.updated`, `personal.note.deleted`, `personal.note.shared`

**Events consumed:** none at launch (standalone; future: `task.completed` linkback)

**Codegen recipes:** `personal-notes:block-type`, `personal-notes:export-format`

---

## 4. Cross-cutting concerns

### 4.1 Dependency direction

```
personal-notes-service   ──▶  document-core-service
personal-esign-service   ──▶  esign-core-service
personal-donation-service ─▶  donation-core-service
business-docs-service    ──▶  document-core-service
business-esign-service   ──▶  esign-core-service
business-donation-service ─▶  donation-core-service
crm-service              ──▶  party-service (ADR-0200), commerce (ADR-0202)
hr-service               ──▶  party-service, org-service (ADR-0200), identity (ADR-0200)
business-cases-service   ──▶  document-core-service, crm-service
business-projects-service ─▶  hr-service (time entries)
business-docs-service    ──▶  business-esign-service (initiate signing)

All 13 ──▶ ADR-0122 (Workflow Manager, via Temporal client)
All 13 ──▶ ADR-0120 (Auth + Cerbos)
All 13 ──▶ ADR-0104 (Audit hash-chain)
All 13 ──▶ ADR-0102 (Kafka/NATS)
All 13 ──▶ ADR-0101 (PG17 + SeaweedFS + Valkey)
```

Rule: vertical overlays depend on neutral cores. Neutral cores have no dependency on vertical overlays. CI guards reverse coupling.

### 4.2 PHI / PII boundary

- PHI lives in HealthStack overlays (ADR-0115). These 13 services hold only neutral person references (party_id).
- `hr-service` compensation and leave data is PII. Schema-per-tenant isolation (ADR-0101 §5) provides row-level tenant boundary. Cerbos ABAC restricts compensation fields to HR-manager role and above.
- E-sign signer authentication data (IP, device fingerprint, OTP) stored in `esign-core` signature record; classified `confidential`; 6-year retention enforced.

### 4.3 Multi-tenancy

All PG tables carry `tenant_id`. SeaweedFS object keys prefixed `{tenant_id}/`. Kafka topic names carry tenant prefix for non-shared topics. Cerbos policies enforce tenant boundary on every request. On-prem: single-tenant schema; schema-per-tenant is a SaaS-only concern.

### 4.4 Modulith vs microservice

All 13 services ship in one NestJS codebase, runtime-flagged per ADR-0099 §5:
- **Modulith mode (default, local + small on-prem):** all modules in one process; in-process calls; single PG instance; single Kafka broker.
- **Microservice mode (cloud SaaS + enterprise):** each NestJS module deployed as independent container; inter-service calls via gRPC or Kafka events.

### 4.5 Codegen scaffold coverage

ADR-0123 recipes emit for this cluster:

| Recipe | Emits |
|---|---|
| `document-core:upload-handler` | NestJS controller + SeaweedFS upload service + PG repository |
| `esign-core:signature-type` | New signature type handler + Cerbos policy |
| `business-esign:envelope-workflow` | Temporal workflow + signer notification + audit hook |
| `crm:entity` | NestJS module + PG entity + TypeSpec endpoint |
| `crm:pipeline-stage` | Stage config + event emitter |
| `hr:leave-policy` | Leave type + balance logic + Temporal approval workflow |
| `business-projects:board` | Task entity + status machine + Kanban API |
| `personal-notes:block-type` | BlockSuite custom block + persistence handler |

---

## 5. Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Import EspoCRM (GPLv3) | GPL triggers on SaaS distribution; no commercial license procured |
| Import SuiteCRM / Twenty (AGPL) | AGPL triggers on network access; legal review not complete |
| Import Documenso / OpenSign / DocSeal (AGPL) | AGPL; build CuraOS-native e-sign on MIT stack instead |
| Use OnlyOffice as default collaboration sidecar | AGPL; allowed only as opt-in for tenants who explicitly accept AGPL terms |
| Import Frappe HR / OrangeHRM / Kimai (GPL/AGPL) | GPL/AGPL; build NestJS-native HR module |
| Import Plane (AGPL) for project management | AGPL; used as UX reference only; native build |
| Import AFFiNE backend | Non-OSS backend license; import only `@blocksuite/*` MIT editor packages |
| docusign/adobe-sign as primary e-sign | Vendor lock-in; retained as ADR-0150 optional 3rd-party fallback via Activepieces integration |

---

## 6. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| OQ-1 | XAdES-BES sufficient for EU eIDAS B-level or must we target LT/LTA? Requires TSA timestamp integration | Platform security | Pre-launch |
| OQ-2 | Collabora Online CODE (community edition) connection limit (20 simultaneous docs default); upgrade path if exceeded? | Infra | Capacity planning |
| OQ-3 | BlockSuite CRDT sync strategy at scale - server-authoritative Yjs via Hocuspocus vs custom snapshot-only approach? Evaluate Hocuspocus (MIT) | Frontend platform | Before personal-notes v1 |
| OQ-4 | Twenty CRM: if they relicense away from AGPL, re-evaluate for CRM entity import (modern TS, active OSS) | Arch | Ongoing |
| OQ-5 | Tax receipt localization: jurisdiction-specific receipt templates required (US 501(c)(3), EU, AU); scope for business-donation-service v1 | Product | Before launch in regulated markets |

---

## 7. Definition of Done

A service in this cluster is **done** when:

1. NestJS module exists; TypeSpec spec generated and validated.
2. PG migrations land under `db/migrations/<service>/`; schema-per-tenant enforced.
3. Codegen recipe emits a buildable scaffold; recipe registered in ADR-0123 registry.
4. All events published and consumed are listed in this ADR; Kafka topic names registered in event catalog (ADR-0102).
5. Cerbos policy exists for every resource + action in the service; policy tested.
6. Temporal workflows registered into Workflow Manager (ADR-0122); compensation logic exercised in integration test.
7. Unit + integration + contract tests green; coverage ≥ 80% on business logic.
8. OTel spans cover every inbound request + outbound Kafka publish; dashboards smoke-tested.
9. Audit hash-chain verified end-to-end for any mutation path.
10. For esign-core: signature verification test asserts tamper detection (mutate document bytes, verify returns invalid).
11. For document-core: retention lifecycle test asserts expired documents marked and object-lock respected.
12. PHI/PII boundary audit: no PHI fields in neutral service PG tables; confirmed by schema review.
13. This ADR updated with any deviations discovered during implementation.
