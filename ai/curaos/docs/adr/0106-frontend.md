# ADR-0106 — Frontend Stack Aligned with Foundation Products

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter](0099-charter-priorities-vision.md), [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
**Supersedes:** [0097-archived-frontend-research.md](0097-archived-frontend-research.md) (legacy DRAFT; kept for option-scan history)

---

## 1. Context

Original ADR-0106 picked React+Next/Flutter/Astro/Lit + PowerSync + Weblate. ADR-0121 (Builder Suite) decomposed Builder into 4 sellable products (IDE + Sites + Apps + Widgets). User directive during interview reframes the framework choice: **drop Flutter from foundation v1, use React Native for mobile + desktop + other platforms instead**. Reasoning: reduce friction during solo + AI-agent-swarm dev; one TS stack across web + mobile. Flutter (and KMP, SwiftUI, etc.) become future cookbook recipes per ADR-0123.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Web UI** | React 19 + Next 15 (App Router) — ALL foundation product UIs (Builder IDE, Auth admin, Apps, Workflow, Codegen) |
| **Mobile + desktop + cross-platform** | **React Native 0.77+ via Expo SDK 52+** — single codebase for iOS + Android + Web + Windows + macOS via React Native for Web / Windows / macOS targets |
| **Marketing / SEO sites** | Astro 5 (SSR + static) — used by CuraOS Sites product (ADR-0121a) for generated tenant marketing surfaces |
| **Embeddable widgets** | Lit Web Components — used by CuraOS Widgets product (ADR-0121c) for 3rd-party host embedding |
| **Mobile-native fallback (future cookbook)** | Flutter, KMP+Compose, SwiftUI, Jetpack Compose — **NOT in foundation v1**; added as Codegen cookbook recipes when downstream products need native depth React Native can't deliver |
| **Component library** | `@curaos/ui` custom DS built on shadcn/ui (Radix primitives) + Ant Design 5.x (data-heavy components) |
| **Theming** | Style Dictionary (W3C tokens) + Tailwind CSS base (overridable per tenant; toggleable per service config) + CSS variables runtime overlay |
| **State management** | Apollo Client (GraphQL) + TanStack Query (REST) + Zustand (UI state) — layered per data type |
| **GraphQL client** | Apollo Client (web + mobile via React Native) |
| **FHIR client** | `@medplum/core` + `@medplum/react` (per ADR-0115 HealthStack overlay) |
| **Forms** | Formily + Puck (per ADR-0121e Forms product) |
| **Offline sync** | PowerSync (Postgres-backed, JS SDK supports React Native) |
| **Real-time client** | EventSource (SSE per ADR-0103) + `socket.io-client` (WebSocket) + Apollo subscriptions |
| **i18n** | next-intl (web) + react-i18next via expo-localization (mobile) + Weblate TMS (per ADR-0112) |
| **Build/bundle** | Next 15 Turbopack (web) + Metro (React Native via Expo) + Astro Vite (sites) + esbuild (Widgets) |
| **Monorepo manager** | Nx 20.x (all TS workspaces; Flutter Melos workspace removed since Flutter not in foundation) |
| **Accessibility lint** | axe-core CI + jsx-a11y ESLint plugin + react-native-a11y |
| **Telemetry** | @opentelemetry/sdk-trace-web (web) + opentelemetry-react-native (mobile) |

---

## 3. Why React Native instead of Flutter for foundation v1

**User directive:** "start with react native for mobile and other platforms like pcs ... and whatever else as it will be easier to code at the start but with the playbooks done we can later add other app native via flutter or other based on playbook consumer packages that we can write later"

| Benefit | Rationale |
|---|---|
| **Single language across stack** | TypeScript on backend (NestJS) + web (Next) + mobile/desktop (React Native) = one language for solo + AI-agent swarm to master |
| **Reduced friction at foundation v1** | No Dart/Flutter learning curve; no separate package manager (Melos removed) |
| **Maximum platform reach via one toolchain** | React Native + react-native-web + react-native-windows + react-native-macos covers iOS + Android + Web + Windows + macOS |
| **Expo SDK 52+ DX** | Hot reload, EAS Build, OTA updates, file-based routing (Expo Router 4) |
| **Shared code with Next web** | Components shared via @curaos/ui; data layer (Apollo, TanStack Query, Zustand) shared |
| **AI-agent reuse** | Same React patterns agents already know from Next; no second framework |
| **Future-extensible via Codegen cookbook** | Flutter / KMP / SwiftUI / Jetpack Compose added as cookbook recipes once foundation stable + need for true-native depth surfaces |

**Trade-offs accepted:**
- React Native perf is slightly below Flutter for complex animations and ultra-low-latency UI. Mitigated: most CuraOS surfaces are CRUD-heavy forms/dashboards, not animation-heavy.
- React Native Windows + macOS are smaller communities. Mitigated: PWA via react-native-web as primary desktop reach; native Windows/macOS only when customer demands.
- Flutter fans on team will need to wait for cookbook recipe. Acceptable per user direction.

---

## 4. Theming architecture (Style Dictionary + Tailwind + CSS vars, toggleable)

```
┌──────────────────────────────────────────────────────────────────┐
│  CuraOS Design Tokens (W3C spec)                                 │
│  tokens/                                                          │
│    core.json      (color palette, spacing scale, type ramp)      │
│    semantic.json  (primary/secondary/danger/success/warning)     │
│    tenant.<id>/   (per-tenant overrides)                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                Style Dictionary build
                           │
        ┌──────────────────┼──────────────────────────────┐
        │                  │                              │
        ▼                  ▼                              ▼
┌──────────────┐  ┌──────────────────┐         ┌───────────────────┐
│ CSS vars     │  │ Tailwind config  │         │ React Native      │
│ (web + RN-w) │  │ (preset)         │         │ StyleSheet theme  │
│              │  │                  │         │                   │
│ :root {      │  │ theme.extend.    │         │ const theme = {   │
│   --bg: ...  │  │   colors: ...    │         │   colors: ...     │
│ }            │  │                  │         │ }                 │
└──────────────┘  └──────────────────┘         └───────────────────┘
```

**Per-service / per-tenant config decides Tailwind on/off:**

```yaml
# tenant.<id>/ui-config.yaml
theming:
  tailwind: enabled   # default
  # OR
  tailwind: disabled  # use CSS vars + Style Dictionary tokens only
```

When Tailwind disabled, `@curaos/ui` components fall back to inline styles built from CSS variables — same visual result, no Tailwind class soup. Useful for tenants who hate Tailwind class noise OR for HIPAA-grade audit environments where deterministic CSS matters.

---

## 5. Component library (`@curaos/ui`)

Single design system reused across all foundation product UIs + tenant-generated apps via Codegen (ADR-0123) recipes.

| Layer | Source |
|---|---|
| **Primitive layer** | Radix UI primitives (Apache-2.0) — accessible, headless React components (Dialog, Popover, Tabs, etc.) |
| **Styled layer** | shadcn/ui (MIT) — Radix + Tailwind styled components, copy-paste-extend pattern |
| **Data-heavy layer** | Ant Design 5.x (MIT) — Tables, Forms, Date pickers, Charts, Tree, Transfer (50+ locales + RTL built-in) |
| **HealthStack clinical layer** | `@medplum/react` (Apache-2.0) + `@aehrc/smart-forms-renderer` (Apache-2.0) — FHIR-aware components per ADR-0115 |
| **CuraOS-custom** | Wrapped tenant-aware + branded versions of all above; expose unified `@curaos/ui` package |
| **React Native equivalents** | shadcn-style RN component library (community: react-native-shadcn) + Ant Design Mobile RN |

---

## 6. State management layers

| Layer | Library | Use case |
|---|---|---|
| **Server state (GraphQL)** | Apollo Client | Federated GraphQL queries via Cosmo Router (per ADR-0103) |
| **Server state (REST)** | TanStack Query | OpenAPI-derived REST endpoints; cache + refetch + optimistic updates |
| **UI state (local)** | Zustand | Modals, drawers, toasts, form drafts, ephemeral UI state |
| **Form state** | React Hook Form + Zod (validation derived from OpenAPI JSON Schema) | Per-form local state with validation |
| **Real-time** | Apollo subscriptions (over WS) + EventSource hook (`@curaos/use-sse`) | Subscriptions per ADR-0103 |
| **Offline sync** | PowerSync hooks | Mobile + PWA offline mode for HealthStack patient/clinician |

---

## 7. Per foundation product UI tech

| Product | Framework | Notes |
|---|---|---|
| **CuraOS Auth admin console** | React+Next 15 | Tenant admin, user mgmt, federation config, audit review |
| **CuraOS Builder IDE (0121)** | React+Next 15 | Design canvas, project mgmt, marketplace, collab |
| **CuraOS Sites (0121a)** | Astro 5 (output) + Builder UI in React+Next | Astro = generated tenant marketing sites; Builder UI = React+Next |
| **CuraOS Apps (0121b)** | React+Next (admin UI) + AppSmith sidecar (tenant apps runtime) | AppSmith provides its own React shell for tenant-built apps |
| **CuraOS Widgets (0121c)** | Lit Web Components (output) + Builder UI in React+Next | Widgets = portable Web Components; Builder UI = React+Next |
| **CuraOS Workflow Manager admin (0122)** | React+Next 15 + Workflow Canvas (xyflow) | Workflow design, run inspection, replay debugger |
| **CuraOS Codegen Platform admin (0123)** | React+Next 15 | Recipe browser, scaffold UI, MCP server inspector |
| **HealthStack clinician mobile** | **React Native + Expo** (per user directive) | Replaces previous Flutter pick |
| **HealthStack patient mobile** | **React Native + Expo** (per user directive) | Replaces previous Flutter pick |
| **HealthStack front office web** | React+Next 15 | Web-only |
| **Generic business apps** (per overlay) | React+Next 15 (admin), React Native (mobile) | |
| **Personal apps** (per overlay) | React+Next 15 (web), React Native (mobile) | |

---

## 8. Local + 3rd-party rule applied

| Area | Local (default) | 3rd-party (BYO) |
|---|---|---|
| Hosting (web) | CuraOS self-hosted Next on K3s/Talos | Vercel / Netlify / Cloudflare Pages |
| Mobile distribution | EAS Build (Expo OSS) | App Store / Play Store (mandatory for native distribution) |
| Asset CDN | Self-hosted nginx + reverse proxy | Cloudflare / Fastly / Bunny CDN |
| Telemetry web | @opentelemetry/sdk-trace-web → Tempo per ADR-0107 | Datadog RUM / Sentry / LogRocket |
| Telemetry mobile | opentelemetry-react-native → Tempo | Datadog / Sentry / Bugsnag |
| Push notifications mobile | Expo Push Notifications (OSS) | OneSignal / Pusher Beams / Firebase Cloud Messaging |
| Crash reporting mobile | Expo crash reporter | Sentry / Bugsnag / Firebase Crashlytics |
| In-app messaging | Custom NestJS WebSocket | Intercom / Crisp |

---

## 9. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | Nx monorepo + @curaos/ui base package + shadcn/ui + Ant Design wrappers |
| M2 | Style Dictionary + Tailwind preset + CSS vars runtime overlay |
| M3 | Apollo Client + TanStack Query + Zustand baseline + provider HOCs |
| M4 | Next 15 app shell for foundation admin surfaces (Auth admin, Builder IDE, Workflow admin, Codegen admin) |
| M5 | React Native + Expo SDK 52+ app shell for HealthStack mobile (clinician + patient) |
| M6 | react-native-web for desktop/PWA reach |
| M7 | Astro 5 publish target for CuraOS Sites |
| M8 | Lit Web Components scaffold for CuraOS Widgets |
| M9 | OpenTelemetry instrumentation web + mobile |
| M10 | next-intl + react-i18next + Weblate sync |
| M11 | PowerSync offline mobile (HealthStack) |
| M12 | Accessibility audit (axe-core CI + jsx-a11y + RN a11y) |
| M13 | Cookbook recipes (ADR-0123): `ui.react-next`, `ui.react-native`, `ui.astro`, `ui.lit-widget` — Phase 1 |
| M14 | Cookbook recipe future targets: `ui.flutter`, `ui.kmp-compose`, `ui.swiftui`, `ui.vue-nuxt`, `ui.sveltekit` (added incrementally post-foundation) |
| M15 | v1 GA across all foundation UIs |

---

## 10. Open questions (resolved later)

1. **React Native Web vs separate Next** for non-mobile surfaces — likely separate Next for SEO-critical paths; RNW for unified-codebase cases (e.g., clinician web mirror of mobile app).
2. **Tailwind disable toggle UX** — per-service config flag; default Tailwind on. Verify component library behaves identically when disabled.
3. **shadcn for React Native** — community port (react-native-shadcn) maturity check before locking. Fallback: build CuraOS components directly on Radix RN primitives + NativeWind (Tailwind for RN).
4. **AppSmith integration in Apps SKU** — sidecar runtime or embedded React tree? Likely sidecar service per ADR-0121b.
5. **react-native-windows / -macos** for desktop — PWA via RNW first; native shells added when customer demands.
6. **Expo OSS vs Expo Cloud (EAS)** — EAS OSS for build infra; cloud BYO option for managed builds.

---

## 11. References

- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0103 API Surface](0103-api-surface.md)
- [ADR-0106 prior DRAFT](0106-frontend.md)
- [ADR-0121 Builder Suite](0121-foundation-builder.md)
- [ADR-0123 Codegen+Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
- React Native: https://reactnative.dev/
- Expo SDK 52: https://docs.expo.dev/
- React Native Web: https://necolas.github.io/react-native-web/
- React Native Windows + macOS: https://microsoft.github.io/react-native-windows/
- Next 15: https://nextjs.org/docs
- Astro 5: https://astro.build/
- Style Dictionary: https://amzn.github.io/style-dictionary/
- Tailwind CSS: https://tailwindcss.com/
- NativeWind: https://www.nativewind.dev/
- shadcn/ui: https://ui.shadcn.com/
- Radix UI: https://www.radix-ui.com/
- Ant Design 5.x: https://ant.design/
- Apollo Client: https://www.apollographql.com/docs/react/
- TanStack Query: https://tanstack.com/query/latest
- Zustand: https://zustand-demo.pmnd.rs/
- PowerSync: https://www.powersync.com/
- @medplum/react: https://www.medplum.com/docs
- next-intl: https://next-intl-docs.vercel.app/
- react-i18next: https://react.i18next.com/
