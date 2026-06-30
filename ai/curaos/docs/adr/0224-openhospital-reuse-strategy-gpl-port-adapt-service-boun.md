# ADR-0224: OpenHospital reuse strategy (GPL: port-adapt + service-boundary, no verbatim c

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


---
adr-id: 0221
title: OpenHospital reuse strategy (GPL: port-adapt + service-boundary, no verbatim copy)
status: proposed
date: 2026-06-29
target-version: v1.1
phase: XSRC Phase 12 (ADR synthesis)
supersedes: []
superseded-by: null
amends: []
tags: [xsrc, healthstack, license, gpl, reuse, port-adapt, generator-first, person-centric]
parent-adrs: [0115, 0208, 0157]
binding-lens: .ai-analysis/PERSON-CENTRIC-LENS.md
rules: [curaos-local-vs-3rdparty-rule, curaos-reuse-dry-rule, curaos-generator-evolution-rule, curaos-version-planning-rule, curaos-healthstack-vision]
authored-by: agent (XSRC mining pipeline); status proposed pending user accept
---

# ADR-0224: OpenHospital reuse strategy (GPL: port-adapt + service-boundary, no verbatim c

**Status:** proposed

> One of the per-source XSRC reuse ADRs (Phase 12). Fixes HOW CuraOS may reuse the four cloned OpenHospital repositories given their GPL copyleft, and binds every reuse to the person-centric, no-feature-loss lens. Rule > ADR: where `ai/rules/` already locks an answer, this ADR follows the rule and does not re-decide.

## Context

The XSRC mining pipeline cloned and indexed four OpenHospital (Open Hospital / `informatici`) repositories as part of a 39-system completeness corpus. Their feature set is the densest single-source contributor to HealthStack clinical + revenue completeness, but the license is the most restrictive of any reusable source in the corpus.

### Source evidence (cloned repos + indices)

License verdict (`.ai-analysis/license-risk-register.json` `_computed.register`, and `.ai-analysis/generated-analysis/source-license-rollup.json`):

| Source repo | SPDX | Class | Indexed verdict |
|---|---|---|---|
| `openhospital-core` | GPL-3.0-or-later | gpl | port-adapt-or-service-boundary; no copy into permissive/proprietary build; copyleft |
| `openhospital-api` | GPL-3.0 | gpl | port-adapt-or-service-boundary; no copy into permissive/proprietary build; copyleft |
| `openhospital-ui` | GPL-3.0 | gpl | port-adapt-or-service-boundary; no copy into permissive/proprietary build; copyleft |
| `openhospital-gui` | GPL-3.0 | gpl | port-adapt-or-service-boundary; no copy into permissive/proprietary build; copyleft |

Coverage depth: OpenHospital appears in **30 of 163** source-to-local mappings (`.ai-analysis/source-to-local-map.json`, `total_mappings: 163`) and contributes **156 evidence hits across the 609-feature index** (`.ai-analysis/generated-analysis/source-feature-index.json`, `systems_indexed: 39`, `features: 609`). Concrete cited source files in the mappings include:

- Revenue: `openhospital-core/.../org/isf/accounting/model/Bill.java`, `BillItems.java`; `openhospital-api/.../accounting/rest/BillController.java`; `openhospital-ui/.../patientNewBill/PatientNewBill.tsx`; `openhospital-core/.../priceslist/model/PricesList.java`; `pricesothers/service/PricesOthersIoOperation.java`; `priceslist/rest/PriceListController.java`.
- Clinical / registration: `openhospital-api/.../patient/dto/PatientDTO.java`; `opd/dto/OpdDTO.java`; `examination/dto/PatientExaminationDTO.java`; `disease/dto/DiseaseDTO.java`; `operation/dto/OperationDTO.java`; `vaccine/dto/VaccineDTO.java`; `admission/dto/AdmissionDTO.java`; `ward/dto/WardDTO.java`; `openhospital-core` `Therapy/TherapyRow`, `FileDicom/DicomData/DicomType`.
- Supply/ops: `openhospital-core/.../supplier/model/Supplier.java`, `supplier/service/SupplierIoOperations.java`; `openhospital-gui` i18n (multilingual) and SMS gateway.

### Local evidence (what we already have)

All nine OpenHospital-target modules already exist in `.ai-analysis/local-project-inventory.json` (verified present): `healthstack-billing-service`, `healthstack-patient-service`, `encounter-service`, `healthstack-meds-service`, `healthstack-imaging-service`, `healthstack-lab-service`, `healthstack-problems-service`, `patient-core-service`, `healthstack-careplans-service`.

Maturity is mixed (`.ai-analysis/gap-analysis.json`, 81 absent/weak mappings; corpus maturity distribution `present-strong: 34, partial: 34, absent: 36, stub: 24, present-weak: 21, stronger-than-source: 14`). Of the 30 OpenHospital mappings, **13 are absent/weak** and need build-out: charge master/fee schedule (`absent`), claim-denial/RCM worklist (`present-weak`), triage (`absent`), problem list (`stub`), vitals (`stub`), lab/LIS (`stub`), radiology/imaging (`stub`), DICOM/PACS (`stub`), MAR (`stub`), immunizations (`absent`), maternity (`absent`), surgery checklist (`absent`), ward/bed management (`absent`). The remaining 17 are already `present-strong`/`stronger-than-source` locally (billing invoice lifecycle, audit, RBAC, notify, settings, search, consent, dashboards), so OpenHospital is reference-only there.

Reuse-mode ledger (`.ai-analysis/code-reuse-ledger.json`, `mode_distribution: {E:port-adapt 99, G:pattern-reference-only 51, D:api-adapter 4, C:run-as-background-service 3, H:reject 6}`). The OpenHospital authored ledger row is `mode: "E port-adapt (data model + rules only) / G pattern-reference-only (Bill  -  local stronger)"`, `legal_review: true`, targeting `healthstack-billing-service (FeeSchedule) + healthstack-patient-service (ward/bed)`.

### The binding lens

`.ai-analysis/PERSON-CENTRIC-LENS.md` is dominant: OpenHospital's UX is overwhelmingly org/desk-centric (e.g. `PatientNewBill` is a cashier desk form, `PatientInsert` a front-desk clerk screen, ward/bed is a bed-management board). We mine its **feature set, data models, business rules, compliance logic** for completeness, then re-center the experience on the person and lose **no** management/compliance feature. Every OpenHospital mapping already carries `person_centric_reshape`, `management_surface`, `person_surface`, `no_loss_check`.

## Decision options

### Option A  -  Verbatim copy / fork OpenHospital code into CuraOS
Lift Java/TSX directly (or vendor the modules). **Rejected on license:** all four repos are GPL-3.0(-or-later); the register verdict is explicitly "no copy into permissive/proprietary build; copyleft; whole-work GPL on distribution." CuraOS ships as composable, self-hostable, mixed-license artifacts; copying GPL source would impose whole-work copyleft on every distributed bundle. Also fails the binding lens (org-centric UX) and `curaos-reuse-dry-rule` (no canonical owner). Off the table.

### Option B  -  Run OpenHospital as an arms-length network service (mode C) behind an adapter
Deploy upstream OpenHospital as a separate process; CuraOS calls it over the network (GPL stays isolated to that process; CuraOS code is a mere aggregate). Technically clean copyleft isolation, and the ledger does keep mode C/D for a few sources. **Rejected as the primary strategy here:** it imports a Java/MySQL monolith with an org-centric data model and no person-centric surface, contradicts self-hosted-first composability + single-stack direction, and forfeits the lens-mandated re-centering. Retained only as a narrow contingency for a genuinely heavy black-box subsystem (e.g. a DICOM/PACS engine) where re-implementation is uneconomical  -  and even then prefer a purpose-built permissive engine.

### Option C  -  Port-adapt the data model + business rules + compliance logic; reference-only the UI; no verbatim code (RECOMMENDED)
Treat OpenHospital as a **specification and completeness oracle**, never a code donor. For each of the 13 absent/weak mappings: extract the entity shape, field set, state machine, validation, and compliance rule from the cited Java DTO/model/controller; re-express it first-party through the CuraOS generator chain (TypeSpec contract → emitted service), with the person-centric reshape as the primary surface and the full management/compliance surface preserved (`no_loss_check`). For the 17 already-strong mappings, OpenHospital is pure `pattern-reference-only` (mode G). UI/GUI repos are reference-only for behavior patterns; never as code.

### Option D  -  Ignore OpenHospital; rely on permissive sources only
Drop OpenHospital and use only Apache/MPL/permissive corpora (VistA, OpenMRS, etc.). **Rejected:** OpenHospital is the densest evidence for several gaps (ward/bed, OPD encounter rows, fee-schedule per-payer effective dating, maternity, DICOM model). Dropping it as a *reference* is a self-inflicted feature-completeness loss; the lens forbids feature loss. Port-adapting a non-copyrightable idea (a data model or a business rule) carries no copyleft, so there is no legal reason to discard the reference.

## Recommended option

**Option C  -  port-adapt data model + rules + compliance logic, reference-only the UI, zero verbatim code, generator-first.**

This is the only option that (1) honors the GPL verdict already locked in the register (`port-adapt-or-service-boundary`), (2) satisfies the dominant person-centric / no-loss lens, (3) obeys `curaos-generator-evolution-rule` (every clinical entity lands through the TypeSpec → service generator, not as a per-service hand-port), and (4) matches the authored ledger decision (`mode: E/G`, `legal_review: true`). It aligns with the dual-surface spirit of `curaos-local-vs-3rdparty-rule`: each ported capability yields a person surface and a management surface over one contract.

### Reuse decision matrix (per OpenHospital mapping group)

| OpenHospital capability group | Local module(s) | Local maturity | Reuse mode | Action |
|---|---|---|---|---|
| Fee schedule / charge master (`PricesList`, `PricesOthers`) | healthstack-billing-service | absent | E port-adapt | New `FeeSchedule` entity via contract; powers person cost-estimate, admin keeps per-payer effective-dated grid |
| Bill / BillItems / invoice | healthstack-billing-service | present-strong | G reference-only | No port (local invoice stronger: int-minor money) |
| Claim-denial / RCM worklist | healthstack-billing-service | present-weak | E port-adapt + asyncapi-event | Enrich worklist with CARC/RARC + AR aging |
| Ward / bed management (`WardDTO`) | healthstack-patient-service | absent | E port-adapt | Ward/bed/assignment/occupancy model tied to admission saga; person sees only my-room in my-stay |
| ADT / admission (`AdmissionDTO`) | healthstack-patient-service + encounter-service | partial | E port-adapt | Complete admission/discharge/transfer; person sees my-stay |
| OPD / encounter (`OpdDTO`) | encounter-service | partial | E port-adapt | Add EncounterType/class/participants/diagnosis link |
| Triage / examination (`PatientExaminationDTO`) | encounter-service + scheduling-service | absent | E port-adapt | Acuity + triage vitals; person sees wait estimate |
| Problem list / diagnoses (`DiseaseDTO`) | healthstack-problems-service + encounter-service + terminology-service | stub/partial | E port-adapt | FHIR Condition field set; person my-conditions plain-language |
| Vitals (`PatientExaminationDTO`) | healthstack-devices-service (vitals slice) | stub | E port-adapt | FHIR Observation; person self-capture + trends |
| Procedures / operations (`OperationDTO`) | orders-service + encounter-service | partial | E port-adapt | FHIR Procedure |
| Therapy / MAR (`Therapy/TherapyRow`) | healthstack-meds-service | stub | E port-adapt | MAR + self-administration log |
| Immunizations (`VaccineDTO`) | healthstack-careplans-service (immunization slice) | absent | E port-adapt | FHIR Immunization (CVX) + certificate |
| Maternity (`DeliveryTypeDTO`) | healthstack-careplans-service / new maternity slice | absent | E port-adapt | My-pregnancy journey + OB management |
| DICOM model (`FileDicom/DicomData/DicomType`) | healthstack-imaging-service + storage-service | stub | D api-adapter (engine) + E port-adapt (metadata) | DICOMweb store; person simplified viewer |
| Radiology orders | healthstack-imaging-service + orders-service | stub | E port-adapt | Protocol/worklist state machine |
| Lab / LIS | healthstack-lab-service + orders-service + terminology | stub | E port-adapt | Panels/specimens/ref ranges; person my-results plain-language |
| Surgery checklist | orders-service + builder-core + workflow-core | absent | E port-adapt | Conditional/timed checklist as person my-surgery-prep |
| Patient registration (`PatientDTO`) | patient-core-service + healthstack-patient-service | present-strong | G reference-only | Local stronger (encrypted PHI overlay) |
| Supplier / RFQ (`Supplier`) | procurement-core-service | present-strong | G reference-only | No port |
| Audit / RBAC / notify / settings / search / consent / dashboards | respective core services | present-strong → stronger-than-source | G reference-only | No port; local already meets/exceeds |
| i18n / offline (gui) | ops + frontend i18n | present-strong | G reference-only | Charter NFR already covers |

## Consequences

- OpenHospital becomes a documented **completeness oracle**: every ported entity carries a provenance note (cited source file + "port-adapt, no verbatim GPL code") in its module `CONTEXT.md`, not a copyright header.
- The 13 absent/weak gaps get first-party, generator-emitted implementations on the existing module owners  -  no new top-level services beyond the slices already named (maternity may justify a `healthstack-maternity-service` slice; decided at build time, filed forward).
- Person-centric surfaces (my-bills, my-stay, my-conditions, my-results, my-vaccines, my-pregnancy, my-surgery-prep, my-med-schedule) ship alongside the full clinician/management surfaces over one contract; `no_loss_check` is the per-feature acceptance gate.
- Generator-first: clinical entity shapes feed back into TypeSpec contract templates + `@curaos/contracts`, not per-service hand edits (`curaos-generator-evolution-rule`). A clinical-entity recipe gap discovered during port-adapt is fixed in the generator in the same PR or filed `priority=critical` against the codegen owner.
- CuraOS distribution stays free of GPL whole-work obligation because no GPL-licensed expression is copied; only non-copyrightable data models and business rules are re-expressed first-party.

## Risks

- **License creep:** an over-eager port can drift from "re-express the idea" to "transliterate the file" (a derivative work). Mitigation: legal-review flag (`legal_review: true`) on every E-mode OpenHospital port; PR checklist line "no verbatim OpenHospital code; entity re-expressed from spec"; the UI/GUI repos are pattern-reference-only and must never be opened as a copy source.
- **Data-model fidelity vs simplification:** the lens mandates simplification without feature loss; a careless simplify could drop a compliance field. Mitigation: `no_loss_check` text is an acceptance criterion per feature, reviewed against the cited source field set.
- **Scope sprawl:** 13 gaps across 9 modules is a large clinical build-out. Mitigation: version-gate it  -  most clinical depth is v1.1/v2 working set, not v1 (`curaos-version-planning-rule`); file forward, never cram.
- **DICOM/PACS economics:** re-implementing a PACS is uneconomical; api-adapter (mode D) to a permissive DICOMweb engine is preferred over either porting OpenHospital's model wholesale or running OpenHospital as a service (Option B contingency).

## License implications

- All four repos GPL-3.0 / GPL-3.0-or-later; register class `gpl`; verdict `port-adapt-or-service-boundary`; obligation "copyleft; whole-work GPL on distribution; no copy into permissive/proprietary."
- **Permitted:** reading the source as a specification; re-expressing data models, field sets, state machines, validation, and business/compliance rules as first-party CuraOS code (ideas + facts are not copyrightable); running an unmodified OpenHospital process arms-length over a network boundary (mode C contingency) without copyleft reaching CuraOS aggregate code.
- **Forbidden:** copying or adapting OpenHospital source files (Java or TSX) into any CuraOS distributed module; vendoring/forking the repos into the build; deriving from the `-ui`/`-gui` code.
- Aligns with `curaos-local-vs-3rdparty-rule` (dual-surface, self-hosted-first) and `curaos-healthstack-vision` (no real PHI in any demo/reference flow).

## Validation needed

- **User accept** of recommended Option C (status stays `proposed` until then; rule > ADR precedence preserved).
- **Legal confirmation** that data-model/business-rule re-expression from GPL source carries no copyleft on the distributed CuraOS artifact (the working assumption behind the register verdict; documented here for sign-off).
- **Per-port provenance audit:** a lightweight check that each E-mode OpenHospital port cites its source spec file and asserts "no verbatim code"  -  candidate for a CI grep gate in the codegen pipeline.
- **No-loss verification** per the 13 gap features: `no_loss_check` field exercised as an acceptance test against the cited source field set.

## Implementation follow-up

File an XSRC backlog epic **"XSRC: OpenHospital port-adapt clinical/revenue gap build-out"** (`generated_for: XSRC-EPIC`, consistent with the analysis artifacts) with child stories per absent/weak mapping group in the matrix above, each carrying: cited source spec file(s), target module, reuse mode (E/D), `person_centric_reshape` + `management_surface` + `person_surface` + `no_loss_check`, generator-first target (`contract-typespec` / `asyncapi-event`), and `legal_review: true`. Set `Target Version` per `curaos-version-planning-rule` (most clinical depth → v1.1/v2; nothing dropped, all filed forward). Stories route through the generator chain; any clinical-entity recipe gap folds back into `curaos/tools/codegen` + `@curaos/contracts` in the same PR per `curaos-generator-evolution-rule`.

## References

- `.ai-analysis/PERSON-CENTRIC-LENS.md` (binding lens)
- `.ai-analysis/license-risk-register.json`, `.ai-analysis/generated-analysis/source-license-rollup.json` (GPL verdicts)
- `.ai-analysis/source-to-local-map.json` (30 OpenHospital mappings, cited source files)
- `.ai-analysis/gap-analysis.json` (13 OpenHospital absent/weak gaps; maturity distribution)
- `.ai-analysis/code-reuse-ledger.json` (mode distribution; OpenHospital E/G ledger row, `legal_review: true`)
- `.ai-analysis/generated-analysis/source-feature-index.json` (609 features, 39 systems, 156 OpenHospital evidence hits)
- `.ai-analysis/local-project-inventory.json` (nine OpenHospital-target modules confirmed present)
- Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-generator-evolution-rule]], [[curaos-version-planning-rule]], [[curaos-healthstack-vision]]
- Related ADRs: 0115 (HealthStack overlays), 0208 (HealthStack clinical services cluster), 0157 (HAPI-FHIR / PHI audit reconciliation)
