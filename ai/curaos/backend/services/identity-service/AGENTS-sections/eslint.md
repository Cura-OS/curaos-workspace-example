# identity-service §4 - ESLint Rules (from `@curaos/eslint-config`)

```json
{
  "rules": {
    "@curaos/require-tenant-module": "error",
    "@curaos/no-raw-db-client": "error",
    "@curaos/no-raw-cache-manager": "warn",
    "@curaos/require-audit-decorator": "error",
    "@curaos/no-sms-otp": "error"
  }
}
```

- `@curaos/no-sms-otp`: flags any string literal `"sms"` used as an MFA method value. Fatal lint error.
- `@curaos/require-audit-decorator`: flags `@Controller` methods without `@AuditEvent()`. Fatal lint error.
- Run `bun run lint` (maps to `eslint src/`) before every commit.
