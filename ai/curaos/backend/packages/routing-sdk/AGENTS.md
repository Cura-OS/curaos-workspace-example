---
name: curaos-routing-sdk
description: "Provider-neutral routing seams plus Valhalla request mapping and result normalization."
tags: [package, sdk, routing, geospatial]
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
npm: "@curaos/routing-sdk"
target: node
---

# @curaos/routing-sdk

Provider-neutral routing SDK. Keep request mapping dependency-free.

## Mission

Provide provider-neutral routing seams and normalized route results.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/routing-sdk typecheck`
- Build: `bun run --filter @curaos/routing-sdk build`

## Judgment Boundaries

- Do not add managed routing lock-in.
- Do not leak provider-specific shapes past the adapter seam.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve self-hosted routing support.

## Commands

```bash
bun run --filter @curaos/routing-sdk typecheck
bun run --filter @curaos/routing-sdk build
```
