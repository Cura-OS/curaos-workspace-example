# org-service §6 - Key Dependencies

| Package | Purpose | Source type |
|---------|---------|-------------|
| `@grpc/grpc-js` | gRPC server | 3rd-party |
| `@nestjs/microservices` | NestJS gRPC | 3rd-party |
| `@temporalio/client` | Temporal client | 3rd-party |
| `@temporalio/worker` | Temporal worker | 3rd-party |
| `@curaos/tenancy` | Tenant routing | Local |
| `@curaos/audit-sdk` | AuditInterceptor | Local |
| `@curaos/providers` | ProviderRegistry | Local |
| `@curaos/org-contracts` | Shared proto types | Local |
