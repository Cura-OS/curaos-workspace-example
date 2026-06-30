# curaos §1 - Mandatory Baseline (apply on every turn)

These rules are non-negotiable. Violating any of them breaks platform coherence.
## 1.1 Stack
- **Runtime:** NestJS (TypeScript 5.x), Fastify adapter, Bun or Node 22 LTS.
- **No JVM code in foundation or neutral services.** JVM is reserved for HealthStack JVM sidecars (HAPI FHIR, Snowstorm, dcm4chee) only, and those run as separate containers.
- **No hot-reload of core.** Extension = WASM plugin / NestJS microservice sidecar / event interceptor.
- **No Keycloak in v1.** Auth is NestJS-pure (ADR-0120). Keycloak deferred to v2/v3 optional plugin.
- **No BPMN as primary.** Workflow = Temporal + Activepieces + `@nestjs/schedule` (ADR-0122).

## 1.2 Mandatory NestJS dependencies (every service)
Every NestJS service MUST import and register:

| Package | Purpose | ADR |
|---|---|---|
| `@curaos/tenancy` | Tenant routing (`TenantModule`) | ADR-0155 |
| `@curaos/audit-sdk` | `AuditInterceptor` → hash-chain Kafka publish | ADR-0200 |
| `@curaos/event-interceptors` | Event bus interceptor framework | ADR-0123 |
| `@curaos/providers` | Provider abstraction base types | ADR-0154 |

Exception: decorate with `@SkipTenancy()` only when explicitly justified (e.g., public health checks).

## 1.3 Authorization (every service)
Three-layer AuthZ - never implement custom auth logic:
1. **OPA-WASM** - global org-wide policies (in-process, `@curaos/opa-wasm`)
2. **Cerbos PDP sidecar** - service-level ABAC (resource permissions per role + attribute)
3. **OpenFGA sidecar** - ReBAC for PHI consent relationships (HealthStack services only)

## 1.4 Tenant isolation
- DB isolation: per-tenant schema `tenant_<uuid>` for standard services; Citus shared-schema sharded by `tenant_id` for high-volume neutral services at 10K+ scale (per [[curaos-postgres-rule]]); `public` for cross-tenant registry tables.
- Kafka: partition key = tenant UUID.
- OpenSearch: index prefix = tenant UUID.
- No service reads another service's DB schema directly - read via event or typed client.

## 1.5 Event topology
- Topic naming: `curaos.<service-name>.<entity>.<event>` (e.g., `curaos.identity.user.created`).
- Every domain event uses the **outbox pattern** - write to `outbox` table, relay to Kafka.
- AsyncAPI 3 schema registered in Apicurio for every event type.
- Dead-letter queue on every consumer with alerting.

## 1.6 Codegen first
Before writing a new service by hand, check whether the Codegen Engine has a recipe for it:
- `GET /codegen/recipes` lists recipes; `POST /codegen/generate` scaffolds from recipe + spec.
- `.gen.ts` convention - engine never touches non-`.gen.ts` files; custom logic goes in sibling files.

## 1.7 Provider abstraction
Every integratable area must expose both a local and 3rd-party provider (ADR-0150 §2, ADR-0154):
- Implement `<Domain>Provider` interface from `@curaos/providers`.
- Register `<Domain>LocalProvider` (default) + `<Domain>ExternalProvider` in `ProviderModule`; config selects the provider at runtime, no hardcoded external calls without a provider interface.
