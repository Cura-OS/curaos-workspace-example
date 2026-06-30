---
name: curaos-business-donation
description: "Organization crowdfunding/donation campaign management (React + Next.js)."
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

# curaos-business-donation

> STUB: no code yet, real home = curaos/frontend/apps/business-donation/ (code dir is README-only until scaffolded).

Organization donation campaign management. Dashboards, donor CRM, compliance, payouts.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/business-donation
turbo run build --filter=@curaos/business-donation
turbo run lint --filter=@curaos/business-donation
turbo run test --filter=@curaos/business-donation
turbo run e2e --filter=@curaos/business-donation
```
