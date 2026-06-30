# audit-service §6 - Key Dependencies

| Package | Purpose | Source type |
|---------|---------|-------------|
| `kafkajs` | Kafka consumer | 3rd-party |
| `@clickhouse/client` | ClickHouse warm tier | 3rd-party |
| `@aws-sdk/client-s3` | SeaweedFS S3 cold tier | 3rd-party (S3-compatible endpoint) |
| `@temporalio/client` | Temporal workflow client | 3rd-party |
| `@temporalio/worker` | Temporal workflow worker | 3rd-party |
| `@curaos/tenancy` | Tenant routing | Local |
| `@curaos/audit-sdk` | AuditInterceptor (self-audit) | Local |
| `@curaos/providers` | ProviderRegistry | Local |
| `@curaos/audit-mcp` | MCP server | Local |
