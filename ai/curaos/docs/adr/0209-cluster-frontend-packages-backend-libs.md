# ADR-0209 — Cluster: Frontend Packages + Backend Shared Libraries

> **Stack delta 2026-05-25:** "Separate Nx workspaces" was the original ADR-0209 decision. Per [[curaos-speed-patterns-rule]] DA12 the workspace adopted **Turborepo task runner + Nx generators co-existing** (single Bun workspace per [[curaos-bun-primary-rule]], not separate Nx workspaces). Frontend `curaos-apps/` wrapper banned per [[curaos-ai-mirror-rule]] — now `curaos/frontend/{apps,packages}/<kebab>/`. Body retained as historical decision record per [[curaos-knowledge-persistence-rule]] L6.

**Status:** Accepted (stack delta applied via DA12)
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — Frontend Packages + Backend Libs
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0106 Frontend Stack](0106-frontend.md)
- [ADR-0110 CI/CD + Release](0110-cicd-release.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121d Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0121e Forms](0121e-foundation-forms.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
- [ADR-0200 Cluster: Identity + Party + Org + Audit](0200-cluster-identity-party-org-audit.md)

---

## 1. Context

### 1.1 What this cluster is

This ADR binds two co-dependent surface areas into a single cluster decision:

1. **19 existing Flutter frontend packages** — migrated to React Native per ADR-0106 mandate. These are not services; they are client-side packages living in the `curaos/frontend/` Nx monorepo.
2. **15 NestJS shared backend libraries** — published to Verdaccio (per ADR-0110) under the `@curaos/*` npm scope. Every microservice in every other cluster depends on subsets of these libs. They are the horizontal integration layer of the entire platform.

Both surfaces are **infrastructure, not features**. A failure here propagates across every cluster. Getting them right is a Wave 1 Lite prerequisite.

### 1.2 Why cluster them together

Both surfaces share the same publication concern (Verdaccio, npm scoped packages, semver), the same monorepo host (`curaos/frontend/` for frontend; `curaos/backend/libs/` for backend), the same Nx build graph, and the same Renovate-driven dependency management. Separating them into two ADRs would duplicate the versioning, publishing, and deprecation policy sections without gain.

### 1.3 Scope boundaries

**In scope:**
- Migration strategy for all 19 Flutter packages → React Native + Expo SDK 52+
- Architecture and publication rules for all 15 `@curaos/*` backend libs
- Cross-cluster dependency topology (who depends on what)
- Versioning and release cadence policy
- Cookbook recipes that automate lib and package scaffolding

**Out of scope:**
- Individual service implementations (covered in their cluster ADRs)
- HealthStack-specific frontend (covered in ADR-0115)
- Builder IDE, Sites, Apps, Widgets product implementations (ADR-0121a–0121e)

---

## 2. Decision Summary

### 2.1 Frontend packages

| Decision | Pick |
|---|---|
| **Framework** | React Native 0.77+ via Expo SDK 52+ per ADR-0106 |
| **Web admin surfaces** | React 19 + Next 15 (App Router) per ADR-0106 |
| **Component library** | `@curaos/ui` (shadcn/Radix + Ant Design 5.x + RN equivalents) |
| **Monorepo manager** | Turborepo on top of Bun workspaces — single build graph |
| **Package manager** | Bun workspaces (pnpm fallback only when tool hard-codes pnpm) |
| **Build** | Metro (React Native via Expo) + Turbopack (Next 15 web) |
| **Flutter archive** | All 19 packages archived to `archive/flutter-packages/` submodule; marked deprecated; NOT deleted |
| **New package scaffold** | Codegen recipe `ui.react-native` (new per ADR-0123) |
| **Publishing (frontend libs)** | Verdaccio via `@curaos/*` scope — same registry as backend libs |
| **Expo OTA** | Expo EAS Update for React Native apps; disabled for Next web targets |

### 2.2 Backend shared libraries

| Decision | Pick |
|---|---|
| **Runtime** | NestJS (TypeScript 5.x) per ADR-0100 |
| **Registry** | Verdaccio (self-hosted, per ADR-0110) — `@curaos/*` npm scope |
| **Versioning** | Semver per lib; co-versioned milestone tags align with platform releases |
| **Changelog** | git-cliff + conventional commits per ADR-0110 §3.6 |
| **Scaffold** | Codegen recipe `lib.nestjs-shared` (new per ADR-0123) |
| **Signing** | cosign keyless on every published package (SLSA provenance per ADR-0110 §3.10) |
| **Breaking-change policy** | Major bump + 2-sprint deprecation notice via ADR-0110 §3.14 channels |
| **Tenant developer access** | `@curaos/*` libs available to tenant plugin developers via Verdaccio proxy scoped token |

---

## 3. Frontend Package Migration

### 3.1 Existing Flutter packages → React Native

| Flutter package | Status | v1 replacement |
|---|---|---|
| `admin_app` | Archived | Rebuilt as React+Next 15 admin shell (web) — primary operator/admin surface |
| `api_client` | Archived | Replaced by TypeSpec-generated TS clients per ADR-0103 + ADR-0123 `api.openapi` recipe |
| `ui_kit` | Archived | Migrated to `@curaos/ui` — React + React Native dual-export design system |
| `business_automation` | Archived | Rebuilt as React Native + Expo (mobile) + React+Next (web admin console) |
| `business_donation` | Archived | Same — React Native + Expo + web |
| `business_shop` | Archived | Same — React Native + Expo + web |
| `business_site` | Archived | Same — React Native + Expo + web |
| `business_workflow` | Archived | Same — React Native + Expo + web; reuses Workflow Canvas (ADR-0121d) |
| `personal_automation` | Archived | React Native + Expo — personal automation mobile surface |
| `personal_calendar` | Archived | React Native + Expo — personal calendar mobile + web |
| `personal_donation` | Archived | React Native + Expo |
| `personal_notes` | Archived | React Native + Expo |
| `personal_shop` | Archived | React Native + Expo |
| `personal_site` | Archived | React Native + Expo |
| `personal_tasks` | Archived | React Native + Expo |
| `personal_tracking` | Archived | React Native + Expo |
| `personal_workflow` | Archived | React Native + Expo — personal workflow mobile surface |
| `fleet_manager` | Archived | Rebuilt as React+Next web (fleet admin) + React Native (driver mobile app) |
| `hosted_login` | Removed | Superseded by CuraOS Auth React+Next portal per ADR-0120. No replacement package. |

**Archive procedure:**

```
curaos/frontend/
  archive/
    flutter-packages/       ← submodule or flat copy
      admin_app/
      api_client/
      ui_kit/
      business_*/
      personal_*/
      fleet_manager/
      hosted_login/
      README.md             ← deprecation notice + redirect to v1 equivalent
```

- Git tag `flutter-archive-2026-05` on each Flutter package before archive.
- Submodule pointers in `curaos/` updated to point at `archive/flutter-packages/` for history preservation.
- Nx workspace removes all Flutter targets; Melos removed from toolchain.
- No source deletion — reversibility preserved for future cookbook recipe authoring (Flutter cookbook per ADR-0123 v2 scope).

### 3.2 New React Native package structure

```
curaos/frontend/
  packages/
    @curaos/
      ui/                     ← design system (React + RN dual export)
  apps/
    admin/                    ← React+Next 15 — operator admin shell
      business/
        automation/           ← React Native + Expo
        donation/
        shop/
        site/
        workflow/
      personal/
        automation/
        calendar/
        donation/
        notes/
        shop/
        site/
        tasks/
        tracking/
        workflow/
      fleet/
        admin/                ← React+Next 15 (web)
        driver/               ← React Native + Expo (mobile)
```

**Expo Router 4 (file-based routing)** applies to all React Native apps.

**Shared across web + mobile apps:**

| Layer | Library |
|---|---|
| State (server data) | Apollo Client (GraphQL) + TanStack Query (REST) |
| State (UI) | Zustand |
| Forms | Formily (per ADR-0121e) |
| i18n | next-intl (web) + react-i18next + expo-localization (mobile) |
| Offline sync | PowerSync (JS SDK, Postgres-backed) |
| Real-time | SSE EventSource + socket.io-client + Apollo subscriptions |
| Telemetry | @opentelemetry/sdk-trace-web (web) + opentelemetry-react-native (mobile) |
| Auth client | `@curaos/auth-sdk` (per ADR-0120) |

### 3.3 `@curaos/ui` — dual-export design system

Canonical spec: ADR-0106 §5. This section records integration rules:

- Single package, dual entry points: `@curaos/ui/web` (React, Radix, shadcn, Ant Design 5.x) and `@curaos/ui/native` (RN equivalents, react-native-shadcn community layer + Ant Design Mobile RN).
- Theming via Style Dictionary W3C tokens → CSS vars (web) + RN StyleSheet theme (native). Per-tenant overrides injected at runtime; no build-time fork per tenant.
- Published to Verdaccio as `@curaos/ui`. Tenant plugin developers can import it.
- HealthStack clinical layer (`@medplum/react` + SMART-on-FHIR components) re-exported from `@curaos/ui/healthstack` — only loaded when HealthStack overlay active.

---

## 4. Backend Shared Libraries

### 4.1 Library catalogue

| Library | Role | Consumers |
|---|---|---|
| `@curaos/core` | DI bootstrap, base interfaces (IService, IRepository), global exception filters, NestJS config loaders | All services |
| `@curaos/auth-sdk` | JWT validation guard, OIDC token exchange client, session context decorator | All services |
| `@curaos/audit-sdk` | `AuditInterceptor`, `AuditEvent` schema, Kafka publisher to `curaos.audit.events` | All services (per ADR-0200) |
| `@curaos/tenancy` | `TenantInterceptor`, per-request tenant context (schema selector, tenant config resolver) | All services |
| `@curaos/events` | Kafka + NATS NestJS microservice transports, outbox pattern helpers, event envelope types, `EventInterceptor` base | All services |
| `@curaos/observability` | OTel tracer factory, correlation-ID middleware, tenant-tag propagator, Loki structured-log helpers | All services |
| `@curaos/policy` | Cerbos gRPC client wrapper, OPA-WASM loader, OpenFGA client wrapper, `PolicyGuard` NestJS guard | All services |
| `@curaos/codegen-sdk` | Cookbook discovery client, recipe invocation API, `.gen.ts` write helper | Codegen engine + any service invoking codegen |
| `@curaos/plugin-runtime` | WASM (Wasmtime/napi-rs) loader, isolated-vm runner, NestJS NATS sidecar bootstrap | Services accepting tenant plugins |
| `@curaos/secrets` | OpenBao client wrapper, secret lease manager, rotation hook | All services needing secrets beyond env vars |
| `@curaos/fhir-client` | HAPI FHIR R4/R5 HTTP client, FHIR resource type helpers, SMART-on-FHIR token exchange | HealthStack overlay services only |
| `@curaos/recurrence` | rrule + luxon wrapper, recurrence expansion, RRULE↔iCal serialization (per ADR-0203) | calendar-service, tasks-service, scheduling-service |
| `@curaos/canvas` | Shared visual-editor library (React Flow + Dagre); workflow diagram primitives (per ADR-0121d) | Workflow Manager, Builder IDE |
| `@curaos/forms` | Shared form engine (Formily core + Puck layout engine per ADR-0121e) | Builder Apps, all personal + business apps |
| `@curaos/ui` | shadcn/Radix + Ant Design 5.x + RN equivalents; tenant theming via Style Dictionary | All frontend apps + tenant plugin UIs |

### 4.2 Mandatory libs (every NestJS service)

Every service in every cluster MUST import:

```
@curaos/core
@curaos/auth-sdk
@curaos/audit-sdk
@curaos/tenancy
@curaos/events
@curaos/observability
@curaos/policy
@curaos/secrets
```

These seven form the **universal NestJS service harness**. Omitting any one is a CI failure (lint rule: `@curaos/eslint-config` package enforces import presence at module root level).

### 4.3 Conditional libs (per service type)

| Condition | Additional lib |
|---|---|
| Service generates or invokes codegen | `@curaos/codegen-sdk` |
| Service accepts tenant WASM/sidecar plugins | `@curaos/plugin-runtime` |
| HealthStack overlay service | `@curaos/fhir-client` |
| Service deals with recurring time | `@curaos/recurrence` |
| Service renders workflow canvas UI | `@curaos/canvas` |
| Service renders form surfaces | `@curaos/forms` |
| Any frontend package | `@curaos/ui` |

### 4.4 Versioning policy

```
@curaos/<lib>@<MAJOR>.<MINOR>.<PATCH>
```

| Rule | Detail |
|---|---|
| **Patch** | Bug fixes, security patches — no API change. Auto-promoted by Renovate to all service repos. |
| **Minor** | Additive features, new exports — backward compatible. Renovate opens PR; team reviews. |
| **Major** | Breaking API change. Requires deprecation notice 2 sprints before. All cluster ADRs updated to reference new major. Old major maintained for 1 release cycle. |
| **Platform milestone tags** | `platform-v1.0`, `platform-v1.1` etc. pin exact lib versions for air-gap bundle reproducibility per ADR-0110 §3.9. |
| **Co-versioning** | Libs do NOT share a single version number. Each lib versions independently. Platform milestone tags are additive aliases, not locks. |

### 4.5 Publication pipeline

```
lib source (curaos/backend/libs/<lib>/)
  └─▶ Turborepo build (tsc + rollup; CJS + ESM dual output)
      └─▶ bun publish
          └─▶ Verdaccio publish (@curaos/<lib>@x.y.z)
              ├─▶ cosign sign (keyless SLSA provenance)
              └─▶ Harbor OCI mirror (for air-gap bundle inclusion)
```

GitHub Actions reusable workflow: `.github/workflows/publish-lib.yml` (per ADR-0110 §4 catalog).

Triggered by: `release-please` (per ADR-0110 §3.6) creating release tag for the lib sub-package.

### 4.6 Tenant developer access

Tenant developers building custom plugins (per ADR-0123) can depend on `@curaos/*` libs:

- Verdaccio issues scoped read token per tenant (tenant ID embedded in token claims).
- Write access to `@curaos/*` scope: platform team only. Tenants get read-only.
- Tenant-private packages published under `@<tenant-id>/*` scope — separate Verdaccio namespace.
- `@curaos/plugin-runtime` exposes stable public API surface; internal Wasmtime binding is private.

---

## 5. Cross-Cluster Dependency Topology

### 5.1 Backend libs consumed per cluster

| Cluster | Mandatory 7 | Additional |
|---|---|---|
| ADR-0200 Identity + Party + Org + Audit | Yes | — |
| ADR-0201 Platform Shared Services | Yes | `@curaos/codegen-sdk`, `@curaos/plugin-runtime` |
| ADR-0202 Commerce + Sales + Procurement + Inventory | Yes | — |
| ADR-0203 Calendar + Scheduling + Tasks + Events | Yes | `@curaos/recurrence` |
| ADR-0204 Workflow + Automation Overlays | Yes | `@curaos/canvas`, `@curaos/forms`, `@curaos/codegen-sdk`, `@curaos/plugin-runtime` |
| ADR-0115 HealthStack Overlays | Yes | `@curaos/fhir-client`, `@curaos/recurrence` |
| Foundation Builder (ADR-0121a–0121e) | Yes | `@curaos/canvas`, `@curaos/forms`, `@curaos/codegen-sdk`, `@curaos/plugin-runtime` |

### 5.2 Dependency direction rule

```
Vertical overlay services
    └─▶ Neutral core services
            └─▶ @curaos/* libs
                    └─▶ (no upstream service deps — libs are leaf nodes)
```

Libs must NEVER import from services. Services may import from libs. CI lint rule enforces this (`no-service-import-in-lib` custom ESLint rule shipped in `@curaos/eslint-config`).

### 5.3 Frontend ↔ backend lib bridge

Frontend packages do NOT directly import backend libs. The bridge is:

```
frontend package
  └─▶ TypeSpec-generated TS API client (@curaos/<service>-client.gen.ts)
        └─▶ APISIX gateway
              └─▶ NestJS service (imports @curaos/* libs internally)
```

Exception: `@curaos/ui` and `@curaos/forms` and `@curaos/canvas` are frontend-consumable. They contain no NestJS or Node.js server-side code. Their Verdaccio packages are isomorphic (browser + RN compatible).

---

## 6. Codegen Recipes

Two new Codegen recipes (per ADR-0123) introduced by this cluster:

### 6.1 `lib.nestjs-shared` (new)

Scaffolds a new `@curaos/<lib>` backend shared library:

```
cookbook/lib.nestjs-shared/
  recipe.yaml              # inputs: libName, description, conditionalFeatures[]
  skeleton/
    src/
      index.ts.njk         # barrel export
      {{libName}}.module.ts.njk
      {{libName}}.service.ts.njk
      {{libName}}.interceptor.ts.njk  # if interceptor: true
    test/
      {{libName}}.spec.ts.njk
    package.json.njk       # @curaos/{{libName}}, dual CJS+ESM, peerDeps
    tsconfig.json.njk
    project.json.njk       # Nx project config
  actions/
    register-verdaccio.sh  # adds lib to Verdaccio namespace
    setup-release-please.sh
```

### 6.2 `ui.react-native` (new)

Scaffolds a new React Native + Expo app package in the monorepo:

```
cookbook/ui.react-native/
  recipe.yaml              # inputs: appName, tier (business|personal|fleet|admin), targets[]
  skeleton/
    app/
      _layout.tsx.njk      # Expo Router 4 root layout
      (tabs)/
        index.tsx.njk
    components/
      {{appName}}Screen.tsx.njk
    hooks/
      use{{AppName}}Data.ts.njk
    package.json.njk       # expo + @curaos/ui + apollo + zustand
    app.json.njk           # Expo config
    tsconfig.json.njk
    project.json.njk       # Nx target: start, build:ios, build:android, build:web
  actions/
    eas-init.sh            # EAS project registration
    register-nx.sh
```

---

## 7. Open Questions (Resolved)

| Question | Resolution |
|---|---|
| **Flutter archive vs delete** | Archive to `archive/flutter-packages/` submodule. NOT deleted. Rationale: future Flutter cookbook recipe authoring needs original package shapes as reference; storage cost negligible vs. reversibility value. |
| **React Native versioning vs Expo SDK upgrade cadence** | Apps peg Expo SDK major. Renovate opens upgrade PRs when new SDK releases. Nx + Metro config updated by recipe `ui.react-native` on upgrade. Policy: upgrade within 3 months of Expo SDK major GA. |
| **Per-tenant fork of `@curaos/ui` for branding** | No fork. Runtime theming via Style Dictionary token override at tenant config load time (CSS vars injection on web; RN StyleSheet theme swap on mobile). Forking creates N maintenance burdens — rejected. |
| **npm scope name** | `@curaos` — matches charter name, single word, no ambiguity. `@cura-os` and `@cura/os` rejected (hyphen creates package manager confusion; slash is a scope separator). |
| **Public npm vs private Verdaccio only** | Private Verdaccio only for v1. `@curaos/ui`, `@curaos/forms`, `@curaos/canvas` MAY be published to public npm in v2 if open-sourced per product strategy. Backend libs stay private indefinitely (contain platform-internal APIs). |

---

## 8. Architecture Decision: Turborepo + Bun Workspace Structure

```
curaos/frontend/                          ← Turborepo + Bun workspace root
  turbo.json
  package.json (workspaces: ["apps/*","packages/*"])
  packages/
    @curaos/
      ui/                                 ← @curaos/ui (isomorphic)
      forms/                              ← @curaos/forms (isomorphic)
      canvas/                             ← @curaos/canvas (React-only)
      eslint-config/                      ← shared ESLint rules
      tsconfig/                           ← shared TS configs
  apps/
    admin/                                ← React+Next 15 admin shell
    business/
      automation/  donation/  shop/  site/  workflow/   ← React Native + Expo
    personal/
      automation/  calendar/  donation/  notes/  shop/
      site/  tasks/  tracking/  workflow/            ← React Native + Expo
    fleet/
      admin/                              ← React+Next 15
      driver/                             ← React Native + Expo
  archive/
    flutter-packages/                     ← archived; read-only

curaos/backend/libs/                      ← separate Nx workspace (backend)
  packages/
    core/          auth-sdk/    audit-sdk/
    tenancy/       events/      observability/
    policy/        codegen-sdk/ plugin-runtime/
    secrets/       fhir-client/ recurrence/
    canvas/        forms/       ui/
```

Nx affected commands (`nx affected:build`, `nx affected:test`) run on every PR to build only changed packages and their dependents. Remote cache: Nx Cloud (free tier) or self-hosted Nx Powerpack per ADR-0110.

---

## 9. Security + Compliance

| Concern | Control |
|---|---|
| **Supply chain** | Verdaccio mirrors upstream npm; cosign signs all `@curaos/*` packages; SBOM (Syft) per published version per ADR-0110 §3.10 |
| **Secret exposure in libs** | `@curaos/secrets` is the ONLY lib that touches OpenBao. Other libs must not embed secrets. `gitleaks detect --staged` pre-commit hook. |
| **PHI boundary** | `@curaos/fhir-client` marked with `curaos:overlay:healthstack` in `package.json` metadata. CI rule: only services under `healthstack-*` may import it. Neutral services importing it fail CI. |
| **Plugin sandbox** | `@curaos/plugin-runtime` enforces WASM fuel limits + epoch deadline. No lib may bypass sandbox by importing Wasmtime bindings directly. |
| **Tenant token scope** | Verdaccio tenant read tokens scoped to `@curaos/*` (read) + `@<tenant-id>/*` (read+write). Platform team tokens cover all scopes. |
| **Dependency pinning** | Renovate SHA-pins all Nx and Expo transitive dependencies per ADR-0110 §3.8. |

---

## 10. Observability

All frontend apps instrument via:
- `@opentelemetry/sdk-trace-web` (Next.js apps)
- `opentelemetry-react-native` (Expo apps)
- Correlation ID propagated via `X-Correlation-ID` header (set by `@curaos/observability` on API client base config)
- Tenant ID tag on all spans (`tenant.id` OTel attribute)

Backend libs do not emit spans themselves (they are libraries). Services wrapping them instrument at service level. Exception: `@curaos/audit-sdk` emits a dedicated `audit.publish` span per event publish for end-to-end audit trace visibility.

---

## 11. Testing Standards

### Frontend packages
| Test type | Tool |
|---|---|
| Unit (components) | Vitest + React Testing Library + react-native-testing-library |
| Snapshot | Vitest snapshots; updated on deliberate change only |
| a11y | axe-core CI + jsx-a11y ESLint + react-native-a11y |
| E2E (web) | Playwright per ADR-0110 |
| E2E (mobile) | Detox (iOS/Android) — EAS device farm |
| Visual regression | Chromatic (Storybook stories for `@curaos/ui` components) |

### Backend libs
| Test type | Tool |
|---|---|
| Unit | Vitest |
| Integration | Testcontainers (PG17, Kafka, NATS, Valkey spun per test suite) |
| Contract | Pact — libs publish consumer contracts consumed by services |
| Lint (import rules) | ESLint `@curaos/eslint-config` — enforces mandatory lib presence + PHI boundary |

---

## 12. Implementation Sequence

| Phase | Work | Prerequisite |
|---|---|---|
| **P0 — Lib harness** | Publish `@curaos/core`, `@curaos/auth-sdk`, `@curaos/audit-sdk`, `@curaos/tenancy`, `@curaos/events`, `@curaos/observability`, `@curaos/policy`, `@curaos/secrets` to Verdaccio | ADR-0200 identity-service live |
| **P1 — Codegen libs** | Publish `@curaos/codegen-sdk`, `@curaos/plugin-runtime` | ADR-0123 Codegen engine live |
| **P2 — Overlay libs** | Publish `@curaos/fhir-client`, `@curaos/recurrence`, `@curaos/canvas`, `@curaos/forms`, `@curaos/ui` | ADR-0121d/0121e Builder canvas + forms live |
| **P3 — Flutter archive** | Tag + archive all 19 Flutter packages; remove from active Nx workspace; update submodule pointers | P0 done (new packages confirmed working) |
| **P4 — React Native apps** | Scaffold via `ui.react-native` recipe; wire `@curaos/ui` + auth-sdk + Apollo | P0 + P2 done |
| **P5 — CI enforcement** | Enable mandatory-lib ESLint rule in CI for all service repos | P0 libs published + stable API |

---

## 13. Definition of Done

A lib or frontend package is **done** when:

1. Published to Verdaccio at `@curaos/<name>@1.0.0` (or relevant semver).
2. SBOM generated and cosign signature attached.
3. Unit + integration tests green (Vitest / Testcontainers).
4. ESLint `@curaos/eslint-config` rules passing (import boundary, no-service-import-in-lib).
5. Nx `affected:build` + `affected:test` run clean on PR.
6. `ai/curaos/backend/libs/<name>/CONTEXT.md` + `Requirements.md` created or updated.
7. For frontend packages: Expo Router entrypoint renders in Expo Go + web browser.
8. For frontend packages: Chromatic story published (if `@curaos/ui` component added).
9. No deferred items without explicit approval per AGENTS.md §11.

---

## 14. Rejected Alternatives

| Alternative | Reason rejected |
|---|---|
| **Keep Flutter packages active alongside React Native** | Two mobile stacks = doubled maintenance. Contradicts ADR-0106 explicit mandate and user directive. |
| **Publish `@curaos/*` libs to public npm immediately** | Platform-internal APIs exposed before stable. Premature open-sourcing. Re-evaluate at v2 product strategy review. |
| **Monorepo for both frontend + backend libs** | Frontend and backend have incompatible runtimes (browser/RN vs Node.js). Separate Nx workspaces avoid accidental cross-contamination. Shared config via `@curaos/tsconfig` package. |
| **Single version for all `@curaos/*` libs** | Lockstep versioning forces all consumers to upgrade everything at once — unacceptable for 91 service submodules. Independent semver per lib is correct. |
| **Jfrog Artifactory for npm registry** | Requires paid license for full feature set; contradicts self-hosted-first charter. Verdaccio is Apache 2.0 + operationally simpler at this scale. |
| **`@cura/os` or `@cura-os` npm scope** | Slash in `@cura/os` is a nested scope (not supported by all registries); `@cura-os` hyphen creates confusion in package manager output. `@curaos` is unambiguous. |
| **Per-tenant fork of `@curaos/ui`** | N forks = N maintenance headaches + diverging a11y, security patches. Runtime token override achieves same visual result without forking. |
