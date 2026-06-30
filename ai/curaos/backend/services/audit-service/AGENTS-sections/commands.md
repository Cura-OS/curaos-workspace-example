# audit-service §5 - Test Commands

```bash
bun run test               # Vitest unit (no containers)
bun run test:integration   # Vitest integration (Testcontainers: PG + Valkey + Kafka + ClickHouse + localstack)
bun run test:chain         # Hash-chain integrity suite (100 events, tamper at seq 50, verify break detection)
bun run test:coverage      # Coverage; src/chain/** + src/ingestion/** gate at 100%
bun run lint               # ESLint
bun run build              # TypeScript compile
bun run db:migrate         # drizzle-kit migrations (bunx drizzle-kit migrate)
```
