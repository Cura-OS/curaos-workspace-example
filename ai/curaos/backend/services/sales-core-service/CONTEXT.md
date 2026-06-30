# Agent Context — sales-core-service

**ADR-0202 §3.2, §4.1, §4.3, §8.3 · ADR-0150 · ADR-0154**
Last updated: 2026-05-24

---

## Role in CuraOS

Deal pipeline + invoice originator. Consumes CRM opportunities; produces invoices consumed by accounting-service. HealthStack extension: clinical billing originator (Da Vinci IG claim trigger). Does not own commerce order fulfillment (commerce-core does). Does not store PHI.

---

## Stack

- **Runtime:** NestJS (TypeScript)
- **ORM:** MikroORM
- **DB:** PG17 per-tenant schema RLS
- **Cache:** Valkey
- **Search:** OpenSearch
- **Events:** Kafka 4
- **Workflows:** Temporal (pipeline stages, commission)
- **Internal pricing:** gRPC → commerce-core-service
- **Auth:** Better Auth + OPA/Cerbos RBAC
- **API:** TypeSpec → REST + OpenAPI 3.1

---

## Key Event Flows

**Produces:**
- `sales.order.created` → commerce-core (creates + fulfills commerce order)
- `sales.invoice.finalized` → accounting-service (ADR-0205 double-entry) + Da Vinci downstream (ADR-0115)
- `sales.revenue.recognized` → accounting-service (deferred revenue)

**Consumes:**
- `healthstack.encounter.billing_ready` → create claim-linked invoice with CPT/HCPCS line items

---

## HealthStack Billing Seam

- `healthstack.encounter.billing_ready` carries: FHIR Encounter ID (opaque), payer ID, CPT/HCPCS codes, service date.
- Sales-service creates invoice row; stores Encounter ID as opaque FK — no PHI decoded or stored.
- Invoice finalization triggers `sales.invoice.finalized`; ADR-0115 accounting-service handles Da Vinci CDex/HRex/PAS submission.
- Never call HAPI FHIR directly from sales-core-service; FHIR interactions owned by HealthStack services.

---

## Agent Operating Rules

- No PHI: Encounter ID is opaque token. Do not resolve to patient demographics. Schema audit CI check.
- gRPC pricing: call commerce-core for quote line item prices. Do not duplicate pricing logic.
- Temporal pipeline: stage transitions = Temporal workflow steps. Direct DB state mutation for pipeline stages is forbidden.
- Commission: compute only on `invoice.status = finalized`. Partial invoices do not trigger commission.
- Test cmd: `bun test` + `bun test:integration`. Never mock Kafka or PG17 in integration tests.
- Lint: Biome.
