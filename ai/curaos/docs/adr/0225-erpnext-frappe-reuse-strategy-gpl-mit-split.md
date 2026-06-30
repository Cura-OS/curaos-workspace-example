# ADR-0225: ERPNext/Frappe reuse strategy (GPL/MIT split)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** proposed
**Date:** 2026-06-29
**Phase:** 12 (XSRC source-mining ADR set)
**Lens (binding):** person-centric, no-feature-loss  -  see `.ai-analysis/PERSON-CENTRIC-LENS.md`
**Parent ADRs (baseline canonical):**
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0101 Data](0101-data-layer.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0159 Pricing/Packaging](0159-pricing-packaging-strategy.md)
- [ADR-0202 Commerce/Sales/Procurement/Inventory cluster](0202-cluster-commerce-sales-procurement-inventory.md)  -  Medusa.js v2 (MIT) commerce-core precedent
- [ADR-0205 Accounting cluster] (referenced from 0202; double-entry owner)

**Governing rules (precedence #1 over this ADR):**
- [[curaos-local-vs-3rdparty-rule]]  -  adopt/port/reference decision + dual-option spirit
- [[curaos-generator-evolution-rule]]  -  every reuse lands generator-first, never per-service hand-edit
- [[curaos-reuse-dry-rule]]  -  one canonical owner per capability
- [[curaos-version-planning-rule]]  -  Target Version gate; future work filed forward
- [[curaos-rolling-update-rule]]  -  forward migration, no `-v2` parallel paths

> Rule > ADR precedence (workspace AGENTS.md §13b): if any rule above locks an answer, the rule wins and this ADR is the rationale record, not the decision authority.

---

## 1. Context

The XSRC source-mining epic cloned 39 OSS systems into `external-sources/` and indexed them (Phase 3 → `.ai-analysis/generated-analysis/`). Two of those systems form a single stack and demand one coherent reuse decision because their **licenses split**:

- **Frappe**  -  the metadata/doctype framework, ORM, REST layer, report builder, AutoRepeat scheduler. License **MIT** (`.ai-analysis/license-risk-register.json`: `spdx: MIT`, `class: permissive`, `verdict: safe-to-vendor-or-copy`, obligations: attribution + NOTICE).
- **ERPNext**  -  the business application built on Frappe (accounting, selling, buying, stock, HR, projects, assets, subscriptions). License **GPL-3.0-only** (`license-risk-register.json`: `class: gpl`, `verdict: port-adapt-or-service-boundary`, obligations: "copyleft; whole-work GPL on distribution; no copy into permissive/proprietary").

This matters because CuraOS ships **self-hosted, multi-deployment, and commercially packaged** artifacts (Charter §3; ADR-0159 pricing). Copying GPL-3.0 ERPNext code into our distributed binaries would impose whole-work copyleft  -  incompatible with the packaging model. Frappe's MIT layer carries no such obligation. A naive "reuse ERPNext" decision would either contaminate the build or leave the MIT framework value on the table.

ERPNext is also the **single richest ERP-domain source** in the corpus:

- ERP taxonomy coverage: **ERPNext 28** leaves vs Odoo 17, Dolibarr 14, Frappe 6 (`source-taxonomy-coverage.json`).
- **36 ERPNext-touching mappings** across erp-finance, erp-trade-supply, erp-delivery-people, contracts-recurring, insurance-broker, platform-cross domains (`source-to-local-map.json`).
- **14 UI screens** and **32 workflow references** carry ERPNext evidence (`ui-visual-inventory.json`, `workflow-map.json`).

The mining lens is binding and dominant: mine ERPNext **for completeness** (feature set, data models, business rules, state machines, compliance/validation), then **re-center every flow on the person** (`PERSON-CENTRIC-LENS.md` §12). ERPNext's UX is org-first/back-office; we take its capability, not its navigation.

CuraOS already owns the ERP spine first-party, so this is mostly a **fill-the-gaps + harden** decision, not a "build ERP" decision (`local-project-inventory.json`):

| Local module | Maturity | ERPNext role |
|---|---|---|
| `commerce-core-service` | real-working (Medusa v2, MIT  -  ADR-0202) | catalog/cart/pricing already owned |
| `accounting-core-service` | partial | GL, COA, tax, bank-rec, multi-currency target |
| `sales-core-service` | partial | AR, sales order, quotation target |
| `procurement-core-service` | partial | AP, PO, 3-way-match target |
| `inventory-core-service` | partial | stock ledger (already event-sourced) |
| `hr-core-service` | partial | leave/accrual, timesheets target |
| `donation-core-service` | partial | recurring/AutoRepeat cadence (local already cleaner) |
| `fleet-core-service` | real-working | fixed-asset + depreciation target |
| `reports-service` | real-working | self-serve report builder target |

---

## 2. Decision options

### Option A  -  Treat the whole stack as GPL: reference-only, no reuse

Quarantine both ERPNext and Frappe behind a reference-only wall; copy nothing; rebuild every ERP capability clean-room from scratch.

- Pro: zero license risk; trivially defensible.
- Con: discards the MIT Frappe value the register explicitly marks `safe-to-vendor-or-copy`; wastes the richest ERP map in the corpus (36 mappings, mode-E dominant); slowest path to no-feature-loss parity. Over-conservative and contradicts [[curaos-local-vs-3rdparty-rule]]'s adopt-permissive bias.

### Option B  -  Run ERPNext as a sidecar service (service boundary)

Deploy ERPNext as a separate GPL process; integrate over its REST API; never link or copy code.

- Pro: GPL boundary respected via process isolation; full ERPNext feature set available immediately.
- Con: a second runtime (Python/Frappe + MariaDB) violates the single-stack discipline (TypeScript/NestJS/Postgres  -  `local-project-inventory.json` stack; ADR-0100); duplicates the ERP spine CuraOS already owns (reverse of [[curaos-reuse-dry-rule]]); org-first UX cannot be re-centered on the person (lens §2 violated); air-gap/single-binary packaging (ADR-0164 Zarf, bun-compile) breaks. Reuse ledger marks ERPNext modes as E/G, never C (run-as-service): `code-reuse-ledger.json._computed.mode_distribution` shows no `C` entry for any ERPNext mapping.

### Option C  -  License-split reuse (RECOMMENDED): Frappe MIT vendor/port-adapt; ERPNext GPL clean-room port-adapt of standards-and-semantics only, generator-first

Two tracks keyed to the license split:

1. **Frappe (MIT)**  -  vendor or copy with attribution + NOTICE where a Frappe primitive is genuinely the best fit (e.g. AutoRepeat cadence semantics, report-builder schema model). Subject to the lazy ladder: prefer the already-installed equivalent first; local `donation-core` recurrence is already cleaner, so even MIT code is referenced, not lifted, where we already have it.
2. **ERPNext (GPL-3.0)**  -  **never copy code into the distributed build.** Port-adapt the **non-copyrightable + behavioral** layer: data-model field semantics, document state machines, posting/validation rules, and ANSI/standards layouts (X12 5010, tax computation). Re-express clean-room in TypeSpec contracts → `@curaos/*-sdk` → `emitServiceLive` scaffolds, per [[curaos-generator-evolution-rule]]. ERPNext stays a **pattern/reference** source for code; only the spec/behavior crosses the boundary.

Every crossing is dual-surfaced (person + management) on one contract per the binding lens; every gap files generator-first against `contract-typespec`.

- Pro: respects the GPL/MIT split exactly as the register verdicts demand; keeps one stack; maximizes mined completeness without contamination; aligns with the Medusa-MIT precedent (ADR-0202) and the codegen mold (ADR-0123); no-feature-loss preserved.
- Con: requires per-mapping legal discipline (is this expression or fact?); clean-room re-expression is more work than copy; needs a documented boundary audit.

### Option D  -  Aggressive copy-adapt of ERPNext Python into our codebase

Port ERPNext modules near-verbatim, translating Python→TypeScript.

- Pro: fastest raw feature transfer.
- Con: a line-by-line translation of GPL code is a derivative work  -  GPL whole-work copyleft attaches to the distributed CuraOS build. Direct violation of the register verdict and the packaging model. Rejected on legal grounds.

---

## 3. Source evidence (cited)

License verdicts  -  `.ai-analysis/license-risk-register.json` and `generated-analysis/source-license-rollup.json`:

- `Frappe`: `spdx: MIT` · `class: permissive` · `verdict: safe-to-vendor-or-copy` / `copy-verbatim-ok-with-attribution`.
- `erpnext`: `spdx: GPL-3.0-only` · `class: gpl` · `verdict: port-adapt-or-service-boundary; no copy into permissive/proprietary build; copyleft`. ERPNext is in `source-license-rollup.json.copy_constrained`.

Coverage  -  `generated-analysis/source-taxonomy-coverage.json`: ERP domain leaders `erpnext: 28`, `odoo: 17`, `dolibarr: 14`, `Frappe: 6`.

Feature evidence  -  `generated-analysis/source-feature-index.json` (609 features; 28 ERPNext leaves), e.g.:

- `erp.accounting.general-ledger`  -  `controllers/accounts_controller.py`, `accounts/doctype/gl_entry/gl_entry.json`, `accounts/doctype/account/account.json`; evidence: "GL Entry, Account, Journal Entry doctypes … accounts_controller.py implements GL posting logic."
- `erp.accounting.accounts-receivable`  -  `accounts/doctype/sales_invoice/sales_invoice.json`, `selling/doctype/customer/customer.json`; doc_events on Sales Invoice (on_submit/on_cancel/on_trash).
- `erp.trade.sales`  -  `selling/doctype/sales_order/sales_order.{json,py}`; `make_sales_invoice` / `make_delivery_note` methods, 23 selling reports.
- `erp.accounting.payments`  -  `accounts/doctype/payment_entry/payment_entry.json`, `bank_transaction/bank_transaction.json`; bank-reconciliation doctypes.

Reuse modes  -  `.ai-analysis/code-reuse-ledger.json` (`_computed.mode_distribution`: E port-adapt 99, G pattern-reference-only 51, D api-adapter 4, C run-as-background-service 3, H reject 6). ERPNext-touching entries are **E/G/H only  -  no C** (no run-as-service), e.g.:
- `erp-trade-supply / Pricing Rules & Discounts` → mode E: "pricing_rule.py logic (apply_pricing_rule, qty/amount conditions) is the most reusable spec; port the rule-evaluation algorithm as original TS, no copy."
- `contracts-recurring / Generic recurring-document AutoRepeat` → mode E, license note: "GPL (frappe AutoRepeat) … local recurrence.ts is already a cleaner equivalent. No code lifted."
- `erp-trade-supply / Manufacturing` and `BOM` → mode H reject (out of v1 scope).

X12 standards carve-out  -  `gap-analysis.json` (`x12-revenue-cycle` gap): "X12 5010 segment layout is an ANSI standard (not copyrightable); port-adapt the LOGIC, write fresh TS. Do NOT copy OpenEMR PHP verbatim." Same principle applies to ERPNext GPL: standards and facts are portable, expression is not.

UI/workflow evidence  -  `ui-visual-inventory.json` (14 ERPNext screen references) and `workflow-map.json` (32 ERPNext workflow references); the lens requires these org-first screens be re-centered, not copied.

---

## 4. Local evidence (cited)

`.ai-analysis/local-project-inventory.json`:
- Stack: TypeScript 5.9 / NestJS 11 / Bun / PostgreSQL (CNPG); ORM tiers include "MikroORM (Medusa v2 commerce tier)"  -  single-stack discipline rules out a Frappe/Python sidecar (Option B).
- `commerce-core-service` real-working on Medusa v2 (MIT)  -  the precedent that permissive engines are adopted, GPL ones are not (ADR-0202 §2.1).
- ERP cores `accounting/sales/procurement/inventory/hr/crm/donation` are `partial`; `fleet/reports/tasks/commerce` are `real-working`. The spine exists; ERPNext fills gaps, it does not seed greenfield.

`.ai-analysis/source-to-local-map.json`  -  36 ERPNext mappings: integration_mode 24 port-adapt / 9 pattern-reference-only / 3 reject; **27 of 36 target `generator_first_target: contract-typespec`** (plus 1 codegen-emitter, 1 codegen-template, 1 asyncapi-event, 6 na). local_maturity across them: 10 present-strong, 9 partial, 7 present-weak, 2 stub, 8 absent. Person-centric fields are populated per mapping, e.g. `erp.accounting.general-ledger`:
- `person_centric_reshape`: patient/customer sees a derived "my money" statement from an actor-scoped ledger projection, never the raw chart of accounts.
- `management_surface`: accountant trial-balance, journal browser, posting-rule editor, audit-chain verifier.
- `no_loss_check`: double-entry/COA/journals/posting/trial-balance all present locally; analytic/cost-center tagging filed as gap. No GL capability dropped.

`.ai-analysis/data-model-crosswalk.json` carries the neutral entity targets; `gap-analysis.json` flags the high-value absent items behind ERPNext maps: charge master / fee schedule, subscriptions & recurring billing, contract/service-agreement, fixed-asset depreciation, tax engine (`@curaos/tax-engine` ABSENT), currency (`@curaos/currency` ABSENT).

---

## 5. Recommended option

**Option C  -  license-split reuse, generator-first.**

Decision rules (binding for every ERPNext/Frappe mapping):

1. **Frappe (MIT):** vendor/copy permitted with attribution + NOTICE, but only after the lazy ladder clears (does it already exist locally? is a one-liner enough?). Default to reference where CuraOS already owns the equivalent (recurrence, reports).
2. **ERPNext (GPL-3.0): no code in the distributed build, ever.** Permitted crossings from ERPNext:
   - **Facts & standards** (not copyrightable): X12/EDI layouts, tax formulas, accounting identities, field name vocabularies.
   - **Behavioral semantics** re-expressed clean-room: document state machines, posting/validation rules, billing-period rollover, accrual math.
   - Authored as **TypeSpec contracts** in the target service `specs/<svc>.tsp` → `@curaos/*-sdk` regen → `emitServiceLive` scaffold → `emitUiApp` dual-surface wiring. Reusable primitives fold into `tools/codegen`, never per-service hand-edits ([[curaos-generator-evolution-rule]]).
3. **ERPNext code = reference only** for the engineer authoring the contract; the engineer reads ERPNext to understand the rule, then writes original TypeScript/TypeSpec. Clean-room note recorded per mapping (already present in the maps as `license_status`).
4. **Mode H (reject)** stands for `Manufacturing` and `BOM` in v1  -  out of working set, filed forward ([[curaos-version-planning-rule]]); not dropped.
5. **Re-center, never re-skin.** Every ported capability emits both a person surface and a management surface on the same contract (lens §3); ERPNext's org-first screens are reference for completeness, not the experience.

This is the only option that simultaneously honors the register's split verdict, the single-stack discipline, the no-feature-loss constraint, and the generator-first mold.

---

## 6. Consequences

**Positive:**
- Richest ERP map in the corpus becomes usable without copyleft contamination.
- Frappe MIT value (attribution-only) is available where it genuinely wins.
- All reuse routes through the codegen mold, so coverage is checklist-verifiable and trio/overlay symmetry is enforced by the generator (ADR-0123, [[curaos-generator-evolution-rule]]).
- Single stack and air-gap/single-binary packaging preserved (no Python sidecar).
- Dual person/management surfaces per the binding lens.

**Negative / cost:**
- Every ERPNext mapping needs an expression-vs-fact judgment recorded; slower than copy.
- Clean-room re-expression of complex rules (tax, accrual, X12) is real engineering, tracked as generator-first gaps.
- New shared packages required and currently ABSENT: `@curaos/tax-engine`, `@curaos/currency`, `@curaos/x12-sdk` (gap-analysis)  -  each a contract-first SDK before its consumers.

**Neutral:**
- ERPNext stays cloned under `external-sources/` strictly as reference; never a build dependency, never vendored.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Inadvertent GPL derivative via near-verbatim Python→TS translation | High | Clean-room discipline: author reads rule, writes original TS; per-mapping clean-room note; boundary audit (§9) before any merge touching an ERPNext-sourced contract |
| "Fact vs expression" misjudgment on a borderline rule | Medium | Default to clean-room re-expression; escalate borderline cases to legal-review per [[curaos-no-silent-block-rule]] rather than guessing |
| Frappe MIT code copied without NOTICE/attribution | Medium | NOTICE retention check in CI; prefer reference over copy when local equivalent exists |
| Per-service hand-edits bypassing the generator (mold left defective) | High | [[curaos-generator-evolution-rule]] barrier: edge cases fold into `tools/codegen` / `@curaos/*-sdk` / `@curaos/contracts`; per-service fix is last-resort with documented proof |
| Scope creep into rejected modules (Manufacturing/BOM) | Low | Mode-H stands; file forward under [[curaos-version-planning-rule]]; do not pull into v1 working set |
| Org-first UX leaking in as the primary experience | Medium | Lens §2/§3 gate: dual-surface emission required; person surface is the spine |

---

## 8. License implications

- **Frappe (MIT):** copy/vendor permitted; **must** retain copyright notice + LICENSE/NOTICE. No copyleft, SaaS-safe, distribution-safe.
- **ERPNext (GPL-3.0-only):** GPL is whole-work copyleft on distribution. **Zero ERPNext source in any distributed CuraOS artifact** (binaries, images, Zarf bundles, SDKs). Permitted: clean-room re-expression of facts/standards/semantics, with ERPNext as a read-only reference. A line-by-line port is a derivative work and is **forbidden** (Option D rejected).
- **Boundary test for every crossing:** "Is this a fact/standard/idea (portable) or a creative expression (not portable)?" When unclear, treat as expression and re-author clean-room.
- Aligns with the corpus-wide convention proven for X12 (ANSI standard portable; OpenEMR PHP not)  -  `gap-analysis.json` `x12-revenue-cycle.license_notes`.
- No conflict with ADR-0159 packaging: GPL stays out of the shipped build by construction.

---

## 9. Validation needed

1. **Boundary audit gate:** a reviewer checklist on every PR introducing an ERPNext-sourced contract  -  confirms (a) no ERPNext code present, (b) clean-room note recorded, (c) fact-vs-expression judgment stated. Add as a `just` recipe under the local-CI-first gate ([[curaos-local-ci-first-rule]]).
2. **NOTICE/attribution check:** CI verifies Frappe attribution wherever MIT code is vendored.
3. **No-feature-loss verification:** for each ported capability, assert the `no_loss_check` from `source-to-local-map.json` holds  -  every source business/management/compliance feature is present on the management surface or filed forward as a gap.
4. **Generator-first conformance:** new entities exist as `specs/<svc>.tsp` → generated SDK → `emitServiceLive` scaffold; no per-service hand-edits (drift test folded into the generator per ADR-0123).
5. **Contract conformance tests** for the high-value ports: tax computation, accrual/balance math, X12 837/835 fixture snapshots (gap-analysis test plans).
6. **Legal sign-off** on the boundary-audit checklist itself before the first ERPNext-sourced contract merges.

---

## 10. Implementation follow-up (XSRC backlog epic)

File under the **XSRC source-mining epic** (`generated_for: "XSRC-EPIC"` across `.ai-analysis/*`) as child issues in `.scratch/state/symphony-work/local-issues.sqlite` (AGENTS.md §10; `docs/agents/issue-tracker.md`). Target Version gate per [[curaos-version-planning-rule]]  -  v1 working set vs filed-forward.

1. **XSRC-ERP-BOUNDARY-AUDIT** (gate, do first): author the boundary-audit checklist + `just` recipe + CI NOTICE check; legal sign-off. Blocks all ERPNext-sourced merges.
2. **XSRC-ERP-FINANCE**: clean-room port-adapt AR (`sales-core`), AP/3-way-match (`procurement-core`), tax engine (`@curaos/tax-engine` NEW), bank-rec + multi-currency (`@curaos/currency` NEW, `accounting-core`). All `contract-typespec`. (9 erp-finance maps.)
3. **XSRC-ERP-TRADE**: sales-order/quotation state machines (`sales-core`), pricing-rules engine (`commerce-core`), pick/pack/ship (`business-shop`), PO lifecycle (`procurement-core`). Mode-E maps; reject Manufacturing/BOM (file forward).
4. **XSRC-ERP-CONTRACTS-RECURRING**: contract/service-agreement + subscriptions/recurring-billing contracts (currently `local_module: absent`); recurrence cadence references local `donation-core` (already cleaner).
5. **XSRC-ERP-PEOPLE**: leave/accrual + timesheets (`hr-core`), fixed-asset depreciation (`fleet-core` + `accounting-core`); payroll filed forward.
6. **XSRC-ERP-PLATFORM**: self-serve report builder (`reports-service`)  -  Frappe report-model schema port-adapt (GPL ERPNext semantics, no PHP).
7. **XSRC-FRAPPE-MIT-INVENTORY**: enumerate Frappe MIT primitives worth vendoring with NOTICE; default to reference where local equivalent exists.

Update `ai/curaos/docs/adr/RESOLUTION-MAP.md` with this ADR's question status (STILL-OPEN until legal sign-off on the boundary-audit gate, then RESOLVED-ADR). Refresh the doc graph (`bun scripts/check-doc-graph.js`) and AI-mirror on add.