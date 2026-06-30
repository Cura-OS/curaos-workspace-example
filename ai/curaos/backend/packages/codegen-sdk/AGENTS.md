---
name: curaos-codegen-sdk
description: "Code generation recipes (ADR-0153): ui.react-next, ui.react-native, ui.astro, ui.lit-widget, lib.nestjs-shared."
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
npm: "@curaos/codegen-sdk"
adrs:
  - ADR-0153
  - ADR-0209
target: node
---

# @curaos/codegen-sdk

Scaffolding + validation for ADR-0153 codegen recipes. Node.js CLI tool.

## Commands
```bash
bunx turbo run build --filter=@curaos/codegen-sdk
bunx turbo run lint --filter=@curaos/codegen-sdk
bunx turbo run test --filter=@curaos/codegen-sdk
```
