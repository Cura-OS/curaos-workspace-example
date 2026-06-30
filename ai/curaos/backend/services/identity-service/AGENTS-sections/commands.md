# identity-service §5 - Commands (mirror of package.json scripts)

Every command below exists in `curaos/backend/services/identity-service/package.json`;
the check-agents-schema drift gate verifies this list against the checked-out submodule.

```bash
bun run dev                # tsx watch src/main.ts (local dev loop)
bun run start              # tsx src/main.ts
bun run test               # Bun unit tests (ignores test/browser/**; no containers)
bun run test:browser       # Playwright browser tests (test/browser/**)
bun run test:scripts       # staging-divergence-check k6-exit shell test
bun run lint               # oxlint
bun run typecheck          # tsc --noEmit
bun run build              # TypeScript compile (tsc)
bun run build:sdk          # build packages/auth-sdk
bun run backfill:diamond   # Diamond backfill CLI (pass --tenant <id> --batch-size 1000)
bun run ci                 # lint + typecheck + test + test:browser + test:scripts + build
```

## Planned commands (ADR-0120 intent; planned, do not import)

`test:integration` (Testcontainers), `test:e2e` (full login flows), and
`test:coverage` (auth/audit 100% gates) are not in package.json yet; do not
document them as runnable until they land.
