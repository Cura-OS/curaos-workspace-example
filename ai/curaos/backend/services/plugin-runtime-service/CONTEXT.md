# CONTEXT.md - plugin-runtime-service

## Role

Neutral runtime service for plugin lifecycle, extension registry, and execution control surfaces.

## Runtime Shape

- Code: `curaos/backend/services/plugin-runtime-service/`
- Package: `@curaos/plugin-runtime-service`
- Contract: `specs/plugin-runtime.tsp`
- Generated image lock: `bun.lock`, checked by `bun run gen:service-lock-check`

## Guardrails

- Plugin execution must be sandboxed and tenant-scoped.
- Do not leak plugin-specific policy into neutral services.
- Route and frontend admin surfaces must stay aligned with API gateway mappings.
- Any generated scaffold issue folds back into `curaos/tools/codegen/`.
