# ADR-0100 (REDO) — Foundation Platform Runtime

> **Open Questions resolution (2026-05-25, all RESOLVED per DA1-DA13):**
> - Q1 NestJS runtime (Node vs Bun) → **RESOLVED** by [[curaos-bun-primary-rule]] (Bun primary; Node 22 LTS fallback only when Bun cannot)
> - Q2 Monorepo manager → **RESOLVED** by [[curaos-speed-patterns-rule]] DA12 (Turborepo task runner + Nx generators + Bun workspaces)
> - Q3 GraphQL stack → **RESOLVED (DA13 Q1)** — **Cosmo Router (Apache 2.0 federation supergraph) + per-service @nestjs/graphql Apollo subgraphs**. Self-hosted Cosmo control plane on K3s per [[curaos-orchestration-rule]]; air-gap-safe per [[curaos-airgap-rule]]. See ADR-0103 §GraphQL.
> - Q4 tRPC scope → **RESOLVED (DA13 Q2)** — **Internal-only** (tRPC v11+ for service↔service typed RPC); external/partner APIs use TypeSpec→OpenAPI 3.1 → @hey-api/openapi-ts SDKs per [[curaos-speed-patterns-rule]]. Cleanest separation; partners get standard OpenAPI; internal devs get zero-friction types.
> - Q5 Keycloak optional plugin → **DEFERRED-V2** per ADR-0120
> - Q6 Specialist tier first invocation → **RESOLVED (DA13 Q8)** — **TS-only core for v1; per-tool best framework/language as concrete hot path emerges** (Phase 4 reassess). Lowest cognitive load; matches solo-dev capacity.
>
> See [RESOLUTION-MAP.md](RESOLUTION-MAP.md) for full open-question index.

**Status:** Accepted (supersedes previous ADR-0100 draft)
**Date:** 2026-05-24
**Supersedes:** `0098-archived-backend-runtime-research.md` (kept in tree marked DRAFT; this file replaces its recommendation)
**Companion:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
**Cascades to:** ADRs 0120 (Auth), 0121 (Builder), 0122 (Workflow), 0123 (Codegen)

---

## 1. Context

Per ADR-0099 §12 build sequence, **Phase 1** is to lock the runtime that hosts the four **foundation products**:

| # | Foundation product | Role |
|---|---|---|
| 1 | **Auth / IdP** | Standalone SaaS Auth product + identity layer for everything else |
| 2 | **App / Site Builder** | Standalone low-code/no-code product + UI generator for downstream services |
| 3 | **Workflow Manager** | Standalone workflow/automation product + orchestration spine for cross-service flows |
| 4 | **Codegen Platform** | Standalone code/UI generator + the actual "injection mold" that produces downstream services |

These four are the **mold**. Once strong, they produce the rest of CuraOS with minimal manual coding.

Each product wraps mature OSS as **sidecars or services running alongside** (per ADR-0099 §6 stable-core + plugin/sidecar pattern). CuraOS core code per product = thin extension layer adding multi-tenancy, audit, branding, interceptor hooks, billing integration, plugin/sidecar registration.

---

## 2. Decision

**All four foundation products use NestJS (TypeScript) as the core runtime.**

OSS imports run alongside as sidecars in their native runtimes:

| Foundation product | CuraOS core | OSS imports (libraries / sidecars) |
|---|---|---|
| Auth | **NestJS** | Better Auth + SimpleWebAuthn + node-saml + Passport + scim-patch + fhirclient-js + jose (all TS/Node libs; per ADR-0120) — NO Keycloak in v1 |
| App/Site Builder | **NestJS** + Next/Astro for builder UI | GrapesJS (browser) + Payload CMS (Node) + AppSmith (sidecar) + Lit + Formily + Puck + @xyflow/react + Yjs/Hocuspocus (per ADR-0121) |
| Workflow Manager | **NestJS** | Temporal server (Go binary) via Temporal TS SDK + nestjs-temporal-core; Activepieces (Node, embedded/sidecar) + @nestjs/schedule + BullMQ (per ADR-0122) |
| Codegen Platform | **NestJS** | OpenAPI Gen (CLI invoke) + AsyncAPI Gen (Node) + sqlc/Buf/Atlas (CLI invoke) + Nunjucks/Handlebars/EJS template engines + Wasmtime via napi-rs + isolated-vm + Cerbos/OPA/SpiceDB (per ADR-0123) |

---

## 3. Rationale (mapped to ADR-0099 weights)

### 3.1 AI-agent friendliness (weight 5.0)

- TypeScript has the **largest pool of training data** for AI agents (Claude, Codex, Cursor, etc.). Agent code-gen + modification reliability is highest here in 2026.
- NestJS structure (modules, controllers, services, interceptors, guards, pipes) is **opinionated + predictable** — agents reason from convention.
- Strong static types via TypeScript 5.x + tRPC + Zod → agents catch errors at edit time, not runtime.
- Largest MCP server ecosystem currently authored in TS — CuraOS services exposing MCP surfaces benefit.

### 3.2 Developer experience tight loop (weight 4.8)

- Hot-reload built into Node/Nest CLI (`nest start --watch`) — sub-second feedback during dev.
- Shared types across **all four foundation products** + their UIs (Next, Astro, React) via tRPC or shared TS package — end-to-end type safety, AI agents reason across the whole stack.
- Bun runtime option for 2–3× perf at parity with Node API.
- Test infra mature: Vitest, Jest, Playwright — all native to TS.

### 3.3 Mainstream stack for hiring (weight 3.6)

- TypeScript is consistently #1 on Stack Overflow Developer Survey (2024 + 2025) — broadest hiring pool when CuraOS scales beyond solo + agents.
- NestJS specifically has strong enterprise adoption (Adidas, Roche, Capgemini, Decathlon) — credible for HIPAA-grade buyers.

### 3.4 Interceptor pattern (native, not bolted on)

- NestJS ships **Interceptors** as a first-class concept (`@Injectable @UseInterceptors`) — maps directly to ADR-0099 §6 event-interceptor framework.
- Guards + Pipes complement interceptors for auth + validation cross-cutting concerns.
- This is unmatched in Go/Rust/Kotlin frameworks at the same out-of-box level.

### 3.5 Each-service-as-product economics (ADR-0099 §4)

- NestJS module structure aligns 1:1 with product boundaries — each foundation product = self-contained NestJS app, sellable standalone, packaged + branded independently.
- Module-per-tenant-customization pattern is idiomatic.

### 3.6 OSS sidecar / library fit

- **Auth** (per ADR-0120) — pure NestJS composition: Better Auth + SimpleWebAuthn + node-saml + Passport + scim-patch + jose + fhirclient-js. NO Keycloak in v1 (deferred to v2/v3 as optional plugin).
- **Temporal** (Go server) — Temporal TS SDK is official + mature. Worker + workflow client both first-class in TS.
- **GrapesJS / Payload / AppSmith / @xyflow/react** — all native Node/browser; zero impedance. AppSmith runs as sidecar service.
- **HAPI FHIR / Snowstorm / dcm4chee** (per ADR-0115) — JVM sidecars wrapped by NestJS HealthStack core via HTTP/admin REST; HealthStack overlay only.
- **Codegen sidecar CLIs** (OpenAPI Gen, AsyncAPI Gen, sqlc, Buf, Atlas) — invoked via `child_process` or REST adapters; no language mismatch matters since they're black-box generators.

### 3.7 Charter constraints (ADR-0099 §9) satisfied

| Constraint | Satisfaction |
|---|---|
| Self-hosted first | Node + Bun ship as single binary or container; no managed-cloud lock-in |
| Air-gap support | Offline install via pre-built Docker images + npm registry mirror (Verdaccio) |
| Multi-tenant | NestJS modules + tenant interceptor + per-tenant DB schema pattern (proven in production) |
| HIPAA + GDPR | TS + NestJS deploys at Roche, large EU health tech firms; mature audit + structured logging stacks |
| License | NestJS = MIT, Node = MIT, Bun = MIT, TypeScript = Apache 2.0 — clean for SaaS distribution |

---

## 4. Codegen architecture (universal pattern, same for UI and Backend)

Per user directive: "backend codegen is the same as UI — we produce the target and a cookbook for future generators to plugin on the cookbook and generate the same code logic in different languages and/or frameworks."

### Two-layer design

1. **Engine** (NestJS app) — takes `(spec, recipe, target) → emitted code`. Stateless. CLI + REST + GraphQL surfaces.
2. **Cookbook** (versioned recipe library) — each recipe = `(language, framework)` target. Recipes are pluggable; community + tenants contribute.

### Phase 1 cookbook entries

| Layer | Phase 1 target | Cookbook key for future entries |
|---|---|---|
| Backend service | **NestJS (TS)** | `backend.nestjs`, future: `backend.spring`, `backend.go-echo`, `backend.rust-axum`, `backend.fastapi`, `backend.laravel`, `backend.aspnet` |
| Frontend UI | **React + Next (web)** | `ui.react-next`, future: `ui.flutter`, `ui.kmp-compose`, `ui.vue-nuxt`, `ui.sveltekit`, `ui.astro`, `ui.swiftui` |
| Data layer | **Drizzle / MikroORM / Kysely** | `data.drizzle`, `data.mikroorm-clinical`, `data.kysely-analytics`; Prisma off-default only with service-local justification per [[curaos-orm-rule]] |
| API spec | **OpenAPI 3.1** | `api.openapi`, `api.asyncapi`, `api.graphql-sdl`, `api.buf-proto` |
| Event binding | **NestJS + Kafka/NATS** | `events.nestjs-kafka`, `events.spring-cloud-stream`, `events.nats-go`, `events.inngest` |
| Tests | **Vitest + Playwright** | `tests.vitest`, `tests.junit`, `tests.pytest`, `tests.cargo` |
| Interceptor scaffold | **NestJS interceptor module** | `interceptor.nestjs`, `interceptor.spring-aop`, `interceptor.go-middleware` |

### Cookbook format

Pattern inspired by Backstage Software Templates:

```
cookbook/
  backend.nestjs/
    recipe.yaml           # inputs, outputs, deps, target metadata
    template/             # Handlebars/EJS/Nunjucks templates
    scripts/              # post-gen hooks (npm install, atlas migrate, etc.)
    tests/                # smoke tests for the recipe itself
  ui.react-next/
    ...
  data.drizzle/
    ...
```

- Versioned per recipe (semver)
- Tenant overlays (per-tenant cookbook adds custom recipes)
- Public community registry (npm-like) for sharing recipes
- Recipes signed via cosign (supply chain trust)

### Forward + backward engineering

- **Forward:** spec/schema/event → emit code in chosen target via cookbook recipe
- **Backward:** existing DB/API → reverse-engineer to typed spec + models via Atlas + introspection
- **Round-trip:** spec ↔ code stays in sync; diffs flagged in CI

---

## 5. Tradeoffs accepted

| Concern | Mitigation |
|---|---|
| Node RAM per service (~150–300MB at JIT) | Bun runtime (~60–80MB cold), sidecar OSS for hot paths, K8s right-sizing |
| Single-threaded event loop | Cluster mode + worker_threads for CPU-heavy; Temporal/Kestra sidecar handles long-running orchestration off the main loop |
| Polyglot reduced to ONE family | OSS sidecars stay in native runtimes (Temporal Go server, HAPI FHIR JVM for HealthStack only); CuraOS code = TS only. Auth is fully NestJS-native per ADR-0120 (no JVM in foundation Auth). |
| TS perf below Go/Rust | High-perf paths delegated to sidecars (Temporal Go server, optional Rust specialist services later) |
| TS bundle for air-gap | Verdaccio mirror + offline npm install + Docker layer caching solves this |

---

## 6. Specialist tier (for downstream services, not foundation)

Foundation products = NestJS, period.

Downstream services produced by the Codegen mold may use **other targets via cookbook recipes** when warranted:

- **Go specialist** — high-throughput orchestration glue, lightweight infra services
- **Rust specialist** — DICOM streaming, ML inference pre-processing, real-time audio/video, high-perf event ingestion
- **Kotlin specialist** — when JVM ecosystem (e.g., HAPI FHIR, dcm4chee, Pathling) needs deep custom integration beyond sidecar
- **Python specialist** — ML/data-science workloads, scientific computing

These are **opt-in via cookbook recipes**, not the default. The default downstream service target = NestJS, matching foundation.

---

## 7. Implementation milestones

| Milestone | Deliverable |
|---|---|
| M1 | NestJS monorepo scaffold (Nx or Turborepo) with 4 product workspaces |
| M2 | Shared CuraOS NestJS module library (tenant interceptor, audit interceptor, OpenTelemetry tracing, RBAC guards, error filters) |
| M3 | Auth product v0 — NestJS shell + Better Auth + tenant routing (per ADR-0120) |
| M4 | Builder product v0 — NestJS shell + GrapesJS canvas + Directus integration + Next builder UI |
| M5 | Workflow product v0 — NestJS shell + Temporal TS SDK + visual flow editor (Reactflow) |
| M6 | Codegen product v0 — NestJS engine + cookbook scaffolder + Phase 1 recipes (backend.nestjs, ui.react-next, data.drizzle) |
| M7 | First foundation-generated downstream service (proves the mold works) |
| M8 | Air-gap install bundle (per ADR-0109) for all four foundation products + sidecars |

---

## 8. Plugin runtime (deferred to ADR-0123)

Per ADR-0099 §6, the plugin layer pattern is WASM-leaning + sidecar pattern. Detailed decision lives in ADR-0123 (Codegen + Plugin/Sidecar/Interceptor Architecture). Likely outcome:

- **In-process plugins:** WASM Component Model (Wasmtime via `@wasmer/sdk` or `wazero` proxy)
- **Out-of-process plugins:** NestJS micro-service sidecar over gRPC/Unix-socket (NestJS has built-in microservice transports)
- **Event interceptors:** NestJS Interceptors registered per-event-topic, chained per tenant config

---

## 9. Cascades to other ADRs

Existing ADRs 0101–0115 (marked DRAFT per ADR-0099 §17) must be re-evaluated under NestJS-foundation baseline:

| Existing ADR | Likely impact |
|---|---|
| 0101 Data layer | Mostly stands (PG17 + Valkey + SeaweedFS) — TS clients exist (`pg`, `ioredis`, `@aws-sdk/client-s3` for SeaweedFS). Drizzle/MikroORM/Kysely per [[curaos-orm-rule]]. |
| 0102 Events | Kafka/NATS clients in TS mature (`kafkajs`, `nats.js`); Jobrunr replaced by NestJS BullMQ or Temporal; Debezium unchanged. |
| 0103 API | Spring MVC/DGS picks replaced by NestJS REST + Apollo Server / Mercurius for GraphQL; APISIX gateway unchanged. |
| 0104 Identity | SUPERSEDED by ADR-0120 — pure NestJS Auth (Better Auth + SimpleWebAuthn + SAML + Passport + SCIM + ported SMART-on-FHIR + 3-layer AuthZ). No Keycloak in v1. |
| 0105 BPM | Flowable replaced by Temporal + Kestra (TS SDK + sidecar); BPMN deprecated per ADR-0099. |
| 0106 Frontend | React+Next + Flutter + Astro stand; Lit web-components for builder output stand. |
| 0107–0115 | Mostly stand at infra level; client libraries shift to TS where applicable. |

Per-ADR re-evaluation in subsequent task #57.

---

## 10. Open questions (resolved in subsequent ADRs)

1. **NestJS runtime** — Node 22 LTS or Bun? Decision in ADR-0123 (likely Bun once benchmarks confirm parity for our load).
2. **Monorepo manager** — Turborepo on top of Bun workspaces (decided post-ADR-0209, Wave 6 frontend scaffold). Bun is primary package manager + script runner; pnpm fallback only when a tool hard-codes pnpm assumptions.
3. **GraphQL stack on NestJS** — Apollo Server (NestJS GraphQL module) vs Mercurius vs Yoga vs Cosmo federation supergraph. Decision when ADR-0103 re-evaluated.
4. **tRPC vs OpenAPI for internal RPC** — both? tRPC for internal end-to-end-typed; OpenAPI for external partner integrations. Likely both.
5. **Keycloak-as-optional-plugin** — when (if ever) do enterprise customers need it? Deferred to v2/v3 per ADR-0120.
6. **Specialist tier first invocation** — which downstream service triggers our first Go or Rust cookbook recipe? Probably DICOM (HealthStack imaging) or real-time observability ingestion.

---

## 11. References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [Research doc — 0099 vision OSS landscape](../research/0099-vision-oss-landscape.md)
- [Previous ADR-0100 draft (recommendation superseded)](0098-archived-backend-runtime-research.md)
- NestJS docs: https://docs.nestjs.com/
- Temporal TS SDK: https://docs.temporal.io/develop/typescript
- Better Auth: https://better-auth.com/ (per ADR-0120)
- Bun: https://bun.sh/
- Backstage Software Templates pattern: https://backstage.io/docs/features/software-templates/

---

## 12. Status of previous ADR-0100

The file `0098-archived-backend-runtime-research.md` remains in the tree, marked DRAFT, as research history (its option scan + tradeoff analysis are useful artifacts). Its **recommendation** (Kotlin + Spring Boot 3.4) is **superseded by this file**.
