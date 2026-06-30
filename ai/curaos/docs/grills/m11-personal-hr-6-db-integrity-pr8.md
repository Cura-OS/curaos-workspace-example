# Grill: personal-hr-service#6 DB-integrity hardening (PR #8)

- Subject: composite cross-user FK + validity CHECKs + non-cascading-drop convention
- Direction: Claude (orchestrator/implementer) -> Codex (adversarial reviewer)
- Codex model: gpt-5.5, reasoning effort high, sandbox read-only
- Date: 2026-06-08
- Verdict: BLOCK (initial) -> all findings resolved in the same PR before push

## Findings (Codex)

### Critical (fixed)
- **renewed_from_id cross-owner linkage.** The self-FK only bound `renewed_from_id -> credential_validity_period(id)`, so any user's period could renew from another tenant/user's period id (the same F2 isolation hole, one level down). Recommendation: composite self-FK `(tenant_id, user_id, credential_id, renewed_from_id) -> (tenant_id, user_id, credential_id, id)` with a matching unique.
  - **Resolution (auto-applied per recommendation):** added a composite self-FK on those 4 columns + a parent `UNIQUE(tenant_id, user_id, credential_id, id)` on `credential_validity_period`. `ON DELETE RESTRICT` (a multi-col SET NULL would null the NOT-NULL owner columns; the chain is removed as a whole via the owner FK's cascade - verified by a test). New test `F3 renewal: a CROSS-OWNER renewed_from_id is REJECTED` passes against live PG.

### Major (fixed)
- **Live test false-green.** `beforeAll` caught setup errors and only warned, then tests early-returned on `!liveReady`; with `DATABASE_URL` set, a broken 0004 could still go green.
  - **Resolution:** the catch now RE-THROWS when a DSN is present (only the `!LIVE_DSN` early-return skips cleanly). Verified: a set-but-unreachable DSN now FAILS the suite (1 fail), no DSN still skips clean.
- **UPDATE-path test gap.** Tests covered inserts only; the FK must also reject post-insert UPDATEs to `credential_id`/`tenant_id`/`user_id`, and the CHECK must reject an UPDATE inverting the window (user explicitly called out `credential_id` updates).
  - **Resolution:** added 3 UPDATE-rejection tests (re-point credential_id, change user_id, invert window) - all pass against live PG (`ON UPDATE no action` is conservative; child updates cannot bypass the composite FK once enforced).
- **Cross-owner renewal test gap.** The "real chain" test only proved the same-owner happy path.
  - **Resolution:** covered by the new cross-owner rejection test above.

### Major (documented, lower risk for this PR)
- **Migration drops old FKs before validating new ones on live data.** On a deployed DB with pre-existing violating rows the `ADD CONSTRAINT` would fail; if the runner is not whole-file transactional the DB could be left with old FKs removed.
  - **Disposition:** the credential domain is BRAND NEW (authored in PR #5, not deployed to any tenant with rows), so the constraints are added to EMPTY tables - no pre-existing row can violate them. Documented in the 0004 header + PR body. The `NOT VALID`/`VALIDATE CONSTRAINT` two-phase pattern is unnecessary for a zero-row new table; noted as a convention for FUTURE constraint-tightening on populated tables. (FORESIGHT candidate, not blocking this PR.)

## Sound parts (Codex)
- Composite FK column order correct.
- Parent composite unique satisfies the Postgres referenced-key requirement.
- `ON DELETE no action` on update is conservative; child updates cannot bypass the composite FK once enforced.

## Re-verification
After the fixes: `bun run ci` -> 80 pass / 0 fail (CI_EXIT=0, live DB); drizzle-kit generate -> "No schema changes" (zero drift); live integration suite -> 13 pass / 0 fail; false-green guard proven (fails on unreachable DSN, skips clean without DSN).
