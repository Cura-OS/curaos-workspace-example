# party-service §4 - ESLint Rules

```json
{
  "rules": {
    "@curaos/require-tenant-module": "error",
    "@curaos/no-raw-db-client": "error",
    "@curaos/no-raw-cache-manager": "warn",
    "@curaos/require-audit-decorator": "error",
    "@curaos/no-healthstack-imports": "error"
  }
}
```

- `@curaos/no-healthstack-imports`: flags any `import ... from '@healthstack/*'` or `'@curaos/fhir*'`. Fatal error - neutrality enforcement.
