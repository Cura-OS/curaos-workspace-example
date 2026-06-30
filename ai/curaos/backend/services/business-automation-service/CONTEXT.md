# business-automation-service — Agent Context

**ADR-0204 §3.5** | **Updated:** 2026-05-24

---

## Role in One Line

Business-tier NestJS automation overlay that registers pre-built Activepieces flows (CRM/sales/finance/HR/ops) into Workflow Manager via `AutomationCoreModule`. Zapier-class for enterprise tenants.

---

## Stack

NestJS (TypeScript). Imports `AutomationCoreModule`. Engine = Workflow Manager Activepieces sidecar (ADR-0122). No Spring Boot, no Kotlin, no n8n.

---

## This Service Owns

- 8 pre-built business Activepieces flows (v1) — see Requirements.md §2
- Per-flow Cerbos RBAC policies
- Builder App UI: automation library browser, run history, credential vault UI
- Events: `business.automation.*` topic namespace
- BYO connector model: tenant-scoped piece credentials via OpenBao

## This Service Does NOT Own

- Activepieces runtime (→ Workflow Manager)
- Personal automation flows (→ personal-automation-service)
- Healthcare automation (→ healthstack-automation-service)
- Piece credential storage — OpenBao manages; this service references only

---

## Events

Produces: `business.automation.run.completed`, `business.automation.run.failed`, `business.automation.piece.credential-expired`

---

## Agent Rules

- All 3rd-party piece credentials are BYO per tenant — never hardcode or ship default credentials.
- Custom piece install requires cosign-signed OCI artifact from Harbor (ADR-0123 convention).
- Cerbos policy must exist for every automation before it can be enabled.
- AI actions (sentiment, draft reply) via LiteLLM only — no direct OpenAI/Anthropic calls.
- Read ADR-0204 §3.5 before adding or modifying automation flows.

---

## v1 Implementation Status (#741, contract-mock bar)

Business (org/enterprise-scope) overlay over automation-core-service. Scaffolded
via `gen:service automation --write` (trio) + hand-authored domain contract.
Composes the core `AutomationsService` (status) and owns the automation-editor
CRUD + GOVERNANCE (approval gate, environment promotion, monitoring dashboard).
ORG-scoped: every read filters by tenantId. Reuses the core SHAPES; does NOT fork.

**REST surface (lock-step `specs/automation.tsp`, `tsp compile` exit 0,
`@Controller('business-automations')`):**

| Route | Purpose | Roles |
|---|---|---|
| `POST /business-automations` | editor create | authenticated |
| `GET /business-automations/{id}` | fetch | authenticated |
| `PATCH /business-automations/{id}` | editor save | authenticated |
| `POST /business-automations/{id}/approvals` | approval-workflow gate (approve/reject) | tenant-admin |
| `POST /business-automations/{id}/promote` | environment promotion (409 if not approved) | tenant-admin |
| `GET /business-automations/{id}/metrics` | monitoring dashboard | authenticated |

Plus mold-locked `health|protected|whoami|protected-write`.

**Events:** `curaos.business.automation.approved.v1`,
`curaos.business.automation.promoted.v1`
(`business-governance-event-producer.ts`); snake_case envelope.

**Done satisfied:** create-approve-promote smoke path wires to real APIs (a
promotion is BLOCKED with 409 until the automation is approved - the governance
gate). Verified by `test/business-automations.domain.test.ts`.
