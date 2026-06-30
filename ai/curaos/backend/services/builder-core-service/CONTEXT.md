---
module: builder-core-service
layer: backend/services
milestone: M4
status: in_progress
---

# builder-core-service — Agent Context

## Stack

- NestJS 11 + Bun 1.3.
- Drizzle ORM (Postgres tenant schema).
- Payload v3 (collection definitions; full Next host integration deferred — Payload v3 package requires Next runtime).
- `@curaos/tenancy`, `@curaos/audit-sdk`, `@curaos/event-interceptors` via `file:` workspace deps in monorepo; Verdaccio service container in standalone CI (per D1 hybrid policy).

## Integration points

- Consumes `@curaos/auth-sdk` JWT for tenant context (downstream of M3).
- Emits audit events: `ServiceStarted`, `SurfaceCreated`, `SurfaceUpdated`, `SurfaceDeleted`, `SurfaceRendered`.
- Theme tokens stored as Payload Globals.

## CI

- `.github/workflows/ci.yml` minimal install + typecheck + test. Verdaccio service container TODO (filed alongside identity-service#23).

## Status

- M4-S1 NestJS shell shipped (PR #6, 2026-05-26).
- M4-S2..S7 pending.
