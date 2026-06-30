---
name: curaos-recurrence
description: "RFC 5545 recurrence rule parser, generator, and occurrence expander. Zero deps, timezone-aware."
tags: [package]
language: typescript
framework: none
infrastructure: Temporal
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/recurrence"
adrs:
  - ADR-0209
target: isomorphic
---

# @curaos/recurrence

RFC 5545 RRULE parser + expander. Zero deps. Timezone-aware.

## Commands
```bash
bunx turbo run build --filter=@curaos/recurrence
bunx turbo run lint --filter=@curaos/recurrence
bunx turbo run test --filter=@curaos/recurrence
```
