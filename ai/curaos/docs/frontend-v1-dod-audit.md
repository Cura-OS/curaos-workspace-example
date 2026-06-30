# Frontend v1.0 Definition-of-Done + Gap Report

## Convergence status (updated `curaos` @ `9ea3b30`, after 8 audit->close cycles)

**v1.0 frontend is FUNCTIONALLY COMPLETE (mock-first) across all 22 apps**, shipped to `main`, 0 open PRs. The product dimensions converged to PASS: D1 build+test (22/22), D2 render-offline, D3 design+icons, D5 product-depth, D7 live-wiring-readiness. Every source defect found across audits 1-8 was fixed AND folded back into the generators so it cannot recur (build-break, hosted-login 500, builder-studio auth/jose/grapesjs, JWT signature verify, glyph/entity icons, scaffold routes, RN i18n+accents, the prod-mock-leak on web AND RN, the Zustand crash, the test regressions).

**Remaining tail = non-source or external (NOT v1 functional blockers):**
- **Next 15.3.5 build-worker static-gen race** (D1, intermittent ~50% on hosted-login): a Next-version infra flake, NOT app source; mitigated by the emitted `predev` `.next` clean. Real fix = upgrade Next past 15.3.x. Tracked, not a per-app fix.
- **i18n partial adoption** (D6): hardcoded `<h1>`/empty-state copy across ~18 apps + builder-studio lacks a seam. Quality/polish, bounded, non-blocking for functional v1; a candidate v1.1 sweep (route copy through `useMessages()` + expand catalogs).
- **curl-vs-browser SSR** (D2 method note): client-fetch screens render seeded content in a browser, not in curl'd SSR HTML. Gate-definition nuance, not a defect; any CI render gate must use a headless browser.
- **RN native OIDC PKCE** (D4): clinician/patient delegate sign-in to `@curaos/auth-sdk` + expo-secure-store (no in-app PKCE route by design); the native PKCE seam should be documented/audited in auth-sdk separately.
- **M16 deploy infra (I1-I5)**: a running cluster + APISIX gateway + IdP. "Fully SHIPPED to prod" depends on this external infra; the frontend code path (env flip -> live fetch) is proven complete (D7 PASS).

The sections below are the detailed audit-8 (@`f295c4bd`) findings; the D4 auth + D3 icon items they list were closed in `9ea3b30` (RN prod-mock-guard + entity-glyph removal).

---

**Scope:** all 22 frontend apps under `curaos/frontend/apps/` (20 Next.js App-Router web apps + 2 Expo/React Native: `clinician-app`, `patient-app`).
**Baseline:** `curaos` @ `f295c4bd`. All 22 submodule worktree SHAs verified to exactly match the parent-pinned `HEAD:frontend/apps` SHAs (submodule HEADs sit on per-app feature branches, but content == main-pinned, so this is the correct "from main" state; no drift). Re-running this audit MUST first confirm each app worktree SHA == `git ls-tree HEAD:frontend/apps` before trusting results.
**Method:** six adversarial dimension audits run directly: real production builds + real test runs (no turbo-cache masking; tsc gate adversarially proven to have teeth via injected TS2322), real-browser render verification (curl is insufficient and would false-fail; see D2), byte-level source diffing of the auth + live-wiring seams, and entity-aware Unicode scanning.
**Date:** 2026-06-16.

---

## 1. v1.0 Frontend Definition of Done

For v1.0 ("fully functional" = mock-first, code-complete), EVERY app must satisfy all six dimensions:

| # | Dimension | DoD criterion (what "done" means for every app) |
|---|---|---|
| D1 | **build-test** | `typecheck` (tsc --noEmit) + `build` (next build / expo export) + `test` (bun test, real non-vacuous tests) all exit 0, deterministically. |
| D2 | **render-offline** | With `*_USE_MOCK=true` and API base unset, every main screen renders real seeded content **in a real browser** (JS-executed, hydration-stable); seeded mock session = no live-IdP bounce; 0 runtime/console errors. |
| D3 | **design-icons** | Per-app distinct `--accent`; grouped iconed sidebar via curated `@curaos/ui` `<Icon>` (Phosphor-backed); fixed-px icon sizing; zero lucide / icon-font / **Unicode-glyph (incl. HTML entity)** leakage. |
| D4 | **auth-pkce** | OIDC Authorization Code + PKCE (S256) login/callback correct; httpOnly/lax/secure-prod cookies; JWKS signature verification; mock plane **hard-fails in production** across every app (web + native); no client-side credential processing. |
| D5 | **depth-real** | >=1 bespoke signature surface per app with real interactive state + store mutations + rich seeded data; no stubs, TODOs, "coming soon", "not implemented", or empty-return placeholders. |
| D6 | **a11y-i18n-quality** | i18n seam present **and used** (multi-locale + RTL where required; no widely-hardcoded user-visible copy); a11y (visible focus rings on all keyboard-focusable controls, aria); zero em/en dashes; no committed secrets; complete loading/error/empty states. |
| D7 | **live-wiring-readiness** | Code path to a real backend exists and is correct: setting the API base env flips mock off and routes through the gateway/SDKs with OIDC bearer threaded; every app's derived/aggregate reads + writes use the live path when mock is off; only a running backend (infra) remains. |

---

## 2. Per-Dimension PASS / FAIL

| Dim | Verdict | One-line reason |
|---|---|---|
| D1 build-test | **PASS** | All 22 apps: typecheck EXIT 0, real production build EXIT 0, real non-vacuous tests EXIT 0 (20-44 tests/app, 0 failures). Honest fully-executed green gate. |
| D2 render-offline | **PASS** | 11-app representative spread browser-verified: every screen 200 (or intended internal 307), real seeded content after hydration, 0 console/server errors, no live-IdP bounce. |
| D3 design-icons | **FAIL** | 2 real Unicode-glyph violations via HTML numeric entities: `admin-app` dashboard `&#9632;` (U+25A0) legend markers, `personal-donation` give-flow `&#10003;` (U+2713) success glyph. Accent + sidebar + fixed-px all PASS. |
| D4 auth-pkce | **FAIL** | The 2 Expo clinical (PHI) apps `patient-app` + `clinician-app` lack the production mock hard-off the 19 web apps have; a misconfigured prod native build silently seeds a `platform-admin` session over a PHI surface. PKCE machinery otherwise correct + byte-identical across web apps. |
| D5 depth-real | **PASS** | All 22 apps ship a genuine bespoke signature surface (DnD kanban, node-graph editor, calendar grids, GrapesJS canvas, schema-form engine, etc.) with real wired mutations + substantial seed data. Zero stubs. |
| D6 a11y-i18n-quality | **FAIL** | i18n single-locale + hardcoded copy across 18/20 web apps (only `admin-app` ships en+ar/RTL); `builder-studio` triple-outlier (no i18n seam, no `.env` gitignore + no `.env.local.example`, no shared loading/error/empty triad); ~38 `all:unset` buttons with no global `:focus-visible` (WCAG 2.4.7). |
| D7 live-wiring-readiness | **FAIL** (code) + infra-blocked | Toggle + SDK + bootstrap + fetch/write + auth seam are real and test-proven for ~20 apps. Real code gap in `personal-notes` (derived hooks + all mutations read/write the zustand seed store only, never the live backend). Rest is pure infra (M16 cluster). |

**Net: 3 PASS / 3 FAIL.** D1/D2/D5 are clean. D3 and D4 fail on a small, precisely-enumerated set of code defects (4 total across 4 apps). D6 is a systemic quality-polish gap. D7 fails on ONE app-side code gap (`personal-notes`); everything else in D7 is infra-blocked, not code-blocked.

### Evidence highlights

- **D1:** WEB 20/20 `tsc --noEmit` EXIT 0 (zero `error TS`) + `next build` 15.3.5 EXIT 0 (genuine "Compiled successfully", route tables, static generation; ~292s total, avg ~14.6s/app). RN 2/2 `tsc --noEmit` EXIT 0 + `expo export --platform web` EXIT 0 (real Metro bundles, 4435/4397 modules, ~8MB JS, dist/ emitted). Tests: every app 20-44 real passing tests, 0 failures. Gate teeth proven: injected TS2322 into admin-app -> EXIT 2; reverted -> EXIT 0.
- **D2:** Browser (Chrome MCP) verified 11 apps on ports 4101-4111 with `NEXT_PUBLIC_USE_MOCK=true`. Concrete renders: admin dashboard (74 tenants / 12,480 users / 99.94% uptime, region table, SEV1-4 incidents, audit timeline); personal-shop order-10428 (line items, tracking, totals math); business-automation 7 recipes w/ action chains; front-office scheduling board; hosted-login security dashboard (82/100). `resolveSession()` seeds a platform-admin session under mock so no app bounces to the live IdP.
- **D3:** 20/20 web `--accent` distinct on a full hue-wheel rotation (admin #ad1a1a -> ... -> workflow-designer #ad1a41); both RN distinct (clinician #7c3aed, patient #2563eb). Lucide is functionally ZERO (no dep, no import; only ui-kit backward-compat TYPE aliases remain). Fixed-px PASS everywhere (nav icons numeric, defaults 18px). Fails ONLY on the 2 entity glyphs.
- **D4:** `pkce.ts` (S256, base64url(SHA-256(verifier))) + `login/route.ts` + `callback/route.ts` (state-validate-before-exchange, verifier sent, PKCE cookies cleared) byte-identical across all 20 Next apps (builder-studio differs only in landing redirect). `client_secret` server-only; session cookie httpOnly. `mockEnabled()` hard-returns false when `NODE_ENV==="production"` in all 19 standard web apps. The 2 native apps have NO such guard.
- **D5:** Adversarial grep found ZERO real stub markers (237 raw hits collapse to false positives: kanban "todo" enum, documented asset placeholders, ~20 legit `return null` guards). Signature surfaces verified by reading source: personal-tasks HTML5 DnD kanban + zustand store; workflow-designer 50-step undo/redo node-graph; builder-studio GrapesJS + Zod-introspecting SchemaForm; personal-shop cart-store + 3-step checkout; personal-notes 243-line dependency-free markdown parser.
- **D6:** Strong shared foundation (`@curaos/ui-kit`: `<nav aria-label="Primary">`, aria-current, IconButton requires aria-label, visible box-shadow focus ring on `.cura-*`, shared QueryState triad). Binding no-em/en-dash rule HOLDS (zero U+2014/U+2013). No committed secrets. Fails on i18n adoption + builder-studio outlier + app-authored `all:unset` focus gap.
- **D7:** `mockEnabled()` flip real + consistent (NEXT_PUBLIC_* web, EXPO_PUBLIC_* RN, builder-studio its own NEXT_PUBLIC_BUILDER_API). `api-client` test-proven: `bun test` 7 pass / 0 fail incl. a test asserting `configureRestClients` propagates base URL to all 12 hey-api SDK clients. `configureApiClient()` invoked in every Providers.tsx / _layout.tsx. `adminRequest()` mock-first then real fetch with bearer + 8s timeout (present in 21/22 apps). Session JWKS-verifies the id_token, fails closed.

---

## 3. Enumerated Gap List (what is NOT done, actionable)

### D3 design-icons (2 code violations)
1. **`admin-app/app/dashboard.tsx:118-119`** uses `&#9632;` (U+25A0 BLACK SQUARE) x2 as chart legend markers ("requests" / "errors"). Replace with a Phosphor swatch/dot `<Icon>` or a styled CSS box; remove the entity.
2. **`personal-donation/src/ui/give-flow.tsx:237`** uses `&#10003;` (U+2713 CHECK MARK) at `fontSize:28` as the gift-success glyph. Replace with `<Icon name="success" size={28} />` (or `name="check"`).
3. **(hygiene, harmless)** `packages/ui-kit/src/index.ts:34-36` still exports backward-compat type aliases `LucideIconProps`/`LucideIcon`/`LucideProps` (alias Phosphor types; no lucide dep/import). Rename/drop to make the codebase literally zero-lucide.
4. **(CI-guard gap)** A "zero Unicode-glyph icon" guard MUST scan HTML entities `&#NNNN;` / `&#xNNNN;`, not just literal codepoints (U+25A0-25FF / U+2300-27BF) - the literal scan missed both violations above.

### D4 auth-pkce (native PHI mock-leak; the dimension's hard failure)
5. **`patient-app` + `clinician-app` (`src/api/mock-data.ts`)** `mockEnabled()` returns true whenever `EXPO_PUBLIC_API_BASE_URL` is unset, with NO `__DEV__`/`NODE_ENV`/release-channel hard-off. A production native build with a missing/typo'd API base silently seeds a `roles:[platform-admin]` session (`src/auth/session.ts` `mockSession()`) and serves mock PHI. Commit `dd2ca09` (web prod hard-off) explicitly scoped out native. Fix: add `if (!__DEV__) return false;` (or `EXPO_PUBLIC_ENV`) at the top of `mockEnabled()` in both apps AND fold it into the RN codegen emitter (generator-evolution rule) so future native apps inherit it.
6. **`patient-app` + `clinician-app` PKCE unverified:** no `app/login` PKCE-start, no `/api/auth/callback`, no `pkce.ts`; they use `@curaos/auth-sdk` + `expo-secure-store`, and `session.ts` notes the SDK "does NOT expose a JWKS/JWT verifier" so the token is only decoded (`decodeJwtClaims`, no signature verification) client-side. Confirm/document where the native code_verifier/S256 challenge is minted (OS browser + auth-sdk deep-link flow) so the PKCE guarantee is auditable; the native PKCE proof is currently absent.
7. **Native unverified-claim role gating:** native session decodes the JWT without signature verification and trusts `rolesFromClaims` straight from the payload; in-app privileged controls key off claims a tampered local SecureStore token could forge. Acceptable only if every privileged action is independently re-authorized server-side - document/test that assumption.
8. **(minor, no v1 fix)** Callback `state` compare is non-constant-time (`storedState !== returnedState`) - acceptable for an opaque CSRF state.
9. **(minor, polish)** `readJwtCookie()`/`getAuthToken` reads `document.cookie` for `curaos_jwt` but the cookie is httpOnly, so it always returns undefined client-side (real auth rides `credentials:'include'`). Dead path; remove or document as intentionally inert.

### D6 a11y-i18n-quality (systemic quality polish)
10. **i18n single-locale + hardcoded copy:** 18/20 web apps use a thin `LocaleProvider` hardcoded to `Locale="en"` with a 13-key common JSON stub, no RTL, no second locale; screen copy hardcoded English in JSX. Only `admin-app/src/i18n/messages.ts` ships a real typed en+ar (RTL via `setDir`+`document.dir`) bundle. Action: promote `admin-app`'s pattern into the codegen template (typed bundle + ar/RTL) and externalize screen copy.
11. **`personal-tracking` barely uses its i18n seam:** only 1/19 tsx files (`QueryState.tsx`) calls the hook; `QuickLog.tsx`/`dashboard.tsx`/`goals-board.tsx`/`calendar-view.tsx` hardcode "Done"/"On target"/"Today"/"Goals"/"This week" etc. Route screen text through the bundle.
12. **`builder-studio` has NO i18n at all** (no provider, no messages dir/module). Add the standard i18n seam.
13. **`builder-studio/.gitignore`** lacks any `.env` pattern (`git check-ignore .env.local` returns NOT-IGNORED, so a real `.env.local` could be committed) AND lacks the `.env.local.example` template all 23 other apps have. Add `.env*.local` (or `*.local`) to `.gitignore` + add `.env.local.example`.
14. **Focus-visibility gap (WCAG 2.4.7):** ~38 app-authored `<button style={{all:"unset"}}>` across the sample (admin-app 7, personal-tracking 9, fleet-manager 7, business-site 9, business-shop 4, ...) strip the focus outline, and no app `globals.css` defines a global `*:focus-visible` ring (`@curaos/ui` styles only scope focus to `.cura-*`). Add a global `:focus-visible` fallback in app `globals.css` or `@curaos/ui` base styles, or route these through ui-kit `Button`/`IconButton`.
15. **`builder-studio` lacks the shared loading/error/empty triad** (0 state components, only ad-hoc inline `<p class="empty">`). Adopt the shared `QueryState` pattern or document why the SSR builder canvas differs.
16. **(polish, NOT a binding-rule failure)** 18 apps ship U+2026 ellipsis in `common.loading` ("Loading...") and `personal-tracking/src/ui/QuickLog.tsx:270` uses U+2212 minus as a button label. Outside the binding em/en-dash gate (U+2014/U+2013 only) but counter to the ASCII-punctuation preference; consider "Loading..." (3 dots) and ASCII "-".

### D7 live-wiring-readiness (1 code gap + documented partials)
17. **CODE GAP - `personal-notes` derived reads:** `useNotebookStats`, `useTags`, `useNotesOverview` (`src/notes/hooks.ts`) read ONLY the zustand seed store (`useNotesStore`), never the live query. Even with the API base set, dashboard overview tiles + tag rail + notebook counts render SEED data. Fix: drive derived hooks from live `useNotes`/`useNotebooks` results (or hydrate the store from `adminRequest`) when `!OFFLINE`.
18. **CODE GAP - `personal-notes` writes:** note mutations (create/edit/pin/archive/delete) write to the zustand store only (`store.ts` has 0 `adminRequest` calls; no POST/PATCH/DELETE in `src/notes`). No live write path in any mode, so writes never reach `personal-notes-service` even when wired. Fix: route store mutations through `adminRequest` writes when mock is off (the pattern `admin-app` already uses).
19. **(documented partial, not a blocker)** `@curaos/auth-sdk` is still a stub (no client) per `service-clients.ts`; tokens are injected via the `getAuthToken` hook so data fetching works, but the planned auth-sdk session reader is unshipped. `audit-sdk` intentionally excluded (server SDK).
20. **(documented partial, expected pre-v1)** GraphQL data plane ships client wiring (Apollo + Cosmo Router) + a smoke query only; the federated supergraph schema is a later phase. No app consumes GraphQL for live data (REST via `adminRequest` is the live path).
21. **(architecture note, works)** Apps deliberately do NOT use the generated SDK typed hooks or `api-client`'s `CuraQueryProvider`; they import `useQuery` directly and fetch through local `adminRequest` (same `apiBaseUrl()`). The SDK typed-hook surface is wired+exported but largely unused at runtime. Both paths point at the same gateway, so live wiring works.

### D1 build-test (latent gate weaknesses; not current failures)
22. **`builder-studio`** is the ONLY app whose test script is plain `bun test --isolate` (no `--pass-with-no-tests`); the other 21 use `--pass-with-no-tests`, so a future regression deleting all tests would still report green for those 21. Moot today (every app has 20-44 real tests) but the gate would not catch test-suite emptiness for 21/22.
23. **Test depth shallow-to-moderate** (20-44 tests/app); proves build+typecheck+unit-green, not functional/E2E coverage. No coverage thresholds enforced by `test`.
24. **RN native export unproven:** the RN `export` script targets `--platform ios`; this gate ran `--platform web`. If native (iOS/Android) packaging is a v1.0 requirement it is unproven.
25. **Lint not asserted:** `next build` runs lint+typecheck internally, but oxlint/expo-lint as standalone gates were out of scope; lint cleanliness is not asserted.

### D2 render-offline (method + robustness)
26. **CI render gate MUST use a headless browser, not curl.** Screens are `"use client"` + TanStack Query against an in-process mock layer AFTER hydration, so SSR HTML from curl contains a loading skeleton ("Loading" KPI labels + Spinner), NOT seeded rows. Curl proves only 200/no-redirect/no-500.
27. **`next.config.mjs` empty-string crash (19/22 apps):** they do `new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? fallback)` (nullish only). Exporting `NEXT_PUBLIC_API_BASE_URL=` (empty) does NOT trigger the fallback and crashes at config load with `TypeError: Invalid URL` BEFORE any render (reproduced on admin-app). The documented offline path (leave unset) works; a naive runner that sets it empty bricks startup. Fix: guard with `|| fallback` or trim/empty-check. Affected: all apps except the 2 RN + builder-studio variant.
28. **Coverage gap (scope choice, not failure):** 11/22 apps were browser-verified; the other 11 (incl. `clinician-app` + `patient-app` PHI surfaces, highest correctness risk) share the identical mock architecture but were NOT browser-rendered this pass - inference, not proof. A full v1.0 gate should browser-render all 22.
29. **Error/empty states wired but not visually verified** (e.g. mock 404 detail routes `MOCK_NOT_FOUND` -> deterministic 404 in `admin-fetch.ts`); detail screens for ids absent from seed may render error/empty rather than content.

### D5 depth-real (depth distribution, acceptable for v1)
30. Depth is concentrated in ONE signature surface per app; most web apps also ship a tail of generic codegen-scaffold CRUD quartets (`*-list`/`*-form`/`*-filters`/`*-detail`) for secondary domains. Acceptable for v1 but "every screen" is not uniformly deep.
31. `personal-site/app/dashboard.tsx` is a thin 2-tile KPI summary (lighter than peers); acceptable since the signature surface is the studio page-editor.
32. All interactive state is session-local/mock-first (zustand seeded from offline seed; cart localStorage). Real interactivity but NOT backed by a live backend offline - "persisted" claims depend on the live-API wiring (the D7 path), which is the genuine blocker.
33. `builder-studio` depth is delegated to GrapesJS (26 hand-handlers vs 70-170 peers) + a `grapesjs-react` CJS/ESM interop shim noted in-source as a prior runtime crash - worth a runtime smoke test, not just static inspection.
34. RN apps use hand-rolled `@curaos`-parity ui primitives (`src/ui`) rather than shared `@curaos/ui`; deep but a separate UI stack - confirm parity expectations if cross-app uniformity matters for v1.0.

---

## 4. Buildable-Now vs Infra-Blocked (M16 deploy)

### Buildable now (code-only; no infra dependency)
- **[D3]** Replace `admin-app` `&#9632;` legend markers (`dashboard.tsx:118-119`) with Phosphor/CSS swatch.
- **[D3]** Replace `personal-donation` `&#10003;` success glyph (`give-flow.tsx:237`) with `<Icon name="success">`.
- **[D3]** Drop/rename ui-kit `Lucide*` backward-compat type aliases; add HTML-entity scan to the icon CI guard.
- **[D4]** Add `if (!__DEV__) return false;` prod hard-off to `mockEnabled()` in `patient-app` + `clinician-app` AND fold into the RN codegen emitter. (Highest-priority buildable fix - it is a production PHI auth-bypass.)
- **[D4]** Document/wire the native PKCE seam (auth-sdk deep-link) so the native PKCE guarantee is auditable; document server-side re-authorization of privileged native actions.
- **[D6]** Promote `admin-app`'s typed en+ar/RTL i18n bundle into the codegen template; externalize hardcoded screen copy (start with `personal-tracking`).
- **[D6]** Add the i18n seam to `builder-studio`; add `.env*.local` to its `.gitignore` + `.env.local.example`; adopt the shared `QueryState` triad.
- **[D6]** Add a global `:focus-visible` fallback in `@curaos/ui` base styles (fixes ~38 `all:unset` buttons at once).
- **[D7]** Route `personal-notes` derived hooks (`useNotebookStats`/`useTags`/`useNotesOverview`) + all note mutations through the live `adminRequest` path when mock is off.
- **[D1]** Normalize `builder-studio` test script to `--pass-with-no-tests` for parity (or add an explicit non-empty assertion); optionally add coverage thresholds.
- **[D2]** Harden `next.config.mjs` URL parsing (`|| fallback` / empty-check) so an empty API-base env does not brick startup; switch CI render gates to a headless browser.
- **[D2]** Browser-render the remaining 11 apps (esp. `clinician-app` + `patient-app`) to convert inference to proof.

### Infra-blocked (requires M16 cluster; no code change needed)
- **[D7]** Running **APISIX REST gateway** reachable at the public API base, fronting the ~12 backend services (calendar, clinical-doc, encounter, notify, orders, reports, scheduling, search, settings, storage, tasks, terminology) plus domain services the apps call (shop/orders/notes/etc.).
- **[D7]** Reachable **OIDC issuer** (Pocket-ID, default `https://auth.example.com`) publishing `/.well-known/jwks.json` so server-side session verification succeeds.
- **[D7]** Dedicated endpoints for `builder-studio` (`NEXT_PUBLIC_BUILDER_API`) and the HealthStack patient-contract service (`NEXT_PUBLIC_HEALTHSTACK_PATIENT_API`).
- **[D7]** `EXPO_PUBLIC_*` equivalents wired for the 2 RN apps.
- **[D7]** (later phase) Federated GraphQL supergraph schema behind the Cosmo Router (client wiring already shipped; not on the v1 critical path - REST is the live path).
- **[D1]** (if in v1 scope) RN native iOS/Android packaging verification - requires native build infra/signing, not exercised by the web export gate.

---

## 5. Verdict

**Is the v1.0 frontend "fully functional" (mock-first, code-complete)? YES, with 4 must-fix code defects, one of which is a security fix.**

- **Build, render, depth, and live-wiring code paths are real and proven.** All 22 apps build, typecheck, and pass real tests (D1 PASS); the verified spread renders genuine seeded content in a real browser fully offline with no IdP bounce (D2 PASS); every app carries a genuine deep signature surface with wired mutations, zero stubs (D5 PASS); the mock-off flip and the full live chain (config -> mockEnabled -> real fetch / `configureRestClients` with OIDC bearer) are wired and test-proven (D7 code path correct for ~20 apps).
- The product is a **fully functional, demonstrable, mock-first frontend today.** It is NOT yet "fully shipped".

### What remains for "fully shipped"

**A. Must-fix code (buildable now, blocks a clean v1):**
1. **(security, P0)** Native mock prod hard-off in `patient-app` + `clinician-app` - closes a production PHI auth-bypass (D4).
2. **(correctness)** `personal-notes` live derived-reads + write path - otherwise this app silently ignores the backend (D7).
3. **(design rule)** Remove the 2 Unicode-glyph entity icons in `admin-app` + `personal-donation`, and add the HTML-entity icon CI guard (D3).
4. **(quality/NFR)** Close the i18n adoption gap (multi-locale + RTL via the codegen template; externalize hardcoded copy), the global `:focus-visible` ring (WCAG 2.4.7), and the `builder-studio` triple-outlier (i18n seam + `.env` gitignore/example + QueryState triad) (D6).

**B. Infra (M16 deploy, no code change):** running APISIX gateway + reachable Pocket-ID OIDC issuer (JWKS) + builder/healthstack-patient endpoints + RN `EXPO_PUBLIC_*` env. Once these land, the proven live-wiring path lights up end-to-end.

Net: **3 clean PASS (D1/D2/D5)**, **3 FAIL concentrated in 4 apps + one systemic quality dimension (D3/D4/D6)**, and **D7 is one app-side code gap (`personal-notes`) away from being purely infra-blocked.** None of the failures undermine the "fully functional mock-first" claim; they are the precise, enumerated worklist between "functional" and "shipped".
