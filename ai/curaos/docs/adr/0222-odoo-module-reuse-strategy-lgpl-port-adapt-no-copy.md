# ADR-0222: Odoo module reuse strategy (LGPL, port-adapt, no copy)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Phase:** XSRC Phase 12 (external-source-reuse ADR batch)
**Epic:** XSRC-EPIC (external-source mining; artifacts under `.ai-analysis/`)
**Binding lens:** [`.ai-analysis/PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md) - person-centric, no-feature-loss (user directive, 2026-06-29). Dominant over raw feature parity.
**Governing rules (precedence > this ADR):**
- [[curaos-local-vs-3rdparty-rule]] - local-first / dual-surface
- [[curaos-generator-evolution-rule]] - every edge case feeds the generator
- [[curaos-reuse-dry-rule]] - one canonical owner, port-and-extend
- [[curaos-version-planning-rule]] - Target Version top gate; future work filed forward
- [[curaos-rolling-update-rule]] - forward migration only, no parallel `-v2` paths
**Related ADRs:** ADR-0099 (charter, generic-before-vertical), ADR-0101 (data layer / Drizzle + TypeSpec), ADR-0123 (codegen plugin - the mold), ADR-0159 (subscriptions/recurring billing pricing), ADR-0202 (commerce/sales/procurement/inventory cluster), ADR-0205 (CRM/HR/business cluster)

---

## 1. Status

Proposed. Awaiting user acceptance. This ADR governs how CuraOS reuses Odoo (and, by precedent, every GPL/LGPL-class ERP source: ERPNext GPL-3, Dolibarr GPL-3) during the XSRC external-source mining program. It does not commit dollar figures, deadlines, or new submodules; it sets the legal and engineering reuse mode and routes the work through the generator and the XSRC backlog.

---

## 2. Context

### 2.1 What we mined

Odoo Community Edition is cloned at `external-sources/erp-business/odoo-org/odoo/` (verified). Its `LICENSE` declares **GNU LGPLv3** ("Odoo is published under the GNU LESSER GENERAL PUBLIC LICENSE, Version 3 ... a set of additional permissions on top of the GPL"). The license-risk register classifies it accordingly:

> `.ai-analysis/license-risk-register.json` -> `_computed.register[]`:
> `{ "system": "odoo", "spdx": "LGPL-3", "class": "gpl", "verdict": "port-adapt-or-service-boundary", "obligations": "copyleft; whole-work GPL on distribution; no copy into permissive/proprietary" }`

Odoo sits in the register's `port_adapt_no_copy` bucket alongside `dolibarr`, `erpnext`, `openemr`, and the OpenHospital family. CuraOS services ship OSS (Apache-2.0 / MIT per ADR-0159 §7) plus a managed/commercial plane; pulling LGPL/GPL source into that build would impose copyleft on the whole work. So **verbatim copy is off the table.**

### 2.2 How much of CuraOS Odoo touches

`.ai-analysis/source-to-local-map.json` (163 total mappings across 11 domains) cites Odoo source in **37 mappings**; 21 cite Odoo addon paths directly. The reuse ledger (`.ai-analysis/code-reuse-ledger.json` -> `_computed.full_ledger`) classifies the Odoo-involved features by mode:

| Mode | Letter | Odoo-involved count | Meaning |
|---|---|---|---|
| port-adapt | E | 22 | Re-express the data model + state machine + business rules as original CuraOS code |
| pattern-reference-only | G | 13 | Read for completeness; local is already first-party or stronger |
| reject | H | 2 | Out of v1 scope (Odoo `mrp` manufacturing, multi-level BOM) |

This mirrors the workspace-wide ledger distribution (`E:port-adapt` 99, `G:pattern-reference-only` 51, `D:api-adapter` 4, `C:run-as-background-service` 3, `H:reject` 6). The dominant Odoo verdict is **port-adapt (E)**: high-value coverage (AR + invoicing, payment terms, tax, bank reconciliation, multi-currency, CRM lead/opportunity/pipeline, sales order, leave accrual, expenses, fixed-asset depreciation, timesheets, project/task) where CuraOS has gaps. `.ai-analysis/gap-analysis.json` confirms the gaps are real: `absent` 36, `stub` 24, `present-weak` 21 (81 absent-or-weak mappings; `absent_weak_count: 81`), while 34 are `present-strong` and 14 are `stronger-than-source`.

### 2.3 Why a dedicated decision

Three failure modes must be ruled out by policy, not left to per-worker judgement:

1. **License contamination** - a worker copies a 84KB `hr_leave.py` accrual routine "to save time," silently copylefting the whole service. (Ledger note on leave: "port accrual + balance math, no verbatim copy (hr_leave.py is 84KB of Odoo-specific logic).")
2. **Org-centric UX leakage** - Odoo's admin/back-office screens become the CuraOS experience, violating the binding person-centric lens.
3. **Per-service hand-port drift** - each worker hand-writes a different Lead/Invoice/Subscription model, defeating [[curaos-reuse-dry-rule]] and [[curaos-generator-evolution-rule]].

### 2.4 What is and is not copyrightable (the legal hinge)

The reuse ledger states the operative principle per feature, e.g. on CRM lead conversion: *"Data model + state machine are facts (not copyrightable); port-adapt the Lead entity + conversion rules in our own TS."* and on opportunity probability: *"port the probability-on-stage-change rule ... Algorithm is a fact."* Facts, field semantics, state-transition graphs, and accrual/tax/depreciation formulae are not protected; the **expression** (the Python/PHP source text) is. Port-adapt re-expresses facts in original TypeSpec + TypeScript; it does not lift expression.

> Legal characterization in this ADR is an engineering policy, not a legal opinion. See §9 Validation - counsel sign-off required before first GA distribution.

---

## 3. Decision Options

### Option A - Copy Odoo modules (vendor source) [REJECTED]

Vendor Odoo addon code into CuraOS services.

- Pro: fastest path to feature coverage.
- Con: LGPLv3/GPL copyleft attaches to the whole work on distribution; breaks the Apache/MIT OSS plane and the managed/commercial plane (ADR-0159 §7). Stack-mismatch: Odoo is Python/ORM; CuraOS is TypeScript/NestJS/Drizzle/TypeSpec (ADR-0101). Verdict in register is explicitly `no copy into permissive/proprietary`. **Disqualified by license.**

### Option B - Run Odoo as a sidecar/service behind an API boundary

Deploy Odoo unmodified; integrate over its JSON-RPC/REST.

- Pro: LGPL obligations stay contained to the separate process; precedent exists (`source-feature-index.json` records Bahmni's `BahmniOdooClient` / `BahmniOdooSessionManager` doing exactly this for inventory). Register lists this as the alternate allowed verdict ("port-adapt-**or-service-boundary**").
- Con: drags a full Python/PostgreSQL ERP into every deployment, including air-gap and home-lab profiles (ADR-0099 §4); its org-centric UX cannot be re-centered on the person (lens violation); a second persistence + server stack violates AGENTS.md §9.9 "one persistence stack and one server/API framework per project." Acceptable only as a narrow, time-boxed migration bridge, never as the v1 data plane.

### Option C - Port-adapt: re-express the model, rules, and workflows as original CuraOS code, generator-first [RECOMMENDED]

Treat Odoo (and ERPNext/Dolibarr) as a **specification corpus**. Mine the data model, state machines, validation, tax/accrual/depreciation formulae, and edge cases; re-express them clean-room in CuraOS's own TypeSpec contracts + Drizzle schema + NestJS services, generated through the codegen mold (ADR-0123), and re-centered on the person per the lens. No source text copied.

- Pro: zero copyleft attachment (only facts/algorithms reused); native stack; satisfies [[curaos-reuse-dry-rule]] (one canonical owner) and [[curaos-generator-evolution-rule]] (the model lands in the generator, not per-service); the lens reshape is applied during porting; matches the dominant ledger verdict (22 of 37 Odoo features = mode E).
- Con: slower than copy; requires disciplined clean-room hygiene and a no-verbatim audit.

### Option D - Reference-only (no port, no run) for the low-value tail

For features where CuraOS is already `present-strong` / `stronger-than-source` (GL posting, chart of accounts, journals, RBAC, notifications, calendar, inventory stock control, BI dashboards), read Odoo only to confirm field coverage; write nothing new.

- This is not a competing option but the **complement** to C: it covers the 13 mode-G Odoo features so we do not re-port what we already own better.

---

## 4. Recommended Option

**Option C (port-adapt, generator-first), with Option D for the mode-G tail and Option B reserved as a narrow time-boxed migration bridge only.**

Concretely, per Odoo-involved feature, the reuse mode is dictated by the ledger's `mode_letter` and the map's `integration_mode`, not by worker discretion:

| Ledger mode | Action | Representative Odoo features (from the 37) |
|---|---|---|
| **E (port-adapt)** | Re-express model + rules in TypeSpec/Drizzle/NestJS via codegen; apply lens reshape; no source copied. | AR invoicing + aging, payment terms, tax computation, bank reconciliation, multi-currency, CRM lead/opportunity/pipeline, sales order lifecycle, leave accrual, expenses, fixed-asset depreciation, timesheets, project/task |
| **G (reference-only)** | Read for completeness; do not write. CuraOS already first-party or stronger. | GL double-entry, chart of accounts, journals, RBAC, notifications, calendar, inventory stock control, BI dashboards, HR directory, procurement RFQ |
| **H (reject)** | Out of v1. File forward per [[curaos-version-planning-rule]]. | manufacturing/production (Odoo `mrp`), multi-level BOM |

### 4.1 Person-centric shaping is mandatory during the port

Every mode-E port carries the lens's five fields from the map and must satisfy `no_loss_check`. Worked example (`source-to-local-map.json`, CRM lead, sources `addons/crm/models/crm_lead.py` + Espo + SuiteCRM):

- `person_centric_reshape`: lead is the front of the **person's** journey, producing one durable party record the person owns, not a rep-owned funnel artifact.
- `management_surface`: business CRM admin keeps pipeline-stage, source attribution, lost-reason, qualification scoring, dedup-on-convert.
- `person_surface`: self-service intake on the personal-crm app, with data-subject visibility/correction.
- `simplification_note`: collapse Odoo's lead-vs-opportunity dual entity into one record with a stage transition; auto-merge on convert (no manual rep merge wizard).
- `no_loss_check`: source, status, lost_reason, probability, expected_revenue, owner, conversion all preserved; unification is re-sequencing, not capability loss.

Subscriptions/recurring billing (mode E, sources include `addons/payment/models/payment_token.py` + ERPNext subscription doctypes) reuses donation-core's proven cadence primitive rather than ERPNext's `process_subscription` cron doctype, and integrates charge-on-file via the existing Stripe/PayPal bridge in commerce-core - **port the facts, reuse our own infra** (see ADR-0159 for the billing/pricing surface).

### 4.2 Generator-first is non-negotiable

Per [[curaos-generator-evolution-rule]]: a ported Odoo model lands as a **codegen template / TypeSpec contract / SDK** in `curaos/tools/codegen/` (ADR-0123), then services are generated/regenerated. The map's `generator_first_target` is `contract-typespec` for the high-value Odoo features and `codegen-emitter` for regional tax/e-invoice localization. Hand-porting into a single service without folding the model back into the mold is forbidden; trio symmetry (core / personal / business + healthstack overlay) is enforced by the generator.

---

## 5. Source Evidence

Cloned source (verified present):

- `external-sources/erp-business/odoo-org/odoo/LICENSE` - declares LGPLv3.
- `external-sources/erp-business/odoo-org/odoo/addons/crm/models/crm_lead.py` - lead/opportunity model + conversion (CRM port).
- `external-sources/erp-business/odoo-org/odoo/addons/account/models/account_payment_term.py` - payment terms (AR port).
- `external-sources/erp-business/odoo-org/odoo/addons/sale/` - sale order lifecycle.
- `external-sources/erp-business/odoo-org/odoo/addons/stock/` - stock/quants/reservations (reference-only; CuraOS already event-sourced).
- `external-sources/erp-business/odoo-org/odoo/addons/hr_expense/` - expense claims (port).
- `external-sources/erp-business/odoo-org/odoo/addons/payment/models/payment_token.py` - recurring charge-on-file (subscriptions port).

Indices:

- `.ai-analysis/source-feature-index.json` - 609 mined features; the cross-system Odoo integration precedent is recorded as *"Odoo ERP Integration (Inventory Stock)"* via Bahmni's `BahmniOdooClient` (service-boundary, Option B precedent).
- `.ai-analysis/source-to-local-map.json` - 37 Odoo-citing mappings (21 with direct addon paths), each carrying `integration_mode`, `generator_first_target`, and the five lens fields.
- `.ai-analysis/code-reuse-ledger.json` -> `_computed.full_ledger` - per-Odoo-feature `mode_letter` (22 E / 13 G / 2 H) and per-feature `license_status` strings asserting "no verbatim copy."

---

## 6. Local Evidence

- `.ai-analysis/license-risk-register.json` - Odoo verdict `port-adapt-or-service-boundary`; bucketed in `_computed.summary.port_adapt_no_copy` with dolibarr, erpnext, openemr, openhospital-*, openmrs-*.
- `.ai-analysis/local-project-inventory.json` - 167 local modules already exist; the Odoo-targeted local owners are first-party (`accounting-core-service`, `sales-core-service`, `commerce-core-service`, `crm-core-service`, `procurement-core-service`, `inventory-core-service`, `hr-core-service`, `tasks-core-service`, `fleet-core-service`, `reports-service`, plus `personal-*` variants). Port-adapt extends these owners; it does not create parallel modules ([[curaos-rolling-update-rule]]).
- `.ai-analysis/gap-analysis.json` - maturity distribution justifies the work: 81 absent-or-weak mappings vs 34 present-strong + 14 stronger-than-source. Mode-E targets the absent/stub/weak end; mode-G respects the strong end.
- Per-feature `local_files` in the map cite the exact TypeSpec/Drizzle/service files the port extends (e.g. `crm-core-service/specs/crm.tsp`, `accounting-core-service/src/events/posting-rules.ts`).

---

## 7. Consequences

**Positive**
- One legal posture for all GPL/LGPL ERP sources (Odoo, ERPNext, Dolibarr): port-adapt facts, never copy expression. Removes per-worker judgement on contamination.
- Feature completeness without copyleft: the 81 absent/weak gaps get a sourced spec to close against.
- The lens is enforced at port time, so mined org-centric flows arrive re-centered on the person, with the management surface preserved (no feature loss).
- DRY + generator-first: ported models live in the mold (ADR-0123); trio symmetry and regeneration are automatic.
- Native stack preserved (TypeScript/NestJS/Drizzle/TypeSpec; one persistence + server framework).

**Negative / costs**
- Slower than copying; requires clean-room discipline and a no-verbatim audit gate.
- Port quality depends on faithfully capturing Odoo's edge cases (tax rounding, accrual proration, multi-currency revaluation); a shallow port silently drops capability (mitigated by the `no_loss_check` field being mandatory and reviewed).
- Some Odoo behavior is genuinely Odoo-specific (84KB `hr_leave.py`); porting only the durable accrual/balance facts means deliberately not reproducing Odoo's idiosyncratic config surface.

---

## 8. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | A worker copies LGPL source verbatim ("just this helper"), copylefting a service | Medium | High | No-verbatim audit gate in CI (similarity scan of touched files against `external-sources/`); clean-room norm: read the model, write original code; `ponytail:`/provenance comment forbidden to cite copied lines |
| R-2 | Org-centric Odoo UX leaks in as the person-facing experience | Medium | High | Lens fields (`person_surface`, `person_centric_reshape`) mandatory per ported feature; reviewer rejects ports that copy admin-form navigation |
| R-3 | Hand-port drift: divergent Lead/Invoice/Subscription models per service | Medium | Medium | Generator-first ([[curaos-generator-evolution-rule]]): model lands in codegen/TypeSpec, services regenerate; in-flight generator barrier respected |
| R-4 | Silent feature loss during simplification | Medium | High | `no_loss_check` per feature; dropped capability filed forward per [[curaos-version-planning-rule]], never deleted |
| R-5 | Mode-G features re-ported needlessly, duplicating stronger local code | Low | Medium | Ledger `mode_letter` is binding; G = reference-only, write nothing |
| R-6 | Option B sidecar becomes a permanent dependency | Low | High | Sidecar allowed only as a tracked, time-boxed migration bridge; default is C |

---

## 9. License Implications

- **Odoo = LGPLv3** (confirmed in cloned `LICENSE`; register `class: gpl`). Distributing CuraOS with copied Odoo source would copyleft the whole distributed work, breaking the Apache/MIT OSS plane and the managed plane (ADR-0159 §7). **Copy is prohibited (Option A rejected).**
- **Port-adapt is permitted** because it reuses facts, field semantics, state machines, and algorithms (not copyrightable) and re-expresses them as original code. This ADR asserts that as engineering policy; it is **not legal advice**.
- **Sidecar (Option B)** keeps LGPL obligations within the separate Odoo process and is license-clean, but is constrained by deployment-model and lens reasons above.
- **Same policy binds the GPL/LGPL ERP cohort**: ERPNext (GPL-3), Dolibarr (GPL-3), OpenEMR (GPL-3), OpenHospital (GPL-3) - all `port_adapt_no_copy`. AGPL sources (SuiteCRM, EspoCRM, OpenMRS distro, Windmill) are stricter still: service-boundary-or-reference only, never linked into the build.
- **No provenance trailers**: ported code carries no "derived from Odoo line X" comments that would imply copying; commits follow Conventional Commits with no AI/source attribution trailers (AGENTS.md §8).

---

## 10. Validation Needed

1. **Legal sign-off** before first GA distribution: counsel confirms the fact/expression boundary and that port-adapt output carries no LGPL obligation. (OQ-1)
2. **No-verbatim audit**: a similarity/clone scan (e.g. structural diff of touched service files vs `external-sources/erp-business/odoo-org/`) wired into the XSRC port workflow; any high-similarity hit blocks the PR.
3. **Lens conformance review**: each ported feature PR demonstrates both surfaces (person + management) and a passing `no_loss_check`.
4. **Generator-first proof**: the ported model exists as a codegen template/TypeSpec contract, and at least the core service regenerates from it (not a one-off hand edit).
5. **Edge-case fidelity tests**: tax rounding, accrual proration, multi-currency revaluation, depreciation schedules ported with unit tests asserting parity with the documented Odoo behavior (behavior parity, not code parity).

---

## 11. Implementation Follow-up

File against the **XSRC-EPIC** backlog (artifacts under `.ai-analysis/`); only execute items whose `Target Version` is the active release, per [[curaos-version-planning-rule]].

| # | Item | Routes to | Mode |
|---|---|---|---|
| F-1 | Add `XSRC: no-verbatim audit gate` to the port workflow + CI | XSRC-EPIC; `scripts/` | gate |
| F-2 | Land port-adapt TypeSpec/codegen templates for the mode-E Odoo features (AR/invoicing, payment terms, tax, bank-rec, multi-currency, CRM lead/opportunity/pipeline, sales order, leave accrual, expenses, fixed-asset depreciation, timesheets, project/task) | `curaos/tools/codegen/` (ADR-0123) | E, generator-first |
| F-3 | Regenerate the affected core/personal/business services + healthstack overlay from F-2 templates | generated services | E |
| F-4 | New `expense-core-service` (map: `absent`) posting to `accounting-core` | XSRC-EPIC; new module via generator | E |
| F-5 | Subscriptions/recurring: reuse donation-core cadence primitive + commerce-core Stripe/PayPal bridge; port plan/plan-detail field model | `commerce-core-service` / scheduler primitive (ADR-0159) | E |
| F-6 | File-forward the mode-H rejects (manufacturing/`mrp`, multi-level BOM) to a future version | XSRC-EPIC, `Target Version` > v1 | H |
| F-7 | Mark mode-G Odoo features reference-only in their module CONTEXT.md (no port) | `ai/curaos/.../CONTEXT.md` | G |
| F-8 | Legal sign-off task (OQ-1) before GA distribution | XSRC-EPIC; legal | gate |

---

## 12. Open Questions

| # | Question | Decision needed by |
|---|---|---|
| OQ-1 | Counsel confirmation of the fact/expression boundary for port-adapt output | Before first GA distribution |
| OQ-2 | No-verbatim audit tooling choice + similarity threshold | Before first mode-E port PR |
| OQ-3 | Is any Option-B sidecar bridge ever warranted for v1, or is port-adapt always sufficient? (default: always C) | First Odoo-derived feature dispatch |
| OQ-4 | Do regional tax/e-invoice localizations (`codegen-emitter` target) ship in v1 or file forward? | v1 scope review |

---

## 13. References

| Source | Relationship |
|---|---|
| `.ai-analysis/PERSON-CENTRIC-LENS.md` | Binding lens applied to every port |
| `.ai-analysis/license-risk-register.json` | Odoo `port-adapt-or-service-boundary` verdict + cohort buckets |
| `.ai-analysis/source-to-local-map.json` | 37 Odoo mappings + lens fields + generator targets |
| `.ai-analysis/code-reuse-ledger.json` | Per-feature mode (E/G/H) + license_status |
| `.ai-analysis/gap-analysis.json` | 81 absent/weak gaps justifying port |
| `.ai-analysis/source-feature-index.json` | 609 features; Bahmni->Odoo sidecar precedent |
| `external-sources/erp-business/odoo-org/odoo/LICENSE` | LGPLv3 confirmation |
| ADR-0099 | Charter: generic-before-vertical, OSS plane, deployment models |
| ADR-0101 | Data layer (TypeSpec + Drizzle) - the port target stack |
| ADR-0123 | Codegen plugin (the mold) - generator-first home for ports |
| ADR-0159 | Subscriptions/recurring billing + OSS/commercial planes |
| ADR-0202 / ADR-0205 | Commerce/sales/procurement/inventory + CRM/HR clusters that receive the ports |
| [[curaos-local-vs-3rdparty-rule]] | Local-first / dual-surface (precedence > ADR) |
| [[curaos-generator-evolution-rule]] | Generator-first mandate (precedence > ADR) |
| [[curaos-reuse-dry-rule]] | One canonical owner; port-and-extend (precedence > ADR) |
| [[curaos-version-planning-rule]] | Target-version gate; file-forward rejects (precedence > ADR) |
| [[curaos-rolling-update-rule]] | No parallel `-v2` modules; extend in place (precedence > ADR) |

*Note on precedence: per workspace AGENTS.md §13b, `ai/rules/*` outrank this ADR. Where a rule and this ADR conflict, the rule wins and this ADR is patched.*

---

*Last updated: 2026-06-29*
