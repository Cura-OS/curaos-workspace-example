# org-service §3 - File Ownership

| Pattern | Owner | Edit policy |
|---------|-------|-------------|
| `*.gen.ts` | Codegen | DO NOT hand-edit |
| `proto/org.proto` | Hand | Coordinate with identity-service; bump `@curaos/org-contracts` |
| `src/persistence/ltree.repository.ts` | Hand | High caution: ltree raw queries |
| `src/org-units/org-unit.service.ts` | Hand | moveOrgUnit atomic operation |
| `src/workflows/**/*.ts` | Hand | Temporal sagas |
| `src/providers/**/*.ts` | Hand | ADR-0154 provider implementations |
| `src/persistence/schema.ts` | Hand | Drizzle schema + drizzle-kit migration; include `CREATE EXTENSION ltree` in migration |
