---
adr-id: 0163
title: DA13 batch resolution of 10 STILL-OPEN questions
status: Accepted
date: 2026-05-25
supersedes: []
superseded-by: null
tags: [governance, foundation, data-layer, api-surface, observability, deployment, builder]
parent-adrs: [0099, 0100, 0101, 0102, 0103, 0107, 0120, 0121]
amends: [0100, 0101, 0102, 0103, 0107, 0121]
---

# ADR-0163 — DA13 Batch Resolution of 10 STILL-OPEN Questions

## Context

Post-DA1-DA12 walk + ADR audit (2026-05-25), 10 STILL-OPEN questions remained across foundation + data-layer + observability + builder ADRs per `RESOLUTION-MAP.md`. User interview walked all 10 in single session. This ADR records the batch resolution + cross-cuts the affected ADRs.

## Decisions

### Q1 — GraphQL stack (ADR-0100 Q3 + ADR-0103)

**Cosmo Router (Apache 2.0 federation supergraph) + per-service @nestjs/graphql Apollo subgraph driver.**

- Cosmo Router self-hosted on K3s per [[curaos-orchestration-rule]]
- Federation v2 spec
- Air-gap-safe per [[curaos-airgap-rule]]
- Per-service uses `@nestjs/apollo` w/ subgraph driver

Rejected: Apollo GraphOS (SaaS dependency violates self-hosted-first), Mercurius (no native federation), Yoga+Mesh (Mesh federation < Cosmo maturity).

### Resolved Q2 — internal RPC scope (ADR-0100 Q4)

**Internal-only (tRPC v11+ for service↔service typed RPC); external/partner APIs use TypeSpec→OpenAPI 3.1 → @hey-api/openapi-ts SDKs.**

Cleanest language-agnostic partner contract. Internal devs keep zero-friction TS-native types.

### Q3 — Max SaaS tenant count 5y horizon (ADR-0101 RDBMS Q1)

**10K+ tenants from day 1 → Citus extension on CNPG (distributed PG sharded by `tenant_id` across worker nodes).**

UPDATES [[curaos-postgres-rule]]: prior DB-per-tenant default replaced w/ Citus distributed for neutral high-volume services. HealthStack PHI services retain DB-per-tenant override (smaller tenant count; strongest isolation).

Rejected: YugabyteDB (rewrite CNPG; fewer PG extensions), multi-Citus regions (cross-cluster queries impossible).

### Q4 — Doc count per tenant per service category (ADR-0101 Search Q1)

**PG-only search v1 (pgvector + tsvector + pg_trgm for ALL services including HealthStack clinical).**

OpenSearch removed from v1 stack. Revisit at HealthStack M11 if FHIR search perf insufficient.

**M11 revisit FIRED (2026-06-03, RESOLVED-EVAL, #327):** conditional no-go — PG-only stays for
single-domain generic; OpenSearch 2.x re-added as opt-in Tier 2 for M12 cross-service
federated/clinical search. Evidence + projection: [m11-search-revisit-eval.md](../research/m11-search-revisit-eval.md);
amendment in [ADR-0101 § Search M11 revisit amendment](0101-data-layer.md#search-m11-revisit-amendment-2026-06-03-327).

UPDATES ADR-0101 §Search.

### Q5 — Max tenant per SaaS deployment 3y (ADR-0102 Q2)

**Kafka key-by-tenant from day 1 (tenant UUID as partition key on shared topics).**

Scales to 10K+ tenants per cluster w/o partition explosion. Matches ADR-0200 cluster convention. Per-tenant consumer filtering via Kafka Streams or app-layer filter.

### Q6 — MinIO AGPLv3 air-gap bundle legal (ADR-0107 Q2)

**SeaweedFS S3 (Apache 2.0) replaces MinIO for ALL object storage including PG backups.**

UPDATES [[curaos-postgres-rule]] Barman backup target + ADR-0107 + ADR-0101.

Rejected: keep MinIO w/ FSF mere-aggregation defense (legal uncertainty), RustFS (v1.0.0-alpha; distributed mode NOT released — revisit v2 when GA).

### Q7 — GDPR erasure SLO 30d (ADR-0107 Q4)

**30d for primary DB + sync stores (search/cache/object storage); backups + HIPAA 6y audit log explicitly exempted w/ documented retention exemption.**

Legal basis: GDPR Recital 30 + Art 17(3)(b)(e) — legitimate interest + legal obligation. Tombstone in primary DB tracks erasure. Cross-service erasure handled via Temporal saga per ADR-0151.

### Q8 — Specialist tier first invocation (ADR-0100 Q6)

**TS-only core for v1; per-tool best framework/language as concrete hot path emerges (Phase 4 reassess).**

Lowest cognitive load; matches solo-dev capacity. Specific Go/Rust adoption deferred until perf SLA missed on identified hot path.

### Q9 — Deployment SKU split (ADR-0102 Q-deployment)

**Single SKU + feature flags + deployment profile config.**

One codebase; deployment-profile flag (cloud/on-prem/hybrid/air-gap) drives infra topology (Kafka SaaS / NATS SMB) via Helm values + Unleash feature flags per ADR-0110. Matches injection-molding metaphor per ADR-0099.

Rejected: separate SaaS vs SMB SKUs (violates injection-molding; 2x packaging burden).

### Q10 — Git backend for design VCS (ADR-0121 Q4)

**Tenant external Git (BYO GitHub/GitLab/Gitea via OAuth) primary; CuraOS Gitea fallback for tenants w/o external.**

Provider abstraction in `@curaos/providers` per ADR-0154 + [[curaos-local-vs-3rdparty-rule]].

## Consequences

### Positive

- All 10 STILL-OPEN questions from `RESOLUTION-MAP.md` resolved
- M1-M3 monorepo scaffold unblocked (Q1+Q2 resolved)
- Data-layer sizing decisions locked (Q3+Q4+Q5)
- Legal risks addressed (Q6 SeaweedFS replaces MinIO AGPL; Q7 GDPR scope explicit)
- Operational scope locked (Q8 TS-only; Q9 single SKU; Q10 BYO Git)

### Negative / changes required

- [[curaos-postgres-rule]] major rewrite: DB-per-tenant → Citus distributed for non-HealthStack
- ADR-0101 §Search amendment: OpenSearch removed from v1
- All Barman backup configs change endpoint MinIO → SeaweedFS
- Citus operator added to K3s install profile per [[curaos-orchestration-rule]]
- Citus version pinning added per [[curaos-version-pinning-rule]]
- HealthStack imaging-service decision deferred (Q8 says per-tool best lang; DICOM Rust/Go reassess later)

### Risks

- Citus learning curve for ORM (Drizzle distributed-table support — verify before M2)
- 10K+ tenant scale unverified pre-prod; Citus shard count locked at table creation (re-shard requires plan)
- GDPR backup exemption legal interpretation per-jurisdiction; revisit if expanding beyond US/EU

## Implementation

- `RESOLUTION-MAP.md` updated: STILL-OPEN count 10 → 0
- 8 affected ADRs (0099, 0100, 0101, 0102, 0103, 0107, 0121) get DA13 amendment banners
- [[curaos-postgres-rule]] rewritten w/ Citus + SeaweedFS
- Codegen Engine recipes (per ADR-0123) updated for Citus distributed-table provisioning
- Pre-M2: verify Drizzle Citus support; pre-M11: re-eval OpenSearch for HealthStack FHIR search

## References

- [RESOLUTION-MAP.md](RESOLUTION-MAP.md)
- [[curaos-postgres-rule]]
- [[curaos-bun-primary-rule]]
- [[curaos-speed-patterns-rule]]
- [[curaos-orchestration-rule]]
- [[curaos-airgap-rule]]
- [[curaos-local-vs-3rdparty-rule]]
- [[curaos-version-pinning-rule]]
- ADR-0099 (charter)
- ADR-0100 (foundation runtime)
- ADR-0101 (data layer)
- ADR-0102 (event messaging)
- ADR-0103 (API surface)
- ADR-0107 (observability)
- ADR-0121 (builder)
- ADR-0150 (baseline alignment)
- ADR-0151 (cross-cluster coherence)
- ADR-0157 (HAPI FHIR PHI audit)
- ADR-0162 (HIPAA roadmap)
