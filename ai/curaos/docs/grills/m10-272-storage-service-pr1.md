# Codex grill — m10-272 storage-service PR storage-service#1

Cross-harness adversarial review (Claude → Codex) per [[curaos-verification-stack-rule]] Tier-2.
Reviewer: Codex `gpt-5.5`, reasoning effort `high`, sandbox `read-only`.
Scope: `git diff main..HEAD` on `agent/scaffold-storage-service-272` (@ `2d9fed8` at grill time) + ADR-0201 §3.2.
Issue: your-org/curaos-ai-workspace#272 (M10 scaffold).

## Verdict: APPROVE-WITH-CONDITIONS

The scaffold matches ADR-0201 §3.2 at the correct altitude. One CRITICAL doc/ADR
conflict (WORM defaults) + one inaccurate contract comment were folded in before
merge; the remainder are correctly-deferred downstream subtasks or mold-class.

## P1 findings (addressed before merge)

1. **WORM-default bucket classes not encoded (ADR-0201 §3.2.2).**
   - **Where:** `drizzle/schema.ts` (`storage_objects`/`storage_policies` defaults), `0001_storage_domain.sql`, `src/storages/storage.dto.ts`, `src/storages/storages.service.ts`.
   - **What:** ADR-0201:167 requires audit/e-sign/clinical buckets to default `worm=true`, 7-year retention. The code defaulted `worm=false, retentionDays=0` everywhere; the bucket→WORM mapping existed only as prose.
   - **Why:** a clinical/audit bucket policy could silently land non-retained.
   - **Fix (applied, commit `7eaa20c`):** added `WORM_DEFAULT_BUCKET_CLASSES` (`clinical`/`esign`/`audit`) + `WORM_DEFAULT_RETENTION_DAYS=2555` constants; `normalizePolicy` forces `worm=true` + 7y retention for a protected class created without an explicit `worm` flag, applies the retention floor when WORM is on, and honours an explicit operator override. 4 new unit tests cover the matrix. The table-level column default stays `false/0` (correct — the policy path applies the class default).

2. **Inaccurate AsyncAPI contract comment.**
   - **Where:** `src/events/storage-object-events.ts` header.
   - **What:** claimed `specs/storage-events.asyncapi.yaml` "is published alongside" — no such file is committed (and no sibling scaffold ships one).
   - **Fix (applied, commit `7eaa20c`):** comment corrected — the TS topic constants + payload types ARE the published contract at scaffold altitude (settings-/notify-service convention); the AsyncAPI registry doc is a downstream feature-Story artifact.

## P2 findings (deferred — downstream feature Stories, acceptable for scaffold)

- Repository-backed checks (download scan-gate, retention lookup, soft-delete, access-log append, policy upsert, checksum verify) — deferred per Story scope.
- Transactional domain-event outbox for storage lifecycle events — deferred.
- BullMQ `storage-scan` + ClamAV/Trivy + quarantine writeback + OPA/Cerbos + OpenBao + settings-service TTL — deferred.
- Tenant isolation in the provider: `tenantId` accepted but not yet bound into bucket/key/credential by the stub presign — the real SigV4 signer binds it downstream (documented in the provider).
- External provider (`PROVIDER_STORAGE=external`) implementation — deferred; the module binds the SeaweedFS local default only.
- SeaweedFS S3 SigV4 presign spike + repository-backed WORM-delete prototype + lifecycle-outbox prototype + ClamAV/BullMQ scan prototype — named as prototype candidates for the feature Stories.

## Mold-class (NOT scaffold-author defects — flagged for orchestrator serialization)

- `src/events/storage-event-producer.ts` core envelope uses `actor_id` for the resource subject (glossary overlap with the access-log `actor_id`); the storage DOMAIN producer (`storage-object-events.ts`) correctly uses `object_id`. Mold-emitted core producer.
- `@nestjs/platform-express` + default `NestFactory.create` vs ADR-0201's Fastify adapter — mold runtime-adapter choice, identical across all services.
- `0000_audit_outbox.sql` CHECK + inline UNIQUE diverge from `schema.ts`/snapshot (also CodeRabbit major) — mold baseline, byte-identical to merged settings-service.

## Provider naming (non-critical, documented divergence)

Codex recommends ADR-0154/ADR-0201 vocabulary `CuraOSLocalStorageProvider` over `SeaweedFsStorageProvider`. Kept the descriptive concrete name at scaffold altitude; the `StorageProvider` SEAM matches ADR vocabulary and the concrete impl name is unambiguous. A future feature Story can rename to the ADR alias when the external provider lands — tracked as a P2.

## What Claude got right (counter-balance)

1. Event topic constants in `storage-object-events.ts` are correct vs ADR-0201:173-176 — Codex confirmed do-not-rename.
2. WORM compliance wording is correct — application-layer guard only, explicit #8350 caveat, no HIPAA-WORM claim.
3. The `0001` migration correctly diffs against the `0000` baseline so `audit_outbox` is not re-created; the infra tables stay verbatim.
4. Auth-by-default + JWT-derived tenant/actor (never body-trusted) carried correctly into the new `ObjectsController`.

## User-escalation candidates

- Canonical bucket names/prefixes for the WORM-default classes (`clinical`/`esign`/`audit`) if these are not already accepted platform vocabulary. **Resolution:** used the three names ADR-0201 §3.2.2 itself enumerates ("audit files (e-sign, clinical docs)"); the constant is trivially extensible when the canonical bucket taxonomy is ratified. No blocker.
