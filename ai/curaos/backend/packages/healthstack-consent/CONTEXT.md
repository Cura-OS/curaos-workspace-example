# CONTEXT — @curaos/healthstack-consent

Integration map + decisions for the M12 #389 basic consent enforcement package.
Code lives in `curaos/backend/packages/healthstack-consent/` (this dir is the
agent-doc mirror, no code per [[curaos-repo-boundary-rule]] + [[curaos-ai-mirror-rule]]).

## What it is

The shared, reusable consent-enforcement primitives the M12 clinical
PHI-authoring services (encounter / clinical-doc / orders) wire identically. NOT
a service — a NestJS-injectable package under `backend/packages/`, the same shape
as `@curaos/healthstack-phi-boundary` (#388) and `@curaos/event-interceptors`.

## Module map

| File | Role |
|---|---|
| `consent.types.ts` | FHIR R4 `Consent` (M12-basic profile) + `ConsentDecision` model |
| `consent-store.ts` | `ConsentStore` interface + `InMemoryConsentStore` toggle projection |
| `consent-evaluator.ts` | pure decision fn — `deny` toggle → REJECT (read+write); default-provision policy = `permit` (opt-out toggle) |
| `smart-scope.ts` | SMART-on-FHIR v2 (CRUDS) + v1 verb scope matching |
| `bearer-scope.ts` | reads the `scope` claim off the already-verified bearer token (post-AuthGuard; no re-verify) |
| `requires-consent.decorator.ts` | `@RequiresConsent({ resourceType, action, patientRefFrom })` route metadata |
| `consent-observer.ts` | decision sink (audit + trace, default-on); `Noop` + `Recording` impls |
| `consent.guard.ts` | the in-process `ConsentInterceptor` analog — SMART scope → patient-ref → evaluate → REJECT(403)/PROCEED → emit |
| `consent.tokens.ts` | DI symbol tokens (`CONSENT_STORE` / `_EVALUATOR` / `_OBSERVER`) |
| `consent.module.ts` | `ConsentModule.register({ store?, observer?, evaluator?, global? })` — GLOBAL by default |

## Produces / Consumes (integration points)

- **Produces:** `ConsentDecision` events/metrics (to the injected `ConsentObserver`
  → audit-core reconciliation + trace spans); the `ConsentGuard` + `ConsentModule`
  surface the 3 services consume.
- **Consumes:** the patient `Consent` toggle (written by clinical-doc-service's
  `ConsentsService`, read from the shared `CONSENT_STORE`); the verified JWT
  `scope` claim (SMART scopes, identity-service / Keycloak, ADR-0104); the
  services' `request.principal` (stamped by their AuthGuard).
- **Wired into:** `curaos/backend/services/{encounter,clinical-doc,orders}-service/`
  — `ConsentModule.register()` in each `app.module.ts`, `ConsentGuard` in the
  feature controller's `@UseGuards(AuthGuard, RolesGuard, ConsentGuard)`,
  `@RequiresConsent(...)` on the clinical read/write routes.
- **Consent RESOURCE owner:** clinical-doc-service `src/consents/` (the
  `PUT /consents` toggle write path + `ConsentsService`), per
  fhir-resource-boundary §4.1.

## Files that must not break

- The 3 services' codegen-LOCKED auth templates (`auth.guard.ts`,
  `jwt-verifier.ts`, `roles.guard.ts`, `auth-matrix.test.ts`) — consent wiring
  does NOT touch them. SMART scopes are read off the bearer token by THIS package
  so the locked principal shape is untouched (no trio-template divergence,
  [[curaos-generator-evolution-rule]]).
- The mold-locked `whoami` / `health` / `protected` routes — the new
  `@Get(':id')` consent read route is declared AFTER them so it does not shadow.

## Key decisions

- **In-process guard, not a live HAPI server.** The CuraOS clinical services are
  NestJS apps; PHI access is gated at the controller. The `ConsentGuard` is the
  in-process analog of HAPI's `ConsentInterceptor` (same REJECT-blocks-writes
  semantics). A live HAPI FHIR JPA `ConsentInterceptor` is infra — its assertion
  is env-gated (skipped in CI, like the #388 live layers + #387 FHIR tests).
- **Default-provision = `permit` (opt-out).** Basic consent in M12 is an opt-out
  toggle layered behind AuthGuard + RolesGuard + tenant-scope + SMART-scope. A
  patient with no explicit `deny` has not withheld consent → PROCEED (HAPI default
  `ConsentOutcome.PROCEED`). 42 CFR Part 2 / TEFCA fail-closed (deny-by-default
  for Part-2 data) is Q9 — design-proposed, DEFERRED to compliance-review, OUT of
  M12 scope. The evaluator supports `defaultProvision: 'deny'` for when Q9 lands.
- **Global single-projection.** `register()` is GLOBAL so the toggle store is one
  app-wide singleton → a flip via the owned write path reflects in every
  `ConsentGuard` < 1s (the reflect invariant).
- **Generator-evolution.** The consent mechanism is folded into THIS shared
  package (DRY canonical owner). The per-service WIRING stays opt-in because
  consent applies only to healthstack PHI-authoring services, NOT neutral core
  services — folding the wiring into the base `service-core` mold would
  over-apply. A follow-up issue tracks an opt-in `--overlay=healthstack` codegen
  flag (new flag + template partial + snapshot test = multi-file codegen change).

## Verification

In-session proven (bun test + supertest, real Nest HTTP stack): toggle blocks
read+write across all 3 services; SMART scope required + honored; re-enable
restores + decision audited; < 1s reflect measured (including through the REAL
`PUT /consents` owned write path in clinical-doc-service). Live cross-service HAPI
assertion env-gated.
