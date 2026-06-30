---
name: curaos-validation-rule
title: Validation (Zod 4 / Valibot / ArkType 3-tier)
description: 3-tier validation strategy - Zod 4 default; Valibot escape for bundle-sensitive RN apps; ArkType escape for proven hot paths; class-validator BANNED for new code
paths:
  - "curaos/backend/**/*.dto.ts"
  - "curaos/backend/**/dto/**"
  - "curaos/backend/packages/*contracts*/**"
  - "curaos/**/*.schema.ts"
  - "curaos/frontend/**/forms/**"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-2 walkthrough of research digest):

## The rule

CuraOS uses a **3-tier validation strategy** for all DTO/contract/runtime validation:

| Tier | Tool | Use for |
|---|---|---|
| Default | **Zod 4** | Every new NestJS service DTO; ts-rest contracts; Drizzle column schemas (`drizzle-zod`); OpenAPI gen (`zod-to-openapi` / `nestjs-zod`); frontend web validation (React Hook Form, TanStack Form resolvers); tRPC procedures |
| Bundle escape | **Valibot** | React Native apps under `frontend/apps/personal-*` AND `frontend/apps/clinician-app|patient-app` ONLY IF a bundle-size audit proves Zod hurts perceived TTI; otherwise stay Zod for one-source-of-truth |
| Hot-path escape | **ArkType** | A service hitting >1M validations/min AND profiling proves Zod 4 is the bottleneck; not speculative use |
| **BANNED for new code** | **class-validator** + class-transformer | Unmaintained 2+ years; no Zod-style inference; explicit override of NestJS docs default |

**Existing services on class-validator**: no forced migration. Migrate when service is touched naturally OR when refactor is otherwise on the table.

## NestJS docs override

[curaos_nestjs_docs_first_rule.md](curaos_nestjs_docs_first_rule.md) says agents consult docs.nestjs.com FIRST. Those docs still list class-validator as the default ValidationPipe. **This rule overrides:** for new services, ignore the docs.nestjs.com class-validator example; use Zod 4 via `nestjs-zod`.

## Mandatory bridge libraries

| Concern | Lib |
|---|---|
| NestJS ValidationPipe → Zod schema | `nestjs-zod` |
| @nestjs/swagger OAS gen from Zod | `nestjs-zod` (until upstream `@nestjs/swagger` ships native Zod per issue nestjs/nest#15988) |
| Drizzle column → Zod schema | `drizzle-zod` |
| ts-rest contract → Zod (direct, native) | `@ts-rest/core` |
| React Native form resolver | `@hookform/resolvers/zod` |
| TanStack Form resolver | `@tanstack/zod-form-adapter` |
| Valibot drop-in (when used) | `@hookform/resolvers/valibot`, `drizzle-valibot`, `valibot-to-openapi` |

## Per-package declaration

Every service `AGENTS.md` frontmatter declares its validator:

```yaml
validation: zod | valibot | arktype
```

If absent, agents assume Zod 4. Use `valibot` or `arktype` ONLY w/ a recorded justification in the same service's `Requirements.md`.

## How to apply

- New service scaffolds (Codegen Engine per ADR-0123): default template uses Zod 4
- Codegen recipes: ship Zod 4 schemas inferred from TypeSpec model or Drizzle column types
- Existing class-validator services: no forced migration; migrate on next non-trivial refactor
- Shared `@curaos/*` packages exporting validation schemas: Zod 4 (so frontend + backend reuse without bundle penalty until Valibot proven necessary)
- AI-agent test scaffolds: assertion factories generate from Zod schemas via `zod-fixture` or `fishery`+`zod` adapters

<!-- fold: rationale, non-binding -->

## Why Zod 4 wins as default

- **Ecosystem leader**: ts-rest, tRPC, Drizzle (`drizzle-zod`), React Hook Form, TanStack Form, OpenAPI generators all integrate natively
- **Codegen pipeline glue**: TypeSpec → Zod emitter exists; Drizzle column → Zod schema → ts-rest contract → OAS spec → frontend client = ONE source of truth, zero hand-written types
- **Agent-friendly**: huge training data 2025-2026; rich error messages w/ path; `z.infer<typeof schema>` static type extraction means agents read one file
- **Perf**: 17.7KB bundle, 1.25M ops/s simple parse - ample for server-side workloads
- **Composability**: `.extend()`, `.partial()`, `.omit()`, `.pick()` patterns map cleanly to DTO derivations agents need
- **MCP server available** for live agent introspection of schemas

## Why class-validator is banned for new code

- Effectively unmaintained (last meaningful update >2 years per npm history per research 02 §3)
- Decorator-based: agents struggle w/ metadata reflection edge cases under SWC compiler
- No type inference - must write DTO class twice (decorators + TS interface)
- class-transformer (its required companion) is also unmaintained + slow
- Forces class instances at runtime → extra serialization layer

## Update needed in ADRs

Per digest §6:
- **New ADR-0131**: full validation strategy doc; this rule = short form
- **ADR-0099**: add "Validation strategy" subsection pointing to ADR-0131 + this rule
- Codegen Cookbook recipes (per ADR-0123) need a "validation library" parameter; default = `zod-4`, alternates = `valibot`, `arktype`

## Agentic-tool friendliness

Why Zod 4 wins for AI-agent workflows specifically:
- Schema lives in one TS file; agents read it + infer types via `z.infer<>` - no second declaration to keep in sync
- Errors include path (`['user', 'address', 'zip']`) - agents debug schema mismatches without log spelunking
- Composes via methods (`.extend`, `.partial`, `.pick`) - agents reuse + derive variants without copy-paste drift
- Codegen pipeline: TypeSpec model → Zod → Drizzle → ts-rest → OAS → frontend client; agents touch ONE spec, everything regens
- Largest 2025-2026 training corpus among current-gen TS validators; agent hallucinations rare
