# ADR-0219: Frontend v1 functional parity program (real wiring + depth + E2E)

Status: Accepted (2026-06-16)
Target Version: v1
Extends: ADR-0216 (web fleet build-out), ADR-0218 (Helm deploy), ADR-0153 (codegen recipe).
Supersedes the implicit "shipped = renders + chart" definition with "done = Done-criteria parity".

## Context

A measured coverage audit (`frontend-v1-coverage-matrix.md`, 2026-06-16) found the app fleet is ~14% of its per-app Requirements.md Done-criteria: 0/22 apps wired to a real backend at the FLAGSHIP layer, 0/22 with E2E, 0/22 with complete i18n/RTL. The generic generated CRUD path (`renderScreenForm` -> `renderActions` -> `adminRequest` -> live-or-mock) IS correctly wired and live/mock-swappable via `NEXT_PUBLIC_API_BASE_URL`; the gap is elsewhere:

1. Generic CRUD is THIN (name/status fields, one screen per integration row) vs rich domain Done-criteria.
2. Bespoke FLAGSHIP screens (workflow-designer publish, front-office check-in, business-* save) are hand-coded and toast-only, bypassing the wired generic pattern.
3. No Playwright E2E anywhere; the `e2e` script is referenced but unscaffolded.
4. i18n LocaleProvider is en-only; no `ar` bundle, no `dir=rtl`.
5. Two special cases: `personal-tracking` implements the wrong domain (habit tracker, not location/geofence/SOS); `hosted-login` is deprecated (superseded by auth-portal).

## Decisions

1. **v1 frontend scope = 21 apps.** `hosted-login` is DROPPED from v1 (deprecated). `personal-tracking` is REBUILT to its real location-sharing/geofence/SOS domain.

2. **Bar = full Done-criteria parity per app** (user directive 2026-06-16): real backend wiring (contract level), the domain depth each Requirements.md demands, Playwright E2E green, i18n en+ar(RTL), Lighthouse a11y >=90.

3. **Backend = contract-mock from specs** (user directive). No live infra in the build loop. Each service's OpenAPI/AsyncAPI spec is the contract; where a needed service has no spec (4 of the 6 non-runnable ones), author the TypeSpec contract first. Frontend wires to the contract; live<->mock is the `NEXT_PUBLIC_API_BASE_URL` flip. E2E true-end-to-end proof is deferred to the deploy phase.

4. **Generator-first, BOTH stacks, zero special edits (user directive 2026-06-16), per [[curaos-generator-evolution-rule]].** Any gap appearing in 2+ apps is a mold defect fixed once in `tools/codegen` then regenerated. The binding rule for this entire program: when filling a dependency or hitting ANY issue, the fix goes back into the generator (frontend `ui-app-emit` / `ui-app-native-emit` AND the backend service generator / TypeSpec-contract emitter) to cover that edge case, NOT into a per-app or per-service hand edit. Bespoke flagship screens + hand-built service bodies are the anti-pattern that produced the ~14% shells; they get folded into the generators and regenerated. Minimize, and aim to eliminate, any out-of-generator special edits in both backend and frontend. A per-app/per-service hand edit is allowed only when the logic is genuinely singular (cannot recur), and even then it must be justified in the issue + the generator gap noted as foresight. Every edge case discovered while building a backend or wiring a frontend app feeds back into the mold in the same change.

## Phases (leverage order; generator-level first)

- **P1 - Flagship rewire + schema depth (generator + per-app):** make bespoke flagship screens use the wired action pattern (form->action->adminRequest, toast = success callback not substitute); deepen the generic schema beyond name/status where the domain contract is known. Per-app for the bespoke screens, generator for the schema-from-contract path.
- **P2 - Real queries + required deps + i18n (generator):** reads as `useQuery` with page/pageSize/search threaded; add `@curaos/forms` + `@curaos/fhir-client` where Requirements specify; LocaleProvider multi-locale + `ar.json` + `dir=rtl`, unlock the `Locale` type.
- **P3 - E2E scaffold (generator):** emit `@playwright/test` + `playwright.config.ts` + `e2e/` smoke specs from each app's Done-criteria happy path; wire the `e2e` script.
- **P4 - Per-app domain depth:** the irreducible flows (workflow-designer BPMN i/o, front-office /check-in, business-automation approval/promotion, etc.) + the `personal-tracking` rebuild.
- **P5 - Backend contracts:** author TypeSpec contracts for the spec-less needed services; reconcile Requirements service-name drift so frontend `neededServices` resolve; generate contract-mocks; CI replay.

Sequence is enforced by the in-flight generator/SDK barrier: P4/P5 per-app dispatch waits while a P1-P3 codegen/SDK lane is in flight.

## Consequences

- "Done" is redefined to functional parity, not render+chart. The coverage matrix is the scoreboard; each phase moves measured % up.
- live<->mock parity (the existing `NEXT_PUBLIC_API_BASE_URL` flip) means the contract-mock decision does not block a later live cutover.
- Multi-week program; executed autonomously with check-ins at phase boundaries (user directive).

## Links
- `ai/curaos/docs/frontend-v1-coverage-matrix.md` (the measured scoreboard)
- Issues: #726 (frontend buildout epic), #730 (deploy artifacts, done)
- Rules: [[curaos-generator-evolution-rule]], [[curaos-rolling-update-rule]], [[curaos-triplet-split-rule]]
