# identity-service §6 - Dependencies (mirror of package.json)

Current packages in `curaos/backend/services/identity-service/package.json`;
the check-agents-schema drift gate verifies every non-planned row.

| Package | Purpose | Source type |
|---------|---------|-------------|
| `@curaos/audit-sdk` | AuditInterceptor + event schema | Local (@curaos monorepo) |
| `@curaos/event-interceptors` | Event interceptor base | Local |
| `@curaos/providers` | ProviderRegistry base | Local |
| `@curaos/tenancy` | Tenant routing module | Local |
| `@nestjs/common` + `@nestjs/core` + `@nestjs/platform-express` | NestJS 11 runtime | 3rd-party |
| `@node-rs/argon2` | Password hashing (argon2id; replaced `argon2`) | 3rd-party |
| `@simplewebauthn/server` | WebAuthn/FIDO2 | 3rd-party |
| `@valkey/valkey-glide` | Valkey cache client | 3rd-party |
| `drizzle-orm` + `postgres` | DB access (Drizzle over postgres.js) | 3rd-party |
| `jose` | JWT/JWK operations | 3rd-party |
| `zod` | Validation (Zod 4) | 3rd-party |
| `reflect-metadata` + `rxjs` + `yaml` | NestJS/runtime support | 3rd-party |

## Planned dependencies (ADR-0120 + ADR-0150 intent; planned, do not import)

Not in package.json yet. Do not import; land each via its ADR-gated story first.

| Package | Purpose |
|---------|---------|
| `better-auth` | Core auth framework |
| `node-oidc-provider` | OIDC IdP |
| `node-saml` + `samlify` | SAML 2.0 core + IdP/SP |
| `scim-patch` | SCIM 2.0 PATCH |
| `@open-policy-agent/opa-wasm` | OPA in-process WASM |
| `@cerbos/grpc` | Cerbos gRPC client |
| `@openfga/sdk` | OpenFGA REST client |
| `hibp` | HaveIBeenPwned k-anon (circuit breaker required) |
| `@temporalio/client` + `@temporalio/worker` | Temporal sagas |
| `@curaos/auth-mcp` | MCP server (published separately) |
| `@curaos/smart-on-fhir` | SMART App Launch 2.0 (fork of zedwerks) |
