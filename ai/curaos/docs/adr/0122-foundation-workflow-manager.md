# ADR-0122 — Foundation Product: Workflow Manager

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md), [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
**Companion research:** [`../research/0122-workflow-research.md`](../research/0122-workflow-research.md)
**Supersedes (for recommendation):** [ADR-0105 Workflow/BPM (DRAFT)](0105-workflow-bpm.md)

---

## 1. Context

**CuraOS Workflow Manager** = one of four foundation products. Standalone SaaS product + orchestration spine for cross-service flows. BPMN deprecated per ADR-0099 §7.

Per ADR-0100: pure NestJS core. OSS engines as sidecars/libraries.

Per user directive: **Temporal + Activepieces + cron scheduling as defaults**, with good defaults so most users never touch config. Single product, three paradigms wired together, **same editor for all three** (reuses CuraOS Workflow Canvas from Builder ADR-0121).

---

## 2. Decision summary

| Decision | Pick |
|---|---|
| **Primary engine** | Temporal (TS SDK + nestjs-temporal-core, MIT) — durable execution + sagas |
| **Visual automation engine (default)** | Activepieces (MIT) — embedded in CuraOS Workflow Manager |
| **Cron scheduling (default)** | @nestjs/schedule + Jobrunr (per ADR-0102) — embedded; tenant configures time triggers |
| **Multi-tenant pattern** | Hybrid — task-queue-per-tenant in shared Temporal namespace (SaaS); namespace-per-tenant (enterprise/regulated); cluster-per-tenant (on-prem/air-gap) |
| **Visual editor** | Reuse CuraOS Workflow Canvas from Builder (ADR-0121) — same `@xyflow/react` editor; compile target picker |
| **Product packaging** | Single CuraOS Workflow Manager product with three paradigms wired in by default; user can skip / edit in same editor |
| **Plugin model** | NestJS sidecar (per ADR-0123) for custom activities; WASM components for sandboxed tenant logic |
| **Audit** | Hash-chained PG (per ADR-0104) on every workflow start/complete/fail/retry/timeout |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│              CuraOS Workflow Manager (NestJS product)            │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  CuraOS Workflow Canvas (reused from Builder ADR-0121)   │  │
│   │  @xyflow/react + custom CuraOS nodes                     │  │
│   │  - Compile target picker: Temporal / Activepieces / Cron │  │
│   │  - Subgraphs for forms (Formily) + state machines (XState)│  │
│   │  - AI fill / suggest via Vercel AI SDK 6                 │  │
│   └─────────────────────────┬────────────────────────────────┘  │
│                             │                                    │
│                             │ Flow IR (JSON)                     │
│                             │ + compile target                   │
│                             ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │             Codegen (ADR-0123) emits to:                │  │
│   │                                                         │  │
│   │   ┌───────────┐  ┌─────────────┐  ┌──────────────┐    │  │
│   │   │ Temporal  │  │ Activepieces│  │ NestJS sched │    │  │
│   │   │ TS SDK    │  │ Flow JSON   │  │ + Jobrunr    │    │  │
│   │   └────┬──────┘  └──────┬──────┘  └──────┬───────┘    │  │
│   └────────┼──────────────────┼──────────────────┼──────────┘  │
│            │                  │                  │              │
│   ┌────────▼──────────┐  ┌────▼─────────┐  ┌────▼──────────┐  │
│   │ Temporal Worker   │  │ Activepieces │  │ NestJS App    │  │
│   │ pool (NestJS)     │  │ runtime      │  │ schedule pool │  │
│   │ + nestjs-temporal │  │ (sidecar or  │  │               │  │
│   │   -core           │  │  library)    │  │               │  │
│   └────────┬──────────┘  └──────┬───────┘  └──────┬────────┘  │
└────────────┼─────────────────────┼──────────────────┼──────────┘
             │                     │                  │
             ▼                     ▼                  ▼
   ┌───────────────────┐  ┌──────────────────┐ ┌──────────────────┐
   │ Temporal Server   │  │ Activepieces DB  │ │ Valkey / PG      │
   │ (Go binary,       │  │ (PG schema)      │ │ (job state)      │
   │  per ADR-0102)    │  │                  │ │                  │
   └───────────────────┘  └──────────────────┘ └──────────────────┘
             │
             ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Persistence + events: PG17 (ADR-0101), Kafka/NATS       │
   │  (ADR-0102), Auth (ADR-0120), Audit (ADR-0104)           │
   └──────────────────────────────────────────────────────────┘
```

---

## 4. Why Temporal + Activepieces + Cron (defaults)

| Engine | Use case | Why |
|---|---|---|
| **Temporal TS SDK** | Long-running durable workflows, sagas, retries, timers, cross-service compensating actions | Production-proven at Twilio/Coinbase/Snap scale. MIT. nestjs-temporal-core wraps it idiomatically into NestJS DI. Most powerful + reliable durable execution OSS available. |
| **Activepieces** | Visual automation, tenant DIY flows, integrations with 280+ external pieces | MIT (community edition). Embeddable via iframe + JWT. Tenant-friendly UX (Zapier-class). Fills the no-code/no-Temporal gap. |
| **NestJS schedule + Jobrunr** | Cron triggers, periodic jobs, simple time-based execution | Already chosen per ADR-0102. Lightweight. Zero extra infrastructure. |

**Same editor for all three.** Per user directive: CuraOS Workflow Canvas (from Builder ADR-0121) covers the visual surface. Compile target picker decides which engine executes the designed flow.

| Compile target | When to pick (default heuristic) |
|---|---|
| Temporal | Flow uses `await`/long-running steps, retries, timers, compensation; cross-service saga |
| Activepieces | Flow is event/trigger-driven, uses pre-built piece integrations, simple step chain |
| Cron + NestJS schedule | Flow has only time trigger + single action; no durability needed |

**Good defaults so most users never touch this:** picker auto-selects based on flow shape; user can override.

---

## 5. Multi-tenant pattern (hybrid)

| Deployment profile | Pattern | Why |
|---|---|---|
| **SaaS (shared cluster)** | Task-queue-per-tenant in shared Temporal namespace | Supports 10k+ tenants per cluster. Per-tenant isolation via queue. Audit per-tenant via task metadata. Research-confirmed pattern (Temporal docs). |
| **Enterprise / regulated** | Namespace-per-tenant in shared cluster | Stronger isolation (separate workflow registry, history, search). Caps ~50 namespaces per cluster but enterprise tier has few tenants. |
| **On-prem / air-gap / hospital** | Cluster-per-tenant | Each customer = own Temporal cluster bundled in OCI install (per ADR-0109). Maximum isolation. Customer-owned infra. |

CuraOS Workflow Manager NestJS shell handles routing: tenant ID → namespace + task queue selection at workflow-start time.

---

## 6. License + governance audit

| Library | License | Risk |
|---|---|---|
| Temporal | MIT | ✅ Clean. CNCF-aligned governance. |
| nestjs-temporal-core | MIT | ✅ Clean. Community-maintained. |
| Activepieces CE | MIT | ✅ Clean. Vendor (Activepieces Inc) commercial EE tier exists but CE remains MIT. |
| @nestjs/schedule | MIT | ✅ Clean. |
| Jobrunr | LGPL-3.0 (linker exception) | ✅ Clean for SaaS distribution per LGPL linker rule. |
| @xyflow/react | MIT | ✅ Clean. (Already cleared in ADR-0121.) |
| Yjs + Hocuspocus v4 | MIT | ✅ Clean. |
| XState v5 | MIT | ✅ Clean. |
| Formily | MIT | ✅ Clean. |

**Disqualified:**
| Library | Reason |
|---|---|
| Camunda 8 / Zeebe | BSL — prohibits CuraOS multi-tenant SaaS use case (per ADR-0105 + ADR-0099) |
| Camunda 7 community | Community frozen Oct 2025 (per ADR-0105) |
| n8n | Sustainable Use License blocks embedding in commercial product |
| Restate | BSL — same risk as Camunda 8 |
| Flowable EE | Apache 2.0 core OK but BPMN deprecated per ADR-0099 |
| Kestra | Apache 2.0 core OK but multi-tenancy requires EE; deferred to v2/v3 if specific plugin marketplace value |
| Inngest, Trigger.dev | Apache 2.0 but smaller communities than Temporal; revisit if Temporal limitations surface |

---

## 7. Healthcare-specific workflow patterns

| Pattern | Compile target | OSS aid |
|---|---|---|
| Admission → encounter → orders → meds → discharge | Temporal (long-running stateful) | Custom CuraOS nodes mapping to FHIR resources |
| Care plan execution (FHIR PlanDefinition + ActivityDefinition + Task) | Temporal | `@medplum/core` for FHIR resource manipulation |
| EMS dispatch | Temporal + WebSocket SSE for real-time | NEMSIS 3.5 schema validators |
| Claims submission saga (Da Vinci PAS / PCT) | Temporal (compensating action on rejection) | X12 EDI libs |
| Patient registration (Identity + FHIR + Notify + Billing) | Temporal | CuraOS service clients (codegen ADR-0123) |
| Lab result coordination | Activepieces (event-triggered: lab → notify clinician → update FHIR) | Activepieces pieces |
| Daily medication reminders | Cron | NestJS schedule |
| Consent expiration check | Cron + Temporal compensating workflow | NestJS schedule + Temporal cron schedule |

---

## 8. Plugin model (per ADR-0123)

| Plugin type | Mechanism | Use case |
|---|---|---|
| **Custom Activity (Temporal)** | NestJS sidecar (gRPC/Unix-socket); Temporal activity invokes via NestJS microservice transport | Tenant-specific external API integration, heavy compute |
| **Custom Piece (Activepieces)** | TS module loaded into Activepieces runtime; or NestJS sidecar | Tenant-specific connectors (their own systems) |
| **Custom Node (Workflow Canvas)** | React component + Codegen recipe per ADR-0123 | Tenant-specific visual node (e.g., "send FHIR ServiceRequest") |
| **WASM-component activity** | Wasmtime sandbox inside NestJS host; called from Temporal activity wrapper | Tenant-supplied untrusted code (sandboxed) |
| **Interceptor on workflow lifecycle** | NestJS Interceptor registered on workflow start/complete/fail/retry events | Audit, custom metrics, alerting hooks |

---

## 9. Enterprise-grade v1 checklist

| Category | v1 Requirement |
|---|---|
| **Durable execution** | Temporal cluster operational; workflows survive worker crash + restart |
| **Visual automation** | Activepieces runtime + 280+ pieces + visual editor (reused Workflow Canvas) |
| **Cron scheduling** | @nestjs/schedule + Jobrunr in NestJS shell |
| **Multi-tenant** | All three patterns (task-queue / namespace / cluster) operational |
| **Tenant DIY flows** | Citizen-developer-friendly editor + audit + permission model |
| **Workflow versioning** | Pinned vs Auto-Upgrade Worker Versioning (per Temporal new pattern, GA Q4 2025/Q1 2026) |
| **Replay determinism** | TS sandbox neutralizes Math.random / Date.now / fetch in workflow code |
| **Long-running workflows** | continueAsNew pattern documented + auto-applied for clinical pathways |
| **Cross-service sagas** | Temporal Nexus (GA 2025) for cross-namespace service-to-service |
| **Audit** | Hash-chain PG (ADR-0104) on every workflow lifecycle event |
| **Observability** | OpenTelemetry traces per workflow (per ADR-0107) + Grafana Temporal integration (Nov 2025+) |
| **Air-gap** | Temporal self-hosted air-gap install + Activepieces local piece registry + Jobrunr embedded |
| **API surface** | REST + GraphQL + tRPC + webhooks (per ADR-0103 + ADR-0120) for workflow management |
| **SDKs** | JS/TS, Go, Kotlin, Python, PHP via Codegen (ADR-0123) |
| **AI assist** | Workflow Canvas AI fill ("generate a workflow for patient registration") via Vercel AI SDK 6 → LiteLLM |
| **Marketplace** | Tenant-installable workflow templates + Activepieces pieces + custom nodes; cosign-signed |
| **Pricing** | Per-execution + per-action consumption model (matches market standard: Temporal Cloud $50/M actions baseline) |
| **Tenant DIY safety** | Per-tenant resource limits (CPU, memory, max concurrent workflows, max retries); rate-limit on external calls |

---

## 10. Open questions (resolved later)

1. **Activepieces deployment shape** — embed library in NestJS process, OR sidecar service? Default: sidecar (cleanest); embed mode for SMB.
2. **Cross-tenant workflow sharing** — same model as Auth federation (ADR-0120)? Likely yes; per-tenant workflow registry + opt-in cross-tenant publish.
3. **Workflow marketplace** — first-party templates vs community? Likely both; first-party shipped (HealthStack pathways, common business automations); community via signed packages.
4. **Compensating action UX** — how does Workflow Canvas express "if this step fails, run this rollback step"? Decided in M2.
5. **Worker autoscaling** — KEDA on Temporal task-queue depth (per ADR-0111). Configuration TBD.
6. **Kestra add-on tier** — when (if ever) to ship Kestra as plugin marketplace optional? Deferred to v2; reassess if Activepieces piece library insufficient.

---

## 11. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | NestJS shell + tenant interceptor + Temporal TS SDK + nestjs-temporal-core wired |
| M2 | Temporal cluster ops + worker pool + multi-tenant routing (task-queue + namespace) |
| M3 | Workflow Canvas integration (reuse Builder editor) + compile target picker + flow IR |
| M4 | Codegen recipes (ADR-0123): IR → Temporal TS workflow code; IR → Activepieces flow JSON; IR → NestJS scheduled job |
| M5 | Activepieces runtime embedded (sidecar) + 280+ stock pieces |
| M6 | Cron scheduling (NestJS schedule + Jobrunr) + workflow trigger types |
| M7 | Plugin SDK: Custom Activity (sidecar) + Custom Piece + Custom Node + WASM component |
| M8 | Audit interceptor hash-chain on every lifecycle event |
| M9 | Workflow versioning (Pinned / Auto-Upgrade pattern) + continueAsNew helpers |
| M10 | Cross-tenant federation + workflow marketplace |
| M11 | AI fill ("generate workflow") via Vercel AI SDK 6 → LiteLLM |
| M12 | Healthcare workflow library (admission, encounter, orders, meds, discharge, EMS, claims) |
| M13 | Tenant admin console + per-tenant resource limits + rate-limiting |
| M14 | Air-gap install bundle (Temporal + Activepieces local + Jobrunr) |
| M15 | Performance + load testing + security audit + HIPAA review |
| M16 | v1 GA — sellable standalone |

---

## 12. References

- [Research doc — 0122 Workflow research](../research/0122-workflow-research.md) (995 lines)
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0121 Builder Suite (Workflow Canvas reuse)](0121-foundation-builder.md)
- [ADR-0105 Workflow/BPM (legacy DRAFT — superseded by this ADR for foundation layer)](0105-workflow-bpm.md)
- Temporal: https://temporal.io/
- Temporal TypeScript SDK: https://docs.temporal.io/develop/typescript
- nestjs-temporal-core: https://www.npmjs.com/package/nestjs-temporal-core
- Activepieces: https://www.activepieces.com/
- @nestjs/schedule: https://docs.nestjs.com/techniques/task-scheduling
- Jobrunr: https://www.jobrunr.io/
- Temporal Multi-Tenant Patterns: https://docs.temporal.io/production-deployment/multi-tenant-patterns
- Temporal Nexus: https://temporal.io/blog/temporal-nexus-now-available
- Temporal + Grafana: https://grafana.com/blog/2025/11/24/monitor-temporal-workflows-seamlessly-introducing-the-temporal-cloud-integration-for-grafana-cloud/
