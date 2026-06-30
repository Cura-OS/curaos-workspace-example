# personal-donation-service — Agent Context

**ADR-0205 §3.9** | Personal overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS consumer (ADR-0102) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT Layer 1 (ADR-0156) | OTel (ADR-0107)

---

## Dependency Graph

```
personal-donation-service
  ──▶ donation-core-service (donation records, campaign names via event or API)
  ──▶ PostgreSQL 17, Kafka/NATS consumer
  ──▶ ADR-0120 + ADR-0155

Consumes events from:
  donation-core-service (donation.completed → personal ledger)
```

---

## Key Design Constraints

- **Read-only overlay.** All donation records originate in donation-core. personal-donation-service only adds personal categorization metadata.
- **Owner-scoped.** All queries scoped to `user_party_id = current_user.party_id`.
- **No grant or campaign management.** Strictly personal tax record keeping.

---

## Files Must Not Break

- `donation.completed` event schema (donation-core produces; must not change shape without versioning).

---

## Test Requirements

- `donation.completed` event consumer → `PersonalDonationRecord` created.
- Tax year summary: correct aggregation across multiple donations, orgs, categories.
- CSV export: valid format, correct column headers for tax filing.
- Owner scope: user A cannot read user B's records.
