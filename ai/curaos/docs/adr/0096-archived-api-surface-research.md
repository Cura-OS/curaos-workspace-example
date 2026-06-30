# ADR-0096 (Archived) — API Surface Research (legacy ADR-0103 DRAFT)

> **🗂️ ARCHIVED** — superseded by [ADR-0103 API Surface for NestJS Foundation](0103-api-surface.md). This file kept for option-scan research history (Spring MVC / DGS / Cosmo / APISIX / SSE option survey). Original numbering was ADR-0103; renamed to 0096 to free the 0103 slot for the canonical NestJS rewrite.


## Status
Superseded by [ADR-0103](0103-api-surface.md) (archived). Date: 2026-05-24.

---

## Context

CuraOS operates 91 backend microservices spanning neutral capabilities (identity, tenancy, org, notify, commerce, etc.) and vertical overlays (HealthStack, EducationStack, ERP). Those services need a coherent, self-hosted API strategy covering three distinct communication planes:

1. **External plane** — public-internet clients (web apps, mobile apps, partner integrations, FHIR consumers). HTTP REST + GraphQL + FHIR REST. Must be versioned, audited, rate-limited, tenant-isolated.
2. **Internal east-west plane** — service-to-service calls within the cluster. Today REST over HTTP; gRPC considered for hot-path calls.
3. **Event plane** — already decided (ADR-0102, Kafka/NATS). The API layer sits alongside it, not replacing it.

Prior ADR commitments that constrain this decision:
- **ADR-0100**: Kotlin + Spring Boot 3.4, JVM 21. All services on this stack.
- **ADR-0101**: PostgreSQL 17, Valkey, SeaweedFS, ParadeDB+OpenSearch.
- **ADR-0102**: Kafka 4.x (SaaS) / NATS JetStream (SMB), Jobrunr, Debezium outbox, Apicurio Schema Registry.

What the API layer must deliver:
- REST with OpenAPI 3.1 specs per service.
- GraphQL for client-facing aggregation, with persisted queries in production.
- Per-domain GraphQL gateways (already committed direction; federation vs stitching still open).
- FHIR R4/R5 endpoints at `/fhir/R4/*` and `/fhir/R5/*` for HealthStack services.
- HIPAA audit on every PHI-touching endpoint.
- GDPR DSAR (Data Subject Access Request) endpoints.
- Real-time push to clients for clinical apps (order status, lab results, BPM task updates).
- Versioned APIs with sunset headers and deprecation windows.
- Multi-tenant header propagation (`X-CURA-TENANT` or JWT `tid` claim).
- Self-hosted, air-gap-capable — no managed-cloud-only dependencies.

---

## Forces / Requirements

| Force | Details |
|---|---|
| Self-hosted first | Every gateway, federation router, and spec registry must run on customer infra. Managed-SaaS-only options excluded as primary choices. |
| Multi-tenant routing | Tenant identity extracted at edge from JWT `tid` claim or `X-CURA-TENANT` header; propagated to all downstream services as internal header. Per-tenant rate limits. |
| FHIR R4/R5 compliance | HealthStack services expose FHIR REST conformant endpoints with CapabilityStatement (`/metadata`), search parameters, and operations. Terminology server optional but planned. |
| Persisted GraphQL queries | Arbitrary query strings blocked in production. Clients register operation documents at build time; server stores hash→document mapping. |
| GDPR DSAR | Dedicated endpoints (`POST /api/privacy/v1/dsar`) that trigger cross-service data collection. These are REST, not GraphQL, for auditability and integration friendliness. |
| HIPAA audit | Every request touching PHI (any HealthStack service) logged with: actor, patient/resource ID, action, timestamp, outcome. Audit log is immutable (append-only, write to Kafka topic → Debezium → separate audit store). |
| Real-time push | Clinical apps need sub-second notifications: order accepted, lab resulted, BPM task assigned. SSE vs WebSocket vs GraphQL subscriptions decision required. |
| gRPC — open question | No gRPC committed yet. Hot internal paths (auth token validation, rate limit checks) may benefit. |
| BFF strategy | Five client surfaces: admin web, clinician web/mobile, patient mobile, external partner API, public site. Each has distinct payload shape, auth model, and update latency requirements. |
| Rate limiting | Per-tenant, per-API-key, per-endpoint. Must be enforced at edge, not in each service. |
| Versioning | URL-path versioning (`/v1`, `/v2`). Sunset header on deprecated routes. Minimum 6-month deprecation window. |
| Air-gap | All container images pullable from internal registry. No runtime egress dependency (license servers, telemetry beacons, cloud policy APIs). |

---

## Decision Drivers (Weighted)

| Driver | Weight | Rationale |
|---|---|---|
| Kotlin/Spring Boot JVM library maturity | High | ADR-0100 locks runtime; choosing protocols/frameworks with thin or immature JVM support adds risk |
| Self-hosted / air-gap viability | High | License terms matter; ELv2, SSPL, BSL all need review |
| FHIR ecosystem support | High | HealthStack is a primary vertical; HAPI FHIR is the only mature JVM FHIR server |
| Spec maturity + client codegen | High | 91 services; codegen from OpenAPI/GraphQL schema is the only sustainable client SDK path |
| Multi-tenant routing fit | High | Gateway must understand and propagate tenant context without per-service boilerplate |
| Observability per protocol | High | Distributed tracing (OTel) must propagate across REST, GraphQL, gRPC, and events |
| Debuggability | Medium | gRPC binary framing is harder to debug than JSON/HTTP; operational cost non-trivial |
| Client codegen quality | Medium | TypeScript, Kotlin, Swift clients generated from schemas; quality varies per protocol |
| FHIR ecosystem partner support | Medium | Third-party EHR integrations expect FHIR REST; gRPC not a FHIR-standard protocol |
| Real-time fit | Medium | Clinical real-time needs are important but not all clients need them |
| Ops complexity | Medium | Fewer moving parts preferred; each layer must have clear ownership |
| Partner-integration friendliness | Medium | REST+JSON easiest for external integrators; gRPC requires proto sharing |
| Performance (raw throughput) | Lower | Platform is not a high-frequency trading system; P95 < 1s on reference load per NFR |

---

## Sub-decision 1: Protocol Mix Per Use Case

### Problem

With 91 services and five client surfaces, not all communication needs the same protocol. The question is: which protocols to support, at which layer, for which traffic class?

### Option A: REST + GraphQL + Events Only (no gRPC)

All external traffic: REST (FHIR, admin, DSAR, partner) + GraphQL (client aggregation). All internal east-west: REST over HTTP/1.1 or HTTP/2 + Kafka/NATS events (ADR-0102). No gRPC introduced.

**Pros:**
- Single JVM paradigm. Spring MVC + Spring for GraphQL. One serialization format (JSON). No protobuf schema management overhead.
- REST east-west is fully debuggable with `curl`, Postman, any HTTP proxy.
- Smaller ops surface: no protobuf registry parallel to Apicurio.
- OTel trace propagation works natively over HTTP headers.
- FHIR REST is HTTP/JSON by definition; no protocol impedance.
- With Java 21 virtual threads, blocking REST calls on internal paths no longer pin carrier threads, closing much of the latency gap vs gRPC in typical service topologies.

**Cons:**
- REST east-west: no schema enforcement at compile time (unlike proto). Contract drift caught only by contract tests.
- For extremely hot internal paths (token introspection called on every request, shared rate-limit state), REST adds JSON parse overhead vs binary proto.
- No streaming primitive for internal paths (Kafka covers async; SSE/WebSocket for push-to-client; but server-streaming RPCs not available).

**Risk:** At 91 services, REST east-west without schema enforcement can lead to silent contract breakage. Mitigation: OpenAPI specs generated per service, validated in CI with Spectral + Prism contract tests.

---

### Option B: REST + GraphQL + gRPC + Events

Add gRPC for a defined set of internal hot-path calls. External APIs remain REST + GraphQL. FHIR stays REST. Internally, services that need sub-millisecond RPC (e.g., identity/auth introspection gateway, rate-limit service, shared cache invalidation) expose gRPC endpoints alongside REST.

**Pros:**
- Binary proto serialization: ~5-10x smaller payload vs JSON for large message volumes; lower CPU on hot paths.
- Bidirectional streaming primitive useful for subscription-style internals.
- Strong schema enforcement via `.proto` files; breaking changes caught at compile time.
- gRPC adoption still rising in microservices: Netflix, Google, Square all shifted internal east-west to gRPC.

**Cons:**
- Adds protobuf schema registry alongside Apicurio (or Apicurio must also host proto schemas — supported but less mature than Avro/JSON Schema workflows).
- Two programming models in same codebase: Spring MVC for REST, `grpc-spring-boot-starter` (LogNet or grpc-java) for gRPC. Kotlin coroutines integration with gRPC requires `grpc-kotlin`.
- gRPC not browser-compatible natively; gRPC-Web proxy required for any browser-facing calls (adds component).
- Debugging binary traffic requires `grpcurl` or Wireshark dissector; harder incident response.
- Team must maintain two sets of client stubs (REST OpenAPI codegen + proto codegen).

**Risk:** Scope creep — "hot path" definition expands over time until everything is gRPC, creating a parallel infrastructure with REST.

---

### Option C: gRPC-First Internal + REST/GraphQL Only at Edge

All service-to-service: gRPC. Edge gateway translates REST/GraphQL to gRPC fan-out calls. Clients never see gRPC.

**Pros:**
- Maximum internal performance + schema safety.
- Clean separation: edge is HTTP surface; internals are proto/binary.

**Cons:**
- Highest ops complexity. Gateway must implement gRPC transcoding (Envoy transcoding filter or gRPC-gateway in Go) for every endpoint. Manual mapping layer for 91 services is massive maintenance burden.
- FHIR REST cannot be gRPC — HealthStack services must expose REST regardless; the "gRPC first" claim becomes a partial truth immediately.
- All services must be rewritten or restructured to expose gRPC endpoints; current Spring MVC services need `grpc-spring-boot-starter` + proto definitions for every endpoint.
- Spring Boot 3.4 + Kotlin gRPC toolchain (grpc-kotlin + grpc-spring-boot-starter) is less mature than Spring MVC REST; less community documentation.

**Risk:** Very high. Partial adoption inevitable (FHIR must be REST), leading to a hybrid that captures costs of both without full benefits of either.

---

### Option D: tRPC-Style End-to-End Typed (Comparison Only)

tRPC requires TypeScript on both client and server. CuraOS backend is Kotlin/JVM. Not applicable as primary. Noted for completeness: tRPC is excellent in TypeScript monorepos (Next.js BFF + Remix) but structurally incompatible with JVM backend as primary service implementation.

---

### Option E: REST + Connect-RPC (Buf Connect) — gRPC with HTTP/JSON Fallback

Buf's Connect protocol: define services in `.proto`; generated servers handle HTTP/1.1 JSON, HTTP/2 binary (gRPC), and Connect protocol simultaneously. A single port serves all three. `connect-kotlin` library available.

**Pros:**
- Eliminates the "gRPC is not browser-compatible" problem — Connect speaks HTTP/1.1 JSON natively.
- Single proto definition generates idiomatic Kotlin server code + TypeScript clients.
- Buf has replaced grpc-go internally; `connect-go` is production-proven. `connect-kotlin` is in active development.
- Less ops overhead than gRPC: no gRPC-Web proxy needed; standard HTTP/2 load balancers work.
- Allows gradual migration: start with REST, add Connect protocol service by service.

**Cons:**
- `connect-kotlin` is less mature than `grpc-java`; JVM ecosystem support still growing (as of early 2026).
- Spring Boot integration requires custom plumbing or community starters — no official Spring for Connect.
- Adds Buf toolchain alongside existing build chain (BSR or self-hosted Buf registry for proto management).
- Teams must learn proto + Buf on top of existing Spring + OpenAPI workflow.

---

### Comparison Table — Sub-decision 1

| Criterion | A: REST+GQL+Events | B: Add gRPC | C: gRPC-First Internal | E: Connect-RPC |
|---|---|---|---|---|
| JVM/Kotlin maturity | High | Medium-High | Medium | Medium |
| Ops complexity | Low | Medium | High | Medium |
| Debuggability | High | Medium | Low | Medium-High |
| Schema safety (internal) | Low (OpenAPI CI) | High (proto) | High (proto) | High (proto) |
| FHIR compatibility | Native | Hybrid | Hybrid | Hybrid |
| Browser/partner friendly | High | Needs proxy | Needs proxy | High |
| Air-gap viability | Full | Full | Full | Full |
| Adoption risk | Low | Low-Medium | High | Medium |
| Performance hot-paths | Good (VT) | Best | Best | Good |

### Recommendation — Sub-decision 1

**Option A as baseline, with Option B gRPC carved out for a defined hot-path subset (Phase 2, post-MVP).**

Rationale:
- Java 21 virtual threads on Spring MVC + Spring Boot 3.4 close most of the latency gap between REST and gRPC for typical service-to-service call patterns. The "REST is too slow" argument requires measurement, not assumption.
- 91 services makes Option C unrealistic without a multi-year migration; FHIR endpoints permanently break the "gRPC first" thesis anyway.
- Connect-RPC (Option E) is architecturally attractive but `connect-kotlin` JVM maturity is not yet at production-confidence level for a greenfield platform of this scale.
- For Phase 2: gRPC via `grpc-kotlin` + `grpc-spring-boot-starter` (LogNet library) is the preferred path for internal hot-path services (identity/token-introspection gateway, rate-limit service, real-time notification service). Buf BSR self-hosted for proto registry. Proto schemas co-registered in Apicurio for unified schema governance.

**Concrete protocol assignment:**

| Traffic class | Protocol | Notes |
|---|---|---|
| External client → services | REST/JSON (`/api/<domain>/v1/`) | OpenAPI 3.1 |
| External client → aggregation | GraphQL | Persisted queries in prod |
| External FHIR consumers | FHIR REST (`/fhir/R4/`, `/fhir/R5/`) | HAPI FHIR server |
| Partner integrations | REST/JSON + Webhooks | REST primary; Webhooks for outbound push |
| Internal east-west (all services) | REST/JSON over HTTP/2 | VT + WebClient |
| Internal hot-path (Phase 2) | gRPC (grpc-kotlin) | Identity, rate-limit, notification fan-out |
| BPM → client push | SSE (primary) | See Sub-decision 7 |
| Device → platform (HealthStack) | REST or FHIR REST | MQTT considered for IoT Phase 3 |

---

## Sub-decision 2: REST Framework / Library on Spring Boot 3.4

### Problem

All services run Spring Boot 3.4 (ADR-0100). Which Spring web tier and which OpenAPI generation approach for REST?

### Option A: Spring MVC + Springdoc OpenAPI 3 (Controller-first)

Spring Web MVC annotation-driven controllers (`@RestController`, `@GetMapping`). Springdoc-openapi 2.x generates OpenAPI 3.1 spec from annotations at startup. Java 21 virtual threads via `spring.threads.virtual.enabled=true`.

**Pros:**
- Most battle-tested path on Spring Boot 3.4. Largest community, most StackOverflow coverage, most library compatibility (Spring Data, Spring Security, Spring Batch all MVC-native).
- Virtual threads in Spring Boot 3.2+ give near-reactive throughput without reactive programming model. Benchmark: Spring MVC + VT handles comparable concurrency to WebFlux for typical REST workloads (blocking DB + service calls).
- Springdoc-openapi 2.x: generates spec, serves Swagger UI, integrates with Spring Security for security scheme docs. No manual YAML maintenance.
- Entire team can use familiar imperative Kotlin code with coroutines where needed.

**Cons:**
- Springdoc annotation-driven spec can drift from actual API behavior if annotations are not kept in sync. Spec is derived, not authoritative.
- Less suitable as primary for streaming-heavy BFF tier (SSE fan-out from many upstream calls).

**Risk:** Low. Well-established.

---

### Option B: Spring WebFlux (Reactive) + Springdoc

Project Reactor-based reactive web tier. Mono/Flux types throughout. Same Springdoc tooling works on WebFlux controllers.

**Pros:**
- Best fit for the edge/BFF tier doing fan-out of many upstream async calls (e.g., aggregating 10 upstream REST calls into one client response).
- SSE and WebSocket handling is native in WebFlux (`Flux<ServerSentEvent>`).
- Backpressure propagation end-to-end when upstream also reactive.

**Cons:**
- Reactive programming model (Mono/Flux, operator chains) has steep learning curve; mixing with Spring Data JPA (blocking) requires care (`Schedulers.boundedElastic()` or R2DBC).
- With JVM 21 VTs, Spring MVC handles most of the concurrency benefits of WebFlux without the reactive programming model complexity.
- Spring Data JPA + WebFlux requires R2DBC or scheduler bridging; most CuraOS services will hit PostgreSQL — R2DBC ecosystem less mature than JPA.
- 2025 recommendation from Spring team: default to MVC + VT; reach for WebFlux only when truly needed (streaming edge, SSE fan-out).

**Risk:** Medium. Reactive model adds cognitive overhead for domain logic services; worthwhile at edge, not recommended as default for all 91 services.

---

### Option C: HAPI FHIR Server (JAX-RS + Spring Boot integration)

HAPI FHIR JPA Server runs as a Spring Boot application exposing FHIR REST endpoints. The server implements the FHIR REST API, CapabilityStatement, search parameter handling, and operation framework. Runs alongside standard Spring MVC REST endpoints in the same service or as a dedicated service.

**HAPI FHIR status (2026):**
- Latest stable: HAPI FHIR 8.2.0 (early 2026). Minimum JDK 17; JDK 21 supported.
- FHIR R4 (4.3.0), R4B (4.3.0), R5 (5.0.0) all supported in 8.2.0.
- Spring Boot 3.x compat: HAPI 7.x+ targets Spring Boot 3; 8.x fully on Spring Boot 3.4-compatible dependency range (verify against `hapi-fhir-spring-boot-autoconfigure` BOM before pinning).
- `hapi-fhir-spring-boot-starter` provides auto-configuration for a Spring Boot FHIR JPA server.

**Pros:**
- Only production-grade JVM FHIR server. Implements R4/R5 spec completely including search, operations (`$everything`, `$validate`, `$expand`), capability statements, compartment search.
- Used by large EHR vendors and health systems in production.
- Spring Boot auto-configuration means it coexists with standard Spring MVC REST endpoints in the same process.

**Cons:**
- HAPI FHIR JPA Server has significant opinions about DB schema (its own Hibernate-managed schema). Integrating with CuraOS's existing PostgreSQL schema design requires a dedicated FHIR store per health service.
- Heavyweight for services that only need to expose a few FHIR resources; plain-server (non-JPA) HAPI is lighter for proxy/translation scenarios.
- Adds `ca.uhn.hapi.fhir` dependency tree; potential version conflicts with other Spring dependencies require BOM management.

**Risk:** Low for HealthStack services; not applicable to non-FHIR services.

---

### Option D: Spring Cloud Function / Spring Cloud Gateway as REST tier

Spring Cloud Function allows deploying functions as REST endpoints; Spring Cloud Gateway does HTTP proxying with filters. These are not REST framework alternatives for domain logic — they serve different purposes (serverless function wrapping, proxy/routing). Included for completeness; not recommended as replacement for Spring MVC for domain services.

---

### Option E: Ktor (Kotlin-Native REST)

JetBrains Ktor: Kotlin-first async HTTP framework. Alternative to Spring for Kotlin REST services.

**Pros:** Kotlin-idiomatic, lighter runtime, no Spring container startup.

**Cons:** Diverges from ADR-0100 (Spring Boot 3.4 committed); dual framework in 91 services = dual operational model. No Spring Security, Spring Data, Spring Batch ecosystem. Not recommended without reopening ADR-0100.

**Decision:** Excluded.

---

### Comparison Table — Sub-decision 2

| Criterion | A: Spring MVC + VT | B: WebFlux | C: HAPI FHIR | D: Fn/Gateway | E: Ktor |
|---|---|---|---|---|---|
| Use case fit (domain services) | Primary | Edge/BFF only | FHIR only | N/A | Excluded |
| JPA / blocking DB | Native | Bridge needed | Native | N/A | No Spring Data |
| SSE / streaming | Possible | Native | N/A | N/A | Possible |
| JVM 21 VT benefit | Full | N/A (reactive) | Partial | N/A | N/A |
| Team cognitive load | Low | Medium | Medium | N/A | Medium |
| FHIR R5 support | No | No | Full | N/A | No |
| Ops maturity | High | High | High | Medium | Low |

### Recommendation — Sub-decision 2

**Default: Spring MVC + Virtual Threads (Option A) for all domain services.**

**BFF/edge services: Spring WebFlux (Option B)** — specifically the API aggregation layer and SSE endpoint services where reactive fan-out is genuine.

**HealthStack FHIR services: HAPI FHIR JPA Server (Option C)** running as a Spring Boot app, exposing `/fhir/R4/*` and `/fhir/R5/*`. Each major FHIR domain (Patient, Encounter, Clinical Documents, Orders, Lab, Meds) gets a dedicated HAPI FHIR service with its own schema. Non-FHIR REST endpoints within the same service use Spring MVC alongside HAPI.

Springdoc-openapi 2.x generates OpenAPI 3.1 for all Spring MVC services. HAPI FHIR services serve CapabilityStatement at `/fhir/R4/metadata`; Springdoc excluded from those services (FHIR spec is its own contract).

---

## Sub-decision 3: GraphQL Stack

### Problem

CuraOS client surfaces (admin web, clinician web, patient mobile) need aggregated, shaped data across domain services. GraphQL is the chosen aggregation layer. Decisions: which JVM library, and federation architecture?

### Option A: Spring for GraphQL (Spring Boot 3 Official)

Spring's official GraphQL support (`spring-graphql`, GA since Spring Boot 3.0). Schema-first: `.graphqls` schema files, `@QueryMapping`, `@MutationMapping`, `@SubscriptionMapping` annotations. Integrates with Spring Data via `QuerydslPredicateExecutor`, pagination support via `Pageable`. Automatic persisted-document support introduced in Spring for GraphQL 1.3+.

**Pros:**
- Official Spring project; maintained by Spring team alongside Spring Boot.
- Full Spring Security integration: `@PreAuthorize` on resolvers, method security.
- Spring Data integration: cursor-based pagination out of the box.
- WebFlux + MVC both supported (reactive or imperative subscriptions).
- DataLoader (batching) support built-in.
- Persisted GraphQL documents: `PersistedQueryStore` interface; default `InMemoryPersistedQueryStore`; Redis-backed store implementable for distributed caching.
- Growing ecosystem. No Netflix dependency.

**Cons:**
- Newer than DGS; less "battle at scale" documentation publicly available.
- DGS Federation integration is better documented for Apollo Federation patterns.
- Testing support (`@GraphQlTest`, `WebGraphQlTester`) is good but less extensive than DGS's dedicated testing framework.

---

### Option B: Netflix DGS (Domain Graph Service Framework)

Netflix's open-source GraphQL framework for Spring Boot. Annotation-driven (`@DgsComponent`, `@DgsQuery`, `@DgsMutation`). As of DGS 9.x (2025), DGS internally delegates to Spring for GraphQL's execution engine — the two frameworks converged. DGS provides its annotation model on top of Spring GraphQL's infrastructure.

**Pros:**
- Netflix production-proven at massive scale.
- Richer annotation model that many teams find more expressive than bare Spring GraphQL.
- DGS 9.x + Spring GraphQL: DGS Schema Provider wires data fetchers for both frameworks; Spring GraphQL handles request execution. Canary analysis at Netflix showed performance parity with traditional DGS after fixing async processing config.
- Built-in code generation Gradle plugin: generates Java/Kotlin types from `.graphqls` schema.
- Testing framework: `DgsQueryExecutor` for unit testing resolvers without HTTP layer.
- Federation support via `dgs-federation-compatibility` module.

**Cons:**
- Additional dependency on top of Spring GraphQL (which it now wraps). Two framework layers to understand.
- Netflix-paced release cadence; can lag Spring Boot minor versions by weeks.
- If Spring for GraphQL adds a feature, DGS users may wait for DGS to expose it.

---

### Option C: Raw graphql-java + Custom Plumbing

`graphql-java` is the underlying engine for both Spring GraphQL and DGS. Direct use requires manual schema wiring, context propagation, DataLoader integration, HTTP handling.

**Pros:** Maximum control.

**Cons:** Enormous boilerplate; no Spring integration built-in; reinvents what Spring GraphQL / DGS already provide. Not recommended.

---

### Option D: Apollo Federation + Apollo Router (Self-Hosted)

Apollo Federation: each service exposes a GraphQL subgraph; Apollo Router (Rust-based) composes them into a supergraph. Clients query one endpoint; Router plans and fans out to subgraphs.

**Licensing (critical):** Apollo Router Core is licensed under **Elastic License v2 (ELv2)**. ELv2 permits self-hosting inside your own product and redistribution with your product — three restrictions: no providing as a managed service to others, no license key circumvention, no notice removal. For CuraOS's self-hosted deployments (tenant runs it on their infra), this is permitted. For CuraOS Cloud SaaS where CuraOS operates the Router on behalf of tenants, this falls under the "managed service" restriction — requires Apollo commercial license or alternative router.

**Pros:**
- Apollo Federation v2 is the dominant standard for GraphQL microservice composition.
- Apollo Router (Rust): high-performance, <1ms P99 overhead in benchmarks.
- Apollo Studio (managed) or self-hosted Router + schema registry (Rover CLI + Apollo-compatible registry).
- Federation subgraph spec is standardized; multiple routers can implement it.

**Cons:**
- ELv2 is problematic for SaaS deployment model (CuraOS Cloud). Apollo commercial license cost unknown, not self-hostable-price-transparent.
- OSI does not consider ELv2 open source; community resistance to adoption in OSS-sensitive organizations.
- Apollo Router written in Rust; not JVM — different operational domain from Spring Boot services.
- Schema Registry for Federation requires Apollo-compatible registry (Apollo Studio or self-hosted equivalent).

---

### Option E: WunderGraph Cosmo (Apache 2.0 Federation Router — Open Alternative)

WunderGraph Cosmo: fully open-source (Apache 2.0) GraphQL federation platform. Components: Cosmo Router (Go, high-performance), Control Plane (schema registry, composition checks), Studio (web UI), `wgc` CLI. Supports Federation v1 and v2 subgraph specs. Deployable 100% on-prem on Kubernetes.

**Pros:**
- Apache 2.0 license: no managed-service restriction. Fully viable for CuraOS Cloud SaaS and on-prem.
- Self-hosted on Kubernetes: Helm charts available; all stateful components (Control Plane, schema registry, analytics DB) run in-cluster.
- Cosmo Router: Go-based, high throughput; benchmarks show better P99 vs Apollo Router in some configurations.
- Federation v1/v2 compatibility: same subgraph spec as Apollo; migration path from Apollo ecosystem exists.
- Built-in: schema validation on push, composition checks (CI integration), distributed tracing (OTel), metrics.
- Active development; community growing as Apollo Router ELv2 license drives migration.

**Cons:**
- Younger project vs Apollo (production hardening less documented).
- Less community content / StackOverflow coverage vs Apollo Federation.
- Control Plane + Router + Studio adds infrastructure components to operate.

---

### Sub-sub-decision: Federation vs Schema Stitching vs Single Monolithic Schema

**Schema stitching** (older pattern): a gateway merges multiple GraphQL schemas at the schema level by delegating type resolution to remote services. Libraries: `graphql-mesh`, Hasura-style stitching. Problems: ownership ambiguity, brittle delegation config, schema conflicts across services. Not recommended at 91-service scale.

**Single monolithic GraphQL schema**: one service (or a BFF) owns the entire schema and calls downstream REST/gRPC services to resolve fields. Simple for small graphs; does not scale across domain teams — 91 services cannot all modify one schema file.

**Federation v2** (Apollo Federation v2 spec): each team owns a subgraph schema. A router handles query planning, distributing field resolution to the right subgraph, and assembling responses. Reference entities (`@key`, `@external`, `@extends`) allow cross-subgraph type composition. This is the recommended pattern at 91-service scale.

**Tradeoffs at CuraOS scale:**
- Federation: each domain team ships their own subgraph independently. Changes do not require coordinating with a central schema. Breaking change detection via composition checks in CI.
- Federation ops cost: router must be operated, schema registry must be operated, composition must be validated on every push. This overhead is justified at 91+ services.
- Start with per-domain subgraphs (neutral domain = subgraph; HealthStack = subgraph cluster); compose via federation router.

---

### Comparison Table — Sub-decision 3

| Criterion | A: Spring GraphQL | B: DGS | C: Raw | D: Apollo Federation | E: Cosmo |
|---|---|---|---|---|---|
| JVM/Kotlin native | Yes | Yes | Yes | No (Router in Rust) | No (Router in Go) |
| Spring Boot integration | Native | Via DGS wrapper | Manual | N/A | N/A |
| Federation support | Basic | Better | No | Full (reference impl) | Full (Apache 2.0) |
| SaaS licensing | Apache 2.0 | Apache 2.0 | Apache 2.0 | ELv2 (restricted) | Apache 2.0 |
| Self-host air-gap | Yes | Yes | Yes | Yes (license check?) | Yes |
| Persisted queries | Built-in (1.3+) | Via DGS store | Manual | Built-in | Built-in |
| Production scale evidence | Growing | Netflix at scale | N/A | Yes (large scale) | Growing |
| Ops components added | None | None | None | Router + registry | Router + CP + registry |

### Recommendation — Sub-decision 3

**Subgraph implementation: Netflix DGS (Option B)** on each domain service. DGS 9.x wraps Spring for GraphQL internally, so the Spring Boot integration is native. DGS's annotation model and code generation plugin are more productive for complex domain schemas. DGS testing framework (`DgsQueryExecutor`) enables fast resolver unit tests.

**Federation router: WunderGraph Cosmo (Option E)** — Apache 2.0, self-hosted on Kubernetes, supports Federation v2 spec, built-in OTel tracing, schema composition CI checks. Preferred over Apollo Router due to ELv2 licensing conflict with CuraOS SaaS deployment model.

**Persisted queries:** Each subgraph service configured with `PersistedQueryStore`. Cosmo Router enforces persisted operation IDs at the edge; arbitrary query strings rejected in production mode. Client toolchain generates operation manifests at build time and registers hashes with Cosmo Control Plane.

**Schema governance:** Subgraph schemas checked into each service repo under `src/main/resources/graphql/`. `wgc` (Cosmo CLI) runs schema composition check in CI on every PR that touches `.graphqls` files. Breaking change detection blocks merges.

---

## Sub-decision 4: API Gateway / Edge Proxy

### Problem

91 services must be reachable through a single (or multi-zone) entry point. The gateway must handle: TLS termination, tenant routing, JWT validation/JWKS cache, rate limiting per tenant, routing to services, CORS, observability (request logs, metrics, traces), and optionally developer portal/API key management.

### Option A: Spring Cloud Gateway

Spring-native reactive gateway built on WebFlux + Netty. Route configuration via YAML or code. Filters for auth, rate limiting (Redis-backed), circuit breaking (Resilience4j). Deployed as a Spring Boot application.

**Pros:**
- Same JVM stack as all services; shared toolchain, shared deployment model.
- Kotlin-native configuration possible.
- Spring Security integration for JWKS validation and JWT parsing.
- Redis-backed rate limiting filter built-in.
- Easy to add custom filters in Java/Kotlin without Lua.

**Cons:**
- JVM startup time and memory footprint higher than native binary gateways (Kong, APISIX, Traefik).
- Raw throughput lower than NGINX-based gateways. For 91 services with high fan-in, this can become a bottleneck.
- No native developer portal, API key management UI, or plugin marketplace.
- Less production evidence at very large multi-tenant scale vs Kong/APISIX.
- Multi-tenant routing complexity must be hand-coded in filters.

**Throughput context:** Spring Cloud Gateway on JVM 21 VT handles ~20k-50k req/s on commodity hardware depending on filter chain; adequate for most CuraOS deployments but headroom is limited compared to native binary gateways.

---

### Option B: Kong (OSS Community Edition)

Built on NGINX + OpenResty (Lua). Plugin ecosystem of 300+ plugins (auth, rate limit, OIDC, logging, transformations). Config stored in PostgreSQL. Declarative config via `deck` (sync from YAML/Git).

**Deployment stats (2025):** 345,000 production deployments. Largest mindshare of any dedicated API gateway.

**Pros:**
- Largest plugin ecosystem; OIDC, JWT, rate limiting, key-auth, request-transform, response-transform, Prometheus metrics all production-grade plugins.
- `deck` declarative config enables GitOps: gateway config lives in YAML in version control.
- PostgreSQL-backed (same DB tech as ADR-0101) for HA config.
- Extensive Kubernetes support via Kong Ingress Controller.
- P99 latency overhead: ~2-5ms per the 2026 benchmark data.

**Cons:**
- Enterprise features (OIDC plugin, canary, admin GUI beyond basic) require Kong Enterprise license (commercial). OSS OIDC via community plugin (`oidc` Lua plugin, third-party) is available but less maintained.
- Lua plugin development: not Kotlin/Java; requires Lua or Go (plugin server mode) for custom plugins.
- PostgreSQL dependency for config: another stateful component (mitigated — CuraOS already operates PostgreSQL per ADR-0101).
- Rate limiting at enterprise scale (per-tenant with sliding window) requires Redis plugin; config non-trivial.

**Kong license:** OSS core is Apache 2.0. Enterprise tier is commercial. Key concern: OSS OIDC plugin quality.

---

### Option C: Apache APISIX (Apache 2.0)

High-performance API gateway built on NGINX + OpenResty (Lua) with etcd for config. Apache 2.0 — all features open-source, no paid enterprise tier.

**Performance (2025 data):** 23,000 QPS per core, 0.2ms average latency. 200% of Kong throughput with plugins enabled. P99 latency overhead ~1-3ms.

**Plugin ecosystem:** Lua, Wasm, and RPC-based (external plugin server) plugins. Auth: JWT, key-auth, OIDC (built-in, not behind paywall), mTLS. Rate limiting: `limit-req`, `limit-count`, `limit-conn` — Redis-backed for distributed. Multi-tenant routing via header/claim extraction.

**Pros:**
- Fully Apache 2.0. All auth/OIDC/rate-limit features available without commercial license. Critical for self-hosted, cost-sensitive tenants.
- Best raw performance of any option (etcd enables dynamic config without restarts).
- Multi-protocol: HTTP, gRPC, WebSocket, Dubbo, MQTT routing from single gateway.
- etcd-backed config: real-time route changes without restart; supports large-scale dynamic routing needed for 91+ service updates without downtime.
- Kubernetes: `apisix-ingress-controller` with Gateway API v1 support.
- Active Apache Foundation project; neutral governance.

**Cons:**
- etcd dependency: CuraOS must operate an etcd cluster (separate from PostgreSQL). etcd adds ops complexity.
- Adoption (147,000 deployments) lower than Kong (345,000) — smaller community, fewer blog posts.
- Custom plugin development in Lua or external plugin server; not Kotlin/Java.
- P99 latency ~1-3ms overhead; still excellent for typical workloads.

---

### Option D: Traefik (MIT License)

Go-based, cloud-native reverse proxy. Kubernetes-native via IngressRoute CRDs and Gateway API. Config auto-discovered from Kubernetes annotations. Let's Encrypt auto-TLS.

**Pros:**
- Simplest deployment. Single binary, no database. Auto-discovers K8s services.
- MIT license — most permissive.
- P99 latency overhead ~2-4ms; adequate for most workloads.
- Let's Encrypt integration: TLS certificates managed automatically.

**Cons:**
- Less mature on advanced API gateway features: rate limiting (built-in, no Redis for distributed), OIDC (limited native support vs Kong/APISIX), API key management (none native).
- No plugin marketplace; middleware plugins are Go plugins compiled into Traefik binary.
- Adoption: 2,700 production deployments (vs Kong 345,000) — primarily used as ingress, not full API gateway.
- For multi-tenant rate limiting, custom middleware must be written in Go.
- Not ideal as primary API gateway for 91-service multi-tenant platform with complex auth requirements.

---

### Option E: Envoy (Raw or via kgateway / Solo.io Gloo)

Envoy Proxy: the underlying data plane for Istio, Gloo, and AWS App Mesh. Highest performance (sub-1ms P99 overhead). Written in C++. Config via xDS API (gRPC-based control plane).

**Raw Envoy:** config requires xDS server or static YAML. Not practical to manage for 91 services without a control plane.

**kgateway (formerly Gloo Edge OSS):** Solo.io open-sources kgateway (Apache 2.0); provides Kubernetes-native control plane over Envoy. Kubernetes Gateway API v1 implementation. Enterprise tier (Gloo Gateway) adds advanced auth, rate limiting, developer portal — commercial license.

**Pros:**
- Best P99 latency of all options (<1ms overhead per benchmark).
- Kubernetes Gateway API native — future-proof alignment with K8s ingress standard.
- gRPC-first control plane (xDS); extensible via Envoy filters (WASM filters).

**Cons:**
- Highest ops complexity. Raw Envoy config is notoriously verbose and error-prone.
- kgateway OSS has fewer users than Kong/APISIX; community support thinner.
- Solo.io enterprise required for developer portal, advanced OIDC, rate limiting — adds vendor dependency.
- WASM filter development for custom logic; not Kotlin/Java.

---

### Option F: Tyk OSS (Mozilla Public License 2.0)

Go-based API gateway. Licensed under MPL 2.0 (core gateway). Dashboard/analytics require Tyk commercial. Supports JWT, OIDC, key authentication, rate limiting, versioning, graphQL proxying.

**Pros:**
- MPL 2.0 core: permissive for most use cases. No SSPL/BUSL issues (confirmed as of 2026 — no license change to BUSL found).
- Native GraphQL proxy support (schema stitching and subscription proxying).
- Built-in API version management.

**Cons:**
- Dashboard (UI, developer portal, analytics) is commercial. Without it, ops UX is CLI-only.
- Community size smaller than Kong and APISIX.
- Rate limiting: Redis-backed built-in, but multi-tenant config complexity comparable to Kong.
- Less actively compared in 2025-2026 benchmark literature vs Kong/APISIX.

---

### Option G: Caddy (Apache 2.0)

Go-based HTTP server with automatic TLS. Excellent as a simple reverse proxy; not a feature-rich API gateway. No native rate limiting per tenant, no plugin marketplace, no OIDC support without third-party modules. Recommended only for development/small deployments, not for 91-service multi-tenant production.

---

### Option H: NGINX OSS

Battle-tested HTTP server / reverse proxy. Not a dedicated API gateway; lacks native rate-limit-per-tenant, JWT validation, OIDC, dynamic routing without reload. Kong and APISIX are both built on NGINX and add exactly those capabilities. NGINX OSS alone is insufficient; NGINX Plus (commercial) gets closer but at commercial cost and still lacks plugin ecosystem depth.

---

### Managed comparison (excluded as primary)

- **AWS API Gateway**: managed, cloud-lock, violates self-hosted-first charter.
- **Cloudflare Workers**: edge compute, not on-prem viable.
- **Azure APIM**: managed SaaS, not self-hostable.

---

### Comparison Table — Sub-decision 4

| Criterion | A: SCG | B: Kong OSS | C: APISIX | D: Traefik | E: kgateway | F: Tyk OSS |
|---|---|---|---|---|---|---|
| License | Apache 2.0 | Apache 2.0 | Apache 2.0 | MIT | Apache 2.0 | MPL 2.0 |
| Air-gap / self-host | Yes | Yes | Yes | Yes | Yes | Yes |
| P99 latency overhead | ~5-10ms | ~2-5ms | ~1-3ms | ~2-4ms | <1ms | ~3-6ms |
| OIDC out-of-box (OSS) | Yes (Spring Sec) | Community plugin | Yes (built-in) | Limited | Yes (OSS) | Yes |
| Multi-tenant rate limit | Redis filter | Redis plugin | Redis plugin | Built-in only | Ext service | Redis built-in |
| Dynamic config (no restart) | Rolling restart | DB reload | etcd real-time | K8s event | xDS | API push |
| Kubernetes Gateway API | Via annotations | Via KIC | Via Ingress Ctrl | Native GatewayAPI | Native GatewayAPI | Limited |
| Plugin model | Kotlin/Java filters | Lua / Go server | Lua / Wasm / Go | Go middleware | WASM | Go middleware |
| Developer portal | No | Enterprise only | No (community) | No | Enterprise only | Enterprise only |
| Production adoption | Low (own ops) | Highest (345k) | Medium (147k) | Niche (2.7k) | Low | Low |
| etcd / ext DB needed | No (in-process) | PostgreSQL | etcd | No | etcd (Envoy CP) | Redis + MongoDB |

### Recommendation — Sub-decision 4

**Apache APISIX (Option C)** as primary API gateway.

Rationale:
- Only gateway in the set that is both **fully Apache 2.0** (all auth/OIDC/rate-limit features without commercial license) and **high performance** (~1-3ms overhead, 23k QPS/core).
- etcd dependency adds ops cost but is manageable alongside existing PostgreSQL + Valkey stack (ADR-0101); etcd is itself a well-operated component in any Kubernetes cluster.
- Dynamic route changes via etcd enable zero-downtime updates as 91 services evolve without gateway restarts.
- Multi-protocol support (HTTP, gRPC, WebSocket, MQTT for HealthStack IoT Phase 3) from one gateway.
- OIDC and JWT plugins built-in and free: tenant JWT validation + JWKS caching at gateway eliminates per-service JWT validation overhead.
- Custom multi-tenant routing: APISIX `serverless-post-function` or custom Lua plugin extracts `X-CURA-TENANT`/JWT `tid` and injects downstream header without service modification.

**Spring Cloud Gateway (Option A) as internal micro-gateway** for BFF aggregation services — where Kotlin/Java filter logic is preferable over Lua and the traffic volume does not demand APISIX-level throughput.

---

## Sub-decision 5: BFF Strategy (Backend for Frontend)

### Problem

Five client surfaces exist: admin web, clinician web/mobile, patient mobile, external partner API, public site. Each has different auth models, payload shapes, update latency tolerances, and offline requirements. A BFF can pre-aggregate, reshape, and reduce over-fetching for each surface. The alternative is letting clients construct queries against a generic GraphQL federation supergraph.

### Option A: No BFF — Clients Use Supergraph Directly with Persisted GraphQL Queries

Clients (web apps, mobile apps) query the Cosmo Router supergraph endpoint. Per-client payload shaping is achieved by writing different GraphQL operations (persisted at build time) optimized for each client. REST endpoints handle FHIR, DSAR, and partner integration. No separate BFF process.

**Pros:**
- Minimal ops overhead: no BFF service to deploy, scale, and maintain per client surface.
- GraphQL's natural flexibility: different clients write different operations against the same schema; each gets exactly the data it needs.
- Cosmo Router with persisted operations is equivalent to a static BFF for read-heavy clients.
- Cache at Cosmo Router level: response caching per operation hash.

**Cons:**
- Complex client-specific logic (offline sync, conflict resolution, optimistic UI state, platform-specific push notification registration) has no server-side home; must live in client or in shared service.
- Partner API surface needs rate limiting, API key management, and webhook delivery — none of which fit neatly into a GraphQL supergraph.
- Clinician mobile app needs offline-first capabilities (FHIR bulk export, local cache sync) that require server-side orchestration.
- Auth model differences (clinician: SMART on FHIR; patient: consumer OAuth; partner: client credentials) may be manageable at gateway level but cross-cutting concerns become gateway filter complexity.
- Real-time channels (SSE for BPM task push) not a GraphQL subscription concern if the client can use SSE directly, but multi-surface differences add complexity.

---

### Option B: BFF Per Client Surface — Implemented in Spring Boot (Kotlin)

Dedicated Spring Boot services per surface: `admin-bff`, `clinician-bff`, `patient-bff`, `partner-bff`, `public-bff`. Each BFF owns its own auth flow, aggregation logic, and response shape. Internally calls domain services via REST or GraphQL (to the supergraph or directly to subgraphs). Deployed independently.

**Pros:**
- Full control over client-specific logic in Kotlin: can implement device-specific push registration, offline sync APIs, complex auth flows (SMART on FHIR for clinician, consumer PKCE for patient).
- Partner BFF can implement: API key management, webhook delivery, dedicated rate limits, partner-specific data contracts, sandbox environment — without polluting general domain services.
- Performance tuning per surface: `admin-bff` can use Spring MVC (CRUD admin ops); `clinician-bff` and `patient-bff` can use WebFlux (reactive fan-out, SSE streaming).
- Separate deployment allows independent scaling: `patient-bff` scales horizontally during patient portal peak; `admin-bff` remains small.
- Security: each BFF presents its own OAuth2 client scope profile to the APISIX gateway; minimizes blast radius of credential compromise.

**Cons:**
- Five additional services to maintain, deploy, and monitor. Ops overhead non-trivial at 91+5 = 96 services.
- Risk of BFF becoming a monolith — aggregating too much domain logic (DDD principle: domain logic belongs in domain services).
- Cross-surface code duplication: auth helpers, common DTOs, error mapping — requires shared `bff-commons` library or code drift.
- BFF team ownership must be clearly defined; without ownership, BFFs accumulate debt.

---

### Option C: BFF Per Surface in Node.js / TypeScript / Bun

Different runtime for BFF layer. Client teams (TypeScript React, React Native) may prefer TypeScript BFFs for tighter end-to-end type safety (tRPC from BFF to client, or OpenAPI client codegen).

**Pros:**
- Type sharing between TypeScript BFF and TypeScript frontend clients (monorepo with shared types).
- tRPC from TypeScript BFF to Next.js / React Native client for zero-schema type safety.
- Bun runtime: fast startup, lighter container.

**Cons:**
- Introduces a second runtime stack. CuraOS is committed to JVM/Kotlin (ADR-0100). Adding Node/Bun for BFFs creates dual-stack ops: two runtime upgrade tracks, two security patch tracks, two monitoring agent configurations.
- gRPC/Connect to JVM backend services requires Node gRPC clients — workable but adds complexity.
- Backend domain services written in Kotlin; type sharing with TypeScript requires OpenAPI codegen or proto codegen — the type sharing argument weakens.
- Rejected unless client teams explicitly own BFF repos and CuraOS platform team is not responsible for Node runtime operations.

---

### Option D: Federation Supergraph as Implicit BFF (Apollo/Cosmo Router with per-client query plans)

Cosmo Router handles query planning and response composition. Each client registers its own persisted operation set. Router caches responses per operation hash. Client-specific fields are exposed via `@tag` directives and schema filtering. No separate BFF process; the supergraph is the BFF.

**Pros:**
- Operationally the simplest BFF strategy; no extra services.
- Cosmo Router's schema filtering (`@tag`-based schema variants) allows exposing different subsets of the schema to different clients (admin vs patient vs partner).
- One infrastructure component (Router) handles aggregation, caching, and schema filtering.

**Cons:**
- GraphQL federation is optimized for read/query aggregation; mutation orchestration (multi-step workflows like patient registration + consent + appointment booking) requires saga coordination in domain services, not router-level logic.
- SSE / real-time push not native to federation query path; subscriptions add complexity.
- Partner API (REST, webhooks, API keys) cannot be served from a GraphQL supergraph without a REST facade.
- SMART on FHIR authorization for clinician apps requires specific OAuth2 launch sequences; federation router is not the right place for this.
- Offline sync, bulk export, and conflict resolution for mobile clients require dedicated service endpoints.

---

### Option E: Edge Compute BFF (Cloudflare Workers, Deno Deploy — comparison only)

Lightweight functions at CDN edge do per-client payload shaping. Not viable for self-hosted/air-gap deployment model. Excluded.

---

### Comparison Table — Sub-decision 5

| Criterion | A: No BFF | B: Spring Boot BFF | C: Node/TS BFF | D: Supergraph as BFF |
|---|---|---|---|---|
| Ops overhead | Lowest | High | High + dual-stack | Low-Medium |
| Client-specific auth flows | At gateway | In BFF | In BFF | At gateway |
| Offline sync / mobile | Client-side | BFF-side | BFF-side | Client-side |
| Partner API (REST+webhooks) | At gateway | Partner BFF | Partner BFF | Needs facade |
| SMART on FHIR | Gateway filter | Clinician BFF | Clinician BFF | Gateway filter |
| Multi-team ownership | Any team | Clear per team | Client teams | Platform team |
| Perf (aggregation fan-out) | Good (GraphQL) | Good (VT) | Good (async) | Best (Router) |
| Stack consistency | Mixed | Pure JVM | Dual-stack | Mixed |

### Recommendation — Sub-decision 5

**Hybrid: Option D (supergraph as implicit BFF) for read-heavy client surfaces + selective Option B BFFs for surfaces with complex orchestration needs.**

Specifically:
- **Admin web**: supergraph directly via persisted GraphQL queries. Admin operations are CRUD; no offline sync; no complex auth beyond RBAC. No BFF.
- **Public site**: REST endpoints directly. No BFF. Static content served from CDN.
- **Partner integrations**: **dedicated `partner-bff` Spring Boot service**. Owns: API key management (backed by APISIX key-auth plugin), webhook delivery (outbound HTTP, backed by Jobrunr job queue from ADR-0102), sandbox environment, partner-specific rate limit contracts, REST-only surface. This surface cannot be served by GraphQL supergraph.
- **Clinician web/mobile**: **dedicated `clinician-bff` Spring Boot WebFlux service**. Owns: SMART on FHIR OAuth2 launch sequence, offline FHIR bulk export scheduling, SSE stream multiplexing (aggregates multiple BPM + clinical event streams into one connection), clinician-specific persisted GraphQL operations proxied to supergraph.
- **Patient mobile**: **dedicated `patient-bff` Spring Boot WebFlux service** (can merge with clinician-bff in Phase 1, split in Phase 2 if load profiles diverge). Owns: consumer PKCE OAuth2 flow, push notification token registration, offline appointment + health record sync.

This gives: 2 BFFs at MVP (`clinician-bff`, `partner-bff`), 1 merged patient/clinician BFF if resources allow combining Phase 1. Admin and public served directly.

---

## Sub-decision 6: Spec / Schema Management

### Problem

91 services generate API contracts (REST OpenAPI, GraphQL schema, event schemas from ADR-0102, FHIR CapabilityStatements). Managing, versioning, and distributing these specs requires a disciplined approach.

### Option A: OpenAPI 3.1 + Springdoc (Annotation-Driven, Code-First) + Apicurio Registry

Springdoc-openapi 2.x generates OpenAPI 3.1 from Spring MVC annotations at startup. CI job calls `GET /v3/api-docs` and pushes the generated spec to Apicurio Registry under a versioned artifact ID. Apicurio (already selected in ADR-0102 for event schemas) stores both OpenAPI and AsyncAPI artifacts. Spec validation (Spectral rules) runs in CI against pushed spec.

**Pros:**
- Zero manual YAML maintenance: spec stays in sync with code.
- Apicurio already in stack (ADR-0102); reuse for HTTP specs eliminates a separate registry.
- Apicurio Registry 3.0 supports: AsyncAPI 3.0, OpenAPI 3.1, JSON Schema, Protobuf, Avro. Unified registry for all contract types.
- Apicurio Schema Version Comparison Tool (new in 2025-2026 releases) for breaking change visualization.

**Cons:**
- Code-first means spec is derived; annotation errors silently produce incorrect specs.
- Springdoc annotation noise in controllers: `@Operation`, `@ApiResponse`, `@Schema` decorating domain code with API documentation concerns.
- Not suitable for contract-first workflow where external partners review spec before implementation.

---

### Option B: Spec-First with OpenAPI YAML + openapi-generator Codegen

Teams author OpenAPI 3.1 YAML specs. `openapi-generator` (Maven/Gradle plugin) generates Spring MVC server stubs and Kotlin model classes. Implementation fills in the stubs. Spec is the authoritative source of truth.

**Pros:**
- Spec-first: external partners, frontend teams, QA can review API contract before implementation.
- `openapi-generator` produces Spring WebMVC or Spring WebFlux interfaces; implementation is forced to conform.
- CI validates that generated code matches committed spec (drift detection).
- Natural fit for partner-facing surfaces where spec review is required.

**Cons:**
- Teams must maintain YAML files; tooling support for YAML editing is weaker than annotation support in IDE.
- Generated code can be verbose; customizing generator templates adds maintenance.
- Two-phase workflow (write spec → generate → implement) slower for internal services where speed matters.

---

### Option C: TypeSpec (Microsoft) → OpenAPI 3.1 + JSON Schema

TypeSpec is a TypeScript-inspired API description language that compiles to OpenAPI 3.1, JSON Schema, and (via emitters) other formats. Used internally at Microsoft for Azure API definitions.

**Status (2026):** TypeSpec reached 1.4.0 (September 2025). Actively developed. Microsoft uses it for Azure API surface definitions. Healthcare use case documented. OpenAPI 3.1 emitter stable; GraphQL emitter experimental.

**Pros:**
- Single TypeSpec definition generates multiple formats: OpenAPI 3.1, JSON Schema, documentation.
- Strong type system catches contract errors at compile time (enum exhaustiveness, required field violations).
- Azure SDK team adopted TypeSpec for all new Azure REST APIs — strong signal of long-term investment.
- Healthcare API case study (Microsoft documentation): FHIR-shaped API definitions in TypeSpec.

**Cons:**
- TypeSpec to Spring Boot: requires OpenAPI generation step → then either Springdoc annotations or openapi-generator. Two-step code pipeline.
- GraphQL emitter is experimental; cannot generate DGS/Spring GraphQL schema from TypeSpec yet.
- Community and tooling significantly smaller than OpenAPI ecosystem.
- Team must learn TypeSpec language in addition to OpenAPI/GraphQL concepts.
- JVM ecosystem integration: no native Spring Boot TypeSpec plugin; workflow must go through YAML intermediary.

---

### Option D: Smithy (AWS) → Multi-Protocol IDL

Smithy is AWS's interface definition language. Generates OpenAPI, TypeScript, Java clients. Used by AWS for all service definitions.

**Pros:**
- Multi-protocol: REST, gRPC (Smithy RPC v2), Event Streams from one IDL.
- Strong modeling for error shapes, resource lifecycle, pagination conventions.

**Cons:**
- AWS-centric ecosystem. Less adoption outside AWS teams.
- JVM Smithy code generator for Spring: not a first-class supported target; requires custom code generation templates.
- If we don't adopt gRPC broadly (Sub-decision 1 recommends deferring gRPC), Smithy's multi-protocol strength is less relevant.
- Steeper adoption curve than TypeSpec for a team not already in AWS ecosystem.

---

### Option E: AsyncAPI 3.0 for Event Contracts (Paired with OpenAPI for HTTP)

AsyncAPI is the standard for describing event-driven APIs (Kafka topics, NATS subjects, WebSocket messages). AsyncAPI 3.0 released 2024. Apicurio Registry 3.0 supports AsyncAPI 3.0 validation rules and schema storage.

**This is not an alternative to OpenAPI — it is complementary:**
- HTTP endpoints: OpenAPI 3.1.
- Event topics (Kafka, NATS from ADR-0102): AsyncAPI 3.0.
- Both stored in Apicurio Registry under their artifact groups.
- `wgc` (Cosmo CLI) for GraphQL schema governance.
- FHIR CapabilityStatement for FHIR endpoints (self-describing, `/metadata`).

**AsyncAPI 3.0 + Apicurio maturity (2025-2026):**
- Apicurio added AsyncAPI 3.0 validation rules.
- EventCatalog Apicurio plugin: sync schemas from Apicurio for developer documentation portal.
- AsyncAPI tooling: `@asyncapi/generator` for docs, client code generation (limited).

---

### Recommendation — Sub-decision 6

**Layered approach:**

| Contract type | Authoring | Registry | Validation |
|---|---|---|---|
| REST (internal + external) | Springdoc annotation-first (code-first) for internal services; OpenAPI YAML spec-first for partner-facing + public APIs | Apicurio Registry (OpenAPI artifact group) | Spectral rules in CI; Prism contract test mocks |
| GraphQL subgraphs | Schema-first `.graphqls` files (DGS) | Cosmo Control Plane (schema registry) | `wgc` composition check in CI |
| Event topics (Kafka/NATS) | AsyncAPI 3.0 YAML | Apicurio Registry (AsyncAPI artifact group) | AsyncAPI parser + Apicurio validation in CI |
| FHIR endpoints | HAPI FHIR CapabilityStatement (auto-generated) | Published at `/fhir/R4/metadata` | HAPI FHIR conformance validation |
| Proto schemas (Phase 2 gRPC) | `.proto` files in service repos | Apicurio Registry (Protobuf artifact group) OR Buf Schema Registry (self-hosted) | `buf lint` + `buf breaking` in CI |

**TypeSpec**: monitor adoption. Not adopted now — JVM integration pipeline (TypeSpec → YAML → openapi-generator → Spring stubs) is complex for marginal gain vs Springdoc annotation approach. Revisit when TypeSpec Spring emitter matures.

**Smithy**: excluded. Not enough JVM ecosystem momentum outside AWS context.

---

## Sub-decision 7: Real-Time Channel (Push to Clients)

### Problem

Clinical apps need sub-second server-initiated push: BPM task assignment, order status updates, lab results, alert notifications. Patient mobile needs appointment reminders and care plan updates. Admin needs async job completion feedback. Partner integrations need event notifications.

### Option A: Server-Sent Events (SSE)

HTTP/1.1+ text stream from server to client (`text/event-stream`). One-way: server pushes, client listens. Spring WebFlux: `Flux<ServerSentEvent<T>>`. Spring MVC + VT: `SseEmitter`.

**Pros:**
- Simplest real-time primitive. Works through most corporate HTTP proxies (unlike WebSockets which can be blocked).
- HTTP/1.1 compatible; HTTP/2 multiplexing makes SSE efficient (multiple event streams over one connection).
- Native browser support; no library needed on client.
- Reconnection with `Last-Event-ID` is built into the SSE protocol.
- Spring WebFlux + Reactor: SSE from Kafka consumer → reactive pipeline → SSE endpoint = natural fit.

**Cons:**
- One-way only. Client cannot send events back over the same channel (uses separate REST calls for acks/actions).
- Per-connection resource: one persistent connection per client session. At 10,000 concurrent clinicians = 10,000 open HTTP connections. Manageable with WebFlux + Netty (non-blocking) or VT (one VT per connection).
- HTTP/1.1 browser default: 6 connection limit per origin. Mitigated by HTTP/2 (one multiplexed connection) or using a dedicated SSE domain.

---

### Option B: WebSockets (STOMP over WS) — Spring WebSocket

Bidirectional full-duplex channel. STOMP (Simple Text Oriented Messaging Protocol) over WebSocket: topic-based pub/sub model. Spring: `spring-websocket` + `spring-messaging`. `@MessageMapping` for STOMP destinations. SockJS fallback for environments blocking WebSocket upgrades.

**Pros:**
- Bidirectional: client can send acks, partial updates, typing indicators back over same channel.
- STOMP pub/sub: clients subscribe to `/topic/patient.{id}.orders`; server broadcasts to topic.
- Spring WebSocket + STOMP is mature: used by chat apps, collaborative tools at production scale.

**Cons:**
- WebSocket connections are stateful; load balancer must be sticky (session affinity) or a message broker (Spring's built-in SimpleBroker or external STOMP broker like RabbitMQ) must be used for multi-node distribution.
- Spring WebSocket + STOMP in multi-node cluster requires external message broker (RabbitMQ STOMP or ActiveMQ); adds another stateful dependency.
- More complex than SSE for one-way clinical notification use case where client does not need to write back.
- WebSocket blocked by some enterprise firewalls/proxies; SockJS fallback adds client complexity.

---

### Option C: gRPC Streaming (Server-Side or Bidirectional)

gRPC server streaming RPC: server streams events to client over HTTP/2. Bidirectional streaming for interactive flows.

**Pros:**
- Natural in gRPC-adopting services (Phase 2). Efficient binary protocol.
- Strong typing from proto definition.

**Cons:**
- Not browser-compatible without gRPC-Web proxy; patient mobile (web-based) or partner integrations (HTTP clients) cannot use gRPC natively.
- Requires gRPC client libraries on all consumer sides.
- Not practical for client-facing push in Phase 1 (no gRPC committed yet per Sub-decision 1).
- Best reserved for internal service streaming (event fan-out between backend services).

---

### Option D: Webhooks (Outbound Push for Partner Integrations)

Partner registers an HTTPS endpoint; CuraOS sends POST requests with signed payloads when domain events occur. Standard pattern (Stripe, GitHub, Twilio). Backed by Jobrunr work queue (ADR-0102) for reliable delivery with retry.

**Pros:**
- Universally understood by partner integration teams.
- Decoupled: partner's system polls at their own processing speed; CuraOS doesn't maintain persistent connections to partners.
- Reliable delivery with exponential backoff retry (Jobrunr handles this).
- Standard HMAC-SHA256 signature for payload authenticity.

**Cons:**
- Not suitable for end-user clients (web/mobile); webhook is partner/machine-to-machine only.
- Requires partner to expose a public HTTPS endpoint; firewall constraints common.
- Not real-time in the sub-second sense; latency = delivery attempt interval + partner processing.

---

### Option E: GraphQL Subscriptions (over WebSocket)

GraphQL subscriptions push incremental data changes to clients using the same GraphQL schema. Transport: `graphql-ws` protocol over WebSocket. Cosmo Router supports subscriptions. DGS supports subscription resolvers via Reactor.

**Pros:**
- Unified API surface: client uses GraphQL for queries, mutations, AND subscriptions — one client library handles all.
- Schema-typed events: subscription payloads are typed GraphQL payloads; client gets the same shape as a query.
- Cosmo Router: subscription fan-out across subgraphs is supported (each subgraph exposes subscription resolvers).

**Cons:**
- WebSocket transport inherits WebSocket's proxy/firewall concerns (see Option B).
- Subscription resolution in federation: each subgraph must maintain a subscription connection upstream; complex in multi-subgraph scenario (who owns the subscription? Which subgraph emits?).
- At scale (10,000 concurrent subscriptions per subgraph), connection management becomes complex; requires careful resource planning.
- Subscription state (which client is subscribed to which patient's orders) must be maintained server-side; tricky in a stateless horizontal-scale deployment.

---

### Option F: Kafka/NATS Direct to Client (for HealthStack IoT/Devices)

For medical device telemetry (patient monitoring, wearables), MQTT or NATS pub/sub direct to device is considered in HealthStack Phase 3. Not applicable to web/mobile clients (browser/mobile cannot speak Kafka natively). NATS supports lightweight MQTT bridging.

**APISIX gateway** supports MQTT routing natively (one of its multi-protocol capabilities cited in Sub-decision 4). This is the Phase 3 channel for IoT devices, not for human-facing clients.

---

### Comparison Table — Sub-decision 7

| Criterion | A: SSE | B: WS+STOMP | C: gRPC Stream | D: Webhooks | E: GQL Subscriptions | F: MQTT/NATS |
|---|---|---|---|---|---|---|
| Browser native | Yes | Yes | No | No | Yes | No |
| Bidirectional | No | Yes | Yes | No | Yes | Yes |
| Proxy-friendly | High | Medium | Low | N/A | Medium | Low |
| Multi-node distribution | Redis pub/sub | External broker | Sidecar | Jobrunr | External broker | NATS cluster |
| Ops complexity | Low | Medium | High | Low (Jobrunr) | Medium-High | Low (Phase 3) |
| Phase 1 viable | Yes | Yes | No | Yes | Yes (with caveats) | No |
| Use case fit — clinical push | High | High | Low | N/A | High | N/A |
| Use case fit — partner | Low | Low | Low | High | Low | N/A |
| Use case fit — IoT devices | N/A | N/A | Low | N/A | N/A | High |

### Recommendation — Sub-decision 7

**SSE (Option A) as primary real-time channel for client-facing push in Phase 1.**

- Implementation: `clinician-bff` and `patient-bff` (Spring WebFlux) expose SSE endpoints (`GET /api/bff/v1/events/stream`). These services subscribe to Kafka topics (BPM task events, clinical event topics from ADR-0102) via Kafka consumer, translate to `ServerSentEvent` objects, and stream to connected clients.
- Multi-node distribution: Redis (Valkey from ADR-0101) pub/sub channel between `clinician-bff` instances. Instance A receives BPM event from Kafka → publishes to Valkey channel → all `clinician-bff` instances forward to locally-connected SSE clients for the target clinician session.
- HTTP/2 at APISIX gateway to BFF: SSE over HTTP/2 multiplexes efficiently; no `EventSource` connection limit issues.

**Webhooks (Option D) for partner integrations.** `partner-bff` delivers signed POST callbacks for domain events. Backed by Jobrunr recurring job with exponential retry. HMAC-SHA256 signature header.

**GraphQL Subscriptions (Option E): defer.** Evaluate in Phase 2 if teams want a unified GraphQL interface for subscriptions. Cosmo Router subscription support must be validated at CuraOS deployment scale before committing. SSE is simpler and sufficient for Phase 1.

**MQTT / NATS IoT (Option F): Phase 3 HealthStack.** APISIX MQTT routing supports this when needed.

---

## Cross-Cutting Concerns

### API Versioning Policy

**Decision: URL-path versioning.** `/api/<domain>/v1/`, `/api/<domain>/v2/`.

Rationale:
- URL-path versioning is the most visible, most debuggable, most tooling-compatible approach. Every log line, every metric label, every CDN cache key includes the version naturally.
- Header versioning (`Accept: application/vnd.curaos.v2+json`) is more REST-academic but less operationally transparent.
- Media-type versioning is appropriate for FHIR (FHIR spec defines this) but not for general CuraOS REST APIs.
- GraphQL is inherently version-tolerant (additive schema evolution); breaking changes require new fields + deprecation annotations (`@deprecated`), not new URLs.
- FHIR versioning: `/fhir/R4/` and `/fhir/R5/` URL-level — this is the FHIR REST specification's own convention.

**Versioning rules:**
- New field on existing resource: additive change, no version bump required.
- Removed or renamed field: breaking change, requires new version (`/v2`).
- Semantics change on existing field: breaking change.
- New endpoint: `/v1`, no version bump.

### Deprecation Lifecycle

- `Sunset` response header (RFC 8594) on deprecated endpoints: `Sunset: Sat, 31 Dec 2026 23:59:59 GMT`.
- `Deprecation` response header (draft RFC): `Deprecation: true` or `Deprecation: <date>`.
- Deprecation announcement: documented in service changelog + Apicurio Registry artifact metadata.
- Minimum deprecation window: **6 calendar months** before removal.
- GraphQL deprecated fields: `@deprecated(reason: "Use XYZ instead")` annotation; included in schema diff reports from `wgc`.

### Rate Limiting

- Enforced at APISIX gateway: per-tenant (extracted from JWT `tid` claim), per-API-key (partner surface), per-endpoint.
- APISIX `limit-count` plugin: Redis (Valkey, ADR-0101) backend for distributed counters.
- Default limits (configurable per tenant tier):
  - REST APIs: 1,000 req/min per tenant.
  - FHIR endpoints: 500 req/min per tenant.
  - GraphQL: 200 persisted operations/min per tenant.
  - Partner webhooks: delivery rate governed by `partner-bff` Jobrunr job concurrency.
- Rate limit response: HTTP 429 with `Retry-After` header. RFC 6585 compliant.
- Rate limit headers returned on all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Idempotency Keys

- Convention: `Idempotency-Key: <UUID v4>` request header on all mutating operations (POST, PATCH, DELETE with significant side effects).
- Based on Stripe's pattern: server stores `{idempotency_key → {status_code, response_body}}` for 24 hours.
- Storage: Valkey (Redis-compatible, ADR-0101) with 24-hour TTL.
- Implementation: Spring AOP interceptor (`@Idempotent` annotation on controller methods) checks Valkey before processing; returns cached response if key already exists with matching request parameters.
- Key scope: per-tenant, per-user. Key `abc-123` from Tenant A does not collide with same key from Tenant B.
- Error on parameter mismatch: if same key sent with different request body, return HTTP 422 (Unprocessable Entity).
- API v2 (future) may extend to DELETE operations per Stripe v2 convention.

### Pagination Convention

- REST: **cursor-based** pagination using opaque continuation tokens. Response includes `nextPageToken` (base64-encoded cursor). Client sends `pageToken=<token>` on subsequent calls.
- Rationale: offset pagination breaks on insert/delete in time-window; cursor pagination is stable for sorted result sets with live data.
- Page size: default 25, max 100, configurable per endpoint via `pageSize` query param.
- GraphQL: Relay Cursor Connections spec (`edges`, `node`, `pageInfo { hasNextPage, endCursor }`). Spring for GraphQL + Spring Data support this natively.
- FHIR: FHIR pagination uses `Bundle.link` with `next` relation. HAPI FHIR implements this per spec.

### Error Response Standard

**Decision: RFC 9457 ProblemDetails (successor to RFC 7807).**

Spring Boot 3.x has built-in support for RFC 7807/9457 via `ProblemDetail` class and `ErrorResponseException`. Spring Framework 6.0+ auto-converts common exceptions to `application/problem+json` when `spring.mvc.problemdetails.enabled=true`.

Standard error shape:
```json
{
  "type": "https://curaos.io/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Field 'patientId' is required",
  "instance": "/api/encounter/v1/encounters",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "tenantId": "tenant-abc"
}
```

Extensions added: `traceId` (OTel trace ID), `tenantId` (for multi-tenant debugging), `code` (machine-readable error code for client logic branching).

### HIPAA Audit Logging at Gateway vs In-Service

- **Decision: Dual audit.** Gateway logs (APISIX access log, structured JSON) capture: timestamp, method, path, tenant ID, user ID (from JWT), response status, latency. In-service audit (for PHI-touching operations): finer-grained event published to Kafka `audit.events` topic (outbox pattern, Debezium from ADR-0102) with: actor, patient/resource ID, action, affected fields, outcome. Gateway audit = coarse operational log. In-service audit = compliance-grade immutable audit trail.
- HIPAA requires: who accessed what, when, from where. In-service audit satisfies this for PHI. Gateway audit satisfies network-level logging.
- Audit Kafka topic → dedicated audit service → append-only PostgreSQL audit table (no UPDATE/DELETE on audit rows, enforced by DB trigger + service layer). Separate read replica for audit queries.

### JWT Validation Strategy

- **Decision: Validate JWT at APISIX gateway.** JWKS endpoint cached at gateway (APISIX JWT plugin). Signature verification + expiry check at edge.
- Services receive pre-validated JWT claims as propagated headers: `X-CURA-USER-ID`, `X-CURA-TENANT-ID`, `X-CURA-ROLES`. Services trust these headers (only callable from inside cluster; mutual network policy enforced).
- Services do **not** make JWKS calls themselves on each request. Eliminates per-service JWKS network dependency and latency.
- Gateway re-validates signature on every request (cache TTL: 5 minutes for JWKS; tokens validated per-request using cached public key).
- Internal service-to-service calls (east-west): service accounts with short-lived JWTs issued by identity service. Same APISIX JWT validation at internal gateway.

### CORS Strategy

- CORS headers set at APISIX gateway level via CORS plugin.
- Allowed origins: tenant-specific origin allowlist (stored in APISIX route config, driven by tenant provisioning).
- FHIR endpoints: CORS required for browser-based SMART on FHIR app launches.
- Partner APIs: CORS not applicable (server-to-server); CORS disabled on partner routes.

### Multi-Tenant Header Propagation

- APISIX extracts tenant from JWT `tid` claim (primary) or `X-CURA-TENANT` header (for service accounts without tenant JWT).
- Sets downstream header: `X-Cura-Tenant-Id: <tenant-id>`.
- All Spring Boot services read `X-Cura-Tenant-Id` from request headers. Spring `@RequestHeader("X-Cura-Tenant-Id")` or a `TenantContext` `Filter`/`Interceptor` that populates `TenantContextHolder` (thread-local / coroutine context) for the duration of the request.
- Services pass `X-Cura-Tenant-Id` downstream on all outbound `WebClient` calls via `ExchangeFilterFunction`.
- Kafka messages: tenant ID in message header (`cura.tenant.id`) per ADR-0102 convention.

---

## Recommendation Summary

| Sub-decision | Chosen | Key reason |
|---|---|---|
| Protocol mix | REST + GraphQL + Events (gRPC Phase 2 hot-path only) | JVM 21 VT closes latency gap; FHIR mandates REST; gRPC ops cost not justified at MVP |
| REST framework | Spring MVC + VT (domain services); Spring WebFlux (BFF/edge/SSE) | VT + MVC for domain; WebFlux only at reactive fan-out edge |
| FHIR | HAPI FHIR 8.x JPA Server (Spring Boot, R4 + R5) | Only mature JVM FHIR server; R5 supported in 8.2.0 |
| GraphQL subgraph impl | Netflix DGS 9.x (wraps Spring for GraphQL) | Production-proven; richer annotation model; code generation plugin |
| GraphQL federation router | WunderGraph Cosmo (Apache 2.0) | Apache 2.0 license, self-hosted, Federation v2, avoids Apollo ELv2 SaaS conflict |
| API gateway | Apache APISIX (Apache 2.0) | Best perf + fully OSS + all auth features free + multi-protocol + etcd dynamic config |
| BFF | No BFF for admin/public; Spring WebFlux BFF for clinician + patient; Spring MVC BFF for partner | Right-sized per surface; avoids over-engineering admin and under-serving clinical/partner |
| Spec management | Springdoc code-first (internal); OpenAPI YAML spec-first (partner/public); AsyncAPI 3.0 for events; all in Apicurio | Unified registry already in ADR-0102; minimal new components |
| Real-time | SSE (client push, Phase 1); Webhooks (partner); MQTT Phase 3 (IoT) | SSE simplest viable; Webhooks for partner; no WebSocket broker dependency in Phase 1 |
| Error format | RFC 9457 ProblemDetails (Spring Boot 3 built-in) | Standard, Spring-native, extensible with `traceId` + `tenantId` |
| Versioning | URL-path `/v1`, `/v2` | Most transparent, debuggable, tooling-compatible |
| Idempotency keys | `Idempotency-Key` header + Valkey 24h cache | Stripe-proven pattern; Valkey already in stack |
| Pagination | Cursor-based (opaque token) | Stable under live data mutations |
| Audit | Dual: APISIX access log (coarse) + in-service Kafka event (HIPAA) | Gateway log ≠ compliance audit; in-service outbox = immutable PHI audit trail |
| JWT validation | At APISIX gateway + claim header propagation | Eliminates per-service JWKS calls; reduces latency |

### Integration Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  External Clients                                                           │
│  [Admin Web] [Clinician App] [Patient App] [Partner API] [FHIR Consumer]   │
└──────────┬──────────┬──────────┬──────────┬──────────┬──────────────────────┘
           │          │          │          │          │
           ▼          ▼          ▼          ▼          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│          Apache APISIX (API Gateway / Edge)                                 │
│  TLS termination · JWT validation (JWKS cache) · Tenant extraction         │
│  Rate limiting (Valkey) · CORS · Audit access log · OTel trace init        │
│  Routes: /api/* → domain services; /fhir/* → HAPI FHIR services           │
│          /graphql → Cosmo Router; /bff/* → BFF services                   │
└──────┬──────────┬──────────────┬────────────────────┬────────────────────┬──┘
       │          │              │                    │                    │
       ▼          ▼              ▼                    ▼                    ▼
┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────┐
│ Cosmo    │ │clinician- │ │  patient-bff │ │  partner-bff   │ │ HAPI FHIR    │
│ Router   │ │    bff    │ │  (WebFlux)   │ │  (Spring MVC)  │ │ Services     │
│(GQL Fed) │ │ (WebFlux) │ │  SSE + REST  │ │  REST + Webhk  │ │ /fhir/R4/*  │
└────┬─────┘ └─────┬─────┘ └──────┬───────┘ └────────┬───────┘ └──────┬───────┘
     │             │              │                   │                │
     ▼             ▼              ▼                   ▼                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Domain Services (91 services: Spring MVC + JVM 21 VT)                     │
│  identity · tenancy · party · notify · calendar · tasks · storage · ...    │
│  healthstack-patient · healthstack-encounter · healthstack-orders · ...     │
│  All share: X-Cura-Tenant-Id header · OTel trace propagation · Kafka events│
└──────────────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Data Layer (ADR-0101)   │   Event Layer (ADR-0102)                         │
│  PostgreSQL 17 · Valkey  │   Kafka 4.x / NATS JetStream · Apicurio         │
│  SeaweedFS · ParadeDB    │   Jobrunr · Debezium outbox                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions for User

The following decisions require explicit user input or remain formally open after this ADR:

1. **gRPC Phase 2 scope definition**: Which specific services (identity/token-introspection, rate-limit, notification fan-out) should expose gRPC endpoints in Phase 2? What is the triggering criteria (load threshold, specific latency measurement) for activating gRPC on a hot path?

2. **Cosmo Control Plane deployment**: Self-hosted Cosmo (full stack: Router + Control Plane + Studio on Kubernetes) vs Cosmo Cloud managed Control Plane with self-hosted Router. The self-hosted Router is always in-cluster; the question is whether the Control Plane (schema registry + analytics DB) should be operated by CuraOS team or delegated to Cosmo Cloud. (Note: Cosmo Cloud managed service fine for SaaS deployments; air-gap requires full self-hosted.)

3. **Apollo Federation v2 vs Cosmo vs other**: Is Apache 2.0 (Cosmo) the settled requirement, or is Apollo commercial license a viable option for the SaaS tier? This changes the federation router decision.

4. **BFF Phase 1 scope**: Should `clinician-bff` and `patient-bff` start as a single merged `client-bff` service and split later, or launch as separate services from day one? (Affects initial team ownership and deployment cost.)

5. **SMART on FHIR implementation**: Which OAuth2 library handles the SMART on FHIR launch sequence in `clinician-bff`? Options: Smile CDR's SMART library, Mitre's smart-on-fhir libraries, Spring Authorization Server with SMART extensions. This is a HealthStack-specific sub-decision requiring FHIR team input.

6. **APISIX config management (GitOps)**: APISIX + etcd supports declarative config via Admin API. Do we use `apisix-ingress-controller` (K8s native, routes from Kubernetes resources) or `deck`-style YAML sync via CI pipeline (like Kong's `deck`)? APISIX uses `adc` (API Declarative Configuration) tool for GitOps.

7. **Developer portal strategy**: Neither APISIX OSS nor Cosmo includes a developer-facing API catalog/portal. Options: (a) Backstage with OpenAPI plugin + Cosmo schema browser + Apicurio; (b) Gravitee.io OSS (full API management + portal, Apache 2.0); (c) build lightweight custom portal. Portal is required for partner onboarding. When does it need to exist?

8. **Persisted query enforcement strictness**: In production, should arbitrary GraphQL queries be rejected outright (hard mode: only registered hashes accepted), or logged and counted but allowed (audit mode), or allowed per-client-type (e.g., admin internal tooling allows arbitrary, external clients restricted)? Affects developer experience during initial rollout.

9. **SSE vs WebSocket for clinician app**: If the clinician app (front-end framework decision pending) requires bidirectional interaction over a live channel (collaborative case review, real-time annotation), does SSE's one-way limitation require upgrading to WebSocket + STOMP? This is a product requirements question, not a purely technical one.

10. **TypeSpec adoption timeline**: TypeSpec 1.4.0 is stable (September 2025). Should CuraOS adopt TypeSpec for partner-facing and public API specs in Phase 2 (replacing OpenAPI YAML hand-authoring), given Microsoft's investment signal? Requires evaluation of Spring Boot TypeSpec-to-code pipeline maturity.

11. **FHIR R5 timeline for HealthStack**: HAPI FHIR 8.x supports R5. Should HealthStack services launch R4-only and add R5 endpoints in a later phase, or launch both from day one? R5 adds breaking changes to some resources (e.g., Observation). Dual-version HAPI server is supported but adds testing scope.

12. **Multi-region / active-active**: APISIX with etcd supports multi-region active-active (etcd cluster across regions). Is multi-region active-active in scope for Phase 1, or Phase 2+ after single-region stability is proven? This affects APISIX + etcd cluster topology decisions.

---

## References

### Spring GraphQL / DGS
- [A Tale of Two Frameworks: DGS meets Spring for GraphQL (Netflix Technology Blog)](https://netflixtechblog.medium.com/a-tale-of-two-frameworks-the-domain-graph-service-framework-meets-spring-graphql-f8237f09c389)
- [DGS Framework Documentation](https://netflix.github.io/dgs/)
- [Spring GraphQL Integration — DGS](https://netflix.github.io/dgs/spring-graphql-integration/)

### Apollo Router / Federation Licensing
- [Apollo Router Licensing under ELv2](https://www.apollographql.com/trust/licensing)
- [Moving Apollo Federation 2 to ELv2 (Apollo Blog)](https://www.apollographql.com/blog/moving-apollo-federation-2-to-the-elastic-license-v2)
- [Moving Apollo Federation 2 to ELv2 (Hacker News)](https://news.ycombinator.com/item?id=29115263)

### WunderGraph Cosmo (Apache 2.0 Alternative)
- [WunderGraph Cosmo GitHub Repository](https://github.com/wundergraph/cosmo)
- [Cosmo: Open Source Alternative to Apollo Federation & GraphOS](https://medium.com/@wundergraph/cosmo-an-open-source-alternative-to-apollo-federation-graphos-9f7314f5c8d6)
- [Introduction to Cosmo Router — Federation v1/v2 Gateway](https://dev.to/slickstef11/an-introduction-to-cosmo-router-blazingly-fast-open-source-federation-v1v2-gateway-2g0l)

### API Gateway Comparisons
- [API Gateway Comparison: APISIX vs Kong vs Traefik vs KrakenD vs Tyk (API7.ai)](https://api7.ai/learning-center/api-gateway-guide/api-gateway-comparison-apisix-kong-traefik-krakend-tyk)
- [Enterprise API Gateways on Kubernetes 2026 (lucaberton.com)](https://lucaberton.com/blog/enterprise-api-gateway-kubernetes-comparison-2026/)
- [Kong vs Envoy vs Traefik 2026 Benchmark (lucaberton.com)](https://lucaberton.com/blog/kong-vs-envoy-vs-traefik-api-gateway-2026/)
- [APISIX Adoption Rates Analysis (Apache APISIX Blog)](https://apisix.apache.org/blog/2025/02/06/analyzing-api-gateway-adoption-rates/)
- [Apache APISIX vs Kong Full Comparison 2025 (API7.ai)](https://api7.ai/apisix-vs-kong)

### Envoy / kgateway / Solo.io
- [Gloo Gateway (kgateway) Overview (Solo.io)](https://www.solo.io/products/kgateway)

### gRPC / Connect-RPC / Buf
- [Connect: A Better gRPC (Buf Build Blog)](https://buf.build/blog/connect-a-better-grpc)
- [ConnectRPC Introduction](https://connectrpc.com/docs/introduction/)
- [REST vs GraphQL vs tRPC vs gRPC in 2026 (Pockit Blog)](https://pockit.tools/blog/rest-graphql-trpc-grpc-api-comparison-2026/)

### HAPI FHIR
- [HAPI FHIR Version Compatibility Matrix](https://hapifhir.io/hapi-fhir/docs/getting_started/versions.html)
- [HAPI FHIR 2025 Changelog](https://hapifhir.io/hapi-fhir/docs/introduction/changelog.html)

### TypeSpec
- [TypeSpec Overview (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/developer/typespec/overview)
- [TypeSpec Release 1.4.0 (September 2025)](https://typespec.io/docs/release-notes/release-2025-09-09/)
- [OpenAPI vs TypeSpec (Nordic APIs)](https://nordicapis.com/openapi-vs-typespec-which-to-use/)

### AsyncAPI / Apicurio
- [AsyncAPI and Apicurio for Asynchronous APIs (AsyncAPI Blog)](https://www.asyncapi.com/blog/asyncapi-and-apicurio-for-asynchronous-apis)
- [Apicurio Registry User Guide (Red Hat 3.0)](https://docs.redhat.com/en/documentation/red_hat_build_of_apicurio_registry/3.0/html-single/apicurio_registry_user_guide/index)
- [Apicurio Registry + EventCatalog Integration](https://www.eventcatalog.dev/blog/apicurio-registry-eventcatalog)

### GraphQL Security / Persisted Queries
- [Persisted Operations for Enhanced GraphQL Security (Stellate)](https://stellate.co/blog/persisted-operations-for-enhanced-graphql-security)
- [Safelisting with Persisted Queries (Apollo Docs)](https://www.apollographql.com/docs/graphos/platform/security/persisted-queries)
- [GraphQL Security (graphql.org)](https://graphql.org/learn/security/)

### Spring MVC vs WebFlux
- [When to Choose Spring WebFlux vs. Spring MVC + Virtual Threads (vinicius.io)](https://vinicius.io/blog/when-to-choose-spring-webflux-vs-spring-mvc-virtual-threads/)
- [Spring MVC vs WebFlux in 2025 (dev.to)](https://dev.to/cristian_voicu_79d8daf8b9/spring-mvc-vs-webflux-in-2025-which-one-should-you-actually-use-31ho)

### Error Formats
- [RFC 9457 ProblemDetails in Spring Boot 3 (springboot-123.mizucoffee.com)](https://springboot-123.mizucoffee.com/en/blog/spring-boot-problem-details-rfc9457-error-response-guide/)
- [Returning Errors Using ProblemDetail in Spring Boot (Baeldung)](https://www.baeldung.com/spring-boot-return-errors-problemdetail)

### Idempotency Keys
- [Designing Robust APIs with Idempotency (Stripe Engineering Blog)](https://stripe.com/blog/idempotency)
- [Implementing Stripe-like Idempotency Keys in Postgres (brandur.org)](https://brandur.org/idempotency-keys)
- [Working with the Idempotency Keys RFC (HTTP Toolkit Blog)](https://httptoolkit.com/blog/idempotency-keys/)
- [Idempotent Requests (Stripe API Reference)](https://docs.stripe.com/api/idempotent_requests)

---

*ADR-0103 authored 2026-05-24. Next review: before Phase 2 kickoff or when gRPC Phase 2 criteria are evaluated.*
