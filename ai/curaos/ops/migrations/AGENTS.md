---
name: curaos-ops-migrations
description: "Shared migration-runner base image, Kubernetes Job template, and forward-only migration policy."
tags: [ops, migrations]
language: TypeScript
framework: none
infrastructure: PostgreSQL (CNPG), K8s
tooling:
  - bun
  - docker
  - helm
  - postgresql
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/ops/migrations/CONTEXT.md
  requirements: ai/curaos/ops/migrations/Requirements.md
---

# curaos-ops-migrations

Shared migration-runner contract for CuraOS services.

## Module Agent Contract

Read the workspace-level [AGENTS.md](../../../../AGENTS.md), ops [AGENTS.md](../AGENTS.md), and this module's [CONTEXT.md](CONTEXT.md) before changing `curaos/ops/migrations/`.

Keep changes scoped to the runner base image, Job template, forward-only policy, and operator docs. Do not broaden into Zarf bundle layout or service-specific migrations unless the issue explicitly owns that path.

## Companion Documents

- [CONTEXT.md](CONTEXT.md)
- [Requirements.md](Requirements.md)
- Code docs: [README.md](../../../../curaos/ops/migrations/README.md)
