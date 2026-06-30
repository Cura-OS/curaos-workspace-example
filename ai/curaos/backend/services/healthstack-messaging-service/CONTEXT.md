# CONTEXT.md - healthstack-messaging-service

## Role

HealthStack secure messaging overlay for patient-provider and staff clinical communication.

## Runtime Shape

- Code: `curaos/backend/services/healthstack-messaging-service/`
- Package: `@curaos/healthstack-messaging-service`
- Contract: `specs/healthstack-messaging.tsp`
- Generated image lock: `bun.lock`, checked by `bun run gen:service-lock-check`

## Guardrails

- PHI/PII remains inside the HealthStack overlay boundary.
- Reuse `@curaos/healthstack-consent` for clinical consent enforcement.
- Messaging events must avoid leaking PHI into neutral topics.
- Any generated scaffold issue folds back into `curaos/tools/codegen/`.
