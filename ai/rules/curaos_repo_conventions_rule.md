---
name: curaos-repo-conventions-rule
title: Repo conventions (kebab-case + Conventional Commits + Turborepo)
description: Repo conventions - kebab-case files + PascalCase classes (no I-prefix) + NestJS suffixes + co-located *.spec.ts + separate *.e2e-spec.ts; package.json#exports + tsconfig#paths + single barrel; WHY-not-WHAT comments + TSDoc on shared exports + ADR-by-number refs + // TODO(agent): markers; Conventional Commits + commitlint + release-please + git-cliff; trunk-based + agent/<type>-<module>-<slug>-<id> branches <24h; PR template w/ Evidence+Security+Scope checklists + CODEOWNERS; apps/+backend/+frontend/ layout + @curaos/* + workspace:* + explicit deps + syncpack + Turborepo + dep-cruiser boundary rules
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision 2026-05-25, DA8 walkthrough - foundation alongside [[curaos-agents-md-schema-rule]].

## The rule

**Four locked convention groups across all 91 CuraOS submodules + workspace:**
1. **Naming + structure** - kebab-case files/dirs, PascalCase classes (no I-prefix), NestJS suffixes, co-located `*.spec.ts`, separate `*.e2e-spec.ts`, `package.json#exports` + `tsconfig#paths`, single barrel per package
2. **Comments + docs** - WHY-not-WHAT default, TSDoc on public exports in shared packages, ADR refs by number, `// TODO(agent):` markers
3. **Commits + branches + PRs** - Conventional Commits + commitlint, trunk-based + `agent/<type>-<module>-<slug>-<id>` branches <24h, PR template w/ Evidence + Security + Scope checklists, CODEOWNERS
4. **Workspace layout + boundary enforcement** - `apps/` + `backend/{services,packages}/` + `frontend/packages/` + `ops/`; `@curaos/*` namespace; `workspace:*` protocol; explicit deps; syncpack + Turborepo + dep-cruiser

## Banned

- snake_case files/dirs (use kebab-case)
- `I`-prefix interfaces (`IUserRepository` - use `UserRepository`)
- Deep barrel chains (index.ts re-exporting another index.ts)
- Implicit global dependencies (every package declares all deps explicitly)
- Root `package.json#dependencies` (workspace root stays clean; only `workspaces` + `devDependencies` for tooling)
- Long-lived branches (release branches only for hotfix)
- Force push to shared branches (no `--no-verify` bypass)
- Amending pushed commits
- Non-Conventional Commit messages on main
- WHAT-comments restating obvious code
- ADR refs by title (use number)
- TSDoc on non-shared internals (signal noise; maintenance burden)
- Cross-vertical imports (healthstack ↔ educationstack)
- Apps directly importing services (use API/HTTP)
- Services directly importing other services (use events or HTTP)
- AGENTS.md inside `curaos/` code repos (lives in `ai/curaos/` mirror)
- README files duplicating CONTEXT.md / Requirements.md content

<!-- fold: rationale, non-binding -->

## Why

| Convention | Empirical / mechanical backing |
|---|---|
| kebab-case files/dirs | Consistent macOS (case-insensitive) + Linux; agents grep reliably; git diffs cleaner |
| NestJS module suffixes | Framework convention; agents auto-locate by `*.controller.ts` etc. |
| Co-located `*.spec.ts` | Agents find tests next to code without path lookup |
| Separate `test/*.e2e-spec.ts` | Signals integration tests; runs separately via `bun test:e2e` |
| `package.json#exports` | Decouples alias resolution from TS compiler; Bun + Vite native |
| Single barrel per package | Agents navigate barrels; deep chains hurt tree-shaking + agent navigation |
| WHY-not-WHAT comments | "Restated comments rot - code changes, comment lies" (Fulcrum global rule) |
| TSDoc on public exports | TS language services render; agents read parameter shapes without reading impl (saves tokens) |
| ADR refs by number | Numbers stable; titles drift |
| `// TODO(agent):` markers | Agents follow these reliably (more than prose) |
| Conventional Commits | git-cliff + semantic-release + commitlint parse; CHANGELOG auto-gen; version bump signal |
| Trunk-based + agent branches <24h | 89% reduction in deployment incidents (2025 data); 200-agent swarm needs trunk-based |
| `agent/<type>-<module>-<slug>-<id>` branch naming | CI applies different gates per `agent/` prefix; agent identity in branch |
| PR template w/ Evidence checklist | AI PR acceptance 32.7% vs human 84.4% (2026); Evidence gate raises agent-PR quality |
| CODEOWNERS as soft lock | Cross-ownership PRs require additional approval; partition enforcement at review layer |
| Explicit deps + `workspace:*` | Agents fail silently on hoisted imports; breaks standalone (per [[curaos-modulith-standalone-rule]]) |
| syncpack | Used by AWS/Cloudflare/Vercel/Raycast; agents frequently introduce duplicate-version deps |
| dep-cruiser boundary rules | Enforces vertical→neutral only; prevents HealthStack code leaking into neutral |

## Naming + structure (8A locked)

### File + directory naming

| Context | Convention | Example |
|---|---|---|
| All files/dirs | kebab-case | `identity-service/`, `user-repository.ts` |
| TS/JS classes | PascalCase (filename matches class) | `UserRepository.ts` → `export class UserRepository` |
| TS interfaces | PascalCase, no `I` prefix | `UserRepository` not `IUserRepository` |
| TS enums | PascalCase | `UserRole`, `AuditAction` |
| NestJS modules | `*.module.ts` / `*.controller.ts` / `*.service.ts` / `*.repository.ts` | `auth.module.ts`, `auth.controller.ts` |
| Unit tests | `*.spec.ts` co-located w/ source | `auth.service.spec.ts` next to `auth.service.ts` |
| E2E tests | `*.e2e-spec.ts` in separate `test/` dir | `test/auth.e2e-spec.ts` |
| Zod schemas | `*.schema.ts` or `*.dto.ts` co-located | `login.dto.ts` in `dto/` folder |
| Event contracts | `*.event.ts` co-located w/ producer | Consumed via `@curaos/shared-dto` |

### Path aliases + barrels

**Both `package.json#exports` (runtime/bundlers) + `tsconfig#paths` (IntelliSense/tsc):**
```jsonc
// backend/packages/shared-dto/package.json
{
  "name": "@curaos/shared-dto",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./user": "./src/user/index.ts",
    "./events": "./src/events/index.ts"
  }
}
```

```jsonc
// tsconfig.base.json (workspace root, for IntelliSense + tsc)
{
  "compilerOptions": {
    "paths": {
      "@curaos/shared-dto": ["backend/packages/shared-dto/src/index.ts"],
      "@curaos/shared-dto/*": ["backend/packages/shared-dto/src/*"]
    }
  }
}
```

**Barrel discipline:**
- ONE `src/index.ts` per package exporting public surface only
- NO deep barrel chains (index.ts re-exporting another index.ts)
- Internal helpers stay unexported
- Agents navigate barrels correctly; deep chains hurt tree-shaking + agent navigation

### NestJS module structure (agent-navigable)

```
backend/services/identity-service/
  src/
    identity.module.ts          # module root
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      auth.repository.ts
      auth.service.spec.ts      # co-located unit test
      dto/
        login.dto.ts
        token.dto.ts
    user/
      user.module.ts
      ...
  test/
    auth.e2e-spec.ts            # E2E in separate /test dir
  package.json
  tsconfig.json                 # extends workspace base
  Dockerfile                    # BuildKit + Bun cache mount
  README.md                     # human entry point only (per repo-boundary)
```

AGENTS.md NOT here - lives in `ai/curaos/backend/services/identity-service/` per [[curaos-ai-mirror-rule]].

## Comments + docs (8B locked)

### WHY-not-WHAT default + zero-comments baseline

Default: no comments. Add only when WHY non-obvious - hidden constraint, subtle invariant, workaround for specific bug, surprising behavior. If removing comment wouldn't confuse future reader, don't write it.

**Pattern for CuraOS:**
```typescript
// PHI boundary: user_id reference only - clinical detail stays in healthstack schema.
// See ADR-0045 for data partitioning decision.
export class AppointmentRecord {
  userId: string;
}
```

### TSDoc on public exports in shared packages

Required on all exported symbols in `backend/packages/**` + `frontend/packages/**` (shared code). Services lighter coverage (complex public methods only).
```typescript
/**
 * Records PHI access event for audit trail.
 * @param actorId - Authenticated user performing access (not subject)
 * @param resourceType - FHIR resource type accessed
 * @param resourceId - Opaque reference; never embed PHI here
 * @returns AuditEvent with correlation ID for tracing
 * @throws AuditException if event write fails (caller must handle)
 * @see ADR-0091 - Audit log partitioning strategy
 */
export function recordPhiAccess(
  actorId: string,
  resourceType: FhirResourceType,
  resourceId: string
): AuditEvent { ... }
```

Lint: `eslint-plugin-jsdoc` w/ `jsdoc/require-description` on exported symbols in `backend/packages/**` + `frontend/packages/**`.

### Comment rot prevention

- **ADR refs by NUMBER, not title** - `ADR-0045` not "PHI Data Partitioning Strategy" (titles drift; numbers stable)
- **Co-locate schema change comments w/ migration files**, not domain models
- **`// TODO(agent):` + `// FIXME(agent):` markers** w/ scope hints - agents follow reliably (more than prose):
  ```typescript
  // TODO(agent): replace with MikroORM UnitOfWork after ADR-0102 closes (clinical aggregates only)
  ```
- **HTML comments `<!-- -->` in CLAUDE.md/AGENTS.md** - stripped from agent context, visible to maintainer; zero token cost

### Banned comment patterns

- WHAT-comments restating obvious code
- ADR references by title (drift risk)
- Generic `// TODO` without context or owner
- Multi-paragraph docstrings (one short line max in code; long-form in README/CONTEXT.md)
- Outdated comments (rot worse than no comment)

## Commits + branches + PRs (8C locked)

### Conventional Commits

Format: `type(scope): subject` - types: `feat | fix | docs | refactor | test | chore | perf | build | ci | revert`. Breaking changes: `feat(auth)!:` or `BREAKING CHANGE:` footer.

Authorship: exactly one accountable commit author. Agents, subagents, reviewers, and tools MUST NOT add `Co-authored-by:`, `Generated-by:`, `AI-assisted-by:`, `Agent-ID:`, `Agent-Model:`, `Task-Issue:`, `Worktree:`, or similar attribution trailers. Preserve collaboration evidence in PR body, issue comments, review summaries, and logs, not commit metadata.

Message style: keep subject imperative and concise. Add body only when it explains WHY, evidence, migration risk, or rollout notes. Footers only for issue refs (`Refs #123`, `Closes #123`), `BREAKING CHANGE:`, or required `Signed-off-by:`. No verbose generated summaries.

**Toolchain:**
- `commitlint` w/ `@commitlint/config-conventional` - `commit-msg` hook (via Lefthook per [[curaos-quality-gates-rule]] when locked)
- `release-please` - version bump + tag + GitHub Release from commit history (preferred over semantic-release for monorepo)
- `git-cliff` - CHANGELOG generation; reproducible across sessions

### Trunk-based + short-lived agent branches

- Every agent works on short-lived feature branch (<24h ideally; never >2 days)
- Branch naming: `agent/<type>-<module>-<short-desc>-<agent-id>` - e.g., `agent/feat-identity-add-webauthn-cc01`
- Prefix `agent/` lets CI apply different gates (heavier verification for agent-authored)
- No long-lived branches except `main`; release branches only for hotfix
- **Never amend or force-push shared branches** (Fulcrum global rule + repo policy)
- **Never bypass branch protection** (no `--no-verify`)
- Feature flags (Unleash / OpenFeature flagd) enable trunk-based dev for large incremental features

### Conflict resolution at swarm scale

File-ownership partition (per [[curaos-swarm-collaboration-rule]] when locked) = primary prevention; each agent gets clear file scope in task spec. Pre-flight `git merge-tree <branch-a> <branch-b>` detects conflicts before dispatch.

### PR template (`.github/pull_request_template.md`)
```markdown
## What changed
<!-- One sentence. If it takes more, the PR is too large. -->

## Why (link issue)
Closes #

## Evidence (required for agent PRs)
- [ ] New test exists that FAILS on pre-change code
- [ ] `bun run ci` passes locally (or CI link)
- [ ] No tests removed, skipped, or renamed
- [ ] No CI step weakened (`|| true`, conditional gates, coverage threshold change)
- [ ] No new utility duplicates existing code (verified with `rg` or `codegraph_search`)

## Security
- [ ] No PHI in logs, commits, or error messages
- [ ] No untrusted input interpolated into prompts or shell commands
- [ ] No write-scoped token used unnecessarily
- [ ] `gitleaks detect --staged` passes

## Scope check
- [ ] Touches fewer than 5 unrelated files (if not, split the PR)
- [ ] Single purpose - one sentence describes the entire change
- [ ] codegraph_impact attached (for changes touching shared interfaces)
```

### Issue templates + labels

Canonical labels (per [[curaos-repo-boundary-rule]] + triage-labels skill):
```
needs-triage         # new, unreviewed
needs-info           # blocked on reporter
ready-for-agent      # scoped, AFK-ready
ready-for-human      # judgment, auth, irreversible
wontfix              # rejected
bug, enhancement     # categories
```
Issue frontmatter (agent-consumable):
```yaml
---
module: identity-service
effort: small          # small | medium | large
requires: [bun test, dep-check]
blocked-by: []
agent-notes: "Scope: src/auth/ only. Do NOT touch migration files."
---
```

### CODEOWNERS as soft lock

`.github/CODEOWNERS` assigns directories to owner tokens. Cross-ownership PRs require additional approval - soft lock for swarm partition enforcement. Owner tokens can be agent identities (`@agent-claude-cc01`) or human handles.

## Workspace layout + boundary enforcement (8D locked)

### Standard directory structure (Turborepo + Bun)
```
curaos/
  apps/                         # deployable applications
    web/                        # Next.js admin SPA
    mobile/                     # Expo React Native
  backend/
    services/                   # NestJS microservices (git submodules)
      identity-service/
      notify-service/
    packages/                   # shared backend libs (git submodules)
      shared-dto/               # Zod 4 DTOs, event schemas
      observability/            # @curaos/observability PHI scrub init
  frontend/
    packages/                   # shared frontend libs
      ui/                       # design system components
      hooks/                    # shared React hooks
  ops/                          # infra config (K8s, Helm, Zarf)
  package.json                  # root workspace config
  bun.lockb                     # Bun lock file
  turbo.json                    # Turborepo task graph
  .github/
    CODEOWNERS
    pull_request_template.md
    ISSUE_TEMPLATE/
    workflows/
```

### Root package.json rules
```jsonc
{
  "private": true,
  "workspaces": [
    "apps/*",
    "backend/services/*",
    "backend/packages/*",
    "frontend/packages/*"
  ]
  // NO "dependencies" here - each package declares its own
}
```

### Internal package naming + protocols

- `@curaos/` namespace prefix for ALL internal packages
- All internal deps use `workspace:*` protocol in package.json
- Explicit dep declaration in every package - NO implicit globals (agents fail silently on hoisted imports; breaks standalone per [[curaos-modulith-standalone-rule]])

### syncpack version consistency
```jsonc
// .syncpackrc.json
{
  "semverRange": "",
  "dependencyTypes": ["prod", "dev"],
  "versionGroups": [
    {
      "label": "Bun-aware deps",
      "dependencies": ["bun-types", "@types/bun"],
      "policy": "sameRange"
    }
  ]
}
```

CI gate: `bunx syncpack list-mismatches` exits 0 or PR blocks.

### Turborepo task graph
```jsonc
// turbo.json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":      { "dependsOn": ["^build"], "cache": true },
    "lint":      { "cache": true },
    "typecheck": { "dependsOn": ["^build"], "cache": true },
    "ci":        { "dependsOn": ["lint", "typecheck", "test", "build"] }
  }
}
```

`bun run ci` from root = full graph w/ caching; agents get one canonical closure command.

### dep-cruiser boundary rules
`.dependency-cruiser.js`:
```js
module.exports = {
  rules: [
    {
      name: "no-vertical-to-core-internal",
      from: { path: "healthstack-" },
      to:   { path: "backend/packages/(?!shared-dto)" },
      severity: "error"
    },
    {
      name: "no-service-cycles",
      from: { path: "backend/services/" },
      to:   { path: "backend/services/" },
      severity: "error",
      comment: "Services communicate via events or HTTP, never direct import"
    },
    {
      name: "no-cross-vertical",
      from: { path: "healthstack-" },
      to:   { path: "educationstack-|erp-" },
      severity: "error"
    },
    {
      name: "apps-no-direct-service-import",
      from: { path: "apps/" },
      to:   { path: "backend/services/" },
      severity: "error",
      comment: "Apps consume services via API, never direct code import"
    }
  ],
  options: { tsPreCompilationDeps: true, combinedDependencies: true }
};
```

Run in CI: `bunx depcruise --validate .dependency-cruiser.js src/`. Exit code 1 blocks merge.

## Mirror placement (per ai-mirror rule)

Rule applies BOTH `curaos/` (code) AND `ai/curaos/` (agent docs). Per [[curaos-ai-mirror-rule]]:
- Code/config in `curaos/<path>/` (e.g., `curaos/backend/services/identity-service/`)
- Agent docs in `ai/curaos/<path>/` (e.g., `ai/curaos/backend/services/identity-service/AGENTS.md`)
- 1:1 structural mirror at all times
- `scripts/check-ai-mirror.sh` validates

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §7 contracts (versioned, deprecation, naming intent) | Naming conventions enforce service `kebab-case` + suffixes |
| AGENTS.md §8 execution standards | Conventional Commits + CI gates + monorepo discipline |
| AGENTS.md §9 done criteria | PR template Evidence checklist enforces "done = tests pass + no CI weakening" |
| AGENTS.md §10 agent operating rules | trunk-based + `agent/<type>` branches map to "submodule awareness" + "trust-but-verify" |
| AGENTS.md §11 boundaries + approvals | CODEOWNERS soft lock; PR template Scope check; no force-push |
| [[curaos-ai-mirror-rule]] | All conventions apply equally to `curaos/` + `ai/curaos/` mirror |
| [[curaos-repo-boundary-rule]] | NO workspace links / ADR refs / impl values leak into submodule repos via these conventions |
| [[curaos-modulith-standalone-rule]] | `workspace:*` + explicit deps preserve standalone-mode capability |
| [[curaos-bun-primary-rule]] | `bun.lockb`, `bun install`, `bunx`, Bun test runner throughout |
| [[curaos-agents-md-schema-rule]] | Naming conventions inform AGENTS.md frontmatter field values |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical: memory ↔ ai/rules/ ↔ AGENTS.md §15 |

## Agentic-tool friendliness

Why these conventions win for AI agents specifically:
- **kebab-case + NestJS suffixes** → reliable grep + auto-location across all CLI agents (Claude Code, Codex, Gemini, OpenCode, Cursor, Aider)
- **`*.spec.ts` co-location** → agents find tests next to source w/o path lookup or codegraph round-trip
- **`package.json#exports`** → Bun/Vite bundlers + agents reading import statements both work natively
- **TSDoc on public exports** → agents read parameter shapes w/o reading impl (saves context tokens)
- **ADR refs by number** → stable across renames; `git log -S "ADR-0045"` finds all related changes
- **`// TODO(agent):` markers** → universal across all CLI agents (more reliable than prose)
- **Conventional Commits** → `git log --grep="feat(identity)"` queryable history; agents mine for ADR generation
- **`agent/<type>-<module>-<slug>-<id>` branches** → CI applies different gates per `agent/` prefix; agent identity in branch metadata
- **PR template Evidence checklist** → forces agents to provide artifacts not assertions (per verification stack rule when locked)
- **CODEOWNERS as soft lock** → swarm partition enforcement at PR review layer w/o synchronous coordination
- **`workspace:*` + explicit deps** → modulith-standalone duality preserved (per [[curaos-modulith-standalone-rule]])
- **syncpack + dep-cruiser** → CI rejects version drift + boundary violations before merge; agents can't accidentally cross vertical/neutral split

## How to apply

- Every new module created via Codegen recipe (per ADR-0123) emits skeleton w/ correct directory structure + `package.json#exports` + `tsconfig.json` extends base
- Lefthook pre-commit (per [[curaos-quality-gates-rule]] when locked): commitlint + syncpack + dep-cruiser
- CI required status checks: syncpack list-mismatches + dep-cruiser validate + commitlint history
- PR template auto-applied via `.github/pull_request_template.md`
- `release-please` workflow runs on push to main; opens PR for version bump + CHANGELOG
- `git-cliff` config in workspace root for ad-hoc CHANGELOG regeneration
- CODEOWNERS reviewed quarterly; agent identities rotate per swarm dispatch policy
- `scripts/check-ai-mirror.sh` validates mirror 1:1 structure
- Per-module conventions inherited from this rule; module-specific exceptions documented in module's CONTEXT.md

## ADRs queued

Per digest §6:
- **ADR-0157 (NEW, repo conventions)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §7 contracts section to reference this rule for naming + commit + branch standards
