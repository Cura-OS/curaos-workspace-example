# business-donation-service — Agent Context

**ADR-0205 §3.8** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS (ADR-0102) | Temporal client (ADR-0122) | `pdf-lib` MIT (receipt PDF rendering) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT + mTLS (ADR-0156) | OTel (ADR-0107)

---

## Dependency Graph

```
business-donation-service
  ──▶ donation-core-service (donation primitives, event consumer)
  ──▶ document-core-service (tax receipt PDF storage)
  ──▶ party-service (donor_party_id resolution)
  ──▶ notify-service (receipt delivery to donor)
  ──▶ commerce-payment-service (ADR-0202) — payment retry on recurring.due
  ──▶ Temporal (ADR-0122) — grant-reporting workflow
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104
```

---

## Key Design Constraints

- **`pdf-lib` MIT only** for receipt PDF rendering. No AGPL PDF library.
- **Donor entity** extends party-service reference; no name/email in local PG.
- **Receipt number** is tenant-scoped sequential: PG sequence per tenant; format configurable (e.g., `{YEAR}-{SEQ}`).
- **Grant workflow client only.** `@curaos/workflow-client` schedules `grant-reporting`; workers in ADR-0122.

---

## Files Must Not Break

- `business.donation.receipt.issued` Kafka topic — may be consumed by accounting-service.
- document-core `POST /documents` API — receipt PDF upload.
- `donation.completed` event schema (donation-core produces; business-donation consumes).

---

## Test Requirements

- `donation.completed` → receipt PDF rendered → stored → notify sent (integration with mock services).
- Grant milestone: Temporal test server; activity fires at correct due date.
- Receipt numbering: concurrent receipts in same tenant don't collide (PG sequence test).
- OQ-5 tracking: receipt template locale selection tested with US 501(c)(3) template.
