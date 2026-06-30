---
name: curaos-personal-tracking
description: "Location sharing UI - live map, share sessions, geofences, SOS (Expo mobile-primary, Next.js web viewer)."
tags: [frontend, app, personal]
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
  - ADR-0106
  - ADR-0153
  - ADR-0209
status: stub
target: native+web
---

# curaos-personal-tracking

> STUB: no code yet, real home = curaos/frontend/apps/personal-tracking/ (code dir is README-only until scaffolded).

Location sharing. Live map, share sessions, geofences, SOS alerts. Mobile-primary + web viewer.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
expo start --filter=@curaos/personal-tracking
turbo run dev --filter=@curaos/personal-tracking   # web viewer
turbo run build --filter=@curaos/personal-tracking
turbo run lint --filter=@curaos/personal-tracking
turbo run test --filter=@curaos/personal-tracking
```
