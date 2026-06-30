# CONTEXT.md — crm-core-service

## Purpose

Neutral CRM primitives: contact / account / deal pipeline + custom fields (#339, M11 W1). Native NestJS (no AGPL CRM import). Owned, reused by `personal-crm-service` + `business-crm-service` (GA wave 2, #325) + any future vertical. Domain overlay: `neutral`. CRM = source of truth; HubSpot/Salesforce sync is gated BYO outbound (Activepieces).
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`



- Neutral capability: NO PHI/PII/financial rows persisted here — overlays own protected schemas.

## Decisions (#339)

- **Domain model**: `crm_contact` / `crm_account` (party-anchored references, ADR-0210 — `party_id` + bounded non-PHI `display_name`, NO raw PII) / `crm_deal` (opportunity; `amount` integer minor units) / `crm_pipeline_stage` (CONFIGURABLE ordered stages per `(tenant, pipeline)`, no hardcode). All carry `custom_fields jsonb`. Schema-per-tenant `crm_core` (Citus shard key = tenant_id).
- **Deal pipeline state machine** lives in `CrmsService` (core-layer invariant): transitions validated against the configurable stage set; `is_won`/`is_lost` terminal stages set `status` won/lost. The Temporal `deal-pipeline` workflow (ADR-0204, `@temporalio/workflow`) binds at the modulith composition root for cross-service orchestration + SLA timers.
- **Durable domain events**: each mutation + its domain-outbox enqueue commit on ONE tx (`CrmStore.transaction` + `outbox.enqueueWith(tx.db,…)`), so the event is durable iff the write is; the post-commit relay ships it (at-least-once, consumer dedupes on `event_id`). Pattern copied from commerce-core (#338) — codegen mold fold-back filed as #360 (the mold ships `audit_outbox` only).
- **Store seam**: `CRM_STORE` token + `CrmsModule.register()` dynamic module — `InMemoryCrmStore` shell/test default, `PostgresCrmStore` (raw parameterized `sql` — same `crm_core` schema) at the composition root.
- **Tenant isolation**: tenant + actor + correlation derived from the JWT-verified principal (never body); `AuthGuard` rejects body/query tenant ≠ JWT tenant (403); store reads tenant-scoped (cross-tenant id reads as absent).

## Integration Points

- Consumed by `personal-crm-service` / `business-crm-service` (GA wave 2, #325); analytics + deal-scoring (ADR-0114); external sync via Activepieces.
- **Events produced** (root producer, `curaos.core.crm.*`): `contact.created/updated/deleted`, `account.created/updated/deleted`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost` (`specs/crm.asyncapi.yaml`).
- **Events consumed**: none at the core layer (party_id references resolved via party-service contract; no event subscription).
- **APIs**: REST gateway base `/api/v1/crm`; local routes under `/crms` (`specs/crm.tsp` → OpenAPI 3.1).


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/crm-core-service/Requirements.md` — full spec
