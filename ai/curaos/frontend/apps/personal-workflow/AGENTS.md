---
name: curaos-personal-workflow
description: "Personal BPMN-lite workflow builder (React + Next.js web editor, Expo mobile monitoring)."
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
  - ADR-0121e
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-personal-workflow

> STUB: no code yet, real home = curaos/frontend/apps/personal-workflow/ (code dir is README-only until scaffolded).

Personal workflow builder. BPMN-lite editor, templates, run history. Web + mobile monitoring.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-workflow
turbo run build --filter=@curaos/personal-workflow
turbo run lint --filter=@curaos/personal-workflow
turbo run test --filter=@curaos/personal-workflow
```
