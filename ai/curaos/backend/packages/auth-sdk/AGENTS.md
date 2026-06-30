---
name: curaos-auth-sdk
description: "Stub path for @curaos/auth-sdk; real package lives under identity-service and includes typed auth client plus JOSE/JWKS/DPoP primitives."
tags: [package, sdk]
language: typescript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/auth-sdk"
adrs:
  - ADR-0120
  - ADR-0209
target: browser+native
status: stub
---

# @curaos/auth-sdk

> STUB: no package.json or source lives at this root path. Real home = curaos/backend/services/identity-service/packages/auth-sdk/ (built via the identity-service build:sdk script; published as @curaos/auth-sdk).

The nested package owns the typed identity-service auth client and JOSE/JWKS/DPoP primitives.

## Commands
```bash
bunx turbo run build --filter=@curaos/auth-sdk
bunx turbo run lint --filter=@curaos/auth-sdk
bunx turbo run test --filter=@curaos/auth-sdk
```
