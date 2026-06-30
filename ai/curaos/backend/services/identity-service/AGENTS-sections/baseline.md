# identity-service §1 - Baseline Rules (Mandatory)

## Tenancy (ADR-0155)
- `TenantModule.forRoot()` MUST be in `AppModule`. Never remove or bypass.
- ALL DB access via tenant-scoped Drizzle connection/session helper. NEVER import raw DB clients directly.
- ALL cache operations via `TenantCacheService`. NEVER import `CacheManager` directly.
- ALL Kafka producer/consumer via `TenantKafkaClientFactory`.
- `@SkipTenancy()` ONLY on: `/.well-known/*`, `/health`, `/metrics`, `/scim/v2/ServiceProviderConfig`, `/saml/idp/metadata`, `/admin/tenants` (combined with `CrossTenantAdminGuard`).
- Login resolves tenant from request body `tenantSlug`; registration resolves it from the `x-curaos-registration-token` header - NOT from JWT (no JWT yet at that point) and NOT from the `Host` header. The `Host` header is consumed only to build the DPoP `htu` (origin binding), never for tenant resolution.

## Audit (ADR-0157)
- `AuditInterceptor` from `@curaos/audit-sdk` registered globally in `AppModule`. Never remove.
- Every `@Controller` method that mutates state or reads regulated data MUST have `@AuditEvent()` decorator.
- `AuditInterceptor` produces `curaos.audit.events` Kafka events AND hash-chained PG inserts. Both paths must be live.
- Break-glass events: synchronous publish before action proceeds. If Kafka unavailable → deny action.
- SMART token exchanges: `smart_scopes` field in `CuraOSAuditEvent` must be populated.

## Token Architecture (ADR-0156)
- JWT Layer 1: ES256, DPoP-bound (RFC 9449), 15-min absolute TTL. No sliding expiry.
- Opaque Layer 2: 64-char base64url; Valkey key `opaque:sha256(token)`; 5-min TTL; delete on first successful introspection.
- mTLS Layer 3: SPIRE SVID; do not implement manual certificate management.
- `exp - iat` for JWT MUST NOT exceed 900 seconds. CI test verifies this.
- SMS OTP: PROHIBITED. Any code path that would issue an SMS token is a bug. Remove it.

## Authorization Chain (ADR-0120)
- Auth order: OPA-WASM fast deny → Cerbos ABAC → OpenFGA ReBAC. First deny wins.
- OPA-WASM runs in-process (never as sidecar process). Do not move it.
- Cerbos: gRPC client on `localhost:3593`. Policy files in `policies/` committed to repo.
- OpenFGA: REST client on `localhost:8080`. Tuple writes on every role grant/revoke event.

## HIPAA Guards (ADR-0162)
- `mfa_policy.allowed_methods` validation at startup: presence of `sms` → fatal startup error.
- MFA enforcement: FIDO2 primary, TOTP fallback, nothing else.
- Session TTL enforcement: JWT TTL hard-coded 900s; opaque step-up 300s; break-glass 1800s.
- PG TDE: identity schema must be in TDE-enabled tablespace. Do not store identity data in plain `public`.

## Provider Abstraction (ADR-0154)
- Use injection tokens: `EMAIL_PROVIDER`, `SECRETS_PROVIDER`, `STORAGE_PROVIDER`.
- Provider implementations in `src/providers/`. Never instantiate providers directly; use DI.
- Zod schema validation on all provider configs at `ProviderRegistry.register()` time.
