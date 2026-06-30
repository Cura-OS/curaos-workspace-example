---
name: curaos-observability
description: "OTel tracing, structured logging, metric helpers for frontend packages and BFFs."
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
npm: "@curaos/observability"
adrs:
  - ADR-0209
target: browser+node
---

# @curaos/observability

OTel tracing + structured logs + metrics. Browser + Node.js. No PHI in telemetry.

## Commands
```bash
bunx turbo run build --filter=@curaos/observability
bunx turbo run lint --filter=@curaos/observability
bunx turbo run test --filter=@curaos/observability
```
