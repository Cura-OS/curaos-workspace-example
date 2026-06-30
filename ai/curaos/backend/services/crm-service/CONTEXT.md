# crm-service — Agent Context

**ADR-0205 §3.6** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack (locked by ADR-0205 + ADR-0100)

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (schema-per-tenant, ADR-0101) |
| Cache | Valkey — party-service denormalized read cache |
| Messaging | Kafka/NATS + outbox (ADR-0102) |
| Workflow | Temporal client via `@curaos/workflow-client` (deal-pipeline workflow in ADR-0204) |
| Auth | Better Auth + Cerbos ABAC (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) — mandatory |
| Token flow | JWT Layer 1 (user) + mTLS Layer 3 (service) per ADR-0156 |
| Audit | Hash-chain PG per ADR-0104 |
| Observability | OTel + Grafana (ADR-0107) |
| API spec | TypeSpec → REST + tRPC |

---

## Dependency Graph

```
crm-service
  ──▶ party-service (ADR-0200) — contact/account identity (read)
  ──▶ commerce / payment (ADR-0202) — opportunity value currency reference
  ──▶ business-docs-service — contract generation trigger (via event)
  ──▶ business-esign-service — signed contract linkage (via event)
  ──▶ notify-service (ADR-0203) — stage-change notifications
  ──▶ Temporal (ADR-0122) — deal-pipeline workflow via workflow-client
  ──▶ PostgreSQL 17, Valkey, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104

Consumed by:
  business-docs-service (crm.opportunity.stage-changed → contract workflow)
  business-cases-service (crm.opportunity.lost → churn case auto-create)
```

---

## Key Design Constraints

- **Party-service is source of truth.** Never store `name`, `email`, `phone` in crm-service PG. Read via party-service API. Cache in Valkey (`party:{id}:summary`) with `party.updated` invalidation.
- **No AGPL/GPL imports.** EspoCRM (GPLv3), SuiteCRM/Twenty (AGPL) are rejected. CI SBOM check must gate any new dependency.
- **Custom fields via jsonb.** `contact.custom_fields` and `opportunity.custom_fields` accept arbitrary tenant-defined fields. No schema migration required to add CRM fields. Indexed via PG jsonb GIN index for common lookups.
- **Pipeline stages are tenant data, not code.** `Pipeline.stages` is a jsonb array; stages are created/modified via API, not migrations.
- **Probability AI is optional.** LiteLLM integration (ADR-0114) is gated by `feature_flags.crm_ai_scoring`. Off by default.

---

## Files Must Not Break

- `db/migrations/crm/` — additive migrations only.
- `crm.opportunity.stage-changed` Kafka topic — consumed by business-docs-service (contract workflow trigger).
- `crm.opportunity.won` / `crm.opportunity.lost` Kafka topics — consumed by analytics (ADR-0113).
- Party read path — any change to party-service API contract may break crm-service contact resolution.

---

## Modulith vs Microservice (ADR-0099 §5)

Runtime flag controls topology. In microservice mode: REST + tRPC APIs exposed; inter-service calls via Kafka or gRPC.

---

## Test Requirements

- Unit: pipeline stage transition logic, contact status machine, activity type routing.
- Integration: party-service read → contact resolution (mock party-service).
- Contract: `crm.opportunity.stage-changed` event schema matches business-docs-service consumer expectation.
- ABAC: rep role → `GET /opportunities` returns only assigned opportunities; manager role → all.
- E2E: opportunity reaches `won` → event emitted → analytics consumer receives (kafka contract test).
- SBOM: CI step asserts no AGPL/GPL package in dependency tree.
