---
name: curaos-identity-federation
description: "Provider-neutral identity federation adapter contracts and SAML primitives."
tags: [package, identity, security, federation]
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
npm: "@curaos/identity-federation"
target: node
---

# @curaos/identity-federation

Provider-neutral federation primitives. Treat all changes as auth-sensitive.

## Mission

Provide provider-neutral identity federation and SAML primitives.

## Toolchain Registry

- Typecheck: `bun run --filter @curaos/identity-federation typecheck`
- Build: `bun run --filter @curaos/identity-federation build`

## Judgment Boundaries

- Do not make malformed assertions permissive.
- Do not add managed-provider lock-in.
- Do not edit code-repo files from this mirror directory.

## Agent contract

- Read [CONTEXT.md](CONTEXT.md) before changing behavior.
- Read [Requirements.md](Requirements.md) before changing exported APIs.
- Add security-focused tests for parser or assertion handling changes.

## Commands

```bash
bun run --filter @curaos/identity-federation typecheck
bun run --filter @curaos/identity-federation build
```
