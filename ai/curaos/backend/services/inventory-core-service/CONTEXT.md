# Agent Context — inventory-core-service

**ADR-0202 §3.6, §4.2, §5.2, §7.6, §8 · ADR-0150 · ADR-0154**
Last updated: 2026-05-24

---

## Role in CuraOS

Stock ledger and traceability layer. Commerce-core and business-shop read availability; fulfillment decrements stock on shipment. Procurement-core-service replenishes via goods receipt. HealthStack pharmacy and medical device workflows extend via UDI/DSCSA fields and `TraceabilityProvider`. Does not store PHI.

---

## Stack

- **Runtime:** NestJS (TypeScript)
- **ORM:** MikroORM
- **DB:** PG17 per-tenant schema RLS (immutable ledger table — append-only, no updates/deletes)
- **Cache:** Valkey (availability read cache, invalidated on stock movement)
- **Search:** OpenSearch (SKU search, lot/serial lookup, UDI-DI search)
- **Events:** Kafka 4
- **Workflows:** Temporal (transfer orders, expiry quarantine, ERPNext reconciliation cron)
- **Job triggers:** KEDA scaled job for reorder check
- **Secrets:** OpenBao
- **Auth:** Better Auth + OPA/Cerbos RBAC
- **API:** TypeSpec → REST + OpenAPI 3.1

---

## Ledger Design

- Stock movements = append-only rows in `stock_movement` table (PG17, per-tenant schema).
- Current stock quantity = `SUM(quantity_delta) WHERE sku_id = ? AND warehouse_id = ?` over ledger.
- Lot-level: `stock_movement` carries `lot_id` FK; lot table holds expiry, manufacturer, NDC, UDI fields.
- Serial-level: `serial_unit` table; each row = one serial number + current warehouse + location.
- Immutability enforced by PG trigger (no UPDATE/DELETE on stock_movement); corrections via offsetting entry.

---

## Provider Wiring (ADR-0154)

| Token | Default impl | Notes |
|---|---|---|
| `INVENTORY_PROVIDER` | `InventoryNativeProvider` | NestJS native; always active |
| `TRACEABILITY_PROVIDER` | `TraceabilityGudidLocalProvider` | Offline GUDID bulk dataset (OpenSearch index) |
| `EPCIS_PROVIDER` | `EpcisNestJSProvider` | Custom NestJS EPCIS 2.0 emitter; HealthStack tier only |
| `ERP_SYNC_PROVIDER` | `ErpNextBridgeProvider` | Disabled by default; Unleash flag `erp-next-bridge` |

Config validated with Zod at bootstrap. `healthCheck()` on all active providers at `/health` endpoint.

---

## HealthStack Activation Gates

- UDI/DSCSA fields: present on all SKU-lot records; populated when `sku.is_regulated = true`.
- EPCIS emission: Unleash flag `epcis-emission`; HealthStack Hospital tier only.
- ERPNext bridge: Unleash flag `erp-next-bridge`; requires HealthStack Hospital Admin tier + GPLv3 legal clearance logged in tenant record.
- DEA schedule tracking: stored in lot record; no PHI written.

---

## Key Event Flows

**Produces:**
- `inventory.stock.updated` → commerce-core (availability display), business-shop (PDP stock badge)
- `inventory.reorder.triggered` → procurement-core-service (auto-PR/PO creation)
- `inventory.expiry.warning` → notify-service (pharmacist alert) + Temporal (quarantine task)
- `inventory.udi.violation` → audit-service (tamper-evident log) + notify-service

**Consumes:**
- `commerce.order.created` → decrement reserved stock on fulfillment event
- `procure.po.received` → book inbound lot: lot number, expiry, NDC, UDI-PI fields from PO receipt

---

## GUDID Integration Notes

- Offline: FDA GUDID full release ~2 GB compressed. Load into OpenSearch on deploy; weekly delta refresh via Temporal cron.
- OQ-04: confirm OpenSearch index plan + storage sizing before HealthStack tier ships.
- Online fallback: `TraceabilityGudidRestProvider` — FDA GUDID REST API, rate-limited.

---

## Agent Operating Rules

- Read `Requirements.md` before any implementation task.
- Ledger append-only: never write UPDATE/DELETE on `stock_movement`. Corrections = offsetting entry with `reason` field.
- UDI fields: validate UDI-DI against GUDID at receipt; emit `inventory.udi.violation` on failure. Do not block receipt silently.
- Expiry lead days: read from SKU-level config, not hardcoded. Default 90/30/7 only if SKU config absent.
- ERPNext bridge: always dual-write to native PG17 first; Frappe REST call is best-effort. Failure logged + reconciliation Temporal job queues retry.
- EPCIS events: only emit when `epcis-emission` Unleash flag active. Never emit for non-HealthStack tenants.
- Test cmd: `bun test` (unit) + `bun test:integration` (real PG17 + Kafka + OpenSearch). Never mock infra in integration tests.
- Lint: Biome.

---

## Open Questions

- OQ-04: GUDID offline dataset — OpenSearch index plan + weekly delta refresh automation (Medium, blocks HealthStack tier).
- OQ-05: GS1 EPCIS 2.0 repository — tenant-managed vs CuraOS-managed for DSCSA compliance at hospital scale (Medium, blocks pharmacy traceability).
- OQ-02: ERPNext GPLv3 legal review — managed-service distribution obligations (High, blocks ERPNext bridge activation).
