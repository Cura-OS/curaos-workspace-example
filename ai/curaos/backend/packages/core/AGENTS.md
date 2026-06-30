---
name: curaos-core
description: "Shared isomorphic primitives: tenant context, error types, ID utilities, event envelope, correlation ID."
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
npm: "@curaos/core"
adrs:
  - ADR-0209
target: isomorphic
---

# @curaos/core

Foundation primitives. Zero deps. Used by every other @curaos/* lib.

## Commands
```bash
bunx turbo run build --filter=@curaos/core
bunx turbo run lint --filter=@curaos/core
bunx turbo run test --filter=@curaos/core
```
