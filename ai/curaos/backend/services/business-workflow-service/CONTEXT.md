# business-workflow-service — Agent Context

**ADR-0204 §3.2** | **Updated:** 2026-05-24

---

## Role in One Line

Business-tier NestJS overlay that registers pre-built Temporal workflow templates (deal pipeline, approvals, onboarding, escalations) into CuraOS Workflow Manager via `WorkflowCoreModule`.

---

## Stack

NestJS (TypeScript). Imports `WorkflowCoreModule`. Engine = Workflow Manager (ADR-0122). No Spring Boot, no Kotlin, no BPMN.

---

## This Service Owns

- 10 pre-built business workflow templates (v1) — see Requirements.md §2
- Per-template Cerbos RBAC policies
- CuraOS Builder App UI: template browser, instance monitor, approval inbox
- Events: `business.workflow.*` topic namespace

## This Service Does NOT Own

- Engine/runtime (→ Workflow Manager)
- Visual editor (→ Workflow Canvas ADR-0121d, reused)
- Personal-tier templates (→ personal-workflow-service)
- Healthcare templates (→ healthstack-workflow-service)

---

## Template Registration Pattern

```
Service boots
  → registers templates via WorkflowCoreModule
  → workflow-core-service validates + stores in registry
  → Codegen (ADR-0123) compiles IR → Temporal TS / Activepieces flow JSON
  → Workflow Manager deploys to runtime
  → Template active; visible in Builder App
```

---

## Events

Consumes: business-sales-service, business-hr-service, business-finance-service domain events (triggers)
Produces: `business.workflow.deal.stage-changed`, `business.workflow.approval.requested`, `business.workflow.approval.decided`, `business.workflow.onboarding.completed`

---

## Process-Definition Read Slice

The process-definition read path (`GET /workflow-definitions/{id}`) fetches the canonical definition JSON from `workflow-core-service` via `WorkflowCoreModule`. This service does not own the definition store; it reads through the core module and applies Cerbos view-permission before returning. The template browser in the Builder App UI uses this path. No writes to definitions are done in this service; template registration goes through `WorkflowCoreModule` registration APIs.

---

## Agent Rules

- No engine code; if workflow execution logic appears here it belongs in Workflow Manager.
- Cerbos policy must exist for every template before it can be activated.
- Approval inbox integrates with Tasks neutral service, not custom inbox storage.
- Process-definition reads go through `workflow-core-service` `WorkflowCoreModule` - do not query the core DB directly.
- Read ADR-0204 §3.2 before adding or modifying templates.
