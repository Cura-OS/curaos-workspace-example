---
name: curaos-backend-services
description: "Collection of NestJS/TypeScript microservices for CuraOS domains (identity, workflow, automation, etc.). Stack per ADR-0100 (foundation runtime) + cluster ADRs 0200-0211."
tags: [index, services]
language: typescript
framework: nestjs
infrastructure: none
tooling:
  - bun
  - vitest
  - eslint
  - prettier
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  readme: README.md
---

# curaos-backend-services

Collection of NestJS/TypeScript microservices for CuraOS domains (identity, workflow, automation, etc.). Stack per ADR-0100 (foundation runtime) + cluster ADRs 0200-0211.

## Module agent contract

This file is the cross-CLI agent contract for this module. The frontmatter above carries structured metadata previously held in `codex.json`. All CLI agents that read `AGENTS.md` (Codex, OpenCode, Cursor, Aider) consume this file natively; Claude Code reads it via `@AGENTS.md` import.

Read the workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.
