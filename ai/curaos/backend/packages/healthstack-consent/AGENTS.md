---
name: curaos-healthstack-consent
description: "Basic consent enforcement (M12 #389) - FHIR R4 Consent toggle + in-process ConsentInterceptor analog (REJECT blocks reads+writes) + SMART-scope verification, wired across the clinical PHI-authoring services (encounter / clinical-doc / orders). Shared NestJS guard + store + decision-event primitives; the Consent FHIR resource itself is owned by clinical-doc-service."
tags: [package, healthstack]
language: typescript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/healthstack-consent"
target: node
milestone: M12
story: M12-#389
adrs:
  - ADR-0104
  - ADR-0115
  - ADR-0157
  - ADR-0212
rules:
  - curaos-reuse-dry-rule
  - curaos-repo-boundary-rule
  - curaos-ai-mirror-rule
  - curaos-healthstack-vision
  - curaos-generator-evolution-rule
  - curaos-local-ci-first-rule
---

# @curaos/healthstack-consent

The basic consent gate for the M12 HealthStack overlay. Assembles the accepted-ADR
consent stack (consent-phi-enforcement §5.1, ADR-0115 §4.14.3) into the shared,
reusable primitives the clinical PHI-authoring services wire identically:

- **FHIR R4 `Consent`** (`consent.types.ts`) - the patient toggle resource.
- **`ConsentGuard`** (`consent.guard.ts`) - the in-process HAPI
  `ConsentInterceptor` analog; a `deny` toggle REJECTs reads AND writes
  (HAPI 8.x parity, ADR-0115 §4.1.1).
- **SMART-on-FHIR scopes** (`smart-scope.ts` + `bearer-scope.ts`) - app
  authorization, composes with consent (NOT a substitute).
- **BPPC** (`Consent.policyRule`) - legacy HIE interchange, carried.

Composed, not substituted. M12 = BASIC consent (Epic AC #3): a patient toggle
blocks data flows, reflected in service responses < 1s. Granular per-purpose
`Consent.provision` (Consent v2) = M14, OUT of scope.

## Hard rules

- **Shared primitives, opt-in wiring.** The package is the canonical owner of the
  consent mechanism (reuse/DRY). Each clinical service OPTS IN by importing
  `ConsentModule.register()` (global) once at `app.module.ts` and listing
  `ConsentGuard` in `@UseGuards(...)` + `@RequiresConsent(...)` on its clinical
  read/write routes. Neutral core services do NOT wire consent.
- **Single projection.** `ConsentModule.register()` registers GLOBAL so the
  toggle store + guard are app-wide singletons. The `Consent` write path
  (clinical-doc-service) and every `ConsentGuard` share ONE store - a flip
  reflects everywhere (< 1s reflect invariant).
- **REJECT blocks reads AND writes.** HAPI 8.x parity. A `deny` toggle 403s both.
- **Consent self-management never deadlocks.** The guard skips the data-flow
  toggle when the target resource IS `Consent` - you must always be able to
  re-grant; SMART `Consent.write` + RBAC still gate the write.
- **Resource ownership.** The `Consent` FHIR resource + its write/toggle path are
  owned by clinical-doc-service (fhir-resource-boundary §4.1). This package holds
  only the shared ENFORCEMENT primitives.
- **References only.** The decision the guard emits carries references, never PHI
  values (ADR-0212) - safe for the reference-only audit envelope + trace spans.
- **Live HAPI env-gated.** A live HAPI FHIR JPA `ConsentInterceptor` is infra; the
  in-process logic + unit/integration tests run with test-doubles always, the
  live cross-service assertion is operator/env-gated (like #388/#330).

## Commands

```bash
bunx turbo run typecheck --filter=@curaos/healthstack-consent
bunx turbo run test      --filter=@curaos/healthstack-consent
bunx turbo run build     --filter=@curaos/healthstack-consent
```

See [CONTEXT.md](CONTEXT.md) for the integration map + decisions and
[Requirements.md](Requirements.md) for the charter + acceptance criteria.
