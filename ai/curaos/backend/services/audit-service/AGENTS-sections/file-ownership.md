# audit-service §3 - File Ownership

| Pattern | Owner | Edit policy |
|---------|-------|-------------|
| `*.gen.ts` | Codegen | DO NOT hand-edit |
| `src/chain/**/*.ts` | Hand | Hash-chain core - high caution; any change requires full chain integrity test suite |
| `src/ingestion/**/*.ts` | Hand | Kafka consumer; dedup; schema validation |
| `src/workflows/**/*.ts` | Hand | Temporal workflows |
| `src/fhir/**/*.ts` | Hand | HAPI FHIR reconciliation |
| `src/signing/**/*.ts` | Hand | OpenBao signing |
| `src/persistence/schema.ts` | Hand | Drizzle schema + drizzle-kit migrations |
| `src/**/*.spec.ts` | Mixed | Unit test stubs + hand-fill assertions |
