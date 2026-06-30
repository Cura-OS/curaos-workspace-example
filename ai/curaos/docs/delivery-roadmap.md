# CuraOS Delivery Roadmap

**Last updated:** 2026-05-29
**Canonical source:** ADR-0099 §12 build sequence
**Current status:** Phase 3 complete (M1–M8 Done). Phase 4 in progress — M9 Identity/Party/Org/Audit cluster phase-shipping (Phase A/B/C merged; Phase D blocked on burn-in, earliest 2026-05-31). See [HANDOVER.md](HANDOVER.md) for the live resume point and [ISSUE-ROADMAP.md](ISSUE-ROADMAP.md) for milestone closure state.

---

## Build Sequence Overview (ADR-0099 §12)

```
Phase 0  Vision lock-in                           COMPLETE
Phase 1  Foundation Platform Runtime decision     COMPLETE
Phase 2  Foundation product ADRs + clusters       COMPLETE
Phase 3  Foundation product implementation        PENDING (entry criteria below)
Phase 4  Building-block downstream services       PENDING — blocked on Phase 3
Phase 5  Vertical overlays                        PENDING — blocked on Phase 3
```

Foundation-first sequencing is non-negotiable (ADR-0099 §3). Downstream services written before the
mold is strong cost 10× more to maintain.

---

## Phase 0 — Vision Lock-in (COMPLETE)

**Deliverable:** ADR-0099 charter + companion research doc.
**Outcome:** canonical source of truth for vision, priorities, decision methodology, OSS-leverage
strategy, and AI-agent swarm dev model locked.

**ADRs produced:** 0099

---

## Phase 1 — Foundation Platform Runtime Decision (COMPLETE)

**Deliverable:** ADR-0100 — NestJS (TypeScript) selected as runtime for all four Foundation Products.

**Outcome:**
- Kotlin/Spring Boot recommendation from ADR-0098 superseded.
- Flutter superseded by React Native + Expo SDK 52+ per ADR-0106 + ADR-0209.
- All DRAFT ADRs (0101–0115) re-validated against NestJS baseline per ADR-0150.

**ADRs produced:** 0100

---

## Phase 2 — Per-Foundation-Service ADRs + Cross-Cutting + Clusters (COMPLETE)

**Deliverables:**

### 2A — Foundation Product ADRs
| ADR | Foundation Product | Status |
|---|---|---|
| 0120 | Auth / IdP | ACCEPTED |
| 0121 | App/Site Builder Suite | ACCEPTED |
| 0121a | CuraOS Sites | ACCEPTED |
| 0121b | CuraOS Apps | ACCEPTED |
| 0121c | CuraOS Widgets | ACCEPTED |
| 0121d | CuraOS Workflow Canvas | ACCEPTED |
| 0121e | CuraOS Forms | ACCEPTED |
| 0122 | Workflow Manager | ACCEPTED |
| 0123 | Codegen Platform + Plugin/Sidecar/Interceptor | ACCEPTED |

### 2B — Baseline Alignment + Coherence Scan
| ADR | Title | Status |
|---|---|---|
| 0150 | Baseline Alignment Rules (DRAFT 0101–0115 re-validation) | ACCEPTED |
| 0151 | Wave 2 Cross-Cluster Coherence Scan (19 findings) | INFORMATIONAL |

### 2C — Finding Resolutions
| ADR | Finding | Status |
|---|---|---|
| 0152 | Minor + Info findings (F-007, F-009, F-011, F-013–F-015, F-017–F-019) | ACCEPTED |
| 0153 | Codegen recipe coverage (16 → 57 recipes, F-003) | ACCEPTED |
| 0154 | Provider abstraction convention `@curaos/providers` (F-005) | ACCEPTED |
| 0155 | `@curaos/tenancy` NestJS module — tenant routing (F-001 Critical) | ACCEPTED |
| 0156 | Auth token flow: JWT + Opaque + mTLS (F-002) | ACCEPTED |
| 0157 | HAPI FHIR PHI audit reconciliation: three-mode pipeline (F-004 Critical) | ACCEPTED |
| 0158 | Air-gap bundle SLA + three-tier composition (F-006) | ACCEPTED |
| 0159 | Pricing + packaging strategy — canonical source (F-008) | ACCEPTED |
| 0160 | AI token quota + cost tracking (F-010) | ACCEPTED |
| 0161 | Clinical SLA enforcement for tenant-built apps (F-012) | ACCEPTED |
| 0162 | HIPAA 2026 compliance roadmap (F-016) | ACCEPTED |

### 2D — Wave 1 Lite Cluster ADRs
| ADR | Cluster | Services | Status |
|---|---|---|---|
| 0200 | Identity + Party + Org + Audit | 4 | ACCEPTED |
| 0201 | Platform Shared Services | 5 | ACCEPTED |
| 0202 | Commerce + Sales + Procurement + Inventory | 6 | ACCEPTED |
| 0203 | Calendar + Scheduling + Tasks + Events | 6 | DRAFT |
| 0204 | Workflow + Automation Overlays | 6 | ACCEPTED |
| 0205 | Documents + E-sign + CRM + Donation + HR + Business | 13 | ACCEPTED |
| 0206 | Fleet + Geospatial + Site + Conversion + Integrations | 10 | ACCEPTED |
| 0207 | EducationStack | 3 | ACCEPTED |
| 0208 | HealthStack Clinical | 19 | ACCEPTED |
| 0209 | Frontend Packages + Backend Shared Libraries | 19 pkgs + 15 libs | ACCEPTED |

---

## Phase 3 — Foundation Product Implementation (PENDING)

**Goal:** Build the four Foundation Products to sellable v1 quality. Each is a standalone SaaS
product *and* the injection mold for downstream services.

**Implementation order** (each depends on the previous):

```
Step 1  Auth v0          NestJS shell + Better Auth + @curaos/tenancy + AuditInterceptor
Step 2  Auth v1          Full feature set per ADR-0120: WebAuthn, SAML, SCIM, SMART-on-FHIR,
                          OPA-WASM + Cerbos + OpenFGA, token flow per ADR-0156
Step 3  Builder v0       NestJS shell + GrapesJS canvas + Payload CMS + Next builder UI
Step 4  Builder v1       All six sub-products per ADR-0121–0121e; Yjs/Hocuspocus collab
Step 5  Workflow v0      NestJS shell + Temporal TS SDK worker + Activepieces embedded
Step 6  Workflow v1      Full Workflow Canvas + three compile targets + BullMQ cron
Step 7  Codegen v0       NestJS engine + cookbook scaffold + 6 Phase 1 critical recipes
Step 8  Codegen v1       All 57 Phase 1 recipes per ADR-0153; MCP server surface; OCI registry
Step 9  Mold proof       Generate first downstream service via Codegen; proves the mold works
Step 10 Air-gap bundle   Core tier bundle (Auth + infra) for all four foundation products
```

### Phase 3 entry criteria

Before writing code, verify these Phase 3 locked decisions:
1. **Bun primary** — per [[curaos-bun-primary-rule]]; Node 22 LTS fallback only when Bun cannot.
2. **Turborepo + Nx generators** — per [[curaos-speed-patterns-rule]].
3. **tRPC internal-only** — external/partner APIs use TypeSpec → OpenAPI 3.1 → generated SDKs.
4. Bun workspace + Turborepo scaffold committed to `curaos/` repo.
5. Shared `@curaos/*` library stubs published to Verdaccio (`@curaos/tenancy`, `@curaos/audit-sdk`,
   `@curaos/event-interceptors`, `@curaos/providers`).

### Per-foundation-product milestones (ADR-0100 §7)

| Milestone | Deliverable | Maps to |
|---|---|---|
| M1 | Bun workspace + Turborepo task runner + Nx generators with 4 product workspaces | Phase 3 prep |
| M1.5 | GitHub roadmap/project issue seeding gate (re-anchored under [[curaos-roadmap-workflow-rule]]) | Phase 3 prep |
| M2 | Shared `@curaos/*` NestJS module library (tenant interceptor, audit interceptor, OTel, RBAC guards, error filters) | Phase 3 prep |
| M3 | Auth v0 — NestJS shell + Better Auth + tenant routing | Phase 3 |
| M4 | Builder v0 — NestJS shell + GrapesJS canvas + Directus integration + Next builder UI | Phase 3 |
| M5 | Workflow v0 — NestJS shell + Temporal TS SDK + visual flow editor (Reactflow) | Phase 3 |
| M6 | Codegen v0 — NestJS engine + cookbook scaffolder + Phase 1 recipes (backend.nestjs, ui.react-next, data.drizzle) | Phase 3 |
| M7 | First foundation-generated downstream service (proves the mold works) | Phase 3 |
| M8 | Air-gap install bundle for all four foundation products + sidecars | Phase 3 |
| M9 | Identity/Party/Org/Audit generated cluster (ADR-0200 cluster, re-generated via M6 mold) | Phase 4 wave 1 |
| M10 | Platform shared services + horizontal packages (ADR-0201 + ADR-0209) | Phase 4 wave 2 |
| M11 | Remaining neutral capability clusters (ADR-0202–0206) | Phase 4 waves 3-N |
| M12 | HealthStack clinical overlay foundation (ADR-0208) | Phase 5 |
| M13 | EducationStack + ERP overlay wave (ADR-0207 + extended commerce) | Phase 5 |
| M14 | Production hardening + compliance gates (HIPAA 2026 per ADR-0162, SLOs, MFA hardware key, break-glass) | Phase 5 close |
| M15 | v1 GA packaging + launch readiness (signed bundles, docs site, onboarding wizard, public demo) | GA |

> M9-M15 milestone granularity added 2026-05-25 per user direction to extend the milestone-level roadmap beyond the original M1-M8 Foundation-only horizon. Each new milestone maps to its canonical Phase 4 / Phase 5 ADR cluster so the build sequence in ADR-0099 §12 is preserved.

---

## Phase 4 — Building-Block Downstream Services (PENDING)

**Gate:** Phase 3 M7 (mold proof) complete.

**Goal:** ~80 neutral capability services + their per-tenant customization plugins, produced by the
Codegen mold with minimal manual coding.

**Build order within Phase 4** (Wave 1 Lite cluster priority):

1. **ADR-0200 cluster** — identity-service, party-service, org-service, audit-service
   (blocks everything else; identity and audit required by all other services)
2. **ADR-0209 cluster** — `@curaos/*` backend libs + React Native package migrations
   (horizontal infra for all clusters)
3. **ADR-0201 cluster** — notify-service, storage-service, search-service, settings-service,
   reports-service
4. **Remaining clusters (ADR-0202–0208)** — parallel execution where possible

For each service:
1. Run Codegen Engine with `backend.nestjs` recipe + TypeSpec service spec.
2. Wire `@curaos/tenancy` + `@curaos/audit-sdk` + `@curaos/event-interceptors`.
3. Add domain logic in non-`.gen.ts` files.
4. Register AsyncAPI event schemas in Apicurio.
5. Ship per-service `Requirements.md` + `CONTEXT.md` under `ai/curaos/backend/services/<name>/`.

---

## Phase 5 — Vertical Overlays (PENDING)

**Gate:** Phase 4 neutral-core cluster (ADR-0200 + ADR-0201) stable + HealthStack prerequisites met.

**Goal:** HealthStack clinical cluster (19 services, ADR-0208) first; then EducationStack (ADR-0207);
then ERP (accounting, advanced commerce).

### HealthStack build constraints
- HAPI FHIR 8.x JVM sidecar must be deployed as K8s sidecar pod (Capsule namespace per tenant).
- PHI audit three-mode pipeline (ADR-0157) must be active before first PHI write.
- Clinical SLA enforcement (ADR-0161) three-layer gating active for tenant-built apps.
- HIPAA 2026 full technical compliance at v1 GA (ADR-0162).
- Patient-centric priority (ADR-0099 §15): clinical UX and perf are never compromised.

---

## Immediate Next Steps (Phase 3 execution)

1. Open [ISSUE-ROADMAP.md](ISSUE-ROADMAP.md) and GitHub Project `CuraOS Roadmap`.
2. Claim exactly one M2 `ready-for-agent` issue in `your-org/curaos`.
3. Execute that issue's scoped verification commands.
4. Update the issue, Project status, [HANDOVER.md](HANDOVER.md), and [ISSUE-ROADMAP.md](ISSUE-ROADMAP.md).

See [development-kickoff.md](development-kickoff.md) for the concrete "how to start" guide.

---

## References
- [ADR-0099 Build Sequence](adr/0099-charter-priorities-vision.md#12-build-sequence-foundation-first)
- [ADR-0100 Implementation Milestones](adr/0100-foundation-platform-runtime.md#7-implementation-milestones)
- [ADR-0153 Codegen Recipe Coverage](adr/0153-codegen-recipe-coverage.md)
- [ADR-0158 Air-Gap Bundle SLA](adr/0158-air-gap-bundle-sla.md)
- [development-kickoff.md](development-kickoff.md)
