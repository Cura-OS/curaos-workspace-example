# ADR-0204 — Cluster: Workflow + Automation Overlays

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — Workflow + Automation Overlays
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0121d Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0122 Workflow Manager (THE foundation engine)](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
**Parallel HealthStack overlays:** ADR-0115 §healthstack-workflow-service + healthstack-automation-service

---

## 1. Context

### 1.1 What this cluster is — and is NOT

These six services are **thin vertical overlays** on top of CuraOS Workflow Manager (ADR-0122). They are NOT independent workflow engines, automation runtimes, or visual editors. The engine (Temporal), the automation runtime (Activepieces), the cron scheduler (@nestjs/schedule), and the visual editor (Workflow Canvas, ADR-0121d) all live in ADR-0122. This cluster consumes them.

**Overlay pattern:** Each service in this cluster:
1. Registers domain-specific **workflow templates** (Temporal workflows) and **automation flows** (Activepieces flows) into the Workflow Manager at bootstrap.
2. Exposes a **domain-scoped UI surface** (admin console or personal dashboard) built on CuraOS Builder Apps (ADR-0121b), reusing the same Workflow Canvas editor.
3. Emits and consumes domain-specific **events** over Kafka/NATS (ADR-0102), with no direct DB coupling across overlays.
4. Enforces **per-overlay RBAC** via Cerbos (ADR-0120) on every workflow action.

### 1.2 Six services in scope

| Service | Tier | Purpose |
|---|---|---|
| `workflow-core-service` | Neutral core | Shared workflow primitives + activity library; thin NestJS wrapper exposing Workflow Manager APIs to downstream overlays |
| `business-workflow-service` | Business overlay | Pre-built business workflow templates (pipelines, approvals, onboarding, escalations) |
| `personal-workflow-service` | Personal overlay | GTD-style + life-automation flows for individual users |
| `automation-core-service` | Neutral core | Shared automation primitives; trigger + action SDK; Activepieces piece registry gateway |
| `business-automation-service` | Business overlay | Pre-built business automation library (CRM/ERP/HR/finance Activepieces pieces) |
| `personal-automation-service` | Personal overlay | Zapier/IFTTT-class personal automation for individuals |

### 1.3 Dependency direction

```
workflow-core-service  ──▶  CuraOS Workflow Manager (ADR-0122)
automation-core-service ──▶ CuraOS Workflow Manager (ADR-0122)
                                    ▲
business-workflow-service   ────────┤  (via workflow-core-service)
personal-workflow-service   ────────┤  (via workflow-core-service)
business-automation-service ────────┤  (via automation-core-service)
personal-automation-service ────────┘  (via automation-core-service)

healthstack-workflow-service    ──▶  workflow-core-service  (per ADR-0115)
healthstack-automation-service  ──▶  automation-core-service (per ADR-0115)
```

Rule: overlays depend on cores. Cores depend on Workflow Manager. Workflow Manager has no dependency on any overlay. CI must guard reverse coupling.

---

## 2. Decision summary

| Decision | Pick | Applies to |
|---|---|---|
| **Runtime** | NestJS (TS) per ADR-0100 | All 6 services |
| **Workflow engine** | Temporal TS SDK + nestjs-temporal-core (per ADR-0122) | All 6 (via Workflow Manager) |
| **Automation engine** | Activepieces CE (MIT, sidecar per ADR-0122) | All 6 (via Workflow Manager) |
| **Cron scheduling** | @nestjs/schedule + BullMQ per ADR-0122 | All 6 (via Workflow Manager) |
| **Visual editor** | CuraOS Workflow Canvas reused from ADR-0121d | All 6 (no custom editor) |
| **Codegen scaffold** | Codegen recipes per ADR-0123 emit Temporal TS + Activepieces flow JSON | All 6 |
| **Template registry** | OCI artifacts (cosign-signed) in Harbor per ADR-0123 | All 6 |
| **Messaging** | Kafka/NATS per ADR-0102; outbox pattern | All 6 |
| **Data** | PG17 schema-per-tenant + Valkey per ADR-0101 | All 6 |
| **Auth + RBAC** | Better Auth + Cerbos ABAC per ADR-0120 | All 6 |
| **Audit** | Hash-chain PG per ADR-0104 on every workflow lifecycle event | All 6 |
| **Observability** | OTel traces + Grafana per ADR-0107; per-workflow span | All 6 |
| **Local + 3rd-party** | Local: Workflow Manager self-hosted; 3rd-party: Temporal Cloud / Activepieces Cloud (BYO) | All 6, per ADR-0150 §2 |
| **Modulith topology** | Same NestJS codebase; runtime flag picks modulith vs microservice per ADR-0099 §5 | All 6 |
| **Multi-tenant isolation** | Per-tenant task-queue (SaaS) / namespace (enterprise) / cluster (on-prem) — inherited from ADR-0122 §5 | All 6 |

---

## 3. Per-service specification

### 3.1 `workflow-core-service`

**Role:** Neutral shared workflow primitive library. Owned by platform team. No vertical domain logic.

**Responsibilities:**
- Expose a **NestJS module** (`WorkflowCoreModule`) imported by business + personal overlay services. Provides typed clients to Workflow Manager's REST + tRPC API surface.
- Publish a **shared Temporal activity library** (`@curaos/workflow-activities`): common activities (notify user, update record, call external HTTP, emit event, await approval, escalate on SLA breach) that all overlay templates reference.
- Provide **workflow template base classes**: `CuraOSWorkflow` abstract class + decorators that overlay services extend to register domain templates.
- Maintain the **workflow template registry** in PG: template ID, version, compile target (Temporal / Activepieces / cron), overlay scope (business / personal / healthstack), active flag, marketplace visibility.
- Emit events: `workflow.template.registered`, `workflow.template.deprecated`, `workflow.instance.started`, `workflow.instance.completed`, `workflow.instance.failed`.

**Key libraries:**
- `nestjs-temporal-core` — Temporal worker registration + DI
- `@temporalio/client` + `@temporalio/workflow` + `@temporalio/activity`
- `@curaos/workflow-activities` (this service publishes it)
- `@nestjs/microservices` (Kafka + NATS transport)
- `bullmq` (cron job queue, per ADR-0150 §3 swap)

**Codegen recipes (ADR-0123):**
- `workflow-core:activity` — scaffold a new shared Temporal activity
- `workflow-core:base-workflow` — scaffold abstract workflow base class with registry hook

**API surface:**
- REST + tRPC: `GET /workflow-templates`, `POST /workflow-templates/install`, `GET /workflow-templates/:id/versions`
- Internal gRPC (to Workflow Manager): forward workflow start/signal/query calls with tenant context injected

**Does NOT own:** the Temporal cluster, Activepieces runtime, visual editor, or any vertical domain logic.

---

### 3.2 `business-workflow-service`

**Role:** Business-tier vertical overlay. Owns and registers pre-built business workflow templates.

**Pre-built template library (v1):**

| Template | Compile target | Description |
|---|---|---|
| `deal-pipeline` | Temporal | CRM deal stages: prospect → qualified → proposal → negotiation → closed-won/lost; SLA timers per stage |
| `contract-approval` | Temporal | Multi-step approval: drafter → legal → finance → exec; parallel for large deals; compensation on rejection |
| `employee-onboarding` | Temporal | IT provisioning → HR docs → manager intro → 30-60-90 plan; parallel tracks; reminder timers |
| `customer-escalation` | Temporal | Support ticket SLA breach → L2 escalation → manager notification → exec loop |
| `finance-approval` | Temporal | Purchase request → budget check → finance → CFO (above threshold); audit at every step |
| `vendor-onboarding` | Temporal | Vendor application → compliance check → contract → system provisioning |
| `performance-review` | Temporal + cron | Annual cycle: schedule review → collect 360 → manager meeting → document outcome |
| `invoice-approval` | Activepieces | Event-driven: invoice received → OCR → PO match → route to approver → payment trigger |
| `lead-enrichment` | Activepieces | Lead created → enrich via CRM pieces (HubSpot / Salesforce) → score → assign |
| `expense-report` | Activepieces | Expense submitted → receipt OCR → policy check → auto-approve or route |

**Admin UI:**
- CuraOS Builder App (ADR-0121b) with embedded Workflow Canvas (ADR-0121d)
- Per-tenant template browser: browse installed templates, clone + customize, activate/deactivate
- Instance monitor: running workflows per template, SLA heat map, failure rate
- Approval inbox: pending approvals per user (integrates with Tasks neutral service)

**Events produced:** `business.workflow.deal.stage-changed`, `business.workflow.approval.requested`, `business.workflow.approval.decided`, `business.workflow.onboarding.completed`, etc.

**Events consumed:** domain events from business-sales-service, business-hr-service, business-finance-service (loose coupling; triggers workflow instances).

**RBAC (Cerbos):** per-template permissions (who can start, approve, cancel, view instance history) driven by org role hierarchy.

**Codegen recipes:** `business-workflow:template` — scaffold a new business Temporal workflow + Cerbos policy + Builder UI page for the approval inbox component.

---

### 3.3 `personal-workflow-service`

**Role:** Personal-tier vertical overlay. Owns GTD-style and life-automation flows for individual users.

**Pre-built template library (v1):**

| Template | Compile target | Description |
|---|---|---|
| `gtd-capture-process` | Temporal | Inbox capture → clarify (is it actionable?) → organize → review → engage; weekly review reminder |
| `goal-tracker` | Temporal + cron | Goal set → weekly check-in prompt → progress log → milestone celebration → retrospective |
| `habit-tracker` | cron + Activepieces | Daily habit reminder → completion log → streak computation → streak-break notification |
| `reading-list` | Activepieces | Article saved → tag + summarize (AI via LiteLLM per ADR-0114) → weekly digest email |
| `errand-batcher` | Temporal | Collect errands by location → batch into optimized route → calendar block |
| `personal-finance-check` | cron + Activepieces | Monthly: pull account balances → categorize → vs budget → summary notification |
| `travel-prep` | Temporal | Trip created → checklist generation → reminders at T-7d/T-1d → post-trip retrospective |
| `birthday-tracker` | cron + Activepieces | Upcoming birthday → gift idea prompt (AI) → reminder → send message |

**Personal dashboard UI:**
- Lighter CuraOS Builder App (ADR-0121b); personal board layout (not admin console)
- My workflows: active instances, upcoming due dates, streak displays
- Quick-add: natural-language input → AI suggests matching template (Vercel AI SDK 6 + LiteLLM)

**Multi-tenancy:** per-user data isolation (user-scoped PG rows, not schema-per-tenant at user level; schema is per-org-tenant, rows are per-user within it).

**Events produced:** `personal.workflow.goal.milestone-reached`, `personal.workflow.habit.streak-broken`, `personal.workflow.instance.completed`.

**Events consumed:** calendar events, task completions, notification acks from neutral services.

**RBAC:** user owns their own instances; no cross-user visibility (unless explicitly shared via Cerbos relationship grant).

**Codegen recipes:** `personal-workflow:template` — scaffold a personal Temporal workflow + cron trigger + personal dashboard card component.

---

### 3.4 `automation-core-service`

**Role:** Neutral shared automation primitive library. Parallel to `workflow-core-service` but for Activepieces-class automation.

**Responsibilities:**
- Expose `AutomationCoreModule` (NestJS module) imported by business + personal automation overlays.
- Maintain a **piece registry gateway**: index of available Activepieces pieces (280+ stock + custom tenant pieces), version metadata, piece health checks.
- Provide **trigger SDK**: typed wrappers for trigger types (webhook, polling, Kafka event, cron, manual) that overlay services use to register automation triggers.
- Provide **action SDK**: typed wrappers for action types (HTTP call, emit event, update record, notify user, call Temporal workflow, call AI model) composable by overlay templates.
- Maintain the **automation template registry** in PG: template ID, version, trigger type, piece dependencies, overlay scope, active flag.
- Emit events: `automation.template.registered`, `automation.instance.triggered`, `automation.instance.completed`, `automation.instance.failed`, `automation.piece.health-changed`.

**Key libraries:**
- Activepieces CE SDK (piece development kit, MIT)
- `@nestjs/microservices` (Kafka/NATS)
- `bullmq` (trigger polling queue)
- `@temporalio/client` (for action: "start Temporal workflow from automation")

**Codegen recipes:**
- `automation-core:piece` — scaffold a new Activepieces custom piece (trigger + actions)
- `automation-core:base-automation` — scaffold an automation template with trigger + action chain

**API surface:**
- REST + tRPC: `GET /pieces`, `POST /automations/install`, `POST /automations/:id/enable`, `GET /automations/:id/runs`
- Webhook ingress endpoint (proxied from APISIX per ADR-0103) for external triggers

---

### 3.5 `business-automation-service`

**Role:** Business-tier automation overlay. Pre-built automation library for CRM/sales/finance/HR/ops systems.

**Pre-built automation library (v1 — Activepieces flows):**

| Automation | Trigger | Action chain | Target system(s) |
|---|---|---|---|
| `crm-lead-to-deal` | Webhook (form submit) | Enrich lead → create CRM contact → assign to rep → notify Slack | HubSpot / Salesforce pieces |
| `contract-signed-notify` | Webhook (e-sign) | Parse signed doc → update CRM deal → notify legal + finance → archive in storage | DocuSign / HelloSign pieces |
| `invoice-created-sync` | Kafka event | New invoice → sync to accounting → create payment record → notify AP | QuickBooks / Xero pieces |
| `hr-offboarding` | Webhook (HR system) | Deprovision SSO → revoke access → archive email → update payroll | SCIM + HR pieces |
| `support-ticket-sla` | Cron (every 5 min) | Query open tickets past SLA → escalate in helpdesk → notify manager | Zendesk / Freshdesk pieces |
| `sales-report-daily` | Cron (daily 8am) | Aggregate CRM data → format report → send email digest | HubSpot + Gmail pieces |
| `social-listen-respond` | Polling (every 15 min) | Monitor brand mentions → AI sentiment → auto-draft reply (LiteLLM) → queue for human review | Twitter/LinkedIn pieces + AI action |
| `inventory-reorder` | Kafka event (stock-low) | Check reorder threshold → create PO in procurement → notify buyer | Procurement service events |

**BYO connector integrations:**
- Per ADR-0150 §2 local + 3rd-party rule: all pieces above are 3rd-party integrations (BYO API credentials per tenant). The automation runtime (Activepieces sidecar) is local/self-hosted by default; tenants can switch to Activepieces Cloud (BYO).
- Custom piece registry per tenant: tenant can install signed custom pieces from Harbor (per ADR-0123 OCI artifact model).

**Admin UI:**
- CuraOS Builder App: automation library browser, per-automation run history, error log, piece credential vault (references OpenBao per ADR-0108), enable/disable toggle per automation per tenant.

**Events produced:** `business.automation.run.completed`, `business.automation.run.failed`, `business.automation.piece.credential-expired`.

**Codegen recipes:** `business-automation:flow` — scaffold a new Activepieces flow with trigger + actions + Cerbos RBAC policy + Builder admin card.

---

### 3.6 `personal-automation-service`

**Role:** Personal-tier automation overlay. Zapier/IFTTT-class automation for individual users.

**Pre-built automation library (v1 — Activepieces flows):**

| Automation | Trigger | Action chain |
|---|---|---|
| `gmail-to-task` | Gmail polling | New email matching filter → create Task in neutral task service → label email |
| `calendar-daily-brief` | Cron (7am daily) | Fetch today's calendar → weather (API) → AI summary (LiteLLM) → push notification |
| `rss-to-readinglist` | Polling (RSS) | New article in feed → save to reading list → summarize (AI) → tag |
| `slack-save-message` | Webhook (Slack) | Message starred → save to personal knowledge base → embed for search |
| `photo-auto-album` | Webhook (cloud storage event) | New photo → AI tag (scene/people) → sort into auto-album → notify |
| `bank-transaction-log` | Polling (Plaid) | New transaction → categorize (AI) → append to personal finance log → alert if over budget |
| `github-pr-reminder` | Cron (9am Mon-Fri) | Fetch open PRs assigned to user → morning digest notification |
| `birthday-social-post` | Cron (daily) | Check contacts birthdays today → draft post (AI) → queue for user approval → post on approval |

**User experience:**
- Citizen-developer-friendly: step-by-step automation builder (Workflow Canvas in simplified "personal mode") — no code required.
- Natural-language automation creation: "remind me when my flights are updated" → AI (LiteLLM) suggests matching template.
- Per-user credential vault (OpenBao per ADR-0108): each user stores their own 3rd-party API tokens, isolated.
- Run log per automation: last 30 runs, success/fail, duration, output summary.

**Personal data boundary:** user automation data (runs, credentials, config) is strictly per-user. No cross-user access. Tenant admin cannot view user automation run data without explicit consent grant (Cerbos SpiceDB relationship per ADR-0120).

**Events produced:** `personal.automation.run.completed`, `personal.automation.run.failed`.

**Codegen recipes:** `personal-automation:flow` — scaffold a personal Activepieces flow + personal dashboard card + per-user Cerbos isolation policy.

---

## 4. Cross-service architecture

### 4.1 Shared event topology

```
External triggers (webhooks / polling / Kafka events)
          │
          ▼
  automation-core-service  (trigger ingress + routing)
          │
          ├──▶  business-automation-service  (if business-scope trigger)
          │
          └──▶  personal-automation-service  (if personal-scope trigger)
                          │
                          ▼
              CuraOS Workflow Manager (ADR-0122)
              Activepieces runtime (execute automation flow)
              Temporal worker pool  (if compile target = Temporal)
                          │
                          ▼
              Kafka/NATS  (emit domain events on completion)
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
         business services   personal services
         (consume events)    (consume events)
```

### 4.2 Workflow template activation flow

```
1. Service boots → registers templates in workflow-core-service registry
2. workflow-core-service validates template (version, compile target, schema)
3. Codegen (ADR-0123) compiles IR → Temporal TS workflow code (if Temporal target)
   OR → Activepieces flow JSON (if Activepieces target)
   OR → NestJS cron job (if cron target)
4. Workflow Manager deploys:
   - Temporal: registers workflow type + activity types in Temporal namespace
   - Activepieces: imports flow JSON into Activepieces runtime
   - Cron: registers schedule in @nestjs/schedule pool
5. Template marked active in registry; available to tenant users via UI
```

### 4.3 Tenant workflow instance lifecycle

```
User starts workflow (via UI or API)
          │
          ▼
workflow-core-service → resolves tenant routing (task-queue / namespace / cluster per ADR-0122 §5)
          │
          ▼
Workflow Manager → starts Temporal workflow execution
          │
          ├── Temporal Worker executes workflow + activities
          ├── Audit interceptor → hash-chain PG (every lifecycle event, per ADR-0104)
          └── OTel trace span emitted per step (per ADR-0107)
          │
          ▼
Completion event → Kafka/NATS → consuming service or user notification
```

---

## 5. Local + 3rd-party rule (per ADR-0150 §2)

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| Workflow engine | Temporal self-hosted (via Workflow Manager) | Temporal Cloud (BYO credentials per tenant) |
| Automation runtime | Activepieces CE sidecar self-hosted | Activepieces Cloud (BYO) |
| Automation pieces | 280+ stock Activepieces pieces + Harbor custom pieces | Tenant-supplied pieces via OCI artifact |
| Cron scheduler | @nestjs/schedule + BullMQ self-hosted | External cron-as-a-service (BYO webhook trigger) |
| Credential vault | OpenBao self-hosted (per ADR-0108) | HashiCorp Vault Cloud / AWS Secrets Manager (BYO) |
| Notification actions | CuraOS Notify service (neutral core) | SendGrid / Twilio / Slack (BYO via Activepieces pieces) |
| AI actions in flows | vLLM (Qwen3/DeepSeek) via LiteLLM (per ADR-0114) | OpenAI / Anthropic via LiteLLM (BYO) |

---

## 6. Multi-tenant isolation (inherited from ADR-0122 §5)

All six services inherit the Workflow Manager multi-tenant model without modification:

| Deployment profile | Isolation |
|---|---|
| SaaS shared cluster | Task-queue-per-tenant in shared Temporal namespace; Activepieces per-tenant flow namespace |
| Enterprise / regulated | Temporal namespace-per-tenant; separate Activepieces schema |
| On-prem / air-gap | Temporal cluster-per-tenant; Activepieces instance-per-tenant bundled in OCI install |

No overlay service manages Temporal namespaces or task queues directly — that is owned by Workflow Manager. Overlays pass tenant context; Workflow Manager routes.

---

## 7. HealthStack tie-in (per ADR-0115)

`healthstack-workflow-service` and `healthstack-automation-service` (defined in ADR-0115) are **parallel overlays** in the HealthStack domain, consuming the same `workflow-core-service` and `automation-core-service` as their neutral-core gateway:

- `healthstack-workflow-service` imports `WorkflowCoreModule` + registers clinical pathway templates (admission, encounter, care plan, EMS dispatch, claims saga — per ADR-0122 §7).
- `healthstack-automation-service` imports `AutomationCoreModule` + registers clinical automation flows (lab result → notify clinician, consent expiration → reminder, FHIR resource events → update external EHR).

PHI boundary: healthstack overlays store PHI in their own PG schema; workflow/automation cores see only workflow instance IDs + metadata references, never clinical payload. Audit interceptor on every workflow step captures who triggered what, with no PHI in audit payload for non-HealthStack overlays.

---

## 8. Codegen scaffold summary (per ADR-0123)

| Recipe | Output | Used by |
|---|---|---|
| `workflow-core:activity` | Temporal activity class + unit test | workflow-core-service, healthstack-workflow-service |
| `workflow-core:base-workflow` | Abstract CuraOS workflow class + registry hook | All workflow overlay services |
| `business-workflow:template` | Temporal workflow + Cerbos policy + Builder UI page (approval inbox) | business-workflow-service |
| `personal-workflow:template` | Temporal workflow + cron trigger + dashboard card | personal-workflow-service |
| `automation-core:piece` | Activepieces custom piece (trigger + actions + auth schema) | automation-core-service, business-automation-service |
| `automation-core:base-automation` | Automation template with trigger + action chain + run log | All automation overlay services |
| `business-automation:flow` | Activepieces flow + Cerbos RBAC policy + Builder admin card | business-automation-service |
| `personal-automation:flow` | Activepieces flow + per-user Cerbos isolation + dashboard card | personal-automation-service |

All recipes follow the `.gen.ts` split convention (ADR-0123 §4): engine-generated files never touch non-`.gen.ts` custom logic.

---

## 9. Build sequence

### Phase 1 — Core infrastructure (prerequisite: ADR-0122 M1–M6 complete)

| Step | Service | Deliverable |
|---|---|---|
| P1.1 | workflow-core-service | NestJS module skeleton + `WorkflowCoreModule` + Temporal client wrapper + template registry PG schema |
| P1.2 | automation-core-service | NestJS module skeleton + `AutomationCoreModule` + piece registry gateway + trigger/action SDK |
| P1.3 | workflow-core-service | Shared activity library (`@curaos/workflow-activities` npm package) — notify, await-approval, escalate, call-HTTP, emit-event |
| P1.4 | workflow-core-service | Codegen recipes: `workflow-core:activity` + `workflow-core:base-workflow` |
| P1.5 | automation-core-service | Codegen recipes: `automation-core:piece` + `automation-core:base-automation` |

### Phase 2 — Business overlays

| Step | Service | Deliverable |
|---|---|---|
| P2.1 | business-workflow-service | deal-pipeline + contract-approval + employee-onboarding templates (Temporal) |
| P2.2 | business-workflow-service | customer-escalation + finance-approval + vendor-onboarding templates |
| P2.3 | business-workflow-service | performance-review (Temporal + cron) + invoice-approval (Activepieces) + lead-enrichment + expense-report automations |
| P2.4 | business-workflow-service | Builder App UI: template browser + instance monitor + approval inbox |
| P2.5 | business-automation-service | crm-lead-to-deal + contract-signed-notify + invoice-created-sync + hr-offboarding automations |
| P2.6 | business-automation-service | support-ticket-sla + sales-report-daily + social-listen-respond + inventory-reorder automations |
| P2.7 | business-automation-service | Builder App UI: automation library browser + run history + credential vault UI |

### Phase 3 — Personal overlays

| Step | Service | Deliverable |
|---|---|---|
| P3.1 | personal-workflow-service | gtd-capture-process + goal-tracker + habit-tracker + reading-list templates |
| P3.2 | personal-workflow-service | errand-batcher + personal-finance-check + travel-prep + birthday-tracker templates |
| P3.3 | personal-workflow-service | Personal dashboard UI (Builder App, personal board layout) + NL quick-add (AI template suggest) |
| P3.4 | personal-automation-service | gmail-to-task + calendar-daily-brief + rss-to-readinglist + slack-save-message automations |
| P3.5 | personal-automation-service | photo-auto-album + bank-transaction-log + github-pr-reminder + birthday-social-post automations |
| P3.6 | personal-automation-service | Personal automation builder UI (Canvas simplified mode) + per-user credential vault |

### Phase 4 — Hardening

| Step | Deliverable |
|---|---|
| P4.1 | Audit coverage: hash-chain events for every workflow/automation lifecycle step across all 6 services |
| P4.2 | Per-tenant resource limits (max concurrent workflows, max automation runs/hr) via Workflow Manager tenant config |
| P4.3 | Air-gap bundle validation: all 6 services verified in offline Temporal + Activepieces local install |
| P4.4 | OTel trace validation: per-workflow spans visible in Grafana across all templates |
| P4.5 | Security audit: RBAC coverage (Cerbos policies per template), PHI boundary check for HealthStack overlap |
| P4.6 | Marketplace v0: publish first-party templates to Workflow Manager marketplace; cosign-sign all OCI artifacts |

---

## 10. Definition of Done (per AGENTS.md §9)

A service in this cluster is **done** when:

1. All Phase 1–4 steps above for that service are green.
2. `WorkflowCoreModule` / `AutomationCoreModule` import verified in overlay service integration test.
3. All pre-built templates activate cleanly against a running Workflow Manager (Temporal + Activepieces sidecar).
4. Codegen recipes produce compilable scaffold; round-trip IR → Temporal TS + Activepieces flow JSON verified.
5. Builder App UI renders template browser + instance monitor with live data (no mocks).
6. Cerbos policies enforce per-template permissions (start, approve, cancel, view); automated RBAC test suite green.
7. Audit: every workflow lifecycle event captured in hash-chain PG; spot-check replay verifies integrity.
8. OTel traces present end-to-end for at least 3 templates per service.
9. Air-gap install bundle boots and runs templates offline.
10. Per-module `Requirements.md` + `CONTEXT.md` under `ai/curaos/backend/services/<service>/` updated to reflect final stack + owned templates.

---

## 11. Open questions

| # | Question | Assigned to | Resolution target |
|---|---|---|---|
| OQ-1 | Activepieces deployment shape per service: shared sidecar (one Activepieces instance all overlays share) vs per-overlay sidecar? Default: single shared Activepieces sidecar owned by Workflow Manager; overlays register flows into it. Confirm before P1.2. | Platform team | Before P2.1 |
| OQ-2 | Cross-overlay workflow: can a personal workflow trigger a business workflow? E.g., personal goal milestone → business KPI update. Default: no direct call; emit event instead. Needs policy decision. | Architecture guild | Before P2.1 |
| OQ-3 | Template marketplace: first-party templates are CuraOS-shipped. Community templates (tenant-published) — same marketplace or separate? Per ADR-0122 §10 OQ-3: likely both. Need tier classification. | Product + Platform | Before P4.6 |
| OQ-4 | Personal automation credential vault scope: per-user within tenant schema, or per-user with user-owned OpenBao path? Tenant admin cannot see user credentials by design. Exact OpenBao path structure TBD. | Security team | Before P3.6 |
| OQ-5 | AI-suggested automation (NL → template match): use vector embedding of template descriptions vs LLM tool call? Default: LLM tool call with template registry as tool context. Validate latency at P3.3. | AI team | Before P3.3 |
| OQ-6 | HealthStack PHI boundary audit: do any shared workflow activities in `@curaos/workflow-activities` touch FHIR resource payloads? Must not. Verify during P4.5 security audit. | HealthStack + Security | P4.5 |

---

## 12. References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0102 Events + Messaging](0102-event-messaging.md)
- [ADR-0103 API Surface](0103-api-surface.md)
- [ADR-0104 Identity + Audit](0104-identity-auth.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0108 Security + Secrets](0108-security-secrets.md)
- [ADR-0114 AI/Agent Integration](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0121b Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121d Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0122 Foundation Workflow Manager (THE engine)](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
- Temporal TypeScript SDK: https://docs.temporal.io/develop/typescript
- nestjs-temporal-core: https://www.npmjs.com/package/nestjs-temporal-core
- Activepieces CE: https://www.activepieces.com/
- BullMQ: https://docs.bullmq.io/
- Cerbos: https://www.cerbos.dev/
- OpenBao: https://openbao.org/
