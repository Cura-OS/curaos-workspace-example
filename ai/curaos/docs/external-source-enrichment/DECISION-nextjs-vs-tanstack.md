# Decision: Next.js -> TanStack? (evidence-backed, Phase 14)

**User question (2026-06-29):** "We can replace Next.js with TanStack if we have Next.js blockers, but only commit if the value is real and benefits us on multiple areas; confirm online if that is the case for us."

**Verdict: STAY on Next.js + adopt `next-runtime-env` (the #840/ADR-0220 fix). Do NOT migrate the 24-app fleet. Allow TanStack Start as a TRIAL for net-new apps only.**

The migration bar you set (real value + multi-area benefit) is NOT met by a fleet migration. The one real blocker that prompted the question is solved without leaving Next.js.

## The real blocker

Next.js `standalone` output BAKES `NEXT_PUBLIC_*` + `next.config`-derived values (`allowedOrigins`, CSP) at BUILD time; runtime env is ignored. This broke Server Actions behind the CDN and forced epic #840 / ADR-0220 (runtime-config injection). That is the only concrete Next.js blocker on record.

## Online research result (Phase 14 `nextjs-vs-tanstack` lane, web-researched + adversarially verified)

| Option | Recommendation | Value vs scratch | Why |
|---|---|---|---|
| **`next-runtime-env`** (stay Next.js) | **adopt** | much-better | `PublicEnvScript` reads `process.env` per-request (SSR) + `window.__ENV` client; directly fixes #840 (allowedOrigins, CSP nonces, all `NEXT_PUBLIC_`) WITHOUT rebuild and WITHOUT a framework change. MIT. |
| **Next.js + #840 fix** (stay path) | **adopt** | much-better | Keep all 24 apps; fix the bake via `next-runtime-env` + generator-native `PublicEnvScript` in `ui-app-emit` root-layout template; `allowedOrigins`/CSP via a custom server wrapper reading `process.env`. Generator-first, zero fleet churn. |
| TanStack Start (full fleet migration) | trial | **better (only)** | Wins on image size (`bun build --compile` ~132 MB vs Next standalone 2-3 GB) + SSR throughput bench; BUT `VITE_` vars still bake (same class of problem, different escape hatch), Nx/generator story immature, 24-app + `ui-app-emit` rewrite cost is large. "Better" not "much-better" => does not clear the migration bar. |
| TanStack Start (new apps only) | trial | better | Greenfield-only; lets `ui-app-emit` emit two targets and the ecosystem mature before any fleet decision. Low-risk way to gain experience. |
| TanStack Router (SPA, no Start) | trial | much-better | For apps that need NO SSR: static files + `window.__ENV` from a startup config endpoint. Clean runtime-env, but loses SSR/streaming -> only for genuinely SPA surfaces. |
| Vite standalone | reference | much-better | Build-tool reference; not a framework decision on its own. |

## Why not migrate now (multi-area test)

- **Runtime config (the trigger):** solved on Next.js by `next-runtime-env`. Migration not required to fix it.
- **Air-gap / image size:** TanStack `--compile` is genuinely smaller, but our Bun + Helm + Zarf pipeline already ships Next.js standalone; image size is an optimization, not a blocker.
- **Generator-first (`ui-app-emit`):** our entire FE fleet is generator-emitted Next.js. A fleet migration = rewriting the generator + 24 apps + all the solved i18n/auth-cookie/proxy/401 patterns. That is the opposite of lazy; the value does not justify it.
- **SSR/data-loading:** parity, not a clear win for our use.
- **Ecosystem maturity:** TanStack Start + its Nx/codegen story is still maturing (2026); betting the fleet on it now is premature.

Net: ONE area (image size) is a real TanStack win; it is not a blocker and does not outweigh a 24-app + generator rewrite. The blocker that motivated the question is fixed in place.

## Action (folds into backlog as v1.1, generator-first)

1. **Adopt `next-runtime-env`** in `ui-app-emit` root-layout template (`PublicEnvScript`) + custom server wrapper for `allowedOrigins`/CSP from `process.env`. Closes #840/ADR-0220 generator-first; regenerate all 24 apps. (tracker: `XSRC-T-NEXTJS-TANSTACK`)
2. **Trial TanStack Start for net-new apps**: add an optional `ui-app-emit --target=tanstack` lane; build the next greenfield app on it, measure image-size/DX/runtime-config in our real pipeline before any fleet reconsideration.
3. **Re-evaluate fleet migration** only if (a) TanStack Start + Nx generator maturity lands, AND (b) the greenfield trial shows multi-area wins in our pipeline, AND (c) image-size/air-gap becomes a real constraint. File forward; do not migrate speculatively ([[curaos-rolling-update-rule]]: forward in place, no parallel `-v2` path).

ADR draft to be written in Phase 12 (ADR "UI embedding vs native rebuild" + a dedicated framework ADR).
