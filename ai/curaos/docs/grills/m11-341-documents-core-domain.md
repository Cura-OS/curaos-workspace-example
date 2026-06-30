# Grill — M11 #341 documents-core-service DOMAIN (version chain + WORM + durable events)

- **Issue:** your-org/curaos-ai-workspace#341
- **Scope:** doc metadata + version chain + SeaweedFS WORM storage seam + durable domain events + TypeSpec REST + retention cron + PG FTS — on the already-merged scaffold.
- **Grill mode:** Claude → Codex opposite-harness adversarial review **ATTEMPTED but BLOCKED** — Codex CLI `gpt-5-codex` unsupported on this ChatGPT account, and the fallback default model returned `usage limit` (retry not until Jul). No live opposite-harness verdict obtainable this session.
- **Mitigation:** Self-grill against the canonical docs/code (ADR-0163, ADR-0205 §1, ADR-0101 §3, rolling-update rule, generator-evolution in-flight barrier, ADR-0201 §2.5 tenant routing) + the verbatim sibling reference (`commerce-core-service` domain-outbox). Every plan decision is pre-answered by a doc/code citation, so no genuine architectural unknown remains for an AFK run.

## Self-grill resolutions (auto-applied per `curaos_recommendation_auto_apply_rule`)

1. **Full-text search** — ADR-0163 + ADR-0205 §1.5 lock PG `tsvector` + `pg_trgm`, NOT Meilisearch. → Implement a generated `tsvector` column over `classification` + `title` metadata with a GIN index. ✓
2. **WORM** — ADR-0205 §1.5: application-layer DELETE guard when `retention_until` is in the future; do NOT rely solely on SeaweedFS COMPLIANCE Object Lock (issue #8350). → `WormRetentionError` thrown by the service before any delete/mutation while `retention_until > now`; version rows are append-only (no UPDATE path). ✓
3. **Rolling-update** — forward-only additive migration `0002_documents_domain.sql` (ADD tables/indexes only; never drops live tables, no `-v2`/`-next` parallel path). ✓
4. **Generator-evolution in-flight barrier** — queried open codegen/`*-sdk`/`contracts` lanes carrying `agent-claimed:*`/`agent-PR-open`: result `[]` (none in flight). Clear to proceed. ✓
5. **Tenant routing** — ADR-0201 §2.5: shared `TenantInterceptor` resolves `X-Tenant-ID`; the service stays request-context-free (tenantId passed in), matching commerce-core. PHI boundary preserved (neutral schema, reference + non-PHI metadata only). ✓
6. **BullMQ vs @nestjs/schedule** — ADR-0205 lists both for retention. → `@nestjs/schedule` cron triggers a **pure domain sweep method** (`expireRetention`) that marks expired docs + emits `retention.expired` via the durable domain outbox; the BullMQ/Redis durable-queue binding is a composition-root seam (deferred), keeping the standalone shell driver-free per `curaos_modulith_standalone_rule`. ✓
7. **Storage** — SeaweedFS S3 (`@aws-sdk/client-s3`) is a narrow `StorageProvider` seam (put/get/presignedUrl) matching `@curaos/providers`; in-memory default for tests, real provider bound at composition. Driver-free shell. ✓

## Glossary

- **document** (singular) = the logical record / aggregate root (table `documents`).
- **document version** = an immutable byte snapshot in the append-only chain (table `document_versions`, monotonic `version_no` per document).
- **version chain** = the ordered set of `document_versions` for one `document_id`; `documents.latest_version` is the head pointer.
- **WORM** = write-once-read-many: a stored version's bytes + metadata are immutable; deletion blocked until `retention_until` passes.

## User-escalation candidates

None. Every decision has a doc/code recommendation; no irreversible/destructive/T3/unapproved-scope item surfaced. (No PHI fields, no RBAC logic change, no schema DROP, no rule edit.)
