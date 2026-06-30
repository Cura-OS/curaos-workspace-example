# @curaos/policy — Agent Context

## Quick facts
- Wraps policy-service REST API; OPA/ABAC evaluation is server-side only
- Client caches decisions (TTL 60s default)
- Deny-by-default: allowed=false until response received

## Key files
- `src/client.ts` — createPolicyClient
- `src/hooks/useCan.ts` — React hook
- `src/hooks/useRoleGuard.ts` — React hook
- `src/components/PolicyGate.tsx` — React component
- `src/server.ts` — checkPolicy (Node.js/RSC)
- `src/cache.ts` — decision cache

## Agent rules
- Never evaluate policy rules client-side; always delegate to policy-service.
- Cache invalidation: flush all decisions on logout or role change event.
- Run `bunx turbo run build lint test` before marking done.
