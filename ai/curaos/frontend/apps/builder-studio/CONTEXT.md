# builder_studio — Agent Context

> **M7-S5 add-on (2026-05-27).** Patient CRUD UI shipped (`/patients`
> route + `<PatientFormPage>`). Schema contract consumption per
> [`m7-user-decisions.md`](../../../docs/m7-user-decisions.md) D4:
> compile-time `@curaos/patient-contracts.patientBaseSchema` imported
> synchronously at boot, overlay schema fetched from
> `healthstack-patient-service` `GET /api/v1/contracts/patient`. RJSF
> renders base immediately; merges overlay on fetch resolve. Degraded
> mode (base-only + banner) when fetch fails. Source files:
> `src/api/patient-contract-client.ts`,
> `src/components/PatientForm/PatientFormPage.tsx`,
> `app/patients/page.tsx`,
> `test/patient-form-page.test.tsx`.

## Quick facts
- **Framework:** React 19 + Next.js 15 App Router
- **Canvas lib:** `@curaos/canvas` (ADR-0121d) — do not build drag-drop from scratch
- **Forms lib:** `@curaos/forms` (ADR-0121e) — do not build form schema editor from scratch
- **Patient form:** RJSF 6.x driven by `@curaos/patient-contracts` (M7-S5 D4 hybrid)
- **State:** Zustand + Immer; document tree persisted to workflow-core-service on save

## Architecture notes
- Root layout: `app/layout.tsx` → `BuilderShell` (left palette + center canvas + right property panel).
- Canvas document state lives in `store/builder.ts` (Zustand + Immer); undo/redo via immer patches.
- `@curaos/canvas` receives `document` slice and dispatches `onAction` events back to store.
- Property panel reads selected node from store; renders `@curaos/forms` for form-type nodes.
- Publish action calls `workflow-core-service` to store app definition as BPM artifact.
- Preview route renders output app in `<iframe sandbox>`.

## Agent rules
- Canvas rendering owned by `@curaos/canvas`; do not fork or patch locally.
- Form editing owned by `@curaos/forms`; extend via props/config, not local copies.
- Builder document schema changes require versioning note + migration guide.
- No PHI/PII in app definitions; overlay apps handle PHI at runtime, not definition time.
- Run `turbo run build lint test e2e` before marking done.
