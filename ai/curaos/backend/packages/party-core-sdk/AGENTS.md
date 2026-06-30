---
name: curaos-party-core-sdk
description: "Generated TypeSpec and AsyncAPI client package for party-core-service."
tags: [package, sdk, party, neutral]
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
npm: "@curaos/party-core-sdk"
target: node
---

# @curaos/party-core-sdk

Generated party-core client package. Keep match and merge contracts typed.

## Mission

Expose party-core contracts through generated SDK exports.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/party-core-sdk typecheck`
- Build: `bun run --filter @curaos/party-core-sdk build`

## Judgment Boundaries

- Do not hand-write generated transport when contract regeneration applies.
- Do not encode vertical storage policy in this neutral SDK.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Prefer regeneration over hand-written transport edits.

## Commands

```bash
bun run --filter @curaos/party-core-sdk typecheck
bun run --filter @curaos/party-core-sdk build
```
