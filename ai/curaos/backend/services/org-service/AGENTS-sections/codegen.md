# org-service §2 - Codegen Commands (ADR-0153)

```bash
# 1. NestJS scaffold
curaos codegen backend.nestjs-service \
  --name org-service \
  --namespace org

# 2. Tenant routing
curaos codegen interceptor.nestjs-tenant-router \
  --service org-service

# 3. Audit interceptor
curaos codegen interceptor.nestjs-audit \
  --service org-service

# 4. Vitest scaffold
curaos codegen tests.vitest-nestjs \
  --service org-service
```

Hand-write after codegen:
- `proto/org.proto` - gRPC service definition.
- `src/persistence/ltree.repository.ts` - ltree path helpers; raw query wrappers.
- `src/org-units/org-unit.service.ts` - moveOrgUnit atomic path recalculation.
- `src/workflows/org-restructure.workflow.ts` - Temporal org merge/split saga.
- `src/providers/` - OrgChartExportProvider implementations.
