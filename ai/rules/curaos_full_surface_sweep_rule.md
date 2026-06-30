---
name: curaos-full-surface-sweep-rule
title: Full-surface sweep (every page/view/action + real-API proof + docs/marketing alignment), local and live
description: Full-surface sweep - every page, view, action, and data render in every CuraOS app or site must be proven against real backend API responses locally and live, with docs and marketing kept aligned.
status: binding
version: 1
owner: workspace
applies_to: every CuraOS frontend app + site, local verification AND live deployment
related:
  - "[[curaos-verify-before-build-rule]]"
  - "[[curaos-demo-sample-data-rule]]"
  - "[[curaos-verification-stack-rule]]"
  - "[[curaos-doc-graph-rule]]"
  - "[[curaos-design-generation-rule]]"
---

# Full-surface sweep rule (binding)

User directive (2026-06-28): a deployment is NOT verified by loading one landing page. EVERY page, EVERY view, EVERY action of EVERY app and site must be exercised, and every data render must be PROVEN to come from a real backend API call (a real `/api/proxy/*` -> gateway -> service response with a real DB-backed payload), NOT a mock, a fixture, or static/fake HTML. This holds for LOCAL verification and for LIVE (post-deploy) verification, and AUTOMATICALLY extends to anything added in the future. The public docs site and marketing site must stay aligned with the newest additions and with live reality.

This rule is the LIVE/behavioral counterpart to [[curaos-verify-before-build-rule]] (which proves a built app renders before the image is built). This rule proves the RUNNING fleet's entire surface is real, every time, and never drifts as apps/routes/actions are added.

## 1. Coverage predicate (what "swept" means)

For EACH frontend app + site (the set is derived at runtime, never hardcoded - enumerate from `frontend/apps/*` + the api-gateway public-host list + the website/docs hosts; new apps are covered automatically):

1. **Every page / route**: visit every nav route + every reachable sub-route (list -> detail -> nested), not just the landing/overview.
2. **Every view state**: empty, populated, loading-resolved, error; tab switches; filters; pagination; search; locale (incl. RTL/Arabic) + dark mode.
3. **Every action**:
   - **Read actions** (filters, sort, tab, open-detail, expand): always exercised.
   - **Write actions** (create/update/delete/submit/approve/publish): exercised against SYNTHETIC, watermarked demo data ([SYNTHETIC-DEMO]) per [[curaos-demo-sample-data-rule]]; never against real PHI/PII; destructive writes (delete/irreversible) are confirmed with the user before firing in a shared/live env.
4. **Real-API proof (the core assertion)**: for every view that shows data and every action, capture the network calls and assert each data call is a real `/api/proxy/<service>/<path>` (or direct gateway) request returning **2xx with a real, DB-backed payload**. FAIL the sweep if any rendered data came from: a mock layer (`mockEnabled()`/`NEXT_PUBLIC_USE_MOCK`/`CURAOS_TEST_MOCKS`), a static/fixture JSON, hardcoded HTML, or a 4xx/5xx the UI silently swallowed. "Looks populated" is not proof; the network call + payload is.
5. **No silent failure**: a panel that spins forever, shows a skeleton indefinitely, renders an error overlay, or bounces to /login is a FAIL (e.g. the api-proxy CDN-hairpin 504, the missing broker-JWT env bounce - both real faults this rule's sweep caught on 2026-06-28).

## 2. Local sweep (pre-deploy gate)

Run the canonical Playwright live-backend sweep with mock OFF against the local gateway + dev-auth cookies: `ops/dev/local-stack/local-jwt-sweep/sweep.spec.mjs` (per app), which already asserts: not bounced to /login, status < 400, no Next error overlay, body not empty, not stuck on Loading, data-layer no 5xx. EXTEND it so it walks every route + exercises read + (synthetic) write actions + asserts each data response is a real gateway call (URL shape + non-mock payload), for every app. Mock mode is unit/CI-only and must hard-fail in any local-live or deploy context ([[curaos-demo-sample-data-rule]]).

## 3. Live sweep (post-deploy gate)

After any deploy (and on demand), sweep the LIVE fleet through the real ingress/CDN with a real authenticated session (live-secret JWT cookie for headless; or an operator-signed-in browser for OIDC/passkey apps). Per app, per route, per action: assert 2xx real-API payloads, no mock, no 504/blank/login-bounce. The pod/deploy-config check (image present on all nodes, correct env, hostAlias/upstream) is necessary but NOT sufficient - the browser-through-CDN render is the proof. Record per-app PASS/FAIL with the failing route + network evidence.

## 4. Future additions are covered automatically

The app/route/action set is ENUMERATED at sweep time, never a static list:
- apps from `frontend/apps/*` (+ native) and the api-gateway public-host set;
- routes from each app's emitted route tree;
- actions from each view's interactive surface.
A newly generated app, route, or action is in-scope the next sweep with no rule edit. gen:ui-app emits the per-app sweep spec so generated apps ship their own coverage. A new backend domain/route added to the gateway is covered because the apps that call it are swept end to end.

## 5. Docs + marketing alignment (same trigger)

Whenever apps/services/routes/capabilities are added, changed, or removed, the **docs site** (`curaos-docs-site`) and **marketing site** (`curaos-website`) are updated in the SAME change to reflect the newest additions AND live reality: counts (apps, routed services, capabilities), service/app catalogues, capability descriptions, screenshots, and any "live now" claims. Numeric/claim drift (e.g. stale app/service counts) is a sweep FAIL. The docs site's API reference auto-regenerates from source (TypeDoc) on build; the hand-written pages + marketing copy are updated by hand and verified against the live fleet. No app/service/capability ships without its docs + marketing reflection. (See the 2026-06-28 count refresh: website/docs app+service counts realigned to live.)

## 6. Evidence + gate

The sweep produces per-app evidence (route, action, network call URL + status + real-payload assertion, screenshot) and a fleet PASS/FAIL summary. A deploy is "fully functional / zero-fault" ONLY when the live sweep is green across every app + site, every page, every action, with real-API proof - not on pod-health, HTTP-200-on-root, or a single dashboard. This is the closing gate of the zero-fault definition, composed with [[curaos-verify-before-build-rule]] (pre-build) and [[curaos-verification-stack-rule]] (T1/T2/T3).

## Anti-patterns (forbidden)

- Declaring an app/fleet verified after loading only its landing page.
- Treating "the page rendered something" as proof without confirming the network call was a real backend 2xx (mock/fixture/static HTML masquerading as live data).
- Shipping an app/service/route without updating docs + marketing to match.
- Hardcoding the app/route list so new additions silently escape the sweep.
- Marking FE work done on pod-health/curl/HTTP-200 instead of rendered-real-data-with-API-proof.
