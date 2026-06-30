# ADR-0230: (XSRC) FHIR/HL7 interoperability strategy

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Deciders:** Platform Architecture, HealthStack Engineering, Compliance, Legal (license sign-off)
**Series:** XSRC external-source-reuse analysis batch (Phase 12; first ADR of the batch). Source artifacts under `.ai-analysis/` (`generated_for: "XSRC-EPIC"`).
**Binding lens:** `.ai-analysis/PERSON-CENTRIC-LENS.md` (person-centric, no-feature-loss) - dominant over raw parity.
**Relates to / amends scope of:** ADR-0115 (HealthStack overlays, HAPI FHIR sidecar), ADR-0157 (HAPI FHIR PHI audit reconciliation), ADR-0208 (HealthStack clinical cluster), ADR-0150/0154 (provider-abstraction convention), ADR-0123 (codegen plugin), ADR-0215 (version-gated planning).

> Precedence note (workspace `AGENTS.md` 13b): this ADR is precedence-2. It does not restate or override any `ai/rules/` decision. Where a rule already locks an answer ([[curaos-local-vs-3rdparty-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-demo-sample-data-rule]]), this ADR cites and applies it. Stack picks already settled in ADR-0115/0157 (HAPI FHIR 8.x JVM sidecar, Snowstorm/terminology, NestJS+TypeSpec codegen) are inherited, not re-opened.

---

## 1. Status

**Proposed.** Awaiting (a) user decision between the decision options in section 4, and (b) Legal sign-off on the MPL-2.0 pattern-reference boundary (section 8). No code lands from this ADR until both clear. Implementation is filed forward under the XSRC backlog epic (section 11) gated to its target version per [[curaos-version-planning-rule]].

---

## 2. Context

### 2.1 What the question is

CuraOS needs a coherent, single-owner strategy for healthcare interoperability: how the platform **exposes** its clinical data as standards-conformant FHIR R4, **ingests** legacy EHR feeds (HL7 v2 ADT, C-CDA / C32), **exchanges** documents (IHE MHD, DocumentReference), and **reports** quality (eCQM, QRDA I/III) - without (a) reinventing solved, regulator-aligned logic, (b) taking on copyleft license risk, or (c) bolting interop on as an org-first admin surface that breaks the person-centric lens.

The decision is needed now because the implementing modules are empty or thin, yet they sit on the v1 critical path as the platform's external-EHR/HIE bridge and the export path for "my record."

### 2.2 Local starting point (what we have)

From `.ai-analysis/local-project-inventory.json` (`generated_for: XSRC-EPIC`):

| Local module | Maturity | Bearing on this ADR |
|---|---|---|
| `healthstack-interop-service` | **scaffold-only** ("clean slate"; README + Helm, zero src) | The FHIR server / HL7v2 / C-CDA owner. Empty. |
| `fhir-client` (backend package) | **scaffold-only** (README only) | Shared FHIR mapping + utilities home. Empty. |
| `healthstack-quality-service` | **scaffold-only** (README + Helm, zero src; "HEDIS/CMS eCQM TBD") | eCQM engine + QRDA III owner. Empty. |
| `terminology-service` | **real-working** (Snowstorm SNOMED/LOINC/RxNorm/ICD-10, `$expand`/`$lookup`/`$translate`/`$validate-code`) | **Stronger than every mined source.** Reuse mode H (reject inbound). Enrich only. |
| `clinical-doc-service` | **real-working** (FHIR Composition/DocumentReference + IHE MHD + Consent + signatures) | Natural single document store for FHIR **and** CDA/QRDA outputs. |
| `conversion-core-service` | **partial / real-working** (async job queue already does PDF/FHIR/HL7/CSV, dead-letter) | Natural home to run permissive Ruby converters behind a stable contract. |
| `audit-core-service` | **real-working** (SHA-256 hash-chain, per-resource chain heads, IHE BALP) | Reuse mode H (reject inbound). PHI audit already owned (ADR-0157). |

So: the **mapping/data-and-contract spine plus the terminology, document, audit, and conversion seams already exist and are real-working**; only the FHIR-server, eCQM-engine, and HL7v2/C-CDA edges are absent.

### 2.3 Source corpus (what proves "complete")

`generated-analysis/source-feature-index.json` indexes 609 features across 39 systems; **97** carry FHIR/HL7/interop/terminology/EDI evidence, concentrated in:

- **openmrs-fhir2** (20 features): 13+ R4 resource providers (Patient, Observation, Encounter, Condition, AllergyIntolerance, MedicationRequest/Medication, DiagnosticReport, Immunization, Practitioner/Role, Location, Task, ServiceRequest, Group, Person/RelatedPerson), plus the `ToFhirTranslator<T,U>` / `FromFhirTranslator<T,U>` translator-pair framework, reference translators, FHIR search spec, dual R3/R4 support. Evidence: `external-sources/healthcare/openmrs-org/openmrs-module-fhir2/api/src/main/java/org/openmrs/module/fhir2/providers/r4/*FhirResourceProvider.java` and `.../api/translators/ToFhirTranslator.java`, `ObservationReferenceTranslator.java`, `PractitionerTranslator.java`. **License: MPL-2.0 (file-level copyleft).**
- **fhir-on-vista** (12 features): Spring Boot + HAPI FHIR R4 server; PatientParser/ConditionParser/ObservationParser/LocationParser/CareTeamParser/MedicationParser; patient compartments; coding-system support; `WebVistaData` HTTP client. Evidence: `java-api/src/main/java/com/healthconcourse/vista/fhir/api/{parser,provider,service}/*.java`. **License: Apache-2.0.**
- **vista-fhir-codex** (18 features): patient bundle aggregation, per-resource extraction (encounter/condition/vitals/allergy/medication/immunization/procedure/lab), **bundle dedup & entity mapping**, **FileMan<->FHIR datetime conversion**, terminology/codeset (BSTS), FHIR browser WASM UI. Evidence per `authored_ledger`: `C0FHIR.m GETVIT/GETCOND/GETLAB/GETMED/GETALGY/GETIMM`. **License: Apache-2.0.**
- **openemr** (15 interop features): `/fhir/Patient`, `/fhir/Condition`, `/fhir/AllergyIntolerance` (FHIR R4 + US Core 8.0), plus **X12 5010 837P/837I generator, ParseERA (835), EDI 270/271, HCFA-1500**. Evidence: `src/RestControllers/*RestController.php`, OpenEMR X12 generator. **License: GPL-3.0 (strong copyleft).**
- **health-data-standards (projectcypress) + pophealth** (~6 features): C32/HITSP C32 generation, **QRDA Cat I/III export + validators**, **HQMF parser/generator**, code-system/terminology helpers, the eCQM execution engine and the full population taxonomy (IPP/DENOM/NUMER/DENEX/DENEXCEP/NUMEX/MSRPOPL/OBSERV/MSRPOPLEX/STRAT). Evidence: `external-sources/healthcare/worldvista/health-data-standards/lib/hqmf-model/{population_criteria,data_criteria,document}.rb`, `lib/hqmf-parser.rb`, `lib/health-data-standards/export/c32.rb`; `popHealth/lib/hds/measure.rb`. **License: Apache-2.0 (Ruby; runnable behind a service boundary with NOTICE).**

### 2.4 Gaps this ADR must close (`gap-analysis.json`, `source-to-local-map.json` domain `healthcare-interop-quality`)

Maturity distribution across the 163 mappings: 36 absent, 24 stub, 21 present-weak, 34 partial, 34 present-strong, 14 stronger-than-source; 81 absent-or-weak. The three interop-domain gaps:

1. **FHIR R4 server (full provider set) + HL7v2 ADT ingestion + C-CDA exchange** - local `healthstack-interop-service` + `fhir-client` are clean-slate. Best source: openmrs-fhir2 (pattern, port-adapt) + vista (utilities, copy-with-NOTICE). Suggested mode: **port-adapt via generator** (translator-pair emitter in codegen + `@curaos/fhir-client` base). Taxonomy `healthcare.interop.fhir`.
2. **eCQM execution engine** - `healthstack-quality-service` is scaffold-only. Best source: pophealth + health-data-standards (Apache-2.0). Mode: **port-adapt TS engine** + HDS Ruby retained as golden-file reference + HQMF import wrapped as background converter. Taxonomy `healthcare.platform.reports-dashboards`.
3. **QRDA I/III + C-CDA generation and validation** - `clinical-doc-service` has a CDA bridge + Composition/DocumentReference (real-working) but no QRDA. Best source: health-data-standards (Apache-2.0). Mode: **run-as-background-service** (wrap HDS export/validate, invoked by conversion-core). Taxonomy `healthcare.interop.hl7`.

### 2.5 Reuse-mode + license evidence (`code-reuse-ledger.json` modes A-H, `license-risk-register.json`)

| Source | License verdict | Reuse mode (ledger) | Boundary |
|---|---|---|---|
| vista-fhir-codex / fhir-on-vista / vista-m | **Apache-2.0 - safe-to-vendor** | **A copy-verbatim** (utilities, with NOTICE) **+ E port-adapt** (resource shapes) | Copy bundle-dedup, FileMan<->FHIR datetime, ICN lookup verbatim into `@curaos/fhir-client`; preserve LICENSE+NOTICE. `legal_review=false`. |
| pophealth / health-data-standards | **Apache-2.0 (permissive) - safe-to-vendor** | **E port-adapt** (TS measure-eval, golden-file vs Ruby) **+ C run-as-background-service** (HQMF/QRDA via HDS Ruby behind conversion-core) | Run Ruby lib as-is behind a service boundary with NOTICE; or port to TS. `legal_review=false`. |
| openmrs-fhir2 / openmrs-core | **MPL-2.0 - reference-only** (file-level/weak copyleft) | **G pattern-reference-only** -> E port-adapt the *pattern* into the codegen emitter | Do NOT copy MPL files. Port the translator-pair concept as fresh TS. `legal_review=true`. |
| openemr (X12 generator, FHIR controllers) | **GPL-3.0 - reference-only** (strong copyleft) | **E port-adapt** (X12 logic as fresh TS into a NEW `@curaos/x12-sdk`) | NEVER copy GPL source. X12 5010 / HCFA / UB-04 are ANSI/government standards: segment+box structure reusable, implementation fresh. `legal_review=true`. Document standards-vs-source provenance in PR. |
| openmrs-distro-referenceapplication / bahmni-core | **AGPL-3.0 - reference-only** (network copyleft) | reference, data-model facts only | NEVER copy/link. Field-set shapes as facts only. |
| terminology-service (local), audit-core-service (local) | first-party | **H reject inbound** (local stronger) | Enrich only (measure-binding metadata on `$expand`); do not adopt source terminology/audit. |

---

## 3. Forces

- **No feature loss is a hard constraint** (PERSON-CENTRIC-LENS section 20). Every mined business/management/compliance capability is preserved or filed forward; simplification = re-centering + automation, never capability removal.
- **Dual surface per capability** (lens section 18, [[curaos-local-vs-3rdparty-rule]]): same data + contract, two re-centered experiences - a person-facing "my record / share my record / my care gaps" surface and a clinician/management surface (full provider set, QRDA III submission, HIE exchange).
- **Generator-first is mandatory** ([[curaos-generator-evolution-rule]], generator-first-zero-special-edits): the FHIR mapping layer must be *emitted from `.tsp` contracts*, not hand-written per service. A per-service hand-written provider/parser/service triple is the anti-pattern this ADR exists to prevent. Every interop edge case folds back into the codegen emitter or `@curaos/fhir-client`, never a local hot-fix.
- **DRY / single canonical owner** ([[curaos-reuse-dry-rule]]): one FHIR mapping seam (`@curaos/fhir-client` + codegen emitter), one terminology owner (`terminology-service`), one document store (`clinical-doc-service`), one converter host (`conversion-core-service`), one audit owner (`audit-core-service`). No parallel FHIR utility per service.
- **Local-first AND 3rd-party** ([[curaos-local-vs-3rdparty-rule]]): the FHIR server and HIE exchange must run self-hosted (SaaS + on-prem + air-gap) AND federate to an external HIE / FHIR endpoint via tenant config. CuraOS-as-FHIR-server is the default; BYO external FHIR endpoint is the opt-in.
- **License risk is asymmetric**: Apache code is a copy/run asset; MPL is a *pattern* asset only; GPL/AGPL is a *fact/standard* asset only. The strategy must extract maximum value at each tier without crossing the boundary.
- **PHI boundary + audit are already solved** (ADR-0157): FHIR access audit and consent enforcement are inherited, not re-decided here. This ADR must *route through* them, not duplicate them.

---

## 4. Decision Options

### Option A - Mono-edge: one `healthstack-interop-service` owns everything (FHIR server + HL7v2 + C-CDA + QRDA), hand-built per resource

One service implements the full FHIR provider set, HL7v2 ingestion, C-CDA, and QRDA by hand, mirroring openmrs-fhir2's per-resource provider/translator triples.

- **Pros:** One deploy unit; closest 1:1 to the proven openmrs-fhir2 layout; fastest first endpoint.
- **Cons:** Violates generator-first (hand-written triples = the exact anti-pattern); MPL pattern copied too literally risks file-level copyleft; collapses terminology/doc/quality owners into one service (breaks DRY + the real-working local owners); no dual surface; eCQM + QRDA crammed into an interop service they don't belong in. **Rejected by rules before user input.**

### Option B - Generator-emitted FHIR seam + reuse-by-license-tier across existing owners (recommended)

A **shared FHIR mapping seam** is established once and *emitted*, then each capability lands in its already-existing canonical owner, with reuse mode chosen per source license:

1. `@curaos/fhir-client` (backend package): the translator-pair base (`ToFhir`/`FromFhir` interfaces, reference translators) ported **fresh** from the openmrs-fhir2 *pattern* (mode G, MPL - no file copy), plus **copy-verbatim** Apache-2.0 utilities from vista (bundle dedup, FileMan<->FHIR datetime, ICN lookup) with NOTICE (mode A).
2. `tools/codegen`: a **translator-pair emitter** convention (ADR-0123) that scaffolds a translator pair + provider per FHIR resource referenced in a service's `.tsp` contract. Every FHIR-exposing service then *generates* conformant, tested mapping code from its contract.
3. `healthstack-interop-service`: the FHIR R4 server + HL7v2 ADT ingestion + C-CDA exchange edge, wired to neutral/healthstack domain services via the emitted translators. Contract-first (`healthstack-interop.tsp`).
4. `healthstack-quality-service`: eCQM engine ported to TS (mode E) from pophealth/HDS with **golden-file tests** against the Ruby reference; HQMF import + QRDA generation wrapped as **background converters** (mode C) behind `conversion-core-service`.
5. `clinical-doc-service`: stores QRDA I (per-patient) + QRDA III (aggregate) + C-CDA as `DocumentReference` (extends the existing real-working CDA bridge).
6. `terminology-service`: **reject inbound** (mode H, local stronger); **enrich** only with measure-binding metadata on `$expand` + `ValueSetUpdated` event so quality-service can invalidate measure caches.
7. X12 EDI claims (837P/837I, 835, 270/271) ported **fresh** to a new `@curaos/x12-sdk` (mode E, GPL fact/standard-only) consumed by `healthstack-claims-service` - tracked as a **sibling claims gap**, referenced here for coherence but owned by its own ADR.
8. **Dual surface** per the lens: person-facing "download/share my record" (one consent-gated action emitting C-CDA or QRDA I) + clinician HIE exchange / QRDA III submission, over the same contracts.
9. **Local-first + 3rd-party:** CuraOS FHIR server default; tenant-config BYO external FHIR/HIE endpoint via the provider-abstraction convention (ADR-0150/0154).

- **Pros:** Satisfies generator-first, DRY, local-vs-3rdparty, person-centric lens, and no-feature-loss simultaneously; reuses every real-working local owner; stays license-clean by tiering (Apache copy/run, MPL pattern, GPL fact); each capability in its right service.
- **Cons:** Highest design surface up front (emitter + base package + golden-file harness before the first endpoint); spans five services; requires Legal sign-off on the MPL pattern boundary and GPL standards-vs-source provenance.

### Option C - Buy/federate: run a third-party FHIR facade (external HAPI-as-product or commercial HIE) as the only interop edge

CuraOS does not implement FHIR resource mapping; it federates all interop to an external FHIR server / HIE product per tenant.

- **Pros:** Least code; offloads conformance maintenance.
- **Cons:** Breaks self-hosted-first / air-gap charter (section 3) for any tenant without the external product; "my record" export depends on a third party; loses the person-centric surface; contradicts [[curaos-local-vs-3rdparty-rule]] (3rd-party must be the *opt-in*, not the *only* path). Viable **only as the 3rd-party half** of Option B, not as the whole strategy.

---

## 5. Recommended Option

**Option B**, with Option C folded in as the BYO-external-endpoint half (per [[curaos-local-vs-3rdparty-rule]]).

Rationale, traced to evidence:

- It is the only option that does not violate a precedence-1 rule on contact: generator-first ([[curaos-generator-evolution-rule]]) forces the emitter; DRY ([[curaos-reuse-dry-rule]]) forces reuse of the real-working `terminology-service` / `clinical-doc-service` / `conversion-core-service` / `audit-core-service` owners rather than a mono-service.
- The license register makes the tiering unavoidable: vista (Apache) is the only FHIR source we may copy; openmrs-fhir2 (MPL) gives us the *pattern* (the single highest-value reusable design in the corpus - reuse_signal high across 20 features) but only as fresh TS; openemr (GPL) X12 is fact/standard-only. Option B is the design that captures each tier at its legal ceiling.
- It honors the binding lens: the FHIR/QRDA/C-CDA edges become a person-controlled "share my record" action plus a clinician/HIE surface over the same emitted contracts, with explicit `no_loss_check` carried from every interop-domain mapping.
- It preserves the inherited ADR-0157 PHI-audit + consent path: interop endpoints route through `@HealthstackAudit()` / HAPI ConsentInterceptor unchanged.

---

## 6. Consequences

**Positive**
- One emitted FHIR mapping seam: future FHIR-exposing services generate conformant translators from `.tsp`, so "my record" always round-trips losslessly (lens person-centric angle on the translator gap).
- Quality/QRDA logic is regulator-aligned by construction (golden-file parity to HDS/pophealth) instead of reinvented.
- Terminology, document, audit, conversion owners stay single-canonical; no duplication.
- Air-gap and on-prem keep full interop (no mandatory external dependency).

**Negative / cost**
- Up-front investment in the emitter + `@curaos/fhir-client` base + golden-file harness before the first production endpoint. This is deliberate (generator-first); it is debt-avoidance, not yak-shaving.
- A Ruby (HDS) background converter inside an otherwise TS/NestJS + JVM-sidecar fleet adds a third runtime in `conversion-core-service` (bounded behind a service contract + NOTICE; ADR-0109 pod isolation applies).
- Cross-service contract coordination (interop <-> terminology <-> quality <-> clinical-doc <-> conversion) requires versioned events (`ValueSetUpdated`, `MeasureImported`, `MeasureResultsReady`) per AGENTS.md section 7.

**In-flight generator barrier** ([[curaos-generator-evolution-rule]]): while the codegen translator-pair emitter or `@curaos/fhir-client` is mid-change, downstream FHIR-service dispatch is blocked - every service generated against a defective emitter inherits the defect. Sequence the emitter/base before the per-service endpoints.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MPL pattern ported too literally -> file-level copyleft contamination | Medium | High (license) | Clean-room: read pattern, write fresh TS interfaces; no MPL file in repo; Legal sign-off (section 8); document clean-room boundary in PR (`legal_review=true` in ledger). |
| GPL X12 structure lifted beyond ANSI standard | Medium | High (license) | Implement X12 5010 from the ANSI 837 spec, not from OpenEMR PHP; document standards-vs-source provenance per copied unit; Legal sign-off. Tracked under sibling claims ADR. |
| Hand-written FHIR provider sneaks in per service (generator bypass) | Medium | High (debt) | Generator-first gate: emitter is the only sanctioned path; CI check that FHIR providers are emitted, not authored; mirrors ADR-0157 audit-coverage gate style. |
| eCQM TS port drifts from regulator reference | Medium | High (compliance) | Golden-file tests vs HDS/pophealth Ruby outputs in CI; HDS Ruby retained as the reference oracle, not deleted. |
| Ruby converter runtime in air-gap bundle | Low | Medium | Vendor the Apache-2.0 HDS lib into the Zarf bundle (ADR-0164) with NOTICE; runs behind conversion-core contract. |
| FHIR R4 vs R5 / US Core version drift | Medium | Medium | Pin R4 + US Core 8.0 (openemr evidence) as v1 baseline; R3/R5 dual-support (openmrs-fhir2 pattern) filed forward. |
| Terminology measure-binding enrichment regresses real-working `$expand` | Low | Medium | Additive metadata only (mode H, reject inbound); contract-versioned; existing terminology tests stay green. |

---

## 8. License Implications

Authoritative source: `license-risk-register.json` (`generated_for: XSRC-EPIC`).

- **Apache-2.0 (vista-fhir-codex, fhir-on-vista, vista-m; pophealth, health-data-standards):** `safe-to-vendor`. May copy verbatim (utilities) or run as background service. Obligations: preserve LICENSE + NOTICE for any copied/vendored code, attribution in NOTICE, retain warranty disclaimer. `legal_review=false`. Applies to: `@curaos/fhir-client` utilities (mode A), HDS Ruby converter (mode C).
- **MPL-2.0 (openmrs-fhir2, openmrs-core):** `reference-only`, file-level (weak) copyleft. **Do NOT copy any MPL file.** Port the translator-pair *pattern* as fresh original TS. If any MPL file were ever copied it must stay MPL with source disclosed - avoided by design. `legal_review=true`: Legal must confirm the clean-room boundary before the emitter lands.
- **GPL-3.0 (openemr, openhospital):** `reference-only`, strong copyleft. **NEVER copy GPL source.** X12 5010 / HCFA-1500 / UB-04 are ANSI/government standards - segment/box structure is reusable as facts; implementation is fresh TS in `@curaos/x12-sdk`. `legal_review=true`. Document standards-vs-source provenance per unit in PR.
- **AGPL-3.0 (openmrs-distro-referenceapplication, bahmni-core):** `reference-only`, network copyleft. **NEVER copy or link.** Data-model field-set shapes as facts only.

NOTICE/attribution file obligations for vendored Apache code land under the air-gap/image build path (ADR-0164/image-build rule). No copyleft attaches to CuraOS first-party code under Option B as designed.

---

## 9. Validation Needed

1. **Legal sign-off** on (a) the MPL clean-room pattern boundary for the translator-pair emitter, and (b) GPL standards-vs-source provenance for X12. Blocking; no code until cleared.
2. **Generator parity proof:** emit a translator pair + provider for one resource (Patient) from a `.tsp` contract; prove the emitted code passes FHIR R4 conformance + a round-trip (FromFhir -> domain -> ToFhir) test. Must be emitted, not authored.
3. **eCQM golden-file parity:** TS measure-eval output equals HDS/pophealth Ruby output on the reference measure set (all 10 population codes + stratification + OBSERV continuous-variable measures).
4. **QRDA/C-CDA validation:** HDS validators wired into CI for QRDA I, QRDA III, C32/C-CDA emitted via conversion-core; outputs stored as `DocumentReference` in clinical-doc-service.
5. **PHI-audit + consent integration:** every interop FHIR endpoint produces an ADR-0157 audit entry and honors HAPI ConsentInterceptor (integration test, no new audit path).
6. **Dual-surface + no-feature-loss:** prove the person-facing "share my record" action (consent-gated C-CDA/QRDA I export) and the clinician HIE/QRDA III surface both exist over the same contract; check every interop-domain mapping `no_loss_check` is satisfied or filed forward.
7. **Local-first + 3rd-party:** prove self-hosted FHIR server works in air-gap AND tenant-config BYO external FHIR endpoint federates (provider-abstraction).
8. **Demo data is real** ([[curaos-demo-sample-data-rule]]): interop/quality demo surfaces backed by database seeds (e.g. Synthea-loaded FHIR data, per vista-fhir-codex Synthea loader pattern), never runtime API mocks.

---

## 10. Generator-first / no-loss obligations (binding)

- Every FHIR resource mapping enters via a service `.tsp` contract and is **emitted** by the codegen translator-pair emitter. Hand-written provider/parser/service triples are forbidden ([[curaos-generator-evolution-rule]], generator-first-zero-special-edits feedback).
- Any interop edge case (a resource the emitter cannot express, a search param, a profile) folds back into the emitter or `@curaos/fhir-client`, or files a `priority=critical` follow-up against that shared owner - never a per-service hot-fix.
- Trio/overlay symmetry preserved where the resource crosses neutral/healthstack boundaries.
- Every mined interop/quality capability has an explicit `no_loss_check` (carried from `source-to-local-map.json`); anything not landing in the target version is **filed forward**, never dropped ([[curaos-version-planning-rule]]).

---

## 11. Implementation Follow-up (XSRC backlog epic)

All implementation is filed under the **XSRC backlog epic** (`.ai-analysis/*` `generated_for: "XSRC-EPIC"`), each item carrying a `Target Version` Project field per [[curaos-version-planning-rule]] (scan/dispatch version-blind; v1 working set = M1-M17). Sequenced by the in-flight generator barrier (emitter/base first).

| # | Backlog item | Owner module | Reuse mode | License gate | Dep |
|---|---|---|---|---|---|
| 1 | Translator-pair emitter convention | `tools/codegen` (ADR-0123) | G->E (MPL pattern, fresh) | Legal (MPL) | none |
| 2 | `@curaos/fhir-client` base + vendored utils (dedup, FileMan<->FHIR datetime, ICN) | `backend/packages/fhir-client` | A copy-verbatim + E | NOTICE (Apache) | 1 |
| 3 | `healthstack-interop.tsp` + emitted providers (R4 + US Core 8.0) | `healthstack-interop-service` | E port-adapt | - | 1,2 |
| 4 | HL7v2 ADT ingestion + C-CDA exchange | `healthstack-interop-service` | E port-adapt (vista utils) | NOTICE | 3 |
| 5 | `healthstack-quality.tsp` + eCQM TS engine (10 population codes, STRAT, OBSERV) + golden-file tests | `healthstack-quality-service` | E port-adapt | NOTICE (Apache) | 1 |
| 6 | HQMF import + QRDA I/III + C-CDA convert/validate as background converters | `conversion-core-service` (+ HDS Ruby) | C run-as-background-service | NOTICE (Apache) | 5 |
| 7 | Store QRDA/C-CDA as DocumentReference | `clinical-doc-service` | extend real-working | - | 6 |
| 8 | Measure-binding enrichment on `$expand` + `ValueSetUpdated` | `terminology-service` | H reject + enrich | - | 5 |
| 9 | Dual surface: person "share my record" + clinician HIE/QRDA III | patient-app + clinician app | lens dual-surface | - | 3,6,7 |
| 10 | BYO external FHIR/HIE endpoint (provider-abstraction) | `healthstack-interop-service` | C federate (Option C half) | - | 3 |
| (sibling) | X12 5010 837P/837I/835/270/271 fresh TS | new `@curaos/x12-sdk` + `healthstack-claims-service` | E (GPL fact/standard) | Legal (GPL) | own ADR |

Each item lands as a child issue under the XSRC epic with `parent_id` set (AGENTS.md section 10, [`docs/agents/issue-tracker.md`]). PRs document the clean-room / standards-vs-source provenance boundary for any MPL/GPL-derived unit.

---

## 12. References

**Analysis artifacts (all `generated_for: XSRC-EPIC`):**
- `.ai-analysis/PERSON-CENTRIC-LENS.md` (binding lens)
- `.ai-analysis/local-project-inventory.json` (interop/fhir-client/quality scaffold-only; terminology/clinical-doc/audit real-working)
- `.ai-analysis/source-to-local-map.json` -> domain `healthcare-interop-quality` (9 mappings + 3 gaps + 4 enrichments)
- `.ai-analysis/gap-analysis.json` (81 absent/weak; maturity distribution; X12 837 evidence)
- `.ai-analysis/code-reuse-ledger.json` -> `authored_ledger` (modes A/E/G/H per FHIR source) + `_computed.mode_distribution`
- `.ai-analysis/license-risk-register.json` -> `authored_register` (Apache safe-to-vendor; MPL/GPL/AGPL reference-only verdicts + obligations)
- `.ai-analysis/data-model-crosswalk.json`, `ui-visual-inventory.json`, `workflow-map.json`
- `.ai-analysis/generated-analysis/source-feature-index.json` (609 features; 97 FHIR/interop; openmrs-fhir2 20, vista-fhir-codex 18, openemr 15, fhir-on-vista 12)

**Cloned source evidence (paths from feature index / ledger):**
- `external-sources/healthcare/openmrs-org/openmrs-module-fhir2/api/src/main/java/org/openmrs/module/fhir2/providers/r4/*FhirResourceProvider.java`; `.../api/translators/{ToFhirTranslator,ObservationReferenceTranslator,PractitionerTranslator}.java` (MPL-2.0)
- `external-sources/.../fhir-on-vista/java-api/src/main/java/com/healthconcourse/vista/fhir/api/{parser,provider,service}/*.java` (Apache-2.0)
- vista-fhir-codex `C0FHIR.m` (GETVIT/GETCOND/GETLAB/GETMED/GETALGY/GETIMM); bundle dedup + FileMan<->FHIR datetime utils (Apache-2.0)
- `external-sources/healthcare/worldvista/health-data-standards/lib/hqmf-model/{population_criteria,data_criteria,document}.rb`, `lib/hqmf-parser.rb`, `lib/health-data-standards/export/c32.rb`; `popHealth/lib/hds/measure.rb` (Apache-2.0)
- OpenEMR `src/RestControllers/*RestController.php`, X12 5010 837P/837I generator, ParseERA, EDI270 (GPL-3.0)

**Rules (precedence 1):** [[curaos-local-vs-3rdparty-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-demo-sample-data-rule]], [[curaos-rolling-update-rule]].

**ADRs:** ADR-0115 (HealthStack overlays / HAPI FHIR sidecar), ADR-0157 (HAPI FHIR PHI audit reconciliation - inherited), ADR-0208 (HealthStack clinical cluster), ADR-0123 (codegen plugin / emitters), ADR-0150 & ADR-0154 (provider-abstraction), ADR-0164 (Zarf bundle / NOTICE), ADR-0215 (version-gated planning).

---

## 13. Open Questions

- **OQ-1:** FHIR baseline version - pin R4 + US Core 8.0 for v1 (openemr evidence); R3/R5 dual-support (openmrs-fhir2 pattern) filed forward? (Proposed: yes.)
- **OQ-2:** eCQM engine - keep HDS Ruby as a permanent runtime converter (mode C) or retire it once the TS port reaches golden-file parity? (Proposed: keep as reference oracle; revisit after parity proof.)
- **OQ-3:** X12 EDI claims - own ADR (sibling), or extend this one? (Proposed: own ADR; this ADR references it for coherence.)
- **OQ-4:** HL7v2 ADT ingestion transport - MLLP listener vs file/queue drop into conversion-core? (Defer to interop-service implementation; capture as foresight.)
