# identity-service §3 - File Ownership

| Pattern | Owner | Edit policy |
|---------|-------|-------------|
| `*.gen.ts` | Codegen | DO NOT hand-edit. Run recipe to regenerate. |
| `src/workflows/*.ts` | Hand | Temporal workflow definitions |
| `src/activities/*.ts` | Hand | Temporal activity implementations |
| `src/authz/**/*.ts` | Hand | OPA/Cerbos/OpenFGA clients |
| `src/providers/**/*.ts` | Hand | Provider implementations per ADR-0154 |
| `src/persistence/schema.ts` | Hand | Run drizzle-kit migration generation after changes |
| `policies/**/*.yaml` | Hand | Cerbos ABAC policies; committed to repo |
| `bundles/**/*.rego` | Hand | OPA Rego modules; compiled to WASM on build |
| `src/**/*.spec.ts` | Mixed | Unit tests; some generated stubs, hand-fill assertions |
