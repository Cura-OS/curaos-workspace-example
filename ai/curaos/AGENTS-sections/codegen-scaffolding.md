# curaos §3 - Codegen Scaffolding Instructions

When generating a new service from scratch:

1. Read the cluster ADR for the service (ADR-0200 through ADR-0209).
2. Read `ai/curaos/backend/services/<service-name>/Requirements.md` + `CONTEXT.md`.
3. Invoke Codegen Engine with recipe `backend.nestjs` + service spec.
4. Generated scaffold includes: `AppModule`, `TenantModule` registration, `AuditInterceptor` mount, `ProviderModule` setup, TypeSpec OpenAPI spec, Drizzle schema stub (or MikroORM for clinical aggregates), Kafka consumer/producer stubs, test scaffold (`bun test` per [[curaos-bun-primary-rule]]; codegen recipe `tests.vitest` only where vitest API features are required), Dockerfile multistage.
5. Add custom domain logic in non-`.gen.ts` files only.
6. Register AsyncAPI event schemas in Apicurio before first publish.

See [[curaos-speed-patterns-rule]] for generator-first culture context.
