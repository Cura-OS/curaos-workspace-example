---
name: curaos-nestjs-docs-first-rule
title: NestJS docs-first
description: Agents MUST consult https://docs.nestjs.com/ first for NestJS features, examples, tools before any other source; live docs are canonical
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-24):

## The rule

**Before researching anything NestJS-related from any other source, agents MUST consult the live official NestJS docs at https://docs.nestjs.com/ FIRST.**

Applies to:
- Feature implementation (modules, controllers, providers, interceptors, guards, pipes, middleware, exception filters)
- Tool selection within NestJS ecosystem (microservices transports, queues, GraphQL drivers, ORM integrations)
- Examples + recipes (auth, validation, caching, file upload, SSE, WebSockets, testing)
- Configuration patterns (ConfigModule, EnvironmentVariables, DI scopes)
- CLI usage (`bunx @nestjs/cli`)
- Upgrade paths + deprecations

## How to apply

1. **First lookup = `https://docs.nestjs.com/<topic>`** - use WebFetch tool with the exact topic URL
2. **Search the docs site** when the path is unclear: site uses Algolia DocSearch, supports query params
3. **Cross-reference NestJS GitHub samples**: `https://github.com/nestjs/nest/tree/master/sample` for canonical examples
4. **Only AFTER docs are consulted**, expand research to:
   - Third-party packages (e.g., `@nestjs/cqrs`, `@nestjs/swagger`, `@nestjs/terminus`) - check their official docs
   - Trustworthy community sources (Marius Tibeica's blog, Trilon.io, Encore.dev, SigNoz blog, official NestJS YouTube)
   - Ecosystem reference implementations on GitHub w/ recent commit activity
5. **Cite docs.nestjs.com URLs first** in any research output, ADR, CONTEXT.md, or planning doc

## Behavior change

Every agent (Claude, Codex, Gemini, OpenCode, Cursor, Aider, …) MUST:
1. WebFetch docs.nestjs.com URL first when working on NestJS code
2. Skip the "let me Google this" reflex
3. Cite docs.nestjs.com in research output before any other source
4. Update this rule's framework list when adding new foundation deps that have authoritative live docs

<!-- fold: rationale, non-binding -->

## Why

- NestJS docs are versioned + maintained by core team + reflect current API surface
- Third-party blogs (Medium, dev.to, freeCodeCamp, etc.) often lag versions, contain anti-patterns, or omit edge cases
- Stack Overflow answers often pre-date current best practice
- Agent training data has a cutoff; live docs do not
- Saves cycles: most NestJS questions are answered authoritatively at docs.nestjs.com - checking there first prevents wrong patterns from entering the codebase

## Common docs.nestjs.com sections agents must know

- `/first-steps` - installation, scaffolding, CLI
- `/controllers` + `/providers` + `/modules` - core abstractions
- `/fundamentals/{custom-providers,async-providers,dynamic-modules,injection-scopes,circular-dependency,module-ref,lazy-loading-modules,execution-context,lifecycle-events,platform-agnosticism,testing}` - advanced patterns
- `/techniques/{configuration,database,mongodb,validation,caching,serialization,versioning,task-scheduling,queues,logger,cookies,events,compression,file-upload,streaming-files,http-module,session,model-view-controller,performance,server-sent-events}` - built-in solutions
- `/security/{authentication,authorization,encryption-and-hashing,helmet,cors,csrf,rate-limiting}` - sec patterns
- `/microservices/{basics,redis,mqtt,nats,rabbitmq,kafka,grpc,custom-transport,exception-filters,pipes,guards,interceptors}` - distributed
- `/graphql/quick-start` + subpages - GraphQL setup
- `/websockets/gateways` - WS
- `/openapi/{introduction,types-and-parameters,operations,security,mapped-types,decorators,cli-plugin,other-features}` - OpenAPI
- `/cli/{overview,usage,scripts}` - `@nestjs/cli` tooling (always invoke via `bunx @nestjs/cli` per [[curaos-bun-primary-rule]])
- `/recipes/{automock,passport,cqrs,prisma,sentry,terminus,nest-commander,async-local-storage,necord,serve-static,mikroorm,sql-typeorm,mongodb,suites}` - recipes
- `/devtools/overview` - NestJS Devtools UI
- `/standalone-applications` + `/faq/*` - operational

## Examples of right-vs-wrong order

| Task | Wrong | Right |
|---|---|---|
| Add validation pipe | Google "NestJS validation Zod" → blog from 2022 | docs.nestjs.com/techniques/validation FIRST → then docs/pipes → then check zod-nestjs / nestjs-zod README |
| Setup Kafka microservice | StackOverflow answer | docs.nestjs.com/microservices/kafka FIRST → then @nestjs/microservices source |
| OpenAPI swagger UI | dev.to tutorial | docs.nestjs.com/openapi/introduction FIRST → then plugin source |
| Background queue | medium article on BullMQ | docs.nestjs.com/techniques/queues FIRST → then @nestjs/bullmq docs |
| Testing controllers | Jest tutorial | docs.nestjs.com/fundamentals/testing FIRST → then test sample in nest GitHub repo |

## How to apply to ADRs + research

- When writing or updating any ADR touching NestJS, cite docs.nestjs.com as primary source
- When invoking `compound-engineering:ce-web-researcher` or any research subagent for NestJS topics: prompt MUST include "consult docs.nestjs.com FIRST then expand"
- When generating recipes via Codegen Engine (per ADR-0123): recipe templates reference docs.nestjs.com sections, not blog posts
- When user asks "how do I do X in NestJS" - answer derives from docs.nestjs.com URL; if docs unclear, escalate to NestJS GitHub Discussions

## Same principle for other foundation frameworks

This rule's pattern (live official docs FIRST) applies to other CuraOS foundation deps too:
- React → `https://react.dev/`
- React Native + Expo → `https://docs.expo.dev/` + `https://reactnative.dev/`
- Next.js → `https://nextjs.org/docs`
- Astro → `https://docs.astro.build/`
- Bun → `https://bun.com/docs`
- Turborepo → `https://turborepo.dev/docs`
- TypeSpec → `https://typespec.io/docs/`
- Temporal → `https://docs.temporal.io/`
- HAPI FHIR → `https://hapifhir.io/`
- Kafka → `https://kafka.apache.org/documentation/`
- NATS → `https://docs.nats.io/`

When a rule for one of these gets formalized as its own memory file, add it there. For now: agents apply the pattern broadly.
