---
name: curaos-personal-tasks
description: "Personal task management - inbox, board, time-blocking, focus timer, offline (React + Next.js + Expo)."
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

# curaos-personal-tasks

> STUB: no code yet, real home = curaos/frontend/apps/personal-tasks/ (code dir is README-only until scaffolded).

Personal productivity. Inbox, board, task detail, calendar time-blocking, focus timer, offline sync.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-tasks
turbo run build --filter=@curaos/personal-tasks
turbo run lint --filter=@curaos/personal-tasks
turbo run test --filter=@curaos/personal-tasks
```
