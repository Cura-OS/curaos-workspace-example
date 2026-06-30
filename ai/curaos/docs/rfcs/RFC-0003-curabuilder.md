# RFC-0003: CuraBuilder — App & Site Composition Platform

> **Status: SUPERSEDED (2026-05-24).** This RFC captures the pre-pivot Flutter-based builder plan. Current stack is NestJS + GrapesJS + Payload + @xyflow/react per ADR-0121 family. Path references like `curaos-apps/packages/cura_os/<snake>` describe a layout that NO LONGER exists — current layout is `curaos/frontend/apps/<kebab>` + `curaos/frontend/packages/<kebab>`. Kept for historical record per [[curaos-knowledge-persistence-rule]] L6.

## Status
Superseded by ADR-0121 family (NestJS + GrapesJS + Payload builder stack) — Flutter plan retained for archaeology only.

## Owners
- CuraOS Architecture Team (workspace steward: Agent — CuraOS)
- Service maintainers: Agent — site-core-service, Agent — personal-site-service, Agent — business-site-service
- Frontend maintainers: Agent — business_site, Agent — personal_site, Agent — builder_studio (forthcoming)

## Created
2025-10-08

## Summary
CuraBuilder is the unified form, page, and experience builder for CuraOS. It starts by pairing a schema-driven form designer with a layout/page composer that consumes CuraFlow (CFDL) task requirements. Over time it expands into a full Flutter app/site builder that can publish responsive experiences (web, desktop, mobile) using shared component registries. Builder artifacts feed site-core-service for publishing, workflow-core-service for orchestration, and the automation core for connector execution. In developer mode, all builder-generated apps run without identity prompts, automatically assuming an admin identity to accelerate prototyping.

## Problem Statement
Teams currently assemble pages and forms manually across various Flutter packages (`personal_site`, `business_site`, admin apps), leading to duplication and drift. Workflow definitions (CFDL) describe human tasks but lack a cohesive bridge to UI scaffolding. CuraOS requires a builder platform that:
- Designs forms and pages from the same component registry used in production apps.
- Aligns with workflow tasks so human-facing steps render consistently across surfaces.
- Supports site and app generation without diverging between web and Flutter targets.
- Operates offline-friendly for developers, with dev-mode bypass of identity service.

## Goals
- Define a builder composition format that is JSON-first, Git-friendly, and references shared UI components without XML.
- Deliver an initial form builder that consumes CFDL task schemas and outputs component layouts ready for Flutter packages.
- Add a responsive page composer that maps sections, grids, and interactive widgets while honoring accessibility/theming.
- Provide a Flutter-based Builder Studio (`frontend/curaos-apps/packages/cura_os/builder_studio`) capable of running in dev mode without login, assuming an admin tenant identity by convention.
- Integrate with site-core-service (publishing), workflow-core-service (task metadata), automation-core-service (connectors), and storage-service (assets) using event-driven patterns.
- Offer CLI and CI tooling to validate composition files, diff releases, and seed tenant configurations.

## Non-Goals
- Replacing vertical-specific authoring overlays (they extend Builder via plugins rather than forking it).
- Implementing bespoke rendering engines outside Flutter and web targets (React Native, etc.).
- Managing billing or entitlement logic for builder-generated experiences.

## Architecture
| Component | Responsibility | Repo/Path |
| --------- | -------------- | --------- |
| Builder Core Service | Stores compositions, versions, publishing metadata, preview states | `backend/services/site-core-service` (expanded to include builder modules) |
| Component Registry | Catalog of reusable widgets with prop schemas and theming tokens | `site-core-service` + shared packages (`frontend/curaos-apps/packages/cura_os/ui_kit`) |
| Form Engine | Maps CFDL task context to forms, validation rules, and submission handlers | Shared between builder studio and workflow packages |
| Layout/Navigation Engine | Captures page hierarchy, routing, navigation flows, and responsive breakpoints | Builder core + Flutter renderer packages |
| Builder Studio (Flutter) | Visual editor for forms/pages, integrates CFDL previews, publishes drafts | `frontend/curaos-apps/packages/cura_os/builder_studio` |
| Render Targets | Generated bundles for Flutter apps/web, static exports, and live preview shells | Business/personal site packages, admin apps |
| Tooling & CLI | `make builder-*` commands, schema validation, import/export for tenant configs | `scripts/builder_*` (to be added) |

## Cura Builder Composition Format (CBCF)
- **Format:** JSON (with YAML support for authoring convenience) validated via JSON Schema (`docs/specs/cbcf/v1/schema.json`, to be introduced).
- **Structure:**
  ```json
  {
    "$schema": "https://schemas.curaos.dev/cbcf/v1.json",
    "id": "admin-onboarding",
    "version": "1.0.0",
    "metadata": {...},
    "environment": {
      "renderTargets": ["flutter:web", "flutter:desktop"],
      "devMode": {
        "assumedIdentity": "admin",
        "skipAuth": true
      }
    },
    "components": [...],
    "layouts": [...],
    "routes": [...],
    "bindings": {...},
    "workflows": [
      {
        "cfdlRef": "order-fulfillment@1.3.0",
        "taskId": "user.task.review-order",
        "form": "form_review_order"
      }
    ],
    "assets": {...},
    "extensions": {...}
  }
  ```
- **Components:** Reference registry entries keyed by `componentKey` (e.g., `ui.form.input.text`). Properties follow schema-defined types and default values.
- **Layouts:** Define responsive grids, containers, slot-based compositions, and conditional rendering (CEL expressions). Support nested layouts for dashboards and multipage flows.
- **Routes:** Map navigation hierarchy for Flutter apps and static sites, including route guards that can be toggled off in dev mode.
- **Bindings:** Connect components to data sources (GraphQL queries, REST endpoints, automation connectors). Bindings reference workflows (CFDL tasks), services, or local state.
- **Dev Mode:** Explicit configuration to skip identity, injecting an assumed admin user/tenant for local previews, aligning with repository-wide dev posture.
- **Interoperability:** Provide converters for existing page definitions and align with CFDL `forms` entries when workflows drive the UI.

## Form & Page Builder Strategy
- **Form Builder:** Auto-generates starter forms from CFDL task context (`context.inputs/outputs` and `forms` entries) with drag-and-drop adjustments. Supports validation rules (CEL, RegEx) and conditional sections.
- **Page Builder:** Uses a section/block model for hero, forms, lists, embeds, etc., with real-time preview for multiple breakpoints. Allows embedding workflow-driven forms as blocks.
- **Component Registry:** Maintained via site-core-service; each component publishes metadata (props, events, slots) and example previews. Builder Studio consumes the registry to stay in sync with runtime packages.
- **Publishing:** Builder commits or API calls produce CBCF manifests plus pre-rendered assets; site-core-service handles versioning, preview, publish, rollbacks.

## Developer Experience
- Builder Studio runs with `fvm flutter run -d chrome` or desktop; dev mode auto-assumes admin identity (no login).
- CLI (`make builder-validate`) validates CBCF files using JSON Schema and ensures referenced components/tasks exist.
- Preview APIs allow designers to test flows via mocked data or live workflow-core-service endpoints.
- Generated bundles integrate with existing Flutter packages (admin_app, business_site, etc.), sharing theming and design tokens.

## Integrations
- **workflow-core-service:** Supplies CFDL definitions/task metadata; builder updates forms when workflows change. Emits coordination events (`builder.forms.synced`) to monitor drift.
- **site-core-service:** Stores CBCF compositions, manages component registry, publishing pipeline.
- **automation-core-service:** Provides connector catalog so builder can wire actions without custom code.
- **identity-service:** Production mode uses OAuth/OIDC; dev mode uses assumed identity stub. Builder Studio enforces toggles to prevent accidental deployment of dev-mode configs.
- **storage-service/minio:** Hosts media assets and generated static bundles.

## Deployment Profiles
- **Local:** Builder Studio + site-core-service + workflow-core-service via Docker Compose; dev mode skip auth enabled by default.
- **On-Prem:** Helm chart (`ops/helm/curabuilder`, forthcoming) layering builder APIs and Studio hosting. Integrates with corporate SSO but still supports dev-mode toggles for lab environments.
- **SaaS:** Multi-tenant builder environment with per-tenant isolation, telemetry, and audit trails for changes.

## Roadmap
| Phase | Scope | Notes |
| ----- | ----- | ----- |
| R1 | CBCF schema v1, form builder MVP tied to CFDL tasks, dev-mode previews, publish to site-core-service preview | Unlocks end-to-end workflow-driven form authoring |
| R2 | Page layout composer, responsive previews, component registry management UI, CLI validation tools | Bridges forms into full page experiences |
| R3 | Full app builder (navigation, routing, data bindings), app packaging/export for Flutter targets | Enables multi-surface delivery from single definition |
| R4 | Marketplace templates, multi-tenant analytics, AI-assisted suggestions, collaboration features | Extends builder into ecosystem platform |

## Guardrails & Dev Mode Policy
- All builder-generated experiences must explicitly flag dev-mode identity assumptions; publishing pipelines reject configurations with `skipAuth=true`.
- Builder Studio persists dev-mode state locally (no backend storage) and prompts developers before syncing to shared environments.
- Site/app previews log assumed identity usage for auditability.

## Impact
- **Backend:** Expands site-core-service into the canonical store for compositions and component registry, influencing schema and API evolution.
- **Frontend:** Reduces duplication across site/app packages by centralizing form/page logic; builder studio becomes primary editing experience.
- **Ops:** Introduces new helm charts, asset pipelines, and auditing for builder actions.
- **Docs/Tooling:** Adds CBCF schema, validation scripts, and updated codex entries referencing builder studio and composition formats.

## Follow-Up Tasks
- Provide component registry and workflow metadata endpoints (or mocks) so Builder Studio palettes/tasks hydrate in local dev; wire them to `BUILDER_COMPONENTS_URL` and `BUILDER_WORKFLOW_URL` runtime configuration.
- Check sample CBCF manifests (e.g., under `docs/specs/cbcf/examples/`) into the repo so `make builder-validate` runs against real definitions and exercises schema coverage.

## Open Questions
- Should CBCF allow inline scripting (CEL) beyond simple expressions, or defer to automation connectors?
- What is the right balance between schema-driven props and free-form JSON for experimental components?
- How will builder studio manage localization workflows in tandem with site-core-service?

## References
- `backend/services/site-core-service/README.md`
- `backend/services/workflow-core-service/README.md`
- `frontend/curaos-apps/packages/cura_os/business_site/README.md`
- `frontend/curaos-apps/packages/cura_os/personal_site/README.md`
- `frontend/curaos-apps/packages/cura_os/ui_kit/README.md`
- `docs/rfcs/RFC-0001-curaid.md`
- `docs/rfcs/RFC-0002-curaflow.md`

## Codex Artifact
RFC alignment requires updates to:
- `backend/services/site-core-service/codex.json` (include CBCF formats, events, tooling).
- `frontend/curaos-apps/packages/cura_os/builder_studio/codex.json` (new).
- `frontend/curaos-apps/packages/cura_os/ui_kit/codex.json` (component registry metadata).
