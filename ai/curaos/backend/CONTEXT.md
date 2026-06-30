# CONTEXT — CuraOS Backend

**Last updated:** 2026-05-25

Backend docs cover `curaos/backend/services/*` and `curaos/backend/packages/*`.

## Locked Rules

- Runtime: Bun primary; Node 22 LTS fallback only when Bun cannot.
- Framework: NestJS 11 + Fastify adapter for foundation and neutral services.
- Package manager: Bun workspaces; Turborepo task runner; Nx generators.
- ORM: Drizzle default; MikroORM for HealthStack clinical aggregates; Kysely for analytics/escape hatches.
- Validation: Zod 4 default; Valibot RN escape; ArkType hot-path escape.

## Integration Map

- Services publish durable events through Kafka/NATS and register AsyncAPI schemas.
- Services must mount `TenantModule`, `AuditInterceptor`, OpenTelemetry, and provider abstractions.
- Packages under `backend/packages` provide shared contracts and helpers; services depend on packages, not sibling service internals.

## Agent Notes

Read workspace `AGENTS.md`, `ai/rules/README.md`, relevant rules, then `ai/curaos/docs/adr/RESOLUTION-MAP.md` before changing backend docs or code.
