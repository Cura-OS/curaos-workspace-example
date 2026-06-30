---
name: curaos-business-automation
description: "Enterprise automation console (React + Next.js) with approvals, env promotion, and connector marketplace."
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
  - ADR-0153
  - ADR-0209
status: stub
target: web
---

# curaos-business-automation

> STUB: no code yet, real home = curaos/frontend/apps/business-automation/ (code dir is README-only until scaffolded).

Enterprise automation console. Governance, approvals, environment promotion, connector marketplace.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/business-automation
turbo run build --filter=@curaos/business-automation
turbo run lint --filter=@curaos/business-automation
turbo run test --filter=@curaos/business-automation
turbo run e2e --filter=@curaos/business-automation
```
