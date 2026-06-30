# ADR-0155 — Tenant Routing: `@curaos/tenancy` NestJS Module

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** [ADR-0151 F-001 Critical — Tenant routing ambiguity](0151-cross-cluster-coherence.md)
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0104 Identity / Auth (superseded, audit chain spec retained)](0104-identity-auth.md)
**Amends:**
- ADR-0099 §11 — adds tenancy module reference
- ADR-0120 §4 — documents JWT claim shape
- ADR-0121, ADR-0122, ADR-0123 — declares `@curaos/tenancy` as mandatory dep
- ADR-0200–ADR-0209 — cluster services adopt via Codegen recipe

---

## 1. Status

Accepted. Mandatory for all NestJS services. No service ships without registering
`TenantModule` unless explicitly decorated with `@SkipTenancy()`.

---

## 2. Context

ADR-0151 F-001 (Critical) identified that foundation products (Auth, Builder, Workflow,
Codegen) and all cluster services each implement tenant routing independently, producing:

- Divergent JWT claim extraction strategies (some read `sub`, some read `X-CURA-TENANT`,
  some check neither).
- No shared Prisma-client-per-tenant pool, leading to connection-limit exhaustion under
  moderate SaaS load.
- Kafka consumer groups and Valkey keys without tenant namespacing, risking cross-tenant
  event delivery and cache bleed.
- OpenTelemetry spans missing `tenant_id` tag, breaking per-tenant SLA dashboards.

The user decision is: **Hybrid — shared `@curaos/tenancy` NestJS module as mandatory
BASE for all services + per-service customization hooks for special cases** (e.g.,
audit-service serving cross-tenant admin queries, billing-service aggregating across
tenants).

This ADR specifies that module in full: API contract, ESLint enforcement, customization
hooks, cross-tenant operation patterns, and migration path.

---

## 3. Decision

### 3.1 Core decision

Ship `@curaos/tenancy` as a published NestJS shared library in the `curaos/backend/libs/`
monorepo under the `@curaos/*` Verdaccio scope (per ADR-0209 §2.2). Every NestJS service
**must** register `TenantModule` in its root `AppModule`. No exceptions without
`@SkipTenancy()`.

### 3.2 Tenant identity source-of-truth

Tenant ID is resolved from (in priority order):

1. JWT claim `tenant_id` (string, UUID format) — present in every token issued by
   CuraOS Auth (ADR-0120). Authoritative.
2. HTTP header `X-CURA-TENANT` (string, UUID format) — allowed only for
   service-to-service calls on internal network with mTLS. Must be validated against
   allowed-tenant list for the calling service identity.
3. Rejected — any other source (query param, path segment, cookie) is not a valid
   tenant source in `TenantInterceptor`. Services may add supplementary resolution
   only via `TenantContextProvider` hook (§5.3).

### 3.3 Isolation scope

Tenant context flows through all five isolation planes per request lifecycle:

| Plane | Mechanism |
|---|---|
| **Database** | Per-tenant Prisma client from LRU pool; `SET search_path = tenant_<id>` on acquire |
| **Cache** | Valkey key prefix `t:{tenant_id}:*` enforced by `TenantCacheService` wrapper |
| **Events** | Kafka consumer group ID `cg-{service}-{tenant_id}`; producer key prefix `t:{tenant_id}` |
| **Tracing** | OpenTelemetry span attribute `tenant.id` set on every span in request scope |
| **Logging** | Pino log context field `tenantId` injected via AsyncLocalStorage |

---

## 4. `@curaos/tenancy` Module API

### 4.1 Module registration

```typescript
// app.module.ts (every NestJS service)
import { TenantModule } from '@curaos/tenancy';

@Module({
  imports: [
    TenantModule.forRoot({
      // Required: how to validate tenant_id exists and is active
      tenantValidator: TenantValidatorService, // implements TenantValidator interface
      // Optional overrides (all have safe defaults)
      dbPoolSize: 20,               // LRU pool max; default 20
      dbPoolTtlMs: 300_000,         // evict idle connections after 5 min; default 300 000
      headerFallback: false,        // allow X-CURA-TENANT header fallback; default false
      headerFallbackNetworks: [],   // CIDR ranges allowed to use header fallback
    }),
  ],
})
export class AppModule {}
```

`TenantModule.forRoot()` registers all providers as REQUEST-scoped. It is idempotent —
calling twice in a module graph is a no-op (first registration wins).

### 4.2 `TenantInterceptor`

Registered globally by `TenantModule`. Executes before route handler.

**Extraction flow:**

```
Incoming request
  │
  ├─ Has Authorization: Bearer <token>?
  │     └─ Decode JWT (jose, no remote call — JWKS cached per ADR-0120)
  │           └─ Read claims.tenant_id (UUID)
  │                 └─ Validate: tenant exists + active (TenantValidator)
  │                       └─ Set TenantContext in AsyncLocalStorage → continue
  │
  ├─ Has X-CURA-TENANT header + headerFallback=true + caller IP in headerFallbackNetworks?
  │     └─ Read header value (UUID)
  │           └─ Validate: tenant exists + active (TenantValidator)
  │                 └─ Set TenantContext → continue
  │
  └─ Neither → throw TenantResolutionException (HTTP 401 for external; 400 for internal)
```

**TenantContext shape:**

```typescript
export interface TenantContext {
  tenantId: string;           // UUID
  tenantSlug: string;         // human-readable slug, e.g. "acme-hospital"
  resolvedFrom: 'jwt' | 'header';
  jwtSub?: string;            // user subject (present when resolved from JWT)
  roles?: string[];           // RBAC roles from token (convenience, not authoritative)
}
```

Context available via injection token `TENANT_CONTEXT`:

```typescript
constructor(
  @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
) {}
```

Or via helper service:

```typescript
constructor(private readonly tenancy: TenancyService) {}

doSomething() {
  const tenantId = this.tenancy.currentTenantId(); // throws if not in tenant scope
}
```

### 4.3 Per-tenant DB connection factory

```typescript
// Injected via TenantModule; REQUEST-scoped
@Injectable()
export class TenantDbFactory {
  /** Returns a Drizzle db handle whose connection is bound to tenant_<tenantId> PG schema. */
  async db(): Promise<TenantDb>;
}
```

Implementation details:

- **LRU pool**: keyed by `tenantId`. Pool size configurable (`dbPoolSize`; default 20).
  Oldest idle connection evicted on overflow.
- **Schema binding**: on client acquire, executes `SET search_path = tenant_<tenantId>,
  public` within the connection's session.
- **Lifecycle**: clients are acquired at the start of the request interceptor chain and
  released (returned to pool or closed if pool full) in the `NestInterceptor.intercept`
  observable's `finalize()` operator. They are never shared across requests.
- **Health**: `TenantDbFactory.healthCheck()` returns pool utilization per tenant;
  exposed via the service's `/health` endpoint (per ADR-0100 health-check contract).

### 4.4 Per-tenant Valkey namespace

`TenantCacheService` wraps `@nestjs/cache-manager` (Valkey adapter). All key operations
automatically prefix with `t:{tenantId}:`.

```typescript
@Injectable()
export class TenantCacheService {
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  async del(key: string): Promise<void>;
  async delPattern(pattern: string): Promise<number>; // SCAN + DEL; pattern scoped to tenant
}
```

Direct `CacheManager` use without `TenantCacheService` is flagged by the ESLint rule
`@curaos/eslint-config/tenancy/no-raw-cache-manager` (§6.2).

### 4.5 Per-tenant Kafka consumer group

`TenantKafkaClientFactory` constructs `ClientKafka` instances (NestJS microservice client)
with consumer group ID `cg-{serviceName}-{tenantId}`.

```typescript
@Injectable()
export class TenantKafkaClientFactory {
  /** Returns a Kafka client scoped to the current tenant's consumer group. */
  forCurrentTenant(): ClientKafka;
  /** Returns a Kafka client for a specific tenant (cross-tenant admin use only). */
  forTenant(tenantId: string): ClientKafka;
}
```

Producer messages emitted via `TenantKafkaClientFactory` have the key set to
`t:{tenantId}:{originalKey}` unless the caller explicitly sets `skipTenantPrefix: true`
(cross-tenant admin pattern only — requires `CrossTenantAdminGuard`, §7.1).

### 4.6 Per-tenant OpenTelemetry tags

`TenantOtelMiddleware` (applied by `TenantModule`) injects `tenant.id` and
`tenant.slug` as span attributes into the active OpenTelemetry span for every inbound
request. No service-level code required.

Additional attributes services may add via `TenancyService.addSpanAttributes(attrs)`:
- `tenant.plan` (billing tier, if known by the service)
- `tenant.region` (if geo-routing is active)

---

## 5. JWT Claim Shape (ADR-0120 Amendment)

ADR-0120 §4 is amended: CuraOS Auth **must** include the following claims in every
issued access token (JWT):

```jsonc
{
  // Standard OIDC claims
  "sub": "usr_01j...",          // user UUID; format: usr_<ulid>
  "iss": "https://auth.cura.os/t/<tenant_slug>/",
  "aud": ["<service-client-id>"],
  "exp": 1234567890,
  "iat": 1234567890,
  "jti": "tok_01j...",          // token UUID; format: tok_<ulid>

  // CuraOS tenant claim — REQUIRED, validated by TenantInterceptor
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",  // UUID v4
  "tenant_slug": "acme-hospital",                        // URL-safe slug

  // CuraOS role claim — forwarded to TenantContext.roles (not authoritative; Cerbos re-checks)
  "roles": ["clinician", "department-lead"],

  // SMART-on-FHIR scopes (HealthStack only; omitted for non-clinical tenants)
  "scope": "patient/*.read user/Observation.write launch/patient",
  "patient": "Patient/42"       // launch context (SMART App Launch 2.0)
}
```

**Claim validation rules** in `TenantInterceptor`:
- `tenant_id` must be a valid UUID v4.
- `tenant_id` extracted from `iss` (issuer URL) must match `tenant_id` claim.
  Mismatch → reject (prevents token reuse across tenant realms).
- `exp` standard validation via `jose` (clock skew tolerance: 30 s).
- JWKS fetched from `https://auth.cura.os/t/<tenant_slug>/.well-known/jwks.json`.
  Cached in Valkey at `t:{tenantId}:jwks` with TTL equal to `Cache-Control: max-age`
  from the JWKS endpoint (minimum 60 s, maximum 3600 s). Key rotation triggers
  cache bust via Auth → event bus → `jwks.rotated` event.

---

## 6. Mandatory Adoption + ESLint Enforcement

### 6.1 Mandatory registration rule

Every NestJS service `AppModule` **must** import `TenantModule.forRoot(...)`. Omission is
a CI gate failure (§6.3).

### 6.2 ESLint rules (`@curaos/eslint-config/tenancy/`)

Published in `@curaos/eslint-config` (ADR-0209 §2.2, backend libs). Three rules:

| Rule ID | Severity | What it catches |
|---|---|---|
| `require-tenant-module` | **error** | `AppModule` imports array does not include `TenantModule` |
| `no-raw-db-client` | **error** | Direct DB client instantiation or injection without `TenantDbFactory` |
| `no-raw-cache-manager` | **warn** | Direct `CacheManager` use instead of `TenantCacheService` (warn, not error, for services with legitimate global cache needs) |

Rule `require-tenant-module` has one exception path: the file contains a class decorated
with `@SkipTenancy()` at module level (§5.1 below) — in this case the rule suppresses.

Usage in `eslint.config.mjs` (generated by Codegen recipe `interceptor.nestjs-tenant-router`):

```js
import tenancy from '@curaos/eslint-config/tenancy';

export default [
  ...tenancy.configs.recommended,   // includes all three rules above
];
```

### 6.3 CI gate

The CI pipeline (ADR-0110) runs `eslint --max-warnings 0` as a required check on every
service. A service that lacks `TenantModule` registration fails the `lint` job, which
blocks merge. Gate implemented as a GitHub Actions required status check; cannot be
bypassed without repository admin override + audit log entry.

---

## 7. Per-Service Customization Hooks

### 7.1 `@SkipTenancy()` — cross-tenant admin endpoints

Decorator for controller methods (or entire controllers) that legitimately serve
cross-tenant data. Must be paired with `CrossTenantAdminGuard`.

```typescript
import { SkipTenancy, CrossTenantAdminGuard } from '@curaos/tenancy';

@Controller('admin/audit')
@SkipTenancy()
@UseGuards(CrossTenantAdminGuard)
export class CrossTenantAuditController {
  @Get('events')
  async listEvents(@Query('tenantIds') tenantIds: string[]) {
    // tenantIds must be explicit — no implicit "all tenants"
    // CrossTenantAdminGuard verifies caller has platform:admin role
    // every call is audited (§8.3)
  }
}
```

`@SkipTenancy()` on a method: `TenantInterceptor` skips extraction for that method only.
`@SkipTenancy()` on a controller: applies to all methods.

Services permitted to use `@SkipTenancy()`:
- `audit-service` — platform admins query cross-tenant audit logs
- `billing-service` — aggregates usage across tenants for invoicing
- `ops-service` — platform operations, cluster health
- `platform-admin-service` — tenant lifecycle management (create, suspend, delete)

Any other service using `@SkipTenancy()` is a CI lint error unless added to the
permitted-services allowlist in `@curaos/eslint-config/tenancy/skip-tenancy-allowlist.ts`.
Adding to the allowlist requires an ADR amendment.

### 7.2 `@TenantOverride(strategy)` — special routing

For services with non-standard tenant resolution (e.g., a shared catalog cache that is
intentionally cross-tenant but read-only):

```typescript
import { TenantOverride } from '@curaos/tenancy';

@Controller('catalog')
export class CatalogController {
  @Get('items')
  @TenantOverride('shared-read-only')
  async listItems() {
    // TenantInterceptor still validates JWT but sets TenantContext.resolvedFrom = 'override'
    // TenantDbFactory.db() returns the shared catalog schema connection
    // Write operations in this scope throw TenantOverrideWriteException at runtime
  }
}
```

Built-in strategies:

| Strategy | Behaviour |
|---|---|
| `'shared-read-only'` | Tenant validated from JWT; DB handle uses `shared` schema; writes blocked |
| `'platform-schema'` | No tenant extraction; DB handle uses `platform` (global) schema; requires `CrossTenantAdminGuard` |
| Custom `TenantRoutingStrategy` | Implement `TenantRoutingStrategy` interface; register as provider in module |

### 7.3 `TenantContextProvider` injection token — custom resolution

For services that resolve tenant via a domain-specific mechanism (e.g., a webhook that
carries `organizationId` instead of a JWT):

```typescript
import { TENANT_CONTEXT_PROVIDER, TenantContextProvider } from '@curaos/tenancy';

@Injectable()
export class WebhookTenantProvider implements TenantContextProvider {
  async resolve(request: Request): Promise<TenantContext | null> {
    const orgId = request.headers['x-org-id'];
    if (!orgId) return null; // fall through to standard JWT extraction
    const tenant = await this.orgRepo.findTenantByOrgId(orgId);
    return tenant ? { tenantId: tenant.id, tenantSlug: tenant.slug, resolvedFrom: 'header' } : null;
  }
}

// In module:
@Module({
  providers: [
    { provide: TENANT_CONTEXT_PROVIDER, useClass: WebhookTenantProvider },
  ],
})
export class WebhookModule {}
```

`TenantInterceptor` calls `TenantContextProvider.resolve()` first; if it returns a non-null
context, standard JWT extraction is skipped. This keeps the single interception pipeline
while allowing domain-specific resolution without forking `TenantInterceptor`.

### 7.4 Hook examples by service type

| Service type | Recommended hook | Notes |
|---|---|---|
| Standard CRUD service | None — use defaults | `TenantModule.forRoot()` + `TenantDbFactory` + `TenantCacheService` |
| Webhook receiver | `TenantContextProvider` | Resolve tenant from webhook payload signature or org ID in header |
| Shared catalog (read-only cross-tenant data) | `@TenantOverride('shared-read-only')` | Catalog items live in `shared` schema; reads safe; writes must be in separate admin endpoint |
| Admin audit viewer | `@SkipTenancy()` + `CrossTenantAdminGuard` | Explicit `tenantIds` param required on every query |
| Real-time event fan-out service | `TenantKafkaClientFactory.forTenant(id)` loop | Iterate explicit tenant list; never use unscoped consumer |
| HealthStack clinical service | None — use defaults | SMART-on-FHIR `scope` claim available in `TenantContext` via `tenancy.currentToken()` |

---

## 8. Cross-Tenant Operations

### 8.1 `CrossTenantAdminGuard`

NestJS `CanActivate` guard. Validates:

1. Caller has role `platform:admin` or `platform:ops` in their JWT (checked against
   Auth introspection endpoint — not cached, called on every cross-tenant request).
2. Caller's IP is in the internal network range OR the request carries a valid mTLS
   client certificate issued by the platform CA (per ADR-0108 OpenBao PKI).
3. The `tenantIds` query/body parameter is present and non-empty. Requests with
   implicit "all tenants" (`tenantIds` absent or `*`) are rejected with HTTP 400.

```typescript
@Injectable()
export class CrossTenantAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean>;
}
```

Guard is exported from `@curaos/tenancy` and used alongside `@SkipTenancy()`.

### 8.2 Per-operation explicit tenant whitelist

Every cross-tenant query handler must:

```typescript
@Get('events')
async listEvents(
  @Query('tenantIds', ParseArrayPipe) tenantIds: string[],
): Promise<AuditEvent[]> {
  // Maximum 100 tenant IDs per request (enforced by TenancyService.validateTenantWhitelist)
  await this.tenancy.validateTenantWhitelist(tenantIds, { maxCount: 100 });
  // ... execute query across explicit tenant list
}
```

`validateTenantWhitelist()` checks:
- Each ID is a valid UUID.
- Each ID corresponds to an active tenant (batch check via platform schema).
- Count does not exceed `maxCount`.
- Calling principal has explicit access grant to each listed tenant (checked via OpenFGA
  relationship `platform:admin -> tenant:{id}` per ADR-0120 §3.2 ReBAC layer).

### 8.3 Audit requirement for cross-tenant queries

Every cross-tenant operation is audited per ADR-0104 hash-chain spec. The
`CrossTenantAdminGuard` automatically emits an audit event to Kafka topic
`platform.audit.cross-tenant` with schema:

```jsonc
{
  "eventId": "evt_01j...",
  "eventType": "cross_tenant_query",
  "actorId": "<platform admin user ID>",
  "actorRoles": ["platform:admin"],
  "targetTenantIds": ["<uuid>", "..."],
  "serviceId": "<service name>",
  "endpoint": "GET /admin/audit/events",
  "timestamp": "2026-05-24T00:00:00Z",
  "requestId": "<correlation ID from X-Request-ID header>",
  "previousHash": "<hash of previous audit event in platform chain>"
}
```

This event is consumed by `audit-service`, which appends it to the platform-level
(non-tenant-scoped) hash chain, separate from per-tenant chains.

---

## 9. Migration Path

### 9.1 Foundation services — M1 (Auth, Builder, Workflow, Codegen)

All four foundation products adopt `@curaos/tenancy` at M1 of their respective build
sequences (per ADR-0120 §9, ADR-0121 §13, ADR-0122 §11, ADR-0123 §10). Specifically:

- Auth-service: registers `TenantModule.forRoot()` in M1. Auth is the identity root;
  its own `TenantValidator` implementation queries the platform schema (not a per-tenant
  schema) to verify tenant existence. Auth does NOT call itself for validation — circular
  dependency is avoided by reading the `platform.tenants` table directly.
- Builder-service: adopts at M1. Projects and canvas state are stored per-tenant schema.
- Workflow-service: adopts at M1. Temporal task-queue naming convention becomes
  `t-{tenant_id}-{service}` (replaces informal convention from ADR-0122).
- Codegen-service: adopts at M1. Recipe generation requests are tenant-scoped; generated
  artifacts are stored under per-tenant Valkey namespace.

### 9.2 Cluster services — via Codegen recipe

All cluster services (ADR-0200–ADR-0209) adopt `@curaos/tenancy` via the Codegen recipe
`interceptor.nestjs-tenant-router` (per ADR-0153 recipe coverage). The recipe:

1. Adds `@curaos/tenancy` to `package.json` dependencies.
2. Injects `TenantModule.forRoot({ tenantValidator: DefaultTenantValidatorService })`
   into `AppModule`.
3. Replaces direct DB client injections with `TenantDbFactory`.
4. Replaces direct `CacheManager` injections with `TenantCacheService`.
5. Adds `@curaos/eslint-config/tenancy` to `eslint.config.mjs`.
6. Generates a `TENANCY.md` in the service root documenting any `@SkipTenancy()` or
   `@TenantOverride()` usage for the service.

Recipe invocation:

```bash
codegen apply interceptor.nestjs-tenant-router \
  --service identity-core-service \
  --tenant-validator DefaultTenantValidatorService
```

### 9.3 Backward-compatibility shim

During the migration window (M1 to M3 of each cluster wave), services that have not yet
adopted `@curaos/tenancy` must use the backward-compat shim:

```typescript
import { LegacyTenantShim } from '@curaos/tenancy/shim';

// In AppModule (temporary):
@Module({
  imports: [LegacyTenantShim.forRoot()],
})
export class AppModule {}
```

`LegacyTenantShim.forRoot()` reads `X-CURA-TENANT` header without JWT validation (the
pre-0155 behavior). It emits a deprecation warning log on every request and a
`tenancy.shim.request` metric counter. The shim is blocked from use once the service's
cluster ADR is marked Accepted — the ESLint rule `require-tenant-module` treats
`LegacyTenantShim` as a non-compliant registration.

The shim is removed from `@curaos/tenancy` at the v2 major release.

---

## 10. Amendments to Existing ADRs

### ADR-0099 §11 amendment

Add to §11 (Tenant Data Isolation):

> All NestJS services enforce tenant isolation via `@curaos/tenancy` `TenantModule`
> (ADR-0155). Tenant ID is extracted from JWT claim `tenant_id` as primary source.
> Per-tenant Prisma client pool, Valkey namespace, and Kafka consumer group are
> provisioned automatically. Cross-tenant operations require `@SkipTenancy()` +
> `CrossTenantAdminGuard` + explicit tenant whitelist + audit event emission.

### ADR-0120 §4 amendment (JWT claim shape)

ADR-0120 §4 (Multi-tenant model) is amended to add:

> **JWT claims required by `@curaos/tenancy` (ADR-0155):** Every access token issued by
> CuraOS Auth must include `tenant_id` (UUID v4) and `tenant_slug` (URL-safe string).
> The `iss` claim must be `https://auth.cura.os/t/<tenant_slug>/`. `TenantInterceptor`
> validates that `tenant_id` in the claim matches the tenant derived from `iss`. Mismatch
> results in HTTP 401 and an audit event.

### ADR-0121 (Builder), ADR-0122 (Workflow), ADR-0123 (Codegen) amendment

Add to each ADR's dependency table:

| Dependency | Package | Required since |
|---|---|---|
| `@curaos/tenancy` | `@curaos/tenancy` (Verdaccio) | M1 — mandatory |

And to each ADR's build sequence M1:

> Register `TenantModule.forRoot()` per ADR-0155. Codegen recipe
> `interceptor.nestjs-tenant-router` bootstraps the integration.

### ADR-0200–ADR-0209 amendment

Each cluster ADR's "Shared libraries" section adds:

> `@curaos/tenancy` — mandatory. All services in this cluster register `TenantModule`
> via Codegen recipe `interceptor.nestjs-tenant-router` (ADR-0153/ADR-0155).

---

## 11. Non-Functional Properties

| Property | Behaviour |
|---|---|
| **Latency** | `TenantInterceptor` overhead: <2 ms P99 (JWKS served from Valkey; no network call on hot path). DB pool hit: <1 ms. Pool miss (new tenant): ~15 ms connection setup. |
| **Pool sizing** | Default pool of 20 connections per service replica. At 1000 tenants × 10 replicas, total PG connections = 20 × 10 = 200 per service. Services with many tenants must tune DB pool size and coordinate with PG connection limits via PgBouncer (ADR-0101). |
| **JWKS rotation** | Key rotation event from Auth (Kafka topic `auth.jwks.rotated`) busts Valkey JWKS cache immediately. Worst-case stale window: Kafka consumer lag (typically <500 ms). No rolling re-authentication required; new key is appended to JWKS before old key is removed (overlap window: 15 min per ADR-0120). |
| **Schema migration** | Per-tenant schema migration is Auth's responsibility (tenant onboarding workflow). Tenant DB helpers assume schema exists; they do not run migrations. Services that detect missing schema receive `TenantSchemaNotFoundException` and should return HTTP 503 with `Retry-After: 30`. |
| **Cold start** | First request to a tenant not yet in pool: ~15 ms connection setup. Subsequent requests: pool hit, <1 ms. LRU eviction after configured pool TTL idle. |

---

## 12. Action Items

| ID | Action | Owner | Target |
|---|---|---|---|
| A-155-01 | Publish `@curaos/tenancy` v1.0.0 to Verdaccio with full API per §4 | Platform libs team | M1 Wave 1 |
| A-155-02 | Add `@curaos/eslint-config/tenancy` rules (§6.2) to `@curaos/eslint-config` package | Platform libs team | M1 Wave 1 |
| A-155-03 | Implement Codegen recipe `interceptor.nestjs-tenant-router` per ADR-0153 | Codegen team | M2 Wave 1 |
| A-155-04 | Auth-service: implement `TenantValidator` reading `platform.tenants` table (no self-call) | Auth team | M1 Auth |
| A-155-05 | Emit `tenant_id` + `tenant_slug` in all Auth-issued JWTs per §5 | Auth team | M1 Auth |
| A-155-06 | Foundation services (Builder, Workflow, Codegen) register `TenantModule` at M1 | Respective teams | M1 each |
| A-155-07 | Cluster ADRs 0200–0209: add `@curaos/tenancy` to dependency tables | ADR owners | Before cluster M1 |
| A-155-08 | Add `CrossTenantAdminGuard` audit emission to `platform.audit.cross-tenant` Kafka topic | Platform libs team | M1 Wave 1 |
| A-155-09 | Deprecate and schedule removal of `LegacyTenantShim` at `@curaos/tenancy` v2.0 | Platform libs team | v2 release |
| A-155-10 | Update ADR-0099, ADR-0120, ADR-0121, ADR-0122, ADR-0123 with amendment text per §10 | ADR curator | After ADR-0155 accepted |

---

## 13. Open Questions

| # | Question | Impact | Resolution path |
|---|---|---|---|
| OQ-1 | Should `tenant_slug` be a required JWT claim or derived at runtime from `tenant_id` lookup? Including it in the JWT avoids a Valkey lookup per request but requires token re-issue on slug change. | Low — slug changes are rare admin operations. | Accept: include in JWT; slug-change triggers token revocation via back-channel logout (ADR-0120). |
| OQ-2 | `TenantValidator` in Auth-service reads `platform.tenants` directly. Should this be a shared gRPC call to a hypothetical `platform-service` instead? | Medium — coupling Auth to the platform schema. | Defer: platform-service not scoped for Wave 1. Direct schema read is acceptable; add abstraction in v2 when platform-service exists. |
| OQ-3 | LRU pool of 20 clients per replica: is 20 the right default for services with 1000+ tenants under burst load? | Medium — pool exhaustion causes P99 spikes. | Monitor via `tenancy.pool.miss` metric in Wave 1 load tests; tune default if miss rate exceeds 5%. |
| OQ-4 | `@TenantOverride('shared-read-only')` uses a `shared` schema. Who creates and migrates this schema? | Low — affects shared catalog and similar patterns. | Shared schema provisioned by platform bootstrap automation (ADR-0109 Capsule). Migration ownership: owning service's Atlas migration set. |

---

## 14. References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0102 Event Messaging Layer](0102-event-messaging.md)
- [ADR-0104 Identity / Auth (superseded, audit chain spec retained)](0104-identity-auth.md)
- [ADR-0108 Secrets & PKI](0108-security-secrets.md)
- [ADR-0109 Container Orchestration](0109-containers-orchestration.md)
- [ADR-0110 CI/CD + Release](0110-cicd-release.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence Scan](0151-cross-cluster-coherence.md) — F-001 resolved by this ADR
- [ADR-0153 Codegen Recipe Coverage](0153-codegen-recipe-coverage.md) — `interceptor.nestjs-tenant-router` recipe
- [ADR-0209 Cluster: Frontend Packages + Backend Shared Libraries](0209-cluster-frontend-packages-backend-libs.md)
