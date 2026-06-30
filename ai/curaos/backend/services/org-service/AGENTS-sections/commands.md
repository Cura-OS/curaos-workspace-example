# org-service §5 - Test Commands

```bash
bun run test               # Vitest unit
bun run test:integration   # Testcontainers: PG (with ltree extension) + Valkey + Kafka
bun run test:ltree         # ltree-specific: 100-node tree, subtree, move, depth validation
bun run test:coverage      # Coverage
bun run lint               # ESLint
bun run build              # TypeScript compile
bun run db:migrate           # drizzle-kit migrations (includes CREATE EXTENSION ltree)
bun run proto:generate     # Generate gRPC from proto/org.proto
```
