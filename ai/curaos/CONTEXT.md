# CONTEXT - CuraOS (Workspace-level current state)

**Last updated:** 2026-06-10
**Phase:** Phase 3 (Foundation product implementation) IN PROGRESS. Live milestone state: [docs/HANDOVER.md](docs/HANDOVER.md) + [docs/ISSUE-ROADMAP.md](docs/ISSUE-ROADMAP.md) (tracker mirrors; they WIN over this file per the [knowledge-persistence live-state precedence](../rules/curaos_knowledge_persistence_rule.md)).
**Total ADRs:** 56 (0096-archived → 0164 + 0200-0211)

---

## 1. Current Phase Status

| Phase | Description | Status |
|---|---|---|
| **0** | Vision lock-in - ADR-0099 charter + research | COMPLETE |
| **1** | Foundation Platform Runtime decision - ADR-0100 (NestJS) | COMPLETE |
| **2** | Per-foundation-service ADRs (0120-0123) + cross-cutting baseline (0150-0162) + cluster ADRs (0200-0209) | COMPLETE |
| **3** | Foundation product implementation (Auth → Builder → Workflow → Codegen) | IN PROGRESS (live milestone state: [docs/HANDOVER.md](docs/HANDOVER.md) + tracker) |
| **4** | Downstream services via codegen mold | PENDING - blocked on Phase 3 completion |
| **5** | Vertical overlays (HealthStack, EducationStack, ERP) | PENDING - blocked on Phase 3 completion |

Implementation underway. Live milestone state lives in [docs/HANDOVER.md](docs/HANDOVER.md) + [docs/ISSUE-ROADMAP.md](docs/ISSUE-ROADMAP.md) (regenerated from the tracker at session close; they win over this file). `curaos/backend/services/` holds generated+implemented services (identity-service, audit-service, party/org cluster). Planning lives in `ai/curaos/`. See [delivery-roadmap.md](docs/delivery-roadmap.md) as the canonical phase tracker.

---

## 2. Full ADR Inventory

### Archived research (pre-charter)
| ADR | Title | Status |
|---|---|---|
| 0096 | API surface research | ARCHIVED |
| 0097 | Frontend research | ARCHIVED |
| 0098 | Backend runtime research | ARCHIVED - superseded by ADR-0100 |

### Charter + foundation runtime
| ADR | Title | Status |
|---|---|---|
| 0099 | Charter, Vision, Priorities, OSS-Leverage | **ACCEPTED (canonical root - wins all conflicts)** |
| 0100 | Foundation Platform Runtime (NestJS TS) | **ACCEPTED (supersedes 0098)** |

### Cross-cutting baseline (re-validated per ADR-0150)
| ADR | Title | Status |
|---|---|---|
| 0101 | Data layer (PG17 + Valkey + SeaweedFS + OpenSearch + pgvector) | ACCEPTED |
| 0102 | Event messaging (Kafka 4 + NATS JetStream + Apicurio; BullMQ replaces Jobrunr) | ACCEPTED w/ addendum |
| 0103 | API surface (TypeSpec → OpenAPI 3.1 + GraphQL + Connect-RPC + APISIX) | ACCEPTED (rewritten NestJS) |
| 0104 | Identity/Auth | SUPERSEDED by ADR-0120 |
| 0105 | Workflow/BPM | SUPERSEDED by ADR-0122 |
| 0106 | Frontend (React+Next + React Native; Astro + Lit + shadcn/ui) | ACCEPTED (rewritten) |
| 0107 | Observability (OTel + Tempo + VictoriaMetrics + Loki + Grafana) | ACCEPTED |
| 0108 | Security + secrets (OpenBao + jose + Tink-Node + Coraza + Falco + Wazuh) | ACCEPTED w/ addendum |
| 0109 | Containers + orchestration (K3s/Talos + Cilium + ArgoCD + Harbor + Capsule) | ACCEPTED w/ addendum |
| 0110 | CI/CD + release (GH Actions ARC + Atlas + Renovate + Unleash; Verdaccio + Harbor) | ACCEPTED w/ addendum |
| 0111 | Infra automation (Ansible + Talos + Tinkerbell + Crossplane + KEDA) | ACCEPTED |
| 0112 | i18n + localization (Weblate + ICU + dinero.js) | ACCEPTED w/ addendum |
| 0113 | Analytics + reporting (ClickHouse + Superset + Cube + Pathling) | ACCEPTED |
| 0114 | AI/agent integration (vLLM + LiteLLM + Vercel AI SDK 6 + LangChain.js + LangGraph.js) | ACCEPTED w/ addendum |
| 0115 | HealthStack overlays (HAPI FHIR + Snowstorm + dcm4chee + OHIF as JVM sidecars) | ACCEPTED w/ addendum |

### Foundation product ADRs
| ADR | Title | Status |
|---|---|---|
| 0120 | Foundation Auth/IdP (NestJS-pure, Better Auth core) | **ACCEPTED** |
| 0121 | Foundation Builder Suite (Builder + Sites + Apps + Widgets) | **ACCEPTED** |
| 0121a | Foundation Sites (GrapesJS + Payload CMS) | **ACCEPTED** |
| 0121b | Foundation Apps (AppSmith sidecar) | **ACCEPTED** |
| 0121c | Foundation Widgets (Lit + Formily + Puck) | **ACCEPTED** |
| 0121d | Foundation Workflow Canvas (@xyflow/react + XState) | **ACCEPTED** |
| 0121e | Foundation Forms (Formily + Puck + SurveyJS) | **ACCEPTED** |
| 0122 | Foundation Workflow Manager (Temporal + Activepieces + BullMQ) | **ACCEPTED** |
| 0123 | Foundation Codegen Platform + Plugin/Sidecar/Interceptor | **ACCEPTED** |

### Baseline alignment + coherence
| ADR | Title | Status |
|---|---|---|
| 0150 | Baseline Alignment Rules for DRAFT ADRs 0101-0115 | **ACCEPTED** |
| 0151 | Wave 2 Cross-Cluster Coherence Scan (19 findings) | INFORMATIONAL |

### Finding resolutions
| ADR | Title | Resolves | Status |
|---|---|---|---|
| 0152 | Minor + Info Findings Resolutions | ADR-0151 minor/info | **ACCEPTED** |
| 0153 | Codegen Recipe Coverage (57 recipes, 12 domains) | F-003 (Major) | **ACCEPTED** |
| 0154 | Provider Abstraction Convention (`@curaos/providers`) | F-005 (Major) | **ACCEPTED** |
| 0155 | Tenant Routing: `@curaos/tenancy` NestJS module | F-001 (Critical) | **ACCEPTED** |
| 0156 | Auth Token Flow: JWT + Opaque + mTLS three-layer | F-002 (Major) | **ACCEPTED** |
| 0157 | HAPI FHIR PHI Audit Reconciliation: three-mode pipeline | F-004 (Critical) | **ACCEPTED** |
| 0158 | Air-Gap Bundle SLA + Composition (three tiers) | F-006 (Major) | **ACCEPTED** |
| 0159 | Pricing + Packaging Strategy (canonical) | F-008 (Major) | **ACCEPTED** |
| 0160 | AI Token Quota + Cost Tracking | F-010 (Major) | **ACCEPTED** |
| 0161 | Clinical SLA Enforcement for Tenant-Built Apps | F-012 (Major) | **ACCEPTED** |
| 0162 | HIPAA 2026 Compliance Roadmap | F-016 (Major) | **ACCEPTED** |

### DA13 resolution + foundation implementation ADRs
| ADR | Title | Status |
|---|---|---|
| 0163 | DA13 batch resolution of 10 STILL-OPEN questions | **ACCEPTED** |
| 0164 | Zarf bundle layout + size budget baseline | **ACCEPTED** |

### Wave 1 Lite cluster ADRs (service-level)
| ADR | Cluster | Services | Status |
|---|---|---|---|
| 0200 | Identity + Party + Org + Audit | 4 | **ACCEPTED** |
| 0201 | Platform Shared Services | 5 | **ACCEPTED** |
| 0202 | Commerce + Sales + Procurement + Inventory | 6 | **ACCEPTED** |
| 0203 | Calendar + Scheduling + Tasks + Events | 6 | DRAFT |
| 0204 | Workflow + Automation Overlays | 6 | **ACCEPTED** |
| 0205 | Documents + E-sign + CRM + Donation + HR + Business | 13 | **ACCEPTED** |
| 0206 | Fleet + Geospatial + Site + Conversion + Integrations | 10 | **ACCEPTED** |
| 0207 | EducationStack | 3 | **ACCEPTED** |
| 0208 | HealthStack Clinical Services | 19 | **ACCEPTED** |
| 0209 | Frontend Packages + Backend Shared Libraries | 19 frontend + 15 backend | **ACCEPTED** |

### M9 implementation ADRs
| ADR | Title | Status |
|---|---|---|
| 0210 | M9 Diamond Model: Party/Org/Identity as peers of `actors` root | **ACCEPTED** |
| 0211 | cosign offline-keyed signing + verification contract | **ACCEPTED** |

---

## 3. Integration Map (Foundation Products → Clusters)

```
                    ┌─────────────────────────────────────────────┐
                    │         ADR-0099 Charter (canonical root)   │
                    └──────────────────┬──────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────────┐
              │                        │                            │
    ┌─────────▼────────┐   ┌───────────▼───────┐   ┌───────────────▼────────┐
    │  ADR-0100        │   │  ADR-0150          │   │  ADR-0155              │
    │  NestJS runtime  │   │  Baseline rules    │   │  @curaos/tenancy       │
    └─────────┬────────┘   └───────────┬───────┘   └───────────────┬────────┘
              │                        │                            │
    ┌─────────▼──────────────────────────────────────────────────────────────┐
    │                    Foundation Products                                 │
    │  Auth (0120) │ Builder (0121+) │ Workflow (0122) │ Codegen (0123)     │
    └─────────┬──────────────────────────────────────────────────────────────┘
              │
    ┌─────────▼──────────────────────────────────────────────────────────────┐
    │                Wave 1 Lite Clusters (ADR-0200 → 0209)                  │
    │  Identity/Party/Org/Audit │ Platform Shared │ Commerce │ Calendar ...  │
    │  HealthStack Clinical     │ EducationStack  │ Frontend Pkgs + Libs ... │
    └────────────────────────────────────────────────────────────────────────┘
```

Mandatory NestJS service dependencies:
- `@curaos/tenancy` - tenant routing (ADR-0155)
- `@curaos/audit-sdk` - AuditInterceptor + hash-chain publish (ADR-0200)
- `@curaos/event-interceptors` - event bus interceptor framework (ADR-0123)
- `@curaos/providers` - provider abstraction base (ADR-0154)
- Cerbos PDP sidecar - ABAC (ADR-0120)

Conventions:
- Event topic: `curaos.<service-name>.<entity>.<event>`
- DB schema: `tenant_<uuid>` (SaaS); `public` (on-prem/air-gap)
- Audit: every service mounts `AuditInterceptor` → publishes to `curaos.audit.events` Kafka topic

---

## 4. Per-Cluster Status (DRAFT until scaffolded)

Identity/Party/Org/Audit cluster (ADR-0200) scaffolded + under implementation in Phase 3 M9. Remaining clusters start after Auth (Foundation Product) reaches v0 per ADR-0099 §12 Phase 3.

| Cluster | ADR | Wave 1 Lite | Priority |
|---|---|---|---|
| Identity + Party + Org + Audit | 0200 | Yes - blocks all | 1 |
| Platform Shared Services | 0201 | Yes | 2 |
| Frontend Pkgs + Backend Libs | 0209 | Yes - horizontal infra | 2 |
| Commerce + Sales + Procurement | 0202 | Yes | 3 |
| Calendar + Scheduling + Tasks | 0203 | Yes | 3 |
| Workflow + Automation Overlays | 0204 | Yes | 3 |
| Documents + E-sign + CRM + HR | 0205 | Yes | 3 |
| Fleet + Geospatial + Integrations | 0206 | Yes | 3 |
| EducationStack | 0207 | Yes | 4 |
| HealthStack Clinical | 0208 | Yes | 4 (HIPAA scope) |

---

## 5. Key Open Questions (Phase 3 entry)

Resolved at ADR level. Implementation-side decisions before coding:

1. **Node 22 vs Bun** - NestJS runtime. ADR-0123 §open-questions. Bun likely once benchmarks confirm parity. Per [[curaos-bun-primary-rule]]: Bun primary.
2. **Turborepo + Nx generators** - monorepo task runner and generator split. Per [[curaos-speed-patterns-rule]]: Turborepo + Verdaccio + Nx generators adopted.
3. **GraphQL federation topology** - Apollo supergraph vs Cosmo router vs per-service Apollo.
4. **tRPC scope** - internal-only per ADR-0163 DA13 Q2; external/partner APIs use TypeSpec → OpenAPI 3.1 → generated SDKs.
5. **First downstream service** - which cluster service proves mold first?
6. **Keycloak plugin timeline** - v2/v3, enterprise-customer demand only.

---

## 6. Workspace mirror layout

```
ai/curaos/
├── AGENTS.md              # Cross-CLI agent contract (split into AGENTS-sections/)
├── AGENTS-sections/       # Ephemeral on-demand AGENTS.md sections per [[curaos-agents-md-schema-rule]]
├── CONTEXT.md             # This file
├── Requirements.md        # Structured platform spec
├── Requirements-raw.md    # Vision prose + strategic directives
├── docs/
│   ├── README.md          # Index
│   ├── delivery-roadmap.md
│   ├── development-kickoff.md
│   ├── adr/               # 56 ADRs (0096-archived → 0164 + 0200-0211)
│   ├── research/          # Companion research
│   ├── specs/             # Per-feature specs
│   ├── rfcs/              # Forward-looking proposals (some superseded)
│   ├── workflows/         # Workflow definitions
│   ├── compositions/      # Builder composition blueprints
│   ├── ops/               # Ops runbooks
│   └── submodules/        # Submodule inventory
├── backend/
│   ├── packages/<kebab>/  # Per-lib: AGENTS.md + CONTEXT.md + Requirements.md
│   └── services/<kebab-service>/  # Per-service: AGENTS.md + CONTEXT.md + Requirements.md (+ AGENTS-sections/ if large)
├── frontend/
│   ├── apps/<kebab>/      # Per-app
│   └── packages/<kebab>/  # Per-package (no wrapper dir)
└── ops/
    ├── AGENTS.md + CONTEXT.md + Requirements.md
```

See [[curaos-repo-boundary-rule]] + [[curaos-ai-mirror-rule]].
