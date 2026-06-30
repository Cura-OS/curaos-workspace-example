---
name: education-personal-service
description: EducationStack learner layer - learner profile, course progress, competency tracking, Open Badges 3.0/Data Integrity issuance (Ed25519), CLR export (W3C VP), GDPR erasure workflow.
tags: [service, education]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - bun
  - temporal-ts-sdk
  - flyway
  - otel
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
  readme: README.md
runtime: bun
adr_authority: ADR-0207
---

# education-personal-service

EducationStack learner layer. Learner is the primary principal. Owns learner profile (anchored in party-core-service), course progress tracking, competency achievement, Open Badges 3.0 digital credentials, and Comprehensive Learner Record (CLR) export.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

**Stack:** NestJS (TypeScript) + PG17 + Valkey + Kafka/NATS + Temporal TS SDK. Stack locked by ADR-0100 + ADR-0207. The #414 foundation slice exposes plain TypeScript provider classes and test doubles so composition roots can wire Nest/infra later without pulling unrelated workspace packages into unit tests.

**Learner sovereignty rule:** Learner controls PortfolioVisibility per credential. Institution cannot export or share learner CLR/badges without learner-generated ShareLink. Aggregation floor (5 learners) mandatory on institution analytics - not configurable.

**Identity rule:** Learner = Party from party-core-service. No duplicate identity model. LearnerProfile stores education-specific attrs only; partyId is the anchor FK.

**Enrollment rule:** EnrollmentRecord source-of-truth is education-organization-service. This service caches a subset only. Invalidate on enrollment change events.

**OB3 signing rule:** Use Ed25519-compatible W3C Data Integrity proofs (`eddsa-jcs-2022`) with issuer `did:web`. The #414 foundation uses built-in `node:crypto` Ed25519 and no third-party signing library because Bun workspace install currently resolves unrelated placeholder packages. If dependency install is repaired, `@noble/ed25519` (MIT) is the only approved third-party Ed25519 signer. Old Ed25519 keys retained in DID doc verificationMethod array indefinitely - historical badges must always verify.

**CLR bundling rule:** Custom VP/CLR bundler is primary. `@1edtech/clr` was not installable in the 2026-06-04 npm check; do not introduce it unless a later audited installable package is proven.

**GDPR erasure rule:** Erasure workflow must be idempotent (Temporal retry-safe). All 6 steps (PG nullify, SeaweedFS delete, xAPI void, StatusList revoke, event emit, Valkey invalidate) must complete before workflow marked done.

**Dependency rule:** Never imports HealthStack packages. healthstack-education-service may consume this service's public badge/CLR endpoints - one-way dependency only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack rules, OB3 key rotation, GDPR erasure flow, files that must not break
- [Requirements](Requirements.md) - mission, domain model, events, API surface, OSS stack, done criteria
