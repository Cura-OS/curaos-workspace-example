---
name: curaos-front-office
description: "HealthStack front-office portal (React + Next.js web, Expo tablet) - intake, booking, queue, billing, consent."
tags: [frontend, app, neutral]
language: typescript
framework: next.js+expo
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
recipe: ui.react-next+ui.react-native
adrs:
  - ADR-0106
  - ADR-0121e
  - ADR-0153
  - ADR-0209
overlay: healthstack
status: stub
target: web+native
phi: true
---

# curaos-front-office (HealthStack)

> STUB: no code yet, real home = curaos/frontend/apps/front-office/ (code dir is README-only until scaffolded).

Front-office portal. Patient intake, booking, queue management, billing, consent. Web desk + tablet kiosk.

## Agent contract

Read workspace `AGENTS.md` first. PHI handling rules in CONTEXT.md are mandatory.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/front-office
turbo run build --filter=@curaos/front-office
turbo run lint --filter=@curaos/front-office
turbo run test --filter=@curaos/front-office
turbo run e2e --filter=@curaos/front-office
expo start --filter=@curaos/front-office       # tablet kiosk dev
```
