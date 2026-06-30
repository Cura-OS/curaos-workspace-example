# Codex grill — M10-274 settings-service scaffold (planning grill, pre-PR)

**Harness:** Codex (default model, ChatGPT-account auth — `gpt-5-codex` unsupported, fell back to default model per worker brief), `model_reasoning_effort=high`, `--sandbox read-only`.
**Date:** 2026-06-01
**Scope:** Pre-implementation adversarial planning review of issue ai-workspace#274 + ADR-0201 §3.4 + the two generator gaps (plain-name + pluralization) the worker plans to fold back into `curaos/tools/codegen`.
**Verdict:** APPROVE-WITH-CONDITIONS — plan is sound; fold both gaps into the generator (not local rename); flag name must be `--plain-service` (not `--single`/`--core-only`); protect existing ai-docs from `emitMirror` overwrite; serialize the codegen branch ahead of the 6 concurrent scaffold workers.

## 1. Missing questions
- `UNVERIFIED`: live `#274` body/labels — verify no acceptance criteria beyond local ADR/docs. (Worker verified directly: issue body matches ADR-0201 §3.4; see closeout.)
- Namespace JSON Schema storage for `POST /admin/settings/schema/{namespace}` — needs durable store.
- Cache key shape: ADR `settings:{tenant_id}:{key}` lacks user dimension; user overrides need a user-scoped key or split caches.
- User reset: ADR has `DEL /settings/tenant/{key}` only; no `DEL /settings/user/{userId}/{key}`.
- `settings_audit`: simple immutable hash rows vs hash-chained — ADR says old/new hashes, Requirements says hash-chained.
- Flag event transport: ADR lists "Kafka topics"; Requirements says `flag.toggled` is NATS JetStream (low-latency path per §3.4.6).
- Air-gap flag path: ADR-0110 has Unleash Edge + OCI snapshots; settings docs name only Unleash server + SDK.

## 2. docs/ADR conflicts
- Plain service names canonical for M10 shared services: ADR-0201 §1 + `.gitmodules` = `settings-service` etc.; generator emits `<name>-core-service`. → generator gap, fold back.
- `--core-only` semantically bound by AUTO-DECISION-LOG #247 to party/org/audit core roots; do NOT reuse it for plain M10 services. → new flag required.
- ADR-0110 OpenFeature abstraction vs ADR-0201 `unleash-client` embedded: resolve by making settings-service the SOLE flag SDK boundary; consumers do not embed flag SDKs.
- OpenBao: ADR-0201 §2.8 secrets never env vars; prefer OpenBao-injected runtime config.
- **Mirror-doc overwrite hazard**: `ai/curaos/backend/services/settings-service/*` already has rich docs; generator `emitMirror` overwrites when bytes differ. → MUST protect.

## 3. glossary conflicts
- "single-root" ≠ always `-core-service` (#247 = core-only; M10 settings = plain shared service).
- "settings" already plural → generated `settingss` invalid. → pluralization fix.
- "feature flag override" = settings-service tenant/user resolution layer, not direct Unleash mutation.
- "OPA hooks" = write-policy enforcement for `policy_protected` keys, not a replacement for the Guard→Cerbos→OPA route chain.
- `settings_audit` (local write ledger) ≠ audit-outbox (event durability). Keep separate.

## 4. hidden deps/subtasks
- Codegen plain mode touches `config.ts`, `index.ts`, `live-emit.ts`, `template-plan.ts`, `post-scaffold-plan.ts`, templates, agent-doc templates, snapshot tests.
- Pluralization fix covers dry-run path rendering, live Handlebars helpers, app-module wire specs, barrel exports, class names, filenames, tests.
- Protect existing settings ai-docs before live generation (skip mirror writes OR code-only mode).
- Add deps: `unleash-client`, `opa-wasm`, `ioredis`/Valkey client, `@nestjs/microservices`, `@nestjs/schedule`, Testcontainers.
- TypeSpec + AsyncAPI + SDK/contracts follow REST/event shape; generated CRUD routes are not the source of truth.
- Outbox tx must include setting write + `settings_audit` + domain event enqueue atomically.
- Concurrency: treat 6-worker claim as live; serialize codegen branch first.

## 5. prototype candidates
- Codegen dry-run: `settings --plain-service` emits `backend/services/settings-service`, `@curaos/settings-service`, no `-core-service`.
- Plural helper snapshot: `patient -> patients`, `settings -> settings`; assert no `settingss`.
- Resolution prototype: default → tenant → user; cache key shape; invalidation events.
- Flag provider prototype: mock Unleash + Valkey; prove consumers need no SDK.
- Tx prototype: failed event enqueue rolls back setting write + `settings_audit`.

## 6. decision points WITH recommended answers (auto-applied per recommendation-auto-apply-rule)
- Plain-name: **fold into generator** (local rename leaves package/docs/Dockerfile/mirror/app-module wrong).
- Flag name: **`--plain-service`** (avoid `--single`; "single-root" means `-core-service` per #247).
- Concurrent workers: **serialize codegen branch first**; pause/regenerate dependent scaffolds after codegen PR lands (generator in-flight barrier).
- Pluralization: **fix now** with plural helper + snapshots; existing services unaffected unless regenerated.
- CRUD scaffold fit: **use scaffold for NestJS/auth/Drizzle/audit-outbox shell; replace generic CRUD with domain modules** (settings, flags, admin, cache, policy, consumers). Generic CRUD logic mostly discarded.
- Unleash: **SDK only inside settings-service**; consumers call REST or Valkey.
- Audit-outbox: **reuse generated outbox template**; no direct Kafka/NATS publish from controllers.
- Service layers: **plain `settings-service` only**; no personal/business settings layers.

## 7. genuine user-escalation candidates
- None from local docs/code for the choices above.
- Escalate only if live `#274` contradicts ADR/docs, schema/data DROP needed, prod flag/OPA cutover required, or user wants workers to proceed while the codegen fix is in flight.

---

## Code grill (post-implementation, 2026-06-01)

**Harness:** Codex (default model, ChatGPT-account auth), `model_reasoning_effort=high`, `--sandbox read-only`. Adversarial review of the implemented scaffold working tree.
**Verdict:** APPROVE-WITH-CONDITIONS — no auth bypass / no raw-value-on-wire / migration applies clean / resolution order correct; the flagged P0/P1 are scaffold-vs-full-impl gaps, the high-value subset fixed inline.

### P0 — policy_protected writes not enforced (controller comment claimed OPA routing; code did not)
- **Disposition: FIXED.** `SettingsService.setTenant` now denies a `policy_protected` key fail-closed (`ForbiddenException`) until the OPA-WASM composition adapter binds; comment corrected. Test added (deny + allow).

### P1 — addressed/dispositioned
- `upsertUser` missing `actorId` while `settings_audit.actor_id NOT NULL` → **FIXED**: `actorId` threaded through `upsertUser` + `setUser` + controller (JWT-derived, == userId after `assertSelf`).
- `feature_flag_overrides UNIQUE(tenant_id, flag_key)` allowed duplicate platform defaults (PG NULLs distinct) → **FIXED**: `unique(...).nullsNotDistinct()` + migration `NULLS NOT DISTINCT`.
- `POST /admin/settings/schema/{namespace}` missing from §3.4.5 surface → **FIXED**: added `SettingsAdminController` + `registerNamespaceSchema` port method.
- DI binds `InMemorySettingsRepository`; no Drizzle adapter → **ACCEPTED (scaffold)**: the Drizzle adapter binding is a follow-up Story (documented in CONTEXT "Still TODO"); shell ships driver-free ports + local default. The Drizzle adapter MUST honor: `settings_audit` write inside the outbox/chain-head tx, `NULLS NOT DISTINCT`, actorId persistence.
- Local flag provider ignores tenant/user context → **ACCEPTED (shell)**: context-aware resolution is the Unleash SDK adapter's job; the local in-memory provider is a deterministic stub (params marked `_context`).

### P2 — addressed/dispositioned
- `hashValue` used raw `JSON.stringify` (key-order-sensitive) → **FIXED**: canonical JSON (recursive key sort); test added.
- `reason` accepted but dropped → **ACCEPTED (follow-up)**: audit-context persistence lands with the Drizzle adapter.
- Domain-route auth coverage (body-smuggle / cross-user) → **ACCEPTED (follow-up)**: scaffold keeps the auth-matrix on health/protected; domain-route auth tests land with the Drizzle adapter Story.

### What the implementation got right (Codex, verbatim summary)
1. Event envelope carries `value_hash` only — no raw config value/secret on the wire.
2. Controller derives tenant/actor from the JWT principal, never the body; `.strict()` Zod rejects smuggle.
3. `assertSelf` cross-user guard on user-preference read/write.
4. Resolution order user→tenant→default correct + tested.
5. Migration `0001` applies after `0000` without duplicating schema/`audit_outbox`.
