---
name: curaos-commission-engine
description: "Commission calculation engine for rate, split, override, and clawback statements."
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
npm: "@curaos/commission-engine"
target: node
---

# @curaos/commission-engine

Pure commission calculation package. Money stays integer-minor.

## Mission

Provide deterministic commission calculations for reusable finance workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/commission-engine typecheck`
- Build: `bun run --filter @curaos/commission-engine build`

## Judgment Boundaries

- Do not use floating-point money math.
- Do not change formula semantics without golden tests.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Add golden tests for formula changes.

## Commands

```bash
bun run --filter @curaos/commission-engine typecheck
bun run --filter @curaos/commission-engine build
```
