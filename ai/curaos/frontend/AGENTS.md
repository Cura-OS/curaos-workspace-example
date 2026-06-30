---
name: curaos-frontend
description: CuraOS frontend workspace - React Native (Expo) mobile apps + Next.js web apps + shared packages on Bun runtime.
tags: [index, frontend]
language: typescript
framework: 
  - react-native
  - expo
  - nextjs
infrastructure: none
tooling:
  - bun
  - expo
  - turborepo
  - metro
  - next
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
runtime: bun
build: turborepo
---

# curaos-frontend

React Native (Expo SDK 52+) mobile apps + Next.js 14+ App Router web apps + shared TypeScript packages on Bun runtime. Bun primary per [[curaos-bun-primary-rule]].

## Mandatory baseline

- **Mobile:** React Native + Expo SDK 52+ + Metro Fast Refresh.
- **Web:** Next.js 14+ App Router (Fast Refresh); Astro for static sites.
- **Runtime:** Bun primary; npm/pnpm fallback only when Bun cannot.
- **E2E:** Maestro for all RN apps per [[curaos-rn-e2e-rule]]; Playwright for web/Astro. Detox fallback only.
- **Validation:** Valibot for RN bundle escape per [[curaos-validation-rule]]; Zod 4 elsewhere.
- **Build:** Turborepo workspace + Vercel Remote Cache per [[curaos-speed-patterns-rule]].

## Layout

```
curaos/frontend/
├── apps/       # *-app standalone deployables (each is a submodule)
└── packages/   # @curaos/* shared libs (workspace:*)
```

Mirror under `ai/curaos/frontend/` per [[curaos-ai-mirror-rule]]. No `curaos-apps/` wrapper dir - FORBIDDEN per AGENTS.md §1.

## Module agent contract

Cross-CLI agent contract for the frontend module. Frontmatter carries structured metadata (formerly `codex.json`). All CLI agents reading `AGENTS.md` (Codex, OpenCode, Cursor, Aider) consume natively; Claude Code via `@AGENTS.md` import. Read workspace `AGENTS.md` first.

## Companion documents

- [CONTEXT.md](CONTEXT.md) - current state
- [Requirements.md](Requirements.md) - module spec
