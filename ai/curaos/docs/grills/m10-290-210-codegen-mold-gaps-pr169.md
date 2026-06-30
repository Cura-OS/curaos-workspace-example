# Codex grill — M10 #290 + #210 codegen mold gaps PR curaos#169 [+ curaos-ai-workspace#292 docs]

Cross-harness adversarial review per [[curaos-verification-stack-rule]] Tier-2. Reviewer: Codex (`codex exec`, `model_reasoning_effort=high`, `--sandbox read-only`). Subject: branch `agent/fix-codegen-mold-gaps-290-210` (initial commit `1926d42`).

> First grill invocation exited silently with no output (the documented ChatGPT-account-auth stall). Re-ran; the retry produced the verdict below. Orchestrator-verified every finding directly against the working tree before acting.

## Verdict: BLOCK (initial) → all P1 + P2 fixed, see Re-grill verification

## P1 findings (block merge) — ALL FIXED

1. **Plain layer rendered the wrong package name** (`config.ts:66` + `package.json.hbs:2`)
   - **What:** the `plain` layer reuses the `service-core` template tree, but that tree hardcoded `@curaos/{{name}}-core-service` in `package.json` `name` (and the Dockerfiles' build-context paths + labels, bunfig, lefthook, AGENTS.md). So `--plain-service settings` emitted dir `settings-service` but `package.json` `"name": "@curaos/settings-core-service"` — the package name, dir, and barrel/wire disagreed → a broken service. Verified directly: rendered `package.json.name` was `@curaos/settings-core-service`.
   - **Fix:** threaded a `{{serviceSlug}}` token (= `layer.packageName`) through the render context (`live-emit.ts` ctx, `config.ts` addMany `data`, `lefthook-emit.ts`) and converted every hardcoded `{{name}}-core-service` in the `service-core` tree to `{{serviceSlug}}`. Now `--plain-service settings` → `@curaos/settings-service`; core/personal/business unchanged. Locked by `plain-service.test.ts` (rendered package.json + lefthook assertions).

2. **Personal/business `0000_snapshot.json` used the wrong schema name** (`service-{personal,business}/drizzle/migrations/meta/0000_snapshot.json.hbs:7`)
   - **What:** I copied the core snapshot (schema `{{snakeCase name}}_core`) to personal/business without fixing the schema name. But personal schema = `personal_{{snakeCase name}}`, business = `business_{{snakeCase name}}` (per their `schema.ts` + `0000_audit_outbox.sql`). So the personal/business baselines wouldn't match → the first `drizzle-kit generate` would see their `audit_outbox` as missing from the baseline and re-emit it — defeating the whole fix for those two layers.
   - **Fix:** corrected the schema token per tree (`personal_{{snakeCase name}}` / `business_{{snakeCase name}}`). Verified all 3 snapshots' table key + `schema` field + identity schema + `schemas` map match each layer's `schema.ts` pgSchema + `0000.sql` CREATE SCHEMA. Test rewritten: the old "byte-identical baseline" assertion was WRONG (they must differ by schema name) → replaced with a per-layer schema-name correctness cross-check + a column/index-shape symmetry check.

3. **Auth-matrix test route vs controller mount mismatch** (personal/business `auth-matrix.test.ts.hbs:58` vs controller `:46`; `audit-chain-e2e.test.ts.hbs:525`)
   - **Disposition: PRE-EXISTING, out of scope, NOT a regression.** On `origin/main` the same shape existed: controller `@Controller('business-{{kebabCase name}}s')` vs test route `/{{kebabCase name}}s/...`. My pluralize conversion preserved the exact relationship byte-for-byte (both sides converted identically). These `.hbs` are templates rendered into generated services (run there, not in codegen's own `bun test`). Captured as a FORESIGHT observation for a separate fix; #290/#210 are route-neutral.

## P2 findings — FIXED

4. **Plain layer mirrored EMPTY agent docs** (`live-emit.ts:252-253`)
   - **What:** agent docs resolve by `layer.id` → `templates/agent-docs/<id>/`, but there is no `agent-docs/plain/` dir, so `renderLayerAgentDocs` returned `[]` while the doc-graph still appended the plain service's AGENTS/CONTEXT/Requirements nodes → empty mirror docs + stale graph nodes.
   - **Fix:** added `agentDocsLayerId(id)` (plain → core) applied at all 3 resolution sites (`live-emit`, `config.ts` addMany base, `agent-docs-emit`). Plain now mirrors the real core agent docs. Verified live: plain service writes 3 non-empty mirror docs. Locked by `plain-service.test.ts`.

## Re-grill verification

All P1 (1, 2) + P2 (4) findings fixed in-branch. P1-3 confirmed pre-existing + out-of-scope (FORESIGHT-captured). Post-fix gate state at the worker's worktree:

- `bun run typecheck` → exit 0
- `bun run lint` (oxlint) → exit 0 (5 pre-existing warnings, 0 errors)
- `bun test --coverage` → **416 pass / 0 fail**, coverage **95.75% func / 92.06% line** (≥90% bar)
- Rendered-output spot checks (orchestrator-verified):
  - `--plain-service settings` → `package.json.name = @curaos/settings-service` (was `-core-service`)
  - personal/business 0000_snapshot schema = `personal_settings` / `business_settings` (was wrongly `settings_core`)
  - plain service mirrors 3 non-empty agent docs

Codex CLI auth note: the first grill invocation produced no output (silent exit — the known ChatGPT-account-auth stall for `codex exec`). The retry with `model_reasoning_effort=high` succeeded and produced the verdict above. Every finding was orchestrator-verified directly against the working tree (not taken on faith), per the grill fallback in the one-task prompt.
