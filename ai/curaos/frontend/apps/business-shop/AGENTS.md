---
name: curaos-business-shop
description: "SMB/enterprise e-commerce admin (React + Next.js): catalog, orders, inventory, analytics."
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

# curaos-business-shop

> STUB: no code yet, real home = curaos/frontend/apps/business-shop/ (code dir is README-only until scaffolded).

Enterprise e-commerce admin. Catalog, order management, fulfillment, inventory, analytics.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/business-shop
turbo run build --filter=@curaos/business-shop
turbo run lint --filter=@curaos/business-shop
turbo run test --filter=@curaos/business-shop
turbo run e2e --filter=@curaos/business-shop
```
