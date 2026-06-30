# ADR-0121 — Foundation Product: App/Site Builder (CuraOS Builder Suite)

> **Open Questions resolution (2026-05-25, DA13 amendment):**
> - Q4 Git backend for design VCS → **RESOLVED (DA13 Q10)** — **Tenant external Git (BYO GitHub/GitLab/Gitea via OAuth) primary; CuraOS Gitea fallback for tenants w/o external**. Provider abstraction in `@curaos/providers` per ADR-0154 + [[curaos-local-vs-3rdparty-rule]].
> - AppSmith deployment → **RESOLVED-ADR** (ADR-0121b separate sidecar)
> - Workflow Canvas placement → **RESOLVED-ADR** (ADR-0121d shared editor lib, two surfaces)
> - Sites SSR strategy + Custom domain SSL + Form runtime location → **DEFERRED-MILESTONE**
>
> See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
**Companion research:** [`../research/0121-builder-research.md`](../research/0121-builder-research.md), [`../research/0121-builder-canvas-research.md`](../research/0121-builder-canvas-research.md)

---

## 1. Context

The **Builder Suite** is one of four foundation products (per ADR-0099 injection-molding metaphor). It is THE generator for tenant-facing surfaces and the no-code/low-code paradigm that replaces BPMN (per ADR-0099 §7).

Per user directive: ship as **4 separately sellable products** sharing a common core engine.

Per ADR-0100: pure NestJS backend; React+Next/Astro frontends; OSS canvas dependencies imported as libraries (not commercial SDKs).

---

## 2. Decision summary

**Ship Builder Suite as four standalone SaaS products on one shared platform:**

| # | Product | Persona | Primary OSS base |
|---|---|---|---|
| 1 | **CuraOS Builder** (IDE / engine platform) | Dev/admin who designs surfaces | Composition: all four others + custom CuraOS layer |
| 2 | **CuraOS Sites** | Marketing / content / public surfaces | GrapesJS OSS (BSD-3) + Payload CMS (MIT) |
| 3 | **CuraOS Apps** | Internal tools / dashboards / tenant admin surfaces | AppSmith (Apache-2.0) as sidecar |
| 4 | **CuraOS Widgets** | Embeddable cards/forms/charts for 3rd-party hosts | Lit Web Components (per ADR-0106) + Formily + Puck |

A 5th deliverable (cross-cutting): **CuraOS Workflow Canvas** (visual flow editor) — feeds CuraOS Workflow Manager (ADR-0122). Implemented on `@xyflow/react` (MIT) with custom BPM/automation nodes. Sold inside CuraOS Builder + as part of Workflow Manager.

A 6th deliverable: **CuraOS Forms** (form builder + form runtime) — Formily (MIT) engine + Puck (MIT) canvas + SurveyJS (MIT) renderer for survey patterns. Embedded inside Apps + Sites + Widgets; also sellable standalone for tenants who only need form collection.

---

## 3. License posture (all OSS, no commercial SDKs)

| Library | License | Verdict |
|---|---|---|
| GrapesJS | BSD-3 | ✅ Clean for SaaS + air-gap |
| Payload CMS | MIT | ✅ Clean |
| AppSmith | Apache-2.0 | ✅ Clean (sidecar deploy) |
| Formily | MIT | ✅ Clean |
| Puck | MIT | ✅ Clean |
| SurveyJS | MIT | ✅ Clean |
| @xyflow/react | MIT | ✅ Clean |
| Lit | BSD-3 | ✅ Clean |
| easy-email-editor | MIT | ✅ Clean |
| react-email | MIT | ✅ Clean |
| MJML | MIT | ✅ Clean |
| Yjs | MIT | ✅ Clean |
| Hocuspocus v4 | MIT | ✅ Clean |
| Konva.js | MIT | ✅ Clean (if needed for free-form canvas) |

**Disqualified:**
| Library | Reason |
|---|---|
| tldraw SDK 2.0+ | Commercial $6k/yr; OSS bits frozen |
| Webstudio | AGPL-3 (network copyleft) — would force CuraOS source release to tenants who modify; deferred to v2/v3 if specific demand |
| Budibase | Phone-home licensing — air-gap incompatible |
| NocoBase | AGPL — same as Webstudio |
| ToolJet | AGPL — same; AppSmith picked instead |
| Lowcoder | AGPL |
| GrapesJS Studio SDK | Commercial license, per user directive OFF the table |
| Directus | BSL trigger at $5M — Payload (MIT) picked instead per ADR-0121 prior interview |

---

## 4. Architecture — shared core + 4 product surfaces

```
                       ┌───────────────────────────────────┐
                       │  CuraOS Builder (IDE) — Product 1 │
                       │  React+Next admin UI              │
                       │  Project mgmt, design library,    │
                       │  preview/publish, marketplace,    │
                       │  collab session mgmt              │
                       └─────────────────┬─────────────────┘
                                         │
       ┌────────────────────┬────────────┼────────────┬────────────────────┐
       │                    │            │            │                    │
┌──────▼──────┐    ┌────────▼────────┐  │  ┌─────────▼────────┐  ┌────────▼─────────┐
│  Sites (P2) │    │   Apps (P3)     │  │  │  Widgets (P4)    │  │  Workflow Canvas │
│ GrapesJS +  │    │ AppSmith        │  │  │ Lit Web Comps +  │  │  + Forms         │
│ Payload CMS │    │ sidecar +       │  │  │ Formily + Puck   │  │  @xyflow/react + │
│             │    │ NestJS adapter  │  │  │                  │  │  Formily + Puck  │
└─────────────┘    └─────────────────┘  │  └──────────────────┘  └──────────────────┘
                                         │
                       ┌─────────────────▼───────────────┐
                       │   Shared Builder Core (NestJS)   │
                       │  - Tenant context + isolation    │
                       │  - Project storage (Payload CMS) │
                       │  - Design version control (git)  │
                       │  - Component registry            │
                       │  - Marketplace + signed installs │
                       │  - Yjs + Hocuspocus collab      │
                       │  - AI fill + suggest (Vercel AI) │
                       │  - Code emit → Codegen ADR-0123  │
                       └──────────────────────────────────┘
                                         │
                       ┌─────────────────▼───────────────┐
                       │  Persistence (PG17 per ADR-0101)│
                       │  Events (Kafka/NATS ADR-0102)   │
                       │  Auth (CuraOS Auth ADR-0120)    │
                       └──────────────────────────────────┘
```

### Why this composition

- **GrapesJS OSS for Sites:** 115 releases since 2015, BSD-3, HTML/CSS output, plugin ecosystem (~30 community plugins), React wrapper available. Missing pieces (data sources, multi-page, white-label, collab) ≈ 20–37 weeks of custom engineering (per canvas research), entirely under CuraOS control.
- **AppSmith sidecar for Apps:** 40k stars, Apache-2.0, 25+ data connectors, multiplayer editing, Git versioning out-of-box. Deploy alongside CuraOS Builder as a sidecar; CuraOS NestJS adapter handles tenant SSO + theming + audit interceptor.
- **Lit + Formily + Puck for Widgets:** lightweight, embeddable in 3rd-party sites, Lit Web Components portable across host frameworks (per ADR-0106).
- **@xyflow/react + custom nodes for Workflow Canvas:** node-based DAG editor. Custom nodes implement BPM/automation primitives, FHIR-aware steps, decision tables (subsuming what BPMN/DMN gave us).
- **Formily + Puck + SurveyJS for Forms:** JSON-schema-driven; covers everything from simple contact forms to multi-section clinical intake forms.
- **Yjs + Hocuspocus v4** universal collab layer across ALL surfaces — one NestJS backend serves real-time presence + CRDT sync for any canvas.

---

## 5. BPMN replacement — unified Reactflow-based paradigm

Per user directive: build unified custom Reactflow extension that subsumes forms + state machines + workflows. Import/edit/extend/fork existing OSS to base it on.

### Composition

| Sub-paradigm | Implementation |
|---|---|
| Visual flow (DAG / state graph) | `@xyflow/react` (MIT) base + CuraOS custom node library |
| Forms within a step | Formily (MIT) sub-canvas embedded in node properties |
| Finite state machines | XState v5 (MIT) compiled from CuraOS state-node syntax |
| Decision tables | Custom CuraOS table component emitting Cerbos YAML (per ADR-0120 AuthZ layer) |
| Long-running orchestration | Compiled to Temporal TS SDK workflow code (per ADR-0122) |
| Short automations | Compiled to NestJS interceptor + scheduled job (per ADR-0102 Jobrunr or @nestjs/schedule) |

### Output

Designed flow → CuraOS IR (intermediate representation, JSON) → Codegen (ADR-0123) emits **either**:
- Temporal TS SDK workflow code (for long-running)
- NestJS interceptor module (for inline business rule injection)
- Standalone CuraOS Workflow definition (runs in CuraOS Workflow Manager)

One paradigm in editor, multiple compile targets. No BPMN. No Camunda Modeler.

---

## 6. 4-product sellable economics

| Product | Standalone use case | Tier examples |
|---|---|---|
| **CuraOS Builder** | "We want the platform — design library + collab + marketplace + emit code" | Per-seat (designer/dev) tiers; team / org / enterprise |
| **CuraOS Sites** | "We just need a fast multi-tenant marketing-site engine" (replaces Webflow / Squarespace / managed CMS) | Per-site, per-tenant, per-pageview tiers |
| **CuraOS Apps** | "We just need internal tools / dashboards" (replaces Retool / AppSmith Cloud / Tooljet Cloud) | Per-app, per-user, per-tenant tiers |
| **CuraOS Widgets** | "We want embeddable widgets/forms for our own 3rd-party site" (replaces Typeform embed / Tally / Cognito Forms) | Per-widget, per-submission, per-tenant tiers |

Each product:
- Independent install path (Docker image, Helm chart, OCI bundle)
- Independent docs site
- Independent SDK
- Independent free + paid tiers
- All four compose into umbrella "CuraOS Builder Suite" with package discount

---

## 7. Multi-tenant isolation

- **Per-tenant project storage** in Payload CMS collections + per-tenant PG schema
- **Per-tenant component overlay** — base component library + tenant additions (locally hosted custom components)
- **Per-tenant marketplace** view — base public marketplace + tenant private registry
- **Per-tenant theme** — design tokens (style-dictionary per ADR-0106) overlaid at publish-time
- **Per-tenant collab session** — Hocuspocus namespaced by tenant
- **Per-tenant AI fill credit quota** — tracked via Auth quota + LiteLLM (per ADR-0114)

---

## 8. AI-assisted authoring

| Surface | AI-assist capability |
|---|---|
| Sites canvas | "Generate a hero section", "Make this Section more accessible", "Translate to Arabic", "Suggest CTA copy" |
| Apps canvas | "Generate a dashboard for sales pipeline", "Add a chart for X metric", "Suggest filters" |
| Widgets canvas | "Generate a clinical intake form for SMART-on-FHIR patient app" |
| Workflow canvas | "Generate a workflow for new-patient registration", "Add error-handling branch" |
| Forms canvas | "Generate a form from this PDF / Word doc" |

Implementation: **Vercel AI SDK 6** (MIT) inside Builder UI → LiteLLM gateway (per ADR-0114) → tenant's chosen LLM (vLLM-hosted Qwen3 self-hosted, or OpenAI/Anthropic via tenant key).

---

## 9. Real-time collaboration (universal)

**Yjs (MIT)** + **Hocuspocus v4 (MIT)** = single NestJS backend service hosting CRDT sync for every Builder canvas surface.

- Presence (who's editing, where their cursor is)
- Multi-author edits (no last-writer-wins)
- Offline edits sync on reconnect
- Per-tenant namespace isolation
- Audit-logged document change history (per ADR-0104)

---

## 10. Air-gap considerations

- Builder UI = static SSG bundle, served from CuraOS distro (no external CDN)
- Component marketplace mirror = local registry pre-loaded in air-gap bundle (per ADR-0110 OCI air-gap bundle)
- Yjs/Hocuspocus runs entirely on-prem
- AI assist disabled OR routes to tenant's on-prem LLM (vLLM per ADR-0114) — no external API calls
- Synthetic data sets for design-time previews (no PHI in mocks)

---

## 11. Healthcare-specific blocks (HealthStack overlay)

When HealthStack overlay enabled per tenant, Builder gets clinical block library:

| Block | OSS base |
|---|---|
| FHIR-aware Patient picker | `@medplum/react` (Apache-2.0) |
| FHIR-aware Encounter card | `@medplum/react` |
| FHIR-aware MedicationRequest input | `@medplum/react` |
| SMART-on-FHIR launcher | `fhirclient-js` (MIT) per ADR-0120 |
| Clinical intake forms | `@aehrc/smart-forms-renderer` (Apache-2.0) |
| Vital signs visualization | Custom ECharts wrapper (per ADR-0113) |
| Care plan timeline | Custom on @xyflow/react |
| Consent capture | Custom on Formily |

Accessibility WCAG 2.2 AA lint runs at design-time. HIPAA-safe preview uses synthetic patient generator.

---

## 12. Enterprise-grade v1 checklist

| Category | v1 Requirement |
|---|---|
| **Tenant isolation** | Full per-tenant DB schema + namespace + storage + collab + marketplace |
| **Versioning** | Git-backed design version control (every save = commit, branching + merging) |
| **Collab** | Yjs/Hocuspocus multi-author real-time, presence, audit log |
| **Marketplace** | Component install, version, cosign signature verification, per-tenant override |
| **Branding** | Per-tenant theme, white-label CuraOS chrome, custom domain |
| **i18n** | Builder UI itself i18n'd via Weblate (per ADR-0112), generated surfaces i18n-ready |
| **A11y** | WCAG 2.2 AA lint, axe-core integration |
| **Audit** | Every save / publish / install / collab edit hash-chained (per ADR-0104) |
| **SDKs** | JS/TS, Go, Kotlin, Python, PHP via Codegen (per ADR-0123) |
| **Air-gap** | Full offline install |
| **Plugin SDK** | Custom block authoring via WASM + NestJS sidecar (per ADR-0123) |
| **Performance** | Sub-second preview render under reference load |
| **Scale** | Horizontal scale (stateless NestJS replicas) |
| **AI assist** | Vercel AI SDK 6 → LiteLLM → tenant LLM |
| **Code emit** | Surface → Codegen platform (ADR-0123) → React+Next code, Flutter (future cookbook), etc. |

---

## 13. Estimated engineering investment

Per canvas research:
- All-OSS composition (this ADR's plan): **45–75 engineering weeks across all 4 SKUs**
- Build everything from scratch: 80–120 weeks
- License-cost commercial route (GrapesJS Studio SDK + tldraw SDK): would have been ~30–40 weeks but $6k/yr per-instance license + commercial dependency = OFF the table per user directive

Foundation-first build (4 products v1) target: **6 months solo + 200 AI-agent swarm** working 24/7.

---

## 14. Open questions (resolved later)

1. **AppSmith deployment** — embed as sidecar in Apps SKU? Or run as separate "CuraOS Apps service" reachable from Builder UI? Likely separate service.
2. **Sites SSR strategy** — Astro (per ADR-0106) for published Sites? Or Next? Or both depending on what tenant needs (Astro for marketing-heavy, Next for app-heavy)?
3. **Custom domain SSL** — cert-manager (per ADR-0108) handles. Tenant-domain provisioning UX flow TBD.
4. **Git backend for design VCS** — host CuraOS-managed Gitea or use external Git (tenant's own)?
5. **Workflow Canvas in Builder vs in Workflow Manager** — both? Shared editor library, two product surfaces?
6. **Form runtime** — embedded in Apps/Sites, OR standalone CuraOS Forms server?

---

## 15. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | Shared core: NestJS shell + Payload CMS + tenant interceptor + Yjs/Hocuspocus |
| M2 | Sites SKU v0: GrapesJS canvas + Astro publish + multi-page + data binding to Payload |
| M3 | Component marketplace + signed install + per-tenant overlay |
| M4 | Apps SKU v0: AppSmith sidecar + NestJS adapter + tenant SSO + theme |
| M5 | Forms SKU v0: Formily + Puck + SurveyJS runtime + standalone Form Server |
| M6 | Workflow Canvas v0: @xyflow/react + custom BPM nodes + Codegen integration (emit Temporal TS) |
| M7 | Widgets SKU v0: Lit + Formily/Puck + cosign-signed bundle for 3rd-party embed |
| M8 | Builder IDE v0: design library, project mgmt, preview/publish, collab session UX |
| M9 | AI fill / suggest (Vercel AI SDK 6 → LiteLLM) |
| M10 | HealthStack clinical block library (@medplum/react + @aehrc/smart-forms-renderer) |
| M11 | Code emit pipeline (Builder → Codegen ADR-0123 → React+Next, future Flutter) |
| M12 | Plugin SDK (WASM + NestJS sidecar shells) |
| M13 | Air-gap install bundle |
| M14 | Performance + security + accessibility audit |
| M15 | v1 GA — all 4 products sellable standalone |

---

## 16. References

- [Research doc — 0121 Builder research](../research/0121-builder-research.md) (613 lines)
- [Research doc — 0121 Builder canvas OSS](../research/0121-builder-canvas-research.md) (960 lines)
- [ADR-0099 Charter](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Runtime](0100-foundation-platform-runtime.md)
- [ADR-0106 Frontend (legacy DRAFT)](0106-frontend.md)
- GrapesJS: https://grapesjs.com/
- Payload CMS: https://payloadcms.com/
- AppSmith: https://www.appsmith.com/
- Formily: https://formilyjs.org/
- Puck: https://puckeditor.com/
- @xyflow/react (Reactflow): https://reactflow.dev/
- XState: https://stately.ai/docs/xstate
- Yjs + Hocuspocus: https://docs.yjs.dev/ , https://tiptap.dev/docs/hocuspocus
- easy-email-editor: https://github.com/zalify/easy-email-editor
- @medplum/react: https://www.medplum.com/docs
- @aehrc/smart-forms-renderer: https://github.com/aehrc/smart-forms
- Vercel AI SDK 6: https://vercel.com/blog/ai-sdk-6
