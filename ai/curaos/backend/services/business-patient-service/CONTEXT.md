# CONTEXT.md — business-patient-service

## Purpose

Org/enterprise patient overlay (patient demographics neutral primitives). Extends `@curaos/patient-core-service` with multi-user / tenant + org-scoped workflows. Domain overlay: `healthstack`.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14
- Extends: `@curaos/patient-core-service`
- Context isolation: `src/business-context.ts`
- ORM: Drizzle (primary)
- Validation: Zod 4
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).




## Integration Points

- Depends on `patient-core-service` (events + DTOs + primitives)
- Surfaces business-scope endpoints on REST `/api/v1/business/patient`

**Events produced:** `business.patient.enrolled`, `business.patient.discharged`, `business.patient.updated`

**Events consumed:** `patient.core.created` (bootstrap org patient record), `identity.tenant.provisioned` (init tenant patient namespace)

## Open Questions

- Tenant isolation strategy: schema-per-tenant (ADR-0101 default) — org-unit isolation via `business-context.ts` row filter.
- Org-unit propagation: org-id claim from JWT (set by identity-service); propagated as request-scope via `business-context.ts`.


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/backend/services/patient-core-service/CONTEXT.md` — core layer
- `ai/curaos/backend/services/business-patient-service/Requirements.md` — full spec
