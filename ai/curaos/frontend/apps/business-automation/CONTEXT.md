# business_automation — Agent Context

## Quick facts
- **Framework:** React 18 + Next.js 14 App Router
- **Recipe:** `ui.react-next` (ADR-0153)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Page structure: `/automations` (list), `/automations/[id]` (editor), `/marketplace` (connectors), `/monitoring` (dashboards).
- Editor uses `@curaos/canvas` if available for node-based automation flow; falls back to forms-based if canvas not yet integrated.
- Approval workflow delegates to `workflow-core-service` approval process definition.
- Environment state stored in `business-automation-service`; promotion actions trigger service-side pipeline.

## Agent rules
- No patient/clinical data — business domain only.
- Governance features (approvals, audit) must call service APIs; no local-only state for compliance actions.
- Import from personal_automation via export format — do not duplicate personal automation logic.
- Run `turbo run build lint test e2e` before marking done.
