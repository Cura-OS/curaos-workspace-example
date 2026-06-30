---
name: curaos-workflow-designer
description: "Visual BPMN workflow designer (React + Next.js) using @curaos/canvas node-graph canvas."
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

# curaos-workflow-designer

BPMN-style visual process designer. Node-graph canvas + per-node property forms + publish to workflow-core-service.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands
```bash
turbo run dev --filter=@curaos/workflow-designer
turbo run build --filter=@curaos/workflow-designer
turbo run lint --filter=@curaos/workflow-designer
turbo run test --filter=@curaos/workflow-designer
turbo run e2e --filter=@curaos/workflow-designer
```
