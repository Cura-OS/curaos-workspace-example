---
name: curaos-contract-sdk
description: "Generated TypeSpec and AsyncAPI client package for contract-core-service."
tags: [package, sdk, contract, neutral]
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
npm: "@curaos/contract-sdk"
target: node
---

# @curaos/contract-sdk

Generated contract-core client package. Keep it contract-first.

## Mission

Expose contract-core service contracts through generated SDK exports.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/contract-sdk typecheck`
- Build: `bun run --filter @curaos/contract-sdk build`

## Judgment Boundaries

- Do not hand-write generated transport when contract regeneration applies.
- Do not introduce breaking exports without a contract version change.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Prefer regeneration over manual generated-file edits.

## Commands

```bash
bun run --filter @curaos/contract-sdk typecheck
bun run --filter @curaos/contract-sdk build
```
