# Backend Libraries — Agent Context

## Mission
Steward `@curaos/*` npm scope libs (TypeScript) for all frontend packages and BFFs.

## Responsibilities
- Maintain clear module boundaries (npm: 15 ADR-0209 packages + 6 additional stubs/PoC/internal) with semantic versioning.
- Document extension points (SPI interfaces, configuration properties, event contracts) and provide examples.
- Enforce baseline compatibility (TypeScript strict).
- Coordinate with service and frontend teams on release notes + migration guides.

## npm libs ownership (ADR-0209)
Per-lib docs at `ai/curaos/backend/packages/<pkg-slug>/`:

**15 ADR-0209 shipped libs:**
- `@curaos/core`, `@curaos/auth-sdk`, `@curaos/audit-sdk`, `@curaos/tenancy`, `@curaos/events`
- `@curaos/codegen-sdk`, `@curaos/plugin-runtime`, `@curaos/policy`, `@curaos/observability`
- `@curaos/fhir-client` (HealthStack only), `@curaos/recurrence`, `@curaos/secrets`
- `@curaos/canvas` (ADR-0121d), `@curaos/forms` (ADR-0121e), `@curaos/ui`

**Additional packages (stubs/PoC/internal — not ADR-0209 shipped):**
- `codegen-engine` — M1 stub; codegen template engine (impl per HANDOVER.md)
- `event-interceptors` — M1 stub; NestJS event interceptors (impl per HANDOVER.md)
- `providers` — M1 stub; DI providers shared across services (impl per HANDOVER.md)
- `patient-contracts` — M7-S5 contract pkg; `@curaos/patient-contracts` JSON Schema D4
- `drizzle-citus-poc` — pre-M2 PoC; Drizzle + Citus distributed-table validation
- `tsconfig` — internal; shared TypeScript compiler presets (`@curaos/tsconfig`)

## Guardrails
- Generic libs never depend on vertical code; overlays implement adapters.
- `@curaos/fhir-client` is HealthStack-only; neutral packages must not import it.
- No direct persistence or infrastructure provisioning inside libraries.
- Security-sensitive helpers (crypto, PHI handling) default to safe configurations.
- npm libs: no Node.js-only APIs in browser-consumed packages without platform guard.

## Agent rules
- When adding a new npm lib: create `ai/curaos/backend/packages/<pkg-slug>/` with Requirements.md + CONTEXT.md + AGENTS.md.
- Breaking changes to any lib require: semver major bump + changelog + migration guide + announcement in consuming package PRs.
- Run `bunx turbo run build lint test` for all npm libs before releasing.
