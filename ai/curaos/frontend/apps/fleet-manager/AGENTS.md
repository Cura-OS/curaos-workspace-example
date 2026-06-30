---
name: curaos-fleet-manager
description: "Fleet operations UI - React + Next.js web admin + React Native Expo mobile field companion."
tags: [frontend, app, neutral]
language: typescript
framework: next.js+expo
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
  - ADR-0106
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-fleet-manager

> STUB: no code yet, real home = curaos/frontend/apps/fleet-manager/ (code dir is README-only until scaffolded).

Fleet vehicle registry, dispatch board, maintenance planner. Web admin + mobile field companion.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/fleet-manager         # Next.js web admin
turbo run build --filter=@curaos/fleet-manager
turbo run lint --filter=@curaos/fleet-manager
turbo run test --filter=@curaos/fleet-manager
expo start --filter=@curaos/fleet-manager            # Expo dev (mobile)
```
