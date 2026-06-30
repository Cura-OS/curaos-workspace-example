# XSRC binding lens: person-centric, no-feature-loss (user directive, 2026-06-29)

Every downstream phase (4-13: mapping, gap, reuse, crosswalk, UI, workflow, blueprint, backlog, ADRs, final report) MUST score and shape against this lens. It is dominant over raw feature parity.

## The directive (verbatim intent)

- **All services are business-centric from the management side** (full management/compliance/back-office capability) **AND** simultaneously **patient/customer-centric for the best quality of life** for the end person. Not a trade-off: both at once.
- **Personal services = fully personal/patient/customer-centric.** The person is the subject and the owner of their data and journey.
- **Workflows are built around customer/user/patient journeys**, not around the organization's internal process. The org process is satisfied as a consequence of serving the person well.
- **CuraOS's core advantage:** our logic is adapted to be **simple and fully personal/customer/user/patient-centric WITHOUT losing any feature** needed for business/management/compliance, while **simplifying and improving the business** at the same time.

## How this changes the mining (CRITICAL)

The external corpora (Odoo, ERPNext, Dolibarr, OpenEMR, OpenMRS, OpenHospital, VistA/CPRS, SuiteCRM, EspoCRM) are overwhelmingly **org-centric / admin / back-office** in their UX and workflow design. Therefore:

1. **Mine for completeness, not for UX.** Take their FEATURE SET, DATA MODELS, BUSINESS RULES, COMPLIANCE LOGIC, VALIDATION, REPORTS, CLAIMS/BILLING/REVENUE-CYCLE, terminology, and edge-case handling. These prove "what a complete system must do" so we lose no feature.
2. **Re-center the UX and workflow on the person.** Do NOT copy their org-first navigation, their form-heavy admin screens, or their process-first flows as the primary experience. Reshape every mined workflow so the patient/customer/user journey is the spine; the management/compliance steps attach to that spine.
3. **Dual surface per capability.** Each mined capability generally yields BOTH: a person-facing surface (patient-app / personal-* app: simple, journey-driven, quality-of-life) AND a management surface (admin / business-* / clinician: full control, compliance, reporting). Same data + contract; two re-centered experiences. This aligns with [[curaos-local-vs-3rdparty-rule]]'s dual-option spirit and the triad layering.
4. **Simplify the business too.** When a mined flow is needlessly complex in the source (Odoo's multi-step accounting, OpenEMR's billing screens), the plan proposes the SIMPLER person-centric flow that still satisfies every compliance/management requirement, and notes the simplification as a CuraOS advantage, not a feature cut.
5. **No feature loss is a hard constraint.** Any simplification that drops a business/management/compliance capability is rejected. Simplification means re-sequencing and re-centering, plus automation/defaults, never removing required capability.

## Scoring fields added to every mapped feature (phases 4-11)

- `person_centric_reshape`: how the source's org-centric flow is re-centered on the person (required text per feature).
- `management_surface`: the management/compliance surface that must still exist (so no feature is lost).
- `person_surface`: the person-facing surface (patient/customer/user simple journey).
- `simplification_note`: how CuraOS makes it simpler for both the person and the business without losing capability.
- `no_loss_check`: explicit confirmation that all source business/management/compliance features are preserved (or filed forward).

## Layer mapping under this lens

- `personal-*` services/apps: person is owner + subject. Fully person-centric. Source mining = personal-finance/personal-health/personal-CRM analogs of the business features.
- `*-core-service` (neutral): the shared journey + data + contract spine both surfaces build on.
- `business-*` / `healthstack-*` / admin / clinician: management surface = full capability + compliance, but its workflows still organize around the customer/patient the business serves.
