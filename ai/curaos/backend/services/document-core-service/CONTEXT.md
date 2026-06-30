# document-core-service — Agent Context

**ADR-0205** | Neutral core | NestJS (TypeScript) | 2026-05-24

---

## Stack (locked by ADR-0205 + ADR-0100)

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (schema-per-tenant, ADR-0101) |
| Cache | Valkey (ADR-0101) |
| Blob storage | SeaweedFS via S3-compatible API (`@aws-sdk/client-s3`) |
| Job queue | BullMQ + `@nestjs/schedule` |
| Messaging | Kafka/NATS + outbox pattern (ADR-0102) |
| Auth | Better Auth + Cerbos ABAC (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) — mandatory |
| Token validation | JWT Layer 1 (user) + mTLS Layer 3 (service-to-service) per ADR-0156 |
| Audit | Hash-chain PG per ADR-0104 |
| Observability | OTel traces + Grafana (ADR-0107) |
| API spec | TypeSpec → REST (primary) + tRPC (internal) |
| Search | Meilisearch events via ADR-0201 |
| Collab sidecar | Collabora Online MPL-2.0 (default WOPI); OnlyOffice AGPL (tenant opt-in) |

---

## Dependency Graph

```
document-core-service
  ──▶ SeaweedFS (blob storage)
  ──▶ PostgreSQL 17 (metadata)
  ──▶ Valkey (cache / presigned URL TTL)
  ──▶ Kafka/NATS (event publish)
  ──▶ Meilisearch (search index, via events)
  ──▶ Collabora Online (WOPI sidecar — no code import)
  ──▶ ADR-0120 (Better Auth + Cerbos)
  ──▶ ADR-0155 (@curaos/tenancy)
  ──▶ ADR-0104 (audit hash-chain)
  ──▶ ADR-0102 (Kafka outbox)

Consumed by:
  business-docs-service, business-esign-service, personal-notes-service,
  personal-esign-service, hr-service (performance docs), business-cases-service
  (attachments), business-donation-service (tax receipts)
```

No upstream dependency on other ADR-0205 cluster services.

---

## Provider Abstraction (ADR-0154)

- `StorageProvider` interface (`STORAGE_PROVIDER` DI token)
- `StorageSeaweedFSProvider` — default; wraps `@aws-sdk/client-s3` pointed at SeaweedFS
- `StorageS3Provider` — 3rd-party; BYO AWS S3 / compatible bucket per tenant config
- `StorageProviderModule` registered in `AppModule`; Zod config validated at bootstrap

---

## Key Design Constraints

- **UUID v7** for all `document_id` values (time-ordered, opaque to clients).
- **SeaweedFS object versioning** enabled; `parent_version_id` chain maintained in PG.
- **SeaweedFS object lock** (WORM mode) for documents with retention policy — service cannot delete prematurely; object lock is the backstop.
- **Presigned URL TTL:** download URLs expire in 15 minutes by default (configurable per tenant); WOPI edit URLs in 4 hours.
- **Classification enforcement:** Cerbos policy gates `GET /download` on `classification` field. `restricted` → HR-manager or above role required.
- **No PHI.** `owner_party_id` is a UUID reference to party-service only. No name, email, or clinical data in this service.
- **WOPI-only sidecar integration.** CuraOS imports no Collabora or OnlyOffice code. If sidecar is unavailable, edit endpoint returns 503; download continues normally.

---

## Files Must Not Break

- `db/migrations/document-core/` — PG schema migrations; altering without additive-only changes breaks existing tenants.
- `document.created` Kafka topic — consumed by esign-core, business-docs, search indexer; schema changes require versioning.
- `StorageProvider` interface in `@curaos/providers` — adding methods is breaking for existing implementations.

---

## Modulith vs Microservice (ADR-0099 §5)

- **Modulith mode** (default): NestJS module in shared process; in-process calls from business-docs, personal-notes, etc.
- **Microservice mode**: independent container; inter-service via gRPC or Kafka events.
- Runtime flag `CURAOS_DEPLOYMENT_MODE=modulith|microservice` controls wiring. No code branching — NestJS DI handles it.

---

## Test Requirements

- Unit: upload controller, retention job state machine, classification enforcement.
- Integration: SeaweedFS round-trip (upload → presigned download → verify bytes). Uses real SeaweedFS container in CI.
- Retention: expired doc marked → object lock checked → `document.retention.expired` emitted.
- Contract: `document.created` event schema matches consumer expectations (ADR-0102 contract test).
- E2E: WOPI redirect to Collabora sidecar returns 302 with valid WOPI URL.
- Audit: upload + status-change path produces valid hash-chain entries.
