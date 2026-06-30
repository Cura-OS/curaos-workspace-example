# party-service §5 - Test Commands

```bash
bun run test               # Vitest unit
bun run test:integration   # Vitest + Testcontainers (PG + Valkey + Kafka)
bun run test:coverage      # Coverage
bun run lint               # ESLint
bun run build              # TypeScript compile
bun run db:migrate         # drizzle-kit migrations
bun run proto:generate     # Generate NestJS gRPC code from proto/party.proto
```
