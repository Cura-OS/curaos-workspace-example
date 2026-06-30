---
name: curaos-business-site
description: "Multi-user business site builder (React + Next.js admin, Astro renderer) with approvals and localization."
tags: [frontend, app, business]
language: typescript
framework: next.js+astro
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
recipe: ui.react-next+ui.astro
adrs:
  - ADR-0106
  - ADR-0121d
  - ADR-0153
  - ADR-0209
status: stub
target: web
---

# curaos-business-site

> STUB: no code yet, real home = curaos/frontend/apps/business-site/ (code dir is README-only until scaffolded).

Multi-user visual site builder + Astro publisher. Collaboration, approval, localization, SEO.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/business-site
turbo run build --filter=@curaos/business-site
turbo run lint --filter=@curaos/business-site
turbo run test --filter=@curaos/business-site
turbo run e2e --filter=@curaos/business-site
```
