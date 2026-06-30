---
name: curaos-api-client
description: "Auto-generated TypeScript SDK (React Query hooks + Zod schemas) for all CuraOS REST APIs."
tags: [frontend, package]
language: typescript
framework: orval
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
adrs:
  - ADR-0106
  - ADR-0153
  - ADR-0209
status: active
target: isomorphic
---

# curaos-api-client

Generated OpenAPI SDK. Single source of truth for all CuraOS REST client types and React Query hooks.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands
```bash
turbo run generate --filter=@curaos/api-client
turbo run build --filter=@curaos/api-client
turbo run lint --filter=@curaos/api-client
turbo run test --filter=@curaos/api-client
```
