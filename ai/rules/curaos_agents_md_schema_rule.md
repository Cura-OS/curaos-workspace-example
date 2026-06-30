---
name: curaos-agents-md-schema-rule
title: AGENTS.md schema (per-module frontmatter + split pattern)
description: AGENTS.md per-module schema - extended CuraOS frontmatter (name+description+tags+language+framework+infrastructure+tooling+apis+events+deployment_profiles+docs) + ASDLC strict body (Mission/Toolchain Registry/Judgment Boundaries/Context Map/Personas Registry) + strict empirical discipline (<150 lines total, <50/section, command-first, closure definitions, NEVER auto-generate)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA2 walkthrough - first agentic-workflow rule, no dependency):

## The rule

**Every CuraOS module's `ai/curaos/<module>/AGENTS.md` follows three locked constraints:**

1. **Extended CuraOS frontmatter** (superset of AAIF v1.1; spec-valid since unknown fields ignored)
2. **ASDLC strict body structure** (Mission / Toolchain Registry / Judgment Boundaries / Context Map / Personas Registry)
3. **Strict empirical discipline** (<150 lines total, <50 lines per section, command-first, closure definitions, NEVER auto-generate, NEVER restate toolchain-enforced rules)

## Discipline rules

| Rule | Enforced via |
|---|---|
| Frontmatter presence + 11 canonical keys | `scripts/check-agents-schema.js` (`frontmatter-missing` / `frontmatter-keys`) via `scripts/check-docs.sh` (lefthook pre-commit `doc-graph` hook + `just ci`) |
| Required ASDLC sections (Mission / Toolchain Registry / Judgment Boundaries) | `scripts/check-agents-schema.js` (`section-missing`) |
| <150 lines total per AGENTS.md | `scripts/check-agents-schema.js` (`file-cap`) |
| <50 lines per section (incl. `AGENTS-sections/*.md`) | `scripts/check-agents-schema.js` (`section-cap` / `section-file-cap`) |
| AGENTS-sections consistency (no orphans, no dead refs) | `scripts/check-agents-schema.js` (`sections-orphan` / `sections-missing-ref`) |
| Frontmatter `status` enum (stub / scaffold / active / migrating / deprecated / superseded) | `scripts/check-agents-schema.js` (`status-invalid`) |
| `status: stub` modules carry the STUB banner | `scripts/check-agents-schema.js` (`stub-banner-missing`) |
| Documented commands exist in the mirrored module's package.json scripts | `scripts/check-agents-schema.js` (`command-missing`; skipped when the submodule is not checked out; fails closed via `package-json-unreadable` on a corrupt package.json) |
| Listed dependencies exist in the mirrored module's package.json (unless marked planned) | `scripts/check-agents-schema.js` (`dependency-missing`) |
| Command-first | Code review discipline; not yet scripted |
| Closure definitions | Code review discipline; not yet scripted |
| NEVER auto-generate AGENTS.md | Code review discipline; autogen-fingerprint gate not yet scripted |
| NEVER restate toolchain rules | Code review check: rule expressible in biome/eslint/tsconfig/CI = not in AGENTS.md |
| HTML comments `<!-- -->` for maintainer notes | Stripped from agent context but visible to humans - use for "next time consider X" without burning tokens |
| Split oversized AGENTS.md into ephemeral sections (don't trim, don't fold into CONTEXT) | When AGENTS.md exceeds 150 lines, move each `## section` to `AGENTS-sections/<slug>.md` and replace body section with one-line `[[link]]` |

**Enforcement status (RP-14/RP-15, 2026-06-10):** the schema gate runs warn-first; legacy modules are listed in `scripts/check-agents-schema-allowlist.txt` and pass in both modes until migrated. The RP-15 migration (`scripts/migrate-agents-frontmatter.js`, one-shot, idempotent) normalized every `ai/**/AGENTS.md` onto the 11 canonical keys, so the frontmatter axis passes at 100%; remaining allowlist entries cover the ASDLC body-structure axes only. Ratchet to fail-closed by exporting `CHECK_AGENTS_SCHEMA_MODE=fail` (or `--mode=fail`); new and migrated modules are expected to pass clean immediately.

## Banned

- Auto-generated AGENTS.md (LLM-emitted full-file generation - -4% perf documented; only Codegen scaffold acceptable, then human-curated)
- AGENTS.md inside `curaos/` code repos (violates [[curaos-ai-mirror-rule]] + [[curaos-repo-boundary-rule]])
- AGENTS.md >150 lines total (silent truncation)
- Sections >50 lines (adherence drop)
- Prose-only directives without verifiable CLI command
- Restating toolchain-enforced rules (biome/eslint/tsconfig/CI rules belong in those config files, not AGENTS.md)
- Architecture summaries duplicating README (agents skip discoverable content)
- Long welcome paragraphs (machine parsing, not human prose)
- Stale content (outdated patterns actively mislead agents; worse than no content)
- AAIF-minimal-only frontmatter (loses CuraOS-specific agent discovery metadata)
- AGENTS.md missing closure definitions (#1 ghost-completion failure mode)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical backing |
|---|---|
| AGENTS.md presence | 29% median agent runtime reduction + 17% token reduction (Augment Code, 2026) |
| <150 lines total | Files >150 lines silently truncated by context loaders |
| <50 lines per section | Adherence degrades past 50 lines per section |
| Command-first | "ensure quality" ignored; `bun run ci` honored (Blake Crosley empirical analysis) |
| Closure definitions | Without "Done when ALL pass: X+Y+Z" → agents self-report done without running checks (#1 failure mode) |
| Task-organized sections | Lets agents select relevant instructions contextually |
| Escalation rules | "If tests fail 3× → stop, do NOT modify tests" prevents destructive improvisation |
| NEVER auto-generate | LLM-generated context files reduce task success while +20% inference cost (ASDLC, -4% perf) |
| NEVER restate toolchain rules | Belongs in biome/tsconfig/CI gates; restating = drift + rot |

## Canonical frontmatter schema

```yaml
---
name: <module-kebab-case>
description: <one-line under 200 chars>
tags: [<list>]
language: <TypeScript|Go|Rust|...>
framework: <NestJS 11|React 19|Expo 53|Astro 5|...>
infrastructure: <PostgreSQL (CNPG), Redis, K8s, ...>
tooling: <Bun, Drizzle, Zod 4, ...>
apis:
  - REST /api/v1/<path>
  - gRPC <package>.<Service>
events:
  produces: [<event.name>, ...]
  consumes: [<event.name>, ...]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/<module-path>/CONTEXT.md
  requirements: ai/curaos/<module-path>/Requirements.md
---
```

**Why extended (not AAIF minimal):**
- AAIF v1.1 only standardizes `description` + `tags` - too thin for 96-submodule cross-CLI agent discovery
- Extended fields enable codegen recipes to emit module scaffolding from frontmatter directly
- All unknown fields are ignored by standard AAIF readers - extended schema is spec-valid superset
- Queryable via `yq` across all modules (live count from `curaos/.gitmodules`): `yq e 'select(.framework == "NestJS 11") | .name' ai/curaos/backend/services/*/AGENTS.md`

**Why NOT hybrid `curaos:` namespace:** Two-tier parse adds complexity without payoff; standard readers ignore unknown top-level fields just as cleanly as they would a nested block.

## Canonical body structure (ASDLC strict)

```markdown
## Mission
2-4 sentences: what this module does, domain constraints.

## Toolchain Registry
- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries
- NEVER push to main without PR review
- NEVER edit migration files post-merge
- NEVER restate toolchain-enforced rules here (belongs in biome/tsconfig/CI)
- ASK before adding new dependencies
- ASK before destructive ops (rm -rf, git reset --hard, DROP TABLE, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write tests that fail on pre-change code
- ALWAYS use `codegraph_search` before `rg` for symbol queries

## Context Map (if monorepo position non-obvious)
```yaml
monorepo: bun workspaces
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
notable:
  ai/: agent docs mirror - no code here
  ops/: infra config only
```

## Personas Registry (if multi-agent)
- explorer: read-only codebase analysis (Haiku 4.5)
- security-auditor: HIPAA/GDPR audit (Opus 4.8)
- reviewer: code review w/ Security+Architecture lens (Sonnet 4.6)
```

## Intent vs state conventions (RP-31)

Agent docs must not present ADR intent as current code state. Three sanctioned markers keep intent visible without lying about the tree:

1. **`planned, do not import` marker** - any dependency or command documented from an ADR before it lands in package.json MUST carry the marker, either on its own line/table row or in the governing heading (example: `## Planned dependencies (ADR-0120 intent; planned, do not import)`). The drift gate (`command-missing` / `dependency-missing`) exempts marked lines and flags unmarked absences. Reference instance: `ai/curaos/backend/services/identity-service/AGENTS-sections/dependencies.md`.
2. **STUB banner** - a module documented before any code exists MUST carry a body line of the form `STUB: no code yet, real home = <path>` so loaders cannot mistake the contract for a built module.
3. **Frontmatter `status` enum** - when a module declares `status:`, the value MUST be one of `stub | scaffold | active | migrating | deprecated | superseded`. `status: stub` requires the STUB banner. Plan-phase values (for example `m7-s3-complete`) are banned; record milestone history in CONTEXT.md instead.

## Split pattern (when AGENTS.md exceeds 150 lines)

**Never trim AGENTS.md by deleting content; never fold detail into CONTEXT.md as a workaround.** When a module's binding rules genuinely exceed 150 lines, split into ephemeral linked sub-docs:

```
ai/curaos/<module>/
├── AGENTS.md                          # TOC + frontmatter + links (≤150 lines)
├── AGENTS-sections/
│   ├── baseline.md                    # §1 binding rules (loaded JIT)
│   ├── codegen.md                     # §2 codegen commands
│   ├── file-ownership.md              # §3 file ownership table
│   ├── eslint.md                      # §4 ESLint config
│   ├── commands.md                    # §5 test/build commands
│   ├── dependencies.md                # §6 deps table
│   ├── ports.md                       # §7 service ports + sidecars
│   ├── pr-conventions.md              # §8 commit/PR rules
│   └── forbidden.md                   # §9 forbidden actions
├── CONTEXT.md                         # decisions + rationale + integration map (separate concern)
└── Requirements.md                    # full module spec
```

AGENTS.md body becomes a navigation index, e.g.:

```markdown
## Sections (load on-demand)

| Section | Topic | File |
|---|---|---|
| 1 | Baseline rules | `AGENTS-sections/baseline.md` |
| 2 | Codegen commands | `AGENTS-sections/codegen.md` |
| 3 | File ownership | `AGENTS-sections/file-ownership.md` |
| 4 | ESLint rules | `AGENTS-sections/eslint.md` |
| 5 | Commands | `AGENTS-sections/commands.md` |
| 6 | Dependencies | `AGENTS-sections/dependencies.md` |
| 7 | Ports + sidecars | `AGENTS-sections/ports.md` |
| 8 | PR + commit conventions | `AGENTS-sections/pr-conventions.md` |
| 9 | Forbidden actions | `AGENTS-sections/forbidden.md` |
```

**Why this pattern:**
- AGENTS.md stays scannable (≤150 lines) → fits one cache window prefix
- Detail sections load ONLY when agent needs that area (JIT context)
- No information loss (vs trim)
- No mixing concerns (AGENTS.md binding rules ≠ CONTEXT.md historical rationale)
- Each section file caps ≤50 lines per main discipline rule
- Cross-CLI agents (Codex, Gemini, OpenCode) follow Markdown links natively; Claude Code uses `@AGENTS-sections/<slug>.md` import syntax when applicable

**When NOT to split:**
- AGENTS.md under 150 lines → keep monolithic (one round-trip load)
- Detail is non-binding rationale → goes to CONTEXT.md per [[curaos-knowledge-persistence-rule]] L2
- Content is historical/archival → goes to RFCs or ADR-archived/ per [[curaos-knowledge-persistence-rule]] L6

## Cross-CLI compatibility (2026-05)

| Agent | Reads AGENTS.md | Frontmatter handling |
|---|---|---|
| Claude Code | Via `@AGENTS.md` import in CLAUDE.md | Skill metadata reads frontmatter; body honored |
| Codex CLI | Native (walks repo→cwd hierarchy, closest-wins) | Unknown frontmatter fields ignored gracefully |
| GitHub Copilot CLI | Native (Aug 2025+) | Reads description + tags primarily |
| Cursor | Native + `.cursor/rules/*.mdc` glob-scoped | IDE displays frontmatter; rules override |
| Gemini CLI | Via `context.fileName` setting | Reads GEMINI.md default; AGENTS.md as fallback |
| Aider | Native | Uses for repo-map context |
| OpenCode | Native AGENTS.md project memory | Body honored |
| Windsurf / Zed / Warp / RooCode | Native | Body honored |

**60K+ open-source repos** use AGENTS.md as of 2026-05; stewarded by Linux Foundation AAIF.

## Mirror placement (per ai-mirror rule)

All AGENTS.md files live under `ai/curaos/<mirror-path>/` - NEVER inside `curaos/` code repos. Examples:

- `curaos/backend/services/identity-service/` (code) ↔ `ai/curaos/backend/services/identity-service/AGENTS.md` (agent contract)
- `curaos/frontend/apps/admin/` (code) ↔ `ai/curaos/frontend/apps/admin/AGENTS.md` (agent contract)
- `curaos/ops/zarf/` (config) ↔ `ai/curaos/ops/zarf/AGENTS.md` (agent contract)

Per [[curaos-repo-boundary-rule]]: submodule repos stay clean code-only; AGENTS.md never leaks into curaos/.

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter (documented seams) | Every module has explicit agent contract w/ Judgment Boundaries |
| AGENTS.md §10 (read repo context first) | Frontmatter + Toolchain Registry give agents zero-guess onboarding |
| AGENTS.md §12 (per-project onboarding order) | This rule defines the AGENTS.md agents read in step 2 |
| [[curaos-ai-mirror-rule]] | All AGENTS.md under ai/curaos/ mirror; never in curaos/ code repos |
| [[curaos-repo-boundary-rule]] | No workspace links, ADR refs, or impl values leak into curaos/ |
| [[curaos-modulith-standalone-rule]] | Per-module AGENTS.md describes both standalone + modulith mode |
| [[curaos-bun-primary-rule]] | Toolchain Registry commands use `bun` primary |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical: memory ↔ ai/rules/ ↔ AGENTS.md §15 |

## Agentic-tool friendliness

Why extended schema + ASDLC strict body wins for AI agents specifically:

- **Frontmatter as machine-readable metadata** → agents query `yq` across 96 submodules to find "all NestJS services consuming tenant.provisioned event"
- **Toolchain Registry** → agents know exact commands to verify "done" w/ zero guesswork
- **Judgment Boundaries NEVER/ASK/ALWAYS** → maps directly to Claude Code permission model + Codex sandbox modes
- **Context Map** → eliminates agent guessing about cross-module relationships
- **Personas Registry** → orchestrator agent reads to know which sub-agent to spawn for which sub-task
- **<150 line cap** → fits one cache window prefix; full module context loads in one round-trip
- **NEVER auto-generate** → prevents LLM-induced -4% perf trap; human-authored AGENTS.md preserves signal

## How to apply

- Every new module created via Codegen recipe (per ADR-0123) emits AGENTS.md scaffold w/ extended frontmatter + ASDLC strict body
- `scripts/check-agents-schema.js` validates frontmatter (11 canonical keys) + required ASDLC sections + 150/50 line caps + AGENTS-sections orphan/missing-ref consistency over every `ai/**/AGENTS.md`
- Lefthook pre-commit `doc-graph` hook runs `scripts/check-docs.sh` on every `*.md` commit, which runs the schema gate; `just ci` (docs recipe) runs the same path
- Gate is warn-first w/ legacy allowlist (`scripts/check-agents-schema-allowlist.txt`); fail-closed via `CHECK_AGENTS_SCHEMA_MODE=fail` once RP-15 drains the allowlist
- Per-module AGENTS.md mirrored 1:1 w/ code path under `ai/curaos/` (per [[curaos-ai-mirror-rule]])
- HTML comments `<!-- -->` reserved for maintainer notes that should NOT burn agent context tokens
- Treat AGENTS.md updates as CI/CD config changes: re-run the module's local CI gate after editing (per-module CI auto-trigger not yet wired)

## ADRs

ADR-0151 (`0151-cross-cluster-coherence.md`) covers Wave 2 cross-cluster coherence scan (different topic). Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for the actual AGENTS.md schema ADR if one has been filed.
