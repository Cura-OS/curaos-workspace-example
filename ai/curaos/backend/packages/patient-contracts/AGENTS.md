---
name: curaos-patient-contracts
description: "Compile-time JSON Schema Draft-07 base contract for core.patients (M7-S5 D4 hybrid binding). Overlay schemas merge at runtime via healthstack-patient-service GET /api/v1/contracts/patient."
tags: [package]
language: typescript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/patient-contracts"
target: isomorphic
m7_story: M7-S5
adrs: []
rules:
  - curaos-reuse-dry-rule
  - curaos-repo-boundary-rule
  - curaos-ai-mirror-rule
---

# @curaos/patient-contracts

Compile-time JSON Schema Draft-07 base for `core.patients`. Drives RJSF
rendering in `builder-studio` at boot (synchronous import) and serves as
the canonical reference the runtime overlay endpoint MUST keep as a
structural subset.

## Hard rules

- **No PHI columns.** Mirrors only the neutral surface of
  `core.patients`. PHI columns live in the overlay schema served by
  `healthstack-patient-service`.
- **Single source of truth.** Any column rename in `core.patients`
  Drizzle schema MUST land in `src/patient-base-schema.ts` in the same
  PR (Definition of Done item 9 - reuse + DRY).
- **Manual emit for M7.** Codegen wiring lands in M9; the snapshot test
  in `test/patient-base-schema.test.ts` locks the shape so the first
  codegen emit is a structural identity match.

## Commands

```bash
bunx turbo run typecheck --filter=@curaos/patient-contracts
bunx turbo run test      --filter=@curaos/patient-contracts
bunx turbo run build     --filter=@curaos/patient-contracts
```
