# ADR-0099 — CuraOS Charter, Vision, Priorities & OSS-Leverage Strategy

> **Open Questions resolution (2026-05-25, all RESOLVED post-DA13):** foundation runtime (ADR-0100 NestJS), workflow paradigm (ADR-0122 Temporal+Activepieces+BullMQ), no-code packaging (ADR-0121 + 0121a-e six sub-products), codegen origin (ADR-0123 custom on Backstage Templates), plugin language (ADR-0123 WASM+sidecar+isolated-vm), **DB strategy (DA13 Q3: 10K+ tenants from day 1 → Citus distributed PG on CNPG per [[curaos-postgres-rule]] DA13 amendment; HealthStack PHI override = DB-per-tenant)**, hospital admin (ADR-0202+ generic ERP v1; ERPNext **DEFERRED-V2**), MCP surface (ADR-0123 + [[curaos-mcp-stack-rule]] curated). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).

**Status:** Accepted (canonical — overrides any conflict in ADRs 0100-0115 until those are re-validated)
**Date:** 2026-05-24
**Supersedes:** none
**Companion research:** [`../research/0099-vision-oss-landscape.md`](../research/0099-vision-oss-landscape.md)
**Sets DRAFT status on:** ADRs 0100-0115 (recommendations pending re-validation against this charter)

---

## 1. Purpose

ADR-0099 is the **canonical source of truth for CuraOS vision, priorities, decision methodology, and OSS-leverage strategy**. All downstream ADRs (existing and future) inherit from this. When ADR-0099 conflicts with any other ADR, ADR-0099 wins until that ADR is re-validated.

Prior ADRs (0100-0115) were drafted before the user articulated the full vision. They are useful as research artifacts but their *recommendations* are **DRAFT** and must be re-validated against this charter.

---

## 2. Mission

Build **CuraOS** (Care Oriented Stack) — a composable, self-hosted, multi-tenant platform where every service is sellable as a standalone SaaS product *and* composes with others into larger systems. Healthcare (HealthStack) is the flagship vertical overlay; Education, ERP, and other verticals follow the same composition pattern.

The goal is **economic flexibility for customers** (buy one service, add more) combined with **architectural coherence** (one codebase, four deployment profiles).

---

## 3. Architecture metaphor: Injection Molding

> Build the **mold** first. Use the mold to produce **parts**. Manually craft only what the mold cannot produce.

| Layer | What it is | Effort source |
|---|---|---|
| **Mold (Foundation)** | The few foundational services that everything else depends on: **Auth/IdP**, **App/Site Builder**, **Workflow Manager** (and likely a fourth: codegen platform). Each is a **sellable standalone SaaS product**. | Heavy manual craft + reuse of mature OSS foundations |
| **Parts (Building-block services)** | The 80+ neutral capability services + 20+ vertical overlay services. Produced by the mold via codegen + plugins + sidecars, with minimal manual coding. | Mold output + targeted custom hooks |
| **Specialized parts** | Services whose nature (clinical-imaging codecs, real-time streaming, ML inference) defeats the mold. | Manual craft, often in a different language tier |

**Foundation-first sequencing is non-negotiable.** Until Auth + Builder + Workflow Manager + Codegen are strong enough to act as a mold, downstream services are deferred.

---

## 4. Each service is its own product

Every CuraOS service:

- Must be **sellable standalone** — independent SaaS, on-prem, hybrid, air-gap.
- Must **compose** with peer services into larger functionality (modulith or microservices system topology).
- Must have its own **packaging, branding hooks, pricing tier, install path, docs, and integration boundary**.
- Building-block economics: a customer can start with one service (e.g., Auth-as-a-SaaS) and add more as their needs grow.

This is enforced architecturally — services may not share runtime state or assume co-location.

---

## 5. Two runtime topologies, always supported

CuraOS must support both, from one codebase:

- **Microservices mode** — one service per bounded context, independently deployable; default for SaaS multi-tenant + enterprise on-prem.
- **Modular monolith mode** — many modules in one deployable; right fit for SMB on-prem, home lab, and air-gap appliances where ops overhead matters.

A topology flag at build/deploy time picks the layout. Cross-module boundaries (events, contracts, schemas) are identical in both modes — only the wiring changes.

---

## 6. Stable core + plugin/sidecar/event-interceptor (NOT hot-reload)

User directive: **plugin system + sidecars are better than hot-reload**.

| Layer | Mechanism | Lifecycle |
|---|---|---|
| **Stable core (host service)** | Compiled, well-tested, rarely changes. Helm rolling deploy for upgrades + security patches. | Releases on quarterly/monthly cadence |
| **Plugin layer** | In-process modules. Today's clearest path: **WASM Component Model** (Wasmtime + WIT-typed components). Language-agnostic, sandboxed, hot-swappable. | Tenant-installed, hot-reloadable per tenant |
| **Sidecar layer** | Separate process, gRPC/Unix-socket to core. Wrap business logic that's heavy enough to need its own process or different runtime. | Independent lifecycle, K8s-native |
| **Event interceptor framework** | The event/messaging layer (Kafka/NATS per ADR-0102) is the primary **injection point**. Plugins + sidecars register as interceptors on event topics and transform/decorate/veto/audit events flowing through. | Configured per tenant via the no-code/low-code paradigm |

**Hot-reload of core code is rejected.** It introduces failure modes (partial state, half-loaded symbols, harder rollback) that violate the stability charter for a HIPAA-grade platform.

---

## 7. No-code / low-code paradigm — BPMN deprecated as primary

**BPMN 2.0 is deprecated as the primary customization layer.** It remains acceptable as a fallback only if no modern paradigm fits a specific case.

Modern paradigms to evaluate (research surfaced these — pending interview):

- **Code-first durable execution** — Temporal (MIT), Restate (BSL — license risk), DBOS, Inngest (Apache 2.0)
- **Flow-based programming (visual + code-emitting)** — n8n (FairCode — license risk), Activepieces (MIT), Kestra (Apache 2.0), Trigger.dev (Apache 2.0), Windmill (AGPL)
- **State machines** — XState v5 + Studio
- **Reactive dataflow / streaming SQL** — Materialize, Pathling
- **DAG composition** — Dagster, Kestra
- **Hybrid visual + code** — Inngest, Trigger.dev, Pipedream (visual editor emits typed code)

CuraOS will likely combine **multiple paradigms**: code-first (Temporal-class) for durable cross-service sagas + visual flow (Kestra/Activepieces-class) for tenant-customizable automations + state machines for finite clinical pathways.

**One Workflow Manager** product will expose these paradigms via a unified surface (the App/Site Builder generates flows; runtime executes them).

---

## 8. Codegen platform — bridge OSS + own the seam

User directive: **option 2 (bridge OSS) + option 3 (fork comprehensive scaffolder)**.

Approach:
- **Bridge layer** uses mature OSS codegen across the stack: OpenAPI Generator, AsyncAPI Generator, sqlc, Buf+Connect-RPC, GraphQL Code Generator, Atlas (forward/backward DB), WunderGraph Cosmo (GraphQL federation).
- **Comprehensive scaffolder** — pick one to fork or build from scratch (decision pending — research candidates: Encore.dev, JHipster, Backstage Software Templates, or custom).
- **Custom seam** = CuraOS-specific conventions:
  - Interceptor hook registration (event-driven)
  - BPMN/state-machine/Temporal binding generation
  - Plugin/sidecar scaffold per service
  - Tenant-customization injection points

Forward + backward engineering required:
- Forward: schema/spec/event → code in chosen runtime + bindings
- Backward: existing DB/API → typed models + spec

**Scalability check on auto-API tools (PostgREST, Hasura, Directus):** confirmed they have ceilings under big-SaaS load (PostgREST ~1k concurrent for OLTP, Hasura ~1M subscriptions per node). Use for prototyping + admin paths only; do **not** make them the primary public API for high-traffic surfaces.

---

## 9. Constraints (immutable — apply at every decision level)

| Constraint | Implication |
|---|---|
| **Self-hosted first** | No managed-cloud lock-in. Every component must run on customer infra. |
| **Air-gap support** | Mandatory for home lab + regulated deployment profiles. Zero external dependencies at runtime. |
| **Multi-tenant** | SaaS + on-prem + hybrid + air-gap from one codebase. |
| **HIPAA + GDPR** | Defense in depth, audit, encryption at rest + in transit, subject rights. |
| **License-aligned for SaaS distribution** | No AGPL in tenant-facing binary unless dual-licensed. BSL accepted case-by-case after legal review. |
| **Latest stable versions** | Research-driven version picks, not "what was started." |
| **Patient-centric for HealthStack** | Patient = priority #1, healthcare workers = #2, hospital management = supporting tier that never degrades clinical UX/perf. |

---

## 10. Decision weights (cross-cutting)

Applied to every stack pick:

| Criterion | Weight |
|---|---|
| AI-agent friendliness (agents can generate + modify code reliably) | **5.0** |
| Developer experience tight loop (hot-reload, fast feedback, clear errors) | **4.8** |
| Mainstream stack for human-hiring pool (long term) | **3.6** |
| Performance + low RAM footprint | implicit filter |
| Security posture | implicit filter |
| DDD/SOLID/DRY discipline (integration + contract validation enforces) | implicit filter |

**Comfort-zone languages in declining preference:** Go, Rust, Kotlin, Java, TypeScript, PHP, C#, Python.

---

## 11. Decision methodology (the funnel)

All future ADR cycles follow this:

1. **Paradigm questions** (broadest) — "do you want one runtime everywhere, or right-tool-per-service?"
2. **Family questions** — "compiled vs interpreted? typed vs dynamic? concurrency model?"
3. **Candidate-set questions** — "of {Go, Rust, Kotlin, TS, ...}, which family?"
4. **Tactical questions** — "within Go: Gin vs Echo vs Chi vs Encore vs Buffalo?"

Only proceed to next funnel level after current level is answered. **ADRs do NOT auto-confirm current commitments** — recommendations stay tentative until the user explicitly approves at funnel completion.

Charter constraints (section 9) and weights (section 10) narrow options at every level. They never disappear.

---

## 12. Build sequence (foundation-first)

**Phase 0 — Vision lock-in (current).** ADR-0099 + research doc, draft re-validation plan for 0100-0115.

**Phase 1 — Foundation Platform Runtime decision** (new ADR-0100 rewrite). Pick the runtime + framework family that will host the foundation services (Auth + Builder + Workflow + Codegen).

**Phase 2 — Per-foundation-service ADRs:**
- ADR-0120 — Foundation: Auth/IdP (standalone SaaS product)
- ADR-0121 — Foundation: App/Site Builder (standalone SaaS product)
- ADR-0122 — Foundation: Workflow Manager (standalone SaaS product, replaces ADR-0105 BPM)
- ADR-0123 — Foundation: Codegen Platform + Plugin/Sidecar/Interceptor Architecture

**Phase 3 — Foundation product implementation.** Solo + AI-agent swarm builds the four foundation products to sellable v1 quality.

**Phase 4 — Building-block services produced via the mold.** ~80 neutral capability services + their per-tenant customization plugins.

**Phase 5 — Vertical overlays.** HealthStack (patient-centric), EducationStack, ERP — built atop the foundation with vertical-specific plugins, importing OSS healthcare/education/ERP components where they extend the patient/student/customer-centric model.

**Re-evaluation pass (Wave 1 of original plan):** Once the foundation runtime + four foundation product ADRs lock, the existing ADRs 0101-0115 are re-evaluated against them. Some may stand, some require rewrite.

---

## 13. OSS-leverage strategy (the import/extend/inspire/build matrix)

Inherits from the [research doc Section 12 synthesis table](../research/0099-vision-oss-landscape.md). Summary:

| Aim | OSS to import / extend | OSS to inspire | Build custom |
|---|---|---|---|
| Foundation Auth | Keycloak SPI (extend) | Logto, ZITADEL (architecture) | CuraOS-specific tenancy + audit layer |
| Foundation Builder | GrapesJS canvas + Directus auto-API + Payload code-first (compose) | Plasmic, Builder.io, NocoBase | CuraOS-specific tenant + BPMN-replacement integration |
| Foundation Workflow | Temporal core (import) + Kestra (paradigm inspiration) + Activepieces (embeddable) | Trigger.dev, Inngest, n8n | CuraOS interceptor framework on top |
| Codegen Platform | OpenAPI Gen + sqlc + Buf + Atlas + WunderGraph Cosmo (compose) | Encore, Backstage Templates, JHipster | CuraOS scaffolder convention + plugin emitters |
| Building-block runtime | Dapr (sidecars, components) (extend) | Encore developer ergonomics | CuraOS-specific service registry + tenant routing |
| Plugin layer | WASM Component Model + Wasmtime + WIT (import) | Cloudflare Workers, Envoy WASM | CuraOS host bindings + plugin SDK |
| Event interceptors | APISIX plugins + OPA (compose) | NATS micro, Spring Cloud Stream | CuraOS interceptor manifest format |
| Data layer | PostgreSQL 17 + Citus + TimescaleDB + pgvector (import) | YugabyteDB (future path) | Tenant routing + per-tenant key mgmt |
| Healthcare core | HAPI FHIR (import) + dcm4chee + OHIF + Mirth Connect | OpenVistA (patient-centric philosophy), OpenMRS, Bahmni | Patient-first composition + interceptor wiring |
| Hospital admin tier | ERPNext modules (extend) for finance/HR/inventory | Bahmni's OpenMRS+ERPNext separation | Clean integration boundary with clinical core |

Detail and rationale: see research doc.

---

## 14. AI-agent swarm dev model

Initial dev resourcing: **solo human + 200+ AI agents (Claude, Codex, Cursor, etc.) running 24/7**.

Architectural implications:
- Stack must be reliably authored + modified by agents → strong types, predictable patterns, deterministic builds, fast tests, simple to teach
- Codegen is critical — agents excel at filling in scaffolds, not at greenfield architecture
- MCP server pattern: CuraOS services expose tool surfaces via MCP so external agents can drive them; CuraOS-internal agents consume external MCP servers per tenant config
- Test infrastructure must be first-class — agent-generated code is verified by tests before merge
- Documentation density matters — agents reason from docs; sparse docs = wandering agents

---

## 15. HealthStack vision (patient-centric)

Reaffirms the strategic directive:

1. **Patient** = priority #1. All clinical data models, workflows, UX flow from patient experience + outcomes + consent + data ownership.
2. **Healthcare workers** (doctors, nurses, clinical staff) = priority #2. Tools must reduce cognitive load, never get in the way of care.
3. **Hospital management** (scheduling, billing, claims, HR, procurement, inventory) = supporting tier. Builds **around** clinical core. Fully integrated but **never compromises clinical quality**.

OSS inspirations: **OpenVistA** (patient-centric VA system) + **OpenMRS** (modular patient-centric core). Hospital admin tier wraps via clean event/API boundaries — admin cannot inject concerns into clinical paths.

---

## 16. Open questions (resolved in subsequent ADRs)

1. **Foundation runtime** — Go default + Rust specialist? Or unified (Kotlin + GraalVM)? Or TypeScript-only? (ADR-0100 redo)
2. **Workflow paradigm** — Temporal alone? Kestra-style flow + Temporal sagas? Pure code-first via Inngest? (ADR-0122)
3. **No-code/low-code product packaging** — single tool covering automation + clinical pathways + admin flows, or split per domain? (ADR-0121 + ADR-0122)
4. **Codegen scaffolder origin** — fork Encore? fork JHipster? build custom on Backstage Templates? (ADR-0123)
5. **Plugin language** — WASM-only? WASM + native sidecar? scripting (Starlark/Lua) for simple cases? (ADR-0123)
6. **DB strategy at SaaS scale** — stay PG17+Citus, or plan for YugabyteDB migration path for global write distribution? (ADR-0101 re-validation)
7. **Hospital admin integration** — adopt ERPNext modules in-tree, or wrap as remote services? (ADR-0115 re-validation)
8. **MCP server surface** — every service auto-exposes MCP tools, or curated subset? (ADR-0123 + ADR-0114 re-validation)

---

## 17. How to read existing ADRs 0100-0115 until re-validation

Treat their **Status as DRAFT**. Their **Context, Forces, and Options-considered sections remain valuable** as research artifacts. Their **Recommendation, Per-module variants, and Open questions sections are tentative** — they assume Kotlin + Spring + JVM baseline that has been opened back up.

A status banner will be added to each ADR signaling this.

---

## 18. Updates to this ADR

ADR-0099 is the strategic root. It is updated when the user articulates a new strategic direction. All other ADRs reconcile against it.

---

## References

- [Research doc — 0099 vision OSS landscape](../research/0099-vision-oss-landscape.md) (2098 lines, 156KB; companion deep research)
- Memory files (agent-internal):
  - `curaos_healthstack_vision.md`
  - `curaos_decision_methodology.md`
  - `curaos_stack_priorities.md`
  - `curaos_runtime_decisions.md`
  - `curaos_architecture_vision.md`
- Existing ADRs 0100-0115 (DRAFT, awaiting re-validation)
