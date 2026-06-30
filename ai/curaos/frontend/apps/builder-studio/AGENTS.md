---
name: curaos-builder-studio
description: "Visual app/site/form/workflow builder shell (React + Next.js) integrating @curaos/canvas and @curaos/forms."
tags: [frontend, app, neutral]
language: typescript
framework: next.js
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
recipe: ui.react-next
adrs:
  - ADR-0106
  - ADR-0121
  - ADR-0121d
  - ADR-0121e
  - ADR-0209
status: migrating
target: web
---

# curaos-builder-studio

App Builder shell. Drag-drop canvas + form schema editor + BPM publish pipeline.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands
```bash
turbo run dev --filter=@curaos/builder-studio
turbo run build --filter=@curaos/builder-studio
turbo run lint --filter=@curaos/builder-studio
turbo run test --filter=@curaos/builder-studio
turbo run e2e --filter=@curaos/builder-studio
```
