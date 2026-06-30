---
name: curaos-personal-donation
description: "Personal donation campaign manager (React + Next.js web, React Native mobile)."
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

# curaos-personal-donation

> STUB: no code yet, real home = curaos/frontend/apps/personal-donation/ (code dir is README-only until scaffolded).

Creator donation campaigns. Setup wizard, landing page, supporter CRM, analytics, payouts.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-donation
turbo run build --filter=@curaos/personal-donation
turbo run lint --filter=@curaos/personal-donation
turbo run test --filter=@curaos/personal-donation
```
