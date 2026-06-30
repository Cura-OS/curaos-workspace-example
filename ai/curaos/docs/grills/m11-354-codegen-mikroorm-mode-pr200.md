# Grill — curaos#200 (codegen `--orm=mikro-orm` tier + integration-test socket-leak fix)

> Cross-harness grill: Codex → Claude. PR `your-org/curaos#200`, branch
> `feat/codegen-mikroorm-mode-domain-outbox-folds`, HEAD `c1a57e6`. Issues #354 (MikroORM mode)
> + #355 item 4 (app.listen(0) fold). Grill 2026-06-03.
> HIGH-BLAST: codegen mold = generator for EVERY M11 service; MikroORM tier = W2 foundation.

## Verdict: MERGE-BLOCKED — 2 P1 + 1 P2

| ID | Sev | Finding | Fix |
|---|---|---|---|
| G-P1-1 | P1 | `turbo/generators/config.ts:574,603,663` — `--orm` flag absent from the @turbo/gen INTERACTIVE path. CLI (`index.ts`) threads + validates it, but the turbo-generate path has no `orm` prompt + no validator; `ctx.orm` referenced at :603 / branched at :663 is always `undefined` → interactive `turbo generate run service` ALWAYS emits Drizzle even when MikroORM intended, no error. | Add `orm` choice prompt (drizzle\|mikro-orm, default drizzle) to the generator prompts, validate with `isOrmTier`, fail-closed before addMany. |
| G-P1-2 | P1 | `templates/service-core/src/engine/medusa-engine.ts.hbs:93-102` — concrete MikroORM engine emits a STUB: discards the tx executor, returns a synthetic `medusa-pending` record. No Medusa call / no real write inside the forked-EM tx. A generated W2 service could enqueue/publish an order-created event for an order NEVER persisted → phantom event under failure/rollback, violates the outbox atomicity contract commerce-core just hardened. | Make the placeholder HONEST: either wire the real Medusa write through the tx-scoped EM behind a feature flag, OR `throw new NotImplementedError(...)` so callers don't silently trust phantom persistence. (The real MedusaCommerceEngine binds at the commerce-core composition root per #354 items 2/3/5 — the MOLD just needs a non-lying default.) |
| G-P2-1 | P2 | `__tests__/templates/orm-mikro-orm-mode.test.ts:60-62,117-156` — MikroORM suite is presence-only: default-drift assertions compare implicit-drizzle to implicit-drizzle on the SAME branch (not vs a stored pre-#354 fixture); dep assertions string-presence; RLS substring-match. A broken Nest/Mikro binding or default drift passes CI silently. | Store a pre-#354 rendered-tree snapshot + add `tsc --noEmit`/bootstrap smoke for `--orm=mikro-orm` output. Capture-as-foresight (not blocking). |

## Grilled CLEAN (verified by Codex)
- CLI flag plumbing (`index.ts:213-220,264-270,424-430`): rejects invalid `--orm` (incl. `prisma`), defaults drizzle, threads to Handlebars correctly.
- **Drizzle default byte-stable** vs main (no unintended drift) — the rolling-update/additive requirement holds.
- **Trio symmetry:** 3 new mikro-orm templates md5-identical across core/personal/business; package.json ORM-conditional symmetric.
- **RLS correctness (highest-stakes):** `set_config('app.tenant_id', $t, true)` is TRANSACTION-LOCAL — resets on commit/rollback, cannot leak across tenants at the PG level. Forked-EM path safe.
- `listen(0)` removed from all 6 integration templates (only explanatory comment remains; supertest binds getHttpServer()); m9-s2 P7 lock correctly asserts ABSENCE.
- gitleaks clean; typecheck exit 0; `await has no effect` cli.test.ts:51 = noise.
- 803/0 test claim: Codex sandbox blocked mkdtemp (563/218 = temp-dir isolation failures, NOT logic) — consistent with orchestrator's confirmed real-env 803/0.

## Scope (NOT findings)
#355 items 1-3 (durable domain-outbox template, dynamic register() seam, public-export barrel template) EXPLICITLY DEFERRED to a follow-up lane — worker correctly declined to half-port ~1140 LOC into the shared mold. Their absence is a known scope decision, not a defect.

→ §8 cycle-1 fix dispatched (G-P1-1 + G-P1-2; G-P2-1 → foresight). Serial on curaos checkout.
