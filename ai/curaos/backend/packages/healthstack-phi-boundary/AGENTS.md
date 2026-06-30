---
name: curaos-healthstack-phi-boundary
description: "PHI-boundary verification harness (M12 #388) - the 6-layer-defense CI scan + runtime check proving PHI never leaves overlay schemas across the 5 clinical services. CI + test tooling, NOT a service."
tags: [package, healthstack]
language: typescript
framework: none
infrastructure: PostgreSQL (CNPG)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/healthstack-phi-boundary"
target: node
milestone: M12
story: M12-#388
adrs:
  - ADR-0108
  - ADR-0114
  - ADR-0115
  - ADR-0157
  - ADR-0212
rules:
  - curaos-reuse-dry-rule
  - curaos-repo-boundary-rule
  - curaos-ai-mirror-rule
  - curaos-healthstack-vision
  - curaos-local-ci-first-rule
---

# @curaos/healthstack-phi-boundary

The HIPAA-boundary gate for the M12 HealthStack overlay. Assembles the accepted-ADR
PHI-boundary controls (consent-phi-enforcement §3/§7) into one green gate proving
Epic AC #2 - *PHI never leaves the overlay schemas* (charter §5.2) - across the 5
M12 clinical services. See the repo `README.md` for the full 6-layer table +
operator runbooks.

## Hard rules

- **Not a service.** No NestJS app, no schema, no migrations. Shared CI + test
  tooling under `backend/packages/`.
- **Single PHI-vocabulary owner.** The PHI value regexes in `phi-detector.ts` are
  intentionally identical to the accepted audit-envelope scrub
  (`<service>/src/audit/audit-event.schema.ts`, M7-D5 / ADR-0212). If the audit
  patterns evolve, MIRROR them here - do not fork a weaker set.
- **Fail closed.** Every assertion (envelope, scrub, route-guard) rejects on doubt.
  The Opengrep runner uses `--error` so findings flip a non-zero exit.
- **Engine env-gated, logic always gated.** The live Opengrep/Semgrep, APISIX, and
  Presidio assertions skip when their tooling/env is absent; the RULE LOGIC + the
  negative test run regardless (bun test bucket).

## Layers (status)

| # | Layer | Status |
|---|---|---|
| 1 | PG schema-role isolation | operator runbook (live CNPG) |
| 2 | Service FHIR-only access | covered by Layer 4 import-ban |
| 3 | APISIX route guard | logic in-session; live gateway env-gated |
| 4 | Opengrep CI import-ban | in-session + negative test + `just ci` wired |
| 5 | Presidio egress scrub | wiring + double in-session; live sidecar env-gated |
| 6 | Reference-only event envelope | in-session across all 5 services |

## Commands

```bash
bunx turbo run typecheck --filter=@curaos/healthstack-phi-boundary
bunx turbo run test      --filter=@curaos/healthstack-phi-boundary
bunx turbo run build     --filter=@curaos/healthstack-phi-boundary
bun run phi-boundary-scan   # the Layer-4 CI gate (from curaos/ root)
```
