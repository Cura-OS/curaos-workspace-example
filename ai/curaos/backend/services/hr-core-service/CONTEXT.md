# CONTEXT.md — hr-core-service

## Purpose

Neutral HR core (M11, #340): employee directory + compensation + leave + time
tracking. Extends identity + party + org — does NOT duplicate person/org records
(`party_id` / `org_unit_id` references only). Owned, reused by `personal-hr-service`
+ `business-hr-service` overlays (deferred to GA wave 2, #325). Domain overlay: `neutral`.

## Domain model (`hr_core` schema, src/db/hr-schema.ts)

- **employees** — `party_id` (FK→party), `org_unit_id` (FK→org), employment_type
  (full_time|part_time|contractor|intern), employment_status (active|on_leave|
  terminated), job_title/code, manager_party_id, start/end_date. UNIQUE
  `(tenant_id, party_id)`. Soft-delete.
- **compensations** — effective-dated; `base_salary` (bigint cents), currency,
  pay_frequency, `allowances` (jsonb), `equity_units`. SENSITIVE PII — ABAC-gated.
- **leave_requests** — type, start/end, status (pending|approved|rejected|cancelled),
  `approved_by_party_id` (JWT-derived), balance_before/after (updated in the SAME tx
  as the status change — no eventual consistency for balance).
- **time_entries** — `minutes` (int), project_id (→business-projects, no FK).

The codegen placeholder `hr` table is kept untouched (forward-only); domain tables
were added via additive migration `0002_hr_domain.sql`.

## ABAC compensation gate (SECURITY-sensitive — src/auth/comp-field.policy.ts)

`base_salary`/`allowances`/`equity_units` restricted to the HR-manager privilege via
the injectable `COMP_FIELD_POLICY` seam. In-process default maps `tenant-admin` →
HR-manager (the platform role enum has no dedicated `hr-manager` role — owned by
identity-service, FORESIGHT'd). The modulith composition root can bind a real
`@cerbos/grpc` adapter. Non-HR-manager READ → amounts redacted to null; WRITE → 403.
Comp amounts NEVER appear in a domain event.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`



- Neutral capability: NO PHI/PII/financial rows persisted here — overlays own protected schemas.

## Integration Points

- Root event PRODUCER (no upstream contract dependency). Domain events
  (AsyncAPI `specs/hr.asyncapi.yaml`), snake_case on the wire:
  `curaos.core.hr.employee.{hired,updated,terminated}.v1`,
  `curaos.core.hr.compensation.recorded.v1` (NO amounts in payload),
  `curaos.core.hr.leave.{requested,approved,rejected,cancelled}.v1` (consumed by the
  external Temporal leave workflow), `curaos.core.hr.time_entry.recorded.v1`.
- Events committed atomically with the business write through the durable
  `AuditOutboxService` (`auditLeg='hr-domain'`) when the store is tx-capable
  (Postgres); best-effort non-tx in the in-memory/standalone shell.
- Audit: reference-only envelopes on `curaos.core.audit.event.v1` (D5) for every
  mutation; comp changes record `changedFields` names only, never values.
- REST (TypeSpec `specs/hr.tsp` → OpenAPI 3.1): local `/hr`, gateway `/api/v1/hr`.
- Consumed by `personal-hr-service` / `business-hr-service` (GA wave 2) +
  HealthStack credentialing (M12) — NO PHI in hr events.

## Open Questions

- Dedicated `hr-manager` platform role (identity-service scope) — currently
  `tenant-admin` is mapped to the HR-manager privilege. FORESIGHT'd.
- Live `@cerbos/grpc` policy adapter + Temporal/BullMQ runtime wiring land at the
  modulith composition root (seams are in place).


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/hr-core-service/Requirements.md` — full spec
