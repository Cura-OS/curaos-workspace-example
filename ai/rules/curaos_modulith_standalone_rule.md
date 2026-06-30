---
name: curaos-modulith-standalone-rule
title: Modulith + standalone duality
description: Every CuraOS app/package/service must run BOTH as standalone (cloned alone) AND as part of the modulith monorepo composition
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-24, ADR-0099 §5 reinforcement):

## The rule

Every CuraOS submodule (app, package, service) MUST be runnable in TWO modes from same source:

1. **Standalone mode** - when cloned alone (single git repo), without the parent monorepo
   - `pnpm install` / `npm install` resolves shared `@curaos/*` libs from Verdaccio npm registry (per ADR-0209)
   - `pnpm start` / `pnpm dev` boots service/app directly
   - Customer can buy a single service (e.g., CuraOS Auth) and run it without ever touching the monorepo
   - Aligns with [ADR-0099 §4 each-service-is-a-product](https://github.com/your-org/curaos-ai-workspace/blob/main/ai/curaos/docs/adr/0099-charter-priorities-vision.md)

2. **Modulith mode** - when inside curaos parent monorepo (via submodule init)
   - pnpm workspace protocol (`workspace:*`) resolves shared libs from sibling `packages/` directories
   - Turborepo (per ADR-0209 + Wave 6 research) orchestrates cross-package builds + test pipelines
   - Hot-reload across packages during dev
   - All services + apps composable as bundled deployment
   - Aligns with [ADR-0099 §5 two-mode runtime topology](https://github.com/your-org/curaos-ai-workspace/blob/main/ai/curaos/docs/adr/0099-charter-priorities-vision.md)

## What this means going forward

- Every NestJS service `package.json` uses `workspace:*` for `@curaos/*` deps
- Every published `@curaos/*` lib has standalone npm registry version (Verdaccio internal, public optional)
- Every codegen recipe (per ADR-0153) MUST emit `package.json` with workspace protocol
- Documentation per service must show BOTH:
  - "Standalone install: `git clone <single-repo> && pnpm install && pnpm start`"
  - "Modulith install: covered by parent monorepo's `pnpm install` at root"
- Test pipelines must verify standalone-mode boot per service/package

## Behavior change

When writing or reviewing any service/package config:
- Confirm `package.json` uses `workspace:*` for internal deps
- Confirm standalone clone works (no hard-coded relative paths to siblings; no assumption of monorepo)
- Confirm `tsconfig.json` paths use package names, not relative paths
- Confirm test setup boots without monorepo

Same rule applies to BACKEND (NestJS services) AND FRONTEND (React/RN apps + packages).

<!-- fold: rationale, non-binding -->

## How `package.json` should declare dependencies

```jsonc
{
  "dependencies": {
    // Use workspace protocol when in monorepo; resolves to registry version standalone
    "@curaos/ui": "workspace:^",
    "@curaos/api-client": "workspace:^"
  }
}
```

pnpm handles this duality automatically when publishing (`workspace:^` → `^1.2.3` at publish time).

## How modulith runtime topology works (per ADR-0099 §5)

- Single deployable mode: all services bundled as ONE NestJS app with modules-per-service
- Microservices mode: each service shipped as own container; sidecar/transport between
- Runtime mode flag (env var or Helm value) picks topology
- Same codebase, two outputs

## Wave 6 frontend structure confirmation

The `frontend/apps/* + frontend/packages/*` structure (per Wave 6) supports both modes:
- Standalone: clone single `apps/admin-app` repo, `pnpm install`, run
- Modulith: clone curaos monorepo recursively, pnpm workspace resolves siblings, Turborepo builds all
