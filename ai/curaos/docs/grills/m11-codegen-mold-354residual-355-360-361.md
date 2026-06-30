1. **missing questions**

- What migration path creates `domain_outbox` for `--orm=mikro-orm`? Current gating drops `drizzle.config.ts` + all `drizzle/**` for MikroORM ([config.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/turbo/generators/config.ts:156)), while `src/db/*` still emits for both tiers ([config.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/turbo/generators/config.ts:162)). This is the must-answer question.
- Is `register(engineProvider?)` meant for every tier, or only MikroORM? Default service templates have no engine/store token and only expose `status()` ([service.ts.hbs](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/templates/service-core/src/{{pluralize (kebabCase name)}}/{{pluralize (kebabCase name)}}.service.ts.hbs:10)). Commerce/CRM have custom provider seams; geospatial does not.
- Is domain-outbox infra default for all generated services, or only root producers? Recommendation: emit infra by default, but domain writes remain service-specific.

2. **docs/ADR conflicts**

- Keeping `drizzle-orm` in MikroORM tier conflicts with #354’s local recorded implementation, not with the higher-level outbox rule. #354 README says MikroORM swaps `drizzle-orm`/`drizzle-kit` for Mikro/Medusa deps ([README.md](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/README.md:78)); test locks assert no `drizzle-orm` ([orm-mikro-orm-mode.test.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/__tests__/templates/orm-mikro-orm-mode.test.ts:118)); config comments say “drops … drizzle-kit dep” and “MikroORM-backed outbox store” ([config.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/turbo/generators/config.ts:80)).
- Authoritative conflict: `curaos_orm_rule.md` says MikroORM is HealthStack clinical only ([curaos_orm_rule.md](/Users/dev/workspace/curaos-workspace/ai/rules/curaos_orm_rule.md:37)); ADR-0202 explicitly makes commerce-core Medusa/MikroORM ([0202 ADR](/Users/dev/workspace/curaos-workspace/ai/curaos/docs/adr/0202-cluster-commerce-sales-procurement-inventory.md:46), [0202 ADR](/Users/dev/workspace/curaos-workspace/ai/curaos/docs/adr/0202-cluster-commerce-sales-procurement-inventory.md:278)). Recommendation: amend rule/docs to name “embedded engine exception; outbox SQL builder remains `drizzle-orm`.”
- Geospatial docs are stale: they still say commerce masked the `::uuid` bug ([CONTEXT.md](/Users/dev/workspace/curaos-workspace/ai/curaos/backend/services/geospatial-core-service/CONTEXT.md:42)); commerce commit `8b381fd` now fixes it.

3. **glossary conflicts**

- “MikroORM tier” must not mean “no Drizzle package anywhere.” Better term: `drizzle-orm` is the runtime SQL-fragment builder for outbox stores; `drizzle-kit`/`drizzle.config.ts`/`drizzle/**` are the Drizzle migration toolchain.
- “MikroORM-backed outbox store” is wrong. The store is Postgres-backed and uses Drizzle SQL fragments against an abstract executor ([domain-outbox.service.ts](/Users/dev/workspace/curaos-workspace/curaos/backend/services/commerce-core-service/src/db/domain-outbox.service.ts:79)).
- “domain-outbox migration” is overloaded. Commerce has standalone `0002_domain_outbox.sql`; CRM/geospatial fold `domain_outbox` into domain migrations ([crm migration](/Users/dev/workspace/curaos-workspace/curaos/backend/services/crm-core-service/drizzle/migrations/0002_crm_domain.sql:113), [geospatial migration](/Users/dev/workspace/curaos-workspace/curaos/backend/services/geospatial-core-service/drizzle/migrations/0002_geospatial_domain.sql:78)).

4. **hidden deps/subtasks**

- Biggest risk: adding ORM-neutral `domain-outbox.*` templates while putting the table migration under dropped `drizzle/**`; MikroORM scaffolds would typecheck but fail at runtime with no `domain_outbox` table.
- `domain-outbox.{service,relay,module}` does not need an ORM-tier conditional; the migration path does.
- `src/index.ts.hbs` does not currently exist; `emitBarrel()` creates/merges only module/service exports ([barrel-emit.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/src/barrel-emit.ts:128), [live-emit.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/src/live-emit.ts:449)). Public domain-outbox exports require extending the emitter or adding a true template.
- `wireAppModule` can detect `XModule.register()` as already present, but its spec inserts only a bare identifier ([app-module-wire.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/src/app-module-wire.ts:123)). It cannot currently emit `{{Module}}.register()`.
- Trio trap: existing `src/db` trio symmetry is byte-locked ([audit-outbox-durability.test.ts](/Users/dev/workspace/curaos-workspace/curaos/tools/codegen/__tests__/templates/audit-outbox-durability.test.ts:103)). Domain-outbox comments copied from commerce/CRM/geospatial contain hardcoded service/downstream wording; must be name-agnostic.
- “meta snapshot” is not proven by commerce: commerce has `_journal.json` with `0002_domain_outbox`, but no `0002_snapshot.json`.

5. **prototype candidates**

- Emit `--orm=mikro-orm --core-only commerce`; assert package keeps `drizzle-orm`, drops `drizzle-kit`, keeps Mikro deps, and emits an applicable `domain_outbox` migration path.
- Emit drizzle + mikro for core/personal/business; run snapshot tests for package deps, domain-outbox files, app module `register()`, and barrel exports.
- Real-PG generated-service test: enqueue without explicit id; assert `COALESCE(${input.id ?? null}, gen_random_uuid()::text)::uuid` succeeds, mirroring commerce [domain-outbox.service.ts](/Users/dev/workspace/curaos-workspace/curaos/backend/services/commerce-core-service/src/db/domain-outbox.service.ts:485) and live PG test [domain-outbox-pg.test.ts](/Users/dev/workspace/curaos-workspace/curaos/backend/services/commerce-core-service/test/integration/domain-outbox-pg.test.ts:73).
- Diff commerce/CRM/geospatial domain-outbox files to extract common invariant, not commerce prose.

6. **decision points with recommended answers**

- #354 residual fix: keep `drizzle-orm` runtime dependency in both tiers; drop only `drizzle-kit` and Drizzle config/schema/migration tree for MikroORM.
- User signoff for that fix: no. It is a clear bug fix to make hardcoded emitted imports installable, not a reversal requiring approval.
- Domain-outbox migration for MikroORM: do not leave it under `drizzle/**` only. Emit equivalent SQL through an ORM-neutral migration path or MikroORM migration path.
- Register seam: do not copy `engineProvider?` blindly across all tiers. Use `register(outboxOptions?)` generically, and only add an engine/provider seam where a generated token actually exists.
- Landing strategy: split. Pass A = #354 dependency/docs/test correction. Pass B = domain-outbox/register/barrel/migration fold-back with emitted-artifact proof across both ORM tiers and all three layers.

7. **genuine user-escalation candidates**

- None for keeping `drizzle-orm` in MikroORM tier.
- Escalate only if implementer wants to remove current #354 Mikro/Medusa deps, change the commerce MikroORM exception in ADR/rules, or intentionally ship MikroORM-tier services without a `domain_outbox` migration. Those are policy/design changes, not residual bug fixes.

