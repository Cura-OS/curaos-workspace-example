# ADR-0235: Insurance / Broker Domain Modeling (new domain, generator-first)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Phase:** 12 (XSRC external-source-reuse, ADR authoring)
**Domain:** insurance-broker (NET-NEW local domain)
**Binding lens:** [`.ai-analysis/PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (dominant; person-centric + management-surface, no feature loss)

**Parent ADRs (baseline canonical):**
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data](0101-data-layer.md)
- [ADR-0102 Event Messaging](0102-event-messaging.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0200 Cluster: Identity/Party/Org/Audit](0200-cluster-identity-party-org-audit.md)
- [ADR-0202 Cluster: Commerce/Sales/Procurement/Inventory](0202-cluster-commerce-sales-procurement-inventory.md)
- [ADR-0205 Cluster: Docs/Esign/CRM/Donation/HR/Business](0205-cluster-docs-esign-crm-donation-hr-business.md)
- [ADR-0215 Version-gated planning](0215-version-gated-planning.md)

**Binding rules (precedence over this ADR):**
- [[curaos-generator-evolution-rule]] - every edge case folds back into the generator/SDK/contract owner
- [[curaos-local-vs-3rdparty-rule]] - each integratable area supports BOTH local self-service AND 3rd-party integration
- [[curaos-reuse-dry-rule]] - find canonical owner and extend, never fork
- [[curaos-version-planning-rule]] - Target Version is the top gate; oversized work is filed forward, never crammed
- [[curaos-triplet-split-rule]] - personal/business variants only on a named divergent subject owner + downstream consumer
- [[curaos-demo-sample-data-rule]] - demo data is database-backed via service-owned seeds

> Rule > ADR precedence (workspace AGENTS.md 13b): if any rule above conflicts with text here, the rule wins and this ADR is amended.

---

## 1. Status

Proposed. Insurance / broker is a confirmed NET-NEW domain in the local inventory. This ADR records how it enters the codebase (generator-first new neutral domain plus overlays, reusing existing party/sales/accounting/esign/audit owners), under what license boundary, and shaped against the person-centric lens. No code is authorized by this ADR; it gates the Phase-13 XSRC backlog epic for the domain.

---

## 2. Context

### 2.1 The domain is absent locally

- Local inventory (``.ai-analysis/local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/), 436 module-ish entries) has **no** policy / insurance / carrier / premium / endorsement / beneficiary entity. `crm-core-service` and `sales-core-service` are generic CRM/sales partials only.
- Gap analysis ([`.ai-analysis/gap-analysis.json`](../external-source-enrichment/plan/gap-analysis.json)) lists **22 absent/weak insurance-broker mappings** out of 81 workspace gaps; maturity for the domain spine (`policies`, `coverage-lines`, `policy-terms`, `endorsements`) = `absent`, with `carriers`, `premium-schedules`, `beneficiaries`, `brokers`, `broker-hierarchy`, `kyc` = `present-weak` (covered indirectly by party/accounting), and `commissions`, `claims` = `stub`.
- Source-to-local map ([`.ai-analysis/source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json), domain `insurance-broker`, 15 mappings + 5 gaps) records the policy-spine gap verbatim: "Insurance-broker is a NET-NEW domain locally. The policy is the spine all other features hang on (carrier, lines, premium, endorsements, beneficiaries, commission, claims all FK to policy). Must enter generator-first as a new domain."

### 2.2 Naming-collision hazard (must resolve before scaffolding)

`curaos/backend/packages/policy` (`@curaos/policy`) already exists as a **clean-slate** package (README: "Status: clean slate.") - reserved for authorization policy (RBAC/ABAC), NOT insurance policy. Reusing "policy" for the insurance domain would semantically collide with the authorization package. The insurance domain MUST namespace as `insurance` (service `insurance-core-service`, contract `contracts/insurance/`, SDK `@curaos/insurance-sdk`), with the policy *entity* living inside the insurance namespace. This is a concrete reason the gap doc's working name `policy-core-service` is rejected below.

### 2.3 What the external corpus proves (completeness, not UX)

Per the person-centric lens, the corpus is mined for FEATURE SET / DATA MODEL / RULES, not UX. Evidence (``.ai-analysis/generated-analysis/source-feature-index.json`` (generated-analysis/*, git-ignored under .ai-analysis/), 609 features, 39 systems; 58 entries tagged `crm-insurance-broker.*`):

- **No source ships a true insurance-policy module.** They model policy as a generic contract + line-item-group:
  - SuiteCRM `AOS_Contracts`, `AOS_Line_Item_Groups`, `AOS_Quotes` (`quote_num`, `approval_issue`, `billing_account_id`, `opportunity_id`; `AOS_Products_Quotes` join), `AOS_Invoices` (`Document`/`DocumentRevision` for attachments). Files: `external-sources/crm-insurance-broker/suitecrm/modules/AOS_Contracts/{AOS_Contracts.php,vardefs.php}`, `.../AOS_Line_Item_Groups/`, `.../AOS_Quotes/vardefs.php`, `.../AOS_Invoices/`.
  - Dolibarr `contrat`/`contratligne` (per-line date-range + active-line lifecycle), `societe` (carrier/producer as thirdparty), `Facture`/`FactureRec` (recurring invoice = premium schedule substrate). Files: `external-sources/erp-business/dolibarr/htdocs/contrat/class/{contrat.class.php,contratligne.class.php}`, `.../societe/class/societe.class.php`.
  - EspoCRM `Account`/`Contact` entityDefs + `EntityManager` runtime custom-entity pattern (used to fabricate beneficiary/household as custom entities). Files: `external-sources/crm-insurance-broker/espocrm/application/Espo/Modules/Crm/Resources/metadata/entityDefs/{Account.json,Contact.json}`, `.../Espo/Tools/EntityManager/EntityManager.php`.
  - OpenEMR insurance/eligibility (X12 270/271, 837P/837I, Coverage) is the *healthcare-revenue* claim substrate, distinct from broker-side FNOL; referenced only for the claim-status state model. Files: `external-sources/.../openemr/src/Services/{InsuranceService.php,InsuranceCompanyService.php}`, `.../Billing/Claim.php`.
- Workflow map ([`.ai-analysis/workflow-map.json`](../external-source-enrichment/crosswalks/workflow-map.json)) enumerates the broker journeys to re-center on the person: Lead Intake, Broker/Customer Onboarding (Insurance), Insurance Quote Request, Policy Create/Renewal, Policy Endorsement (Mid-term Change), Insurance Claim Intake & Follow-up, Commission Calculation & Approval.

### 2.4 License reality (corrects the map's per-row label)

The canonical license register ([`.ai-analysis/license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json)) and feature index classify **SuiteCRM as AGPL-3.0** (`license_class: agpl`, network copyleft), not "GPL-3.0" as several `source-to-local-map.json` rows say. EspoCRM = GPL-3.0 with some AGPL-3.0 modules. Dolibarr = GPL-3.0. OpenEMR = GPL-3.0. **All four: verdict `reference-only`.** The code-reuse ledger ([`.ai-analysis/code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json)) assigns SuiteCRM **mode H (reject as dependency) + G (pattern-reference-only, data-model facts)** with `legal_review: true`; EspoCRM/Dolibarr = mode G/E port-adapt with `legal_review: true`. Net: **clean-room data-model mining only; zero source code may be copied or linked.** This corrects, and takes precedence over, the looser per-mapping `license_status` strings.

---

## 3. Decision options

### Option A - Generic contract reuse (no insurance domain)

Model policy as a configuration of the planned `contract-core-service` + `sales-core` line items + `accounting-core` recurring invoices; insurance becomes data + workflow + builder config only.

- **For:** zero net-new service; maximum reuse; mirrors how every mined source actually does it.
- **Against:** insurance-specific invariants (carrier binding, coverage limit/deductible/peril, endorsement pro-rata, beneficiary 100%-sum, commission split/clawback, FNOL) have no typed home; they leak into per-tenant builder config and lose contract/event versioning. Violates "no feature loss" by pushing compliance logic into untyped config. Re-centering on the person is impossible without a real coverage model.

### Option B - New neutral `insurance-core-service` + overlays, generator-first (recommended)

One neutral `insurance-core-service` owns the policy spine and entities; `personal-insurance-service` and `business-insurance-service` overlays are emitted by the generator; carriers/producers/beneficiaries/brokers reuse `party-core-service` + `personal-crm-service` (party roles), line items reuse the `sales-core` line-item-group template, premium schedules reuse `accounting-core` recurring invoices, signing reuses `esign-core-service`, provenance reuses the existing audit hash-chain. Contract-first via `contracts/insurance/insurance.tsp`, scaffolded through `@curaos/codegen` (ADR-0123), SDK `@curaos/insurance-sdk`.

- **For:** typed home for every invariant; one record drives both person and management surfaces from the same contract+SDK; reuses all existing owners (no fork); satisfies [[curaos-triplet-split-rule]] (insurance has a named divergent subject - the policyholder - plus a named management consumer - the broker/agency); generator-first means every edge case folds back into the mold ([[curaos-generator-evolution-rule]]); supports local self-service AND carrier/3rd-party integration via providers ([[curaos-local-vs-3rdparty-rule]]).
- **Against:** largest new surface (gap rates the spine complexity `L`); needs disciplined reuse so carrier/beneficiary do not duplicate party-core; money-path validators (premium, pro-rata, commission) must be generator-side with tests.

### Option C - Vendor an OSS insurance/broker engine

Adopt an external broker/AMS as a runtime dependency.

- **For:** fastest feature breadth.
- **Against:** no SaaS-safe OSS broker engine exists in the corpus; the closest (SuiteCRM) is **AGPL-3.0 / mode H reject-as-dependency** - network copyleft would force open-sourcing the interacting service. Rejected on license grounds and on the self-hosted-first charter. Carrier rating/eligibility connectors remain valid as optional 3rd-party providers under Option B, not as the core.

---

## 4. Recommended option: B (new neutral `insurance-core-service` + overlays, generator-first)

### 4.1 Layering (person-centric lens applied)

| Surface | Module | Role |
|---|---|---|
| Neutral spine | `insurance-core-service` (NEW, generator-emitted) | Policy, CoverageLine, PolicyTerm, Endorsement, Beneficiary-link, Carrier-ref, Producer-ref, Commission, Claim entities; lifecycle state-machine; shared contract + SDK both surfaces read |
| Person surface | `personal-insurance-service` / personal-* app (NEW overlay) | "My coverage" - plain-language summary, renewal countdown, premium due + autopay, beneficiaries I control (consent-aware), guided FNOL + claim timeline, review-and-sign |
| Management surface | `business-insurance-service` / broker+agency app (NEW overlay) | Full lifecycle: carrier binding, underwriting status, renewal pipeline, commission rule engine + splits/overrides/clawback, claim worklist + adjuster + reserve, KYC/AML dashboard, book-of-business reporting, regulatory audit |

Same data + contract; two re-centered experiences. No separate person/admin schemas (lens §3 dual surface).

### 4.2 Reuse map (extend owners, do not fork) - from code-reuse-ledger + enrichment

| Insurance concern | Reused local owner | Mode |
|---|---|---|
| Carrier / producer / claimant identity | `party-core-service` (party + role; actors diamond FK) | extend (register insurance roles on the party graph) |
| Beneficiary + household | `personal-crm-service` (relationships, per-contact consent, composite-FK isolation) | extend (PII boundary inherited) |
| Coverage lines | `sales-core-service` line-item-group template | shared generator template |
| Premium schedules / installments | `accounting-core-service` recurring invoices + ledger | extend (no parallel billing engine) |
| Commission posting | `sales-core` commissions + `accounting-core` payout | extend |
| Quotes / proposals / leads | `sales-core-service` + `crm-core-service` | extend |
| Claim lifecycle (broker FNOL) | `business-cases-service` + claim-worklist pattern from `healthstack-claims-service` | pattern-reference + new insurance claim entity |
| KYC / AML | `identity-service` + `documents-core-service` + `workflow-core-service` + audit | compose (no new compliance engine) |
| E-signature | `esign-core-service` (already stronger than every source) | consume via SDK; add insurance envelope templates only |
| Endorsement provenance | `documents-core-service` versioning + existing audit hash-chain | reuse |
| Renewal / endorsement / FNOL journeys | `workflow-core-service` BPM + `tasks-core-service` reminders | configure, no bespoke scheduler |

### 4.3 Generator-first entry (per [[curaos-generator-evolution-rule]]; gap steps)

1. Author `contracts/insurance/insurance.tsp` (TypeSpec): Policy, CoverageLine, PolicyTerm, Endorsement, Beneficiary-link, Carrier-ref, Producer-ref, Commission, Claim + lifecycle state-machine + validators (beneficiary-sum = 100%, premium math, pro-rata, commission split, claim status transitions).
2. Run `@curaos/codegen` 3-layer emit -> `insurance-core-service` (neutral) + `business-insurance` + `personal-insurance` overlays + `@curaos/insurance-sdk` + Helm + gateway route + ai-mirror docs.
3. Drizzle schema + migration + `gen:service-seed` real demo policies (database-backed per [[curaos-demo-sample-data-rule]]).
4. Wire carrier/beneficiary/producer refs to `party-core` via composite-FK; reuse the `sales-core` line-item template.
5. Emit AsyncAPI events `curaos.business.insurance.policy.{bound,renewed,endorsed,lapsed}.v1`, `...claim.{filed,updated,settled}.v1`, `...commission.{calculated,paid,clawed-back}.v1` (versioned, outbox).
6. Fold every term / pro-rata / sum / commission-split / claim-transition edge case into generator validators + snapshot tests - never as per-service hot-fixes.

All net-new files are emitted by the generator under `curaos/backend/services/insurance-core-service/`, `.../personal-insurance-service/`, `.../business-insurance-service/`, `curaos/backend/packages/insurance-sdk/`, `curaos/backend/contracts/insurance/`. Generator template + emitter changes land in `curaos/tools/codegen/`.

### 4.4 Version gate ([[curaos-version-planning-rule]])

Insurance-broker is net-new and not in the v1 = M1-M17 GA working set. **Target Version = v2+** (net-new domain), filed forward via the Phase-13 XSRC backlog epic, not crammed into v1. Reuse-only enrichments that ride existing owners (esign envelope templates, party roles) MAY be triaged independently if a v1.1 consumer is named; the policy spine itself is v2+.

---

## 5. Consequences

- New neutral domain with two overlays enters the generator mold; future scaffolds inherit insurance support natively.
- Party graph becomes the single identity for all insurance roles (insured / carrier / producer / beneficiary / claimant), eliminating duplicate org/contact records.
- Existing owners (accounting, sales, esign, documents, audit, workflow, tasks) gain insurance as a consumer, not a fork - DRY preserved.
- Person-centric surfaces become possible: "my coverage / my premium / my beneficiaries / file a claim" backed by the same record the broker manages.
- Tech-agnostic at workspace level; concrete stack inherited from ADR-0150 baseline (NestJS/PG17/Kafka or NATS/TypeSpec) - no new stack decision here.

## 6. Risks

| Risk | Mitigation |
|---|---|
| **AGPL/GPL contamination** (SuiteCRM AGPL, others GPL) | Clean-room: model from data-model *facts* only; never copy or link source. Mode H/G enforced; legal-review gate before any structure lifted; document clean-room boundary in the service AGENTS.md. |
| Naming collision with `@curaos/policy` (authorization) | Namespace insurance as `insurance` (`insurance-core-service`, `@curaos/insurance-sdk`); policy is an *entity* inside it. Reject the gap doc's `policy-core-service` name. |
| Duplicating org/party model | Carrier/producer/beneficiary are party *roles* via `party-core` extension; CI dependency-direction guard (vertical->neutral). |
| Money-path defects (premium, pro-rata, commission, claim reserve) | All validators generator-side with snapshot + golden-file tests; edge cases fold back into the mold, never per-service. |
| PII/PHI boundary (beneficiaries, claimants, KYC) | Route through `personal-crm` consent + overlay-schema isolation; neutral `insurance-core` holds references + metadata only (charter §3). |
| Scope blow-out (spine complexity `L`, 22 mappings) | Version-gated to v2+; sliced as tracer-bullet stories under the XSRC epic; in-flight generator barrier respected before mass downstream emit. |

## 7. License implications

- **No source code copied or linked.** SuiteCRM (AGPL-3.0), EspoCRM (GPL/AGPL-3.0), Dolibarr (GPL-3.0), OpenEMR (GPL-3.0) are all `reference-only`. Data-model field-set shapes and lifecycle state-machines are mined as facts and re-implemented fresh in TypeScript/TypeSpec.
- **AGPL is the hard line:** SuiteCRM as a runtime dependency (Option C) is rejected - network copyleft would force open-sourcing the interacting CuraOS service. Mode H (reject as dependency) is canonical.
- `esign-core-service`, `party-core-service`, `audit-core-service` are first-party (`safe-to-vendor`); reuse carries no new obligation.
- X12 / HCFA / UB-04 segment structures (claim) are ANSI/government standards - structure reusable, implementation fresh; relevant only if the broker claim later bridges to the healthcare-revenue X12 SDK.
- **Legal-review gate** required before any source structure is lifted, recorded in the service AGENTS.md clean-room note. This ADR's §2.4 supersedes the looser "GPL-3.0" labels in `source-to-local-map.json` per the canonical register.

## 8. Validation needed

1. **Stack-review pre-flight** (workspace AGENTS.md §13): confirm ADR-0150 baseline covers insurance-core; no new stack pick expected. If a tenant needs carrier-rating/eligibility connectors, add as optional 3rd-party providers ([[curaos-local-vs-3rdparty-rule]]), not core.
2. **Naming resolution**: confirm `insurance` namespace and that `@curaos/policy` stays authorization-only; update RESOLUTION-MAP if it tracks domain naming.
3. **Generator capability check**: confirm `@curaos/codegen` 3-layer emit + `.tsp` template + line-item-group template can express coverage-line/endorsement/commission before scaffolding (in-flight generator barrier per generator-evolution rule).
4. **Legal review sign-off** on the clean-room data-model boundary for SuiteCRM (AGPL) / EspoCRM / Dolibarr / OpenEMR.
5. **PII/PHI boundary review** for beneficiary/claimant/KYC data routing through personal-crm consent + overlay schema.
6. **Money-path test plan**: golden-file validators for premium schedule, pro-rata endorsement, commission split/override/clawback, claim reserve before any emit.
7. **Demo-data**: `gen:service-seed` produces real database-backed demo policies; no runtime API mocks.

## 9. Implementation follow-up

- **Phase-13 XSRC backlog epic - insurance-broker domain** (`generated_for: XSRC-EPIC` umbrella; this ADR is the gate). Break down via the `to-issues` / milestone-wave flow into tracer-bullet stories:
  1. `contracts/insurance/insurance.tsp` authoring + generator template/emitter extension (`curaos/tools/codegen/`).
  2. Emit `insurance-core-service` (neutral spine) + schema/migration/seed.
  3. Emit `personal-insurance-service` + `business-insurance-service` overlays + `@curaos/insurance-sdk`.
  4. Party-role extension (carrier/producer/beneficiary/claimant) on `party-core` + `personal-crm`.
  5. Premium schedule on `accounting-core`; commission engine on `sales-core` + `accounting-core`.
  6. Broker claim entity on `business-cases-service`; FNOL/renewal/endorsement workflows on `workflow-core` + `tasks-core`.
  7. Insurance e-sign envelope templates on `esign-core-service` (reuse-only; possible v1.1 if a consumer is named).
  8. AsyncAPI events + outbox; AsyncAPI/ai-mirror docs sync.
- Each story: TDD, generator-first, edge cases fold to the mold, `Target Version = v2+` (esign templates triageable to v1.1 if named), `Requirements.md` + `AGENTS.md` + `CONTEXT.md` per module, doc-graph + ai-mirror green.
- On acceptance: update `RESOLUTION-MAP.md` (new domain entry), set status Accepted, and record the clean-room boundary in `insurance-core-service` AGENTS.md.