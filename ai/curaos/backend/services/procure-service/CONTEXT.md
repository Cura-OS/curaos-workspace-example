# Agent Context — procure-service

**ADR-0202 §3.5, §4.2, §7.3, §8.1, §8.4 · ADR-0150 · ADR-0154**
Last updated: 2026-06-04

---

## Role in CuraOS

Parked procurement overlay placeholder. `procurement-core-service` is the current neutral procure-to-pay owner for purchase requisition, purchase order, receipt, three-way match, budget ledger, canonical events, storage, and optional ERPNext mirror seams.

This submodule stays tracked only to preserve the existing repository boundary while M13 decides whether a distinct overlay is needed. It does not own neutral procurement behavior. If promoted later, it must depend on `procurement-core-service` events/contracts and store only overlay-specific fields.

---

## Stack

Deferred until promotion. This parked placeholder has no runtime, ORM, DB,
cache, search, event, workflow, auth, or API commitment; any future promotion
issue must make those choices against `procurement-core-service` contracts and
current `ai/rules/` precedence.

---

## Key Event Flows

**Produces:**
- None while parked.

**Consumes:**
- Future overlay only: `curaos.core.procurement.*.v1` from `procurement-core-service`.

---

## ERPNext Bridge Wiring

- Current owner: `procurement-core-service`.
- Open follow-up: `your-org/procurement-core-service#3` for the optional ERPNext mirror provider seam.
- This module must not add a second ERPNext bridge unless a future overlay issue proves it owns overlay-only behavior.

---

## Agent Operating Rules

- Do not duplicate `procurement-core-service` domain models, events, workflows, storage, or ERPNext bridge seams.
- Do not remove/deinit this submodule without same-turn explicit confirmation.
- If promoted, define exact overlay fields, consumed core events, emitted overlay events, and PHI/PII boundary before codegen.
- Test and lint commands are not defined until promotion; use the promoted issue's owning service contract.
