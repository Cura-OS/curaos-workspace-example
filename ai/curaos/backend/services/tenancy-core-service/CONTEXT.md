# CONTEXT.md - tenancy-core-service

## Purpose

Neutral capability owning the tenant LIFECYCLE + per-tenant isolation METADATA
(no PHI/PII). tenancy-core is the canonical owner of which tenants exist; every
neutral capability + vertical overlay provisions/tears-down its per-tenant
resources off the lifecycle events emitted here. Domain overlay: `neutral`
([[curaos-triplet-split-rule]]: neutral only, no personal/business triplet -
tenancy has no divergent personal/business subject owner).

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG, DB-per-tenant) per `ai/rules/curaos_postgres_rule.md`
- Contract: TypeSpec -> OpenAPI 3.1 (`specs/tenancy.tsp`) + AsyncAPI 3
  (`specs/tenancy.asyncapi.yaml`) per ADR-0103 / ADR-0201 §2.9.

- Neutral capability: NO PHI/PII/financial rows persisted here - overlays own
  protected schemas; tenant subject data lives in the schemas the tenant
  provisions, never on this control-plane.

## Domain shape

- Real resource lives under `src/tenants/` (distinct from the codegen
  `src/tenancies/` Diamond-root probe controller, which keeps the mold-locked
  `auth-matrix.test.ts` health/protected/whoami surface green).
  - `tenants.controller.ts` - `@Controller('tenants')`, the REST surface.
  - `tenant.dto.ts` - Zod 4 strict schemas (slug = DNS-label; settings has a
    PHI-key scan; actor id is JWT-derived, never body-supplied).
  - `tenants.service.ts` - CRUD + the suspend/activate/delete state machine; every
    mutation + its domain-outbox enqueue run in ONE transaction (durable-iff-write).
  - `tenant-store.ts` - the persistence seam: `InMemoryTenantStore` (shell + unit
    tests + the replayable contract mock) and `PostgresTenantStore` (raw
    parameterized SQL against `tenancy_core.tenant`; bound at the composition root).
  - `tenant-domain-events.ts` - the 4 lifecycle event payloads + builder.
- Table `tenancy_core.tenant` (forward migration `0003_tenant_domain.sql` +
  matching `schema.ts` + `meta/0003_snapshot.json` - the 3-artifact alignment
  invariant). A live slug is unique (partial index on `deleted_at IS NULL`); a
  soft-deleted slug is reclaimable.

## Integration Points

- Primary consumer: admin-app (tenant CRUD pages + Playwright tenant-CRUD E2E need
  the live REST surface).
- Events produced (versioned, durable transactional outbox):
  - `curaos.core.tenancy.tenant.created.v1` - TenantCreated
  - `curaos.core.tenancy.tenant.updated.v1` - TenantUpdated (carries changed_fields)
  - `curaos.core.tenancy.tenant.suspended.v1` - TenantSuspended (suspend AND resume; status carries the result)
  - `curaos.core.tenancy.tenant.deleted.v1` - TenantDeleted (soft-delete)
- Events consumed: none (tenancy-core is a ROOT producer).
- REST: gateway base path `/api/v1/tenancy` (ADR-0103 §7 URL path versioning);
  local root `/tenants`.
- RBAC: identity-service JWT (`JWT_VERIFIER`). Writes `tenant-admin`; reads every
  authenticated role. tenancy-core is the platform control plane, so the
  principal's own `tenantId` is NOT a scope filter (a platform tenant-admin
  manages tenants across the control plane).

## Decisions

- The tenant IS the aggregate, so the partition/shard key on events is the
  tenant's own id (`tenant_id == tenant.id`); there is no separate owning tenant.
- The codegen 3-topic envelope (`tenancy-event-producer.ts`,
  `curaos.core.tenancy.{created,updated,deleted}.v1`) is the generic scaffold
  surface; the SERVICE catalog (`tenant-domain-events.ts`) is the real lifecycle
  set and ADDS the `suspended` leg the state machine needs.
- Soft-delete is terminal; a no-op state transition is rejected 400 so a lifecycle
  event never double-fires.

## References

- `ai/rules/curaos_agents_md_schema_rule.md` - AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` - 1:1 mirror
- `ai/rules/curaos_triplet_split_rule.md` - neutral-only justification
- `ai/curaos/docs/adr/` - relevant ADRs (ADR-0103 TypeSpec-first, ADR-0201 events,
  ADR-0210 Diamond model)
- `ai/curaos/backend/services/tenancy-core-service/Requirements.md` - full spec
