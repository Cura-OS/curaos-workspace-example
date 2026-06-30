# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: issue-356-identity-current-roles-pr84

## Native same-harness fallback (2026-06-05)

GRILL: same-harness-fallback
VERDICT: pass-with-caveat

This section does not satisfy the opposite-harness Tier-2 requirement. It records
the native fallback used to continue after workflow defect #495.

Reviewed PR: `your-org/identity-service#84`
Workflow defect: `your-org/curaos-ai-workspace#495`

Adversarial checks:

- Stale projection risk: the first PR version used `CREATE MATERIALIZED VIEW`
  without any `REFRESH MATERIALIZED VIEW` trigger/job. CodeRabbit flagged this
  correctly. The PR now uses `CREATE OR REPLACE VIEW`, so current-role reads stay
  live from `actor_memberships`.
- Cardinality risk: the view selects `actor_id, org_id, role` directly from
  `actor_memberships` with `WHERE valid_until IS NULL` and no `DISTINCT`,
  `GROUP BY`, array aggregation, row ranking, min/max, or role precedence.
- Expiry risk: expired temporal rows are excluded by the `valid_until IS NULL`
  predicate.
- DDL drift risk: `src/identity-core/db/migrations.ts`,
  `drizzle/migrations/0010_actor_primary_org_current_roles.sql`, and
  `test/identity-core/schema.test.ts` all now assert the plain-view contract.
- Docs drift risk: workspace docs/research PR #491 was updated to recommend the
  plain-view path, not the stale materialized-view path.

Verification evidence:

- `bun test test/identity-core/schema.test.ts`: 22 pass, 0 fail, 93 expect calls.
- `bun run ci`: 513 pass, 42 skip, 0 fail, 1448 expect calls; Playwright 3 pass;
  staging-divergence script PASS; `tsc` completed.
- CodeRabbit check on PR #84: SUCCESS, zero unresolved review threads after
  commit `57e3071`.

Caveat:

The committed opposite-harness workflow still produced `workflow_defect:true`
because `claude-rescue` returned `pass` with empty `report_path`. That defect is
tracked in #495 and this fallback must not be counted as a completed
opposite-harness grill.
