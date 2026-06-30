# ADR-0097 (Archived) — Frontend Research (legacy ADR-0106 DRAFT)

**Archived 2026-05-24.** Decisions superseded by ADR-0106 (React/RN/Astro picks) and Wave 6 (Bun primary). Kept for historical context only.

> **🗂️ ARCHIVED** — superseded by [ADR-0106 Frontend Stack Aligned with Foundation Products](0106-frontend.md). This file kept for option-scan research history (Flutter / React Native / KMP / Astro / Lit / state-mgmt / theming option survey). Original numbering was ADR-0106; renamed to 0097 to free the 0106 slot for the canonical NestJS-foundation-aligned rewrite (where Flutter dropped in favor of React Native for v1 per user direction).


## Status

Superseded by [ADR-0106](0106-frontend.md) (archived). Date: 2026-05-24.

---

## Context

CuraOS serves over 91 backend services across neutral and vertical domains. Those services are worthless to tenants without coherent, accessible client surfaces. The frontend layer is where the platform is _experienced_ — and with an App/Site Builder that generates UI for every tenant workflow, the framework choices here propagate into every runtime artifact CuraOS ships.

Client surfaces span:

| Surface | Platform | Criticality |
|---|---|---|
| Admin console | Web (desktop) | Core — every tenant |
| Hosted login UI | Web | Core — Keycloak redirect |
| Public sites (site-builder generated) | Web | Core — SEO-critical |
| HealthStack clinician app | Web + iOS + Android + desktop | HealthStack overlay |
| HealthStack front office | Web | HealthStack overlay |
| HealthStack patient app | Web + iOS + Android | HealthStack overlay |
| CRM / Sales / HR / Fleet / Procurement | Web | Neutral business apps |
| Personal apps (calendar, notes, tasks, shop, etc.) | Web + mobile | Personal overlay |
| Workflow designer (bpmn-js embed per ADR-0105) | Web | Core — BPM modeler |
| App/Site Builder | Web | Core — low-code generator |
| Shared API client SDK | All | Shared library |
| Shared UI kit / design system | All | Shared library |

### Why this decision is high-leverage

1. **App/Site Builder generates UI at runtime** for every tenant. Whatever framework is chosen, the generator must emit idiomatic code for that framework. A wrong choice is expensive to reverse at scale.
2. **Cross-platform reach is non-negotiable for HealthStack.** Clinicians carry iOS devices. Patients run Android budget phones. Clinical desktops run Windows or Linux kiosks.
3. **HIPAA + GDPR + WCAG 2.2 AA** impose hard constraints that eliminate or heavily penalize some framework options.
4. **Self-hosted / air-gap delivery** means no third-party CDN, no cloud-hosted UI registries, no mandatory external APIs at runtime.
5. **25+ frontend packages** across neutral and vertical domains demand a workspace manager that can handle selective build, test, and publish with a remote cache.

---

## Forces / Requirements

Mapped from AGENTS.md §3 (charter), §6 (NFRs), and the constraint block in this ticket:

| Force | Implication |
|---|---|
| **Self-hosted first** | All assets — fonts, icons, WASM modules, polyfills — must bundle for air-gap. No runtime calls to fonts.gstatic.com, unpkg, cdnjs, or any external CDN. |
| **Generic before vertical** | UI kit and component library must live in neutral packages. HealthStack components _extend_, never fork. |
| **Composable** | Each app surface ships as an independent deployable. Shared UI kit is a package, not a monolith. |
| **Builder-led** | App/Site Builder generates UI from BPMN task definitions + domain contracts + theming. Framework must be code-gen-friendly. |
| **Event-led** | Real-time updates via SSE (ADR-0103). Framework must handle SSE/WS channels with reconnect. |
| **Multi-tenant** | Per-tenant theming, branding, i18n bundle. CSS variables or design token injection at runtime. |
| **Tenant data isolation / PHI** | Client must never write PHI to plaintext local storage. Memory-only state for PHI. Secure credential storage for tokens. |
| **WCAG 2.2 AA** | Required by HIPAA ADA alignment + EU EAA (2025). Framework's component library or UI kit must ship with ARIA roles, keyboard nav, focus management out of the box. |
| **i18n + RTL** | Arabic, Hebrew, Farsi RTL targets. ICU MessageFormat for plural/gender rules. Per-locale date/number/currency formatting. |
| **Offline-first (clinical + patient mobile)** | Local SQLite with sync engine. Framework must integrate with PowerSync or ElectricSQL client. |
| **Performance** | Sub-second P95 on web. Patient mobile on slow 3G must still render usefully. Bundle budgets enforced per surface. |
| **GDPR** | No third-party trackers. Cookie consent UI. Data minimization in telemetry. |
| **99.9% availability** | Client error boundaries + graceful degradation + auto-reconnect on SSE disconnect. |
| **Hiring pool** | Technology must have sufficient developer supply for a multi-year roadmap. |

---

## Decision Drivers (weighted)

Weights: 3 = must-have / eliminates options, 2 = strongly preferred, 1 = tie-breaker.

| Driver | Weight | Notes |
|---|---|---|
| Cross-platform reach (web / iOS / Android / desktop) | 3 | Clinician + patient apps need all four |
| Accessibility tooling (WCAG 2.2 AA) | 3 | Regulatory mandate |
| HIPAA-safe secure storage patterns | 3 | Non-negotiable |
| Code-gen friendliness (App/Site Builder) | 3 | Generator emits framework code |
| i18n + RTL support | 3 | Arabic/Hebrew required |
| Offline-first story (clinical / patient mobile) | 2 | PowerSync Flutter support confirmed |
| Real-time SSE/WS integration | 2 | SSE primary per ADR-0103 |
| GraphQL client maturity | 2 | Cosmo federation gateway |
| FHIR client library availability | 2 | HAPI FHIR R4/R5 per ADR-0103 |
| TTI / bundle size (patient mobile on 3G) | 2 | Perf budget per surface |
| Design system maturity | 2 | 25+ apps need consistency |
| Hiring pool / community pulse | 2 | Stack Overflow 2024/2025 surveys |
| License (OSI-approved, no CLA gotchas) | 2 | Self-hosted product |
| Recent CVE history | 2 | Healthcare regulated environment |
| Monorepo tooling ecosystem | 1 | Depends on language choice |

---

## Sub-decision 1: UI Framework

### Options

#### Option A: Flutter 3.24+ / Dart 3.5+ (current commitment)

**License:** BSD-3-Clause.

Flutter uses a custom rendering engine (Skia on mobile/desktop; Impeller on iOS/Android; CanvasKit/skwasm on web). A single Dart codebase targets iOS, Android, macOS, Windows, Linux, and web.

**2025–2026 status:**
- Flutter 3.38 (Nov 2025) shipped stable WebAssembly support via skwasm renderer. HTML renderer deprecated and scheduled for removal in first 2025 stable release.
- WasmGC is now browser-native: Chrome 119+, Firefox 120+, Edge 119+, Safari 17+. Build tooling auto-serves JS fallback to older browsers.
- CanvasKit download cost: ~1.5–2 MB WASM initial payload. Mitigated by cache after first load; bad for first-visit on slow connections.
- skwasm (Impeller-backed) shows better startup time and frame consistency than CanvasKit.
- Flutter web apps load up to 40% faster with Wasm path vs prior versions.
- Production at BMW Connected Mobility, Google Pay, Alibaba Xianyu, eBay Motors.

**Strengths (≥6):**
1. Single language (Dart) and codebase across iOS + Android + macOS + Windows + Linux + web — zero context switch for team.
2. Custom rendering produces pixel-perfect UI consistency across all platforms; no native component divergence.
3. Material 3 + Cupertino widget libraries built-in; adaptive widgets handle platform conventions.
4. Riverpod 2 / Bloc / Signals for state — mature, well-tested patterns.
5. `flutter_secure_storage` uses iOS Keychain + Android Keystore/EncryptedSharedPreferences — HIPAA-grade at-rest encryption.
6. `fhir_r4` / `fhir_r5` Dart packages are mature; used in production EHR integrations.
7. `ferry` GraphQL client provides strongly-typed codegen from schema, Apollo-Kotlin-inspired patterns, stream-based reactive queries.
8. PowerSync provides first-class Flutter SDK for offline sync — only major sync engine with Flutter support confirmed.
9. OpenTelemetry available via `flutterrific_opentelemetry` and `scout_flutter` (zero-config RUM on iOS/Android/macOS/web).
10. FVM-managed Dart/Flutter versions — reproducible builds across team + CI.
11. Melos workspace manager is Dart-native — multi-package scripts, selective test/build, versioning.
12. `drift` (type-safe SQLite ORM) + `drift_crdt` for offline-first with CRDT conflict resolution — established Flutter pattern.

**Weaknesses (≥5):**
1. **SEO:** Canvas-based rendering. Search engine crawlers cannot read canvas content. Public-facing SEO-critical sites (site builder output) require a separate web framework or server-side pre-render.
2. **Accessibility:** Despite improvements, ARIA semantics are below HTML standards. Flutter generates a parallel accessibility tree, which some AT tools misinterpret. WCAG 2.2 AA compliance requires significant manual audit work vs Radix/MUI which are ARIA-first.
3. **Web TTI:** 1.5–2 MB initial WASM payload harms first-visit performance on mobile 3G. Patient-facing web apps on low-bandwidth connections are penalized.
4. **Hiring pool:** Dart developers are a fraction of React/TypeScript developers. Stack Overflow 2024 survey shows Flutter used by ~9% of developers vs React at ~40%.
5. **Web text behaviors:** Text selection, clipboard, form auto-fill, and IME input differ subtly from native HTML — reported user friction in enterprise admin surfaces.
6. **Admin/dashboard tables:** Flutter's data table widgets are less feature-rich than Ant Design or AG Grid for complex admin scenarios with 50+ column grids.
7. **App/Site Builder code-gen:** Generating Flutter widget trees from JSON schema is possible but less established than generating React JSX. Fewer reference implementations exist.
8. **No SSR:** Flutter web is client-rendered only (no server-side rendering). This compounds SEO and TTFB issues.

**Multi-platform reach:** Full — iOS, Android, macOS, Windows, Linux, web. Best cross-platform story of any single-codebase framework.

**Accessibility:** Below HTML-native. Requires manual audit. Flutter accessibility tree is a parallel structure; some screen readers (JAWS, NVDA on web) have known compatibility gaps.

**i18n + RTL:** `intl` package supports ICU MessageFormat, RTL layout mirroring, locale-aware formatting. RTL support is first-class (flutter automatically mirrors layout direction).

**Real-time / SSE:** `dart:html` `EventSource` on web; `flutter_sse` on mobile. Reconnect requires manual implementation. No subscription-over-SSE built into graphql client packages (ferry supports WS subscriptions).

**GraphQL client:** `ferry` — strongly typed, code-gen from schema, stream-based cache, supports Cosmo WS subscriptions. Mature as of 2025.

**FHIR:** `fhir_r4` / `fhir_r5` — Dart packages, MIT license, used in production Flutter EHR apps. Covers parsing, validation, serialization.

**App/Site Builder generation:** Dart/Flutter widget generation from IR (intermediate representation) is feasible but less tooled than React JSX generation. No widely-used generator framework exists yet.

**HIPAA secure storage:** `flutter_secure_storage` → iOS Keychain / Android Keystore. No plaintext fallback. PHI memory-only via Riverpod state — dispose on lock/background.

**Recent CVE history:** Flutter CVEs are rare; Dart VM and engine patches tracked at github.com/flutter/flutter. No critical authentication or data-exposure CVEs in 2024–2025 period.

---

#### Option B: React 19 + Next.js 15 (App Router) for web; React Native 0.77 + Expo SDK 52+ for mobile

**License:** MIT (React, Next.js, React Native, Expo).

React 19 stabilized Server Components as the default architectural pattern. RSC + App Router reduces client JS bundle by ~40% vs pages-dir equivalent. React Native (0.76–0.78 in 2025) with the New Architecture (Fabric + JSI) brings near-native performance. Expo SDK 52 (React Native 0.77 support released Jan 2025) provides managed workflow, EAS Build for app distribution, and Expo SecureStore for credential storage. By 2026, 70% of cross-platform React Native apps projected to use Expo managed workflows.

**2025–2026 status:**
- React 19 stable: `use()` hook, Server Actions, improved Suspense, asset preloading API.
- Next.js 15 (Turbopack stable): App Router RSC, Partial Prerendering (PPR), streaming SSR.
- React Native 0.77: New Architecture default-on (Fabric renderer, JSI bridgeless mode).
- Expo SDK 52: New Architecture default, DOM Components (embed HTML/CSS into RN views), Metro bundler improvements.
- 120K MAU production apps shipped on RN 0.75 + Expo 52 confirmed.

**Strengths (≥6):**
1. **Hiring pool:** React is used by ~40% of developers (Stack Overflow 2024/2025). Largest frontend talent pool globally.
2. **Web-first excellence:** RSC + SSR + edge rendering = best-in-class TTI for web surfaces. Public sites, admin console get full HTML/CSS rendering — SEO-friendly by default.
3. **Accessibility:** Radix UI (shadcn/ui foundation) ships full ARIA support out of the box. MUI v6 and Ant Design 5.x have extensive accessibility testing. WCAG 2.2 AA is achievable with standard libraries.
4. **i18n + RTL:** `next-intl`, `react-i18next` with ICU MessageFormat. MUI/Ant Design have built-in RTL via CSS `dir="rtl"` + `jss-rtl` / `CSSBaseline` rtl prop. Ant Design ships 50+ locale packs built-in.
5. **App/Site Builder code-gen:** Generating React JSX from JSON schema is well-established. Builder.io, Plasmic, Retool, and every major low-code tool emit React. Huge reference implementation base.
6. **GraphQL client:** Apollo Client 3.x / 4.x — best-in-class React integration. urql v4 is lighter. Both support SSE subscriptions over Cosmo (graphql-sse transport). TanStack Query v5 for REST + GraphQL hybrid patterns.
7. **Bundle size control:** RSC keeps server-only code off the bundle. Code splitting + lazy loading via `React.lazy` + Suspense. Turbopack builds are fast.
8. **FHIR:** `@medplum/core` (TypeScript, MIT) is the most complete FHIR R4 client for TS/JS — typed resources, search, auth, SMART-on-FHIR. `fhir-kit-client` for simpler scenarios.
9. **Server Actions + forms:** Server Actions reduce client-side form logic; mutations hit server directly — reduces PHI surface area on the client.

**Weaknesses (≥5):**
1. **Split stack:** React/Next for web + React Native for mobile = two rendering targets, two routing paradigms, two build pipelines. Shared code limited to logic/hooks, not component trees (unless `react-native-web` used with caveats).
2. **React Native still not pixel-perfect:** Layout on Android vs iOS still diverges in edge cases. Platform-specific workarounds remain necessary.
3. **Expo managed limitations:** Expo Go sandbox limits native modules. EAS Build required for anything outside the managed API. Cloud-based EAS is not self-hostable at full feature parity (self-hosted EAS Build is available but complex).
4. **Desktop:** Electron (heavy, 150MB+) or Tauri 2.x (React + Rust) for desktop. Neither is native-integrated the way Flutter desktop is. React Native Windows/macOS exists but is less mature.
5. **SSE in React Native:** `EventSource` is not available in React Native JS engine. Requires `react-native-sse` polyfill or custom native module.
6. **Offline sync:** PowerSync does not yet have a first-class React Native SDK with CRDT support matching the Flutter SDK. WatermelonDB (React Native SQLite ORM) + RxDB are the pattern but require more custom wiring.

**Multi-platform reach:** Web (first-class), iOS + Android (via React Native + Expo), desktop (via Tauri or Electron). Each target is a separate codebase concern.

**Accessibility:** Industry-best for web (Radix, WAI-ARIA). React Native accessibility is above-average but requires manual audit for complex custom components.

**i18n + RTL:** Excellent. `next-intl` + ICU MessageFormat. Ant Design / MUI RTL built-in. Weblate (AGPL, self-hostable) integrates via gettext/ICU format.

**Real-time / SSE:** Browser-native `EventSource`. Apollo Client supports SSE transport via `@graphql-sse/apollo-client`. Cosmo EDFS (Event Driven Federated Subscriptions) recommends SSE+Fetch over WebSocket.

**GraphQL client:** Apollo Client v3/v4 or urql v4. Both support Cosmo persisted queries, SSE subscriptions, normalized cache.

**FHIR:** `@medplum/core` — most complete TS FHIR R4/R5 client. `fhir-kit-client` for standalone use. SMART-on-FHIR via `fhirclient`.

**App/Site Builder generation:** Best ecosystem. Every major low-code platform (Builder.io, Plasmic, Retool, AppSmith) emits React. JSON schema → React JSX is a solved problem. React Hook Form + Zod for schema-driven forms.

**HIPAA secure storage:** `expo-secure-store` → iOS Keychain / Android Keystore with auto-backup exclusion configured. Web: SubtleCrypto (AES-GCM) + IndexedDB for encrypted credential storage.

**Recent CVE history:** React itself has no significant CVEs. Next.js had CVE-2025-29927 (authorization bypass in middleware — patched in 15.2.3). Monitor Next.js advisories actively.

---

#### Option C: Vue 3.5 + Nuxt 3

**License:** MIT.

Vue 3.5 (Alien Signals reactivity improvements, Sept 2024) + Nuxt 3 (SSR, file-based routing, Nitro server). Excellent DX, smaller community than React.

**Strengths:** Composition API DX is excellent. Nuxt 3 SSR is competitive with Next.js. Quasar Framework provides cross-platform (web + mobile via Capacitor + desktop via Electron/Tauri). Vue I18n with ICU MessageFormat support. PrimeVue component library has strong RTL + i18n + accessibility story.

**Weaknesses:**
1. Vue Native is dormant (2022). Mobile requires Capacitor (WebView-based, not native renderer) or NativeScript — neither matches React Native or Flutter performance.
2. Healthcare FHIR libraries for Vue/TS exist but are less maintained than medplum (React-first).
3. Hiring pool smaller than React. Stack Overflow 2025: Vue used by ~17% of developers — half of React.
4. App/Site Builder code-gen: Less established than React. Fewer generator tools emit Vue.
5. No major enterprise low-code platform (AppSmith, Retool, Plasmic) natively emits Vue.

**Multi-platform:** Web (first-class), Mobile (Capacitor WebView — not native), Desktop (Tauri or Electron). Not suitable for native mobile performance in clinical scenarios.

**Recommendation fit:** Low. Mobile story is too weak for HealthStack requirements.

---

#### Option D: Angular 19 + Ionic for mobile

**License:** MIT.

Angular 19 (Standalone Components stable, Signals API stable, zoneless change detection). Ionic 8 for mobile (WebView-based on top of Angular components).

**Strengths:** Strong enterprise adoption. Dependency injection, strict TypeScript. Angular Material + CDK (Component Dev Kit) has comprehensive WCAG testing. PrimeNG enterprise component library with RTL/i18n.

**Weaknesses:**
1. Ionic is a WebView wrapper, not a native renderer. Clinical app on budget Android will exhibit frame drops vs Flutter or React Native New Architecture.
2. Angular bundle size is larger than React/Svelte equivalents. Requires careful tree-shaking.
3. Hiring pulse: Angular desire to continue using dropped significantly in 2024 surveys — "most dreaded" web framework category.
4. FHIR libraries are not Angular-specific; requires framework-agnostic JS adapters.
5. App/Site Builder: Few low-code generators emit Angular (AppSmith/Retool are React; Plasmic is React). Custom generator required.

**Multi-platform:** Web (first-class), Mobile (Capacitor/Ionic — WebView), Desktop (Electron or Tauri). Not native mobile.

**Recommendation fit:** Low. WebView mobile + large bundles + declining community sentiment make this a poor fit for CuraOS.

---

#### Option E: SvelteKit 2 / Svelte 5 (Runes)

**License:** MIT.

Svelte 5 (Oct 2024) introduced Runes — a reactive primitives system replacing the magical compiler-based reactivity. SvelteKit 2 for full-stack web. Smallest client bundles of any major framework (compiler eliminates runtime).

**Strengths:** Minimal JS payload. SvelteKit file-based routing + server load functions. Growing developer satisfaction (73% want to continue using Svelte — Stack Overflow 2025). Tauri 2.x pairs well for desktop.

**Weaknesses:**
1. No native mobile path. Capacitor for mobile = WebView. Not acceptable for HealthStack clinical apps.
2. Community is small — fewer healthcare/FHIR integrations, fewer accessibility-tested component libraries.
3. App/Site Builder: Essentially no reference implementations for Svelte code generation from low-code tools.
4. GraphQL: urql supports Svelte; Apollo Svelte bindings exist but are less maintained.
5. Hiring pool: ~7% of developers (Stack Overflow 2024). Difficult to staff at scale.

**Multi-platform:** Web (first-class), Mobile (Capacitor WebView only), Desktop (Tauri — strong).

**Recommendation fit:** Low for primary framework. Potentially interesting for internal tooling or admin surfaces if mobile is out of scope for that surface.

---

#### Option F: SolidJS / SolidStart

**License:** MIT.

Fine-grained reactivity without virtual DOM. Smaller community. SolidStart 1.0 reached stable in 2024.

**Strengths:** Best-in-class reactivity performance. Tiny bundles. SolidStart SSR competitive.

**Weaknesses:**
1. No mobile native path.
2. Community is small — ecosystem for healthcare/FHIR is sparse.
3. Hiring pool: <2% of developers.
4. App/Site Builder: No reference generator tools.

**Recommendation fit:** Very low. Niche for CuraOS scale.

---

#### Option G: Qwik / Qwik City

**License:** MIT.

Resumable hydration — server renders HTML, client hydrates only on interaction, not on load. Near-zero JS on initial load.

**Strengths:** Best possible TTI on content-heavy pages. Patient portal on 2G could benefit.

**Weaknesses:**
1. No mobile native path.
2. Community is very small.
3. App/Site Builder code-gen tools do not target Qwik.
4. GraphQL/FHIR ecosystem sparse.

**Recommendation fit:** Very low as primary framework. Potentially one technology to watch for SSG public sites if Astro is not chosen.

---

#### Option H: Lit + Web Components (standards-based)

**License:** BSD-3-Clause.

Lit 3.x provides a lightweight base class for custom elements. Web Components are framework-agnostic — work in React, Vue, Angular, Svelte, or vanilla JS.

**Strengths:**
1. Components work in any host framework — maximally portable for App/Site Builder widget library.
2. No framework lock-in for generated tenant apps.
3. Browser-native — no framework runtime overhead.
4. Design systems (Adobe Spectrum, Shoelace, FAST) are built on Web Components.

**Weaknesses:**
1. Not a full application framework — routing, state, SSR require additional libraries.
2. Accessibility with Web Components has known shadow DOM / AT interaction quirks (focus delegation, ARIA reflection incomplete in some browsers until 2025 spec update).
3. Styling composability (CSS encapsulation in shadow DOM vs design tokens) requires careful design token implementation.
4. Not suitable as the primary app framework for complex apps.

**Recommendation fit:** High as the _output format_ of the App/Site Builder widget library (widgets are Web Components consumed by any host). Not suitable as the primary application framework.

---

#### Option I: Astro + UI Islands (multi-framework SSR)

**License:** MIT.

Astro 5.x: static-first, content-driven, zero-JS by default. Islands architecture for selective React/Vue/Svelte/Lit hydration.

**Strengths:**
1. Best SEO story — HTML first, no JS until needed.
2. Content collections + MDX for site-builder generated marketing/documentation pages.
3. Can embed React components (with Radix/shadcn) in island hydration zones.
4. Multi-CDN friendly but works fully bundled for air-gap.

**Weaknesses:**
1. Not for complex web apps (admin console, workflow designer, BPM modeler).
2. No mobile native path.

**Recommendation fit:** High for public-facing site-builder generated marketing/documentation surfaces. Not for app surfaces.

---

#### Option J: React Native + Expo (as standalone mobile framework, web via react-native-web)

**License:** MIT.

`react-native-web` re-renders RN components in the browser DOM. Allows sharing one component tree across mobile + web.

**Strengths:**
1. True component-level code sharing between mobile and web.
2. Expo Web + Expo Router for unified routing.

**Weaknesses:**
1. `react-native-web` does not support all RN APIs. Components render differently in browser.
2. No SSR out of the box — limits SEO and initial load performance.
3. Different component model from Next.js App Router — cannot use RSC.
4. Admin console would have a degraded web experience vs native web stack.

**Recommendation fit:** Moderate. Only if team wants extreme mobile/web code sharing and accepts web performance tradeoffs. Next.js App Router + React Native separately is a better split.

---

#### Option K: Kotlin Multiplatform Mobile / Compose Multiplatform

**License:** Apache 2.0.

JetBrains Compose Multiplatform 1.8.0 (May 2025): iOS Compose UI is now stable and production-ready. Android Compose is battle-tested. Desktop (JVM) stable. Web Compose is in Beta. Wrike, NovaStar Financial, and others are in production on CMP.

**Strategic alignment:** CuraOS backend runs Kotlin + Spring Boot (ADR-0100). A Kotlin-everywhere story would unify language, shared business logic libraries, serialization (kotlinx.serialization), and Ktor client across front and back.

**Strengths (≥6):**
1. Apache 2.0 license — clean for self-hosted products.
2. iOS Compose UI stable (1.8.0, May 2025) — production-grade cross-platform mobile UI.
3. Kotlin shared logic layer (domain models, validation, network, serialization) shared between backend (Spring Boot) and client — eliminates duplication.
4. JetBrains-backed + Google-endorsed — not a community experiment.
5. `ktor-client` multiplatform HTTP client with coroutines — idiomatic async for all platforms.
6. Offline: SQLDelight — multiplatform type-safe SQLite, supports iOS + Android + JVM desktop.
7. Apollo Kotlin — first-class KMP GraphQL client with code-gen, normalized cache, Cosmo-compatible. Best GraphQL client in the KMP ecosystem.
8. Desktop (JVM) is stable and production-ready; swing/compose for JVM desktop apps.

**Weaknesses (≥5):**
1. **Web Compose is Beta** — not production-ready for admin console or public sites. Web target lags mobile/desktop by 12–18 months.
2. **SEO:** Web Compose uses canvas or WASM rendering (similar constraint to Flutter web) — no HTML output, no SEO.
3. **Hiring pool:** Kotlin Multiplatform is a fraction of React/Flutter developer pool. Dart (Flutter) developers are more numerous. Very few teams have CMP expertise.
4. **UI component ecosystem:** Compose Multiplatform has a growing but smaller component ecosystem vs Flutter. Third-party libraries (charts, maps, data grids) are fewer.
5. **FHIR:** No dedicated KMP FHIR library. Must consume HAPI FHIR R4/R5 REST API directly via ktor-client with manual type mapping or code-gen.
6. **App/Site Builder:** No low-code generators emit Kotlin Compose UI. Custom generator development required from scratch.
7. **Web target critical gap:** For CuraOS, web is the primary surface for admin/workflow/builder apps. CMP web beta is not suitable for production admin surfaces in 2026.

**Multi-platform reach:** iOS (stable), Android (stable), Desktop JVM (stable), Web (Beta — not production-ready for 2026 delivery).

**Recommendation fit:** High potential strategically but blocked by web Beta status. Recommend tracking for 2027+ web stable release. Consider for shared business logic (Kotlin Multiplatform without Compose UI) across backend + mobile.

---

### Comparison Matrix (Framework)

| Criterion | Flutter | React+Next/RN+Expo | Vue+Nuxt | Angular+Ionic | Svelte+SvelteKit | KMP+Compose |
|---|---|---|---|---|---|---|
| Web (SSR/SSG) | Partial (no SEO) | Excellent | Excellent | Good | Excellent | Beta |
| iOS native | Stable | Stable (RN) | WebView only | WebView only | WebView only | Stable |
| Android native | Stable | Stable (RN) | WebView only | WebView only | WebView only | Stable |
| Desktop | Stable | Tauri/Electron | Tauri | Electron | Tauri | Stable (JVM) |
| SEO | Poor | Excellent | Excellent | Good | Excellent | Poor |
| WCAG 2.2 AA | Hard (manual) | Best (Radix) | Good (PrimeVue) | Good (CDK) | Limited | Good |
| i18n + RTL | Good (intl) | Excellent (next-intl, AntD) | Good | Good | Limited | Good |
| Offline sync | Best (PowerSync) | Moderate (WatermelonDB) | Poor | Poor | N/A | Good (SQLDelight) |
| GraphQL | Good (ferry) | Best (Apollo/urql) | Good (urql) | Good | Good | Excellent (Apollo Kotlin) |
| FHIR libs | Mature (fhir_r4) | Mature (medplum) | Manual | Manual | Manual | Manual |
| App/Site Builder codegen | Limited | Best | Poor | Poor | None | None |
| Hiring pool | ~9% | ~40% | ~17% | ~12% | ~7% | ~5% |
| Bundle size (web) | 1.5–2MB WASM | ~200KB JS (RSC) | ~150KB JS | ~300KB+ | ~50KB | WASM (similar to Flutter) |
| Backend lang match | No (Dart) | No (JS/TS) | No | No | No | Yes (Kotlin) |
| License | BSD-3 | MIT | MIT | MIT | MIT | Apache 2.0 |

### Recommendation (Framework) — Split by Surface

**No single framework optimally serves all CuraOS surfaces.** A strategic split is recommended:

**Tier 1 — Primary web surfaces (admin console, workflow designer, App/Site Builder, front office, public sites):**
→ **React 19 + Next.js 15 (App Router)**

Rationale: Best TTI + SEO for public sites. Best App/Site Builder codegen ecosystem. Largest hiring pool. WCAG 2.2 AA achievable with Radix/MUI. RSC eliminates PHI from client bundle by default. Apollo Client + Cosmo SSE subscriptions are first-class. `@medplum/core` for FHIR.

**Tier 2 — HealthStack mobile + personal apps (clinician, patient iOS/Android):**
→ **Flutter 3.38+ (Dart/Melos) — RETAIN current commitment**

Rationale: PowerSync Flutter SDK is the only major offline-sync engine with first-class Flutter support. Single codebase for iOS + Android + desktop kiosk (clinician workstation). `flutter_secure_storage` for HIPAA-grade credential storage. `fhir_r4` Dart package is mature. FVM + Melos already in place. Flutter 3.38 Wasm brings web companion view for patient app to acceptable performance for non-SEO surfaces.

**Tier 3 — Public site-builder generated marketing/documentation surfaces:**
→ **Astro 5.x** with React island components (shadcn/ui)

Rationale: Zero-JS by default maximizes Lighthouse score for tenant public sites. React islands for interactive elements reuse Tier 1 component library. Content Collections for structured site content. Full static output compatible with self-hosted CDN / air-gap deployment.

**Tier 4 — App/Site Builder widget output format:**
→ **Web Components (Lit 3.x)** as the _portable_ format for generated tenant widgets, consumable in any host (React admin, Flutter web, Astro sites)

This split is consistent with industry precedent: Linear uses React for web, native for mobile; Figma uses web-first + Electron for desktop while retaining native integrations. CuraOS follows the same pattern of right-tool-per-surface.

**What this means for the current Flutter commitment:** Flutter is confirmed for all _native mobile_ surfaces (HealthStack clinician + patient mobile, personal apps mobile). For the web companion to Flutter mobile apps (patient web portal), Flutter web with Wasm is acceptable. For all primary web admin surfaces, React 19 + Next.js 15 is the strategic choice.

### Open Questions (Framework)

1. Should the HealthStack clinician app have a full desktop-native Flutter build (macOS/Windows) or target web via React/Next.js for desktop scenarios?
2. Is the patient web portal acceptable with Flutter web's 1.5–2 MB WASM cost, or should it be React with a different offline strategy?
3. Does the App/Site Builder emit Flutter widgets, React components, or Web Components as its output format? (See Sub-decision 7.)
4. Should `react-native-web` be evaluated for sharing components between Next.js and Expo, accepting web rendering tradeoffs?

---

## Sub-decision 2: Monorepo / Workspace Manager

CuraOS has 25+ frontend packages across two languages (Dart + TypeScript/JavaScript) given the split recommendation. This means two workspace managers — one per language family.

### Options

#### Option A: Melos (Dart/Flutter monorepo manager) — current commitment

**License:** BSD-3-Clause. Dart-specific. Works with FVM. Supports multi-package `bootstrap`, `run`, `exec`, `publish`, `version`, `clean`, selective filtering (`--scope`, `--since`), conventional commit versioning, and GitHub Actions integration.

**Strengths:** Native to Dart ecosystem. FVM integration for SDK pinning. Selective package builds by changed packages. Pub dependency resolution awareness.

**Weaknesses:** Dart-only — cannot manage the TypeScript packages.

**Recommendation for Dart/Flutter packages:** Retain Melos.

---

#### Option B: Turborepo 2.x (Vercel)

**License:** MIT. Built in Rust. Task pipeline graph with remote cache (Vercel Remote Cache or self-hosted via Turborepo Remote Cache OSS). Fastest JS/TS monorepo build system for simple pipeline definitions.

**Strengths:** Near-zero config. Best default for JS/TS workspaces. pnpm/yarn/npm workspaces compatible. Remote cache easily self-hosted. Built in Rust = fast task runner.

**Weaknesses:** Less feature-rich than Nx for code generation, affected analysis by import graph, or polyglot workflows. Cannot manage Dart packages.

---

#### Option C: Nx 20.x

**License:** MIT. Core migrating from TypeScript to Rust (targeting 2025 completion per announcement). Tracks TypeScript imports to identify exactly which packages are affected by a change — 7x benchmark advantage over Turborepo on large repos (though gap closing as both use Rust).

**Strengths:** Code generators (workspace generators), task graph, affected command intelligence, Angular/React/Next.js plugins, integrated module boundary lint rules (enforce `neutral → vertical` dependency direction). Nx Cloud for remote cache (self-hostable).

**Weaknesses:** More complex setup than Turborepo. Opinionated about project structure.

---

#### Option D: pnpm workspaces (raw)

**License:** MIT. Simple workspace protocol, hoisted modules option, strict by default.

**Strengths:** Zero extra tooling layer. Works with any task runner.

**Weaknesses:** No task pipeline, no remote cache, no code-gen. Not suitable standalone for 25+ package monorepo.

---

#### Option E: Bazel

**License:** Apache 2.0. Hermetic, polyglot, Google-scale.

**Strengths:** Truly polyglot — can manage Dart + TypeScript in one build graph with hermetic sandboxing.

**Weaknesses:** High operational cost. Build files are verbose. Learning curve is steep. Overkill for a product monorepo that is not Google-scale. Remote cache requires Bazel Remote Cache or Buildbuddy.

---

#### Option F: Moon (moonrepo.dev)

**License:** MIT. Polyglot. Manages toolchain versions per-project (Node, Rust, Go, etc.) similarly to mise. Task graph with remote caching.

**Strengths:** Polyglot + toolchain management in one tool. Could theoretically manage both Dart and Node packages if Dart moon integration is available.

**Weaknesses:** Smaller community than Nx/Turborepo. Dart/Flutter support is not official — requires custom runner config. Less battle-tested at large scale.

---

#### Option G: Lerna 8.x (Nx-owned)

**License:** ISC. Now maintained by Nx team. Can run alongside Nx.

**Strengths:** Familiar to many JS/TS teams. Versioning and changelog generation.

**Weaknesses:** Superseded by Turborepo and Nx for modern monorepos. No compelling advantage over Nx.

---

### Recommendation (Workspace Manager)

**Dart/Flutter packages (curaos/ Flutter tree):** Retain **Melos** — it is Dart-native, FVM-aware, and already in use.

**TypeScript/JavaScript packages (React + Next.js + Astro tree):** Use **Nx 20.x**.

Rationale: The React monorepo will grow to 15+ packages across admin, apps, shared UI kit, API SDK, and Astro public site. Nx's module boundary enforcement (via `@nx/eslint-plugin` `enforce-module-boundaries` rule) is directly useful for enforcing the `neutral → vertical` dependency direction mandated by AGENTS.md §3. Nx code generators accelerate scaffolding new packages. Nx Cloud remote cache is self-hostable. Nx's affected command intelligence avoids rebuilding unaffected packages — important as the monorepo scales.

Turborepo is simpler and would also work; choose Nx if the team values the generator and boundary enforcement features. Turborepo if simplicity is preferred.

---

## Sub-decision 3: State Management

### For Flutter (Dart)

| Option | Style | Notes |
|---|---|---|
| **Riverpod 2.x** (recommended) | Declarative, provider-graph, compile-time safety | De facto Flutter community standard 2024–2026. Code-gen support (`riverpod_generator`). AsyncNotifier for async state. No ChangeNotifier coupling. |
| Bloc / Cubit | Event-driven, explicit state machine | BlocBuilder + BlocListener. More verbose. Good for complex state machines (e.g., authentication flow, BPM task UI). |
| Provider | Simple InheritedWidget wrapper | Predecessor to Riverpod. Not recommended for new projects. |
| GetX | Reactive + routing + DI bundled | Controversial — mixes concerns, opinionated. GetX controller lifecycle has known memory leak patterns. **Do not use.** |
| Signals (dart-lang/signals) | Fine-grained reactive primitives | Emerging. Less ecosystem than Riverpod. |

**Recommendation for Flutter:** **Riverpod 2.x** as primary state manager for all new Flutter packages. Bloc/Cubit for statechart-like flows (auth, offline sync queue state). GetX explicitly banned.

### For React (TypeScript)

| Option | Notes |
|---|---|
| **TanStack Query v5** | Server state (fetching, caching, invalidation, mutation). Works with REST + GraphQL. |
| **Zustand** | Client UI state (simple, minimal boilerplate, no context overhead). |
| **Jotai** | Atomic state model — useful for fine-grained UI state in form-heavy surfaces. |
| Redux Toolkit | Industry standard for complex global state, but heavier than needed with RSC + TanStack Query handling server state. Use only if team has prior RTK knowledge. |
| Recoil | Meta project, now in maintenance mode (2024). **Do not use for new projects.** |
| Apollo Client cache | Apollo's normalized InMemoryCache can serve as GraphQL state cache, avoiding redundant Zustand stores for server data. |

**Recommendation for React:** **TanStack Query v5** for all server state (REST calls, GraphQL queries/mutations outside of Apollo). **Apollo Client** for GraphQL queries/mutations/subscriptions with Cosmo federation (leverages normalized cache). **Zustand** for client-only UI state (modals, drawer open/close, unsaved form draft, optimistic UI). Avoid Redux unless team has strong prior context.

---

## Sub-decision 4: UI Kit / Design System

### Options

| Library | Lang | Accessibility | RTL | i18n | Enterprise | Design Tokens | Notes |
|---|---|---|---|---|---|---|---|
| **shadcn/ui** | React/TS | Via Radix (ARIA-first) | No built-in | No built-in | Community-led | Partial (CSS vars) | Copy-paste ownership. Tailwind required. 83K stars, 200K weekly downloads. |
| **Mantine 7.x** | React/TS | Good but manual | No | No | Community-led | CSS variables | 28K stars, 490K weekly downloads. Best hooks library. |
| **MUI v6 (Material UI)** | React/TS | Strong (WAI-ARIA) | Yes (CSSBaseline RTL) | 100+ locales | Corporate-backed | Design Tokens API | Most downloaded React component library. Enterprise-grade. |
| **Ant Design 5.x** | React/TS | Good | Yes | 50+ built-in locales | Alibaba-backed | Design tokens (v5) | 94K stars, 1.1M weekly downloads. Best enterprise tables/forms/tree. |
| **PrimeReact** | React/TS | Good | Yes | Good | Commercial support | Yes | Enterprise-friendly. Less trendy than shadcn but reliable. |
| **Material 3 (Flutter)** | Dart | Good (Flutter a11y tree) | Yes (Directionality) | intl-backed | Google | Material You dynamic color | Built into Flutter SDK. Best Flutter choice. |
| **Cupertino (Flutter)** | Dart | Good | No (LTR only) | N/A | Apple | N/A | iOS aesthetic. Use adaptively with Material 3. |
| **Custom (built on framework primitives)** | Any | Full control | Full control | Full control | Full control | Full control | Maximum work. Only justified if brand is highly differentiated. |

### Recommendation (UI Kit)

**Flutter surfaces:** **Material 3** (built-in) as base. Adaptive widgets via `flutter_adaptive_scaffold` for multi-screen breakpoints. Cupertino for iOS-specific interactions. Custom tokens injected via `ThemeExtension` for per-tenant branding.

**React surfaces:** **Ant Design 5.x** as the primary enterprise component library for admin console, workflow designer, front office, business apps. Rationale: Built-in RTL + 50+ locale packs eliminates a major implementation burden. Enterprise tables (Table + Virtual Scroll), Forms (Form + dynamic rules), Tree, Transfer, Cascader — all required in admin surfaces and built-in. Alibaba-backed with formal release cycle.

For marketing/public surfaces (Astro): **shadcn/ui** components as islands — copy-paste, Tailwind-based, customized per-tenant brand.

**Design tokens:** Use **Style Dictionary** (Amazon, Apache 2.0) to define W3C Design Tokens across both ecosystems (CSS variables for React/web; Dart `ThemeExtension` for Flutter). Single source of truth for colors, typography, spacing — per-tenant theme JSON is generated from base tokens at provisioning time.

---

## Sub-decision 5: GraphQL Client

CuraOS uses Cosmo federation gateway (ADR-0103). Cosmo supports:
- graphql-ws (default WS transport)
- SSE (Server-Sent Events via GET or POST) — recommended by Cosmo for unidirectional subscriptions
- Multipart HTTP
- Event Driven Federated Subscriptions (EDFS)
- Persisted queries (shift from JSON-RPC pattern)
- Subscription multiplexing (server-side, transparent to client)

### For React (TypeScript)

| Option | Notes |
|---|---|
| **Apollo Client 3.x / 4.x** | Industry standard. Normalized InMemoryCache. SSE subscriptions via `@graphql-sse/apollo-client`. Persisted queries via APQ (Automatic Persisted Queries). React hooks (useQuery, useMutation, useSubscription). Code-gen via `@graphql-codegen/typescript-react-apollo`. |
| **urql v4** | Lighter. Normalized cache via `@urql/exchange-graphcache`. SSE subscriptions supported. Code-gen via `@graphql-codegen/urql-introspection`. Less feature-rich cache than Apollo. |
| **TanStack Query + custom fetcher** | Not a GraphQL client per se — wraps fetch(). No normalized cache. Use for REST; prefer Apollo/urql for full GraphQL federation. |
| **Relay** | Meta-specific, requires Relay compiler, opinionated fragment colocation. Excellent performance but high learning curve. Not recommended without Meta-experienced team. |

**Recommendation (React):** **Apollo Client 4.x** — most mature, best Cosmo compatibility confirmed, normalized cache reduces re-fetching, SSE subscription transport available via `@graphql-sse/apollo-client`, code-gen produces typed React hooks.

### For Flutter (Dart)

| Option | Notes |
|---|---|
| **ferry** | Stream-based, strongly typed code-gen from schema, Apollo-Kotlin-inspired, reactive cache, supports WS subscriptions. Most feature-rich Dart GraphQL client. |
| **graphql / graphql_flutter** | Most popular Dart GraphQL package. Apollo-modeled. Less typed than ferry. No code-gen built-in. |
| **graphql_codegen** | Code generation addon for `graphql` package. |
| **artemis (deprecated)** | Previous standard. Now abandoned — do not use. |

**Recommendation (Flutter):** **ferry** — strongly typed, code-gen from Cosmo-exposed schema, stream-based reactive cache compatible with Riverpod streams, WS subscriptions. Note: ferry does not have native SSE transport; use WS subscriptions via graphql-ws protocol (Cosmo supports both).

---

## Sub-decision 6: FHIR Client Library

CuraOS HealthStack consumes `/fhir/*` endpoints from HAPI FHIR R4/R5 server (ADR-0103). SMART-on-FHIR (Keycloak 26+ per ADR-0104).

### For React / TypeScript

| Library | FHIR Version | SMART | Notes |
|---|---|---|---|
| **@medplum/core** | R4 / R4B | SMART-on-FHIR | Most complete TS FHIR client. Typed resources, search builder, subscription, binary, PATCH. MIT. Medplum is an open-source FHIR-native EHR platform — `@medplum/core` is its standalone JS client. Active maintenance 2025. |
| **fhirclient** | R4 | SMART-on-FHIR | SMART reference implementation (open-health-manager / smart-on-fhir). Lighter than medplum. Browser + Node. |
| **fhir-kit-client** | Version-agnostic | No | CRUD operations, search, batch. Simpler. Less typed. Node-first but works in browser. |
| **hl7-fhir-types-ts** | R4/R5 | No | TypeScript types only — no HTTP client. Use alongside any HTTP client. |
| **fhir.js** | R4 | No | Legacy. Not actively maintained. Avoid. |

**Recommendation (React/TS):** **@medplum/core** — most complete, typed, SMART-on-FHIR integrated, MIT license, active 2025 maintenance. Pair with **fhirclient** for the SMART launch sequence (Keycloak redirect + token exchange).

### For Flutter / Dart

| Library | Notes |
|---|---|
| **fhir_r4** | Dart FHIR R4 package. Mature. Covers resource parsing, validation, serialization, FHIRPath. MIT. Used in production Flutter EHR apps. |
| **fhir_r5** | R5 variant. Same team. Use when HAPI FHIR R5 endpoints are targeted. |
| **fhir_auth** | SMART-on-FHIR auth for Dart. Keycloak-compatible. |

**Recommendation (Flutter):** **fhir_r4** + **fhir_auth** — mature, actively maintained Dart ecosystem, covers all HealthStack resource types (Patient, Encounter, Observation, Condition, MedicationRequest, DiagnosticReport, Appointment, etc.).

---

## Sub-decision 7: App/Site Builder Runtime + Format

The App/Site Builder is a core CuraOS capability: it generates admin, ops, and external surfaces from BPMN task definitions (Flowable 7 per ADR-0105) + domain contracts + per-tenant theming.

### Design principles from prior art analysis

**AppSmith (open source, Apache 2.0):** JSON-schema–driven layout. React-based renderer. Widgets defined as JSON configs with bindings to data sources. Best for internal dashboards. Generator emits React component tree from JSON widget config. Drag-and-drop editor + code mode.

**Budibase (open source, GPLv3 commercial / AGPL self-host):** Data model-driven. 40+ pre-built components. Works across devices. Svelte-based internal renderer. Best for workflow-driven apps. Exports as standalone Budibase app (not portable React/Vue code).

**NocoBase (open source, AGPL):** Plugin-based, data model-driven. Workflow, approvals, charts via plugins. Closest to CuraOS composable model. React + Ant Design renderer. Schema-driven UI where plugin registers block schemas.

**Plasmic (commercial + open-source rendering):** Visual builder that emits clean React code into your codebase. Figma import. Slots/variants model. On-premise hybrid architecture available. Plasmic runtime is a React SDK — generated code is human-readable React components.

**Builder.io (commercial + OSS SDK):** Visual CMS + page builder. Emits React/Next.js/Vue components. JSON content model stored in Builder CMS, rendered via Builder SDK. Design-to-code (Figma plugin).

### Key architectural question: Compile-time code emission vs runtime interpreter

| Approach | Pros | Cons |
|---|---|---|
| **Compile-time code emission** (generator emits React JSX / Flutter widget Dart code) | Generated code is auditable, diff-able, deployable without Builder runtime. No runtime dependency. | Regeneration required on schema change. Complex templates to maintain. |
| **Runtime interpreter** (JSON schema stored in DB, rendered by SDK at runtime) | Instant updates without deploy. Tenant-specific customization live. | Runtime dependency on Builder SDK. JSON schema is a second language to maintain. Harder to reason about security. |
| **Hybrid** (runtime interpreter for layout/content, compile-time for logic/auth) | Balance between flexibility and auditability. | Most complex to build. |

### Recommendation (App/Site Builder)

**Primary output format: React components (JSX / TypeScript) for web surfaces; Dart/Flutter widget trees for mobile surfaces.**

**Architecture:**
1. **Intermediate Representation (IR):** BPMN task definitions (from Flowable 7 + bpmn-js) are parsed into a JSON IR that describes: form fields (type, validation, conditional visibility), layout (grid, tabs, sections), data bindings (GraphQL query/mutation per task), action buttons, and permission guards.
2. **Code generator (compile-time):** IR → React + Ant Design components (web) or Flutter + Material 3 widgets (mobile). Code-gen is a backend process (Kotlin/JVM + FreeMarker or Qute templates). Output is committed to the tenant's frontend package.
3. **Runtime overrides (runtime interpreter):** Theming, branding, label overrides, field ordering can be applied at runtime via a lightweight JSON overlay — without code regeneration.
4. **Tenant widget registry:** Generated widgets are registered as Web Components (Lit 3.x) in a per-tenant widget registry. This allows the widgets to be embedded in any host — Astro pages, React admin console, or Flutter WebView.

**Learnings from prior art:**
- NocoBase's plugin-registered block schemas is the closest model — adopt schema-driven block registration.
- Plasmic's clean React code emission is the quality target for generated output.
- AppSmith's JSON widget config → React renderer is the runtime overlay pattern to adopt.
- Budibase GPLv3 license — do not derive from it. Reference architecture only.

**BPMN task → form UI generation flow:**
```
Flowable 7 BPMN Task definition
  → Task form JSON (field list + validation rules)
  → CuraOS Form IR (enriched with domain contract types + theming tokens)
  → Code generator (Kotlin/Qute templates)
  → React: <TaskForm> component (Ant Design Form + fields + React Hook Form + Zod validation)
  → Flutter: TaskFormWidget (Material 3 Form + fields + Riverpod state)
```

**Schema-driven form runtime:** Use **React Hook Form** + **Zod** (web) and **reactive_forms** (Flutter) for runtime form rendering from JSON schema. This enables the runtime overlay path without full code regeneration for layout-only changes.

---

## Sub-decision 8: Theming + Multi-Tenant Branding

### Options

| Approach | Pros | Cons |
|---|---|---|
| **CSS variables + Design Tokens (Style Dictionary)** | Framework-agnostic. W3C Design Token spec aligned. Single source of truth. CSS vars work in React, Astro, any web surface. | Does not apply to Flutter (no CSS). |
| **Per-tenant theme JSON loaded at runtime** | Instant tenant switch. No per-tenant build. | Requires runtime theming system in every app. |
| **Pre-built per-tenant bundles** | Fastest load (no runtime computation). | CI cost proportional to tenant count. Impractical at scale. |
| **Material 3 dynamic color (Flutter)** | Algorithmic palette generation from seed color. Reduces manual token definition. | Only Flutter. |
| **Flutter ThemeExtension** | Custom semantic tokens added to ThemeData. | Flutter-only. |

### Recommendation (Theming)

**Web (React + Astro):**
- **Style Dictionary** (Amazon, Apache 2.0) as the design token pipeline. Tokens defined in W3C Design Token format (JSON). Style Dictionary transforms tokens to CSS variables (web), Dart constants (Flutter), and Kotlin constants (Android).
- Per-tenant theme is a JSON file (`tenant-theme.json`) provisioned at tenant onboarding. Theme JSON overrides base token values.
- At runtime, the React app fetches the tenant theme JSON from the Settings service and applies it as CSS custom properties on `:root`. Ant Design's `ConfigProvider` theme prop accepts the resolved token map — tenant-specific colors, border radius, font family.
- Fonts are self-hosted (GDPR + air-gap) as WOFF2 subsets. Font stack declared in CSS variables.

**Flutter:**
- `ThemeExtension` carries CuraOS semantic tokens (brand primary, surface colors, clinical severity colors).
- Per-tenant `ThemeData` is generated at app startup from the Settings service response.
- Material 3 dynamic color (`ColorScheme.fromSeed`) generates accessible palette from tenant seed color.
- RTL: `Directionality` widget wraps the app tree; set from locale at startup.

---

## Sub-decision 9: i18n + RTL

### Options

| Tool | Platform | ICU | RTL | Self-hosted TMS |
|---|---|---|---|---|
| **intl (Dart)** | Flutter | ICU MessageFormat | Via Directionality | N/A |
| **flutter_localizations** | Flutter | ARB format | Yes | N/A |
| **next-intl** | Next.js | ICU MessageFormat | Via CSS dir | N/A |
| **react-i18next** | React | ICU (with i18next-icu plugin) | Via CSS dir | N/A |
| **Format.JS (formatjs)** | React | ICU MessageFormat (native) | Via CSS dir | N/A |
| **Weblate 5.x** | TMS (any) | ICU supported | N/A | Yes (AGPL, Docker) |
| **Lokalise** | TMS | ICU | N/A | No (SaaS only) |
| **Crowdin** | TMS | ICU | N/A | No (SaaS only) |

### Recommendation (i18n)

**Flutter:** `intl` + `flutter_localizations` with ARB format. ICU MessageFormat for plural/gender/select. `Directionality.of(context)` for RTL layout. `intl` handles locale-aware dates, numbers, currencies.

**React/Next.js:** **next-intl** (ICU MessageFormat native, Next.js App Router integration, edge-compatible). For React surfaces outside Next.js: **react-i18next** with `i18next-icu` plugin.

**Translation management:** **Weblate 5.17** (AGPL, self-hosted via Docker). Weblate supports ICU MessageFormat quality checks, ARB format for Flutter, JSON/PO for React. Git integration — translations committed to repo, CI deploys. Self-hostable = GDPR compliant (no translation strings on third-party SaaS).

**RTL:**
- Web: `dir="rtl"` on `<html>` element + `writing-mode: horizontal-tb` + CSS logical properties (`margin-inline-start` instead of `margin-left`). Ant Design 5.x RTL via `ConfigProvider direction="rtl"`. MUI via `CacheProvider` with RTL emotion cache.
- Flutter: `Directionality` widget + `TextDirection.rtl` injected from locale. Material 3 mirrors layout automatically.

---

## Sub-decision 10: Offline / Sync (Clinical + Patient Mobile)

### Options

| Engine | Flutter SDK | RN SDK | Web SDK | Self-hosted | Offline-first | Conflict resolution |
|---|---|---|---|---|---|---|
| **PowerSync** | Yes (first-class) | Yes | Yes | Yes (Open Edition + Enterprise) | Full SQLite, works completely offline | Server-side custom logic |
| **ElectricSQL** | No | Yes | Yes | Yes (Apache 2.0) | Yes (PGlite) | Last-write-wins |
| **Zero** | No | No | Yes | Yes (open source) | Reads from IndexedDB | Server-authoritative |
| **WatermelonDB** | No | Yes (primary) | Yes | Self-managed | Yes (LokiJS or SQLite) | Custom resolver |
| **Realm / Atlas Device Sync** | No | Yes | Limited | No (MongoDB managed) | Yes | Merge-based |
| **Couchbase Lite** | No | Yes | Limited | Yes (enterprise) | Yes | MVCC |
| **Drift + drift_crdt** | Yes | No | No | Self-managed | Yes (CRDT) | CRDT (mathematically convergent) |
| **RxDB** | No | No | Yes | Self-managed | Yes (IndexedDB) | CRDT / CouchDB |
| **SQLDelight (KMP)** | Via KMP | No | Via KMP | Self-managed | SQLite | Custom |

### Analysis

**PowerSync** is the clear choice for Flutter: it is the only production-tested, self-hostable offline sync engine with a first-class Flutter SDK. PowerSync Open Edition (source-available, free self-hosted) works with Postgres — which CuraOS uses (ADR-0101). Sync Streams (2025) adds dynamic on-demand sync. PowerSync maps Postgres tables to SQLite views on the client via declarative Sync Rules.

**For React Native (if used for any mobile surfaces):** WatermelonDB is the established React Native offline store. PowerSync also provides an RN SDK. If HealthStack mobile is Flutter-only, this is moot.

**drift + drift_crdt** is an alternative for purely local SQLite with CRDT merge — suitable for apps where the sync protocol is custom or lightweight (e.g., personal notes app). Not a full sync engine.

### Recommendation (Offline Sync)

**PowerSync** for all Flutter offline-first apps (HealthStack clinician, HealthStack patient mobile, personal apps mobile). Self-hosted via PowerSync Open Edition on the CuraOS infrastructure stack (Postgres already available). Sync Rules define which patient data syncs to which clinician device — tenant and role-aware.

Configuration:
- Clinician app: sync Patient, Encounter, Observation, MedicationRequest for assigned patients only (Sync Rules enforce this).
- Patient app: sync only the patient's own resources.
- Conflict resolution: server-authoritative for clinical data (server wins on merge); last-write-wins acceptable for personal app data (notes, tasks).

---

## Sub-decision 11: Real-Time Channel Client (SSE + WS)

ADR-0103 established SSE as the primary real-time channel, WebSockets secondary. Cosmo EDFS recommends SSE+Fetch for subscriptions.

### Options

| Transport | Web (React) | Flutter | React Native | Notes |
|---|---|---|---|---|
| **EventSource (SSE)** | Browser-native `EventSource` API | `dart:html` EventSource (web only); `flutter_sse` for mobile | `react-native-sse` polyfill | Simple, HTTP-compatible, firewall-friendly, auto-reconnect with `Last-Event-ID` |
| **WebSocket** | Browser-native `WebSocket` | `web_socket_channel` (Dart) | React Native built-in | Bidirectional. Cosmo supports graphql-ws protocol. |
| **Apollo Client SSE** | `@graphql-sse/apollo-client` | N/A | N/A | Apollo uses SSE transport for GraphQL subscriptions |
| **ferry + graphql-ws** | N/A | ferry WS subscriptions | N/A | ferry connects to Cosmo via graphql-ws protocol |
| **MQTT** | `mqtt.js` | `mqtt_client` (Dart) | `react-native-mqtt` | For IoT/device scenarios (HealthStack device integration overlay) |

### Recommendation

**Web (React/Next.js):**
- GraphQL subscriptions → **Apollo Client** with `@graphql-sse/apollo-client` transport (SSE over HTTP per Cosmo EDFS recommendation).
- Lightweight event streams (notifications, presence, audit feed) → native `EventSource` with exponential backoff reconnect + `Last-Event-ID` for replay.

**Flutter:**
- GraphQL subscriptions → **ferry** WS subscriptions via `graphql-ws` protocol (Cosmo supports this).
- Lightweight event streams → `flutter_sse` for mobile; `dart:html` EventSource for Flutter web.
- Device integration (MQTT for medical devices in clinical app) → `mqtt_client` (Dart, MIT).

**React Native (if used):**
- `react-native-sse` for SSE.
- Apollo Client for GraphQL subscriptions (same as web, RN-compatible).

---

## Sub-decision 12: Build + Asset Pipeline

### Options

| Tool | Target | Notes |
|---|---|---|
| **Vite 6.x** | React (non-Next.js), Astro | Ultra-fast dev server (native ESM). Rollup for production bundles. Astro uses Vite internally. For standalone React apps (non-Next.js). |
| **Next.js Turbopack** | Next.js 15 | Rust-based incremental bundler. Default in Next.js 15 dev server. Production Turbopack stable in Next.js 15.3+. |
| **Flutter build (flutter build web/apk/ios/macos)** | Flutter | Native Flutter toolchain. FVM-managed version. Melos runs across packages. |
| **esbuild** | Libraries | For building shared TypeScript libraries (API SDK, utility packages). Fastest TS/JS bundler. Used internally by Vite. |
| **Rollup** | Library packages | For ESM library output with tree-shakeable exports. |
| **Webpack 5** | Legacy surfaces | Only if migrating existing webpack config. No new webpack setups. |

### Recommendation

- **Next.js 15 + Turbopack** for all Next.js App Router surfaces (admin console, workflow designer, App/Site Builder, front office).
- **Vite 6.x** for Astro-based public site surfaces (Astro uses Vite internally — no additional config needed).
- **Flutter toolchain (via FVM + Melos)** for all Flutter packages.
- **esbuild / tsup** for building the shared TypeScript API SDK library (published as npm package, consumed by Next.js + Astro).
- **No Webpack** for new packages.

**Bundle size budgets per surface (enforced via Nx bundle analyzer / `@next/bundle-analyzer`):**

| Surface | JS budget (gzip) | WASM budget | Notes |
|---|---|---|---|
| Admin console (Next.js RSC) | ~200 KB initial | None | RSC reduces client bundle significantly |
| Workflow designer | ~300 KB | None | bpmn-js adds ~150KB |
| Public site (Astro) | ~0 KB default | None | Zero JS until island hydration |
| Patient web portal (Flutter Wasm) | N/A | ~2 MB (WASM) | First visit penalty; cached after |
| Clinician mobile (Flutter native) | N/A | N/A | App bundle, not JS |

---

## Cross-Cutting Concerns

### Code Splitting + Lazy Loading

- Next.js App Router: route-level code splitting automatic. Component-level: `React.lazy()` + `Suspense`. Dynamic imports for heavy libs (bpmn-js loaded on demand in workflow designer only).
- Flutter: deferred loading with `deferred as` import syntax for large widget trees.

### Secure Credential Storage

| Platform | Mechanism |
|---|---|
| Flutter iOS | `flutter_secure_storage` → iOS Keychain |
| Flutter Android | `flutter_secure_storage` → Android Keystore + EncryptedSharedPreferences |
| Flutter macOS/Windows | `flutter_secure_storage` → macOS Keychain / Windows DPAPI |
| React Native iOS | `expo-secure-store` → iOS Keychain |
| React Native Android | `expo-secure-store` → Android Keystore |
| Web (Next.js) | HttpOnly cookies for refresh tokens (no JS access). `sessionStorage` for short-lived access tokens (cleared on tab close). `SubtleCrypto` AES-GCM for any encrypted local state. |

### PHI Handling on Client

- **Never write PHI to `localStorage`, `sessionStorage` plaintext, or IndexedDB plaintext.**
- PHI lives in Riverpod state (Flutter) or Apollo InMemoryCache / TanStack Query cache (React) — in-memory only.
- On app background (Flutter: `AppLifecycleState.paused`) or screen lock: clear Riverpod PHI providers. Re-fetch on resume after re-authentication.
- Web: PHI never in URL query parameters. HTTPS-only (HSTS enforced at APISIX).
- Push notifications: no PHI in payload. Notification body is generic ("New message from care team"). PHI fetched on-demand after launch.
- Session timeout: enforced client-side (idle timer) + Keycloak token expiry server-side.

### Telemetry (OpenTelemetry)

- **Flutter:** `flutterrific_opentelemetry` or `scout_flutter` (zero-config RUM: traces, metrics, logs via OTLP). Exports to CuraOS observability stack (Grafana + Tempo + Loki, per ADR-0101 / ADR-0102 adjacent).
- **React/Next.js:** `@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-document-load` + `@opentelemetry/instrumentation-fetch`. Web vitals (LCP, INP, CLS) via `web-vitals` package → OTLP export.
- **No third-party analytics SDKs** (GDPR) unless BAA signed and data routed through CuraOS infrastructure only.
- Tenant-aware trace context: inject `tenant-id` as OTEL resource attribute at app initialization.

### Accessibility Audit Pipeline

- **Web (React):** `axe-core` integrated into Storybook (component library) via `@storybook/addon-a11y`. `pa11y-ci` in CI pipeline against deployed preview URLs. `eslint-plugin-jsx-a11y` in Nx lint config.
- **Flutter:** Flutter accessibility test API (`SemanticsController`) in widget tests. Manual screen reader testing on iOS (VoiceOver) and Android (TalkBack) as part of HealthStack release gate.
- WCAG 2.2 AA automated coverage: ~40% of issues detectable by axe-core. Remaining 60% require manual audit. Quarterly manual audit cadence for clinical apps.

### Per-Tenant Subdomain vs Path-Based Routing

- **Subdomains:** `tenant-a.curaos.example.com` — cleanest isolation, cookie scoping automatic, Keycloak realm per subdomain.
- **Path-based:** `curaos.example.com/tenant-a/` — simpler cert management, single APISIX vhost.
- **Recommendation:** Subdomain routing for SaaS profile. Path-based routing for on-prem single-tenant deployments where wildcard cert management is customer-owned. APISIX routes by `Host` header → tenant resolver → attaches tenant context to upstream requests.

### SSO Flow (Keycloak)

- Keycloak 26+ OIDC Authorization Code + PKCE flow (per ADR-0104).
- Flutter: `flutter_appauth` (certified OAuth 2.0 native app library) → Keycloak redirect → token exchange → store access token in Riverpod state, refresh token in `flutter_secure_storage`.
- React/Next.js: `next-auth` (Auth.js v5) with Keycloak provider → server-side session management → RSC receives session from server, no token in client JS.
- SMART-on-FHIR launch: `fhirclient` (JS) or `fhir_auth` (Dart) handles SMART authorization flow for HealthStack apps.

### App Distribution

| Surface | Distribution |
|---|---|
| Flutter iOS | Apple App Store (EHR apps) + TestFlight (beta) + Enterprise Distribution (on-prem tenants via MDM) |
| Flutter Android | Google Play Store + APK sideload (on-prem tenants via MDM) |
| Flutter macOS | Mac App Store + notarized DMG |
| Flutter Windows | MSIX package via Microsoft Store or self-hosted installer |
| Flutter Linux | AppImage / Flatpak for clinical desktop kiosks |
| Next.js web | Docker container, self-hosted. Tenant-specific subdomains routed by APISIX. |
| Astro public sites | Static output → tenant-provisioned web server or S3-compatible (SeaweedFS per ADR-0101) |

---

## Recommendation Summary

| Sub-decision | Recommendation |
|---|---|
| Framework (web — admin, workflow, builder) | React 19 + Next.js 15 (App Router, Turbopack) |
| Framework (mobile + companion web — clinical, patient) | Flutter 3.38+ (Dart, FVM-managed) — retain current commitment |
| Framework (public site-builder output) | Astro 5.x with React island components |
| Framework (App/Site Builder widget output format) | Web Components (Lit 3.x) as portable widget format |
| Monorepo (Dart/Flutter packages) | Melos — retain current commitment |
| Monorepo (TypeScript/React packages) | Nx 20.x |
| State (Flutter) | Riverpod 2.x (primary) + Bloc for state machines |
| State (React) | Apollo Client (GraphQL) + TanStack Query (REST) + Zustand (UI state) |
| UI Kit (Flutter) | Material 3 + Cupertino adaptive + ThemeExtension tokens |
| UI Kit (React web) | Ant Design 5.x (admin) + shadcn/ui (public sites) |
| Design tokens | Style Dictionary (W3C tokens → CSS vars + Dart constants) |
| GraphQL client (React) | Apollo Client 4.x + @graphql-sse/apollo-client (SSE transport) |
| GraphQL client (Flutter) | ferry (stream-based, code-gen, WS subscriptions) |
| FHIR client (React/TS) | @medplum/core + fhirclient (SMART launch) |
| FHIR client (Flutter) | fhir_r4 + fhir_auth |
| App/Site Builder format | IR → code-gen (React/Flutter) + runtime JSON overlay + Web Component widget registry |
| Theming | Style Dictionary + per-tenant theme JSON + CSS variables (web) + ThemeExtension (Flutter) |
| i18n + RTL | next-intl / intl (ICU MessageFormat) + Weblate 5.x self-hosted TMS |
| Offline sync | PowerSync Open Edition (self-hosted, Flutter SDK, Postgres backend) |
| Real-time (React) | Apollo Client SSE transport (GraphQL) + native EventSource (lightweight streams) |
| Real-time (Flutter) | ferry WS (GraphQL) + flutter_sse (lightweight streams) + mqtt_client (IoT) |
| Build pipeline (web) | Next.js 15 + Turbopack; Astro + Vite for public sites |
| Build pipeline (Flutter) | Flutter toolchain + FVM + Melos |
| Telemetry | flutterrific_opentelemetry (Flutter) + @opentelemetry/sdk-trace-web (React) |
| Accessibility audit | axe-core + pa11y-ci (web) + Flutter SemanticsController (mobile) |
| Secure storage | flutter_secure_storage (Flutter) + expo-secure-store (RN) + HttpOnly cookies (web) |
| i18n TMS | Weblate 5.17 (self-hosted, AGPL, Docker) |

### Client Surface → BFF / Cosmo → Backend Services Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT SURFACES                                                     │
│                                                                      │
│  [Admin Console]        [Workflow Designer]      [App/Site Builder] │
│  [Front Office]         [Business Apps]          [Personal Apps]    │
│  React 19 + Next.js 15 + Ant Design 5.x + Apollo Client            │
│                                                                      │
│  [Public Sites]                                                      │
│  Astro 5.x + shadcn/ui islands                                      │
│                                                                      │
│  [Clinician App]    [Patient App]   [Personal Mobile]               │
│  Flutter 3.38+ + Material 3 + Riverpod + ferry + PowerSync          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS / OIDC (Keycloak 26+)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  APISIX GATEWAY (ADR-0103)                                          │
│  Rate limiting · Auth validation · Tenant routing · CORS           │
└────────────────────┬─────────────────────┬──────────────────────────┘
                     │                     │
              GraphQL (Cosmo)         REST + SSE
                     │                     │
┌────────────────────▼─────────────────────▼──────────────────────────┐
│  COSMO FEDERATION GATEWAY (ADR-0103)                                │
│  Federated GraphQL · Persisted Queries · SSE Subscriptions (EDFS)  │
│  Subscription Multiplexing · graphql-ws + SSE transports            │
└──────────────┬────────────────────────────────────────────────────  │
               │
   ┌───────────┼─────────────────────────────────┐
   ▼           ▼                                 ▼
[Identity  [Neutral Services:                 [HealthStack:
 Service]   Party, Org, Notify,               HAPI FHIR R4/R5
 Keycloak   Tasks, Calendar,                  Encounter, Patient,
 ADR-0104]  Documents, Reports,               Observation, Orders]
            Commerce, HR, ...]
            Kotlin + Spring Boot (ADR-0100)
            PostgreSQL 17 / Valkey (ADR-0101)
            Kafka/NATS (ADR-0102)
```

---

## Open Questions for User

1. **Framework split confirmation:** Is the React 19 + Next.js (web) + Flutter (mobile) split acceptable, or is a single-framework approach preferred despite the tradeoffs? (Single framework means either accepting Flutter's web SEO limitations or accepting React Native's offline-sync limitations vs PowerSync Flutter SDK.)

2. **HealthStack clinician app — desktop target:** Should the clinician app have a dedicated Flutter macOS/Windows desktop build, or will the web app (React/Next.js) serve clinician desktop scenarios? Flutter desktop adds a distribution and QA stream.

3. **Patient web portal:** Accept the 1.5–2 MB WASM payload for Flutter Web on the patient portal, or build a separate React/Next.js patient web app? React patient portal would require a separate FHIR client integration and cannot share Flutter component code.

4. **App/Site Builder output format:** Should generated apps be React components, Flutter widgets, or Web Components? React-only limits mobile builder output. Flutter-only limits web builder output. Web Components as universal format are portable but less feature-rich for complex interactions.

5. **Monorepo topology:** Should Dart and TypeScript packages live in the same monorepo (one Melos + Nx hybrid), or in two separate repos (Dart repo managed by Melos; TS repo managed by Nx)?

6. **Nx vs Turborepo for TypeScript monorepo:** Does the team value Nx's module boundary enforcement and code generators enough to accept the higher setup cost vs Turborepo's simplicity?

7. **Design system starting point:** Build the Ant Design–based design system from scratch, or adopt an open-source healthcare design system (e.g., Carbon Design System from IBM, which has WCAG compliance and healthcare usage) as a starting point?

8. **Flutter web for admin surfaces:** Some admin surfaces (reports, dashboards) could be Flutter web to maximize code sharing. Is acceptable to have Flutter web rendering (WASM, no SSR) for internal-only admin surfaces where SEO is irrelevant?

9. **KMP for shared business logic:** Should Kotlin Multiplatform (without Compose UI) be used for a shared business logic layer across Kotlin backend services and Flutter mobile apps (e.g., shared validation rules, serialization models)? This is distinct from using Compose Multiplatform for UI.

10. **Offline scope:** Which specific HealthStack features require offline operation? Full encounter documentation, or read-only patient chart access? Scope determines PowerSync Sync Rules complexity.

11. **Weblate hosting:** Should Weblate run as a dedicated service in the CuraOS ops stack, or use a managed Weblate Cloud instance initially? (Weblate Cloud is not self-hosted — impacts GDPR posture for translation strings containing patient-identifiable strings.)

12. **App/Site Builder visual editor:** Should CuraOS build its own drag-and-drop visual editor, or integrate an open-source editor core (GrapesJS for sites, Craft.js for apps) and customize? Building from scratch is 12–18 months of work.

13. **bpmn-js + React integration:** The bpmn-js workflow designer (ADR-0105) is a vanilla JS library. Next.js embedding requires a dynamic import with `ssr: false`. Is the React + bpmn-js integration confirmed as acceptable, or is there appetite to evaluate alternative BPMN modelers with first-class React bindings?

14. **EAS Build self-hosted:** Expo's EAS Build for iOS requires Apple provisioning — is there an on-prem iOS build server plan (Mac mini fleet) for tenants who cannot use Expo's cloud EAS?

15. **Desktop Tauri option:** For the App/Site Builder and admin console, should a Tauri 2.x desktop app be delivered as a first-class artifact (React + Tauri, ~5 MB installer) for tenants running air-gapped deployments who prefer a native desktop experience?

16. **MQTT / device integration scope:** Is device integration (medical device telemetry over MQTT in the clinician app) in scope for the initial HealthStack overlay, or a later phase?

17. **Composed client packages naming:** Confirm the package namespace convention: `packages/cura_os/*` (Flutter), `packages/@curaos/*` (npm) — or something else? This affects Melos filter patterns and Nx project tags.

---

## References

### Flutter & Dart
- [Flutter Web & WebAssembly in 2026](https://amgres.com/blog/flutter-web-webassembly-wasm-2026-guide)
- [Flutter Web Renderers (official docs)](https://docs.flutter.dev/platform-integration/web/renderers)
- [Flutter WebAssembly Support (official docs)](https://docs.flutter.dev/platform-integration/web/wasm)
- [Flutter Web Assembly: The Future of Flutter Web in 2026](https://dasroot.net/posts/2025/12/flutter-web-assembly-future-web-development/)
- [HIPAA Compliance Guide for Flutter & React Native Apps 2026](https://42works.net/how-developers-can-achieve-hipaa-compliance-in-flutter-and-react-native-apps-in-2026/)
- [ferry GraphQL for Flutter](https://ferrygraphql.com/)
- [fhir_r4 Dart package (pub.dev)](https://pub.dev/packages/fhir_r4) *(referenced by name; not fetched)*

### React Ecosystem
- [React 19 Server Components: Production Patterns 2026](https://dev.to/vikrant_bagal_afae3e25ca7/react-19-server-components-production-patterns-for-high-performance-apps-in-2026-3278)
- [React 19 at Scale: RSC, Cache & Edge](https://medium.com/@bhagyarana80/react-19-at-scale-rsc-cache-edge-that-dont-melt-1bd8407a5ead)
- [React Native 0.77 available with Expo SDK 52](https://expo.dev/changelog/2025-01-21-react-native-0.77)
- [Expo 2026: The Best Way to Build Cross-Platform Apps?](https://metadesignsolutions.com/expo-2026-the-best-way-to-build-cross-platform-apps/)
- [Building a Cross-Platform App with React Native 0.75, Expo 52](https://dev.to/johalputt/retrospective-building-a-cross-platform-app-with-react-native-075-expo-52-and-firebase-11-34pj)
- [HIPAA Compliance and Expo (official Expo docs)](https://docs.expo.dev/regulatory-compliance/hipaa/)

### Kotlin Multiplatform
- [Compose Multiplatform 1.8.0 Released — iOS Stable](https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/)
- [Is Kotlin Multiplatform Production Ready in 2026?](https://www.kmpship.app/blog/is-kotlin-multiplatform-production-ready-2026)
- [Kotlin Multiplatform: 2025 Updates and 2026 Predictions](https://www.aetherius-solutions.com/blog-posts/kotlin-multiplatform-in-2026)

### UI Libraries
- [React UI Libraries in 2025: shadcn/ui, Radix, Mantine, MUI, Chakra](https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra)
- [shadcn/ui vs MUI vs Ant Design 2026](https://adminlte.io/blog/shadcn-ui-vs-mui-vs-ant-design/)
- [shadcn/ui vs Mantine vs Ant Design: Comprehensive Comparison 2026](https://zenn.dev/ui_memo/articles/4d49d34685e027?locale=en)

### Monorepo Tools
- [Turborepo vs Nx vs Moon 2026](https://www.pkgpulse.com/guides/turborepo-vs-nx-vs-moon-build-tools-2026)
- [Monorepo in 2026: Turborepo vs Nx vs Bazel](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/)
- [Nx vs Turborepo (official Nx comparison)](https://nx.dev/docs/guides/adopting-nx/nx-vs-turborepo)

### GraphQL & API
- [Cosmo Router Subscriptions (official docs)](https://cosmo-docs.wundergraph.com/router/subscriptions)
- [Native Subscriptions in Federated GraphQL with Cosmo Router](https://medium.com/@wundergraph/native-subscriptions-in-federated-graphql-with-cosmo-router-b8452800f97e)
- [@graphql-sse/apollo-client (npm)](https://www.npmjs.com/package/@graphql-sse/apollo-client)

### FHIR
- [@medplum/core (npm)](https://www.npmjs.com/package/@medplum/core?activeTab=readme)
- [fhir-kit-client (npm)](https://www.npmjs.com/package/fhir-kit-client)
- [fhirclient — SMART on FHIR JS library](https://www.npmjs.com/package/fhirclient)

### Offline Sync
- [ElectricSQL vs PowerSync vs Zero: Best Local-First Sync Engine 2026](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026)
- [2025 PowerSync Roadmap Update](https://powersync.com/blog/2025-powersync-roadmap-update)
- [Offline-First Flutter with Drift](https://geekyants.com/blog/offline-first-flutter-implementation-blueprint-for-real-world-apps)

### Low-Code / App Builder Prior Art
- [NocoBase vs Appsmith](https://www.nocobase.com/en/blog/nocobase-vs-appsmith)
- [Budibase vs Appsmith vs Superblocks](https://www.superblocks.com/blog/budibase-vs-appsmith)
- [Plasmic vs Builder.io](https://www.subframe.com/tips/plasmic-vs-builderio)
- [Builder.io vs Plasmic vs Makeswift 2026](https://www.pkgpulse.com/blog/builder-io-vs-plasmic-vs-makeswift-visual-page-builders-2026)

### i18n & TMS
- [Weblate — web-based localization (self-hosted)](https://weblate.org/en/)
- [Weblate ICU MessageFormat checks](https://docs.weblate.org/en/latest/user/checks.html)

### Telemetry
- [OpenTelemetry for Flutter cross-platform applications](https://oneuptime.com/blog/post/2026-02-06-opentelemetry-flutter-cross-platform-applications/view)
- [Adding OpenTelemetry to React Apps](https://last9.io/blog/adding-opentelemetry-to-your-react-apps/)
- [OpenTelemetry React Native instrumentation](https://embrace.io/blog/creating-opentelemetry-instrumentation-library-react-native/)

### Desktop
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)

### Developer Surveys
- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025)
- [Stack Overflow Developer Survey 2024](https://survey.stackoverflow.co/2024/)

---

*ADR-0106 end. Next: ADR-0107 (Observability stack) or ADR-0108 (Infrastructure / IaC).*
