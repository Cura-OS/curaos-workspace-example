---
name: curaos-x12-sdk
description: "X12 EDI revenue-cycle SDK for claims, remittance, eligibility, envelopes, and paper forms."
tags: [package, sdk, healthstack, revenue-cycle]
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
npm: "@curaos/x12-sdk"
target: node
---

# @curaos/x12-sdk

HealthStack revenue-cycle EDI SDK. Treat claim data as PHI-capable.

## Mission

Provide X12 EDI and paper-form primitives for HealthStack revenue-cycle workflows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/x12-sdk typecheck`
- Build: `bun run --filter @curaos/x12-sdk build`

## Judgment Boundaries

- Do not weaken PHI handling.
- Do not copy upstream node-x12 source.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve node-x12 fixture conformance without copying source.

## Commands

```bash
bun run --filter @curaos/x12-sdk typecheck
bun run --filter @curaos/x12-sdk build
```
