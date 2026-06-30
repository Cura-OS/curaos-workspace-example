---
name: curaos-admin-app
description: "React + Next.js 14 web admin shell for CuraOS platform and tenant operators."
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
  - ADR-0099
  - ADR-0100
  - ADR-0106
  - ADR-0120
  - ADR-0153
  - ADR-0209
status: stub
target: web
---

# curaos-admin-app

> STUB: no code yet, real home = curaos/frontend/apps/admin-app/ (code dir is README-only until scaffolded).

React + Next.js 14 App Router web admin shell. Tenancy, user/role, audit, and plugin management.

## Agent contract

Read workspace `AGENTS.md` first. This file is module-local intent only.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/admin-app
turbo run build --filter=@curaos/admin-app
turbo run lint --filter=@curaos/admin-app
turbo run test --filter=@curaos/admin-app
turbo run e2e --filter=@curaos/admin-app
```
