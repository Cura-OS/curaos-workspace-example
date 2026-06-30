# identity-service — Agent Context

**Service:** identity-service (Foundation Product — ADR-0120)
**Cluster:** ADR-0200 (Identity · Party · Org · Audit)
**Runtime:** NestJS + TypeScript 5.x (ADR-0100)
**Last updated:** 2026-06-05

---

## 1. Current State

**Status: M9-S2 Phase A + Phase B Diamond root landed; M3 auth-plane baseline coexists unchanged**

M3 auth-plane baseline (history):
- NestJS shell exists in `your-org/identity-service` on issue `your-org/identity-service#1`.
- M3-S2 registration code merged in `your-org/identity-service#10`, but issue `#2` remains blocked by `your-org/curaos#41` for shared `@curaos/providers` password-breach registry support.
- M3-S5 RBAC v0 is implemented on branch `agent/impl-rbac-v0-codex-de4e2516` for `your-org/identity-service#5`.

M9-S2 Diamond root (current):
- Phase A (issue #151): Diamond root tables (`actors`, `identities`, `actor_memberships`, `actors_outbox`, `audit_chain_heads`, `actor_idempotency_keys`) landed alongside M3 schema. 60 new tests. M3 schema/controllers untouched.
- Phase B (issue #157): Backfill CLI (`bun run backfill:diamond`) backfills M3 `users`/`user_roles` into Diamond tables. 35 new tests. All Phase B acceptance gates [x].
- Issue #356: `actor_primary_org` plain view projects `(actor_id, org_id, role)` from current `actor_memberships` rows only (`valid_until IS NULL`). Cardinality is binding: N active roles for one actor/org emit N rows; expired memberships emit zero. Consumers must not rely on role precedence, grouped rows, or role arrays.
- Phase C dual-write research filed; read/write cutover behind `IDENTITY_DIAMOND_MODE` feature flag pending telemetry confirmation.
- See §8 and §9 for full integration maps.

M14 WebAuthn (current):
- Issue #76 adds registration options and attestation verification using `@simplewebauthn/server@13.3.1`.
- Issue #77 adds authentication options/assertion verification, optimistic sign-counter updates, DPoP-bound session issue from WebAuthn, tenant policy enforcement for regulated privileged actions, and WebAuthn audit actions.
- Issue #78 remains the CI/browser gate for Playwright/CDP virtual authenticators and physical hardware-key evidence before regulated rollout.

M14 break-glass token enforcement (current):
- Issue #79 adds temporary opaque emergency privilege tokens issued only from workflow-owned `curaos.security.break-glass.elevation-requested.v1` commands.
- It enforces two independent approvers, reason, exact scope, start/expiry, 30-minute maximum duration, workflow expiry/revoke, and over-scope rejection.
- It emits `curaos.security.break-glass.used.v1` and `curaos.security.break-glass.failed.v1` with reason, approvers, granted scope, requested scope, correlation ID, and audit-chain ref.
- It does not call `RegistrationStore.assignRole`, `RegistrationStore.revokeRole`, or `AdminController` permanent role mutation paths.

M3 shell notes:
- Current shell wires `TenantModule.forRoot()`, `AuditModule.forRoot()`, and `@curaos/event-interceptors` lifecycle publication through package exports.
- `/healthz` is tenant-optional and returns static shell component status.
- `ServiceStarted` publishes to `curaos.identity.events.v1` with partition key `system`.
- Startup audit publishes to `curaos.audit.events` through `@curaos/audit-sdk` with partition key `verified`.
- Research artifact: [research/identity-service-shell-research.md](research/identity-service-shell-research.md).
- RBAC v0 research artifact: [research/rbac-v0-research.md](research/rbac-v0-research.md).
- All ADR decisions locked: runtime, token architecture, AuthZ layers, tenancy module, audit SDK, provider abstraction convention.
- No production traffic yet; pre-v1 GA.

---

## 2. Active ADR References

| ADR | Relevance |
|-----|-----------|
| [ADR-0099](../../../docs/adr/0099-charter-priorities-vision.md) | Injection mold metaphor; identity = first foundation product |
| [ADR-0100](../../../docs/adr/0100-foundation-platform-runtime.md) | NestJS TypeScript 5.x runtime; Bun primary |
| [ADR-0120](../../../docs/adr/0120-foundation-auth.md) | **This service IS ADR-0120**; full library composition table |
| [ADR-0150](../../../docs/adr/0150-baseline-alignment-rules.md) | Local + 3rd-party rule; NestJS lib swap table; JVM sidecar list |
| [ADR-0151](../../../docs/adr/0151-cross-cluster-coherence.md) | F-001 tenant routing; F-002 token flow; F-016 HIPAA |
| [ADR-0153](../../../docs/adr/0153-codegen-recipe-coverage.md) | Applicable recipes: auth.nestjs-controller-better-auth, auth.smart-on-fhir-app, auth.scim-endpoint, auth.saml-idp-config |
| [ADR-0154](../../../docs/adr/0154-provider-abstraction-convention.md) | EmailProvider, SecretsProvider, StorageProvider naming and injection token convention |
| [ADR-0155](../../../docs/adr/0155-tenant-routing-curaos-tenancy.md) | TenantModule.forRoot() mandatory; ESLint rules; @SkipTenancy() policy |
| [ADR-0156](../../../docs/adr/0156-auth-token-flow-jwt-opaque-mtls.md) | Three-layer token architecture; DPoP; RFC 7662 introspection; break-glass variant |
| [ADR-0157](../../../docs/adr/0157-hapi-fhir-phi-audit-reconciliation.md) | Audit emission format; SMART scope capture; CuraOSAuditEvent schema |
| [ADR-0162](../../../docs/adr/0162-hipaa-2026-compliance-roadmap.md) | MFA mandate; session limits; PG TDE; WORM audit; v1/v1.5 milestones |
| [ADR-0123](../../../docs/adr/0123-foundation-codegen-plugin.md) | Codegen plugin model; gen-vs-hand file ownership; extension points |
| [ADR-0200](../../../docs/adr/0200-cluster-identity-party-org-audit.md) | Cluster ADR; within-cluster integration; event topic naming |

---

## 3. Integration Map

### M3-S1 service shell (issue #1)

```text
src/main.ts
  └── NestFactory.create(AppModule)
        ├── src/app.module.ts
        │     ├── identityTenantModule(...) -> @curaos/tenancy TenantModule.forRoot(...)
        │     ├── AuditModule.forRoot(...) -> @curaos/audit-sdk
        │     ├── HealthController
        │     └── IdentityLifecycleService
        ├── src/identity-lifecycle.service.ts
        │     ├── EventInterceptorRegistry + EventInterceptorPipeline from @curaos/event-interceptors
        │     ├── publishes ServiceStarted -> curaos.identity.events.v1
        │     └── emits startup audit -> AuditService.emitNow()
        └── src/health.controller.ts
              └── GET /healthz
```

#### Event producer / consumer map

| Producer | Topic | Partition key | Consumer |
|---|---|---|---|
| `IdentityLifecycleService` | `curaos.identity.events.v1` | `system` | Future platform orchestration / ops event consumers. No consumer in M3-S1. |
| `AuditService` via identity shell producer adapter | `curaos.audit.events` | `verified` | `audit-service` per ADR-0157 / ADR-0200. Not implemented in M3-S1. |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `src/app.module.ts` | Shell composition root for `TenantModule`, `AuditModule`, health, and lifecycle providers. |
| `src/identity-tenant-module.ts` | Calls package-exported `TenantModule.forRoot()` and removes invalid `APP_INTERCEPTOR` export from the returned dynamic module so real Nest scanning succeeds without editing M2 package source. |
| `src/identity-event-producer.ts` | Service-owned producer surface for lifecycle and audit startup messages; later replace with Kafka adapter. |
| `src/identity-lifecycle.service.ts` | `OnApplicationBootstrap` startup publisher and audit emitter. |
| `src/health.controller.ts` | Public `/healthz` readiness surface. |
| `test/identity-service-shell.test.ts` | Focused public behavior tests for boot, health, identity event topic/key, and audit event topic/key. |

#### Files that must not break

- `src/app.module.ts`
- `src/identity-tenant-module.ts`
- `src/identity-event-producer.ts`
- `src/identity-lifecycle.service.ts`
- `src/health.controller.ts`
- `test/identity-service-shell.test.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/tenancy/src/index.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/tenancy/src/tenant.module.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/audit-sdk/src/index.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/audit-sdk/src/audit.module.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/audit-sdk/src/audit.service.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/event-interceptors/src/index.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/event-interceptors/src/pipeline.ts`
- `/Users/dev/workspace/curaos-workspace/curaos/backend/packages/event-interceptors/src/registry.ts`

#### Cross-phase dependencies

- M2 package `dist/` must include current `src/index.ts` exports before private registry publish; stale local dist missed `AuditModule` / `AuditService` until rebuilt for verification.
- Future auth endpoint slices must keep `/healthz` tenant-optional.
- Later Kafka adapter work must preserve `curaos.identity.events.v1` key `system` for service startup and `curaos.audit.events` key `verified` for startup audit.
- M5 event-interceptor expansion can replace internal hook registration without changing M3-S1 topic/key behavior.

#### Data flow

1. `main.ts` boots `AppModule`.
2. `AppModule` installs `TenantModule.forRoot({ defaultProfile: "cloud", requireTenantByDefault: false })` through `identityTenantModule()`.
3. `AppModule` installs `AuditModule.forRoot({ producer, topic: "curaos.audit.events", autoFlush: false })`.
4. Nest calls `IdentityLifecycleService.onApplicationBootstrap()`.
5. `IdentityLifecycleService` invokes `EventInterceptorPipeline` for the startup payload.
6. `identityEventProducer` records `ServiceStarted` to `curaos.identity.events.v1` with key `system`.
7. `AuditService.emitNow()` serializes and publishes startup audit to `curaos.audit.events`.
8. `VerifiedAuditProducer` rewrites the audit partition key to `verified` for the shell startup audit contract.
9. `GET /healthz` returns shell component status.

### M3-S2 registration slice (issue #2)

Research artifact: [research/2026-05-26-m3-s2-registration-research.md](research/2026-05-26-m3-s2-registration-research.md).

```text
src/auth/auth.controller.ts
  ├── POST /auth/register
  ├── validates DTO with Zod
  └── resolves tenant via RegistrationTenantResolver

src/auth/register-user.service.ts
  ├── HIBP_PASSWORD_BREACH_PROVIDER
  ├── PasswordHasher argon2id m=65536,t=3,p=4
  ├── REGISTRATION_STORE
  └── AuthAuditPublisher

src/auth/registration-store.ts
  ├── InMemoryRegistrationStore
  └── DrizzleRegistrationStore -> src/db/identity-migrations.ts
```

#### Event producer / consumer map

| Producer | Topic | Partition key | Consumer |
|---|---|---|---|
| `AuthAuditPublisher` | `curaos.audit.events` | resolved tenant ID | `audit-service` per ADR-0157 / ADR-0200. |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `src/auth/registration-tenant-resolver.ts` | Maps server-side registration tokens to tenants; public tenant headers do not choose tenant storage. |
| `src/auth/auth.controller.ts` | `POST /auth/register`; invalid DTO -> 400; missing/invalid registration token -> 401. |
| `src/auth/register-user.service.ts` | Coordinates HIBP check, argon2id hash, persistence, duplicate mapping, and audit emission. |
| `src/auth/hibp-password-breach-provider.ts` | HIBP k-anonymity range lookup with fail-safe outage behavior. |
| `src/auth/registration-store.ts` | Tenant-scoped user/credential persistence contract plus in-memory and Drizzle/Postgres implementations. |
| `src/db/identity-migrations.ts` | Executable tenant schema/table setup and Citus distribution checks. |
| `test/register-user.test.ts` | Invalid payload, arbitrary tenant header rejection, HIBP breached/outage, same-tenant duplicate, cross-tenant same-email, audit contract. |
| `test/register-user-postgres.test.ts` | Live Postgres/Citus path and `pg_dist_partition` assertion when DSN exists. |

#### Cross-phase dependencies

- `your-org/curaos#41` must add a first-class password-breach provider domain to `@curaos/providers`; identity-service currently uses a service-local provider compatible with the exported `Provider` contract.
- M3-S3 login must verify credentials through the existing `PasswordHasher` rather than reimplementing argon2id behavior.
- Future identity domain events can add `UserRegistered` on `curaos.identity.events.v1`; M3-S2 only emits audit as required.

#### Data flow

1. Client submits `POST /auth/register` with `x-curaos-registration-token`.
2. `RegistrationTenantResolver` maps token to known tenant or rejects with 401.
3. Controller validates email/password/display name and maps invalid payloads to 400.
4. Service checks HIBP by SHA-1 range prefix only; outage/failure is non-blocking.
5. Service hashes password with argon2id and stores user+credential in the resolved tenant schema.
6. Duplicate email in same tenant returns 409; same email across different tenants is allowed.
7. Audit emits `UserRegistered` keyed by tenant ID.

### M3-S3 login + DPoP JWT + lockout slice (issue #3)

Research artifacts:
- [research/2026-05-26-m3-s3-login-dpop-lockout-research.md](research/2026-05-26-m3-s3-login-dpop-lockout-research.md)
- [research/2026-05-26-m3-s3-login-dpop-lockout-adversarial-review.md](research/2026-05-26-m3-s3-login-dpop-lockout-adversarial-review.md)

```text
src/auth/auth.controller.ts
  ├── POST /auth/login
  ├── validates DTO with Zod
  ├── requires DPoP header
  └── resolves tenant by known tenant slug

src/auth/login-user.service.ts
  ├── REGISTRATION_STORE user + credential lookup
  ├── LoginLockoutService threshold/backoff
  ├── PasswordHasher argon2id verify
  ├── DpopProofService proof validation + jkt + replay claim
  ├── LoginTokenService ES256 access token
  └── AuthAuditPublisher UserLoggedIn / AccountLocked
```

#### Event producer / consumer map

| Producer | Topic | Partition key | Event action | Consumer |
|---|---|---|---|---|
| `AuthAuditPublisher` | `curaos.audit.events` | resolved tenant ID | `UserLoggedIn` | `audit-service` per ADR-0157 / ADR-0200. |
| `AuthAuditPublisher` | `curaos.audit.events` | resolved tenant ID | `AccountLocked` | `audit-service` per ADR-0157 / ADR-0200. |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `src/auth/auth.controller.ts` | `POST /auth/login`; invalid DTO -> 400; missing DPoP -> 400; known tenant slug resolution. |
| `src/auth/registration-tenant-resolver.ts` | Keeps registration-token tenant resolution and adds known-slug login resolution. |
| `src/auth/login-user.service.ts` | Coordinates user lookup, lockout checks, password verify, DPoP proof, JWT issue, and audit. |
| `src/auth/dpop-proof.service.ts` | Validates ES256 DPoP proof JWTs, computes RFC 9449 JWK thumbprint binding, and rejects replayed proof IDs. |
| `src/auth/login-token.service.ts` | Issues 15-minute ES256 JWT access tokens and verifies DPoP-bound access proofs. |
| `src/auth/login-token-config.ts` | Injectable token config boundary for issuer, audience, key ID, optional ES256 private JWK, and canonical public origin. |
| `src/auth/login-lockout.service.ts` | Enforces five-attempt threshold and exponential lockout backoff. |
| `src/auth/login-lockout-store.ts` | Storage adapter boundary with in-memory default; future Valkey adapter attaches here. |
| `src/auth/dpop-replay-store.ts` | Storage adapter boundary with in-memory default for `{ jkt, jti }` proof replay prevention; future Valkey adapter attaches here. |
| `test/login.test.ts` | Happy path, missing DPoP, replayed DPoP proof, DPoP mismatch 401, lockout threshold/backoff, login/lockout audit events. |

#### Cross-phase dependencies

- M3-S4 owns refresh-token rotation; M3-S3 returns access tokens only.
- M3-S5 owns RBAC role storage/grants; M3-S3 emits `roles: []` while preserving the claim.
- Production multi-instance deployment must add persistent ES256 key source + JWKS publication before downstream token validation.
- Production horizontal lockout persistence should replace the in-memory store with a Valkey adapter through `LoginLockoutStore`.
- Production horizontal DPoP replay prevention should replace the in-memory store with a Valkey adapter through `DpopReplayStore`.

#### Data flow

1. Client submits `POST /auth/login` with `{ tenantSlug, email, password }` and a `DPoP` proof header.
2. `RegistrationTenantResolver.resolveSlug()` maps `tenantSlug` to a configured tenant; public tenant headers are not used.
3. `RegistrationStore` finds the tenant user and password credential created by registration.
4. `LoginLockoutService` rejects active lockout before password verification.
5. `PasswordHasher.verify()` checks the argon2id PHC hash.
6. Failed known-user attempts update lockout state; attempt 5 emits `AccountLocked` and locks for 15 minutes.
7. Later completed lockouts double duration to 30 minutes, 1 hour, and onward to the 24-hour cap.
8. `DpopProofService` validates proof signature, `typ`, `alg`, `htm`, canonical-public-origin `htu`, `jti`, `iat`, computes `jkt`, and claims the `{ jkt, jti }` replay key before credential failure is returned.
9. `LoginTokenService` signs a 15-minute ES256 JWT with `dpop_jkt` plus `cnf.jkt` and returns `token_type: "DPoP"`.
10. Successful login clears lockout state and emits `UserLoggedIn` keyed by tenant ID.

### M14 WebAuthn authentication + tenant enforcement slice (identity-service#77)

Research artifacts:
- [research/2026-06-05-webauthn-authentication-policy.md](research/2026-06-05-webauthn-authentication-policy.md)
- [../../../docs/research/m14-compliance-prereqs.md](../../../docs/research/m14-compliance-prereqs.md)

```text
src/auth/auth.controller.ts
  ├── POST /auth/webauthn/authenticate/options
  ├── POST /auth/webauthn/authenticate/verify
  ├── POST /auth/webauthn/credentials/:credentialId/recovery
  └── DELETE /auth/webauthn/credentials/:credentialId

src/auth/webauthn-authentication.service.ts
  ├── REGISTRATION_STORE user + role lookup
  ├── WebAuthnRegistrationStore auth challenge + credential lookup/update
  ├── SimpleWebAuthn generateAuthenticationOptions / verifyAuthenticationResponse
  ├── DpopProofService verification
  ├── RefreshSessionService DPoP-bound session issue
  └── AuthAuditPublisher WebAuthn events

src/rbac/rbac.guard.ts
  └── WebAuthnPolicyService enforcement after RBAC allow
```

#### Event producer / consumer map

| Producer | Topic | Partition key | Event action | Consumer |
|---|---|---|---|---|
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `WebAuthnCredentialEnrolled` | `audit-service` per ADR-0157 / ADR-0200. |
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `WebAuthnAuthenticationSucceeded` | `audit-service`. |
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `WebAuthnCredentialDisabled` | `audit-service`. |
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `WebAuthnCredentialRecoveryUpdated` | `audit-service`. |
| `RbacGuard` via `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `WebAuthnEnforcementFailed` | `audit-service`; emitted before 403. |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `src/auth/auth.controller.ts` | WebAuthn auth options/verify and authenticated credential management endpoints. |
| `src/auth/webauthn-authentication.service.ts` | Coordinates user lookup, auth challenge storage, SimpleWebAuthn verification, safe counter update, DPoP proof validation, role lookup, session issue, and audit. |
| `src/auth/webauthn-registration.service.ts` | Existing registration ceremony plus `WebAuthnCredentialEnrolled` audit after persistence. |
| `src/auth/webauthn-registration-store.ts` | Shared WebAuthn storage boundary for registration challenges, authentication challenges, credential counters, disable state, and recovery flags. |
| `src/auth/webauthn-policy.service.ts` | Parses `CURAOS_WEBAUTHN_TENANT_POLICIES` and evaluates passkey vs hardware-key assurance requirements. |
| `src/auth/auth-audit-publisher.ts` | Tamper-evident audit actions for enrollment, authentication, disable, recovery, and enforcement failure. |
| `src/auth/refresh-session-store.ts` | Carries auth assurance on refresh session records. |
| `src/auth/refresh-session.service.ts` | Threads auth assurance into JWT issue and active-session verification. |
| `src/auth/login-token.service.ts` | Adds `auth_assurance` claim with password or WebAuthn credential assurance. |
| `src/rbac/rbac.guard.ts` | Enforces regulated tenant policy after RBAC allow and before handler execution. |
| `src/db/identity-schema.ts` | Adds WebAuthn authentication challenge model and disabled timestamp. |
| `src/db/identity-migrations.ts` | Additive executable DDL for auth challenges and `disabled_at`; no `.sql` migrations. |
| `test/webauthn-authentication-policy.test.ts` | Focused tests for auth ceremony, counter compare, audit, and regulated/non-regulated enforcement. |

#### Files that must not break

- `src/auth/register-user.service.ts`
- `src/auth/login-user.service.ts`
- `src/auth/refresh-session.service.ts`
- `src/auth/webauthn-registration.service.ts`
- `src/auth/webauthn-registration-store.ts`
- `src/rbac/rbac.guard.ts`
- `src/admin/admin.controller.ts`
- `src/db/identity-migrations.ts`
- Existing tests: `test/login.test.ts`, `test/rbac.test.ts`, `test/refresh-session.test.ts`, `test/register-user.test.ts`, and `test/webauthn-registration.test.ts`.

#### Cross-phase dependencies

- #76 registration ceremony remains the credential source; #77 does not alter the password-only `credentials` table.
- #78 owns Playwright/CDP virtual authenticator CI and physical hardware-key evidence. #77 keeps code injectable/testable but does not claim hardware evidence.
- Future OPA/Cerbos/OpenFGA work can replace `WebAuthnPolicyService` without changing route contracts.
- Break-glass workflow remains workflow-core owned; #77 denies missing assurance instead of silently granting emergency access.

#### Data flow

1. Client calls `POST /auth/webauthn/authenticate/options` with `{ tenantSlug, email }`.
2. `RegistrationTenantResolver.resolveSlug()` maps tenant slug server-side.
3. `WebAuthnAuthenticationService` finds the tenant user and active WebAuthn credentials.
4. `@simplewebauthn/server` generates authentication options with allowCredentials and required user verification.
5. Store saves the authentication challenge scoped to `{ tenantId, userId }` with a 5-minute expiry.
6. Client calls `POST /auth/webauthn/authenticate/verify` with DPoP proof and WebAuthn assertion response.
7. Service validates DPoP, consumes the latest unexpired challenge once, loads the credential by `response.id`, and calls `verifyAuthenticationResponse()`.
8. Store updates sign counter to `authenticationInfo.newCounter` only if the persisted counter still equals the value verified.
9. Service starts the existing refresh session and JWT flow with `auth_assurance.method = "webauthn"` plus credential ID and hardware-key evidence.
10. Later role-guarded requests authenticate through `RefreshSessionService`; `RbacGuard` checks RBAC and then `WebAuthnPolicyService` for regulated tenant assurance requirements.
11. Missing assurance emits `WebAuthnEnforcementFailed` and returns 403; non-regulated tenants have no WebAuthn requirement.

### M14 Break-glass token enforcement (issue #79)

Research artifact: [research/2026-06-05-break-glass-token-enforcement.md](research/2026-06-05-break-glass-token-enforcement.md).

```text
workflow-core-service
  └── curaos.security.break-glass.elevation-requested.v1 / expired.v1
        └── src/break-glass/break-glass-privilege.service.ts
              ├── validates approved workflow event only
              ├── stores SHA-256 hash of opaque emergency token
              ├── enforces tenant, requester, scope, start, expiry, revocation
              └── emits used/failed security events with audit_chain_ref
```

#### Event producer / consumer map

| Producer | Topic | Key | Event | Consumer |
|---|---|---|---|---|
| workflow-core-service | `curaos.workflow.events.v1` | tenant ID | `curaos.security.break-glass.elevation-requested.v1` | identity-service#79, audit-core-service#12 |
| workflow-core-service | `curaos.workflow.events.v1` | tenant ID | `curaos.security.break-glass.expired.v1` | identity-service#79, audit-core-service#12 |
| `BreakGlassEventsPublisher` | `curaos.identity.events.v1` | tenant ID | `curaos.security.break-glass.used.v1` | audit-core-service#12, security alerting |
| `BreakGlassEventsPublisher` | `curaos.identity.events.v1` | tenant ID | `curaos.security.break-glass.failed.v1` | audit-core-service#12, security alerting |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `src/break-glass/break-glass.types.ts` | Workflow command, scope, use, and emitted-event contract types. |
| `src/break-glass/break-glass-store.ts` | Opaque token hash store boundary; production requires durable shared backing and in-memory is dev/test only. |
| `src/break-glass/break-glass-events.publisher.ts` | Publishes Diamond audit envelope first and versioned identity security event second. |
| `src/break-glass/break-glass-privilege.service.ts` | Grant/use/revoke enforcement; no role mutation imports. |
| `src/break-glass/break-glass.controller.ts` | Internal workflow command endpoints and token-use endpoint. |
| `src/app.module.ts` | Registers break-glass providers/controllers alongside existing auth/admin modules. |
| `test/break-glass-token-enforcement.test.ts` | TDD proof for workflow-only grant, scope/duration/expiry/revoke, used/failed events, and no permanent-role mutation. |

#### Files that must not break

- `src/admin/admin.controller.ts`
- `src/auth/registration-store.ts`
- `src/rbac/rbac.guard.ts`
- `src/auth/login-token.service.ts`
- `src/auth/refresh-session.service.ts`
- `src/identity-core/audit/audit-publisher.service.ts`
- `src/identity-event-producer.ts`
- `policies/rbac-v0.yaml`

#### Cross-phase dependencies

- workflow-core-service owns request, approval, expiry, and post-action review state. identity-service consumes only finalized command/event payloads.
- audit-core-service#12 consumes workflow lifecycle events plus identity-service `used.v1`/`failed.v1` events for tamper-evident projection.
- ADR-0156 keeps break-glass as an opaque Layer-2 emergency variant; #79 does not change JWT/DPoP Layer-1 issuance.
- M14 WebAuthn hardware-key evidence is adjacent; #79 does not require new authenticator state.

#### Data flow

1. workflow-core emits `curaos.security.break-glass.elevation-requested.v1` after requester reason and two independent approvals.
2. `BreakGlassPrivilegeService.grantFromWorkflowEvent()` validates event type, lifecycle state, two distinct approvers, requester not approver, scope, start, expiry, and duration cap.
3. identity-service generates an opaque 32-byte base64url token, stores SHA-256 hash plus grant metadata, and returns token to the trusted command caller.
4. `BreakGlassPrivilegeService.useToken()` validates token hash, tenant, requester, requested resource/action, start/expiry window, and workflow revocation.
5. In-scope use calls `IdentityCoreAuditPublisher.publish()` and uses returned `{ eventId, hash }` as `audit_chain_ref`.
6. It emits `curaos.security.break-glass.used.v1` to `curaos.identity.events.v1` with reason, approvers, granted scope, requested scope, correlation ID, and audit-chain ref.
7. Over-scope, expired, revoked, tenant mismatch, and requester mismatch use emit `curaos.security.break-glass.failed.v1` and reject the request.
8. workflow-core expiry emits `curaos.security.break-glass.expired.v1`; identity-service marks the grant revoked. Natural expiry remains enforced if the expiry event is delayed.

### M3-S5 RBAC v0 + audit decisions slice (issue #5)

Research artifact: [research/rbac-v0-research.md](research/rbac-v0-research.md).

```text
policies/rbac-v0.yaml
  └── RbacPolicyService loads static role -> permission matrix at boot

src/rbac/requires-role.decorator.ts
  └── @RequiresRole(role, { resource, action }) writes route metadata

src/rbac/rbac.guard.ts
  ├── reads metadata through NestJS Reflector
  ├── authenticates DPoP access token through RefreshSessionService
  ├── checks JWT roles claim against RbacPolicyService
  └── emits AccessDenied before throwing 403

src/rbac/audit.interceptor.ts
  └── emits AccessGranted after successful authenticated RBAC handler

src/admin/admin.controller.ts
  ├── POST /admin/users/:id/roles
  └── DELETE /admin/users/:id/roles/:role
```

#### Event producer / consumer map

| Producer | Topic | Partition key | Event action | Consumer |
|---|---|---|---|---|
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `RoleAssigned` | `audit-service` per ADR-0157 / ADR-0200. |
| `AuthAuditPublisher` | `curaos.audit.events` | tenant ID | `RoleRevoked` | `audit-service` per ADR-0157 / ADR-0200. |
| `RbacGuard` | `curaos.audit.events` | JWT tenant ID | `AccessDenied` | `audit-service`; emitted before 403. |
| `AuditInterceptor` | `curaos.audit.events` | JWT tenant ID | `AccessGranted` | `audit-service`; emitted after successful handler completion. |

#### Codebase-specific integration points

| Path | Role |
|---|---|
| `policies/rbac-v0.yaml` | Boot-loaded static role matrix; parsed with `yaml@2.9.0`, validated with Zod. |
| `src/rbac/rbac-types.ts` | Typed role union: `tenant-admin`, `user`, `clinician`, `support-agent`, `auditor`, `break-glass-admin`. |
| `src/rbac/requires-role.decorator.ts` | Route metadata for role/resource/action. |
| `src/rbac/rbac-policy.service.ts` | Matrix loader/evaluator and last-known-good reload behavior. |
| `src/rbac/policy-reload.service.ts` | Valkey GLIDE pub/sub seam; `reload` message on `curaos.identity.rbac-v0.reload` refreshes matrix. |
| `src/rbac/rbac.guard.ts` | Authenticates request and returns 403 when JWT roles lack required permission. |
| `src/rbac/audit.interceptor.ts` | Emits `AccessGranted` for successful RBAC-protected handlers. |
| `src/rbac/rbac-audit-coverage.ts` | Coverage gate helper for guarded handler audit coverage target. |
| `src/admin/admin.controller.ts` | Tenant-admin role grant/revoke endpoints. |
| `src/auth/registration-store.ts` | Role assignment store APIs plus default `user` role on registration. |
| `src/auth/login-user.service.ts` | Reads current role assignments so next login carries updated JWT roles. |
| `src/auth/refresh-session.service.ts` | Keeps roles snapshot on refresh session to document stale-session limitation. |
| `src/db/identity-schema.ts` | Drizzle table definitions for `roles` and `user_roles`. |
| `src/db/identity-migrations.ts` | Executable tenant table creation and role seeding; no `.sql` migration. |
| `test/rbac.test.ts` | Matrix evaluation, decorator metadata, guard short-circuit, grant/revoke, stale-session behavior, and audit coverage. |

#### Files that must not break

- `src/auth/auth.controller.ts` existing registration/login/refresh/logout/session endpoints.
- `src/auth/login-token.service.ts` ES256, DPoP `cnf.jkt`, `dpop_jkt`, 900-second TTL, `session_id`, and verified-claims behavior.
- `src/auth/refresh-session.service.ts` refresh rotation, logout, targeted revoke, and active-session checks.
- `src/identity-event-producer.ts` in-memory topic capture and startup audit partition-key behavior.
- Existing tests under `test/login.test.ts`, `test/refresh-session.test.ts`, `test/register-user.test.ts`, and `test/identity-service-shell.test.ts`.

#### Cross-phase dependencies

- M3-S3 roles claim now carries persisted assignments; default registered users receive `user`.
- M3-S5 does not implement OPA-WASM, Cerbos, OpenFGA, ABAC, SDK publishing, passkeys, or milestone gate closure.
- Existing access tokens and refresh sessions retain stale role snapshots until expiry/logout/revoke; immediate revoke is a follow-on for M3.5.
- M9/M11 can replace `RbacPolicyService` with the three-layer AuthZ chain while preserving decorator metadata and admin audit events.

#### Data flow

1. Service boot loads `policies/rbac-v0.yaml` into `RbacPolicyService`.
2. Registration creates the user and assigns default role `user`.
3. Admin login reads current roles from `RegistrationStore` and embeds them into the DPoP JWT.
4. Admin endpoint request carries `Authorization: DPoP <access_token>` and fresh DPoP proof.
5. `RbacGuard` reads `@RequiresRole()` metadata, authenticates the access token, verifies active session, evaluates JWT roles against the static matrix, and attaches `authenticatedSession` to the request.
6. Denied decisions emit `AccessDenied` and return 403.
7. Allowed admin handlers mutate role assignment state and emit `RoleAssigned` or `RoleRevoked`.
8. `AuditInterceptor` emits `AccessGranted` after successful RBAC-protected handler completion.
9. A target user's next login reads changed role assignments and carries them in the new JWT.
10. Existing sessions keep stale roles by design until M3.5 immediate revocation work.

### Within-cluster (ADR-0200)

```text
identity-service
  ──gRPC──▶ party-service         (onboarding saga: CreatePerson)
  ──gRPC──▶ party-service         (GDPR saga: AnonymizePerson)
  ──gRPC──▶ org-service           (GDPR saga: RemoveUserMemberships)
  ──gRPC──▶ org-service           (onboarding saga: AddMember if invite)
  ──Kafka──▶ curaos.audit.events  (AuditInterceptor; audit-service sole consumer)
  ◀──Kafka── curaos.party.person.erased     (GDPR saga signal)
  ◀──Kafka── curaos.org.membership.removed  (GDPR saga signal)
```

### Cross-cluster (producer / authority)

```text
identity-service
  ──JWKS──▶ ALL services          (/.well-known/jwks.json; consumed at startup and cached)
  ──JWT headers──▶ ALL services   (via APISIX X-User-ID, X-Tenant-ID, X-Roles injection)
  ──RFC 7662──▶ APISIX gateway    (opaque L2 introspection endpoint)
  ──gRPC──▶ Temporal server       (saga worker registration; queue: identity-sagas)
  ──SPIFFE SVID──▶ Cilium         (mTLS enforcement; service identity)
  ──MCP──▶ AI agents              (@curaos/auth-mcp tools over stdio/HTTP)
```

### Sidecars (localhost)

```text
identity-service pod
  ├── OPA-WASM module (in-process, @open-policy-agent/opa-wasm)
  ├── Cerbos PDP sidecar (localhost:3593 gRPC)
  ├── OpenFGA sidecar (localhost:8080 REST)
  └── SPIRE agent (unix socket /run/spire/sockets/agent.sock)
```

---

## 4. Key Decisions and Rationale

### D-001: Better Auth over Keycloak / Ory Kratos
- Keycloak: JVM startup (~30s), no TypeScript extension model, multi-tenant via realms (isolation vs cost trade-off broken), Kafka audit bridge fragile.
- Ory Kratos: ReBAC migration pain, no native SMART-on-FHIR, managed Ory Network violates self-hosted-first.
- Better Auth: NestJS-native plugin model, TypeScript throughout, composable with node-oidc-provider + node-saml + SimpleWebAuthn + scim-patch without forking.

### D-002: Three-layer AuthZ (OPA-WASM + Cerbos + OpenFGA)
- OPA-WASM: in-process, zero network, air-gap safe, covers global deny rules.
- Cerbos: ABAC policies in Git, typed resource attributes, per-tenant policy namespaces.
- OpenFGA: ReBAC for "user can see this record because they are assigned to the case" — cannot express in flat RBAC.
- All three independently upgradable without redeploying the other two.

### D-003: Schema-per-tenant (not DB-per-tenant)
- DB-per-tenant: cost prohibitive at scale; connection pool explosion.
- Schema-per-tenant: `SET search_path` isolates data; tenant DB helper LRU enforces this.
- ESLint `no-raw-db-client` prevents bypass. Row-level security as defense-in-depth on top.

### D-004: SMS MFA BLOCKED
- ADR-0162 §4 prohibits SMS OTP for HIPAA-regulated tenants (SIM-swap attack vector).
- Implementation: `mfa_policy.allowed_methods` validated at service startup; `sms` in that array = startup failure.
- No code path issues an SMS OTP; no provider interface for SMS exists.

### D-005: DPoP binding on JWT (RFC 9449)
- Prevents token theft replay: even if a JWT is intercepted, it is bound to the DPoP key pair; presenting it from a different client key fails.
- APISIX performs DPoP proof validation at edge on every request.
- `dpop_jkt` claim in JWT carries the thumbprint of the client's DPoP key.

### D-006: SMART-on-FHIR port from zedwerks
- zedwerks NestJS SMART-on-FHIR module provides App Launch 2.0 protocol under AGPL.
- CuraOS will maintain a fork under `@curaos/smart-on-fhir` to control upgrade pace.
- fhirclient-js handles client-side SMART negotiation for browser apps.
- `fhir_user` claim resolved at token issuance: gRPC call to party-service `ResolveSmartUser(sub)` → returns FHIR resource reference.

### D-007: Break-glass design
- Synchronous audit publish BEFORE action: if Kafka is unavailable, break-glass is denied.
- 30-minute absolute TTL on opaque token; no extension.
- Mandatory `reason` field (free text, min 10 chars) stored in audit event payload.
- Admin dashboard can list all active break-glass tokens; revoke via `auth.session.revoke` MCP tool or REST.

---

## 5. Implementation Notes for Agents

### Scaffolding order
1. Run codegen recipe `backend.nestjs-service` to generate NestJS scaffold.
2. Run `interceptor.nestjs-tenant-router` to wire `TenantInterceptor`.
3. Run `interceptor.nestjs-audit` to wire `AuditInterceptor`.
4. Run `auth.nestjs-controller-better-auth` to generate auth controllers + Better Auth module.
5. Run `auth.scim-endpoint` to generate SCIM controllers.
6. Run `auth.saml-idp-config` to generate SAML connection management module.
7. Run `auth.smart-on-fhir-app` to generate SMART App Launch 2.0 module.
8. Hand-write: three-layer AuthZ chain (OPA-WASM bootstrap, Cerbos client, OpenFGA client).
9. Hand-write: Temporal saga activities and workflow definitions.
10. Hand-write: SPIRE agent bootstrap and SVID rotation logic.

### File ownership conventions (ADR-0123 gen vs hand)
- `*.gen.ts` files: generated by codegen recipes; do NOT hand-edit; regenerate to update.
- `src/workflows/*.ts`, `src/activities/*.ts`: hand-written; Temporal-specific logic.
- `src/authz/opa/`, `src/authz/cerbos/`, `src/authz/openfga/`: hand-written; policy clients.
- `src/providers/`: hand-written provider implementations per ADR-0154.
- `src/db/identity-schema.ts`: hand-written Drizzle schema; changes require a new executable migration in `src/db/identity-migrations.ts` (no `.sql` files).

### Tenancy gotchas
- `TenantInterceptor` runs before route guards. Do NOT use `@SkipTenancy()` on any auth endpoint that needs tenant context — even `/auth/login` needs `tenant_id` from the request body or subdomain resolver, not from JWT (user has no JWT yet at login).
- Login flow resolves tenant via `slug` in request body or `Host` header subdomain; sets tenant context explicitly before tenant-scoped Drizzle calls.
- JWKS endpoint (`/.well-known/jwks.json`) is `@SkipTenancy()` because it is cross-tenant by nature.

### Valkey key patterns
- Opaque step-up token: `opaque:sha256(token)` → JSON payload (5-min TTL).
- TOTP rate limit: `totp:rate:{userId}` → counter (1-min window).
- OAuth state: `oauth:state:{state}` → nonce + provider (10-min TTL).
- OPA bundle reload signal: `opa:reload:{tenantId}` → timestamp.

### Cerbos policy structure
```text
policies/
  resource_user.yaml          -- CRUD on user resource
  resource_session.yaml       -- session management
  resource_federation.yaml    -- SAML/OIDC connection admin
  resource_smart_app.yaml     -- SMART app registration
  derived_roles.yaml          -- role hierarchy definitions
```
Per-tenant policy overrides live in `policies/tenants/{tenant_id}/`.

### OPA bundle structure
```text
bundles/
  global/
    authz/main.rego           -- entry point; delegates to sub-modules
    authz/deny_rules.rego     -- fast deny rules (SMS block, rate limits)
    authz/session_rules.rego  -- session TTL enforcement
  data.json                   -- static reference data
```
Bundle compiled to WASM via `opa build -t wasm` and baked into container image. Valkey signal triggers runtime hot-reload from updated bundle in mounted volume.

### Testing approach
- **Unit tests (Vitest):** mock the tenant-scoped Drizzle session, mock Valkey, mock Cerbos + OpenFGA clients; test business logic isolation.
- **Integration tests (Vitest + Testcontainers):** real PG (schema-per-test-tenant), real Valkey, Cerbos container, OpenFGA container.
- **E2E tests (Playwright):** SMART App Launch flow from browser; SAML SP login flow.
- **Audit emission test:** integration test asserts Kafka message on `curaos.audit.events` within 5 seconds of every auth action (ADR-0157 CI guard pattern).
- **100% coverage gate on auth + audit paths:** `src/auth/**`, `src/audit/**` tracked separately; gate fails below 100%.

### HIPAA CI guards (ADR-0162)
- `require-audit` ESLint rule: any `@Controller` method without `@AuditEvent()` decorator fails lint.
- Integration test: assert audit event published within 5s for every auth action.
- Startup validation: `mfa_policy.allowed_methods` must not include `sms`; service fails to start if present.
- Session TTL integration test: assert no JWT issued with `exp - iat > 900` (15 min = 900 seconds).

---

## 6. Plugin / Sidecar Extension Points

Per ADR-0123 extension model:

- **Auth plugins:** Better Auth plugin interface; implement `BetterAuthPlugin`; register in `BetterAuthModule.forRoot({ plugins: [...] })`. Example: custom provisioner, custom claim enricher.
- **Policy plugins:** OPA rego modules in `bundles/plugins/{name}.rego`; merged at bundle build time.
- **MCP tool extensions:** Additional tools registered in `@curaos/auth-mcp` via `McpToolRegistry.register(tool)`.
- **Provider plugins:** Implement provider interface (ADR-0154); register in `ProviderRegistry`; config in tenant YAML.
- **SMART scope plugins:** Register additional SMART scope validators in `SmartScopeRegistry`.

---

## 7. Build Milestones (ADR-0120 §build-sequence)

> **Numbering note:** The M1–M15 table below is the ADR-0120 feature-build sequence. The `M<n>-S<n>` / `M9-S2 Phase A/B` labels used in §1, §3, §8, and §9 are roadmap story IDs ([[curaos-roadmap-workflow-rule]]) and are NOT the same numbering. `M9` in this table = SCIM 2.0; `M9-S2` in §8/§9 = the Diamond model story.

| Milestone | Deliverable |
|-----------|-------------|
| M1 | NestJS scaffold + TenantModule + AuditInterceptor + health endpoint |
| M2 | Password auth + argon2id + account lockout + email verification |
| M3 | JWT issuance (ES256, DPoP) + JWKS endpoint + OIDC discovery |
| M4 | Passkey (WebAuthn/FIDO2) + TOTP + backup codes |
| M5 | OAuth 2.1 social (GitHub, Google, Microsoft, Apple) |
| M6 | SAML 2.0 SP + IdP + JIT provisioning |
| M7 | Opaque step-up tokens (Valkey) + RFC 7662 introspection + break-glass |
| M8 | SMART-on-FHIR App Launch 2.0 |
| M9 | SCIM 2.0 endpoints |
| M10 | Three-layer AuthZ: OPA-WASM + Cerbos + OpenFGA |
| M11 | SPIRE SVID issuance + mTLS wiring |
| M12 | Temporal sagas: onboarding + GDPR erasure |
| M13 | `@curaos/auth-mcp` MCP server |
| M14 | HIPAA compliance gates: all NFR-003 controls verified |
| M15 | SOC 2 Type II + HITRUST CSF r2 + ISO 27001:2022 evidence collection |

---

## 8. M9-S2 Phase A — Diamond Root Integration Map

> Lands the canonical Diamond root tables ALONGSIDE the existing M3 auth
> schema via rolling-update per [[curaos-rolling-update-rule]]. Binding
> ADR: [`ai/curaos/docs/adr/0210-m9-diamond-model-party-org-identity.md`](../../../docs/adr/0210-m9-diamond-model-party-org-identity.md).
> Tracking issue: [#151](https://github.com/your-org/curaos-ai-workspace/issues/151).

### 8.1 What lands in Phase A (this PR)

New code path under `curaos/backend/services/identity-service/src/identity-core/`:

| Path | Role |
|---|---|
| `db/schema.ts` | Drizzle schema: `actors` + `identities` + `actor_memberships` + `actors_outbox` + `audit_chain_heads` + `actor_idempotency_keys` (all in `identity_core` namespace) |
| `db/migrations.ts` | Per-tenant DDL applicator (`ensureTenantIdentityCoreSchema`) mirroring the M3 `ensureTenantIdentitySchema` pattern; coexists with M3 |
| `db/outbox.service.ts` | Transactional outbox (in-memory + file stores; Postgres adapter Phase B) |
| `audit/audit-publisher.service.ts` | D5 audit envelope w/ SHA-256 hash chain (composite chain key `(tenantId, resourceType, resourceId)` matches org-core M9-S4 P1b) |
| `audit/audit-chain-head.store.ts` | Durable per-resource chain head (in-memory + file) |
| `events/actor-event-producer.ts` | Kafka producer abstraction for `core.identity.actor.{created,updated,deleted}.v1` topics |
| `actors/{dto,service,controller,module}.ts` + `in-memory-actors.repository.ts` | REST surface for `/actors` |
| `auth/requires-actor-scope.decorator.ts` | Multi-role wrapper that stamps the existing M3 `REQUIRES_ROLE_KEY` for `identity.actor:{read,write}` |

The forward-only SQL migration ships as `curaos/backend/services/identity-service/drizzle/migrations/0001_diamond_root_add.sql`.

### 8.2 Producers / consumers of the new event surface

| Topic | Producer | Consumers |
|---|---|---|
| `curaos.core.identity.actor.created.v1` | identity-service (this module) | party-core-service, org-core-service, audit-core-service (M9-S5), RBAC, HealthStack overlays |
| `curaos.core.identity.actor.updated.v1` | identity-service | same as above |
| `curaos.core.identity.actor.deleted.v1` | identity-service | same as above (soft-delete signal) |
| `curaos.core.identity.invited.v1` | identity-service (M9-S6.1 invitation producer, #257) | audit-core-service, org-core-service, cross-cluster invite→accept chain (#103) |
| `curaos.core.audit.event.v1` | identity-service (Actor + Identity + Invitation resource types) | audit-core-service (M9-S5 hot Kafka + cold MinIO archive) |

### 8.3 Transaction boundary in modulith mode (Option A per ADR-0210)

Cross-module writes within the modulith run inside a single Postgres
transaction so the Diamond peers stay consistent without an outbox-only
reconciliation:

```text
BEGIN
  INSERT identity_core.actors (id, tenant_id, actor_type, …) RETURNING id;
  -- Sibling NestJS modules (party-core / org-core) write their peer row
  -- in the same BEGIN..COMMIT via their service-layer APIs:
  PartyModule.createParty(actorId, …);        -- INSERT identity_core.parties (or party_core.parties depending on schema topology decision)
  OrgModule.attachMembership(actorId, …);     -- INSERT identity_core.actor_memberships
  -- Outbox enqueue for downstream choreography lives in the same tx:
  INSERT identity_core.actors_outbox (topic, payload, idempotency_key, …);
COMMIT
```

After COMMIT, the audit publisher emits the D5 envelope (best-effort fan-out
per M7 D5 — outbox is the canonical record). In standalone mode the cross-
service path becomes outbox + idempotent consumers + reconciliation job per
ADR-0210 §"Consistency mechanism".

### 8.4 FK target promise for party-core + org-core

- `parties.actor_id → identity_core.actors(id)` — modulith mode same DB; standalone mode app-layer + outbox.
- `orgs.actor_id → identity_core.actors(id)` — same posture.
- `actor_memberships.actor_id → identity_core.actors(id)` — declared in this module's migration (`actor_memberships_actor_id_fk`); ON DELETE RESTRICT (actor soft-deletes pseudonymize, never hard-delete).
- `actor_memberships.org_id → org_core.orgs(id)` — the FK clause is added in the org-core-service migration when both schemas coexist in the same DB; the Diamond root migration here ships only `actor_id` to keep standalone deployments compatible.

### 8.5 What stays untouched in Phase A

- M3 schema (`src/db/identity-schema.ts`, `src/db/identity-migrations.ts`) — bytes unchanged.
- M3 controllers (`src/auth/*`, `src/admin/*`) — bytes unchanged.
- M3 RBAC machinery (`src/rbac/*.ts`) — bytes unchanged.
- `@curaos/auth-sdk` semver — Phase D bumps; Phase A ships without SDK changes.

### 8.6 Forward path (Phase B → E)

Per [[curaos-rolling-update-rule]]:

- **Phase B** (#157, M9-S2 follow-up) — Backfill job copies `users` / `user_roles` rows into `actors` / `identities` / `actor_memberships` (idempotent + restartable). NO drops.
- **Phase C** — Feature flag (`CURAOS_IDENTITY_CORE_READ_ENABLED`) cuts read traffic from M3 to Diamond once telemetry confirms backfill convergence.
- **Phase D** — `@curaos/auth-sdk@2` bumps semver; consumers migrate via `^1 || ^2`.
- **Phase E** — Forward migration drops `users` / `credentials` / `roles` / `user_roles` after zero-traffic telemetry.

No `-v2` parallel paths at any phase.

### 8.7 M9-S6.1 — Invitation producer (`invited.v1`)

The PRODUCER leg of the cross-cluster invite→accept event chain (#103, issue
[#257](https://github.com/your-org/curaos-ai-workspace/issues/257)).
The accept producer (`accepted.v1`, #258) and the chain E2E (#259) are separate
stories blocked on this one.

| Path | Role |
|---|---|
| `src/identity-core/events/invitation-event-producer.ts` | `INVITATION_INVITED_TOPIC` + the strict `invited.v1` wire-shape schema + `buildInvitedEventPayload` + `invitationPartitionKey` |
| `src/identity-core/invitations/{dto,service,controller}.ts` + `{in-memory,drizzle}-invitations.repository.ts` | REST surface for `POST /invitations` + the producer wiring |
| `src/identity-core/auth/requires-invitation-scope.decorator.ts` | Stamps the M3 `REQUIRES_ROLE_KEY` for `identity.invitation:write` (tenant-admin) |
| `src/identity-core/db/migrations.ts` → `createInvitationsTable` + `drizzle/migrations/0007_invitations_add.sql` | Forward-only `invitations` table (idempotent `CREATE TABLE IF NOT EXISTS`); no `-v2` path |

**Flow.** `POST /invitations` → write a durable `identity_core.invitations` row →
enqueue `curaos.core.identity.invited.v1` (domain) to the actor outbox in the
same tx → emit a PARALLEL reference-only audit envelope on
`curaos.core.audit.event.v1` (`action=CREATE`, `resourceType=Invitation`,
durable-before-ack into `audit_outbox` when a DSN is wired). `status` starts
`pending`; the accept producer (#258) advances it via a forward UPDATE.

**traceId vs correlationId (the chain key — user decision 2026-06-01).** `traceId`
is the FLOW chain key: it lands on the audit envelope's `traceId` field AND on
both the domain-event and audit Kafka headers (`trace_id`). `correlationId`
stays PER-LEG (per-request) on the envelope + the `correlation_id` header — it is
NOT collapsed into a single flow-wide id, so the identity divergence pairing key
`correlationId=targetUserId` (`admin.controller.ts:62-68`) does not regress.
Mirrors `org-core-service/src/audit/audit-publisher.service.ts:235-238,286`. As
part of this story the shared `IdentityCoreAuditPublisher` adds an additive
`trace_id` Kafka header to the audit topic (forward-only; the Actor leg inherits
it harmlessly).

**PHI boundary.** `invitee_email` is the only addressable identifier and it
stays in the durable row — it is NEVER on the `invited.v1` payload or the audit
envelope (both reference-only: opaque ids + closed RBAC `role` + lifecycle
`status`; `changedFields` are names-only). `role` is validated against the closed
`RBAC_ROLES` enum at the DTO.

## 9. M9-S2 Phase B — Diamond Backfill Integration Map

> Backfills the M3 auth shape into the Diamond root tables from issue
> [#157](https://github.com/your-org/curaos-ai-workspace/issues/157).
> The job is a rolling-update bridge only: M3 tables remain read-only and
> Phase C owns read/write cutover behind a feature flag.

### 9.1 New Phase B files

| Path | Role |
|---|---|
| `src/identity-core/backfill/backfill-diamond.command.ts` | CLI + job runner for `bun run backfill:diamond --tenant <tenant_id> --batch-size 1000`; includes cursor pagination, mapping, idempotent insert adapters, and counters. |
| `test/identity-core/backfill/backfill-diamond.command.test.ts` | 35-test harness covering 1000 M3 users, idempotent rerun, cursor resume, conflict-safe identities/memberships, CLI args, and metric counters. |
| `package.json` | Adds `backfill:diamond` script. |

### 9.2 Data flow

1. CLI parses `--tenant`, optional `--batch-size`, optional restart `--cursor tenant_id,created_at,id`, and optional schema overrides.
2. Source schema defaults to `tenant_<uuid>` via the existing M3 `tenantSchemaName()` helper.
3. Destination schema defaults to `identity_core`, matching the Phase A Diamond Drizzle schema.
4. Job reads M3 `users` pages ordered by `(tenant_id, created_at, id)`.
5. For every page, job reads matching M3 `user_roles` for those user IDs only.
6. Each `users` row maps to one `actors` row with `id=users.id`, `actor_type='human'`, copied `tenant_id`, `display_name`, `created_at`, and `updated_at`.
7. Each `users` row maps to one `identities` row with `id=users.id`, `actor_id=users.id`, `external_subject=NULL`, `issuer=NULL`, copied `tenant_id`, `email`, `display_name`, status, and timestamps.
8. Each `user_roles` row maps to an `actor_memberships` candidate with `actor_id=user_roles.user_id`, `org_id=user_roles.tenant_id` as the deterministic M3 tenant-root scope, `membership_type='staff'`, copied `role`, and `valid_from=user_roles.assigned_at`.
9. Inserts are conflict-safe: `actors` uses `ON CONFLICT (id) DO NOTHING`; `identities` use `ON CONFLICT DO NOTHING`; `actor_memberships` use `ON CONFLICT (actor_id, org_id, role, valid_from) DO NOTHING` (the role-history PK — see #192) so reruns are idempotent AND a user's N distinct roles each land as their own temporal row instead of collapsing.

### 9.3 Producers / consumers

| Producer | Signal | Consumer |
|---|---|---|
| `IdentityDiamondBackfillJob` | Prometheus counter `backfill.rows.read` | Operator dashboards / Phase C convergence checks. |
| `IdentityDiamondBackfillJob` | Prometheus counter `backfill.actors.created` | Operator dashboards / Phase C convergence checks. |
| `IdentityDiamondBackfillJob` | Prometheus counter `backfill.identities.created` | Operator dashboards / Phase C convergence checks. |
| `IdentityDiamondBackfillJob` | Prometheus counter `backfill.memberships.created` | Operator dashboards / Phase C convergence checks. |

The job does not emit actor lifecycle outbox events. It is a historical data
materialization path, not a live actor mutation endpoint; Phase C dual-write
owns live event/audit parity.

### 9.4 Restart + idempotency behavior

- Cursor pagination is tuple-based: `(tenant_id, created_at, id)`.
- Each run returns the final cursor in JSON stdout for restart handoff.
- Restart can pass `--cursor <tenant_id>,<created_at>,<id>` to continue after a known durable checkpoint.
- Running the same tenant twice is safe: second run rereads M3 rows but creates zero Diamond rows.
- Multi-role / role-history (#192): the `(actor_id, org_id, membership_type)` index is NON-unique, so multiple distinct M3 roles for the same actor in the same tenant-root scope materialize as N temporal `actor_memberships` rows (one per role, each `valid_until IS NULL` = current) instead of collapsing. Row uniqueness is the composite PK `(actor_id, org_id, role, valid_from)`. Genuine duplicate (same role, same `assigned_at`) rows are still rejected fail-loud. `actor_primary_org`-style "primary role" precedence is explicitly NOT introduced (Option B rejected); a future current-roles view emits one row per current role.

### 9.5 Files that must not break

- `src/db/identity-schema.ts` — M3 shape; Phase B reads only.
- `src/db/identity-migrations.ts` — M3 schema helper; used only to derive source schema names.
- `src/auth/**`, `src/admin/**`, `src/rbac/**` — M3 runtime surfaces; Phase B leaves them unchanged.
- `src/identity-core/db/schema.ts` — Phase A Diamond destination shape.
- `src/identity-core/db/migrations.ts` — Phase A per-tenant Diamond DDL helper.
- `src/identity-core/actors/**` — Phase A REST surface; Phase B does not change public REST behavior.

### 9.6 Cross-phase dependencies

- Phase C consumes backfill convergence counters before enabling `IDENTITY_DIAMOND_MODE`.
- Phase D keeps the same `packages/auth-sdk/` path and bumps semver only; no `auth-sdk-v2`.
- Phase E drops M3 tables only after telemetry proves zero M3 traffic for the required window.

## 10. M9-S2 Phase D-prereq — Audit-divergence checker (the Phase D gauge)

> Story [#195](https://github.com/your-org/curaos-ai-workspace/issues/195) · parent [#99](https://github.com/your-org/curaos-ai-workspace/issues/99). HIGH-BLAST-RADIUS auth. The signal `auth-diamond-divergence == 0` the Phase D gate reads directly.

### 10.1 What it is

A **read-only** checker that consumes the dual-emitted audit events (Phase C emits an
audit event for the same logical auth operation from BOTH the M3 code path and the Diamond
code path), pairs the two events by correlation-id (ADR-0210 §D4 / M7-S4 choreography),
computes a structural diff over the FHIR/Diamond-mapped fields, and exposes:

- metric `auth_diamond_divergence_count{tenant_id, operation}` (Prometheus text exposition,
  consumed by Pyrra/OpenSLO per [[curaos-slo-rule]]; non-zero raises an alert via the
  error-tracking stack [[curaos-error-tracking-rule]]); and
- the single boolean `auth-diamond-divergence == 0` (`AuthDiamondDivergenceChecker.isGreen()`)
  the Phase D gate reads.

It **never mutates identity state** and never reads PHI values — it diffs identifiers, the
operation classification, the outcome, and changed-field NAMES only (M7-D5 reference-only rule).

### 10.2 Signal gate is signal-only — NO time term (BINDING)

Per [[curaos-rolling-update-rule]] "Signal gates only — NO time or date gates", the Phase D
gate predicate is exactly `signal:auth-diamond-divergence == 0`. The "sustained zero" the gate
needs is a property of the gauge's OWN rolling sample (`rollingSampleSize`, a count of the last
N **paired events** — a statistical property of the measurement). There is NO soak / burn-in /
N-hour / N-day term anywhere in the checker or the gate. This gauge replaces the deleted
calendar guess `external:phase-c-burn-in-until-2026-05-31`.

### 10.3 New Phase D-prereq files

| Path | Role |
|---|---|
| `src/identity-core/divergence/normalized-audit-fact.ts` | Canonical path-agnostic comparison fact + the four operation types in scope (`login`, `role-grant`, `membership-change`, `credential-update`). |
| `src/identity-core/divergence/audit-normalizers.ts` | `normalizeM3AuditEvent` + `normalizeDiamondAuditEvent` — map each path's native envelope onto a fact; unmapped events → `undefined` (parity of KNOWN ops, never coverage). |
| `src/identity-core/divergence/audit-divergence-checker.ts` | `AuthDiamondDivergenceChecker` — pairs by `(tenantId, correlationId)`, diffs, counts, exposes `isGreen()` + `prometheusMetrics()` + `pendingCount()`; alert seam `onDivergence`. DI token `AUTH_DIAMOND_DIVERGENCE_CHECKER`. **Durable hooks (#202):** `snapshot()` / `loadSnapshot()` / `rehydrate()` / `recordDurable(fact, offset)` / `markReplayComplete()` / `awaitingReplay()` / `durableOffset()` — durability AROUND the #38 diff logic, not a change to it. |
| `src/identity-core/divergence/divergence-ledger.store.ts` | **(#202)** `DivergenceLedgerStore` (InMemory/File/Postgres + `createDefaultDivergenceLedgerStore`) — durable REFERENCE-ONLY backing for cumulative counters + last-known pending + Kafka offset checkpoint. `assertReferenceOnly()` runtime PHI guard. Mirrors the `audit-chain-head.store.ts` pattern. |
| `drizzle/migrations/0002_divergence_ledger_add.sql` + `db/schema.ts` `divergenceLedger` + `db/migrations.ts` `createDivergenceLedgerTable` | **(#202)** Forward-only `identity_core.divergence_ledger` table (discriminated `counter`/`pending`/`offset` rows; reference-only). |
| `test/identity-core/divergence/*.test.ts` + `test/integration/divergence/audit-divergence-injection.test.ts` + `audit-divergence-restart.test.ts` + `divergence-ledger.postgres.test.ts` | Unit + metric-contract + divergence-injection integration + **(#202)** restart-injection (state survives restart) + offset-gap replay + cold-start-not-green + Postgres-store + PHI-lint. |

### 10.4 Producers / consumers + modulith vs standalone

- **Consumes**: `AuthAuditPublisher` (M3, topic `curaos.audit.events`) + `IdentityCoreAuditPublisher`
  (Diamond, topic `curaos.core.audit.event.v1`). The checker does NOT subscribe to Kafka itself —
  driver-free shell ([[curaos-modulith-standalone-rule]]). The host wires the two consumers and
  calls `checker.record(fact)`.
- **Modulith mode**: `IdentityCoreModule` binds `AUTH_DIAMOND_DIVERGENCE_CHECKER` via
  `divergenceCheckerFactory` — when a DSN is set it backs the checker with a
  `PostgresDivergenceLedgerStore` and `rehydrate()`s on construction (#202); host overrides
  `onDivergence` at composition to wire the error-tracking + SLO alert.
- **Standalone mode**: two Kafka consumer callbacks feed the same checker class (proven by the
  standalone integration case).
- **Must not break**: `auth-audit-publisher.ts`, `audit-publisher.service.ts`,
  `audit-event.schema.ts`, `diamond-mode.ts` — the checker is read-only over their outputs.

### 10.5 Follow-up wiring (out of this submodule's owned paths)

- The OpenSLO YAML for `auth_diamond_divergence_count` lands at
  `ops/slo/identity-service/*.yaml` (parent-repo `ops/` tree) per [[curaos-slo-rule]] — a
  separate ops wiring task, not landed in this submodule PR.

### 10.6 Staging deploy + observe (the Phase D signal)

- Deploy + observe runbook: [`runbooks/staging-divergence-deploy.md`](runbooks/staging-divergence-deploy.md)
  — stand the checker up against LIVE staging dual-write telemetry so `#99 Phase D` clears on the
  real signal (no time/date term).
- CI cross-repo checkout token runbook: [`runbooks/ci-cross-repo-checkout-token.md`](runbooks/ci-cross-repo-checkout-token.md)
  — fixes `#201` (CI can't clone the private `curaos` parent with the repo-scoped default token); the
  workflow now uses `secrets.WORKSPACE_CHECKOUT_TOKEN`, which the user adds as an org secret (Contents:read).

### 10.7 Login-latency baseline (M9-S8 #105)

- Login-baseline runbook: [`runbooks/perf-login-baseline.md`](runbooks/perf-login-baseline.md)
  — k6 `constant-arrival-rate` 1000-logins/sec baseline (D6 Service Level Objective P95 < 250 ms,
  Keycloak-class). Cold pass is the HARD CI gate (`m9_login_latency_cold: p(95)<250`); warm + per-tenant
  burst are warning-only. Scenario at `ops/perf/identity-service/login-baseline.ts` (k6-free config in
  `login-baseline-config.ts`, unit-tested); one-command entry `just identity-login-baseline`.
- Research: [`research/2026-06-01-m9-s8-login-baseline-research.md`](research/2026-06-01-m9-s8-login-baseline-research.md)
  — CAR config, cold-vs-warm method (in-memory lockout/replay reality), tenant-resolution glossary
  correction, rolling-update compliance, version state of record (#99 closed 2026-05-31).
- REUSES `signDpopProof` + `calculateJwkThumbprint` from `scripts/m3-perf-baseline.js` by import (no
  ES256 reimplementation) — same pattern as `divergence-traffic.ts`. Forward-evolves the M3 seed; no
  `-v2`/`-next` fork (per [[curaos-rolling-update-rule]]).
- **Hard prerequisite ([#200](https://github.com/your-org/curaos-ai-workspace/issues/200), `priority=critical`):**
  the production Diamond publisher emits `changedFields` (names) only, never values (M7-D5
  reference-only envelope). The value-aware fail-closed checker therefore reads RED on every live
  Diamond event until #200 adds a reference-only `changeValues` field. **Phase D cannot clear on
  live traffic until #200 lands**, and #200 re-opens the binding M7-D5 PHI-boundary decision →
  needs explicit user authorization + an ADR (`grill-with-docs`) before implementation.

### 10.7 Durable divergence state (issue #202 — replaces the in-memory warm-up caveat)

The checker's gate-bearing state is now DURABLE; a NestJS restart/hot-reload no longer constructs
a fresh-green instance that forgot prior divergence (the #38 grill cycle-4 P1-4 finding).

- **Postgres-persisted ledger** (`identity_core.divergence_ledger`, reference-only, CNPG): backs
  cumulative divergence counters + last-known pending set, so a restart reloads prior cumulative
  state without a full stream replay.
- **Concurrency-safe MERGE persist (grill cycle-1 P0)**: `PostgresDivergenceLedgerStore.persist()`
  is NO LONGER a blanket `DELETE`-then-INSERT replace. During a rolling-deploy overlap two checker
  instances each load→mutate→persist; a blind replace let a STALE instance erase a committed
  divergence + advance a clean offset → counter under-count → false-green. The persist now runs a
  SERIALIZED, MONOTONIC merge in one transaction: (1) `pg_advisory_xact_lock(hashtext('identity_core
  :divergence_ledger'))` serializes all writers; (2) counters UPSERT with `GREATEST(existing,
  incoming)` so a count NEVER decreases except via explicit `reset()`; (3) the committed offset is
  read inside the lock — only an AUTHORITATIVE writer (offset >= committed) may PRUNE resolved
  pending or ADVANCE the offset; a STALE writer may only ADD pending (never erase) and never lowers
  the offset; (4) atomicity is REQUIRED — persist FAILS CLOSED when no transactional executor is
  available (grill P2). New partial unique indexes back the upserts: `divergence_ledger_pending_unique`
  (correlation_id where kind='pending') + `divergence_ledger_offset_singleton` (kind where
  kind='offset'); both added forward-only in the SAME `0002` migration ([[curaos-rolling-update-rule]]).
- **Kafka durable-offset re-derive**: the persisted `offset` row checkpoints the consumer cursor;
  the host resumes from it and re-derives the gap from the checkpoint to head. Offsets commit only
  AFTER the divergence state they produced is persisted (`recordDurable` persists the snapshot —
  incl. offset — before resolving), and only ever ADVANCE (monotonic merge, above).
- **Warm-up = SIGNAL, never a clock** ([[curaos-rolling-update-rule]]): a durable checker
  fail-closes (`awaitingReplay()===true`, `isGreen()===false`) until the host reaches stream head
  and calls `markReplayComplete()`. No soak/burn-in/date term — read the gate only once
  `awaitingReplay()` is false.
- **PHI boundary (M7-D5 + [[curaos-postgres-rule]], BINDING):** ledger is REFERENCE-ONLY — UUIDs,
  closed-enum operation type, opaque correlation ref, integer count, opaque offset cursor, and the
  pending `NormalizedAuditFact` jsonb whose `changes[].values` are RBAC role identifiers + canonical
  `membership:<uuid>#<role-code>` tokens + UUID refs ONLY. NO raw role/credential/PHI value column.
  `assertReferenceOnly()` guards every persist at runtime. A PHI-boundary review sign-off is
  required before the schema lands on a live deployment (#202 Acceptance).
- **Tightened PHI guard = POSITIVE grammar (grill cycle-1 P1):** `assertReferenceOnly()` no longer
  uses the permissive char-class `^[A-Za-z0-9._:#@-]+$` (which admitted email/DOB/SSN shapes). Each
  `changes[].values` entry is validated POSITIVELY against the closed grammar — RBAC role-code
  (closed `RBAC_ROLES` enum, reused from `src/rbac/rbac-types`) | UUID | `membership:<target>#<role>`
  (role-code closed-enum, target opaque-ref) | `<AllowlistedType>:<uuid|role-code>` (the same
  ActorMembership/PractitionerRole/Credential/Policy/Org allowlist as `audit-event.schema.ts`) — and
  an explicit PHI-shape gate rejects email-with-domain, `YYYY-MM-DD` DOB, and SSN digit-runs.
  `fact.correlationId` is now ALSO routed through the guard (it was persisted to the `correlation_id`
  column AND inside `pending_fact` without validation): it must be a UUID or an opaque reference
  token with no PHI shape. Tests cover email/DOB/SSN change-values + a PHI-bearing correlationId all
  throwing `DivergenceLedgerPhiBoundaryError`.
- **Do NOT touch the #38 diff logic** — durability is layered AROUND the checker
  (`snapshot`/`loadSnapshot`/`rehydrate`/`recordDurable`/`markReplayComplete`), the diff +
  fail-closed pairing from #38 is unchanged.

## Diamond producer contract

> Durable promotion of the session-7 forward-guard prose (HANDOVER.md is overwritten each
> session and does not survive a rollover; this heading does). Codified by the contract test
> [identity-service#73](https://github.com/your-org/identity-service/issues/73).
> See ADR-0212 §7.1 "Producer gap" for the Diamond envelope each producer must emit.

The audit-divergence checker pairs M3-path and Diamond-path audit facts on `(tenantId,
correlationId)` and exposes the keystone signal `auth-diamond-divergence == 0` the M9 Phase-D
gate reads (#195 / parent #99). The normalizer `src/identity-core/divergence/audit-normalizers.ts`
maps four logical operations via `M3_ACTION_TO_OPERATION`:

| Operation | M3 emitter | Diamond producer | Status |
|---|---|---|---|
| `login` | `UserLoggedIn` (`auth-audit-publisher.ts`) | `emitDiamondLoginAudit` (`src/auth/login-user.service.ts`) | SHIPPED (curaos-ai-workspace#232) |
| `role-grant` | `RoleAssigned` / `RoleRevoked` | `emitDiamondRoleGrantAudit` (`src/admin/admin.controller.ts`) | SHIPPED (curaos-ai-workspace#233) |
| `membership-change` | `MembershipAdded/Removed/Changed` — **named, NOT emitted (phantom)** | **does not exist** | PHANTOM — no M3 emitter, no Diamond leg |
| `credential-update` | `CredentialUpdated` / `PasswordChanged` — **named, NOT emitted (phantom)** | **does not exist** | PHANTOM — no M3 emitter, no Diamond leg |

**The binding rule.** Any new M3 op that enters `M3_ACTION_TO_OPERATION` — OR any phantom op
above that gains a real M3 emitter (a password-change endpoint, an invite-accept membership
emitter, a `CredentialUpdated` / `PasswordChanged` publish call) — **MUST ship its Diamond
producer in the SAME PR**. An M3 op without a Diamond counterpart emits facts that find no pair
→ `pendingCount() > 0` → `auth-diamond-divergence` permanently RED → the #99 Phase-D guarantee
breaks.

**The guard that enforces it.**
`test/identity-core/divergence/diamond-producer-coverage.test.ts` (in the identity-service
submodule)
reads the real `M3_ACTION_TO_OPERATION` (imported, never copied) and FAILS CI when a map value
is in neither the test's `KNOWN_DIAMOND_PRODUCERS` allowlist (updated each time a Diamond
producer ships) nor its `PHANTOM_NO_PRODUCER_YET` set (the two operations above, each commented
to point at #73). To clear the guard when you add an M3 emitter: ship the Diamond producer, then
move the op from `PHANTOM_NO_PRODUCER_YET` into `KNOWN_DIAMOND_PRODUCERS`.
