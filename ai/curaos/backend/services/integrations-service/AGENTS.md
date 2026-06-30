---
name: integrations-service
description: iPaaS-class connector runtime - Activepieces CE (330+ connectors), OpenBao v2.x per-tenant credential vault, OAuth PKCE, webhook registry, rate-limit proxy. NestJS TypeScript. ADR-0206.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API)
tooling:
  - bun
  - vitest
  - eslint
  - prettier
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  readme: README.md
runtime: node22
adr: 0206
---

# integrations-service

External system integration hub. Hosts Activepieces CE connector runtime, manages per-tenant OpenBao credential vault, handles OAuth 2.0 PKCE flows, inbound webhooks, and outbound rate limiting.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first (charter, NFRs, operating rules). This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot. ADR-0206 mandates NestJS for all 10 cluster services.

**Key constraint:** OpenBao v2.x (NOT HashiCorp Vault). Activepieces CE pieces-framework (NOT custom connector engine from scratch). Plugin sandbox via `worker_threads` (NOT separate processes).

**Do not** import overlay modules. Overlays call integrations-service via tRPC or REST webhook endpoint.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, tooling, OpenBao namespace convention, plugin contract, commands
- [Requirements](Requirements.md) - capabilities, API surface, events, security, Done criteria
