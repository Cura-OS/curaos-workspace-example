---
name: hr-service
description: CuraOS-native HR overlay - employee directory, compensation, leave, performance, time tracking.
tags: [service, neutral]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - bun
  - typespec
  - temporal-client
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  adr: ../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: bun
---

# hr-service

CuraOS-native HR overlay. Extends party-service + org-service with HR-specific attributes. No AGPL/GPL HR product imported.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint (hard):** Frappe HR, OrangeHRM, Kimai are GPL/AGPL. Do not import. Build CuraOS-native NestJS module only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, dependency graph, constraints
- [Requirements](Requirements.md) - entities, API, events, DoD
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.10

## Agent operating rules (module-local)

- Never store person identity data (name, email, photo) in hr-service PG. Reference party-service UUID only.
- Compensation fields (`base_salary`, `allowances`, `equity_units`) must be gated by Cerbos ABAC - never returned to non-HR-manager role via any API.
- Leave balance must be updated in same PG transaction as leave status change - no eventual consistency for balance.
- Use `@curaos/workflow-client` for Temporal - do not register Temporal workers in this service.
- Any payroll-related endpoint is read-only export. No payment logic, no tax calculation.
- Audit every compensation change and status change via `@curaos/audit` interceptor.
