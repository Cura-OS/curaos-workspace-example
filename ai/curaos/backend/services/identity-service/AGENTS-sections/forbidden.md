# identity-service §9 - Forbidden Actions

- Do NOT import raw DB clients directly anywhere in `src/`.
- Do NOT issue SMS OTP. Not via Twilio, not via any provider.
- Do NOT extend JWT TTL beyond 900 seconds.
- Do NOT disable `AuditInterceptor` or `TenantInterceptor` globally.
- Do NOT commit secrets (TOTP encryption keys, OpenBao tokens, ECDSA private keys) to repo.
- Do NOT use `@SkipTenancy()` on any endpoint that handles user data without also adding `CrossTenantAdminGuard`.
- Do NOT modify `*.gen.ts` files by hand; regenerate instead.
- Do NOT push to `main` without CI green (lint + unit + integration + audit coverage gate).
