# donation-core-service — Agent Context

**ADR-0205 §3.7** | Neutral core | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | BullMQ + `@nestjs/schedule` (recurring jobs) | Kafka/NATS (ADR-0102) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT + mTLS (ADR-0156) | OTel (ADR-0107)

---

## Dependency Graph

```
donation-core-service
  ──▶ commerce-core-service (Payment provider, ADR-0202) — payment processing; receives payment_ref
  ──▶ party-service (ADR-0200) — donor_party_id validation
  ──▶ PostgreSQL 17, BullMQ, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104

Consumed by:
  business-donation-service (donation.completed → receipt generation)
  personal-donation-service (donation.completed → personal ledger)
```

---

## Key Design Constraints

- **No payment credentials.** `payment_ref` is a commerce-core-service (Payment provider) UUID. donation-core never stores card numbers, bank accounts, or any raw payment data.
- **Recurring schedule via BullMQ.** `next_due_at` is a delayed BullMQ job; on fire, emit `donation.recurring.due` and update schedule. No cron expression in code — compute `next_due_at` from frequency at schedule creation.
- **`donor_party_id` is party-service reference.** No name or email stored in donation-core.

---

## Files Must Not Break (implemented #351)

- `curaos.core.donation.received.v1` Kafka topic — consumed by business/personal-donation (receipt + ledger).
- `curaos.core.donation.recurring.due.v1` — consumed by business-donation + commerce for the retry charge.
- `curaos.core.donation.receipt.issued.v1` — consumed by document-core (PDF render, GA wave 2).
- commerce-core published contract `curaos.core.commerce.order.paid.v1` + `…refund.recorded.v1` — mirrored
  locally in `src/events/commerce-consumer.ts` (NO cross-submodule import); a commerce `*.v1` rename would
  break the consumer.
- Durable domain outbox: every `donation.*` event is enqueued via `DomainOutboxService.enqueueWith(tx.db, …)`
  INSIDE the mutation tx (durable-iff-write); the post-commit relay ships it. The in-process
  `donation-event-producer.ts` (the codegen CRUD stub) is NOT on the domain path.

## Implementation map (#351)

- `drizzle/schema.ts` + `drizzle/migrations/0003_donation_domain.sql` — donation/campaign/recurring/receipt tables.
- `src/donations/donation-store.ts` — narrow store seam (`DONATION_STORE`), in-memory + Postgres backends.
- `src/donations/donations.service.ts` — pledge / confirm (commerce sink) / refund / recurring-due / receipt.
- `src/donations/recurrence.ts` — `next_due_at` computation (no cron string).
- `src/events/donation-domain-events.ts` — the `donation.*` catalog + message builder.
- `src/events/commerce-consumer.ts` — the consumed-commerce contract + router (`DonationCommerceSink`).
- `src/donations/{donation.dto,donations.controller}.ts` — Zod write surface + REST (campaigns/pledges/receipt).

---

## Test Requirements

- Recurring schedule: BullMQ delayed job fires → event emitted → `next_due_at` updated.
- Campaign progress: sum of `completed` donations equals tracked goal progress.
- No payment credentials in PG: schema assertion test.
