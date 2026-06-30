# ADR-0233: Human-in-the-Loop Workflow Architecture

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** proposed
**Date:** 2026-06-29
**Program:** XSRC cross-source mining, Phase 12 (ADR authoring)
**Binding lens:** `.ai-analysis/PERSON-CENTRIC-LENS.md` (person-centric, no-feature-loss; dominant over raw parity)
**Parent ADRs:**
- ADR-0122 Workflow Manager (THE foundation engine)  -  Temporal + Activepieces + cron; Workflow Canvas; codegen targets
- ADR-0204 Cluster: Workflow + Automation Overlays  -  6 overlay services consume the engine
- ADR-0121d Workflow Canvas, ADR-0121e Forms, ADR-0123 Codegen + Plugin
- ADR-0120 Identity/Auth + Cerbos, ADR-0104 Audit (hash-chain), ADR-0102 Event/Messaging

**Precedence note:** Priority #2 per workspace AGENTS.md §13b. Does NOT re-decide the engine (locked by ADR-0122). Decides the **human-in-the-loop (HITL) layer** on that engine: how a paused step requests a human action, where it surfaces, and how the person-centric lens reshapes both. Where any `ai/rules/curaos_*.md` covers a sub-question (generator-evolution, local-vs-3rdparty, reuse-dry, version-planning), the rule wins and this ADR links rather than restates.

---

## 1. Context

### 1.1 The problem this ADR closes

CuraOS has a durable-execution engine (Temporal, ADR-0122) and a visual editor (Workflow Canvas). It does NOT have a first-class, reusable **human-in-the-loop primitive set**: the step where a workflow pauses, a person is asked to act (approve, review, sign, consent, complete a task), and the workflow resumes on their response.

Phase 9 gap analysis names this directly (`.ai-analysis/gap-analysis.json` → `authored.functional_gaps`):

> "Missing reusable workflow primitives (**human-approval step, escalation ladder**, retry/error policy, scheduled-job-with-handler-chain, webhook/form trigger) ..."

And the UI side of the same gap:

> "ui-kit (26 components) lacks the cross-cutting archetypes the corpus demands: ... **ApprovalInbox, WorkflowCanvas, ChecklistPanel, ... ConsentCard** ...; ui-app-emit infers ONE generic CRUD screen per service + **single org-shaped surface**."

That last clause is the lens violation: the generator emits an org-shaped admin CRUD screen and nothing person-facing, so a HITL step has no person-facing place to land.

### 1.2 How big the HITL surface is (source evidence)

| Index | HITL-bearing | Total | Source breadth |
|---|---|---|---|
| `generated-analysis/source-feature-index.json` | **86** features (approval / human-task / inbox / review / sign-off / escalation / consent) | 609 | 33 systems |
| `generated-analysis/source-workflow-index.json` | **75** workflows with a human-task / approval / wait / escalation step | 153 | 23 systems |
| `workflow-map.json` | **39** of 43 reshaped workflows contain a HITL step with authored `person_centric_reshape` | 43 | clinical + ERP + CRM |
| `source-to-local-map.json` | **81** HITL-relevant mappings | 163 | all domains |

Representative source evidence:
- **Clinical approval / protocol gating**  -  RAPTOR (Radiology Protocol Tool Recorder), `source-feature-index.json` system `RAPTOR` (3 HITL features) + `source-workflow-index.json` (2): radiologist protocol/contraindication approval before a study proceeds. `workflow-map.json` `hc.radiology`: "RAPTOR is radiologist-workflow-centric ... Re-center: the person gets prep instructions, contra...".
- **Provider result-review inbox**  -  VistA result routing; `workflow-map.json` "Lab Order + Result Review": "VistA routes results to a provider inbox; the person waits. Re-center so the person sees their result the moment it is r..." (`vista-m` 5 HITL features).
- **Registrar verify-merge**  -  `workflow-map.json` `hc.registration`: "registrar role becomes verify+merge, not data-entry" (Bahmni `BahmniEncounterTransactionImportService.java`, `OpenElisPatientFeedTask.java`).
- **Consent as a gated human step**  -  OpenHospital `PatientConsensusController` (`openhospital-api`); `healthstack-consent-service` already owns this locally.
- **ERP approvals (maker-checker)**  -  ERPNext (7), Odoo (4), Frappe (4) workflow-index entries. `source-to-local-map.json` erp-finance AP: "re-center on 'my requests + my approvals' rather than a clerk...".
- **Automation-engine HITL nodes**  -  Activepieces (7 workflow-index, 6 feature), Windmill (2), n8n-ref (3), node-red (1): an approval / wait-for-form node is a standard node type in every low-code engine.

### 1.3 What already exists locally (do not rebuild)

`local-project-inventory.json` (`counts`: 93 backend services; generator `@curaos/codegen` maturity `strong`):
- **Engine + editor:** `workflow-core-service`, Workflow Canvas (`@xyflow/react`), `automation-core-service`. Pause/resume substrate (Temporal signals, Activepieces wait) already exists.
- **Task surface:** `tasks-core-service` + `personal-tasks-service` + `tasks-sdk`  -  existing human-task store (ADR-0105 §F-4 already specified an inbox).
- **Consent + sign:** `healthstack-consent-service`, `esign-core-service` + `personal-esign-service` + `business-esign-service`.
- **Generator:** `@curaos/codegen` at `curaos/tools/codegen` (Nx + Handlebars + ts-morph), with `ui-app-emit` (313 KB emitter). PRIMARY injection point per `architecture_notes`: "GENERATOR-FIRST IS LAW ... A new external feature does NOT enter as a per-app or per-service hand-edit."

The pieces exist but are not composed into a HITL primitive: no canonical "human-approval step → inbox → person acts → signal resumes" path, and no person-facing surface for it. This ADR decides that composition.

---

## 2. Decision options

### Option A  -  Adopt a third-party HITL/task-management product
Vendor an external human-task / approval product or a low-code engine's hosted approval node (n8n / Windmill).
- **Pro:** fastest inbox UI; escalation/SLA out of the box.
- **Con (license):** `license-risk-register.json`: **n8n = Sustainable Use License → legal-review-required** ("NOT open-source ... restricts commercial/hosting"); **Windmill = AGPL-3.0 (+ EE) → reference-only**. Both fail [[curaos-local-vs-3rdparty-rule]].
- **Con (architecture):** second workflow/task runtime alongside Temporal+Activepieces  -  violates ADR-0122 single-engine + AGENTS.md §9.
- **Con (lens):** every mined product's task UI is org-centric (provider worklist, A/R clerk screen)  -  imports the exact org-first UX the lens forbids as primary.

### Option B  -  Bespoke per-service HITL (status flag + custom screen per service)
De-facto current state (Phase 9: "submit only flips status='submitted'").
- **Pro:** no new shared abstraction; smallest single-service diff.
- **Con (generator-evolution):** **forbidden by [[curaos-generator-evolution-rule]]**  -  HITL appears in 81 of 163 mappings; per-service hand-edits "leave the mold defective" and force 90+ divergent re-implementations.
- **Con (lens + audit):** no consistent person surface, no uniform ADR-0104 hash-chain audit of approve/reject/escalate, no shared escalation ladder. Re-derives the Phase 9 gap.

### Option C  -  Recommended: HITL primitive on the existing engine, dual-surfaced, generator-emitted
HITL as a first-class node type on the existing Workflow Manager (not a new runtime), with the generator emitting BOTH surfaces + wiring:
1. **One primitive, four shapes**  -  a canonical human-step node on Canvas with four configurable shapes mined from the corpus: approve/reject (maker-checker), review/acknowledge (result review), complete-task (checklist/form), sign/consent. All compile to the same mechanism (Temporal durable timer + signal, or Activepieces wait-for-resume)  -  engine decision (ADR-0122) unchanged.
2. **Owner = existing services**  -  pending-action store + inbox API on `workflow-core-service` (extending the ADR-0105 §F-4 inbox), reusing `tasks-core-service` for the task record, `esign-core-service` for sign, `healthstack-consent-service` for consent. No new service.
3. **Dual surface (lens-mandatory)**  -  each human-step renders BOTH a person surface ("my approvals / my to-review / my to-sign" in the personal/patient app) AND a management surface (admin/clinician worklist with filtering, reassignment, audit). Same data + contract; two re-centered experiences (lens §3).
4. **Escalation, SLA, audit as shared policy**  -  one escalation ladder + SLA timer (boundary timer → reminder → reassign → manager); one ADR-0104 hash-chain hook on claim/complete/approve/reject/escalate/reassign  -  defined once, inherited by every shape.
5. **Generator-emitted (closes the mold gap)**  -  extend `@curaos/codegen`: `ui-app-emit` adds `ApprovalInbox`/`ApprovalCard`, `ChecklistPanel`, `ConsentCard`/`ConsentFlow`, `Wizard`/`Stepper` archetypes to `@curaos/ui` and emits a person inbox screen + management worklist keyed off a per-screen `archetype` hint (directly the `ui_kit_additions` + `generator_targets` in `ui-visual-inventory.json`); Canvas registers the node; SDK recipe emits typed `claim/complete/approve/reject/escalate`.
- **Pro:** satisfies lens (dual surface), generator-first (one mold change → all services), reuses every existing owner, one engine, uniform audit + escalation, no license risk.
- **Con:** larger up-front generator + canvas + ui-kit investment than Option B; net-new dual-surface emitter work.

### Option D  -  Engine-only, no generator change (manual canvas wiring per workflow)
Add the human-step node to Canvas but stop there; teams wire the inbox screen and SDK calls by hand per app.
- **Pro:** smaller codegen change; engine still single.
- **Con:** re-opens the generator-evolution violation at the UI/SDK layer  -  `ui-app-emit` still emits "ONE generic CRUD screen + single org-shaped surface", so every app hand-builds the inbox and person surface, drifting immediately. Half-measure that fails the lens where it matters most.

---

## 3. Recommended option

**Option C.** Only option that simultaneously: (a) respects the locked engine (ADR-0122) by treating HITL as a node, not a runtime; (b) obeys [[curaos-generator-evolution-rule]] by folding the primitive into `@curaos/codegen` + Canvas + SDK; (c) obeys [[curaos-reuse-dry-rule]] by extending existing owners (`workflow-core-service`, `tasks-core-service`, `esign-core-service`, `healthstack-consent-service`, Canvas, `@curaos/ui`); (d) satisfies the binding person-centric lens via the mandatory dual surface; (e) carries zero license risk (Option A candidates are legal-review-required / reference-only). Aligns with [[curaos-local-vs-3rdparty-rule]] dual-option spirit (lens §3) and the existing triad layering.

---

## 4. Consequences

**Positive**
- One canonical HITL primitive instead of 90+ bespoke `status` flags; uniform escalation, SLA, hash-chain audit (ADR-0104) across every approve/review/sign/consent in all domains.
- Person-centric by construction: every paused step has a person home; org worklist is a consequence, not the primary screen (lens §3-4).
- Generator-first: a new service declaring a human-step gets both surfaces + SDK + audit free; future additions auto-covered.
- No new runtime, no new license exposure, no reverse coupling (ADR-0204 §1.3 preserved).

**Negative / cost**
- Net-new emitter work in `ui-app-emit` (313 KB emitter) for 4+ archetypes + dual-surface split; one-time before per-service payoff.
- Canvas gains a node type + compile target; ADR-0122 codegen contract extended (generator change, not engine change).
- `@curaos/ui` grows by ~4 archetype components.

---

## 5. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Dual surface doubled; teams ship only management surface, drop person surface (silent lens regression). | Person surface is the DEFAULT emitter output; management is the add-on. Lens `no_loss_check` PR gate; full-surface sweep ([[curaos-full-surface-sweep-rule]]) proves both render with real data. |
| R-2 | Escalation/SLA timers unreliable across node failures (patient-safety, ADR-0105 N/F-8). | Temporal durable timers (fault-tolerant per ADR-0122), not app cron; deterministic replay test. |
| R-3 | Large generator change regresses the 24 existing web apps. | Generator-evolution: mold change + regenerate + snapshot tests in one PR; in-flight generator barrier (AGENTS.md §8) blocks downstream dispatch while codegen lane open. |
| R-4 | Over-abstraction: one node for four shapes becomes a config bug farm. | Ponytail ceiling  -  ship the two highest-frequency shapes first (approve/reject, review/acknowledge: bulk of the 75 workflow-index HITL entries); sign + consent reuse existing services, added when their slice lands. `ponytail:` ceiling note on the shape registry. |
| R-5 | Org-centric source UX leaks into the person surface by copy. | Mining is pattern/feature-only for org UX (lens §1-2); reference-only license verdict already forbids code copy. |

---

## 6. License implications

`license-risk-register.json` verdicts binding this decision:

| System (mined for HITL) | License | Verdict | Effect |
|---|---|---|---|
| Activepieces / node-red | MIT / Apache-2.0 | **safe-to-vendor** | OK as wait/automation runtime (ADR-0122). |
| Temporal (engine) | first-party vendored (ADR-0122) | safe | unchanged. |
| n8n | Sustainable Use License (not OSI) | **legal-review-required** | **Excludes Option A via n8n.** |
| Windmill | AGPL-3.0 (+ EE) | **reference-only** | Pattern-mine node UX only; no copy/link. |
| Odoo (LGPL-3.0), ERPNext/OpenEMR/OpenHospital/Dolibarr (GPL-3.0), SuiteCRM/Bahmni (AGPL-3.0), EspoCRM (GPL/AGPL) | copyleft | **reference-only** | Approval-chain models + rules re-expressed fresh; no source copied. |
| openmrs-fhir2 / -core | MPL-2.0 | **reference-only** | translator-pair convention port-adapted into codegen emitter only (ledger G→E). |
| RAPTOR / asrcm / maternity-tracker / avs / daily-plan / ehmp / pophealth | permissive (Apache/MIT) | **safe-to-vendor** | clinical HITL flows port-adaptable. |
| Local: `workflow-core-service`, `tasks-core-service`, `esign-core-service`, `healthstack-consent-service`, `@curaos/codegen`, `@curaos/ui` | first-party | safe | all chosen owners first-party. |

Net: Option C carries **no license risk** (owners first-party; Temporal/Activepieces already cleared). Option A (n8n/Windmill) legally excluded.

---

## 7. Validation needed

1. **Engine proof:** Temporal workflow pauses on a human-step, persists a pending action to `workflow-core-service`, resumes on an inbox-API signal; deterministic-replay unit test (ADR-0122 F-12).
2. **Dual-surface proof:** generator emits BOTH a person inbox screen and a management worklist for a sample service; full-surface sweep renders each with **real DB-backed data** (no runtime mocks, [[curaos-demo-sample-data-rule]]) locally + live.
3. **Audit proof:** every claim/approve/reject/escalate/reassign in the ADR-0104 hash-chain.
4. **Escalation proof:** SLA timer → reminder → reassign without manual action; survives worker restart.
5. **No-loss check:** ERPNext maker-checker, OpenEMR billing worklist, RAPTOR protocol gate all expressible by the four shapes; file forward any shape that slips a milestone ([[curaos-version-planning-rule]]).
6. **Reverse-coupling guard:** CI confirms overlays depend only on cores (ADR-0204 §1.3).

---

## 8. Implementation follow-up

Tracked under the **XSRC Phase 13 backlog epic** (binding lens `.ai-analysis/PERSON-CENTRIC-LENS.md`). Epic: **"XSRC: Human-in-the-loop workflow primitive (dual-surfaced, generator-emitted)."** Child stories, each version-gated per [[curaos-version-planning-rule]] (file forward if beyond active release):

1. **Engine node**  -  human-step node + compile target on Canvas (ADR-0121d); Temporal durable-timer + signal on `workflow-core-service`; extend ADR-0122 codegen contract.
2. **Pending-action store + inbox API**  -  on `workflow-core-service` reusing `tasks-core-service`; SDK recipe emits `claim/complete/approve/reject/escalate`.
3. **ui-kit archetypes**  -  `ApprovalInbox`/`ApprovalCard`, `ChecklistPanel`, `ConsentCard`/`ConsentFlow`, `Wizard`/`Stepper` in `@curaos/ui` (per `ui-visual-inventory.json` `ui_kit_additions`).
4. **ui-app-emit dual surface**  -  emit person inbox + management worklist keyed off `archetype` hint (the primary generator-evolution change).
5. **Shared escalation/SLA + audit policy**  -  one ladder + ADR-0104 hook on the primitive.
6. **Shape adapters**  -  sign → `esign-core-service`; consent → `healthstack-consent-service`.
7. **Domain backfill (version-gated)**  -  wire the 81 HITL mappings onto the primitive: clinical (result review, radiology gate, registrar verify-merge, consent), ERP (AP/AR maker-checker), CRM (lead qualification), revenue-cycle (denial worklist). Reference-only org systems = re-express models/rules fresh; no source copy.

**Generator barrier (AGENTS.md §8):** while the codegen / `@curaos/*-sdk` / `@curaos/contracts` lane for stories 1-4 is open, downstream domain-backfill dispatch (story 7) is blocked  -  services produced before the mold change inherit the defect being removed.

---

## 9. Source + local evidence index

**Source (cloned corpora):**
- `.ai-analysis/generated-analysis/source-feature-index.json`  -  609 features; 86 HITL across 33 systems (RAPTOR, vista-fhir-codex×9, daily-plan×5, vista-m×5, Activepieces×6, Windmill×2, n8n-ref×1).
- `.ai-analysis/generated-analysis/source-workflow-index.json`  -  153 workflows; 75 HITL across 23 systems (ERPNext×7, Activepieces×7, OpenMRS-refapp×6, maternity-tracker×5).
- Cited files: Bahmni `BahmniEncounterTransactionImportService.java`, `OpenElisPatientFeedTask.java`; OpenHospital `PatientConsensusController`; VistA-FHIR-Server-Codex intake scripts; RAPTOR protocol recorder.
- `.ai-analysis/workflow-map.json`  -  43 reshaped; 39 HITL with authored `person_centric_reshape`.

**Local (inventory / mapping):**
- `.ai-analysis/local-project-inventory.json`  -  `counts` (93 services), `generator` (`@curaos/codegen` strong), `architecture_notes` (generator-first is law); owners `workflow-core-service`, `tasks-core-service`+`tasks-sdk`, `esign-core-service`, `healthstack-consent-service`, Canvas, `@curaos/ui`.
- `.ai-analysis/gap-analysis.json`  -  `authored.functional_gaps` (missing human-approval step + escalation ladder; ui-kit lacks ApprovalInbox; ui-app-emit single org-shaped surface); maturity dist (present-strong 34 / absent 36 / stub 24 / present-weak 21 / partial 34 / stronger-than-source 14).
- `.ai-analysis/source-to-local-map.json`  -  163 mappings; 81 HITL-relevant with `person_centric_reshape` / `management_surface` / `person_surface` / `generator_first_target`.
- `.ai-analysis/code-reuse-ledger.json`  -  reuse modes A-H; org systems land G/E; H (reject) for n8n/Windmill as dependencies.
- `.ai-analysis/license-risk-register.json`  -  verdicts per §6.
- `.ai-analysis/ui-visual-inventory.json`  -  `ui_kit_additions` (ApprovalInbox/Card, ChecklistPanel, ConsentCard/Flow, Wizard/Stepper) + `generator_targets` (ui-app-emit archetype vocabulary).

**Rules applied (priority #1 over this ADR):** [[curaos-generator-evolution-rule]], [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-version-planning-rule]], [[curaos-full-surface-sweep-rule]], [[curaos-demo-sample-data-rule]].

---

*File written to `ai/curaos/docs/adr/0221-human-in-the-loop-workflow-architecture.md`. Next free ADR number was 0221 (latest existing = 0220).*