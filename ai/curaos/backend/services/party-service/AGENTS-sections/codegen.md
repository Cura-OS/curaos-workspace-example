# party-service §2 - Codegen Instructions (ADR-0153)

```bash
# 1. NestJS scaffold
curaos codegen backend.nestjs-service \
  --name party-service \
  --namespace party

# 2. Tenant routing
curaos codegen interceptor.nestjs-tenant-router \
  --service party-service

# 3. Audit interceptor
curaos codegen interceptor.nestjs-audit \
  --service party-service

# 4. Vitest scaffold
curaos codegen tests.vitest-nestjs \
  --service party-service
```

Hand-write after codegen:
- `proto/party.proto` - gRPC service definition; generate NestJS gRPC controllers via `@nestjs/microservices`.
- `src/persistence/pii-encryption.middleware.ts` - persistence middleware; encrypt on write, decrypt on read.
- `src/resolvers/smart-user.resolver.ts` - `ResolveSmartUser` with Valkey cache.
- `src/workflows/party-merge.workflow.ts` - Temporal party merge saga.
- `src/providers/` - AddressValidation + PhoneValidation provider implementations.
