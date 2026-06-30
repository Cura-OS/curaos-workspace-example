---
name: curaos-business-workflow
description: "Enterprise workflow designer + monitoring console (React + Next.js) with versioning and governance."
tags: [frontend, app, business]
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
  - ADR-0153
  - ADR-0209
status: stub
target: web
---

# curaos-business-workflow

> STUB: no code yet, real home = curaos/frontend/apps/business-workflow/ (code dir is README-only until scaffolded).

Enterprise workflow designer + monitoring. Collaborative BPMN, versioning, deployment promotion, governance.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/business-workflow
turbo run build --filter=@curaos/business-workflow
turbo run lint --filter=@curaos/business-workflow
turbo run test --filter=@curaos/business-workflow
turbo run e2e --filter=@curaos/business-workflow
```
