# ADR-0098 (Archived) — Backend Services Runtime Research (legacy ADR-0100 DRAFT)

> **⚠️ DRAFT (pending re-validation per [ADR-0099](0099-charter-priorities-vision.md))** — recommendation tentative; assumes JVM/Kotlin baseline that has been opened back up. Context + Forces + Options sections remain valuable; Recommendation + Open Questions are tentative until re-validated. Superseded by [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md), which replaced its Kotlin/Spring recommendation with NestJS/TS.


## Status

Superseded by [ADR-0100](0100-foundation-platform-runtime.md) (archived research). Date: 2026-05-24.

---

## Context

CuraOS is a composable platform targeting three concurrent deployment models from the same artifact:
cloud SaaS (per-tenant schema isolation, horizontal scale), on-premises customer-hosted (single tenant,
air-gapped optional), and hybrid (vendor control plane + customer data plane). The backend consists of
91 planned microservices organized as neutral-core (`*-core-service`, `personal-*-service`,
`business-*-service`) plus opt-in vertical overlays (HealthStack, EducationStack, ERP).

Every service must be **independently deployable**, expose a **versioned API and event contracts**,
support **multi-tenancy** (schema-per-tenant for SaaS, single-tenant for on-prem), and meet
**HIPAA/GDPR readiness** for the HealthStack overlay.

Runtime selection is one of the highest-leverage decisions in the platform lifecycle. It determines:

- **Ops cost per replica** at 91-service scale — memory and CPU floor per service compounds rapidly.
- **Developer hiring pool** — the language must have enough practitioners to staff a growing team.
- **Ecosystem depth** — event-driven, multi-tenant, audit-logging, observability, and OpenAPI libraries
  must exist and be maintained.
- **Cold-start and container size** — relevant for Kubernetes autoscaling at the edge of cost-efficient
  scheduling, especially for infrequently-hit overlay services.
- **Security patch cadence** — a high-CVE framework or slow patch velocity is unacceptable for HIPAA.
- **Build-time characteristics** — at 91 services, compile-time friction multiplies across every CI run.

The current codebase commits Kotlin 2.0.x + Spring Boot 3.4.x on JVM 21 (Temurin) + Gradle 8.x. This
ADR performs a greenfield-style review of that choice and the primary alternatives to confirm whether
to continue, switch, or introduce a bounded variant strategy.

---

## Forces / Requirements

Mapping each charter constraint and NFR to its concrete implication for runtime selection:

- **Self-hosted first / air-gap** — No dependency on SaaS-only telemetry SDKs or telemetry agents
  that phone home. Container images must be pullable from a private registry. Build toolchain must
  work without public internet access after initial setup. Language runtime license must permit
  on-premises redistribution without per-node fees.

- **No managed-cloud lock-in** — Avoid runtimes whose native libraries assume AWS Lambda, Google
  Cloud Run, or Azure Functions (e.g., AWS SDK as a transitive peer dependency in the framework
  itself). Language choice must not funnel to a single cloud's managed runtime tier.

- **Event-led (durable messaging primary)** — The framework must have mature, idiomatic libraries
  for Kafka and/or NATS (transactional outbox, consumer groups, at-least-once delivery, dead-letter
  queues). Reactive or coroutine-based consumers preferred over blocking thread-per-consumer.

- **Multi-tenant — SaaS + on-prem** — The ORM/data layer must support dynamic schema switching
  per request (search_path, schema routing) without heavy forking. Per-tenant connection pools
  must be manageable without exhausting DB connections at 100+ tenant scale.

- **HIPAA readiness** — Structured logging that can be stripped of PHI before leaving the process.
  Immutable audit trail hooks (interceptors/middleware). Tamper-evident log shipping. TLS everywhere
  native. AES-256 at-rest encryption helpers either in std-lib or a mature ecosystem library.

- **GDPR readiness** — Subject-rights support (right to erasure requires soft-delete or data
  partitioning). Data-classification annotations on entity fields. The runtime should not make
  erasure harder (e.g., no compile-time serialization that bakes PII into binary metadata).

- **Sub-second P95 / stateless horizontal scale** — For I/O-bound microservices (typical for this
  platform), the bottleneck is almost never CPU — it is thread-pool saturation and GC pause. The
  runtime must handle high concurrency without blocking threads or GC-induced tail latencies.

- **Observability default-on** — OpenTelemetry SDK availability for traces + metrics + logs.
  Automatic instrumentation of HTTP handlers and DB calls. Must export to OTLP collector without
  vendor-specific agent.

- **Hiring + team growth** — A specialist language with <0.5% developer mindshare is a long-term
  ops burden. The chosen runtime should be learnable from a strong Java/JVM background within
  weeks for senior engineers.

- **Security patch cadence** — CVEs affecting auth, serialization, or HTTP parsing must be patched
  and released within 72h of disclosure. Framework must have a dedicated security advisory process.

- **Localization / i18n** — Full UTF-8, RTL layout support, locale-aware date/number formatting.
  JVM has the most mature ICU4J integration; Go/Rust require explicit attention.

- **Build reproducibility at scale** — With 91 services, build time matters. Incremental builds,
  dependency caching, and Docker layer caching must be achievable without heroic CI configuration.

---

## Decision Drivers (Weighted)

| Criterion | Weight (1–10) | Rationale |
|---|---|---|
| Operational memory footprint | 9 | 91 services × N replicas — memory floor dominates infra cost |
| Cold-start latency | 7 | Kubernetes autoscaling; overlay services may be infrequent |
| Developer velocity / DX | 8 | 91 services need to be built, not tuned |
| Ecosystem depth (event, ORM, auth, audit) | 9 | No custom wheel-reinvention at platform scale |
| Hiring pool depth | 8 | Long-term team scaling; rare skills = key-person risk |
| Observability maturity (OTEL) | 8 | Default-on tracing/metrics/logs is non-negotiable |
| Multi-tenancy pattern fit | 8 | Schema-per-tenant + context propagation built-in or proven |
| HIPAA/GDPR library readiness | 8 | HealthStack overlay is a primary commercial target |
| GraalVM / native-image support | 6 | Reduces cold-start + container size; not mandatory day-1 |
| Security CVE response cadence | 9 | Regulated data; slow patches unacceptable |
| License (on-prem redistribution) | 7 | Must be distributable on customer infra |
| Build-time / CI ergonomics | 6 | Compounds at 91 services but solvable with caching |
| Cross-platform (Linux / ARM) | 6 | On-prem may be ARM servers or Raspberry Pi edge |
| TCO (CPU + memory + container size) | 8 | Ops budget for SaaS profile and customer on-prem sizing |

---

## Options Considered

---

### Option A: Kotlin 2.x + Spring Boot 3.4.x (Current Commitment)

**What it is:** Kotlin 2.x on the JVM (Java 21 Temurin) with Spring Boot 3.4.x. Spring Boot
provides auto-configuration, Spring Security, Spring Data JPA/R2DBC, Spring WebFlux/MVC, and
Spring Actuator for observability. Kotlin adds null-safety, data classes, coroutines, and
concise syntax over Java with full JVM interoperability. Build tooling is Gradle 8.x with Kotlin
DSL. Optional GraalVM native-image compilation available through Spring Boot AOT support since 3.0.

**Current adoption signal:** Spring Boot commands ~60% of JVM microservice deployments globally
(JVM Ecosystem Report 2024, Snyk). Kotlin is the 3rd most-used JVM language after Java and Scala
for server-side; its server-side adoption grew 30% YoY per JetBrains Developer Survey 2024.
Netflix, Uber, Pinterest, and Atlassian run Kotlin server-side at scale. Spring Boot 3.4 released
November 2024 with virtual thread improvements, Docker Compose integration, and AOT optimizations.
See: [Spring Boot 3.2 + Java 21 InfoQ](https://www.infoq.com/articles/spring-boot-3-2-spring-6-1/).

**Strengths:**

1. **Largest JVM ecosystem.** Every enterprise integration (LDAP, JMS, Batch, AMQP, Kafka,
   Redis, Cassandra) has a Spring Boot starter maintained by VMware/Broadcom or the community.
   Prevents NIH syndrome at scale.
2. **Kotlin null-safety reduces runtime NPEs.** Kotlin's type system enforces null handling at
   compile time. For a 91-service platform serving healthcare data, this class of defect elimination
   is material to HIPAA reliability posture.
3. **Kotlin coroutines + Spring WebFlux = high-concurrency I/O.** Spring WebFlux with Kotlin
   coroutines lets developers write sequential-looking code while the runtime is non-blocking.
   Spring 6.1 / Boot 3.2+ added official virtual thread (Project Loom) support for MVC — enabling
   blocking-style code to scale without reactive overhead.
4. **Spring Security is the reference HIPAA/enterprise auth implementation** on the JVM. RBAC,
   ABAC, method-level security, OAuth2/OIDC, hardware-key (FIDO2/WebAuthn) support, and MFA all
   exist as first-class modules. The 2025 CVE-2025-41248/41249 auth-bypass was patched within days
   of disclosure. See: [Spring Security Advisories](https://spring.io/security/).
5. **Spring Data multi-tenancy is battle-tested.** HikariCP connection pooling with dynamic schema
   routing (`SchemaMultiTenantConnectionProvider`, `SET search_path`), Hibernate multi-tenant ORM
   strategies (SCHEMA, DATABASE, DISCRIMINATOR), and ThreadLocal tenant context interceptors are
   documented and production-proven. Source: [Schema-based multi-tenancy](https://medium.com/@oguz.topal/schema-based-multi-tenancy-with-spring-boot-hibernate-d9fb707f3603).
6. **Spring Boot Actuator + Micrometer + OTEL is first-class.** OpenTelemetry auto-instrumentation
   ships with Spring Boot 3.x. Traces, metrics, and logs all export to OTLP collector. No manual
   instrumentation for standard HTTP, DB, and messaging paths.
7. **GraalVM native-image production-ready for Spring.** Spring Boot 3.x native images: startup
   from ~8s → ~150ms; idle heap from ~512MB → ~64MB (bellsoft.com benchmarks 2025). BuildPacks
   handle native compilation without local GraalVM install. See:
   [Spring Boot Native Images docs](https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html).
8. **Gradle Kotlin DSL.** Type-safe build scripts share the same language as production code —
   reduces context switching and enables refactoring across build files.
9. **Largest hiring pool of all JVM options.** Spring + Java/Kotlin is taught at university level
   globally. On-prem enterprise customers' internal teams recognize the stack.
10. **Data class + sealed class for domain modeling.** Kotlin's sum types enable exhaustive pattern
    matching — valuable for event-driven command/event modeling (no missed cases at compile time).

**Weaknesses / Risks:**

1. **JVM warm-up memory floor.** Even with Spring Boot 3.4 and virtual threads, a JVM service
   at idle consumes ~150-300MB RSS (JIT mode). At 91 services × 2 replicas = 182 instances,
   this implies 27-55GB RAM floor for infrastructure — significant for on-prem customer sizing.
2. **Startup time (JIT mode).** Even optimized Spring Boot 3.4 with virtual threads starts in
   2-5 seconds (JIT mode). This matters for cold-start on Kubernetes when autoscaling infrequently
   used overlay services (HealthStack, EducationStack). Native image mitigates but adds build
   complexity.
3. **Spring's opinionated autoconfiguration creates cognitive overhead.** For smaller services,
   Spring's classpath scanning, proxy chains, and BeanDefinition resolution can be harder to
   reason about than a minimal framework. Debugging a misconfigured autoconfiguration at 3am
   is non-trivial.
4. **Broadcom/VMware stewardship risk.** Since Broadcom's VMware acquisition (2023), Spring's
   commercial licensing, enterprise support, and open-source commitment have been scrutinized.
   The open-source Spring projects remain Apache 2.0, but future direction is less transparent
   than community-governed alternatives.
5. **GraalVM native-image build time.** Native image compilation takes 3-15 minutes per service.
   For 91 services, a full native CI pipeline would be long without parallelism. Not all Spring
   libraries support AOT (Spring-WS excluded as of 2025).
6. **Kotlin coroutines + Spring requires careful testing.** Mixing coroutine and blocking code
   in Spring Boot requires understanding dispatcher semantics. Thread pinning with virtual threads
   and synchronized blocks is a known pitfall (addressed in Java 24 with virtual thread unfixing).
7. **Reactive vs imperative split.** Teams must choose WebFlux (reactive/coroutine) or MVC +
   virtual threads per service. Mixing both in a platform creates cognitive inconsistency.

**Self-hosted readiness:** Full. Apache 2.0 license. GraalVM Community Edition is GPLv2-CE (free).
Temurin is Apache 2.0. All artifacts are distributable on-prem without license fees. Container images
can be built from scratch (Dockerfile) without internet access post-pull. Air-gap: Maven/Gradle
dependencies need a local Nexus/Artifactory mirror — standard for enterprise on-prem.

**Multi-tenancy fit:** Strong. Spring Data JPA + Hibernate multi-tenancy strategies are first-class.
Schema-per-tenant with HikariCP pool + dynamic `search_path` is documented and production-proven.
Spring Security's `SecurityContext` propagates tenant identity through request scope naturally.
R2DBC reactive pool supports per-connection schema switching for reactive services.

**Event-driven readiness:** First-class. Spring Kafka (`spring-kafka`), Spring AMQP (RabbitMQ),
Spring for Apache Pulsar. Transactional outbox pattern supported via Spring Modulith's `EventPublication`
store (persists events to DB, publishes reliably). Dead-letter handling, retry templates, and consumer
group management all have Spring abstractions.

**HIPAA/GDPR readiness:** Strong. Spring Security's method-level security (`@PreAuthorize`) for
RBAC/ABAC. Spring Audit (`@CreatedBy`, `@LastModifiedBy`) for entity-level audit trails. Logback/Log4j2
with Kotlin-DSL for structured logging (mask PHI via MDC filters). Spring Batch for subject-rights
bulk operations. AES-256 at rest via JCA. Jasypt integration for config-level encryption.

**Observability story:** Best-in-class. Spring Boot Actuator exposes health, info, metrics. Micrometer
integrates with Prometheus, Datadog, and OTLP. Spring Boot 3.2+ ships OpenTelemetry auto-instrumentation
via Micrometer Tracing + OTLP exporter — zero-code traces/metrics/logs for HTTP, JDBC, Kafka consumers.

**GraalVM native-image story:** Production-ready since Spring Boot 3.0 (March 2023). Spring AOT
processes the application graph at build time, generating hint metadata for the native compiler.
Startup: 150ms vs 4-8s JIT. Memory: 64-128MB vs 256-512MB JIT. Caveat: some dynamic reflection-heavy
libraries need manual hints; Spring-WS excluded. Build time: 3-15 min per service on modern CI.

**Hiring + community pulse:** Spring Boot tops the JVM framework category in every developer survey.
Stack Overflow 2025: Java ranks top 5 most-used languages. Kotlin admired by 67% of users who try it
(JetBrains 2024). GitHub: spring-boot 75k+ stars, active releases. CVE response: dedicated Spring
Security team, patches within 48-72h of critical disclosures historically.

**TCO indicators:**
- Memory (JIT, idle): ~200-300MB RSS per replica
- Memory (native image, idle): ~64-128MB RSS per replica
- Container size (JIT, JRE base): ~250-350MB
- Container size (native, distroless): ~80-120MB
- P99 latency (I/O-bound): sub-5ms with virtual threads under normal load
- Cold start (JIT): 3-6s; (native): 100-200ms

**War stories:** Netflix runs Kotlin server-side at massive scale. Uber migrated critical services
to Kotlin. Atlassian (Jira, Confluence) ships Spring Boot on JVM. Spring Boot is the reference
implementation for countless HIPAA-compliant healthcare platforms in the US enterprise market.

---

### Option B: Kotlin + Quarkus 3.x

**What it is:** Quarkus ("Supersonic Subatomic Java") is a Red Hat-developed framework purpose-built
for GraalVM native-image and JVM with a build-time metadata resolution approach (vs Spring's
runtime reflection). Quarkus 3.x targets Jakarta EE 10, MicroProfile 6, and Vert.x as its reactive
core. Kotlin support is first-class since Quarkus 1.7. Build tooling: Maven or Gradle (Maven
preferred by community).

**Current adoption signal:** Quarkus 3.x has seen strong adoption in cloud-native and Red Hat
OpenShift environments. JVM Ecosystem Report 2024 (Snyk) places Quarkus at ~10-15% of new JVM
service starts. Red Hat offers commercial support (Red Hat Build of Quarkus). GitHub: 13k+ stars,
active development. See: [Why Choose Quarkus in 2025](https://medium.com/@issam1991/why-choose-quarkus-in-2025-5aae6637eeeb).

**Strengths:**

1. **Best-in-class native-image startup and memory among JVM frameworks.** Quarkus native image:
   startup ~10-50ms, RSS ~20-70MB at idle. A Quarkus native service with 20.72MiB backend memory
   is cited in production benchmarks — 58% lower than equivalent Spring Boot native.
   Source: [Quarkus Native vs JVM](https://medium.com/@issam1991/quarkus-native-vs-jvm-real-world-performance-comparison-e766f59706f6).
2. **Build-time metadata resolution.** Quarkus resolves CDI, JPA, and REST metadata at build time —
   much less runtime reflection. This makes native-image compilation more reliable (fewer runtime
   hints needed) and startup more predictable.
3. **Dev services (zero-config test containers).** `@QuarkusTest` auto-starts Postgres, Kafka,
   Redis via Testcontainers in dev mode without manual test fixtures — dramatically speeds TDD cycle.
4. **Vert.x reactive core.** Built on Mutiny (reactive library) and Vert.x, Quarkus is natively
   non-blocking. For event-driven services consuming Kafka or NATS, this is idiomatic, not bolted-on.
5. **Multi-tenancy via Hibernate ORM.** Quarkus ships Hibernate ORM multi-tenancy with schema,
   database, and discriminator strategies. Community extensions (quarkus-multitenancy, triplex-style)
   add tenant resolver flexibility. Source:
   [Quarkus Multi-tenant](https://coffeebeans-brewinginnovations.medium.com/schema-based-multi-tenant-architecture-using-quarkus-hibernate-orm-cffd6e672db0).
6. **Red Hat commercial support.** For enterprise/healthcare on-prem customers requiring
   support contracts, Red Hat's OpenShift ecosystem covers Quarkus. SOC 2/HIPAA-covered runtime.
7. **Live coding in dev mode.** `quarkus dev` watches for changes and reloads in milliseconds
   vs Spring DevTools' slower restart — better DX for rapid iteration on 91 services.
8. **MicroProfile JWT + OpenID Connect built-in.** Standards-based auth (JWT validation,
   OpenID Connect, RBAC via `@RolesAllowed`) without additional dependencies.

**Weaknesses / Risks:**

1. **Smaller ecosystem than Spring.** Not every Spring Boot starter has a Quarkus equivalent.
   Edge cases in enterprise integrations (LDAP, JMS, complex JAXB) require community extensions
   of varying quality.
2. **Kotlin + Quarkus DX not fully native.** Quarkus is Java-first. Kotlin support is documented
   but coroutine integration with Mutiny adds cognitive friction. Teams must learn both Kotlin
   coroutines AND Mutiny reactive patterns.
3. **Smaller hiring pool.** Quarkus-specific engineers are rarer than Spring Boot engineers.
   Training overhead exists even for senior Java developers.
4. **Native-image build times remain long.** Even with Quarkus's more reliable native compilation,
   build times are 3-10 minutes per service — same structural problem as Spring native.
5. **Community size behind Spring.** Stack Overflow Quarkus question volume is a fraction of
   Spring's. Fewer tutorials, fewer StackOverflow answers for edge cases.
6. **DB schema generation disabled with multitenancy.** Hibernate ORM's automatic DDL
   generation feature is incompatible with Quarkus multi-tenancy setup — migrations must be
   managed entirely externally (Flyway/Liquibase). Source: Quarkus issue #5681.
7. **Mutiny reactive model steeper than Spring Reactor + coroutines.** Mutiny's Uni/Multi
   model is less familiar to Kotlin coroutine users than Reactor's Mono/Flux.

**Self-hosted readiness:** Full. Apache 2.0 license (open-source core). Red Hat subscription
optional. GraalVM CE is GPLv2-CE (free). Distributable on-prem without fees. Air-gap: same
Nexus/Artifactory mirror requirement as Spring.

**Multi-tenancy fit:** Good. Hibernate ORM multi-tenancy strategies supported (SCHEMA, DATABASE,
DISCRIMINATOR). Custom `TenantResolver` via CDI. Connection pool management via Agroal (Quarkus
default). Less battle-tested than Spring's HikariCP + Hibernate combination at enterprise scale.

**Event-driven readiness:** Strong. Quarkus Messaging (SmallRye Reactive Messaging) provides
declarative Kafka, RabbitMQ, AMQP connectors. `@Incoming`/`@Outgoing` annotations on methods —
cleaner than Spring Kafka's listener annotation chains for pure event pipelines.

**HIPAA/GDPR readiness:** Adequate. Quarkus Security with RBAC (`@RolesAllowed`), OpenID Connect,
JWT validation. SmallRye JWT for claims-based ABAC. Audit requires custom Hibernate entity listeners
(no first-party equivalent to Spring Data Audit). Structured logging via JBoss Logging + JSON formatter.

**Observability story:** Good. Quarkus MicroProfile OpenTracing → migrated to OpenTelemetry SDK.
`quarkus-opentelemetry` extension provides auto-instrumentation for HTTP, JDBC, Kafka. OTLP export
supported. Prometheus metrics via SmallRye Metrics.

**GraalVM native-image story:** Best-in-class for JVM. Quarkus was designed native-first. 90%+ of
official extensions support native. Build time comparable to Spring native but with higher first-time
success rate (fewer manual hints). Startup: ~10-50ms, Memory: ~20-70MB.

**Hiring + community pulse:** Growing but behind Spring. Red Hat-backed, strong in OpenShift shops.
GitHub 13k stars, consistent growth. JVM Ecosystem Report 2024: 10-15% new service adoption. Stack
Overflow question density: ~15% of Spring Boot's. Adequate for a team willing to train.

**TCO indicators:**
- Memory (JIT): ~150-250MB RSS idle
- Memory (native): ~20-70MB RSS idle
- Container (native, distroless): ~50-80MB
- Cold start (native): 10-50ms
- P99 (I/O-bound): sub-5ms (Vert.x reactive core)

**War stories:** Red Hat's own OpenShift tooling uses Quarkus. Multiple European healthcare ISVs
run Quarkus on OpenShift with Red Hat support. Deutsche Telekom's open-source IoT platform Enmasse
used Quarkus for event processing.

---

### Option C: Kotlin + Ktor 3.x

**What it is:** Ktor is JetBrains' official Kotlin HTTP framework — lightweight, coroutine-native,
and deliberately minimal (no IoC container, no ORM, no autoconfiguration). Ktor 3.x adds server-side
improvements and better plugin system. It is Kotlin-Multiplatform-compatible, meaning the same code
can target JVM and native (via Kotlin/Native). Build: Gradle with Kotlin DSL.

**Current adoption signal:** Ktor is the preferred framework for Kotlin-first shops that want
coroutine-native simplicity. JetBrains uses it internally. Not yet widely adopted at enterprise
scale. GitHub: ~13k stars. Benchmark data shows ~5,000 req/s at 32-128 concurrent connections in
standard tests — lower throughput than Spring WebFlux in raw benchmarks but competitive for typical
I/O-bound service loads. Source: [Ktor vs Spring Boot](https://www.boundev.com/blog/kotlin-server-side-development-spring-boot-ktor).

**Strengths:**

1. **Fully coroutine-native.** No reactor, no Mutiny — pure Kotlin coroutines end-to-end. Lower
   cognitive overhead for Kotlin teams. Structured concurrency via coroutineScope propagates
   cancellation correctly.
2. **Minimal dependency surface.** Ktor services start with <10 dependencies at Gradle resolution.
   This reduces CVE surface area significantly relative to Spring Boot's dependency graph.
3. **JetBrains ownership = alignment with Kotlin roadmap.** Ktor evolves with Kotlin language
   features (value classes, context receivers, coroutines). Spring Boot adapts Kotlin idioms;
   Ktor is built for them.
4. **Fast cold start without native image.** Ktor JVM services start in ~300-500ms without GraalVM
   — significantly faster than Spring Boot JVM (~3-6s). For overlays with irregular traffic, this
   matters without the build-time cost of native compilation.
5. **Lightweight and testable.** No classpath scanning, no proxy magic. Business logic is easier
   to unit test in isolation. TestApplication starts in milliseconds.
6. **Excellent for API-first microservices.** Routing DSL, content negotiation, and auth plugins
   are clean and composable. Suitable for the majority of CRUD + event-consumer pattern in CuraOS
   neutral-core services.

**Weaknesses / Risks:**

1. **No batteries included.** No Spring Data, no built-in ORM, no admin security framework. Every
   integration (Kafka, DB connection pool, structured logging, multi-tenancy) must be assembled
   from libraries. At 91 services, this assembly multiplies.
2. **Multi-tenancy requires manual implementation.** No first-class Hibernate multi-tenancy
   strategy equivalent. Schema-per-tenant requires custom application-layer middleware. Higher
   implementation risk for the SaaS tenant model.
3. **No Spring Security equivalent.** Authentication/authorization is plugin-based (JWT, OAuth2
   plugins exist but are thin wrappers). Enterprise features (RBAC method-level, hardware key,
   FIDO2) require more custom code than Spring Security provides.
4. **Smaller ecosystem than Spring or Quarkus.** ktor-exposed (Jetbrains Exposed ORM) is less
   mature than Hibernate. Kafka integration via third-party (kafka-clients). Missing enterprise
   integration connectors (JMS, LDAP, SFTP).
5. **Hiring pool narrower.** Ktor-specific knowledge is rarer than Spring Boot. Kotlin developers
   from Android background may know Ktor but lack enterprise microservices pattern experience.
6. **GraalVM native-image limited.** Ktor does not have first-class GraalVM native-image support
   akin to Quarkus or Spring Boot AOT. Kotlin/Native is a separate compilation target with
   significant limitations for JVM-library-dependent code.
7. **Observability: manual setup.** No Actuator equivalent. OpenTelemetry must be added manually
   via ktor-client-plugins and OTel SDK. More setup work than Spring Boot's zero-config OTEL.

**Self-hosted readiness:** Full. Apache 2.0. Kotlin standard library is Apache 2.0. No runtime
fees. Air-gap: same Nexus mirror pattern.

**Multi-tenancy fit:** Limited native support. Must build custom tenant resolver, connection routing
middleware, and context propagation from scratch or via Exposed library. Higher engineering cost
than Spring or Quarkus for schema-per-tenant at SaaS scale.

**Event-driven readiness:** Adequate. Raw Kafka client (`kafka-clients`) with coroutine wrappers.
No opinionated messaging abstraction layer. Teams must implement retry, DLQ, outbox manually.

**HIPAA/GDPR readiness:** Thin out-of-box. JWT plugin for auth. Logging via Logback. No
enterprise audit trail framework. All HIPAA-specific patterns (PHI log masking, tamper-evident audit)
require custom implementation — higher risk surface for a regulated platform.

**Observability story:** Manual. Add `ktor-opentelemetry` plugin (community) or wire OTel SDK
manually into route handlers. Less mature auto-instrumentation than Spring Boot or Quarkus.

**GraalVM native-image story:** Not production-ready. Ktor on JVM is the de-facto deployment mode.

**Hiring + community pulse:** Niche but growing. JetBrains backing ensures long-term maintenance.
Not suitable as the sole framework for a 91-service platform requiring enterprise integrations.

**TCO indicators:**
- Memory (JIT): ~80-150MB RSS idle (no Spring bootstrap overhead)
- Container size: ~180-250MB (JRE base)
- Cold start (JVM): 300-500ms
- P99 (I/O-bound): sub-5ms (coroutine-native)

**War stories:** JetBrains uses Ktor in internal tooling. Used by Kotlin Multiplatform projects
targeting shared server/client code. Less documented large-scale deployments than Spring or Quarkus.

---

### Option D: Go 1.23+ (Chi, Gin, stdlib net/http)

**What it is:** Go is a statically compiled, garbage-collected language from Google, now at version
1.23+. No JVM. Compiles to a single static binary. Common choices for HTTP routing: `chi` (idiomatic,
middleware-first), `gin` (high-performance, opinionated), `echo` (batteries-included), or pure
`net/http` (stdlib-only). For CuraOS's event-driven pattern: `sarama` or `kafka-go` for Kafka,
`nats.go` for NATS. ORM: `ent` (Atlas/Facebook), `sqlc` (type-safe SQL gen), or `gorm` (Rails-like).

**Current adoption signal:** Go dominates cloud-native infrastructure (Kubernetes, etcd, Prometheus,
Terraform, HashiCorp stack, Docker, Grafana, CockroachDB). CNCF ecosystem is majority Go. TechEmpower
Round 23: Fiber (Go) achieves ~735k req/s JSON serialization, Gin ~702k req/s. Atlas (multi-tenant
Go platform) runs schema-per-tenant in production. Source:
[100 Microservices in Go](https://medium.com/@optimzationking2/i-wrote-100-microservices-in-go-heres-what-i-d-never-do-again-5af0a7d79ff2),
[Atlas Multi-tenant Go](https://atlasgo.io/blog/2025/05/26/gophercon-scalable-multi-tenant-apps-in-go).

**Strengths:**

1. **Smallest memory footprint of any GC'd runtime.** Go services typically idle at 10-30MB RSS.
   At 91 services × 2 replicas, this is ~2-5GB infrastructure floor vs JVM's 27-55GB. Transforms
   on-prem customer hardware requirements dramatically.
2. **Single static binary, no runtime dependency.** `go build` produces a standalone binary.
   Container images can be as small as `FROM scratch` + binary (~15-40MB). Air-gap deployment
   is trivial — copy binary, run. No JRE/JDK on customer servers.
3. **Deterministic GC pauses.** Go's GC (concurrent, tri-color mark-and-sweep) is tuned for
   low-latency. P99 GC pause typically <1ms vs JVM's occasional multi-millisecond STW pauses.
4. **Fastest compile times.** Full incremental build of a medium Go service: <5 seconds. For 91
   services in CI, total build time is a fraction of JVM (no JIT warmup artifacts).
5. **Strong cloud-native hiring pool.** Go is the language of DevOps, platform engineering, and
   cloud-native development. CNCF ecosystem knowledge transfers directly. Stack Overflow 2025: Go
   used by ~14% of professional developers — competitive with Kotlin (7%) for backend hiring.
6. **First-class OpenTelemetry support.** `go.opentelemetry.io/otel` is a CNCF-graduate SDK.
   Auto-instrumentation for `net/http`, `database/sql`, gRPC, Kafka available. OTLP export native.
   Source: [Go OpenTelemetry guide](https://reintech.io/blog/go-opentelemetry-integration-unified-observability-guide).
7. **Multi-tenancy proven in production.** Atlas's schema-per-tenant + `ent` ORM + Chi middleware
   pattern for Go is documented and production-deployed. RLS (Row Level Security) in PostgreSQL
   with `current_setting('app.current_tenant')` works natively. Source: [Atlas blog](https://atlasgo.io/blog/2025/05/26/gophercon-scalable-multi-tenant-apps-in-go).
8. **No license complexity.** Go toolchain is BSD-3-Clause. All common libraries (gin, chi, kafka-go,
   sarama, ent, sqlc) are MIT or Apache 2.0.
9. **Simple concurrency model (goroutines + channels).** For I/O-bound services: launch goroutines
   per request, communicate via channels. Less conceptual overhead than reactive streams or coroutine
   dispatchers for mid-level engineers.

**Weaknesses / Risks:**

1. **Error handling is verbose and repetitive.** `if err != nil { return err }` appears dozens of
   times per function. Stack traces are not automatic — `%w` wrapping required. The Go team published
   a blog acknowledging this remains the top developer pain point (blog.go.dev 2025).
   Source: [Biggest Golang challenges](https://www.infoworld.com/article/2338486/biggest-golang-challenges-are-error-handling-and-learning-go-developers-say.html).
2. **Generics still feel bolted on.** Go 1.18+ generics help collection utilities but constrain
   advanced type-driven domain modeling. Complex event schema hierarchies (CuraOS has clinical data
   models) are less elegant than Kotlin sealed classes.
3. **No Spring Security equivalent.** Auth, RBAC, ABAC, FIDO2/WebAuthn, hardware keys: must be
   assembled from libraries (`casbin` for RBAC/ABAC, `go-oidc` for OpenID Connect, `webauthn-go`).
   More implementation work than Spring Security or Quarkus Security.
4. **ORM maturity behind JVM.** `ent` (Facebook's Go ORM) is the best option but younger and less
   feature-complete than Hibernate. `gorm` has known reflection-based issues. `sqlc` (type-safe SQL
   codegen) is excellent but requires raw SQL discipline across 91 services.
5. **HIPAA library ecosystem thin.** No structured-logging PHI-masking library comparable to
   Logback's filter chain. No tamper-evident audit library. Teams must build HIPAA patterns from
   primitives (`zap`/`zerolog` + custom field redaction).
6. **No built-in dependency injection.** Google Wire (compile-time DI) or Uber Fx (runtime DI)
   must be added. At 91 services, the boilerplate of manual wiring compounds unless a DI framework
   is adopted consistently.
7. **Weaker enterprise integration ecosystem.** JMS, LDAP, SFTP, SOAP/WSDL integrations that
   Spring covers natively need custom libraries or CGO-based bindings in Go.
8. **Less familiar to JVM-trained teams.** A team built on Kotlin/Java experience needs 2-4 weeks
   of intentional training to write idiomatic Go. Wrong patterns (mutex abuse, goroutine leaks)
   are subtle.

**Self-hosted readiness:** Excellent. Statically linked binaries work in air-gapped environments
without any runtime installation. BSD-3 / MIT / Apache 2.0 licenses throughout. Docker `FROM scratch`
images are the smallest in any category.

**Multi-tenancy fit:** Proven but manual. Atlas's `ent` + Chi middleware pattern for schema-per-tenant
is documented and production-tested. Connection pooling per tenant via cached `*ent.Client` map with
mutex is the idiomatic pattern. No framework-level abstraction — must build and maintain consistently
across all 91 services.

**Event-driven readiness:** Good. `sarama` (Confluent, battle-tested), `kafka-go` (Segment, simpler
API), `nats.go` (JetStream for durable messaging). No opinionated transactional outbox library
(must build on top of `pgx` + manual outbox table polling or use tools like Debezium externally).

**HIPAA/GDPR readiness:** Adequate but requires investment. `zap` or `zerolog` for structured logging
with field-level redaction (custom field types). No framework-level PHI audit interceptor. Must build
audit trail as application middleware. Go's crypto stdlib (AES-256) is FIPS-validated in BoringCrypto
mode — relevant for HIPAA technical safeguards.

**Observability story:** Strong. `go.opentelemetry.io/otel` is production-grade CNCF SDK. HTTP,
gRPC, database/sql, and Kafka consumer instrumentation available. OTLP export to any collector.
Prometheus client is Go-native (Prometheus itself is written in Go).

**GraalVM native-image story:** Not applicable. Go compiles to native binaries natively — no JVM,
no native-image compilation step. Container images are already minimal.

**Hiring + community pulse:** Go ranks 14th most-used language overall (SO 2025) but is the
dominant language in cloud infrastructure. Senior Go engineers command $135-180k USD (2025 market data).
Talent pool is narrower than Java/Kotlin but growing. 25% CI build-performance concerns in Rust survey
(Rust team) do NOT apply to Go — Go build times are a well-known strength.

**TCO indicators:**
- Memory: 10-30MB RSS idle
- Container size (`FROM scratch`): 15-40MB
- Cold start: <100ms (no GC warmup needed)
- P99 latency (I/O-bound): sub-3ms
- Throughput (TechEmpower R23, Fiber): ~735k req/s JSON

**War stories:** Cloudflare, Dropbox, Uber (partial), Docker, Kubernetes, Prometheus, Grafana,
Terraform, Vault, Consul, etcd, CockroachDB — Go at infrastructure scale is the most proven
pattern in cloud-native computing. Atlas runs multi-tenant schema-per-tenant SaaS in Go in production.

---

### Option E: Rust 1.80+ (Axum + Tokio, or Actix-web)

**What it is:** Rust is a systems language with memory safety enforced at compile time (no GC).
`tokio` is the de-facto async runtime. `axum` (version 0.8 as of March 2026, by the tokio team)
is the most popular Rust web framework, combining ergonomic routing with the Tower middleware
ecosystem. `actix-web` is an older, higher-throughput alternative. For a healthcare platform, Rust's
memory safety guarantees (no buffer overflows, no use-after-free) are a meaningful security property.

**Current adoption signal:** TechEmpower Round 22: Rust frameworks held 6 of top 10 positions in
the Fortunes test. Axum 0.8 released March 2026. Discord rewrote from Go to Rust for gateway
services (reported significant memory reduction). 1Password backend is Rust. Cloudflare Workers
Rust. AWS Lambda uses Rust for performance-critical infra. Source:
[Axum guide 2025](https://www.shuttle.dev/blog/2023/12/06/using-axum-rust),
[Rust vs Go 2025](https://blog.jetbrains.com/rust/2025/06/12/rust-vs-go/).

**Strengths:**

1. **Peak performance + minimum memory.** Rust services idle at 5-15MB RSS (no GC, no JVM). In
   TechEmpower R22, Rust frameworks achieved top positions across plaintext, JSON, and DB tests.
   For DICOM streaming, imaging pipelines, or lab result processing in HealthStack, Rust is
   unmatched.
2. **Memory safety without GC.** Rust's borrow checker eliminates buffer overflows, data races,
   and use-after-free at compile time. For HIPAA workloads handling ePHI, this is a genuine
   security property (not just marketing).
3. **Single binary, `FROM scratch` containers.** Like Go, Rust compiles to native binaries.
   Container images 10-30MB. No runtime installation on customer servers. Air-gap deployment trivial.
4. **Deterministic performance.** No GC pauses. Latency tail is extremely tight — critical for
   time-sensitive clinical workflows (order entry, real-time telemetry).
5. **FIPS-ready crypto.** Rust's `ring` and `rustls` crates are used in production FIPS-validated
   configurations (AWS, Mozilla). Better cryptographic primitives than most JVM options.
6. **Growing async ecosystem.** Tokio, Axum, SQLx (async Postgres/MySQL/SQLite), SeaORM, Tonic
   (gRPC), Lapin (RabbitMQ), rdkafka (Kafka) — the async backend ecosystem is mature enough for
   production microservices.

**Weaknesses / Risks:**

1. **Compiler learning curve is the steepest of any option.** The borrow checker rejects code
   patterns that are normal in every other language. ~45% of developers who tried Rust cited
   compile times as a reason for abandoning it (Rust Compiler Survey 2025). Onboarding a JVM
   team to production-quality Rust takes 3-6 months minimum.
2. **Compile times are long.** 25% of CI Rust users call build performance "a big blocker"
   (Rust survey 2025). Incremental rebuilds are improving but linking phase is slow. For 91
   services each with separate CI pipelines, this is a significant operational cost. Source:
   [Rust Compiler Survey](https://blog.rust-lang.org/2025/09/10/rust-compiler-performance-survey-2025-results/).
3. **Multi-tenancy ecosystem is nascent.** No ORM equivalent to Hibernate's multi-tenancy strategies.
   SeaORM and SQLx handle migrations but schema-per-tenant context propagation requires manual
   middleware. Higher implementation risk.
4. **HIPAA/enterprise library ecosystem is thin.** No Spring Security / Quarkus Security equivalent.
   Auth (JWT, OAuth2) via `jsonwebtoken`, `oauth2` crates — functional but unpolished. Audit trail,
   PHI masking, tamper-evident logging: all custom builds.
5. **Hiring pool is the smallest.** Rust ranks as most-admired (SO 2025: 72%) but fewest
   professionals use it for backend services. Senior Rust engineers command $180k+ and are rare.
   For a 91-service platform, staffing risk is real.
6. **Async Rust complexity.** `async fn`, `Pin`, `Future` lifetimes, and `Send + Sync` bounds
   add cognitive overhead that even experienced Rust developers find challenging. Mixing sync and
   async code requires careful attention to `spawn_blocking`.
7. **No built-in DI or IoC.** Dependency wiring is manual (constructor injection) or via community
   crates. At 91 services, consistency requires strong architectural discipline.
8. **Operator-unfamiliar tools.** Cargo workspaces, linker configuration (mold, LLD), and RUSTFLAGS
   tuning are not common knowledge outside Rust shops. Ops teams from JVM backgrounds need retraining.

**Self-hosted readiness:** Excellent. MIT/Apache 2.0 licenses for Axum, Tokio, SQLx. Single binary
deployments. Air-gap trivial. No runtime fees.

**Multi-tenancy fit:** Requires significant custom build. No framework-level multi-tenancy. SQLx
pool per tenant or dynamic connection switching via `SET search_path` per-query must be implemented
from scratch and maintained across all services.

**Event-driven readiness:** Adequate but younger. `rdkafka` (librdkafka Rust bindings, production-grade),
`lapin` (RabbitMQ, AMQP 0-9-1), `async-nats` (NATS JetStream). Transactional outbox: manual
implementation on top of `SQLx` + polling or external Debezium CDC.

**HIPAA/GDPR readiness:** Crypto primitives are best-in-class. Application-level HIPAA patterns
(audit trail, PHI masking, ABAC) require custom libraries. `tracing` crate + structured logging
is mature. No enterprise HIPAA middleware library exists yet.

**Observability story:** `opentelemetry-rust` (CNCF) is stable. `tracing-opentelemetry` integration
is production-used. Auto-instrumentation less plug-and-play than Spring Boot but achievable with
manual spans. Prometheus metrics via `prometheus` crate or `metrics` facade.

**GraalVM native-image story:** Not applicable. Rust compiles to native code directly. Containers
are already small (10-30MB). Build is native by definition.

**Hiring + community pulse:** Most-admired language 7 years running (SO 2025). But adoption gap
remains large. Rust backend microservices jobs are growing but total count lags Go and JVM significantly.

**TCO indicators:**
- Memory: 5-15MB RSS idle
- Container size: 10-30MB
- Cold start: <50ms (no runtime)
- P99 latency: sub-1ms in CPU-bound scenarios; sub-3ms I/O-bound
- Throughput (TechEmpower R22): Top positions across multiple tests

**War stories:** Discord rewrote read states service from Go to Rust: memory usage dropped from
~6.7GB to ~20MB for equivalent load (Discord Engineering blog). 1Password, Cloudflare Workers,
AWS Firecracker VMM, Dropbox syncing engine.

---

### Option F: TypeScript + NestJS (Node 22 or Bun)

**What it is:** NestJS is a Spring Boot-inspired TypeScript framework for Node.js. It provides a
modular architecture, dependency injection, decorators, and transport-layer abstractions (TCP, Redis,
RabbitMQ, Kafka, gRPC). Runs on Node.js 22 (LTS) or Bun (3x faster JS runtime from Oven). TypeScript
gives type safety and IDE support comparable to Kotlin.

**Current adoption signal:** NestJS is one of the most popular Node.js frameworks for enterprise
backends. Used by healthcare teams for HIPAA-compliant APIs (PSI Nest launched in 12 weeks, passed
HIPAA security assessment). Node 22 is LTS. Bun achieves ~89k req/s vs Node 22's ~29k req/s in
Express-equivalent tests. Source:
[NestJS HIPAA](https://dev.to/waseemahmad/building-hipaa-compliant-healthcare-software-lessons-from-psi-nest-2eco),
[Bun vs Node 2026](https://tech-insider.org/bun-vs-nodejs-2026/).

**Strengths:**

1. **Largest developer hiring pool globally.** JavaScript/TypeScript are the most-used languages
   (SO 2025: JS #1 13 years running). Frontend developers can contribute to backend without full
   context switch. For a product startup, this is a meaningful team-building advantage.
2. **NestJS mirrors Spring Boot patterns.** Modules, decorators, DI, interceptors, guards, pipes —
   JVM developers onboard to NestJS within days. The conceptual transfer from Spring Boot is the
   easiest of any non-JVM option.
3. **HIPAA-compliant implementations documented.** PSI Nest case study: launched in 12 weeks,
   passed HIPAA security assessment. TechMagic 200+ person team specializes in HIPAA NestJS.
   AES-256 at rest, TLS 1.3, immutable audit logs (6-year retention) all achievable with standard
   libraries. Source: [PSI Nest HIPAA case study](https://dev.to/waseemahmad/building-hipaa-compliant-healthcare-software-lessons-from-psi-nest-2eco).
4. **Kafka/RabbitMQ transport built into NestJS.** `@nestjs/microservices` provides transport
   abstraction over Kafka, Redis, RabbitMQ, NATS, gRPC, MQTT — switching transport without
   changing business logic. The cleanest abstraction of any option listed.
5. **Bun runtime: 3x+ faster than Node 22.** Bun achieves ~89k req/s vs Node's ~29k req/s for
   similar Express-equivalent loads. Bun 2.0 reached ~95% compatibility with Node APIs (2025). For
   NestJS, most code works without modification on Bun.
6. **Rich OpenAPI / Swagger ecosystem.** `@nestjs/swagger` generates accurate OpenAPI 3.1 docs
   from decorators — critical for the 91-service API versioning contract in CuraOS.
7. **Fast iteration cycle.** TypeScript with hot-reload (`ts-jest`, `swc`) and Bun's fast startup
   enables rapid TDD. Bun starts NestJS in ~500ms vs Node's 1-2s.

**Weaknesses / Risks:**

1. **Node.js single-threaded event loop limits CPU-bound workloads.** For imaging processing,
   lab result computation, or bulk clinical data operations, Node's event loop saturates without
   worker threads. Worker threads add complexity comparable to reactive streams.
2. **Memory consumption higher than Go or Rust.** Node.js 22 services typically idle at 80-200MB
   RSS. V8 GC is less predictable than Go's GC. At 91 services × 2 replicas, memory floor is
   14-36GB — better than JVM but higher than Go.
3. **Bun production maturity uncertain at 91 services.** Bun 1.3.x had intermittent memory leaks
   in long-running processes (72+ hours) patched in 1.3.2. Not 100% Node API compatible — edge
   cases surface in production. Source:
   [Bun vs Node 2026 blog](https://betterstack.com/community/guides/scaling-nodejs/nodejs-vs-deno-vs-bun/).
4. **Multi-tenancy requires manual implementation.** NestJS has no built-in multi-tenant ORM
   strategy. TypeORM and Prisma support schema switching but not with the same maturity as
   Hibernate's multi-tenancy strategies.
5. **Type safety weaker than Kotlin.** TypeScript's type system has escape hatches (`any`, `as`).
   Runtime type validation requires separate libraries (`zod`, `class-validator`). Null safety is
   opt-in with strict mode — not enforced at the type system level for third-party types.
6. **Runtime errors vs compile-time errors.** TypeScript catches many errors at compile time but
   JSON deserialization, HTTP client responses, and runtime casts remain runtime risks without
   defensive schema validation.
7. **Not the natural choice for cloud-native infrastructure teams.** DevOps/SRE teams experienced
   with Go/Rust/JVM ecosystems find Node.js tooling (npm/Bun package management, V8 debugging,
   heap dumps) less familiar.

**Self-hosted readiness:** Good. Node 22 is MIT-licensed. Bun is MIT. No runtime fees. Container
images: `node:22-slim` ~180MB, `oven/bun:1.3` ~130MB. Air-gap: npm/Bun package mirror (Verdaccio)
needed — simpler than Maven/Gradle mirrors.

**Multi-tenancy fit:** Moderate. TypeORM schema switching, Prisma multi-schema support, or manual
pool routing. Less battle-tested than Spring Data + Hibernate at enterprise scale.

**Event-driven readiness:** Strong via NestJS transport layer. `@nestjs/microservices` with Kafka,
Redis, RabbitMQ, NATS, gRPC — transport-agnostic business logic. `kafkajs` for custom Kafka patterns.

**HIPAA/GDPR readiness:** Documented and achievable. Structured logging via `pino` (JSON structured).
Winston for audit trails. `nestjs-audit-log` community module. AES-256 via Node's `crypto` module
(FIPS-validated BoringSSL in some Node builds). TLS 1.3 native.

**Observability story:** Good. `@opentelemetry/node` auto-instrumentation. OTLP export. Prometheus
client (`prom-client`). NestJS Terminus for health checks. Less mature auto-instrumentation than
Spring Boot but functional.

**GraalVM native-image story:** Not applicable. Bun bundles and ahead-of-time compiles JS to
native for CLI tools but not general server runtime. `node:22` is JIT-interpreted. No meaningful
native-image story for NestJS.

**Hiring + community pulse:** Largest pool of any option. TypeScript is the 5th most-used language
overall and most-used among web developers. NestJS GitHub: 67k+ stars — largest of any backend
framework listed in this ADR. Active Discord community, extensive documentation, many consultancies
specialize.

**TCO indicators:**
- Memory: 80-200MB RSS idle (Node 22); ~50-150MB (Bun)
- Container: 180MB (node:22-slim); 130MB (Bun)
- Cold start: 1-2s (Node); 200-500ms (Bun)
- P99 latency (I/O-bound): sub-10ms
- Throughput: ~89k req/s (Bun + Express-equivalent)

**War stories:** Typeform, Adidas, Sanofi (pharma), PSI (HIPAA healthcare). Companies running
NestJS microservices in production at 50-200 service scale. Gegosoft medical telemetry project.

---

### Option G: Elixir + Phoenix 1.8 (BEAM Concurrency)

**What it is:** Elixir runs on the BEAM VM (Erlang's virtual machine), which was built for
telecom-grade fault tolerance. Phoenix is the web framework. OTP supervision trees restart failed
processes automatically. Each request is an isolated process (not a thread). LiveView enables
server-side real-time UIs. The BEAM supports hot-code upgrades without downtime. Ecto is the ORM/query
layer.

**Current adoption signal:** Discord, WhatsApp (Erlang), Pinterest, PagerDuty, Bleacher Report use
BEAM in production. HCA Healthcare built an Elixir HL7 v2.x library for clinical data parsing.
Erlang Solutions has delivered HIPAA-compliant Elixir systems (Pando Healthcare, Hillrom/Baxter).
Multi-tenant Elixir SaaS is supported via `triplex` (schema-per-tenant) and `tenantex` libraries.
Source: [AppSignal multi-tenant Phoenix](https://blog.appsignal.com/2023/11/21/setting-up-a-multi-tenant-phoenix-app-for-elixir.html).

**Strengths:**

1. **Unmatched fault tolerance.** OTP supervision trees restart failed processes automatically.
   The BEAM's "let it crash" philosophy means individual request failures do not cascade into service
   failures. For a 99.9%+ availability requirement, BEAM's architecture is purpose-built.
2. **Concurrency without shared state.** Each BEAM process is isolated with its own heap. No
   shared-memory data races, no mutex deadlocks. A service handling 100k concurrent connections
   uses lightweight BEAM processes (not OS threads) at a fraction of the memory cost.
3. **Built-in distributed primitives.** Node clustering, distributed process registration, and
   pub/sub over the cluster (Phoenix PubSub) are part of the runtime — not add-on libraries.
4. **Soft-realtime for clinical workflows.** Telemetry streaming, care plan updates, and real-time
   vitals dashboards benefit from BEAM's sub-millisecond message passing and Phoenix Channels/LiveView.
5. **Multi-tenancy via Triplex.** Schema-per-tenant in PostgreSQL with automatic migration management
   per tenant. Production-proven pattern for Elixir SaaS apps.
6. **Oban for reliable background jobs.** Postgres-backed durable job queue with per-tenant queuing,
   concurrency limits, and dead-letter handling. Outbox pattern achievable.

**Weaknesses / Risks:**

1. **Smallest hiring pool of any option.** Elixir ranks in the 2-3% developer adoption range
   globally. Finding senior Elixir engineers outside of specific hubs (Europe, some US cities) is
   difficult. A 91-service platform built in Elixir creates severe key-person risk.
2. **Not suited to CPU-bound or data-intensive workloads.** BEAM is single-scheduler per core by
   default. DICOM imaging, ML inference, or bulk ETL in Elixir will underperform Go or Rust by
   a large margin. "NIF" (Native Implemented Functions) for CPU work adds complexity.
3. **Unfamiliar paradigm for OOP-trained teams.** Functional, immutable, actor-model. Engineers
   from Java/Kotlin/TypeScript backgrounds need 2-4 months to think idiomatic Elixir. Debugging
   OTP supervision trees requires Erlang Observer knowledge.
4. **Container image size.** BEAM runtime is large (~500MB base image). Distroless not supported.
   At 91 services, container storage multiplies.
5. **JVM ecosystem integrations non-trivial.** No LDAP, JMS, or JVM-native enterprise integration
   equivalent. HTTP clients and external APIs via `Tesla` / `Req` — functional but smaller library
   surface.
6. **Observability still maturing.** `opentelemetry_beam` is the CNCF SDK. Stable but less
   auto-instrumented than Spring Boot. Manual span attachment often needed.
7. **Package manager (Hex) smaller than npm or Maven.** Fewer libraries for edge enterprise
   requirements. More custom implementation risk.

**Self-hosted readiness:** Good. Elixir and Phoenix are MIT/Apache 2.0. BEAM VM (OTP) is
Apache 2.0 since Erlang 20. Distributable on-prem. Air-gap: Hex mirror (hex.pm mirrors supported).

**Multi-tenancy fit:** Good via Triplex/Tenantex. Schema-per-tenant with Ecto multi-tenancy
support. Dynamic repo configuration per tenant. Less battle-tested at >500 tenant scale than Spring.

**Event-driven readiness:** Strong. `brod` (Kafka), `broadway` (multi-stage data pipeline with Kafka,
SQS, RabbitMQ support), Oban for Postgres-backed queuing. Phoenix PubSub for in-cluster messaging.

**HIPAA/GDPR readiness:** Achievable. HCA Healthcare deployed Elixir for HL7 clinical data. Erlang
Solutions specializes in HIPAA Elixir systems. Elixir Logger with structured formatters. Comeonin for
password hashing (bcrypt, argon2). Custom audit Ecto middleware. Less out-of-box than Spring Security.

**Observability story:** `opentelemetry_beam` for traces/metrics/logs. OTLP export. AppSignal
(Elixir-native APM) for managed observability. Prometheus metrics via `prometheus_ex`. Less
auto-instrumented than Spring Boot.

**GraalVM native-image story:** Not applicable. BEAM is its own VM. No GraalVM interop.

**Hiring + community pulse:** Elixir admired by 66% of users who try it (SO 2025). But absolute
user count is small. Excellent for greenfield teams with Elixir experience. High risk for teams
coming from JVM backgrounds.

**TCO indicators:**
- Memory: 30-80MB RSS idle per service (BEAM lightweight processes)
- Container: ~400-600MB (BEAM runtime base)
- Cold start: 500ms-2s (BEAM VM startup)
- P99 latency (I/O-bound): sub-5ms
- Throughput: competitive with JVM for I/O-bound; below Go/Rust for CPU-bound

**War stories:** Discord (1M+ concurrent connections on BEAM at peak before Go migration for gateway
specifically). WhatsApp scaled to 1B users on Erlang/OTP with 2M connections per server node.
Bleacher Report realtime sports scores on Phoenix. Pando Healthcare (Erlang Solutions HIPAA deploy).

---

### Option H: Java + Micronaut 4 or Java + Helidon 4

**What it is:** Two modern JVM frameworks designed to address Spring Boot's memory and startup
problems while preserving the JVM ecosystem. Micronaut 4 uses compile-time DI (annotation processor)
— no reflection at runtime. Helidon 4 (Oracle) is designed around Java 21 virtual threads (Níma
model: one virtual thread per request, blocking-style code). Both support GraalVM native-image.

**Current adoption signal:** Micronaut: ~5-8% new JVM service adoption (JVM Ecosystem 2024). Helidon:
Oracle-maintained, used in Oracle Cloud Native Services. Neither approaches Spring Boot or Quarkus
in community size. Benchmark comparisons: Micronaut starts in ~0.65s (JVM), Spring Boot ~1.9s JVM;
native: Micronaut ~50ms, Spring Boot ~104ms. Helidon native: ~20-60ms. Source:
[JVM Battle 2025](https://medium.com/@reyanshicodes/spring-boot-vs-micronaut-vs-quarkus-the-2025-jvm-framework-battle-ae6365d810f4).

**Strengths:**

1. **Micronaut: AOT compile-time DI** eliminates reflection-based startup cost. GraalVM native
   more reliable (less manual hints) than Spring.
2. **Helidon Níma: virtual-thread-first** design. Blocking-style code scales without async
   complexity. Cleaner than Spring MVC + virtual threads (purpose-built, not retrofitted).
3. **JVM ecosystem compatibility.** Both frameworks run on JVM 21, so Hibernate, Flyway, Kafka
   clients, and security libraries work without modification.
4. **Oracle backing for Helidon** means long-term support alignment with JDK releases.
5. **Smaller memory than Spring Boot JVM mode.** Micronaut RSS ~100-200MB JIT vs Spring's ~200-350MB.

**Weaknesses / Risks:**

1. **Community significantly smaller than Spring Boot and Quarkus.** Stack Overflow density a
   fraction of Spring's. Fewer consultancies, fewer open-source integrations.
2. **Kotlin support in Micronaut is secondary.** Java-first framework. Kotlin coroutines less
   idiomatic than in Ktor or Spring WebFlux.
3. **Helidon is Oracle-governed.** Strategy shifts with Oracle's cloud product priorities. Less
   community-driven than Spring or Quarkus.
4. **Fewer enterprise integrations.** JMS, LDAP, SOAP: community-maintained or missing.
5. **Multi-tenancy: no first-party support.** Must build manually, same as Quarkus but with
   smaller community to reference.
6. **Lower name recognition for enterprise customer on-boarding.** Customer IT review boards
   evaluate "have you heard of this framework" as a risk signal.

**Self-hosted readiness:** Full. Apache 2.0 (Micronaut), Apache 2.0 (Helidon). GraalVM CE free.

**Multi-tenancy fit:** Manual implementation required. No framework-level multi-tenancy strategy.
Hibernate multi-tenancy APIs are usable but without framework scaffolding.

**Event-driven readiness:** Micronaut Kafka, Micronaut RabbitMQ extensions available. Helidon
messaging via MicroProfile Reactive Messaging. Both less polished than Spring Kafka.

**HIPAA/GDPR readiness:** Micronaut Security for JWT/OAuth2/RBAC. Helidon Security with OpenID
Connect. Audit trail via custom Hibernate interceptors. Similar footprint to Quarkus for HIPAA.

**Observability story:** Micronaut Micrometer + OTLP. Helidon MP Metrics + OTel. Both functional
but less mature auto-instrumentation than Spring Boot Actuator.

**TCO indicators:**
- Memory (Micronaut JIT): ~100-200MB
- Memory (native): ~40-80MB
- Memory (Helidon Níma, JIT): ~80-150MB
- Memory (Helidon native): ~20-60MB
- Cold start (native): 20-60ms

---

### Option I: Cloud-Managed Function Runtimes (AWS Lambda, Google Cloud Run)

**INCLUDED AS CONTRAST ONLY — violates CuraOS self-hosted charter.**

AWS Lambda, Google Cloud Run, and Azure Functions are managed serverless runtimes that abstract the
server layer entirely. JVM cold starts on Lambda improved with SnapStart (CRaC). Go and Rust have
~10ms cold starts on Lambda.

**Why this is excluded:** The CuraOS charter requires self-hosted-first, air-gapped operation, and
no managed-cloud lock-in. Serverless platforms require internet connectivity to the cloud provider's
control plane, cannot be deployed on customer on-prem infrastructure, and create vendor dependency
on proprietary runtime behavior (Lambda layers, concurrency limits, VPC configurations) that cannot
be reproduced in an air-gapped environment.

Noting what we forgo by excluding this option:
- Extreme cold-start optimization via SnapStart (JVM) or Firecracker micro-VMs
- Zero server management (patching, capacity planning)
- Per-invocation billing models suitable for infrequent overlay services
- Managed security patching of the host environment

For CuraOS, these benefits do not outweigh the charter violation. Kubernetes + HPA autoscaling
with fast cold-start runtimes (native JVM or Go/Rust) achieves equivalent behavior on self-hosted
infrastructure.

---

## Comparison Matrix

| Option | Memory Footprint | Cold Start | Ecosystem Depth | Multi-tenancy | Event-Driven | HIPAA Readiness | Observability | Hiring Pool | Build Ergonomics | License/IP Risk | Overall Score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A: Kotlin + Spring Boot** | 3 (JIT) / 4 (native) | 3 (JIT) / 5 (native) | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 3 (Broadcom risk) | **44** |
| **B: Kotlin + Quarkus** | 4 (JIT) / 5 (native) | 4 (JIT) / 5 (native) | 4 | 4 | 5 | 4 | 4 | 3 | 3 | 5 | **42** |
| **C: Kotlin + Ktor** | 4 | 4 | 2 | 2 | 2 | 2 | 2 | 3 | 4 | 5 | **30** |
| **D: Go** | 5 | 5 | 4 | 4 | 3 | 3 | 4 | 4 | 5 | 5 | **42** |
| **E: Rust + Axum** | 5 | 5 | 3 | 2 | 3 | 3 | 3 | 1 | 2 | 5 | **32** |
| **F: TypeScript + NestJS** | 3 | 3 | 4 | 3 | 4 | 4 | 3 | 5 | 4 | 4 | **37** |
| **G: Elixir + Phoenix** | 4 | 3 | 2 | 3 | 4 | 3 | 3 | 1 | 3 | 5 | **31** |
| **H: Java + Micronaut/Helidon** | 4 | 4 | 3 | 2 | 3 | 3 | 3 | 3 | 3 | 4 | **32** |

Scores are 1–5 per criterion. Weighted by decision driver table: memory (9), cold-start (7),
velocity (8), ecosystem (9), hiring (8), observability (8), multi-tenancy (8), HIPAA (8),
build (6). Unweighted matrix shown above for readability; recommendation below applies weights.

---

## Recommendation

### Primary: Kotlin 2.x + Spring Boot 3.4.x + JVM 21 (Temurin) — Continue Option A

**With phased native-image adoption for overlay services.**

After applying the full decision-driver weighting, Option A scores highest when accounting for:
- Ecosystem depth and HIPAA library maturity (weight 9 each) — Spring Boot's margin over all
  alternatives is decisive.
- Hiring pool (weight 8) — Spring Boot + JVM is universally hirable; Go and Rust require specialist
  searches.
- Multi-tenancy maturity (weight 8) — Spring Data JPA + Hibernate multi-tenancy strategies are the
  most documented and battle-tested path to schema-per-tenant at CuraOS's scale.
- Observability auto-instrumentation (weight 8) — Spring Boot Actuator + Micrometer + OTEL is the
  most plug-and-play of any option.

**Committing to Kotlin + Spring Boot for the next 5+ years across all 91 services means:**
- **Hiring:** Senior engineers with Spring Boot background can be productive in 1-2 weeks. Kotlin
  adoption from Java experience requires ~2-3 weeks of mentored ramp-up. Wide consultant/contractor
  pool for surge capacity.
- **Ops:** JVM memory floor is the primary cost concern. Mitigation: (1) native-image for overlay
  services with irregular traffic (HealthStack, EducationStack cold paths), (2) virtual threads
  for high-concurrency neutral-core services, (3) right-size replicas using Micrometer metrics.
- **Security:** Spring Security CVE response is one of the fastest in the open-source ecosystem.
  Authorization bypass CVEs in 2025 were patched and released within 48 hours.
- **Vendor risk:** Broadcom's Spring stewardship is a monitored risk. Apache 2.0 license protects
  against hard forking. The open-source project governance has not changed post-acquisition, and
  the community is large enough to sustain a fork (VMware Spring fork precedent exists). Review
  annually.
- **Migration cost from current state:** Zero. This is the current codebase.

**Required platform conventions to lock in with this choice:**

1. All services use `spring-boot-starter-web` (MVC + virtual threads) or `spring-boot-starter-webflux`
   (reactive + coroutines) — document which per service; do not mix within the same service.
2. Spring Data JPA multi-tenancy via `SchemaMultiTenantConnectionProvider` + `SET search_path` +
   HikariCP pool is the standard pattern — no per-service custom solutions.
3. Spring Security with `@PreAuthorize` for RBAC, method-level security disabled in neutral-core,
   ABAC via custom `SecurityEvaluationContextExtension` in overlay services.
4. Spring Boot Actuator + Micrometer + `io.micrometer:micrometer-tracing-bridge-otel` +
   `io.opentelemetry:opentelemetry-exporter-otlp` configured by default in all services.
5. Structured logging via Logback with JSON encoder (`logstash-logback-encoder`) + MDC filter
   for PHI masking in all HealthStack services.
6. Spring Modulith `EventPublication` store for transactional outbox pattern — all cross-service
   events go through the outbox, not direct Kafka publish.
7. Gradle version catalogs (`libs.versions.toml`) for dependency version consistency across all 91
   services — prevents CVE drift from version fragmentation.
8. GraalVM native-image build as an optional CI profile (not default) — enable per-service when
   cold-start or memory budget demands it.

### Fallback: Go 1.23+ (Chi or stdlib) for infrastructure-tier services

For services whose primary concern is **memory efficiency over ecosystem richness** — specifically:
infrastructure/platform services that bridge external systems, act as proxies, or run on
resource-constrained edge deployments — Go is the appropriate fallback.

**Candidates for Go variant:**
- `identity-gateway-service` (auth proxy, high-request-volume, minimal business logic)
- `event-router-service` (Kafka fan-out, no ORM, pure event routing)
- Any edge/IoT-facing adapter service in air-gapped environments

**Migration cost of Go variants:** Teams shipping Go services in a JVM-primary platform need explicit
coding standards, shared libraries (e.g., a Go multi-tenant middleware package), and CI pipeline
parity. This is manageable for 2-5 services but should not expand without a deliberate decision.

**Do NOT adopt Go for:** services requiring Hibernate multi-tenancy, Spring Security ABAC, Spring
Batch subject-rights operations, or heavy HealthStack clinical data model complexity.

---

## Per-Module Variants

**Recommendation: One primary runtime (Kotlin + Spring Boot) across all 91 services, with a
bounded Go variant for ≤5 infrastructure-tier services.**

Rationale: Operational simplicity at 91 services scales better than per-service language optimization.
Every language boundary adds CI pipeline variation, toolchain maintenance, and cross-team debugging
friction. The JVM memory overhead is addressable through right-sizing, native-image opt-in, and
horizontal autoscaling — not requiring a language switch.

**Specific variant considerations:**

- `healthstack-imaging-service` (DICOM streaming): Spring Boot with virtual threads is adequate
  for DICOM parsing throughput at clinical volume. If sub-millisecond latency or extreme memory
  constraints emerge in performance testing, evaluate a Rust sidecar for the binary streaming
  layer (not a full service rewrite). Decision deferred to performance testing phase.
- `event-router-service`: Go variant acceptable if Spring Kafka overhead proves measurable at
  the target fan-out rate (>10M events/day). Requires separate decision ADR.
- All HealthStack clinical data services: Kotlin + Spring Boot. HIPAA library ecosystem depth
  is non-negotiable for these services.
- All auth and identity services: Kotlin + Spring Boot + Spring Security. No substitution.

---

## Open Questions for User

These must be answered to finalize this decision:

1. **GraalVM native-image mandate:** Is fast cold-start (<500ms) a day-1 hard requirement for
   overlay services (HealthStack, EducationStack), or is JIT mode with Kubernetes readiness probes
   acceptable for v1? Native-image adds 3-15 min per-service CI build time; JIT avoids this.

2. **JVM memory budget for on-prem customers:** What is the minimum server spec CuraOS will
   target for on-prem single-tenant deployments? If the customer floor is 16GB RAM per server,
   JIT mode for 91 services is not viable without explicit service-to-server assignment. This
   determines how urgently native-image adoption must be planned.

3. **Team Kotlin experience level:** Is the current team (or planned hires) Kotlin-native, or
   primarily Java-trained migrating to Kotlin? This determines how quickly Kotlin coroutines +
   Spring WebFlux patterns can be adopted vs defaulting to MVC + virtual threads as primary.

4. **Broadcom/VMware risk tolerance:** The team should decide its risk threshold for Spring's
   corporate governance. If Broadcom materially degrades Spring's open-source health in the next
   2 years, what is the contingency plan? Options: (a) Spring fork, (b) migrate to Quarkus, (c)
   accept risk. This should be documented even if the answer is "monitor and reassess annually."

5. **Reactive vs imperative split policy:** Platform-wide policy needed: should all services
   default to Spring MVC + virtual threads (imperative, simpler) or Spring WebFlux + coroutines
   (reactive, higher throughput for I/O-heavy services)? Mixed codebase creates onboarding friction.

6. **Go variant approval:** Is a bounded Go variant for ≤5 infrastructure-tier services acceptable
   to the team, or is single-runtime discipline preferred? Both are defensible — the team must
   own the answer.

7. **Outbox library standardization:** Spring Modulith `EventPublication` vs custom outbox table
   implementation vs Debezium CDC externally. Which transactional outbox pattern is adopted
   platform-wide? This decision has cross-service contract implications.

8. **FIPS compliance requirement:** Do any on-prem customers operate in a FIPS 140-2/140-3 mandated
   environment (US federal healthcare, DoD adjacent)? If yes, BoringCrypto-enabled JVM (Azul FIPS
   JDK) or Go's BoringCrypto mode may be required — affects runtime choice.

9. **Multi-tenant scale target:** What is the maximum planned number of SaaS tenants in the first
   3 years? Schema-per-tenant in Postgres with HikariCP has practical limits (~1,000-2,000 schemas
   before migration time becomes a bottleneck). Above that, discriminator-column or separate-DB
   strategies need evaluation.

10. **CI build time budget:** With 91 services, what is the acceptable full-platform CI time? If
    native-image is enabled for all services, full CI could be 8-15 hours without aggressive
    parallelism. JIT-only CI for all 91 services runs in ~2-4 hours with reasonable parallelism.
    This directly influences native-image rollout scope.

---

## Reusable Upstream OSS — Backend Foundation

### Strategy: Import, Extend, Compose — Never Reinvent

CuraOS commits to maximizing reuse of mature open-source dependencies. Custom code is reserved for
genuine business differentiators (multi-tenant context propagation tailored to our schema strategy,
CuraOS-specific PHI masking rules, domain event schemas). Everything else is imported as a dependency,
extended behind an interface, or wired via upstream plugin/SPI mechanisms. This section maps the
upstream OSS landscape for the Kotlin + Spring Boot 3.4 / JVM 21 runtime chosen in this ADR.

---

### 1. OSS Starter / Boilerplate Templates

**What to import vs study:**

#### JHipster 8.x (Apache 2.0)

JHipster is a full-stack generator (Spring Boot backend + React/Angular/Vue frontend) with a dedicated
Kotlin blueprint (`jhipster-kotlin` / `khipster`). JHipster 8.0 (November 2023) upgraded to Spring
Boot 3, Hibernate 6.2, Node 18 LTS, Vue 3, and Angular 16. As of mid-2024, JHipster 8.3.0 is stable.

**What we reuse:** JHipster's generated output is the best publicly available reference for
production-quality Spring Boot service scaffolding — it encodes the community's current best practices
for security config, Liquibase migrations, Swagger/OpenAPI integration, Docker Compose dev stack, and
Testcontainers integration. We do not run the JHipster generator in production CI; we study its output
as a reference and cherry-pick patterns into our internal `curaos-service-archetype`.

**Kotlin blueprint (`jhipster/jhipster-kotlin`):** Maintained as a JHipster blueprint. Generates
Kotlin Data classes, coroutine-aware service layer, Spring WebFlux option. Governance: active (JHipster
umbrella project, Apache 2.0). Use as reference only — do not fork; too much churn to track upstream.

**Extension seam:** JHipster exposes a blueprint API for customization. If we want to enforce CuraOS
conventions (tenant context, PHI log masking) across all generated services, a private
`jhipster-blueprint-curaos` is the correct extension point — not patching generated output per service.

**Production adoption signal:** JHipster is among the most-starred Java generator projects on GitHub
(~21k stars). Used widely in European enterprise Spring shops. Not a runtime dependency — purely
generation / inspiration.

#### Spring Initializr Custom Presets

Spring Initializr (`start.spring.io`) supports custom instances. We should run a private Initializr
instance (project: `jhipster/jhipster-bom` or `spring-io/initializr`) pre-loaded with CuraOS
standard dependencies (Actuator, Micrometer OTLP, Spring Security, Spring Kafka, Spring Data JPA +
Liquibase, SpringDoc, Logback JSON encoder). This ensures new services start from a known-good
dependency baseline rather than hand-crafted `build.gradle.kts` files.

**License:** Apache 2.0. Self-hostable. No runtime dependency.

#### Spring PetClinic

The canonical Spring Boot reference application. Useful as a regression baseline when evaluating
Spring Boot upgrades — the PetClinic test suite exercises standard JPA, Thymeleaf, and Spring MVC
paths. We use PetClinic as a benchmark harness, not as a template.

#### Polar (Spring Boot + Kubernetes book)

Thomas Vitale's `PolarBookshop` (companion to *Cloud Native Spring in Action*, Manning 2023) is the
most modern production-grade reference for: Docker Compose local dev, Kubernetes manifests, Spring
Cloud Config + Vault, Keycloak integration, Testcontainers, and GitHub Actions CI. Governance: MIT
license, individual author-maintained. Study patterns; do not fork.

---

### 2. Multi-Tenant Frameworks for Spring Boot

Multi-tenancy is not a library problem — it is an infrastructure concern with library support.
The correct layering is: Hibernate multi-tenancy API (owned by JPA team) + HikariCP connection pool
+ a thin CuraOS `TenantContext` propagation layer (owned by us).

#### Hibernate Native Multi-Tenancy (3 Strategies)

Hibernate 6.x ships three strategies:

| Strategy | Mechanism | CuraOS fit |
|---|---|---|
| `SCHEMA` | `SET search_path = tenant_X` per connection | Primary — schema-per-tenant for SaaS |
| `DATABASE` | Separate JDBC URL per tenant | On-prem single-tenant; not for SaaS scale |
| `DISCRIMINATOR` | `@TenantId` column filter on shared tables | Experimental in H6; not HIPAA-safe for PHI tables |

**SCHEMA strategy implementation:** Requires implementing `MultiTenantConnectionProvider` and
`CurrentTenantIdentifierResolver` as Spring beans. HikariCP wraps connections and sets `search_path`
on borrow. Spring's `SecurityContext` propagates the tenant identifier from the JWT/OIDC claim via
a `TenantContextHolder` (ThreadLocal or Coroutine context element). This is the well-documented,
production-proven path. Source: [Callista Enterprise blog-multitenancy](https://github.com/callistaenterprise/blog-multitenancy)
demonstrates the full pattern with Spring Boot + Hibernate + Liquibase per-tenant migrations.

**What we build:** A `curaos-multitenancy-spring` internal library (~500 LOC) wrapping the Hibernate
SPIs with CuraOS naming conventions, MDC propagation, and test utilities. This is not a candidate
for import from a third-party library — existing third-party wrappers (various GitHub examples) are
unmaintained or opinionated beyond our needs. Hibernate's own SPIs are the stable seam.

**Important caveat:** Virtual threads + Hibernate 6 multi-tenancy requires explicit HikariCP pool
ceiling configuration. Virtual threads remove natural back-pressure; without a ceiling, a large number
of virtual threads can exhaust PostgreSQL connections (default max 100). Configure
`spring.datasource.hikari.maximum-pool-size` explicitly per tenant pool shard. Discovered in 2026
benchmarks at 50k req/s load (Java Code Geeks 2026).

**DISCRIMINATOR strategy status:** Still experimental / work-in-progress in Hibernate 6. The `@TenantId`
annotation auto-applies a Hibernate filter to all queries for the annotated entity. Do NOT use for
PHI-carrying HealthStack entities — filter bypass risk exists and the feature is not production-validated
at scale. Reserve for non-sensitive shared-schema scenarios if ever adopted.

#### R2DBC Reactive Multi-Tenancy

For reactive (WebFlux) services, `spring-r2dbc` supports per-connection schema switching via
`ConnectionFactory` wrapping. Coroutine `CoroutineContext` replaces ThreadLocal for tenant propagation.
The pattern is less documented than the blocking equivalent but follows the same Hibernate SPI shape.
Implement in `curaos-multitenancy-spring` with both blocking and reactive adapters behind a common
`TenantContext` interface.

---

### 3. Spring Boot Extension Ecosystem — Import These

The following libraries are import decisions (no forking, no modification — depend on as Maven/Gradle
coordinates, wrap behind interfaces where CuraOS extension is needed).

#### Spring Cloud (Apache 2.0)

| Module | Use | Notes |
|---|---|---|
| `spring-cloud-starter-config` | Centralized config from Config Server / Vault | Wire to OpenBao (ADR-0108) |
| `spring-cloud-starter-gateway` | API gateway — evaluated against APISIX (ADR-0103) | Use for local dev; production: APISIX |
| `spring-cloud-starter-stream` (Kafka binder) | Event-driven messaging abstraction | Pairs with Kafka (ADR-0102) |
| `spring-cloud-function` | FaaS-style function composition for event pipelines | Useful for pure event transformers |
| `micrometer-tracing-bridge-otel` | Bridges Micrometer API to OpenTelemetry SDK | Required by all services (ADR-0100 convention §7.4) |

Spring Cloud 2024.x / 2025.x aligns with Spring Boot 3.4.x. License: Apache 2.0. Governance:
Spring project under Broadcom/VMware (same risk as Spring Boot itself).

#### Resilience4j 2.x (Apache 2.0)

The de-facto replacement for Netflix Hystrix (which entered maintenance mode in 2018). Provides:
circuit breaker, retry, bulkhead (semaphore + thread-pool), rate limiter, time limiter. Spring Boot
auto-configuration via `resilience4j-spring-boot3`. AOP-based annotations (`@CircuitBreaker`,
`@Retry`, `@Bulkhead`) apply patterns declaratively. Actuator health indicator integration exposes
circuit state. Production configuration starting point: `slidingWindowSize=20`,
`failureRateThreshold=50`, `waitDurationInOpenState=10s`. Order matters: Bulkhead → TimeLimiter →
RateLimiter → CircuitBreaker → Retry → Method.

**Import as:** `io.github.resilience4j:resilience4j-spring-boot3` + Spring Cloud Circuit Breaker
abstraction if portability across CB implementations is needed. Direct Resilience4j is preferable
for visibility into configuration.

#### jOOQ (Apache 2.0 for PostgreSQL/MySQL/SQLite — free tier)

jOOQ generates type-safe SQL DSL from the database schema at compile time. **License critical note:**
jOOQ Open Source Edition is Apache 2.0 and free for PostgreSQL, MySQL, MariaDB, H2, HSQLDB, SQLite,
and Firebird. Commercial databases (Oracle, SQL Server, DB2) require a commercial license. Since
CuraOS targets PostgreSQL (ADR-0110), jOOQ is Apache 2.0 throughout.

**Pattern:** Use Hibernate / Spring Data JPA for write paths (entity lifecycle, optimistic locking,
cascade rules) and jOOQ for complex read queries (multi-join reports, window functions, tenant-aware
analytics, GDPR subject-rights exports). This is the hybrid persistence pragmatism endorsed by
Thorben Janssen and the JPA/jOOQ communities as of 2025-2026. The two libraries coexist in the same
Spring Boot application sharing a `DataSource`.

**Code generation:** jOOQ's Gradle plugin generates DSL classes from the schema at build time. Wire
to Liquibase migrations: generate jOOQ classes after Liquibase has applied migrations to a test
database (Testcontainers in CI). Adds ~30s to CI for schema-heavy services; worth it for compile-time
SQL correctness.

**For multi-tenant:** jOOQ `DSLContext` wraps a `Connection`; ensure the connection has the correct
`search_path` set before jOOQ executes. Use a `ConnectionProvider` that delegates to the Hibernate
multi-tenant connection provider for consistency.

#### Spring Modulith 2.0 (Apache 2.0) — Architectural Alternative Pattern

Spring Modulith 1.4 GA (March 2026) and 2.0 GA (November 2025) introduce modular monolith
capabilities that are architecturally significant for CuraOS at 91-service scale.

**What it provides:**

- `@ApplicationModule` annotation defines module API boundaries enforced at test time
- `@ApplicationModuleListener` = `@TransactionalEventListener(AFTER_COMMIT)` + `@Async` + automatic
  outbox persistence — a single annotation provides the full transactional outbox pattern for free
- `EventPublication` registry persists events to `event_publication` table (UUID PK, listener_id,
  event_type, serialized_event, publication_date, completion_date). Supported stores: JPA, JDBC,
  MongoDB, Neo4j
- Event externalization (production-ready in 1.4+): auto-publishes internal domain events to Kafka,
  RabbitMQ, or AMQP via `@Externalized` annotation — the outbox publishes to the broker without
  custom Kafka producer code
- ArchUnit integration: `ApplicationModuleTest` enforces dependency rules at test time; CI blocks
  PRs that violate module boundaries
- C4 model diagram generation from module graph (documentation-as-code)
- Staleness monitor (2.0): flags event publications stuck in pending state after configurable TTL

**Outbox configuration:**

```yaml
spring:
  modulith:
    events:
      republish-outstanding-events-on-restart: true
      completion-mode: delete   # prevents event_publication table bloat
```

**Architectural relevance for CuraOS:** Spring Modulith is not a replacement for the 91-microservice
architecture — it is the recommended internal structure within each service (a service may itself
contain multiple logical modules: `api`, `domain`, `infrastructure`, `messaging`). It enforces
package-level boundaries that prevent architecture decay over time. Additionally, Modulith's
evolutionary path is explicitly designed so that a well-structured module can be extracted into an
independent microservice with >70% reduction in refactoring effort.

**Concrete benefit for the EventPublication outbox (ADR-0100 convention §6):** Replace hand-rolled
outbox table + Kafka producer with `@ApplicationModuleListener` + Spring Modulith JPA starter. The
framework manages the `event_publication` schema, retry semantics, and completion tracking. This
eliminates ~200 LOC of custom outbox infrastructure per service.

#### MapStruct 1.6+ (Apache 2.0)

Compile-time DTO-to-entity mapper. Generates implementation classes at annotation-processing time
(no runtime reflection). MapStruct with Kotlin requires KAPT (`kotlin-kapt` Gradle plugin). Full KSP
support is not yet production-ready as of early 2024 (GitHub issue #3511 confirmed KSP path fails).
Use KAPT + `mapstruct-kotlin` extension until KSP support lands.

**Import as:** `org.mapstruct:mapstruct` + `org.mapstruct:mapstruct-processor` (kapt).
**CuraOS usage:** All service API layers (controllers → service → repository) use MapStruct for
DTO ↔ domain entity mapping. Zero runtime overhead vs hand-written converters.

#### SpringDoc OpenAPI 2.x (Apache 2.0)

Replaces Springfox (unmaintained since 2020). Generates OpenAPI 3.1 spec from Spring MVC/WebFlux
annotations at runtime and serves Swagger UI. Compatible with Spring Boot 3.x. JHipster 8 dropped
Springfox in favor of SpringDoc.

**Import as:** `org.springdoc:springdoc-openapi-starter-webmvc-ui` (MVC) or
`springdoc-openapi-starter-webflux-ui` (WebFlux).

**For CuraOS:** Every service exposes `/v3/api-docs` and `/swagger-ui.html`. The spec is the
source of truth for API versioning contracts. OpenAPI Generator (see §7) consumes these specs to
generate typed clients for inter-service calls.

#### ShedLock 7.x (Apache 2.0) — Distributed Scheduling Lock

ShedLock prevents duplicate execution of `@Scheduled` tasks in a clustered Spring Boot deployment.
It writes a lock record to a shared store (JDBC table, Redis, MongoDB, ZooKeeper) and ensures only
one instance executes the task at a time. Version 7.7.0 as of April 2026.

**Important distinction from JobRunr:** ShedLock is a lock, not a scheduler. For complex distributed
job orchestration (retries, fan-out, job history), use JobRunr (ADR-0102). ShedLock covers the
common case: "run this @Scheduled method at most once across N replicas."

**Import as:** `net.javacrumbs.shedlock:shedlock-spring` + `shedlock-provider-jdbc-template`
(Postgres-backed, consistent with CuraOS DB choice). No additional infrastructure dependency.

#### Jakarta Bean Validation + Hibernate Validator (Apache 2.0 / LGPL)

The reference implementation of Jakarta Bean Validation 3.0. Provides `@NotNull`, `@Size`,
`@Pattern`, custom `@Constraint` annotations. Spring Boot auto-configures Hibernate Validator when
on the classpath. For CuraOS: annotate all request DTOs and event payload classes. Write custom
validators for PHI-adjacent fields (e.g., `@ValidMRN`, `@ValidNPI`).

**License note:** Hibernate Validator core is Apache 2.0. The annotation processor is Apache 2.0.
No LGPL concern for embedding in application code.

#### Logback + logstash-logback-encoder (Apache 2.0)

Structured JSON logging via `logstash-logback-encoder` transforms Logback output to JSON lines
consumable by any log aggregator (Loki, Elasticsearch, Splunk). MDC (Mapped Diagnostic Context)
propagates `tenantId`, `traceId`, `spanId`, `requestId` into every log line automatically when
configured via `spring-cloud-sleuth` or Micrometer Tracing.

**PHI masking pattern:** Implement a custom `LoggingEventCompositeJsonEncoder` with a
`ValueMasker` that replaces fields tagged as PHI (custom annotation `@PhiField`) with `[MASKED]`
before the JSON encoder serializes them. This is the CuraOS-specific extension built on top of
the logstash-logback-encoder SPI — we own the masker logic, not the encoder.

---

### 4. Kotlin Ecosystem — Import These

#### Arrow 2.x (Apache 2.0)

Arrow is the functional programming companion library for Kotlin. GitHub: 6.5k+ stars, actively
maintained by 47Sciences (formerly 47Degrees). Apache 2.0.

**What to import:**
- `arrow-core`: `Either<Error, Value>` for typed error handling without exceptions, `Option<T>`
  (rarely needed given Kotlin's `?` operator), `Validated` for accumulating validation errors
- `arrow-fx-coroutines`: `Resource` for safe resource acquisition/release in coroutines,
  `Schedule` for retry policies (pairs with Resilience4j for higher-level use)
- `arrow-optics`: Immutable data class lenses — useful for deeply nested domain model updates
  in HealthStack clinical data structures

**What NOT to import yet:** Arrow's STM (Software Transactional Memory) and `arrow-resilience` are
experimental. Use Resilience4j for circuit breaker and retry; Arrow for typed domain modeling.

**Production signal:** Used in Kotlin microservices at scale (Technogise, multiple fintech teams).
Arrow 2.0 supports Kotlin Multiplatform and kotlinx.serialization, enabling shared domain models
across server and Kotlin Multiplatform client code.

**CuraOS extension seam:** Domain event types, command/query result types, and service return types
use `Either<CuraOSError, T>` throughout the domain layer. This is a build decision — no upstream
modification; Arrow is imported as-is.

#### Kotlinx Coroutines (Apache 2.0) — JetBrains

`kotlinx-coroutines-core`, `kotlinx-coroutines-reactor` (for Spring WebFlux bridge),
`kotlinx-coroutines-slf4j` (MDC propagation across coroutine boundaries). Spring Boot 3.4 manages
kotlinx-coroutines versions in its BOM — do not override the BOM version.

**Critical for multi-tenancy:** `TenantContextHolder` in a WebFlux/coroutine service must use
`CoroutineContext` elements, not `ThreadLocal`. Implement `TenantContextElement : AbstractCoroutineContextElement`
that propagates tenant ID across coroutine suspension points. This is a CuraOS-owned adapter —
not available from a third-party library.

#### Kotlinx Serialization (Apache 2.0)

`kotlinx-serialization-json` provides compile-time serialization for Kotlin data classes without
reflection. Spring Boot 4 explicitly handles the coexistence of kotlinx.serialization and Jackson:
Jackson handles `@JsonProperty` types; kotlinx.serialization handles `@Serializable` types.

**CuraOS usage:** Use kotlinx.serialization for event payload classes (fast, no reflection, works
in GraalVM native without hints). Use Jackson for HTTP request/response DTOs (Spring MVC/WebFlux
default). Enforce this split via architecture tests (ArchUnit rule: event classes must be
`@Serializable`, not `@JsonDeserialize`).

#### Kotest 5.x (Apache 2.0)

Kotlin-native testing framework. Replaces JUnit 5 for unit and integration tests in Kotlin services.
Advantages over JUnit: coroutine-native test execution (no `runBlocking` wrapper), property-based
testing via `forAll`, multiple test styles (BehaviorSpec, FunSpec, DescribeSpec), rich matcher DSL.

**Spring Boot integration:** `kotest-extensions-spring` provides `SpringExtension` that wires
Spring application context into Kotest specs. Compatible with `@SpringBootTest`, `@DataJpaTest`,
`@WebMvcTest`. Integration tests in CuraOS use `kotest-extensions-spring` + Testcontainers for
full-stack test coverage.

**Import as:** `io.kotest:kotest-runner-junit5` + `io.kotest:kotest-assertions-core` +
`io.kotest.extensions:kotest-extensions-spring`. JUnit platform integration means Gradle/Maven
test runners execute Kotest without modification.

#### MockK 1.13+ (Apache 2.0)

Kotlin-idiomatic mocking library. Unlike Mockito (Java-first), MockK handles Kotlin final classes,
coroutines (`coEvery`, `coVerify`), companion objects, extension functions, and top-level functions.
Required for unit testing in Kotlin — Mockito is a poor fit for Kotlin's final-by-default class semantics.

**Import as:** `io.mockk:mockk` (unit tests), `io.mockk:mockk-agent-jvm` (for mocking non-open
classes without `open` modifier).

#### Detekt 1.23+ (Apache 2.0)

Kotlin-specific static analysis tool. Extends Ktlint (formatting) with complexity, performance,
and style rules. Detekt 1.23 supports Kotlin 2.x. Configuration: `detekt.yml` at repo root.
Integrate into Gradle via `io.gitlab.arturbosch.detekt` plugin. Run in CI on every PR.

**CuraOS custom rules:** Implement a `curaos-detekt-rules` module with project-specific rules:
- `NoPHIInLogStatement`: flags direct string interpolation of `@PhiField` annotated variables into log calls
- `TenantContextRequired`: warns when a `@Transactional` method is called without a tenant context set

These rules are part of the `curaos-service-archetype` toolchain, not upstreamed to Detekt.

---

### 5. JVM Ecosystem Libraries — Import These

These libraries are used regardless of Kotlin vs Java and should be standardized across all 91 services.

| Library | Version | License | Purpose | Notes |
|---|---|---|---|---|
| Jackson Databind | Managed by Spring BOM | Apache 2.0 | JSON serialization/deserialization for HTTP | Default Spring MVC serializer; do not override BOM version |
| Caffeine | 3.x, managed by Spring | Apache 2.0 | In-process L1 cache | Chosen in ADR-0101; Spring Cache auto-config integrates it |
| Bouncy Castle / Google Tink | Latest | MIT / Apache 2.0 | Cryptography primitives | Chosen in ADR-0108; Tink for envelope encryption, BCFIPS for FIPS 140-2 if required |
| Apache Commons Lang3 | 3.14+ | Apache 2.0 | String utilities, reflection helpers | Import conservatively; Kotlin stdlib covers most use cases |
| Guava | 33+ | Apache 2.0 | Collections, caching, rate limiting utilities | Avoid for new code; Caffeine + Kotlin collections supersede most Guava uses |
| Apache HttpClient 5 | 5.3+ | Apache 2.0 | Sync HTTP client for non-reactive services | Spring Boot auto-configures via `RestClient`; prefer `RestClient` / `WebClient` over raw HttpClient |
| OkHttp | 4.12+ | Apache 2.0 | Sync HTTP client with connection pooling | Alternative to Apache HC5; better Kotlin ergonomics |
| Logback | 1.5+, managed by Spring BOM | EPL 1.0 + LGPL 2.1 | Logging backend | **License note:** LGPL 2.1 — acceptable for linking (not modifying). Logback is embedded, not modified |
| Log4j2 | 2.23+ | Apache 2.0 | Alternative to Logback | Use only if Log4j2 features needed; Logback is the Spring Boot default |

**On Guava:** Import only for specific utilities not covered by Kotlin stdlib or Caffeine. Avoid
`com.google.common.base.Optional` (use Kotlin `?`), `com.google.common.collect.*` (use Kotlin
collections). Reserve Guava for `BloomFilter`, `RateLimiter`, or `MultiMap` when genuinely needed.

---

### 6. Microservice + Service-Mesh Pattern Wiring

#### Spring Cloud Gateway vs APISIX (ADR-0103)

Spring Cloud Gateway is selected in local development and may serve as a fallback edge gateway.
APISIX is the production API gateway (ADR-0103). What Spring Cloud Gateway provides that APISIX does
not: deep Spring Security integration for token relay (`TokenRelayGatewayFilterFactory`), Spring
Cloud Circuit Breaker filter, and Spring Modulith routing integration in development environments.

**Pattern:** Run Spring Cloud Gateway in local Docker Compose dev stack. APISIX in staging/production.
Service code does not know which gateway is in front — they share the same contract (JWT Bearer,
tenant header `X-Tenant-ID`, tracing headers).

#### Spring Cloud Stream + Kafka Binder (ADR-0102)

`spring-cloud-stream` with `spring-cloud-stream-binder-kafka` provides a messaging abstraction over
Kafka. Producers and consumers are declared as `java.util.function.Function<Input, Output>` beans —
pure functions that Spring Cloud Stream wires to Kafka topics. This enables:

- Topic name configuration via `spring.cloud.stream.bindings.<name>.destination` (no hardcoded topic names)
- Dead-letter queue routing via `enableDlq: true` per binding
- Consumer group management via `group:` property
- Schema registry integration (Confluent Schema Registry or Karapace) for Avro/Protobuf event contracts

**Spring Cloud Function compatibility:** `spring-cloud-function` + `spring-cloud-stream` enables
deploying the same function as a Kafka consumer, an HTTP endpoint, or a serverless function — useful
for testing event processors without a running broker.

#### Spring Cloud Config + OpenBao (ADR-0108)

`spring-cloud-config-server` serves configuration from a Git repository or Vault/OpenBao backend.
CuraOS uses OpenBao (Vault OSS fork) as the secrets backend. Spring Cloud Config Server wires to
OpenBao via `spring.cloud.config.server.vault.*` properties. Services consume config via
`spring-cloud-starter-config` — config is fetched at startup, refreshed via `@RefreshScope` +
Spring Cloud Bus (Kafka-based refresh broadcast).

**Tenant-specific config:** Implement a custom `EnvironmentRepository` that augments default config
with tenant-specific overrides from a PostgreSQL `tenant_config` table. This is a thin CuraOS adapter
on top of Spring Cloud Config's `EnvironmentRepository` SPI — extend, don't modify.

---

### 7. JVM-Native Code-Generation Toolchain

Relevant when the CuraOS App/Site Builder emits backend service stubs, or when internal tooling
generates domain model boilerplate from schema definitions.

#### KotlinPoet + KSP (Apache 2.0)

KotlinPoet (Square, Apache 2.0) is the idiomatic library for programmatic `.kt` source file
generation. KSP (Kotlin Symbol Processing, Google/JetBrains, Apache 2.0) is the modern annotation
processor replacement for KAPT. KSP runs up to 2x faster than KAPT by avoiding intermediate Java
stub generation.

**Canonical stack:** KSP identifies annotated Kotlin symbols → KotlinPoet generates `.kt` source
files → standard Kotlin compiler compiles generated sources. The `kotlinpoet-ksp` interop API
converts `KSP` types to KotlinPoet types directly.

**CuraOS use cases:**
- Generate typed tenant-aware repository interfaces from `@TenantEntity` annotations
- Generate PHI field masking code for `@PhiField` annotated data class properties
- Generate event serialization boilerplate for `@DomainEvent` annotated sealed classes

**Caution:** Do not use KSP/KotlinPoet for generating business logic — only structural/infrastructural
boilerplate. Business logic must remain readable and reviewable.

#### OpenAPI Generator (Apache 2.0)

`openapi-generator-cli` generates typed HTTP clients from OpenAPI 3.x specs. For CuraOS inter-service
communication via REST (sync paths), generate Kotlin clients with `kotlin-spring` generator and
embed them as Maven dependencies published to the internal artifact repository.

**Workflow:**
1. Service A publishes its OpenAPI spec as a Maven artifact at build time
2. Service B imports the generated Kotlin client as a Gradle dependency
3. Spring Boot auto-configures base URL from `spring-cloud-config` (no hardcoded URLs)

**Generator governance:** OpenAPI Generator is Apache 2.0, community-governed (OpenAPITools org),
7,000+ stars. Actively maintained. Spring Boot 4 compatibility tracked in GitHub issue #22411 (client
generation) — verified before each Spring Boot upgrade.

---

### 8. Reference Architectures to Study (Not Import)

These are architectural references — we read and cherry-pick patterns, we do not fork or import them.

#### Spring Cloud Samples (Apache 2.0)

`spring-cloud/spring-cloud-samples` on GitHub provides canonical examples for Config Server, Gateway,
Eureka, and Stream binders. The `spring-petclinic-microservices` fork demonstrates multi-service
Spring Boot deployment with Spring Cloud. Primary reference for Spring Cloud wiring decisions.

#### eShopOnContainers (.NET, MIT)

Microsoft's .NET microservices reference application. The structural patterns are language-agnostic:
CQRS with MediatR (maps to Spring's `ApplicationEventPublisher` + Spring Modulith), transactional
outbox with `IntegrationEvent` table (maps to Spring Modulith's `EventPublication`), DDD aggregate
roots, API gateway composition. The .NET DDD book (`dotnet/docs/architecture/microservices`) is the
most comprehensive publicly available treatment of microservices DDD patterns.

**What to transfer to CuraOS:**
- Aggregate root pattern: one repository per aggregate; no repository-per-entity sprawl
- Integration event vs domain event distinction: domain events are synchronous within a service;
  integration events cross service boundaries via the outbox
- CQRS read/write model separation: write path uses Hibernate; read path uses jOOQ or projections

#### JHipster Microservice Generator Output

Running `jhipster` with the microservice profile generates: Spring Boot service, Spring Cloud
Gateway, Consul service registry, Docker Compose orchestration, and Kubernetes manifests. The
generated output is the most complete Spring Boot microservice reference available. Study the
generated `SecurityConfiguration`, `KafkaConsumer`, and Liquibase changesets. Do not fork — study.

#### Backstage Backend Architecture (Apache 2.0, TypeScript)

Backstage's plugin model — frontend plugins register backends; backends register routes and
processors — is the reference for the CuraOS App/Site Builder plugin architecture even though
Backstage is TypeScript. The structural similarity: both systems need a plugin registry, a routing
layer, and per-plugin extension points that don't require rebuilding the platform. The plugin
isolation boundary (separate Node module in Backstage; separate Spring `@ApplicationModule` or
microservice in CuraOS) is the relevant analogy.

---

### 9. License Audit Pattern

CuraOS must maintain a continuous license audit of all upstream dependencies to remain safe for
on-premises redistribution (customer deploys CuraOS on their infrastructure).

#### Acceptable License Tiers

| Tier | Licenses | Status |
|---|---|---|
| **Green** | Apache 2.0, MIT, BSD-2, BSD-3, ISC | Import without restriction |
| **Yellow — review** | LGPL 2.1, LGPL 3.0, MPL 2.0, EPL 2.0 | Acceptable for linking (not modifying). Logback (EPL 1.0 + LGPL 2.1) is in this tier — embedded, not modified |
| **Red — case-by-case** | AGPL 3.0, SSPL, BSL 1.1, BUSL, Elastic License 2.0 | Do not import without explicit legal + product approval. AGPL triggers copyleft for network services |
| **Red — avoid** | Commercial / proprietary with per-node fees | Violates self-hosted charter (§3) |

#### jOOQ License Specifics

jOOQ Open Source Edition: Apache 2.0 for PostgreSQL, MySQL, MariaDB, H2, SQLite, Derby, Firebird,
HSQLDB. Commercial databases require paid license. CuraOS targets PostgreSQL — jOOQ is Apache 2.0
throughout the platform.

#### Automated Enforcement

Use the Gradle `license-gradle-plugin` (`com.github.hierynomus.license`) or the FOSSA Gradle plugin
to scan dependency licenses in CI. Configure allowed-license list matching the Green tier above.
Fail CI if an unlisted license is introduced without an exemption comment. Run on every dependency
update PR.

#### Monitoring for License Changes

The Redis → SSPL (March 2024) and Elastic → Elastic License 2.0 (2021) events demonstrate that
Apache 2.0 projects can relicense without community consensus. Monitor critical dependencies:

- **Spring Boot / Spring Security:** Apache 2.0. Broadcom has not changed licensing post-acquisition.
  Watch annually. The open-source community's ability to fork (the community governs Apache 2.0 code)
  is the primary protection.
- **Hibernate:** LGPL 2.1. Red Hat/JBoss heritage. No relicense risk signal.
- **jOOQ:** Apache 2.0 (open-source DB edition). Lukas Eder (DataGeekery) has stated publicly that
  the OSS edition remains Apache 2.0. Watch: jOOQ's commercial editions fund development; if revenue
  pressure increases, the free tier could narrow.
- **Caffeine:** MIT. Individual-maintained (Ben Manes). MIT license; no commercial pressure.
- **Resilience4j:** Apache 2.0. Community-governed. Low risk.

---

### 10. Custom-Code Preservation Strategy

The goal is to minimize the CuraOS-owned surface while maximizing leverage from upstream.

#### Layering Pattern

```
┌─────────────────────────────────────────────┐
│   CuraOS Business Logic (domain, services)  │  ← Own 100%
├─────────────────────────────────────────────┤
│   CuraOS Adapter Layer                      │  ← Own: thin wrappers, SPIs, extensions
│   (TenantContextHolder, PhiMasker, etc.)    │
├─────────────────────────────────────────────┤
│   Upstream OSS (Spring, Hibernate, Arrow)   │  ← Import; never modify
└─────────────────────────────────────────────┘
```

- **Import as-is:** Add as Maven/Gradle coordinates. Never copy source into the CuraOS repo.
- **Extend via SPI:** When upstream offers an extension point (Spring `EnvironmentRepository`,
  Hibernate `MultiTenantConnectionProvider`, Logback `Encoder`), implement the SPI in a
  CuraOS-owned class. The SPI implementation lives in our repo; the upstream library does not change.
- **Wrap behind interface:** When upstream API may change (e.g., if Spring Cloud Config is replaced
  by Vault direct), wrap it behind a CuraOS `ConfigProvider` interface. The caller depends on the
  interface; the adapter wires to the concrete upstream.

#### Fork Strategy (When Upstream Fails)

Fork only when:
1. The upstream has a critical bug that is not being fixed and blocks us
2. The upstream has changed license to an unacceptable tier (Red)
3. The upstream is unmaintained (no commits >18 months, CVEs unpatched)

Fork mechanics:
1. Create `curaos-<upstream>-fork` repository in the CuraOS GitHub org
2. Apply minimal patch (cherry-pick or minimal diff) — do not diverge beyond the fix
3. Publish to internal Maven registry (`io.curaos.fork:<upstream>:<upstream-version>-curaos.<n>`)
4. Track upstream releases. Merge upstream fixes as they land. The goal is to collapse the fork
   at the next upstream release that includes our fix.

**No strategic forks.** CuraOS does not maintain long-lived forks of upstream projects. If a fork
would need to diverge for more than 2 upstream release cycles, re-evaluate whether the upstream
is the right choice.

#### Plugin / SPI Strategy

When upstream offers a documented plugin or SPI mechanism (Keycloak themes, Spring Security
`AuthenticationProvider`, Spring Cloud Config `EnvironmentRepository`, Hibernate
`MultiTenantConnectionProvider`, jOOQ `ExecuteListener`):

- Implement the plugin/SPI in the CuraOS repo
- Register via Spring `@Bean` or upstream's plugin registration mechanism
- Never patch upstream source — the plugin API is the contract
- Document the SPI version pinned (SPI APIs can change across major versions)

---

### 11. Import vs Build Matrix — Runtime Layer

| Concern | Import | Build (own) | Notes |
|---|---|---|---|
| Service bootstrap / autoconfiguration | Spring Boot Starter | — | `spring-boot-starter-web` or `spring-boot-starter-webflux` |
| Multi-tenant context propagation | Hibernate `MultiTenantConnectionProvider` SPI | Thin `TenantContextHolder` + coroutine element | ~500 LOC; not available as a maintained third-party lib |
| Schema-per-tenant connection routing | HikariCP (via Spring) | `SchemaMultiTenantConnectionProvider` impl | Implements Hibernate SPI |
| OpenAPI spec generation | SpringDoc OpenAPI 2.x | Custom operation customizers for PHI field redaction tags | Extend SpringDoc's `OpenApiCustomizer` SPI |
| Distributed tracing | OpenTelemetry SDK (via Micrometer Tracing) | Custom span naming convention + `TenantId` span attribute | ~50 LOC span enrichment |
| Write-path persistence (CRUD) | Spring Data JPA + Hibernate 6 | — | Standard repository pattern |
| Read-path persistence (complex queries) | jOOQ (Apache 2.0, Postgres edition) | Schema-per-tenant `DSLContext` factory | jOOQ `Configuration` wraps tenant-aware `ConnectionProvider` |
| DTO mapping | MapStruct 1.6 (KAPT) | Custom `@PhiField` mapper qualifier that redacts PHI on response | Extend MapStruct's `@Qualifier` SPI |
| Validation | Jakarta Bean Validation + Hibernate Validator | Custom `@ValidMRN`, `@ValidNPI`, `@ValidICD10` constraint implementations | Extend the constraint annotation SPI |
| Transactional outbox | Spring Modulith `EventPublication` | `@ApplicationModuleListener` per consumer | No custom outbox table needed |
| Event externalization to Kafka | Spring Modulith `@Externalized` + Cloud Stream | — | Spring Modulith handles outbox → broker publishing |
| Circuit breaker / retry | Resilience4j 2.x | — | Annotated declaratively; configure per-service in `application.yml` |
| Distributed scheduling lock | ShedLock 7.x (JDBC provider) | — | Wrap `@Scheduled` + `@SchedulerLock` |
| In-process cache | Caffeine (via Spring Cache) | CuraOS `CacheNamespaceRegistry` (tenant-aware cache eviction) | Caffeine is the implementation; we own the namespace strategy |
| Secrets / config decryption | Spring Cloud Config + OpenBao | Custom `PropertySourceLocator` for tenant-specific secrets | Extends Spring Cloud Config SPI |
| Structured logging | Logback + logstash-logback-encoder | `PhiValueMasker` (custom `JsonProvider`) | Extends logstash encoder's `JsonProviders` SPI |
| Static analysis | Detekt | `curaos-detekt-rules` module (PHI, tenant context rules) | Extends Detekt `Rule` SPI |
| Inter-service typed clients | OpenAPI Generator (`kotlin-spring`) | — | Generated from upstream service's OpenAPI spec artifact |
| Code generation (internal tooling) | KSP + KotlinPoet | Annotation definitions + processor implementations | KSP/KotlinPoet are the engine; processors are CuraOS-owned |

---

### 12. Governance and Momentum — 2024-2026 Watch List

#### Spring Boot Lifecycle

- Spring Boot 3.4.x (current, November 2024) — OSS support until November 2026. Commercial
  support (Broadcom Spring subscriptions) until 2028.
- Spring Boot 4.0 — in milestone releases as of late 2025; GA planned 2026. Kotlin 2.2 minimum
  baseline. Introduces `BeanRegistrarDsl`, JSpecify null safety (automatic Kotlin null-safe types
  from Spring APIs), kotlinx.serialization + Jackson coexistence policy (Serializable types →
  kotlinx, everything else → Jackson). Coroutine context propagation automatic for observability
  in suspending functions.
- **Migration path:** Spring Boot 3.4 → 4.0 is a supported upgrade; Kotlin 2.x is already
  required by this ADR. Plan Boot 4 upgrade at 12 months post-GA to allow ecosystem stabilization.

#### JetBrains–Spring Strategic Partnership (May 2025)

JetBrains and the Spring team formalized a strategic collaboration in May 2025 with four commitments:
(1) null safety enhancement via JSpecify across all Spring APIs; (2) official Spring documentation
in Kotlin; (3) `kotlinx.reflect` — a faster reflection library replacing `kotlin-reflect` for DI
and serialization; (4) `BeanRegistrarDsl` for lambda-based bean registration. This partnership
de-risks the Kotlin + Spring bet: two major commercial entities are now co-invested in the
developer experience. Source: [JetBrains Kotlin Blog, May 2025](https://blog.jetbrains.com/kotlin/2025/05/strategic-partnership-with-spring/).

**Adoption metric:** 27% of Spring developers use Kotlin as of 2025; 65% of new Spring Boot projects
choose Kotlin (Pivotal telemetry, SpringOne 2025). CuraOS is aligned with the dominant trajectory.

#### Kotlin 2.x Maturity

Kotlin 2.0 (May 2024) shipped the K2 compiler with up to 40% faster build times on large projects
(JetBrains benchmark). Kotlin 2.2 is the Spring Boot 4 baseline. K2 compiler is production-stable;
all major CuraOS dependencies (Arrow, Kotest, MockK, Detekt) support K2.

#### Spring Modulith 2.0 (November 2025 GA)

Spring Modulith 2.0 GA shipped November 2025 with: revamped EventPublication registry, staleness
monitor, serialized event externalization, module-specific Flyway migrations, Jackson 3 support,
C4 model diagram generation. Adoption signal: multiple Spring I/O 2025 sessions, referenced as
"essential skill for 2025 Java architects." Rapid adoption signal in enterprise Spring communities.

#### Reactor 3.x Roadmap

Project Reactor (Spring WebFlux's reactive backbone) is in maintenance/stability mode. New features
land in Spring Framework 6.x integration rather than Reactor core. Kotlin coroutines are the
recommended abstraction for new CuraOS reactive code — write coroutines, let Spring bridge to
Reactor internally via `kotlinx-coroutines-reactor`.

#### JHipster 8.x Pace

JHipster 8.x had consistent quarterly releases in 2024. The Kotlin blueprint (`jhipster-kotlin`) lags
the main generator slightly (1-2 months). Blueprint governance: community-maintained under JHipster
umbrella. Watch: JHipster has migrated to a flatter governance model post-8.0 to improve
sustainability. No license or governance risk; Apache 2.0 throughout.

---

### 13. Production References — Kotlin + Spring at Scale in Regulated Industries

#### Netflix (Spring + Kotlin, DGS Framework)

Netflix runs Kotlin server-side at massive scale. The DGS Framework (Domain Graph Service,
Netflix open-source, Apache 2.0) is a Spring Boot-based GraphQL framework written in Kotlin, used
by Netflix engineering to build federated GraphQL APIs. Netflix invested in IntelliJ plugin tooling
and automated Gradle-based upgrade tooling for Kotlin version management across a large polyrepo.
Relevant because: the tooling investment demonstrates that Kotlin at 91+ service scale is manageable
with the right automation. Source: [Netflix OSS and Spring Boot — Coming Full Circle](https://netflixtechblog.com/netflix-oss-and-spring-boot-coming-full-circle-4855947713a0).

#### Atlassian (Jira, Confluence — Kotlin + Spring Boot)

Atlassian uses Kotlin + Spring Boot for Jira Software and Confluence backend services. Atlassian is
one of the named production references in the JetBrains–Spring partnership announcement (May 2025).
HIPAA-relevant: Atlassian holds FedRAMP authorization for Jira Software and Confluence Cloud —
demonstrating that Kotlin + Spring Boot can meet US federal compliance requirements.

#### Revolut and Grab (Kotlin microservices at scale)

Revolut and Grab are cited in JetBrains' "Helping Decision-Makers Say Yes to Kotlin" (November 2025)
as running Kotlin microservices in production at scale. Both are regulated fintech environments with
compliance requirements analogous to CuraOS's HIPAA/GDPR posture (PCI-DSS, MAS TRM, FCA). Their
adoption validates that Kotlin + Spring Boot is a viable choice for regulated, high-availability
microservices with strict audit requirements.

#### Mercedes-Benz.io and Expedia (Kotlin + Spring, enterprise)

Both cited in the JetBrains–Spring partnership announcement as active Kotlin + Spring Boot shops.
Mercedes-Benz.io's backend platform (vehicle data, dealer integrations) is architecturally similar
to CuraOS's neutral-core pattern (generic platform + vertical overlays). Expedia's global
distribution system runs Kotlin microservices handling regulated financial and personal data.

---

### 14. Fork vs Import — War Stories and Lessons (2024–2026)

#### Redis → Valkey (March 2024): The Successful Community Fork

Redis changed from BSD-3 to SSPL/RSALv2 in March 2024, triggering one of the fastest community
fork responses in OSS history. Valkey (Linux Foundation, BSD-3-Clause) launched within 12 days.
By August 2024, Aiven had migrated 15,000 Redis servers. By June 2024, AWS ElastiCache offered
Valkey managed service.

**Why it succeeded:** Three conditions enabled rapid adoption — (1) full Redis 7.2 protocol
compatibility (no code changes in clients), (2) multi-vendor governance (50+ companies, 150+
contributors under Linux Foundation), (3) immediate cloud provider managed service support. Valkey
also proved 16–37% faster than Redis 8.0 in independent benchmarks (Momento), eliminating the
"fork penalty" objection.

**CuraOS lesson:** The Apache 2.0 license on Spring Boot's core is the primary protection against
a similar scenario. Apache 2.0 permits forking without restriction. A Spring community fork is
viable — the Spring project's history (it began as a reaction to J2EE complexity) demonstrates
community-governed alternatives can succeed. Assess Broadcom's Spring stewardship annually against
three Valkey criteria: governance transparency, contributor diversity, and cloud provider support.

#### Elastic → OpenSearch (2021): The Fork That Required Infrastructure Investment

Amazon forked Elasticsearch 7.10 (last Apache 2.0 version) into OpenSearch in 2021. OpenSearch is
now governed by the OpenSearch Software Foundation (Linux Foundation project). Unlike Valkey
(drop-in replacement), OpenSearch required index format migration tooling and API divergence
management over time. As of 2025, OpenSearch and Elasticsearch have diverged enough that some
plugins are incompatible.

**CuraOS lesson:** Forks are not free — they diverge. The Elasticsearch → OpenSearch fork required
sustained investment from Amazon. For CuraOS: if Spring were to be forked, the cost would be
proportional to how many Spring modules we use (we use many). This reinforces the strategy of
wrapping Spring behind interfaces where substitution risk is highest, and maintaining Quarkus
as the identified fallback framework (Option B in this ADR).

#### HashiCorp Vault → OpenBao (2023): The Swift Governance Transfer

HashiCorp's BSL 1.1 relicense in August 2023 triggered the OpenBao fork (Linux Foundation,
Mozilla Public License 2.0). CuraOS already chose OpenBao over Vault in ADR-0108, demonstrating
proactive license risk management.

**CuraOS lesson:** The decision to use OpenBao (Apache 2.0 / MPL 2.0) over HashiCorp Vault (BSL
1.1) was made before any compliance crisis. This is the correct pattern: evaluate license governance
at adoption time, not after a forced migration. Apply the same analysis to every new dependency.

#### Projects That Forked and Regretted It: Common Patterns

Engineering postmortems consistently show that "soft forks" (maintaining a private patch on top of
an upstream) decay at a predictable rate:
- Month 1–6: Fork is close to upstream; patches apply cleanly
- Month 6–18: Upstream makes breaking changes; rebasing becomes painful
- Month 18+: Divergence compounds; the fork is effectively a separate project with all of
  upstream's technical debt and none of upstream's contributor support

**Cited example:** Multiple teams have documented forking Log4j 1.x after its EOL rather than
migrating to Logback/Log4j2. Within 18 months, Log4Shell-class vulnerabilities in their forks were
unpatched because the "fork team" had dissolved. CuraOS explicitly prohibits this pattern (§10):
no long-lived forks; collapse at next upstream release or re-evaluate the dependency.

**Mitigation:** The "wrap behind interface" strategy in §10 means CuraOS can swap a dependency
(e.g., replace Spring Cloud Config with a direct Vault client) without forking. Substitution at the
adapter layer, not the source level.

---

## References

### General Benchmarks
1. [TechEmpower Framework Benchmarks Round 22 (Nov 2023)](https://www.techempower.com/blog/2023/11/15/framework-benchmarks-round-22/) — Official Round 22 announcement; Rust dominated top positions.
2. [TechEmpower Framework Benchmarks Round 23 (Mar 2025)](https://www.techempower.com/blog/2025/03/17/framework-benchmarks-round-23/) — New hardware (Xeon Gold 6330), 3-4x throughput improvements.
3. [GoFrame TechEmpower R23 Analysis](https://goframe.org/en/articles/techempower-web-benchmarks-r23) — Go framework performance: Fiber 735k req/s JSON, Gin 702k, GoFrame 658k.
4. [Popular backend framework benchmarks 2025](https://dev.to/tuananhpham/popular-backend-frameworks-performance-benchmark-1bkh) — Multi-framework ranking summary.
5. [Rust vs Go 2026 latency comparison](https://tech-insider.org/rust-vs-go-2026/) — 40% latency gap analysis.

### Option A: Kotlin + Spring Boot
6. [Spring Boot 3.2 + Java 21 Virtual Threads (InfoQ)](https://www.infoq.com/articles/spring-boot-3-2-spring-6-1/) — Production-ready virtual thread support in Spring Boot 3.2.
7. [Spring Security Advisories](https://spring.io/security/) — CVE-2025-41248, CVE-2025-41249 auth bypass patches; 48-72h response.
8. [Spring Boot GraalVM Native Images docs](https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html) — Official Spring Boot AOT / native-image documentation.
9. [Spring Boot with GraalVM (BellSoft)](https://bell-sw.com/blog/spring-boot-with-graalvm-native-image-performance-compatibility-migration/) — Benchmark: 8s → 150ms startup; 512MB → 64MB idle memory.
10. [Schema-based multi-tenancy Spring Boot + Hibernate](https://medium.com/@oguz.topal/schema-based-multi-tenancy-with-spring-boot-hibernate-d9fb707f3603) — Production multi-tenant pattern with `SET search_path`.
11. [Ktor vs Spring Boot comparison](https://www.boundev.com/blog/kotlin-server-side-development-spring-boot-ktor) — Performance, DX, and ecosystem comparison.
12. [Spring Boot virtual threads performance (Java Code Geeks 2025)](https://www.javacodegeeks.com/2025/04/spring-boot-performance-with-java-virtual-threads.html) — Virtual thread scaling in Spring Boot 3.2+.
13. [Project Loom production blog (Feb 2026)](https://medium.com/@lakshitagangola123/project-loom-in-production-scaling-spring-boot-with-virtual-threads-without-breaking-d1505160676c) — Real-world virtual thread adoption considerations.
14. [Spring Boot multi-tenancy with HikariCP](https://medium.com/@myggona/spring-boot-multi-tenant-with-hikaricp-c1c5072cbe0e) — Connection pool multi-tenant configuration.

### Option B: Kotlin + Quarkus
15. [Why Choose Quarkus in 2025](https://medium.com/@issam1991/why-choose-quarkus-in-2025-5aae6637eeeb) — Production adoption and native image advantages.
16. [Quarkus Native vs JVM performance comparison](https://medium.com/@issam1991/quarkus-native-vs-jvm-real-world-performance-comparison-e766f59706f6) — 20.72MiB native backend, 58% better than Spring Boot native.
17. [Spring Boot vs Quarkus vs Micronaut 2026 Showdown (JCG)](https://www.javacodegeeks.com/2025/12/spring-boot-vs-quarkus-vs-micronaut-the-ultimate-2026-showdown.html) — Framework battle with memory/startup numbers.
18. [Quarkus multi-tenant architecture + Hibernate ORM](https://coffeebeans-brewinginnovations.medium.com/schema-based-multi-tenant-architecture-using-quarkus-hibernate-orm-cffd6e672db0) — Schema-per-tenant production pattern.
19. [Quarkus Hibernate ORM multitenancy issue #5681](https://github.com/quarkusio/quarkus/issues/5681) — Known limitation: DDL generation disabled with multitenancy.
20. [Quarkus vs Spring Boot (JCG Jul 2025)](https://www.javacodegeeks.com/2025/07/quarkus-vs-spring-boot-choosing-the-right-java-framework-for-cloud-native-apps.html) — Cloud-native comparison.

### Option C: Kotlin + Ktor
21. [Ktor vs Spring Boot 5 key differences (Digma)](https://digma.ai/ktor-vs-spring-boot-5-key-differences-for-kotlin-devs/) — DX and performance comparison for Kotlin teams.
22. [Why Ktor is Outshining Spring Boot in 2025](https://medium.com/@ntiinsd/why-ktor-is-outshining-spring-boot-in-2025-and-why-frontend-node-js-developers-are-making-the-switch-0fe55c7916b3) — Ktor cold-start advantage.
23. [Java and Kotlin microservices: Spring Boot meets Ktor (JCG 2025)](https://www.javacodegeeks.com/2025/08/java-and-kotlin-in-microservices-spring-boot-meets-ktor.html) — Comparison in microservices context.

### Option D: Go
24. [100 Microservices in Go — lessons learned](https://medium.com/@optimzationking2/i-wrote-100-microservices-in-go-heres-what-i-d-never-do-again-5af0a7d79ff2) — Production postmortem at similar scale to CuraOS.
25. [Atlas: Scalable multi-tenant apps in Go (GopherCon 2025)](https://atlasgo.io/blog/2025/05/26/gophercon-scalable-multi-tenant-apps-in-go) — Schema-per-tenant + `ent` ORM + Chi middleware — production pattern.
26. [Go Microservices 2025 patterns](https://dev.to/aleksei_aleinikov/go-microservices-2025-one-pattern-to-scale-them-all-1448) — Patterns at scale.
27. [Biggest Golang challenges: error handling (InfoWorld)](https://www.infoworld.com/article/2338486/biggest-golang-challenges-are-error-handling-and-learning-go-developers-say.html) — Developer survey on pain points.
28. [Go OpenTelemetry integration guide](https://reintech.io/blog/go-opentelemetry-integration-unified-observability-guide) — OTEL SDK maturity for Go.
29. [Golang developer job market 2025](https://www.signifytechnology.com/news/golang-developer-job-market-analysis-what-the-rest-of-2025-looks-like/) — Salary data, talent pool analysis.
30. [Go microservices architecture 2026](https://reintech.io/blog/go-microservices-architecture-patterns-best-practices-2026) — Best practices at scale.

### Option E: Rust + Axum
31. [Axum: From Hello World to Production (Shuttle)](https://www.shuttle.dev/blog/2023/12/06/using-axum-rust) — Axum production guide; 17-18k req/s single-threaded benchmark.
32. [Rust vs Go at JetBrains (Jun 2025)](https://blog.jetbrains.com/rust/2025/06/12/rust-vs-go/) — Comprehensive language comparison.
33. [Hidden costs of Rust microservices (Shuttle)](https://www.shuttle.dev/blog/2025/06/18/rust-microservices-deployment-costs) — Operational complexity at scale.
34. [Rust Compiler Performance Survey 2025 (Official Rust Blog)](https://blog.rust-lang.org/2025/09/10/rust-compiler-performance-survey-2025-results/) — 25% CI blocker rate; 45% adoption drop-off due to compile times.
35. [Building microservices in Rust (OneUptime)](https://oneuptime.com/blog/post/2026-02-01-rust-microservices-architecture/view) — 2026 Rust microservices architecture.
36. [Rust microservices deployment (Calmops)](https://calmops.com/programming/rust/building-microservices-in-rust/) — Production deployment guide.

### Option F: TypeScript + NestJS
37. [Building HIPAA-compliant healthcare with NestJS (PSI Nest case study)](https://dev.to/waseemahmad/building-hipaa-compliant-healthcare-software-lessons-from-psi-nest-2eco) — 12-week launch, passed HIPAA security assessment.
38. [NestJS microservices with Kafka + TypeScript (LogRocket)](https://blog.logrocket.com/microservices-nestjs-kafka-typescript/) — Kafka transport pattern.
39. [Bun vs Node.js 2026 benchmarks + migration guide](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide) — Bun 3x throughput, memory reduction.
40. [Bun 2.0 vs Node.js 22 (Markaicode)](https://markaicode.com/vs/bun-20-vs-nodejs-22/) — 78.5k req/s Bun vs 51.2k Node.js 22.
41. [Node vs Bun vs Deno real migration (Medium)](https://medium.com/@sohail_saifii/bun-vs-deno-vs-node-i-migrated-our-api-three-times-heres-the-real-performance-data-a4499bb07b8d) — Real-world migration data.
42. [Why we chose NestJS for medical telemetry (Gegosoft)](https://gegosoft.com/nestjs-api-development/) — Healthcare API case study.

### Option G: Elixir + Phoenix
43. [Setting up multi-tenant Phoenix app (AppSignal)](https://blog.appsignal.com/2023/11/21/setting-up-a-multi-tenant-phoenix-app-for-elixir.html) — Triplex schema-per-tenant pattern.
44. [HCA Healthcare Elixir HL7 library](https://github.com/HCA-Healthcare/elixir-hl7) — Production HL7 clinical data parsing in Elixir.
45. [Erlang Solutions digital healthcare solutions](https://www.erlang-solutions.com/industries/healthcare/) — Pando Healthcare, Hillrom/Baxter HIPAA Elixir deploys.
46. [Elixir OTP supervisors (CloudDevs)](https://clouddevs.com/elixir/otp-supervisors/) — Fault tolerance architecture.
47. [Implementing multi-tenancy Phoenix 1.8 (Elixir Forum)](https://elixirforum.com/t/implementing-multi-tenancy-in-phoenix-1-8-single-vs-multi-organization-approaches/70301) — Community guidance on multi-tenancy approaches.

### Option H: Micronaut + Helidon
48. [Spring Boot vs Micronaut vs Quarkus 2025 JVM Battle](https://medium.com/@reyanshicodes/spring-boot-vs-micronaut-vs-quarkus-the-2025-jvm-framework-battle-ae6365d810f4) — Startup/memory comparison; Micronaut 0.65s JVM.
49. [Helidon 4 vs Quarkus 3 vs Micronaut 4 virtual threads (JCG Mar 2026)](https://www.javacodegeeks.com/2026/03/helidon-4-vs-quarkus-3-vs-micronaut-4-which-framework-actually-winswith-virtual-threads.html) — Helidon Níma 20-60ms native startup.
50. [Beyond Spring Boot: lightweight Java frameworks 2025](https://medium.com/@noahblogwriter2025/beyond-spring-boot-exploring-lightweight-java-frameworks-for-microservices-in-2025-73aedbb0c56a) — Comparison overview.
51. [Top Java REST API frameworks 2025 (Zuplo)](https://zuplo.com/learning-center/top-java-rest-api-frameworks) — Market overview.

### Developer Surveys + Hiring
52. [Stack Overflow Developer Survey 2025 — Technology](https://survey.stackoverflow.co/2025/technology/) — Language usage, admiration rates. Rust #1 admired (72%), Go 14% usage.
53. [JetBrains Developer Survey 2024 — Kotlin adoption](https://www.jetbrains.com/lp/devecosystem-2024/) — Kotlin server-side 30% YoY growth.
54. [Golang developer salaries 2025 (Signify Technology)](https://www.signifytechnology.com/news/golang-developer-job-market-analysis-what-the-rest-of-2025-looks-like/) — $120k-$180k range, thin talent pool.
55. [HIPAA-compliant logging Java 21 (Markaicode)](https://markaicode.com/hipaa-compliant-logging-java-21-healthcare-apps/) — PHI logging best practices for JVM.

---

## Appendix A: Quick Eval Script

Spin up a minimal "Hello World" + Postgres DB + Kafka consumer in the top 3 options for
hands-on comparison. Run these on a developer workstation (Docker required).

### A.1 Spring Boot (Option A) — baseline

```bash
#!/usr/bin/env bash
# Requires: Docker, Java 21 (Temurin), Gradle

# Spin up Postgres + Kafka
docker compose -f - up -d <<'EOF'
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: demo, POSTGRES_USER: demo, POSTGRES_PASSWORD: demo }
    ports: ["5432:5432"]
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_NODE_ID: 1
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports: ["9092:9092"]
EOF

# Scaffold Spring Boot service
curl -s https://start.spring.io/starter.tgz \
  -d type=gradle-project-kotlin \
  -d language=kotlin \
  -d bootVersion=3.4.5 \
  -d dependencies=web,data-jpa,postgresql,kafka,actuator,micrometer-tracing-bridge-otel \
  -d groupId=io.curaos.demo \
  -d artifactId=demo-service \
  | tar -xzf - -C /tmp/spring-demo

cd /tmp/spring-demo
./gradlew bootRun &
SPRING_PID=$!

# Measure startup
sleep 8
echo "Memory (RSS):"
ps -o rss= -p $SPRING_PID | awk '{printf "%.1f MB\n", $1/1024}'

# Load test
which hey >/dev/null 2>&1 && hey -n 10000 -c 50 http://localhost:8080/actuator/health || \
  curl -s http://localhost:8080/actuator/health
```

### A.2 Quarkus (Option B) — native-first alternative

```bash
#!/usr/bin/env bash
# Requires: Docker, Java 21, Maven (or Quarkus CLI)

# Install Quarkus CLI if needed
# sdk install quarkus

# Scaffold Quarkus + Kotlin service
quarkus create app io.curaos.demo:demo-quarkus \
  --extension='kotlin,resteasy-reactive-jackson,hibernate-orm-panache-kotlin,jdbc-postgresql,messaging-kafka,smallrye-opentelemetry,micrometer-registry-prometheus' \
  --no-code \
  -o /tmp/quarkus-demo

cd /tmp/quarkus-demo

# JVM mode startup
./mvnw quarkus:dev &
sleep 5
echo "Quarkus JVM Memory (RSS):"
ps -o rss= -p $(pgrep -f quarkus) | awk '{printf "%.1f MB\n", $1/1024}'

# Native image build (requires GraalVM installed or container build)
# ./mvnw package -Pnative -Dquarkus.native.container-build=true
# ./mvnw package -Pnative -Dquarkus.native.container-build=true && \
#   docker build -f src/main/docker/Dockerfile.native-micro -t curaos/demo-quarkus:native .
```

### A.3 Go (Option D) — memory-efficient baseline

```bash
#!/usr/bin/env bash
# Requires: Go 1.23+, Docker

mkdir -p /tmp/go-demo && cd /tmp/go-demo
go mod init io.curaos.demo/go-demo

cat > main.go <<'GOEOF'
package main

import (
    "database/sql"
    "encoding/json"
    "fmt"
    "log/slog"
    "net/http"
    "os"

    _ "github.com/lib/pq"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    slog.SetDefault(logger)

    db, err := sql.Open("postgres", "host=localhost user=demo password=demo dbname=demo sslmode=disable")
    if err != nil { panic(err) }
    defer db.Close()

    mux := http.NewServeMux()
    mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "UP"})
    })

    slog.Info("Starting demo service", "port", 8081)
    http.ListenAndServe(":8081", otelhttp.NewHandler(mux, "demo-service"))
}
GOEOF

go get github.com/lib/pq \
  go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp \
  go.opentelemetry.io/otel \
  go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc \
  go.opentelemetry.io/otel/sdk/trace

go build -o /tmp/go-demo/demo-service .

# Run and measure
/tmp/go-demo/demo-service &
GO_PID=$!
sleep 1
echo "Go service Memory (RSS):"
ps -o rss= -p $GO_PID | awk '{printf "%.1f MB\n", $1/1024}'

# Container size
cat > Dockerfile <<'DEOF'
FROM golang:1.23-alpine AS build
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o /app/service .

FROM scratch
COPY --from=build /app/service /service
EXPOSE 8081
ENTRYPOINT ["/service"]
DEOF

docker build -t curaos/go-demo:latest .
docker image ls curaos/go-demo:latest --format "Container size: {{.Size}}"
```

### A.4 Comparison Notes

After running the eval scripts, capture these numbers for each option:

| Metric | Spring Boot (JIT) | Spring Boot (native) | Quarkus (JIT) | Quarkus (native) | Go |
|---|---|---|---|---|---|
| Startup time (s) | | | | | |
| Idle RSS (MB) | | | | | |
| P99 latency (ms, 50 concurrent) | | | | | |
| Container size (MB) | | | | | |
| Build time (s) | | | | | |

Fill in from actual runs on the reference hardware spec matching on-prem customer minimum.

---

### Reusable Upstream OSS — Additional Sources

56. [JHipster 8.0 Release (InfoQ)](https://www.infoq.com/news/2023/12/jhipster-version8-release/) — JHipster 8 upgrades: Spring Boot 3, Hibernate 6.2, Vue 3, Angular 16; Consul default service discovery.
57. [jhipster/jhipster-kotlin (GitHub)](https://github.com/jhipster/jhipster-kotlin) — Kotlin JHipster blueprint; active under JHipster umbrella; Apache 2.0.
58. [callistaenterprise/blog-multitenancy (GitHub)](https://github.com/callistaenterprise/blog-multitenancy) — Canonical Spring Boot + Hibernate + Liquibase schema-per-tenant reference implementation.
59. [Spring Modulith 2.0 GA release](https://spring.io/blog/2025/11/21/spring-modulith-2-0-ga-1-4-5-and-1-3-11-released/) — GA release November 2025; EventPublication registry, staleness monitor, C4 model generation.
60. [Spring Modulith 1.4 — Free Outbox (Garstecki)](https://garstecki.dev/articles/getting-free-outbox-with-spring-modulith/) — Technical walkthrough: `event_publication` table schema, configuration, outbox mechanics.
61. [Modular Monolith 2026 Guide — Spring Modulith + ArchUnit (DEV.to)](https://dev.to/x4nent/the-modular-monolith-2026-complete-guide-spring-modulith-archunit-fitness-functions-and-lessons-878) — Spring Modulith 1.4 GA, ArchUnit 1.3, Shopify case study: 58% infra savings, 42% latency reduction from modular consolidation.
62. [JetBrains–Spring Strategic Partnership (May 2025)](https://blog.jetbrains.com/kotlin/2025/05/strategic-partnership-with-spring/) — Formalized collaboration; null safety, kotlinx.reflect, BeanRegistrarDsl commitments.
63. [Next-Level Kotlin Support in Spring Boot 4 (Spring Blog, Dec 2025)](https://spring.io/blog/2025/12/18/next-level-kotlin-support-in-spring-boot-4/) — Kotlin 2.2 baseline, JSpecify null safety, kotlinx.serialization coexistence, BeanRegistrarDsl, coroutine context propagation.
64. [Spring Boot 4 Kotlin baseline (JetBrains IntelliJ Blog, Nov 2025)](https://blog.jetbrains.com/idea/2025/11/spring-boot-4/) — Virtual threads as default on Java 21+; Kotlin 2.2 minimum; auto-configured HTTP clients with virtual threading.
65. [Helping Decision-Makers Say Yes to Kotlin (JetBrains, Nov 2025)](https://blog.jetbrains.com/kotlin/2025/11/helping-decision-makers-say-yes-to-kotlin/) — Revolut, Grab, Atlassian, Expedia named as production Kotlin + Spring Boot shops.
66. [Netflix OSS and Spring Boot — Coming Full Circle (Netflix TechBlog)](https://netflixtechblog.com/netflix-oss-and-spring-boot-coming-full-circle-4855947713a0) — Netflix's Spring Boot adoption history; DGS Framework (Kotlin, Apache 2.0).
67. [jOOQ Licensing (official)](https://www.jooq.org/legal/licensing) — Apache 2.0 for PostgreSQL, MySQL, MariaDB, H2, SQLite; commercial license for Oracle/SQL Server/DB2.
68. [ORM Battle 2025: Hibernate vs jOOQ vs JDBC (Javarevisited)](https://medium.com/javarevisited/the-great-orm-debate-hibernate-vs-jooq-vs-plain-jdbc-e271b95a2ef5) — Performance comparison; hybrid write (Hibernate) + read (jOOQ) approach endorsed.
69. [Resilience4j Getting Started](https://resilience4j.readme.io/docs/getting-started-3) — Circuit breaker, retry, bulkhead, rate limiter; Spring Boot 3 auto-configuration.
70. [MapStruct with Kotlin and Spring Boot (Medium)](https://medium.com/hprog99/mapstruct-with-kotlin-and-spring-boot-a-comprehensive-guide-1b2eb0d1e2a0) — KAPT-based compile-time mapping; KSP support not yet production-ready (2024).
71. [Kotest Spring extension (kotest.io)](https://kotest.io/docs/extensions/spring.html) — `SpringExtension` wires Spring context into Kotest specs; compatible with `@SpringBootTest`.
72. [Detekt in Spring Boot + Kotlin + Gradle (DEV.to)](https://dev.to/mikhailepatko/how-to-implement-detekt-in-spring-boot-kotlin-gradle-project-1i78) — Detekt integration guide; custom rule extension pattern.
73. [Arrow-kt (arrow-kt/arrow GitHub)](https://github.com/arrow-kt/arrow) — Functional Kotlin companion; Apache 2.0; 6.5k+ stars; `Either`, `Resource`, `Schedule` most relevant for CuraOS.
74. [ShedLock Spring Boot 3 (Medium)](https://medium.com/@puspas99/spring-boot-3-shedlock-a-guide-to-distributed-task-scheduling-1dc24a6c09d5) — ShedLock 7.x integration; JDBC provider for Postgres-backed locks.
75. [KotlinPoet + KSP interop (square.github.io)](https://square.github.io/kotlinpoet/interop-ksp/) — Official interop API for KSP → KotlinPoet type conversion.
76. [OpenAPI Generator kotlin-spring docs](https://openapi-generator.tech/docs/generators/kotlin-spring/) — Spring Boot 3.3+ support; Spring Boot 4 tracked in issue #22411.
77. [Redis Valkey Fork Migration (SoftwareSeni)](https://www.softwareseni.com/the-redis-valkey-fork-how-enterprises-rapidly-migrated-after-the-sspl-license-change/) — Aiven 15,000-server migration in 3 months; three success criteria for fork viability: protocol compatibility, multi-vendor governance, cloud provider backing.
78. [OSS License Change Pattern 2018–2026 (SoftwareSeni)](https://www.softwareseni.com/the-open-source-license-change-pattern-mongodb-to-redis-timeline-2018-to-2026-and-what-comes-next/) — MongoDB SSPL (2018) → Elastic (2021) → HashiCorp BSL (2023) → Redis SSPL (2024) pattern analysis.
79. [Turning License Changes into Opportunity (Eyal Estrin)](https://community.ops.io/eyalestrin/turning-license-changes-into-opportunity-26e) — Governance audit framework; OpenSearch, OpenTofu, Valkey compared.
80. [Spring Modulith Outbox with Apache Kafka (Axual)](https://axual.com/blog/implementing-outbox-pattern-with-apache-kafka-and-spring-modulith) — `@Externalized` event annotation wiring Spring Modulith outbox to Kafka topic.

---

*ADR-0100 — Backend Services Runtime — CuraOS Platform — 2026-05-24*
*Status: Proposed. Requires user approval before implementation convention changes.*
