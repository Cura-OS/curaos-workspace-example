# M11 codegen mold lane — #354-residual / #355 / #360 / #361

Status: **LANE COMPLETE — Pass A MERGED (PR curaos#204, e3aeed2 incl #205 buildability-lock follow-up); Pass B MERGED (PR curaos#206, 82d3935). #354-residual + #355 + #360 + #361 all closed. Carve decision 360-1 logged.**
Date: 2026-06-03. Pass-A branch: `agent/fix-codegen-mikro-orm-drizzle-runtime-354residual`. Pass-B branch: `agent/fold-domain-outbox-mold-360`.

## Pass B — domain-outbox fold (LANDED as PR curaos#206, NOT merged)

Folded the durable DOMAIN outbox into `service-{core,personal,business}`:
- `src/db/domain-outbox.{service,relay,module}.ts.hbs` (trio md5-identical) — generic store + at-least-once relay + dynamic `DomainOutboxModule.register()` + fail-closed durable-store guard. #361 `::uuid` cast folded in.
- `drizzle/migrations/0002_domain_outbox.sql` + `meta/0002_snapshot.json` + journal idx:2 (per-layer schema); typed `domain_outbox` added to drizzle `schema.ts`.
- domain module imports `DomainOutboxModule.register()`; barrel re-exports the generic public surface (`barrelExportsFor()` extended in `src/live-emit.ts`).
- **360-1 carve RESOLVED** (the Pass-A blocker): `isDrizzleOnlyPath` now treats `drizzle/migrations/**` + `drizzle.config.ts` as ORM-NEUTRAL → both tiers; only `drizzle/schema.ts` + `deferred-fk.helper.ts` stay drizzle-only. Mikro tier now ships the `domain_outbox` (+ audit) table migrations (matches commerce-core's real shape).

Gate (verbatim in PR#206 + on tracker #360): codegen `bun test` **847/0** (Pass A 819 → +28); coverage **95.95% func / 94.60% line**; typecheck exit 0; lint 0 errors; turbo lint+typecheck+test 3/3; both acceptance greps PASS (drizzle = 3 files; mikro = 3 files + the `0002_domain_outbox.sql` migration); trio deps lock intact (package.json.hbs untouched). DO-NOT-TOUCH respected (no audit-outbox templates, no backend/services/*).

## What the brief asked vs. authoritative tracker state

The brief framed 4 issues as one mold pass. Verified state on entry:

- **#354 — CLOSED** (PR curaos#200). The `--orm=mikro-orm` tier (CLI + @turbo/gen interactive + trio + snapshot tests, gate 811/0) already shipped. BUT a **residual live defect** remained: the two ORM-neutral outbox files (`templates/service-core/src/db/audit-outbox.service.ts.hbs` + `src/audit/audit-chain-head.store.ts.hbs`) hardcode `import { sql } from 'drizzle-orm'` and emit for BOTH tiers, while the mikro-orm `package.json.hbs` DROPPED `drizzle-orm`. So a `--orm=mikro-orm` scaffold imported a package its own package.json no longer declared → `Cannot find package 'drizzle-orm'` on `bun install` + typecheck/test OOTB. #354's close-gate transpiled each file in isolation but never asserted import↔dep coverage — the gap that let it ship. **Reproduced** in /tmp/repro354.
- **#355 — OPEN** (ready-for-agent). Items 1-3 remain: durable domain-outbox templates (~1140 LOC) + dynamic-engine-module `register()` seam + `src/index.ts` public-export barrel + surface-lock test. Item 4 (app.listen(0) socket leak) already landed via PR#200.
- **#360 — OPEN** (ready-for-agent). Duplicate/overlap of #355 item 1 (domain-outbox fold) from #339/#338.
- **#361 — OPEN bug** (ready-for-agent). domain-outbox `COALESCE(id, gen_random_uuid()::text)` casts TEXT into a uuid column → fails on real PG. **Already fixed in commerce-core** (commit `8b381fd`, the `::uuid` form). NOT yet in the mold because the mold has no domain-outbox template yet.

## Pass A — #354 residual fix (LANDED this PR)

**Decision (auto-applied per recommendation; opposite-harness grill item 6 + 7 confirmed: clear bug fix, NO user sign-off):**
The mikro-orm tier MUST KEEP the `drizzle-orm` RUNTIME dependency. The ORM-neutral outbox stores use `import { sql } from 'drizzle-orm'` purely as a SQL-fragment builder against an abstract `execute(query: unknown)` executor — no drizzle schema, no drizzle-kit at runtime. The live `commerce-core-service` (the ONLY real mikro-orm tier service) keeps `drizzle-orm` (0.45.2) + has ZERO `@mikro-orm/*`/`@medusajs/*` deps — proving the outbox layer stays drizzle-sql-builder regardless of tier (reuse-DRY; [[curaos-orm-rule]] = Drizzle for all neutral/infra, MikroORM only for clinical aggregate roots; ADR-0202 §6 = commerce embeds Medusa which owns MikroORM internally).

Mikro tier now: ADD `@mikro-orm/{core,postgresql,nestjs,migrations,cli}` + `@medusajs/{framework,medusa}`; KEEP `drizzle-orm`; DROP only the Drizzle MIGRATION TOOLCHAIN (`drizzle-kit` + `drizzle.config.ts` + `drizzle/**`). Drizzle default tier byte-identical.

Changes:
- `templates/service-{core,personal,business}/package.json.hbs` — `drizzle-orm` moved OUT of the `{{else}}` (drizzle-only) into the unconditional deps; mikro `{{#if}}` block now additive. Trio md5-identical (deps block `ee283983…`, devDeps block `7386b604…`).
- `__tests__/templates/orm-mikro-orm-mode.test.ts` — corrected the `drizzle-orm undefined` assertion → `=== '0.45.2'`; ADDED a **buildability lock** describe block (emit both tiers × full trio, assert every external src/test import is a declared dep — the #354 defect class) + a mikro-specific drizzle-orm regression lock.
- `__tests__/templates/{jose-esm-runtime-302,auth-scaffold}.test.ts` — fixed the `resolveOrmConditional` test helper to close `{{/if}}` from either mikro-drop OR else-keep mode (the deps block now has no `{{else}}`).
- `turbo/generators/config.ts` + `README.md` — corrected the "swaps drizzle / MikroORM-backed outbox" wording → "keeps drizzle-orm runtime SQL builder; drops migration toolchain only".

Gate (verbatim in PR + issue): codegen `bun test` 819/0; coverage 95.95% func / 94.60% line (≥90%); typecheck clean; lint exit 0 (pre-existing warnings only); turbo lint+typecheck+test 3/3; ci-gates-sync 10/0; depcruise 0 errors. Both tiers OOTB import↔dep verified (drizzle 5/5, mikro 6/6 declared).

## Pass B — DEFERRED (own lane). Why split (grill item 41 "Pass A + Pass B"):

1. **Scale:** domain-outbox = ~1140 LOC ×3 trio templates (name-agnostic generalization, NOT a copy — commerce prose must be stripped) + relay + module + barrel + surface-lock test + real-PG test.
2. **Unresolved architecture (grill item 4, biggest risk):** the domain_outbox migration lives under `drizzle/migrations/0002_domain_outbox.sql` — but `emitsForOrm()` DROPS the whole `drizzle/**` tree for the mikro-orm tier. So a domain-outbox folded via the drizzle migration path would NOT reach a mikro-tier service → it would typecheck but fail at runtime (no `domain_outbox` table). Needs an ORM-neutral migration path decision before folding (do NOT leave the table migration only under the dropped tree).
3. **Emitter extensions needed (grill items 23, 24):** `src/index.ts.hbs` does not exist; `emitBarrel()` only re-exports module/service — the public domain-outbox surface needs the emitter extended or a true template. `wireAppModule` inserts bare identifiers only — it cannot emit `{{Module}}.register()`, so the register-seam wiring needs an emitter extension.
4. **Generalization care:** the barrel + surface test are heavily commerce-specific (18 commerce topics, `OrderCreatedPayload`, etc.) — the mold version must be a GENERIC surface, not a port.
5. **Concurrent-worker collision:** a commerce-core-service fix worker is in-flight in that submodule (parent showed ` M backend/services/commerce-core-service`). Per [[curaos-generator-evolution-rule]] in-flight barrier, folding the same patterns while that lane is live risks divergence.

#361 ::uuid is already correct in the commerce-core SOURCE I'd port from (`gen_random_uuid()::text)::uuid`), so Pass B inherits the fix when it ports + must add the real-PG enqueue test.

Recommend: keep #355/#360/#361 `ready-for-agent`; dispatch Pass B as a dedicated lane after this PR merges + the commerce-core fix worker lands (resolve the drizzle-gated-migration question first).
