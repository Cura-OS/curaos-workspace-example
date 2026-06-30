# CONTEXT.md — documents-core-service

## Purpose

Neutral document primitives (issue #341): document METADATA + an append-only
VERSION CHAIN + application-layer WORM retention + PG-native full-text search.
Raw document BYTES live in object storage (SeaweedFS S3), never in Postgres.
Reused by personal + business overlays + any future vertical. Domain overlay:
`neutral` — NO PHI/PII (clinical names/content live in HealthStack overlays,
which reference a document id here).
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (`drizzle-orm`) — metadata + version chain (ADR-0205 §1.3)
- Validation: Zod 4 (`nestjs-zod`) per `ai/rules/curaos_validation_rule.md`; strict DTOs (fail-closed)
- Storage of bytes: SeaweedFS S3 via `@aws-sdk/client-s3` + `s3-request-presigner` + `lib-storage` — bound at the modulith composition root through the `DocumentStorageProvider` seam (in-memory default keeps the shell driver-free per `ai/rules/curaos_modulith_standalone_rule.md`)
- Upload: `@fastify/multipart` (host-side stream → SeaweedFS); base64 `body` in the shell/test transport
- Retention cron: `@nestjs/schedule` `@Interval` (bound at composition) triggering the pure `RetentionCronService.sweep()`; BullMQ/Redis durable queue is a deferred composition seam
- MIME: `mime-types`
- Full-text: PG-native `tsvector` + `pg_trgm` GIN (ADR-0163) — NOT Meilisearch
- Collaboration: Collabora Online via WOPI (composition-layer sidecar; OnlyOffice opt-in)
- Metadata store: PostgreSQL (CNPG) schema-per-tenant (`documents_core`) per `ai/rules/curaos_postgres_rule.md`

- Neutral capability: NO PHI/PII/financial rows persisted here — overlays own protected schemas.

## WORM (ADR-0205 §1.5)

Application-layer guard: `DocumentsService.deleteDocument` throws
`WormRetentionError` while `retention_until > now`. Version rows are
append-only (`(document_id, version_no)` UNIQUE, no UPDATE path). The object
store's COMPLIANCE Object Lock is NOT relied upon (SeaweedFS issue #8350).

## Integration Points

- Consumed by `personal-documents-service` + `business-documents-service` (GA wave 2, #325) and W-consumers (search / esign / business-docs).
- Events (root producer, durable via `domain_outbox` relay → Redpanda):
  - `curaos.core.documents.created.v1` — DocumentCreated
  - `curaos.core.documents.version.created.v1` — DocumentVersionCreated
  - `curaos.core.documents.retention.expired.v1` — DocumentRetentionExpired
  - (+ the generic codegen lifecycle envelope created/updated/deleted on the same `documents.*` namespace)
- Audit leg: `curaos.core.audit.event.v1` (hash-chained, durable `audit_outbox`).
- REST: TypeSpec `specs/documents.tsp` → OpenAPI 3.1. Domain routes under `/documents/records` (create/list/get/versions/download/delete); scaffold echo routes under `/documents/{health,protected,protected-write,:id}`.
- Tenant routing: shared `TenantInterceptor` (ADR-0201 §2.5); the service is request-context-free (tenantId passed in).

## Decisions

Storage / retention / FTS / domain-outbox / cron decisions auto-applied per
`ai/rules/curaos_recommendation_auto_apply_rule.md` — see
`ai/curaos/docs/adr/AUTO-DECISION-LOG.md` (2026-06-03, #341 rows) and the grill
at `ai/curaos/docs/grills/m11-341-documents-core-domain.md`.


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/documents-core-service/Requirements.md` — full spec
