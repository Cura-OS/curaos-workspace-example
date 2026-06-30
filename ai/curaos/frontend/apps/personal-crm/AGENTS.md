---
name: curaos-personal-crm
description: "Personal CRM web app composed from CuraOS UI and API client packages."
tags: [frontend, app, personal, crm]
language: typescript
framework: Next.js 15
infrastructure: none
tooling: Bun, Turborepo
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
recipe: ui.react-next
target: web
---

# personal-crm

Personal CRM app. Keep runtime configuration deploy-time, not build-baked.

## Mission

Provide the personal CRM app surface for relationship and contact workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/personal-crm typecheck`
- Build: `bun run --filter @curaos/personal-crm build`
- Test: `bun run --filter @curaos/personal-crm test`

## Judgment Boundaries

- Do not bake public config at build time.
- Do not hand-fix generated defects without feeding the generator.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing user flows.
- Fold generated-app fixes back into the UI app generator.

## Commands

```bash
bun run --filter @curaos/personal-crm typecheck
bun run --filter @curaos/personal-crm build
bun run --filter @curaos/personal-crm test
```
