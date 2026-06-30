# CONTEXT.md — accounting-core-service

## Purpose

Neutral GENERIC double-entry ledger engine (#345, ADR-0205). The durable-event
SINK of `commerce → {sales,procurement,inventory} → accounting`. Owned, reused by
personal + business overlays + any future vertical. Domain overlay: `neutral`.

Core capability: a chart of accounts + balanced journal entries (every entry
satisfies Σdebits == Σcredits) + an append-only general ledger. Posts GL entries
from W2 domain events; WHICH accounts an event touches is config policy
(`posting-rules.ts`), keeping the core engine event-agnostic.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`



- Neutral capability: REFERENCE-ONLY — account codes + integer-minor amounts +
  opaque source refs. NO PHI/PII; overlays own protected schemas.

## Domain model (#345)

- `account` — chart of accounts (code, type asset|liability|equity|revenue|expense,
  normal_side debit|credit). Unique per (tenant, code).
- `journal_entry` — append-only balanced transaction header. DB DEFERRED
  CONSTRAINT TRIGGER `journal_entry_balance_check` rejects an unbalanced entry
  (Σdebits != Σcredits) or one with <2 postings at COMMIT.
- `posting` — append-only GL line; `side` + positive `amount_minor` (BIGINT).
  `posting_side_amount_check` enforces one-of-side + amount > 0.
- `processed_event` — consumer idempotency ledger; PK (tenant, source_event_id).
- Append-only: immutability triggers block UPDATE/DELETE on journal_entry +
  posting (corrections are reversing entries).
- MONEY = BIGINT minor units, `bigint` end-to-end + STRING on the wire
  (foresight #369 — never a JS `number` above 2^53).

## Integration Points

- Consumed by `personal-accounting-service` and `business-accounting-service`
  (GA wave 2, #325).
- Events PRODUCED: `curaos.core.accounting.journal.posted.v1` (via the durable
  domain outbox + post-commit relay) + the scaffold CRUD envelope
  (`curaos.core.accounting.{created,updated,deleted}.v1`).
- Events CONSUMED (W2 sink, `src/events/w2-consumer.ts` — local pinned contract
  subsets, no cross-submodule code import per [[curaos-repo-boundary-rule]]):
  - `curaos.core.sales.invoice.finalized.v1`     → DEBIT AR / CREDIT Revenue
  - `curaos.core.procurement.invoice.matched.v1`  → DEBIT Expense / CREDIT AP
  - `curaos.core.inventory.stock.received.v1`     → DEBIT Inventory / CREDIT GRNI
- APIs: REST `/accountings` — `POST accounts`, `GET accounts/:id/balance`,
  `POST entries`, `GET entries/:id`. tenant + actor JWT-derived (TenantInterceptor
  + AuthGuard), never body-trusted.

## Decisions

- Double-entry invariant enforced at TWO layers: service `assertBalanced` (typed
  400) + DB deferred trigger (the guarantee).
- Idempotent consumer: dedupe on source `event_id` recorded in `processed_event`
  inside the posting tx (unique-key/row-lock) + a fast pre-check. At-least-once safe.
- Durable-iff-write: ledger write + outbox `enqueueWith(tx.db,…)` + processed
  marker in ONE tx.
- Posting rules are the overlay seam: a tenant may supply a different
  `PostingRuleSet`; default GAAP-style chart auto-seeds on first post.

## Open Questions

- No dedicated chart-of-accounts / GAAP-vs-IFRS ADR yet — the cluster-default
  chart (ADR-0205) is used; flag a follow-up ADR if a tenant needs richer COA
  semantics (multi-currency revaluation, period close via Temporal).


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/accounting-core-service/Requirements.md` — full spec
