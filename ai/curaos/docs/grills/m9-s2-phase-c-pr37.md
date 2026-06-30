# Claude grill — M9-S2 Phase C PR identity-service#37

## Verdict: PASS

Claude opposite-harness review ran repeatedly against `agent/m9-s2-phase-c-dual-write-170` and forced four fix loops before final handoff. The final blocking item was a stale `TenantPrincipal` fixture field in `test/identity-core/schema.test.ts`; commit `fb645fa` fixed it and local verification stayed green.

## P0 findings

None remaining.

## P1 findings resolved before handoff

1. **Diamond read/write Drizzle path lacked production-adapter coverage**
   - **Where:** `test/identity-core/registration-store.postgres.test.ts`
   - **What:** Initial Phase C coverage exercised only `InMemoryRegistrationStore`.
   - **Fix:** Added live non-HTTP Postgres tests for Drizzle dual-write, Diamond email drift mapping, and read-new fail-closed behavior. These skip unless `CURAOS_IDENTITY_DATABASE_URL` is present.

2. **Shared `identity_core` schema was not guarded on dual-write/read**
   - **Where:** `src/identity-core/db/migrations.ts`; `src/auth/registration-store.ts`
   - **What:** Dual-write used `identity_core.actors` and `identity_core.identities` without ensuring the shared schema.
   - **Fix:** Added `ensureIdentityCoreSchema()` with a Postgres advisory lock and cached the promise per `DrizzleRegistrationStore` instance.

3. **Diamond drift conflicts could surface as raw 500s**
   - **Where:** `src/auth/registration-store.ts`; `src/auth/register-user.service.ts`
   - **What:** Diamond uniqueness conflicts were not sanitized at the service boundary.
   - **Fix:** Mapped `identities_tenant_email_unique` to duplicate-user semantics and converted remaining `DiamondIdentityConflictError` cases to sanitized `409 Identity state conflict.`

4. **Bare tenant override defaulted to Diamond reads**
   - **Where:** `src/identity-core/diamond-mode.ts`; `README.md`
   - **What:** `IDENTITY_DIAMOND_TENANTS=<tenant_id>` with global `off` initially meant `read-new-write-both`.
   - **Fix:** Changed bare tenant canary to `read-old-write-both` and documented that explicit `read-new-write-both` is required for Diamond reads.

5. **In-memory dual-write could leave partial M3 state on Diamond conflict**
   - **Where:** `src/auth/registration-store.ts`
   - **What:** The in-memory adapter checked Diamond conflict after mutating M3 arrays.
   - **Fix:** Preflights Diamond email/id conflicts before mutating M3 state.

## P2 findings / residual risks

1. **Live Postgres tests are environment-gated**
   - `test/identity-core/registration-store.postgres.test.ts` is present but skipped locally without `CURAOS_IDENTITY_DATABASE_URL`.
   - Local `bun run ci` therefore proves non-HTTP static/in-memory behavior and test wiring, not live Postgres execution.

2. **Phase B / Phase C normalization must stay aligned**
   - Phase C lowercases registration email before writing Diamond.
   - Phase B backfill should continue to preserve normalized M3 emails; otherwise Diamond drift correctly surfaces as a conflict.

3. **Actor outbox emission is not part of Phase C**
   - Registration dual-write writes `actors` + `identities` rows directly and preserves existing auth audit event semantics.
   - Actor CRUD outbox remains owned by the existing identity-core actor surface.

## What the PR gets right

- M3 remains canonical by default; `IDENTITY_DIAMOND_MODE` defaults to `off`.
- Per-tenant canaries are explicit and safer by default.
- Diamond reads fail closed when Diamond rows are missing; no M3 fallback in read-new/on modes.
- Existing auth audit action/resource/actor semantics remain unchanged while parity data enters `payload_hash`.
- No `packages/auth-sdk/**`, `identity-service-v2`, `auth-sdk-v2`, or `-next` path was introduced.
- Phase B multi-role fail-loud behavior remains untouched; issue #161 stays open.

## Local verification

Run from `/Users/dev/.config/superpowers/worktrees/identity-service/agent-m9-s2-phase-c-dual-write-170`:

- `bun run typecheck` — pass (`$ tsc --noEmit`)
- `bun test test/identity-core/diamond-mode.test.ts test/identity-core/backfill/backfill-diamond.command.test.ts test/identity-core/schema.test.ts test/identity-core/registration-store.postgres.test.ts` — `77 pass`, `3 skip`, `0 fail`, `158 expect() calls`
- `bun run ci` — `194 pass`, `11 skip`, `0 fail`, `440 expect() calls`; build completed with final `$ tsc`
- `git diff --check` — pass

## Review trail

- Initial Claude review found Drizzle coverage, read-flip, and in-memory partial-state issues.
- Follow-up reviews found schema guard, Diamond uniqueness, DDL race, and sanitized-conflict gaps.
- Final Claude review on `d658838` reported no blocking regression after all code fixes except the stale `profile` fixture key.
- Commit `fb645fa` fixed the fixture key; no code behavior changed after that review.

## Codex re-grill verification — 2026-05-28

Verdict after worker handoff: **NEEDS ATTENTION** until commit `809491f` / `d16e5e7`.

Codex ran an additional adversarial pass against PR #37 after the worker opened the PR. That pass invalidated the earlier PASS claim in two places:

1. **Audit payload hash drift** — the implementation intentionally included `diamondParity` fields in `payload_hash`. That made the same semantic event hash differently when a tenant moved from `off` to `read-old-write-both` / `read-new-write-both`.
2. **Diamond-read role drift** — `findUserByEmail()` could return a Diamond row while `listRolesForUser()` still queried M3 only and returned `[]`, allowing login to mint an empty-role token instead of failing closed when M3 role state lagged Diamond.

Resolution:

- `src/auth/auth-audit-publisher.ts` now keeps `payload_hash` stable as `${action}:${tenantId}:${userId}` across Diamond modes.
- `src/auth/registration-store.ts` adds `DiamondRoleDriftError` when Diamond-read mode finds a Diamond user but no canonical M3 role state.
- `src/auth/login-user.service.ts` maps that drift to the same invalid-credentials fail-closed path instead of issuing `roles: []`.
- `test/identity-core/diamond-mode.test.ts` now asserts stable audit hashes across Diamond parity modes and fail-closed missing-role behavior.

Parity note:

- Phase C does **not** add new audit envelope fields because `@curaos/audit-sdk` is a strict schema outside the identity-service PR boundary.
- Divergence checking remains possible without semantic hash drift because Phase B/C preserve the identity invariant: M3 `users.id` equals Diamond `actors.id` and Diamond `identities.id`; audit `actor_id` / `resource_id` therefore remain stable join keys.

Post-fix verification from `/Users/dev/workspace/curaos-workspace/.claude/worktrees/m8-s6-zero-egress-harness-088/curaos/backend/services/identity-service`:

- `bun run typecheck` — pass.
- `bun test test/identity-core/diamond-mode.test.ts test/identity-core/backfill/backfill-diamond.command.test.ts test/identity-core/schema.test.ts test/identity-core/registration-store.postgres.test.ts` — `78 pass`, `3 skip`, `0 fail`, `160 expect() calls`.
- `bun run ci` — `195 pass`, `11 skip`, `0 fail`, `442 expect() calls`; build completed with final `$ tsc`.
- `bun test test/identity-core/diamond-mode.test.ts` after test-name cleanup — `14 pass`, `0 fail`.
