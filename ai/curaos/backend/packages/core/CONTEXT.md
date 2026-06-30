# @curaos/core — Agent Context

## Quick facts
- Zero external runtime deps; only TypeScript peer
- Consumed by every other `@curaos/*` lib and all frontend packages
- Do not add any framework-specific code (no React, no Node, no RN)

## Key files
- `src/tenant.ts` — TenantId branded type + tenant header injection helper (no React; React context/hook in `@curaos/tenancy`)
- `src/errors/` — CuraError hierarchy
- `src/id.ts` — createId() factory
- `src/event/envelope.ts` — EventEnvelope<T>
- `src/correlation.ts` — CorrelationId
- `src/result.ts` — Result<T, E> monad

## Agent rules
- Breaking change to any type exported here impacts all consuming packages; communicate in advance.
- No DOM or Node.js globals without `typeof window !== "undefined"` guards.
- Run `bunx turbo run build lint test` before marking done.
