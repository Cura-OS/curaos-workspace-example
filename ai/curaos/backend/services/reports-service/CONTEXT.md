# Agent Context — reports-service

**Cluster:** ADR-0201 Platform Shared Services
**Last updated:** 2026-05-25

---

## Stack (locked — ADR-0100, ADR-0201)

- Language: TypeScript (strict)
- Runtime: Bun primary; Node.js 22 LTS fallback only when Bun cannot
- Framework: NestJS 11, Fastify adapter
- ORM: Drizzle (schema + drizzle-kit migrations)
- DB: PostgreSQL 17 (schema-per-tenant)
- PDF engine: Gotenberg 8 Docker sidecar — local default
- Dashboard embed: Apache Superset self-hosted — local default
- Template engine: Nunjucks (HTML → Gotenberg → PDF)
- Events: Kafka 4 (`@nestjs/microservices`)
- Jobs: BullMQ via `@nestjs/bull` (≤ 5 min runs) + Temporal cron (> 5 min)
- Auth/Access: JWT Bearer + Cerbos ABAC + OPA-WASM
- Secrets: OpenBao (injected at pod startup; never env vars)
- Observability: OTel SDK, structured JSON logs, Loki/Tempo/VictoriaMetrics/Grafana
- Test: Vitest + Testcontainers (real PG + Gotenberg sidecar in CI)
- Package: `@curaos/reports-service`

---

## Module Structure

```
reports-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── definitions/
│   │   ├── definitions.controller.ts    # GET/POST/PUT/DEL /reports/definitions
│   │   └── definitions.service.ts       # CRUD + access policy enforcement
│   ├── runs/
│   │   ├── runs.controller.ts           # POST /reports/run, GET /runs/{id}, GET /runs/{id}/download
│   │   ├── runs.service.ts              # orchestrate: data pull → render → PDF → storage → notify
│   │   └── runs.worker.ts              # BullMQ worker: report-runs queue
│   ├── schedules/
│   │   ├── schedules.controller.ts      # POST /reports/definitions/{id}/schedule
│   │   ├── schedules.service.ts         # cron schedule management
│   │   └── schedules.runner.ts          # @nestjs/schedule cron runner
│   ├── embed/
│   │   └── embed.controller.ts          # GET /reports/embed/{dashboardId}
│   ├── providers/
│   │   ├── pdf/
│   │   │   ├── pdf.provider.interface.ts       # PDFRenderProvider
│   │   │   ├── local-pdf.provider.ts           # Gotenberg 8 HTTP via `got`
│   │   │   └── external-pdf.provider.ts        # Puppeteer Cloud / wkhtmltopdf REST
│   │   └── analytics/
│   │       ├── analytics.provider.interface.ts  # AnalyticsProvider
│   │       ├── local-analytics.provider.ts      # Apache Superset guest token API
│   │       └── external-analytics.provider.ts   # Metabase / Grafana embed token
│   ├── data/
│   │   └── client-factory.service.ts    # TypeSpec-generated HTTP client factory per source service
│   ├── templates/
│   │   └── nunjucks.service.ts          # HTML template rendering
│   ├── consumers/
│   │   ├── schedule.consumer.ts         # Kafka: curaos.reports.scheduled.v1
│   │   └── erasure.consumer.ts          # Kafka: curaos.party.erasure.requested.v1
│   ├── outbox/
│   │   └── outbox.scheduler.ts
│   └── persistence/
│       └── schema.ts
├── test/
│   ├── unit/
│   └── integration/                     # Testcontainers: PG + Gotenberg sidecar
└── specs/
    ├── reports.tsp                       # TypeSpec REST spec
    └── reports-events.asyncapi.yaml      # AsyncAPI 3 event schema
```

> The block above is the FULL target structure. The M10 scaffold (issue
> `your-org/curaos-ai-workspace#275`) landed the SHELL of it from
> the `@curaos/codegen` plain-service mold, consolidating the orchestration into
> one `reports/` feature module (the per-feature `definitions/`+`runs/`+
> `schedules/`+`embed/` split is a later refactor as the surface grows):
>
> - `src/reports/reports.controller.ts` — all 9 ADR §3.5.4 REST routes (definition
>   CRUD, `POST /reports/run`, run status/download, schedule, `GET /reports/embed/{id}`).
> - `src/reports/reports.service.ts` — orchestration: run pipeline (render → store →
>   `run.completed`/`run.failed` event), schedule, publish (`definition.published`), embed token.
> - `src/reports/reports.repository.ts` — `ReportsRepository` port + in-memory fake
>   (Drizzle adapter injected at the modulith host) over the 5 §3.5.1 tables.
> - `src/providers/pdf/` — `PdfRendererProvider` port (Gotenberg) + in-memory fake.
> - `src/providers/embed/` — `DashboardEmbedProvider` port (Superset guest token) + in-memory fake.
> - `src/events/reports-event-producer.ts` — snake_case wire contract for the 3 §3.5.3 topics.
> - `drizzle/schema.ts` + `drizzle/migrations/0001_reports_domain.sql` — the 5 domain tables
>   (`report_definitions` / `report_runs` / `report_schedules` / `report_subscriptions` /
>   `report_library`) atop the inherited audit-outbox + chain-head + idempotency infra.
>
> Driver-free per [[curaos-modulith-standalone-rule]]: every concrete adapter
> (Drizzle / Gotenberg HTTP / Superset REST / kafkajs / storage-service client)
> binds at the modulith composition layer; the shell is unit-testable against the
> in-memory fakes. Deferred to follow-up Stories: TypeSpec `.tsp` + AsyncAPI specs,
> the BullMQ run worker, the `@nestjs/schedule` cron runner, the Kafka inbound
> `scheduled.v1` + erasure consumers, the Nunjucks template engine, and the typed
> data-pull client factory.

---

## Key Behavioral Rules

- **Provider selection:** `PROVIDER_PDF=local|external`, `PROVIDER_ANALYTICS=local|external`. NestJS DI module swap.
- **Data pull contract:** Report definitions reference TypeSpec operation IDs from source services. `client-factory.service.ts` instantiates the appropriate typed HTTP client. No direct DB queries into other service schemas — ever.
- **PDF pipeline sequence (must be sequential):**
  1. Pull data via typed HTTP client.
  2. Render Nunjucks HTML template (server-side; no browser).
  3. POST rendered HTML + assets to Gotenberg → receive PDF binary.
  4. POST PDF to storage-service internal upload API → receive `storage_object_id` + signed download URL.
  5. Update `report_runs.status = 'completed'`, set `storage_object_id`.
  6. Emit `curaos.reports.run.completed.v1`.
- **Run routing:** Report runs ≤ 5 min → BullMQ `report-runs` queue. Runs > 5 min → Temporal cron workflow (per ADR-0201 OQ-08). Routing decision based on `report_definitions.estimated_duration_seconds`.
- **Superset guest token scope:** Token scoped to `tenant_id` RLS filter. Per-user RLS is v2 scope (ADR-0201 OQ-07). Never return tokens without RLS filter applied.
- **PHI boundary:** HealthStack report definitions reference FHIR-sourced data. Reports-service holds only `storage_object_id` references; raw clinical data never stored in `report_runs` table. All PHI queries via HealthStack typed API clients.
- **GDPR:** `erasure.requested.v1` → purge `report_subscriptions` for user; anonymize `report_runs.triggered_by` to `[redacted]`. Emit completion.
- **DLQ:** Every Kafka consumer has dead-letter topic. Alert on DLQ messages.

---

## Env Vars (injected by OpenBao)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `KAFKA_BROKERS` | Kafka broker list |
| `NATS_URL` | NATS JetStream |
| `PROVIDER_PDF` | `local` (Gotenberg) or `external` |
| `GOTENBERG_URL` | Gotenberg 8 HTTP endpoint |
| `PROVIDER_ANALYTICS` | `local` (Superset) or `external` |
| `SUPERSET_BASE_URL` | Apache Superset base URL |
| `SUPERSET_USERNAME`, `SUPERSET_PASSWORD` | Superset API credentials |
| `STORAGE_SERVICE_URL` | Internal storage-service base URL |
| `TEMPORAL_ADDRESS` | Temporal server address (for long-running runs) |

---

## Commands

```bash
# Dev
bun dev

# Test
bun test
bun test:integration     # Testcontainers (PG + Gotenberg Docker sidecar)

# Build
bun build

# DB
bun run db:migrate
bun run db:generate

# Spec
bun typespec compile
```

---

## Acceptance Criteria

- `PDFRenderProvider` interface with Gotenberg (local) + Puppeteer Cloud (external) implementations.
- `AnalyticsProvider` interface with Superset (local) + Metabase/Grafana (external) implementations.
- Full PDF pipeline end-to-end: data pull → Nunjucks render → Gotenberg → storage-service upload → signed URL.
- Superset guest token endpoint with tenant RLS enforced.
- On-demand run + cron schedule run via `@nestjs/schedule` + BullMQ.
- Temporal cron integration for long-running runs (> 5 min).
- Kafka producers: `run.completed.v1`, `run.failed.v1`, `definition.published.v1`.
- GDPR erasure consumer: subscriptions purged, `triggered_by` anonymized.
- Vitest integration tests green in CI with Testcontainers.
- OTel traces + metrics (run duration P50/P95, PDF render time, queue depth) in Grafana.
- OpenBao injection verified — no plaintext Superset or storage credentials.
