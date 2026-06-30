---
name: org-core-service
description: "Neutral primitive M9-S4. Read Requirements.md + CONTEXT.md first."
tags: [service, core]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/org-core-service/CONTEXT.md
  requirements: ai/curaos/backend/services/org-core-service/Requirements.md
type: backend-service
milestone: M9
parent: ai/curaos/backend/services/
owner: Platform Engineering
status: active
---

# AGENTS.md - org-core-service

> Neutral primitive M9-S4. Read [Requirements.md](Requirements.md) + [CONTEXT.md](CONTEXT.md) first.

## Binding rules

- [[curaos-postgres-rule]] - Citus PG 17, forward-only Drizzle migrations.
- [[curaos-bun-primary-rule]] - Bun runtime + test.
- [[curaos-foundation-runtime-directives]] - Idempotency-Key header support.
- [[curaos-generator-evolution-rule]] - every src/*.ts file carries `// codegen-source:` marker.
- ADR-0210 Diamond model - 1:1 inward FK `orgs.actor_id UNIQUE`.

## Hard rules

- NEVER amend ADR-0210.
- NEVER bypass tenant scoping (reads MUST filter on `principal.tenantId`).
- NEVER add a hard DELETE on membership rows (always soft-delete via `valid_to=now()`).
- NEVER introduce per-resource lock in the outbox (use durable outbox + cron publisher).
- ASK before adding a new outbox topic family (current: `org.*.v1` + `org-membership.*.v1`).
- ALWAYS run `bun run ci` before claiming a change is done.
- ALWAYS keep audit chain head keyed `(tenant_id, resource_type, resource_id)` - collapsing the resource_type axis re-introduces the M9-S4 codex P1.
