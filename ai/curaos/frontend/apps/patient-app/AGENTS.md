---
name: curaos-patient-app
description: "HealthStack patient portal (React Native + Expo mobile, React + Next.js web) - appointments, care plan, messaging, billing, white-label."
tags: [frontend, app, neutral]
language: typescript
framework: expo+next.js
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
recipe: ui.react-native+ui.react-next
adrs:
  - ADR-0099
  - ADR-0100
  - ADR-0106
  - ADR-0153
  - ADR-0209
overlay: healthstack
status: stub
target: native+web
phi: true
---

# curaos-patient-app (HealthStack)

> STUB: no code yet, real home = curaos/frontend/apps/patient-app/ (code dir is README-only until scaffolded).

Patient portal. Onboarding, appointments, care plan, messaging, billing. Mobile + web. PHI-compliant. White-label.

## Agent contract

Read workspace `AGENTS.md` first. PHI handling rules in CONTEXT.md are mandatory.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
expo start --filter=@curaos/patient-app          # mobile dev
turbo run dev --filter=@curaos/patient-app       # web portal dev
turbo run build --filter=@curaos/patient-app
turbo run lint --filter=@curaos/patient-app
turbo run test --filter=@curaos/patient-app
turbo run e2e --filter=@curaos/patient-app
```
