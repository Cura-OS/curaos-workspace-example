---
name: business-projects-service
description: CuraOS-native project management - Kanban, Gantt (client-rendered), dependency graph, critical path.
tags: [service, business]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
tooling:
  - bun
  - typespec
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
  adr: ai/curaos/docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: nodejs
---

# business-projects-service

CuraOS-native project management. Plane (AGPL) is UX reference only - not imported. Gantt is client-rendered; server provides critical path computation.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint (hard):** Plane (AGPL) not imported. CI SBOM gates this.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.12

## Agent operating rules (module-local)

- No Gantt rendering on backend - return flat task + dependency lists; Builder App renders client-side.
- Task `position` is float (midpoint insertion); rebalance when gap < 0.001.
- No TimeEntry storage here - time data lives in hr-service; aggregate via events.
- Critical path: pure TypeScript DAG topological sort; no graph library unless benchmarked necessary.
- Any new dependency must pass SBOM check - propose before adding.
