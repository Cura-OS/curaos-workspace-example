# Agent — curaos/frontend (React Native + Next.js Monorepo)

> **Stack pivot 2026-05-24:** This module migrated from Flutter/Dart to React Native (Expo) + Next.js + TypeScript on Bun runtime. See [[curaos-bun-primary-rule]] + [[curaos-nestjs-docs-first-rule]].

## Mission
Oversee the Turborepo workspace so shared packages, vertical overlays, and generated applications stay aligned with the CuraOS platform roadmap across web (Next.js) and mobile (React Native / Expo) targets.

## Responsibilities
- Maintain Turborepo configuration, shared lint/test/type-check tooling, and CI pipelines that build, test, and publish `@curaos/*` packages.
- Guard the dependency graph: generic packages remain independent; overlays only consume generic layers.
- Provide Storybook stories and integration tests for standalone packages and HealthStack bundles while preparing EducationStack/ERP starters.
- Operate the builder workflow end-to-end — capture tenant requirements, generate packages/apps, register replayable mocks (MSW), escalate gaps to GitHub Issues triage, and trigger code-management automation.
- Ensure generated clients come with identity registrations (client IDs, scopes, rotation policies), deployment manifests, and paired documentation stubs.
- Enforce multi-version API contract testing so `@curaos/*` packages stay compatible with all active REST/GraphQL/FHIR/event revisions.

## Integration map

### Event producers / consumers
- All frontend apps consume events via `@curaos/api-client` React Query hooks; no direct WebSocket/SSE wiring outside that package.
- Builder Studio publishes BPM artifact definitions to `workflow-core-service`.
- Workflow Designer publishes versioned BPMN JSON to `workflow-core-service`.
- HealthStack overlays (clinician-app, front-office, patient-app) consume PHI-bearing events from healthstack services only; PHI never crosses into neutral app shells.

### Files that must not break
- `turbo.json` — pipeline task graph; any change cascades to all build/test/lint tasks.
- `package.json` (root) — workspace package list; must be updated on every submodule add/remove.
- `packages/api-client/specs/` — versioned OpenAPI 3.1 specs; source of truth for all generated hooks.
- `packages/ui-kit/src/tokens/` — design token source; breaking change ripples across all apps.

### Cross-phase dependencies
- `@curaos/api-client` generated types must be updated before any app can consume a new backend endpoint.
- `@curaos/auth-sdk` PKCE flow must be stable before hosted-login is retired (see hosted-login deprecation checklist).
- `@curaos/canvas` (ADR-0121d) and `@curaos/forms` (ADR-0121e) are shared by builder-studio and workflow-designer; breaking changes in those packages require coordinated upgrades.

## Guardrails
- No PHI/PII in neutral app shells; PHI stays within HealthStack overlay packages and services.
- No direct database connections — consume backend REST/GraphQL/FHIR APIs and event streams.
- Keep logic in shared TypeScript packages; avoid duplicating business logic in individual app shells.
- Align accessibility, localization, and performance baselines across packages before overlays customize them.
- Capture HealthStack-specific customizations as adapters or theming layers, never by forking generic packages.

## Definition of Done
- Generic packages compile, type-check, lint, and test independently.
- Overlay apps reuse generic layers without circular dependencies and ship production builds.
- Builder-generated artifacts include documentation, MSW replayable mocks, and automation hooks required to deploy SaaS, on-prem, and home-lab footprints.

---

> **Historical (pre-2026-05-24 Flutter era):** The original Flutter monorepo used Melos for workspace orchestration, `com.cura.os.mock` for mock registration, and `com.cura.os.tech.planning` for gap escalation. See RFC-0001/0002/0003 in `ai/curaos/docs/rfcs/` for archaeology.
