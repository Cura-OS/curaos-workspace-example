# CuraOS External-Source Enrichment Program: Final Executive Report (Phase 13)

> **Binding lens (dominant over feature parity):** every enrichment in this report is re-centered on the **person** (patient / customer / user). We mine the external corpora for COMPLETENESS (data models, business rules, compliance logic, revenue cycle, terminology, edge cases) so **no feature is lost**, then reshape every workflow so the person's journey is the spine and the management/compliance surface attaches to it. Same data + contract, two surfaces. **Generator-first is law:** a feature enters as a contract (`.tsp` / AsyncAPI) -> `@curaos/*-sdk` -> `emitServiceLive` scaffold -> `emitUiApp` wiring; reusable behavior folds into `tools/codegen`, never per-service hand-edits. Source: `.ai-analysis/PERSON-CENTRIC-LENS.md`.

---

## 1. Local project summary (what we have)

CuraOS is a TypeScript 5.9 / Bun / NestJS 11 + Next.js 15 + Expo 52 monorepo (Turborepo task graph + Nx generator playbooks + `@turbo/gen` Handlebars + ts-morph AST mutation), Drizzle-primary ORM (MikroORM for the Medusa commerce tier, Kysely third tier), TypeSpec 1.12 -> OpenAPI 3.1 for REST, AsyncAPI 3 over Kafka/Redpanda for events, Zod 4 validation. Data plane is PostgreSQL (CNPG, DB-per-tenant, pgBouncer).

| Asset | Count |
|---|---|
| Backend services total | 93 (45 neutral-core, 14 personal, 12 business, 18 healthstack, 3 education) |
| Backend packages | 35 |
| Generated SDKs | 12 |
| Frontend web apps / mobile / packages | 24 / 2 / 2 |
| Helm charts | 100 |
| ADRs / rules | 66 / 61 |
| Doc-graph nodes / edges | 1,512 / 9,432 |

**The crown jewel is the generator** (`curaos/tools/codegen`, `@curaos/codegen`): the single injection point. It emits the 3-layer service scaffold (core/personal/business + healthstack overlay), live `ts-morph` AppModule auto-wire, the 10-file SDK recipe, the Next.js UI app (`emitUiApp`, 313KB emitter), agent docs + `ai/curaos` mirror, Helm charts, API-gateway manifest from `DOMAIN_ROUTE_MAP`, and `gen:service-seed`. Known generator gaps: service/package playbooks are stubs; `DOMAIN_ROUTE_MAP` is hand-curated not contract-discovered; no auto-gen of `.asyncapi.yaml`; resource-pluralization DRY debt across live-emit and template-plan.

**Strong domains already present:** identity (JWT HS256+RS256, WebAuthn/FIDO2, Argon2, DPoP, break-glass), tenancy (isolation modes + quota + Unleash flags), party-core (actors diamond, outbox, audit chain), terminology (Snowstorm SNOMED/LOINC/RxNorm/ICD-10), audit-core (SHA-256 hash-chain), esign-core (eIDAS/UETA multi-party envelopes), search, settings, geospatial, workflow-core (BPMN), integrations-core (webhooks/HMAC), commerce-core (Medusa v2 embedded).

## 2. External corpus summary (what we drew from)

We cataloged **1,244 repositories across 13 orgs** (Odoo, OCA, frappe, VHAINNOVATIONS, WorldVistA, informatici, openmrs, Bahmni, SuiteCRM, espocrm, windmill-labs, activepieces, node-red). Languages skew Java (277), Python (275), JavaScript (176), HTML (103), TypeScript (86), with the MUMPS/`M` VistA tail. Of those, **41 systems were cloned (~52 GB on disk, ~168k aggregate GitHub stars)** and **39 systems were fully indexed**, yielding **609 features with file-level evidence**, **426 source data entities**, **495 source API endpoints**, **304 source UI screens**, and **153 source workflows**. Feature evidence by domain: healthcare 409, workflow-automation 78, ERP 71, CRM/insurance-broker 51.

Generated indexes: `source-feature-index.json` (609), `source-db-index.json` (426), `source-api-index.json` (495), `source-ui-index.json` (304), `source-workflow-index.json` (153), `source-license-rollup.json` (39 systems), `source-taxonomy-coverage.json`.

## 3. Systems cloned (41 of 42)

**Healthcare - VistA/WorldVistA (10):** VistA-M, VistA-VEHU-M, FHIR-on-VistA, VistA-FHIR-Server-Codex, VistA-FHIR-Data-Loader, docker-vista, Dashboard-And-Rules-Engine, popHealth, health-data-standards.
**Healthcare - VHA Innovations (10):** ASRCM, AVS, AWARE, COMS-PROTO, FamilyHistoryCPRS, Maternity-Tracker, Pre-Procedural-Checklist-Tool, RAPTOR, TheDailyPlan, ehmp-app.
**Healthcare - OpenMRS/Bahmni/OpenHospital/OpenEMR (10):** openmrs-core, openmrs-distro-referenceapplication, openmrs-module-fhir2, openmrs-module-webservices-rest, bahmni-core, openhospital-core, openhospital-api, openhospital-ui, openhospital-gui, openhospital-doc, openemr.
**ERP (4):** odoo, erpnext, frappe, dolibarr.
**CRM/insurance (3):** suitecrm, suitecrm-core, espocrm.
**Workflow automation (4):** windmill, activepieces, node-red, n8n (reference-only directory).

## 4. Systems failed / skipped + why

- **`Bahmni/openmrs-module-bahmnicore` - FAILED (the 1 of 42).** `remote: Repository not found` (repo moved/renamed upstream). Mitigated: `Bahmni/bahmni-core` cloned successfully and carries the encounter-transaction + OpenELIS atom-feed patterns we needed; no enrichment depends solely on the missing module.
- **`VistA-VEHU-M` partial transient failure** on one attempt (`curl 28 Operation too slow ... early EOF` in `clone-log3.txt`) but **succeeded on retry** (8.1 GB on disk).
- **`clone-log2.txt` is a dead run** (`command not found: timeout` x26 on this macOS host); superseded by the working `clone-log.txt` run that ended `ok=41 fail=1`.
- **1,202 cataloged repos intentionally not cloned** (`catalog-only`): out of scope for this epic's domains, or duplicates/forks/archived. We cloned the 36 primary targets plus their sibling modules.
- **Case-collision warning** on `Dashboard-And-Rules-Engine` (two `.KID` files differing only by case) on this case-insensitive filesystem - one file dropped from the working tree, harmless for pattern mining.

## 5. Best source corpora by domain (source RICHNESS, not recommendations)

These rank where the most complete feature evidence lives, so we lose no feature. They are NOT a build order.

| Domain | Richest corpora (feature count) |
|---|---|
| **Healthcare clinical/interop** | openemr (25), openhospital-core (25), openhospital-api/ui (24/24), openmrs-distro-ref (23), openmrs-core (22), ehmp-app (22), bahmni-core (20), openmrs-fhir2 (20), vista-fhir-codex (18) |
| **ERP / finance / trade** | erpnext (28), odoo (19), dolibarr (15), frappe (11) |
| **CRM / insurance-broker** | suitecrm-core (25), suitecrm (15), espocrm (13) |
| **Workflow / automation** | windmill (24), n8n-ref (17), node-red (11), activepieces (13) |
| **Revenue cycle (X12/EDI)** | openemr (X12 5010 837P/837I + ParseERA 835 + EDI270) |
| **Quality measures (eCQM/QRDA)** | pophealth + health-data-standards (Apache-2.0 Ruby, golden-file reference) |
| **CDS / rules / risk** | vista-dashboard-rules, AWARE (alert escalation), ASRCM (risk model) |
| **Maternity vertical** | maternity-tracker (18 screens, deeply person-centric) |
| **FHIR provider shapes** | fhir-on-vista + vista-fhir-codex (Apache-2.0, port-adapt safe) |

## 6. Local feature coverage

Across 163 source<->local mappings the local maturity distribution is:

| Maturity | Count |
|---|---|
| present-strong | 34 |
| **stronger-than-source (local wins)** | 14 |
| partial | 34 |
| present-weak | 21 |
| stub | 24 |
| absent | 36 |

So **48 mappings (present-strong + stronger-than-source)** are already at-or-above source. The **14 stronger-than-source** confirmed local wins: personal-crm contacts, crm-core RBAC/audit/docs, esign-core (vs SuiteCRM/Dolibarr docs and for insurance e-sign), terminology-service (vs vista codeset), audit-core (vs OpenEMR audit_master / OpenMRS Envers / Windmill audit), settings, search (FHIR semantics), geospatial, workflow-core long-running, integrations-core webhooks, calendar/scheduling, healthstack-consent.

## 7. Missing features (the gaps)

`gap-analysis.json` enumerates **66 authored gaps over 81 absent/weak mappings** (16 functional, 4 quality). The clusters:

1. **FHIR-R4 clinical resource set** - Observation/Condition/MedicationRequest+Allergy/DiagnosticReport-lab/ImagingStudy/CarePlan/Immunization services are scaffold-only with NO `src`, yet `patient-experience.read-model.ts` already renders them from seed (consumer exists, data plane faked).
2. **Revenue cycle** - real X12 837P/837I + 835 ERA auto-posting + 270/271 eligibility + CMS-1500/UB-04 + fee schedule; `healthstack-billing` repo is an in-memory `Map`; submit only flips `status='submitted'`. No `@curaos/x12-sdk` exists.
3. **Clinical Decision Support** - drug-allergy/interaction checks, contraindication, reminders, risk scoring, care-gap nudges, no-code rule authoring (the most-covered source domain, 16 features) - entirely absent.
4. **eCQM execution + QRDA I/III + C-CDA** - quality-service is scaffold-only.
5. **ERP accounting-core** - double-entry GL/CoA/Tax/bank-rec/multi-currency/fiscal-period mostly scaffold.
6. **Invoice/subscription/contract** - customer-invoice lifecycle, recurring-billing service, contract aggregate all stub/absent.
7. **CRM** - no Lead entity, no lead conversion (pipeline starts at Deal), no Case, no activity timeline, no inbound email sync, free-string stage.
8. **Insurance policy domain** - net-new (Policy + coverage-lines + terms/renewals + endorsements + beneficiaries + premium-schedule + commission-engine + broker-claim + KYC), zero local owner.
9. **UI-kit archetypes** - ui-kit (26 components) lacks Kanban, Calendar/Scheduling, Wizard, Entity360, ApprovalInbox, WorkflowCanvas, Ledger/BillingFlow, etc.; `emitUiApp` infers ONE generic CRUD screen per service.
10. **Workflow/automation primitives** - human-approval step, escalation ladder, retry/error policy, AI/LLM + MCP step, live connector registry, expression engine, dry-run mode, multi-language code step, secrets contract.
11. **AVS, maternity, FHIR server + HL7v2 ADT + C-CDA, ERP trade-supply (pricing/fulfillment/quote-order persistence), delivery/people (project/expense/fixed-asset/leave/timesheet/attendance), self-serve report builder.**

**Quality gaps (4):** in-memory stores violating the demo-data rule; AsyncAPI per-domain events hand-curated not generated; weaker-than-source depth on several real services; FHIR-R4 + US Core profile + terminology-binding alignment incomplete.

## 8. Strong external candidates

Highest-leverage, permissive-license, port-adapt-safe sources that directly close a gap:

- **fhir-on-vista + vista-fhir-codex** (Apache-2.0): FHIR-R4 provider shapes + FileMan<->FHIR utils.
- **AVS** (permissive): After-Visit Summary section/aggregation model - highest-leverage person deliverable, all building blocks (clinical-doc Composition + Gotenberg PDF + patient-experience aggregate) already exist.
- **maternity-tracker** (Apache-2.0): richest permissive, naturally person-centric care-plan vertical.
- **pophealth + health-data-standards** (Apache-2.0): eCQM engine + HQMF/QRDA as a verifiable Ruby golden-file reference.
- **ASRCM / RAPTOR / vista-dashboard-rules / AWARE** (Apache-2.0): risk-model + protocol + table-driven rules + alert-escalation engines for CDS.
- **OpenEMR X12** (GPL, port-adapt the LOGIC, no copy): the only complete 837/835/270 reference -> fresh-TS `@curaos/x12-sdk`.
- **frappe** (MIT): AutoRepeat cadence, AssignmentRule routing, Workflow state machine - copy-eligible with attribution.
- **node-red / activepieces** (Apache-2.0 / MIT): connector framework + dynamic node loader + AI-agent/MCP tool-execution patterns.

## 9. Exact source-to-local map summary

`source-to-local-map.json`: **163 mappings across 11 domains** (healthcare-clinical 32, workflow-automation 28, platform-cross 17, insurance-broker 15, crm-sales 13, erp-finance 13, erp-trade-supply 11, erp-delivery-people 11, healthcare-interop-quality 9, healthcare-revenue 8, contracts-recurring 6).

**Integration-mode distribution:** port-adapt 99, pattern-reference-only 51, api-adapter 4, run-as-background-service 3, reject 6.
**Generator-first targets:** contract-typespec 104, AsyncAPI-event 11, SDK-package 4, codegen-emitter 2, codegen-template 1, service-then-app 1, n/a 40.
**Complexity:** S 41, M 70, L 42, XL 10.

Every mapping carries the binding lens fields: `person_centric_reshape`, `person_surface`, `management_surface`, `simplification_note`, `no_loss_check`.

## 10. Reuse modes

`code-reuse-ledger.json`: **30 ledger entries**, mode distribution **A copy-verbatim 2, B vendor/import 1, E port-adapt 16, G pattern-reference-only 5, H reject 6**; **14 of 30 flagged `legal_review=true`**. The dominant mode is **E port-adapt** (re-express logic as fresh TS through the generator), because the richest corpora (OpenEMR, Odoo, ERPNext, Dolibarr, SuiteCRM, OpenMRS, OpenHospital) are copyleft - we take their completeness, not their code.

## 11. Copy/import candidates

Verbatim-copy or vendor is restricted to permissive sources with NOTICE/attribution:

- **A - VistA-FHIR-Codex / fhir-on-vista utilities** (Apache-2.0): bundle dedup, FileMan<->FHIR datetime, ICN lookup -> `@curaos/fhir-client` with NOTICE.
- **A - ehmp-app UserDefinedScreens/ScreenBuilder/workspaceManager** (MIT): UI/screen-builder patterns with attribution.
- **B - Medusa v2** (MIT): already vendored inside commerce-core (catalog/cart/checkout/order state machine + Stripe).
- **A/E - frappe** (MIT): AutoRepeat / AssignmentRule / Workflow - copy-eligible with attribution.

Everything else is port-adapt (logic only) or reference-only.

## 12. Background-service candidates (run, do not copy)

- **HDS/pophealth Ruby HQMF/QRDA engine** behind `conversion-core-service` as an import-time golden-file reference (eCQM correctness is regulatory-graded; trust the Ruby outputs before the TS port).
- **Inbound IMAP poller** for CRM email sync (`crm-core-service`) - stateful background work; PII-in-email-body needs a storage boundary.
- **QRDA Cat I/III export** via the same HDS Ruby sidecar behind clinical-doc + conversion-core + healthstack-quality.

Constraint: an import-time-only, non-hot-path Ruby sidecar is acceptable ops cost; do NOT add it to any request hot path.

## 13. Adapter candidates (api-adapter)

- **CRM Activities** (tasks/calls/meetings/notes) -> polymorphic parent over `tasks-sdk` + `calendar-sdk` (reuse, do not create a parallel Activity store).
- **CRM reporting/dashboards** -> `reports-sdk`.
- **Value-set / terminology binding for measures** -> `terminology-service` value sets + healthstack-quality binding.
- **DICOM/PACS viewer** (RAPTOR VixDao) -> `healthstack-imaging-service` + `storage-service` adapter.

## 14. UI / visual enrichment

`ui-visual-inventory.json`: **35 person-re-centered screens + 14 new ui-kit archetypes**, against 304 source screens. Today `emitUiApp` infers one generic org-shaped CRUD screen per service; the corpus demands archetypes. **14 archetypes to add to `@curaos/ui` + teach to `emitUiApp` vocabulary:** KanbanBoard, CalendarBoard/SchedulingBoard, Wizard/Stepper, RecordChart/Entity360 (tabbed detail shell), ApprovalInbox/ApprovalCard, WorkflowCanvas (node graph), FilterBar/SearchShell (faceted), Ledger/BillingFlow, ChecklistPanel, MapView/FleetTrack, TimelineFeed/ActivityStream, ReportViewer/QueryReport, ConsentCard/ConsentFlow, EmptyState.

Every screen ships **dual surface**: e.g. OpenHospital `PatientNewBill` (cashier desk) becomes "My bills: what I owe, pay now, insurance status" (person) + full invoice list/void/balance (front-office staff mirror) over one contract. The mined org-first navigation is explicitly NOT carried; person journey is the spine.

## 15. Workflow enrichment

`workflow-map.json`: **43 workflows re-centered on person journeys**, mined from 153 source workflows. CuraOS already owns the substrate (workflow-core BPMN, automation-core cron/event/AI/retry, integrations-core connectors, event-core Kafka, builder-core forms/checklists, plugin-runtime sandbox, audit-core) - the external engines (Windmill, Activepieces, Node-RED, n8n) are reference patterns to MINE, NOT to install. Every workflow lands as configuration on the native substrate; shared primitives extend the generator/SDK. Reshaped journeys include: Patient Registration (self-onboarding wizard), Appointment Booking (self-booking + my-queue-status), Encounter Documentation, Lab/Radiology/Prescription order+review (re-centered as "my results in plain language"), Critical-Result Escalation, AVS Generation, Maternity Tracking, Order-to-Cash, Procure-to-Pay, Contract/Subscription/Policy lifecycle, Insurance Claim Intake, Commission Calc, Human-Approval, Scheduled-Jobs, Webhook-Sync, AI-Summarization, Retry/Error, Break-glass.

## 16. Data-model enrichment

`data-model-crosswalk.json`: **50 local entities crosswalked** against 426 source entities, with standards directives: **all clinical entities FHIR-R4 + US Core aligned** with terminology binding (LOINC/ICD-10/SNOMED/CPT/RxNorm/CVX/UCUM/DICOM); ERP entities mine Odoo+ERPNext+Dolibarr; CRM/insurance mine SuiteCRM+EspoCRM+Frappe. **Reuse-over-parallel is enforced** (curaos-reuse-dry-rule): Referral = ServiceRequest+Task; Carrier = Organization+InsurancePlan; Activity = Task+calendar (polymorphic, not a parallel type); CarePlan.activity + Referral reference ONE tasks-core Task; expense/depreciation post to accounting-core (single GL owner, no duplicate ledger); drug-as-product reuses commerce product + inventory SKU; one documents plane for clinical+CRM+ERP; one cadence primitive (donation recurrence) for donation+subscription+contract+recurring-invoice.

## 17. Billing / contract / insurance enrichment

- **Billing/revenue cycle** (gap `x12-revenue-cycle`): new generator-first `@curaos/x12-sdk` (837P/837I, 835 ERA auto-posting, 270/271), CMS-1500/UB-04 via Gotenberg, fee-schedule/charge-master (port OpenHospital `PricesList` + OpenEMR X12 logic). Money path = integer-minor, fail-closed Zod, balance-reconciliation test vectors against fixture 835 files. **First fix the in-memory billing Map -> real Postgres** (blocks live use).
- **Contracts** (gap `erp-invoice-subscription-recurring`): contract aggregate (header+line-items+lifecycle) port-adapt Dolibarr `contrat` + SuiteCRM `AOS_Contracts`; delegate signing to esign-core (do NOT duplicate signing).
- **Insurance** (gap `insurance-policy-domain`): net-new policy-core + business-insurance + personal-insurance triad via generator - Policy+coverage-lines+terms/renewals+endorsements+beneficiaries+premium-schedule+commission-engine (highest-risk money math, multi-level split) + broker-claim (distinct from healthstack medical-claims EDI) + KYC (AML screening behind integrations adapter per local-vs-3rdparty rule).
- **Person surface for all three:** "My bills / my policy / my claim" - clear statement, pay now, payment plan, coverage in plain terms, track claim status, upload docs; management surface keeps full compliance + GL posting.

## 18. Healthcare / clinic / hospital enrichment

The largest cluster (32 clinical + 9 interop/quality + 8 revenue mappings, 409 feature evidences). FHIR-R4 clinical resource services (Observation/Condition/MedicationRequest+Allergy/DiagnosticReport/ImagingStudy/CarePlan/Immunization) authored as per-service `.tsp` contracts -> SDK -> live scaffold + drizzle migration + `gen:service-seed`, then repoint `patient-experience.read-model` at the real services. PHI lives in `healthstack.*` overlay via cross-schema FK to `core.patients`; ConsentGuard denial tested. Plus encounter/visit, vitals (LOINC/UCUM), lab+LIS, radiology+DICOM, pharmacy, care-plans+program-enrollment, admission/discharge (ADT), AVS, maternity vertical, CDS rules engine. **Person surface:** "My Health" timeline, my labs/meds in plain language, my care plan as a checklist, my AVS auto-delivered on visit close; **management surface:** clinician structured grids with full FHIR field sets (multi-component BP, reference ranges, criticality, staging, series/instance) - nothing dropped.

## 19. VistA / MUMPS / CPRS findings

VistA-M (7.0 GB) and VistA-VEHU-M (8.1 GB) are the deep MUMPS reference. The **directly usable, license-clean** value is the Apache-2.0 wrapper layer: **fhir-on-vista** (ObservationProvider/ConditionProvider), **VistA-FHIR-Server-Codex** `C0FHIR.m` (GETVIT/GETCOND/GETLAB/GETMED/GETALGY/GETIMM), VistA-FHIR-Data-Loader, docker-vista. CPRS-derived value comes through **ehmp-app** (MIT - UserDefinedScreens/ScreenBuilder/CoverSheet, copy-eligible) and the VHA Innovations clinical apps. **FamilyHistoryCPRS is license-unknown -> data-model facts only, no code, legal-review required.** The MUMPS routines themselves are mined for FHIR field shapes and billing File 43/433 semantics, ported as fresh TS - never transpiled.

## 20. Odoo / ERP findings

Odoo is **LGPL-3 (Community)** and ERPNext/Dolibarr are **GPL-3** -> **port-adapt the logic, never copy**. We mine: Odoo `account.move`/`move.line`/journal/tax/analytic/reconciliation for double-entry GL (but reject Odoo's single mutable `account.move` row anti-pattern - keep our append-only ledger separate); ERPNext `pricing_rule` (mirror priority/overlap semantics exactly), Subscription/`subscription_plan`/`process_subscription`, project/timesheet; Dolibarr `Facture`/`FactureRec` invoice + recurring. **Frappe (MIT)** is the copy-eligible standout: AutoRepeat cadence, AssignmentRule routing, Workflow state machine. **Rejected:** Odoo MRP/BOM/manufacturing (large speculative scope, no consumer). accounting-core stays the single GL owner; expense/depreciation post events to it.

## 21. OpenHospital findings

OpenHospital (GPL-3.0) cloned in full (core 12M, api 2.6M, ui 13M, gui 91M, doc 23M). **Our billing already wins** - the local invoice/ChargeLine/InvoiceStatus model with integer-minor money + fail-closed Zod (#369) matches-or-exceeds OpenHospital `Bill`/`BillItems` (which uses float prices). The genuine source value is the **`PricesList`/`PricesOthers` fee-schedule / charge-master concept** (port the data model + rules, mode E), plus admission/discharge ward flow and inventory/supplier patterns. License = reference-only / port-adapt-or-service-boundary; no copy into our build.

## 22. OpenHospital + OpenMRS interop note (richest indexed corpus)

OpenMRS (MPL-2.0, file-level copyleft, **legal-review-managed**): mine `openmrs-fhir2` ToFhir/FromFhir translator-pair convention -> re-express as a `@curaos/codegen` translator-pair emitter + `@curaos/fhir-client` base (do NOT copy MPL Java); `openmrs-core` domain models (Condition, Allergy, MedicationDispense, PatientProgram/ProgramWorkflow state machine) -> fresh FHIR-aligned `.tsp`. Bahmni (AGPL-3.0): **service-boundary or reference only**, mine encounter-transaction + OpenELIS atom-feed sync as the background-service pattern.

## 23. License risk register summary

`license-risk-register.json` + `source-license-rollup.json` (39 systems): permissive 19, GPL 8, AGPL 6, MPL 3, source-available 1, unknown 3.

| Verdict | Systems |
|---|---|
| **safe-to-vendor** (copy w/ NOTICE/attribution) | All Apache-2.0/MIT/ISC VistA + VHA innovations (vista-m, fhir-on-vista, vista-fhir-codex, docker-vista, ASRCM, RAPTOR, AVS, AWARE, preproc-checklist, maternity-tracker, ehmp-app, pophealth, health-data-standards), node-red, activepieces, frappe, Medusa v2 |
| **reference-only / port-adapt** (no copy) | openemr, openhospital-* (GPL); odoo (LGPL); erpnext, dolibarr (GPL); openmrs-* (MPL, file-notice); bahmni, suitecrm/-core, openmrs-distro-ref, espocrm, windmill (AGPL - service-boundary-or-reference) |
| **legal-review-required** | **n8n** (Sustainable Use License - source-available, fair-code, NOT OSI-approved), **FamilyHistoryCPRS** (license unknown), **vista-vehu** (license unconfirmed) |

AGPL network-copyleft (bahmni, suitecrm, espocrm, openmrs-distro-ref, windmill) cannot link into our build and triggers source-disclosure on a network service - hence reference-only. **14 of 30 reuse-ledger entries flagged for legal review.**

## 24. Security / compliance risks

- **Money paths** (X12 835 reconciliation, payment-to-invoice allocation, commission multi-level split, FX gain/loss, tax compound+repartition, accrual-plan balances): must fold all edge cases into the generator + balance-reconciliation test vectors; partial-payment rounding must reconcile exactly to GL. Period-close must lock posted periods against backdated entries at DB/service level. Invoice numbering gap-free per-tenant per-fiscal-year (legal requirement).
- **PHI boundary:** clinical data in `healthstack.*` overlay schema, neutral cores reference-only; AsyncAPI events carry NO PHI; LLM/AI steps must pass the existing Presidio PHI gate before any external model; SSN encryption reuses existing AES256GCM (never log secrets).
- **Trust boundaries:** expression engine + multi-language code step must run inside `plugin-runtime` sandbox isolation (n8n blocks `require`/`import`); do NOT hand-roll a new VM or copy AGPL parsers. MCP server exposure gated by existing RBAC + per-project token. Webhook preview/dry-run must produce no real side-effects.
- **License contamination:** zero verbatim copy of GPL/AGPL/MPL into the build; legal-review gate on n8n + FamilyHistoryCPRS + vista-vehu before any reuse.
- **Compliance correctness:** eCQM/QRDA regulatory-graded -> golden-file vs Ruby reference in CI; X12 payer-tested -> clearinghouse conformance fixtures; FHIR-R4 -> HAPI/fhir.js validation in CI.

## 25. Implementation backlog summary + immediate next steps

**Backlog shape (binding sequence from cross-cutting notes):** (1) fix data-truth in-memory stores FIRST (blocks billing/claims/sales live use); (2) build party-core REAL (upstream FK anchor); (3) clinical FHIR resource set + terminology binding; (4) revenue cycle (`@curaos/x12` + fee-schedule + coverage); (5) accounting-core GL/tax/currency; (6) ui-kit archetypes + generator dual-surface emission (unblocks every person surface); (7) workflow/automation primitives + connector registry; (8) domain verticals (insurance, maternity, CDS). 104 mappings land as `contract-typespec`, 11 as AsyncAPI events, 4+3 as SDK/emitter generator upgrades.

**Immediate next steps (this session-scope):**
1. Convert the in-memory `Map` stores (healthstack-billing first, then sales order/quote, FK stores) to real Drizzle tables + migration + `gen:service-seed` - the demo-data-rule blocker.
2. Author the 6+ FHIR-R4 clinical contracts in per-service `specs/<svc>.tsp`, regen SDKs, `emitServiceLive`, repoint `patient-experience.read-model`.
3. Land the AVS deliverable (port AVS sections onto clinical-doc Composition + Gotenberg + patient-app "my-AVS") - highest person-centric leverage, all primitives exist.
4. Add the 14 ui-kit archetypes to `@curaos/ui` and teach `emitUiApp` the dual-surface (person + management) vocabulary - then every downstream service inherits it.
5. Scaffold `@curaos/x12-sdk` generator-first (fresh TS from OpenEMR logic), with 835 reconciliation test vectors.
6. File the legal-review gate (n8n, FamilyHistoryCPRS, vista-vehu) and the 14 legal-review reuse-ledger entries before any reuse.

---

## Required printed lists

### Top-20 highest-value implementation items

| # | Item | Owner | Mode | Cx |
|---|---|---|---|---|
| 1 | FHIR-R4 clinical resource set (Observation/Condition/Med/Allergy/DiagReport/Imaging/CarePlan/Immunization) | healthstack-{problems,meds,lab,imaging,careplans,devices}-service | E | XL |
| 2 | X12 revenue cycle (837P/837I + 835 ERA auto-post) via new `@curaos/x12-sdk` | healthstack-claims/billing-service | E | XL |
| 3 | Fix in-memory stores -> real Postgres (billing first; sales order/quote; FKs) | healthstack-billing-service + sales-core | E | M |
| 4 | After-Visit Summary auto-deliver on visit close | clinical-doc + reports + patient-app | E | M |
| 5 | UI-kit 14 archetypes + `emitUiApp` dual-surface vocabulary | @curaos/ui + tools/codegen | E | L |
| 6 | accounting-core double-entry GL/CoA + new `@curaos/tax-engine` + `@curaos/currency` | accounting-core-service | E | XL |
| 7 | Clinical Decision Support rules/risk engine | healthstack-quality-service + builder-core + workflow-core | E | XL |
| 8 | FHIR R4 server + HL7v2 ADT ingestion + C-CDA (translator-pair emitter) | healthstack-interop-service + @curaos/fhir-client | E | XL |
| 9 | eCQM engine + QRDA I/III (TS port, golden-file vs HDS Ruby sidecar) | healthstack-quality + conversion-core | E+C | XL |
| 10 | Insurance policy domain triad (policy/coverage/terms/endorsement/beneficiary) | new policy-core + business/personal-insurance | E | XL |
| 11 | Commission engine + premium-schedule (multi-level split money math) | policy-core + accounting-core | E | L |
| 12 | Customer invoice lifecycle + recurring/subscription billing | sales-core + new subscription owner | E | XL |
| 13 | Contract aggregate (header+lines+lifecycle, delegate signing to esign) | new contract service | E | L |
| 14 | CRM Lead + lead conversion + managed pipeline catalog | crm-core-service | E | M |
| 15 | Workflow primitives (human-approval, escalation, retry/error, dry-run) | workflow-core + automation-core | E | L |
| 16 | Live connector registry + `@curaos/connector-sdk` + expression engine (sandboxed) | integrations/automation-core + plugin-runtime | E | L |
| 17 | Maternity/pregnancy care-plan vertical | new healthstack-maternity-service | E | L |
| 18 | Vitals/observations (LOINC/UCUM) + lab orders/results (LIS) | healthstack-devices/lab + terminology | E | L |
| 19 | Charge master / fee schedule | new owner (price lists + contracted rates) | E | M |
| 20 | Self-serve report/query builder (report-definition engine) | reports-service + builder-core | E | L |

### Top-20 safest copy/import candidates (permissive, attribution-only)

| # | Source (license) | What to copy | Target |
|---|---|---|---|
| 1 | vista-fhir-codex / fhir-on-vista (Apache-2.0) | bundle-dedup + FileMan<->FHIR datetime + ICN lookup utils | @curaos/fhir-client |
| 2 | ehmp-app (MIT) | UserDefinedScreens/ScreenBuilder/CoverSheet UI patterns | @curaos/ui + builder-studio |
| 3 | frappe (MIT) | AutoRepeat cadence | recurrence primitive |
| 4 | frappe (MIT) | AssignmentRule routing | tasks/workflow assignment |
| 5 | frappe (MIT) | Workflow / WorkflowState state machine | workflow-core authoring |
| 6 | Medusa v2 (MIT) | already vendored (catalog/cart/checkout/order + Stripe) | commerce-core (done) |
| 7 | node-red (Apache-2.0) | registry/loader dynamic-node loading pattern | automation-core |
| 8 | node-red (Apache-2.0) | Switch/Change no-code transform nodes | automation actions |
| 9 | activepieces (MIT) | createPiece connector framework | @curaos/connector-sdk |
| 10 | activepieces (MIT) | AgentToolType / MCP tool-execution | plugin-runtime AI step |
| 11 | AVS (Apache-2.0) | AVS section/aggregation model | clinical-doc AVS template |
| 12 | maternity-tracker (Apache-2.0) | EDD calc + pregnancy/baby/lactation model | maternity service |
| 13 | ASRCM (Apache-2.0) | RiskModel/ModelTerm scoring engine | CDS risk slice |
| 14 | RAPTOR (Apache-2.0) | raptor_protocol_lib + ticket state machine | imaging worklist |
| 15 | vista-dashboard-rules (Apache-2.0) | table-driven RulesEngine/FormRule | CDS rules authoring |
| 16 | AWARE (Apache-2.0) | AlertCache + escalation-ladder + KBEditor | escalation primitive |
| 17 | preproc-checklist (Apache-2.0) | USR_CHECKLIST patient-checklist model | builder-core checklist |
| 18 | pophealth + HDS (Apache-2.0) | population-criteria + measure model (golden-file) | quality reference |
| 19 | health-data-standards (Apache-2.0) | HQMF/QRDA Ruby (as sidecar reference, not copied into TS build) | conversion-core sidecar |
| 20 | docker-vista (Apache-2.0) | VistA bootstrap/config for the FHIR reference stack | dev/CI harness |

### Top-20 service-boundary candidates (AGPL/source-available/legal -> run or reference, never link)

| # | System (license) | Boundary reason |
|---|---|---|
| 1 | bahmni-core (AGPL-3.0) | network-copyleft; encounter-transaction + OpenELIS atom-feed as background-service pattern |
| 2 | openmrs-distro-referenceapplication (AGPL-3.0) | network-copyleft; reference-only |
| 3 | suitecrm (AGPL-3.0) | network-copyleft; data-model facts only |
| 4 | suitecrm-core (AGPL-3.0) | network-copyleft; policy/contract/commission entity facts only |
| 5 | espocrm (GPL/AGPL modules) | data-model facts only (Lead/Opportunity/Account/Case/InboundEmail) |
| 6 | windmill (AGPL-3.0 + EE) | network-copyleft; schedule-handler-chain + approval-loop patterns only |
| 7 | n8n (Sustainable Use License) | source-available, NOT OSI; **legal-review** before any reuse; design ideas only |
| 8 | HDS/pophealth Ruby HQMF/QRDA (Apache-2.0 but Ruby) | run as import-time sidecar behind conversion-core (golden-file), not in TS hot path |
| 9 | IMAP inbound poller (CRM email sync) | stateful background service; PII storage boundary |
| 10 | openmrs-fhir2 (MPL-2.0) | file-level copyleft; pattern -> codegen emitter, no Java copy |
| 11 | openmrs-core (MPL-2.0) | file-level copyleft; domain models re-expressed, not copied |
| 12 | openmrs-rest (MPL-2.0) | file-level copyleft; reference-only |
| 13 | openemr (GPL-3.0) | reference-only; X12 logic re-implemented fresh in @curaos/x12-sdk |
| 14 | openhospital-* (GPL-3.0) | reference-only; fee-schedule data model port-adapt only |
| 15 | odoo (LGPL-3) | reference-only; accounting/CRM/sale logic port-adapt, no copy |
| 16 | erpnext (GPL-3.0) | reference-only; pricing_rule/subscription logic port-adapt |
| 17 | dolibarr (GPL-3.0) | reference-only; invoice/contract model port-adapt |
| 18 | DICOM/PACS viewer (RAPTOR VixDao) | api-adapter behind imaging + storage service |
| 19 | AML/KYC screening | regulated 3rd-party behind integrations-core adapter (local-vs-3rdparty rule) |
| 20 | FamilyHistoryCPRS (unknown license) | **legal-review**; data-model (FAMILY HISTORY/RELATIVE 3-file) facts only |

### Top-20 license / legal review items

| # | Item | License | Action |
|---|---|---|---|
| 1 | n8n | Sustainable Use License (source-available) | legal-review BEFORE any reuse; reject as dependency |
| 2 | FamilyHistoryCPRS | unknown | legal-review; data-model facts only until confirmed |
| 3 | vista-vehu | unknown/unconfirmed | confirm license before any reuse |
| 4 | openmrs-fhir2 translator-pair port | MPL-2.0 | file-notice; do not copy Java files |
| 5 | openmrs-core domain models port | MPL-2.0 | file-notice; re-express, no copy |
| 6 | OpenEMR X12 logic port | GPL-3.0 | re-implement fresh TS; no copy into build |
| 7 | OpenHospital fee-schedule port | GPL-3.0 | port data model only; no copy |
| 8 | Odoo accounting/CRM port | LGPL-3 | port-adapt; verify no linking into our binary |
| 9 | Dolibarr invoice/contract port | GPL-3.0 | port-adapt; no copy |
| 10 | ERPNext pricing/subscription port | GPL-3.0 | port-adapt; no copy |
| 11 | Windmill scheduling/approval patterns | AGPL-3.0 | pattern reference only; no copy |
| 12 | EspoCRM entity defs | GPL/AGPL | data-model facts only |
| 13 | SuiteCRM contract/commission substructure | AGPL-3.0 | data-model facts only |
| 14 | bahmni-core patterns | AGPL-3.0 | service-boundary or reference |
| 15 | Apache-2.0 verbatim copies (VistA utils, AVS, etc.) | Apache-2.0 | preserve LICENSE + NOTICE + warranty disclaimer |
| 16 | frappe copies | MIT | attribution in NOTICE |
| 17 | ehmp-app UI copies | MIT | attribution in NOTICE |
| 18 | Medusa v2 vendored | MIT | confirm NOTICE present in commerce-core |
| 19 | activepieces EE features | MIT (+ some EE) | use MIT core only; avoid EE-licensed modules |
| 20 | windmill EE features | AGPL + EE | exclude EE entirely |

### Top-20 UI / workflow enrichment candidates

| # | Candidate | Type | Person surface / reshape |
|---|---|---|---|
| 1 | KanbanBoard archetype | UI | My tasks/deals as journey board, not org funnel |
| 2 | CalendarBoard/SchedulingBoard | UI | Patient self-booking: pick service -> open slots -> confirm |
| 3 | Wizard/Stepper | UI | Self-onboarding, save-and-resume, plain language |
| 4 | RecordChart/Entity360 | UI | "My Health" tabbed timeline, no clinician jargon |
| 5 | ApprovalInbox/ApprovalCard | UI | "My approvals": consent/sign/confirm, one-tap |
| 6 | WorkflowCanvas (node graph) | UI | Personal recipe builder (trigger->action), templates-first |
| 7 | Ledger/BillingFlow | UI | "My bills": what I owe, pay now, payment plan |
| 8 | ConsentCard/ConsentFlow | UI | "My data + consent": who can access, grant/revoke, access log |
| 9 | TimelineFeed/ActivityStream | UI | My messages/notifications inbox |
| 10 | ChecklistPanel | UI | "My orders/plan" hydration/regimen checklist |
| 11 | ReportViewer/QueryReport | UI | "My overview": health/money/giving at a glance |
| 12 | MapView/FleetTrack | UI | "Track my delivery/visit": live ETA |
| 13 | EmptyState/IllustratedPlaceholder | UI | Friendly first-run, no blank org grid |
| 14 | Appointment Booking & Check-in | Workflow | Self-book + "my visit status" queue/ETA |
| 15 | After-Visit Summary Generation | Workflow | Auto-delivered plain-language handout on visit close |
| 16 | Critical-Result Alert & Escalation | Workflow | Escalation ladder; person sees gentle in-context guidance |
| 17 | Maternity/Pregnancy Tracking | Workflow | My pregnancy journey: milestones, EDD, baby, lactation |
| 18 | Order-to-Cash + Subscription Billing | Workflow | "My orders" + transparent recurring charges |
| 19 | Policy Create/Renewal + Claim Intake | Workflow | "My policy" renew-with-one-tap + "my claim" status tracking |
| 20 | Human-Approval + Retry/Error + Dry-run | Workflow | "My automations: did it run", simple success/fail + re-run |

---

*All paths in this report are repository-relative under `/Users/dev/workspace/curaos-workspace/`. Source artifacts: `.ai-analysis/{PERSON-CENTRIC-LENS.md, local-project-inventory.json, source-to-local-map.json, gap-analysis.json, code-reuse-ledger.json, license-risk-register.json, data-model-crosswalk.json, ui-visual-inventory.json, workflow-map.json, source-catalog.json}` and `.ai-analysis/generated-analysis/source-*-index.json`; clone outcomes in `external-sources/docs-and-indexes/clone-log*.txt` (run result: ok=41 fail=1).*