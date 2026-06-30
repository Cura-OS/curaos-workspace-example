# Grill — org-core-service#225 migration apply-path (PR #5)

> Cross-harness adversarial grill (Claude orchestrator → Codex rescue) for the
> M9 org-core-service#225 fix: journal the raw SQL migrations so the shared
> journal-driven deploy migrator actually applies them (apply-path gap →
> silent loss of the `orgs_outbox_insert_notify` trigger on a fresh deploy).
> Migration/deploy change = high-blast-radius → grill MANDATORY pre-merge per
> orchestration §3.7.

- PR: https://github.com/your-org/org-core-service/pull/5
- Branch: `agent/fix-migration-apply-path-225`
- Commits grilled: `eae7e75` (fix) + `a8ba337` (P2 follow-up guard)
- Reviewer: Codex `gpt-5.1-codex`, reasoning effort `high`, `--sandbox read-only`
- Tracker issue: `your-org/curaos-ai-workspace#225`

## Verdict

**No P0 / P1 — no merge blocker.** The four high-risk invariants (idempotency,
journal-shape, gitignore-negation, statement-breakpoint placement) were all
explicitly ACCEPTED by the reviewer. One P2 (destructive-test safety) was raised
with a recommended answer and **fixed in this PR** (`a8ba337`), per the
recommendation-auto-apply rule.

## P0 findings (block merge)

None.

## P1 findings (should fix)

None.

## P2 findings (followups acceptable) — FIXED IN PR

1. **Destructive real-PG test could wipe a misconfigured live DB** — REAL, fixed.
   - **Where:** `test/migration-apply-path.test.ts` (real-Postgres `beforeAll`/`afterAll`).
   - **What:** the fresh-slate layer `DROP SCHEMA org_core/drizzle CASCADE` on
     whatever DSN `CURAOS_ORG_CORE_DATABASE_URL` supplies, gated only on the env
     var's presence. A misconfigured CI/local env pointing it at a live DB would
     wipe service data + the migration ledger.
   - **Fix (this PR, `a8ba337`):** added `assertDisposableDsn()` — the destructive
     layer now refuses to run (throws LOUD in `beforeAll`, **before any connection
     or DROP**) unless the DSN targets a local host (`localhost`/`127.0.0.1`/`::1`/
     `host.docker.internal`) AND a throwaway DB name (`postgres` or `*_test`/`*_ci`/
     `*_tmp`/`*_throwaway`/`*_scratch`). Verified: a `prod-db.internal/org_core_production`
     DSN throws and fails closed; the `localhost/postgres` throwaway still passes
     all 10 live tests; the no-Postgres journal guard is unaffected.

## P3 findings (nits) — all ACCEPT, no change recommended

1. **Idempotency / re-apply — VERDICT: ACCEPT.** Re-run after an out-of-band
   deploy is safe + non-destructive: `0001` uses `IF NOT EXISTS` for schema/
   tables/indexes and guards the cross-schema FK add inside the DO-block;
   `0002` uses `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` +
   `CREATE TRIGGER`. Because the journal was empty before, existing DBs have an
   empty `__drizzle_migrations` → `migrate()` re-runs both files, which is a
   no-op on already-applied objects. No migration change.
2. **Journal shape — VERDICT: ACCEPT.** Local `drizzle-orm@0.45.2`
   `readMigrationFiles()` reads `entries` in array order and uses `tag` /
   `breakpoints` / `when`; the manifest applies `0001_init` then
   `0002_outbox_publisher` on a fresh DB. No journal-shape change.
3. **gitignore negation — VERDICT: ACCEPT.** `meta/*` ignores children but not
   the directory, and `!drizzle/migrations/meta/_journal.json` un-ignores the
   journal; `git ls-files` shows it tracked. No change.
4. **statement-breakpoint placement — VERDICT: ACCEPT.** The added markers sit
   outside the DO/function dollar-quoted bodies; Drizzle splits on the marker
   string and does not split inside those blocks. No change.

## Orchestrator verification

- Codex ran live (session `019e839c-…`), 78,981 tokens, read-only — verdict above
  is Codex's own output, not a confabulation. It independently re-ran
  `bun test test/migration-apply-path.test.ts` (6 pass / 4 skip / 0 fail) during
  the grill.
- P2 fix re-verified by the orchestrator: full service `bun run ci` green
  (97 pass / 0 fail with live PG; 93 pass / 4 skip / 0 fail no-DSN), forward-only
  policy PASS, ci-gates-sync 9/9 in sync, depcruise 0 errors, doc-graph ok.

## Re-grill verification

Not required — initial grill returned no P0/P1; the single P2 was fixed in-PR and
re-verified green. No fix-cycle needed beyond the P2 guard.
