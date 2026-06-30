---
name: curaos-cds-sdk
description: "Clinical decision support SDK seams for injected CQL, FQM, and Zen evaluators."
tags: [package, sdk, healthstack, cds]
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
npm: "@curaos/cds-sdk"
target: node
---

# @curaos/cds-sdk

Clinical decision support SDK seams. Keep evaluators injected and results safe.

## Mission

Expose provider-neutral clinical decision support evaluator seams.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/cds-sdk typecheck`
- Build: `bun run --filter @curaos/cds-sdk build`

## Judgment Boundaries

- Do not persist PHI in this shared package.
- Do not make evaluator failures permissive by default.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Keep PHI boundaries explicit in every evaluation path.

## Commands

```bash
bun run --filter @curaos/cds-sdk typecheck
bun run --filter @curaos/cds-sdk build
```
