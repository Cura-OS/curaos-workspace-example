---
name: curaos-clinician-app
description: "HealthStack clinician workspace (React Native + Expo mobile, React + Next.js web) - scheduling, tasks, clinical docs, orders, secure messaging."
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

# curaos-clinician-app (HealthStack)

> STUB: no code yet, real home = curaos/frontend/apps/clinician-app/ (code dir is README-only until scaffolded).

Clinician workspace. Scheduling board, task queues, clinical docs, orders/results, secure messaging. PHI-compliant.

## Agent contract

Read workspace `AGENTS.md` first. PHI handling rules in CONTEXT.md are mandatory.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
expo start --filter=@curaos/clinician-app         # mobile dev
turbo run dev --filter=@curaos/clinician-app      # web dev
turbo run build --filter=@curaos/clinician-app
turbo run lint --filter=@curaos/clinician-app
turbo run test --filter=@curaos/clinician-app
turbo run e2e --filter=@curaos/clinician-app
```
