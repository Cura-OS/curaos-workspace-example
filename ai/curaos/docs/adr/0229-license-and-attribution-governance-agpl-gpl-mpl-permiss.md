# ADR-0229: License and attribution governance (AGPL/GPL/MPL/permissive matrix)

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** Proposed
**Date:** 2026-06-29
**Phase:** XSRC Phase 12 (ADR drafting)  -  derives from XSRC Phase 6 (legal) artifacts
**Decision:** (proposed) Option B  -  Tiered license-class matrix enforced in the generator + CI, default reference-only for copyleft, with a `NOTICE`/`PROVENANCE.md` attribution ledger
**Owners:** Platform Architecture, Legal/Compliance, Codegen (`@curaos/codegen`)
**Binding lens:** [`.ai-analysis/PERSON-CENTRIC-LENS.md`](../external-source-enrichment/PERSON-CENTRIC-LENS.md)  -  mine source corpora for completeness (data models, business rules, compliance logic), never for org-centric UX; this ADR governs HOW that mining is legally permissible.
**Precedence note:** Rules in `ai/rules/` outrank this ADR (workspace precedence §13b). This ADR operationalizes, and does not override, [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-generator-evolution-rule]], [[curaos-version-planning-rule]], and [[curaos-repo-boundary-rule]]. If any of those rules is later tightened, this ADR is patched to match.

---

## 1. Status

Proposed. No prior ADR owns license/attribution governance; today the policy lives only in scattered `license_status` strings inside the XSRC analysis artifacts. This ADR promotes that scattered guidance into one authoritative, enforceable matrix that the code generator and CI can act on. Until accepted, the conservative default in §3 (copyleft = reference-only, unknown = blocked) is the working posture.

---

## 2. Context

### 2.1 Why this decision is forced now

The XSRC effort mines a large external corpus to close feature gaps without re-inventing well-understood domain logic. The corpus spans permissive, weak-copyleft, strong-copyleft, network-copyleft, source-available, and unknown-license code. CuraOS ships as a **commercial, multi-tenant, self-hosted SaaS + on-prem + hybrid + air-gap** product (workspace `AGENTS.md` §4). That distribution profile makes copyleft exposure existential: a single copied AGPL file in a networked service can force source disclosure of the entire interacting service. There is no per-app remedy after the fact, so governance must sit at the **single injection point** (the generator) and at **CI**, not in 93 services after the fact.

### 2.2 Source evidence (cloned source + XSRC indices)

- **License risk register**  -  [`.ai-analysis/license-risk-register.json`](../external-source-enrichment/plan/license-risk-register.json): per-system SPDX, class, verdict, and obligations for **39 indexed source systems** (`source-feature-index.json.systems_indexed = 39`). Computed `summary` buckets:
  - `safe_to_copy` (19): Frappe (MIT), RAPTOR/asrcm/avs/aware/pophealth/health-data-standards/maternity-tracker/preproc-checklist/node-red/docker-vista/fhir-on-vista/vista-fhir-codex/vista-fhir-loader/vista-m/vista-dashboard-rules (Apache-2.0), ehmp-app (MIT), coms (ISC), activepieces (MIT), plus Medusa v2 (MIT, already embedded).
  - `service_or_reference_only` (7, AGPL/source-available): bahmni-core, espocrm, openmrs-distro-referenceapplication, suitecrm, suitecrm-core, windmill, n8n-ref.
  - `port_adapt_no_copy` (11, GPL/LGPL/MPL): dolibarr, erpnext, odoo, openemr, openhospital-{api,core,gui,ui}, openmrs-{core,fhir2,rest}.
  - `legal_review_required` (3, unknown): daily-plan, FamilyHistoryCPRS, vista-vehu.
- **Code reuse ledger**  -  [`.ai-analysis/code-reuse-ledger.json`](../external-source-enrichment/plan/code-reuse-ledger.json): reuse modes A - H per mapped component. `mode_distribution`: **G pattern-reference-only = 51, E port-adapt = 99, D api-adapter = 4, C run-as-background-service = 3, H reject = 6**. Concrete cited examples that exercise each license class:
  - Mode A copy-verbatim (Apache-2.0, NOTICE): VistA-FHIR-Codex utilities (`C0FHIR.m` GETVIT/GETCOND, `fhir-on-vista` providers) → `@curaos/fhir-client`.
  - Mode E port-adapt no-copy (GPL): OpenEMR X12 5010 837P/837I/835/270 (`src/Billing/X125010837P.php`, `ParseERA.php`, `EDI270.php`, `Hcfa1500.php`) → fresh TS `@curaos/x12-sdk` (X12 5010 segment layout is an ANSI standard, not copyrightable).
  - Mode G pattern-reference-only (AGPL): windmill schedule/approval/concurrency primitives, espocrm `entityDef` field sets, suitecrm `AOS_Contracts` shapes  -  facts mined, code never lifted.
  - Mode G/file-notice (MPL-2.0): `openmrs-fhir2` ToFhir/FromFhir translator-pair → re-expressed as a `@curaos/codegen` emitter; MPL Java files NOT copied (file-level copyleft).
  - Mode H reject (source-available / AGPL): n8n (Sustainable Use License, not OSI), bahmni-core, suitecrm  -  rejected as dependency, design-reference only.
  - Mode H reject inbound (local already stronger): esign-core, terminology-service, audit-core  -  first-party, reject-inbound.
- **Source feature index**  -  ``.ai-analysis/generated-analysis/source-feature-index.json`` (generated-analysis/*, git-ignored under .ai-analysis/): **609 features with per-feature evidence** across the 39 systems; each carries the source files that establish provenance for a clean-room boundary.
- **Source-to-local map**  -  [`.ai-analysis/source-to-local-map.json`](../external-source-enrichment/plan/source-to-local-map.json): **163 mappings** across 11 domains, each carrying `license_status`, `integration_mode`, `generator_first_target`, and `source_files[]` (e.g. healthcare-revenue billing maps `openhospital-core/.../Bill.java` + `openmrs` AGPL → `healthstack-billing-service` as `pattern-reference-only`, "do not copy; local already first-party").

### 2.3 Local evidence (what we have to protect + where governance attaches)

- **Inventory**  -  ``.ai-analysis/local-project-inventory.json`` (local-project-inventory.json, git-ignored under .ai-analysis/): 93 backend services (45 neutral-core, 14 personal, 12 business, 18 healthstack, 3 education), 35 backend packages, 24 web apps, 12 generated SDKs, 100 Helm charts, 66 ADRs, 61 rules. All first-party, intended to ship unencumbered.
- **Generator as the single injection point**  -  inventory `generator`: `@curaos/codegen` at `curaos/tools/codegen` ("PRIMARY INJECTION POINT. New backend/frontend surface enters here first, never as a per-app hand-edit"). Exports `emitServiceLive`, `emitSdkRecipe`, `emitUiApp`, `reconcileService`, `DOMAIN_ROUTE_MAP`. This is where a license gate belongs so that no copyleft byte can enter via a scaffold.
- **First-party services that already exceed source** (reject-inbound, per reuse ledger): `esign-core-service` (eIDAS/UETA, chain-of-custody), `terminology-service` (Snowstorm, four FHIR terminology ops), `audit-core-service` (SHA-256 hash-chain)  -  these MUST stay free of inbound copyleft so they remain relicensable/commercial.
- **Gap surface**  -  [`.ai-analysis/gap-analysis.json`](../external-source-enrichment/plan/gap-analysis.json) maturity distribution: 36 absent, 24 stub, 21 present-weak, 34 partial, 34 present-strong, 14 stronger-than-source. The 36 absent + 24 stub gaps are exactly where the temptation to copy copyleft source is highest; the matrix must be enforced before those are filled.
- **Crosswalk / UI / workflow**  -  `data-model-crosswalk.json`, `ui-visual-inventory.json`, `workflow-map.json` confirm that what we reuse from copyleft sources is overwhelmingly **data-model shapes, state machines, and workflow facts** (uncopyrightable or fact-level) rather than expressive code  -  which is precisely what makes a fresh-implementation (port-adapt / pattern-reference) strategy viable.

### 2.4 The license classes that actually appear

| Class | SPDX seen | Distribution impact for a commercial networked SaaS |
|---|---|---|
| Permissive | Apache-2.0, MIT, ISC | No copyleft on our code; attribution + NOTICE only. Safe to vendor or copy. |
| Weak / file copyleft | MPL-2.0 | Per-file copyleft: a copied/modified MPL file stays MPL + source-disclosed. Mixing allowed only at file boundary. |
| Strong copyleft | GPL-3.0, LGPL-3.0 | Copy or link forces the combined work under (L)GPL on distribution. Incompatible with proprietary build. |
| Network copyleft | AGPL-3.0 | Network interaction triggers source-disclosure of the interacting service. Hardest constraint for SaaS. |
| Source-available | n8n Sustainable Use License | NOT OSI; restricts commercial/hosted use + embedding. Cannot vendor. |
| Unknown | daily-plan, FamilyHistoryCPRS, vista-vehu | No grant; all rights reserved until confirmed. Blocked. |

---

## 3. Decision Options

### Option A  -  Permissive-only intake (hard wall)

Only Apache-2.0 / MIT / ISC source may inform CuraOS at all; every copyleft and unknown system is excluded entirely, even at the fact level.

- **Pros:** Zero copyleft risk, trivial to audit, no legal-review queue.
- **Cons:** Discards the bulk of the corpus. 17 of 21 GPL/LGPL/MPL/AGPL systems carry high-value domain logic (OpenEMR X12, Odoo accounting, ERPNext pricing/subscription, OpenMRS FHIR translators) that is mostly uncopyrightable facts and standards. Forfeits the no-feature-loss mandate (PERSON-CENTRIC-LENS §5) and the reuse/DRY intent. Re-deriving these from scratch is slower and more error-prone, contradicting [[curaos-reuse-dry-rule]].

### Option B  -  Tiered license-class matrix, generator + CI enforced (RECOMMENDED)

A single canonical matrix (this ADR §5) maps each license class to one allowed reuse posture. The matrix is encoded as machine-readable data the **generator** (`@curaos/codegen`) and **CI** consume: permissive → copy-with-NOTICE; MPL → prefer pattern-reference, file-notice only after legal-review; GPL/LGPL → port-adapt no-copy (fact + standard + fresh implementation); AGPL → reference-only, clean-room boundary documented in PR; source-available + unknown → blocked pending legal-review. A `NOTICE` file plus a `PROVENANCE.md` attribution ledger records every copied unit and every clean-room boundary.

- **Pros:** Preserves the full reuse strategy already designed in the reuse ledger (modes A - H map 1:1 onto the matrix). Enforcement at the single injection point + CI means no per-service drift, consistent with [[curaos-generator-evolution-rule]]. Auditable attribution. Conservative defaults (copyleft = reference-only, unknown = blocked) fail safe.
- **Cons:** Requires building/maintaining the matrix-as-data, a provenance ledger, and CI gates; legal-review queue for MPL-file copies and unknown licenses. Standards-vs-source line (X12, CMS-1500, FHIR) needs documented justification per use.

### Option C  -  Service-boundary copyleft (run copyleft as an isolated process)

Permit AGPL/GPL code to run as a separately-distributed, network-isolated background service behind a stable contract (the `_computed.register` "service-boundary-only-or-reference" verdict), relying on the aggregation/mere-aggregation argument.

- **Pros:** Could unlock running a few mature OSS engines (e.g. an HQMF/QRDA converter) without re-implementing.
- **Cons:** AGPL's network clause is widely read to defeat the service-boundary shield for SaaS; the legal theory is contested and per-jurisdiction. Air-gap/on-prem redistribution still triggers obligations. Adds operational surface (a separate licensed process per tenant) and a redistribution-disclosure burden that conflicts with a clean commercial bundle. Acceptable only as a narrow, legal-reviewed exception, not a default. (Note: Apache-2.0 background services like the `health-data-standards` Ruby converter, reuse-ledger mode C, are already permitted under Option B with NOTICE  -  they are not the contested case.)

---

## 4. Recommended Option

**Option B.** It is the only option that simultaneously (a) honors the no-feature-loss mandate, (b) keeps the first-party codebase unencumbered and commercially relicensable, (c) enforces at the single generator injection point so 93 services cannot drift, and (d) maps cleanly onto the reuse modes (A - H) already authored in the reuse ledger. Option A forfeits too much value; Option C's network-copyleft theory is too contested to be a default and is retained only as a §5 legal-reviewed exception path.

The reuse modes already in the ledger collapse onto the matrix as follows: A copy-verbatim → permissive lane; B vendor/import → permissive lane (Medusa MIT); C run-as-background-service → permissive-only lane (NOTICE) or §5 AGPL/GPL exception (legal-review); D api-adapter → license-neutral (separate OSS process, e.g. OHIF viewer); E port-adapt → fact + fresh-implementation lane (works for GPL/LGPL/MPL); G pattern-reference-only → fact-only lane (required for AGPL); H reject → blocked lane (source-available/unknown, or local-stronger reject-inbound).

---

## 5. The License-Class Matrix (canonical)

| Class | Allowed posture | Generator/CI action | Attribution obligation | Default verdict |
|---|---|---|---|---|
| **Permissive** (Apache-2.0, MIT, ISC) | Copy, vendor, or import | Allow; require NOTICE entry on any copied unit | LICENSE + NOTICE retained; MIT copyright header kept | safe-to-vendor |
| **MPL-2.0** | Prefer pattern-reference (fresh code). Copy a file only after legal-review | Block copy of `.mpl` files by default; allow pattern-emitter | Copied MPL file stays MPL + source disclosed + header | reference-only (file-copy needs legal-review) |
| **GPL-3.0 / LGPL-3.0** | Port-adapt: reuse facts + standards + state machines, implement fresh | Block verbatim copy; allow fresh-impl with documented provenance | None on our code if no copy; PR documents standards-vs-source line | port-adapt no-copy |
| **AGPL-3.0** | Reference-only (facts/shapes), clean-room boundary in PR | Block any copy/link; require clean-room note | None (no code enters); PR records fact-level boundary | reference-only |
| **Source-available** (n8n SUL) | Reject as dependency; design-reference only | Block import/copy | n/a | blocked / design-reference |
| **Unknown** (daily-plan, FamilyHistoryCPRS, vista-vehu) | No use of any kind until license confirmed | Block; flag critical-blocker if reuse attempted | n/a | legal-review-required |

**Standards-vs-source carve-out:** ANSI/government/HL7 standards that appear inside copyleft source (X12 5010 segments, CMS-1500/UB-04 box layouts, FHIR R4 resource shapes, LOINC/ICD/RxNorm/CVX codings) are not copyrightable as such and may be re-implemented fresh regardless of the surrounding file's license. Every such use documents the standard citation in the PR so the boundary is auditable (per OpenEMR X12 / OpenHospital fee-schedule / OpenMRS FHIR mappings in the reuse ledger).

**Exception path (Option C, narrow):** running an unmodified copyleft engine as a separately-distributed, network-isolated process is permitted ONLY with a signed legal-review and an explicit redistribution-disclosure plan covering air-gap/on-prem. Not a default; tracked as a per-case ADR amendment.

---

## 6. Consequences

- **One canonical matrix.** All `license_status` strings scattered across XSRC artifacts now resolve to a single source of truth (this §5). Consumers link here instead of restating policy ([[curaos-reuse-dry-rule]]).
- **Generator owns enforcement.** `@curaos/codegen` gains a license-gate: a scaffold/copy carrying a copyleft or unknown SPDX is refused at emit time, so the defect can never reach a service ([[curaos-generator-evolution-rule]]). Any uncovered license edge case folds back into the gate, not into a per-service patch.
- **Attribution ledger exists.** A repo-root `NOTICE` (permissive attributions) + `PROVENANCE.md` (one row per copied unit AND per clean-room boundary, citing source file + verdict) becomes a release artifact and audit surface.
- **First-party services stay relicensable.** esign-core, terminology-service, audit-core, and all `curaos/*` remain copyleft-free → commercial distribution and on-prem/air-gap bundles ship clean.
- **Person-centric mining is legally unblocked.** Teams can mine 609 features for completeness (data models, compliance logic, validation, reports) while the matrix keeps the expressive code out, satisfying both no-feature-loss and license safety.
- **Some work is slower.** GPL/LGPL/AGPL-sourced features (X12, Odoo accounting, ERPNext pricing) must be re-implemented fresh rather than copied; the reuse ledger already scopes these as mode E/G with no-loss checks, so scope is known, not surprising.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Copyleft code copied via a hand-edit bypassing the generator | Medium | Critical (forced disclosure) | CI license-scan (SPDX + secret-style grep for source markers) on every PR, not just generator path; pre-commit hook; PR clean-room checklist |
| "Standards-vs-source" line drawn too aggressively (lifting expressive structure as "standard") | Medium | High | Mandatory PR documentation of the exact standard citation; legal-review for any non-obvious lift |
| MPL file copied without legal-review (file-level obligation slips in) | Low | Medium | Generator blocks `.mpl`-headered file copy; matrix default = pattern-reference |
| Unknown-license code used before confirmation | Low | High | Blocked by default; critical-blocker flag; daily-plan/FamilyHistoryCPRS/vista-vehu explicitly enumerated |
| Upstream relicensing (e.g. an OSS dep flips to source-available, as several have historically) | Medium | Medium | Renovate/SBOM watch on dep licenses; re-run the matrix on dependency-license change ([[curaos-version-pinning-rule]] SBOM lane) |
| AGPL network-copyleft theory misjudged under Option C exception | Low (default avoids) | Critical | Option C requires signed legal-review per case; not the default |

---

## 8. License Implications (summary of obligations CuraOS accepts)

- **Permissive:** retain LICENSE + NOTICE; keep MIT/Apache headers on any copied unit. (Medusa v2 MIT already embedded  -  covered.)
- **MPL-2.0:** do not copy MPL files into first-party services by default; if a file is copied post-legal-review, it stays MPL with source disclosed and header intact. Prefer the pattern-emitter route (`@curaos/codegen` translator-pair emitter from `openmrs-fhir2` pattern).
- **GPL-3.0 / LGPL-3.0:** never copy or link verbatim; port logic/data-model/state-machine as fresh original code; document standards-vs-source provenance. (OpenEMR, OpenHospital, Odoo, ERPNext, Dolibarr.)
- **AGPL-3.0:** never copy or link; fact-level reference only; clean-room boundary documented in PR. (OpenMRS reference-app, SuiteCRM, EspoCRM AGPL modules, Windmill, Bahmni.)
- **Source-available (n8n SUL):** reject as dependency; fresh implementation of concept shapes only.
- **Unknown:** no use until license established; implement against the open standard equivalent where one exists (e.g. FHIR FamilyMemberHistory for FamilyHistoryCPRS) which carries no upstream obligation.
- **Aggregate output:** the shipped CuraOS distribution (SaaS image, on-prem bundle, Zarf air-gap package) carries only permissive third-party obligations + first-party license; no copyleft obligation flows to the customer.

---

## 9. Validation Needed

1. **Legal sign-off** on the matrix verdicts (esp. the AGPL service-boundary exclusion and the standards-vs-source carve-out) before status → Accepted.
2. **Confirm the three unknown licenses** (daily-plan, FamilyHistoryCPRS, vista-vehu) or formally exclude them; until then they remain blocked.
3. **Per-MPL-file legal-review** decisions recorded before any `openmrs-*` file is copied (default is pattern-reference, so likely zero copies).
4. **SBOM/dep-license scan** wired into CI to catch the runtime-dependency side (not just XSRC source intake), reconciled against [[curaos-version-pinning-rule]].
5. **Clean-room boundary spot-check** on the first GPL-port deliverable (`@curaos/x12-sdk` from OpenEMR) to validate the provenance-documentation workflow end to end.

---

## 10. Implementation Follow-up

Tracked under the **XSRC backlog epic** (XSRC Phase 8 blueprint → backlog). Children to file (version-gate each per [[curaos-version-planning-rule]]; license-governance scaffolding targets the active v1 working set, copyleft-port features inherit their feature's milestone):

1. **`@curaos/codegen` license gate**  -  generator refuses emit/copy of any unit carrying a copyleft or unknown SPDX; matrix encoded as machine-readable data the gate reads. Owner: codegen. (Generator-first per [[curaos-generator-evolution-rule]]  -  enforcement lives at the single injection point, not per service.)
2. **CI license-scan + provenance check**  -  SPDX scan + source-marker grep on every PR; fails on copyleft intake outside the documented clean-room path; verifies a `PROVENANCE.md` row exists for each copied unit.
3. **`NOTICE` + `PROVENANCE.md`**  -  repo-root attribution ledger; one row per copied permissive unit and per clean-room boundary, citing source file + matrix verdict; emitted as a release artifact.
4. **PR clean-room checklist**  -  template section for GPL/LGPL/MPL/AGPL-sourced work: standard cited, fresh-implementation confirmed, no verbatim copy.
5. **Unknown-license resolution task** (critical-blocker)  -  confirm or exclude daily-plan, FamilyHistoryCPRS, vista-vehu.
6. **Resolution-map + rule wiring**  -  add this ADR to [`RESOLUTION-MAP.md`](RESOLUTION-MAP.md); evaluate promoting the matrix to a cross-cutting `ai/rules/curaos_license_governance_rule.md` if other repos need it (rule would then outrank this ADR per §13b, and this ADR would carry a resolution-pin banner).

---

## 11. References

- Source/legal artifacts: `license-risk-register.json`, `code-reuse-ledger.json`, `source-to-local-map.json` (163 mappings), `gap-analysis.json` (81 absent/weak gaps), `generated-analysis/source-feature-index.json` (609 features, 39 systems), `data-model-crosswalk.json`, `ui-visual-inventory.json`, `workflow-map.json`, `local-project-inventory.json`  -  all under `/Users/dev/workspace/curaos-workspace/.ai-analysis/`.
- Binding lens: `.ai-analysis/PERSON-CENTRIC-LENS.md`.
- Rules: [[curaos-local-vs-3rdparty-rule]], [[curaos-reuse-dry-rule]], [[curaos-generator-evolution-rule]], [[curaos-version-planning-rule]], [[curaos-repo-boundary-rule]], [[curaos-version-pinning-rule]].
- Related ADRs: ADR-0162 (HIPAA 2026 compliance), ADR-0159 (pricing/packaging), ADR-0123 (codegen plugin), ADR-0158/0164 (air-gap/Zarf bundle).