# ADR-0202 — Wave 1 Lite Cluster: Commerce + Sales + Procurement + Inventory

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Commerce + Sales + Procurement + Inventory (6 services)
**Parent ADRs (baseline canonical):**
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data](0101-data-layer.md)
- [ADR-0102 Event Messaging](0102-event-messaging.md)
- [ADR-0103 API](0103-api-surface.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0108 Security](0108-security-secrets.md)
- [ADR-0120 Auth](0120-foundation-auth.md)
- [ADR-0122 Workflow](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0121a Sites](0121a-foundation-sites.md) — Medusa.js precedent set here

---

## 1. Scope

### Services in cluster

| Service | Role |
|---|---|
| **commerce-core-service** | Shared commerce primitives: product catalog, cart, checkout, pricing, promotions, tax, fulfillment, payment gateway abstraction. Engine layer reused by all commerce overlays. |
| **sales-service** | Lead → opportunity → quote → order → invoice pipeline. CRM-adjacent deal flow, commission tracking, revenue recognition hooks. |
| **business-shop-service** | B2B/B2C storefront overlay. Tenant-built online stores with multi-channel (web, mobile, POS) and B2B account/org hierarchy. |
| **personal-shop-service** | Lightweight solo-seller / individual e-commerce overlay. Single-seller storefronts, digital products, subscription boxes. |
| **procure-service** | Purchase requests, supplier management, RFQ, PO lifecycle, receiving, three-way match (PO + receipt + invoice), budget approvals. |
| **inventory-service** | SKU master, stock levels, multi-warehouse, lot/serial/expiry tracking, UDI compliance hooks for HealthStack pharmacy and medical devices. |

### Out of scope for this ADR

- Payment gateway certification compliance details → deferred to ADR-0210 (Payments).
- Insurance claims integration details → ADR-0115 HealthStack downstream; sales-service emits claim-trigger events only.
- Full ERP accounting double-entry → ADR-0205 (Accounting cluster).
- Tenant provisioning / schema-per-tenant mechanics → ADR-0101 + ADR-0120.

---

## 2. Shared Cluster Decisions

### 2.1 Commerce-core engine: Medusa.js v2 (MIT)

**Decision:** commerce-core-service is built on **Medusa.js v2** as the primary OSS engine.

**Rationale:**

| Criterion | Assessment |
|---|---|
| License | MIT — no copyleft, no distribution obligations, SaaS-safe |
| Stack alignment | Node.js + TypeScript; Medusa v2 uses NestJS-style DI patterns and MikroORM + PG17 — aligns with ADR-0100 foundation runtime |
| Module coverage | 17 independently adoptable modules: Catalog, Cart, Order, Fulfillment, Payment, Pricing, Promotion, Tax, Inventory, Customer, Auth, Notification, Currency, Region, Sales Channel, Analytics, Return/Claim |
| B2B | Customer Groups, Account-level pricing, multi-store (multi-channel), org hierarchy via B2B extensions |
| Multi-tenant | Not native; applied via NestJS middleware + PG17 Row Level Security per ADR-0101 schema-per-tenant pattern |
| Extensibility | Workflows SDK with retries + compensating transactions; Modules, Plugins, API Routes, UI Widgets (React + TanStack + shadcn/ui admin) |
| Self-hosted | Full Docker deploy; no mandatory cloud service |
| Activity (2026) | 31k+ GitHub stars, active releases, dashboard rewrite shipped 2025 |

**Vendure v3 considered and deferred:**
Vendure v3 (NestJS + GraphQL + TypeORM) is a technically strong alternative with tighter NestJS alignment and more mature enterprise B2B (multi-channel RBAC, org hierarchies, advanced pricing). However:
- Core is GPLv3; commercial license (VCL) required for closed-source SaaS distribution of modified code — adds procurement overhead.
- GraphQL-first API adds translation layer vs. REST-primary Medusa (ADR-0103 REST-primary stance).
- Medusa's larger ecosystem and MIT license make it the lower-risk pick for this platform tier.

Vendure remains the **recommended alternative** if a downstream tenant requires enterprise-grade B2B org hierarchies beyond what Medusa provides with extensions; codegen plugin (ADR-0123) can scaffold Vendure-backed service variant.

**Saleor:** BSL license (non-compete clause), Python runtime — rejected on both grounds.

### 2.2 ERPNext as optional hospital-admin sidecar (HealthStack tier only)

**Decision:** ERPNext is NOT embedded in the neutral commerce cluster. It is available as an **optional HealthStack-tier sidecar** for hospital administration scenarios where a tenant already operates ERPNext and needs procurement/inventory bridging.

**Rationale:**

- ERPNext (GPLv3) carries distribution obligations; embedding it in the CuraOS core creates copyleft surface. Running it as a sidecar (separate process, API-bridged) keeps it outside the distribution boundary — legal review required before activating for any tenant receiving software copies.
- ERPNext's hospital module covers pharmaceutical supply chain, batch/lot/expiry tracking, and procurement workflows natively — valuable for HealthStack pharmacy supply chain without reimplementation.
- Integration pattern: procure-service + inventory-service expose a **`ErpNextBridgeProvider`** (implements standard `ProcurementProvider` / `InventoryProvider` interfaces) that forwards operations to an ERPNext instance via its Frappe REST API. The bridge is an optional plugin, disabled by default.
- ADR-0099 §15 precedent: hospital admin tier may accept GPLv3 tools as isolated sidecars under review.

**Dolibarr (GPLv3) / iDempiere (GPLv3) / Apache OFBiz (Apache 2.0):** reviewed; none offer the pharmacy-specific lot/expiry + UDI traceability depth of ERPNext for hospital use. OFBiz (Apache 2.0) noted as a fallback if ERPNext legal review fails — lower feature depth but cleaner licensing.

### 2.3 Baseline rules inherited

All six services inherit ADR-0150 in full:

- NestJS (TypeScript) runtime, PG17, Kafka 4 / NATS JetStream, TypeSpec API contracts, OpenTelemetry observability, OpenBao secrets, Better Auth (per ADR-0120), Temporal workflows (per ADR-0122), codegen scaffolding (per ADR-0123).
- Every integratable area exposes local-default + 3rd-party provider pattern.
- Per-tenant PG17 schema isolation (RLS) per ADR-0101.

---

## 3. Per-Service Decisions

### 3.1 commerce-core-service

| Concern | Decision |
|---|---|
| OSS engine | Medusa.js v2 (MIT) — runs as embedded library, not sidecar; NestJS app wraps Medusa modules |
| Catalog | Medusa Catalog Module: products, variants, collections, categories, tags, attribute sets |
| Cart | Medusa Cart Module: multi-currency, multi-region, discount/promotion stacking |
| Checkout | Medusa Order + Payment modules; payment provider abstraction (see §7.2) |
| Pricing | Medusa Pricing Module: price lists, customer group prices, tiered B2B pricing |
| Promotions | Medusa Promotion Module: code-based, automatic, buy-X-get-Y, percentage/fixed |
| Tax | Medusa Tax Module: tax regions, provider abstraction (local: TaxJar OSS-compatible calc; 3rd-party: Avalara, TaxJar BYO) |
| Fulfillment | Medusa Fulfillment Module: fulfillment providers, shipping options, shipment tracking |
| Returns/Claims | Medusa Return + Claim modules: RMA workflows, credit notes |
| Multi-tenant catalog | Medusa Sales Channel per storefront; tenant-level catalog isolation via PG schema RLS + sales channel scoping |
| API contract | TypeSpec → REST + OpenAPI 3.1 (per ADR-0103); GraphQL facade optional via Mercurius for storefront-facing queries |
| Event output | Kafka topics: `commerce.product.*`, `commerce.order.*`, `commerce.cart.*`, `commerce.fulfillment.*` |

### 3.2 sales-service

| Concern | Decision |
|---|---|
| Pipeline model | Lead → Opportunity → Quote → Order → Invoice; stages configurable per tenant via Temporal workflow definitions |
| CRM boundary | sales-service owns deal pipeline only; contact/account master lives in CRM module (ADR domain map §5.1) |
| Quote engine | NestJS service; quote line items reference commerce-core catalog prices via internal gRPC (low-latency pricing calls) |
| Order handoff | On quote acceptance: sales-service publishes `sales.order.created` → commerce-core-service picks up, creates commerce order, fulfills |
| Invoice | Sales-service generates invoice records; accounting double-entry handoff via `sales.invoice.finalized` → ADR-0205 accounting-service |
| Commission | Commission rules configurable per sales channel + user; computed on invoice finalization |
| Revenue recognition | Hooks for deferred revenue (subscription, multi-period) emitted as `sales.revenue.recognized` for accounting-service |
| HealthStack billing | On clinical order completion: ADR-0115 clinical workflow emits `healthstack.encounter.billing_ready`; sales-service picks up, creates insurance claim–linked invoice; Da Vinci IG integration downstream (ADR-0115) |
| Multi-tenant | Schema-per-tenant; pipeline stage config + commission rules isolated per tenant |

### 3.3 business-shop-service

| Concern | Decision |
|---|---|
| Storefront engine | commerce-core-service (Medusa) provides catalog/cart/checkout APIs; business-shop-service = NestJS orchestration layer + tenant config store |
| B2B account model | Company + contact hierarchy; per-company price lists + credit limits + purchase approval flows (Temporal) |
| Multi-channel | Medusa Sales Channel per channel (web, mobile, POS, API); channel-specific catalog + pricing |
| Storefront rendering | Decoupled: frontend in CuraOS Sites (ADR-0121a) or tenant-BYO storefront via Medusa Storefront API |
| POS | Web-based POS UI (CuraOS Apps, ADR-0121b); barcode scan via browser WebHID + WebSerial |
| Wholesale | B2B: MOQ enforcement, net-30/60 terms, purchase order intake (buyer uploads PO → converted to quote in sales-service) |
| Tenant provisioning | Tenant onboards storefront via CuraOS Builder (ADR-0121); shop config emitted as `shop.tenant.provisioned` |

### 3.4 personal-shop-service

| Concern | Decision |
|---|---|
| Scope | Solo seller / individual creator: physical goods, digital downloads, subscriptions, tip jars |
| Engine reuse | commerce-core-service; personal-shop-service is a thin NestJS orchestration + lightweight admin UI |
| Digital delivery | SeaweedFS (ADR-0101) signed URLs for download fulfilment; expiry-gated download tokens |
| Subscriptions | Recurring billing via payment provider abstraction (§7.2); Temporal workflow handles renewal, dunning, grace period |
| Tenant isolation | Each personal shop = tenant; schema-per-tenant PG17 RLS; lightweight provisioning (< 30 s from signup to live shop) |
| Limits | No B2B account hierarchy, no multi-warehouse, no multi-currency at launch (upgrade path → business-shop-service) |

### 3.5 procure-service

| Concern | Decision |
|---|---|
| PR lifecycle | Purchase Request → RFQ (optional) → PO → Goods Receipt → Invoice → Three-way match → Payment approval |
| Approval workflow | Temporal workflow; approval matrix configurable per tenant (amount thresholds, department, category) |
| Supplier management | Supplier master: contact, payment terms, lead times, categories, performance score (on-time %, defect %) |
| RFQ | Multi-supplier RFQ; responses scored; award creates PO |
| Reorder triggers | inventory-service publishes `inventory.reorder.triggered`; procure-service auto-creates PR or PO per reorder policy |
| Budget control | Budget ledger per cost center; PR approval checks remaining budget; blocked if over (Temporal step) |
| HealthStack pharmacy | Pharmacy procurement extends procure-service: DEA schedule tracking on purchase, DSCSA compliance fields on PO line, cold-chain flag on delivery |
| ERPNext bridge | `ErpNextBridgeProvider` implements `ProcurementProvider`; disabled by default; HealthStack tier plugin |
| Event output | `procure.po.created`, `procure.po.received`, `procure.invoice.matched`, `procure.budget.exceeded` |

### 3.6 inventory-service

| Concern | Decision |
|---|---|
| SKU master | Product variant ↔ SKU join via commerce-core-service product ID; inventory-service owns stock records only |
| Multi-warehouse | Warehouse master: bins, locations, zones; transfer orders with Temporal workflow |
| Stock movements | Every movement (receipt, transfer, sale, adjustment, write-off) is an immutable ledger entry; current stock = projection over ledger |
| Lot / serial tracking | Lot: batch-level quantity + attributes (expiry, manufacturer, COA). Serial: unit-level identity. Both mandatory for HealthStack items. |
| Expiry management | Expiry calendar: items nearing expiry surfaced in dashboard + `inventory.expiry.warning` event (configurable lead days per SKU) |
| UDI compliance | UDI Device Identifier (DI) + Production Identifier (PI: lot, serial, manufacture date, expiry) stored per SKU-lot record; barcode scan on receipt + issue validates GUDID lookup (FDA UDI database) via configurable provider |
| DSCSA / GS1 | Serialized Shipping Container Code (SSCC) + GS1 EPCIS event emission for pharmaceutical traceability (HealthStack tier) |
| Reorder policy | Min/max reorder rules per SKU-warehouse; KEDA-triggered reorder check job → `inventory.reorder.triggered` |
| Cycle counting | Counting tasks assigned via CuraOS Tasks (ADR-0101 §5.1); discrepancies trigger adjustment + audit event |
| ERPNext bridge | `ErpNextBridgeProvider` implements `InventoryProvider`; mirrors stock movements to ERPNext when sidecar active |
| Event output | `inventory.stock.updated`, `inventory.transfer.completed`, `inventory.reorder.triggered`, `inventory.expiry.warning`, `inventory.udi.violation` |

---

## 4. Cross-Service Integration

### 4.1 Primary event flow

```
[business-shop / personal-shop]
  │  customer places order
  ▼
[commerce-core-service]
  │  commerce.order.created
  ├──► [sales-service]           (for B2B: creates invoice, commission)
  │      │  sales.order.created
  │      ▼
  │    [accounting-service ADR-0205]
  │
  ├──► [inventory-service]       (decrement stock on fulfillment)
  │      │  inventory.stock.updated
  │      │  inventory.reorder.triggered (if below min)
  │      ▼
  │    [procure-service]          (auto-PR / auto-PO on reorder trigger)
  │
  └──► [fulfillment provider]    (Medusa Fulfillment Module → 3PL / warehouse)
```

### 4.2 Procurement → inventory replenishment loop

```
inventory.reorder.triggered
  → procure-service creates PR (or PO if auto-approved)
  → PO sent to supplier
  → Goods receipt: procure.po.received
  → inventory-service books inbound lot with expiry + UDI
  → inventory.stock.updated
```

### 4.3 HealthStack clinical billing hook

```
healthstack.encounter.billing_ready  (ADR-0115 emits)
  → sales-service creates claim-linked invoice
  → invoice references encounter ID + payer ID
  → sales.invoice.finalized → accounting-service
  → accounting-service → Da Vinci X12 / FHIR claim submission (ADR-0115)
```

### 4.4 Workflow orchestration

All multi-step stateful flows (quote approval, PO lifecycle, B2B purchase approval, transfer orders, RMA) run as **Temporal workflows** (ADR-0122). Each service owns its workflow definitions; cross-service coordination via Kafka events, not Temporal cross-namespace signals.

---

## 5. Cluster Shared Concerns

### 5.1 Multi-currency

- Commerce-core Medusa Region + Currency modules: per-region currency, exchange rates (configurable provider: local static table OR fixer.io BYO OR Open Exchange Rates BYO).
- All monetary amounts stored as integer minor units (cents) + ISO 4217 currency code in PG17; never float.
- sales-service and procure-service inherit multi-currency via commerce-core pricing APIs.

### 5.2 Multi-warehouse

- inventory-service owns warehouse master and stock ledger per warehouse.
- commerce-core Fulfillment Module references inventory-service warehouse IDs for pick-location routing.
- Transfer orders orchestrated by Temporal; in-transit stock tracked as separate movement type.

### 5.3 Tax

- commerce-core Tax Module provider abstraction:
  - Local default: rules-based tax engine (rate tables per region/category stored in PG17).
  - 3rd-party: Avalara AvaTax (BYO API key) / TaxJar (BYO) via plugin per ADR-0150 §2.
- HealthStack: medical devices and drugs may carry zero-rate or special VAT treatment; tax category codes on SKU master, applied at checkout.

### 5.4 Multi-tenant catalog isolation

- Each tenant: dedicated PG17 schema (RLS per ADR-0101).
- Medusa Sales Channel scopes catalog visibility per tenant storefront.
- Tenant A cannot read Tenant B's catalog, pricing, orders, or inventory — enforced at RLS + NestJS middleware (auth token → tenant ID → schema routing per ADR-0120).

### 5.5 Audit trail

- All commerce, sales, procurement, and inventory mutations emit structured audit events to the audit log (ADR-0108 tamper-evident audit).
- HealthStack pharmacy: DSCSA chain-of-custody and DEA controlled-substance dispensing events satisfy regulatory audit requirements when persisted to the immutable audit ledger.

### 5.6 Localization

- Product names, descriptions, category labels: i18n strings stored per ADR-0112 (ICU message format, Weblate-managed).
- Invoice + PO document locale: per-tenant locale config, rendered via i18n service.

---

## 6. Per-Service Technology Summary

| Service | Runtime | ORM | Primary DB | Cache | Search | Key OSS |
|---|---|---|---|---|---|---|
| commerce-core | NestJS + Medusa v2 | MikroORM | PG17 | Valkey | OpenSearch | Medusa.js v2 (MIT) |
| sales-service | NestJS | MikroORM | PG17 | Valkey | OpenSearch | Temporal (workflow) |
| business-shop | NestJS | MikroORM | PG17 | Valkey | OpenSearch | Medusa APIs (via commerce-core) |
| personal-shop | NestJS | MikroORM | PG17 | Valkey | — | Medusa APIs (via commerce-core) |
| procure-service | NestJS | MikroORM | PG17 | Valkey | OpenSearch | Temporal, optional ERPNext bridge |
| inventory-service | NestJS | MikroORM | PG17 | Valkey | OpenSearch | optional ERPNext bridge |

All services: Kafka 4 events, TypeSpec APIs, OpenTelemetry, OpenBao secrets, Better Auth, OPA + Cerbos RBAC, per-tenant PG17 schema RLS.

---

## 7. Local + 3rd-Party Provider Map (per ADR-0150 §2)

### 7.1 Commerce engine

| Area | Local default | 3rd-party option |
|---|---|---|
| Commerce engine | Medusa.js v2 self-hosted (MIT) | Shopify Storefront API (BYO tenant Shopify store — read-only catalog sync) |
| Storefront | CuraOS Sites (ADR-0121a) / CuraOS Apps (ADR-0121b) | Tenant BYO Next.js / Nuxt / React storefront via Medusa Storefront SDK |

### 7.2 Payments

| Area | Local default | 3rd-party option |
|---|---|---|
| Payment gateway abstraction | Medusa Payment Module provider interface | Stripe Connect (primary BYO; Accounts v2 API, December 2025 release) |
| Marketplace / multi-vendor payouts | Medusa multi-provider | Stripe Connect Standard / Express / Custom accounts per storefront |
| Regional gateways | Plugin per region | Adyen (BYO) / PayPal (BYO) / Mollie (BYO) via Medusa payment provider plugin |
| Subscription billing | Temporal recurring workflow | Stripe Billing (BYO) via payment provider plugin |

Stripe Connect Accounts v2 (released December 2025): flexible merchant / customer / recipient role attachment — preferred for multi-tenant marketplace payouts. Detailed payment ADR deferred to ADR-0210.

### 7.3 ERP bridge

| Area | Local default | 3rd-party option |
|---|---|---|
| Procurement backend | procure-service native (NestJS) | ERPNext sidecar via `ErpNextBridgeProvider` (HealthStack tier; GPLv3 — legal-reviewed) |
| Inventory backend | inventory-service native (NestJS) | ERPNext sidecar via `ErpNextBridgeProvider` (same) |
| Enterprise ERP sync | — | SAP S/4HANA (BYO RFC / iDoc / BAPI bridge) / Oracle ERP Cloud (BYO REST) via plugin |

### 7.4 Tax

| Area | Local default | 3rd-party option |
|---|---|---|
| Tax calculation | Rules-based engine (rate tables in PG17) | Avalara AvaTax (BYO) / TaxJar (BYO) / Vertex (BYO) |

### 7.5 Fulfillment / 3PL

| Area | Local default | 3rd-party option |
|---|---|---|
| Fulfillment | Medusa Fulfillment Module (self-managed warehouse) | ShipBob (BYO) / ShipStation (BYO) / EasyPost (BYO) via Medusa fulfillment provider plugin |

### 7.6 UDI / serialization (HealthStack tier)

| Area | Local default | 3rd-party option |
|---|---|---|
| GUDID lookup | Offline GUDID bulk download (FDA public dataset, refreshed weekly) | FDA GUDID REST API (online) |
| GS1 EPCIS emission | Custom NestJS EPCIS 2.0 event emitter | GS1 cloud EPCIS repository (BYO) |

---

## 8. HealthStack-Specific Concerns

### 8.1 Pharmacy supply chain

- inventory-service mandatory fields for pharmacy SKUs: lot number, expiry date, manufacturer, NDC code, controlled-substance schedule (DEA).
- procure-service pharmacy extension: DSCSA transaction data (Transaction Information, Transaction History, Transaction Statement) attached to every PO receipt; stored in immutable audit ledger.
- Automated expiry alerts: `inventory.expiry.warning` emitted at configurable lead time (e.g., 90 / 30 / 7 days before expiry). Workflow (Temporal) triggers quarantine task if within final window.

### 8.2 Medical device traceability (UDI / UDI-DI / UDI-PI)

- Every medical device SKU carries: UDI-DI (device identifier, stable per model) + UDI-PI (production identifier: lot/serial/manufacture date/expiry date).
- Receipt scan: barcode (GS1-128 / GS1 DataMatrix / QR) parsed on inbound goods receipt; UDI-DI validated against GUDID (local or online per §7.6).
- Issuance tracking: serial-level movement to patient / procedure room recorded; satisfies FDA UDI rule and ISO 13485 traceability requirements.
- Recall management: given a UDI-DI or lot, inventory-service can enumerate all affected units + current locations within seconds via indexed lot ledger query.

### 8.3 Insurance / billing handoff (Da Vinci IGs)

- sales-service consumes `healthstack.encounter.billing_ready` (ADR-0115 CDS Hooks / FHIR Workflow resource).
- Creates a claim-linked invoice; invoice line items map to CPT / HCPCS codes (populated by HealthStack clinical workflow).
- `sales.invoice.finalized` → downstream Da Vinci CDex / HRex / PAS IG submission (ADR-0115 owns claim submission; sales-service is claim originator only).
- No PHI stored in sales-service; encounter reference = FHIR Encounter ID (opaque token); PHI stays in HealthStack schema boundary (ADR-0099 §7 + ADR-0115).

### 8.4 ERPNext sidecar activation (hospital-admin tier)

Activation conditions:
1. Tenant tier = HealthStack Hospital Admin.
2. Legal review of ERPNext GPLv3 distribution obligations completed and logged in tenant record.
3. ERPNext instance provisioned (self-hosted by tenant or CuraOS-managed isolated instance).
4. `ErpNextBridgeProvider` enabled in tenant feature flags (Unleash per ADR-0110).

When active: procure-service and inventory-service operations are dual-written — to native PG17 schema (source of truth for CuraOS) AND to ERPNext via Frappe REST API (for hospital admin dashboards). Divergence detected by periodic reconciliation job (Temporal cron).

---

## 9. Open Questions

| # | Question | Owner | Priority |
|---|---|---|---|
| OQ-01 | ADR-0210 (Payments) — Stripe Connect Accounts v2 full integration spec, including multi-tenant onboarding flow, payout settlement, and marketplace fee capture. Required before business-shop-service payment features ship. | Platform team | High |
| OQ-02 | ERPNext GPLv3 legal review: confirm distribution obligations when CuraOS manages the ERPNext instance on behalf of a hospital tenant. If managed-service qualifies as distribution, assess Apache OFBiz as fallback. | Legal / Platform | High |
| OQ-03 | Vendure VCL commercial license evaluation: cost and terms for enterprise tenants who need Vendure's B2B org hierarchy features beyond Medusa extensions. Determine when to offer Vendure variant via codegen recipe. | Platform team | Medium |
| OQ-04 | GUDID offline dataset refresh cadence and storage sizing: FDA GUDID full release is ~2 GB compressed. Confirm OpenSearch index plan and weekly delta-refresh automation. | HealthStack team | Medium |
| OQ-05 | GS1 EPCIS 2.0 event format and repository: confirm whether tenant-managed or CuraOS-managed EPCIS repository is required for DSCSA compliance at hospital scale. | HealthStack / Legal | Medium |
| OQ-06 | Medusa v2 multi-tenancy: evaluate PostgreSQL RLS implementation against Medusa's internal module isolation to confirm no cross-tenant data leakage at the MikroORM entity manager layer. Requires integration test suite. | commerce-core team | High |
| OQ-07 | Personal-shop-service multi-currency: deferred at launch. Determine threshold (user count / revenue volume) that triggers promotion to business-shop-service with full multi-currency. | Product | Low |
| OQ-08 | SAP / Oracle ERP bridge plugin: assess demand from enterprise hospital tenants before committing development effort. Candidate for Wave 2. | Sales / Platform | Low |

---

## 10. References

- [Medusa.js v2 Documentation](https://docs.medusajs.com/)
- [Medusa v2 Commerce Modules Overview](https://medusajs.com/modules/)
- [Medusa Multi-Tenant Pattern — Rigby.js](https://www.rigbyjs.com/blog/multi-tenancy-in-medusa)
- [TypeScript OSS E-Commerce Platform Comparison 2026 — codenote.net](https://codenote.net/en/posts/typescript-oss-ecommerce-platforms-medusa-vendure-evershop/)
- [Vendure License Change Announcement](https://vendure.io/blog/license-change-announcement)
- [Vendure GitHub — vendurehq/vendure](https://github.com/vendure-ecommerce/vendure)
- [ERPNext Healthcare — Ksolves](https://www.ksolves.com/blog/erpnext/how-erpnext-in-healthcare-streamlines-operations)
- [ERPNext Pharmaceutical Supply Chain — Sigzen](https://www.sigzen.com/blog/erpnext-enhances-supply-chain-pharma-industry/)
- [ERPNext License and Trademark](https://erpnext.com/license-trademark)
- [UDI Lot/Serial Control for Compliance — Cetec ERP](https://cetecerp.com/blog/Lot_Serial_Control_For_UDI.html)
- [Stripe Connect Accounts v2 — Stripe Docs](https://docs.stripe.com/connect/end-to-end-marketplace)
- [Stripe Connect 2026 Guide — greenmoov.app](https://greenmoov.app/articles/en/stripe-connect-for-marketplace-payments-explained-account-types-onboarding-and-pricing-2026-guide)
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data](0101-data-layer.md)
- [ADR-0102 Event Messaging](0102-event-messaging.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0121a Sites](0121a-foundation-sites.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
