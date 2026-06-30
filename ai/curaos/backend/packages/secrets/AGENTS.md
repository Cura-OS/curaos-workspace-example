---
name: curaos-secrets
description: "Secrets access proxy client (server/BFF only) - cached resolution, rotation notification. Browser import throws."
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
npm: "@curaos/secrets"
adrs:
  - ADR-0209
target: node
---

# @curaos/secrets

Secrets proxy client. Server/BFF only. Cached TTL + rotation. Browser import throws.

## Commands
```bash
bunx turbo run build --filter=@curaos/secrets
bunx turbo run lint --filter=@curaos/secrets
bunx turbo run test --filter=@curaos/secrets
```
