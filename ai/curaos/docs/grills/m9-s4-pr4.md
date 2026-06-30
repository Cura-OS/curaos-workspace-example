# Codex grill — m9-s4-followup PR org-core-service#4

> Cross-harness adversarial migration grill (Claude orchestrator → Codex rescue) for the
> M9-S4 P2 follow-up: split the LISTEN/NOTIFY outbox trigger DDL out of `0001_init.sql`
> into `0002_outbox_publisher.sql`. Issue: org-core-service#2 (parent M9-S4 #101, closed).
> DB migration = high-blast-radius → grill MANDATORY pre-merge per orchestration §3.7.

- PR: https://github.com/your-org/org-core-service/pull/4
- Branch: `agent/m9-s4-followup-trigger-split-claude-88698023`
- Commit grilled: `b7721e9`
- Worktree: `/Users/dev/workspace/curaos-workspace/.worktrees/orgcore2-trigger-split`

## Verdict: APPROVE-WITH-CONDITIONS (no P0/P1) — MERGEABLE

The four high-risk migration invariants all PASS. No merge blocker. Two P2 + one P3 raised;
of those, two are **orchestrator-confirmed false positives** (worktree-environment artifacts /
confabulation — see reality-check), one is a real **pre-existing** apply-path risk filed as a
follow-up (not a regression introduced by this PR).

## P0 findings (block merge)

None.

## P1 findings (must address before merge)

None.

## P2 findings (followups acceptable)

1. **Manual/external migration apply-path → silent-trigger-loss risk on fresh deploy** — REAL, PRE-EXISTING
   - **Where:** `drizzle/migrations/meta/_journal.json` (`{"entries":[]}`)
   - **What:** Nothing in the repo applies these raw SQL files automatically (no `drizzle-kit migrate`
     journal entry, no programmatic migrator, no CI apply step). An operator who applies `0001` on a
     fresh deploy but doesn't know `0002` now exists stands up a DB with all tables/indexes but no
     outbox trigger — and no loud boot failure.
   - **Why not a blocker:** the journal was ALREADY empty for `0001` (it was never journaled either),
     so `0002` is not *newly* orphaned — both share the same manual apply path. The split does not
     introduce the manual-apply weakness; it pre-dates this PR. Codex itself classed this "NOT a new
     regression."
   - **Fix (follow-up):** add a deploy/CI step or a prominent migrations README listing both files +
     required apply order; wire a programmatic journal-driven migrator when one is planned. → filed
     as a `foresight` follow-up issue (apply-path automation for org-core-service migrations).

## P3 findings (nits)

(none stand after reality-check — see below)

## Orchestrator reality-check (two codex findings were FALSE POSITIVES)

The codex grill ran from the isolated worktree, where `bun install` fails the `@curaos/*` private
Verdaccio resolve (401, the known §3.9 worktree limitation). That environment produced two
confabulated findings the orchestrator independently disproved:

- **Codex P3 "pointer comment in 0001 names the wrong trigger (`orgs_outbox_notify_insert`)"** —
  **FALSE.** The actual pointer comment is `-- LISTEN/NOTIFY trigger: see 0002_outbox_publisher.sql.`
  (line 135) — it contains NO trigger name at all. The cited string does not exist in the file.
  Confabulation. No fix needed.
- **Codex P2 "static test fails to start (`reflect-metadata` missing) → CI signal is zero"** —
  **FALSE in a deps-present context.** The orchestrator §7.1 re-run from the parent submodule
  (`curaos/backend/services/org-core-service`, node_modules resolved) ran
  `bun test test/migration-split.test.ts` → **18 pass / 0 fail / 25 expects**, and full `bun run ci`
  → **87 pass / 0 fail / 174 expects**, exit 0. The "won't start" is the worktree Verdaccio-401
  artifact, not a real defect. The test logic is sound and green.

## What Claude got right (counter-balance)

1. **Forward-only safety — PASS.** `0001`'s non-trigger DDL is byte-identical to `origin/main`
   (diff shows ONLY the 13-line trigger block removed + a pointer comment added). No already-applied
   environment can diverge. Orchestrator confirmed via `git diff origin/main..HEAD -- 0001_init.sql`.
2. **Net-schema equivalence — PASS.** `orgs_outbox` (the trigger's target table) is created in `0001`,
   which runs before `0002`; the function + trigger land in `0002` byte-equivalent to the original.
   Fresh `0001`→`0002` == old single `0001`.
3. **Idempotency — PASS.** `0002` is `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` +
   `CREATE TRIGGER` in that order — a safe no-op when re-run, incl. on an env that already executed
   the old trigger-bearing `0001`.
4. **Correct restraint on the journal.** The worker did NOT fabricate a `0002` journal entry — which
   would have been WRONG (it'd imply `drizzle-kit migrate` should apply `0002` while `0001` is
   unjournaled → inconsistent). Leaving the journal as-is is the correct call.
5. **Surgical scope.** 3 files, all within owned paths, no `src/**` runtime change, no AI commit
   trailers, Conventional Commit message.

---

## Re-grill verification (2026-05-31, post-b7721e9)

**Verdict: APPROVE — merge cleared.**

No fix-cycle was required: the grill returned no P0/P1, and the two P2/P3 nits it raised were
orchestrator-confirmed false positives (worktree-environment confabulation — see reality-check).
The one legitimate P2 (manual apply-path) is a pre-existing, non-regression risk routed to a
`foresight` follow-up, not a merge blocker per §3.7 (P2/P3 = follow-ups, not blockers).

### P0/P1 verification
None raised; none outstanding.

### Independent orchestrator evidence
- `git diff origin/main..HEAD -- drizzle/migrations/0001_init.sql` → ONLY trigger block removed.
- `0002_outbox_publisher.sql` → trigger DDL byte-equivalent + idempotent (CREATE OR REPLACE FUNCTION /
  DROP TRIGGER IF EXISTS / CREATE TRIGGER).
- §7.1 re-run from parent submodule (deps resolved): `drizzle:check` exit 0; `bun run ci` exit 0,
  87 pass / 0 fail; split-test 18 pass / 0 fail. Within tolerance — no over-claim.

### New defects
None.
