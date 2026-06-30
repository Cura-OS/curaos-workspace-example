---
name: curaos-healthstack-interop-sdk
description: "Generated TypeSpec and AsyncAPI client package for healthstack-interop-service."
tags: [package, sdk, healthstack, interop]
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
npm: "@curaos/healthstack-interop-sdk"
target: node
---

# @curaos/healthstack-interop-sdk

Generated HealthStack interop client package. Keep interoperability contracts versioned.

## Mission

Expose healthstack-interop service contracts through generated SDK exports.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/healthstack-interop-sdk typecheck`
- Build: `bun run --filter @curaos/healthstack-interop-sdk build`

## Judgment Boundaries

- Do not weaken PHI boundary expectations.
- Do not hand-write generated transport when contract regeneration applies.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve PHI boundary assumptions from the owning service.

## Commands

```bash
bun run --filter @curaos/healthstack-interop-sdk typecheck
bun run --filter @curaos/healthstack-interop-sdk build
```
