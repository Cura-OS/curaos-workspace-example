---
name: curaos-healthstack-vision
title: HealthStack vision (patient-centric)
description: "User's strategic vision for CuraOS HealthStack - patient-centric, OpenVistA-inspired, with adjacent hospital management as supporting tier"
metadata: 
  node_type: memory
  type: project
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

CuraOS HealthStack strategic vision (user-stated 2026-05-24):

**Inspiration:** OpenVistA logic + patient-centric product approach.

**Priority hierarchy (immutable):**
1. **Patient** - #1 priority. Every design + workflow + UX decision flows from patient experience + outcomes + data ownership + consent.
2. **Healthcare workers** (doctors, nurses, clinical staff, allied health) - #2 priority. Tooling must reduce cognitive load, support clinical reasoning, never get in the way of care delivery.
3. **Hospital management / operations / admin** - supporting tier. Builds AROUND patient + healthcare-worker layers. Fully functional + integrated, but **never compromises quality for patient or healthcare workers**.

**Architectural implications:**
- HealthStack core domain models (FHIR resources, care plans, encounters) centered on Patient as root.
- Clinical UX (clinician_app, front_office, patient_app) gets first-class attention; admin/management UI is layered on top, never displaces clinical workflows.
- Hospital management modules (scheduling, billing, claims, HR, procurement, inventory) integrate with clinical layer through clean seams - admin queries clinical data via FHIR + events, never injects admin concerns into clinical paths.
- Quality gates: any admin/management feature that degrades clinical workflow performance, P95 latency, or UX clarity is rejected.

**Why:**
- OpenVistA's patient-centric model has decades of proven clinical adoption (VA system).
- Healthcare workers churn from EHR friction; tooling that respects them retains them.
- Hospital admin is necessary infra but secondary - putting it first leads to billing-driven EHRs that clinicians hate.

**How to apply:**
- ADR-0115 (HealthStack) Recommendation + Open Questions section MUST reflect this hierarchy.
- All HealthStack module decisions weighted: patient impact > clinician impact > admin impact.
- Adjacent hospital management = separate sub-cluster within HealthStack, depends on clinical core, never the reverse.
- When evaluating OSS imports for HealthStack: prefer projects with patient-centric architecture (OpenVistA, Bahmni, OpenMRS) over admin-first (some commercial EHRs).
