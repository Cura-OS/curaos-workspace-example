# M12 — HealthStack Clinical Overlay: Atomic Story Breakdown

**Date:** 2026-06-04
**Parent Epic:** [#26 — M12 HealthStack clinical overlay foundation](https://github.com/your-org/curaos-ai-workspace/issues/26)
**Source foresight issue:** [#372 — Seed atomic clinical-service Stories under Epic #26 before activation](https://github.com/your-org/curaos-ai-workspace/issues/372)
**Backing research (#329, merged):**
- `ai/curaos/docs/research/m12-fhir-resource-boundary.md`
- `ai/curaos/docs/research/m12-encounter-lifecycle.md`
- `ai/curaos/docs/research/m12-consent-phi-enforcement.md`
- `ai/curaos/docs/research/m12-terminology-licensing.md`
- `ai/curaos/docs/research/m12-regulatory-deadlines.md`

**Governing ADRs/rules:** ADR-0115 (HealthStack overlays), ADR-0208 (cluster: HealthStack clinical services), ADR-0157 (HAPI-FHIR/PHI audit reconciliation), ADR-0161 (clinical SLA enforcement), ADR-0114 (Presidio anonymization), ADR-0203 (calendar-core), ADR-0210/0212 (Diamond party/audit), [[curaos-healthstack-vision]], [[curaos-agent-eval-obs-rule]], [[curaos-postgres-rule]], [[curaos-foresight-rule]], [[curaos-generator-evolution-rule]], [[curaos-foundation-runtime-directives]].

> **Status of this artifact:** BREAKDOWN + SPEC only. No code, no new research. This file IS the deliverable of #372 — the orchestrator copies each `## Story Nx` section into a `gh issue create` body, wires §3.4 parent/child + Project fields, applies native `blocked-by` dependency edges, and labels each `foresight` (quarantined Backlog until M12 activates per [[curaos-foresight-rule]]).

---

## Binding decisions (apply to ALL stories — pre-resolved from #329, NO `[TBD]`)

| Concern | Decision | Source |
|---|---|---|
| FHIR server | **HAPI FHIR JPA 8.x, FHIR R4** — single JPA datastore; ownership enforced by per-service `CapabilityStatement`/`StructureDefinition` profiles + HAPI `AuthorizationInterceptor` write-scopes + `ConsentInterceptor` read-gates (Medplum/IBM-FHIR pattern, NOT a parallel native model). | fhir-resource-boundary §7, §4.3; ADR-0115 §4.1.3 |
| PHI boundary | **Overlay-schema-only.** All PHI lives in per-tenant healthstack PG schemas (CNPG DB-per-tenant). Neutral services see **references + non-PHI metadata only** (charter §5.2/§7/§3). | consent-phi-enforcement §2,§3; charter §5.2 |
| Person identity | Neutral `Party`/`PartyRole` (ADR-0210 Diamond) is canonical. FHIR `Patient`/`Practitioner` = **reference-and-PHI-extension projections**: `Patient.id ⇄ Party id`; PHI fields (name/birthDate/address/MRN) in healthstack schema only. Patient↔Party MPI = ADR-0115 Q4 (DEFERRED, out of M12). | fhir-resource-boundary §4.3 |
| Calendar overlap | Neutral `calendar-core-service` (ADR-0203) owns the generic slot/availability primitive. Clinical `Appointment`/`Slot`/`Schedule` wrap a neutral slot **by id**; the neutral calendar never holds the patient reference or clinical reason. | fhir-resource-boundary §4.3; encounter-lifecycle §4 |
| Audit overlap | FHIR `AuditEvent` reconciled to the neutral Diamond `audit-core` chain per ADR-0157 (three-mode). **No forked ledger.** | fhir-resource-boundary §4.3; ADR-0157 |
| Workflow / state transitions | Clinical state transitions = config in the platform BPM/Flow engine (**Flowable**, ADR-0115 §4 SD-7), NOT hand-rolled — charter §3 "builder-led". Service guard rejects illegal transitions; BPM definition owns the rule set. | encounter-lifecycle §3 |
| Cross-service interaction | **Durable events only** (Redpanda + PG outbox, charter §7). Reuse the M9 audit-outbox codegen template (race-safe lease-claiming, #156). FHIR sync reads are secondary. | encounter-lifecycle §5; [[curaos-foundation-runtime-directives]] |
| Anonymization | **Presidio** (ADR-0114) on egress to LLM/eval/log paths. | consent-phi-enforcement §2; [[curaos-agent-eval-obs-rule]] |
| Terminology server | **Snowstorm (Apache 2.0)**; HAPI FHIR JPA loads LOINC/RxNorm/ICD-10/UCUM open-license. | terminology-licensing §3; ADR-0115 §4.3.3 |
| Scaffold | Generate every service via the codegen trio — **`gen:service <name> --domain=healthstack --plain-service --domain-events --write`** (NOT hand-scaffold). Every uncovered edge folds back into the generator per [[curaos-generator-evolution-rule]]. | M11 story pattern (#338/#344); AGENTS §8 |
| In-flight generator/SDK barrier | Do NOT dispatch any M12 service story while ANY codegen / `@curaos/*-sdk` / `@curaos/contracts` lane carries `agent-claimed:*` or `agent-PR-open`. | [[curaos-generator-evolution-rule]] |

**Per-story DoD addendum (all stories):** `just ci` / `bun run ci` green (paste verbatim stdout per [[curaos-local-ci-first-rule]]); integration tests against real PG + Redpanda + HAPI; `Requirements.md` + `AGENTS.md` + `CONTEXT.md` under `ai/curaos/backend/services/<svc>/`; DOC-GRAPH refresh; `ai/curaos/docs/ISSUE-ROADMAP.md` row; roadmap mirror; ai-mirror gate green.

---

## Wave order (native `blocked-by` dependency edges)

```text
WAVE 1 (roots — no upstream clinical contract)
  Story 1  terminology-service           blocked-by: []        (orders + clinical-doc need code systems)
  Story 2  encounter-service             blocked-by: []        (root clinical lifecycle; owns Encounter)

WAVE 2 (depend on encounter contract / event catalog)
  Story 3  scheduling-service            blocked-by: [encounter-service]
  Story 4  clinical-doc-service          blocked-by: [encounter-service]
  Story 5  orders-service                blocked-by: [encounter-service, terminology-service]

WAVE 3 (cross-cutting gates — verify the whole cluster)
  Story 6  PHI-boundary verification     blocked-by: [encounter-service, scheduling-service, clinical-doc-service, orders-service, terminology-service]
  Story 7  consent enforcement (basic)   blocked-by: [encounter-service, clinical-doc-service, orders-service]
  Story 8  clinical flow E2E + demo      blocked-by: [Story 6, Story 7]   (Epic acceptance criterion #1)
```

Rationale: data flow is `scheduling → encounter → clinical-doc/orders → results` (encounter-lifecycle §5), but **encounter-service owns the `Encounter` resource that scheduling materializes** via the `encounter.requested` event, so encounter is the root and scheduling depends on its contract. Terminology is an independent root (pull-only, no events consumed — terminology-licensing §2 / ADR-0208 §3.15) that orders + clinical-doc depend on for `$validate-code`. PHI-verification + consent gate all five. Story 8 is the Epic's end-to-end acceptance.

---

## Story 1 — terminology-service

**Title:** `[M12][terminology-service] Scaffold terminology-service + Snowstorm front-end + LOINC/RxNorm/ICD-10/UCUM loaders`

```yaml
---
type: story
module: terminology-service
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: L
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved FHIR boundary + terminology licensing)"
blocked-by: []
foresight: true
agent-notes: |
  M12 Wave 1 of 3 (root, no upstream clinical contract). Overlay service per ADR-0208 §3.15.
  Terminology server = Snowstorm (Apache 2.0); HAPI FHIR JPA loads LOINC/RxNorm/ICD-10/UCUM (open-license, NLM/NPM).
  Snowstorm full (pinned ES version) for authoring tenants; Snowstorm Lite (~500MB Lucene, JDK17) for resource-constrained + air-gap edge (terminology-licensing §3, Q11). Do NOT swap OpenSearch into full Snowstorm — IHTSDO does not guarantee compatibility; pin the exact ES version Snowstorm's release tests against.
  SNOMED jurisdiction = curated static member allow-list bundled with the service, refreshed via scheduled Renovate-style review; validated at module activation, NOT query time (terminology-licensing §4, Q2). Air-gap: RF2 snapshots bundled per national edition; no live SNOMED International calls in air-gap mode.
  Generate via codegen trio: gen:service terminology --domain=healthstack --plain-service --domain-events --write. In-flight generator/SDK barrier applies.
  Root producer — no upstream contract dependency; pull-only API (consumes no events).
---
```

**Problem.** M12 clinical services (`orders`, `clinical-doc`, problems) need FHIR terminology operations (`$expand`/`$lookup`/`$validate-code`/`$translate`) over SNOMED CT + LOINC + RxNorm + ICD-10 + UCUM. No terminology service exists. It is the independent root the order/doc services depend on for code validation.

**Scope (in).**
- Generate `terminology-service` via `gen:service terminology --domain=healthstack --plain-service --domain-events --write` (NestJS overlay module + HAPI FHIR JPA wiring + Snowstorm front-end + TypeSpec REST + AsyncAPI catalog + Vitest). Do NOT hand-scaffold.
- Owns FHIR R4 `CodeSystem` / `ValueSet` / `ConceptMap` (fhir-resource-boundary §4.1).
- Unified terminology API over **Snowstorm** (SNOMED CT) + HAPI built-in (LOINC/RxNorm/ICD-10/UCUM): `$expand`, `$lookup`, `$validate-code`, `$translate` (ConceptMap), plus `GET /terminology/suggest?text=&system=snomed` coding-assist (ADR-0208 §3.15).
- **Snowstorm distribution:** full (pinned ES version) for authoring tenants; Snowstorm Lite (~500MB Lucene) for resource-constrained + air-gap edge (terminology-licensing §3). Pin exact ES version per Snowstorm release matrix.
- **SNOMED jurisdiction:** bundled static ISO-3166-1-alpha-2 member allow-list + scheduled human review; validate `tenant.terminology_jurisdiction` at module activation; non-member jurisdiction blocks SNOMED activation until a commercial-license id is recorded in tenant config (terminology-licensing §4).
- ICD-10-CM→SNOMED (NLM GEM) + LOINC→SNOMED Observable-Entity ConceptMaps; tenant value sets in HAPI JPA, versioned in Apicurio (ADR-0208 §3.15).
- Air-gap: RF2 SNOMED snapshots bundled per national edition via Zarf (M8 path); no live SNOMED International calls.
- Observability default-on (OTel + structured logs + metrics).

**Acceptance criteria.**
1. Service generated via the codegen trio, builds clean; lookups < 100ms p95 (Epic AC #5).
2. `$expand`/`$lookup`/`$validate-code`/`$translate` return correct results against bundled SNOMED + LOINC + RxNorm + ICD-10 + UCUM.
3. SNOMED national edition loads via Zarf bundle (Epic AC #4); air-gap mode makes zero external calls (CI assertion).
4. Module activation rejects a non-member `tenant.terminology_jurisdiction` lacking a commercial-license id.
5. Emits `healthstack.terminology.valueset-updated` (AsyncAPI published); consumes no events.
6. Per-story DoD addendum green.

**Integration points.**
- **Produces:** `healthstack.terminology.valueset-updated` (Redpanda + outbox) → triggers downstream re-validation.
- **Consumes:** none (pull-only — services call its APIs on demand; ADR-0208 §3.15).
- **Contracts:** TypeSpec REST + AsyncAPI catalog; FHIR `CodeSystem`/`ValueSet`/`ConceptMap` profiles.
- **PHI-boundary placement:** terminology data is **reference data, not PHI** — lives in the healthstack service but carries no patient data; still an overlay service (charter §5.2). Tenant config flag `tenant.terminology_jurisdiction` only.
- **File path:** `curaos/backend/services/terminology-service/` (ai-docs at `ai/curaos/backend/services/terminology-service/`).

**Out of scope.** Drug-interaction checking (Q7 — see Story 5); imaging terminology; deep CDA terminology binding; no-show ML; FHIR R6 terminology (Q1 deferred).

---

## Story 2 — encounter-service

**Title:** `[M12][encounter-service] Scaffold encounter-service + FHIR R4 Encounter lifecycle state machine (Flowable-gated) + outbox events`

```yaml
---
type: story
module: encounter-service
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: L
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved encounter lifecycle + FHIR boundary)"
blocked-by: []
foresight: true
agent-notes: |
  M12 Wave 1 of 3 (root clinical lifecycle; owns FHIR Encounter/EpisodeOfCare). Overlay service per ADR-0208.
  Encounter state machine = FHIR R4 Encounter.status (planned→arrived→triaged→in-progress→{onleave}→finished + cancelled/entered-in-error) (encounter-lifecycle §3). Encounter.class = R4 act-code (IMP/AMB/EMER/HH/VR). R6 status set = deferred-migration (Q1).
  Transitions gated by Flowable BPM rule set (ADR-0115 §4 SD-7), NOT hand-rolled — charter §3 builder-led. Service guard rejects illegal transitions; each transition emits a durable encounter.status-changed outbox event.
  Patient = reference-and-PHI-extension projection keyed to neutral Party id (ADR-0210); PHI fields in healthstack schema only.
  SLA timers attach at named transitions via ADR-0161 machinery — M12 emits start/stop events only (encounter-lifecycle §6).
  Generate via codegen trio: gen:service encounter --domain=healthstack --plain-service --domain-events --write. In-flight generator/SDK barrier applies. Root producer — no upstream clinical contract.
---
```

**Problem.** The clinical encounter (admit→discharge) is the spine of the M12 flow — clinical docs + orders are authored within the `in-progress` window, scheduling materializes the encounter, SLA timers fire on its transitions. No encounter-service exists.

**Scope (in).**
- Generate `encounter-service` via `gen:service encounter --domain=healthstack --plain-service --domain-events --write`. Do NOT hand-scaffold.
- Owns FHIR R4 `Encounter` + `EpisodeOfCare` (overlay PHI; fhir-resource-boundary §4.1).
- **Encounter state machine** (FHIR R4 `Encounter.status`, encounter-lifecycle §3): `planned → arrived → triaged → in-progress → {onleave} → finished`, plus `cancelled` / `entered-in-error`. Legal-transition table per encounter-lifecycle §3 (e.g. `in-progress → {onleave|finished|cancelled}`). `Encounter.class` = R4 act-code (`IMP`/`AMB`/`EMER`/`HH`/`VR`). Inpatient admit→discharge = `arrived→in-progress→finished` with `Encounter.period` bracketing; `EpisodeOfCare` groups encounters.
- **Transition enforcement = Flowable BPM** (ADR-0115 §4 SD-7), NOT hand-rolled. NestJS service exposes the FHIR `Encounter` write API; HAPI persists; service guard + BPM definition reject illegal transitions.
- Each transition emits durable `encounter.status-changed` (+ `encounter.requested`, `encounter.in-progress`, `encounter.finished`) via outbox (reuse M9 audit-outbox template).
- `Patient`/`Practitioner` referenced as projections keyed to neutral `Party` id; PHI fields persist in healthstack schema only (fhir-resource-boundary §4.3).
- SLA timers attached at named transitions emit start/stop signals to ADR-0161 machinery (link only, no SLA logic duplicated; encounter-lifecycle §6).
- Observability default-on; tenant routing; PHI in healthstack schema.

**Acceptance criteria.**
1. Service generated via codegen trio, builds clean.
2. Encounter write API persists to HAPI; illegal `status` transition rejected by guard + BPM (unit + integration).
3. `arrived→in-progress→finished` inpatient path with `Encounter.period` produces a complete admit→discharge record.
4. Emits `encounter.requested` / `encounter.status-changed` / `encounter.in-progress` / `encounter.finished` (AsyncAPI published).
5. `Patient` reference resolves to neutral `Party` id; no PHI written to any neutral schema.
6. Per-story DoD addendum green.

**Integration points.**
- **Produces:** `encounter.requested`, `encounter.status-changed`, `encounter.in-progress`, `encounter.finished` (consumed by scheduling, clinical-doc, orders, billing, audit; encounter-lifecycle §5).
- **Consumes:** `scheduling`'s `checked-in`/`arrived` trigger to materialize the encounter (event-led; encounter-service is downstream-of-scheduling at runtime but the **contract producer** — scheduling is `blocked-by` encounter because scheduling references the encounter contract).
- **Contracts:** TypeSpec REST + AsyncAPI; FHIR `Encounter`/`EpisodeOfCare` profiles; `CapabilityStatement` write-scope.
- **PHI-boundary placement:** `Encounter`/`EpisodeOfCare` = Class A overlay-owned PHI in healthstack schema; `Patient` ref → neutral `Party` id only.
- **File path:** `curaos/backend/services/encounter-service/`.

**Out of scope.** FHIR R6 status vocabulary (Q1 deferred); claims/billing integration (post-GA); EMS (post-GA); care plans/quality measures (post-GA).

---

## Story 3 — scheduling-service

**Title:** `[M12][scheduling-service] Scaffold scheduling-service + FHIR R4 Appointment/Slot booking over neutral calendar-core + encounter materialization`

```yaml
---
type: story
module: scheduling-service
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved scheduling state model + calendar overlap)"
blocked-by: [encounter-service]
foresight: true
agent-notes: |
  M12 Wave 2 of 3. Overlay service. Booking flow = FHIR R4 Appointment + Slot over neutral calendar-core slots (ADR-0203), referenced by id; the neutral calendar never learns the patient or clinical reason (charter §5.2; fhir-resource-boundary §4.3).
  Appointment.status: proposed|pending|booked|arrived|fulfilled|cancelled|noshow|entered-in-error|checked-in|waitlist. Slot.status: busy|free|busy-unavailable|busy-tentative|entered-in-error (encounter-lifecycle §4).
  checked-in/arrived materializes the Encounter (emits encounter.requested to encounter-service). Appointment→fulfilled when linked Encounter reaches finished.
  Pre-appointment intake = FHIR Questionnaire/QuestionnaireResponse (overlay PHI). No-show ML = optional Python FastAPI sidecar, OUT of M12 core.
  Booking-type→Encounter.class mapping per ADR-0115 §4 SD-7. Generate via codegen trio: gen:service scheduling --domain=healthstack --plain-service --domain-events --write. blocked-by encounter-service contract (native edge = W2 gate). Barrier applies.
---
```

**Problem.** Clinical appointment booking over clinician/room/equipment resources is the entry point to the clinical flow and the trigger that materializes the encounter. No scheduling-service exists; it must wrap the neutral `calendar-core` slot without leaking PHI into it.

**Scope (in).**
- Generate `scheduling-service` via `gen:service scheduling --domain=healthstack --plain-service --domain-events --write`. Do NOT hand-scaffold.
- Owns FHIR R4 `Appointment` / `AppointmentResponse` / `Slot` / `Schedule` (clinical; overlay PHI; fhir-resource-boundary §4.1).
- **Booking flow** (encounter-lifecycle §4): query neutral `calendar-core` for `free` slots over `Practitioner`/`Location`/`Device` resources → create `Appointment` (`proposed`/`pending`) → `AppointmentResponse` → `booked`; neutral slot flips `free→busy` **by id reference** (neutral calendar never learns patient/clinical-reason — charter §5.2).
- `Appointment.status` machine: `proposed|pending|booked|arrived|fulfilled|cancelled|noshow|entered-in-error|checked-in|waitlist`. `Slot.status`: `busy|free|busy-unavailable|busy-tentative|entered-in-error`.
- **Encounter materialization:** `checked-in`/`arrived` emits `encounter.requested` → encounter-service creates `Encounter(planned/arrived)`. `Appointment→fulfilled` when the linked `Encounter` reaches `finished`; `noshow`/`cancelled` releases the slot back to `free`.
- Pre-appointment intake: FHIR `Questionnaire` + `QuestionnaireResponse` (overlay PHI).
- Booking types (recurring/episodic/same-day/urgent/telehealth) map onto `Encounter.class` (ADR-0115 §4 SD-7).
- Transitions Flowable-gated; observability default-on.

**Acceptance criteria.**
1. Service generated via codegen trio, builds clean.
2. Booking flow flips a neutral `calendar-core` slot `free→busy` by id; neutral calendar row carries **no** patient reference or clinical reason (integration assertion against the neutral schema).
3. `checked-in`/`arrived` emits `encounter.requested`; encounter-service materializes `Encounter` (cross-service integration test).
4. `Appointment→fulfilled` on `encounter.finished`; `noshow`/`cancelled` releases the slot.
5. Emits `appointment.booked` / `appointment.checked-in` (+ `encounter.requested`); consumes `encounter.finished`.
6. Per-story DoD addendum green.

**Integration points.**
- **Produces:** `encounter.requested` (to encounter-service), `appointment.booked`, `appointment.status-changed`.
- **Consumes:** `encounter.finished` (to fulfill the appointment); neutral `calendar-core` slot API (by id).
- **Contracts:** TypeSpec REST + AsyncAPI; FHIR `Appointment`/`Slot`/`Schedule` profiles. Depends on encounter-service's `encounter.*` event contract (native `blocked-by`).
- **PHI-boundary placement:** clinical `Appointment`/`Slot`/`Schedule`/`Questionnaire*` = overlay PHI; neutral `calendar-core` slot referenced by id only (no PHI).
- **File path:** `curaos/backend/services/scheduling-service/`.

**Out of scope.** No-show prediction ML sidecar (later enhancement); resource-optimization scheduling; waitlist auto-fill automation; external calendar federation.

---

## Story 4 — clinical-doc-service

**Title:** `[M12][clinical-doc-service] Scaffold clinical-doc-service + FHIR Composition/DocumentReference + IHE MHD profile set + CDA-as-attachment bridge`

```yaml
---
type: story
module: clinical-doc-service
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved clinical-doc model + CDA bridge)"
blocked-by: [encounter-service]
foresight: true
agent-notes: |
  M12 Wave 2 of 3. Overlay service. Clinical docs = FHIR R4 Composition (structured doc) + DocumentReference (indexable pointer) + DiagnosticReport/ClinicalImpression (consent-phi-enforcement §4). Owns Consent/Provenance/clinical AuditEvent too (fhir-resource-boundary §4.1), reconciled to audit-core per ADR-0157.
  Document exchange = IHE MHD IG deployed as HAPI FHIR profile set (FHIR-native XDS equivalent). CDA carried as DocumentReference.content attachment for M12 (HAPI Structures CDA, Apache 2.0; linuxforhealth/fhir-to-cda-converter Apache 2.0, ADR-0115 SD-16); deep bidirectional structured CDA transform DEFERRED to interop milestone.
  Authoring GATED to the in-progress Encounter window (consume encounter.in-progress / encounter.finished). Documents reference Encounter + Patient (overlay PHI). Versioning via FHIR resource history.
  Generate via codegen trio: gen:service clinical-doc --domain=healthstack --plain-service --domain-events --write. blocked-by encounter-service. Barrier applies.
---
```

**Problem.** Clinical note authoring + versioning is a core M12 deliverable (Epic AC #1). Notes must be gated to the active encounter window and exchangeable via a FHIR-native document registry. No clinical-doc-service exists.

**Scope (in).**
- Generate `clinical-doc-service` via `gen:service clinical-doc --domain=healthstack --plain-service --domain-events --write`. Do NOT hand-scaffold.
- Owns FHIR R4 `Composition` / `DocumentReference` / `DiagnosticReport` / `ClinicalImpression`, plus clinical `Consent` / `Provenance` / `AuditEvent` (fhir-resource-boundary §4.1; consent-phi-enforcement §4).
- **Document model** (consent-phi-enforcement §4): `Composition` (structured doc) + `DocumentReference` (indexable pointer/metadata). Versioning via FHIR resource history.
- **Document exchange = IHE MHD IG as a HAPI FHIR profile set** (FHIR-native XDS equivalent; ADR-0115 §4 SD-16).
- **CDA bridge:** CDA documents carried as `DocumentReference.content` attachments for M12, using HAPI Structures CDA (Apache 2.0) + `linuxforhealth/fhir-to-cda-converter` (Apache 2.0, ADR-0115 SD-16). Deep bidirectional structured CDA transform DEFERRED to a later interop milestone (flagged, not in M12 core).
- **Authoring gated to the `in-progress` encounter window** (consume `encounter.in-progress`; close on `encounter.finished`; encounter-lifecycle §5). Documents reference `Encounter` + `Patient` (overlay PHI).
- Provenance + clinical AuditEvent reconciled to neutral `audit-core` per ADR-0157.
- Observability default-on; PHI in healthstack schema.

**Acceptance criteria.**
1. Service generated via codegen trio, builds clean.
2. `Composition`/`DocumentReference` authored, versioned (FHIR history returns prior versions), persisted to HAPI in the healthstack schema.
3. Authoring outside the `in-progress` encounter window is rejected (integration test).
4. IHE MHD `$submit`/retrieve roundtrips a document; CDA carried as `DocumentReference.content`.
5. Emits `clinicaldoc.authored`; consumes `encounter.in-progress` + `encounter.finished`; clinical `AuditEvent` reconciled to audit-core.
6. Per-story DoD addendum green.

**Integration points.**
- **Produces:** `clinicaldoc.authored` (SLA stop-signal for discharge-summary timer per ADR-0161).
- **Consumes:** `encounter.in-progress`, `encounter.finished`; terminology `$validate-code` (optional for coded sections).
- **Contracts:** TypeSpec REST + AsyncAPI; FHIR `Composition`/`DocumentReference`/`DiagnosticReport` + IHE MHD profiles. Depends on encounter contract (native `blocked-by`).
- **PHI-boundary placement:** all documents = Class A overlay PHI in healthstack schema; `Patient`/`Encounter` refs by id; clinical `AuditEvent` → audit-core reconciliation (ADR-0157), no forked ledger.
- **File path:** `curaos/backend/services/clinical-doc-service/`.

**Out of scope.** Deep bidirectional structured CDA↔FHIR transform (later interop milestone); XDS-on-XDS.b registry; document AI summarization; e-signature flow (neutral e-sign service integration, post-GA).

---

## Story 5 — orders-service

**Title:** `[M12][orders-service] Scaffold orders-service + FHIR ServiceRequest/Task CPOE state model + Observation/DiagnosticReport results (internal)`

```yaml
---
type: story
module: orders-service
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved orders→results flow + terminology + Q7 drug-source)"
blocked-by: [encounter-service, terminology-service]
foresight: true
agent-notes: |
  M12 Wave 2 of 3. Overlay service. Orders→results = FHIR R4 ServiceRequest (draft→active→completed) → Task (fulfillment) → Observation/DiagnosticReport referencing the ServiceRequest + Encounter (encounter-lifecycle §5). M12 scopes the INTERNAL CPOE state model only; external fulfiller routing (LIS/PACS) DEFERRED past M12 core.
  Order entry validates codes via terminology-service ($validate-code) — native blocked-by terminology.
  Medication-order shell: MedicationRequest coded with RxNorm (public domain) backbone for ALL deployments. Lab order = ServiceRequest+LOINC. Imaging order = ServiceRequest stub (full ImagingStudy/DICOM path is healthstack-imaging-service, post-GA).
  ⚠️ Q7 (drug-interaction source) is OPERATOR-GATED — see body. DEFAULT/non-blocking path = RxNorm (public domain) + OpenFDA/DailyMed; FDB (paid, comprehensive) is the operator-licensed upgrade behind tenant flag. DrugBank Open CC BY-NC is EXCLUDED from commercial SaaS. Drug-interaction checking itself is post-GA — M12 ships only the RxNorm-coded MedicationRequest shell + the pluggable source seam.
  Generate via codegen trio: gen:service orders --domain=healthstack --plain-service --domain-events --write. blocked-by encounter + terminology. Barrier applies.
---
```

**Problem.** Order entry (CPOE) for medication/lab/imaging is the last leg of the M12 flow (Epic AC #1: schedule→encounter→note→order→audit). Orders must validate codes via terminology and emit fulfillment/result events. No orders-service exists.

**Scope (in).**
- Generate `orders-service` via `gen:service orders --domain=healthstack --plain-service --domain-events --write`. Do NOT hand-scaffold.
- Owns FHIR R4 `ServiceRequest` / `Task` / `Specimen` / `Observation` (results) (fhir-resource-boundary §4.1).
- **CPOE state model** (encounter-lifecycle §5): `ServiceRequest` (`draft → active → completed`) carries a `Task` for fulfillment; results return as `Observation` + `DiagnosticReport` referencing the `ServiceRequest` + `Encounter`. **M12 scopes the INTERNAL state model only** — external fulfiller routing (LIS/PACS) deferred past M12 core.
- **Order shells:**
  - Lab order = `ServiceRequest` coded with **LOINC** (via terminology `$validate-code`).
  - Medication order = `MedicationRequest` shell coded with **RxNorm** (public domain) — canonical Medication coding for ALL deployments (terminology-licensing §7).
  - Imaging order = `ServiceRequest` stub only (full `ImagingStudy`/DICOM path = `healthstack-imaging-service`, post-GA — ADR-0208 §3.7).
- Order entry validates codes against terminology-service (native dependency).
- **⚠️ Q7 drug-interaction source — OPERATOR-GATED (see below).** M12 ships only the RxNorm-coded `MedicationRequest` shell + a **pluggable drug-source seam**; actual drug-interaction checking is post-GA.
- Authored within the `in-progress` encounter window; observability default-on; PHI in healthstack schema.

**Q7 handling (operator-gated, NOT hard-blocked) — terminology-licensing §7.**
- **Default / commercial-OK path (non-blocking, shipped in M12):** **RxNorm (public domain)** as the drug-coding backbone for all deployments + **OpenFDA/DailyMed (public domain)** for labeling/adverse-event surfacing. This is the ADR's own pointed-to position and is SaaS-safe with zero paid license.
- **Operator-licensed upgrade (behind tenant flag):** **FDB (First Databank, paid)** for comprehensive US clinical drug-drug interaction checking in commercial deployments — selected via a `tenant.drug_interaction_source` flag; legal/cost sign-off decides per deployment.
- **Excluded from commercial SaaS:** **DrugBank Open (CC BY-NC 4.0)** — non-commercial only; usable only in non-commercial/on-prem and must be license-gated out of SaaS distribution.
- M12 implements the **source seam** (interface + RxNorm/OpenFDA default impl) so enabling FDB later is config, not a fork. Q7 is surfaced as an operator decision, not a blocker.

**Acceptance criteria.**
1. Service generated via codegen trio, builds clean.
2. `ServiceRequest` (`draft→active→completed`) with a `Task`; `Observation`+`DiagnosticReport` reference the `ServiceRequest` + `Encounter` (internal CPOE roundtrip integration test).
3. Lab order validates a LOINC code and medication order a RxNorm code via terminology-service.
4. Order authoring outside the `in-progress` encounter window is rejected.
5. Drug-source seam present with RxNorm/OpenFDA default impl; FDB path selectable by `tenant.drug_interaction_source` flag (no FDB binary required in M12); DrugBank Open blocked in commercial-SaaS build.
6. Emits `order.requested` / `order.fulfilled` / `result.available`; consumes `encounter.in-progress`.
7. Per-story DoD addendum green.

**Integration points.**
- **Produces:** `order.requested`, `order.fulfilled`, `result.available` (SLA timer start/stop per ADR-0161; encounter-lifecycle §5,§6).
- **Consumes:** `encounter.in-progress` (authoring gate); terminology `$validate-code`.
- **Contracts:** TypeSpec REST + AsyncAPI; FHIR `ServiceRequest`/`Task`/`Observation`/`DiagnosticReport`/`MedicationRequest` profiles. Native `blocked-by` encounter + terminology.
- **PHI-boundary placement:** orders/results = Class A overlay PHI in healthstack schema; `Patient`/`Encounter` refs by id.
- **File path:** `curaos/backend/services/orders-service/`.

**Out of scope.** External LIS/PACS fulfiller routing; full imaging `ImagingStudy`/DICOM (`healthstack-imaging-service`, post-GA — Q6 imaging-store note carried there, see Story note below); drug-interaction *checking* engine (post-GA — M12 ships seam + RxNorm coding only); ePrescribing transmission (Surescripts, post-GA).

> **Q6 imaging-store note (carried, operator-gated, non-blocking):** The full DICOM/PACS imaging path is `healthstack-imaging-service` (post-GA, ADR-0208 §3.7), NOT this story — orders only emits the imaging `ServiceRequest` stub. When imaging lands, the DICOM store is **operator-gated (Q6)**: the **default / commercial-OK path is dcm4chee (LGPL 2.1)** — SaaS-safe, IHE-comprehensive, zero paid license, the ADR's own stated contingency; **Orthanc (GPLv3)** requires a paid commercial exception and legal sign-off. M12 is NOT hard-blocked because dcm4chee is the documented default (terminology-licensing §6).

---

## Story 6 — PHI-boundary verification

**Title:** `[M12][healthstack] PHI-boundary verification harness — 6-layer defense CI scan + runtime check across all 5 clinical services`

```yaml
---
type: story
module: healthstack-phi-boundary
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved 6-layer PHI defense)"
blocked-by: [encounter-service, scheduling-service, clinical-doc-service, orders-service, terminology-service]
foresight: true
agent-notes: |
  M12 Wave 3 of 3 (cross-cutting gate). PHI boundary = 6-layer defense, ALL from accepted ADRs (consent-phi-enforcement §3,§7): (1) PG schema role isolation [healthstack schemas readable only by healthstack service accounts]; (2) service FHIR-only access; (3) APISIX route guard HealthStack-Active:true; (4) Opengrep CI rule (ADR-0108) blocking neutral-core imports of healthstack PG schemas; (5) Presidio egress scrub (ADR-0114) on LLM/eval/log paths; (6) reference-only audit envelope (ADR-0212) reconciled per ADR-0157.
  This story = the VERIFICATION HARNESS (CI scan + runtime check) proving Epic AC #2 (PHI never leaves overlay schemas). Charter §5.2.
  blocked-by all 5 services (verifies the whole cluster). No new infra — assembles accepted-ADR controls into a green gate. Barrier applies.
---
```

**Problem.** Epic AC #2 requires PHI never to leave overlay schemas, proven by CI scan + runtime check. The 6 enforcement layers exist as accepted-ADR controls but no harness asserts them end-to-end across the 5 clinical services. This is the HIPAA-boundary gate ([[curaos-healthstack-vision]], charter §5.2).

**Scope (in).**
- Assemble + verify the **6-layer PHI defense** (consent-phi-enforcement §3,§7 — all from accepted ADRs, nothing new to decide):
  1. **PG schema-role isolation** — healthstack per-tenant schemas readable only by healthstack service accounts (CNPG DB-per-tenant, [[curaos-postgres-rule]]).
  2. **Service FHIR-only access** — clinical services reach PHI only via HAPI FHIR APIs.
  3. **APISIX route guard** — `HealthStack-Active: true` tenant flag gates HAPI endpoints (ADR-0115 §5).
  4. **Opengrep CI rule** (ADR-0108) — blocks neutral-core code from importing healthstack PG schemas; runs in `just ci`.
  5. **Presidio egress scrub** (ADR-0114) — on LLM/eval/log egress paths.
  6. **Reference-only audit envelope** (ADR-0212) — neutral consumers (`party-core`, `notify`, `search`, `audit-core`) receive references + non-PHI metadata only; FHIR `AuditEvent` reconciled per ADR-0157.
- **CI scan:** Opengrep rule green; static assertion that no neutral service references a healthstack schema or FHIR PHI field.
- **Runtime check:** integration test that exercises each of the 5 services and asserts a neutral consumer of their events receives reference+metadata only (no PHI value); Presidio scrubs PHI on a simulated LLM/log egress.

**Acceptance criteria.**
1. Opengrep CI rule blocks a deliberately-injected neutral→healthstack-schema import (negative test green).
2. Runtime check: each clinical service's outbound event/payload to a neutral consumer carries references + non-PHI metadata only (no name/birthDate/address/MRN) — asserted across all 5 services.
3. APISIX route guard rejects a clinical FHIR call for a tenant without `HealthStack-Active: true`.
4. Presidio scrubs PHI on a simulated egress path (eval/log/LLM).
5. HIPAA boundary scan green (Epic DoD); wired into `just ci`.
6. Per-story DoD addendum green (this story's docs land under `ai/curaos/backend/services/` cross-cutting + `ai/curaos/docs/`).

**Integration points.**
- **Produces:** a reusable PHI-boundary CI + runtime gate (consumed by Epic acceptance + every future healthstack service).
- **Consumes:** all 5 clinical services' schemas + event catalogs; APISIX config; Opengrep config; Presidio sidecar.
- **Contracts:** no new FHIR contracts — verifies existing ones.
- **PHI-boundary placement:** THIS IS the boundary gate — asserts overlay-schema-only invariant (charter §5.2).
- **File path:** harness under `curaos/backend/` shared tooling + `curaos/scripts/` CI hooks; ai-docs cross-cutting.

**Out of scope.** Consent enforcement logic (Story 7); 42 CFR Part 2 / TEFCA QHIN security-label filter (Q9 — design proposed, binding compliance policy deferred); MPI/patient-matching (Q4 deferred); key-management for AuditEvent pseudonymization (Q14 residual, pre-prod security-review item).

---

## Story 7 — consent enforcement (basic)

**Title:** `[M12][healthstack] Basic consent enforcement — FHIR Consent + HAPI ConsentInterceptor (REJECT blocks) + SMART scopes, < 1s reflect`

```yaml
---
type: story
module: healthstack-consent
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved consent enforcement stack)"
blocked-by: [encounter-service, clinical-doc-service, orders-service]
foresight: true
agent-notes: |
  M12 Wave 3 of 3 (cross-cutting gate). Consent = FHIR Consent (R4) + HAPI ConsentInterceptor (REJECT now blocks writes, ADR-0115 §4.1.1/§4.14.3) + SMART scopes (app auth) + BPPC (legacy) — COMPOSED, not substituted (consent-phi-enforcement §5.1,§7).
  M12 = BASIC consent (Epic scope): patient consent toggle blocks data flows, reflected in service responses < 1s (Epic AC #3). Consent v2 (granular per-purpose) = M14, OUT of scope.
  Consent resource owned by clinical-doc-service (fhir-resource-boundary §4.1); this story wires the interceptor + toggle across encounter/clinical-doc/orders read+write paths.
  Q9 (42 CFR Part 2 / TEFCA QHIN security-label outbound filter) = design proposed, binding compliance policy DEFERRED to compliance-review — NOT in M12 basic-consent code. Generate-where-applicable via codegen; barrier applies. blocked-by encounter+clinical-doc+orders (the read/write paths it gates).
---
```

**Problem.** Epic AC #3 requires a patient consent toggle that blocks data flows and reflects in service responses < 1s. M12 needs *basic* consent (toggle), composed from accepted-ADR pieces, wired across the clinical read/write paths. No consent enforcement is wired yet.

**Scope (in).**
- **Consent stack** (consent-phi-enforcement §5.1, composed not substituted):
  - FHIR R4 **`Consent`** resource (owned by clinical-doc-service; fhir-resource-boundary §4.1).
  - **HAPI `ConsentInterceptor`** (HAPI 8.x — `REJECT` blocks writes, ADR-0115 §4.1.1/§4.14.3) gating reads + writes.
  - **SMART scopes** for app authorization.
  - **BPPC** (Basic Patient Privacy Consents) for legacy interchange.
- **Basic consent toggle** (M12 Epic scope): a patient consent toggle that blocks clinical data flows; reflected in service responses **< 1s** (Epic AC #3) across encounter / clinical-doc / orders read+write paths.
- Wire the interceptor + toggle into the 3 PHI-authoring services' FHIR access (encounter, clinical-doc, orders).
- Observability default-on (consent-decision spans/metrics).

**Acceptance criteria.**
1. Toggling a patient `Consent` to deny blocks reads/writes of that patient's clinical resources via `ConsentInterceptor` (REJECT) across encounter/clinical-doc/orders.
2. Consent change reflects in service responses in **< 1s** (Epic AC #3) — measured integration test.
3. SMART-scoped app token is required + honored for clinical FHIR access.
4. Re-enabling consent restores access; decision is audited (reconciled to audit-core).
5. Per-story DoD addendum green.

**Integration points.**
- **Produces:** consent-decision events/metrics; `Consent` write path (in clinical-doc-service).
- **Consumes:** patient `Consent` resource; encounter/clinical-doc/orders FHIR read+write paths; SMART scope claims (identity-service / Keycloak, ADR-0104).
- **Contracts:** FHIR `Consent` profile + `ConsentInterceptor` config; SMART scopes. Native `blocked-by` the 3 services it gates.
- **PHI-boundary placement:** consent gate sits in front of overlay-PHI access; `Consent` itself = overlay PHI; decisions audited via reference-only envelope (ADR-0212).
- **File path:** interceptor config + wiring across `curaos/backend/services/{encounter,clinical-doc,orders}-service/`; `Consent` model in clinical-doc-service.

**Out of scope.** Consent v2 — granular per-purpose consent (M14, Epic scope-out); 42 CFR Part 2 / TEFCA QHIN security-label outbound filter (Q9 — design proposed in research, binding compliance policy is a deferred compliance-review item, NOT M12 basic-consent code); DS4P data-segmentation labels (with Q9); GDPR erasure key-management (Q14 residual, pre-prod security-review).

---

## Story 8 — clinical flow E2E + demo

**Title:** `[M12][healthstack] End-to-end clinical flow E2E + demo: schedule → encounter → note → order → audit (Epic acceptance)`

```yaml
---
type: story
module: healthstack-e2e
milestone: M12
cycle: C5-HealthStack-Phase-A
initiative: HealthStack
priority: high
effort: M
parent: your-org/curaos-ai-workspace#26
requires:
  - "your-org/curaos-ai-workspace#329 (research resolved cross-service clinical flow)"
blocked-by: [healthstack-phi-boundary, healthstack-consent]
foresight: true
agent-notes: |
  M12 Wave 3 of 3 (Epic acceptance gate). Proves Epic AC #1 (patient → schedule encounter → clinical note → order → audit chain end-to-end) + the Epic DoD demo (schedule → encounter → note → order → audit). Cross-service flow is event-led (encounter.* / clinicaldoc.* / order.* / result.* over Redpanda + outbox; encounter-lifecycle §5).
  blocked-by the two Wave-3 gates (PHI-boundary + consent) so the E2E runs with the boundary + consent invariants active. No new service — an integration/E2E harness + seed + demo runbook spanning all 5 services. Barrier applies.
---
```

**Problem.** Epic AC #1 + the Epic DoD demo require a proven end-to-end chain `patient → schedule encounter → clinical note → order → audit`. The 5 services + 2 gates exist by this point but nothing exercises the full event-led flow as one acceptance artifact.

**Scope (in).**
- E2E/integration harness exercising the full flow (encounter-lifecycle §5): `Appointment.booked → checked-in → encounter.requested → Encounter(in-progress) → clinicaldoc.authored + order.requested → ServiceRequest/Task → Observation/DiagnosticReport (result.available) → encounter.finished → Appointment.fulfilled`, with the audit chain reconciled (ADR-0157).
- Runs with **PHI-boundary** (Story 6) + **consent** (Story 7) invariants active.
- Seed data + demo runbook (the Epic DoD demo).
- Asserts terminology `$validate-code` participates (LOINC/RxNorm coding on the order).
- Verifies SLA timer start/stop events fire at named transitions (ADR-0161 — signals only, no SLA logic here).

**Acceptance criteria.**
1. Full flow passes as one E2E test: schedule → encounter → note → order → result → finished → fulfilled, all edges via durable events.
2. Audit chain reconciles the FHIR `AuditEvent`s to the neutral Diamond `audit-core` (ADR-0157) — complete, tamper-evident.
3. PHI-boundary gate (Story 6) + consent gate (Story 7) remain green during the flow.
4. Demo runbook reproduces the Epic DoD demo end-to-end.
5. Per-story DoD addendum green.

**Integration points.**
- **Produces:** the Epic acceptance artifact (E2E test + demo runbook).
- **Consumes:** all 5 services' APIs + event catalogs; PHI-boundary + consent gates; audit-core.
- **Contracts:** exercises (does not add) every M12 FHIR + event contract.
- **PHI-boundary placement:** runs under the boundary + consent invariants; asserts no PHI escapes during the flow.
- **File path:** E2E harness + demo runbook under `curaos/` shared test tooling + `ai/curaos/docs/`.

**Out of scope.** External fulfiller (LIS/PACS) routing; imaging DICOM path; claims; performance/load testing beyond the Epic's < 100ms terminology + < 1s consent assertions; multi-tenant scale testing.

---

## Cross-story deferral register (carried from #329 research — DO NOT silently drop)

| Open item | Disposition | Owner |
|---|---|---|
| **Q6 — Orthanc GPLv3 imaging store** | OPERATOR-GATED. Default/non-blocking = **dcm4chee (LGPL 2.1)** (SaaS-safe, ADR's own contingency). Full imaging path = `healthstack-imaging-service` (post-GA). Carried in Story 5's imaging-stub note. | Legal sign-off + imaging milestone |
| **Q7 — DrugBank CC BY-NC drug source** | OPERATOR-GATED. Default/non-blocking = **RxNorm (public domain) + OpenFDA/DailyMed**; FDB (paid) = operator-licensed upgrade behind `tenant.drug_interaction_source`; DrugBank Open excluded from commercial SaaS. Story 5 ships the seam + RxNorm coding; interaction *checking* engine = post-GA. | Legal/cost sign-off + post-GA |
| Q1 — FHIR R6 migration | DEFERRED (post-GA forward migration; trigger = R6 normative + HAPI R6 module). | fhir-resource-boundary §5 |
| Q4 — Patient↔Party MPI matching | DEFERRED (SanteMPI). | fhir-resource-boundary §4.3 |
| Q9 — 42 CFR Part 2 / TEFCA QHIN security-label filter | Design proposed; binding compliance policy = deferred compliance-review. | consent-phi-enforcement §5.2 |
| Q14 — AuditEvent pseudonymization key-management | Approach proposed (tombstone id); key-management = pre-prod security-review. | consent-phi-enforcement §5.3 |
| CMS-0057-F / Carequality / CommonWell / FDA SaMD PCCP | DEFERRED with owners + tracked dates; none hard-blocks M12 code. | regulatory-deadlines §7 |

---

*Generated 2026-06-04 · #372 breakdown deliverable · Per [[curaos-foresight-rule]] + [[curaos-roadmap-workflow-rule]]. Pre-resolved from #329 research — NO `[TBD]` remains. Orchestrator: copy each `## Story Nx` into `gh issue create`, wire §3.4 parent/child + Project fields (Milestone=M12 / Status=Backlog / Issue Kind=story / Cycle=C5-HealthStack-Phase-A / Initiative=HealthStack / Priority / Effort), apply native blocked-by edges, label `foresight`.*
