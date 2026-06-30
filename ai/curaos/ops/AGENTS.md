---
name: curaos-ops
description: "Operations, infrastructure-as-code, and deployment assets for CuraOS."
tags: [index, ops]
language: TypeScript
framework: none
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), SeaweedFS S3, K8s
tooling:
  - helm
  - k3s
  - zarf
  - cnpg
  - cilium
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/ops/CONTEXT.md
  requirements: ai/curaos/ops/Requirements.md
---

# curaos-ops

Operations, infrastructure-as-code, and deployment assets for CuraOS.

## Module agent contract

This file is the cross-CLI agent contract for this module. The frontmatter above carries structured metadata previously held in `codex.json`. All CLI agents that read `AGENTS.md` (Codex, OpenCode, Cursor, Aider) consume this file natively; Claude Code reads it via `@AGENTS.md` import.

Read the workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Sub-areas

- [dev](dev/AGENTS.md) - local-dev ops
- [migrations](migrations/AGENTS.md) - shared migration runner
- [zarf](zarf/AGENTS.md) - air-gap bundle layout
