---
name: curaos-bun-primary-rule
title: Bun primary
description: Bun is primary JS runtime + package manager + bundler + test runner across CuraOS; pnpm only fallback when Bun cannot do the job
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User correction (2026-05-24):

## The rule

**Bun is primary. pnpm is fallback only when Bun cannot.**

Applies to:
- Runtime (Node ALT) - Bun runs NestJS apps + tests + scripts directly
- Package manager - `bun install`, `bun add`, `bun remove`
- Workspaces - Bun workspaces (since v1.1+ stable)
- Bundler - `bun build` for app bundles
- Test runner - `bun test` (Jest-compat)
- Script runner - `bun run`
- **Package binary executor - `bunx <pkg>` (NEVER `npx`, NEVER `npm i -g <cli>`)**
- Lockfile - `bun.lock` (text) or `bun.lockb` (binary)
- Hot reload - `bun --hot`
- Monorepo orchestration - Turborepo on top of Bun workspaces (Turborepo runtime-agnostic)

## When pnpm is fallback

Use pnpm ONLY when Bun lacks support:
- Native binaries that Bun's symlink hoisting breaks (rare; check current Bun version first)
- Packages requiring strict pnpm-specific resolver behavior (e.g., side-effects-free pnpm v9 graph isolation when an upstream lib hard-codes pnpm assumptions)
- React Native + Expo if Expo monorepo template hasn't migrated to Bun (CHECK Expo SDK 52+ Bun support - was experimental as of 2025; if production-ready, prefer Bun)
- Docker base images where Bun isn't pre-installed and adding it bloats image (rare; oven/bun image is small)

## Frontend workspace rule

Bun workspaces are canonical for frontend and backend packages. Expo/React Native docs may show pnpm/yarn/npm workspaces as external examples; agents must translate those examples to Bun unless a checked-in package proves Bun cannot run that exact workflow. Any `pnpm` reference outside an explicit fallback note is docs drift.

## Behavior change

When writing any:
- `package.json` - use `"packageManager": "bun@1.1.x"` + Bun scripts
- README/docs - show `bun install` first; `pnpm install` only as Bun-fails fallback
- Codegen recipe templates - emit Bun-first
- CI workflows - use `oven-sh/setup-bun` action
- Dockerfile - use `oven/bun:1` base image
- Tests - `bun test` not `vitest`/`jest` unless project specifically needs vitest API features

Any doc files written with pnpm references need correction. Track remaining sweep via GitHub Issues, not in this always-loaded rule.

<!-- fold: rationale, non-binding -->

## `bunx` replaces npx + global npm installs

Use `bunx <pkg> <args>` instead of `npx <pkg>` or `npm i -g <pkg> && <pkg>`. Faster cold start, no global pollution, no version drift.

| Wrong | Right |
|---|---|
| `npm i -g @nestjs/cli && nest new project-name` | `bunx @nestjs/cli new project-name` |
| `npx create-next-app@latest my-app` | `bunx create-next-app@latest my-app` |
| `npm i -g typescript && tsc --init` | `bunx tsc --init` |
| `npx drizzle-kit generate` | `bunx drizzle-kit generate` |
| `npm i -g turbo && turbo build` | `bunx turbo build` (or via workspace dep + `bun run build`) |
| `npx playwright install` | `bunx playwright install` |
| `npm i -g typespec-cli && tsp compile` | `bunx tsp compile` |
| `npx changeset` | `bunx changeset` |
| `npm i -g pm2` | `bunx pm2 start ...` (or use container) |
| `npx @anthropic-ai/claude-code` | `bunx @anthropic-ai/claude-code` |

Rules:
- Never install a CLI globally - always invoke via `bunx`
- Project deps stay in `package.json devDependencies` and run via `bun run <script>` instead of repeated `bunx`
- Documentation, READMEs, codegen recipes, CI workflows, ai-docs, ADRs MUST show `bunx <pkg>` form for one-off invocations
- `bunx -p <pkg> <bin>` when package name differs from binary name
- Same fallback rule applies: if Bun cannot run the package, use `pnpm dlx <pkg>` (pnpm fallback), THEN `npx` as last resort

## How package.json declares

```jsonc
{
  "packageManager": "bun@1.1.x",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "bun --hot run src/main.ts",
    "build": "bun build src/main.ts --target=node --outdir=dist",
    "test": "bun test",
    "start": "bun run src/main.ts"
  },
  "dependencies": {
    "@curaos/ui": "workspace:^"
  }
}
```
