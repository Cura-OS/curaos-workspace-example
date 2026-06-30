---
name: curaos-subscription-sdk
description: "Generated TypeSpec client package for subscription-core-service."
tags: [package, sdk, subscription, neutral]
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
npm: "@curaos/subscription-sdk"
target: node
---

# @curaos/subscription-sdk

Generated subscription client package. Resource-only, contract-first.

## Mission

Expose subscription-core contracts through generated SDK exports.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/subscription-sdk typecheck`
- Build: `bun run --filter @curaos/subscription-sdk build`

## Judgment Boundaries

- Do not hand-write generated transport when contract regeneration applies.
- Do not move billing policy into this neutral SDK.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Prefer regeneration over manual generated-file edits.

## Commands

```bash
bun run --filter @curaos/subscription-sdk typecheck
bun run --filter @curaos/subscription-sdk build
```
