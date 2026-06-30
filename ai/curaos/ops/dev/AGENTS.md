---
name: curaos-ops-dev
description: "Local development operations surface for CuraOS."
tags: [ops, dev]
language: TypeScript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
---

# curaos-ops-dev

Local development operations surface for CuraOS.

## Agent contract

Read workspace `AGENTS.md`, then `ai/curaos/AGENTS.md`, then [ops](../AGENTS.md) before editing this area.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- Parent ops docs: [ops](../AGENTS.md)

## Boundaries

- Keep local-dev automation reproducible and self-hosted.
- Do not add managed-cloud-only dependencies.
- Do not duplicate production deployment rules; reference parent ops docs and rules.
