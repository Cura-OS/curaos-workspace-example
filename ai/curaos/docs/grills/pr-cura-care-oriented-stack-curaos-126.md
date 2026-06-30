# Codex grill — M9-S2 Phase A fold-back PR curaos#126 [+ curaos-ai-workspace#153]

Cross-harness adversarial grill (opposite harness: Codex-style adversary, Opus model family) per [[curaos-verification-stack-rule]] Tier-2. Subject: `feat(codegen): fold M9-S2 Phase A IdentityCoreModule patterns into service-core trio (#153)`. Head SHA: `06fe328`. Read-only sandbox, high reasoning.

## Verdict: PASS (with low-severity scaffold-completeness notes)

The PR folds the 7 hand-rolled `IdentityCoreModule` Diamond patterns back into the `service-{core,personal,business}` trio templates per [[curaos-generator-evolution-rule]]. I tried hard to break the CAS atomicity, SQL-injection surface, trio symmetry, and the hash-chain integrity claims. The load-bearing security logic (atomic compare-and-set, identifier/UUID/literal escaping, composite chain key) holds. The only defects found are scaffold-completeness gaps (emitted-but-unwired table + decorator), which are acceptable generator-boundary artifacts but are documented with stronger language than the emitted behavior backs.

### Verification performed (independent, this grill)
- `bun test` (full codegen suite, deps installed in detached worktree at `06fe328`): **320 pass / 0 fail**, 10 snapshots, 1292 assertions — matches PR claim.
- `bun run typecheck` (real submodule, workspace-linked): **exit 0** — matches PR claim.
- `live-emit.test.ts` (actually RENDERS the templates end-to-end): **8 pass / 0 fail** — the `[31,32,32]` per-layer file count is behaviorally validated, not just asserted as a literal.
- Trio byte-identity of name-agnostic templates (`audit-chain-head.store.ts.hbs`, `<name>-event-producer.ts.hbs`, `deferred-fk.helper.ts.hbs`) — **shasum IDENTICAL** across all three layers.
- Generated-service `package.json.hbs` declares `drizzle-orm: 0.45.2` — the new `import { sql } from 'drizzle-orm'` in the chain-head store resolves; generated services will build.
- Publisher `resourceType` resolution: resolved once (`input.resourceType ?? '{{pascalCase name}}'`) and threaded consistently through `get` / `compareAndSet` / conflict-`get` / envelope — head store and envelope agree on the chain.

## P0 findings (block merge)

None. No exploitable correctness, security, or PHI-boundary failure confirmed.

## P1 findings (must address before merge)

None.

## P2 findings (followups acceptable)

None that rise to P2.

## P3 findings (defensible / low — followup acceptable)

1. `idempotency_keys` table emitted but has ZERO consumers in the generated service
   - **Where:** `tools/codegen/templates/service-{core,personal,business}/drizzle/schema.ts.hbs` — `<name>IdempotencyKeys` table + `_idempotency_keys_expires_at_idx`.
   - **What:** The table, the `expires_at DEFAULT now() + interval '24 hours'`, and the reaper index are emitted, and the schema comment states "The lookup path MUST filter `WHERE expires_at > now()`" and "the reaper sweeps by `expires_at`". But `git grep -i idempotency` across the rendered `src/**` finds **no interceptor, service, or reaper job** that reads or writes the table. The 24h-TTL replay-cache behavior is documentation-only in the scaffold; nothing populates or expires rows, and no reaper is emitted.
   - **Why P3 not higher:** Acceptable as a generator boundary — the replay middleware in the original `IdentityCoreModule` lives in hand-written controllers that cannot be emitted name-agnostically. The table is correct DDL and a valid starting point. The risk is purely that the comment over-claims working behavior; a future worker who trusts the comment may assume replay protection is active when it is inert until wired.
   - **Fix (optional):** Soften the schema comment to "scaffold only — wire a replay interceptor + reaper in the host" OR emit a minimal `idempotency.interceptor.ts` + reaper stub so the pattern is functional on generation.

2. `@Requires<Name>Scope` decorator emitted but never applied to any controller
   - **Where:** `tools/codegen/templates/service-{core,personal,business}/src/auth/{{kebabCase name}}-scope.decorator.ts.hbs`.
   - **What:** The decorator + `<Name>_READ_ROLES` / `<Name>_WRITE_ROLES` presets are emitted, but no generated controller applies `@Requires<Name>Scope(...)`. A freshly generated Diamond root therefore has **no scope enforcement wired by default** from this decorator (the pre-existing `RolesGuard` + `@Roles` still function on whatever the developer wires).
   - **Why P3 not higher:** Same generator-boundary rationale; the controller method set is not name-agnostically emittable. The decorator is correct, type-checks, and reuses `ROLES_METADATA_KEY` so the existing guard enforces it once applied. No privilege-escalation risk is introduced — absence of the decorator means the developer keeps using the existing role guard, not that auth is bypassed.
   - **Fix (optional):** Apply `@Requires<Name>Scope({ action: 'read', roles: <Name>_READ_ROLES })` / write preset on the emitted Diamond-root controller handlers so the multi-role pattern ships wired.

3. `PostgresAuditChainHeadStore` CAS correctness depends on the injected executor returning `rowCount` (driver-coupling, undocumented seam)
   - **Where:** `audit-chain-head.store.ts.hbs` — `(result.rowCount ?? 0) > 0` on both the INSERT-ON-CONFLICT and the conditional UPDATE branches.
   - **What:** `AuditChainHeadDrizzleExecutor.execute()` is typed `Promise<unknown>` and the result is cast to `{ rowCount?: number | null }`. With the `drizzle-orm/node-postgres` driver, `.execute()` returns the `pg` `QueryResult` (has `rowCount`) — CAS works. With the `drizzle-orm/postgres-js` driver, `.execute()` returns a `RowList` array where `rowCount` is `undefined`; `(undefined ?? 0) > 0` is always `false`, which would make every chain-start INSERT report conflict and **break the chain entirely**. No `ai/rules` or ADR pins the pg driver, so this is a latent foot-gun for whoever wires the modulith host.
   - **Why P3 not higher:** The executor is injected by the modulith composition root (out of scope of this template — documented seam per [[curaos-modulith-standalone-rule]]). The source-grill record (`m9-s2-phase-a-pr35-pr152.md`) shows the original hand-rolled store had a passing "rowCount race" test, i.e. it was validated against the node-postgres shape; this fold-back faithfully reproduces that contract. Not a defect introduced by this PR.
   - **Fix (optional):** Add a one-line doc note on `AuditChainHeadDrizzleExecutor` that the wired executor MUST surface `rowCount` (node-postgres semantics), so a future postgres-js wiring fails loudly rather than silently breaking the chain. Consider pinning the driver in `curaos_postgres_rule.md`.

## Refuted break attempts (where the change held up)

- **SQL injection via raw `sql.raw()` interpolation** — `tenantId`/`resourceId` pass `assertUuid` (strict UUID regex); `resourceType`/`nextHash`/`expectedPrevious` pass `escapeLiteral` (single-quote doubling, correct under PG default `standard_conforming_strings=on`); `schemaName` validated `^[a-z_][a-z0-9_]*$` in the constructor AND in `resolveDefaultSchemaName`. `deferred-fk.helper.ts` validates every identifier with the same regex before interpolation and allowlist-checks `onDelete` (closed `ON_DELETE_ACTIONS` set) even against loosely-typed JS callers. No injection vector found.
- **TOCTOU between publisher `get()` and `compareAndSet()`** — the earlier `get()` only computes hash material; atomicity comes from the CAS itself (`INSERT ... ON CONFLICT DO NOTHING` for chain-start, `UPDATE ... WHERE current_hash = expected` for swap). A concurrent winner forces `rowCount = 0` → `false` → `ConflictException`. No multi-root forgery window.
- **Composite-key hash-chain integrity** — `resourceType` is absent from the hash material (`${eventId}|${occurredAt}|${resourceId}|${previousHash}`), but `eventId` is a unique per-event UUID and `previousHash` binds the chain-specific predecessor, so distinct `(tenant, resourceType, resourceId)` chains cannot be forged across each other. The composite key correctly separates an Actor and the 1:1-referencing Identity onto distinct heads (`audit_chain_heads_tenant_type_resource_unique` is the exact `ON CONFLICT` target — Drizzle schema and CAS agree).
- **Trio drift** — byte-identical name-agnostic templates (shasum-confirmed); schema differs only by layer schema name as required. [[curaos-generator-evolution-rule]] trio symmetry satisfied.
- **PHI boundary** — event producer `display_name` is explicitly documented NEUTRAL-only (non-clinical label); the comment instructs vertical overlays to emit reference ids and relies on the audit envelope's PHI `superRefine` backstop. No PHI leak introduced at the neutral layer per AGENTS.md §3 / §7.
- **Test resource leaks** — HTTP-test starters pair `await app.listen(0)` with `afterEach(() => app.close())`; ephemeral ports released.

## What Claude got right (counter-balance)

1. **Atomic CAS is genuinely correct and closes the multi-process forgery window** the Map/File stores could not — the `INSERT ON CONFLICT DO NOTHING` / `UPDATE WHERE current_hash` split is the right primitive, and `false` is correctly mapped to a `ConflictException` upstream.
2. **Defense-in-depth on the raw-SQL surface** — three independent validators (UUID regex, literal escape, identifier regex) plus an `onDelete` allowlist, with comments explaining WHY each is load-bearing. This is exactly the right posture for `sql.raw` paths.
3. **Faithful generator-evolution fold-back** — patterns are byte-identical across the trio, locked by a 346-line shape-assertion test (`m9-s2-phase-a-diamond-patterns.test.ts`) so a future refactor cannot silently drop the SQL/decorator/header shapes; live-emit count snapshot bumped and behaviorally re-rendered.
4. **Verification claims are honest** — independently reproduced 320 pass / 0 fail, clean typecheck, and the `[31,32,32]` render count. No inflated coverage claim detected.
5. **`drizzle-orm` dependency correctly added** to the generated `package.json.hbs`, so the new `sql` import does not break generated-service builds — a common fold-back miss that was avoided here.

---

## Re-grill verification (2026-05-29, post-05abd32)

**Verdict: APPROVE (PASS holds) — issues-found at low severity only; no merge blocker.**

Independent fresh-adversary re-grill from the opposite harness (Opus model family, Codex-style adversary) per [[curaos-verification-stack-rule]] Tier-2. Subject re-inspected at PR HEAD `05abd32` (the prior grill ran at `06fe328`; `05abd32` adds `fix(codegen): double-quote deferred-FK identifiers + correct trio layer comments`). Read-only sandbox, high reasoning. I re-ran the full break attempt from scratch rather than trusting the prior PASS.

### Verification re-performed (this re-grill, at 05abd32)
- `bun test` (full codegen suite, real submodule on `pr-126` branch): **323 pass / 0 fail**, 10 snapshots, 1320 assertions. (Count rose from the prior grill's 320→323 and 1292→1320 assertions — consistent with the `05abd32` fix commit adding deferred-FK double-quote assertions; no regressions.)
- `bun run typecheck` (`tsc --noEmit`): **exit 0**. Clean.
- `live-emit.test.ts` + `m9-s2-phase-a-diamond-patterns.test.ts` together: **36 pass / 0 fail**, 285 assertions. The `[31,32,32]` per-layer render count is behaviorally validated end-to-end (templates actually rendered to a tmp dir).
- Trio symmetry tests (`service-{core,personal,business}.test.ts`): **5 pass / 0 fail**.
- Trio byte-identity reconfirmed: `audit-chain-head.store.ts.hbs`, `<name>-scope.decorator.ts.hbs`, `<name>-event-producer.ts.hbs`, `deferred-fk.helper.ts.hbs` are byte-identical across core/personal/business (deferred-fk confirmed `Files are identical` by diff). Schema differs only by layer schema name (+ `userId` in personal / `orgId` in business on the domain table — correct per-layer divergence), with the `audit_chain_heads` + `idempotency_keys` tables consistent across the trio.
- `app.listen(0)` ritual confirmed present AND paired with `afterEach(() => app.close())` in both HTTP starters — no ephemeral-port leak.

### P0 verification
**No P0.** Re-attacked the load-bearing security claims; all held:
- **Raw-SQL injection** — `assertUuid` (strict UUID regex) gates `tenantId`/`resourceId`; `escapeLiteral` (single-quote doubling) gates `resourceType`/`nextHash`/`expectedPrevious` and is sound under PG default `standard_conforming_strings=on` (no backslash-escape hatch); `schemaName` regex-validated in both the constructor and `resolveDefaultSchemaName`. In practice `nextHash`/`expectedPrevious` are always sha256 hex (no quotes/backslashes). `deferred-fk.helper.ts` regex-validates every identifier and allowlist-checks `onDelete`. No vector found. Escaping approach is byte-faithful to the #117 identity-service source (verified against the original `audit-chain-head.store.ts`) — no regression.
- **CAS atomicity / multi-root forgery window** — `INSERT ... ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING` (chain-start) and `UPDATE ... WHERE ... current_hash = $expected` (swap) are correct concurrency primitives; a losing concurrent writer gets `rowCount=0 → false → ConflictException`. Confirmed the publisher threads `previousHash`/`hash` and the resolved `resourceType` consistently through `get`/`compareAndSet`/conflict-`get`/envelope.
- **Composite-key chain integrity** — the `(tenant_id, resource_type, resource_id)` unique index is the exact `ON CONFLICT` target; Drizzle schema and CAS agree. Distinct resource types on a shared id stay on distinct chains.
- **PHI boundary** — `display_name` is neutral-layer-only by contract; no PHI guard is in the producer itself, but the template is correctly scoped to the neutral trio (not the healthstack overlay), the comment instructs overlays to emit reference ids, and the audit-envelope `superRefine` is the documented backstop. Consistent with AGENTS.md §3/§7. No neutral-layer leak.

### P1/P2 verification
**No P1, no P2.** Confirmed the prior grill's three P3 findings are accurate and remain at P3:
1. `idempotency_keys` table emitted with ZERO consumers in `src/**` (no interceptor/reaper) — re-confirmed by grep; comment over-claims working replay behavior that is inert until host-wired. Generator-boundary-acceptable.
2. `@Requires<Name>Scope` decorator emitted but applied to no generated controller — re-confirmed; existing `RolesGuard`+`@Roles` still function, no auth bypass introduced.
3. `PostgresAuditChainHeadStore` CAS depends on the injected executor surfacing `rowCount` (node-postgres semantics); a `postgres-js` wiring would make `(undefined ?? 0) > 0` always false and silently break the chain. Out-of-template seam (modulith host wires the executor), faithful to the #117 contract.

### New defects (this re-grill)
1. **(NEW, P3) `resolveDefaultSchemaName()` falls back to `public` — a less-safe default than the #117 source (`'identity_core'`).**
   - **Where:** `tools/codegen/templates/service-{core,personal,business}/src/audit/audit-chain-head.store.ts.hbs` — `resolveDefaultSchemaName()` returns `process.env.AUDIT_CHAIN_HEAD_SCHEMA` (regex-validated) else `'public'`. The `PostgresAuditChainHeadStore` constructor defaults `schemaName` to this.
   - **What:** Every generated service's `audit_chain_heads` table lives in `<name>_core` / `personal_<name>` / `business_<name>` (per the Drizzle schema), NEVER `public`. If a modulith host opts into the durable store via `createDefaultAuditChainHeadStore({ drizzle })` but omits `schemaName` AND `AUDIT_CHAIN_HEAD_SCHEMA`, the store queries `public.audit_chain_heads` → `relation "public.audit_chain_heads" does not exist`. The store's own doc-comment claims "The neutral `public` fallback only applies to a bare developer-shell wiring," but a developer shell also has no table in `public`, so the fallback points at a non-existent relation in every case. The original identity-service safely defaulted to `'identity_core'` (its real schema).
   - **Why P3 not higher:** Fails LOUD (a missing-relation error at first write), not silent — no forgery or data-integrity risk. The emitted publisher never constructs the Postgres store itself (it defaults to InMemory/File via the no-arg `createDefaultAuditChainHeadStore()`), so the footgun only fires when a host opts into the durable path AND forgets to pass the schema, which a wiring-time smoke test would catch. The name-agnostic template legitimately cannot hard-code a per-layer schema default, so `public` is a defensible placeholder — but it is a strictly weaker default than the source pattern and the doc-comment is misleading.
   - **Fix (optional):** Either (a) make `schemaName` a required constructor arg (no default) so a host MUST supply it and a forgotten wiring fails at construction with a clear message, or (b) correct the doc-comment to state the `public` fallback is a non-functional placeholder that every real wiring must override via `schemaName`/`AUDIT_CHAIN_HEAD_SCHEMA`.

### Re-grill conclusion
The `05abd32` fix (deferred-FK identifier double-quoting + trio layer-comment correction) is a strict improvement and introduces no regression — full suite green, typecheck clean, trio symmetry intact. The prior PASS holds. The only adversarial finding beyond the prior three P3s is the `public` schema-default divergence above, which is fail-loud and host-wiring-gated, not a merge blocker. **Net verdict: issues-found at P3 only; mergeable. No P0/P1/P2.**
