---
name: esign-core-service
description: Neutral e-signature primitives for CuraOS - wet capture, PKCS#7/PAdES, XAdES-BES, verification, revocation.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Redpanda (Kafka API), SeaweedFS S3
tooling:
  - bun
  - typespec
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

# esign-core-service

Neutral signature primitive library. All signing operations in CuraOS route through this service regardless of tier.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS (TypeScript). Replaces previous Spring Boot/Kotlin scaffold (stale - do not reference).

**License constraint (hard):** Use only permissive-licensed signing libraries: `signature_pad`, `pdf-lib`, `@signpdf/signpdf`, `xadesjs` (all MIT), `node-forge` (BSD-3-Clause (GPL arm not elected) - permissive arm elected, GPL never elected). Never add AGPL/GPL dependencies.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, dependency graph, design constraints
- [Requirements](Requirements.md) - signature types, API, events, DoD
- [ADR-0205](../../../docs/adr/0205-cluster-docs-esign-crm-donation-hr-business.md) §3.3

## Toolchain Registry

```bash
bun install
bun test                    # unit tests
bun test:integration        # real PG17 + SeaweedFS
bun run lint                # Biome / TypeSpec lint
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Store signature bytes in PG - only store the SeaweedFS object key (`signature_bytes_ref`).
- Delete signature bytes on revocation - set `status = revoked` only; bytes retained for audit.
- Access key bytes directly in controllers or services - use `SignatureKeyProvider` interface only.
- Add AGPL/GPL dependencies - only permissive libraries: `signature_pad`, `pdf-lib`, `@signpdf/signpdf`, `xadesjs` (MIT), `node-forge` (BSD-3-Clause (GPL arm not elected)).

**ALWAYS:**
- Emit a hash-chain audit entry via `@curaos/audit` interceptor on every signing operation.
- Re-hash live document bytes in `verify` - tamper-evidence is a first-class invariant; tests must assert this.
- Reject expired external signer OTP tokens with `401` (hard TTL: 72h default).
- Run `bun run ci` before reporting done.
