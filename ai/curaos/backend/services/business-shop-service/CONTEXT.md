# Agent Context — business-shop-service

**ADR-0202 §3.3 · ADR-0150**
Last updated: 2026-05-24

---

## Role in CuraOS

B2B/B2C storefront overlay. Thin orchestration layer on commerce-core-service (Medusa v2). Owns tenant config, B2B account hierarchy, multi-channel setup, and POS surface. All commerce primitives (catalog, cart, pricing, fulfillment) are API calls to commerce-core — do not reimplement.

---

## Stack

NestJS (TypeScript) · MikroORM · PG17 per-tenant RLS · Valkey · PG full-text search (tsvector; ADR-0101 Q4 — OpenSearch removed from v1 stack) · Kafka 4 · Temporal (B2B approval) · TypeSpec → REST + OpenAPI 3.1

---

## Key Event Flows

**Produces:** `shop.tenant.provisioned`, `shop.b2b.order.created`
**Consumes:** `inventory.stock.updated` (PDP stock badge)

---

## Agent Operating Rules

- commerce-core-service owns catalog/cart/checkout. Never duplicate these APIs here.
- B2B purchase approval flows via Temporal only — no direct DB state mutation.
- Multi-tenant: PG17 RLS + Medusa Sales Channel. One Sales Channel per tenant storefront.
- POS barcode: browser WebHID/WebSerial — frontend concern; service provides product lookup API.
- Upgrade path: tenant hitting B2B limits upgrades from personal-shop-service to this service; data migration script required.
- Test cmd: `bun test` + `bun test:integration`.
- Lint: Biome.

---

## Implemented contract (v1, #743 - contract-mock level)

Scaffolded generator-first (`gen:service shop --business-only --core-base=commerce`)
as a cross-root overlay: the trio root is `shop` but the core it composes is
`commerce-core-service` (a generator gap the `--core-base` flag now closes - see
the workspace generatorEvolution note). The overlay imports `CommercesService`
from `@curaos/commerce-core-service` and reads inventory/analytics from
inventory-core / accounting-core at the composition root.

REST surface (`specs/shop.tsp`, mirrored 1:1 in `src/shops/business-shops.controller.ts`):

- `GET  /business-shops/health` - liveness (any authenticated principal).
- `GET  /business-shops/protected` - role-matrix proof (clinician, tenant-admin).
- `GET  /business-shops/whoami` - JWT principal echo.
- `POST/GET/PATCH/DELETE /business-shops/products` (+ `/products/{id}`) - catalog CRUD (tenant-admin writes; soft-delete = archive).
- `GET/PATCH /business-shops/orders` (+ `/orders/{id}`) - order management.
- `POST /business-shops/orders/{id}/fulfill` - fulfillment state machine (placed|paid|fulfilling -> fulfilled; 409 on illegal transition).
- `GET  /business-shops/inventory` - inventory dashboard projection (from inventory-core).
- `GET  /business-shops/analytics` - org sales-analytics summary (from accounting-core).

Domain events (`specs/shop.asyncapi.yaml`, `curaos.business.shop.*` namespace):
`product.created`, `order.placed`, `order.fulfilled`. Replayable envelope fixtures
under `test/fixtures/`. Done gate (create product -> fulfill order smoke) covered
by `test/business-shops.domain.test.ts`.

Money is minor-unit decimal STRING on the wire (#369). Identity (`tenantId`,
`actorId`, `correlationId`) is JWT-derived only; strict Zod DTOs reject smuggled
identity keys.
