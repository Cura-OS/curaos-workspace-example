# ADR-0220: Frontend config is runtime-injectable (one image, all settings at deploy/run time)

Status: Accepted (2026-06-29)
Target Version: v1.1
Extends: ADR-0218 (frontend Helm chart deploy), ADR-0216 (web app-fleet build-out), ADR-0219 (frontend functional-parity program), ADR-0215 (version-gated planning).
Tracking: epic GitHub #725 (v1.1 GA-Hardening) child set; research `ai/research/2026-06-29-runtime-config-injection/nextjs15-runtime-config-k8s.md`.

## Context

CuraOS ships ~21 Next.js 15 (App Router, `output: standalone`) web apps as Docker images deployed to k3d/k8s via per-app Helm charts (ADR-0218). Today a meaningful slice of each app's configuration is BAKED at `next build` time, so a single image cannot be reconfigured per environment or per host without a rebuild:

- `NEXT_PUBLIC_*` (API base URL, app URL, OIDC issuer/client/scope) are string-inlined into the client bundle at build.
- `next.config.mjs` reads `process.env` at config-load time to construct `experimental.serverActions.allowedOrigins` and the CSP `connect-src`; these are frozen into `.next/required-server-files.json` and the standalone server NEVER re-runs `next.config.mjs` (it loads the frozen config via `__NEXT_PRIVATE_STANDALONE_CONFIG`).

The acute v1 fault: behind Cloudflare -> Caddy -> ingress -> pod, the pod sees `x-forwarded-host = <app>.curaos.local` while the browser `origin = <app>.example.com`. Next's Server Actions same-origin guard aborts every action ("Invalid Server Actions request") unless the public host is in the build-baked `allowedOrigins`. v1.0 mitigates this with a targeted build-arg fix (ARG/ENV `CURAOS_PUBLIC_HOST` + `CURAOS_INTERNAL_HOST` before `RUN bun run build`). That keeps the build-bake; it does not remove it. Per-environment/per-host changes still require a rebuild, violating build-once-run-anywhere (12-factor).

Backend services are already runtime-config-correct (env + Helm ConfigMap/Secret, read at request time). Frontend server-side code is also already correct (bracket-notation `process.env[name]` + fallback chains + ConfigMap). The gap is the CLIENT bundle and the frozen `next.config.mjs`-derived values.

## Decision

All frontend configuration and settings become runtime-injectable. One image per app, every setting supplied at deploy/run time via ConfigMap/Secret/env. Emitted by the `gen:ui-app` generator so all 21 apps get identical wiring from the mold (generator-evolution rule), never per-app hand edits.

1. Client public config -> runtime injection via a server-rendered `window.__ENV` inline `<script>` (request-time), surfaced to client code through `next-runtime-env` and the generated `src/env.ts` runtime accessor. `next-runtime-env` is the v1.1 implementation choice, pinned and regression-tested on Next 15.3.5. Client call sites migrate `process.env.NEXT_PUBLIC_X` -> the runtime accessor.
2. `serverActions.allowedOrigins` -> ELIMINATED via proxy header alignment. FE app routes use APISIX `ApisixRoute` with the `proxy-rewrite` plugin: `config.host: "$host"` plus `headers.set.X-Forwarded-Host: "$host"` and `headers.set.X-Forwarded-Proto: "$scheme"`. Next's default same-origin check then passes; `allowedOrigins` is left empty. No build dependency on host; no rebuild on host change. (Escape hatch only if genuinely multi-host: entrypoint `jq`-patch of `required-server-files.json` or a custom header-normalizing `server.js`; both use private Next internals and require version-pin + snapshot tests - avoid unless forced.)
3. CSP `connect-src` -> computed at runtime (middleware or runtime headers driven by `window.__ENV`), not baked from build env.
4. Env-var schema validation (Zod) at server boot (`instrumentation.ts`) so a missing/invalid required var fails fast and loud at startup, not silently late.
5. Dockerfile drops the `NEXT_PUBLIC_*` and `CURAOS_*_HOST` build ARGs (build with sentinel/empty); the image carries no environment identity.

## Consequences

- One image runs in dev, cloud, on-prem, hybrid, air-gap with only ConfigMap/Secret differing. Eliminates the entire build-bake fault class (allowedOrigins, NEXT_PUBLIC drift, CSP drift).
- `await connection()` / dynamic render is forced on the layout subtree that injects `window.__ENV` (acceptable for app shells).
- Adds `next-runtime-env` as a third-party runtime dependency; it is pinned and snapshot-tested against Next 15.3.5. An in-house package can replace it in a later version only through a forward migration.
- Requires an APISIX header-alignment change for every FE app route (one generator-emitted `proxy-rewrite` plugin block in the chart).
- Backend unchanged. v1.0 retains its targeted build-arg fix; v1.1 supersedes it by making the value irrelevant at build.

## Alternatives considered

- Keep build-arg-per-environment (v1.0 status quo): rejected for v1.1 - N images per N environments, rebuild on every host change.
- `publicRuntimeConfig`/`serverRuntimeConfig`/`getConfig()`: rejected - Pages-Router legacy, not wired into App Router, deprecated.
- Entrypoint `envsubst` over built JS: rejected as primary - brittle against hashed/minified chunks, runtime artifact mutation, leak risk; documented only as last resort.

## Open questions

- [x] Adopt `next-runtime-env` vs in-house `@curaos/runtime-config`? Resolved 2026-06-30: v1.1 adopts `next-runtime-env`; an in-house package is v1.2 or later only if a forward migration is approved.
- [x] APISIX vs nginx ingress for the live header-alignment snippet. Resolved 2026-06-30: generated FE app charts use APISIX `proxy-rewrite` with plugin-level `host` plus forwarded headers.
