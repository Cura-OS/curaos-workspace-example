# ADR-0123 — Foundation Product: Codegen Platform + Plugin/Sidecar/Interceptor Architecture

> **Open Questions resolution (2026-05-25):** Cross-recipe composition → **RESOLVED-ADR** (Backstage Templates pattern). Dapr mandatory → **RESOLVED-ADR** (optional sidecar). Recipe distribution registry + AI-fill quality + versioning conflicts + Plugin SDK packaging → **DEFERRED-MILESTONE** (M6 codegen platform kickoff). Generator-first culture overall → **RESOLVED-RULE** ([[curaos-speed-patterns-rule]] DA12). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
**Companion research:** [`../research/0123-codegen-plugin-research.md`](../research/0123-codegen-plugin-research.md)
**Sibling foundation ADRs:** [0120 Auth](0120-foundation-auth.md), [0121 Builder Suite](0121-foundation-builder.md), [0122 Workflow Manager](0122-foundation-workflow-manager.md)

---

## 1. Context

CuraOS Codegen + Plugin Architecture is the **fourth and most strategic** foundation product. Per ADR-0099 injection-molding metaphor:

- **Codegen** is the **mold-maker** — it generates the downstream services + UIs + integration code that compose CuraOS.
- **Plugin/Sidecar/Interceptor** architecture is the **runtime extension fabric** — how every foundation product (and downstream service) accepts tenant + business customization without core code edits.

Per ADR-0100: pure NestJS core. Per ADR-0099 §6: stable-core + plugin/sidecar/event-interceptor pattern (NOT hot-reload of core). Per ADR-0099 §8: codegen as "Engine + Cookbook" with same pattern for backend AND UI AND data AND events.

Per user directive (from ADR-0123 interview): multi-template-engine support, multi-cookbook-format support, three-layer plugin runtime, four-layer interceptor + policy.

---

## 2. Decision summary — Codegen Platform

| Decision | Pick |
|---|---|
| **Engine runtime** | NestJS (TS) — per ADR-0100 |
| **Template engines (multi)** | Nunjucks (default, Jinja2-identical, AI-agent native) + Handlebars + EJS — recipe declares its engine |
| **Cookbook formats (multi)** | Backstage Software Templates pattern (primary) + Plop generators format + (custom CuraOS format deferred to v2) |
| **Recipe registry** | OCI artifacts (cosign-signed) — leverages existing Harbor registry per ADR-0109 |
| **Round-trip pattern** | `.gen.ts` file split convention (Prisma + GraphQL Codegen pattern) — Engine never touches non-`.gen.ts` files |
| **Multi-tenant cookbook** | Per-tenant cookbook overlay on top of base cookbook |
| **AI-agent integration** | MCP server exposing cookbook query + generate operations |
| **Output targets (Phase 1)** | NestJS backend + React+Next UI + Prisma data + OpenAPI/AsyncAPI specs + Vitest tests + Temporal workflow + Activepieces flow + NestJS interceptor + WASM plugin shell + NestJS sidecar shell |

---

## 3. Decision summary — Plugin / Sidecar / Interceptor

| Decision | Pick |
|---|---|
| **Plugin runtime (three layers, all OSS)** | (1) WASM Component Model via Wasmtime (Rust napi-rs N-API addon `@curaos/wasmtime-runtime`); (2) NestJS Microservice sidecar over NATS transport (per ADR-0102); (3) isolated-vm for simple tenant JS rules |
| **Sidecar backbone (optional)** | Dapr (Apache 2.0, CNCF Graduated) for portability building blocks (state/pubsub/secrets/bindings/actors) — recommended adopt, not mandatory |
| **Interceptor framework** | NestJS Interceptors (native) on every service + event-bus interceptor abstraction wrapping Kafka/NATS consumers |
| **Policy layer (four layers, per ADR-0120)** | NestJS Interceptors + Cerbos (ABAC, <1ms embedded) + OPA-WASM (global complex rules) + SpiceDB (ReBAC for PHI) |
| **Tenant plugin install** | OCI artifact via Harbor + cosign signature verification |
| **Tenant plugin sandbox** | WASM fuel + epoch deadline per tenant store; sidecar resource quotas via K8s LimitRange |
| **Audit on plugin invocation** | NestJS Interceptor wraps every plugin call → hash-chain PG (per ADR-0104) |

---

## 4. Codegen architecture

```
┌────────────────────────────────────────────────────────────────┐
│  CuraOS Codegen Engine (NestJS app)                            │
│                                                                │
│  CLI ──▶ REST API ──▶ GraphQL API ──▶ MCP Server               │
│                                                                │
│      ┌──────────────────────────────────────────┐              │
│      │   Spec parser (OpenAPI / AsyncAPI /      │              │
│      │   GraphQL SDL / Buf proto / SQL / IR)    │              │
│      └────────────────┬─────────────────────────┘              │
│                       │                                        │
│      ┌────────────────▼─────────────────────────┐              │
│      │  Recipe loader (cookbook registry)       │              │
│      │  - Backstage Software Templates format   │              │
│      │  - Plop generators format                │              │
│      │  - OCI artifact + cosign verify          │              │
│      └────────────────┬─────────────────────────┘              │
│                       │                                        │
│      ┌────────────────▼─────────────────────────┐              │
│      │  Template engine dispatcher              │              │
│      │  - Nunjucks (default, AI-agent friendly)│              │
│      │  - Handlebars                            │              │
│      │  - EJS                                   │              │
│      └────────────────┬─────────────────────────┘              │
│                       │                                        │
│      ┌────────────────▼─────────────────────────┐              │
│      │  Action runner (post-template hooks)     │              │
│      │  - npm install / atlas migrate /         │              │
│      │    cargo build / prisma generate /       │              │
│      │    openapi-generator-cli invoke          │              │
│      └────────────────┬─────────────────────────┘              │
│                       │                                        │
│      ┌────────────────▼─────────────────────────┐              │
│      │  Output writer                           │              │
│      │  - .gen.ts files (Engine-managed)        │              │
│      │  - protected regions for user code       │              │
│      │  - diff-aware (no overwrite of edits)    │              │
│      └──────────────────────────────────────────┘              │
└────────────────────────────────────────────────────────────────┘
```

### Cookbook format (Backstage Software Templates pattern adapted)

```
cookbook/
  backend.nestjs/
    recipe.yaml             # manifest: inputs (Zod-validated), outputs, deps, target, engine
    skeleton/               # template files (Nunjucks by default)
      src/{{name}}.module.ts.njk
      src/{{name}}.controller.ts.njk
      src/{{name}}.service.ts.njk
      ...
    actions/                # post-template hooks
      install.sh
      lint.sh
      test.sh
    tests/                  # recipe self-tests
      golden-output/        # snapshot of expected emitted code
  ui.react-next/
    recipe.yaml
    skeleton/{{...}}.tsx.njk
    actions/
  data.drizzle/
  data.mikroorm-clinical/
  data.kysely-analytics/
  api.openapi/
  api.asyncapi/
  events.nestjs-kafka/
  events.nestjs-nats/
  tests.vitest/
  tests.playwright/
  interceptor.nestjs/
  plugin.wasm-component/
  plugin.nestjs-sidecar/
  workflow.temporal-ts/
  workflow.activepieces-flow/
  ...
```

### Phase 1 cookbook recipes (locked)

| Recipe key | Output |
|---|---|
| `backend.nestjs` | NestJS module + controller + service + DTO + DI wiring |
| `ui.react-next` | React + Next App Router page + components + hooks |
| `data.drizzle` | Drizzle schema + drizzle-kit migrations |
| `data.mikroorm-clinical` | MikroORM entities + migrations for HealthStack clinical aggregates |
| `data.kysely-analytics` | Kysely typed query layer for analytics/escape-hatch services |
| `api.openapi` | OpenAPI 3.1 spec from NestJS decorators |
| `api.asyncapi` | AsyncAPI 3.0 spec from event topic decorators |
| `events.nestjs-kafka` | Kafka producer/consumer NestJS module |
| `events.nestjs-nats` | NATS producer/subscriber NestJS module |
| `tests.vitest` | Vitest setup + sample tests per generated module |
| `tests.playwright` | Playwright E2E setup |
| `interceptor.nestjs` | NestJS Interceptor scaffold + audit wiring |
| `plugin.wasm-component` | WIT-typed WASM component shell + Wasmtime host harness |
| `plugin.nestjs-sidecar` | NestJS microservice sidecar shell + NATS transport |
| `workflow.temporal-ts` | Temporal TS SDK workflow + activity scaffold |
| `workflow.activepieces-flow` | Activepieces flow JSON + custom-piece skeleton |
| `cookbook.recipe` | **Meta-recipe**: scaffolds a new recipe (eat own dog food) |

### Future cookbook recipes (post-Phase 1, community-extendable)

- `backend.spring`, `backend.go-echo`, `backend.rust-axum`, `backend.fastapi`, `backend.laravel`, `backend.aspnet`
- `ui.flutter`, `ui.kmp-compose`, `ui.vue-nuxt`, `ui.sveltekit`, `ui.astro`, `ui.swiftui`, `ui.jetpack-compose`
- `data.jooq`, `data.gorm`, `data.diesel`, `data.sqlalchemy`
- `tests.junit`, `tests.pytest`, `tests.go-testing`, `tests.cargo`
- `interceptor.spring-aop`, `interceptor.go-middleware`, `interceptor.rust-tower`

---

## 5. Plugin / Sidecar / Interceptor architecture

### 5.1 Three-layer plugin runtime

```
┌─────────────────────────────────────────────────────────────┐
│  NestJS Service (foundation or downstream)                  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 3: isolated-vm                                   │ │
│  │ - Simple tenant JS snippets                            │ │
│  │ - Per-tenant memory + execution limits                 │ │
│  │ - Use cases: business rules, simple field transforms   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 2: WASM Component (Wasmtime via napi-rs)         │ │
│  │ - Typed sandboxed components (WIT IDL)                 │ │
│  │ - Per-tenant store + fuel + epoch deadline             │ │
│  │ - Use cases: heavier tenant logic, language-agnostic   │ │
│  │   (Rust/Go/TinyGo/C/C++ compile to WASM Component)     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 1: NestJS Microservice Sidecar (NATS)            │ │
│  │ - Out-of-process plugin in own runtime (any language)  │ │
│  │ - Use cases: full Node ecosystem, heavy compute,       │ │
│  │   external integration, language-specific need         │ │
│  │ - K8s LimitRange enforces resource quota               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why three layers, not one:**
- Right tool per plugin weight. Simple rule (3 lines of JS) shouldn't bring up a sidecar (1MB memory + IPC).
- AI agents author best in TS/JS (layer 3); compile to WASM when sandboxed needed (layer 2); spawn sidecar when full Node needed (layer 1).
- Performance gradient: isolated-vm ≈ 0.1ms; WASM ≈ 0.5ms; sidecar ≈ 1–5ms IPC.

### 5.2 Optional Dapr sidecar backbone

Dapr (Apache 2.0, CNCF Graduated) provides portable building blocks (state / pub-sub / secrets / bindings / actors). **Recommended adopt** because:

- Per-tenant component config (one Dapr install serves all tenants with namespace isolation)
- Swap Kafka → NATS via component YAML, zero code change in services
- Decouples CuraOS services from specific OSS picks (data/event vendor freedom)
- Sidecar pattern fits ADR-0099 §6 plugin/sidecar architecture exactly

Tenants that don't need Dapr's abstractions can skip it; foundation products use Dapr by default.

### 5.3 Four-layer interceptor + policy

| Layer | Implementation | Use case |
|---|---|---|
| **NestJS Interceptors** (native) | `@Injectable() @UseInterceptors()` decorators in code | Cross-cutting: audit, logging, transformations, metrics, retry, caching |
| **Cerbos (ABAC, <1ms embedded)** | NestJS @cerbos/grpc client → Cerbos PDP sidecar OR embedded | Resource-level ABAC (per-role, per-attribute permissions) |
| **OPA-WASM (global complex rules)** | OPA compiled to WASM, embedded in NestJS host | Cross-cutting policy (e.g., "no PHI to external webhooks", "tenant X cannot use feature Y", multi-step policy decisions) |
| **SpiceDB (ReBAC for PHI)** | NestJS @authzed/authzed-node SDK → SpiceDB sidecar | Relationship-based access: patient consent graphs, sharing rules, organizational hierarchies |

Per ADR-0120: same four-layer used for Auth product. Reused across all foundation products + downstream services via NestJS shared library.

### 5.4 Event-bus interceptor abstraction

Per ADR-0099 §6, events flowing through ADR-0102 stream/queue are the **injection point**. Plugins + sidecars register as interceptors on event topics.

| Hook point | Behavior |
|---|---|
| `beforePublish` | Plugin can transform / veto / audit event before it hits Kafka/NATS |
| `afterPublish` | Plugin notified post-publish (async; no veto) |
| `beforeConsume` | Plugin can transform / veto / route event before NestJS handler runs |
| `afterConsume` | Plugin notified post-handler (audit, metrics) |
| `onError` | Plugin can intercept consumer errors (custom retry, DLQ routing) |

NestJS shared library: `@curaos/event-interceptors` exposes decorator-based registration. Per-tenant interceptor chain configured via YAML.

---

## 6. License posture (all OSS, no commercial deps)

| Component | License | Status |
|---|---|---|
| NestJS | MIT | ✅ |
| Nunjucks | BSD-2 | ✅ |
| Handlebars | MIT | ✅ |
| EJS | Apache-2.0 | ✅ |
| Backstage Templates pattern (inspiration) | Apache-2.0 | ✅ (we adapt, don't depend on Backstage core) |
| Wasmtime | Apache-2.0 + LLVM exception | ✅ |
| napi-rs (Rust N-API) | MIT | ✅ |
| isolated-vm | MIT | ✅ |
| @nestjs/microservices | MIT | ✅ |
| Dapr | Apache-2.0 (CNCF Graduated) | ✅ |
| Cerbos | Apache-2.0 | ✅ |
| OPA | Apache-2.0 | ✅ |
| SpiceDB | Apache-2.0 | ✅ |
| cosign | Apache-2.0 | ✅ |
| Harbor | Apache-2.0 | ✅ (already chosen ADR-0109) |
| Zod (recipe input validation) | MIT | ✅ |

**Disqualified:**
- **vm2** — critical CVE January 2026, sandbox escape; NEVER use. (isolated-vm replaces.)
- **Backstage core** — too catalog-coupled for direct dependency; CuraOS adapts its template format, not its runtime.

---

## 7. Round-trip engineering (`.gen.ts` convention)

Per research: forward + backward + round-trip is HARD. CuraOS adopts the `.gen.ts` file split convention (Drizzle + GraphQL Codegen pattern):

| File suffix | Authored by | Engine behavior |
|---|---|---|
| `*.gen.ts`, `*.gen.tsx`, `*.gen.go`, etc. | Codegen Engine | Engine OWNS — overwrites on every regen. Never edit by hand. |
| Plain `*.ts`, `*.tsx`, `*.go`, etc. | Developer / AI agent | Engine NEVER touches — even on regen. |
| Protected regions inside `.gen.ts` | Marked with `// curaos:editable-start` ... `// curaos:editable-end` | Engine preserves on regen. Tracked + diffed. |

Backward engineering (existing DB / API → spec):
- DB schema introspection → TypeSpec model → `data.drizzle` recipe input
- OpenAPI-Codegen-CLI introspection on running NestJS service → OpenAPI spec
- Buf curl → reverse-engineer protobuf schema
- Round-trip: spec changes detected via CI diff against current generated code

---

## 8. AI-agent integration (MCP server)

CuraOS Codegen exposes an **MCP server** so external AI agents (Claude, Codex, Cursor, Cline, etc.) can:

- Query the cookbook ("what recipes exist?")
- Inspect a recipe ("show me inputs + outputs of backend.nestjs")
- Generate code ("generate a NestJS service for this OpenAPI spec")
- Validate generated code ("run tests on the recipe's golden-output")
- Author new recipes ("create a recipe for backend.go-echo following backend.nestjs pattern")

Per ADR-0114 + ADR-0099 §14: CuraOS-internal agents also consume external MCP servers per tenant config (e.g., tenant exposes their own MCP for their custom API; CuraOS Codegen pulls recipe templates from there).

---

## 9. Enterprise-grade v1 checklist

| Category | v1 Requirement |
|---|---|
| **Engine** | NestJS app with CLI + REST + GraphQL + MCP server surfaces |
| **Template engines** | Nunjucks (default) + Handlebars + EJS dispatched per recipe declaration |
| **Cookbook formats** | Backstage Software Templates + Plop generators supported; custom format deferred to v2 |
| **Recipe registry** | OCI artifact in Harbor (per ADR-0109) + cosign signature + version pinning |
| **Multi-tenant cookbook** | Per-tenant overlay on top of base cookbook |
| **AI-agent MCP** | MCP server exposing query + generate operations |
| **Plugin runtime — Layer 3** | isolated-vm with per-tenant limits |
| **Plugin runtime — Layer 2** | WASM Component (Wasmtime via napi-rs) with fuel + epoch + WIT IDL |
| **Plugin runtime — Layer 1** | NestJS Microservice sidecar with NATS transport + K8s LimitRange |
| **Dapr** | Optional sidecar backbone for portability; foundation products use by default |
| **Interceptor framework** | NestJS Interceptors + `@curaos/event-interceptors` library |
| **Policy layers** | Cerbos + OPA-WASM + SpiceDB (reuses ADR-0120 setup) |
| **Round-trip** | `.gen.ts` convention + protected regions |
| **Forward engineering** | spec → code in any cookbook target |
| **Backward engineering** | DB / API → spec |
| **Phase 1 recipes** | 16 recipes listed in §4 |
| **Meta-recipe** | `cookbook.recipe` scaffolds new recipes |
| **Audit** | Every codegen invocation + every plugin call hash-chained per ADR-0104 |
| **Air-gap** | Cookbook mirror (local OCI registry) + WASM components shipped in install bundle + Dapr air-gap mode |
| **AI-fill recipe template authoring** | Vercel AI SDK 6 + Claude/Codex via LiteLLM for recipe-template generation |
| **Performance** | Sub-second generate for typical recipe (single backend module + UI + tests) |
| **Scalability** | Engine horizontally scalable (stateless); recipe registry served from Harbor cluster |

---

## 10. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | NestJS shell + CLI surface + recipe loader (Backstage Templates format) |
| M2 | Nunjucks template engine + spec parser (OpenAPI + AsyncAPI + GraphQL SDL) |
| M3 | First 5 Phase 1 recipes: `backend.nestjs`, `ui.react-next`, `data.drizzle`, `api.openapi`, `tests.vitest` |
| M4 | Meta-recipe `cookbook.recipe` + recipe self-test framework |
| M5 | REST + GraphQL API surfaces + multi-tenant routing |
| M6 | Plugin Layer 1 (NestJS sidecar) + `plugin.nestjs-sidecar` recipe |
| M7 | Plugin Layer 2 (WASM Component via `@curaos/wasmtime-runtime` napi-rs addon) + `plugin.wasm-component` recipe |
| M8 | Plugin Layer 3 (isolated-vm) + simple JS rule sandbox |
| M9 | Interceptor framework + `@curaos/event-interceptors` shared library + `interceptor.nestjs` recipe |
| M10 | Policy layers (Cerbos + OPA-WASM + SpiceDB) wired into shared NestJS library |
| M11 | Handlebars + EJS template engines + per-recipe engine declaration |
| M12 | Plop generators format parser (second cookbook format) |
| M13 | Recipe OCI artifact + cosign signing + Harbor registry integration |
| M14 | Multi-tenant cookbook overlay (per-tenant recipe registry) |
| M15 | MCP server for AI-agent integration |
| M16 | Remaining Phase 1 recipes (16 total): `data.sqlc`, `api.asyncapi`, `events.nestjs-kafka`, `events.nestjs-nats`, `tests.playwright`, `workflow.temporal-ts`, `workflow.activepieces-flow` |
| M17 | Dapr integration + portability building blocks |
| M18 | Backward engineering (Atlas → spec → recipe input) |
| M19 | Round-trip support (`.gen.ts` + protected regions) |
| M20 | AI-fill recipe template generation via Vercel AI SDK 6 |
| M21 | Air-gap install bundle |
| M22 | Performance + security audit |
| M23 | v1 GA — sellable standalone |

---

## 11. Open questions (resolved later)

1. **Recipe distribution registry** — host CuraOS public cookbook registry separately, or piggyback on Harbor OCI registry per tenant? Likely both: public CuraOS registry (npm-like) + tenant-private Harbor mirror.
2. **AI-fill quality** — when AI generates a recipe, how do we verify quality before publish? Recipe self-tests + golden-output + human review for community-published recipes.
3. **Versioning conflicts** — recipe v1 + recipe v2 emit different code shapes; how do we handle existing services pinned to v1 when v2 ships? Semver per recipe + pinning per service via `curaos-codegen.yaml` manifest in service repo.
4. **Cross-recipe composition** — recipe A imports recipe B (e.g., `backend.nestjs` imports `interceptor.nestjs`). Backstage Templates pattern supports this; CuraOS adopts.
5. **Dapr vs not** — making Dapr mandatory adds ops complexity. Decision: optional sidecar (default-on for foundation products, default-off for tenant-built services).
6. **Plugin SDK packaging** — separate npm packages per plugin layer (`@curaos/plugin-wasm`, `@curaos/plugin-sidecar`, `@curaos/plugin-vm`)? Likely yes.

---

## 12. Cascade to existing ADRs

| ADR | Impact |
|---|---|
| ADR-0102 | Apicurio Registry stands; +AsyncAPI generator (recipe `api.asyncapi`) |
| ADR-0103 | OpenAPI + GraphQL specs stand; +codegen integration for client SDKs in all 8 comfort-zone languages (future cookbook entries) |
| ADR-0104 | Hybrid AuthZ (OPA + Cerbos + OpenFGA) extended to 4-layer (add SpiceDB option per CuraOS use; OpenFGA + SpiceDB equivalent — re-evaluate which) |
| ADR-0105 | BPMN deprecated; Flowable obsolete; superseded by ADR-0122 |
| ADR-0106 | Frontend Web Components (Lit) stand as plugin Layer 2 alternative for browser-embedded plugins |
| ADR-0114 | AI/agent integration extended with MCP server surfacing cookbook query + generate operations |

---

## 13. References

- [Research doc — 0123 Codegen+Plugin research](../research/0123-codegen-plugin-research.md) (2296 lines)
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0120 Auth (interceptor + policy layers)](0120-foundation-auth.md)
- [ADR-0121 Builder (Workflow Canvas + visual editing)](0121-foundation-builder.md)
- [ADR-0122 Workflow Manager (consumes codegen for IR → Temporal/Activepieces/cron)](0122-foundation-workflow-manager.md)
- NestJS: https://nestjs.com/
- Nunjucks: https://mozilla.github.io/nunjucks/
- Backstage Software Templates: https://backstage.io/docs/features/software-templates/
- Wasmtime: https://wasmtime.dev/
- WASI Component Model: https://component-model.bytecodealliance.org/
- napi-rs: https://napi.rs/
- isolated-vm: https://github.com/laverdet/isolated-vm
- @nestjs/microservices NATS: https://docs.nestjs.com/microservices/nats
- Dapr: https://dapr.io/
- Cerbos: https://www.cerbos.dev/
- OPA: https://www.openpolicyagent.org/
- SpiceDB: https://authzed.com/spicedb
- cosign: https://docs.sigstore.dev/cosign/overview/
- MCP spec: https://modelcontextprotocol.io/
