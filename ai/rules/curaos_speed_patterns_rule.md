---
name: curaos-speed-patterns-rule
title: Speed patterns (generator-first Nx + Bun-native + Turborepo + Verdaccio + GHCR devcontainer)
description: Speed patterns - generator-first culture (Nx workspace generators + Copier copier update 3-way merge for cross-repo template sync + shadcn registry for frontend); TypeSpec → hey-api openapi-ts primary codegen (Orval alongside when MSW mocks needed); Turborepo Vercel Remote Cache (free) + Verdaccio self-hosted npm air-gap + BuildKit cache mounts + devcontainer pre-builds nightly to GHCR; Bun --hot for NestJS dev + watchexec for non-Vite tasks + Vite HMR frontend + Metro Fast Refresh RN/Expo; Full Bun-native (install 17x npm + test 15x Jest + bunx + --hot + bun build); headless agent CI runs (claude -p + codex exec + pi -p) for nightly dependency-upgrade + security-audit + doc-sync; GHCR pre-built devcontainer w/ Bun cache mount
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

DA12 2026-05-25 grounded [[curaos-repo-conventions-rule]] DA8 + [[curaos-quality-gates-rule]] DA7 + [[curaos-bun-primary-rule]].

## The rule

**Seven locked components:**

1. **Generator-first culture** - Nx workspace generators + Copier (3-way merge) + shadcn registry
2. **TypeSpec → hey-api** primary codegen pipeline + Orval when MSW mocks needed
3. **Turborepo Vercel Remote Cache** (free) + Verdaccio + BuildKit cache mounts + devcontainer pre-builds
4. **Bun --hot + watchexec + Vite HMR + Metro Fast Refresh** dev loops
5. **Full Bun-native** (install/test/bundle/runtime)
6. **Headless agent CI runs** (claude -p / codex exec / pi -p) for autonomous loops
7. **GHCR pre-built devcontainer** w/ Bun cache mount

## Banned

- Copy-paste service stubs (use Nx generator; drift across 91 submodules)
- `bun install` without lockfile pin (slopsquatting risk per [[curaos-verification-stack-rule]])
- Sequential Vitest runs in CI (shard 4× via `--shard=X/4`)
- Synchronous LLM eval runs when async-eligible (only when CLI harness supports Batch API per [[curaos-model-tiering-rule]])
- npm install at workspace level (use Bun per [[curaos-bun-primary-rule]])
- Husky-based hooks (use Lefthook per [[curaos-quality-gates-rule]])
- Per-dev local devcontainer setup (use GHCR pre-built)
- Cron agent w/o env var paths + output redirection (silent failures in cron)
- Generator-emitted AGENTS.md w/o human curation (auto-AGENTS.md = -4% perf per [[curaos-agents-md-schema-rule]])
- TypeSpec → manual hand-coded clients (use hey-api generator)
- Drizzle migrations hand-written (use `drizzle-kit generate` per [[curaos-orm-rule]])
- Frontend components copied between apps (use shadcn registry + private CuraOS registry)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| Generator-first | Copy-paste produces immediate drift across 91 submodules (CI configs, ESLint, Dockerfile patterns); generators enforce consistency |
| Copier `copier update` | 3-way merge between original template, current project, new template version - keeps 91 submodules on shared skeleton; CookieCutter lacks this |
| Nx generators graph-aware | Knows project graph; can add service + register event contracts in one command (Turbo `turbo gen` is Plop-only, no graph awareness) |
| shadcn registry | Components copied into project not installed; framework-agnostic; CLI v4 ships `--dry-run`/`--diff`/`--view` + shadcn/skills (agent context files); CuraOS hosts private registry |
| TypeSpec → hey-api | 75k-line schema benchmark: hey-api 8s gen + 16 files + 2.9MB output + clean SDK API + result-style error handling (Orval default fetch silently swallows 4xx/5xx) |
| Vercel Remote Cache free | Zero-config (`turbo login && turbo link`); works even off Vercel hosting; eliminates rebuild of unchanged packages |
| Verdaccio | 70% install time reduction reported (20-dev team); proxy cache for npmjs.org; required for air-gap per [[curaos-airgap-rule]] |
| Bun install 17× npm | 4.8s cold install (800-dep monorepo) vs npm 134s; CI warm 3s vs pnpm 14s |
| Bun test 15× Jest | 0.08s/file vs Jest 1.2s vs Vitest 0.9s; same describe/it/expect API |
| Bun --hot NestJS | Soft reload preserves globalThis; faster than `nest start --watch` (skips ts-node, uses Bun's built-in TS transpiler) |
| tsgo --noEmit | TS 7 Go compiler: 77.8s → 7.5s on VS Code codebase (when stable); use as fast type check pre-commit |
| Headless agent CI | claude -p / codex exec / pi -p enable nightly autonomous loops (dependency upgrade, security audit, doc sync) |
| GHCR pre-built devcontainer | Nightly CI builds + push to GHCR; devs pull pre-warmed image <30s start time |

## 1. Generator-first culture

### Tooling layers

| Layer | Tool | Use |
|---|---|---|
| **Workspace generators (graph-aware)** | Nx generators (`tools/generators/`) | Scaffold new backend services w/ NestJS module + Drizzle schema + Dockerfile + AGENTS.md stub; registers in workspace graph |
| **Cross-repo template update** | Copier (Python-based, language-agnostic) | `copier update` 3-way merge syncs 91 submodules to shared skeleton when workspace template changes; `.copier-answers.yml` per project |
| **Frontend component distribution** | shadcn registry (private CuraOS registry) | Agents `shadcn add` components from private registry into any frontend package; CLI v4 `--dry-run`/`--diff`/`--view` flags |
| **Per-package generators** | Turborepo `turbo gen` (Plop wrapper) | Simpler scaffolds when graph-awareness not needed |
| **Code-as-config (optional)** | Projen (CDK-style) | Synthesizes package.json + tsconfig + workflows from TypeScript class definitions; lower priority than Copier |

### Mandatory: every new service/package/app via generator

```bash
# Backend service via Nx
nx generate @curaos/workspace:service identity-service

# Frontend package via Nx
nx generate @curaos/workspace:package design-tokens

# Frontend app via Nx
nx generate @curaos/workspace:app admin --framework=next

# Cross-repo skeleton sync via Copier (update all 91 submodules)
copier update --conflict rej ai/templates/service-skeleton/ curaos/backend/services/*/
```

### Generator emits per CuraOS service

```
<service-name>/
├── src/
│   ├── <domain>.module.ts       # NestJS module per [[curaos-repo-conventions-rule]]
│   ├── <domain>.service.ts
│   ├── <domain>.controller.ts
│   └── schemas/<domain>.schema.ts  # Drizzle per [[curaos-orm-rule]]
├── test/<domain>.service.spec.ts   # NestJS test convention
├── Dockerfile                       # BuildKit + Bun cache mount per [[curaos-image-build-rule]]
├── package.json                     # Bun workspace pkg; @curaos/* namespace; workspace:* protocol
├── tsconfig.json                    # extends workspace base
├── lefthook.yml                     # per [[curaos-quality-gates-rule]] Tier A
└── .env.example
```

Mirror `ai/curaos/backend/services/<service-name>/`:

```
├── AGENTS.md        # extended frontmatter per [[curaos-agents-md-schema-rule]] DA2
├── CONTEXT.md       # <500 lines per [[curaos-knowledge-persistence-rule]] DA10
└── Requirements.md  # charter/spec
```

### Enforcement

- CI check `scripts/check-ai-mirror.sh` (per [[curaos-ai-mirror-rule]]) validates 1:1 mirror parity
- PR template checkbox: "Created via generator (NOT copy-paste)" per [[curaos-repo-conventions-rule]]
- dep-cruiser enforces module boundaries; illegal imports fail CI

## 2. Codegen from spec (TypeSpec → hey-api primary)

### Pipeline

```
TypeSpec source → openapi.json → @hey-api/openapi-ts (SDK + types + TanStack Query plugin)
                                  → Orval (mocks + Zod schemas when MSW needed)
                                  → kubb (per-operation file splitting if needed)
```

### OpenAPI Client Generator Comparison (2026)

Benchmark 75,000-line schema (1,200 operations):

| Tool | Gen time | Files | Output size | Best for |
|---|---|---|---|---|
| openapi-typescript | 1.5s | 1 | 2.4 MB | Types only; minimal footprint |
| **hey-api** | 8.0s | 16 | 2.9 MB | **SDK + interceptors; recommended default** |
| Orval | 5.5s | 2,719 | 14 MB | Generated hooks + Zod + MSW mocks |
| Kubb | 18.1s | 3,877 | 24 MB | Per-operation file splitting; codegen pipeline control |

### Known issues

- Kubb: `BlankEnum` handling drops empty string values; lint violations requiring override rules
- Orval: default fetch client does NOT throw on 4xx/5xx (silent failure)
- hey-api: result-style error handling; clean API

### CuraOS default

`@hey-api/openapi-ts` w/ TanStack Query plugin for all frontend packages. Orval added alongside when MSW mocks needed.

### Other codegen

| Tool | Use |
|---|---|
| **Prisma generate** | type-safe client from schema (banned per [[curaos-orm-rule]] - Drizzle default) |
| **Drizzle-kit generate** | SQL migration from schema; `drizzle-kit push` for dev |
| **MikroORM** | `mikro-orm migration:create` from entity definitions (HealthStack clinical only per [[curaos-orm-rule]]) |
| **GraphQL Code Generator** | When GraphQL endpoints (rare) |
| **tRPC** | Zero-codegen TS-to-TS; no build step (skip TypeSpec for tRPC routes) |

## 3. Caching layer (Turborepo Remote Cache + Verdaccio + BuildKit + devcontainer)

### Turborepo Remote Cache

- **Default Vercel Remote Cache (free all plans)** - zero-config `turbo login && turbo link`; works off Vercel hosting
- **Self-hosted air-gap (per [[curaos-airgap-rule]]):** `ducktors/turborepo-remote-cache` (Node.js, S3/GCS/local); `turbo login --manual --api=<your-url>`
- Stores compiled artifacts + logs; replays logs on cache hit (no re-execution)

### Verdaccio (self-hosted npm proxy)

```bash
docker run -d -p 4873:4873 verdaccio/verdaccio
```

- Caches npmjs.org packages first install; subsequent local
- 70% install time reduction (20-dev team)
- `.npmrc`: `registry=http://localhost:4873`; upstream-proxies npmjs.org
- Required air-gap K3s per [[curaos-airgap-rule]]

### Docker BuildKit cache mounts (per [[curaos-image-build-rule]])

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
```

BuildKit cache mounts persist across builds; bun install cache survives image rebuilds.

### TypeScript incremental + tsgo

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

- Incremental 50-80% reduction unchanged files (30s → 3s typical)
- **tsgo (TS 7 native Go compiler) when stable:** 77.8s → 7.5s on VS Code codebase
- Strategy `tsgo --noEmit` type check + esbuild/swc transpilation parallel

### Devcontainer pre-builds

```yaml
# .github/workflows/devcontainer-prebuild.yml
on:
  schedule:
    - cron: '0 3 * * *'
  push:
    paths: ['.devcontainer/**', 'package.json', 'bun.lockb']
jobs:
  prebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v6
        with:
          context: .devcontainer
          push: true
          tags: ghcr.io/cura-care-oriented-stack/devcontainer:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Devs pull pre-built image; <30s start time.

## 4. Watch + rebuild loops

### Bun --watch vs --hot

| Flag | Behavior | Use case |
|---|---|---|
| `--watch` | Hard restart entire process on file change | Tests, stateful processes |
| `--hot` | Soft reload: re-evaluate modules, keep globalThis | HTTP servers (zero-downtime handler updates) |

Both use native filesystem APIs (kqueue/inotify), no polling. `--no-clear-screen` flag when running multiple watch instances parallel (200-agent context).

### NestJS dev loop (locked: Bun --hot)

```bash
bun run --hot src/main.ts    # Bun hot mode for NestJS (FASTER than nest start --watch)
```

Bun hot mode skips ts-node; uses Bun's built-in TS transpiler.

### Other watch tooling

| Tool | Use |
|---|---|
| **Vite HMR** | Sub-40ms re-run on change in watch mode; powered by chokidar; `vite build --watch` for library mode |
| **watchexec** | General-purpose file watcher; filesystem events; `--no-vcs-ignore` flag; more composable than Vite HMR for non-Vite tasks (tests, codegen, linting) |
| **Metro Fast Refresh (RN/Expo)** | Preserves component state across edits; `bunx expo start` uses Metro w/ Fast Refresh by default |

## 5. Bun-native speedups (locked: Full Bun)

### Benchmarks (2026)

| Package manager | Cold install (50 deps) | Cold install (800 deps monorepo) | CI warm cache |
|---|---|---|---|
| npm | ~14s | 134s | - |
| yarn | ~6s | - | 21s |
| pnpm | ~1.6s | - | 14s |
| **bun** | **0.8s** | **4.8s** | **3s** |

Bun 17× faster than npm + 5× faster than pnpm on cold install. CI warm cache: bun 3s vs pnpm 14s.

### bunx vs npx

- `bunx` caches binaries in Bun's global cache after first download
- Subsequent `bunx` calls skip download entirely
- 200-agent swarm where every agent scaffold calls `bunx create-*` - matters

### Bun test (15× Jest)

```bash
bun test                      # all *.test.ts files
bun test --watch              # watch mode
bun test --timeout 10000      # custom timeout
bun test src/auth             # subset
```

Same `describe`/`it`/`expect` API as Jest/Vitest.

### Bun workspace + bundler

- `bun install` workspace root installs all packages + hoists correctly
- `bun link` equivalent `pnpm link` local dev
- `bun build ./src/index.ts --outdir ./dist --target=bun` - sub-second server-side bundles

## 6. Headless agent CI runs (locked)

### Claude Code headless

```bash
claude -p "Scaffold a NestJS service called identity-service following CuraOS conventions"
claude -p "Review auth module for HIPAA issues" --output-format json
claude -p "Run lint and fix" --dangerously-skip-permissions  # CI only, isolated env
```

Output formats: `text` (default), `json`, `stream-json`.

### Codex CLI non-interactive

```bash
codex exec "Refactor auth middleware to use Zod validation"
```

### Pi CLI non-interactive

```bash
pi -p "Run nightly dependency audit" --provider opencode-go --model kimi-k2.6
```

### GitHub Actions agent pattern

```yaml
name: Nightly agent audit
on:
  schedule:
    - cron: '0 2 * * *'   # 2 AM UTC daily
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Claude Code audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "Review all services for missing PHI boundary annotations" \
            --output-format json > audit-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: audit-report
          path: audit-report.json
```

### Cron-driven autonomous loops (use cases)

- **Nightly dependency upgrade agent:** fetch latest versions → compare → run upgrade → open PR (replaces Dependabot for complex cases requiring reasoning)
- **Nightly security audit agent:** semgrep + Claude review → file issues for findings
- **Documentation sync:** detect schema changes → regenerate API docs → commit
- **Codegen drift check:** `bun run codegen && git diff` per [[curaos-quality-gates-rule]] T1

### Critical for cron agent invocations

Explicit env var paths, full binary paths, output redirection to file (cron minimal PATH):

```bash
0 8 * * * /usr/bin/env bash -c 'source /home/ci/.env && cd /workspace && claude -p "run nightly audit" >> /var/log/agent.log 2>&1'
```

### Temporal scheduled workflows (optional, for multi-step durable execution)

```typescript
await client.schedule.create({
  scheduleId: 'nightly-codegen-sync',
  spec: { cronExpressions: ['0 2 * * *'] },
  action: {
    type: 'startWorkflow',
    workflowType: 'RunCodegenSyncWorkflow',
    taskQueue: 'agent-tasks',
  },
});
```

Use only when multi-step agent workflow MUST NOT partially succeed (e.g. multi-service migration).

## 7. Devcontainer (locked: GHCR pre-built)

### devcontainer.json standard

```jsonc
{
  "image": "ghcr.io/cura-care-oriented-stack/devcontainer:latest",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "bun install",
  "mounts": ["source=bun-cache,target=/root/.bun/install/cache,type=volume"]
}
```

Mount Bun's global cache from host to avoid re-downloading packages.

### Pre-build strategy

- Nightly CI builds devcontainer image → push GHCR
- Devs pull pre-warmed image <30s start
- Update on every `.devcontainer/**`, `package.json`, `bun.lockb` change

### Alternative environments (optional)

| Tool | Use |
|---|---|
| **DevPod** | Devcontainer on any K8s cluster; ephemeral per-dev workspace via SSH; `devpod up --provider kubernetes --id curaos-dev` |
| **Daytona** | Sub-90ms sandbox creation for agent-provisioned workspaces via API; critical for 200-agent swarm |
| **GitHub Codespaces** | If team already uses GitHub + doesn't need on-prem; 60 free hours/month |

## Hot paths (where dev loop time goes)

| Step | Slow baseline | Optimized | Key lever |
|---|---|---|---|
| `bun install` | 134s (npm, 800 deps) | 4.8s (bun, cold) | Switch to Bun; Verdaccio cache |
| Type check (`tsc --noEmit`) | 30-77s large codebase | 3-7.5s | tsgo (TS7 Go compiler) or incremental |
| Unit tests (full suite) | 1.2s/file (Jest) | 0.08s/file (Bun test) | Bun test; Vitest threads pool |
| Lint (oxlint vs ESLint) | 30s+ on large repo | <1s | oxlint Rust per [[curaos-quality-gates-rule]] |
| Format (Biome) | 10-20s (Prettier) | <1s | Biome single binary per [[curaos-quality-gates-rule]] |
| Build (tsc emit) | 60s+ | <5s | esbuild/swc transpile; Turborepo cache |
| Docker build | 5-10min | <30s (cache hit) | BuildKit + cache mounts per [[curaos-image-build-rule]] |
| Devcontainer start | 10-30min | <30s | Pre-built image in GHCR |
| Codegen (openapi-ts) | 8s | 8s | Parallel in Turborepo pipeline |
| Test sharded | 60s (sequential) | 15s (4 shards) | `vitest --shard=X/4` across CI matrix |

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §6 NFR (performance) | Bun-native + Verdaccio + devcontainer pre-builds achieve <30s dev start |
| AGENTS.md §8 execution standards | Generators enforce consistency across 91 submodules; CI gates per [[curaos-quality-gates-rule]] |
| [[curaos-repo-conventions-rule]] | Generator output follows kebab-case + NestJS suffixes + co-located specs + workspace:* |
| [[curaos-quality-gates-rule]] | Turborepo task graph runs `bun run ci` (Lefthook Tier A + CI Tier B-E) |
| [[curaos-bun-primary-rule]] | Full Bun-native (install/test/bundle/runtime) |
| [[curaos-ai-mirror-rule]] | Generator emits AGENTS.md/CONTEXT.md/Requirements.md under ai/curaos/ mirror |
| [[curaos-agents-md-schema-rule]] | Generator emits ASDLC strict body + extended frontmatter |
| [[curaos-knowledge-persistence-rule]] | Generator emits Layer 2 module triad (AGENTS.md + CONTEXT.md + Requirements.md) |
| [[curaos-image-build-rule]] | BuildKit cache mounts; multi-arch amd64+arm64 |
| [[curaos-airgap-rule]] | Self-hosted Verdaccio + Turborepo cache (ducktors S3) supports air-gap |
| [[curaos-cli-agents-rule]] | Headless CI runs via claude -p + codex exec + pi -p (per DA1) |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Speed stack agent wins (additive to "Why" table):
- **bunx binary cache** = scaffold calls don't re-download
- **GHCR pre-built devcontainer** = <30s start vs 30min cold setup
- **Daytona sub-90ms sandboxes** = 200-agent swarm workspaces on-demand via API

## How to apply

- Workspace setup:
  - `tools/generators/` w/ Nx generators for service, package, app
  - `ai/templates/service-skeleton/` w/ Copier template
  - Private shadcn registry at `registry.curaos.<domain>/`
  - `tsconfig.json` w/ `"incremental": true`
  - `.devcontainer/devcontainer.json` w/ GHCR image + Bun cache mount
  - `turbo.json` task graph; `turbo login && turbo link` Vercel Remote Cache
  - Verdaccio Docker compose for local + air-gap
- Generator-first enforcement:
  - PR template checkbox: "Created via generator (NOT copy-paste)" per [[curaos-repo-conventions-rule]]
  - CI gate `scripts/check-ai-mirror.sh` validates 1:1 mirror parity
- Headless CI:
  - `.github/workflows/nightly-deps.yml` runs dependency-upgrade-agent (claude -p)
  - `.github/workflows/nightly-security.yml` runs security-audit-agent (codex exec)
  - `.github/workflows/nightly-docs.yml` runs doc-sync-agent (pi -p)
- Devcontainer:
  - `.github/workflows/devcontainer-prebuild.yml` nightly + on `.devcontainer/**` changes
  - Pushes `ghcr.io/cura-care-oriented-stack/devcontainer:latest`
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate memory + ai/rules/ + AGENTS.md §15

## ADRs queued

Per digest §6:
- **ADR-0161 (NEW, speed patterns generator-first + codegen + caching)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §6 NFR performance + §8 execution standards to reference Bun-native + generator-first + Vercel Remote Cache
