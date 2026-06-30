---
adr-id: 0210
title: M9 Diamond model — Party / Org / Identity as peers of actors root
status: Accepted
date: 2026-05-27
supersedes: []
superseded-by: null
tags: [identity, party, org, audit, schema, m9, foundation]
parent-adrs: [0099, 0120, 0200]
amends: [0200]
spike: ai/curaos/docs/research/m9-s1-diamond-model-spike.md
issue: your-org/curaos-ai-workspace#98
---

# ADR-0210 — M9 Diamond Model: Party / Org / Identity as peers of `actors` root

## Context

M9 ("Identity / Party / Org / Audit generated cluster") regenerates the M3 hand-rolled `identity-service` and adds three new neutral services: `party-core-service`, `org-core-service`, `audit-core-service`. Before any code lands, the cluster must lock the FK ordering between Party, Org, and Identity. The wrong choice forces every downstream service to inherit reverse coupling, dummy rows, or broken multi-org semantics.

Research [`m9-identity-cluster-design.md` §D2](../research/m9-identity-cluster-design.md#d2--party-org-identity-fk-ordering-cluster-root-question) walked four candidate models against five real cases: cross-tenant practitioners (FHIR `PractitionerRole`), HIPAA Business Associate agreements (org ↔ org), system actors (BPM workers, codegen jobs), service accounts (org-scoped, no human party), and audit / RBAC subject uniformity.

Spike work [`m9-s1-diamond-model-spike.md`](../research/m9-s1-diamond-model-spike.md) turned §D2 into concrete SQL DDL + Drizzle sketch + M3-to-M9 migration mapping. This ADR records the locked decision.

## Decision

**M9 adopts the Diamond model.** Four root tables — `actors`, `parties`, `orgs`, `identities` — are peers in a **diamond** shape: no table is root of the others; each peer carries an inward FK to a shared `actors` UUID, which acts as the apex/root reference (vs a **star schema** where a single fact table would carry outward FKs to multiple dimensions, or a **nested hierarchy** where one peer would chain through another). The shared `actors` UUID is the unified reference column for audit, RBAC, and event-sourcing. Cross-entity relationships live in the join table `actor_memberships`.

FK directions are **inward toward `actors`** for every peer table:

- `parties.actor_id → actors.id` (UNIQUE; 1:1)
- `orgs.actor_id → actors.id` (UNIQUE; 1:1)
- `identities.actor_id → actors.id` (UNIQUE; 1:1)
- `actor_memberships.actor_id → actors.id` (N:M with `org_id`)
- `actor_memberships.org_id → orgs.id` (N:M with `actor_id`)
- `orgs.parent_org_id → orgs.id` (self-referential org hierarchy; nullable = root)

`actors` references **nothing** from the peer tables. The `actor_type` column (`'human' | 'org' | 'system' | 'service_account'`) tags which peer tables a given actor row participates in.

`actor_memberships` carries:

- `actor_id`, `org_id` (FKs)
- `membership_type` (`'practitioner' | 'staff' | 'service_account' | 'business_associate'`)
- `role` (RBAC role name; the RBAC service interprets)
- `valid_from`, `valid_until` (time-windowed memberships)
- ~~`UNIQUE(actor_id, org_id, membership_type)` so a single practitioner / staff / service-account / BA pairing appears once per org~~

> **Resolution note ([#192](https://github.com/your-org/curaos-ai-workspace/issues/192), 2026-06-03):** the `UNIQUE(actor_id, org_id, membership_type)` constraint above (and §S4 below) is **relaxed to a NON-unique lookup index** `actor_memberships_actor_org_type_idx`. The original UNIQUE silently collapsed a user's N same-membership-type roles into one row. `actor_memberships` is the **temporal role-history table**: a user holding N distinct roles in one org has N rows here, each with its own `valid_from`/`valid_until` window; the CURRENT roles are the rows where `valid_until IS NULL`. Row-level uniqueness stays with the composite PK `(actor_id, org_id, role, valid_from)`. NO role-set array, NO role precedence (Option B rejected). Forward migration `0009_actor_memberships_multi_role.sql`; binding user decision per [[curaos-rolling-update-rule]].

Full SQL DDL + Drizzle sketch + index plan: [§3 of the spike](../research/m9-s1-diamond-model-spike.md#3-decision--diamond-model-pinned-by-d2).

## Service ownership

- **identity-service** owns `actors` + `identities`. It is the only writer of `actors`.
- **party-core-service** owns `parties` (NestJS module in modulith mode; standalone service when extracted).
- **org-core-service** owns `orgs` + `actor_memberships` (same modulith/standalone duality).
- **audit-core-service** consumes `actor_id` from every event header — it never writes to any peer table.

## DB topology decision

**M9 modulith baseline: Option A — single shared DB schema `identity_core`, owned by `identity-service`, where ALL five Diamond tables (`actors`, `parties`, `orgs`, `identities`, `actor_memberships`) reside.** This satisfies [[curaos-modulith-standalone-rule]]: services run as NestJS modules inside the modulith container, sharing one `identity_core` schema so all Postgres FKs (`parties.actor_id`, `orgs.actor_id`, `identities.actor_id`, `actor_memberships.actor_id`, `actor_memberships.org_id`) are enforced at the DB level, in the same connection scope, with cascades and `ON DELETE RESTRICT` working as written.

In modulith mode:

- `party-core-service` and `org-core-service` are NestJS modules (`PartyModule`, `OrgModule`) inside the identity-service modulith container. They **READ** from the shared `identity_core` schema via Drizzle and **WRITE** via service-layer APIs exposed by sibling modules. They do **not** own separate DB schemas.
- All five tables ship as Drizzle schema files in `curaos/backend/services/identity-service/src/db/identity-schema.ts` (the only writer of DDL).
- Shared TypeScript types (Drizzle relations + Zod inferred schemas) ship from a published library `@curaos/identity-schema` so downstream services (audit, RBAC, HealthStack overlays) can import the types without owning the tables.

**Standalone deployment future:** when a service extracts to its own deployment + DB (per [[curaos-modulith-standalone-rule]] dual-mode pattern), the Postgres FK becomes **application-layer enforced** via:

- Outbox + idempotent event consumers between identity-service ↔ party-core-service ↔ org-core-service.
- DB-level FK clauses removed from the standalone schema migration; replaced by `actor_id UUID NOT NULL` (no `REFERENCES`).
- Reconciliation job (see §"Consistency mechanism" below) detects orphan rows across service schemas.

The extracted-mode trade-off is documented; the modulith default keeps DB-level integrity until a service has earned the right to extract.

Cross-module writes within the modulith happen synchronously within a single DB transaction (e.g. `IdentityModule.createHuman()` writes `actors` + delegates to `PartyModule.createParty()` in the same `BEGIN..COMMIT` block). The Kafka `ActorCreated` event still emits via outbox for downstream consumers (audit-core-service, RBAC, HealthStack overlays) per [`m9-identity-cluster-design.md` §D4 choreography](../research/m9-identity-cluster-design.md#d4--cross-service-event-chain-pattern), but is **not** the primary write path between Diamond peers in modulith mode.

## Alternatives Considered

[§4 of the spike](../research/m9-s1-diamond-model-spike.md#4-comparison-vs-nested-hierarchy-alternative) compares Diamond against three nested hierarchies. Summary:

| Model              | Verdict   | Reason rejected                                                                                              |
|--------------------|-----------|--------------------------------------------------------------------------------------------------------------|
| **A. Party root**  | Rejected  | System / service actors need dummy `parties` rows → HIPAA / GDPR subject-erasure ambiguity                   |
| **B. Org root**    | Rejected  | Cross-tenant practitioners broken by construction; violates §3 charter "generic before vertical"             |
| **C. Identity root** | Rejected | Demographics (PHI) ends up FK-dependent on auth credentials — couples PHI to auth domain                     |
| **D. Diamond**     | **Chosen** | Native fit for all five real cases; zero reverse coupling; extensible via new `actor_type` value             |

## Consequences

### Positive

- **Single audit / RBAC subject column (`actor_id`).** Every event header, every policy rule, every causation chain references one UUID. The downstream services do not need to know whether the subject is human / org / system / service.
- **Adding a fifth actor kind costs ~5 SQL lines.** New row in CHECK constraint + new peer table pointing at `actors`. No schema change in `actors` itself. Examples that may arrive in later milestones: `agent_bot` (AI orchestration), `device` (HealthStack medical device authoring an event).
- **HIPAA BAA modelled natively.** A BAA is an `actor_memberships` row with `membership_type='business_associate'` linking two org actors. No special table.
- **Cross-tenant practitioners are N:M-native.** One `parties` row, N `actor_memberships` rows, one per org. Direct FHIR `PractitionerRole` mapping.
- **No dummy / synthetic rows.** Auditors and PHI workflows never trip over "users that aren't actually users".
- **Generic-before-vertical preserved.** `actors` is the neutral primitive; `parties` / `orgs` / `identities` are neutral peers; HealthStack overlays attach via FK to `party_id` without coupling to auth.

### Negative

- **Joins cost more than nested-hierarchy on common queries** (e.g. "get user's primary org" is `actors JOIN actor_memberships JOIN orgs`). Mitigation: materialised view `actor_primary_org(actor_id, org_id, role)` refreshed on `actor_memberships` writes; index on `(actor_id, membership_type)`. Materialised-view freshness SLA tuned at M14.
- **Five tables to scaffold instead of one.** Codegen recipe handles this uniformly; per-service AGENTS.md frontmatter records the ownership.
- **Migration from M3 hand-rolled schema is non-trivial.** Mitigated by Strangler Fig (Shadow + Cutover + Delete Old) per [`m9-identity-cluster-design.md` §D1](../research/m9-identity-cluster-design.md#d1--migration-strategy-hand-rolled--generated-identity-service). Mapping table + cutover sequence: [spike §5](../research/m9-s1-diamond-model-spike.md#5-migration-path--m3-hand-rolled--m9-diamond).

### Neutral

- ORM choice: Drizzle (per [[curaos-orm-rule]]) for all five tables. None of identity / party / org / audit / actor_memberships sits on the MikroORM clinical-aggregate allowlist (which is Patient / Encounter / Order / Notes / CarePlan / Problem / Med / Lab / Imaging only).
- Per-tenant schema isolation per [[curaos-postgres-rule]] continues to apply — the five tables live inside `tenant_<uuid>` schemas; `actors.tenant_id` (and now also `parties.tenant_id`, `orgs.tenant_id`, `identities.tenant_id` — see §"Tenant isolation") provides defence-in-depth for cross-tenant query guards in Citus shared-shard topologies.
- `actor_memberships.role` is a **free-text** column. No FK to a roles table, no local CHECK constraint on the value. The RBAC service is the canonical interpreter of `role` strings; the Diamond schema deliberately carries no role-name validation so the RBAC vocabulary can evolve without schema migrations. M9-S4 developers MUST NOT add a CHECK on `role` — doing so will conflict with the RBAC service's role registry.

## Tenant isolation

All four peer tables carry `tenant_id UUID NOT NULL REFERENCES tenants(id)` (defense-in-depth, consistent with `actors.tenant_id`). This unblocks Citus shared-schema sharded-by-`tenant_id` deployments per [[curaos-postgres-rule]] §Citus topology, where rows from many tenants share one physical schema and `tenant_id` is the distribution key.

Per-tenant uniqueness:

- `UNIQUE (tenant_id, email)` on `identities` — same email address may exist in different tenants without collision; required for Citus.
- `UNIQUE (tenant_id, external_subject, issuer)` on `identities` — deferred to M9-S5 once `issuer` column lands (federation IdP design).
- `UNIQUE (tenant_id, name)` on `orgs` is **not** added at M9 — org name collisions inside a tenant are allowed (different facilities can share a name in different departments); enforcement deferred to M11 if a real conflict surfaces.

The `actors`/`parties`/`orgs`/`identities` `tenant_id` columns are denormalized for query-plan reasons (avoid every Citus query carrying a 4-table JOIN to `actors` for the distribution key). In modulith mode (Option A), a CHECK constraint or DB trigger MAY be added later to enforce that the denormalized `tenant_id` matches `actors.tenant_id`; M9 baseline leaves this as application-layer-asserted invariant.

## Consistency mechanism

Diamond peers are FK-mandatory toward `actors` (peer → actors), but `actors` does **not** reference its peers. Consequently, a partial-write failure could leave an orphan `actors` row with `actor_type='human'` but no matching `parties` row (or `actor_type='org'` without `orgs`, etc).

Resolution per deployment mode:

- **Modulith (Option A; M9 baseline):** transactional INSERT of `actors` + peer row in the **same DB transaction** prevents orphans. `IdentityModule.createHuman(input)` opens a transaction, INSERTs `actors`, INSERTs `parties` (via `PartyModule.createParty(actorId, …)` invoked synchronously), COMMITs. Either both rows land or neither does. No outbox-based reconciliation needed.
- **Standalone (post-extraction):** outbox + idempotent consumers + dead-letter queue + a reconciliation job. The reconciliation job runs every 5 minutes and alerts on any `actors` row older than 5 minutes whose `actor_type` does not match an existing peer row (`actor_type='human'` without `parties`, `actor_type='org'` without `orgs`, etc). Alert routes to ops via the standard Pyrra SLO breach pipeline ([[curaos-slo-rule]]).

## FHIR overlay mapping

The Diamond model is HealthStack-overlay-ready. Mapping of the relevant FHIR resources:

- **`Practitioner`** → `actors` row (`actor_type='human'`) + `parties` row (demographics, PHI).
- **`PractitionerRole`** → `actor_memberships` row (`membership_type='practitioner'`, `org_id` = facility, `role` = clinical role string interpreted by RBAC).
- **`Organization`** → `actors` row (`actor_type='org'`) + `orgs` row (`org_type` ∈ {facility, department, business_associate, external_business_associate}).
- **`Patient`** → `actors` row (`actor_type='human'`) + `parties` row (demographics, PHI). **Patient does NOT participate in `actor_memberships`** — patients are not members of orgs in the FHIR sense. Clinical encounters link patient ↔ org via `Encounter.serviceProvider`, which is a HealthStack overlay table (NOT part of the Diamond) and lives in the HealthStack patient overlay service. HealthStack overlays attach via FK to `party_id` for PHI continuity per the PHI boundary rule.
- **`RelatedPerson`** (family member, guardian) → `actors` (`actor_type='human'`) + `parties`; relationship to patient lives in a HealthStack overlay table.
- **`Device`** (medical device authoring an event) → future `actor_type='device'` value; not in M9 scope.

## ID generation strategy

All five tables carry primary key `id UUID` with two layers of generation:

- **Application layer (primary):** Drizzle generates UUID v7 via `$defaultFn(() => uuidv7())` from the shared `@curaos/uuid-v7` package before INSERT. UUID v7 is **time-ordered** and required for the M9 audit chain's causation-event ordering guarantees (per [`m9-identity-cluster-design.md` §D3](../research/m9-identity-cluster-design.md)).
- **DB layer (fallback only):** `DEFAULT gen_random_uuid()` (UUID v4) in the SQL DDL is a **safety net** for any path that bypasses Drizzle (e.g. raw SQL migrations, ops-tool direct INSERTs). It is NOT the canonical path. Codegen templates **MUST** wire `$defaultFn(() => uuidv7())` on every PK column for all five tables.

This dual-layer is documented to prevent M9-S2 reviewers from removing the DB default (which would break the safety net) or removing the application-layer override (which would silently produce v4 PKs that break audit ordering).

## Deletion strategy

All four peer tables (`actors`, `parties`, `orgs`, `identities`) gain a `deleted_at TIMESTAMPTZ` soft-delete column. `actor_memberships` deletion semantics deferred to M9-S4 (see Open Questions).

Soft-delete is the default path for routine deletion (user offboarding, org decommissioning). Queries filter `WHERE deleted_at IS NULL` by default; the Drizzle repository layer encodes this.

Hard-delete is reserved exclusively for **GDPR Article 17 subject erasure requests** per [[curaos-postgres-rule]] §GDPR erasure. The erasure path:

1. Audit log records the erasure request (immutable; predates erasure).
2. Physical DELETE removes `parties` row (PHI) and `identities` row (auth subject).
3. `actors` row is **pseudonymized** (set `actor_type='erased'`, NULL out `tenant_id` if scope permits, keep the UUID so audit chains stay valid) rather than hard-deleted, because every historical audit event references it. This pseudonymization is the documented compromise per HIPAA 45 CFR § 164.316(b)(2)(i) 6-year audit retention and GDPR Art 17(3)(b) public-interest exemption.

The `actor_type='erased'` value extends the existing CHECK constraint at M9-S10 (cutover Story) when the erasure path lands; M9-S2 ships the soft-delete column only.

## Implementation Plan (informational, not binding)

> **Resolution-pin (2026-05-28)**: the original S2 + S10 rows below specified Strangler Fig with a separate `identity-service-v2` submodule and an archived-v1 cutover. That rollout shape is **rolled back** per [[curaos-rolling-update-rule]]. The Diamond schema decision in §"Decision" stands unchanged; only the rollout sequence changes. The new rollout: forward-migrate the existing `identity-service` to add `actors` + `identities` + `actor_memberships` alongside `users` + `credentials` + `roles` + `user_roles` (M3 shape); backfill v1 rows into the new shape; cut reads + writes behind a feature flag; drop the M3 tables in a later forward migration when telemetry confirms zero traffic. No parallel `-v2` paths. The `your-org/identity-service-v2` repo is archived; PRs #1 / #97 / #148 are closed; curaos PR #98 removed the bootstrap submodule.

This ADR pins the schema shape. Implementation lands across M9 Stories:

| Story | Owner                 | Scope                                                                                          |
|-------|-----------------------|------------------------------------------------------------------------------------------------|
| S2 (#99) | identity-service | Forward migration on the existing `backend/services/identity-service` submodule that adds Drizzle schema + repository for `actors` + `identities` + `actor_memberships` (modulith mode per §"DB topology decision") alongside the existing M3 tables. Stand up on staging DB. Leave `external_subject` WITHOUT a uniqueness constraint at M9-S2 — the `UNIQUE(tenant_id, external_subject, issuer)` constraint lands in M9-S5 once `issuer` column ships (federation IdP design). Rolling-update shape per [[curaos-rolling-update-rule]] — no `identity-service-v2` submodule. |
| S3   | party-core-service    | NestJS module exposing `PartyModule` writes. Reacts to in-process `ActorCreated` calls in modulith mode; reacts to Kafka `ActorCreated` events in standalone mode. Already merged (M9-S3 closed). |
| S4   | org-core-service      | NestJS module exposing `OrgModule` writes. Owns `orgs` + `actor_memberships` write paths. BAA membership type lands here. **UPDATE on `actor_memberships.role` MUST emit `MembershipRoleChanged` event via the org-core-service outbox** for audit chain integrity. The schema-level index on `(actor_id, org_id, membership_type)` is NON-unique (relaxed from UNIQUE by [#192](https://github.com/your-org/curaos-ai-workspace/issues/192) — see the resolution note in §Decision; multi-role / temporal role-history, row uniqueness via composite PK `(actor_id, org_id, role, valid_from)`); `role` is mutable and every mutation is audited. Already merged (M9-S4 closed). |
| S5   | audit-core-service    | Scaffold via M6 codegen. Consumes `actor_id` headers. Hot Kafka topic + cold SeaweedFS S3 archive. Adds `UNIQUE (tenant_id, external_subject, issuer)` to `identities` here once federation IdP design pins the `issuer` column shape. |
| S8   | identity-service      | Materialised view `actor_primary_org(actor_id, org_id, role)` lands here with the M9 freshness target: **acceptable up to 5s stale at M9** (refreshed on `actor_memberships` write + on a 5s timer). Tighter SLA (< 1s) deferred to M14 once production traffic shape is known. Index on `(actor_id, membership_type)` ships in S2 alongside the table DDL. |
| S10  | identity-service      | **Drop M3 tables once telemetry confirms zero traffic.** No archive-and-cutover step; a forward migration removes `users` + `credentials` + `roles` + `user_roles` after consumers have migrated to the `actors` + `identities` + `actor_memberships` surface behind the feature flag. M3 users default-classified as `membership_type='staff'` in the backfill; clinician/practitioner re-classification deferred to M11 based on M3 role-name pattern matching. **Replaces the original Strangler Fig + archived-v1 plan** (rolled back 2026-05-28 per [[curaos-rolling-update-rule]]). |
| S11  | tools/codegen         | Generator-evolution: fold any edge cases discovered in S2-S5 back into codegen templates.       |

## Open Questions

None blocking. Items deferred to milestones:

- **Materialised view freshness SLA** for `actor_primary_org` → M9 acceptable-staleness target: **5s** (refreshed on write + 5s timer); tighter SLA (< 1s) DEFERRED-MILESTONE M14 once production traffic shape is known.
- **`external_subject` UNIQUE scope** (`UNIQUE(tenant_id, external_subject, issuer)`) → DEFERRED-MILESTONE M9-S5 (depends on federation IdP design / `issuer` column shape). M9-S2 ships `identities` WITHOUT any uniqueness on `external_subject`.
- **Soft-delete vs hard-delete on ALL Diamond tables** (`actors`, `parties`, `orgs`, `identities`, `actor_memberships`) → see §"Deletion strategy" above for `actors`/`parties`/`orgs`/`identities` (soft-delete via `deleted_at`; hard-delete reserved for GDPR Art 17). `actor_memberships` deletion semantics specifically (soft-delete via `valid_until` vs `deleted_at` column) → DEFERRED-MILESTONE M9-S4 when `org-core-service` lands.
- **M3 user → membership-type re-classification** (default `staff`; clinicians need `practitioner`) → DEFERRED-MILESTONE M9-S10 follow-up or M11, gated on M3 role-name pattern analysis.

## References

- Spike: [`ai/curaos/docs/research/m9-s1-diamond-model-spike.md`](../research/m9-s1-diamond-model-spike.md)
- Research: [`m9-identity-cluster-design.md` §D2](../research/m9-identity-cluster-design.md#d2--party-org-identity-fk-ordering-cluster-root-question)
- Parent ADR: [`0200-cluster-identity-party-org-audit.md`](0200-cluster-identity-party-org-audit.md)
- Charter: [`0099-charter-priorities-vision.md`](0099-charter-priorities-vision.md)
- Foundation auth: [`0120-foundation-auth.md`](0120-foundation-auth.md)
- Rules: [`curaos_orm_rule.md`](../../../rules/curaos_orm_rule.md), [`curaos_postgres_rule.md`](../../../rules/curaos_postgres_rule.md), [`curaos_repo_boundary_rule.md`](../../../rules/curaos_repo_boundary_rule.md)
- FHIR PractitionerRole: <https://build.fhir.org/practitionerrole.html>
- Auth0 Organizations: <https://auth0.com/docs/manage-users/organizations>
- AWS Cognito multi-tenant: <https://docs.aws.amazon.com/cognito/latest/developerguide/multi-tenant-application-best-practices.html>
- SCIM 2.0 RFC 7643: <https://datatracker.ietf.org/doc/html/rfc7643>
