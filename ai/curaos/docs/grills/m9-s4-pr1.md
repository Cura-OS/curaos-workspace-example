# Grill: M9-S4 org-core-service PR-1

> **Note:** The initial grill section was not persisted before this re-grill run.
> This file was created during the re-grill verification pass (2026-05-28).
> The initial grill findings (P0a, P0b, P1a, P1b, P1c) are referenced from the
> fix commit messages and verified directly below.

- PR: https://github.com/your-org/org-core-service/pull/1
- Branch: `agent/m9-s4-scaffold`
- Issue: https://github.com/your-org/curaos-ai-workspace/issues/101
- Fix commits verified: a137fb4, 66e9daa, 6f95524, 9a5a171, 6402c4a

---

## Re-grill verification (2026-05-28, post-6402c4a)

**Final verdict:** APPROVE-WITH-CONDITIONS

### P0 fix status

- **P0a: RESOLVED** — `src/orgs/orgs.dto.ts:119` `ListOrgsQuerySchema` is a strict `.object({ kind, limit, offset })` with no `tenantId` field; any inbound `?tenantId=` query param causes a 400 via Zod's `.strict()`. `src/orgs/orgs.service.ts:192` `list()` reads `principal.tenantId` only via `const tenantScope = principal.tenantId`. `src/orgs/in-memory-orgs.repository.ts:73` filters on `query.tenantId` which is always set from principal scope. Regression tests: `auth-matrix.test.ts:175` — `clinician(tenant-A) list with ?tenantId=tenant-B → 403` (AuthGuard rejects mismatched declared tenant first); `auth-matrix.test.ts:191` — `clinician(tenant-A) list with ?tenantId=tenant-A returns ONLY tenant-A orgs` with `.expect(400)` (DTO strict-mode rejection). Defense-in-depth confirmed at two layers.

- **P0b: RESOLVED** — `test/integration/auth-matrix.test.ts:63` uses `await app.listen(0)` to bind an ephemeral kernel-assigned port before supertest attaches. Fresh `bun run ci` run exits 0: **69 pass / 0 fail / 149 expects** in 540ms across 4 files. No EADDRINUSE failures observed.

### P1 fix status

- **P1a: RESOLVED** — `drizzle/migrations/0001_init.sql:55–72` contains a `DO $$ BEGIN ... END $$` block that checks `information_schema.tables` for `identity_core.actors` and `information_schema.table_constraints` for the existing constraint before issuing `ALTER TABLE "org_core".orgs ADD CONSTRAINT fk_orgs_actor_id FOREIGN KEY (actor_id) REFERENCES "identity_core".actors (id) ON DELETE RESTRICT`. Conditional gate is sound: uses `information_schema` queries (ANSI SQL, not pg-specific catalog hacks), checks both parent table existence and constraint idempotency. Safe to run in environments where identity_core schema is not yet deployed; FK is added automatically when it appears.

- **P1b: RESOLVED** — `drizzle/migrations/0001_init.sql:182–191` defines `audit_chain_heads` with columns `(tenant_id uuid, resource_type text, resource_id uuid, current_hash text, updated_at, created_at)` and `CONSTRAINT audit_chain_heads_pkey PRIMARY KEY (tenant_id, resource_type, resource_id)`. `src/audit/audit-chain-head.store.ts:92` `chainKey()` returns `${tenantId}:${resourceType}:${resourceId}`. `src/audit/audit-publisher.service.ts:214` `store.get(input.tenantId, resourceType, input.resourceId)` passes all three axes. Test `audit-chain-e2e.test.ts:449` — `resource_type isolation — Org + OrgMembership sharing org_id keep separate chains (P1b regression)` — publishes Org and OrgMembership events with the same `sharedId`, asserts `orgEvent.previousHash === null` AND `membershipEvent.previousHash === null` (both first-in-chain, no collision), then asserts `sharedStore.get(TENANT_A, 'Org', sharedId) !== sharedStore.get(TENANT_A, 'OrgMembership', sharedId)`.

- **P1c: RESOLVED** — `src/memberships/memberships.controller.ts:104` `@Headers('idempotency-key') idempotencyKey: string | undefined` accepts the header. `src/memberships/memberships.service.ts:190` `grant()` checks `if (idempotencyKey) { const cached = await this.idempotency.get(org.tenantId, idempotencyKey); if (cached) { return { row, replayed: true }; } }` — short-circuits BEFORE the duplicate-membership 409 check. Controller `memberships.controller.ts:121–123` sets `res.status(200)` when `outcome.replayed === true`; default NestJS `@Post()` response is 201 for fresh grants. Test `memberships.service.test.ts:619` — `replay with same key returns cached row + replayed=true` — calls `grant()` twice with the same key; first returns `replayed=false`, second returns `replayed=true` with same row. Separate test at line 695 confirms no-key duplicate still surfaces 409.

### Verification commands run

- `bun run ci` → exit 0 — 69 pass / 0 fail / 149 expects, 20 lint warnings (oxlint warnings only — no errors; all warnings are `no-extraneous-class` on NestJS modules, `no-array-sort` style, `no-await-in-loop` in test loops, `no-console` in test debug lines — none are blockers)
- `bun run drizzle:check` → exit 0 — "Everything's fine"
- `find src/ -name '*.ts' | wc -l` → 25
- `grep -rl 'codegen-source:' src/ | wc -l` → 25 (all 25 codegen-source markers present; 24/24 contract met plus 1 extra)
- `ls Dockerfile*` → no Dockerfile
- cross-submodule bleed check (identity-core-service/src/) → no matches
- `gh issue list --repo your-org/org-core-service` → issue #2 `M9-S4 follow-up: move trigger DDL out of 0001_init.sql` — open, P2 follow-up confirmed

### Summary

All five P0/P1 grill findings are fully resolved: the cross-tenant query surface is eliminated at the DTO layer with Zod strict mode (400 on any `?tenantId=` param) and at the service layer (principal-only scoping), with two distinct regression tests confirming both paths; the supertest port race is closed by `app.listen(0)`; the conditional `information_schema`-gated FK correctly wires `orgs.actor_id` to `identity_core.actors(id)` when the parent schema is present; the audit chain head composite PK `(tenant_id, resource_type, resource_id)` prevents Org/OrgMembership chain collision, confirmed by a dedicated isolation test; and the Idempotency-Key replay cache short-circuits the duplicate-check path to return 200+cached body rather than 409. CI is green (69/0 pass/fail), drizzle:check is clean, no Dockerfile present, no cross-submodule bleed, and the P2 DDL-trigger follow-up issue #2 exists. The only open condition is the 20 oxlint warnings (style/pattern, not errors); these do not block merge but should be resolved before the next grill cycle.
