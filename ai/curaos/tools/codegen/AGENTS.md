---
name: codegen
description: M6 hybrid generator harness - Nx playbook orchestration + @turbo/gen Handlebars emission + custom Bun edge-case scripts. Drives backend/frontend scaffolding for CuraOS modules.
tags: [tooling, codegen, m6, harness]
language: TypeScript
framework: Nx 21 / @turbo/gen 2.9
infrastructure: monorepo (Bun workspaces + Turborepo)
tooling: Bun, Nx, @turbo/gen, ts-morph
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [dev]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/tools/codegen/CONTEXT.md
  requirements: ai/curaos/tools/codegen/Requirements.md
---

# AGENTS.md - tools/codegen

CuraOS M6 hybrid code-generation harness. Cross-CLI agent contract for Claude Code, Codex, Gemini CLI, OpenCode operating on `curaos/tools/codegen/`.

## Mission

M6 hybrid generator harness (`Nx playbook → @turbo/gen Handlebars emission → custom Bun post-scaffold hooks`). Trio service templates (core/personal/business) + agent-docs + auth/audit scaffolds are live under `templates/`. The harness MUST stay Turborepo-compatible - Nx runs ONLY for generator invocations, never as a build system.

## Toolchain Registry

- Install: `bun install` (from `curaos/` root)
- Help: `bun run gen:service --help` / `bun run gen:package --help`
- Lock drift: `bun run gen:service-lock-check`
- Test: `bun test tools/codegen`
- Typecheck: `cd tools/codegen && bun run typecheck`
- Doc graph: `bun scripts/check-doc-graph.js` (from workspace root)
- Mirror doctor: `bash scripts/check-ai-mirror.sh` (from workspace root)

## Judgment Boundaries

- NEVER add `nx.json` at repo root (would make Nx act as a build system; Turborepo is canonical task runner).
- NEVER emit templates into `curaos/backend/services/` or `curaos/frontend/` in S1 - S2 owns template work.
- NEVER overwrite an existing `lefthook.yml`; emit only when absent (per D3).
- NEVER hard-code Verdaccio URL; read from `VERDACCIO_URL` env var (per D4).
- ASK before bumping `nx` past 21.x or `ts-morph` past 23.x (M6 user decisions pin these).
- ALWAYS preserve dispatch contract `service | package` - orchestrator scripts depend on it.
- ALWAYS run `bun run typecheck` + `bun test tools/codegen` before reporting done.
- ALWAYS accept inbound generator-evolution issues as the canonical input class for this module per [[curaos-generator-evolution-rule]]. When a worker files a `priority=critical` follow-up against `module=codegen`, pull it into the active milestone's ready queue ahead of bulk-shipping lanes. See `CONTEXT.md` "Known edge-case classes (intake log)" for the canonical record.
- NEVER accept a `template-divergence` fix that lands only in `templates/service-core/` without the same fix in `templates/service-personal/`, `templates/service-business/`, and any active vertical overlay template (`templates/service-healthstack-*/`, etc). Asymmetric template fixes → file a follow-up issue immediately.
- NEVER reduce coverage below ≥90% lines / ≥94% funcs threshold from the M6 close-gate baseline. Every generator-evolution PR adds a snapshot test under `__tests__/`.
- ALWAYS audit frontend↔backend parity when a backend template changes; either land the matching frontend template fix or document the documented-divergence reason in `CONTEXT.md` "Known edge-case classes" row.
- ALWAYS surface in-flight codegen lanes to the orchestrator. When an issue against this module carries `agent-claimed:*` OR `agent-PR-open`, downstream-milestone START is BLOCKED per [[curaos-generator-evolution-rule]] "In-flight generator/SDK barrier" section (user directive 2026-05-27). Same applies for in-flight `@curaos/*-sdk` and `@curaos/contracts` lanes. The orchestrator's pre-flight `gh search` query MUST return empty before any new milestone dispatch.

## Context Map

```yaml
monorepo: bun workspaces (workspaces[] includes tools/*)
task_runner: turborepo
nx_role: playbook orchestration only (no nx.json, no build/test/lint targets)
related:
  prior_generator: tools/generators/ (simple @clack/prompts CLI - superseded after M6-S2 template work)
  shared_tsconfig: backend/packages/tsconfig (@curaos/tsconfig)
  doc_graph: ai/curaos/docs/DOC-GRAPH.md (regen on every md change)
  ai_mirror: ai/curaos/tools/codegen/ (1:1 with curaos/tools/codegen/)
binding_decisions:
  d1_d6: hybrid Nx + @turbo/gen + Bun scripts
  d2_d5: ts-morph 23.x for AppModule auto-wiring + dual-mode doc emission
  d3_d4: lefthook emit-if-absent + VERDACCIO_URL env var
  d7: all 3 service layers (core/personal/business) - S2 work
```

## Personas Registry

- reviewer: gate stack-decision drift (sonnet tier) - confirms no `nx.json` bleed, no override of Turborepo
- worker: implementation passes for M6-S2+ template emission (sonnet tier)
