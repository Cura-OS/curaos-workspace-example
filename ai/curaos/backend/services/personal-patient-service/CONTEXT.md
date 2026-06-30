# CONTEXT.md — personal-patient-service

## Purpose

Individual-context patient overlay (patient demographics neutral primitives). Extends `@curaos/patient-core-service` with single-user / single-household workflows. Domain overlay: `healthstack`.

## Stack

- Runtime: NestJS 11 on Bun 1.3.14
- Extends: `@curaos/patient-core-service`
- Context isolation: `src/personal-context.ts`
- ORM: Drizzle (primary)
- Validation: Zod 4
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).

## Integration Points

- Depends on `patient-core-service` (events + DTOs + primitives)
- Surfaces personal-scope endpoints on REST `/api/v1/personal/patient`

### Events consumed
- `curaos.core.patient.registered.v1` — from patient-core-service; triggers personal overlay record creation
- `curaos.core.patient.updated.v1` — from patient-core-service; propagates neutral field updates
- `curaos.core.patient.deactivated.v1` — from patient-core-service; deactivates personal overlay record

### Events produced
- `personal.patient.preferences.updated` — personal settings/preferences change (consumed by personal dashboard)

## Open Questions

- OQ-1 (2026-05-24): confirm personal-context propagation pattern — request-scoped middleware vs JWT-claim extraction
- OQ-2 (2026-05-24): confirm offline/sync requirements — does personal overlay need client-side sync capability
- OQ-3 (2026-05-24): confirm patient-consent boundary with HIPAA reviewer before production cutover

## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/backend/services/patient-core-service/CONTEXT.md` — core layer
- `ai/curaos/backend/services/personal-patient-service/Requirements.md` — full spec
