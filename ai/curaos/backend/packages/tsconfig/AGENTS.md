---
name: curaos-tsconfig-package
description: "Shared TypeScript compiler presets consumed by CuraOS apps, services, and packages."
tags: [package]
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
package: "@curaos/tsconfig"
---

# curaos-tsconfig-package

Shared TypeScript compiler presets for CuraOS runtime packages and generated modules.

## Agent contract

Read workspace `AGENTS.md`, then `ai/curaos/AGENTS.md`, then the backend packages contract before editing this package.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- Parent package docs: [backend packages](../AGENTS.md)

## Boundaries

- Keep presets small and composable.
- Do not encode application-specific aliases here.
- Keep JSON preset names aligned with files in `curaos/backend/packages/tsconfig/`.
