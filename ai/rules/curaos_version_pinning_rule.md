---
name: curaos-version-pinning-rule
title: Version pinning (latest stable + Renovate auto-PR + exact pins + SHA-pin Actions + digest-pin images)
description: Pin all deps + runtimes + base images to latest stable; Renovate auto-PRs upgrades. Exact-version pins (no caret/tilde) for reproducibility. Bun.lockb + cosign-signed image digests = source of truth. Per-tier upgrade cadence (security same-day; minor weekly; major quarterly w/ review).
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-25 post-DA12 audit): pin versions to latest stable for Node + all packages + dependencies. Add as rule.

## The rule

**Every CuraOS dep + runtime + base image pinned to latest stable.** Exact versions (no `^`/`~`/`>=`). Renovate manages upgrades via per-tier cadence. Bun lockfile (`bun.lockb`) + cosign-signed OCI image digests = canonical lock.

| Layer | Pin source | Floor (current latest stable; Renovate keeps fresh) |
|---|---|---|
| **JS runtime** | `.tool-versions` (asdf format) + `.bun-version` + `.nvmrc` + `package.json#engines` | Bun latest stable (1.x); Node 22 LTS (fallback only per [[curaos-bun-primary-rule]]) |
| **TypeScript** | `package.json` exact | TypeScript 5.x latest |
| **NestJS** | `package.json` exact | `@nestjs/*` latest 11.x stable |
| **React / Next.js** | exact | React 19 + Next.js 15+ latest |
| **React Native / Expo** | exact | Expo SDK 52+ latest |
| **Bun-managed deps** | `bun.lockb` (checked in) | every transitive locked |
| **OCI base images** | digest pin `oven/bun:1.x@sha256:...` | cosign-verified per [[curaos-image-build-rule]] |
| **K8s components** | Helm chart exact + ArgoCD targetRevision SHA | K3s/CNPG/Cilium/ArgoCD all pinned per chart appVersion |
| **GitHub Actions** | SHA-pin (NOT @v4) | `uses: actions/checkout@<full-sha>` per [[curaos-quality-gates-rule]] Tier B |
| **asdf-format lock** | `.tool-versions` (asdf-compatible plain text) | language version reproducibility; works w/ asdf, devbox, or manual install (mise BANNED at CuraOS level - overrides Fulcrum §5 mise default; user preference for asdf-format `.tool-versions` portability across asdf/devbox/manual install; do not propose mise in CuraOS repos) |

## Banned

- `^x.y.z` or `~x.y.z` in production `dependencies` (range modifiers)
- `"latest"` tag in any `package.json` / Dockerfile / Helm chart
- Floating image tags (`:1`, `:latest`, `:stable`)
- GitHub Actions tag refs (`@v4`, `@main`) without SHA pin
- Manual `bun update` outside Renovate flow (drift risk)
- Dependabot for monorepo (per [[curaos-quality-gates-rule]] DA7 - Renovate only)
- Skipping `bun.lockb` commit (lockfile MUST be tracked)
- Disabling Renovate security PRs (CVE auto-merge mandatory)
- `npm install <pkg>` w/o exact version pin (use `bun add <pkg>@<exact-version>`)
- Cosmetic version bumps in implementation PRs (Renovate owns version PRs; impl PRs don't touch deps)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Backing |
|---|---|
| Exact versions (no caret) | `^1.2.3` → `npm install` weeks apart can install different transitive deps → "works on my machine" + CI flake |
| `bun.lockb` checked in | Lockfile = exact transitive graph; Renovate updates atomically |
| Image digest pin | Tag `:latest` mutable + spoofable. Digest `@sha256:...` immutable + cosign-verifiable |
| GitHub Action SHA-pin | `@v4` tag mutable (supply chain attack vector). SHA-pin per OpenSSF Scorecard + Renovate auto-PRs SHA bumps |
| Renovate not Dependabot | Workspace-aware (handles monorepos w/o noisy per-package PRs); supports `bun.lockb`; groups related upgrades; per [[curaos-quality-gates-rule]] DA7 |
| Per-tier cadence | Security CVE = same-day auto-merge w/ green CI; minor = weekly grouped; major = quarterly w/ review |
| Latest stable bias | Stagnant deps accumulate security debt; latest stable = fastest path to fixes; major upgrades quarterly cap churn |

## Renovate config (canonical, root `renovate.json`)

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:best-practices",
    ":semanticCommits",
    ":dependencyDashboard",
    "helpers:pinGitHubActionDigests",
    "docker:pinDigests"
  ],
  "rangeStrategy": "pin",
  "lockFileMaintenance": { "enabled": true, "schedule": ["* 0-3 1 * *"] },
  "packageRules": [
    {
      "matchPackagePatterns": ["*"],
      "matchUpdateTypes": ["security"],
      "automerge": true,
      "platformAutomerge": true,
      "labels": ["security", "auto-merge"]
    },
    {
      "matchUpdateTypes": ["minor", "patch"],
      "matchManagers": ["npm", "bun"],
      "groupName": "minor + patch npm/bun",
      "schedule": ["after 2am on monday"],
      "automerge": true
    },
    {
      "matchUpdateTypes": ["major"],
      "labels": ["major-upgrade", "needs-review"],
      "schedule": ["on the first day of the quarter"],
      "automerge": false
    },
    {
      "matchManagers": ["github-actions"],
      "pinDigests": true,
      "schedule": ["after 2am on monday"],
      "automerge": true
    },
    {
      "matchManagers": ["dockerfile", "docker-compose"],
      "pinDigests": true,
      "groupName": "OCI image digests"
    },
    {
      "matchPackageNames": ["bun", "oven/bun"],
      "labels": ["runtime", "high-impact"],
      "automerge": false
    },
    {
      "matchPackageNames": ["node"],
      "allowedVersions": "/^22\\./",
      "description": "Node fallback per [[curaos-bun-primary-rule]] - stay on 22 LTS"
    },
    {
      "matchPackagePatterns": ["^@nestjs/"],
      "groupName": "NestJS framework",
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    },
    {
      "matchPackageNames": ["react", "react-dom", "next"],
      "groupName": "React + Next",
      "labels": ["framework", "needs-review"]
    },
    {
      "matchPackageNames": ["expo"],
      "labels": ["mobile", "high-impact"],
      "automerge": false
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "automerge": true,
    "labels": ["security", "vulnerability"]
  },
  "prHourlyLimit": 0,
  "prConcurrentLimit": 20,
  "rebaseWhen": "auto",
  "platform": "github"
}
```

## Per-package.json enforcement

```jsonc
{
  "name": "@curaos/<package>",
  "version": "<exact-semver>",
  "engines": {
    "bun": ">=1.1.0",
    "node": ">=22.0.0"
  },
  "packageManager": "bun@<exact-version>",
  "dependencies": {
    "@nestjs/core": "11.0.5",   // exact, NOT "^11.0.5"
    "drizzle-orm": "0.38.4",
    "zod": "4.0.0"
  }
}
```

**syncpack** (per [[curaos-quality-gates-rule]] Tier A) enforces version alignment across workspace + bans range modifiers.

## `.tool-versions` (asdf-format canonical lock; mise BANNED at CuraOS level)

> mise BANNED at CuraOS level (overrides Fulcrum §5 mise default) - user preference for asdf-format `.tool-versions` portability across asdf/devbox/manual install. Do not propose mise in CuraOS repos.

```
bun 1.x.x
node 22.x.x
python 3.13.x
just 1.x.x
```

Committed to repo root. CI uses same.

## Image digest pin pattern (per [[curaos-image-build-rule]])

```dockerfile
# Bad
FROM oven/bun:1

# Good
FROM oven/bun:1.1.42@sha256:<64-hex-digest>
```

Renovate `docker:pinDigests` keeps digests fresh. cosign signature verification at pull time per [[curaos-image-build-rule]].

## GitHub Actions SHA pin pattern

```yaml
# Bad
- uses: actions/checkout@v4

# Good
- uses: actions/checkout@<full-40-char-sha>  # v4.2.2
```

Renovate `helpers:pinGitHubActionDigests` keeps SHAs fresh w/ comment showing tag.

## Helm + ArgoCD pin pattern

```yaml
# ArgoCD Application
spec:
  source:
    repoURL: https://cloudnative-pg.github.io/charts
    chart: cloudnative-pg
    targetRevision: 0.23.0  # exact, not >= or ~
```

Renovate Helm manager handles Helm chart upgrades.

## Per-tier upgrade cadence

| Tier | Trigger | Action | Review |
|---|---|---|---|
| **Critical CVE** | Renovate vulnerability alert | Auto-PR + auto-merge on green CI | Post-merge audit |
| **Minor + patch (npm/bun)** | Weekly Monday | Grouped PR + auto-merge on green | Spot-check |
| **GitHub Actions SHA bump** | Weekly Monday | Auto-merge on green | None (mechanical) |
| **OCI digest refresh** | Continuous | Grouped PR + auto-merge on green | None |
| **NestJS minor/patch** | Weekly Monday | Grouped + auto-merge | Spot-check |
| **Major framework upgrade** | Quarterly (1st day) | Labeled `major-upgrade` + `needs-review`; human merges | Mandatory review |
| **Bun runtime** | Renovate PR | Labeled `runtime` + `high-impact`; human merges | Mandatory review |
| **Expo SDK** | Renovate PR | Labeled `mobile` + `high-impact`; human merges | Mandatory + Maestro E2E green per [[curaos-rn-e2e-rule]] |
| **Lockfile maintenance** | Monthly (1st day, off-hours) | Refresh transitive resolutions | None |

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| Workspace AGENTS.md §6 Security (defense in depth) | CVE auto-PR + SBOM-allowlist per [[curaos-quality-gates-rule]] Tier E |
| Workspace AGENTS.md §6 Reliability | Exact pins eliminate version-drift bugs |
| [[curaos-bun-primary-rule]] | Bun runtime + lockfile primary |
| [[curaos-quality-gates-rule]] | Tier A syncpack enforces alignment; Tier E nightly Renovate |
| [[curaos-image-build-rule]] | cosign + SBOM mandatory; digest pin pattern matches |
| [[curaos-airgap-rule]] | Zarf bundle pins same digests; reproducible across air-gap |
| [[curaos-verification-stack-rule]] | T1 includes `bun audit` (CVE scan); SBOM allowlist per T2 |
| [[curaos-agent-eval-obs-rule]] | LiteLLM proxy + Langfuse pinned per OCI digest |

## Agentic-tool friendliness

- Exact pins → agents reproduce dev env deterministically (`bun install` produces identical tree)
- Renovate dashboard issue → agents query single source for upgrade backlog
- SHA-pinned actions → agents can verify CI integrity via SHA lookup
- `.tool-versions` + `.nvmrc` + `.bun-version` → asdf-compatible (or manual install); agents read exact runtime to test against
- syncpack pre-commit → agents catch version drift before push (not surprise at merge)
- Grouped + labeled PRs → swarm agents claim by label per [[curaos-swarm-collaboration-rule]] 5-label state machine

## How to apply

- Every new `package.json` uses exact versions (syncpack pre-commit enforces; per [[curaos-quality-gates-rule]] Tier A)
- Every new Dockerfile uses digest pin (Renovate `docker:pinDigests` adds on first PR)
- Every new GitHub Action uses SHA pin (Renovate `helpers:pinGitHubActionDigests`)
- Every new Helm chart `targetRevision` uses exact chart version (Renovate Helm manager)
- Workspace root `renovate.json` template seeds new submodules via Copier per [[curaos-speed-patterns-rule]]
- `.tool-versions` template seeded per submodule via Copier
- Headless agent CI runs `bun audit` nightly per [[curaos-speed-patterns-rule]] §6
- Major framework upgrades trigger codegen regen check + Stryker mutation re-run per [[curaos-quality-gates-rule]] Tier C/E

## ADRs queued

Per digest §6:
- **ADR-0163 (NEW, version pinning + Renovate cadence)**: full version; this rule = short form
- **ADR-0110 amendment**: CI/CD release section updates to reference Renovate (was Dependabot in draft)
