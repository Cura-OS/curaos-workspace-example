# audit-service §2 - Codegen Commands (ADR-0153)

```bash
# 1. NestJS scaffold
curaos codegen backend.nestjs-service \
  --name audit-service \
  --namespace audit

# 2. Tenant routing
curaos codegen interceptor.nestjs-tenant-router \
  --service audit-service

# 3. Audit interceptor (audit-service self-audits its own queries)
curaos codegen interceptor.nestjs-audit \
  --service audit-service

# 4. ClickHouse + SeaweedFS client modules
curaos codegen plugin.nestjs-sidecar \
  --service audit-service \
  --sidecars clickhouse,seaweedfs-s3

# 5. Vitest scaffold
curaos codegen tests.vitest-nestjs \
  --service audit-service
```

Hand-write after codegen:
- `src/ingestion/` - Kafka consumer module; dedup logic; schema validation.
- `src/chain/` - hash-chain service; raw PG queries; chain verifier.
- `src/workflows/` - Temporal: AuditMerkleRoot, AuditRetention, AuditArchive, AuditFhirReconciliation.
- `src/fhir/` - HAPI FHIR reconciliation client (dual-reconciled + hapi-primary).
- `src/signing/` - OpenBao Ed25519 signing client for Merkle roots.
- `src/mcp/` - `@curaos/audit-mcp` MCP server.
