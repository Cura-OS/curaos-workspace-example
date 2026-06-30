# CONTEXT.md — procurement-core-service

## Purpose

Neutral procurement primitives (#343): purchase requisition → purchase order → receipt → 3-way match (PO ↔ receipt ↔ invoice) + an append-only budget ledger (committed-vs-actual). Owned, reused by personal + business overlays + any future vertical. Domain overlay: `neutral`.

## Domain model

- **purchase requisition** (`procurement_requisition`) — internal request to buy; status draft → submitted → approved → rejected.
- **purchase order** (`procurement_order`) — supplier-facing commitment created from an approved requisition; status open → received → matched → closed → cancelled.
- **receipt** (`procurement_receipt`) — goods/services received against a PO (3-way match leg 2); multiple partial receipts allowed.
- **invoice** (`procurement_invoice`) — supplier bill against a PO (3-way match leg 3); `match_status` unmatched → matched | exception.
- **budget** (`procurement_budget`) + **append-only ledger** (`procurement_budget_event`, kinds commit/actual/release) — remaining = allocated − Σ(open commit) − Σ(actual), PROJECTED from the ledger (research §5), never a mutable running total.
- **3-way match** is the core invariant: invoiced == ordered == Σ(received) within tolerance; a match posts `actual` + releases the commitment, a breach raises an exception (no actualization).
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`



- Neutral capability: NO PHI/PII/financial rows persisted here — overlays own protected schemas.

## Integration Points

- Consumed by `personal-procurement-service` and `business-procurement-service` (GA wave 2, #325).
- **Events produced** (durable DOMAIN outbox → `src/db/domain-outbox-relay.ts`; transactional enqueue, never direct publish), namespace `curaos.core.procurement.*.v1`, catalog in `src/events/procurement-domain-events.ts` + `specs/procurement.asyncapi.yaml`:
  - `requisition.created`, `requisition.approved`
  - `order.created`, `order.cancelled`
  - `receipt.recorded`
  - `invoice.recorded`, `invoice.matched`, `invoice.match_exception`
  - `budget.committed`, `budget.actualized` (⇨ accounting-core realizes the actual)
- **Events consumed:** commerce-core-service contract (W1 producer; blocked-by edge) — wired at the modulith composition root.
- APIs: REST `/api/v1/procurement` (gateway prefix) — TypeSpec `specs/procurement.tsp` → OpenAPI 3.1; routes mirror `src/procurements/procurements.controller.ts`.
## Open Questions

- Approval matrix beyond the in-process over-commit guard → Temporal `deal`/`approval` workflow (ADR-0204) binds at the modulith composition root.
- DSCSA/DEA chain-of-custody pharmacy fields deferred to HealthStack overlay (M12) — kept out of this neutral layer.


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/procurement-core-service/Requirements.md` — full spec
