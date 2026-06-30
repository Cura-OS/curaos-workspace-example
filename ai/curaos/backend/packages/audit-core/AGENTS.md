---
name: curaos-audit-core
description: "HMAC-SHA256 audit chain primitives for tamper-evident audit records."
tags: [package, audit, security, neutral]
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
npm: "@curaos/audit-core"
target: node
---

# @curaos/audit-core

Shared audit chain primitives. Treat changes as security-sensitive.

## Mission

Provide deterministic audit hash-chain primitives for compliance-sensitive records.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/audit-core typecheck`
- Build: `bun run --filter @curaos/audit-core build`

## Judgment Boundaries

- Do not silently change digest compatibility.
- Do not log protected data while computing audit records.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Preserve deterministic hash behavior across versions.

## Commands

```bash
bun run --filter @curaos/audit-core typecheck
bun run --filter @curaos/audit-core build
```
