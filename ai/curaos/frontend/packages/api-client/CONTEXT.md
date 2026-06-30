# api_client — Agent Context

## Quick facts
- **Output:** `@curaos/api-client` npm package (ESM + CJS)
- **Generator:** orval (preferred over openapi-typescript-codegen)
- **Auth:** `@curaos/auth-sdk` ky interceptor injected at client factory level
- **Tests:** MSW 2.x for mock handlers; Vitest for unit

## Architecture notes
- `src/generated/<service>/` — one sub-dir per backend service; never edit manually.
- `src/lib/client.ts` — shared ky instance factory; injects auth token and `x-tenant-id` header.
- `src/lib/errors.ts` — normalizes API error envelope to typed `ApiError`.
- `src/lib/pagination.ts` — cursor/page pagination helpers.
- `src/msw/` — MSW handler exports for test consumers.
- `orval.config.ts` — one config entry per service spec.
- `specs/` — versioned OpenAPI 3.1 JSON; updated by CI pipeline from backend builds.

## Agent rules
- Never hand-write endpoint functions; always regenerate from spec.
- If a spec is missing, file a task against the owning service team — do not stub manually.
- Hand-written code goes in `src/lib/` only; never in `src/generated/`.
- `src/generated/` is generated output; treat as read-only in PRs.
- Run `turbo run generate lint test` before marking done.
