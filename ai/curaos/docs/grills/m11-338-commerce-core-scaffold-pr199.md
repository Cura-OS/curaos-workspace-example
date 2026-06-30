# Grill — curaos#199 (commerce-core-service scaffold, issue #338, M11 W1 root)

> Cross-harness grill: Codex → Claude. PR `your-org/curaos#199`, branch
> `agent/m11-338-commerce-core-scaffold`. Closes `curaos-ai-workspace#338`. Grill 2026-06-03.
> W1 ROOT producer — its event catalog is what W2 (sales/procurement/inventory/accounting) scaffolds against.

## Verdict: MERGE-BLOCKED — 1 P0 + 2 P1

| ID | Sev | Finding |
|---|---|---|
| P0 | P0 | `specs/commerce.asyncapi.yaml` emits only generic `commerce.created/updated/deleted.v1` (actor envelope) — NO order/product/pricing/stock/accounting channels or typed payloads. W2 consumers cannot derive contracts. Fix: concrete resource-specific `*.v1` channels + typed payloads matching the Medusa event map in m11-commerce-sales-procurement-inventory-backend-choices.md. |
| P1-A | P1 | Domain events non-durable: `commerces.service.ts:61-73 createOrder()` calls `producer.send()` directly after engine mutation (in-memory capture default) — crash between write+publish loses the event. Fix: transactional DOMAIN outbox (distinct from the audit outbox) within the engine mutation tx → relay to Redpanda async. |
| P1-B | P1 | `COMMERCE_ENGINE` token registered as a LOCAL provider in `commerces.module.ts:25-32` → NestJS can't override an imported module's internal provider from the composition root → MedusaCommerceEngine / #354 MikroORM engine can NEVER bind; interim seam is a dead-end. Fix: `CommercesModule.register(engineProvider)` dynamic-module pattern + test proving external engine injection. |
| audit-outbox | — | CLEAN — inherits #320/#315/#331 fences correctly (claim_id additive migration, lease, terminal fence, boot-replay-before-relay). |
| tenant-isolation | — | CLEAN — tenant_id on base+audit tables, event payload/header tenant-keyed, no PHI. |
| modulith-standalone | P2 | Advisory: no hidden Drizzle/Medusa/Mikro leak observed; grill sandbox couldn't run CI (EPERM/EADDRINUSE) — orchestrator-verified 34/0 accepted; re-verify green before W2. |

## Disposition: fix P0 + P1-A + P1-B (§8 cycle 1) before merge. W2 BLOCKED on #338's corrected event catalog. The P1-B seam fix also unblocks #354 (MikroORM bind point).

## Cycle-1 fix re-grill (2026-06-03) — Codex → Claude, HEAD 4fd2df9

Cycle-0 fix landed (11 concrete channels + domain outbox + dynamic CommercesModule.register), re-grilled. bun test 47/0 green, all 3 cycle-0 findings addressed but NOT fully — verdict: **MERGE-BLOCKED — 2 P0 + 3 P1**.

| ID | Sev | Finding | Fix |
|---|---|---|---|
| RG-P0-1 | P0 | Catalog missing reverse-flow channels: no return-requested/received, refund-created/recorded, fulfillment-canceled. Inventory can't restock returns; accounting can't reverse revenue (`AccountingSaleRecordedPayload` has only order_id/amount/currency — no reversal linkage). W2 inv/accounting contracts structurally incomplete → re-blocks W2. | Add versioned neutral channels + payloads: order return requested/received/canceled, refund created/recorded, fulfillment canceled. Accounting payload needs gross/tax/shipping/discounts/payment-ref/line-allocations + reversal linkage. |
| RG-P0-2 | P0 | `commerces.service.ts:102` maps every order line `unit_amount: 0` (engine seam returns no line pricing); total is right but lines are zero. W2 sales/invoicing/accounting derive GL/invoice lines from these → inherit zero-valued lines. Synthetic test hides it w/ hardcoded price. | Extend CommerceOrder/OrderLineItem to return unitAmount+currency per line; populate payload from real data; test asserting outbox payload carries seeded price not zero. |
| RG-P1-1 | P1 | `commerces.service.ts:87` opens `outbox.transaction(...)` but engine gets no shared DB ctx (`commerce-engine.ts:66` takes only tenantId+input). Engine-write-succeeds + enqueue/commit-fails ⇒ order exists w/o event (lost event). In-memory test proves only staged-outbox rollback, not engine+outbox atomicity. | Pass shared tx/DB ctx into CommerceEngine.createOrder, or engine owns tx + invokes outbox callback on same executor. Integration test: enqueue fails after engine insert ⇒ assert no order row commits. |
| RG-P1-2 | P1 | `domain-outbox.module.ts:63` DOMAIN_OUTBOX_STORE constructed internally; `CommercesModule.register()` imports a FIXED DomainOutboxModule → composition-root override can't replace imported module's internal provider (NestJS scope). Prod can bind real Medusa engine + STILL run in-memory outbox ⇒ crash drops whole event backlog. | Make DomainOutboxModule dynamic (storeProvider/publisherProvider/relay opts) threaded through CommercesModule.register; fail-closed if real engine bound w/o PG-backed outbox store. |
| RG-P1-3 | P1 | `domain-outbox-relay.ts:113` + `domain-outbox.service.ts:324`: maxRetries=10 then markFailed ⇒ terminal `failed`, `pending()` never reselects. Broker outage >10 retry intervals ⇒ permanent auto-delivery loss, no DLQ/replay. At-least-once claim FALSE under sustained outage. | Keep retryable indefinitely w/ expo backoff + alerting, OR explicit DLQ table + documented replay requeue. Drop at-least-once claim until one exists. |

audit-outbox + tenant-isolation: still CLEAN (unchanged from cycle 0). Fix worker filed #355 (domain-outbox+dynamic-module mold-fold foresight) — confirms the predicted 2nd generator fold.

→ Cycle-2 fix dispatched (serial on curaos checkout). §8 cap = 3 cycles; this is cycle 2.

## Cycle-2 fix re-grill (2026-06-03) — Codex → Claude, HEAD 8315d70 (FINAL §8 cycle)

Cycle-1's 2 P0 + 3 P1 re-grilled. Prior findings: RG-P0-1 catalog FIXED (18 channels + drift test load-bearing), RG-P0-2 pricing FIXED (real catalog price, two distinct seeds 1299/4500 + total 7098, not theater), RG-P1-1 atomicity FIXED (tx.db threaded into engine, shared executor), RG-P1-3 relay FIXED (indefinite-pending + capped backoff + per-key non-blocking). Verdict: **MERGE-BLOCKED — 1 reclassified + 2 P1**.

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| RG2-1 | P1 (grill said P0) | Grill ran `bun test` → 43/18 EADDRINUSE in test/integration/{auth-matrix,audit-chain-e2e}. RECONCILED: plain `bun test` globs only 7 unit files = **61/0 green** (the actual `bun run ci` gate is green); `bun test test/integration/` standalone = **26/0 green**. The 18 failures are a TEST-ISOLATION artifact (two `app.listen(0)` servers in one process don't release ports / no afterAll close) — NOT a code regression, NOT a real gate-red. BUT two real test-hygiene gaps: (a) integration tests excluded from `bun run ci`'s test step (coverage gap); (b) EADDRINUSE when unit+integration run in one process (missing server teardown). Reclassified P0→P1. |
| RG2-2 | P1 | `src/index.ts` exports only CommercesModule/CommercesService. New `AccountingRefundRecordedPayload`/`AccountingSaleRecordedPayload`/`Commerce_ALL_TOPICS`/`DomainOutboxModule`/store+publisher tokens NOT exported; `package.json` exposes only `dist/index` → **W2 consumers can't import the event catalog/payload types** without reaching into internals by path. The W1 root's whole job is to be importable by W2 → genuine W2-blocker. Fix: export all `*Payload` types + Commerce_ALL_TOPICS + DomainOutboxModule/Service + tokens from src/index.ts. |
| RG2-3 | P1 | `domain-outbox.module.ts:69` fail-closed guard is `instanceof InMemoryDomainOutboxStore` only — any OTHER volatile store (Redis-no-persist, mock) bypasses the guard + boots with requireDurableStore=true, silently losing rows on restart. Fix: replace class-identity check with an explicit `isDurable` capability / `DURABLE_STORE` brand symbol all durable stores must carry; test that a non-durable custom store is REJECTED at bootstrap. |

W2 catalog gaps (order-edit/backorder/payment-failed/shipment-vs-fulfillment): grill assessed all ACCEPTABLE-SCOPE (add when W2 features need them) → capture-as-foresight, NOT blocking.
→ Cycle-3 fix dispatched (tight scope: exports + brand-symbol guard + integration-test teardown/gating). §8 cap reached; these are well-specified mechanical fixes.
