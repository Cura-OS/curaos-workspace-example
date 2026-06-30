---
name: curaos-traccar-adapter
description: "Typed Traccar adapter for config guardrails and device, position, and event normalization."
tags: [package, adapter, fleet, geospatial]
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
npm: "@curaos/traccar-adapter"
target: node
---

# @curaos/traccar-adapter

Traccar adapter package for fleet integrations. Keep external API coupling contained.

## Mission

Normalize Traccar devices, positions, and events into CuraOS fleet shapes.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/traccar-adapter typecheck`
- Build: `bun run --filter @curaos/traccar-adapter build`

## Judgment Boundaries

- Do not leak provider-specific shapes past the adapter seam.
- Do not skip config validation.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Keep normalization pure and testable.

## Commands

```bash
bun run --filter @curaos/traccar-adapter typecheck
bun run --filter @curaos/traccar-adapter build
```
