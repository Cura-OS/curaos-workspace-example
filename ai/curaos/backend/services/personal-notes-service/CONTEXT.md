# personal-notes-service - Agent Context

**ADR-0205 §3.13** | Personal overlay | NestJS (TypeScript) | 2026-05-24

---

## v1 contract baseline (this scaffold, #775)

The service is scaffolded + carries its v1 REST + event contract. The richer
ADR-0205 vision below (BlockSuite/Yjs CRDT sync, server-side export) is the
FORWARD target; this baseline ships the contract surface every consuming app
(`personal-notes` frontend) needs first.

**Generator path:** `bun run gen:service personal-notes --plain-service --write`.
The service is a SELF-CONTAINED personal service, NOT an overlay of a
`notes-core-service`. There is no `notes-core-service` in `.gitmodules` and Notes
is not a §5.1 neutral capability, so `--personal-only` (which fails the #587
overlay-preflight without a sibling core) and inventing a neutral notes-core
were both wrong. `--plain-service` with the `personal-notes` name emits exactly
`backend/services/personal-notes-service` + package `@curaos/personal-notes-service`,
matching the registered submodule. Owner-scope (the `personal-` semantics) lives
in the JWT-derived `OwnerScope { tenantId, ownerId }` filter, not a core import.

**REST contract** (`specs/personal-notes.tsp`, gateway base `/api/v1/personal-notes`):
- Notes: `GET /notes` (folder filter + cursor), `GET /notes/search?q=`,
 `POST /notes`, `GET|PATCH|DELETE /notes/{id}` (soft-delete).
- Attachments (nested): `GET|POST /notes/{id}/attachments`,
 `DELETE /notes/{id}/attachments/{attachmentId}` - register/list/remove a
 storage-service object REFERENCE (storageKey); bytes stay in storage-service.
- Folders: `GET|POST /folders`, `PATCH|DELETE /folders/{id}` (409 on non-empty).
- Mold-locked auth proof routes kept: `/personal-notes/{health,protected,protected-write,whoami}`.

**Events** (`specs/personal-notes.asyncapi.yaml`, canonical snake_case envelope):
note + folder + attachment `created`/`updated`/`deleted`(/`added`/`removed`) on
`curaos.core.personal-notes.<resource>.<verb>.v1`. `display_name` carries the
redacted title/name only; free note BODY text NEVER leaves the service (PII).

**Persistence:** `InMemoryPersonalNotesRepository` behind a
`PersonalNotesRepository` port + `PERSONAL_NOTES_REPOSITORY` DI token. The live
Drizzle adapter implements the same port (forward migration, no parallel path).
Contract-mock fixture: `mocks/personal-notes.contract-mock.json` (replayable).

**Verify:** `bun run ci` green (oxlint + tsc + `tsp compile` to OpenAPI 3.1 +
36 bun tests + build). PG/audit-chain integration tests self-skip without a
live DATABASE_URL (contract-mock level).

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (`doc_state bytea` for Yjs snapshots, schema-per-tenant) |
| Search | Meilisearch (plain text extracted from Yjs doc on sync) |
| Messaging | Kafka/NATS + outbox (ADR-0102) |
| Auth | Better Auth + Cerbos (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) - mandatory |
| Token flow | JWT Layer 1 (ADR-0156) |
| Observability | OTel + Grafana (ADR-0107) |
| Editor (frontend) | `@blocksuite/editor`, `@blocksuite/store`, `@blocksuite/blocks` (all MIT) |
| CRDT | Yjs (embedded in `@blocksuite/store`) |

---

## Dependency Graph

```
personal-notes-service
 ──▶ document-core-service (attachments: images/files stored by document_id)
 ──▶ Meilisearch (plain text index via sync event)
 ──▶ PostgreSQL 17, Kafka/NATS
 ──▶ ADR-0120 + ADR-0155

Frontend editor:
 @blocksuite/editor + @blocksuite/store + @blocksuite/blocks (MIT, client-side)
 y-indexeddb (MIT, offline-first client cache)
```

---

## Key Design Constraints

- **AFFiNE backend server excluded.** Only `@blocksuite/*` packages under `packages/` frontend tree (MIT) are imported. CI SBOM gates this.
- **Yjs binary in PG.** `doc_state bytea` holds the Yjs binary snapshot. Not human-readable; full-text search uses extracted plain text in Meilisearch.
- **Snapshot-only sync (v1).** Client sends Yjs binary update on periodic save or blur event; server merges with existing snapshot using `@blocksuite/store` Y.applyUpdate. Hocuspocus (MIT) real-time sync deferred to OQ-3 evaluation.
- **Note hierarchy via `parent_note_id`.** Tree depth unlimited; API returns flat list with `parent_note_id` field; client renders tree. No server-side tree traversal for listing.
- **Owner-scoped invariant.** Every query includes `WHERE owner_party_id = :current_user_party_id`. No exceptions.

---

## Files Must Not Break

- `doc_state bytea` column - encoding changes are destructive; any migration must preserve Yjs binary compatibility.
- Meilisearch index schema for notes - field changes require re-index.
- document-core attachment API contract.

---

## Test Requirements

- Yjs sync: client sends update → server merges → `doc_state` updated → plain text extractable.
- Search: sync → Meilisearch indexed → `GET /notes/search?q=foo` returns correct note.
- Export: markdown export produces valid markdown from a known Yjs snapshot.
- Attachment: image uploaded via document-core → note references `document_id` → presigned URL served.
- Owner scope: party A cannot read party B's notes (403 test).
- SBOM: no AFFiNE backend package in dependency tree.
