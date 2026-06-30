---
name: curaos-personal-calendar
description: "Self-service scheduling - availability editor, public booking page, management (React + Next.js + Expo)."
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
  - ADR-0121e
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-personal-calendar

> STUB: no code yet, real home = curaos/frontend/apps/personal-calendar/ (code dir is README-only until scaffolded).

Self-service scheduling. Availability editor, public booking, management dashboard. Web + mobile.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-calendar
turbo run build --filter=@curaos/personal-calendar
turbo run lint --filter=@curaos/personal-calendar
turbo run test --filter=@curaos/personal-calendar
```
