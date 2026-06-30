# ADR-0234: UI embedding vs native rebuild (person-centric re-center)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Phase:** XSRC Phase 12 (ADRs) - drives the XSRC-EPIC backlog
**Binding lens:** [`PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (dominant; person-centric, no-feature-loss)
**Rules:** [[curaos-generator-evolution-rule]], [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-rolling-update-rule]], [[curaos-demo-sample-data-rule]], [[curaos-healthstack-vision]], [[curaos-architecture-vision]]
**Supersedes:** nothing. Establishes the XSRC corpus consumption posture that Phase 11 backlog (port-adapt vs embed) follows.

## Context

The XSRC mining effort cloned nine+ external corpora (Odoo, ERPNext, Dolibarr, OpenEMR, OpenMRS, OpenHospital, VistA/CPRS, SuiteCRM, EspoCRM, plus Windmill / Activepieces / Node-RED / n8n workflow engines and Medusa commerce) and indexed **609 source features** with evidence (`.ai-analysis/generated-analysis/source-feature-index.json`). Phase 4 produced **163 source<->local mappings** across 11 domains (`.ai-analysis/source-to-local-map.json`). Phase 5 gap analysis found **81 absent/weak gaps** (`.ai-analysis/gap-analysis.json`). Phase 6 produced per-system license verdicts (`.ai-analysis/license-risk-register.json`).

For each mapped capability we must decide a consumption posture: **embed the source UI / runtime** (render their screens or run their service inside CuraOS) versus **rebuild natively** (port the data model + business rules as fresh first-party code, generator-emit the surfaces). This ADR sets that posture once, so the Phase 11 backlog and every future XSRC story inherit a single rule instead of re-litigating per feature.

Three forces converge on the question:

1. **The binding lens forbids copying source UX.** The corpora are "overwhelmingly org-centric / admin / back-office" (`PERSON-CENTRIC-LENS.md` §"How this changes the mining"). The directive is explicit: "Mine for completeness, not for UX ... Do NOT copy their org-first navigation, their form-heavy admin screens, or their process-first flows as the primary experience." Each capability must yield a **dual surface**: a person-facing journey surface AND a management surface, sharing one data model + contract. Embedding a source screen imports exactly the org-first UX the lens rejects.

2. **The local platform is already a complete generator-driven first-party stack.** Local inventory (`.ai-analysis/local-project-inventory.json`): 93 backend services (45 neutral-core, 14 personal, 12 business, 18 healthstack, 3 education), 24 web apps + 2 mobile, 35 backend packages, 12 generated SDKs, 100 Helm charts; TypeScript 5.9 / NestJS 11 / Next.js 15 + React 19 / Expo 52, Turborepo + Nx + `@turbo/gen` mold, TypeSpec->OpenAPI + AsyncAPI contracts. CuraOS owns its own workflow/automation/builder substrate, terminology server, e-sign, audit hash-chain. There is no architectural hole an embedded foreign UI or engine would fill; there is a mold every surface must come out of.

3. **Most source corpora are legally un-embeddable.** Phase 6 verdicts (`.ai-analysis/license-risk-register.json`): OpenEMR, OpenHospital, ERPNext, Dolibarr, EspoCRM = GPL-3.0; OpenMRS reference-app / Bahmni / SuiteCRM = AGPL-3.0; OpenMRS-core / fhir2 = MPL-2.0; Odoo CE = LGPL-3.0; Windmill = AGPL-3.0; n8n = Sustainable Use License (not OSI). All are marked **reference-only** (n8n: **legal-review-required**) because copying or network-linking copyleft code into CuraOS's proprietary multi-tenant SaaS + on-prem + air-gap distribution would force source disclosure of the interacting service (AGPL) or relicense the combined work (GPL). Only standards-defined structures (X12 ANSI segments, CMS-1500/UB-04 government forms, FHIR resources) and non-copyrightable data-model facts may be re-implemented fresh.

## Decision options

### Option A - Embed source UIs / run source services as the primary plane
Render OpenEMR/OpenHospital/CRM screens (iframe or component import) and run source engines (Windmill, n8n, Odoo) as the runtime for their domains; CuraOS becomes an integration shell.

- Pro: fastest apparent coverage of the 609 features; no rebuild of mature back-office screens.
- Con: imports org-first UX the lens forbids (no person surface). Legally blocked for the GPL/AGPL/SUL majority (11+ of the corpora are reference-only). Two runtimes/UX languages per domain; breaks the single-mold generator law and single-stack charter (workspace AGENTS.md §9 r9). Demo/runtime data would live in foreign schemas, violating [[curaos-demo-sample-data-rule]] (database-backed, service-owned).

### Option B - Native generator-first rebuild; corpora are reference / fact sources only
Port each capability's data model + business rules + compliance logic as fresh first-party TypeScript through the existing mold (TypeSpec contract -> `@curaos/*-sdk` regen -> `emitServiceLive` -> `emitUiApp`). Generator emits **dual surfaces** (person + management) from one contract. Source corpora are mined for completeness (feature set, data shapes, validation, edge cases, standards), never copied or run.

- Pro: only posture compatible with the binding lens (person re-center) AND the license register (no copyleft ingest) AND the generator-evolution law (one mold, no per-app hand-edits). Single stack, single data plane, real DB-backed data.
- Con: rebuild cost is real for high-complexity gaps (X12 837/835, QRDA); correctness must be proven by tests rather than inherited from a battle-tested binary.

### Option C - Hybrid: native rebuild as default, run-as-background-service only for permissive, isolated, non-UX engines
Option B as the default; additionally allow running a small set of **permissively licensed, headless, isolated** source components behind a service boundary (with NOTICE) when reimplementing them is high-risk and low-value (gnarly standards parsers), and wiring a few capabilities to existing local SDK owners via api-adapter. No embedded UI in any case; no copyleft code ever ingested or linked.

- Pro: keeps the native-rebuild benefits of B while not reimplementing mature Apache-2.0 standards parsers (HQMF/QRDA) that would be high-risk to rewrite; matches what the Phase 4 data already concluded per-feature.
- Con: a second (background, headless) runtime exists for a handful of converters; must be fenced (permissive license + NOTICE + no PHI in the foreign process + still emits CuraOS contracts/events).

## Source evidence

The Phase 4 mapping already converged on near-total native rebuild before this ADR was written; the integration_mode distribution over all 163 mappings (`source-to-local-map.json` `_computed` / `code-reuse-ledger.json` `_computed.mode_distribution`):

| Reuse mode (ledger letter) | Count | Meaning for this ADR |
|---|---|---|
| E port-adapt | 99 | rebuild native; mine logic/data-model, write fresh code |
| G pattern-reference-only | 51 | rebuild native; local already equals/exceeds source, read for concepts only |
| H reject | 6 | do not consume at all (local stronger, or out of person-centric scope) |
| D api-adapter | 4 | wire to an existing local SDK owner, not the source |
| C run-as-background-service | 3 | run permissive headless converter behind a service boundary |

So **156 of 163** mappings (E+G+H+D) involve **no source runtime and no source UI** at all - native rebuild, local-owner wiring, or rejection. Only **3** (1.8%) propose running any source code, and all 3 are Apache-2.0 permissive, headless, and emit CuraOS contracts.

Concrete source-file citations behind the rebuild posture:

- **Highest-value gap, native rebuild:** "Insurance claim generation - X12 5010 837P/837I". Source `external-sources/healthcare/openemr/src/Billing/Claim.php` (2287 LoC) + `X125010837P.php` (1640) + `X125010837I.php` (1225) + `GeneratorX12.php` + `BillingClaimBatchControlNumber.php`. Verdict: GPL-3.0 reference-only; "X12 5010 ANSI segments ... are NOT copyrightable"; **port the LOGIC as fresh TS** into a new `@curaos/x12` SDK (`generator_first_target: contract-typespec`). Embedding the PHP is legally impossible; rebuilding is the only path. (`source-to-local-map.json` healthcare-revenue.)
- **Native rebuild of revenue cycle:** "ERA / 835 remittance auto-posting" - `openemr/src/Billing/ParseERA.php` (561) + `SLEOB.php` (304), GPL reference-only, port-adapt to `@curaos/x12` 835 parser + `accounting-core-service` ledger.
- **Native rebuild of eligibility:** "Real X12 270/271" - `openemr/src/Billing/EDI270.php` (1162), GPL reference-only, port-adapt.
- **The 3 run-as-background-service exceptions, all Apache-2.0:** (1) "HQMF measure import & parsing" - `health-data-standards (projectcypress)` hqmf-parser, "Apache-2.0 (copy-verbatim-ok-with-NOTICE) - safe to run the Ruby HDS lib as-is behind a service boundary"; (2) "QRDA Category I + III export, C32/C-CDA generation" - same HDS, Apache-2.0; (3) "Email sync: inbound IMAP/SMTP" - standard protocol, "no source code needed" (use a maintained lib, not the AGPL CRM code). (`source-to-local-map.json` selecting `integration_mode=="run-as-background-service"`.)
- **Workflow engines: reference-only, never installed.** `workflow-map.json` `runtime_strategy.summary`: "CuraOS already owns the workflow/automation/builder substrate locally; the external engines (Windmill, Activepieces, Node-RED, n8n) are reference patterns to MINE for completeness, NOT to install. None are present in the local inventory ... every mapped workflow lands as configuration on the local native substrate." 43 workflows mapped; `implementation_mode_distribution.reference-only` lists all four engines.
- **UI: generator emits dual surfaces, never imports source screens.** `ui-visual-inventory.json` (35 screens, 14 UI-kit additions) `generator_targets`: "emit DUAL surface per app from one contract per the LENS ... `surface: person|management`"; "person-centric default layout primitives ... a `journey` shell variant"; "patient-registration ... local_target_app: front-office (mgmt) + patient-app (person)". The source screens (`openmrs esm-patient-registration`, `openhospital-ui New/Edit Patient`, `openemr patient_file`) are archetype references, explicitly re-centered, not embedded.

## Local evidence

- **Complete first-party mold exists** (`local-project-inventory.json` `counts`): 93 backend services, 24 web + 2 mobile apps, 35 packages, 12 generated SDKs, 100 Helm charts, 66 ADRs, 61 rules, 1512 doc-graph nodes. `stack`: TypeScript 5.9 / Bun / NestJS 11 / Next.js 15 + React 19 / Expo 52; TypeSpec 1.12 -> OpenAPI 3.1; AsyncAPI 3; Turborepo + Nx + `@turbo/gen` Handlebars emission. There is a generator to emit through, so "rebuild" = "run the mold," not "hand-write from scratch."
- **Local already meets or beats source for 48 mappings** (`gap-analysis.json` `_computed.maturity_distribution`): present-strong 34 + stronger-than-source 14. Examples (`source-to-local-map.json`, `local_maturity=="stronger-than-source"`): FHIR terminology server (local runs Snowstorm with all four ops vs VistA-coupled weaker source - mapped **reject**), e-signature (local eIDAS/UETA chain-of-custody beats Dolibarr `signed_status`), tamper-evident audit (local SHA-256 hash-chain), integer-minor money with fail-closed `SafeMinorNonNeg` Zod (#369) "STRONGER than the GPL sources (OpenHospital uses floats)". Embedding here would be a regression.
- **Genuine rebuild surface is real but contained** (`gap-analysis.json` `_computed`): 81 absent/weak (absent 36, stub 24, partial 34 less overlaps, present-weak 21), 66 gap rows; `generator_first_target` distribution shows 104 contract-typespec + 11 asyncapi-event + 4 sdk-package + 3 codegen - i.e. **122 of 163 mappings land via the existing generator targets**, confirming the rebuild is mold-expressible, not bespoke.
- **Cross-cutting concerns already generated** (`source-to-local-map.json`, reject row): "Every local service already ships auth/ (roles, scope, jwt) + audit/ (hash-chain) + outbox from the generator." Source RBAC/audit "add nothing" - embedding would duplicate the canonical owner against [[curaos-reuse-dry-rule]].

## Recommended option

**Option C** (native generator-first rebuild as the default, run-as-background-service permitted only for permissive + headless + isolated standards converters; api-adapter to existing local SDK owners where a canonical owner already exists).

Rationale: Option C is what the Phase 4 data already chose feature-by-feature (99 port-adapt + 51 reference-only + 6 reject + 4 api-adapter + 3 background = the exact mode distribution above). It is the only posture that simultaneously satisfies the **binding lens** (dual person/management surfaces from one contract - impossible while embedding org-first source UI), the **license register** (zero copyleft/SUL ingest or network-linking; only Apache-2.0 headless converters run, with NOTICE, no PHI in the foreign process), and the **generator-evolution + reuse-DRY + single-stack** laws (one mold, one data plane, canonical owners). Pure Option B is rejected only because it would force a high-risk rewrite of mature Apache-2.0 standards parsers (HQMF/QRDA) for no legal or person-centric benefit; C carves a tightly-fenced exception for exactly those. Option A is rejected outright: legally blocked for the majority, lens-violating for all, and architecture-violating for the platform.

## Consequences

- **Default posture for every XSRC feature: rebuild through the mold.** TypeSpec/AsyncAPI contract -> `@curaos/*-sdk` regen -> `emitServiceLive` -> `emitUiApp` with `surface: person|management`. No source screen is rendered; no copyleft code is linked.
- **The generator gains new capability, not the apps.** Per `ui-visual-inventory.json` `generator_targets`, the dual-surface emit, journey shell, new screen archetypes (kanban, calendar, scheduling-board, wizard, approval-inbox, ledger/billing-flow, timeline, etc.), and 14 UI-kit components land in `@curaos/ui` + `ui-app-emit`/`ui-app-native-emit`, so all 24 web + 2 mobile apps inherit them ([[curaos-generator-evolution-rule]]). New SDK packages: `@curaos/x12` (837P/I + 835 + 270/271 emitters/parsers) and `@curaos/claim-forms` (CMS-1500 / UB-04 PDF).
- **A small, fenced background-converter plane exists** for HDS/Cypress QRDA + HQMF (Apache-2.0, NOTICE, headless, emits CuraOS contracts/events, no PHI in the foreign process), invoked by `conversion-core-service` / `clinical-doc-service` / `healthstack-quality-service`. This is the only foreign runtime, and it is data-only, not UX.
- **No feature loss.** Every mapping carries a `no_loss_check`; capability that slips a milestone is filed forward as a `priority=critical` follow-up against the shared owner, never dropped ([[curaos-version-planning-rule]], [[curaos-generator-evolution-rule]]).
- **Demo/runtime data stays DB-backed** in CuraOS service schemas via service-owned seeds, not foreign databases ([[curaos-demo-sample-data-rule]]). PHI stays in healthstack overlay schemas; neutral cores reference-only.
- **Forward-only, no parallel paths.** Rebuilt capabilities extend existing services via feature flag + semver bump, never a `-v2`/`-next` fork ([[curaos-rolling-update-rule]]).

## Risks

- **Rebuild correctness on standards lanes (X12 837/835/270/271).** Mitigation: conformance snapshot tests against known-good fixtures in `@curaos/x12`; `risk: high` rows in the mapping already flag clearinghouse-tested fidelity. Filed as the heaviest backlog item.
- **Scope creep of "rebuild everything."** Mitigation: the 6 reject rows (manufacturing, multi-level BOM, etc.) stay rejected for v1 (no person-centric/healthstack driver); the 48 strong/stronger rows are reject-inbound. Only the 81 absent/weak gaps are rebuild work.
- **Background-converter plane could grow into a second runtime by accretion.** Mitigation: hard fence - permissive license + headless + NOTICE + no PHI + emits CuraOS contracts; any new candidate needs an ADR amendment, not an ad-hoc add.
- **Accidental copyleft contamination during port-adapt.** Mitigation: "port LOGIC/data-model as fresh original code only"; reviewers verify no GPL/AGPL/MPL/SUL file is copied; only standards-defined structures and non-copyrightable facts are re-implemented.

## License implications

| Posture | Source group | Verdict | This ADR's effect |
|---|---|---|---|
| Embed UI / link runtime | OpenEMR, OpenHospital, ERPNext, Dolibarr, EspoCRM (GPL-3.0); OpenMRS-ref-app, Bahmni, SuiteCRM (AGPL-3.0); Odoo CE (LGPL-3.0); Windmill (AGPL-3.0) | reference-only | **Forbidden.** Copyleft network-link/relicense incompatible with proprietary SaaS + on-prem + air-gap. |
| Embed | n8n | legal-review-required (Sustainable Use License, not OSI) | **Forbidden** without legal review; design-reference only. |
| Embed file | OpenMRS-core / fhir2 (MPL-2.0) | reference-only | **Do not copy MPL files;** port the pattern as fresh code. |
| Port-adapt (rebuild) | all of the above | facts/standards not copyrightable | **Allowed** - re-implement logic/data-model/standards (X12, CMS-1500/UB-04, FHIR) as fresh first-party TS. |
| Run-as-background-service (headless, NOTICE) | health-data-standards / pophealth (Apache-2.0); VistA Apache utils; node-red/activepieces OSS core | safe-to-vendor | **Allowed**, fenced to the converter plane. |
| Vendor as dependency | Medusa v2 (MIT), frappe (MIT) | safe-to-vendor | **Allowed** (Medusa already embedded in commerce-core). |

Net: the recommended posture is the only one that keeps the CuraOS codebase free of copyleft and source-available obligations across all four deployment models (§4).

## Validation needed

1. **Legal sign-off** that port-adapt of GPL/AGPL/MPL/SUL logic via fresh re-implementation (standards + non-copyrightable facts only) is clean; confirm n8n stays design-reference (legal-review-required row).
2. **NOTICE + isolation review** for the 3 Apache-2.0 background converters (attribution present, headless, no PHI crossing into the foreign process, emits CuraOS contracts).
3. **Generator dual-surface proof:** `emitUiApp surface=person|management` produces a journey surface and a management surface from one contract for a reference service (e.g. healthstack-billing), both binding to real DB-backed list/detail endpoints (the data-truth wave's contract-lint gate).
4. **Standards conformance fixtures** for `@curaos/x12` (837P/I, 835, 270/271) and `@curaos/claim-forms` (CMS-1500/UB-04 box coordinates) before any claim lane is declared done.
5. **No-feature-loss audit:** every absent/weak mapping's `no_loss_check` either lands in v1 or has a forward-filed `priority=critical` follow-up.

## Implementation follow-up

Feeds the **XSRC-EPIC** backlog (Phase 11 -> Phase 13). This ADR is the consumption-posture gate every XSRC story inherits:

- **Generator/SDK epic:** add `surface: person|management` dual emit + `journey` shell + new screen archetypes + 14 `@curaos/ui` components to `ui-app-emit`/`ui-app-native-emit` ([[curaos-generator-evolution-rule]]).
- **New SDK packages:** `@curaos/x12` (837/835/270/271), `@curaos/claim-forms` (CMS-1500/UB-04).
- **Top rebuild stories** (from `gap-analysis.json`, ranked by reuse_value=high + complexity): X12 837 engine (XL), 835 ERA auto-posting (XL), 270/271 eligibility (L), patient coverage / FHIR Coverage (M), charge master / fee schedule (M), plus the 81 absent/weak gaps total.
- **Fenced converter stories:** HDS/Cypress QRDA + HQMF background converters (Apache-2.0, NOTICE).
- **Reject set** (manufacturing, multi-level BOM, source RBAC/audit, etc.) explicitly out of v1 scope; revisit only on a named vertical driver.

Sequence and milestone gating tracked in the XSRC-EPIC backlog (`.ai-analysis/` Phase 11 output) and mirrored to local issues per workspace AGENTS.md §10.