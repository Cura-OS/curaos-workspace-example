# Grill — #192 Multi-role / role-history in Diamond `actor_memberships` (planning)

- Issue: [your-org/curaos-ai-workspace#192](https://github.com/your-org/curaos-ai-workspace/issues/192)
- Module: identity-service
- Reviewer: Codex (opposite-harness, default model, `model_reasoning_effort=high`, `--sandbox read-only`)
- Verdict: APPROVE-WITH-NOTES. No critical user-escalation flags. All decision points carry recommendations grounded in docs/code → auto-applied per [[curaos-recommendation-auto-apply-rule]].
- Binding user decision (2026-06-03): temporal role-history shape (valid-from / valid-to). NOT role-set array, NOT role precedence.

## Verdict summary

`actor_memberships` IS the temporal role-history table already — composite PK `(actor_id, org_id, role, valid_from)` + `valid_until` window. The ONLY blocker to multi-role is the `UNIQUE(actor_id, org_id, membership_type)` index (`actor_memberships_actor_org_type_unique`), which forces one membership-type pairing per (actor, org) and collapses N same-type roles. Relax = drop the unique index, replace with a NON-unique index of the same columns for org-side lookups; PK keeps row-level uniqueness. No new table, no `-v2`, forward-only.

## Auto-applied decisions (recommendation source cited)

| Decision | Answer | Source |
|---|---|---|
| Drop unique index? | Yes | prior grill `m9-s2-phase-b-pr36.md:35-38` (silent collapse); org-core already uses PK tuple w/o type-uniqueness `org-core-service/src/db/schema.ts:122-172` |
| Non-unique index name | `actor_memberships_actor_org_type_idx` (drop `_unique`) | naming hygiene |
| Backfill conflict target | PK tuple `(actor_id, org_id, role, valid_from)` | schema.ts:227-230, migrations.ts:186 |
| Multi-role semantics | N roles = N rows; current = `valid_until IS NULL`; no array, no precedence | binding user decision |
| Same-role duplicates | KEEP fail-loud (`assertNoDuplicateRoleRows`) | backfill-diamond.command.ts:1155-1170 |
| Column naming | keep `valid_until`; "valid-to" is the concept not a rename | identity uses `valid_until` (schema.ts:221-222); org-core uses `valid_to` |
| auth-sdk semver bump | No — internal backfill/schema change, no API response-shape change | CONTEXT.md / Requirements.md track SDK version; surface unchanged |
| Boot DDL idempotency | guarded `DO` block: drop only if `pg_index.indisunique=true`, create non-unique if missing — never blind DROP+CREATE every boot on populated tables | migrations.ts:174-200 runs at boot |
| org-core readers | no change needed; readers already array/per-role | `org-core-service/src/memberships/*` |

## Docs conflicts to patch (issue Docs section requires)

- ADR-0210 `:40-47`, `:176` — `UNIQUE(actor_id, org_id, membership_type)` text → add forward-resolution note (#192 relaxed to non-unique).
- Requirements.md `:398` (FR-017), `:457-463` + `:469` (FR-022/FR-023 collapse text) — update to multi-role temporal shape.
- CONTEXT.md `:662-684` — update "collapse" narrative to "N roles = N rows".
- spike `m9-s1-diamond-model-spike.md` — historical research; forward-note pointer only (do not rewrite history).

## Tests to invert / update

- `backfill-diamond.command.test.ts:299-306` — multi-role rejection → multi-role SUCCESS (2 distinct roles → 2 rows). Keep dup-same-role rejection `:309-322`.
- `backfill-diamond.command.test.ts:442-451` — `memberships dedupe by actor org membership type` → dedupe by PK tuple.
- `schema.test.ts:166-170` — assert non-unique index DDL shape (not `_unique`).
- `backfill-diamond.postgres.test.ts:385-394` — temp table drops obsolete `UNIQUE (actor_id, org_id, membership_type)`; add a multi-role live-backfill test.

## Readers verified NOT broken

- `audit-normalizers.ts:26-36,151-164,226-264` — set-token comparison, unaffected.
- `admin.controller.ts:56-71,149-185,188-226` — audit-only, never writes `actor_memberships`.

## Foresight (out of scope, surfaced not done)

- `actor_primary_org` materialised view (ADR `:101,:178,:186`; spike `:359`) has NO implementation yet. With no precedence, a future view must emit one row per current role or be respecified — must NOT pick a "primary role" (violates no-precedence decision). Surface as FORESIGHT, do not implement here.
