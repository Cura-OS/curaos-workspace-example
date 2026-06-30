# audit-service §1 - Baseline Rules (Mandatory - No Exceptions)

## Sole consumer rule
- audit-service is the ONLY service that may consume from `curaos.audit.events`.
- Do NOT add other consumers to this topic.
- Do NOT write directly to the audit DB from any other service.
- Consumer group: `cg-audit-events` - single group, no competing consumers.

## Hash-chain integrity (HIPAA §164.312(c))
- Hash-chain insert path (`src/chain/`) MUST use typed raw SQL with `FOR UPDATE` row lock.
- NEVER use generic ORM insert helpers on the hash-chain insert path.
- `SELECT last_hash FOR UPDATE → compute hash → INSERT` must be a single atomic PG transaction.
- GENESIS_HASH = 64 hex zeros; used as `hash_prev` for first event per tenant.
- Hash algorithm: `SHA-256(seq || tenant_id || actor_id || action || resource_id || timestamp || payload_hash || hash_prev)` - all fields serialized as UTF-8 strings, concatenated with `|` separator.
- Any hash mismatch on ingestion = tamper alert → emit `curaos.audit.chain_broken` + halt ingestion for that tenant.

## Tenancy (ADR-0155)
- `TenantModule.forRoot()` in AppModule - mandatory.
- All tenant-scoped DB access via tenant-scoped Drizzle connection/session helper; `SET search_path TO tenant_<uuid>`.
- Admin routes (`/admin/audit/**`) use `@SkipTenancy()` + `CrossTenantAdminGuard`. Self-audit these routes.
- ESLint rules: `require-tenant-module` (error), `no-raw-db-client` (error on non-chain paths), `no-raw-cache-manager` (warn).

## WORM and retention (ADR-0162)
- SeaweedFS cold tier: object lock GOVERNANCE mode minimum 6 years. NEVER upload without lock.
- Legal hold events: COMPLIANCE mode lock - set via `PutObjectLegalHold`; cannot be cleared until lifted_at date.
- Never add a route that deletes from `audit_events` table without legal hold verification.
- Nightly retention workflow prunes PG only AFTER verifying ClickHouse copy exists.

## Self-audit
- audit-service itself produces audit events for all query operations: `resource_type = "audit_query"`.
- AuditInterceptor registered globally. Do NOT `@SkipAudit()` on query endpoints.
- Break-glass events from audit-service MCP calls also audited.

## HIPAA CI guards (ADR-0157)
- Integration test: Kafka → PG insert within 5 seconds.
- 100% coverage on `src/chain/**` and `src/ingestion/**`.
- ESLint `require-audit` on all `@Controller` methods.
