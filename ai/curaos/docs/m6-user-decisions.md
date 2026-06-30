# M6 Codegen v0 — User Decisions (2026-05-26)

> Binding decisions for M6 Codegen v0 wave. Every M6 Story worker prompt must quote these verbatim under "USER DECISION (binding)".

## D1+D6 — Generator Vehicle + Template Engine

**Decision: Hybrid 3-layer stack**

1. **Nx** — playbook manager / generator orchestration layer (executor, schemas, prompts).
2. **@turbo/gen 2.5.0+** — TypeScript/JavaScript code generation (Handlebars-based, Plop internals).
3. **Custom Bun scripts** — edge-case handling, post-scaffold side effects, Turborepo workspace integration (lefthook install, .npmrc injection, DOC-GRAPH append, ai/curaos mirror creation).

**Why:** Nx is the most mature playbook orchestrator with prompts + composability; @turbo/gen aligns with Turborepo workspace context for TS/JS file emission; Bun scripts cover the edge cases neither tool handles natively (mirror creation, doc graph updates, Verdaccio publish wiring). No layer fights the others.

**Forbidden alternatives:** Pure Bun + @clack only (no playbook composition); EJS templates (not aligned w/ @turbo/gen default Handlebars).

**Lock-in surface:** `nx.json` MUST coexist with `turbo.json`. Nx CLI runs ONLY for generator invocations — not as a build system. Turborepo remains the task runner per `ai/rules/curaos_bun_primary_rule.md` + `ai/rules/curaos_speed_patterns_rule.md`.

## D2+D5 — AppModule Auto-wiring + Doc Emission Depth

**Decision: Hybrid — ts-morph auto-wire + dual-mode doc emission**

- **ts-morph 23.x** edits `AppModule.ts` to register generated service modules. Auto-wire is non-optional.
- Doc emission has TWO modes selected by prompt inputs:
  - **Opinionated** — when prompt provides `--domain=<neutral|healthstack|education|erp>` + `--purpose=<short>`, generate domain-specific AGENTS.md/CONTEXT.md/Requirements.md with templated sections + frontmatter.
  - **Stub** — when prompt omits domain context, emit placeholder docs with TODO markers + minimum-viable frontmatter.

**Why:** Auto-wiring is mechanical and saves manual edit per service (DX win). Dual-mode docs balance "fast scaffolding" (stub) with "quality on first emit" (opinionated). Workers can always re-run generator in opinionated mode later.

## D3+D4 — Lefthook + Verdaccio URL

**Decision: Emit lefthook.yml if absent + Verdaccio URL from env var**

- Generator checks for `lefthook.yml` in target directory. If absent, emits a baseline version that runs Conventional Commits lint + gitleaks + typecheck. If present, runs `lefthook install` only (no overwrite).
- Verdaccio URL read from `VERDACCIO_URL` env var. Defaults to `http://localhost:4873` if env unset.

**Why:** Avoid clobbering hand-tuned hook config. Env-var URL is CI-correct (Verdaccio runs at a different address in CI than locally).

## D7 — Service Type Scope

**Decision: All 3 types in M6 v0 — core + personal + business**

- Generate `<name>-core-service` (neutral primitives)
- Generate `personal-<name>-service` (individual-context overlay)
- Generate `business-<name>-service` (org/enterprise overlay)

**Why:** Full coverage on day 1 means M7+ "First Mold" can immediately validate the generic→vertical doctrine end-to-end without follow-up generator work. 3x template count is acceptable for the time saved downstream.

**Tradeoff accepted:** Larger initial template surface, more snapshot tests to maintain. Mitigation: shared `core` template parent that personal/business templates extend (avoids triplication).

---

*Bound on 2026-05-26 via §3.6 escalation funnel during M6 §3.4 Tracker-First Triage. Reference: `ai/curaos/docs/research/m6-nx-codegen-stack.md`.*
