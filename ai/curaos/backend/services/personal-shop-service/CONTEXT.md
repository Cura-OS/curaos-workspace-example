# Agent Context — personal-shop-service

**ADR-0202 §3.4 · ADR-0150**
Last updated: 2026-05-24

---

## Role in CuraOS

Lightweight solo-seller overlay on commerce-core-service (Medusa v2). Thin NestJS orchestration + lightweight admin UI. All catalog/cart/checkout via commerce-core APIs. Does not own inventory, multi-warehouse, or B2B account hierarchy. Upgrade path = business-shop-service.

---

## Stack

NestJS (TypeScript) · MikroORM · PG17 per-tenant RLS · Valkey · Kafka 4 · Temporal (subscription billing) · TypeSpec → REST + OpenAPI 3.1

---

## Digital Delivery

- SeaweedFS (ADR-0101) signed URLs for download fulfillment.
- Expiry-gated download token: time-limited JWT referencing SeaweedFS object key.
- Token revoked on refund.

## Subscription Billing

- Temporal workflow: renewal → payment attempt → dunning (retry schedule) → grace period → cancellation.
- `PaymentProvider` abstraction (ADR-0154): local Temporal default; Stripe Billing BYO via plugin (ADR-0202).

---

## Agent Operating Rules

- Commerce primitives from commerce-core-service only. Never duplicate catalog/cart logic.
- Digital token must expire. Never serve permanent download URLs.
- Subscription state transitions via Temporal only.
- Provisioning target: < 30 s from signup POST to shop live. Alert if exceeded in staging.
- No multi-currency at launch; reject multi-currency feature requests until OQ-07 resolved.
- Test cmd: `bun test` + `bun test:integration`.
- Lint: Biome.

---

## Implemented contract (v1, #776 - contract-mock level)

Scaffolded generator-first (`gen:service shop --personal-only --core-base=commerce`)
as a cross-root overlay: trio root `shop`, core `commerce-core-service`. The
overlay imports `CommercesService` from `@curaos/commerce-core-service`.

REST surface (`specs/shop.tsp`, mirrored 1:1 in `src/shops/personal-shops.controller.ts`):

- `GET  /personal-shops/health` - liveness.
- `GET  /personal-shops/protected` - role-matrix proof (clinician, tenant-admin).
- `GET  /personal-shops/whoami` - JWT principal echo.
- `POST/GET/PATCH/DELETE /personal-shops/listings` (+ `/listings/{id}`) - seller product management (seller-owned; soft-delete = archive).
- `GET  /personal-shops/storefront` - public published-listing feed.
- `POST/GET /personal-shops/orders` (+ `/orders/{id}`) - order placement + tracking (buyer/seller scoped).
- `POST/GET /personal-shops/payouts` - seller payout request + history.
- `POST /personal-shops/messages` + `GET /personal-shops/messages/{threadId}` - buyer-seller messaging.

Domain events (`specs/shop.asyncapi.yaml`, `curaos.personal.shop.*` namespace):
`listing.created`, `order.placed`, `payout.requested`. Replayable envelope
fixtures under `test/fixtures/`. Smoke (create listing -> place order -> payout)
covered by `test/personal-shops.domain.test.ts`.

Money is minor-unit decimal STRING on the wire (#369). `sellerId`/`buyerId`/
`tenantId`/`correlationId` are JWT-derived only; strict Zod DTOs reject smuggled
identity keys; seller-isolation enforced on listing mutations.
