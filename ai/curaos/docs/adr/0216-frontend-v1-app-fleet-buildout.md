# ADR-0216: Frontend v1.0 app-fleet build-out via deepened gen:ui-app + mock-first render

Status: Accepted (2026-06-15)
Target Version: v1
Supersedes: none. Extends: ADR-0106 (frontend), ADR-0153 (codegen recipe coverage), ADR-0154 (provider abstraction).

## Context

v1.0 requires all frontend surfaces functional and shipped. The 22 app submodules existed as empty scaffolds (except admin-app, builder-studio). The `gen:ui-app` generator emitted list-only stubs with TODO placeholders and no offline-render path, so generated apps hung on "Loading…" without a live backend, and per-app hand-fixes violated the generator-evolution rule.

## Decision

1. **Generator owns app depth.** `gen:ui-app` (ADR-0153 `ui.react-next`) emits production-depth apps: per-screen list + `[id]` detail + create/edit forms (react-hook-form + zod) + `"use server"` actions + filters + pagination + loading/error/empty states + role guards + KPI dashboard + i18n seam. Every edge case folds into the emitter, never a local hot-fix.

2. **Mock-first render is the v1 functional bar.** The emitter emits a generic schema-seeded `src/api/mock-data.ts` + a `mockSession` bypass gated by `NEXT_PUBLIC_USE_MOCK` (default on when no `NEXT_PUBLIC_API_BASE_URL`). Every generated app renders real seeded content offline with no backend. Live gateway wiring is a later, deploy-gated phase (M16); it flips on by setting the API base URL. This makes "functional + shipped" achievable for v1 without the full live cluster.

3. **Server/client boundary is structural.** Generated `"use server"` actions reach the gateway through a client-free `src/api/config.ts` seam (pure base-URL + cookie reader), never the `@curaos/api-client` barrel (which ships React-Query/Apollo providers). `@curaos/api-client` + `@curaos/ui` build with a `"use client"` banner and their provider sources carry the directive, so the barrel is safe even if pulled into a server graph.

4. **React Native apps (clinician-app, patient-app)** use the `ui.react-native` recipe (Expo), tracked as a separate generator path; not covered by the Next.js emitter.

## Consequences

- 17 web apps fanned out from one generator, each building green; admin-app is the verified-live reference.
- Any future app or regen inherits the full depth + offline render; the "all loading" failure class is eliminated at the mold.
- Idempotent `--write` skips existing files, so apps emitted before a generator fix must be re-emitted (re-run after deleting the affected layer). Captured as an operational note in the build-out plan.
- Mock seed shapes (id/name/status/createdAt + screen fields) are generic seams meant to be swapped for generated SDK types once each service contract lands.

## Links

- Plan: `ai/curaos/docs/frontend-v1-buildout-plan.md`
- Rules: [[curaos-generator-evolution-rule]], [[curaos-rolling-update-rule]], [[curaos-verification-stack-rule]]
- ADR-0153 (recipe coverage), ADR-0106 (frontend), ADR-0154 (provider abstraction)
