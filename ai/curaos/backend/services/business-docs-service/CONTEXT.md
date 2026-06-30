# business-docs-service — Agent Context

**ADR-0205 §3.2** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS (ADR-0102) | Temporal client (ADR-0122) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT + mTLS (ADR-0156) | OTel (ADR-0107) | TypeSpec → REST

---

## Dependency Graph

```
business-docs-service
  ──▶ document-core-service (document storage + status transitions + presigned URLs)
  ──▶ business-esign-service (initiate signing envelope after approval)
  ──▶ crm-service (event: opportunity.stage-changed → contract workflow)
  ──▶ notify-service (counterparty delivery notifications)
  ──▶ Temporal (ADR-0122) — contract-approval + document-expiry-renewal workflows
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104
```

---

## Key Design Constraints

- **No raw bytes.** All document storage goes through document-core-service. business-docs stores only template metadata + workflow state in local PG.
- **Temporal client only.** Workflow activities run in ADR-0122 Workflow Manager.
- **Document room access** is Cerbos-gated: participants added by room creator have `viewer` access; creator has `admin`.
- **48h presigned URL for counterparty delivery** — not shorter (counterparty may be slow to act); not longer (security). Configurable per tenant (min 1h, max 7d).

---

## Files Must Not Break

- `business.document.workflow.stage-changed` Kafka topic — consumed by crm-service (activity log) and analytics.
- `business.document.delivered` — consumed by crm-service (log delivery as contact activity).
- document-core `PATCH /documents/:id/status` API contract.

---

## Test Requirements

- Integration: `contract-approval` Temporal workflow end-to-end (Temporal test server).
- Event consumer: `crm.opportunity.stage-changed` → contract workflow initiated.
- Event consumer: `business.esign.envelope.completed` → document status → `signed`.
- Presigned delivery URL: TTL enforced; expired URL returns 403 from SeaweedFS.
