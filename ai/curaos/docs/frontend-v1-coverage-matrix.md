# Frontend v1 Coverage Matrix + Plan to Full Done-Criteria Parity

Measured 2026-06-16 (fe-v1-coverage-matrix workflow). First run measured 8/22 apps (14 rate-limited, re-measured via fe-v1-coverage-rerun). The cross-cutting findings below are confirmed across every app that ran and are generator-level (replicated fleet-wide), so they hold regardless of the per-app rows still being filled in.

## Headline (honest, measured)

- **Avg Done-criteria actually met: ~9%** (apps with full data ranged 18-32%).
- **0 / 22 apps wired to a real backend** - every app reads seed/mock data and every write fires `toast() + local React state`, never POSTing.
- **0 / 22 apps have any E2E** (no Playwright config, dep, or `e2e/` dir anywhere).
- **0 / 22 apps have complete i18n** - `LocaleProvider` is pinned to `'en'`, no `ar` bundle, no `dir=rtl`.

"Shipped" previously meant: UI shell renders + Helm chart + health route exist. It did NOT mean functional. The apps are UI shells with no backend writes.

## The dominant defect (single, generator-level)

Across every measured app the failure mode is identical and is NOT missing code - it is missing CALL SITES:
- The UI is built (canvas, wizards, signature pads, recipe builders, dashboards) and interacts locally.
- Generated `src/actions/*-service.ts` server actions EXIST.
- The `adminRequest` layer CAN reach a gateway when `NEXT_PUBLIC_API_BASE_URL` is set.
- But the UI never invokes the actions. Every mutation ends in a toast + `setLocal()`.

Fix once in the emitter (`curaos/tools/codegen/src/ui-app-emit.ts`), regenerate all apps - per [[curaos-generator-evolution-rule]].

## Backend runnability (drives wire-live vs contract-mock)

Only **3 of 9 probed services boot**:
- `workflow-core-service` - runnable (needs Temporal + Postgres via docker-compose.dev.yml). 5 real controllers.
- `scheduling-service` - runnable (JWT + Postgres). 4 auth-guarded controllers; domain layer still thin (`status()->ok`). **Name drift: Requirements say `healthstack-scheduling-service`.**
- `notify-service` - runnable (in-memory, JWT env). 7 route handlers incl. an **SSE `/notifications/stream`** - reuse for live queue/messaging instead of inventing a WS.

Not runnable / nonexistent: `automation-core-service` (0 LOC scaffold), `business-automation-service` (0 LOC), `consent-core-service` (0 LOC; dir is `healthstack-consent-service`), `healthstack-billing-service` (does not exist; claims != billing), `healthstack-messaging-service` (does not exist).

Service-name drift in Requirements vs real dirs needs a reconciliation pass so frontend `neededServices` slugs resolve.

## Phased plan to full Done-criteria parity (leverage order: generator first)

Generator-evolution barrier: Phases 1-3 touch codegen + the `@curaos/forms`/`@curaos/fhir-client` SDK lanes. Downstream per-app build (Phases 4-5) is blocked while a codegen/SDK lane is in flight - every app would otherwise inherit the defect the codegen fix removes. Sequence is mandatory.

### Phase 1 - Generator: real write-path wiring (highest leverage)
Emit submit handlers that call the generated `create*`/`update*` actions; toast becomes the success callback, not a substitute. Emit a `publish*` action (workflow-designer needs `publishWorkflow(id, graph)` POSTing the full FlowGraph). Make `mockWrite()` return a typed echo so mock + live success paths are identical (live<->mock = a `NEXT_PUBLIC_API_BASE_URL` flip). Regenerate all apps.

### Phase 2 - Generator: required deps + real read-path queries + i18n
Add `@curaos/forms` (form-from-schema for property panels / intake) + `@curaos/fhir-client` (FHIR apps) to emitted package.json + wire them. Emit reads as `useQuery` against the service with `page`/`pageSize`/`search` threaded through, not `seed.ts`. Emit `LocaleProvider` with multi-locale + `ar.json` stub + `dir=rtl`; unlock the `Locale` type.

### Phase 3 - Generator: E2E scaffold
Add `@playwright/test`, emit `playwright.config.ts` + `e2e/` smoke specs per app archetype from the Done-criteria happy path; wire the `e2e` script. Verify `bun run e2e` passes per regenerated app.

### Phase 4 - Per-app depth (cannot be generated)
App-specific business flows: workflow-designer BPMN import/export + ServiceCall connector picker; front-office full `/check-in` route (0% today, core criterion) + appointment-shaped schema + live queue via notify SSE + consent signature serialization; business-automation approval gate + env-promotion + persisted connector install; and the equivalents for the remaining apps once measured.

### Phase 5 - Backend prerequisites (parallel, gates Phase 4 live verification)
Author TypeSpec contracts for the 6 missing/empty services (4 have NO spec - that is the true critical path), generate contract-mocks, reconcile name drift, then scaffold the services. Apps depending only on workflow-core/scheduling/notify can go fully live in Phase 4 now.

## Backend-runtime recommendation: hybrid
- Stand up the **live compose plane** (workflow-core + scheduling + notify) now; prove the Phase 1 wiring fix against real HTTP for those apps.
- **Contract-mock from specs** for the 6 missing/empty services; author the missing TypeSpec contracts first. Phase 1's identical mock/live success path makes the swap a config flip, not a rewrite.
- Do NOT build full backends just to unblock frontend wiring - wire to a contract (live or mocked) identically.
