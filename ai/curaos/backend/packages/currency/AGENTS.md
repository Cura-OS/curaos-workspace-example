---
name: curaos-currency
description: "Currency master, FX rate feed, and FX gain or loss computation on integer minor units."
tags: [package, finance, neutral]
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
npm: "@curaos/currency"
target: node
---

# @curaos/currency

Shared currency and FX package. Money stays integer-minor.

## Mission

Provide currency, FX rate, and FX gain or loss primitives.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/currency typecheck`
- Build: `bun run --filter @curaos/currency build`

## Judgment Boundaries

- Do not use floating-point money math.
- Do not copy upstream Odoo source.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve Odoo LGPL provenance notes without copying source.

## Commands

```bash
bun run --filter @curaos/currency typecheck
bun run --filter @curaos/currency build
```
