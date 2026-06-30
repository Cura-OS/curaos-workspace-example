---
name: curaos-backend
description: CuraOS backend workspace - NestJS microservices + shared libraries on Bun runtime.
tags: [index, backend]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - bun
  - nest-cli
  - turborepo
  - docker-compose
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
runtime: bun
build: turborepo
---

# curaos-backend

NestJS microservices + shared libraries on Bun runtime. TypeScript 5.x, Fastify adapter, Bun primary per [[curaos-bun-primary-rule]]. NestJS docs canonical source per [[curaos-nestjs-docs-first-rule]].

## Mandatory baseline

- **Runtime:** NestJS + TypeScript 5.x + Fastify adapter + Bun (Node 22 LTS fallback only when Bun cannot).
- **No JVM in foundation or neutral services.** JVM reserved for HealthStack sidecars (HAPI FHIR, Snowstorm, dcm4chee) - separate containers.
- **No hot-reload of core.** Extension = WASM plugin / NestJS microservice sidecar / event interceptor per [[curaos-runtime-decisions]].
- **Three-layer AuthZ** per workspace AGENTS.md §3: OPA-WASM (global) + Cerbos PDP sidecar (ABAC) + OpenFGA sidecar (ReBAC for PHI).
- **ORM 3-tier** per [[curaos-orm-rule]]: Drizzle default + MikroORM (HealthStack clinical only) + Kysely (analytics escape).
- **Validation 3-tier** per [[curaos-validation-rule]]: Zod 4 default + Valibot (RN escape) + ArkType (hot-path escape); class-validator BANNED for new code.

## Layout

```
curaos/backend/
├── packages/   # @curaos/* shared libs (workspace:*)
└── services/   # *-service microservices (each is a submodule)
```

Mirror under `ai/curaos/backend/` per [[curaos-ai-mirror-rule]].

## Module agent contract

This is the cross-CLI agent contract for the backend module. Frontmatter carries structured metadata (formerly `codex.json`). All CLI agents reading `AGENTS.md` (Codex, OpenCode, Cursor, Aider) consume natively; Claude Code via `@AGENTS.md` import. Read workspace `AGENTS.md` first.

## Companion documents

- [CONTEXT.md](CONTEXT.md) - current state
- [Requirements.md](Requirements.md) - module spec
