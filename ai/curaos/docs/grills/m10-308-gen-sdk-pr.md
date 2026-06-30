# Grill — M10 #308 gen:sdk recipe + notify-sdk findings

**Issue:** your-org/curaos-ai-workspace#308
**Branch:** `agent/build-gen-sdk-308` (off curaos `main` @ `9e632e6`)
**Date:** 2026-06-02
**Harness:** Claude Code (implementer) → Codex (opposite-harness adversarial reviewer)

## Grill status: STALLED → orchestrator-verified directly

The opposite-harness adversarial grill (`codex exec -m gpt-5-codex -c
model_reasoning_effort=high --sandbox read-only`) was dispatched against the plan
but produced **zero output after ~22 minutes** and was terminated (exit 144).
The `--output-last-message` file was never written. Per the #308 task fallback
("Codex stalls → default model effort high, else verify directly +
orchestrator-verified note + OPEN PR anyway") and the one-task runbook §4
(adversarial-review-unavailable does NOT block when the implementer verifies the
critical claims directly), the implementer verified the load-bearing claims
directly. Findings recorded below.

## Direct verification of the load-bearing claims

### 1. The PR#177 Critical is a FALSE POSITIVE in the merged copy — PROVEN

CodeRabbit flagged `backend/packages/notify-sdk/src/rest/client/index.ts:13`:
```ts
export { createClient } from './client.gen';
```
claiming `./client.gen` does not export `createClient`, and proposed `'./client'`.

- `./client.gen` resolves to `src/rest/client/client.gen.ts`, which DOES export
  `createClient` (`client.gen.ts:22: export const createClient = ...`). There is
  NO `./client` module in that directory — CodeRabbit's proposed fix would NOT
  compile. CodeRabbit confused `src/rest/client.gen.ts` (singular path — the
  `client` instance) with `src/rest/client/client.gen.ts` (the factory).
- **Typecheck proof:** `cd backend/packages/notify-sdk && bun run typecheck`
  (`tsc --noEmit`) → exit 0. The export does NOT fail at compile time.
- **Runtime proof:** a probe importing `createClient` through
  `./src/rest/client` returns a callable factory; `client.request` and
  `client.setConfig` are functions.

Verdict: the recipe barrel is correct. No code change was needed to "fix" F1; the
recipe + the new `gen:sdk` smoke BAKE a `createClient` barrel assertion so any
future regression fails CI in every SDK.

### 2. The 8 `.gen.ts` findings (F2-F8) are vendored, not recipe-level — SOUND

`src/rest/**/*.gen.ts` is `@hey-api/client-fetch@0.13.1` output, regenerated
byte-identically by `bun run generate` and byte-guarded by `test/drift.test.ts`.
Hand-editing them breaks the drift guard and is reverted on the next regen. The
correct control surface is the pinned generator version (the recipe pins
`@hey-api/openapi-ts@0.98.1` / `client-fetch@0.13.1`). F3 is additionally tracked
by #306. None replicate as a *recipe defect*.

### 3. Recipe-level findings folded in — VERIFIED

- F9/F10 (smoke shape): the merged notify-sdk smoke was hardened (createClient
  barrel guard + `afterEach` singleton reset); the `gen:sdk`-emitted smoke
  carries the same. notify-sdk now 6 pass / 0 fail (was 5).
- dep-cruiser carve-out: ALREADY anchored generically at
  `.dependency-cruiser.cjs:45` → `backend/packages/<name>-sdk/src/rest/(client|core)/*.gen.ts`.
  Every SDK inherits it; `gen:sdk` documents it, no per-service edit.
- biome-format-in-generate, package.json shape (exact pins, publishConfig→Verdaccio):
  emitted by `gen:sdk`; byte-/code-identical to notify-sdk (parity test).

### 4. Parity (Part 3) — PROVEN

`gen:sdk notify` (into a tmp repo-root) reproduces the corrected notify-sdk recipe:
- **Byte-identical:** `package.json`, `.npmrc`, `tsconfig.json`.
- **Code-identical (comments aside):** `openapi-ts.config.ts`,
  `scripts/generate.mjs`, `scripts/gen-events.mjs`, `test/drift.test.ts`.
- **Divergent by design:** `src/index.ts`, `test/smoke.test.ts`, `README.md` —
  these carry service-specific operation/event-type names that only exist after
  `bun run generate`, so the generator emits the recipe-stable skeleton + a
  hand-fill TODO. This is correct: the generator owns the recipe SHAPE; `generate`
  fills the vendored output. Asserted by `__tests__/sdk-emit.test.ts`.

## Residual risks / notes (implementer self-grill)

- The `.gen.ts` are intentionally NOT scaffolded by `gen:sdk` — a sibling lane
  MUST run `bun run generate` after `--write` to fill `src/rest/**` +
  `src/events.gen.ts` (the emitted README + CLI next-step line both say so).
  This is the same workflow notify-sdk used; it keeps the drift guard honest.
- `src/index.ts` ships a commented-out event-payload re-export placeholder; the
  sibling fills the concrete `<Name>EventPayload` name after `generate` (the
  AsyncAPI schema id is service-specific). Documented in the emitted barrel.

## Verdict

Plan was sound and is implemented. No Critical/Major concern survives direct
verification. PR opened; merge gate is the local CI evidence in the closeout.
