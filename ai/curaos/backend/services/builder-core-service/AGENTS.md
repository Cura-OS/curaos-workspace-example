---
name: builder-core-service
description: "DSL persistence, hydration composer, theme management, and Payload CMS host for Sites content. Backend for M4 Builder v0."
tags: [service, backend, builder, platform]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3
tooling: Bun, Drizzle, Payload v3, "@curaos/tenancy", "@curaos/audit-sdk"
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/builder-core-service/CONTEXT.md
  requirements: ai/curaos/backend/services/builder-core-service/Requirements.md
---

# builder-core-service - Agents Contract

Backend service for M4 Builder v0. Surface DSL persistence, hydration composer, theme management, Payload CMS host for Sites content.

See:
- [Requirements](./Requirements.md)
- [CONTEXT](./CONTEXT.md)
