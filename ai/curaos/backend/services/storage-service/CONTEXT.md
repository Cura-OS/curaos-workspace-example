# Agent Context — storage-service

**Cluster:** ADR-0201 Platform Shared Services
**Last updated:** 2026-06-01

---

## Scaffold status (M10 #272)

storage-service was scaffolded from the `@curaos/codegen` `--plain-service`
mold (curaos main `a1bf976`) and the storage DOMAIN was filled per ADR-0201
§3.2. **What ships NOW (scaffold altitude):**

- Drizzle schema for the four ADR-0201 §3.2.1 tables (`storage_objects`,
  `storage_access_log`, `storage_policies`, `virus_scan_results`) + the
  inherited audit-outbox / chain-head / idempotency infra; migration
  `0001_storage_domain.sql` + snapshot.
- `StorageProvider` seam (ADR-0154) + `SeaweedFsStorageProvider` (local default,
  presign SHAPE only — real AWS SigV4 + OpenBao injection are downstream).
- REST surface per §3.2.4 (`/objects/upload-url`, `/download-url`, `GET|DEL
  /objects/:id`, `:id/scan`, `:id/reprocess`, `/buckets`, `/buckets/:id/policy`)
  — JWT-derived tenant/actor, Zod-validated, auth-by-default.
- Storage domain event contracts per §3.2.3 (`curaos.storage.object.uploaded
  .v1`, `quarantined.v1`, `deleted.v1`, `lifecycle.transitioned.v1`).
- Application-layer WORM guard (`StoragesService.assertDeletable` → 403).
- Unit + in-process integration tests green WITHOUT live infra.

**Deferred to downstream feature Stories (NOT in this scaffold):** real
SeaweedFS/S3 presign signing, checksum verification, BullMQ `storage-scan`
ClamAV pipeline, OPA-WASM policy hook, OpenBao credential injection, live Kafka
publish, GDPR erasure consumer, cold-tier lifecycle sweep, the actual Drizzle
repository persistence. The handlers that need those return documented scaffold
shapes derived from the validated input + JWT principal.

> The aspirational target module structure below (objects/ + buckets/ +
> providers/ trio + scan/ + consumers/ + outbox/) is the END-STATE goal; the
> scaffold emits a flatter `storages/` + `providers/` + `events/` layout. The
> two converge as the feature Stories land.

## WORM compliance caveat (SeaweedFS bug #8350 — BINDING)

SeaweedFS compliance-mode WORM object-lock does **NOT** reliably enforce at the
storage layer (upstream bug
[seaweedfs/seaweedfs#8350](https://github.com/seaweedfs/seaweedfs/issues/8350)).
Therefore:

- WORM is enforced at the **APPLICATION layer only** — `DELETE /objects/:id`
  returns 403 while `storage_objects.retention_until > now()`. The backend
  object-lock is **not** trusted as a second line of defence.
- **Do NOT claim HIPAA-WORM compliance** in any deployment doc, marketing, or
  attestation until #8350 is resolved OR an independent object-lock guard is
  added (e.g. a periodic backend-lock reconciliation job).
- This caveat is repeated at the code layer in `seaweedfs-storage.provider.ts`,
  `drizzle/schema.ts` (`storage_objects`), and `0001_storage_domain.sql`.

---

## Stack (locked — ADR-0100, ADR-0201)

- Language: TypeScript (strict)
- Runtime: Bun primary; Node.js 22 LTS fallback only when Bun cannot
- Framework: NestJS 11, Fastify adapter
- ORM: Drizzle (schema + drizzle-kit migrations)
- DB: PostgreSQL 17 (schema-per-tenant)
- Object store: SeaweedFS (S3-compatible API) — local default
- Virus scan: ClamAV — local default
- Events: Kafka 4 (`@nestjs/microservices`) + NATS JetStream
- Jobs: BullMQ via `@nestjs/bull`
- Auth/Access: JWT Bearer + Cerbos ABAC + OPA-WASM
- Secrets: OpenBao (injected at pod startup; never env vars)
- Observability: OTel SDK, structured JSON logs, Loki/Tempo/VictoriaMetrics/Grafana
- Test: Vitest + Testcontainers (real PG + SeaweedFS in CI)
- Package: `@curaos/storage-service`

---

## Module Structure

```
storage-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── objects/
│   │   ├── objects.module.ts
│   │   ├── objects.controller.ts        # REST: upload-url, download-url, metadata, delete, scan
│   │   └── objects.service.ts           # presign, checksum verify, scan enqueue
│   ├── buckets/
│   │   ├── buckets.controller.ts        # GET /buckets, POST /buckets/{id}/policy
│   │   └── buckets.service.ts           # policy management, WORM enforcement
│   ├── providers/
│   │   ├── storage/
│   │   │   ├── storage.provider.interface.ts  # StorageProvider
│   │   │   ├── local-storage.provider.ts      # @aws-sdk/client-s3 → SeaweedFS
│   │   │   └── external-storage.provider.ts   # @aws-sdk/client-s3 → AWS S3/B2/Wasabi
│   │   ├── virus-scan/
│   │   │   ├── virus-scan.provider.interface.ts  # VirusScanProvider
│   │   │   ├── local-scan.provider.ts            # ClamAV socket/REST
│   │   │   └── external-scan.provider.ts         # VirusTotal API v3
│   │   └── cold-tier/
│   │       ├── cold-tier.provider.interface.ts   # ColdTierProvider
│   │       ├── local-cold.provider.ts            # SeaweedFS volume TTL + rack
│   │       └── external-cold.provider.ts         # S3 Glacier / B2 cold lifecycle
│   ├── scan/
│   │   └── scan.worker.ts               # BullMQ worker: storage-scan queue
│   ├── consumers/
│   │   └── erasure.consumer.ts          # Kafka: curaos.party.erasure.requested.v1
│   ├── outbox/
│   │   └── outbox.scheduler.ts          # @nestjs/schedule outbox polling
│   └── persistence/
│       └── schema.ts
├── test/
│   ├── unit/
│   └── integration/                     # Testcontainers: PG + SeaweedFS (S3-compat)
└── specs/
    ├── storage.tsp                       # TypeSpec REST spec
    └── storage-events.asyncapi.yaml      # AsyncAPI 3 event schema
```

---

## Key Behavioral Rules

- **Provider selection:** `PROVIDER_STORAGE=local|external`, `PROVIDER_VIRUS_SCAN=local|external`. NestJS DI module swap — no if/else in business logic.
- **WORM enforcement:** `DELETE /objects/{id}` checks `storage_objects.retention_until` and `storage_policies.worm`. Return 403 with body `{ error: "worm_lock", retention_until: "..." }` when locked.
- **Checksum verification:** After presigned upload completes, storage-service computes SHA-256 of received object and compares to client-supplied checksum. Mismatch → reject + delete object.
- **Scan-before-serve:** Objects with `scan_status != 'clean'` return 403 on download URL request. Pending scan: 202 Accepted with Retry-After header.
- **Tenant isolation:** SeaweedFS volume tagged `tenant={tenant_id}`. OpenBao per-tenant credentials for BYO S3 providers.
- **DLQ:** Every Kafka consumer has dead-letter topic. Alert on any DLQ message.
- **Presigned URL TTL:** Upload URL default 15 min; download URL default 1 hour; both configurable via `storage.presign.upload_ttl_seconds` and `storage.presign.download_ttl_seconds` in settings-service.

---

## Env Vars (injected by OpenBao)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `KAFKA_BROKERS` | Kafka broker list |
| `NATS_URL` | NATS JetStream |
| `PROVIDER_STORAGE` | `local` (SeaweedFS) or `external` |
| `SEAWEEDFS_S3_ENDPOINT` | SeaweedFS S3-compatible endpoint |
| `SEAWEEDFS_ACCESS_KEY`, `SEAWEEDFS_SECRET_KEY` | SeaweedFS credentials |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_PREFIX` | For external S3/B2/Wasabi |
| `PROVIDER_VIRUS_SCAN` | `local` (ClamAV) or `external` |
| `CLAMAV_HOST`, `CLAMAV_PORT` | ClamAV daemon |
| `VIRUSTOTAL_API_KEY` | VirusTotal API (external scan) |

---

## Commands

```bash
# Dev
bun dev

# Test
bun test
bun test:integration      # Testcontainers (PG + SeaweedFS S3-compat + ClamAV)

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

- `StorageProvider` interface with SeaweedFS (local) + S3/B2/Wasabi (external) implementations.
- `VirusScanProvider` with ClamAV (local) + VirusTotal (external) implementations.
- Presigned upload + download URL flow end-to-end with checksum verification.
- BullMQ scan pipeline: clean → emit `uploaded.v1`; threat → quarantine + emit `quarantined.v1`.
- WORM DELETE returns 403 on locked objects.
- Kafka producers: `uploaded.v1`, `quarantined.v1`, `deleted.v1`, `lifecycle.transitioned.v1`.
- GDPR erasure consumer: non-WORM delete; WORM mark pending expiry.
- Integration tests green in CI with Testcontainers.
- OTel traces + metrics visible in local Grafana stack.
- OpenBao injection verified — no plaintext credentials in images or manifests.
