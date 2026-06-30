---
name: curaos-tenancy
description: "Tenant resolution, React context, header injection, and TenantConfig for multi-tenant frontend isolation."
tags: [package]
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
npm: "@curaos/tenancy"
adrs:
  - ADR-0209
target: isomorphic
---

# @curaos/tenancy

Tenant resolution + context. OIDC claim → subdomain → header priority. TenantConfig cache.

## Commands
```bash
bunx turbo run build --filter=@curaos/tenancy
bunx turbo run lint --filter=@curaos/tenancy
bunx turbo run test --filter=@curaos/tenancy
```
