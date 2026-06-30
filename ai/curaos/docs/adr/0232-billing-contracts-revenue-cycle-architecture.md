# ADR-0232: Billing / contracts / revenue-cycle architecture

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


Status: Proposed
Date: 2026-06-29
Target Version: v1.1 (clinical revenue cycle + invoice/subscription/contract spine); insurance-broker policy domain -> v2
Phase: XSRC Phase 12 (cross-source mining -> ADR batch)
Lens: [Person-centric, no-feature-loss](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (BINDING, dominant over raw parity)
Extends: ADR-0159 (pricing/packaging/platform metering), ADR-0202 (commerce/sales/procurement/inventory cluster), ADR-0208 (HealthStack clinical services), ADR-0205 (esign/donation/crm/business cluster), ADR-0153 (codegen recipe coverage), ADR-0154 (provider abstraction), ADR-0210 (party/actor diamond)
Supersedes: none
Precedence note: this ADR is **priority 2** (decision history). Where it touches stack/tool/gate/naming, the canonical answers live in `ai/rules/` (priority 1): [[curaos-generator-evolution-rule]], [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-demo-sample-data-rule]]. If this ADR ever conflicts with a rule, the rule wins and this ADR gets a resolution-pin banner.

---

## 1. Status

Proposed. This is the architecture-decision record for how CuraOS expresses **billing, contracts, subscriptions, and the healthcare + commercial revenue cycle** as a coherent set of capabilities, mined from 39 indexed external systems against verified local state. It is distinct from ADR-0159 (which prices and meters the CuraOS *product itself*); ADR-0221 governs the *tenant's* revenue cycle: their invoices, their patients' claims, their customers' subscriptions, their policyholders' premiums.

It stays tech-agnostic where the workspace requires it (workspace AGENTS.md §10) and names concrete stacks only where prior accepted ADRs already locked them (Drizzle/MikroORM per [[curaos-orm-rule]], the `@curaos/codegen` mold, Stripe/PayPal bridge in commerce-core per ADR-0202).

---

## 2. Context

### 2.1 Why now

XSRC Phase-12 mining produced 163 source<->local mappings across 11 domains. Five of those domains are the revenue cycle: `healthcare-revenue` (8), `erp-finance` (13), `crm-sales` (13), `contracts-recurring` (6), `insurance-broker` (15) = **55 billing-relevant mappings**. The gap analysis (`gap-analysis.json`) ranks the revenue cycle as one of the four top gap clusters; its summary calls the revenue cycle "the single biggest finance gap blocking real revenue capture" and notes "the revenue cycle is non-functional past 'submitted' status."

The maturity distribution across all 163 mappings (`gap-analysis.json` `_computed.maturity_distribution`): present-strong 34, partial 34, absent 36, stub 24, present-weak 21, stronger-than-source 14. The revenue-cycle slice skews to the absent/stub/weak end.

### 2.2 Verified local state (what we already have)

From `local-project-inventory.json` `domains_present` + `modules` (93 backend services, generator role = PRIMARY INJECTION POINT):

| Capability | Local module | Maturity | Note (verbatim from inventory) |
|---|---|---|---|
| Patient billing / claims worklist | `healthstack-billing-service` | real-working | "Claims worklist, eligibility/submit, copay, payment capture, consent-gated; **in-memory seeded store, no Postgres adapter yet (#737)**" |
| Clinical claims | `healthstack-claims-service` | scaffold-only | README + Helm chart, no `src/` |
| Double-entry ledger | `accounting-core-service` | partial | "Double-entry ledger, CoA, journal entries, trial balance, W2/1099; GL reconciliation/balance-sheet pending" |
| Customer invoicing / quotes / commission | `sales-core-service` | partial | "Quote generation, sales orders, commission tracking, quote->order pipeline" |
| Cart/checkout/payment | `commerce-core-service` | real-working | "embeds Medusa v2 (MikroORM) for cart/checkout/payment" |
| AP / 3-way match | `procurement-core-service` | partial | "Vendor mgmt, RFQ, PO + approval, 3-way invoice match, payment tracking" |
| Recurring giving (cadence reference impl) | `donation-core-service` | partial / present-strong | recurrence engine "already exceeds dolibarr member-subscription and matches ERPNext cadence with cleaner edge handling" |
| E-signature | `esign-core-service` | real-working | "eIDAS/UETA, multi-party seq/parallel, chain-of-custody; DocuSign/HelloSign bridge" (stronger-than-source) |
| Party/role anchor | `party-core-service` | real-working | 1:1 FK to actors diamond (ADR-0210); carrier/producer/beneficiary/claimant register as party roles |
| Insurance policy domain | (none) | absent | "No policy/insurance/carrier/premium/endorsement/beneficiary entity in inventory" |
| Contract aggregate | (none) | absent | "No service matches contract\|subscri\|recurr\|agreement" |
| Subscription / recurring-billing | (none) | stub | local module absent; donation cadence is the promote-outward reference |

Shared substrate is strong: the `@curaos/codegen` mold (`curaos/tools/codegen`, Nx 21.6.11 + @turbo/gen Handlebars + ts-morph 23) emits 3-layer service scaffolds, SDK recipes, UI apps, Helm charts, and service-seeds. This is the injection point all new revenue-cycle surface must enter through.

### 2.3 Source completeness evidence (what "no feature lost" must cover)

From `generated-analysis/source-feature-index.json` (609 features, 39 systems indexed; 47 billing-relevant) and the per-domain `gaps` blocks in `source-to-local-map.json`:

- **OpenEMR (GPL)** ships the complete production X12 engine: `src/Billing/Claim.php` (2287 LoC) + `X125010837P.php` (1640) + `X125010837I.php` (1225) + `GeneratorX12.php` + `BillingClaimBatchControlNumber.php` (837P/837I with ISA/GS/ST envelopes, 2000/2300/2400 loops), plus `BillingReport.php`, `sl_eob_search.php`, `DaySheet/DaySheetAggregator.php` (AR aging + 835/ERA + day sheet).
- **Dolibarr (GPL)** `htdocs/compta/facture/class/facture.class.php` (6580 LoC) = full invoice CRUD/line/state-machine; `facture-rec.class.php` = recurring templates; `htdocs/contrat/class/contrat.class.php` (3010 LoC) + `contratligne.class.php` + `api_contracts.class.php` = contract header+line lifecycle (draft->validated->closed) + `signed_status` enum + public online-sign (`public/onlinesign/newonlinesign.php`, `llx_onlinesignature.sql`).
- **ERPNext (GPL) / Odoo (LGPL)** Subscription doctype + `account.move` double-entry blueprint + `pricing_rule` resolution algorithm + per-country localized charts + tax rule engine.
- **SuiteCRM (AGPL) AOS_Contracts + AOS_Line_Item_Groups + AOS_Invoices** and **EspoCRM (GPL)** custom-entity pattern = the insurance-policy-as-contract shape; none ship a true insurance policy module, confirming insurance-broker is net-new locally.
- **OpenHospital (GPL)** `Bill.java` / `BillItems.java` / `PricesList` = patient-bill + fee-schedule data model.

### 2.4 Standards crosswalk (the canonical external shape, from `data-model-crosswalk.json`)

The clinical revenue cycle is FHIR-aligned per the binding clinical-FHIR-R4 directive; the commercial cycle is ERP-native:

| Concept | FHIR R4 (clinical) | Interop wire | ERP-native (commercial) |
|---|---|---|---|
| Claim | `Claim` / `ClaimResponse` / `EOB`; Da Vinci PAS/CRD for prior-auth | X12 837P/837I, 835 | n/a |
| Coverage / eligibility | `Coverage` + `InsurancePlan`; Da Vinci CRD/PAS/HRex | X12 270/271 | Policy->Coverage, Carrier->Organization, Beneficiary->RelatedPerson |
| Payment posting | `PaymentReconciliation` / `PaymentNotice` | X12 835 | reconciles to accounting journal |
| Invoice | `Invoice` (clinical) | - | Odoo `account.move` / ERPNext / Dolibarr `facture` |
| Contract | `Contract` + `Coverage` | - | Dolibarr `contrat` / ERPNext Contract+Subscription / SuiteCRM aos_contracts |

### 2.5 License posture (from `license-risk-register.json`, the gate that shapes the build)

Every revenue-cycle source is copyleft-incompatible with CuraOS proprietary multi-tenant SaaS + on-prem distribution:

| Source(s) | License | Verdict | Binding obligation |
|---|---|---|---|
| openemr, openhospital-* | GPL-3.0 | **reference-only** | "NEVER copy GPL source (PHP/Java) verbatim"; X12/HCFA/UB-04 segment+box structure is ANSI/government standard (not copyrightable) and reusable; port LOGIC + data-model as fresh original (clean-room) |
| dolibarr | GPL-3.0 | **reference-only** | port invoice/contract model + state-machine fresh; adopt `signed_status` enum + public-sign UX as design patterns, implement fresh |
| erpnext / frappe | GPL / MIT split | erpnext: reference-only; **frappe: safe-to-vendor** | prefer MIT frappe primitives (AutoRepeat/AssignmentRule/Workflow) for copy-with-attribution; erpnext business modules (pricing_rule, subscription) GPL port-adapt only |
| odoo | LGPL-3.0 | **reference-only** | port `account.move` double-entry + tax model as fresh code |
| suitecrm, espocrm | AGPL-3.0 | **reference-only** | network-copyleft is hardest; data-model field-set shapes (facts) may be mined and re-implemented; legal-review before any use beyond fact-level reference; document clean-room boundary in PR |
| local first-party (esign-core, party-core, donation-core, accounting-core) | proprietary | **safe-to-vendor** | already exceed source equivalents; reject-inbound, no external code enters |

Net: the *entire* revenue cycle is **port-adapt or pattern-reference only**. No source is safe-to-copy. Reuse-mode distribution for the 163 mappings (`code-reuse-ledger.json` `_computed.mode_distribution`): E:port-adapt 99, G:pattern-reference-only 51, H:reject 6, D:api-adapter 4, C:run-as-background-service 3. The revenue cycle is almost entirely E and G.

---

## 3. Decision Options

### Option A: One monolithic `revenue-cycle-service`

A single service owning claims, invoices, payments, coverage, contracts, subscriptions, and policies.

- Pro: one transaction boundary; simplest cross-document joins.
- Con: violates the neutral-before-vertical charter (§3) and the PHI boundary (§3, §6): clinical claims (PHI in healthstack overlay) cannot share a service with neutral commerce invoices; collapses person/management dual-surface emission into one org-shaped CRUD; can't ship independently (§3 composable). Rejected.

### Option B: Per-source ports (one local service mirroring each source module)

Port OpenEMR billing as one service, Dolibarr contracts as another, ERPNext subscriptions as a third.

- Pro: fastest 1:1 traceability to source.
- Con: names code after provenance (banned, AGENTS.md §9), duplicates the cadence/line-item/ledger-posting machinery N times (violates [[curaos-reuse-dry-rule]]), and bakes each source's org-centric UX into the local shape (violates the person-centric lens). Rejected.

### Option C (recommended): Contract-first capability spine across existing + minimal net-new owners, generator-emitted, with a shared `@curaos/x12` SDK and one cadence primitive

The revenue cycle is expressed as a small set of **capability owners** (most already exist), each owning one canonical document type, wired by events through `accounting-core-service` as the single ledger. New cross-cutting logic (EDI codecs, recurrence cadence, line-item grouping, tax) lands in **shared SDK/codegen owners**, never per-service. Each capability emits BOTH a person surface and a management surface from one contract (the dual-surface lens). Net-new services (`policy-core` + insurance triad, `contract`/`subscription` ownership, `@curaos/x12`, `@curaos/tax-engine`, `@curaos/currency`) enter through the `@curaos/codegen` mold contract-first.

### Option D: Option C but buy a 3rd-party billing/RCM platform for the hard parts (clearinghouse EDI, dunning)

- Pro: skips the XL X12 build.
- Con: [[curaos-local-vs-3rdparty-rule]] requires BOTH a local first-party option AND a 3rd-party option for every integratable area; it forbids 3rd-party-*only*. Self-hosted-first + air-gap (charter §4) means the local EDI codec must exist regardless. So D is not an alternative to C; it is the **3rd-party half of C** (BYO clearinghouse/processor via integrations-core + provider abstraction ADR-0154), which C already includes. Folded into C.

---

## 4. Recommended Option: C

### 4.1 Capability owner map (one canonical owner per document; reuse over new)

| Capability (canonical doc) | Owner | New or extend | Mode | Source ref | License gate |
|---|---|---|---|---|---|
| Double-entry GL / CoA / tax / FX / fiscal period (the single ledger) | `accounting-core-service` | extend (partial->real) | E port-adapt + new `@curaos/tax-engine`, `@curaos/currency` | Odoo `account.move` (LGPL) | reference-only |
| Customer invoice lifecycle (line items, draft->posted->paid, recurring, PDF) | `sales-core-service` | extend (stub->real) | E port-adapt | Dolibarr `facture` (GPL) | reference-only |
| Cart / checkout / gateway payment | `commerce-core-service` | reuse as-is (Medusa) | n/a | - | safe (local) |
| AP / supplier invoice / 3-way match | `procurement-core-service` | extend | E port-adapt | Dolibarr / ERPNext | reference-only |
| Patient billing + claims worklist + eligibility + ERA posting | `healthstack-billing-service` | extend (in-mem -> Postgres #737, real RCM) | E port-adapt via `@curaos/x12` | OpenEMR (GPL) | reference-only |
| Clinical claim document (FHIR Claim/Coverage) | `healthstack-claims-service` | build (scaffold->real) | E via contract + `@curaos/x12` | OpenEMR (GPL) | reference-only |
| Contract aggregate (header+line, lifecycle, signed_status) | `contract` owner (new neutral `*-core-service`) | new | E port-adapt | Dolibarr `contrat` (GPL) | reference-only |
| Subscription / recurring billing | subscription ownership (neutral) | new | E port-adapt | ERPNext Subscription (GPL); donation cadence (local, promote) | reference-only / local |
| Recurring cadence primitive (frequency, next_due_at, month-end clamp) | `@curaos/codegen` template (promoted from `donation-core` `recurrence.ts`) | promote local outward | local-first | frappe AutoRepeat (MIT, attribution) | safe-to-vendor (MIT) |
| Insurance policy domain (policy + coverage-lines + terms/renewals + endorsements + beneficiaries + premium-schedule + commission + broker-claim + KYC) | `policy-core-service` + `business-insurance` + `personal-insurance` triad + `@curaos/insurance-sdk` | new (v2) | E port-adapt clean-room | SuiteCRM AOS_Contracts (AGPL ref) + Dolibarr contrat (GPL) | reference-only / AGPL legal-review |
| E-signature on agreements/applications/renewals | `esign-core-service` | reuse as-is (stronger-than-source) | G pattern-reference (UX only) | Dolibarr public-sign (GPL) | local (UX implemented fresh) |
| Party roles: carrier / producer / beneficiary / claimant / subscriber | `party-core-service` | extend (register roles, no new entity) | reuse | - | safe (local) |
| Renewal / FNOL / KYC / approval journeys | `workflow-core-service` + `tasks-core-service` + `documents-core` | reuse molds | reuse | - | safe (local) |

### 4.2 The four cross-cutting shared owners (generator-evolution: fix the mold, not the service)

1. **`@curaos/x12` SDK** (new package). One package emits 837P + 837I + 270/271 + 835 parse + CMS-1500/UB-04 PDF from the canonical FHIR-aligned `Claim`/`Coverage` contract. Services never hand-write EDI; new payers/forms extend the SDK. Clean-room TS port of OpenEMR LOGIC (ANSI X12 segment layout is not copyrightable). This satisfies `gap-analysis.json`'s top RCM gap: "no x12-sdk package exists."
2. **Recurrence cadence template** (promoted from `donation-core` into `@curaos/codegen`). One primitive (`frequency` enum + computed `next_due_at` + BullMQ delayed job emitting `*.recurring.due`, with the month-end-clamp edge case already handled locally) serves donation + subscription + contract-renewal + premium-installment. No cron strings, no per-domain scheduler.
3. **`@curaos/tax-engine` + `@curaos/currency`** (new packages). Tax rule resolution + multi-currency conversion shared by sales, commerce, procurement, accounting, premium-billing. Ported from Odoo logic (LGPL reference-only).
4. **Line-item-group + ledger-posting-rule catalog** (codegen template + `accounting-core` `posting-rules.ts` widening). One line-item-group generator template serves quotes, orders, coverage-lines, contract-lines, claim-lines. The posting-rule catalog encodes the canonical GL effect of every revenue event (invoice -> AR debit/revenue credit; payment -> cash debit/AR credit; 835 post -> write-through to the same `billing_invoice` balance the patient surface reads), so auto-posting is event-led and humans rarely hand-post.

### 4.3 Person-centric dual-surface mandate (binding lens)

Every capability emits two re-centered experiences over one contract (`PERSON-CENTRIC-LENS.md` §"Dual surface per capability"), no feature lost:

| Capability | Person surface | Management surface (full capability + compliance) |
|---|---|---|
| Patient billing | patient-app "my bills, what I owe, what insurance covered" | front-office invoice list/detail/void/charge-lines/per-patient summary |
| Claims (837/835) | claim-status timeline ("submitted to BlueCross -> adjudicating -> paid", plain-language denial, never CARC codes) | billing-admin claim batch console: raw X12, batch control #, 997/999 acks, denial workqueue, resubmit |
| Eligibility (270/271) | check-in: "coverage active, estimated copay $X today" | staff eligibility panel: 271 detail, deductible-met, payer config |
| Customer invoice / subscription | "your invoice, one-tap pay"; "my subscriptions, next charge, pause/cancel" | invoice builder, recurring scheduler, numbering, dunning ladder (as automation) |
| Contract / agreement | "My Agreements": plain-language coverage, next charge, signed PDF, one-tap renew | full header+line CRUD, draft->validated->closed per line, renewal worklist |
| Insurance policy | personal-insurance "My coverage / premium due / file a claim (FNOL) / my beneficiaries" | broker policy lifecycle, carrier binding, book-of-business, commission engine, compliance audit |

Simplification (a CuraOS advantage, never a cut): collapse Odoo's manual-journal UX into event-led auto-posting; collapse Dolibarr's `contrat`+`contratligne` line-status churn into one aggregate; reuse esign-core for all signing; one cadence primitive for all recurring domains. Each capability's `no_loss_check` (recorded per mapping in `source-to-local-map.json`) confirms every source business/management/compliance field is preserved or filed forward.

### 4.4 PHI boundary (charter §3 / §6)

Clinical claims, coverage, and patient billing carry PHI and stay in the **healthstack overlay schema** (`healthstack-billing-service`, `healthstack-claims-service`). The neutral ledger (`accounting-core-service`), neutral invoice (`sales-core-service`), and neutral contract/subscription owners hold **references + financial amounts only**, never PHI. The clinical financial leg reconciles to the neutral journal via events (`data-model-crosswalk.json`: "Claim financial leg reconciles to accounting-core journal + sales invoice"), not by sharing PHI rows.

### 4.5 Local + 3rd-party duality ([[curaos-local-vs-3rdparty-rule]])

| Area | Local / self-hosted (default; air-gap) | 3rd-party (BYO via integrations-core + ADR-0154) |
|---|---|---|
| EDI transport | `@curaos/x12` codec + direct payer SFTP | clearinghouse (Availity / Change Healthcare) |
| Eligibility | local 270/271 round-trip | payer real-time API |
| Card payment | (none local for cards) | Stripe / PayPal via commerce-core bridge |
| E-signature | esign-core (eIDAS/UETA) | DocuSign / HelloSign bridge (already present) |
| Tax | `@curaos/tax-engine` | Stripe Tax / Avalara |
| PDF (invoice/claim form) | Gotenberg (reports-service) | - |

The local option is mandatory for self-hosted + air-gap; the 3rd-party option is config-selected.

---

## 5. Consequences

**Positive.** One ledger, one cadence primitive, one EDI SDK, one line-item generator, one signing engine: the DRY owner set keeps the revenue cycle coherent and lets generator-evolution carry every future edge case (new payer, new form, new frequency) into the shared mold instead of N services. Person/management dual surfaces ship from each contract. PHI stays bounded. Self-hosted + air-gap viable because the EDI/tax/sign codecs are first-party.

**Negative / cost.** Large lift: `gap-analysis.json` marks 837/835 generation as XL, ERA posting XL, invoice lifecycle XL, tax XL; the insurance domain is an entire net-new triad. `healthstack-billing-service` must move off its in-memory Map to Postgres (#737, [[curaos-demo-sample-data-rule]]: demo data is database data, never a runtime mock plane) before any of this is real. Sequencing matters: the in-flight generator/SDK barrier (AGENTS.md §8) blocks downstream dispatch while `@curaos/x12`/`@curaos/codegen`/`@curaos/*-sdk` lanes carry `agent-claimed:*` or `agent-PR-open`.

**Version split (per [[curaos-version-planning-rule]]).** v1.1 = clinical revenue cycle real (Postgres-backed `healthstack-billing`, `@curaos/x12` 837/835/270/271, ERA write-through), customer invoice/subscription/contract spine, cadence promotion, tax/currency packages. Insurance-broker policy triad = v2 (net-new domain, filed forward, never crammed).

---

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **AGPL contamination** from SuiteCRM/EspoCRM/OpenMRS during the insurance/contract port. | Fact-level reference only (data-model shapes); clean-room TS; legal-review before any structure lifted; document clean-room boundary in every PR (license-register obligation). |
| R-2 | **GPL contamination** from OpenEMR/Dolibarr/ERPNext/odoo. | Port LOGIC + model as fresh code; X12/CMS-1500/UB-04 are ANSI/government standards (reusable structure); never copy PHP/Java verbatim. |
| R-3 | EDI correctness (a malformed 837 is rejected by the payer; a mis-posted 835 corrupts AR). | Golden-file tests in `@curaos/x12` against the ANSI 5010 implementation guides + 997/999 ack handling; ponytail-style runnable self-check per codec; contract test in CI. |
| R-4 | Data-truth violation persists (in-memory billing store). | #737 Postgres adapter is a hard precondition; `gen:service-seed` real seeds, no API mock plane (demo-data rule). |
| R-5 | Per-service hot-fixes re-introduced under XL deadline pressure. | Generator-evolution barrier; the four shared owners (§4.2) are the only legal place for cross-cutting logic; per-service patch is last resort with documented proof. |
| R-6 | Double-spend of cadence/line-item/posting machinery (DRY drift). | One canonical owner each (§4.2); donation-core cadence is promoted, not copied; reject-mode (H) on already-stronger local assets (esign, audit, recurring-donation). |
| R-7 | PHI leak into neutral ledger. | References + amounts only in neutral services; reconciliation by event; CI dependency-direction guard (vertical->neutral, never reverse). |

---

## 7. License Implications

- **No revenue-cycle source is copy-safe.** Reuse modes are E (port-adapt) or G (pattern-reference) for every billing mapping; the only safe-to-vendor inputs are frappe MIT primitives (AutoRepeat) with attribution and first-party local code.
- Every port-adapt PR must: (a) state the clean-room boundary, (b) cite the source file referenced (logic/model only), (c) confirm no PHP/Java/Python was lifted, (d) trigger legal-review for any AGPL-derived structure.
- Standards-defined structures (X12 5010 segments, CMS-1500/UB-04 boxes, FHIR Claim/Coverage/Invoice resources) are not copyrightable and are reused freely with fresh implementation.
- Provenance must stay explicit where frappe-MIT and erpnext-GPL are adjacent (split-license obligation).

---

## 8. Validation Needed

1. **Legal-review sign-off** on the clean-room port plan for SuiteCRM (AGPL) policy shapes and OpenEMR/Dolibarr (GPL) billing/contract logic, before any insurance/contract service is scaffolded.
2. **`@curaos/x12` golden-file conformance**: 837P/837I round-trip vs ANSI 5010 IG samples; 835 CAS/CLP/SVC parse correctness; 270/271 eligibility round-trip; 997/999 ack handling. CI contract test.
3. **#737 Postgres-backed `healthstack-billing`** proven with real seeds (`gen:service-seed`), no in-memory Map, no runtime API mock (demo-data rule), local + live verification per [[curaos-full-surface-sweep-rule]].
4. **Dual-surface render proof**: person surface (patient-app/personal-*) + management surface (front-office/business-*/broker) both render real seeded revenue-cycle data from one contract.
5. **Auto-posting correctness**: event-led posting-rule catalog produces a balanced trial balance for the full AR/AP/cash/835 lifecycle (accounting invariant test).
6. **PHI-boundary CI guard**: neutral ledger/invoice/contract services carry no PHI columns; reconciliation is event-only; dependency direction is vertical->neutral.
7. **Cadence edge cases**: promoted recurrence template preserves month-end clamp + missed-run backfill across donation/subscription/renewal/installment.
8. **Pricing-ADR non-overlap**: confirm ADR-0221 (tenant revenue cycle) and ADR-0159 (CuraOS product metering) share no double-owned billing concern; the tenant's invoices are not the same plane as CuraOS's meter events.

---

## 9. Implementation Follow-up (XSRC backlog epic)

Filed forward under the **XSRC Phase-13 backlog epic: "Revenue-cycle capability spine (billing / contracts / claims / subscriptions / insurance)"** in the local issue hierarchy (`.scratch/state/symphony-work/local-issues.sqlite`, mirrored to GitHub per `docs/agents/issue-tracker.md`), with each Story carrying a `Target Version` field per [[curaos-version-planning-rule]]. The backlog epic links back to this ADR as its decision record. Atomic Stories (contract-first, generator-emitted; the shared-owner Stories are the in-flight barrier and must land first):

| # | Story | Target Version | Generator-first target | Precondition |
|---|---|---|---|---|
| S-1 | `healthstack-billing` Postgres adapter + real seed (close #737) | v1.1 | drizzle schema + `gen:service-seed` | none |
| S-2 | `@curaos/x12` SDK: 837P/837I + 270/271 + 835 + CMS-1500/UB-04 | v1.1 | sdk-package + golden-file tests | S-1 |
| S-3 | `healthstack-claims-service` build from contract (FHIR Claim/Coverage) | v1.1 | contract-typespec -> emitServiceLive | S-2 |
| S-4 | ERA/835 auto-posting write-through to `billing_invoice` + neutral ledger | v1.1 | asyncapi-event + posting-rule catalog | S-2, S-6 |
| S-5 | Eligibility 270/271 wired to Estimate contract (real copay at check-in) | v1.1 | contract-typespec | S-2 |
| S-6 | `accounting-core` partial->real: GL/tax/FX/fiscal + `@curaos/tax-engine` + `@curaos/currency`; widen posting-rule catalog | v1.1 | contract-typespec + 2 packages | none |
| S-7 | `sales-core` invoice lifecycle (line/state-machine/recurring/PDF/email) | v1.1 | contract-typespec | S-6 |
| S-8 | Subscription/recurring-billing ownership + promote donation cadence to `@curaos/codegen` template | v1.1 | codegen-template + contract-typespec | none |
| S-9 | Contract aggregate owner (header+line+lifecycle+signed_status via esign-core) | v1.1 | contract-typespec | S-8 |
| S-10 | Renewal journeys (`*.renewal.due` event + notify + esign re-sign) | v1.1 | asyncapi-event | S-9 |
| S-11 | Insurance policy triad: `policy-core` + `business-insurance` + `personal-insurance` + `@curaos/insurance-sdk` (policy/coverage-lines/terms/endorsements/beneficiaries via party roles) | v2 | 3-layer codegen emit + sdk-package | S-9, legal-review |
| S-12 | Premium schedules/installments (reuse cadence + accounting AR); commission engine (sales-core rule + accounting payout) | v2 | contract-typespec | S-6, S-11 |
| S-13 | Broker claim/FNOL journey + KYC/AML (workflow-core + documents-core + integrations-core AML adapter) | v2 | contract-typespec | S-11 |
| S-14 | Dual-surface UI archetypes for revenue cycle (Ledger/BillingFlow, ApprovalInbox, Entity360) in `@curaos/ui` + `ui-app-emit` archetype vocabulary | v1.1 | ui-kit + ui-app-emit | parallel |
| S-15 | Legal-review sign-off (AGPL/GPL clean-room boundary) | v1.1 (gate) | n/a | blocks S-3, S-11 |

---

## 10. References

| Source | Relationship |
|---|---|
| [PERSON-CENTRIC-LENS.md](../external-source-enrichment/PERSON-CENTRIC-LENS.md) | Binding dominant lens (dual-surface, no-feature-loss) |
| `source-to-local-map.json` (domains: healthcare-revenue, erp-finance, crm-sales, contracts-recurring, insurance-broker) | 55 billing mappings + person-centric fields + no_loss_check |
| `gap-analysis.json` (`functional_gaps`, `_computed.maturity_distribution`) | revenue-cycle as top gap cluster; XL severity |
| `code-reuse-ledger.json` (`_computed.mode_distribution`) | E:99 / G:51 reuse modes |
| `license-risk-register.json` (`authored_register`, `_computed.summary`) | reference-only verdicts + clean-room obligations |
| `data-model-crosswalk.json` (Claim/Coverage/Invoice/PaymentReconciliation entities, `standards_alignment`) | FHIR R4 + X12 + ERP-native crosswalk |
| `local-project-inventory.json` (`domains_present`, `modules`, `generator`) | verified local state + injection-point mold |
| `generated-analysis/source-feature-index.json` (47 billing features, evidence) | source completeness proof (OpenEMR Claim.php, Dolibarr facture/contrat LoC) |
| `ui-visual-inventory.json`, `workflow-map.json` | dual-surface archetype + renewal/FNOL/KYC journey inputs |
| ADR-0159 | CuraOS *product* pricing/metering (distinct plane; non-overlap validated in §8) |
| ADR-0202 | commerce/sales/procurement/inventory cluster (commerce-core Medusa payment) |
| ADR-0208 / ADR-0115 | HealthStack clinical services + overlay (PHI boundary) |
| ADR-0205 | esign/donation/crm cluster (donation cadence, esign-core) |
| ADR-0153 / ADR-0154 | codegen recipe coverage + provider abstraction (3rd-party half) |
| ADR-0210 | party/actor diamond (carrier/producer/beneficiary roles) |
| [[curaos-generator-evolution-rule]] | shared-owner-first; the four §4.2 owners |
| [[curaos-local-vs-3rdparty-rule]] | local + 3rd-party duality (§4.5) |
| [[curaos-reuse-dry-rule]] | one canonical owner per document/primitive |
| [[curaos-version-planning-rule]] | v1.1 / v2 split; forward-filed backlog |
| [[curaos-demo-sample-data-rule]] | database-backed seeds, no runtime mock plane |

---

*Last updated: 2026-06-29. Status: Proposed; awaiting RESOLUTION-MAP entry + legal-review (S-15) before any insurance/contract scaffold.*

---

**File written to:** `/Users/dev/workspace/curaos-workspace/ai/curaos/docs/adr/0221-billing-contracts-revenue-cycle-architecture.md` (next number after latest accepted ADR-0220; `.ai-analysis/adr/` is empty, so this Phase-12 ADR lands directly in the canonical ADR directory). Follow-up actions a human/orchestrator still owns: add a RESOLUTION-MAP.md entry, refresh the doc graph (`bun scripts/check-doc-graph.js`), and confirm the XSRC Phase-13 backlog epic exists in the local issue tracker before dispatching S-1..S-15.