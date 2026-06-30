# personal-workflow-service — Agent Context

**ADR-0204 §3.3** | **Updated:** 2026-05-24

---

## Role in One Line

Personal-tier NestJS overlay that registers GTD-style and life-automation Temporal + cron templates into Workflow Manager via `WorkflowCoreModule`. No engine, no cross-user data, no enterprise features.

---

## Stack

NestJS (TypeScript). Imports `WorkflowCoreModule`. Engine = Workflow Manager (ADR-0122). AI = LiteLLM (ADR-0114) + Vercel AI SDK 6 for NL quick-add. No Spring Boot, no Kotlin.

---

## This Service Owns

- 8 pre-built personal workflow templates (v1) — see Requirements.md §2
- Personal dashboard Builder App UI (board layout)
- NL quick-add AI template suggestion
- Events: `personal.workflow.*` topic namespace
- Per-user Cerbos isolation policies

## This Service Does NOT Own

- Engine/runtime (→ Workflow Manager)
- Business-tier templates (→ business-workflow-service)
- Personal automation flows (→ personal-automation-service)
- Healthcare flows (→ healthstack-workflow-service)

---

## Multi-Tenancy Model

PG17 schema = org-tenant. Rows = per-user within that schema. No cross-user row access without Cerbos SpiceDB grant. User data export/delete (GDPR) supported.

---

## Events

Consumes: calendar events, task completions, notification acks from neutral services
Produces: `personal.workflow.goal.milestone-reached`, `personal.workflow.habit.streak-broken`, `personal.workflow.instance.completed`

---

## Agent Rules

- No engine code — all execution via Workflow Manager.
- NL quick-add: LLM tool call with template registry as context (not vector embedding — per OQ-5 default, validate at P3.3).
- Per-user isolation is a hard boundary; no admin override without explicit Cerbos grant.
- Read ADR-0204 §3.3 before adding templates.
- No PHI — escalate to HealthStack if clinical data appears.
