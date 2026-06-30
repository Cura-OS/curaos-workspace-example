---
name: curaos-connector-sdk
description: "Typed connector framework and live registry spine for consent-gated connections."
tags: [package, sdk, connector, neutral]
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
npm: "@curaos/connector-sdk"
target: node
---

# @curaos/connector-sdk

Shared connector package. Keep auth vaulting and action schemas generator-friendly.

## Mission

Provide the typed connector framework for person and organization connections.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/connector-sdk typecheck`
- Build: `bun run --filter @curaos/connector-sdk build`

## Judgment Boundaries

- Do not store connector secrets outside `@curaos/secrets` seams.
- Do not copy upstream Activepieces source.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Respect Activepieces MIT provenance without copying source.

## Commands

```bash
bun run --filter @curaos/connector-sdk typecheck
bun run --filter @curaos/connector-sdk build
```
