> Historical research snapshot (2026-05-26). Current state in [CONTEXT.md](CONTEXT.md) / [Requirements.md](Requirements.md).

# Workflow Designer v0 Research

## Decision inputs

- Issue: `your-org/workflow-designer#1`
- Acceptance source: dispatched prompt, because `gh issue view` failed with `error connecting to api.github.com`.
- Prior CuraOS docs: `/Users/dev/workspace/curaos-worktrees/docs-workflow-shell-codex-3d173c6d/ai/curaos/frontend/apps/workflow-designer/Requirements.md` and `CONTEXT.md`.

## Competing platform patterns

- Camunda Modeler: left-to-right BPMN graph, canvas-first editor, side panel for selected element properties, JSON/XML import-export. v0 matches canvas-first editing and selected-node detail panel.
- n8n: node canvas with save/load workflow JSON, tenant/workspace header context, role-gated editing. v0 matches local JSON persistence and clear read-only/edit states.
- Retool Workflows: operational header, central flow canvas, explicit save action, properties separated from canvas. v0 uses the same shell density instead of marketing layout.

## Library decisions

- `next@14.2.23`, `react@18.3.1`, `react-dom@18.3.1`: matches prior CuraOS workflow-designer docs requiring React 18 + Next.js 14 App Router.
- `@xyflow/react@12.3.6`: issue explicitly requires this package; it provides React Flow nodes, edges, controls, minimap, connection handlers, and JSON-friendly node/edge state.
- `@curaos/auth-sdk@0.0.0`: represented as optional peer dependency because shipped Verdaccio availability is external to this fresh app and GitHub/network checks were unavailable. v0 uses a dev identity stub at the auth boundary.
- `@curaos/tenancy@0.0.0`: represented as optional peer dependency; v0 reads `x-curaos-tenant` through a local adapter compatible with later tenancy primitives.
- No Zustand/Immer in v0: prior docs list them for full undo/redo, but issue acceptance only requires basic canvas plus local save/load.

## Codebase integration map

### Producers

- `app/page.tsx`: reads request headers, produces `TenantContext` and `CuraSession`.
- `src/tenant/tenant.ts`: reads validated `x-curaos-tenant`; falls back to `dev-tenant` only when dev stub mode is enabled.
- `src/auth/session.ts`: reads `x-curaos-user`, `x-curaos-user-name`, `x-curaos-roles` only when dev stub mode is enabled; otherwise fails closed for the later `@curaos/auth-sdk` handoff.
- `src/flow/WorkflowDesigner.tsx`: produces React Flow node/edge changes and local flow snapshots.

### Consumers

- `WorkflowDesigner`: consumes `TenantContext`, `CuraSession`, React Flow state, and browser `localStorage`.
- `src/flow/storage.ts`: consumes `Storage`, tenant ID, nodes, edges; stores versioned JSON under `curaos.workflow-designer.flow.<tenant>`.
- Future `workflow-core-service`: will consume the same `WorkflowSnapshot` shape after persistence replaces localStorage.

### Must-not-break files

- `.github/workflows/add-to-roadmap.yml`: existing roadmap workflow stays unchanged.
- `README.md`: updated only with app usage and verification.
- `src/auth/session.ts`: auth adapter boundary for replacing dev stub with `@curaos/auth-sdk`.
- `src/tenant/tenant.ts`: tenant adapter boundary for replacing header stub with `@curaos/tenancy`.
- `src/flow/storage.ts`: local persistence adapter; future API persistence should preserve `WorkflowSnapshot` versioning.

### Cross-phase dependencies

- M5-S2 process definitions is closed; this app saves JSON locally now and can later publish to the process-definition API.
- M3 auth SDK is represented as optional peer dependency; Verdaccio CI availability may require a registry setup follow-up before CI can install internal packages.
- Full docs mention future `@curaos/canvas`, `@curaos/forms`, `@curaos/api-client`, Zustand, Immer, and Playwright. Those are deliberately deferred because this issue asks for `@xyflow/react` and simple persistence.

## Prototype verdict

No throwaway prototype kept. The issue has a direct implementation target and the cheap unknowns are covered by the first production slice: React Flow canvas, local JSON persistence, and role-gated shell.

## Adversarial grill

Attempted direct opposite-harness grill:

`claude --model claude-opus-4-7 --effort high -p <prompt> > /tmp/curaos-workflow-designer-grill.md`

The command produced no output and could not complete in the available execution window. Planning proceeded with documented assumptions above.
