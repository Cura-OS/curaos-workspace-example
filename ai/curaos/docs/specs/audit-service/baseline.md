> **SUPERSEDED — Kotlin/Spring plan predates the NestJS pivot (ADR-0100). Current audit-service stack = NestJS/Bun.** Spec below has been updated to reflect the canonical stack. Historical Kotlin/Spring content removed per [[curaos-foundation-runtime-directives-rule]] + [[curaos-bun-primary-rule]].

# Audit Service Baseline Specification

Establishes the minimal implementation required to ship the generic audit-service and wire it into workflow/identity events. Use this as the starting point for the NestJS/Bun application hosted in `backend/services/audit-service`.

## 1. Runtime & Packaging
- **Language/Framework:** NestJS (TypeScript), Bun runtime + package manager; per-service module per [[curaos-foundation-runtime-directives-rule]] + [[curaos-modulith-standalone-rule]].
- **Module:** Monorepo package `backend/services/audit-service` (Turborepo/Nx workspace per [[curaos-repo-conventions-rule]]).
- **Build:** `bun install` / `bun run build`; container image via BuildKit (dev/CI) or Buildah (air-gap) per [[curaos-image-build-rule]]. No Gradle/JVM toolchain.
- **Profiles:** `local`, `dev`, `prod`; load datasource, Kafka, and MinIO/S3 credentials via NestJS `ConfigModule` + env vars.

## 2. Data Model
Use PostgreSQL via CNPG per [[curaos-postgres-rule]]; migrations via the chosen ORM (Drizzle/MikroORM/Kysely per [[curaos-orm-rule]]) — NOT Flyway. Create schema `audit` (or leverage per-tenant schemas when tenancy is enforced at the connection layer).

### `audit_record`
| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| `id` | UUID | PK, default `uuid_generate_v7()` | Primary identifier |
| `tenant_id` | UUID | Not null | Maps to tenant isolation; enforce via RLS or schema |
| `event_id` | UUID | Unique | Client-supplied idempotency key |
| `actor_id` | UUID | Nullable | Optional user/service actor |
| `actor_type` | Text | Not null | `user`, `service`, `system` |
| `action` | Text | Not null | Verb such as `workflow.transition` |
| `resource_type` | Text | Not null | e.g., `workflow.instance`, `identity.user` |
| `resource_id` | Text | Nullable | Identifier of resource |
| `payload` | JSONB | Not null | Normalized audit payload |
| `hash` | Text | Not null | SHA-256 hash of record contents |
| `prev_hash` | Text | Nullable | SHA-256 hash of previous record in chain |
| `created_at` | TIMESTAMPTZ | Not null, default `now()` | Event timestamp |
| `ingested_at` | TIMESTAMPTZ | Not null, default `now()` | System ingestion timestamp |

### Hash Chain Rules
- For each tenant, chain records by `created_at` (tie-breaker `id`). First record per tenant stores `prev_hash = NULL`.
- `hash = sha256(concat(tenant_id, actor_type, actor_id, action, resource fields, payload, prev_hash))`.
- Provide a database function `audit.verify_chain(tenant UUID, from TIMESTAMPTZ, to TIMESTAMPTZ)` returning boolean + first failure index.

### `audit_export`
Tracks asynchronous export jobs (CSV/JSON bundles).

| Column | Type | Constraints |
| ------ | ---- | ----------- |
| `id` | UUID | PK |
| `tenant_id` | UUID | Not null |
| `status` | Text | `pending`, `running`, `completed`, `failed` |
| `filters` | JSONB | Stores query filters |
| `url` | Text | Object storage location |
| `created_at` | TIMESTAMPTZ | Default `now()` |
| `completed_at` | TIMESTAMPTZ | Nullable |

## 3. APIs

### REST (OpenAPI 3)
- `POST /api/v1/audit-events` — ingest a single audit record (idempotent via client-provided `eventId`). Validates hash chain on insert.
- `POST /api/v1/audit-events/batch` — batch ingestion (max 500, deduped by `eventId`).
- `GET /api/v1/audit-events` — query with filters (`tenantId`, `actorId`, `action`, `resourceType`, time range).
- `POST /api/v1/audit-exports` — kickoff export; responds with job id.
- `GET /api/v1/audit-exports/{id}` — poll export status.
- `POST /api/v1/audit-verify` — verify chain integrity for the provided window.

Authentication integrates with identity-service (JWT validation); enforce tenant scoping by requiring `X-CURA-TENANT` header or tenant claim.

### GraphQL (read-only)
- Query `auditEvents(filter, paging)` returning paginated list.
- Query `auditExport(id)` for status.
- Mutation `createAuditExport(filter)` as an alias to REST export creation.

## 4. Async Ingestion & Hooks
- **Kafka-API topics** (broker = Kafka 4.x per ADR-0102; Redpanda only on the M8 air-gap profile per ADR-0164; the `.v1` suffix below is the event-schema version, not the broker version):
  - `workflow.audit.events.v1` — emitted by workflow-core-service on state transitions.
  - `identity.audit.events.v1` — emitted by identity-service for authentication, enrollment, and MFA events.
  - `builder.audit.events.v1` — optional future topic for builder actions.
- Configure NestJS Kafka consumer group `audit-service` (use `@nestjs/microservices` Kafka transport).
- Each consumer maps events into the ingestion pipeline (reuse same validation service).
- Guarantee idempotency by using event ids as natural keys (store in dedupe table or rely on `ON CONFLICT` constraints).

## 5. Service Components
- **Controller layer:** NestJS Controllers (REST) + GraphQL resolvers via `@nestjs/graphql`.
- **Service layer:** `AuditIngestionService`, `AuditQueryService`, `AuditExportService`, `AuditChainVerifier` — NestJS providers.
- **Repository layer:** Drizzle/MikroORM/Kysely per [[curaos-orm-rule]] (pick consistent with other services in the monorepo). No Spring Data / jOOQ.
- **Kafka listeners:** NestJS microservice message handlers (`WorkflowAuditListener`, `IdentityAuditListener`).
- **Export workers:** NestJS `@nestjs/schedule` async jobs. Streams results to CSV stored in MinIO bucket `audit-exports/{tenantId}/{exportId}`.

## 6. Observability
- Health endpoint via `@nestjs/terminus` (`/health`); Prometheus metrics via `@willsoto/nestjs-prometheus` or OTEL SDK (`/metrics`).
- Default metrics: ingest rate, consumer lag, chain verification failures.
- Structured JSON logs with correlation ids via NestJS logger captured by Promtail (per `docs/ops/instrumentation.md`).
- Emit OpenTelemetry spans (`audit.ingest`, `audit.export`, `audit.verify`) via `@opentelemetry/sdk-node` + OTLP exporter.

## 7. Configuration
- Datasource: `AUDIT_DB_URL`, `AUDIT_DB_USER`, `AUDIT_DB_PASSWORD`.
- Kafka: `AUDIT_KAFKA_BROKERS`, `AUDIT_KAFKA_TOPIC_WORKFLOW`, `AUDIT_KAFKA_TOPIC_IDENTITY`.
- Object Storage: `AUDIT_EXPORT_BUCKET`, `AUDIT_EXPORT_REGION`, credentials.
- Feature flags: `AUDIT_ENABLE_EXPORTS`, `AUDIT_ENABLE_GRAPHQL`.

## 8. Testing Strategy
- Unit tests via `bun test` for hash calculation and chain verification. No Gradle/JUnit.
- Integration tests using Testcontainers (Node.js; `testcontainers` npm package) with real PostgreSQL + Kafka, verifying ingestion, dedupe, and consumer wiring.
- Contract tests ensuring workflow-core-service emits minimal required fields (`eventId`, `tenantId`, `actor`, `action`, `resource`, `payload`).
- Mock adapter: Provide `audit-mock-adapter` module publishing in-memory storage and verifying event shape; expose local HTTP server for developers working offline.

## 9. Workflow Hooks
- Workflow-core-service emits events on transitions (`workflow.transition`, `workflow.assignment.created`, `workflow.timer.triggered`) to `workflow.audit.events.v1`.
- Provide sample Flow IR extension showing `service_task_emit_audit` usage (already referenced in `identity-admin-enrollment` definition; note CFDL is superseded by ADR-0122 Flow IR format).
- Identity-service publishes enrollment/login/MFA events with consistent payload shape. Document required fields in shared contract:
  ```json
  {
    "eventId": "uuid",
    "tenantId": "uuid",
    "actor": {
      "id": "uuid",
      "type": "user|service",
      "displayName": "string"
    },
    "action": "identity.login.success",
    "resource": {
      "type": "identity.user",
      "id": "uuid"
    },
    "payload": {
      "ip": "string",
      "userAgent": "string"
    },
    "timestamp": "2025-01-01T12:00:00Z"
  }
  ```

## 10. Delivery Checklist
- [ ] Submodule initialized with NestJS/Bun project skeleton matching this spec (`bun create nestjs` or Nx generator per [[curaos-speed-patterns-rule]]).
- [ ] ORM migrations (Drizzle/MikroORM/Kysely per [[curaos-orm-rule]]) implementing `audit_record` and `audit_export`.
- [ ] REST + Kafka ingestion functional with integration tests.
- [ ] Sample workflow/identity producers updated to emit contract-compliant events.
- [ ] Mock adapter published under `tests/mocks/audit-service` or similar for local dev.

Update this spec as implementation progresses; link PRs back here for traceability.
