# org-service §1 - Baseline Rules (Mandatory)

## Neutrality rule (ADR-0099)
- org-service MUST NOT import any `@healthstack/*`, `@erp/*`, or domain-vertical package.
- No FHIR types in org-service. FHIR Organization is created by healthstack-fhir-service consuming `curaos.org.unit.created`.
- Org unit metadata (`jsonb`) is domain-opaque; org-service does not interpret its contents.

## ltree rules
- ALL subtree queries, path computation, and org unit move operations use typed raw SQL through the ltree repository helper. Do NOT use generic ORM helpers for ltree column operations.
- Path recalculation on `moveOrgUnit` MUST be atomic (single transaction) - update moved node + ALL descendants.
- Path uniqueness: enforce `UNIQUE(parent_id, slug)` at DB level; application generates slug via `lower(replace(name, ' ', '_'))`.
- Max depth: validate `nlevel(path) <= max_depth` (default 10) before creating child org unit.

## Tenancy (ADR-0155)
- `TenantModule.forRoot()` in AppModule - mandatory.
- Tenant-scoped Drizzle connection/session helper for all non-ltree operations.
- `TenantCacheService` for org tree cache.
- `@SkipTenancy()` only on `/health`, `/metrics`.
- ESLint: `require-tenant-module` (error), `no-raw-db-client` (error on non-ltree paths), `no-raw-cache-manager` (warn).

## Audit (ADR-0200 convention; CuraOSAuditEvent schema ADR-0157)
- `AuditInterceptor` globally registered.
- All org unit mutations and membership changes produce `curaos.audit.events`.
- GDPR membership removal: `action = "org.membership.removed"`.

## GDPR (ADR-0162)
- `RemoveUserMemberships`: soft-remove ONLY (set `valid_until = now()`). Never hard-delete membership rows.
- Emit `curaos.org.membership.removed` Kafka event AFTER successful soft-removal.
- Tombstone: `org_memberships` row retained with `valid_until` set (provides history of who was where).

## OpenFGA event contract
- Do NOT call OpenFGA directly.
- Emit `curaos.org.membership.granted` on membership add.
- Emit `curaos.org.membership.revoked` on membership remove.
- identity-service OpenFGA event handler writes/deletes tuples.
