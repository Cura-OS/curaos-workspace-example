---
name: curaos-backend-libs
description: "@curaos/* npm scope (15 TypeScript libs per ADR-0209) + additional stubs/PoC/internal packages."
tags: [index, packages]
language: typescript
framework: none
infrastructure: PostgreSQL (CNPG)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  npm-libs: ./
adrs:
  - ADR-0121d
  - ADR-0121e
  - ADR-0153
  - ADR-0209
modules:
  npm:
    - "@curaos/core"
    - "@curaos/auth-sdk"
    - "@curaos/audit-sdk"
    - "@curaos/tenancy"
    - "@curaos/events"
    - "@curaos/codegen-sdk"
    - "@curaos/plugin-runtime"
    - "@curaos/policy"
    - "@curaos/observability"
    - "@curaos/fhir-client"
    - "@curaos/recurrence"
    - "@curaos/secrets"
    - "@curaos/canvas"
    - "@curaos/forms"
    - "@curaos/ui"
---

# curaos-backend-libs

Shared library registry. `@curaos/*` npm scope (15 ADR-0209 libs) + additional stubs/PoC/internal packages.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- Per-lib docs live in sibling package directories under this folder.

## npm lib commands
```bash
bunx turbo run build --filter="@curaos/*"
bunx turbo run test --filter="@curaos/*"
bunx turbo run lint --filter="@curaos/*"
bun publish --registry=http://verdaccio:4873  # publish to Verdaccio
```
