# CONTEXT — fleet-core-service

**ADR-0206 aligned.** Last updated: 2026-06-03

---

## Implementation status (#347 — neutral core landed)

PR `fleet-core-service#1` (branch `agent/impl-fleet-core-347`) implemented the neutral-core domain over the scaffolded modulith. Gate `bun turbo run typecheck test lint --filter=@curaos/fleet-core-service` green (60 tests, 0 fail).

**What landed (actual code, vs the aspirational spec below):**
- **Domain model + store seam** — `src/fleets/fleet-store.ts`: `vehicle` / `asset` / `dispatch` / `maintenance_schedule`. `InMemoryFleetStore` (shell + unit tests) + `PostgresFleetStore` (raw parameterized `sql`, tenant-scoped, tx-threaded). DI token `FLEET_STORE`; `FleetsModule.register()` is dynamic so the composition root binds Postgres.
- **Dispatch FSM** — `assigned → en_route → arrived → completed`, `cancelled` from any non-terminal state (`DISPATCH_TRANSITIONS` table; illegal/terminal transitions rejected with `BadRequestException`). fleet is **authoritative for availability**: assign reserves the vehicle, terminal transitions release it (same tx). FSM state persisted to PG via the store (not in-memory only). NOTE: the in-process machine is plain orchestration here; `@nestjs/event-emitter` cross-service wiring is composition-root.
- **Maintenance** — mileage OR time trigger, idempotent `due_fired` latch (`isMaintenanceDue`). `@nestjs/schedule`/BullMQ cron is composition-root wiring; the core invariant + `evaluateMaintenanceDue` seam are in place.
- **Durable `fleet.*` events** — `src/fleets/fleet-domain-events.ts` catalog (vehicle/asset/dispatch/maintenance) → `buildFleetDomainMessage` → `DomainOutboxService.enqueueWith(tx.db, …)` on the mutation tx (durable-iff-write; rollback = no ghost event). Partition key `sha256(tenant, aggregate)`.
- **Geospatial CONSUMER seam** — `src/fleets/geospatial-consumer.ts`: `FleetsService implements GeospatialEventConsumer`. `geospatial.geofence.entered.v1` (subject = dispatched vehicle) drives `DispatchArrived`; `geospatial.route.*.v1` reference-only. fleet → geospatial **only** (no routing engine, no duplicated geometry, no reverse coupling). The upstream published `*.v1` contract is mirrored as a local narrowed type set until `@curaos/geospatial-sdk` ships.
- **Contracts** — Zod 4 write DTOs (`src/fleets/fleet.dto.ts`, JWT-derived tenant/actor, `.strict()`); role-gated REST controller; `specs/fleet.asyncapi.yaml` (13 `fleet.*` channels) + `specs/fleet.tsp` (5 domain routes) extended; `drizzle/migrations/0003_fleet_domain.sql`.

**Deferred (out of neutral-core scope / composition-root):** tRPC procedures (`dispatchVehicle`/`getVehicleETA`/`reportMaintenance`/`listAvailableVehicles`) — REST surface landed instead per the codegen template; FHIR Device/Practitioner export (conversion-core bridge); EMS `healthstack.ems.mission.created` consumer; `personal-tracking-service` location consumer. Seams exist; wiring at modulith composition / GA wave.

**FORESIGHT (mold defect):** `domain_outbox` table is still hand-shipped per-service (codegen `service-core` mold ships `audit_outbox` only) — already flagged by commerce-core #338 / crm-core #339 for the mold; fleet inherits the same local copy, no new local fix.

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17 + Valkey

---

## Key Design Decisions

- Routing delegated entirely to `geospatial-core-service` tRPC — fleet-core-service holds no routing engine.
- Driver location sourced from `personal-tracking-service` `tracking.location.pinged` Kafka events — no direct mobile SDK dependency.
- HealthStack EMS integration via tRPC + Kafka only; no shared DB with `healthstack-ems-service`.
- FHIR Device/Practitioner export delegated to `conversion-core-service` gRPC — fleet-core-service holds no FHIR logic.
- Dispatch FSM implemented with `@nestjs/event-emitter`; state persisted to PG (not in-memory only).
- BullMQ for maintenance cron jobs (mileage + time triggers); PG as authoritative schedule store.

---

## Fleet State Machine

```
AVAILABLE → ASSIGNED → EN_ROUTE → ON_SCENE → RETURNING → AVAILABLE
                                            → COMPLETED (terminal)
AVAILABLE → MAINTENANCE → AVAILABLE
```

State transitions emitted as Kafka events. Invalid transitions rejected with 422.

---

## HealthStack Integration (ADR-0115)

- `healthstack-ems-service` calls `dispatchVehicle` tRPC — fleet-core-service must respond with assigned vehicle + ETA.
- Consumes `healthstack.ems.mission.created` Kafka event to pre-allocate vehicle pool slot.
- FHIR export: call `conversion-core-service` gRPC `convertToFHIR(type: 'Device', payload: vehicle)`.

---

## Files That Must Not Break

- tRPC procedure names: `dispatchVehicle`, `getVehicleETA`, `reportMaintenance`, `listAvailableVehicles`
- Kafka topics (produced): `fleet.vehicle.dispatched`, `fleet.vehicle.arrived`, `fleet.vehicle.maintenance-due`, `fleet.route.deviated`, `fleet.driver.availability-changed`
- Kafka topics (consumed): `tracking.location.pinged`, `healthstack.ems.mission.created`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
