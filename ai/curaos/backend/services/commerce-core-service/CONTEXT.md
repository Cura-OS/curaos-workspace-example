# Agent Context — commerce-core-service

**ADR-0202 §3.1 · ADR-0150 · ADR-0100 · ADR-0154**
Last updated: 2026-06-03

---

## Role in CuraOS

Foundation commerce engine. Every commerce overlay (business-shop, personal-shop) and HealthStack supply-chain module calls commerce-core APIs. It does not call any overlay service. Dependency direction: overlays → commerce-core → inventory-core-service, accounting-service, notify-service.

---

## Stack

- **Runtime:** NestJS (TypeScript), Medusa.js v2 (MIT) as embedded module library
- **ORM:** MikroORM (Medusa v2 native)
- **DB:** PG17 per-tenant schema RLS
- **Cache:** Valkey
- **Search:** OpenSearch (product catalog faceted search)
- **Events:** Kafka 4
- **Workflows:** Temporal (Medusa Workflows SDK)
- **Secrets:** OpenBao
- **Auth:** Better Auth + OPA/Cerbos RBAC
- **API:** TypeSpec → REST + OpenAPI 3.1; optional Mercurius GraphQL facade

---

## Medusa v2 Module Adoption

| Module | Status |
|---|---|
| Catalog, Cart, Order | Core — implement first |
| Pricing, Promotion, Tax | Core — implement with Catalog |
| Fulfillment, Return/Claim | Core — implement with Order |
| Payment | Core — implement with PaymentProvider abstraction |
| Customer, Auth, Notification | Core — auth delegates to Better Auth (ADR-0120) |
| Currency, Region, Sales Channel | Core — multi-tenant isolation via Sales Channel |
| Analytics | Optional — ClickHouse (ADR-0113) preferred for analytics |

---

## Provider Wiring (ADR-0154)

Injection token: `PAYMENT_PROVIDER`, `TAX_PROVIDER`, `FULFILLMENT_PROVIDER`, `EXCHANGE_RATE_PROVIDER`.

All providers registered via `<Domain>ProviderModule` factory. Config validated with Zod at bootstrap. Each provider exposes `healthCheck()` polled by NestJS health endpoint.

Default payment provider: Medusa Payment Module self-hosted. Stripe Connect Accounts v2 is primary 3rd-party — feature-gated until the deferred Payments ADR finalizes (number TBD; slot 0210 was reassigned to M9 Diamond Model).

---

## Multi-Tenant Isolation

- Auth token → tenant ID extraction in NestJS middleware (ADR-0120 JWT claim).
- MikroORM entity manager scoped to tenant schema per request.
- Medusa Sales Channel: one channel per tenant storefront; catalog + pricing scoped to channel.
- OQ-06: integration test must confirm zero cross-tenant leakage at MikroORM layer before first release.

---

## Key Event Flows

Concrete catalog lives in `src/events/commerce-event-producer.ts` and is mirrored
1:1 into `specs/commerce.asyncapi.yaml` (drift-guarded by a test). Namespace:
`curaos.core.commerce.<resource>.<action>.v1`; snake_case on the wire; payloads
tenant-scoped, neutral (no PHI). commerce-core is the **M11 W1 ROOT producer** —
W2 (sales / procurement / inventory / accounting) derive consumer contracts from
these, so channels are a stable forward-only contract (add `*.v2`, never rename).

**Produces (18 channels):**
- ORDER LIFECYCLE: `order.created`, `order.paid`, `order.fulfilled`, `order.canceled`
- REVERSE FLOW (#338 RG-P0-1 — inventory restock + accounting reversal): `order.return_requested`, `order.return_received`, `order.return_canceled`, `refund.created`, `refund.recorded`, `fulfillment.canceled`
- PRODUCT/CATALOG: `product.created`, `product.updated`, `product.deleted`
- PRICING: `price.updated`
- INVENTORY RESERVATION: `inventory.reservation.created`, `inventory.reservation.released`
- ACCOUNTING BRIDGE: `accounting.sale.recorded` (gross/tax/shipping/discounts + per-line allocations + payment ref), `accounting.refund.recorded` (GL reversal linked to the original sale's `event_id`)

`order.created` → sales (B2B invoice + commission), inventory (reserve);
`order.fulfilled` → inventory (decrement); reverse-flow + `accounting.refund.recorded`
→ inventory (restock) + accounting (reverse revenue).

### W2 event tranche #357 (2026-06-05)

Research artifact:
`research/2026-06-05-issue-357-commerce-w2-event-tranche.md`.

No new event channels were added for #357. The acceptance gate requires a current
W2 consumer/workflow for every added channel, and the checked-out workspace has
none for the candidate tranche. Keep these candidates documented-only until the
named owner and consumer exist:

| Candidate | Owner boundary | Current consumer/workflow | Decision |
|---|---|---|---|
| `order.edited` | commerce-core-service order mutation workflow | None found | Documented only until mutable order workflow exists |
| `order.line_changed` | commerce-core-service line-delta workflow | None found | Documented only until line-level post-sale delta workflow exists |
| `inventory.backorder` | inventory-core-service | None found | Do not implement in commerce-core-service |
| `out_of_stock` | inventory-core-service | None found | Do not implement in commerce-core-service |
| `payment.failed` | payment provider / payment workflow | None found | Documented only; blocked by deferred Payments ADR and `payments-spec-ready` |
| shipment-vs-fulfillment split | commerce fulfillment workflow | None found | Documented only until partial shipment workflow exists |

Future implementation must add the event producer, AsyncAPI channel, root export,
and producer+consumer/contract test in the same PR that introduces the consuming
workflow.

**Consumes:**
- `sales.order.created` (from sales-core-service on quote acceptance — triggers commerce order creation)
- `inventory.stock.updated` (for availability display)

### Durability + atomicity (#338)

- Domain events ride a durable **domain outbox** (`src/db/domain-outbox.*`) enqueued INSIDE the engine-mutation transaction; the engine write + outbox enqueue share ONE executor (threaded via `CommerceEngine.createOrder(…, executor)`), so an enqueue/commit failure rolls the order back too (RG-P1-1, no orphan order with a lost event).
- The relay is **at-least-once with exponential backoff and NO terminal `failed`** (RG-P1-3): a row stays pending+deliverable indefinitely; `maxRetries` is an alert threshold, not a give-up cap — a broker outage recovers automatically.
- `DomainOutboxModule.register({ storeProvider, publisherProvider, requireDurableStore })` is a DYNAMIC module (RG-P1-2): the composition root injects a Postgres store + sets `requireDurableStore: true` when binding a real engine; bootstrap FAILS CLOSED if a real engine runs against a non-durable store.
- The fail-closed guard checks an explicit **capability contract**, not class identity (RG2-3): `DomainOutboxStore.isDurable` (`InMemoryDomainOutboxStore = false`, `PostgresDomainOutboxStore = true`). It rejects ANY store whose `isDurable !== true` under `requireDurableStore` — so a Redis-without-persistence store, a test mock, or any future volatile store cannot slip past an `instanceof InMemoryDomainOutboxStore` check and silently lose rows on restart.
- Order line items carry the engine-resolved per-line `unitAmount` (RG-P0-2) — the `OrderCreated` payload's `line_items[].unit_amount` is real catalog pricing, never 0.

### Public export surface (#338 RG2-2)

`src/index.ts` (→ `dist/index`, the package root `@curaos/commerce-core-service`) is the **W2 consumer contract**: W2 services import the event catalog (all `*_TOPIC` consts, `Commerce_EVENT_TOPIC`, `Commerce_ALL_TOPICS`, the `CommerceEventType` union, every `*Payload` type, `buildCommerceMessage`/`baseFields`/`partitionKey`) and the durable domain-outbox subsystem (`DomainOutboxModule`, `DomainOutboxService`, `DomainOutboxRelayService`, the stores, and the DI tokens `DOMAIN_OUTBOX_STORE`/`DOMAIN_OUTBOX_PUBLISHER`/`DOMAIN_OUTBOX_MODULE_OPTIONS`) from the ROOT — never by reaching into `src/` by path. `test/public-export-surface.test.ts` asserts every public symbol stays exported (value exports at runtime; type exports anchored at compile time so a drop fails `tsc --noEmit`).

---

## Agent Operating Rules

- Read `Requirements.md` before any implementation task.
- Run `Medusa v2` module docs via `ctx7 medusajs` before writing module integration code.
- Multi-tenant: never omit RLS guard. Every query must pass tenant schema through MikroORM context.
- Monetary values: always integer minor units + ISO 4217 code. Reject floats at schema boundary.
- Provider changes: update provider interface in `@curaos/commerce-core-provider` package; bump minor version; announce deprecation if removing capability.
- Payment features: gate behind `payments-spec-ready` feature flag (Unleash) until Stripe Connect spec is finalized (deferred Payments ADR — number TBD; slot 0210 was reassigned to M9 Diamond Model).
- Test cmd: `bun run test` (unit) + `bun run test:integration` (the Nest/HTTP integration matrix under `test/integration/`). Both are wired into `bun run ci` (the gate), so the integration suite is no longer a coverage gap (#338 RG2-1). Integration tests use supertest against `app.getHttpServer()` and MUST NOT call `app.listen()` — supertest binds an ephemeral port itself; a real `.listen()` leaks a socket that races `app.close()` and EADDRINUSEs the combined unit+integration run. Always tear down with `await app.close()` in `afterEach`/`afterAll`. (The current integration matrix is in-process and infra-free; a future real-infra suite needing PG17/Kafka must be gated behind its own clearly-named script, not silently left ungated.)
- Lint: Biome (no Prettier/ESLint).

---

## Open Questions

- OQ-01: Deferred Payments ADR (number TBD; slot 0210 was reassigned to M9 Diamond Model) — Stripe Connect Accounts v2 full integration spec (blocks payment features).
- OQ-06: MikroORM RLS integration test (blocks first release).
- OQ-07: Multi-currency deferred for personal-shop — determine promotion threshold to business-shop.
