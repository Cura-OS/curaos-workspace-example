---
name: curaos-foundation-runtime-directives
title: Foundation runtime directives (NestJS)
description: ADR-0100 final - all 4 foundation products in NestJS; OSS imports as sidecars; codegen = target + cookbook
metadata: 
  node_type: memory
  type: project
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User-confirmed directives (2026-05-24, ADR-0100 redo funnel):

## ALL 4 foundation products = NestJS (TypeScript family)

| Foundation product | CuraOS core runtime | OSS imports as sidecars/services |
|---|---|---|
| Auth | NestJS (TS) | Keycloak (Java/Quarkus) |
| App/Site Builder | NestJS (TS) + Next/Astro for builder UI | GrapesJS (browser), Directus (Node), Payload (Node) |
| Workflow Manager | NestJS (TS) | Temporal (Go server) via TS SDK; optional Kestra sidecar |
| Codegen Platform | NestJS (TS) | OpenAPI Gen (Java), AsyncAPI Gen (Node), sqlc (Go), Buf (Go), Atlas (Go) - invoked as CLI |

**Why NestJS:**
- Opinionated modules + decorators + DI + interceptors (built-in!) - interceptor pattern is NATIVE, not bolted on
- TypeScript ecosystem coverage (templating, AI agents, Builder UI, codegen)
- AI-agent friendliness (largest pool of TS-trained agents/MCP servers)
- Single language across all 4 foundation products = maximum coherence
- Tight loop with Builder + Codegen (shared types via tRPC or shared schemas)
- Sellable each foundation product standalone (NestJS module structure aligns with product boundaries)

**Trade-offs accepted:**
- Higher RAM than Go/Rust (mitigated by Bun runtime + sidecar OSS for hot paths)
- Slower than Go for raw throughput (mitigated by routing high-throughput work to sidecars/Temporal)
- Polyglot reduced to ONE family (TS); OSS imports stay in their native runtimes as sidecars

## ADRs

ADR-0100 (`0100-foundation-platform-runtime.md`) and ADR-0123 (`0123-foundation-codegen-plugin.md`) are filed. Plugin runtime is decided in ADR-0123. Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for current status of each.

## Foundation = mold

Once all 4 foundation products at v1: they become the mold. Downstream services (~80 neutral capabilities + ~20 vertical) generated via Codegen → target stack TBD per cookbook recipe (could be NestJS for many, Go/Rust/Kotlin for specialists).

<!-- fold: rationale, non-binding -->

## Codegen architecture = "Target + Cookbook" (SAME pattern for BOTH UI and Backend)

User: "backend codegen is teh same as ui we produce the target and a cookbook for future generators to plugin on teh cookbook and generate the same code logic in different languages and/or frameworks"

**Universal codegen design (applies to backend AND frontend AND data AND events):**

1. **Engine** = NestJS app that takes (spec, cookbook recipe, target) → emits code
2. **Cookbook** = versioned plugin library; each recipe = language/framework target

**Phase 1 targets (initial cookbook entries):**
| Layer | Phase 1 target | Future cookbook entries |
|---|---|---|
| Backend service | NestJS (TS) | Kotlin+Quarkus, Go+Echo, Rust+Axum, Java+Spring, Python+FastAPI, PHP+Laravel, C#+ASP.NET |
| Frontend UI | React+Next (web) | Flutter, KMP+Compose, Vue+Nuxt, SvelteKit, Astro, SwiftUI, Jetpack Compose |
| Data layer | sqlc/Prisma (TS) | JOOQ, GORM, Atlas, Diesel, SQLAlchemy |
| API spec | OpenAPI 3.1 | AsyncAPI, GraphQL SDL, Buf proto |
| Event binding | NestJS+Kafka/NATS | Spring Cloud Stream, NATS Go SDK, Inngest, Trigger.dev |
| Tests | Vitest/Playwright | JUnit, pytest, Go testing, Rust cargo test |
| Interceptor scaffold | NestJS interceptor module | Spring AOP, Go middleware, Rust tower middleware |

**Cookbook format:** directory structure following Backstage Software Templates pattern:
- `recipe.yaml` (manifest: inputs/outputs/dependencies/target)
- `template/` (Handlebars/EJS/Nunjucks templates)
- `scripts/` (post-gen hooks)
- versioned per recipe, semantic-versioned via cookbook registry

**Tenant + community extensibility:**
- Tenant can install custom recipes (per-tenant cookbook overlay)
- Community recipes published to public cookbook registry (like npm/Helm Hub)
- Recipes signed (cosign) - supply chain trust
