---
name: curaos-personal-site
description: "Personal site builder (React + Next.js editor, Astro renderer) with template gallery and publish pipeline."
tags: [frontend, app, personal]
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
  - ADR-0121e
  - ADR-0153
  - ADR-0209
status: stub
target: web
---

# curaos-personal-site

> STUB: no code yet, real home = curaos/frontend/apps/personal-site/ (code dir is README-only until scaffolded).

Personal website builder. Template gallery, drag-drop editor, theme, Astro publish pipeline.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-site
turbo run build --filter=@curaos/personal-site
turbo run lint --filter=@curaos/personal-site
turbo run test --filter=@curaos/personal-site
turbo run e2e --filter=@curaos/personal-site
```
