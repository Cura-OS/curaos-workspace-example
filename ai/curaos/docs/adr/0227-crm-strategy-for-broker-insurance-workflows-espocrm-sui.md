# ADR-0227: CRM strategy for broker/insurance workflows (EspoCRM/SuiteCRM AGPL, custom-entit

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** proposed
**Date:** 2026-06-29
**Phase:** XSRC Phase 12 (external-source mining -> ADR)
**Binding lens:** [`PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (dominant; scored per feature)
**Supersedes-in-part / extends:** [ADR-0205 Cluster: Documents + E-sign + CRM + Donation + HR + Business Management](0205-cluster-docs-esign-crm-donation-hr-business.md) (reaffirms its EspoCRM=reject / SuiteCRM=reject verdict; adds the fact-level mining + custom-entity-pattern decision and the net-new insurance-broker domain it did not cover)
**Parent ADRs:** [0099 Charter](0099-charter-priorities-vision.md) - [0123 Codegen + Plugin](0123-foundation-codegen-plugin.md) - [0121b Builder Apps](0121b-foundation-apps.md) - [0200 Party/Org/Identity](0200-cluster-identity-party-org-audit.md) - [0215 Version-gated planning](0215-version-gated-planning.md)
**Rules (precedence #1, override this ADR on conflict):** [[curaos-local-vs-3rdparty-rule]] - [[curaos-reuse-dry-rule]] - [[curaos-generator-evolution-rule]] - [[curaos-version-planning-rule]] - [[curaos-demo-sample-data-rule]] - [[curaos-triplet-split-rule]] - [[curaos-rolling-update-rule]]

---

## 1. Context

CuraOS must serve a **broker/insurance** business line (general CRM/sales plus a net-new insurance-policy domain) while keeping the workspace charter intact: self-hosted-first, generic-before-vertical, generator-first, and (binding for this phase) **person-centric without feature loss**.

The XSRC mining phase cloned and indexed nine external corpora. The two CRM-native sources are **EspoCRM** and **SuiteCRM**, cross-referenced with Odoo (`crm`), Dolibarr (`contrat`/commissions), ERPNext, and OpenEMR (claim model). The analysis produced 163 source<->local mappings across 11 domains, of which two are directly in scope: `crm-sales` (13 features) and `insurance-broker` (15 features).

**What we already have (local evidence, `local-project-inventory.json`):**
- `party-core-service` - **real-working** (party CRUD, actors-diamond FK, audit hash-chain) - the single person/org identity spine.
- `personal-crm-service` - **real-working** and *stronger-than-source* (per-contact consent, relationships, groups, composite-FK PII isolation).
- `crm-core-service` - **partial**: `crm.dto.ts` exposes only `CreateAccount/CreateContact/CreateDeal/MoveDealStage`; no Lead, no convert op, free-string `STAGE_KEY` (no managed pipeline/stage/lost-reason), thin `AccountRecord/ContactRecord` (displayName-only).
- `sales-core-service` - **partial**: quotes + sales orders + a commissions **stub** (no split/override engine).
- `accounting-core-service` - **partial**: double-entry ledger/COA/journal, but no premium AR schedule or installment generation.
- `business-cases-service` - **scaffold-only** (README + chart, no `src/`).
- `esign-core-service` - **real-working**, *stronger-than-source* (eIDAS/UETA, multi-party envelopes, chain-of-custody).
- `policy` (`curaos/backend/packages/policy`) - **scaffold-only**, "clean slate" (a security-policy package name collision, NOT an insurance-policy owner).
- `@curaos/codegen` (`curaos/tools/codegen`) - **strong** generator: 3-layer service emit (core/personal/business + healthstack overlay), TypeSpec `.tsp` -> DTO/controller, SDK recipe, Next.js UI app emit, Helm, gateway route map, `gen:service-seed`. This is the mandated injection point ([[curaos-generator-evolution-rule]]).

**The gap (gap-analysis.json):** the entire `insurance-broker` domain is **net-new locally** - no policy / carrier / coverage-line / premium / endorsement / beneficiary / commission-engine / insurance-claim / KYC entity exists in the 167-module inventory. Within `crm-sales`, the Lead entity + lead-to-party conversion, managed pipelines, cases service, activity timeline, and inbound email sync are **absent or stub**.

**The license wall (`license-risk-register.json`, `generated-analysis/source-license-rollup.json`):**
- **EspoCRM** = GPL-3.0 (some modules AGPL-3.0). Verdict: **reference-only**.
- **SuiteCRM / suitecrm-core** = AGPL-3.0. Verdict: **reference-only** (and **reject as a dependency**).
- AGPL network-use copyleft is incompatible with CuraOS's self-hosted multi-tenant SaaS distribution (charter §4): any copied or linked AGPL code would force open-sourcing the interacting service. ADR-0205 already recorded `EspoCRM=Reject (GPL)`, `SuiteCRM=Reject (AGPL)`, `Twenty=Reject (AGPL)`, `Vtiger=Reject`. **Data-model field-set SHAPES are facts (not copyrightable) and may be mined and re-implemented fresh.**

This ADR decides **how** we obtain broker/insurance CRM capability given (a) two reject-licensed best-fit sources, (b) a strong generator we must route through, (c) existing strong owners we must not duplicate, and (d) the person-centric no-loss lens.

---

## 2. Decision options

### Option A - Adopt/host EspoCRM or SuiteCRM (or fork)
Run one of them as the CRM, integrate via its REST API (Espo Record CRUD, SuiteCRM V8 OAuth2).
- **Pro:** fastest feature coverage; mature pipelines, cases, AOR reports, AOW workflow.
- **Con:** **license-fatal.** GPL/AGPL on the SaaS data plane (ADR-0205, license register). Reintroduces a parallel persistence + identity + auth stack against [[curaos-reuse-dry-rule]] and the workspace one-stack charter; duplicates party-core identity; org-centric UX violates the person-centric lens; cannot air-gap cleanly under our build doctrine. **Rejected.**

### Option B - Pattern-reference-only, generator-first, on existing owners (recommended)
Mine EspoCRM/SuiteCRM/Odoo/Dolibarr **data-model field-sets and state machines as facts**; re-express them fresh as TypeSpec contracts emitted through `@curaos/codegen`; land capability on the **existing canonical owners** (party-core, crm-core, sales-core, accounting-core, esign-core, cases) plus **one net-new neutral `policy-core-service` + `insurance-sdk`** for the insurance domain. Adopt the **EspoCRM EntityManager runtime custom-entity pattern as a *design reference only*** - expressed through contract-first codegen + the builder ([ADR-0121b](0121b-foundation-apps.md), [ADR-0123](0123-foundation-codegen-plugin.md)), NOT as a dynamic runtime table engine.
- **Pro:** license-clean (clean-room, facts only); DRY (extends owners, no parallel stack); generator-first (edges fold back per [[curaos-generator-evolution-rule]]); person-centric dual-surface; air-gap-safe.
- **Con:** more build effort than hosting; requires generator extension for the new insurance domain.

### Option C - Hybrid 3rd-party adapter (BYO external CRM)
Build CuraOS-native CRM (as Option B) **and** expose an integrations-core adapter so a tenant can BYO an external CRM/AML/e-sign provider via config, per [[curaos-local-vs-3rdparty-rule]].
- **Pro:** satisfies the dual local/3rd-party mandate for the *integratable* edges (AML screening, email transport, e-sign provider bridge).
- **Con:** not a CRM-strategy alternative on its own; it is the **adapter layer that complements B**, not a substitute. The external CRM itself stays BYO-via-adapter, never bundled.

---

## 3. Recommended option

**Option B as the core strategy, with Option C's adapter posture layered on the integratable edges.**

Rationale: A is license-fatal and charter-breaking. B is the only path that is simultaneously license-clean, DRY, generator-first, air-gap-safe, and person-centric. C is not a standalone CRM but is *required* by [[curaos-local-vs-3rdparty-rule]] for the external-facing seams (AML provider, email transport, optional external-CRM sync), so it is adopted **as the adapter layer on top of B**, never as a hosted-CRM substitute.

### D1 - Sources are reference-only, facts-level, clean-room
Reaffirm ADR-0205: **never copy or link** EspoCRM/SuiteCRM (or Odoo LGPL / Dolibarr GPL / ERPNext GPL) code. Mine only **data-model field-sets, enums, state machines, and validation rules as facts** and re-implement fresh in TypeSpec/TS. `legal_review=true` is recorded on every CRM mining unit in the reuse ledger; each PR documents the fact-level-vs-code clean-room boundary.

### D2 - Generator-first, contract-first (no per-service hand-build)
Every new entity enters as a TypeSpec `.tsp` contract and is emitted via `@curaos/codegen` 3-layer emit (DTO/controller/SDK/Helm/gateway-route/ai-mirror docs). Lead, Pipeline/Stage/LostReason, Case, and the entire insurance policy domain land through the generator. Any edge case (term pro-rata, beneficiary-sum-100%, commission split/override, premium recurrence) folds back into generator validators + snapshot tests per [[curaos-generator-evolution-rule]] - no local hot-fix.

### D3 - Land on existing owners; add exactly one net-new neutral service
- **Lead + convert + managed pipeline/stage/lost-reason + probability-on-stage** -> extend `crm-core-service` (`crm.tsp`). Source facts: Espo `Lead.json` + `Probability.php` hook, Odoo `crm_lead.py` (`stage_id`/`lost_reason`/`expected_revenue`), Odoo `crm.stage`/`crm.team`/`crm.lost.reason`.
- **Account/Contact enrichment** (multi-method email/phone/address, hierarchy, member roster, `originalLead` backref) -> `crm-core-service` + `personal-crm-service`, **delegating identity to `party-core-service`** (no person duplication).
- **Cases / support tickets** (case_number, status/priority, SLA, business-hours, escalation, KB suggestion) -> build out **`business-cases-service`** from contract via the `service-business` codegen template. Source facts: SuiteCRM `Cases/vardefs.php` + `AOBH_BusinessHours` + Espo `Case.json`.
- **Activity timeline** (tasks/calls/meetings/notes) -> **do not create new activity entities**; add a generic `relatesTo(entityType,id)` field to `tasks-sdk` + `calendar-sdk` and a CRM timeline read op ([[curaos-reuse-dry-rule]]).
- **Inbound email sync** -> run-as-background-service IMAP poller emitting `email-received` AsyncAPI events; outbound stays on `notify-sdk`.
- **Quotes/proposals** -> `sales-core-service` (link to opportunity + product catalog, approval state, person-accept action).
- **Insurance policy domain (NET-NEW):** one neutral **`policy-core-service`** + **`insurance-sdk`**, generator-emitted, owning `Policy`, `CoverageLine`, `PolicyTerm`, `Endorsement`, `Beneficiary`, with `Carrier`/`Producer`/`Beneficiary`/`Claimant` registered as **party-core roles** (not new identity entities). Source facts: SuiteCRM `AOS_Contracts` + `AOS_Line_Item_Groups` (data shape) + Dolibarr `contrat`/`contratligne` (lifecycle).
- **Premium schedules/installments** -> `policy-core-service` schedule generator posting AR to `accounting-core-service` (double-entry), reusing the local `recurrence` package.
- **Commission engine (split/override/clawback)** -> promote the `sales-core-service` commission **stub** into the rule/split/override engine; post payouts as `accounting-core` journal entries. **Money path** - all edges in generator validators + snapshot tests.
- **Insurance claim (FNOL)** -> build on the `business-cases-service` lifecycle spine (NOT `healthstack-billing-service` EDI, which is the wrong subdomain); FNOL is a `workflow-core` BPM journey.
- **KYC/AML** -> assemble from `identity-service` + `documents-core` + `workflow-core` + audit; AML screening sits behind an `integrations-core` **3rd-party adapter** (D5).
- **E-sign for applications/policies/endorsements** -> consume `esign-core-service` via SDK (already stronger-than-source); add insurance envelope templates only, no core change.

### D4 - EspoCRM custom-entity pattern: design reference, not runtime engine
EspoCRM's `EntityManager` creates entities at runtime (dynamic tables). CuraOS expresses the **same capability** (tenant-defined custom entities/fields for broker-specific records) through the **contract-first codegen + builder** path ([ADR-0121b](0121b-foundation-apps.md), [ADR-0123](0123-foundation-codegen-plugin.md)): tenant-authored entities route through `@curaos/contracts` generation and the app/site builder, not a dynamic ORM table engine. This keeps every entity contract-versioned, migration-backed, and air-gap reproducible. The Espo Formula engine + hooks are referenced as facts for the automation/validation layer (workflow-core + builder), not ported.

### D5 - Local + 3rd-party on every integratable edge ([[curaos-local-vs-3rdparty-rule]])
- **CRM/policy data plane:** CuraOS-native (default for SaaS/on-prem/air-gap).
- **AML/KYC screening:** local document checklist + `integrations-core` adapter for BYO AML provider (fail-safe).
- **Email transport:** local Postfix/Haraka inbound poller + outbound via `notify-sdk`, OR BYO SendGrid/SES.
- **E-sign:** local `esign-core` OR BYO DocuSign/HelloSign bridge (already present).
- **External CRM:** never bundled; tenant may BYO-sync via an `integrations-core` adapter.

### D6 - Person-centric dual surface, no feature loss (binding lens)
Every mined capability yields a person-facing surface AND a management surface over the **same contract**:
- **Lead** -> person self-service intake form they can see/correct (data-subject visibility); management gets pipeline/source/qualification/dedup-on-convert.
- **Opportunity/quote** -> "options the person is deciding on"; person-accept advances stage and (within limits) collapses rep approval; auto-derived probability/forecast serves management without the person touching internal stages.
- **Policy** -> "my coverage / who I'm protecting / next payment / autopay"; management gets full lifecycle, endorsements, AR aging, carrier remittance.
- **Commission** -> producer-as-person earnings statement; agency keeps full rule/split/override control.
- **Claim** -> claimant guided FNOL + status tracking; broker gets the worklist + reserves.
- **KYC** -> person does one guided verify-once-reuse-everywhere; compliance keeps the full audit/re-verify dashboard.
`no_loss_check` is recorded per feature in `source-to-local-map.json`: every source business/management/compliance field (status, lost_reason, probability, case SLA, premium frequency, split %, override cascade, clawback, claim reserves, AML evidence) is preserved or filed-forward; simplification = re-sequencing + defaults + automation, never capability removal.

### D7 - Demo/runtime data is database-backed ([[curaos-demo-sample-data-rule]])
All demo leads/cases/policies/installments/claims are real records seeded via `gen:service-seed` into the backing DB. No frontend/API mocks as the demo data plane (mocks allowed only for unit tests + CI e2e).

---

## 4. Source evidence (cloned external sources + indices)

EspoCRM (GPL/AGPL - facts only):
- `external-sources/crm-insurance-broker/espocrm/application/Espo/Modules/Crm/Resources/metadata/entityDefs/Lead.json` (source/status/originalLead backref)
- `.../entityDefs/Account.json`, `.../entityDefs/Contact.json`, `.../entityDefs/Case.json`, `.../entityDefs/Opportunity.json`, `.../entityDefs/InboundEmail.json`, `.../entityDefs/Task.json`, `.../entityDefs/Meeting.json`
- `.../Espo/Modules/Crm/Hooks/Opportunity/Probability.php`, `.../AmountWeightedConverted.php` (probability-on-stage facts)
- `.../Espo/Tools/EntityManager/EntityManager.php`, `.../Params.php`, `.../CreateParams.php` (custom-entity pattern - design reference, D4)
- `.../Espo/Core/Formula/Manager.php`, `.../Espo/Core/AclManager.php` (formula/ACL pattern facts)

SuiteCRM (AGPL - reject + facts only):
- `external-sources/crm-insurance-broker/suitecrm/public/legacy/modules/Leads/vardefs.php`
- `.../modules/Accounts/vardefs.php`, `.../modules/Contacts/vardefs.php`, `.../modules/Opportunities/vardefs.php`
- `.../modules/AOS_Quotes/vardefs.php`, `.../modules/AOS_Products_Quotes/AOS_Products_Quotes.php`, `.../modules/AOS_Invoices/`
- `.../modules/AOS_Contracts/vardefs.php`, `.../modules/AOS_Line_Item_Groups/` (insurance-policy data shape)
- `.../modules/Cases/vardefs.php`, `.../modules/AOBH_BusinessHours/` (case SLA + business hours)
- `.../modules/InboundEmail/InboundEmail.php` (IMAP), `.../modules/AOR_Reports/` (report-definition reference), `.../modules/AOW_WorkFlow/` (workflow reference)

Cross-reference sources:
- Odoo (LGPL - facts only): `external-sources/erp-business/odoo/addons/crm/models/crm_lead.py` (stage/probability/expected_revenue/lost_reason)
- Dolibarr (GPL - facts only): `external-sources/erp-business/dolibarr/htdocs/contrat/class/contrat.class.php`, `.../contratligne.class.php`, `.../societe/class/societe.class.php`, commissions lang
- OpenEMR (GPL - facts only): `external-sources/healthcare/openemr/src/Billing/Claim.php` (claim status model - reference for broker claim, kept separate from EDI)

Indices:
- `generated-analysis/source-feature-index.json` - SuiteCRM + EspoCRM CRM feature rows (Contact/Account/Opportunity/Quotes/Cases/Activities/Email/AOW/AOR/Studio/RBAC/Audit; EspoCRM EntityManager + Formula + Hooks + custom-entity rows), all `lic: agpl`/`gpl`, `reuse_signal: high/medium`.
- `generated-analysis/source-license-rollup.json`, `license-risk-register.json` - EspoCRM=reference-only, SuiteCRM=reference-only/reject.
- `code-reuse-ledger.json` (`authored_ledger`) - EspoCRM = mode **G pattern-reference-only (data model facts)**, `legal_review=true`; SuiteCRM = mode **H reject (as dependency) + G pattern-reference-only**, `legal_review=true`. Ledger `_computed.mode_distribution`: G:51, E:99, D:4, C:3, H:6.

---

## 5. Local evidence (inventory + mappings)

- `local-project-inventory.json` - maturities: `party-core-service`=real-working, `personal-crm-service`=real-working (stronger-than-source), `crm-core-service`=partial, `sales-core-service`=partial, `accounting-core-service`=partial, `business-cases-service`=scaffold-only, `esign-core-service`=real-working (stronger-than-source), `policy` package=scaffold-only ("clean slate"), `@curaos/codegen`=strong.
- `source-to-local-map.json` (`domain="crm-sales"`, 13 mappings) - Lead=absent/port-adapt/contract-typespec; Account=partial; Opportunity=present-weak; Pipelines=stub; Cases=stub; Activities=stub/api-adapter; Email-sync=absent/run-as-background-service; plus enrichment + gaps blocks (Lead convert, managed pipeline, cases full build, activity timeline, inbound email).
- `source-to-local-map.json` (`domain="insurance-broker"`, 15 mappings) - Policies/Coverage-lines/Endorsements=absent; Premium-schedules/Carriers/Beneficiaries/Brokers/Hierarchy=present-weak; Commissions/Claims=stub; KYC=present-weak; Quotes/E-sign=partial/stronger-than-source. Five gap blocks: policy lifecycle core, premium billing, commission engine, broker claim, KYC/AML.
- `gap-analysis.json` - `maturity_distribution`: present-strong 34, absent 36, stub 24, present-weak 21, partial 34, stronger-than-source 14; `absent_or_weak_count`=81. Insurance-broker domain entirely net-new.
- `data-model-crosswalk.json`, `ui-visual-inventory.json`, `workflow-map.json` - source field-sets, org-centric screens (to be re-centered), and AOW/Odoo flow defs used as fact references for the re-centered person journeys.

---

## 6. Consequences

- **Positive:** license-clean, charter-aligned, DRY (extends owners), generator-first (one mold change emits all three layers + overlay), person-centric dual surfaces, air-gap reproducible, demo data real.
- **Net-new build:** one neutral `policy-core-service` + `insurance-sdk`; build-out of `business-cases-service`; promotion of `sales-core` commission stub; enrichment of `crm-core`. All via the generator, not hand-built.
- **Generator extension:** the insurance domain forces new validators (term pro-rata, beneficiary-sum, commission split/override/clawback, premium recurrence) into `@curaos/codegen` - a deliberate, reusable mold investment.
- **Naming:** the existing `policy` security package keeps its name; the insurance owner is `policy-core-service` (service, distinct kind/path) - no collision, but call it out in the module AGENTS.md to avoid agent confusion.
- **Triplet discipline ([[curaos-triplet-split-rule]]):** `personal-*`/`business-*` insurance variants are created only where a divergent subject-owner + downstream consumer is named (e.g. producer-as-person earnings vs agency rule control); otherwise the neutral `*-core-service` carries the spine. No blanket triplet scaffolding.
- **Rolling-update ([[curaos-rolling-update-rule]]):** no `-v2`/parallel CRM path; capability lands by forward migration of `crm-core`/`sales-core` contracts + feature flags, not a fork.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| AGPL/GPL contamination from over-close porting | High (legal-fatal) | Facts-only clean-room; `legal_review=true` per unit; PR documents fact-vs-code boundary; never copy a vardef/entityDef file. |
| Commission/premium money-path defects (split/override/clawback, pro-rata) | High | Generator validators + snapshot tests; double-entry posting to accounting-core; reconciliation reports. |
| Duplicating identity (carrier/producer/beneficiary as new entities) | Medium | Register as party-core roles on the existing party graph; no new identity tables. |
| Custom-entity demand pulling toward a dynamic runtime ORM (Espo-style) | Medium | D4: contract-first codegen + builder only; reject dynamic-table engine to preserve versioning + air-gap. |
| Broker claim conflated with healthcare EDI claims | Medium | Build on `business-cases-service` spine; keep strictly separate from `healthstack-billing-service`/X12. |
| Person-centric re-centering silently dropping a management/compliance field | Medium (lens-fatal) | `no_loss_check` per feature; management surface mandatory alongside person surface. |
| `policy` package name collision causing wrong-owner edits | Low | Document the security-`policy`-package vs `policy-core-service` distinction in AGENTS.md. |

---

## 8. License implications

- **EspoCRM:** GPL-3.0 (some AGPL-3.0) -> **reference-only**. Mine field-sets/hooks/custom-entity pattern as facts; re-implement fresh. Obligations: never copy/link; document fact-level boundary; legal-review (esp. AGPL modules).
- **SuiteCRM / suitecrm-core:** AGPL-3.0 -> **reject as dependency + reference-only facts**. AGPL network-use copyleft is incompatible with self-hosted multi-tenant SaaS (charter §4). Obligations: never copy/link any SuiteCRM code; AOS_Contracts/AOR/Cases/business-hours/broker-hierarchy used only as re-implemented data shapes.
- **Cross-ref:** Odoo LGPL-3.0 (don't copy files; port models fresh), Dolibarr GPL-3.0 (facts only), OpenEMR GPL-3.0 (claim status as facts; X12/standards segments re-implementable as ANSI/government standards).
- Standards-defined structures (where applicable) are not copyrightable and may be re-implemented; product-specific code is not.
- Recorded against ADR-0205's reject table and the license register; consistent (rule>ADR precedence preserved; [[curaos-local-vs-3rdparty-rule]] honored on integratable edges).

---

## 9. Validation needed

1. **Legal sign-off** that fact-level mining + clean-room re-implementation of EspoCRM/SuiteCRM/Odoo/Dolibarr data shapes carries no GPL/AGPL/LGPL obligation (per-unit `legal_review=true`).
2. **Contract review** of the insurance `.tsp` set (Policy/CoverageLine/PolicyTerm/Endorsement/Beneficiary/Carrier-ref/Commission/Claim/KYC) before generator emit.
3. **Generator snapshot tests** green for the new validators (term pro-rata, beneficiary-sum-100%, commission split/override/clawback, premium recurrence) - money path.
4. **No-loss audit:** every source field in `data-model-crosswalk.json` for in-scope features is preserved in the new contracts or filed-forward (`no_loss_check` reconciliation).
5. **Person-centric dual-surface check:** each capability ships both a person surface and a management surface over the same contract (lens compliance).
6. **Demo-data check:** seeded leads/cases/policies/installments/claims are real DB records via `gen:service-seed`, no runtime mocks ([[curaos-demo-sample-data-rule]]).
7. **DRY check:** no duplicate identity/activity/audit/e-sign owners introduced (party-core/tasks-sdk/calendar-sdk/audit-core/esign-core reused).
8. **Triplet check:** personal/business variants only where a divergent subject-owner is named.

---

## 10. Implementation follow-up (XSRC backlog epic)

Land under the XSRC mining-to-build backlog epic **`XSRC-EPIC`** (source: `license-risk-register.json.generated_for`, `code-reuse-ledger.json.generated_for`). File as version-gated Stories under [[curaos-version-planning-rule]]; insurance-broker is **net-new** -> file as **v1.1 / v2** Target Version unless explicitly pulled into the v1 working set. Create local issues per [issue-tracker](../../../../docs/agents/issue-tracker.md) as children of the XSRC epic:

1. **`crm-core` Lead + convert + managed pipeline/stage/lost-reason** (extend `crm.tsp`; regen; convert flow dedups against party-core; emit `lead.converted`; migration + real seed; wire personal-crm self-intake). *Story, generator-first.*
2. **`crm-core`/`personal-crm` Account/Contact enrichment** (multi-method contact info, hierarchy, member roster, originalLead backref; identity delegated to party-core).
3. **`business-cases-service` full build from `cases.tsp`** via `service-business` template (case_number/status/priority/SLA/business-hours/escalation/KB; person "my cases" read).
4. **Activity timeline** via `relatesTo` on `tasks-sdk` + `calendar-sdk` + CRM timeline read (no new activity entity).
5. **Inbound email sync** background-service IMAP poller + `email-received` AsyncAPI event + auto-link to contact/case.
6. **`policy-core-service` + `insurance-sdk` (NET-NEW)** generator emit: Policy/CoverageLine/PolicyTerm/Endorsement/Beneficiary + lifecycle state-machine + validators; party-core role registration; AsyncAPI `...policy.bound/renewed/endorsed/lapsed`. *Epic-sized; generator extension first.*
7. **Premium schedules/installments** -> policy-core schedule generator posting AR to accounting-core; delinquency + cancel-for-nonpay + autopay; carrier-remittance reconciliation.
8. **Commission engine** -> promote `sales-core` stub to split/override/clawback rule engine; payouts as accounting-core journals; producer earnings statement. *Money path - validators + snapshot tests.*
9. **Insurance claim (FNOL)** on `business-cases-service` spine + `workflow-core` journey (separate from EDI).
10. **KYC/AML** assembled flow (identity + documents-core + workflow-core + audit) with `integrations-core` AML adapter (3rd-party, fail-safe) per [[curaos-local-vs-3rdparty-rule]].
11. **Generator extension (parent of 1/3/6/7/8)** - fold all CRM/insurance edge cases into `@curaos/codegen` templates/emitters/validators + snapshot tests ([[curaos-generator-evolution-rule]]); barrier-aware (no downstream worker dispatch while a codegen/`@curaos/*-sdk`/`@curaos/contracts` lane is `agent-claimed`/`agent-PR-open`).

Each Story carries `Target Version`; insurance-broker net-new work files forward (never dropped, never crammed into v1) per [[curaos-version-planning-rule]].