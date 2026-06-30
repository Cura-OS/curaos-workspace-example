---
name: curaos-tax-engine
description: "Tax computation engine for compound taxes, repartition, withholding, and jurisdiction matching."
tags: [package, finance, tax, neutral]
language: typescript
framework: none
infrastructure: none
tooling: Bun, TypeScript
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/tax-engine"
target: node
---

# @curaos/tax-engine

Shared tax engine. Keep calculations deterministic and provenance clear.

## Mission

Provide deterministic tax calculations for shared commerce and finance workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/tax-engine typecheck`
- Build: `bun run --filter @curaos/tax-engine build`

## Judgment Boundaries

- Do not use floating-point money math.
- Do not copy upstream Odoo source.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve Odoo provenance notes without copying source.

## Commands

```bash
bun run --filter @curaos/tax-engine typecheck
bun run --filter @curaos/tax-engine build
```
