# Codex grill — M10 #304 specs-regen (curaos codegen PR)

Cross-harness adversarial review (Claude → Codex, read-only, high effort) of the
`--specs-only` flag + layer-aware spec-title fix on branch
`agent/regen-services-specs-304` (`tools/codegen`). Per
[[curaos-verification-stack-rule]] Tier-2.

## Verdict: APPROVE-WITH-CONDITIONS

4 findings, all with recommended answers (auto-applied per
`ai/rules/curaos_recommendation_auto_apply_rule.md`). Zero user-escalation
candidates. `onlyPrefixes` confirmed safe; no clobber path on the CLI happy path.

## P1 findings (addressed before merge)

1. **Turbo `@turbo/gen` path broken for the new service-core spec tokens**
   - **Where:** `turbo/generators/config.ts` `addMany.data` (passed only
     `{ verdaccioRegistry, serviceSlug }`); the `service-core` specs templates
     now require `serviceTitle`/`serviceTitleEvents`/`serverSlug`/`namespaceSuffix`.
   - **Why P1:** the live `--write` path threads the spec context, but a direct
     `turbo gen run service` would render an empty title/namespace.
   - **Fix (auto-applied):** spread `specContextFor(spec.id, …)` into the
     `addMany` data so the turbo path matches the live path.

2. **`applySpecPackageJson` did not preserve devDependency key order**
   - **Where:** `src/live-emit.ts` — sorted all devDeps + rewrote with
     `JSON.stringify(null, 2)`.
   - **Why P1:** churns the diff (re-orders existing devDeps) on the 7 real
     services; the brief says "merge-not-overwrite".
   - **Fix (auto-applied):** append ONLY the missing keys preserving the original
     devDependencies order + the file's existing indent; never reorder.

3. **Exported `emitSpecsOnly`/`emitServiceLive` lacked the kebab-case name guard**
   - **Where:** `src/live-emit.ts` — CLI validates `name` (`index.ts`), but the
     exported API did not, so a slash-bearing `name` could escape `serviceDir`.
   - **Why P1:** defense-in-depth; the exported API is the reusable surface.
   - **Fix (auto-applied):** validate `name` is kebab-case at the top of
     `emitSpecsOnly` (mirrors the CLI guard).

4. **"Core byte-identical" over-claim in the test name**
   - **Where:** `__tests__/templates/specs-only-backfill-304.test.ts`.
   - **What:** core's `@service title`/`@server`/namespace ARE byte-identical,
     but the template COMMENTS gained an intentional #304 explanation, so the
     full file is not byte-identical.
   - **Fix (auto-applied):** reworded the test/claim to "preserves the
     `-core-service` identity" (semantic, not whole-file byte) — the comment
     drift is intentional and harmless.

## P2 findings (followups acceptable)

- `--specs-only` can still overwrite a hand-edited `specs/*.tsp` when content
  differs (the template render is authoritative for the contract). Acceptable:
  the contract IS generator-owned per [[curaos-generator-evolution-rule]]; a
  hand-enriched `.tsp` is the foresight-tracked divergence, not a clobber of
  domain code. No fix.

## What Claude got right (counter-balance)

1. `onlyPrefixes` filter is safe against a file literally named `specs-foo`
   (uses `startsWith('specs/')`, caller passes `['specs/']`).
2. The CLI happy path reaches NO `src/`/`drizzle/`/mirror/app-module/barrel
   emit — dispatch returns before the full pipeline; the template filter
   restricts to `specs/`. The no-clobber guarantee holds.
3. CLI path-traversal is already blocked by the existing kebab-case name
   validation in `index.ts`.

---

## Re-grill verification (2026-06-02, post-fix)

All 4 findings auto-applied in the same PR (recommendations from the code, per
the recommendation-auto-apply rule). Re-ran `bun run typecheck` (0),
`bun run lint` (0 errors), `bun test` (full codegen suite green). The added
tests cover: raw package.json devDep-order preservation, the turbo `addMany`
spec-context render, the `emitSpecsOnly` name-guard throw, and the reworded
core-identity assertion.
