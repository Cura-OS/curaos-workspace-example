---
name: curaos-personal-hr
description: "Personal HR web app composed from CuraOS UI and API client packages."
tags: [frontend, app, personal, hr]
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

# personal-hr

Personal HR app. Keep runtime configuration deploy-time, not build-baked.

## Mission

Provide the personal HR app surface for credential, career, and people operations workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/personal-hr typecheck`
- Build: `bun run --filter @curaos/personal-hr build`
- Test: `bun run --filter @curaos/personal-hr test`

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
bun run --filter @curaos/personal-hr typecheck
bun run --filter @curaos/personal-hr build
bun run --filter @curaos/personal-hr test
```
