# ADR-0226: Dolibarr contracts/billing reuse strategy (GPL)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


Status: Proposed (2026-06-29)
Target Version: v1.1 (file forward per [[curaos-version-planning-rule]]; net-new contract owner is not a v1 working-set item)
Phase: XSRC Phase 12 (ADR synthesis) over the XSRC-EPIC mining corpus
Binding lens: `.ai-analysis/PERSON-CENTRIC-LENS.md` (person-centric, no-feature-loss; dominant over raw parity)
Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-triplet-split-rule]], [[curaos-demo-sample-data-rule]]
Tracking: XSRC-EPIC backlog (Phase 13 backlog epic; see Implementation follow-up). Sibling decisions: ADR-0159 (pricing/packaging), ADR-0202 (commerce/sales/procurement/inventory cluster), ADR-0205 (docs/esign/crm/donation/hr/business cluster).

## Context

XSRC mining cloned Dolibarr (`external-sources/erp-business/dolibarr/`) as one of nine business/clinical corpora. Dolibarr is the most complete permissive-of-the-copyleft reference for the **contracts + recurring-billing** spine that CuraOS is currently missing or stubbing. Four Dolibarr feature clusters carry the highest evidence weight in the index (`.ai-analysis/generated-analysis/source-feature-index.json`):

| Dolibarr feature | taxonomy_id | license_class | reuse_signal | evidence files |
|---|---|---|---|---|
| Contract Management | `erp.recurring.contracts` | gpl | high | 300 |
| Invoice Management (Customer) | `erp.accounting.invoicing` | gpl | high | 300 |
| Payment Processing | `erp.accounting.payments` | gpl | high | 300 |
| Supplier Invoice Management | `erp.accounting.accounts-payable` | gpl | medium | 263 |

The corpus license verdict is unambiguous. `.ai-analysis/license-risk-register.json` records Dolibarr as **`GPL-3.0`, class `gpl`, verdict `port-adapt-or-service-boundary`**: "Strong copyleft, same as OpenEMR/erpnext. Facture/contrat/online-signature PHP cannot be copied. Port invoice/contract data-model + state-machine as fresh TS; adopt the signed_status enum + public-sign UX as design patterns (UX is not copyrightable as expression of an interaction concept, but implement fresh)." Obligations: never copy GPL PHP verbatim; port data model + state machine as original code; legal-review for any structure lifted; document the clean-room boundary.

The local gap is real, not cosmetic. The local inventory (`.ai-analysis/local-project-inventory.json`) and `source-to-local-map.json` confirm:

- **Contracts/renewals: no local owner at all.** `erp.recurring.contracts` (contract aggregate: header + line items, draft -> validated -> closed lifecycle, attached products/services, contract events agenda) maps to `local_module: absent`; `erp.recurring.renewals` likewise `absent`. The crosswalk (`data-model-crosswalk.json`) confirms "no dedicated Contract/Subscription entity" today; the nearest local artifacts are `esign-core-service` (signed agreements) and `donation-core-service/src/donations/recurrence.ts` (a cadence primitive).
- **Customer invoicing: stub.** `erp.accounting.invoicing` maps to `sales-core-service` at maturity `stub` ("only a draft-invoice op exists in `sales.tsp`; full invoice lifecycle, recurring templates, PDF render, email send is absent"). Dolibarr `Facture` (~6580 LOC) + `FactureRec` are the most complete reference for the entity model + recurring-template scheduling.
- **Payments: partial.** `erp.accounting.payments` maps to `commerce-core-service` (gateway payment bridges) + `accounting-core-service` payouts. Missing: standalone payment-entry against an invoice, partial payments, payment-to-invoice allocation/matching, supplier payments, payment-method catalog.
- **Online signature: already stronger than source.** Dolibarr's `llx_onlinesignature` + `commonsignedobject` + `onlineSign.php` public token page maps to `esign-core-service` at maturity `stronger-than-source` (eIDAS/UETA, multi-party seq/parallel, chain-of-custody, TypeSpec-first). This row exists to **prevent** re-implementing signing inside a new contract service and to harvest only Dolibarr's public self-serve sign-link UX + the compact `signed_status` enum.

The code-reuse ledger (`.ai-analysis/code-reuse-ledger.json`, `_computed.full_ledger`) assigns per-feature modes for the Dolibarr-touching rows: Contract Management = **E:port-adapt** (gen `contract-typespec`); Invoicing = **E:port-adapt**; Payments = **E:port-adapt**; Renewals = **E:port-adapt** (gen `asyncapi-event`); Online signature = **G:pattern-reference-only**; Recurring donations = **H:reject** (already owned by `donation-core-service`). Corpus-wide the Dolibarr rows are 14x E / 12x G / 3x H, never A-B (copy/vendor), consistent with the GPL verdict.

The binding lens forces a reshape, not a copy: Dolibarr's contract UX is org-centric (a ~108KB `card.php` admin form keyed by `thirdparty fk_soc`; invoice card ~310KB). The lens mandates a **person-facing "My Agreements / My Invoices" journey** plus a **full management/compliance surface**, same data + contract, two re-centered experiences, with `no_loss_check` on every feature.

## Decision options

**Option A - Pattern-reference-only across the board (clean-room from facts only).**
Treat every Dolibarr contract/billing artifact as fact-level reference (entity field-sets, state names, enum values) and re-implement entirely fresh with no structural lift. Maximum license safety; zero ambiguity.

**Option B - Port-adapt the data model + state machine for net-new/stub gaps; pattern-reference-only for already-owned surfaces (delegate signing to esign-core).**
For the absent contract aggregate, absent renewals, stub invoicing, and partial payments: do a clean-room **port-adapt** (re-express Dolibarr's entity relationships + lifecycle states + line-item structure as fresh first-party TypeSpec/TS, no PHP lifted, documented clean-room boundary, legal-review on any structure lifted). For online signature: **pattern-reference-only** (harvest the public sign-link UX + `signed_status` enum; delegate all signing to the stronger `esign-core-service`). All new surface enters generator-first.

**Option C - Run Dolibarr as a background service behind an API/service boundary.**
Stand up Dolibarr (PHP/MySQL) as a sidecar service and integrate via its REST API, keeping GPL code isolated at the network boundary so it does not link into first-party code.

**Option D - Reject Dolibarr entirely; mine only permissive corpora.**
Drop Dolibarr from the contract/billing build and rely on permissive sources (frappe MIT primitives, Medusa MIT, ANSI/government standard form layouts) plus first-party design.

## Source evidence

- License verdict: `.ai-analysis/license-risk-register.json` -> `_computed.register[]` `{system: dolibarr, spdx: GPL-3.0-or-later, class: gpl, verdict: port-adapt-or-service-boundary}` and `authored_register[]` Dolibarr block (obligations: never copy GPL PHP verbatim; port model + state machine; legal-review; document clean-room).
- Feature weight + entities + APIs: `.ai-analysis/generated-analysis/source-feature-index.json` `features[]` -> Contract Management (`entities: Contrat, ContratLigne, ContratStats`; `api: GET/POST/PUT/DELETE /api/contracts/{id}`; `ui_screens: contrat/card.php, list.php, services_list.php, agenda.php`; 300 evidence files), Invoice Management (`entities: Facture, FactureLigne, FactureRec, PaymentTerm`; 300 files), Payment Processing (300 files).
- Concrete cloned files cited in `source-to-local-map.json` mappings:
  - Contracts: `dolibarr/htdocs/contrat/class/contrat.class.php`, `contratligne.class.php`, `api_contracts.class.php`, `contrat/card.php`, `contrat/services_list.php`.
  - Invoicing: `dolibarr/htdocs/compta/facture/class/facture.class.php`, `facture-rec.class.php`, `factureligne.class.php`, `api_invoices.class.php`.
  - Payments: `dolibarr/htdocs/compta/paiement/class/paiement.class.php`, `fourn/class/paiementfourn.class.php`.
  - Online signature: `dolibarr/htdocs/install/mysql/tables/llx_onlinesignature.sql`, `core/class/commonsignedobject.class.php`, `core/lib/signature.lib.php`, `core/ajax/onlineSign.php`, `public/onlinesign/newonlinesign.php`.
- Reuse modes: `.ai-analysis/code-reuse-ledger.json` `_computed.full_ledger[]` Dolibarr rows (E:port-adapt for contracts/invoicing/payments/renewals; G:pattern-reference-only for online signature; H:reject for recurring donations).
- Data-model crosswalk: `.ai-analysis/data-model-crosswalk.json` `entities[]` -> Invoice (states `draft -> issued -> partiallyPaid -> paid | voided`; ext `contrat (ref, fk_soc, date_contrat, statut)`), Payment (`pending -> captured | declined`), Contract/Subscription/Renewal (`draft -> signed (esign) -> active -> expired/renew`; "no dedicated Contract/Subscription entity" locally).

## Local evidence

- `.ai-analysis/local-project-inventory.json` `modules[]`: `sales-core-service`, `commerce-core-service`, `accounting-core-service`, `esign-core-service`, `donation-core-service` exist; **no `contract-core-service` / `contrat` module exists** (grep over inventory returns empty).
- `source-to-local-map.json` `_domain: contracts-recurring` rows: contract management `local_module: absent` / `local_maturity: absent` / `risk: "No local owner at all; net-new service. Must enter generator-first or it will be hand-written and drift."`; renewals `absent`; online signature `local_module: esign-core-service` / `local_maturity: stronger-than-source`.
- `source-to-local-map.json` `_domain: erp-finance` rows: invoicing `local_module: sales-core-service` / `local_maturity: stub` / `local_files: sales-core-service/specs/sales.tsp`; payments `local_module: commerce-core-service` / `local_maturity: partial` / `local_files: accounting-core-service/src/payouts/{payouts.controller.ts,payouts.service.ts}`.
- `gap-analysis.json` `authored[]`: contracts (`absent`, gen `contract-typespec`), renewals (`absent`, gen `asyncapi-event`), invoicing (`stub`, gen `contract-typespec`) carry explicit `no_loss_check` scope strings.
- Generator: `.ai-analysis/local-project-inventory.json` `generator.engine = @curaos/codegen` at `curaos/tools/codegen` (Nx playbooks + @turbo/gen Handlebars + ts-morph AST; emits 3-layer core/personal/business scaffold + SDK recipe + UI app + Helm + agent docs + mirror). The `contract-typespec` / `asyncapi-event` generator targets in the ledger map onto this injection point.
- Money-path local fact: crosswalk records invoice/payment money in integer minor units (cents) -> bigint, idempotency-keyed payments, with billing persistence pending Drizzle. Any port-adapt must preserve this convention.

## Recommended option

**Option B.** It is the only option that satisfies all four binding constraints simultaneously and matches the analysis verdicts.

Why not the others:

- **A (reference-only everywhere)** is safe but discards the analysis's `E:port-adapt` signal for the four high-reuse gaps. The lifecycle structure (contract header/line + per-line open/closed, invoice `draft -> posted -> paid` + recurring template, payment allocation to invoice) is exactly where Dolibarr's completeness prevents feature loss; downgrading all of it to fact-only reference risks re-deriving an incomplete model and violates the `no_loss_check` hard constraint. Port-adapt of a data model + state machine as fresh code is already license-clean (no PHP lifted); A buys no additional safety over B's clean-room port for the cost of completeness.
- **C (run Dolibarr as a sidecar)** is explicitly disfavored by [[curaos-local-vs-3rdparty-rule]] and the charter: it introduces a PHP/MySQL monolith into a self-hosted/air-gap/multi-tenant TS+Postgres stack, owns its own data plane outside the tenant-isolation boundary, cannot be expressed person-centrically, and creates a second persistence + server framework against AGENTS.md 9.9. The license verdict lists `service-boundary` as a permitted fallback, not the recommendation; we have first-party owners (`sales-core`, `accounting-core`, `esign-core`) to extend instead.
- **D (reject Dolibarr)** throws away the single most complete contract/billing reference in the corpus for no benefit; a clean-room port-adapt of GPL-derived *facts and structure* is permitted and is what the register prescribes.

Concrete Option B shape (decision-level, generator-first):

1. **New `contract-core-service`** (neutral owner, generator-first via `@curaos/codegen`): clean-room port-adapt of the Dolibarr `Contrat`/`ContratLigne` aggregate -> one contract aggregate where line lifecycle derives from schedule state. Preserve header (ref/party/date), line items (product/qty/price/tax), per-line open/closed lifecycle, contract events agenda, `signed_status` projection, and REST CRUD parity with `api_contracts.class.php`. Person surface = "My Agreements" timeline; management surface = full header+line console. `personal-*`/`business-*` variants only if [[curaos-triplet-split-rule]] later names a divergent subject owner; start neutral.
2. **Renewals** = an `*.renewal.due` event (gen `asyncapi-event`) off the existing cadence primitive + a notify template + esign re-sign on renew. No standalone renewal subsystem; reuse `donation-core` recurrence engine pattern + `notify-service` + `esign-core`.
3. **Invoicing** = grow `sales-core-service` from stub to full lifecycle (line items, `draft -> posted -> paid` state machine, `FactureRec`-style recurring templates), PDF/email via existing storage + notify SDKs. Numbering: gap-free, per-tenant, per-fiscal-year (legal), with a runnable check.
4. **Payments** = add payment-entry/allocation/partial-pay/supplier-payment to the `commerce-core` + `accounting-core` seam; preserve integer-minor-unit money and idempotency keys; auto-allocate to oldest-open invoice by default with manual override; runnable balance/rounding check on the money path.
5. **Signing** = delegate to `esign-core-service` (no new signing engine); harvest only Dolibarr's public self-serve sign-link UX + `signed_status` enum as a denormalized contract projection fed by esign signing-events.

## Consequences

- A net-new neutral `contract-core-service` enters the platform as the spine of the contracts-recurring domain; renewals, invoicing, payments compose around it rather than each re-deriving contract state.
- All five workstreams enter through `@curaos/codegen` (no hand-authored service/route/UI), so trio symmetry and the ai/curaos mirror stay enforced per [[curaos-generator-evolution-rule]].
- Each capability ships two re-centered surfaces (person "My Agreements / My Invoices" journey + full management/compliance console) on one data model + contract, per the binding lens.
- No GPL code enters the codebase; every port-adapt unit carries a documented clean-room boundary note in its PR.
- Demo/sample data for these surfaces is database-backed seed/fixture data per [[curaos-demo-sample-data-rule]]; no runtime API mocks.
- Existing stronger owners are protected: signing stays in `esign-core`; recurring donations stay in `donation-core` (H:reject); no duplication added ([[curaos-reuse-dry-rule]]).

## Risks

- **Contract drift if hand-written.** The mapping flags "must enter generator-first or it will be hand-written and drift." Mitigation: block any per-service hand authoring; route through the codegen injection point; fold edge cases back into templates.
- **In-flight generator barrier.** [[curaos-generator-evolution-rule]] forbids downstream worker dispatch while any codegen/`@curaos/*-sdk`/`@curaos/contracts` lane is `agent-claimed`/PR-open. `contract-core-service` generation must wait for a clear generator lane or explicit user override.
- **Invoice numbering legality.** Gap-free, per-tenant, per-fiscal-year sequencing is a legal requirement; a naive counter is a defect. Needs a designed sequence + runnable check.
- **Payment money path.** Partial-payment rounding and payment-to-invoice allocation must reconcile exactly to GL in integer minor units; requires a runnable balance check before merge.
- **Signing duplication.** Risk of rebuilding signing inside `contract-core`. Mitigation: enforce delegation to `esign-core`; contract only holds a `signed_status` projection.
- **Clean-room provenance.** Structure lifted from GPL source without a documented boundary creates copyleft exposure. Mitigation: per-unit clean-room note + legal-review gate (below).

## License implications

- Dolibarr is **GPL-3.0 (strong copyleft)**. Copying or statically/dynamically linking any Dolibarr PHP into CuraOS would force the combined work under GPL, which is incompatible with the self-hosted multi-tenant SaaS + on-prem + air-gap proprietary distribution (`license-risk-register.json` distribution_impact).
- Permitted by this ADR: clean-room **port-adapt** of non-copyrightable facts (entity field-sets, relationships, state-machine names, enum values such as `signed_status`) re-expressed as fresh first-party code; **pattern-reference-only** of interaction concepts (public self-serve sign link). No PHP/SQL lifted verbatim.
- Required: per-port-adapt-unit clean-room boundary note in the PR; **legal-review-required** before any *structure* (not just a fact) is lifted from GPL source; explicit standards-vs-source provenance where a layout is an ANSI/government standard rather than Dolibarr expression.
- The corpus-wide rule still applies to siblings co-cited in these features: erpnext (GPL, reference/port-adapt), suitecrm-core (AGPL, fact-level reference only). Odoo account/sale (LGPL) is port-adapt-as-fresh-TS only.

## Validation needed

1. **Legal-review sign-off** on the clean-room port-adapt boundary for contract + invoice + payment models before any structural port begins.
2. **Generator-lane clearance** check ([[curaos-generator-evolution-rule]] barrier) before dispatching `contract-core-service` generation.
3. **Money-path runnable checks**: invoice numbering gap-free/per-tenant/per-fiscal-year; payment allocation + partial-pay rounding reconciling to GL in integer minor units.
4. **No-loss audit** against each `no_loss_check` string (contract header/line/lifecycle/agenda/signed_status/REST parity; invoice line-item/state-machine/recurring/PDF; payment entry/allocation/partial/supplier).
5. **Person + management surface parity** proof per the binding lens (both surfaces on one contract/data model), with database-backed seed data.
6. **Triplet-split check** ([[curaos-triplet-split-rule]]): confirm contract owner stays neutral unless a divergent subject owner + downstream consumer is named.

## Implementation follow-up

File against the **XSRC-EPIC backlog** (Phase 13; `generated_for: "XSRC-EPIC"` across all `.ai-analysis/*` phases) a child epic **"Contracts + recurring-billing spine (Dolibarr-referenced, GPL clean-room)"** with stories, all `Target Version: v1.1`, version-gated per [[curaos-version-planning-rule]] (file forward, do not pull into the v1 working set):

1. `contract-core-service` (net-new, generator-first) - clean-room port-adapt of `Contrat`/`ContratLigne`; person "My Agreements" + management console.
2. Renewals as `*.renewal.due` event + notify template + esign re-sign (gen `asyncapi-event`).
3. `sales-core-service` invoicing: stub -> full lifecycle + recurring templates + PDF/email (gen `contract-typespec`); numbering check.
4. Payment-entry/allocation/partial/supplier-payment across `commerce-core` + `accounting-core` seam; money-path check.
5. esign-core delegation wiring + `signed_status` projection on contracts (no new signing engine).

Each story carries a clean-room provenance note and the legal-review gate; each enters through `@curaos/codegen`, never as a per-app/per-service hand edit. On acceptance, update `RESOLUTION-MAP.md` to point the contracts/billing open question at this ADR, and refresh the doc graph + ai/curaos mirror.