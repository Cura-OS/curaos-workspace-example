# workflow_designer — Agent Context

## Quick facts
- **Framework:** React 18 + Next.js 14 App Router
- **Canvas:** `@curaos/canvas` node-graph mode — no custom graph lib
- **Process schema:** versioned BPMN JSON; stored in `workflow-core-service`
- **Undo/redo:** Zustand + Immer; min 20-step history

## Architecture notes
- `app/layout.tsx` → `WorkflowDesignerShell` (toolbar + canvas + property panel).
- `store/workflow.ts` — Zustand slice for process document (nodes, edges, selected node ID).
- `@curaos/canvas` receives nodes/edges; dispatches `onNodeMove`, `onEdgeConnect`, `onSelect` back to store.
- Selected node ID drives property panel; renders `@curaos/forms` with node-type schema.
- Publish action POSTs versioned BPMN JSON to `workflow-core-service`.

## Research history
- [v0 research (2026-05-26)](2026-05-26-workflow-designer-v0.md) — historical

## Agent rules
- Canvas node/edge data model must match `workflow-core-service` BPMN JSON schema.
- No business rule evaluation in designer; process execution is service-side only.
- Import/export must round-trip losslessly through the BPMN JSON schema.
- Run `turbo run build lint test e2e` before marking done.
