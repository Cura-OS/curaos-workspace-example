# CONTEXT.md - healthstack-billing-service

## Role

HealthStack billing overlay for patient billing workflows: charges, invoices, copay estimates, eligibility checks, and payment capture.

## Runtime Shape

- Code: `curaos/backend/services/healthstack-billing-service/`
- Package: `@curaos/healthstack-billing-service`
- Contract: `specs/healthstack-billing.tsp`
- Generated image lock: `bun.lock`, checked by `bun run gen:service-lock-check`

## Guardrails

- PHI/PII remains inside the HealthStack overlay boundary.
- Reuse `@curaos/healthstack-consent` for clinical consent enforcement.
- Route and frontend write surfaces must stay aligned with API gateway mappings.
- Any generated scaffold issue folds back into `curaos/tools/codegen/`.
