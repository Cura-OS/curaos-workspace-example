# @curaos/secrets — Agent Context

## Quick facts
- Server/BFF only; browser import throws deliberately
- Wraps secrets-service REST API; in-memory cache with TTL
- Rotation notification via webhook → cache invalidation

## Key files
- `src/client.ts` — SecretsClient + createSecretsClient
- `src/cache.ts` — in-memory cache with TTL
- `src/rotation.ts` — rotation notification listener
- `src/browser-guard.ts` — throws on browser import

## Agent rules
- Never log secret values; log key names only.
- Never ship secret values in response bodies or error messages.
- Browser guard must be enforced at runtime, not just type level.
- Run `bunx turbo run build lint test` before marking done.
