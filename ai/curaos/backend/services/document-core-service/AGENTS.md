---
name: document-core-service
description: Neutral document storage infrastructure for CuraOS - metadata, versioning, retention, WOPI collaboration.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - bun
  - typespec
  - bullmq
  - temporal-client
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  adr: ai/curaos/docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md
runtime: nodejs
---

# document-core-service

Neutral document infrastructure - the single source of truth for file bytes and document metadata across all CuraOS services.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

**Stack:** NestJS (TypeScript) + PostgreSQL 17 + SeaweedFS + Valkey + BullMQ. Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint:** Collabora Online (MPL-2.0) integrated via WOPI protocol only - no source import. OnlyOffice (AGPL) is tenant opt-in only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, dependency graph, design constraints
- [Requirements](Requirements.md) - capabilities, API surface, events, DoD
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) - cluster canonical spec §3.1

## Toolchain Registry

```bash
bun install
bun test                    # unit tests
bun test:integration        # real PG17 + SeaweedFS + Valkey
bun run lint                # Biome / TypeSpec lint
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Call `@aws-sdk/client-s3` directly from controllers - use `StorageProvider` interface.
- Construct raw S3 URLs - presigned URL generation via `StorageProvider.presign()` only.
- Call S3 delete API directly to bypass SeaweedFS WORM/object-lock enforcement.
- Return a download URL without validating the classification field against Cerbos policy.
- Apply destructive schema changes - additive migrations only for new PG columns.

**ALWAYS:**
- Call `@curaos/tenancy` TenantModule guard before any PG or SeaweedFS access.
- Emit audit entry via `@curaos/audit` interceptor on every mutation (upload, version create, status change, retention mark).
- Run `bun run ci` before reporting done.
