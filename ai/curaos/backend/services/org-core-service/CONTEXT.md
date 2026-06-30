# org-core-service — Context

## Integration map

- **Produces events** to Redpanda topics:
  - `curaos.core.org.{registered,updated,deleted}.v1`
  - `curaos.core.org-membership.{granted,extended,revoked}.v1`
  - `curaos.audit.org.v1` (hash-chained audit envelope)
- **Consumes** auth-sdk JWT verification + principal extraction.
- **Cross-schema FK** to `identity_core.actors(id)` (conditional gate in migration: checks `information_schema.tables` before adding constraint).

## Migration apply path

- Raw SQL migrations live under `drizzle/migrations/` (`0001_init.sql` = pure table/index DDL; `0002_outbox_publisher.sql` = the `orgs_outbox_insert_notify` LISTEN/NOTIFY trigger + function). Per the table-only-init convention the trigger is split into `0002`.
- **Apply path = journal-driven** (org-core-service#225): both files are registered in `drizzle/migrations/meta/_journal.json`, so the shared migrator (`curaos/ops/migrations/run-migrations.ts` → drizzle-orm `migrate(db, { migrationsFolder })`, baked into the migration-runner image and overlaid per service) applies BOTH on a fresh deploy, in order. Statements carry `--> statement-breakpoint` separators so each runs cleanly.
- **Regression guard:** `test/migration-apply-path.test.ts` fails CLOSED if any `.sql` file is not journaled (the exact #225 silent-trigger-loss regression — empty journal ⇒ `migrate()` no-op ⇒ deploy stands up a DB with no trigger and degrades to slow polling). A gated real-Postgres layer (`CURAOS_ORG_CORE_DATABASE_URL`) proves the trigger + all five tables exist post-`migrate()` and that an `orgs_outbox` INSERT fires the NOTIFY.
- **Template-class root cause is separate:** the codegen mold ships hand-authored SQL with an unjournaled `_journal.json` — owned by codegen issue #235 (M10). This fix is the org-core-service-local journal backfill; it does NOT touch the generator.

## Stack

Bun + Hono + Drizzle + Citus PG 17 per workspace rules.

## REST surface

| Method | Path | Auth | RBAC |
|---|---|---|---|
| POST | /orgs | Bearer + principal | tenant-admin |
| GET | /orgs/{id} | Bearer + principal | any |
| PATCH | /orgs/{id} | Bearer + principal | tenant-admin |
| DELETE | /orgs/{id} | Bearer + principal | tenant-admin (soft-delete) |
| GET | /orgs | Bearer + principal | any (scoped to principal.tenantId) |
| POST | /orgs/{id}/members | Bearer + Idempotency-Key | org owner/admin |
| GET | /orgs/{id}/members | Bearer | any org member |
| PATCH | /orgs/{id}/members/{actorId}/{role} | Bearer | org owner/admin |
| DELETE | /orgs/{id}/members/{actorId}/{role} | Bearer | org owner/admin (sets valid_to=now()) |

## Decisions

- 1:1 inward FK (NOT N:M join in party-core) per ADR-0210 §"N:M routes to actor_memberships in org-core".
- Audit chain head keyed `(tenant_id, resource_type, resource_id)` so Org + OrgMembership events sharing same id do not collide.
- Membership soft-delete sets `valid_to=now()`; rows are time-versioned (composite PK includes `valid_from`).
- Cross-tenant leak protection: `ListOrgsQuerySchema` strict (rejects `?tenantId=`); `OrgsService.list()` uses `principal.tenantId` only.

## Follow-ups

- org-core-service#225 — **RESOLVED:** journal both migrations so the deploy migrator actually applies them (apply-path gap; trigger no longer silently lost on a fresh deploy). See "Migration apply path" above.
- org-core-service#2 — move trigger DDL out of `0001_init.sql` per codex P2 finding.
- Workspace #132 — codegen emits `Dockerfile` per trio member (blocked on codegen `Dockerfile.hbs` lane).
- 20 oxlint warnings (no-extraneous-class, no-array-sort, no-await-in-loop, no-console in test debug) — style cleanup, not merge blockers.

## References

- [ADR-0210](../../../docs/adr/0210-m9-diamond-model-party-org-identity.md) — Diamond model: party/org/identity binding decision
- [Requirements.md](Requirements.md) — service charter + spec
- [AGENTS.md](AGENTS.md) — module agent contract
- [[curaos-postgres-rule]] — DB-per-tenant for PHI + CNPG
- [[curaos-generator-evolution-rule]] — codegen evolution policy
