# Development Kickoff Guide

> **Historical bootstrap guide for M1–M8 Phase 3 setup (all complete).** For the current resume point see [HANDOVER.md](HANDOVER.md); for milestone state see [delivery-roadmap.md](delivery-roadmap.md) and [ISSUE-ROADMAP.md](ISSUE-ROADMAP.md).

> **Stack delta 2026-05-25:** Rules are priority #1; ADRs priority #2. Current overrides: Turborepo task runner + Nx generators co-existing; Bun primary per [[curaos-bun-primary-rule]]; Drizzle default + MikroORM clinical + Kysely analytics per [[curaos-orm-rule]]; `curaos/frontend/{apps,packages}/<kebab>/` (no `curaos-apps/` wrapper); React + React Native (not Flutter). AGENTS.md §15 rule index = current canonical.

**Last updated:** 2026-05-29
**Phase:** Phase 4 (M9+ active; M1–M8 Phase 3 complete)
**Prerequisites:** ADR-0099 through ADR-0211 all read and understood (note stack deltas above).

This guide is the historical "how to start coding" reference for Phase 3. M1–M8 are complete;
Phase 4 (M9 Identity/Party/Org/Audit cluster) is active. The bootstrap steps below remain
useful as a mold-and-scaffold record, not as current next-steps.

---

## 1. Pre-Kickoff Checklist

Before writing a single line of code, verify these locked decisions from `ai/rules/` + `RESOLUTION-MAP.md`:

- [ ] **Bun primary** — `[[curaos-bun-primary-rule]]`; Node 22 LTS fallback only when Bun cannot.
- [ ] **Turborepo + Nx generators** — `[[curaos-speed-patterns-rule]]`; no separate Nx workspace assumption.
- [ ] **tRPC scope** — internal-only. External/partner APIs use TypeSpec → OpenAPI 3.1 → generated SDKs.
- [ ] **ORM tier** — Drizzle default; MikroORM clinical aggregates; Kysely analytics; Prisma off-default only with service-local justification.
- [ ] **ADR-0203 status** — Calendar + Scheduling cluster is DRAFT. If calendar work is in scope,
  finalize ADR-0203 before starting those services.
- [ ] **GitHub issue queue** — if M1 is complete and GitHub issue seed is missing/deferred, stop and run M1.5 issue seeding before M2 implementation.

---

## 2. Reading Order Before Touching Code

Read in this order. Each file takes 5–15 min:

1. [Workspace AGENTS.md](../../../AGENTS.md) — charter, NFRs, operating rules.
2. [Workspace rules index](../../rules/README.md) + relevant `ai/rules/curaos_*.md` — priority #1 decisions.
3. [RESOLUTION-MAP.md](adr/RESOLUTION-MAP.md) — priority #2 ADR status.
4. [ai/curaos/Requirements.md](../Requirements.md) — platform spec.
5. [ai/curaos/CONTEXT.md](../CONTEXT.md) — current phase + ADR status.
6. [ai/curaos/AGENTS.md](../AGENTS.md) — mandatory baseline rules + mandatory deps.
7. Target foundation product ADR (0120, 0121+, 0122, or 0123) for what you are building.

---

## 3. Codegen Engine Ships First (ADR-0123)

Per ADR-0099 §12, the Codegen Platform is the fourth foundation product and the "mold-maker." But
**Codegen v0 must exist before it can generate downstream services**. So:

**Phase 3 sequence:**
1. Scaffold monorepo manually (M1 — one-time setup).
2. Seed GitHub Issues for the active version's milestone set (per [[curaos-version-planning-rule]]) + atomic current-milestone tasks (M1.5 - work queue gate).
3. Build shared `@curaos/*` libs manually (M2 — cross-cutting infra).
4. Build Auth v0 manually (M3 — proves auth pattern).
5. Build Builder v0 manually (M4).
6. Build Workflow v0 manually (M5).
7. **Build Codegen v0** (M6 — once Codegen v0 exists, it generates its own downstream extensions and
   proves the mold).
8. **First mold output** (M7 — Codegen generates a downstream service; proves the end-to-end mold).
9. **All subsequent services use Codegen** (Phase 4 onward).

Do not skip this sequence. Downstream services started before Codegen v0 become hand-crafted one-offs
that don't benefit from the mold and drift from conventions.

If `ai/curaos/docs/HANDOVER.md` lists `GitHub Issues seed` as deferred, that deferred item overrides the next implementation milestone. Resolve it first.

---

## 4. Monorepo Scaffold (M1)

The monorepo lives at `curaos/` (the main repo, not the workspace). Initialize Bun workspace + Turborepo task runner + Nx generators:

```bash
# From curaos/ repo root
bun init -y
bun add -D turbo nx @nx/nest @nx/next @nx/react-native
bunx nx add @nx/nest @nx/next @nx/react-native
```

Create four product workspaces:
```
curaos/
├── backend/
│   ├── services/
│   │   ├── auth-service/
│   │   ├── builder-service/
│   │   ├── workflow-service/
│   │   └── codegen-service/
│   └── packages/
│       ├── tenancy/
│       ├── audit-sdk/
│       ├── events/
│       └── providers/
├── frontend/
│   └── apps/ + packages/  # React Native + Next.js (Turborepo workspace)
└── turbo.json + nx.json
```

---

## 4.5 GitHub Issue Seeding (M1.5)

After M1 scaffold is verified and before M2 implementation, seed the canonical GitHub work queue.

Use:

- [docs/agents/issue-tracker.md](../../../docs/agents/issue-tracker.md)
- [docs/agents/triage-labels.md](../../../docs/agents/triage-labels.md)
- [curaos_swarm_collaboration_rule.md](../../rules/curaos_swarm_collaboration_rule.md)

Required issue set:

- One roadmap issue per milestone in the active version's milestone set (per [[curaos-version-planning-rule]]) in `your-org/curaos-ai-workspace`.
- One atomic issue per M2 work package: Drizzle/Citus PoC, tenancy, audit-sdk, providers, event-interceptors, Verdaccio publish, verification.
- Cross-milestone dependency links in issue bodies: `requires`, `blocked-by`, `agent-notes`.
- `ready-for-agent` only when an issue is fully specified and can be picked up without extra conversation.

Do not create implementation branches until this queue exists.

---

## 5. Shared Library Bootstrap (M2)

These four libs must exist before any app can be built. Build them first:

### `@curaos/tenancy` (ADR-0155)
- `TenantModule` — NestJS global module
- `TenantInterceptor` — extracts `X-Tenant-ID` from JWT claim, sets DB schema context
- `TenantContext` — request-scoped tenant state (UUID, profile, features)
- `@SkipTenancy()` decorator — for public endpoints (health checks, JWKS)
- Drizzle transaction/session helper: sets `SET LOCAL search_path = tenant_<uuid>, public` per request

### `@curaos/audit-sdk` (ADR-0200)
- `AuditInterceptor` — wraps every controller; publishes `AuditEvent` to Kafka
- `AuditEvent` schema — Avro/AsyncAPI registered in Apicurio
- Topic: `curaos.audit.events`
- Hash-chain logic: `hash_curr = SHA256(id|ts|actor|action|resource|tenant|hash_prev)`

### `@curaos/event-interceptors` (ADR-0123)
- `EventInterceptorRegistry` — tenant-configurable interceptor chain per Kafka topic
- `InterceptorManifest` — YAML-format declarative interceptor config
- `BaseEventInterceptor` abstract — transform/decorate/veto/audit interface

### `@curaos/providers` (ADR-0154)
- `CuraOSProvider<TConfig>` base interface
- `ProviderModule` factory — `forFeature(token, config)` pattern
- Zod config validation — every provider config is a Zod object validated at bootstrap
- OTel span emission + health signal requirements

Publish all four to local Verdaccio mirror before starting any app:
```bash
# Start Verdaccio locally
docker run -d -p 4873:4873 verdaccio/verdaccio
# Publish
cd libs/tenancy && bun publish --registry http://localhost:4873
```

---

## 6. Auth v0 (M3, ADR-0120)

**Goal:** NestJS shell + Better Auth + per-tenant DB schema + token issuance. Not full-featured — just
enough to unblock other foundation products.

Key packages:
```bash
bun add better-auth@latest \
  @simplewebauthn/server \
  node-saml samlify \
  passport \
  otplib \
  argon2 \
  jose \
  scim-patch \
  @cerbos/grpc \
  @openfga/sdk
```

Auth v0 acceptance criteria:
- `POST /oauth/token` (authorization_code + PKCE) returns JWT
- `GET /.well-known/openid-configuration` — valid discovery document
- Tenant isolation: two tenants, no cross-tenant reads (Testcontainers)
- `TenantInterceptor` sets schema correctly per JWT claim
- `AuditInterceptor` writes audit event for every auth action

---

## 7. Builder v0 (M4, ADR-0121)

**Goal:** NestJS shell + GrapesJS canvas rendered in Next.js builder UI + Payload CMS as content
backend.

Deferred for v0 (add in v1):
- AppSmith sidecar (Apps product)
- Lit Widgets package
- Yjs/Hocuspocus real-time collaboration
- Formily/Puck Forms

Builder v0 acceptance criteria:
- GrapesJS canvas loads in browser via Next.js builder UI
- Payload CMS API running alongside (or embedded in NestJS monolith)
- Tenant-scoped project storage in Payload (per ADR-0121 §7)
- Basic page template saved and retrieved per tenant

---

## 8. Workflow Manager v0 (M5, ADR-0122)

**Goal:** NestJS shell + Temporal TypeScript SDK worker + Activepieces embedded.

```bash
bun add @temporalio/client @temporalio/worker @temporalio/workflow \
  @temporalio/activity \
  nestjs-temporal-core \
  @activepieces/pieces-framework
```

Temporal server runs as a sidecar (Go binary) per ADR-0100 §3. NestJS connects via Temporal TS SDK.

Workflow v0 acceptance criteria:
- Simple Temporal workflow starts and completes (NestJS worker)
- Activepieces flow triggered by Kafka event
- `@nestjs/schedule` cron job fires on schedule
- Workflow Canvas (`@xyflow/react`) renders in browser; compiles to Temporal workflow definition

---

## 9. Codegen Platform v0 (M6, ADR-0123)

**Goal:** NestJS engine + cookbook scaffold + 6 critical Phase 1 recipes.

Critical Phase 1 recipes (minimum viable mold):

| Recipe key | Generates |
|---|---|
| `backend.nestjs` | Full NestJS service scaffold with `@curaos/*` deps wired |
| `ui.react-next` | Next.js app scaffold |
| `data.drizzle` | Drizzle schema + drizzle-kit migrations |
| `api.openapi` | TypeSpec → OpenAPI 3.1 spec |
| `events.nestjs-kafka` | Kafka producer/consumer stubs |
| `interceptor.nestjs` | NestJS interceptor module scaffold |

Template engine: Nunjucks (default). Recipe format: Backstage Software Templates pattern.
Recipe registry: Harbor OCI (cosign-signed artifacts).

Codegen v0 acceptance criteria:
- `POST /codegen/generate` with `recipe: backend.nestjs` + service spec → emits scaffold ZIP
- Scaffold includes all mandatory `@curaos/*` deps pre-wired
- `.gen.ts` split convention enforced — engine refuses to overwrite non-`.gen.ts` files
- MCP server surface: `codegen/list-recipes` and `codegen/generate` tools

---

## 10. First Mold Output — Mold Proof (M7)

Run Codegen v0 against a simple downstream service spec (e.g., `notify-service` from ADR-0201).
Success criteria:
- Codegen emits a working NestJS scaffold
- Service passes `bun run test` (Vitest unit tests)
- Service boots with Docker Compose and responds to health check
- `@curaos/tenancy` + `@curaos/audit-sdk` are correctly wired and tested
- Audit events appear on `curaos.audit.events` Kafka topic

This proves the mold works. Phase 4 can begin.

---

## 11. Air-Gap Bundle (M8, ADR-0158)

Build the Core tier bundle once all four foundation products pass v0:

Core tier contents (ADR-0158 §bundle-manifest):
- CuraOS Auth + deps
- CuraOS Builder + deps
- CuraOS Workflow Manager + Temporal Go server binary
- CuraOS Codegen Platform
- Shared infra: PostgreSQL 17 + Valkey + Kafka 4 + NATS + SeaweedFS + OpenSearch
- Observability stack: Tempo + VictoriaMetrics + Loki + Grafana
- Security: OpenBao + Coraza
- Container infra: K3s/Talos + ArgoCD + Harbor + Cilium
- Verdaccio mirror (npm packages)

Bundle format: cosign-signed OCI artifact. Delta updates: xdelta3 per component layer.
Target bundle size: Core tier ≤ 8 GB uncompressed.

---

## 12. Local Dev Environment

Before Phase 3 implementation has Docker Compose manifests, use this stack:

```bash
# Start core infra
docker compose -f docker/compose.dev.yml up -d
# Services: postgres17, valkey, kafka, nats, seaweedfs, opensearch, verdaccio
```

Environment variables (`.envrc` via direnv):
```bash
export DATABASE_URL="postgresql://curaos:curaos@localhost:5432/curaos"
export KAFKA_BROKERS="localhost:9092"
export NATS_URL="nats://localhost:4222"
export VALKEY_URL="redis://localhost:6379"
export VERDACCIO_URL="http://localhost:4873"
export OPENTELEMETRY_ENDPOINT="http://localhost:4317"
```

Bun dev mode:
```bash
bun run start:dev  # NestJS hot-module swap (HMR via Bun)
bun run test       # Vitest
bun run test:e2e   # Playwright
```

---

## 13. Per-Service Checklist (Phase 4 onward)

For each downstream service generated by Codegen:

- [ ] Run `POST /codegen/generate` with correct recipe + TypeSpec spec.
- [ ] Add domain logic in non-`.gen.ts` files only.
- [ ] Register AsyncAPI event schemas in Apicurio.
- [ ] Wire Cerbos policies in `policies/<service>.yaml`.
- [ ] Verify `AuditInterceptor` emits events to `curaos.audit.events`.
- [ ] Add Vitest unit tests + Testcontainers integration tests.
- [ ] Add Playwright E2E test for primary user flow.
- [ ] Ship `ai/curaos/backend/services/<name>/Requirements.md` + `CONTEXT.md`.
- [ ] Update `ai/curaos/docs/submodules/` inventory.
- [ ] Verify air-gap bundle manifest if service added to a bundle tier.
- [ ] Verify ADR-0162 HIPAA scope if service touches PHI.

---

## References

- [delivery-roadmap.md](delivery-roadmap.md) — phases + milestones
- [ADR-0099 §12](adr/0099-charter-priorities-vision.md) — build sequence
- [ADR-0100 §7](adr/0100-foundation-platform-runtime.md) — implementation milestones
- [ADR-0123](adr/0123-foundation-codegen-plugin.md) — Codegen Platform
- [ADR-0153](adr/0153-codegen-recipe-coverage.md) — 57 Phase 1 recipes
- [ADR-0155](adr/0155-tenant-routing-curaos-tenancy.md) — `@curaos/tenancy`
- [ADR-0158](adr/0158-air-gap-bundle-sla.md) — Air-gap bundle SLA
