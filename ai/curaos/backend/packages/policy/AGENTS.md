---
name: curaos-policy
description: "RBAC/ABAC policy evaluation client - useCan hook, PolicyGate component, server-side checkPolicy."
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
npm: "@curaos/policy"
adrs:
  - ADR-0209
target: isomorphic
---

# @curaos/policy

Policy evaluation client. useCan hook, PolicyGate, server-side checkPolicy. Deny-by-default.

## Commands
```bash
bunx turbo run build --filter=@curaos/policy
bunx turbo run lint --filter=@curaos/policy
bunx turbo run test --filter=@curaos/policy
```
