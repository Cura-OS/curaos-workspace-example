# Grill — #360/#355 domain-outbox mold fold — curaos PR #206

- **Story:** #360 (fold durable DOMAIN outbox into service-core mold) + #355 items 1-3; folds #361 (`::uuid`) into the mold.
- **PR:** your-org/curaos #206 — branch `agent/fold-domain-outbox-mold-360`, commit `3bca055`.
- **Tier:** T2 adversarial.
- **Grill harness:** fresh-context Claude opposite-harness fallback (Codex unavailable this session — gpt-5/gpt-5-codex unsupported on the ChatGPT account + usage limit, per session note). Reviewer instructed to BREAK the change, generated both ORM tiers to temp dirs, traced the runtime migrator path, ran md5 trio + idempotency double-gen.
- **Date:** 2026-06-03.

## Verdict: **SAFE-TO-MERGE** — no P0/P1.

## Decision under test
360-1 (AUTO-DECISION-LOG): infra-table SQL migrations (audit_outbox + domain_outbox) are ORM-NEUTRAL → emit for BOTH orm tiers. Carve `drizzle.config.ts` + `drizzle/migrations/**` out of the mikro-tier drop; keep typed `drizzle/schema.ts` drizzle-only. Evidence: commerce-core (only real `--orm=mikro-orm` service) ships `drizzle/migrations/{0000,0001,0002}.sql` + `drizzle.config.ts` + `drizzle-orm`/`drizzle-kit`, zero `@mikro-orm/*` deps.

## Attack results (7 vectors)
1. **Carve correctness (headline risk) — NOT a defect.** Mikro tier emits `drizzle.config.ts` + full `drizzle/migrations/**` (0000/0001/0002 + `meta/_journal.json` + 3 snapshots); drops only `drizzle/schema.ts` + `deferred-fk.helper.ts`. Runtime path `ops/migrations/run-migrations.ts` → `drizzle-orm/node-postgres/migrator` `migrate(db,{migrationsFolder})` reads SQL + `_journal.json` directly; does NOT read `drizzle.config.ts` `schema` field, does NOT need `drizzle-kit`. Dangling schema ref inert at deploy; absent `drizzle-kit` correct (dev-time only).
2. **Generalization leakage — clean.** Generic `domain_outbox` table; no `commerce`/`crm`/`Order` leakage; enforced by `must not leak commerce identifiers` test.
3. **`::uuid` cast (#361) — present + correct.** `domain-outbox.service.ts.hbs:490` `COALESCE(${input.id ?? null}, gen_random_uuid()::text)::uuid`; migration `id uuid PRIMARY KEY` matches.
4. **Both-tier deploy reality — confirmed.** Mikro tier migrate-only creates `domain_outbox` (migrator + SQL + journal, no drizzle-kit). `Dockerfile.migrator.hbs` COPYs config + drizzle/ + src/db. No silent no-op.
5. **Trio symmetry + idempotency — correct.** `src/db/*` + `_journal.json` byte-identical across trio (md5 count=1); SQL differs only on schema name (count=3, expected). Double-gen byte-identical. `0002` slots after 0000/0001.
6. **Snapshot/journal alignment — coherent.** `0002_snapshot.json` `domain_outbox` 15 cols + status check; `dialect=postgresql version=7`; suite asserts SQL↔schema.ts↔snapshot alignment.
7. **Test theater — NOT shallow.** 27/27 pass, 90 assertions; assert both-tier plan membership (`emitsForOrm('drizzle/migrations/0002…','mikro-orm')===true`), schema.ts drizzle-only, the `::uuid` string, no-leakage on emitted files, journal idx:2, snapshot/schema alignment. Catches a re-drop regression.

## Independent orchestrator verification (pre-grill)
- Both tiers emit domain-outbox files + migration (`gen:service smoke --core-only [--orm=mikro-orm] --dry-run`): drizzle ✓, mikro ✓.
- `bun test` (codegen): 847 pass / 0 fail (+28 vs Pass A 819). Coverage 95.95% func / 94.63% line.
- `bun turbo run lint typecheck test --filter=@curaos/codegen`: 3/3.
- Trio domain-outbox.service md5 identical: `4a06853205786ec83cb8da192cd649c6`.
- Carve `isDrizzleOnlyPath` (config.ts:199-207): `drizzle.config.ts` + `drizzle/migrations/` → both tiers; `drizzle/` (typed schema) → drizzle-only. Correct.

## P2 non-blockers
- **P2-a:** `drizzle.config.ts` ships to mikro tier with dead `schema: './drizzle/schema.ts'` ref (file dropped for mikro). Inert at runtime; foot-gun only on `drizzle-kit generate/push` against a mikro-tier service. Faithfully mirrors commerce-core (not a regression). → foresight issue: optional `{{#unless (eq orm "mikro-orm")}}` guard or migrate-only marker comment.
- **P2-b:** `.stryker-tmp/` untracked working-tree artifact — gitignore it. **FIXED by orchestrator** in this PR (added `.stryker-tmp/` to `curaos/.gitignore`).

## Foresight (from worker)
- Live-PG enqueue integration test for the mold's domain_outbox `::uuid` cast (gated on `DATABASE_URL`).
- Regenerate commerce-core + crm-core hand-copied domain-outbox files FROM the now-canonical mold; add commerce-core `meta/0002_snapshot.json`.
