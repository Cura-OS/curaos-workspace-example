# audit-service §4 - ESLint Rules

```json
{
  "rules": {
    "@curaos/require-tenant-module": "error",
    "@curaos/no-raw-db-client": "error",
    "@curaos/no-raw-cache-manager": "warn",
    "@curaos/require-audit-decorator": "error",
    "@curaos/no-audit-delete": "error"
  }
}
```

- `@curaos/no-audit-delete`: flags any ORM delete helper or raw `DELETE FROM audit_events` that isn't in the legal-hold-verified retention workflow. Fatal error.
- `@curaos/no-raw-db-client`: exception granted for `src/chain/` (annotated with `// eslint-disable-next-line @curaos/no-raw-db-client -- hash-chain requires FOR UPDATE`).
