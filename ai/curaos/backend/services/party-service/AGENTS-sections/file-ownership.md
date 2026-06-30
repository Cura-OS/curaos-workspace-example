# party-service §3 - File Ownership

| Pattern | Owner | Edit policy |
|---------|-------|-------------|
| `*.gen.ts` | Codegen | DO NOT hand-edit |
| `proto/party.proto` | Hand | Coordinate changes with identity-service team; bump `@curaos/party-contracts` version |
| `src/persistence/pii-encryption.middleware.ts` | Hand | High caution: adds/removes encrypted fields here AND in schema |
| `src/workflows/**/*.ts` | Hand | Temporal saga |
| `src/providers/**/*.ts` | Hand | ADR-0154 provider implementations |
| `src/persistence/schema.ts` | Hand | Drizzle schema + drizzle-kit migrations for changes |
