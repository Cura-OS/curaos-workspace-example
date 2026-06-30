# Grill — M10 #303 TypeSpec + AsyncAPI emission (codegen mold)

> Cross-harness adversarial grill (Claude → Codex), read-only, per
> [[curaos-verification-stack-rule]] Tier-2. PR #175;
> rename to `m10-303-typespec-emission-pr<N>.md` once the PR opens.

- **Reviewer harness:** Codex (`codex exec`, default model, `model_reasoning_effort=high`, `--sandbox read-only`).
- **Scope:** working-tree diff under `curaos/tools/codegen/` (the `.hbs` templates + the snapshot test).
- **Date:** 2026-06-02.
- **Verdict:** No critical / no user-escalation. All findings carried code/docs-backed recommendations → **auto-applied** per [[curaos-recommendation-auto-apply-rule]].

## Findings + resolution

| # | Finding | Resolution (auto-applied) |
|---|---|---|
| 1 | **`.tsp` used a single relative `@server("/api/v1")`** but the controller is rooted at `/<plural>` with no global prefix; existing checked-in specs (`identity-service/specs/auth.tsp`) use a **dual `@server`** (local `http://localhost:3000` + gateway `https://{host}/api/v1/<name>`). | Reworked all 3 `.tsp` templates to the dual-server precedent. |
| 2 | **Dir name `contracts/`** diverged from the established **`specs/`** convention (every existing service uses `specs/<name>.tsp` + `specs/tspconfig.yaml`). | Renamed the template dir `contracts/` → `specs/` across the trio. |
| 3 | **No `tsp compile` proof** — the test only string/YAML-matched, never compiled. | Added a live compile proof (PR body): `tsp compile foo.tsp --emit @typespec/openapi3` → OpenAPI 3.1.0, exit 0; `@asyncapi/parser` → 0 errors. The proof **caught 3 real TypeSpec-1.12.0 issues** the older committed `auth.tsp` carries (see below). Test strengthened: `Bun.YAML.parse` structural assertions + reserved-keyword + `@service(#{})` regression guards. |
| 4 | **AsyncAPI `required` parity** — producer ALWAYS emits `display_name`/`deleted_at` (payload) + `actor_type` (header), but they were optional. | Marked them required in all 3 AsyncAPI templates (nullable values stay nullable). |
| 5 | **Glossary/wording** — server description said `curaos.platform.* namespace` but topics are `curaos.core.<name>.*`. | Reworded to "Kafka platform event bus; topics use `curaos.core.<name>.*` per the shared producer template." |
| 6 | **`@minLength/@maxLength` on `reason`** — Zod has 1..512 but the `.tsp` had no constraint. | Added `@minLength(1) @maxLength(512)` (trim noted as runtime-only Zod behavior). |
| 7 | **Contract deps/script** — generated services lacked the TypeSpec toolchain to self-compile. | Added `@typespec/{compiler,http,openapi3}@1.12.0` devDeps + a `spec:openapi` script to all 3 `package.json.hbs` (mirrors identity-service). |

### Live-compile-caught issues (the value of the §8 proof gate)

The real `@typespec/compiler@1.12.0` rejected three forms the older hand-written `auth.tsp` (authored against `0.66.0`) still uses:
1. `op protected()` — `protected` is a **reserved keyword** → renamed to `op protectedProbe()` (wire route stays `@route("/protected")`).
2. `@service({...})` (model expression) → required `@service(#{...})` (value tuple).
3. `version: "0.0.0"` inside `@service` → `ServiceOptions` no longer accepts `version` → dropped.

Each is now a regression guard in `typespec-contract-emission-303.test.ts`.

## Items intentionally NOT done inline (foresight)

- **Backfill the 7 already-scaffolded M10 services** with `specs/` (regen) — emitted as `FORESIGHT`, orchestrator routes it.
- **Backfill the existing hand-written specs** (`auth.tsp`/`builder.tsp`/`workflow.tsp`) to TypeSpec 1.12.0 syntax (they predate it) — separate concern, those services are not in this issue's scope; emitted as `FORESIGHT`.
- **`@hey-api/openapi-ts` SDK generation** is the next lane (#278-284), not this issue.
