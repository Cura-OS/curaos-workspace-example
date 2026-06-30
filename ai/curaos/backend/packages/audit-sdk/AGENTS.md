---
name: curaos-audit-sdk
description: "Typed audit event publisher client wrapping audit-core-service. Batched, fails-open."
tags: [package, sdk]
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
npm: "@curaos/audit-sdk"
adrs:
  - ADR-0209
target: isomorphic
---

# @curaos/audit-sdk

Audit event publisher. Batched flush to audit-core-service. Fails open.

## Commands
```bash
bunx turbo run build --filter=@curaos/audit-sdk
bunx turbo run lint --filter=@curaos/audit-sdk
bunx turbo run test --filter=@curaos/audit-sdk
```
