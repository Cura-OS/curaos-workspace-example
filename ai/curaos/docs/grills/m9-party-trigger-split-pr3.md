# Codex grill — m9-party-trigger-split PR party-core-service#3

> Cross-harness adversarial migration grill (Claude orchestrator → Codex rescue). Parity split
> mirroring the merged, grill-ACCEPTed org-core-service PR#4 (issue #2): move the LISTEN/NOTIFY
> outbox trigger DDL out of `0001_init.sql` into `0002_outbox_publisher.sql`.
> Issue: curaos-ai-workspace#226 (parent M9-S3 #100, closed). DB migration = high-blast-radius →
> grill MANDATORY pre-merge per §3.7. §3.11 cumulative-pattern cleanup (party-core = 2nd of 2
> services with trigger-in-0001; org-core already fixed).

- PR: https://github.com/your-org/party-core-service/pull/3
- Branch: `agent/m9-party-trigger-split-claude-71e0d63e`
- Commit grilled: `ed59650`
- Worktree: `/Users/dev/workspace/curaos-workspace/.worktrees/partycore-trigger-split`
- Reference (accepted shape): org-core-service PR#4 / `m9-s4-pr4.md`

> **Note:** Codex could not write this file itself (read-only sandbox write restriction); the
> orchestrator transcribed the returned verdict verbatim + added independent confirmation.

## Verdict: ACCEPT-WITH-FOLLOWUP (no P0/P1) — MERGEABLE

All critical migration invariants PASS. The highest-value check — copy-paste name leakage from
the org-core source — is CLEAN. One P2 (test hardening) applied inline by the orchestrator before
merge (see Re-grill). One P3 (apply-path) matches the pre-existing, already-filed foresight #225.

## P0 findings (block merge)
None.

## P1 findings (must address before merge)
None.

## P2 findings (followups acceptable)
1. **Static split-test has no negative copy-paste guard**
   - **Where:** `test/migration-split.test.ts` (positive `toContain` assertions only)
   - **What:** the test asserts the correct party-core identifiers are present, but has no assertion
     that org-core identifiers (`org_core` / `orgs_` / `notify_orgs`) are ABSENT. A stray copied
     org-core block could coexist beside the correct party block and the positive checks would still
     pass.
   - **Why not a blocker:** invariant #4 (orchestrator + codex both grepped all 3 files) confirmed
     ZERO org-core leakage in this commit — the defect the guard would catch does not exist here.
   - **Fix:** add negative assertions (`not.toMatch(/org_core|orgs_|notify_orgs/)`) over both SQL
     strings. **APPLIED INLINE by orchestrator before merge** (≤3-file, no-design-choice §3.7 hotfix)
     — hardens the test for this PR and is worth back-porting to org-core's identical test.

## P3 findings (nits)
1. **No migration apply-path / empty-or-absent journal** — party-core has no `meta/` dir at all
   (org-core had an empty `entries:[]` journal). Same manual/external apply situation, same
   pre-existing silent-trigger-loss risk already captured as **foresight #225**. NOT a regression,
   NOT a blocker.

## What Claude got right (counter-balance)
1. **Forward-only — PASS.** Only the trigger block removed; the immediately-following
   `audit_chain_heads` CREATE TABLE + everything after is byte-untouched (codex specifically checked
   the adjacency the removal could have eaten).
2. **Net-schema equivalence — PASS.** `parties_outbox` created in `0001` before `0002`; nothing
   dropped/reordered.
3. **Idempotency — PASS.** `CREATE OR REPLACE FUNCTION` → `DROP TRIGGER IF EXISTS` → `CREATE TRIGGER`.
4. **Naming — CLEAN (highest-value check).** Zero `org_core`/`orgs_`/`notify_orgs` leakage; all
   party identifiers (`party_core`, `parties_outbox`, `notify_parties_outbox_insert`,
   `parties_outbox_insert_notify`, channel `parties_outbox_inserted`) correct.
5. **Apply-path restraint.** No journal fabricated — correct, matches org-core.

---

## Re-grill verification (2026-05-31, post-inline-P2-fix)

**Verdict: APPROVE — merge cleared.**

The single P2 (missing negative copy-paste guard) was applied inline by the orchestrator: the split
test now also asserts `not.toMatch(/org_core|orgs_|notify_orgs/i)` over both `0001` and `0002`
strings. No P0/P1 were raised. The P3 apply-path risk is the pre-existing foresight #225, not a
blocker.

### P0/P1 verification
None raised; none outstanding.

### Independent orchestrator evidence
- `git diff origin/main..HEAD -- drizzle/migrations/0001_init.sql` → ONLY trigger block removed;
  `audit_chain_heads` + tail byte-untouched.
- `0002_outbox_publisher.sql` → party-core identifiers throughout, idempotent DDL.
- §7.1 re-run from parent submodule (deps resolved): `drizzle:check` exit 0; `bun run ci` exit 0,
  58 pass / 0 fail; split-test green (incl. the new negative guards). Within tolerance — no over-claim.

### New defects
None.
