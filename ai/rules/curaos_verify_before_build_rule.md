---
name: curaos-verify-before-build-rule
title: Verify-before-build / build-once-promote (runtime behavior proven locally BEFORE any image build or deploy)
description: BINDING - no container image is built and nothing is deployed to a cluster until the running app's BEHAVIOR is proven locally green; the existing 5-tier static gates ([[curaos-quality-gates-rule]]) prove the code lints/typechecks/unit-tests, this rule adds the missing layer - the built app must RENDER + ROUTE + show data + be fully localized when actually run, asserted by headless smoke (Playwright webServer over `next build`+`next start` for web / `@nestjs/testing`+Supertest in-process for services) + an i18n-coverage gate (eslint-plugin-i18next no-literal-string + i18next-cli translation-status key-parity + i18next-pseudo render assertion) BEFORE the image build step; generators are proven by golden-snapshot tests of emitted output + a "one representative emitted app passes the full local gate" check (first-article inspection - never build/deploy all N to discover a mold defect); BUILD-ONCE-PROMOTE - one verified immutable artifact referenced by @sha256 digest is promoted across envs, never rebuilt per env; on a single swap-bound build host this is doctrine not preference (a wasted serial image build costs hours); FORBIDDEN - build-deploy-discover-repeat (shipping to live to find bugs), rebuilding the same source per environment, marking FE/UI work "done" on pod-health/HTTP-200/curl instead of rendered-behavior proof
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1aad500f-cfd0-44b5-b258-a203e23508e9
---

User directive (2026-06-22, after repeated build-deploy-discover churn): "why cant you fucking confirm test and fix everything before we start building and trying to push and build live" + "make sure we never face this shit again ... make everything testable and highest quality and fastest shipping". Grounded in researched best practices (Test Pyramid / Fowler; DORA-Accelerate; shift-left-on-k8s; artifact-promotion; Turborepo --affected; generator golden-snapshot; i18n no-literal-string + key-parity + pseudoloc; Playwright webServer-over-next-build). Composes with + does NOT replace [[curaos-quality-gates-rule]] (static 5-tier), [[curaos-local-ci-first-rule]] (`just ci` merge gate), [[curaos-verification-stack-rule]] (T1/T2/T3), [[curaos-generator-evolution-rule]] (mold-first).

## The rule (BINDING)

A container image build and any cluster deploy are the LAST step, gated behind locally-proven runtime behavior. The order is fixed:

1. **Fix in source** (generator-first per [[curaos-generator-evolution-rule]]).
2. **Static gates** (the existing 5-tier per [[curaos-quality-gates-rule]] / `just ci`): lint, typecheck, unit, regen-diff. Proves the code is well-formed.
3. **Runtime behavioral gates (THIS rule - the missing layer): prove the RUNNING app does what it must, locally, with no image build and no cluster.**
4. **Build the artifact ONCE** - only after 2+3 are green. Capture its `@sha256` digest.
5. **Promote the same artifact** across envs by digest. Never rebuild per env.

"Done" for any FE/UI or data-rendering change requires step 3 evidence (a green render-smoke + i18n-coverage report), NOT pod `Ready`, NOT HTTP 200, NOT a curl status code. A 200 that renders an empty menu, mock data, or untranslated text is a FAIL.

## Runtime behavioral gates (run locally, before build)

| Gate | What it proves | How (named tools) | Enforce |
|---|---|---|---|
| Web render-smoke | App boots, routes resolve, nav/menus render, real data loads, no console errors | Playwright `webServer` running `next build && next start` (`reuseExistingServer: !CI`); MSW mocks the API so no backend/Docker needed | `bun run smoke:<app>` green before image build; wired into `just ci` web tier |
| Service behavior | Handlers return repo-backed data (not stub/echo), DI graph boots, auth gates | `@nestjs/testing` Testing Module + Supertest in-process (no live server, no Docker) | service `bun test` integration tier green |
| i18n no-literal | Zero hardcoded user-visible strings in JSX (the exact bug that shipped) | `eslint-plugin-i18next` `no-literal-string` rule in each app's ESLint config | lint tier fails on any literal |
| i18n key-parity | Every locale bundle has every key the default locale has | `i18next-cli translation status --fail-on-missing` (i18next-parser is DEPRECATED Sept-2025) | CI step fails on missing key |
| i18n applied | Switching locale actually translates (no source-key/English leakage) | `i18next-pseudo` env + Playwright assertion that rendered text != source key AND (for ar) no Latin-script in visible nodes | render-smoke sub-assertion |
| i18n undefined-key | Every `t('key')` references a key that exists | `eslint-plugin-i18next-no-undefined-translation-keys` | lint tier |

## Generator first-article inspection (prove the mold, not every casting)

Per [[curaos-generator-evolution-rule]] the generator is the source of truth, so PROVE THE GENERATOR, not each emitted app:

- **Golden-snapshot tests** of emitted output: `generator.run(fixture)` -> prettier-normalize -> `toMatchSnapshot()` (one fixture per variant). A failing snapshot = a mold defect caught before any service/app is emitted. (Smithy/OpenAPI-codegen pattern.)
- **One-representative-passes-full-gate**: regenerate ONE representative app + run the full step-2+3 local gate suite on it. If the representative is green, the mold is green; do NOT build/deploy all N to discover a defect. Build all N only as the final promote step.
- The generator's emitted screens must contain NO bare English literal (assert in the generator unit test: emitted `.tsx` has no user-visible string outside `messages.*`). This is the gate that would have caught the i18n literals.

## Build-once / promote

- One `bun`/`docker build` produces ONE image; reference it by `image@sha256:<digest>` (tags are mutable; digests are stable) per [[curaos-version-pinning-rule]].
- Promote that exact digest across envs (k3d local -> staging -> prod). NEVER rebuild the same source per env (rebuild introduces dependency/cache/network drift).
- For local verify-and-promote without GHCR: `k3d registry create` (built-in local registry) - tag, push, reference; no remote-registry dependency for the verify loop.
- On the single swap-bound build host (one docker build at a time, ~minutes each) this is doctrine, not preference: a build kicked off before step-3 is green can cost hours of serial rebuild. Stop the wave the moment a source defect is found; fix + re-verify; build once.

## Live online proof after promote

After the verified artifact is promoted, "fully working online" is a separate evidence gate. Do not collapse it into pod readiness, image tag checks, or an HTTP 200.

Minimum live evidence for an affected web/API path:

1. Cluster rollout proof: intended image tag or digest, ready replicas, no new crash loops.
2. Public route proof: `https://api.../api/v1/<domain>` reaches the owning service. For protected APIs, unauthenticated status should be the service auth gate, usually 401. A 404 such as `Cannot GET /` is an ingress or rewrite failure.
3. Authenticated token proof: public API and the app server proxy both return the expected real-data shape using a real SSO session or short-lived in-cluster token. Never print tokens or signing secrets.
4. Browser proof: browser shows authenticated app content with a user marker and DB-backed data. If the browser stops at Pocket ID/OIDC, record that as an auth-blocked browser sweep and do not claim full online verification.
5. Post-sweep logs: target app and service logs checked after the request. Known unrelated noise must be named separately from current route failures.
6. Sign-in invariant: every affected OIDC app must prove the built/deployed `/login` redirect uses the live Pocket-ID client id (`client_id=curaos-app`) and the correct public callback URL (`https://<app-host>/api/auth/callback`). This is mandatory even when APIs pass. Direct `process.env.NEXT_PUBLIC_*` reads in server routes are forbidden because Next can inline them at build time; server routes must read runtime env through a server-only/dynamic helper, and the regression must build or simulate a stale baked `NEXT_PUBLIC_OIDC_CLIENT_ID` to prove runtime config wins.

Banned live claims:

- "Fully online" when the browser only reached OIDC/Pocket ID.
- "API works" when the public host returned a gateway/ingress 404 instead of the service's auth gate or data response.
- "Deployed" when local-only images were built but not imported into every k3d/kind node that may schedule the pod.
- "Sign-in works" when only an old browser tab is inspected. Fresh `/login` redirect proof must show the current client id and callback from the deployed artifact.

## Fast shipping (gates ENABLE speed, per DORA)

Quality gates and speed are NOT in tension (Accelerate/DORA): trunk-based dev + small batches + fast automated gates -> high deploy frequency AND low change-failure-rate. Keep gates fast or they get bypassed:

- Tier the gates by latency (shift-left-on-k8s): pre-commit < 30s, pre-push/PR < 2min, merge < 5min, rest async. A 90s pre-commit gets disabled by Friday.
- `turbo run lint typecheck test --affected --filter=...[origin/main]` - run only what changed; content-addressed cache makes unchanged packages near-free (define `outputs` in turbo.json correctly or caching is silently disabled).
- Manifest lint at commit time (kubeval/conftest), not at apply time.

## N-language readiness

Message catalogs must be structured so adding the Nth language = drop ONE bundle file per app + edit ONE shared locale registry. The current per-app duplication of `Locale` union / `LOCALES` / `LOCALE_DIR` / `LOCALE_LABEL` / `RTL_LOCALES` (enumerated ~10-12 places/app) is a defect: centralize the locale registry (one module the generator emits + every app imports) so a new language ripples through one edit, not 22 apps x 5 files.

## Top-10 gates a solo maintainer adopts first (research-ranked by bug-prevention / cost)

1. `turbo run typecheck --affected` as pre-push hook.
2. `eslint-plugin-i18next` `no-literal-string` in ESLint config.
3. `next build` + Playwright `webServer` render-smoke - the gate BEFORE any Docker build.
4. Generator golden-snapshot tests (`bun test` + prettier-normalize + `toMatchSnapshot`).
5. `i18next-cli translation status --fail-on-missing` key-parity in CI.
6. `@nestjs/testing` + Supertest in-process service integration tests (no Docker).
7. Correct `outputs` in every `turbo.json` task (else cache disabled).
8. `i18next-pseudo` + Playwright assert-translation-applied.
9. Image `@sha256` digest pinning in Helm/k3d (promote, never re-tag).
10. `eslint-plugin-i18next-no-undefined-translation-keys`.

## Banned (each caused real waste this session)

- Build-deploy-discover-repeat: deploying to a live cluster to find bugs that a local render-smoke would have caught.
- Rebuilding the same source per environment instead of promoting one digest.
- Calling FE/UI/data work "done" on pod-Ready / HTTP-200 / curl-code without a rendered-behavior + i18n-coverage proof.
- `i18next-parser` (deprecated 2025-09; use `i18next-cli`).
- Hardcoded user-visible string literals in any emitted or bespoke JSX (route through `messages.*`).
- Hardcoded locale enumerations duplicated per app (centralize the locale registry).

## Sources

martinfowler.com/articles/practical-test-pyramid.html; dora.dev (trunk-based-development, four keys); thenewstack.io/shift-left-testing-applied-to-kubernetes; oneuptime.com artifact-promotion; turborepo --affected + remote cache (engineering.mercari.com 2026); playwright.dev/docs/test-webserver; nextjs.org testing; npm eslint-plugin-i18next / i18next-cli / i18next-pseudo / eslint-plugin-i18next-no-undefined-translation-keys; github.com/smithy-lang/smithy-typescript (codegen snapshot); github.com/jmcdo29/testing-nestjs; k3d.io registries.
