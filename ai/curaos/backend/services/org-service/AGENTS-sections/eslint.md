# org-service §4 - ESLint Rules

```json
{
  "rules": {
    "@curaos/require-tenant-module": "error",
    "@curaos/no-raw-db-client": "error",
    "@curaos/no-raw-cache-manager": "warn",
    "@curaos/require-audit-decorator": "error",
    "@curaos/no-healthstack-imports": "error",
    "@curaos/no-openfga-direct-call": "error"
  }
}
```

- `@curaos/no-openfga-direct-call`: flags any import of `@openfga/sdk` or `@cerbos/*` in org-service. OpenFGA/Cerbos are identity-service concerns only.
- `@curaos/no-raw-db-client`: exception for `src/persistence/ltree.repository.ts` (annotated with disable comment).
