---
name: curaos-personal-automation
description: "Personal low-code automation builder (React + Next.js web, React Native mobile)."
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
  - ADR-0121d
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-personal-automation

> STUB: no code yet, real home = curaos/frontend/apps/personal-automation/ (code dir is README-only until scaffolded).

Personal automation builder. Node editor, template gallery, connector marketplace, run history.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-automation
turbo run build --filter=@curaos/personal-automation
turbo run lint --filter=@curaos/personal-automation
turbo run test --filter=@curaos/personal-automation
```
