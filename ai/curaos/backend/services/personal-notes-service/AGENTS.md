---
name: personal-notes-service
description: Block-based personal notes - BlockSuite MIT editor, Yjs CRDT sync, Meilisearch full-text, markdown/PDF export.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API)
tooling:
  - bun
  - typespec
  - blocksuite
apis:
  - "REST /api/v1/personal-notes (notes CRUD, folders, search, attachments) - specs/personal-notes.tsp"
events:
  produces:
    - curaos.core.personal-notes.note.created.v1
    - curaos.core.personal-notes.note.updated.v1
    - curaos.core.personal-notes.note.deleted.v1
    - curaos.core.personal-notes.folder.created.v1
    - curaos.core.personal-notes.folder.updated.v1
    - curaos.core.personal-notes.folder.deleted.v1
    - curaos.core.personal-notes.attachment.added.v1
    - curaos.core.personal-notes.attachment.removed.v1
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  adr: ai/curaos/docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: nodejs
---

# personal-notes-service

Block-based personal note-taking. BlockSuite MIT editor packages only; AFFiNE backend server excluded.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint (hard):** AFFiNE `packages/backend/server` has non-OSS license - not imported. Use only `@blocksuite/*` packages (MIT). CI SBOM gates this.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.13

## Agent operating rules (module-local)

- All queries scoped to `owner_party_id = current_user.party_id` - invariant, no exceptions.
- `doc_state bytea` is a Yjs binary snapshot - never parse it as JSON or text directly; use `@blocksuite/store` Y.applyUpdate + Y.encodeStateAsUpdate.
- Plain text for Meilisearch must be extracted server-side from Yjs snapshot using BlockSuite serializer - not client-provided.
- Attachments go through document-core-service - no local file storage.
- OQ-3 (Hocuspocus vs snapshot-only) must be resolved before personal-notes v1 ships - document evaluation result.
- Any new `@blocksuite/*` package addition: verify it is from the MIT `packages/` frontend tree, not from `packages/backend/server`.
