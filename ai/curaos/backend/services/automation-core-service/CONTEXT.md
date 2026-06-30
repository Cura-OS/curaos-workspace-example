# automation-core-service — Agent Context

**ADR-0204** | **Updated:** 2026-05-24

---

## Role in One Line

Neutral NestJS module providing typed Activepieces trigger/action SDK and piece registry gateway to all automation overlay services. Activepieces runtime lives in CuraOS Workflow Manager (ADR-0122); this service is the gateway.

---

## Stack (authoritative)

| Layer | Choice |
|---|---|
| Runtime | NestJS (TypeScript) |
| Automation client | Activepieces CE SDK |
| Workflow bridge | `@temporalio/client` |
| Messaging | `@nestjs/microservices` (Kafka + NATS) |
| Trigger queue | `bullmq` |
| Data | PG17 (schema-per-tenant) + Valkey |
| Auth | Better Auth + Cerbos |
| Secrets | OpenBao |
| Observability | OTel + Grafana |
| Test runner | Jest |

---

## What This Service Does vs Does Not Do

**Does:**
- Export `AutomationCoreModule` — imported by overlay services
- Maintain piece registry (280+ stock Activepieces pieces + custom)
- Provide trigger SDK (webhook, polling, Kafka, cron, manual)
- Provide action SDK (HTTP, emit-event, notify, start-Temporal-workflow, AI-call)
- Maintain automation template registry (PG)
- Route webhook ingress from APISIX to Activepieces runtime
- Emit `automation.*` events to Kafka/NATS

**Does NOT:**
- Own Activepieces runtime (→ Workflow Manager ADR-0122)
- Own Temporal cluster (→ Workflow Manager)
- Contain business or personal automation templates (→ overlay services)
- Manage per-user credential vaults (→ personal-automation-service)

---

## Dependency Tree

```
This service imports:
  - CuraOS Workflow Manager (Activepieces sidecar API)
  - @temporalio/client
  - @nestjs/microservices (Kafka/NATS)
  - bullmq

Imported by:
  - business-automation-service
  - personal-automation-service
  - healthstack-automation-service (ADR-0115)
```

---

## Codegen Recipes

- `automation-core:piece` — scaffold Activepieces custom piece (trigger + actions + auth schema)
- `automation-core:base-automation` — scaffold automation template with trigger + action chain + run log
- Both follow `.gen.ts` split (ADR-0123 §4)

---

## Agent Operating Rules

- Read ADR-0204 §3.4 before any implementation work.
- No Spring Boot, no Kotlin, no n8n — discard pre-ADR-0204 artifacts.
- No vertical domain logic — propose extraction to overlay if tempted.
- Activepieces runtime interaction goes through Workflow Manager API; do not call Activepieces directly.
- OQ-1 (shared vs per-overlay Activepieces sidecar) must be resolved before P1.2 — do not assume.
- Piece credential vault interactions go via OpenBao; never inline secrets in automation templates.
- Audit every automation instance lifecycle event via hash-chain PG interceptor.

---

## Key Events (Kafka/NATS topics)

| Event | Direction |
|---|---|
| `automation.template.registered` | produced |
| `automation.instance.triggered` | produced |
| `automation.instance.completed` | produced |
| `automation.instance.failed` | produced |
| `automation.piece.health-changed` | produced |

---

## Files That Must Not Break

- `AutomationCoreModule` export interface — overlay services import it; semver bump required for breaking changes
- Trigger SDK type contracts — overlay templates reference them; breaking changes require template revalidation
- Piece registry PG schema — migrations must be backward-compatible
- Webhook ingress URL structure — external systems POST to it; changes require coordination

---

## Open Questions (per ADR-0204 §11)

- OQ-1: Shared vs per-overlay Activepieces sidecar — resolve before P1.2.
- OQ-4: Personal automation credential vault scope (per-user OpenBao path structure) — relevant to personal-automation-service, not this service directly.

---

## v1 Implementation Status (#739, contract-mock bar)

The v1 first slice landed via `gen:service automation` (the #739 generator fix) +
hand-authored domain contract. Stack note: the SCAFFOLD is Bun + NestJS 11 +
Drizzle + TypeSpec/AsyncAPI (the realized M1+ codegen mold), which supersedes the
pre-realization Activepieces/Jest references above for the runtime; the
Activepieces-runtime vision (ADR-0122) remains the FORWARD path for the live
connector registry + run engine. The contract-mock slice serves a replayable
catalogue + in-memory aggregate the consuming apps generate their SDK from.

**REST surface (lock-step `specs/automation.tsp`, `tsp compile` exit 0):**

| Route | Purpose | Consumer |
|---|---|---|
| `GET /connectors` | connector catalogue (filter category/search) | workflow-designer palette, business-automation marketplace, personal fetch |
| `GET /connectors/{id}` | single connector descriptor | all |
| `GET /connectors/{id}/schema` | connector property schema (node panel fields) | business-workflow node property panels |
| `POST /automations` | create automation definition | business-donation wiring |
| `GET /automations/{id}` | fetch automation (tenant-scoped) | all |
| `GET /automations/{id}/runs` | run history | personal run-history, business monitoring |

Plus the mold-locked auth surface `GET /automations/health|protected|whoami` +
`POST /automations/protected-write` (auth-matrix test).

**Events (`specs/automation.asyncapi.yaml`, refs validated):**
`curaos.core.automation.run.started.v1`, `.run.completed.v1`,
`curaos.core.connector.registered.v1` (+ the scaffold lifecycle
created/updated/deleted). snake_case envelope, outbox-relayed.

**Replayable mock:** `src/connectors/connector-catalogue.fixture.ts` (4 seed
connectors: http / schedule / notify / webhook, each with action property schemas)
is the source-of-truth catalogue per AGENTS.md §7.

**Forward path:** swap the in-memory `AutomationRepository` + fixture for the
drizzle-backed `automation` + `connector_registry` tables fed by the
`connector.registered.v1` consumer; PUBLIC route/event shapes are the stable
contract.
