# ADR-0223: VistA/MUMPS analysis and integration strategy (Apache substrate, CPRS apps, FHIR

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


Status: proposed
Date: 2026-06-29
Target Version: v1 (FHIR bridge contract + utils); v1.1/v2 (live VistA runtime adapter, CPRS feature ports)
Phase: 12 (XSRC analysis -> ADR drafting)
Binding lens: [XSRC person-centric, no-feature-loss lens](../external-source-enrichment/PERSON-CENTRIC-LENS.md) (dominant over raw parity)
Extends: ADR-0115 (HealthStack overlays), ADR-0157 (HAPI-FHIR PHI/audit), ADR-0208 (HealthStack clinical cluster), ADR-0103 (API surface), ADR-0123 (codegen plugin)
Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]]

> Precedence note (AGENTS.md §13b): rules outrank this ADR. Where this ADR proposes a stack-shaped choice (TypeSpec contract, FHIR client package), the canonical owner stays the relevant rule/ADR; this ADR records the VistA-specific decision and rationale only. No MUMPS/M runtime, no GT.M/YottaDB, and no Java FHIR provider stack enters the first-party CuraOS code plane.

## Context

The XSRC corpus cloned the full WorldVistA / VHA family (19 VistA-tagged repos in `source-catalog.json`): the VistA-M kernel (`VistA-M`, `vxVistA-M`, `VistA-VEHU-M`, all MUMPS/`M`), the FHIR bridges (`FHIR-on-VistA`, `VistA-FHIR-Server`, `VistA-FHIR-Server-Codex`, all `M`; `VistA-FHIR-Data-Loader` Go; `health-apis-vista-fhir-query` Java), the CPRS GUI family (`FamilyHistoryCPRS` Pascal/Delphi; `vista-gui-installer`), deploy substrate (`docker-vista`, `VistA-in-the-Cloud`, both Shell), document/CCDA tooling (`VistA-CCDA-Generator`, `VistA-Document-Library`), and analytics (`VistALegacyAnalytics` XQuery, `vista-dashboard-rules`).

VistA matters to CuraOS for three reasons, each a distinct integration question:

1. **It is the most battle-tested public EHR feature set** (decades of VA production use). Under the person-centric lens we mine it for COMPLETENESS (data model, terminology bindings, clinical rules), not for its org-first MUMPS/CPRS UX.
2. **It is a real interoperability target.** Customers running VistA need CuraOS to talk to it. That is a live-system bridge, not a code port.
3. **Its technology (MUMPS/M, FileMan hierarchical globals, Delphi CPRS) is wholly outside CuraOS's stack** (Bun/TS services, PostgreSQL/CNPG, NestJS, per [[curaos-bun-primary-rule]], [[curaos-postgres-rule]], [[curaos-foundation-runtime-directives]]). Any "reuse" must cross a hard language and data-model boundary.

The analysis already produced a keystone mapping. `source-to-local-map.json` maps the FHIR-on-VistA + VistA-FHIR-Server-Codex resource providers (with `openmrs-fhir2`) to `healthstack-interop-service` (current maturity: `stub`), `integration_mode: port-adapt`, `generator_first_target: contract-typespec`, `reuse_value: high`. The reuse ledger (`code-reuse-ledger.json`) splits that into concrete modes: **mode A copy-verbatim** (generic Apache-2.0 utilities: bundle dedup, FileMan<->FHIR datetime conversion, ICN lookup, from `C0FHIR.m` GETVIT/GETCOND/GETLAB/GETMED/GETALGY/GETIMM) into `@curaos/fhir-client` with NOTICE, plus **mode E port-adapt** of the FHIR R4 resource SHAPES into `healthstack-*` service contracts as fresh TypeScript; and **mode G pattern-reference-only** (DATA MODEL only, legal_review=true) for `FamilyHistoryCPRS` (unknown license).

`gap-analysis.json` confirms the corresponding capabilities are currently ABSENT/WEAK in CuraOS: "FHIR R4 resource provider framework", "OpenMRS<->FHIR translator framework (generic bidirectional seam)", "HL7v2 ADT / message ingestion + FileMan<->FHIR datetime + bundle dedup/entity-mapping (legacy EHR integration plumbing)", "QRDA Cat I/III + C32/C-CDA generation", and "Clinical Decision Support". These are the gaps a VistA-informed bridge closes.

This ADR decides HOW CuraOS engages VistA across those three axes (mine, bridge, deploy), under the binding constraints that (a) no source feature is lost, (b) the person, not the org, is the spine of every reshaped flow, and (c) the FHIR translator layer is generated from one contract, not hand-written per resource.

## Decision options

### Option 1 - Reference-only (mine the feature set, no bridge, no code)

Treat the entire VistA corpus as a documentation/pattern source: extract data models, terminology bindings, and clinical rules into HealthStack contracts; build no live-VistA bridge and copy no code. VistA integration is left to customers via generic FHIR.

- Pro: zero MUMPS/Java/Delphi surface in CuraOS; lowest legal exposure; smallest scope.
- Con: violates [[curaos-local-vs-3rdparty-rule]] (a VistA-running tenant has no 3rd-party bridge option); discards proven, Apache-licensed translation plumbing (FileMan<->FHIR datetime, bundle dedup) that is genuinely hard to re-derive and re-test; leaves "legacy EHR integration plumbing" gap fully open.

### Option 2 - Live VistA runtime adapter (CuraOS speaks MUMPS/RPC directly)

Build a first-party adapter that connects to a running VistA over the RPC Broker / VistA APIs and translates in real time, embedding or shelling to MUMPS tooling.

- Pro: deepest live integration; closest to "drop-in VistA replacement front door".
- Con: forces a MUMPS/M runtime dependency into the CuraOS data plane (breaks single-stack [[curaos-bun-primary-rule]] + [[curaos-postgres-rule]]); RPC Broker is brittle, version-coupled, and PHI-heavy; massive v1 scope; the `health-apis-vista-fhir-query` Java path would re-introduce a JVM service. Over-built for the charter-minimum v1.

### Option 3 (RECOMMENDED) - FHIR-first bridge + Apache-utility harvest + reference-only kernel/CPRS, generated from one contract

Three-layer engagement, version-gated:

- **Mine the VistA kernel + CPRS as reference-only (mode G, pattern).** The MUMPS kernel (`VistA-M`/`vxVistA-M`/`VistA-VEHU-M`) and the Delphi CPRS family (`FamilyHistoryCPRS`) inform DATA MODELS and clinical rules only; NO M or Pascal code enters CuraOS. The FamilyHistoryCPRS 3-file model (FAMILY HISTORY / RELATIVE / RELATIVE DISEASES) becomes a fresh `healthstack-problems-service` family-history slice + clinical-doc FH note (`legal_review=true` gates this, license unknown).

- **Harvest the Apache-2.0 FHIR utilities (mode A copy-verbatim, with NOTICE) + port the resource shapes (mode E).** Copy the genuinely generic, permissively-licensed plumbing from `FHIR-on-VistA` + `VistA-FHIR-Server-Codex` (bundle dedup, FileMan<->FHIR datetime conversion, ICN/identifier lookup) verbatim into `@curaos/fhir-client` with attribution; port the R4 resource SHAPES (LOINC/ICD/RxNorm/SNOMED/CVX-coded Observation, Condition, Med, Allergy, Immunization, Lab) into HealthStack service `.tsp` contracts as fresh TypeScript.

- **Generate the translator layer from one TypeSpec contract (generator-first).** `healthstack-interop-service` (today a stub) exposes the FHIR R4 REST surface; the generator emits one translator pair + provider PER resource from the `.tsp` contract, so all 13+ resources (Patient, Observation, Encounter, Condition, Allergy, Medication[Request|Statement|Dispense], DiagnosticReport/ServiceRequest, Immunization, Practitioner/Role, Location, Task, Group, CareTeam, Procedure) share ONE tested mold. A new resource is a contract edit, not new code.

- **Live-VistA connectivity is a 3rd-party provider, deferred.** Per [[curaos-local-vs-3rdparty-rule]], an external VistA endpoint is a configurable `FHIRSourceProvider` (BYO VistA FHIR endpoint via tenant config), filed forward (v1.1/v2). v1 ships the contract + generated translators + harvested utilities; the live runtime adapter is NOT v1.

- **Person-centric reshape (binding).** Source FHIR is a flat org-wide endpoint (clinician/registry pulls any patient). Re-centered: the patient-app consumes its OWN compartment (`Patient/$everything` scoped to the authenticated person via healthstack-consent SMART scopes) as the spine of "my health record"; the clinician/registry surface keeps full multi-patient query. Same contract, two scopes. No management/compliance capability is dropped (`no_loss_check`: all source resource types enumerated and mapped; patient-compartment + dual R3/R4 versioning preserved as contract config).

- **CPRS dashboard pattern (mode E, separate target).** `vista-dashboard-rules` + `ehmp-app` workspace/applet model ports into `builder-core-service` user-defined dashboards: the PERSON arranges their own journey board; the clinician keeps a richer applet workspace. Same surface-definition contract, two scopes.

- **Deploy substrate is reference-only.** `docker-vista` / `VistA-in-the-Cloud` inform the offline/air-gap guarantee only; CuraOS uses its own Zarf air-gap path ([[curaos-airgap-rule]]), not VistA's. `integration_mode: pattern-reference-only`, `reuse_value: low`.

## Source evidence (cited)

- **License rollup** (`license-risk-register.json`): `docker-vista`, `fhir-on-vista`, `vista-fhir-codex (VistA-FHIR-Server-Codex)`, `vista-fhir-loader`, `vista-dashboard-rules`, `vista-m` all = **Apache-2.0 -> safe-to-vendor-or-copy**. `FamilyHistoryCPRS` (`VHAINNOVATIONS/FamilyHistoryCPRS`) and `vista-vehu` = **unknown license -> legal-review-required**.
- **Source catalog** (`source-catalog.json`): 19 VistA-family repos; primary languages `M` (MUMPS) for the kernel + FHIR servers, `Pascal` for CPRS, `Go`/`Java` for the data-loader/query side, `Shell` for deploy. URLs: `github.com/WorldVistA/{VistA-M, FHIR-on-VistA, VistA-FHIR-Server-Codex, docker-vista, ...}`, `github.com/VHAINNOVATIONS/{FamilyHistoryCPRS, VistALegacyAnalytics}`.
- **Feature index** (`generated-analysis/source-feature-index.json`, 609 total; 78 VistA/FHIR-tagged) with file-level evidence, e.g.:
  - "FHIR Patient Resource" - `PatientParser.parseSingle()` splits delimited `ICN^name^gender^DOB^SSN` into FHIR Patient (ICN primary identifier, SSN, MRN); `PatientProvider extends AbstractJaxRsResourceProvider` with `@Read`/`@Search`.
  - "FHIR Condition Resource" - `ConditionParser.parseList()` -> SNOMED-coded Condition; VistA file `9000011` indexed by SNOMED in `PXRMINDX`.
  - "FHIR Observation (Vitals)" - `ObservationParser.parseVitalsList()` over VistA file `120.5`.
  - "Terminology and Coding System Support" - `HcConstants` defines SNOMED, ICD-9, ICD-10, LOINC, CPT, RxNorm, NDFRT, CVX URNs used by every parser's `CodeableConcept`.
  - "Patient Compartments" - `PatientProvider` `@Search(compartmentName=...)` (findEncounters/findObservations) - the basis for the person-centric `$everything` reshape.
- **Reuse ledger** (`code-reuse-ledger.json`): component "VistA-FHIR-Server-Codex (`C0FHIR.m` GETVIT/GETCOND/GETLAB/GETMED/GETALGY/GETIMM) + fhir-on-vista resource providers + bundle dedup + FileMan<->FHIR datetime utils", src `vista-fhir-codex / fhir-on-vista`, license Apache-2.0, mode **"A copy-verbatim (utilities with NOTICE) + E port-adapt (resource shapes)"**, target `curaos/backend/packages/fhir-client (utils) + healthstack-{problems,meds,lab,careplans,devices}-service/specs/*.tsp`. Separate entry: `FamilyHistoryCPRS` mode **"G pattern-reference-only (DATA MODEL only, NO code)"**, license unknown, `legal_review: true`.

## Local evidence (cited)

- **Inventory** (`local-project-inventory.json`): `healthstack-interop-service` exists; the FHIR R4 provider framework is a `stub` (per the keystone map's `local_maturity: "stub"`). `@curaos/fhir-client` / `backend/packages/fhir-client` is the harvest target for the Apache utilities.
- **Source-to-local map** (`source-to-local-map.json`): keystone mapping `feature: "FHIR R4 resource provider framework (...)"`, `taxonomy_id: healthcare.interop.fhir`, `local_module: healthstack-interop-service`, `integration_mode: port-adapt`, `generator_first_target: contract-typespec`, `reuse_value: high`. Supporting maps route VistA contributions into `healthstack-problems/meds/lab` (clinical), `builder-core-service` (dashboards, from `ehmp-app`+`vista-dashboard-rules`), and `ops` (offline guarantee, from `docker-vista`).
- **Gap analysis** (`gap-analysis.json`): "FHIR R4 resource provider framework", "OpenMRS<->FHIR translator framework", "HL7v2 ADT / FileMan<->FHIR datetime + bundle dedup/entity-mapping", "QRDA Cat I/III + C-CDA generation", "Clinical Decision Support" all in the absent/weak set - the exact gaps Option 3 closes.
- **Crosswalk + workflow + UI** (`data-model-crosswalk.json`, `workflow-map.json`, `ui-visual-inventory.json`): VistA FileMan files (`120.5` vitals, `9000011` problems) and ICN identity crosswalk to the HealthStack model; CPRS workflows re-centered onto patient-journey spines per the lens; CPRS GUI surfaces marked reference-only (Delphi, not portable).

## Recommended option

**Option 3.** It is the only option that simultaneously: satisfies [[curaos-local-vs-3rdparty-rule]] (live VistA = configurable 3rd-party FHIR provider, deferred but planned); obeys [[curaos-generator-evolution-rule]] (one `.tsp` contract -> generated translator molds, no 13 hand-written triples, edge cases fold back into the generator); honors [[curaos-reuse-dry-rule]] (harvest the proven Apache utilities once into `@curaos/fhir-client` instead of re-deriving FileMan datetime/dedup); keeps the single Bun/TS + PostgreSQL stack (no MUMPS, no JVM, no Delphi in the data plane); and enforces the person-centric lens (compartment-scoped patient surface as spine, full clinician/registry surface preserved, zero feature loss). Option 1 forfeits real reusable value and breaks the dual-option rule; Option 2 over-builds and contaminates the stack.

## Consequences

- `healthstack-interop-service` graduates from stub to a generated FHIR R4 REST surface; resources are added by editing the `.tsp` contract.
- `@curaos/fhir-client` gains a small, NOTICE-attributed set of copied Apache-2.0 utilities (datetime, bundle dedup, identifier lookup) plus the generated translators.
- Two FHIR surfaces from one contract: person-compartment (patient-app "my record") and full multi-patient (clinician/registry/HIE), differentiated only by SMART scope.
- A `FHIRSourceProvider` seam exists for live external VistA, defaulting off; the live runtime adapter is filed forward (v1.1/v2), not built in v1.
- Builder gains the CPRS-derived user-arranged dashboard pattern (person board + clinician applet workspace) from `ehmp-app`+`vista-dashboard-rules`.
- No VistA deploy artifact is adopted; CuraOS keeps its own Zarf air-gap path.

## Risks

- **Stack contamination creep.** A future "just shell to VistA RPC" shortcut would re-introduce MUMPS. Mitigation: live VistA is an external provider over FHIR/HL7 only; no M runtime in-plane (rule-enforced).
- **Translator fidelity.** VistA FileMan delimited records carry edge cases (partial dates, sensitive-record flags, multi-IEN pointers). Mitigation: edge cases fold back into the generator + contract (generator-evolution), with snapshot tests per resource; the harvested datetime/dedup utilities cover the known-hard cases.
- **PHI exposure.** FHIR resources are PHI-dense. Mitigation: PHI stays in HealthStack overlay schemas (AGENTS.md §3 boundary, ADR-0157 PHI/audit); interop audit + consent scopes enforced before any compartment read.
- **Person-centric reshape regressing into org-first.** Easy to copy the flat clinician endpoint as the primary UX. Mitigation: `no_loss_check` + `person_centric_reshape` fields are acceptance criteria on every interop story, not optional.
- **Scope drift from v1.** The live adapter + CPRS feature ports are large. Mitigation: version-gated ([[curaos-version-planning-rule]]) - v1 = contract + generated translators + utilities; the rest filed forward.

## License implications

- **Copy/vendor OK with NOTICE (Apache-2.0):** `FHIR-on-VistA`, `VistA-FHIR-Server-Codex`, `vista-fhir-loader`, `vista-dashboard-rules`, `docker-vista`, `vista-m`. Generic utilities copied verbatim require a NOTICE attribution entry; Apache-2.0 is compatible with CuraOS's distribution model.
- **Pattern-reference-only (no code), legal review REQUIRED before any use:** `FamilyHistoryCPRS` (unknown license) and `VistA-VEHU-M` (unknown). The FamilyHistory feature is rebuilt fresh from the DATA MODEL only; `legal_review: true` blocks any code copy.
- **MUMPS kernel + CPRS Delphi:** even where Apache-licensed (`vista-m`), treated as reference-only - the language/runtime, not the license, is the bar to first-party use.
- A per-resource NOTICE/attribution manifest lands with the `@curaos/fhir-client` harvest; SBOM + license gate ([[curaos-version-pinning-rule]], AGENTS.md §8 security gates) records the vendored Apache utilities.

## Validation needed

- Legal review sign-off on `FamilyHistoryCPRS` + `VistA-VEHU-M` before any derived work (operator/legal-gated; `legal_review: true`).
- Generator produces translator + provider for all 13+ resource types from one `.tsp`; per-resource snapshot tests green (generator-evolution proof, not per-app edits).
- Contract round-trip: a known VistA FileMan delimited fixture (e.g. file `120.5` vitals, `9000011` problems) -> FHIR R4 resource -> validates against the R4 profile, using the harvested datetime/dedup utilities.
- Person-compartment scope proven: patient-app token resolves only its own `Patient/$everything`; clinician token resolves multi-patient; SMART scope enforcement audited (ADR-0157).
- `no_loss_check`: every source resource type + patient-compartment + dual R3/R4 versioning present as contract config (none silently dropped).
- NOTICE/attribution manifest present; SBOM + license CI gate green.

## Implementation follow-up (XSRC backlog)

- File a v1 Epic under the **XSRC backlog epic** (Phase 11 blueprint output, `Target Version: v1`): "VistA-informed FHIR R4 bridge - contract + generated translators + Apache-utility harvest" against `healthstack-interop-service` + `@curaos/fhir-client`, with stories: (1) `.tsp` FHIR R4 contract + generator translator mold; (2) harvest + NOTICE the Apache datetime/dedup/ICN utilities; (3) person-compartment vs full-query dual scope; (4) per-resource snapshot + round-trip tests.
- File a v1.1/v2 foresight Epic: "Live external-VistA `FHIRSourceProvider` (3rd-party bridge)" + "CPRS-derived dashboard pattern in builder-core" + "FamilyHistory slice (post legal review)".
- Per [[curaos-generator-evolution-rule]]: any translator edge case fixes the generator/contract, never a per-service hand-edit; trio/overlay symmetry tracked.
- Per [[curaos-version-planning-rule]]: live-adapter + CPRS ports carry `Target Version` v1.1/v2 + `foresight`; never jammed into v1, never dropped.

## Links

- Binding lens: `.ai-analysis/PERSON-CENTRIC-LENS.md`
- Evidence: `.ai-analysis/{source-catalog.json, license-risk-register.json, source-to-local-map.json, gap-analysis.json, code-reuse-ledger.json, data-model-crosswalk.json, workflow-map.json, ui-visual-inventory.json}` + `.ai-analysis/generated-analysis/source-feature-index.json`
- Related ADRs: 0115 (HealthStack overlays), 0157 (HAPI-FHIR PHI/audit), 0208 (HealthStack clinical cluster), 0103 (API surface), 0123 (codegen plugin), 0215 (version-gated planning)
- Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-airgap-rule]], [[curaos-bun-primary-rule]], [[curaos-postgres-rule]]