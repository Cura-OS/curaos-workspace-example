---
name: curaos-tasks-sdk
description: "Typed tasks-core-service client - REST operations + request/response types generated from tasks.tsp (TypeSpec → OpenAPI 3.1 → @hey-api/openapi-ts), plus event wire-types from tasks.asyncapi.yaml. Generated from the notify-sdk recipe (M10 #278-284)."
tags: [package, sdk]
language: typescript
framework: none
infrastructure: Redpanda (Kafka API)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/tasks-sdk"
target: isomorphic
milestone: M10
story: "your-org/curaos-ai-workspace#284"
parent_epic: "your-org/curaos-ai-workspace#24"
adrs:
  - ADR-0103
  - ADR-0201
  - ADR-0209
rules:
  - curaos-reuse-dry-rule
  - curaos-repo-boundary-rule
  - curaos-ai-mirror-rule
  - curaos-speed-patterns-rule
  - curaos-generator-evolution-rule
---

# @curaos/tasks-sdk - agent contract

Horizontal SDK package. Typed client for `tasks-core-service` (FHIR Task + status lifecycle), generated from its
TypeSpec REST contract + AsyncAPI event contract via the reusable recipe set by
`@curaos/notify-sdk` (#278).

See [CONTEXT.md](CONTEXT.md) for the integration map + recipe, and
[Requirements.md](Requirements.md) for the charter + Definition of Done.

## Hard rules

- **Generated code is committed under `src/`; `dist/` is the published build.**
  Never hand-edit `src/rest/**` or `src/events.gen.ts` - they are overwritten by
  `bun run generate`. Edit the SERVICE contract (`tasks.tsp` /
  `tasks.asyncapi.yaml`) or the generator scripts, then regenerate.
- **Contract drift is a test failure.** `test/drift.test.ts` asserts committed
  `src/` == fresh regeneration. A contract change without `bun run generate`
  fails CI.
- **Recipe parity.** Changes to the generation recipe (scripts, openapi-ts
  config, tsconfig relaxations, depcruise carve-out) that apply to EVERY SDK
  package belong in the shared recipe / generator, not just here - see
  [[curaos-generator-evolution-rule]].
