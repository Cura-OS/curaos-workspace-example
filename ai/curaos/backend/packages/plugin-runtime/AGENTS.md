---
name: curaos-plugin-runtime
description: "Plugin host/guest bridge - iframe sandbox, permission model, typed message passing, UI slot rendering."
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
npm: "@curaos/plugin-runtime"
adrs:
  - ADR-0209
target: browser
---

# @curaos/plugin-runtime

Plugin extensibility. Host orchestrator + sandboxed guest bridge. Iframe isolation, permission model.

## Commands
```bash
bunx turbo run build --filter=@curaos/plugin-runtime
bunx turbo run lint --filter=@curaos/plugin-runtime
bunx turbo run test --filter=@curaos/plugin-runtime
```
