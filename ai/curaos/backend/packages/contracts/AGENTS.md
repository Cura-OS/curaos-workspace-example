---
name: curaos-contracts
description: "Bulk import-job contracts and CSV adapter mold."
tags: [package, contracts, import, neutral]
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
npm: "@curaos/contracts"
target: node
---

# @curaos/contracts

Shared import-job contracts. Keep row quarantine and status projection person-facing.

## Mission

Provide shared import-job and CSV adapter contracts for persisted ingestion flows.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/contracts typecheck`
- Build: `bun run --filter @curaos/contracts build`

## Judgment Boundaries

- Do not replace persisted import state with runtime-only mocks.
- Do not copy upstream WorldVistA source.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve Apache-2.0 provenance notes for port-adapted import concepts.

## Commands

```bash
bun run --filter @curaos/contracts typecheck
bun run --filter @curaos/contracts build
```
