# Codex grill - XSRC W0 policy PR your-org/curaos#461

GRILL-VERIFIED-SHA: dae4d4d0ff52870ed1cdd35ad700506665da1887

## Verdict: BLOCK

## P0 findings (block merge)

1. Same-tenant patient can use tenantMatch ABAC to read or write another patient record without any role.
   - **Where:** backend/packages/policy/src/decision-engine.ts:77
   - **What:** tenantMatch checks only that the subject id is non-empty and tenant ids match. When RBAC denies, ABAC is still consulted and can grant access to a caller with no staff proof.
   - **Why P0:** a tenant-level policy can grant patient-to-patient access inside the same tenant, including write access, when docs describe tenantMatch as staff-scoped.
   - **Fix:** require explicit staff proof or an RBAC prerequisite before tenantMatch can grant, then add a regression test for same-tenant no-role denial.

## P1 findings (must address before merge)

1. Frozen install still fails on a fresh detached PR-head worktree.
   - **Where:** bun.lock:211
   - **What:** after required frontend gitlinks are initialized, `bun install --frozen-lockfile` still wants broad lockfile changes.
   - **Why P1:** the PR lockfile does not yet represent the install graph Bun computes for a normal initialized workspace.
   - **Fix:** investigate the package workspace metadata and regenerate only the required lockfile state, or document the upstream root lock defect as a separate blocker if it is unrelated.

## P2 findings (followups acceptable)

None.

## What the worker got right

1. Empty tenant ids are now rejected.
2. Empty subject ids are now rejected.
3. TypeSpec spec checking now passes for the policy package.

---

## Re-grill verification (2026-06-29, post-dae4d4d)

**Verdict: BLOCK**

The second re-grill confirmed the previous empty-id defects were closed, but found the broader tenantMatch authorization problem and a remaining fresh frozen-install gate.

---

## Re-grill verification (2026-06-29, post-e4845b3)

**Verdict: APPROVE**

### P0 verification

- `tenantMatch` now requires at least one assigned role, a non-empty subject id, and non-empty matching tenant ids.
- Tests cover role-backed same-tenant allow, no-role same-tenant deny, cross-tenant deny, empty-tenant deny, and empty-subject deny.
- Self-owner no-role access remains intact for the person-centric self-service path.

### P1 verification

- `@curaos/tsconfig` uses the workspace convention in both `backend/packages/policy/package.json` and `bun.lock`.
- Fresh root frozen install still fails, but the failure appears root/out-of-scope. The warnings name missing non-policy workspaces also missing from the origin/main lock state.

### Verification evidence

- `bunx turbo run test --filter=@curaos/policy`: 16 pass, 0 fail.
- `bunx turbo run typecheck --filter=@curaos/policy`: pass.
- `bunx turbo run build --filter=@curaos/policy`: pass.
- `bunx turbo run lint --filter=@curaos/policy`: pass.
- `bun run spec:check` in the policy package: pass.
- Changed-file em dash and en dash scan passed.

### New defects

None.
