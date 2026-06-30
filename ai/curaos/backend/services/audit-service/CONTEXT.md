# audit-service — Agent Context

**Service:** audit-service (HIPAA-Critical)
**Cluster:** ADR-0200 (Identity · Party · Org · Audit)
**Runtime:** NestJS + TypeScript 5.x (ADR-0100)
**Last updated:** 2026-05-24

---

## 1. Current State

**Status: Clean slate (NestJS scaffold not yet generated)**

- Prior Kotlin/Spring Boot stubs replaced. Generate via `backend.nestjs-service` codegen recipe (ADR-0153).
- All ADR decisions locked: three-tier storage, hash-chain algorithm, FHIR reconciliation modes, WORM policy, Merkle root signing.
- No production traffic yet; pre-v1 GA.

---

## 2. Active ADR References

| ADR | Relevance |
|-----|-----------|
| [ADR-0099](../../../docs/adr/0099-charter-priorities-vision.md) | Charter; audit as platform foundation |
| [ADR-0100](../../../docs/adr/0100-foundation-platform-runtime.md) | NestJS TypeScript 5.x runtime |
| [ADR-0151](../../../docs/adr/0151-cross-cluster-coherence.md) | F-004 (Critical): HAPI FHIR PHI audit reconciliation gap |
| [ADR-0152](../../../docs/adr/0152-minor-info-findings-resolutions.md) | F-018: audit hot/warm/cold tiers; Merkle summary; F-009: @curaos/audit-mcp MCP inventory |
| [ADR-0154](../../../docs/adr/0154-provider-abstraction-convention.md) | StorageProvider (SeaweedFS); ArchiveProvider pattern |
| [ADR-0155](../../../docs/adr/0155-tenant-routing-curaos-tenancy.md) | TenantModule mandatory; @SkipTenancy + CrossTenantAdminGuard for admin routes |
| [ADR-0157](../../../docs/adr/0157-hapi-fhir-phi-audit-reconciliation.md) | **Core spec**: 3 FHIR audit modes; CuraOSAuditEvent schema; @HealthstackAudit decorator; CI guards |
| [ADR-0162](../../../docs/adr/0162-hipaa-2026-compliance-roadmap.md) | WORM 6yr minimum; PG TDE; tamper-evident chain; v1/v1.5 milestones |
| [ADR-0200](../../../docs/adr/0200-cluster-identity-party-org-audit.md) | Cluster ADR; sole consumer of curaos.audit.events; within-cluster integration |

---

## 3. Integration Map

```
ALL CuraOS services
  ──Kafka──▶ curaos.audit.events ──▶ audit-service (sole consumer)

audit-service
  ──PG write──▶ tenant_<uuid>.audit_events (hot tier, 90d)
  ──ClickHouse write──▶ audit_{tenant_id}.audit_events (warm tier, 7yr)
  ──SeaweedFS write──▶ /audit/cold/{tenant_id}/*.parquet (cold tier, WORM, indefinite)
  ──Kafka──▶ curaos.audit.chain_broken (tamper alert)
  ──Kafka──▶ curaos.audit.fhir_mismatch (FHIR reconciliation alert)
  ──gRPC──▶ HAPI FHIR REST API (dual-reconciled + hapi-primary modes)
  ──gRPC──▶ notify-service (break-glass alert)
  ──OpenBao──▶ Merkle root signing (Ed25519 sign endpoint)
  ──Temporal──▶ AuditMerkleRootWorkflow, AuditRetentionWorkflow, AuditArchiveWorkflow, AuditFhirReconciliationWorkflow

audit-service (query API)
  ◀──JWT L1── compliance officer role (hot/warm queries)
  ◀──mTLS── CrossTenantAdminGuard (cross-tenant admin queries)
  ◀──MCP── AI agents via @curaos/audit-mcp (stdio/HTTP)
```

---

## 4. Key Decisions and Rationale

### D-001: Sole Kafka consumer for `curaos.audit.events`
- Architectural tamper resistance: no other service has write access to the audit schema.
- `@curaos/audit-sdk` `AuditInterceptor` abstracts Kafka publish; business services never touch audit DB.
- Consumer group `cg-audit-events` is dedicated; no competing consumers.

### D-002: Hash-chain over blockchain
- SHA-256 chain sufficient for single-operator tamper detection (insider threat, accidental deletion).
- No external dependency; fully air-gap safe.
- Broken chain detectable within one ingestion cycle (next event fails hash validation).
- Atomic PG transaction: `SELECT last_hash FOR UPDATE → INSERT event → COMMIT`; no race condition.
- Raw Drizzle `` sql`...` `` query required on this path — the typed query builder hides the `FOR UPDATE` locking semantics (Kysely/raw-SQL escape hatch per the ORM rule).

### D-003: Three-tier storage (PG → ClickHouse → SeaweedFS)
- PG: fast random access for recent queries; familiar to operators; schema-per-tenant isolation.
- ClickHouse: columnar compression (10:1 on structured events); MergeTree time-series partitioning; native Parquet export.
- SeaweedFS: S3-compatible object locking (GOVERNANCE/COMPLIANCE modes); self-hostable; no AWS lock-in.
- Migration: Temporal workflows drive tier transitions; data verified before PG pruning.

### D-004: Three HAPI FHIR reconciliation modes (ADR-0157)
- `single-source`: SMB/startup tenants; audit-service is sole authority; minimal overhead.
- `dual-reconciled`: enterprise tenants running HAPI FHIR alongside CuraOS; 15-minute reconciliation cycle; alerts on mismatch.
- `hapi-primary`: TEFCA QHIN participants where HAPI FHIR is legally authoritative; CuraOS mirrors and maintains parallel chain.
- Mode stored per tenant in `audit_fhir_mode` setting; changeable by tenant admin + platform admin.

### D-005: Ed25519 Merkle root signing via OpenBao
- Ed25519 (not RSA) for compact signatures (64 bytes vs 256+ bytes) and fast verification.
- OpenBao `transit` secrets engine handles key material; never exposed to audit-service process.
- Annual key rotation; prior keys retained in OpenBao for historical signature verification.

### D-006: `@SkipTenancy()` + `CrossTenantAdminGuard` for admin routes
- Admin routes (`/admin/audit/**`) are cross-tenant by definition (compliance officer reviews all tenants).
- `@SkipTenancy()` prevents TenantInterceptor from requiring a JWT `tenant_id` claim.
- `CrossTenantAdminGuard` requires platform-admin role + mTLS SVID.
- All cross-tenant admin queries are themselves audited (self-audit) via `AuditInterceptor` with `resource_type = "audit_query"`.

---

## 5. Implementation Notes for Agents

### Scaffolding order
1. `backend.nestjs-service` — NestJS scaffold.
2. `interceptor.nestjs-tenant-router` — TenantInterceptor.
3. `interceptor.nestjs-audit` — AuditInterceptor (audit-service itself is audited for query events).
4. `plugin.nestjs-sidecar` — ClickHouse client module + SeaweedFS S3 client module (`--sidecars clickhouse,seaweedfs-s3`).
5. `tests.vitest-nestjs` — Vitest scaffold.
6. Hand-write: Kafka consumer module (`src/ingestion/`).
7. Hand-write: Hash-chain module (`src/chain/`); raw Drizzle `sql\`...\`` queries; atomic transactions.
8. Hand-write: Temporal workflows (`src/workflows/`): AuditMerkleRoot, AuditRetention, AuditArchive, AuditFhirReconciliation.
9. Hand-write: HAPI FHIR reconciliation client (`src/fhir/`).
10. Hand-write: OpenBao signing client (`src/signing/`).

### Hash-chain critical path — do NOT use ORM
```typescript
// src/chain/hash-chain.service.ts
// Typed raw SQL: SELECT last_hash FOR UPDATE → compute → INSERT
async insertAuditEvent(event: CuraOSAuditEvent, db: TenantDb): Promise<void> {
  await db.transaction(async (tx) => {
    const last = await tx.execute(sql`
      SELECT hash_curr as hash, seq
      FROM audit_events
      WHERE tenant_id = ${event.tenant_id}
      ORDER BY seq DESC
      LIMIT 1
      FOR UPDATE
    `);
    const hash_prev = last[0]?.hash ?? GENESIS_HASH;
    const seq = (last[0]?.seq ?? 0) + 1;
    const hash_curr = computeHash(seq, event, hash_prev);
    await tx.execute(sql`
      INSERT INTO audit_events (seq, event_id, tenant_id, actor_id, action,
        resource_type, resource_id, outcome, timestamp, ip, user_agent,
        session_id, smart_scopes, payload_hash, hash_prev, hash_curr, created_at)
      VALUES (${seq}, ${event.event_id}, ${event.tenant_id}, ...)
    `);
  });
}
```
Do NOT use Drizzle's typed insert builder (`db.insert(auditEvents)`) on the hash-chain path — the `FOR UPDATE` row lock requires raw `` sql`...` `` so concurrent inserts cannot race on `seq`/`hash_prev`.

### Valkey key patterns (none for hot ingestion path)
- Dedup cache: `audit:dedup:{event_id}` → `"1"` (5-min TTL; primary dedup is PG `audit_dedup` table).
- FHIR reconciliation cache: `audit:fhir_mode:{tenant_id}` → mode string (10-min TTL).
- Merkle root cache: `audit:merkle:{tenant_id}:{hour}` → root hex (1-hr TTL).

### ClickHouse connection
- Package: `@clickhouse/client`.
- Per-tenant database: `audit_{tenant_id}` (created on first warm-tier migration for that tenant).
- Connection pool: single shared ClickHouse client (ClickHouse handles connection internally).
- Bulk insert: `client.insert({ table: 'audit_events', values: events, format: 'JSONEachRow' })`.
- No ORM for ClickHouse; raw SQL for all operations.

### SeaweedFS cold archive
- Package: `@aws-sdk/client-s3` (SeaweedFS is S3-compatible).
- Endpoint: `SEAWEEDFS_S3_ENDPOINT` env var.
- Bucket: `curaos-audit-cold`.
- Object path: `{tenant_id}/{year}/{month}/{start_seq}-{end_seq}.parquet`.
- Object lock: `PutObjectLegalHold` for legal holds; `PutObjectRetention` for standard GOVERNANCE lock.
- Cosign signing: `cosign sign-blob` CLI called from Temporal activity.

### Temporal workflows
- Queue: `audit-workflows`.
- `AuditMerkleRootWorkflow`: scheduled hourly via Temporal schedule; computes and signs Merkle root per tenant.
- `AuditRetentionWorkflow`: scheduled nightly; migrates 80-90d PG events to ClickHouse; prunes PG after verification.
- `AuditArchiveWorkflow`: triggered at 7yr warm mark or manual admin request; exports ClickHouse → Parquet → SeaweedFS.
- `AuditFhirReconciliationWorkflow`: runs every 15 min for `dual-reconciled` mode tenants; polls HAPI FHIR; writes reconciliation status.

### HIPAA CI guards (per ADR-0157 §CI-guards)
- ESLint `require-audit` rule: any `@Controller` method without `@AuditEvent()` = fatal lint error.
- Integration test: Kafka → PG insert within 5 seconds for every ingested event.
- 100% coverage gate on `src/chain/**` and `src/ingestion/**`.
- Startup validation: if `HAPI_FHIR_ENDPOINT` not set and tenant has `dual-reconciled` mode configured → warn (not fatal; single-source is fallback).

### Testing approach
- **Unit (Vitest):** mock Kafka consumer, mock the Drizzle DB layer (except the hash-chain raw-SQL path), mock ClickHouse, mock SeaweedFS.
- **Integration (Vitest + Testcontainers):** real PG (schema-per-test-tenant), real Valkey, ClickHouse container, localstack for SeaweedFS mock, real Kafka.
- **Hash-chain integrity test:** insert 100 events; verify full chain; tamper row 50; assert `verifyChain()` reports break at seq 51.
- **Dedup test:** publish same `event_id` twice; assert exactly one DB row.
- **FHIR reconciliation test (dual-reconciled):** produce event; mock HAPI FHIR response; assert `MATCHED` status.

---

## 6. Build Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | Scaffold + Kafka consumer + dedup + PG hash-chain insert |
| M2 | Hot-tier query API (filtered, paginated) |
| M3 | Break-glass event tracking + alert emission |
| M4 | FHIR reconciliation single-source-mode + FHIR AuditEvent façade |
| M5 | Warm-tier ClickHouse migration Temporal workflow |
| M6 | Merkle root computation + Ed25519 signing |
| M7 | Cold-tier SeaweedFS WORM archive + cosign manifest |
| M8 | FHIR dual-reconciled mode + hapi-primary mode |
| M9 | Legal hold API + COMPLIANCE mode object lock |
| M10 | `@curaos/audit-mcp` MCP server |
| M11 | `@HealthstackAudit()` decorator bridge (coordinated with HealthStack team) |
| M12 | HIPAA compliance gate: all NFR-003 controls verified; SOC 2 evidence ready |
