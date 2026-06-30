---
name: curaos-personal-shop
description: "Personal creator storefront - product management, checkout, analytics (React + Next.js web, Expo mobile)."
tags: [frontend, app, personal]
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

# curaos-personal-shop

> STUB: no code yet, real home = curaos/frontend/apps/personal-shop/ (code dir is README-only until scaffolded).

Personal creator storefront. Product management, checkout, analytics, supporter messaging.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-shop
turbo run build --filter=@curaos/personal-shop
turbo run lint --filter=@curaos/personal-shop
turbo run test --filter=@curaos/personal-shop
```
