# business_workflow — Agent Context

## Quick facts
- **Framework:** React 18 + Next.js 14 App Router
- **Canvas:** `@curaos/canvas` node-graph mode (ADR-0121d)
- **Status:** Migrating from Flutter scaffold
- **Undo/redo:** Zustand + Immer; min 20-step history

## Architecture notes
- Extends workflow_designer with collaboration + governance layer.
- Version control: business-workflow-service stores definition versions; UI shows diff between versions.
- Deployment promotion: UI triggers service-side pipeline; shows pipeline status badges.
- Task inbox: polls `workflow-core-service` for active human task instances assigned to current user.
- SLA dashboard: reads execution metrics from `workflow-core-service` aggregation endpoint.

## Agent rules
- No clinical-specific processes; HealthStack workflow UI handles those overlays.
- Governance actions (change requests, approvals) must be recorded via service API calls; no local-only approval state.
- Run `turbo run build lint test e2e` before marking done.
