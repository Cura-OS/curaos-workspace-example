# personal-automation-service — Agent Context

**ADR-0204 §3.6** | **Updated:** 2026-05-24

---

## Role in One Line

Personal-tier NestJS automation overlay: Zapier/IFTTT-class flows for individuals (Gmail, calendar, RSS, Slack, Plaid, GitHub). Per-user credential vault via OpenBao. Registered via `AutomationCoreModule` into Workflow Manager.

---

## Stack

NestJS (TypeScript). Imports `AutomationCoreModule`. Engine = Workflow Manager Activepieces sidecar (ADR-0122). AI = LiteLLM (ADR-0114). Credentials = OpenBao per-user paths (ADR-0108). No Spring Boot, no Kotlin.

---

## This Service Owns

- 8 pre-built personal Activepieces flows (v1) — see Requirements.md §2
- Personal automation builder UI (Workflow Canvas simplified mode)
- NL automation creation (AI template suggest)
- Events: `personal.automation.*` topic namespace
- Per-user OpenBao credential path management
- Per-user Cerbos isolation policies

## This Service Does NOT Own

- Activepieces runtime (→ Workflow Manager)
- Business automation flows (→ business-automation-service)
- Healthcare automation (→ healthstack-automation-service)
- Shared/tenant-level credential storage (→ automation-core-service piece registry gateway)

---

## Personal Data Boundary — Hard Rules

- Per-user credential vault paths are user-owned in OpenBao; no service-level access.
- Tenant admin cannot read user automation run data without OpenFGA consent-relationship grant (ADR-0120).
- No PHI in any automation flow payload; escalate to HealthStack if clinical data appears.
- GDPR: export + delete must be self-contained per user.

---

## Events

Produces: `personal.automation.run.completed`, `personal.automation.run.failed`

---

## Open Questions

- OQ-4: Per-user OpenBao path structure — must be resolved before P3.6 (Security team). Do not implement vault integration until resolved.
- OQ-5: NL automation suggest — default is LLM tool call with template registry context (validate latency at P3.3/P3.6).

---

## Agent Rules

- Read ADR-0204 §3.6 before adding or modifying automation flows.
- Workflow Canvas in "personal mode" = simplified UI; do not expose full business Canvas complexity.
- All 3rd-party API tokens (Gmail, Plaid, Slack, GitHub) are per-user BYO — never ship default credentials.
- AI actions via LiteLLM only.

---

## v1 Implementation Status (#745, contract-mock bar)

Personal (individual-scope) overlay over automation-core-service. Scaffolded via
`gen:service automation --write` (trio) + hand-authored domain contract. Composes
the core `AutomationsService` (status) and owns the node-editor save/load +
run-history polling + Expo trigger dispatch surface. SUBJECT-scoped: every read
filters by (tenantId, createdBy) so a user sees only their OWN automations (PII
boundary at this overlay). Reuses the core connector catalogue + run-lifecycle
SHAPES; does NOT fork the core.

**REST surface (lock-step `specs/automation.tsp`, `tsp compile` exit 0,
`@Controller('personal-automations')`):**

| Route | Purpose |
|---|---|
| `POST /personal-automations` | node-editor save (create) |
| `GET /personal-automations/{id}` | node-editor load |
| `PATCH /personal-automations/{id}` | node-editor save (edit) |
| `DELETE /personal-automations/{id}` | soft-archive |
| `GET /personal-automations/{id}/runs` | run-history web polling |
| `POST /personal-automations/{id}/trigger` | on-demand dispatch (Expo smoke), 202 |

Plus mold-locked `health|protected|whoami|protected-write`.

**Events:** `curaos.core.automation.created.v1` (scaffold lifecycle producer),
`curaos.core.automation.run.started.v1` (`personal-run-event-producer.ts`, emitted
on trigger).

**Done satisfied:** node-editor save/load + run-history web + Expo trigger smoke
wire to real REST shapes the personal-automation app's SDK generates from.
