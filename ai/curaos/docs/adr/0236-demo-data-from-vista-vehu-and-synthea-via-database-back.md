# ADR-0236: Demo data from VistA-VEHU and Synthea via database-backed seeds

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


Status: Proposed (2026-06-29)
Target Version: v1.1 (HealthStack demo-data depth); v1 binding for the existing Synthea path
Phase: XSRC Phase 12 (ADR drafting)
Extends: ADR-0214 (public-edge demo-slice, synthetic-only posture), ADR-0213 (M15 demo-slice topology), ADR-0157 (HAPI-FHIR PHI audit), ADR-0162 (HIPAA roadmap)
Rules (precedence #1, this ADR is #2): [[curaos-demo-sample-data-rule]] (database-backed, no runtime API mocks), [[curaos-generator-evolution-rule]] (seed via the mold, not per-app), [[curaos-local-vs-3rdparty-rule]] (dual-option, mine-for-completeness), [[curaos-reuse-dry-rule]] (one PHI-vocabulary owner), [[curaos-version-planning-rule]] (file forward, don't drop), [[curaos-healthstack-vision]] (no real PHI by construction)
Lens (binding, dominant): `.ai-analysis/PERSON-CENTRIC-LENS.md` - mine sources for completeness, re-center on the person
Tracking: XSRC backlog epic (issue-tracker; `docs/agents/issue-tracker.md`). Implementation follow-up filed forward as a child of the XSRC epic (see "Implementation follow-up").

---

## Context

CuraOS must show realistic, clinically-coherent data in every app-visible surface (local dev, public demo at `demo.curaos.example.com` per ADR-0214, and live verification sweeps) WITHOUT ever exposing real PHI. [[curaos-demo-sample-data-rule]] is binding: app-visible demo, local dev, public demo, and live-verification data MUST be real data persisted in the backing database through service-owned seeds or fixtures; API mocks are confined to unit tests and CI e2e harnesses and MUST NOT be the demo/runtime data plane.

The HealthStack overlay is the hard case. Faker-style random generation produces demographically plausible but clinically incoherent records (medications without matching conditions, labs without encounters, immunizations off the CVX schedule). A demo of a clinical platform that shows incoherent charts undermines the person-centric promise of the lens (`.ai-analysis/PERSON-CENTRIC-LENS.md`): the patient-app "my-conditions / my-meds / my-visits" timeline must hang together as one coherent journey, and the clinician/management surface must show the same coherent record. Education and Commerce/ERP demo domains do not need clinical coherence and are adequately served by deterministic faker/fishery factories.

What already exists locally (`.ai-analysis/local-project-inventory.json`):

- `@curaos/demo-seed` (`curaos/tools/demo-seed`, maturity: strong, M15-S2 / issue #511) is a generator (not a loader): it emits a deterministic JSON manifest spanning HealthStack + Education + Commerce, with a visible + machine-readable synthetic watermark on every PII-shaped field and a Presidio/PHI gate that fails closed on any non-watermarked or real-looking value. Its HealthStack producer is `importSyntheaBundle`, reading a committed Synthea FHIR R4 fixture at `curaos/tools/demo-seed/fixtures/fhir-r4/synthea-sample-bundle.json`; live Synthea (the Java generator) is env-gated via `SYNTHEA_BUNDLE_DIR`. The PHI vocabulary is reused from `@curaos/healthstack-phi-boundary` (single owner per [[curaos-reuse-dry-rule]]), not forked.
- `gen:service-seed` exists in `@curaos/codegen` (`curaos/tools/codegen`, the PRIMARY INJECTION POINT) with a test at `curaos/tools/codegen/src/service-seed-emit.test.ts`, so per-service seeds are emitted from the mold, not hand-written.

So the question this ADR settles is NOT "should we have database-backed seeds" (the rule already mandates that, and Synthea is already wired). It is: **what is the canonical SOURCE of the HealthStack clinical demo dataset, and do we deepen it beyond the single committed Synthea fixture** so the demo journey is rich enough to be convincing across the full HealthStack surface, while staying license-clean and PHI-free.

This is a deliberate XSRC Phase-12 decision because two strong, Apache-2.0, permissively-licensed source datasets were cloned and indexed for exactly this purpose, and choosing between (and combining) them is a durable architectural commitment.

## Source evidence (cloned + indexed)

From `.ai-analysis/source-catalog.json` (42 cloned repos) and `.ai-analysis/generated-analysis/source-feature-index.json`:

1. **`WorldVistA/VistA-VEHU-M`** - "VEHU (aka CPRS Demo) VistA Test Database", language M, **license `apache-2.0`**, `diskKB` ~11.9 GB, `reuse_mode: clone`. This is the canonical VA "Veterans Health University" CPRS demonstration database: hundreds of long-lived synthetic veteran charts with decades of coherent longitudinal history (problems, meds, labs, vitals, notes, orders, appointments) - the dataset CPRS training has used for years. License register verdict (`.ai-analysis/license-risk-register.json`): VistA-FHIR/`vista-m` family = **`safe-to-vendor`**, Apache-2.0, "safe to vendor or copy verbatim into our self-hosted multi-tenant SaaS + on-prem + air-gap distribution with attribution."

2. **`WorldVistA/VistA-FHIR-Data-Loader`** - "MUMPS/UI components for creating synthetic patient data from **Synthea** and loading the generated FHIR patient data to VistA EHR", **license `apache-2.0`**, `reuse_mode: clone`. Feature-index entry `vista-fhir-loader / healthcare.registration.patient-registration`, `reuse_signal: high`, evidence: `SYNFHIR.m::wsPostFHIR` (lines 22-77) is the orchestration hub calling `importPatient^SYNFPAT`, `importLabs^SYNFLAB`, `importVitals^SYNFVIT`, `importEncounters^SYNFENC`, `importImmu^SYNFIMM`, `importConditions^SYNFPRB`, `importAllergy^SYNFALG`, `importAppointment^SYNFAPT`, `importMeds^SYNFMED2`, `importProcedures`. Files: `external-sources/healthcare/worldvista/VistA-FHIR-Data-Loader/src/SYN*.m`, `README.md`, `docs/VISTA_SYN_DATA_LOADER0P7.TXT`. The README documents the canonical flow: run the Synthea JAR locally (Java 11+) -> emit FHIR R4 bundles -> POST to `wsPostFHIR`. This is the upstream proof that Synthea-to-FHIR is the intended synthetic-data pipeline for VistA-shaped systems.

3. **`WorldVistA/VistA-FHIR-Server-Codex`** - Apache-2.0, `safe-to-vendor`. Feature-index `vista-fhir-codex / Synthea Data Loader Integration`: scripts `vehu10_bootstrap.py`, `local-vehu-to-fhir-intake.sh`, runbook `VEHU_NEW_PATIENT_RUNBOOK_2026-03-16.md` documenting `Synthea JSON -> POST /addpatient -> file 81 update -> validation`, and a `BSTS` terminology service exposing Synthea ValueSets (`extract_synthea_valuesets.py`, `^SYN("2002.030",*)`). This is a second, independent, permissive proof of the VEHU + Synthea + FHIR pattern.

4. **`WorldVistA/docker-vista`** - Apache-2.0. Feature-index evidence: ships a pre-built **VEHU** image variant and a `syntheaPostInstall.sh` post-install hook that "installs synthetic patient" data. Confirms VEHU + Synthea are both first-class, redistributable demo datasets in the VistA ecosystem.

Cross-source mapping (`.ai-analysis/source-to-local-map.json`, 163 mappings): `healthcare.interop.fhir` -> `healthstack-interop-service` (`generator_first_target: contract-typespec`, `reuse: high`); `healthcare.registration.patient-registration` -> `patient-core-service + healthstack-patient-service` cites `vista-fhir-loader` among its sources. The FHIR R4 resource set our HealthStack contracts already model (Patient, Encounter, Condition, AllergyIntolerance, MedicationRequest, Observation/lab+vital, Immunization, Procedure, DiagnosticReport) is exactly the resource set both VEHU and Synthea emit - so neither source requires a new ingestion surface; both land through the existing FHIR import path.

## Local evidence

- `.ai-analysis/local-project-inventory.json`: `@curaos/demo-seed` role = "watermarked synthetic demo-tenant seed generator (M15-S2): Synthea FHIR R4 + faker/fishery education+commerce, Presidio PHI gate, deterministic manifest, fails-closed on unwatermarked PHI." Generator block lists `gen:service-seed` among `@curaos/codegen` emitters; `@curaos/demo-seed` and `@curaos/codegen` both maturity `strong`.
- `curaos/tools/demo-seed/`: `src/producers/health.ts` (`importSyntheaBundle`), `src/gate.ts` (`assertManifestSafe` / `assertSyntheticWatermarkedEntity` / `assertCrossDomainLinkPhiFree`), `src/watermark.ts`, `fixtures/fhir-r4/synthea-sample-bundle.json` (the one committed bundle today), `__tests__/` covering reproducibility, watermark-on-every-entity, missing-watermark reject, unwatermarked-real-PHI reject, cross-domain PHI-leak reject, Presidio scrub clean, CLI smoke.
- `.ai-analysis/gap-analysis.json` maturity distribution: `present-strong: 34, present-weak: 21, partial: 34, stub: 24, absent: 36, stronger-than-source: 14`. The seed *mechanism* is present-strong; the gap this ADR addresses is demo-data *depth/breadth* of the clinical corpus, not a missing capability.
- `.ai-analysis/code-reuse-ledger.json` mode distribution: `E:port-adapt 99, G:pattern-reference-only 51, D:api-adapter 4, C:run-as-background-service 3, H:reject 6`. The VistA permissive FHIR utilities are already mode-A/E (copy-verbatim-with-NOTICE + port-adapt) in the ledger for `@curaos/fhir-client`; the same NOTICE posture covers vendoring VEHU/Synthea-derived FHIR bundles.

## Decision options

### Option 1 - Status quo: single committed Synthea fixture only
Keep `@curaos/demo-seed` exactly as-is: one `synthea-sample-bundle.json`, env-gated live Synthea for those who run the JAR. No VEHU.
- Pro: zero new work; already green; smallest footprint (ponytail rung 1-2).
- Con: one bundle is thin for a full-surface demo; longitudinal depth (decades of coherent history that make the patient-app timeline and clinician chart compelling) is weak; under-uses two cloned, permissively-licensed, purpose-built corpora.

### Option 2 - Synthea-only, but deepen (multi-cohort generated bundles)
Commit a curated set of Synthea-generated FHIR R4 bundles (a small cohort spanning age/sex/condition mixes) and keep VEHU out entirely.
- Pro: single source, single pipeline, Apache-2.0, fully reproducible from the Synthea JAR; no large M-database extraction.
- Con: Synthea cohorts are statistically realistic but each chart is shallower in longitudinal richness and note/order texture than the curated VEHU teaching charts; loses the recognizable, deeply-built demo personas clinicians know from CPRS training.

### Option 3 (recommended) - Synthea as the breadth generator + VEHU as the depth corpus, both via the existing seed path
Make the canonical HealthStack demo dataset the UNION of (a) Synthea-generated FHIR R4 bundles for breadth/cohort variety (reproducible from the JAR, env-gated, committed sample fixtures) and (b) a curated, FHIR-converted subset of VistA-VEHU charts for longitudinal depth (a handful of fully-built demo personas). Both flow through the SAME service-owned import path and the SAME watermark + fail-closed PHI gate; both land in the database through `gen:service-seed`-emitted service seeds. No VEHU M database is shipped or run; only its derived, FHIR-R4, re-watermarked bundles are vendored as fixtures with NOTICE.
- Pro: best demo (breadth from Synthea, depth from VEHU); both sources Apache-2.0 `safe-to-vendor`; reuses the entire existing mechanism (gate, watermark, FHIR import, gen:service-seed); satisfies [[curaos-demo-sample-data-rule]] verbatim; person-centric coherent journeys.
- Con: requires a one-time VEHU-to-FHIR-R4 extraction + re-watermark step and a curation pass; larger committed fixture set (mitigated by keeping the curated VEHU subset small).

### Option 4 - Run VEHU/docker-vista as a live background FHIR source (mode C)
Stand up `docker-vista` (VEHU variant) as a background service and pull demo data live over FHIR at runtime.
- Pro: zero extraction; richest possible corpus.
- Con: **violates [[curaos-demo-sample-data-rule]]** (runtime data plane would be an external service, not the database via service seeds); adds an 11.9 GB M runtime to every deployment model incl. air-gap; the rule confines runtime to real services + the database, not a vendored EHR. Rejected.

## Recommended option

**Option 3.** It is the highest rung that holds against the binding rule and the lens: it makes the database-backed seed (already mandated and already built) the single data plane, sources both breadth and depth from Apache-2.0 `safe-to-vendor` corpora that were cloned for this exact purpose, and adds the minimum new work (a VEHU-to-FHIR extraction + curation feeding the existing `importSyntheaBundle`-shaped path, renamed/generalized to `importFhirBundle`). It loses no feature (lens `no_loss_check`): the management/clinician surface still gets the full coherent chart; the person surface gets the same record re-centered as a journey.

Concretely:

1. Generalize `@curaos/demo-seed`'s HealthStack producer from `importSyntheaBundle` to a source-agnostic `importFhirBundle(dir)` that consumes any FHIR R4 bundle directory; Synthea and VEHU-derived bundles are two fixture sources under `fixtures/fhir-r4/{synthea,vehu}/`. (Single producer, no parallel path - [[curaos-rolling-update-rule]].)
2. Add a one-time, offline VEHU-to-FHIR-R4 extractor (port-adapt of the documented `SYNFHIR.m` resource shapes / `vehu10_bootstrap.py` + `local-vehu-to-fhir-intake.sh` flow under Apache-2.0 NOTICE) that emits a curated subset of demo personas as FHIR R4 bundles. The extractor is a build-time/offline tool, NOT a runtime dependency.
3. Every emitted bundle passes through the existing watermark + Presidio fail-closed gate before it is committed as a fixture or loaded; the watermark + PHI-vocabulary owner stays `@curaos/healthstack-phi-boundary` ([[curaos-reuse-dry-rule]]).
4. Persistence stays service-owned via `gen:service-seed` from `@curaos/codegen` (generator-first); any per-service edge case folds back into the emitter, never a per-service hand-edit ([[curaos-generator-evolution-rule]]).
5. The demo manifest stays deterministic + tenant-aware; runtime paths stay pointed at real services + the database with mocks off, verified by local + public-demo sweeps (ADR-0214 D4 posture).

## Consequences

- One canonical HealthStack demo corpus (Synthea breadth + VEHU depth), loaded only through service-owned database seeds; satisfies [[curaos-demo-sample-data-rule]] across local dev, public demo, and live verification.
- `@curaos/demo-seed` gains a second FHIR fixture source with zero new gate/watermark surface; the generalization (`importSyntheaBundle` -> `importFhirBundle`) is a forward refactor, not a fork.
- The public demo (ADR-0214) gets visibly richer, clinically coherent charts behind Pocket-ID + Presidio fail-closed, with no real PHI by construction - consistent with [[curaos-healthstack-vision]].
- Apache-2.0 NOTICE/attribution obligations attach to the vendored VEHU-derived and Synthea-loader-derived artifacts; a `NOTICE` entry is added wherever those bundles/utilities live.
- Education + Commerce demo domains are unchanged (faker/fishery), so the new clinical corpus does not bloat non-clinical seeds.
- Air-gap stays viable: bundles are committed fixtures (no Synthea JAR or VEHU M runtime needed at deploy); the Synthea JAR stays env-gated for those who want to regenerate breadth.

## Risks

- **Re-identification / residual PHI in VEHU.** VEHU is synthetic/teaching data, but a verbatim chart could still contain free-text that trips the PHI detector. Mitigation: the fail-closed Presidio gate runs on every leaf value before any bundle is committed or loaded; unwatermarked real-looking values reject the bundle. This is the same control that already guards Synthea output.
- **Fixture size / repo bloat.** VEHU is 11.9 GB at source. Mitigation: only a small curated FHIR-converted subset of personas is vendored; the M database is never shipped. Keep the committed VEHU bundle set bounded (a documented persona count).
- **Extraction fidelity.** A naive M-to-FHIR extraction could drop coherence (orphan meds/labs). Mitigation: port the documented `SYNFHIR.m` resource-linking semantics; validate cross-resource references and run the same coherence checks the patient-app timeline relies on.
- **Maintenance drift between the two fixture sources.** Mitigation: single `importFhirBundle` path + single gate; no per-source bespoke loader.
- **Scope creep into a live EHR.** Explicitly out of scope (Option 4 rejected): VEHU/docker-vista is never a runtime data plane.

## License implications

Per `.ai-analysis/license-risk-register.json`:

- `VistA-VEHU-M`, `VistA-FHIR-Data-Loader`, `VistA-FHIR-Server-Codex`, `docker-vista`, `vista-m` family: **Apache-2.0**, verdict **`safe-to-vendor`** - safe to vendor/copy verbatim into the self-hosted multi-tenant SaaS + on-prem + air-gap distribution with attribution; no copyleft on our code; network-use unrestricted. Obligations: preserve `LICENSE` + `NOTICE`, attribution in `NOTICE`, retain warranty disclaimer.
- Synthea itself (synthetichealth.github.io/synthea) is Apache-2.0 upstream; generated output is synthetic and unencumbered.
- Action: add `NOTICE` attribution for the VEHU-derived bundles and any port-adapted Apache-2.0 loader utilities (`SYN*.m` shapes) at their vendored location. No GPL/AGPL/MPL/LGPL source is involved (those copyleft systems in the register are reference-only and are NOT a demo-data source here), so there is no copyleft exposure to the proprietary CuraOS distribution.
- The two `legal-review-required` VistA entries in the register (`vista-vehu` listed with `spdx: unknown` in the `_computed` rollup, and `FamilyHistoryCPRS`) conflict with the authored register's Apache-2.0 verdict for the VistA-VEHU-M repo. Validation step below resolves this: confirm the `WorldVistA/VistA-VEHU-M` repo's own `LICENSE` (catalog reports `apache-2.0`) before any verbatim vendoring; treat as Apache-2.0 on confirmation, else hold.

## Validation needed

1. **License confirmation:** verify `WorldVistA/VistA-VEHU-M` ships an Apache-2.0 `LICENSE` (catalog `license: apache-2.0`) and reconcile the `_computed` rollup's `unknown` entry; capture in PR. Do not vendor verbatim until confirmed.
2. **PHI gate proof:** every committed VEHU-derived and Synthea bundle passes `assertManifestSafe` + Presidio scrub clean (`--presidio`), fails closed on any unwatermarked real-looking value. Add bundles to `__tests__` coverage.
3. **Clinical coherence check:** cross-resource references resolve (meds<->conditions, labs/vitals<->encounters, immunizations on CVX schedule) for the curated VEHU personas; the patient-app "my-conditions / my-meds / my-visits" timeline renders coherently and the clinician surface shows the same record (lens dual-surface, `no_loss_check`).
4. **Rule compliance:** local live sweep + public-demo sweep with API mocks OFF show the seeded data served from real services + the database ([[curaos-demo-sample-data-rule]] step 5; ADR-0214 D4).
5. **Determinism:** fixed-seed manifest reproducibility holds with the union corpus.
6. **Generator-first:** the import-path generalization + any service-seed edge case lands in `@curaos/demo-seed` / `gen:service-seed` (the mold), with a snapshot/test; no per-service hand-edit ([[curaos-generator-evolution-rule]]).

## Implementation follow-up

File a child issue under the **XSRC backlog epic** (issue-tracker per `docs/agents/issue-tracker.md`; make it a child via `parent_id` of the XSRC epic, `Target Version` v1.1 since the v1 Synthea path already satisfies the rule):

- **Story: "HealthStack demo corpus = Synthea breadth + VEHU depth via service-owned seeds (ADR-0221)."** Tasks: (a) generalize `importSyntheaBundle` -> `importFhirBundle` in `@curaos/demo-seed`; (b) offline VEHU-to-FHIR-R4 extractor (Apache-2.0 NOTICE, port-adapt of `SYNFHIR.m` semantics) emitting a bounded curated persona set; (c) re-watermark + PHI-gate every bundle, extend `__tests__`; (d) wire bundles into `gen:service-seed` per-service seeds; (e) NOTICE/attribution entries; (f) license confirmation per Validation #1; (g) local + public-demo mocks-off sweep proof.
- Generator/SDK barrier note: while any `@curaos/codegen` / `gen:service-seed` lane is `agent-claimed`, hold the per-service seed wiring (would inherit the in-flight defect) per [[curaos-generator-evolution-rule]].
- On acceptance: update `RESOLUTION-MAP.md` (this ADR resolves the "canonical HealthStack demo-data source" question) and refresh the doc graph (`bun scripts/check-doc-graph.js`) per workspace DoD §8.

## Precedence note

This ADR is precedence #2. [[curaos-demo-sample-data-rule]], [[curaos-generator-evolution-rule]], [[curaos-reuse-dry-rule]], and [[curaos-version-planning-rule]] are precedence #1 and govern; this ADR only selects the demo-data SOURCE and binds it to those rules. If any rule changes, the rule wins and this ADR gets a resolution-pin per the `RESOLUTION-MAP.md` convention.
