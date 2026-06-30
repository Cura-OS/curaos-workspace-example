# @curaos/* npm Libraries — Registry

Per ADR-0209. 15 TypeScript libraries published to Verdaccio under `@curaos/` scope.

| Package slug | npm name | Role |
|---|---|---|
| core | `@curaos/core` | Shared primitives |
| auth-sdk | `@curaos/auth-sdk` | OIDC + session |
| audit-sdk | `@curaos/audit-sdk` | Audit event publisher |
| tenancy | `@curaos/tenancy` | Tenant resolution + context |
| events | `@curaos/events` | Event bus client + schemas |
| codegen-sdk | `@curaos/codegen-sdk` | Code generation recipes |
| plugin-runtime | `@curaos/plugin-runtime` | Plugin host/guest bridge |
| policy | `@curaos/policy` | RBAC/ABAC policy client |
| observability | `@curaos/observability` | OTel + logging helpers |
| fhir-client | `@curaos/fhir-client` | FHIR R4 REST client (HealthStack only) |
| recurrence | `@curaos/recurrence` | RFC 5545 recurrence helpers |
| secrets | `@curaos/secrets` | Secrets access proxy client |
| canvas | `@curaos/canvas` | Builder canvas + node-graph (ADR-0121d) |
| forms | `@curaos/forms` | Schema-driven form builder (ADR-0121e) |
| ui | `@curaos/ui` | Dual-export React + RN component library |

**Additional packages (stubs/PoC/internal — not in the 15 ADR-0209 shipped libs):**

| Package slug | npm name | Role |
|---|---|---|
| codegen-engine | — | M1 stub; codegen template engine (impl per [HANDOVER.md](../../docs/HANDOVER.md)) |
| event-interceptors | — | M1 stub; NestJS event interceptors (impl per [HANDOVER.md](../../docs/HANDOVER.md)) |
| providers | — | M1 stub; shared DI providers (impl per [HANDOVER.md](../../docs/HANDOVER.md)) |
| patient-contracts | `@curaos/patient-contracts` | M7-S5 D4 contract pkg; JSON Schema Draft-07 base |
| drizzle-citus-poc | — | pre-M2 PoC; Drizzle + Citus distributed-table validation |
| tsconfig | `@curaos/tsconfig` | Internal; shared TypeScript compiler presets |

Each directory contains: `Requirements.md`, `CONTEXT.md`, `AGENTS.md`.
