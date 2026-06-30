---
name: curaos-personal-notes
description: "Personal note-taking - rich-text editor, tagging, offline sync (React + Next.js web, Expo mobile)."
tags: [frontend, app, personal]
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
  - ADR-0153
  - ADR-0209
status: stub
target: web+native
---

# curaos-personal-notes

> STUB: no code yet, real home = curaos/frontend/apps/personal-notes/ (code dir is README-only until scaffolded).

Note-taking. Notebooks, rich-text editor, tagging, reminders, offline sync. Web + mobile.

## Agent contract

Read workspace `AGENTS.md` first.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Commands (planned, do not import)
```bash
turbo run dev --filter=@curaos/personal-notes
turbo run build --filter=@curaos/personal-notes
turbo run lint --filter=@curaos/personal-notes
turbo run test --filter=@curaos/personal-notes
```
