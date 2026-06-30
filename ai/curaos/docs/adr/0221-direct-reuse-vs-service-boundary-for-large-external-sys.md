# XSRC-ADR-0001  -  Direct reuse vs service boundary for large external systems

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Phase:** XSRC Phase 12 (decision records)  -  epic `XSRC-EPIC`
**Series note:** This ADR lives in the XSRC analysis tree (`.ai-analysis/adr/`). It is NOT yet inserted into `ai/curaos/docs/adr/` (the rule-governed 02xx sequence ends at ADR-0220). On promotion it takes the next free number (0221) and a `RESOLUTION-MAP.md` row. Until promoted it is advisory and cannot override any `ai/rules/curaos_*.md`.
**Binding lens:** [`.ai-analysis/PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (person-centric, no-feature-loss  -  dominant over raw parity).
**Rules (precedence #1, this ADR is #2):** [[curaos-local-vs-3rdparty-rule]] · [[curaos-reuse-dry-rule]] · [[curaos-generator-evolution-rule]] · [[curaos-version-planning-rule]] · [[curaos-modulith-standalone-rule]] · [[curaos-airgap-rule]] · [[curaos-demo-sample-data-rule]] · [[curaos-orchestration-rule]]
**Supersedes for XSRC ingestion:** nothing. **Constrained by:** the four rules above; where this ADR and a rule disagree, the rule wins and this ADR is patched.

---

## Context

XSRC Phases 1-11 mined nine large external corpora (Odoo, ERPNext, Dolibarr, OpenEMR, OpenMRS, OpenHospital, VistA/CPRS family, SuiteCRM, EspoCRM) plus ~30 smaller permissive satellites. Phase 4 produced **163 source↔local mappings** ([`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json), `total_mappings: 163`), Phase 5 produced **81 absent/weak gaps** and **66 gap rows** ([`gap-analysis.json`](../external-source-enrichment/plan/gap-analysis.json), `_computed.absent_weak_count: 81`, `gap_count: 66`), Phase 6 the **reuse ledger A-H** ([`code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json)), and the per-system **license verdicts** ([`license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json)). Supporting indices: ``generated-analysis/source-feature-index.json`` (generated-analysis/*, git-ignored under .ai-analysis/) (609 features with file/API/entity evidence), [`data-model-crosswalk.json`](../external-source-enrichment/crosswalks/data-model-crosswalk.json) (50 crosswalks), [`ui-visual-inventory.json`](../external-source-enrichment/crosswalks/ui-visual-inventory.json) (35 screen groups), [`workflow-map.json`](../external-source-enrichment/crosswalks/workflow-map.json) (43 workflows).

The recurring decision across all 163 mappings is: **for a given mined capability, do we (a) bring the source code into our build (copy/port), or (b) keep the source system at arm's length behind a network/service boundary, or (c) treat it as reference only and re-author?** The answer is not free: it is jointly forced by license class, charter constraints (self-hosted-first, air-gap-viable, PHI-structural-boundary), the generator-first law, and the person-centric lens.

Two facts make a blanket policy wrong:

1. **License is heterogeneous and decisive.** From [`license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json) `_computed.register`: **6 AGPL** systems verdict `service-boundary-only-or-reference` (bahmni-core, espocrm, openmrs-distro-referenceapplication, suitecrm, suitecrm-core, windmill); **8 GPL/LGPL** verdict `port-adapt-or-service-boundary` (dolibarr, erpnext, odoo LGPL-3, openemr, openhospital-api/core/gui/ui); **3 MPL-2.0** verdict `port-adapt-with-file-notice` (openmrs-core/fhir2/rest); **19 permissive** verdict `safe-to-vendor-or-copy` (the VistA/FHIR/quality-measures satellites: vista-m, fhir-on-vista, vista-fhir-codex, health-data-standards, pophealth, RAPTOR, node-red, activepieces, Frappe MIT, etc.); **1 source-available** `reference-only` (n8n-ref `LicenseRef-n8n-sustainable-use`); **3 unknown** `legal-review-required` (daily-plan, FamilyHistoryCPRS, vista-vehu).

2. **The local platform is already large and generator-shaped.** ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `counts`: 93 backend services (45 neutral-core, 14 personal, 12 business, 18 healthstack, 3 education), 35 packages, 24 web + 2 mobile apps, 12 generated SDKs, 100 Helm charts. New surface enters **only** through `@curaos/codegen` (`curaos/tools/codegen`) → `@curaos/contracts` (TypeSpec .tsp + AsyncAPI) → `@curaos/*-sdk` → service → app. Hand-edits per app/service are forbidden by [[curaos-generator-evolution-rule]].

The mined reuse decisions already cluster ([`code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json) `_computed.mode_distribution`): **E port-adapt 99, G pattern-reference-only 51, D api-adapter 4, C run-as-background-service 3, H reject 6**. Generator-first targets ([`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json)): **contract-typespec 104, na 40, asyncapi-event 11, sdk-package 4, codegen-emitter 2, codegen-template 1, service-then-app 1**. This ADR records *why* "service boundary" (C/D) is the rare case and direct reuse via port-adapt-into-the-generator (E→contract/SDK) is the dominant case, and the bright-line test for choosing.

This is a cross-cutting convention spanning all 163 mappings, so it earns a standalone ADR rather than per-mapping notes (one canonical owner per [[curaos-reuse-dry-rule]]).

---

## Decision options

### Option 1  -  Blanket service-boundary (wrap every large external system, integrate over its API)

Run Odoo/ERPNext/OpenEMR/SuiteCRM/etc. as deployed sidecar systems; CuraOS calls them over REST/EDI. No source enters our build.

- **For:** zero copyleft contamination by construction (network use of GPL/AGPL still triggers AGPL §13 disclosure for the AGPL ones, but our code stays separable); fastest "feature exists" demo.
- **Against:** violates **self-hosted-first as a coherent product**  -  we ship a federation of foreign admin apps, not CuraOS; **kills the person-centric lens** (the source UX is org-centric/admin-first per the lens §"How this changes the mining", and we would inherit it wholesale); **breaks air-gap** ([[curaos-airgap-rule]] single-bundle) because each wrapped system drags its own runtime, DB, and version cadence into the Zarf bundle; **bypasses the generator** entirely (no contract/SDK/Helm emission, so [[curaos-generator-evolution-rule]] is mooted); duplicates capabilities CuraOS already owns (e.g. Reject row "CRM RBAC + audit + documents"  -  every local service already ships auth/+audit/+outbox from the generator, [`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json) mode-H). Rejected.

### Option 2  -  Blanket direct reuse (copy/vendor source into the build everywhere)

Pull source from every system into `@curaos/*` packages/services.

- **For:** maximal code leverage; one runtime.
- **Against:** **illegal for the copyleft majority**  -  copying AGPL (6 systems) or GPL (8 systems) into our permissive/proprietary-capable build relicenses the whole work ([`license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json) obligations: "whole-work GPL on distribution", "cannot link into proprietary/permissive build"); also imports org-centric models and screens wholesale, contradicting the lens. Rejected.

### Option 3  -  License-and-charter-gated decision matrix, generator-first (RECOMMENDED)

A per-capability bright-line test, applied at mapping time, that picks exactly one of five modes (the A-H ledger collapsed to the decision axes):

| Mode | When | License precondition | Where it lands |
|---|---|---|---|
| **Direct reuse  -  copy-verbatim (A/B)** | small, generic, permissive utility | permissive (MIT/Apache/ISC/BSD) or MPL-per-file | vendored into a `@curaos/*` package **with NOTICE**; MPL keeps file-level notices |
| **Direct reuse  -  port-adapt into the generator (E)** | the capability's *logic/data-model/rules* are valuable but the code is copyleft, wrong-language, or org-shaped | any (fresh TS authored from facts; copyleft = facts/standards only, never verbatim) | **`@curaos/contracts` TypeSpec/.tsp first**, then `@curaos/*-sdk`, then service  -  the DEFAULT (99 of 163) |
| **Service boundary  -  run-as-background-service (C)** | a *self-contained engine* with no economical TS re-author AND a permissive license that allows running it as-is | permissive only (so air-gap can bundle it) | wrapped behind a CuraOS service (e.g. `conversion-core`) with NOTICE; speaks events |
| **Service boundary  -  api-adapter (D)** | the capability is genuinely owned by an *existing local owner* and CRM/EHR merely re-exposes it | n/a (we adapt to our own owner) | wire to existing `*-sdk` (tasks-sdk, calendar-sdk, reports-sdk, terminology-service) via `@curaos/providers` per [[curaos-local-vs-3rdparty-rule]] |
| **Reference-only / reject (G/H)** | local already equals or exceeds source (G), or no person-centric/healthstack consumer exists (H) | any (no code crosses) | nothing crosses; record the no-loss / no-consumer proof |

Bright-line ordering (climb the ladder, stop at the first rung that holds): **reject if no consumer or local-stronger → reference-only if local-stronger-but-learn-from → api-adapter if an existing local owner exists → copy-verbatim only if permissive+generic → port-adapt-into-generator otherwise → run-as-background-service only when a permissive self-contained engine has no economical re-author.** Copyleft NEVER enters via copy; AGPL/GPL contribute facts, data models, business rules, and standard wire formats only (which are not copyrightable, e.g. X12 5010 segment layout  -  [`code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json) claims row: "the X12 5010 segment layout is an ANSI standard (not copyrightable); port-adapt the LOGIC, write fresh TS").

- **For:** legally clean per-system; preserves self-hosted-first + air-gap (only permissive engines may run-as-service, so the Zarf bundle stays redistributable); honors generator-first (E→contract/SDK is the default path); enforces the person-centric lens (port-adapt re-centers the model, never the org UX); matches the data the analysis already produced (the 5 modes are exactly the observed `_computed.mode_distribution`).
- **Against:** more up-front classification work per capability; "port-adapt" carries fidelity risk (mitigated by the no_loss_check field already on every mapping). Accepted.

### Option 4  -  Direct reuse for permissive, service-boundary for ALL copyleft

Simpler two-bucket rule: permissive → copy; copyleft → wrap as a service.

- **For:** trivially clean copyleft handling.
- **Against:** would force-wrap GPL systems whose *value is the model not the runtime* (OpenEMR's X12 logic, OpenHospital's Bill/PricesList shapes) into heavyweight sidecars  -  breaking air-gap and the generator for capabilities that should be 200 lines of fresh TS in a `.tsp`. The register itself rejects this: GPL verdict is `port-adapt-**or**-service-boundary` (port-adapt preferred), not service-boundary-mandatory. Rejected in favor of Option 3's finer test.

---

## Source evidence

- **Heavy copyleft systems force the boundary question**  -  [`license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json) `_computed.register`: AGPL `service-boundary-only-or-reference` for `bahmni-core` (AGPL-3.0), `espocrm`, `suitecrm`, `suitecrm-core`, `openmrs-distro-referenceapplication`, `windmill`; GPL `port-adapt-or-service-boundary` for `odoo` (LGPL-3), `erpnext` (GPL-3.0-only), `dolibarr`, `openemr`, `openhospital-{core,api,gui,ui}`.
- **Port-adapt is the dominant resolution, not service-boundary**  -  [`code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json) `_computed.mode_distribution`: `E:port-adapt 99`, `G:pattern-reference-only 51`, `D:api-adapter 4`, `C:run-as-background-service 3`, `H:reject 6`. Only **3 of 163** mappings actually want a run-as-service boundary.
- **The 3 true service-boundary (C) cases are all permissive Ruby engines**  -  [`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json) `integration_mode=="run-as-background-service"`: HQMF measure import + QRDA Cat I/III export from `health-data-standards (projectcypress)` + `pophealth`, both `Apache-2.0 (copy-verbatim-ok-with-NOTICE)  -  safe to run the Ruby HDS lib as-is behind a service boundary with NOTICE`, behind `conversion-core-service` / `clinical-doc-service`. Confirms: service-boundary is chosen for *self-contained permissive engines*, never to launder copyleft.
- **The 4 api-adapter (D) cases route to existing local owners**  -  [`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json) `integration_mode=="api-adapter"`: SuiteCRM/EspoCRM "Activities" → `tasks-sdk + calendar-sdk` ("Prefer wiring to existing tasks-sdk + calendar-sdk owners rather than re-modelling activities inside CRM"); CRM reporting → `reports-sdk` ("report builder is a generic capability owned by reports-sdk, not CRM"); measure value-sets → `terminology-service`; DICOM viewer → `healthstack-imaging-service + storage-service`.
- **Copyleft contributes model/logic only, proven per row**  -  billing example [`code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json): OpenEMR/VistA X12 claim generation `license_status: "gpl - ... port-adapt the LOGIC, write fresh TS. Do NOT copy OpenEMR PHP verbatim."` into a NEW `@curaos/x12-sdk`. OpenHospital `PricesList.java`/`PriceListController.java` (GPL) → port-adapt the price-list model into a fresh `contract-typespec`, `local_module: absent → build`.
- **Reject when local already wins or no consumer exists**  -  [`source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json) `integration_mode=="reject"` (6 rows): CRM RBAC/audit/documents ("Every local service already ships auth/ + audit/ + outbox from the generator"); manufacturing/BOM/MRP from odoo+erpnext ("No local manufacturing module and no person-centric or healthstack driver"); FHIR terminology server ("Local terminology-service is real-working and runs Snowstorm with all four FHIR terminology operations").
- **Feature evidence backs each verdict**  -  ``generated-analysis/source-feature-index.json`` (generated-analysis/*, git-ignored under .ai-analysis/) (609 features, `systems_indexed`) carries per-feature `source_files`, `api`, `entities`, `reuse_signal`, `license_class` (e.g. fhir-on-vista FHIR Patient: `reuse_signal: high`, `license_class: permissive`, concrete `PatientParser.java`/`PatientProvider.java` + `GET /api/Patient` evidence)  -  the substrate that lets the bright-line test be applied per capability, not per system.

## Local evidence

- **The local platform is generator-shaped, so reuse must land in the mold**  -  ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `generator`: `@curaos/codegen` at `curaos/tools/codegen` is the "PRIMARY INJECTION POINT … New backend/frontend surface enters here first, never as a per-app hand-edit." `landing_order`: `feature → codegen template/emitter → @curaos/contracts (TypeSpec .tsp + AsyncAPI) → @curaos/*-sdk → service controller/schema → FE app`. This is why direct reuse = **port-adapt into contract/SDK** (104 mappings target `contract-typespec`), not copy-into-a-service.
- **`@curaos/providers` already implements the api-adapter / 3rd-party seam**  -  ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `architecture_notes`: "new external integrations route through `@curaos/providers` ProviderRegistry (Email/Secrets/Storage/PasswordBreach) with local-first default + opt-in 3rd-party … selected at runtime via NestJS tokens." Mode-D wiring uses this existing owner per [[curaos-local-vs-3rdparty-rule]] (dual local+3rd-party requirement).
- **Capabilities that map to reject already exist locally**  -  ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `domains_present`: `terminology-service` (real-working, Snowstorm SNOMED/LOINC/RxNorm/ICD-10, ValueSet $expand), `audit-core-service` (SHA-256 hash-chain), `calendar-core-service` + `scheduling-service`, `reports-service`  -  each is the canonical owner that makes the corresponding source row a reject/api-adapter, not a new build.
- **Air-gap is a hard local constraint on service-boundary**  -  ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `stack.runtime_orchestration.airgap: "Zarf v0.76 single bundle"` and `architecture_notes` (self-hosted-first, "air-gap viable"). A wrapped AGPL system cannot be redistributed in that bundle; only permissive run-as-service engines (the 3 Apache Ruby cases) can  -  exactly what the ledger selected.
- **Gaps that this ADR routes**  -  [`gap-analysis.json`](../external-source-enrichment/plan/gap-analysis.json) `maturity_distribution`: `absent 36, stub 24, present-weak 21, partial 34` (81 absent/weak). Each absent/weak row inherits its mode from this matrix (e.g. "Charge master / fee schedule" `absent`, `port-adapt`, `contract-typespec`) so Phase-13 backlog items carry the boundary decision pre-made.
- **PHI boundary co-determines the decision**  -  ``local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/) `architecture_notes`: "PHI/PII never enters neutral cores … Events and contracts carry IDs only." Any service-boundary engine touching clinical data (HQMF/QRDA) sits behind a service that enforces the `@curaos/healthstack-phi-boundary` + ConsentGuard, never directly exposed.

---

## Recommended option

**Option 3  -  the license-and-charter-gated, generator-first decision matrix.** It is the only option that simultaneously satisfies the four governing rules and the binding lens, and it is the option the Phase 4-6 data already converged on (the five modes are the observed distribution). The operative bright-line, in priority order:

1. **Reject (H)** if local is equal-or-stronger or there is no person-centric/healthstack/business consumer (record the no_loss / no-consumer proof).
2. **Reference-only (G)** if local is stronger but the source teaches a model/edge-case worth recording (no code crosses; 51 mappings).
3. **Api-adapter (D)** if an existing local owner already owns the capability  -  wire through it / `@curaos/providers`.
4. **Copy-verbatim (A/B)** only for *small, generic, permissive* utilities, with NOTICE (MPL keeps file notices).
5. **Port-adapt into the generator (E)**  -  the DEFAULT (99 mappings)  -  author fresh TS from the source's model/rules into `@curaos/contracts` .tsp first, regenerate the SDK, then the service; copyleft contributes facts/standards only.
6. **Run-as-background-service (C)**  -  last resort  -  only when a *permissive, self-contained engine* has no economical TS re-author (the 3 Apache Ruby quality-measure cases), wrapped behind a CuraOS service with NOTICE.

Copyleft (AGPL/GPL/LGPL) source is NEVER copied or linked; it is reference/port-adapt-of-facts only. Every chosen mode re-centers on the person per the lens (port-adapt reshapes the model and adds a person surface; it never imports the org-first UX).

---

## Consequences

- **Generator stays the single injection point.** 104+ capabilities land as TypeSpec contracts → SDK → service; no per-app/per-service hand-edits. Any uncovered edge case folds back into `@curaos/codegen` / `@curaos/contracts` / `@curaos/*-sdk` in the same change, per [[curaos-generator-evolution-rule]]. The in-flight generator/SDK barrier applies: do not dispatch downstream port-adapt waves while a codegen/SDK/contracts lane is agent-claimed.
- **Build stays redistributable.** No copyleft enters the build; the Zarf single-bundle and the permissive/proprietary-capable license posture are preserved. Only the 3 Apache run-as-service engines add runtime deps, each with NOTICE.
- **Person-centric, no-loss is enforced structurally.** Every reused capability carries `person_surface` + `management_surface` + `no_loss_check` (already on all 163 mappings); the matrix forbids importing org-first UX (Option 1/2 paths that would have done so are rejected).
- **Backlog is pre-decided.** Phase-13 XSRC backlog epics inherit `integration_mode` + `generator_first_target` + license verdict per row, so each issue states its boundary decision and its landing artifact without re-litigation.
- **api-adapter cases consolidate, not fork.** SuiteCRM/EspoCRM activities, CRM reporting, and measure value-sets route to existing owners (tasks/calendar/reports/terminology), preventing capability duplication ([[curaos-reuse-dry-rule]]).
- **Cost:** per-capability classification overhead (already paid in Phase 4-6); ongoing NOTICE/attribution maintenance for vendored permissive code and the 3 run-as-service engines.

## Risks

- **Port-adapt fidelity drift (E, 99 cases).** Fresh TS may miss a source edge case. *Mitigation:* the per-mapping `no_loss_check` is a required gate; port-adapt of clinical models validates against golden files (ledger: "TS measure-eval engine, golden-file vs Ruby"); contract tests pin behavior.
- **Inadvertent copyleft contamination.** A contributor copies GPL/AGPL verbatim instead of porting facts. *Mitigation:* license-class is on every mapping + register; CI license scan (SBOM + `osv-scanner`/license gate) blocks copyleft SPDX in `@curaos/*`; copyleft rows explicitly say "do NOT copy … verbatim."
- **AGPL §13 network-use trap.** Even arm's-length calling of an AGPL system can trigger source-disclosure. *Mitigation:* AGPL systems are `service-boundary-only-or-reference` and in practice resolve to reject/reference (local already owns CRM/RBAC/terminology); no AGPL system is run-as-service in the bundle.
- **Run-as-service breaks air-gap if mis-scoped.** A non-permissive or heavy engine wrapped as a service bloats/invalidates the Zarf bundle. *Mitigation:* mode-C gate is permissive-only AND self-contained; the only 3 cases are the Apache Ruby HDS lib.
- **Unknown-license satellites.** 3 systems (`daily-plan`, `FamilyHistoryCPRS`, `vista-vehu`) are `legal-review-required`. *Mitigation:* blocked from any reuse mode until SPDX resolved; treat as reference-only pending review.
- **n8n-ref source-available trap.** `LicenseRef-n8n-sustainable-use` is `reference-only`; must not be vendored or run-as-service. *Mitigation:* matrix forbids copy/run for source-available class.

## License implications

- **AGPL (6: bahmni-core, espocrm, suitecrm, suitecrm-core, openmrs-distro-ref, windmill):** no copy, no link, no run-as-service-in-bundle. Reference/reject only. Network-use copyleft (§13) means even API integration risks disclosure  -  avoided because local owns these capabilities.
- **GPL/LGPL (8: dolibarr, erpnext, odoo, openemr, openhospital ×4):** no verbatim copy into permissive/proprietary build. Port-adapt the **model/business-rules/standard wire-formats** as fresh TS (X12 layout = ANSI standard, not copyrightable; FHIR resource shapes = spec). Service-boundary permitted but not preferred (heavier than port-adapt and breaks air-gap unless the engine is separable).
- **MPL-2.0 (3: openmrs-core/fhir2/rest):** file-level copyleft  -  port-adapt with per-file NOTICE if any file is reused; cleaner to port-adapt as facts.
- **Permissive (19, MIT/Apache/ISC/BSD):** safe to copy-verbatim or vendor **with NOTICE/attribution** (e.g. fhir-on-vista bundle-dedup + FileMan↔FHIR datetime utils into `@curaos/fhir-client`); the only class eligible for run-as-service.
- **Source-available (1: n8n-ref) + unknown (3):** reference-only / legal-review-required; no code crosses until cleared.
- **Attribution debt:** every copy-verbatim and run-as-service target carries a NOTICE entry; the `license-ledger/` artifact and SBOM track it.

## Validation needed

- **License-class CI gate** in `@curaos/*` (SBOM + SPDX scan) that fails on any AGPL/GPL/LGPL/source-available source landing in the build tree  -  proves the matrix is enforced, not just documented.
- **NOTICE/attribution audit** for the permissive copy-verbatim + the 3 run-as-service engines (presence + correctness).
- **no_loss_check assertion per port-adapt PR** (the mapping's no-loss text must map to concrete contract fields/tests; golden-file equivalence for the measure-eval/QRDA engines).
- **Air-gap bundle build** including the 3 run-as-service engines, proving Zarf single-bundle still builds and is redistributable ([[curaos-airgap-rule]]).
- **api-adapter wiring proof** that activities/reporting/value-sets resolve to the existing owners (tasks/calendar/reports/terminology) with no duplicate model created.
- **Person-surface presence check:** each reused capability exposes both `person_surface` and `management_surface` over one contract (lens dual-surface requirement).

## Implementation follow-up

- **Epic:** `XSRC-EPIC` (Phase 12-13). File a Phase-13 backlog epic **"XSRC reuse-mode execution"** in the local issue tracker (`.scratch/state/symphony-work/local-issues.sqlite`, per `docs/agents/issue-tracker.md`), child issues keyed by `integration_mode`:
  - **E port-adapt (99):** one child per `contract-typespec` target (104 contract targets incl. absent/weak gaps from [`gap-analysis.json`](../external-source-enrichment/plan/gap-analysis.json)); each lands a `.tsp` in `@curaos/contracts` → SDK regen → service, generator-first.
  - **D api-adapter (4):** wire to existing owners via `@curaos/providers` / `tasks-sdk` / `calendar-sdk` / `reports-sdk` / `terminology-service`.
  - **C run-as-background-service (3):** wrap the Apache HDS Ruby lib behind `conversion-core` / `clinical-doc` with NOTICE; events via `asyncapi-event`.
  - **A/B copy-verbatim:** vendor permissive utils (e.g. `@curaos/fhir-client`) with NOTICE.
  - **G/H reference-only/reject (57):** record the no-loss / no-consumer proof; no code.
  - **Blocked:** the 3 `legal-review-required` + 1 source-available rows held pending license resolution.
- **Version gate:** apply [[curaos-version-planning-rule]]  -  only `Target Version = v1` rows execute now; manufacturing/BOM (rejected for v1, "no consumer") and any v1.1+ capability is filed forward, not dropped.
- **Generator barrier:** sequence so no port-adapt wave dispatches while a `@curaos/codegen` / `@curaos/contracts` / `@curaos/*-sdk` lane is agent-claimed ([[curaos-generator-evolution-rule]]).
- **Promotion:** when this ADR is accepted, promote it into `ai/curaos/docs/adr/` as ADR-0221, add a `RESOLUTION-MAP.md` row, and link it from `[[curaos-reuse-dry-rule]]` + `[[curaos-local-vs-3rdparty-rule]]` (rules stay canonical; ADR links to rules, never copies rule text).
