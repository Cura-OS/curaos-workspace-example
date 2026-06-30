---
name: curaos-accounting-sdk
description: "Generated TypeSpec and AsyncAPI client package for accounting-core-service."
tags: [package, sdk, accounting, neutral]
language: typescript
framework: none
infrastructure: none
tooling: Bun, TypeScript
apis: [TypeSpec]
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/accounting-sdk"
target: node
---

# @curaos/accounting-sdk

Generated accounting client package. Keep transport and event wire types contract-driven.

## Mission

Expose accounting-core contracts through generated, typed SDK exports.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/accounting-sdk typecheck`
- Build: `bun run --filter @curaos/accounting-sdk build`

## Judgment Boundaries

- Do not hand-write generated transport when contract regeneration applies.
- Do not introduce breaking exports without a contract version change.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Prefer regenerating from contracts over hand-written transport edits.

## Commands

```bash
bun run --filter @curaos/accounting-sdk typecheck
bun run --filter @curaos/accounting-sdk build
```
