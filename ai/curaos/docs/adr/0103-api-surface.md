# ADR-0103 — API Surface for NestJS Foundation

> **Open Questions resolution (2026-05-25, DA13 amendments):**
> - **GraphQL stack** → **RESOLVED (DA13 Q1)** — **Cosmo Router (Apache 2.0 federation supergraph) self-hosted + per-service @nestjs/graphql Apollo subgraph driver**. Cosmo Router on K3s per [[curaos-orchestration-rule]]; air-gap-safe per [[curaos-airgap-rule]]. Federation v2 spec. Rejected alternatives: Apollo GraphOS (SaaS dep violates self-hosted-first), Mercurius (no native federation), Yoga+Mesh (Mesh federation < Cosmo maturity).
> - **tRPC scope** → **RESOLVED (DA13 Q2)** — **Internal-only** (service↔service typed RPC via tRPC v11+). External/partner APIs use TypeSpec→OpenAPI 3.1 → @hey-api/openapi-ts SDKs per [[curaos-speed-patterns-rule]]. Cleanest language-agnostic partner contract.
> - Connect-RPC vs raw gRPC → **RESOLVED-ADR** (Connect primary; gRPC legacy)
> - Bun HTTP adapter NestJS → **RESOLVED-RULE** ([[curaos-bun-primary-rule]] + Fastify fallback)
> - MQTT broker → **RESOLVED-ADR** (NATS MQTT)
> - typespec-graphql emitter stability → **DEFERRED-MILESTONE** (Q3 2026 recheck; fallback openapi-to-graphql ready)
> - Cosmo federation breaking-change policy → **DEFERRED-MILESTONE** (M4)
>
> See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter](0099-charter-priorities-vision.md), [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md), [ADR-0123 Codegen+Plugin](0123-foundation-codegen-plugin.md), [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
**Supersedes:** [0096-archived-api-surface-research.md](0096-archived-api-surface-research.md) (legacy DRAFT; kept for option-scan history)

---

## 1. Context

Original ADR-0103 was drafted under JVM/Spring baseline. ADR-0100 redo locked NestJS for all foundation products. This rewrite re-decides the API surface under the NestJS baseline + Codegen platform (ADR-0123) + local+3rd-party rule (ADR-0150 §2).

User question during interview: **can we have one schema for REST + GraphQL + tRPC + gRPC?** Research answer: no single tool today emits all four cleanly. **TypeSpec (Microsoft, MIT)** is closest — emits OpenAPI + Protobuf + JSON Schema natively; GraphQL via community plugin; tRPC via OpenAPI bridge.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **HTTP server** | Bun's native HTTP server (max perf, no Express/Fastify middleware overhead) |
| **Schema source-of-truth (IDL)** | **TypeSpec** (Microsoft, MIT) — single IDL emits all protocol artifacts |
| **REST** | NestJS controllers + Bun HTTP + auto-derived from TypeSpec → OpenAPI 3.1 |
| **GraphQL** | Derived from TypeSpec via community emitter → served via @nestjs/graphql with Apollo Server; federated via WunderGraph Cosmo Router (Apache-2.0) |
| **gRPC** | Derived from TypeSpec → Protobuf → Connect-RPC servers (Buf-stewarded, Apache-2.0) — gRPC over HTTP/2 + HTTP/1.1 fallback |
| **tRPC** | Dropped for v1 (no single-IDL emit; user fallback) — internal RPC = Connect-RPC (Connect has tRPC-class TS DX from same Protobuf) |
| **API gateway** | APISIX (per ADR-0103 prior pick; stands) — multi-protocol (HTTP, gRPC, WebSocket, MQTT) |
| **Real-time** | SSE (primary) + WebSocket via `@nestjs/websockets` (bidirectional) + MQTT via APISIX (HealthStack IoT devices) + Webhooks (partner outbound) + GraphQL Subscriptions via Apollo (over WS) |
| **FHIR REST** | HAPI FHIR (JVM sidecar; HealthStack-only) per ADR-0115 — NestJS HealthStack core proxies HAPI via HTTP |
| **BFF** | CuraOS Builder Apps SKU (ADR-0121b) generates per-tenant BFF; supergraph federation via Cosmo for multi-surface clients |
| **Versioning** | URL path (`/api/v1/...`); semver per spec; sunset headers; backward-compatible migrations |
| **Idempotency** | Stripe-style `Idempotency-Key` header convention across all writes |
| **Pagination** | Cursor-based default; opaque cursor; per-tenant cursor signing |
| **Error responses** | RFC 9457 ProblemDetails JSON (NestJS built-in support since v10) |
| **Audit at gateway** | APISIX hash-chain audit interceptor per ADR-0104/0120 |
| **CORS** | Per-tenant config in tenant.auth.cors.yaml (per ADR-0120) |
| **Rate-limiting** | Per-tenant + per-API-key at APISIX layer |
| **Auth (JWT validation)** | At APISIX (cached JWKS) for public APIs; in-NestJS guards for internal/admin |

---

## 3. Why TypeSpec as single IDL

| Reason | Detail |
|---|---|
| **Single source-of-truth** | One `.tsp` file describes service contract; emits OpenAPI 3.1 + Protobuf + JSON Schema + (via plugin) GraphQL SDL |
| **Microsoft backing + MIT** | Active 2024-2026 development; production at Azure SDK |
| **TypeScript-native authoring** | TS-like syntax, NestJS engineers + AI agents (Claude/Codex) author cleanly |
| **Codegen-friendly** | TypeSpec compiler is itself a Node library — integrates with ADR-0123 Codegen Engine as a recipe step |
| **Best multi-target IDL today** | Smithy (AWS, Apache-2.0) is JVM-tied for codegen; Buf is gRPC-first; OpenAPI alone is REST-first |
| **NestJS-compatible** | TypeSpec → OpenAPI → @nestjs/swagger consumes — full circle for controller generation |

**Trade-offs accepted:**
- GraphQL emitter is community-quality (not Microsoft-core). Mitigated by: GraphQL is secondary protocol (REST + Cosmo federation covers most cases); we contribute fixes upstream if needed; fallback is OpenAPI→GraphQL bridge (openapi-to-graphql).
- TypeSpec adoption is growing but smaller than OpenAPI raw. Risk if Microsoft slows project. Mitigated by: TypeSpec compiles TO OpenAPI which has unlimited longevity; we keep raw OpenAPI as escape hatch.
- No tRPC emit. Acceptable: Connect-RPC gives tRPC-class TS DX from same Protobuf, with multi-language support tRPC lacks.

---

## 4. Authoring + Codegen flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Service author writes TypeSpec contract (e.g., identity.tsp)   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  CuraOS Codegen Engine (ADR-0123) invokes TypeSpec compiler     │
│  with selected emitters per service config:                     │
│                                                                 │
│  - @typespec/openapi3      → OpenAPI 3.1 YAML                   │
│  - @typespec/protobuf      → .proto files                       │
│  - @typespec/json-schema   → JSON Schema definitions            │
│  - typespec-graphql        → GraphQL SDL (community)            │
└──────┬──────────┬─────────────┬──────────────┬─────────────────┘
       │          │             │              │
       ▼          ▼             ▼              ▼
┌──────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────────┐
│ OpenAPI  │ │ .proto  │ │ JSON Schema │ │  GraphQL SDL    │
└────┬─────┘ └────┬────┘ └──────┬──────┘ └────────┬────────┘
     │            │             │                 │
     ▼            ▼             ▼                 ▼
 ┌─────────┐ ┌─────────────┐ ┌────────┐ ┌─────────────────┐
 │ NestJS  │ │ Connect-RPC │ │ Zod    │ │ @nestjs/graphql │
 │ ctrl +  │ │ servers     │ │ runtime│ │ + Apollo Server │
 │ DTO     │ │ + clients   │ │ valid- │ │                 │
 │ recipe  │ │             │ │ ation  │ │                 │
 └────┬────┘ └──────┬──────┘ └────┬───┘ └────────┬────────┘
      │             │             │              │
      ▼             ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  NestJS service runtime (Bun HTTP)                          │
│  + APISIX gateway in front (auth, rate-limit, audit)        │
│  + WunderGraph Cosmo Router for GraphQL federation          │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Per-protocol detail

### 5.1 REST (default, primary)

- NestJS controllers + decorators (auto-derived from TypeSpec via Codegen recipe `api.rest-from-typespec`)
- Bun HTTP server (NestJS 11+ supports Bun adapter; fallback Fastify for runtimes that don't yet)
- OpenAPI 3.1 spec auto-emitted + served at `/api/openapi.json`
- Versioning: URL path `/api/v{major}/...`
- Per-tenant routing: APISIX extracts `X-CURA-TENANT` header or JWT claim
- Audit: NestJS Interceptor on every controller method

### 5.2 GraphQL (secondary, federation-friendly)

- @nestjs/graphql + Apollo Server (NestJS official module)
- Schema derived from TypeSpec via community emitter `typespec-graphql`
- Persisted queries required in production (security + perf)
- WunderGraph Cosmo Router (Apache-2.0) federates per-domain subgraphs into one supergraph
- Subscriptions over WebSocket for real-time GraphQL clients
- Local + 3rd-party rule: Cosmo self-hosted (default) OR Cosmo Cloud (BYO)

### 5.3 gRPC + Connect-RPC (internal hot-path)

- Buf-stewarded Connect-RPC servers in NestJS via @bufbuild/connect-nest (community)
- Connect supports gRPC + gRPC-Web + HTTP/JSON over same handler — clients pick protocol
- Schema derived from TypeSpec → .proto via @typespec/protobuf
- Use cases per ADR-0103 prior pick: identity/token introspection, rate-limit, notification fan-out, hot internal paths
- Java 21 virtual threads no longer relevant (we're on Bun) — Bun handles thousands of concurrent gRPC streams natively

### 5.4 FHIR REST (HealthStack overlay)

- HAPI FHIR 8.x JVM sidecar (HealthStack-only) per ADR-0115
- NestJS HealthStack module proxies HAPI Admin REST + handles SMART-on-FHIR scopes per ADR-0120
- FHIR endpoints under `/fhir/R4/*` + capability statement at `/fhir/metadata`
- Subscriptions bridged to Kafka/NATS via APISIX

### 5.5 Real-time channels

| Channel | Use case | Implementation |
|---|---|---|
| **SSE (default)** | Patient/clinician push (orders status, lab results, task updates) | NestJS controller returns `Observable<MessageEvent>` (RxJS); served over HTTP/2; cluster-aware via Valkey pub-sub (per ADR-0101) |
| **WebSocket** | Bidirectional (Builder collab, real-time chat) | @nestjs/websockets with `ws` or `socket.io` adapter |
| **GraphQL Subscriptions** | Real-time GraphQL clients | Apollo Server WS adapter |
| **MQTT** | HealthStack IoT devices, low-bandwidth scenarios | APISIX MQTT proxy + emqx broker (or NATS MQTT adapter) |
| **Webhooks** | Partner outbound integrations | NestJS webhook delivery service with retry + signed payloads + idempotency |

### 5.6 BFF (Backend-for-Frontend)

- CuraOS Builder Apps SKU (ADR-0121b) generates per-tenant BFF on demand
- Supergraph federation via Cosmo Router for clients that need cross-domain queries
- Per-client surface (admin / clinician mobile / patient mobile / partner) tailored BFF via Builder

---

## 6. Local + 3rd-party rule applied

| Area | Local (default) | 3rd-party (BYO) |
|---|---|---|
| GraphQL federation router | WunderGraph Cosmo self-hosted | Cosmo Cloud / Apollo GraphOS (per tenant config) |
| API gateway | APISIX self-hosted | Cloudflare API Gateway / AWS API Gateway / Kong Cloud |
| Schema registry | Apicurio (per ADR-0102) self-hosted | Confluent Schema Registry / Buf Schema Registry (BYO) |
| OpenAPI hosting | NestJS-served `/openapi.json` + Redocly static docs | SwaggerHub / Bump.sh / Stoplight (BYO) |
| Webhook delivery | CuraOS Webhook Service (NestJS sidecar) | Hookdeck / Svix (BYO) |
| Real-time WebSocket scale | Native @nestjs/websockets + Valkey adapter | Pusher / Ably / PubNub (BYO) |
| MQTT broker | emqx self-hosted | HiveMQ Cloud / AWS IoT Core (BYO) |

---

## 7. Versioning + deprecation policy

- **Semver per spec** — service contract = TypeSpec source = semver tag
- **URL path versioning** — `/api/v1/...` (major version only in URL; minor + patch via spec)
- **Backward-compatible migrations** — additive changes within major version; breaking changes = new major + sunset header on old
- **Sunset header** — `Sunset: <RFC3339 date>` on deprecated endpoints, 12-month minimum deprecation window
- **OpenAPI deprecated field** — set per operation
- **Audit on deprecated-endpoint use** — track which tenants still hit deprecated API for proactive outreach
- **Persisted GraphQL queries** — hash-pinned at deploy time; tenant must opt-in to schema upgrades

---

## 8. Cross-cutting concerns

| Concern | Implementation |
|---|---|
| Multi-tenant header | `X-CURA-TENANT` extracted at APISIX → forwarded as Bun HTTP context |
| Idempotency | `Idempotency-Key` header; NestJS Interceptor stores + replays (Valkey TTL 24h) |
| Pagination | Cursor-based; opaque base64-signed; per-tenant key |
| Error format | RFC 9457 ProblemDetails JSON |
| CORS | Per-tenant config (per ADR-0120) |
| Rate-limit | APISIX `limit-count` + `limit-req` plugins per tenant + per API key |
| Auth validation | APISIX `openid-connect` plugin with cached JWKS from CuraOS Auth (ADR-0120) |
| Audit | APISIX `log` plugin → Kafka topic → audit-service hash-chain (per ADR-0104) |
| Tracing | OpenTelemetry NestJS instrumentation (per ADR-0107) — trace propagated through APISIX → service → downstream |
| Schema diff CI | Codegen Engine (ADR-0123) compares new vs old TypeSpec → emits breaking-change report; CI gate |
| Client SDK gen | Codegen cookbook recipes emit typed clients per language from OpenAPI + Protobuf |

---

## 9. Enterprise-grade v1 checklist

- [x] REST + GraphQL + gRPC + FHIR REST all served
- [x] Single TypeSpec IDL emits all protocol artifacts
- [x] APISIX gateway with auth + rate-limit + audit
- [x] SSE + WebSocket + MQTT + Webhooks + GraphQL Subscriptions real-time options
- [x] Cosmo Router GraphQL federation
- [x] Versioning + deprecation policy
- [x] Multi-tenant header + per-tenant config
- [x] Idempotency keys
- [x] RFC 9457 error format
- [x] OpenAPI spec auto-served
- [x] Client SDKs auto-generated via Codegen cookbook (JS/TS, Go, Kotlin, Java, Python, PHP, C#, Rust per cookbook recipes)
- [x] Schema breaking-change CI gate
- [x] Local + 3rd-party for every integratable area
- [x] HIPAA: PHI redaction at gateway + audit + encryption in transit
- [x] GDPR: subject rights endpoints documented in OpenAPI
- [x] Air-gap: all gateway + router + broker self-hostable

---

## 10. Open questions (resolved later)

1. **typespec-graphql emitter stability** — community-quality. If issues, fallback to openapi-to-graphql bridge (openapi-to-graphql is mature, Apache-2.0).
2. **Connect-RPC vs raw gRPC** — Connect is recommended (TS DX best); raw gRPC available via @grpc/grpc-js for legacy clients.
3. **Bun HTTP adapter NestJS support** — NestJS 11.x experimental; if not stable for v1, fallback Fastify (per ADR-0103 §3 alternative). Recheck Q1 2026.
4. **GraphQL federation breaking changes** — Cosmo Router policy for breaking changes across subgraphs. Likely require approval workflow.
5. **MQTT broker pick** — emqx (OSS, Apache-2.0) vs NATS MQTT adapter. Likely NATS MQTT since we already have NATS per ADR-0102.

---

## 11. References

- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0102 Events/Messaging](0102-event-messaging.md)
- [ADR-0103 prior DRAFT (option scan)](0103-api-surface.md)
- [ADR-0120 Auth](0120-foundation-auth.md)
- [ADR-0123 Codegen+Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
- TypeSpec: https://typespec.io/
- @typespec/openapi3: https://typespec.io/docs/emitters/openapi3
- @typespec/protobuf: https://typespec.io/docs/emitters/protobuf
- typespec-graphql (community): https://www.npmjs.com/package/@typespec/openapi3
- Bun HTTP: https://bun.sh/docs/api/http
- NestJS Bun adapter: https://docs.nestjs.com/recipes/bun
- @nestjs/graphql + Apollo Server: https://docs.nestjs.com/graphql/quick-start
- WunderGraph Cosmo Router: https://wundergraph.com/cosmo
- Connect-RPC: https://connectrpc.com/
- @bufbuild/connect-nest: https://github.com/bufbuild/connect-es
- @nestjs/websockets: https://docs.nestjs.com/websockets/gateways
- APISIX MQTT: https://apisix.apache.org/docs/apisix/stream-proxy/
- RFC 9457 ProblemDetails: https://www.rfc-editor.org/rfc/rfc9457
- openapi-to-graphql (fallback bridge): https://github.com/IBM/openapi-to-graphql
