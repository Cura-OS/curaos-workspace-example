# @curaos/tenancy — Agent Context

## Quick facts
- Tenant resolution priority: OIDC claim → subdomain → header
- TenantConfig cached in React context; invalidated on session change
- Used by `@curaos/auth-sdk` tokenInterceptor to inject `x-tenant-id`

## Key files
- `src/provider.tsx` — TenantProvider + useTenant
- `src/resolve.ts` — resolveTenant (Node/Edge)
- `src/headers.ts` — injectTenantHeader
- `src/types.ts` — TenantConfig

## Agent rules
- Never expose cross-tenant data; all queries scoped by tenantId.
- TenantConfig must not include PHI or secrets.
- Run `bunx turbo run build lint test` before marking done.
