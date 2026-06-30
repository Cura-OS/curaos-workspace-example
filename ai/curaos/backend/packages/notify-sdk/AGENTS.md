---
name: curaos-notify-sdk
description: "Typed notify-service client - REST operations + request/response types generated from notify.tsp (TypeSpec → OpenAPI 3.1 → @hey-api/openapi-ts), plus event payload/header wire-types from notify.asyncapi.yaml. Pattern-setter for the M10 SDK package class (#278-284)."
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
npm: "@curaos/notify-sdk"
target: isomorphic
milestone: M10
story: "your-org/curaos-ai-workspace#278"
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

# @curaos/notify-sdk - agent contract

Horizontal SDK package. Typed client for `notify-service`, generated from its
TypeSpec REST contract + AsyncAPI event contract. First REAL SDK package
(auth-sdk/audit-sdk were README/runtime stubs) - establishes the reusable
generation recipe the 6 sibling SDK lanes (#279-284) copy.

See [CONTEXT.md](CONTEXT.md) for the integration map + recipe, and
[Requirements.md](Requirements.md) for the charter + Definition of Done.

## Hard rules

- **Generated code is committed under `src/`; `dist/` is the published build.**
  Never hand-edit `src/rest/**` or `src/events.gen.ts` - they are overwritten by
  `bun run generate`. Edit the SERVICE contract (`notify.tsp` /
  `notify.asyncapi.yaml`) or the generator scripts, then regenerate.
- **Contract drift is a test failure.** `test/drift.test.ts` asserts committed
  `src/` == fresh regeneration. A contract change without `bun run generate`
  fails CI.
- **Recipe parity.** Changes to the generation recipe (scripts, openapi-ts
  config, tsconfig relaxations, depcruise carve-out) that apply to EVERY SDK
  package belong in the shared recipe / generator, not just here - see
  [[curaos-generator-evolution-rule]].
