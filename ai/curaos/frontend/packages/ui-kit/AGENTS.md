---
name: curaos-ui-kit
description: "Shared React + React Native dual-export design-system component library (@curaos/ui)."
tags: [frontend, package]
language: typescript
framework: react
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
recipe: ui.react-next+ui.react-native
adrs:
  - ADR-0099
  - ADR-0100
  - ADR-0106
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-ui-kit (@curaos/ui)

> STUB: no code yet, real home = curaos/frontend/packages/ui-kit/ (code dir is README-only until scaffolded).

Dual-export component library. Web: React + Radix UI + Tailwind. Native: React Native + NativeWind.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/ui
turbo run build --filter=@curaos/ui
turbo run lint --filter=@curaos/ui
turbo run test --filter=@curaos/ui
turbo run storybook:build --filter=@curaos/ui
```
