---
name: curaos-quality-gates-rule
title: Quality gates (5-tier by cost)
description: Quality gates designed for AI-specific failure modes - 5-tier gate ordering by cost (pre-commit Lefthook <5s; fast CI <60s; full CI <5min; slow CI <15min; nightly); oxlint primary 50-100x ESLint + ESLint v9 only for ~20% type-aware rules; Biome formatter single binary; Lefthook locked (Husky BANNED); per-tier tooling locked (Knip+Syncpack+Semgrep+bundle-size; Vitest coverage 80/75/80/80+Stryker mutation --changed ≥60% break+TruffleHog+regen-diff; Playwright E2E+Lighthouse CI+Lost Pixel; CodeQL+Stryker full+syft SBOM+Renovate); mutation testing only gate agents can't game; Knip+Syncpack for unused exports+version consistency; fail-closed convention BINDING (a guard that cannot prove its input exits nonzero; never coerce unproven evidence to a passing default) + 5 mandatory failure-fixture classes (external-call failure / missing binary / cap-reached / truncated search-probe / silent-empty parse); rules-as-tooling two-tier policy BINDING (RP-22: every deterministic invariant gets a script/grep gate wired into lefthook or check-docs.sh or the just ci suites; prose keeps only context-sensitive judgment rules; deterministic-invariant inventory maps each invariant to its gate, gate NONE rows tracked in RISK-REGISTER); Optic BANNED (use regen-diff); depcheck BANNED (use Knip); Percy BANNED cloud-only (use Lost Pixel self-hosted MIT); class-validator BANNED (per [[curaos-validation-rule]])
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA7 walkthrough - grounded in [[curaos-verification-stack-rule]] T1+T2 gates + [[curaos-repo-conventions-rule]] commits/branches):

## The rule

**Six locked components:**

1. **5-tier gate ordering by cost** (pre-commit → fast CI → full CI → slow CI → nightly)
2. **oxlint primary + ESLint v9 type-aware only** + Biome formatter
3. **Lefthook** (Go binary, parallel-native) - Husky BANNED
4. **Coverage 80/75/80/80 + Stryker mutation testing** (only gate agents can't game)
5. **Semgrep PR + CodeQL nightly** layered SAST
6. **Lost Pixel + Playwright snapshots** visual regression (self-hosted)

## Fail-closed convention + mandatory failure fixtures (BINDING)

**Convention:** any guard, gate, sweep, or converger that cannot PROVE its input MUST exit nonzero (or report HELD/BLOCK). "No data" is never "no problems". A gate passes only on positively verified evidence; a failed fetch, a failed parse, a missing tool, or a truncated enumeration is a failure of the gate run, never a clean result. In `--apply` modes, an unproven input additionally means ZERO mutations.

Forbidden fail-open patterns in gate code (each caused a live incident):

- Coercing unproven evidence to a passing default (`${COUNT:-0}` after a failed external call).
- `echo`-then-`exit 0` stubs when a required binary is missing from PATH.
- Treating a parse that yields an empty set as a proven-empty result.
- Fixed `--limit N` reads that silently drop rows past the cap.
- Accepting truncated search or probe output as a complete enumeration.

**Mandatory failure fixtures:** every gate test suite MUST include at least one failure fixture per class below for each class that applies to the gate's input channels. A suite with only happy-path and clean-fail cases is incomplete: the fixture must prove the gate fails closed when its input cannot be proven, and that `--apply` performs zero mutations under the failing stub.

### Failure-fixture checklist (5 classes)

| # | Fixture class | Fixture simulates | Suite must assert | Source incident |
|---|---|---|---|---|
| 1 | External-call failure | GraphQL/API exit 1, errors-JSON body, RATE_LIMITED | nonzero exit (gate BLOCK) / sweep HELD; zero mutations under `--apply` | notification gate THREADS_JSON: a rate-limited GraphQL check was indistinguishable from zero unresolved threads (`${UNRESOLVED_TOTAL:-0}` coercion); `--apply` cleared a notification under a failing stub |
| 2 | Missing binary | required tool absent from PATH | hook/gate exits nonzero; no echo-then-exit-0 masking | lefthook command echoed a warning and exited 0 when the tool was missing |
| 3 | Cap-reached | result count equals the fixed `--limit` | nonzero exit (or cursor paging to exhaustion); zero mutations under `--apply` | check-roadmap-milestone-fields `--limit 500/1000` truncation false-passed items beyond the cap |
| 4 | Truncated search/probe | `pageInfo.hasNextPage == true`; clipped search/probe output | BLOCK/HELD until full enumeration is proven | orchestration §3.10 barrier probe default `--limit 30` truncation read as clear-to-dispatch (live: 36 open issues, probe returned 30) |
| 5 | Silent-empty parse | malformed or missing input parsed into an empty set | "proven empty" is distinguishable from "could not parse"; the latter exits nonzero (or surfaces `degraded:true` and skips downstream writes) | dep-graph builder produced silently empty edges and downstream ranking consumed them as truth |

**Citation anchor:** gate suites cite this section in fixture comments as `[[curaos-quality-gates-rule]] "Fail-closed convention + mandatory failure fixtures"`. First implementers: the pr-notification-gate + sweep-pr-notifications suites (classes 1 and 4, RP-02) and the converger cap-reached suites for check-roadmap-milestone-fields / sweep-foresight-staging / sweep-roadmap-milestone-fields (class 3, RP-07) MUST carry this citation.

## Banned

- Husky (use Lefthook - Go binary, parallel, monorepo scoping)
- depcheck-only (use Knip - covers unused files+exports+deps+unlisted in one run)
- Optic (dead 2025-2026; use regen-and-diff)
- ESLint as primary linter (use oxlint primary + ESLint only for type-aware ~20%)
- Prettier as primary formatter (use Biome single binary)
- Coverage % as the only gate (agents game by mocking everything; require mutation testing too)
- SAST as primary CI gate (use Semgrep PR + CodeQL nightly layered)
- Percy (cloud-only; use Lost Pixel self-hosted MIT)
- Dependabot for monorepos (use Renovate - workspace-aware)
- pre-commit framework Python (use Lefthook Go binary - Bun-primary stack)
- Stryker against Vitest browser mode (Playwright-backed; doesn't work; use Tier D Playwright snapshot instead)
- Mock-everything tests passing CI (Stryker mutation testing detects)
- Fail-open gate code: `${VAR:-0}` coercion of unproven evidence, echo-then-exit-0 missing-binary stubs, fixed `--limit` truncation accepted as complete, silent-empty parses (see "Fail-closed convention + mandatory failure fixtures" above; failure fixtures mandatory per gate suite)
- Bypassing CI weakening (`|| true`, conditional gates, coverage threshold edits) - PR template Evidence checklist per [[curaos-repo-conventions-rule]] enforces
- Force push bypassing branch protection (per [[curaos-repo-conventions-rule]])
- Generated file edited directly (regen-and-diff Tier C catches)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| 5-tier gate ordering by cost | Fail fast at cheap gates; expensive gates only on PR/nightly |
| oxlint primary (Rust) | 50-100× ESLint speed; 699 built-in rules; oxlint-migrate generates .oxlintrc.json from existing ESLint flat config |
| Biome formatter | Single binary; eliminates Prettier/ESLint formatter fights; 2-3s on 500-file project vs 15-30s |
| ESLint v9 only for type-aware | ~20% of rules oxlint lacks (security plugins, custom NestJS rules); use `eslint-plugin-oxlint` to suppress overlap |
| Lefthook (Go binary) | Saves ~200ms per hook vs Husky Node startup; native `parallel: true` cuts 30s sequential hooks to 8s; `root:` scoping per package |
| Husky banned | Node startup cost per hook (~200ms); legacy inertia (5M downloads vs 400K Lefthook); no native parallel |
| Stryker mutation testing | Empirical (arxiv:2602.00409): agents add mocks at 36% rate vs 26% human; 100% coverage / 0% confidence; mutation testing is ONLY gate agents can't game by writing more mocks |
| Coverage thresholds 80/75/80/80 | Reasonable defaults; codecov per-PR comments; --check-coverage exits 1 |
| Knip vs depcheck | Knip finds: unused files+exports+deps+unlisted deps+unused devDeps+duplicate deps+unresolved imports in one run; depcheck only deps |
| Syncpack | Used by AWS/Cloudflare/Vercel/Raycast; agents introduce duplicate-version deps frequently |
| TruffleHog CI vs Gitleaks pre-commit | Gitleaks <1s on diffs (pre-commit speed); TruffleHog <2% FP w/ live verification (CI depth) |
| Semgrep + CodeQL layered | LinkedIn 2026 SAST pipeline pattern: Semgrep PR-level (10s median) + CodeQL nightly (deeper semantic, build-required) |
| Lost Pixel | OSS self-hosted MIT; 4-container deploy; Storybook/Ladle/Histoire support; migration from Chromatic/Percy takes minutes |
| Optic dead (2025-2026) | Migrated to PactFlow / Schemathesis / custom regen-and-diff scripts |
| TypeSpec contract drift via regen-diff | `bun run codegen && git diff --exit-code src/generated/` - cheapest reliable drift detection |
| Lighthouse CI 0.15.x w/ Lighthouse 12.6.1 | Current 2026; `fetch-depth: 20` mandatory (shallow clones break ancestor detection) |

## 5-tier gate ordering (locked by cost)

### Tier A - pre-commit (Lefthook, <5s, blocks commit)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,js,jsx,json}"
      run: bunx biome check --write {staged_files}
    oxlint:
      glob: "*.{ts,tsx}"
      run: bunx oxlint {staged_files}
    gitleaks:
      run: gitleaks protect --staged --redact
    typecheck-staged:
      run: bun run typecheck:staged
      stage_fixed: true

commit-msg:
  commands:
    commitlint:
      run: bunx commitlint --edit {1}

pre-push:
  commands:
    knip:
      run: bunx knip
    syncpack:
      run: bunx syncpack list-mismatches
```

**Tooling locked:** Lefthook + oxlint + Biome + gitleaks + commitlint + Knip + syncpack

### Tier B - fast CI (PR fast lane, <60s)

```
tsc --noEmit              (type check)
knip                      (unused exports/deps/files)
syncpack list-mismatches  (version consistency)
semgrep --config auto     (SAST PR-level, 10s median)
bundle-size check         (esbuild-bundle-analyzer; threshold 20% delta)
publint + attw            (per-package on publish)
```

**Tooling locked:** tsc (or tsgo `--noEmit`) + Knip + Syncpack + Semgrep + esbuild-bundle-analyzer + publint + @arethetypeswrong/cli (attw)

### Tier C - full CI (PR full lane, <5min)

```
vitest run --coverage     (thresholds: lines 80, branches 75, functions 80, statements 80)
stryker run --changed     (mutation test on changed files; thresholds: high 80, low 60, break 50)
trufflehog --verified     (secret scan w/ live verification, <2% FP)
codegen-drift-check       (`bun run codegen && git diff --exit-code src/generated/`)
```

**Tooling locked:** Vitest (V8 provider; c8-compatible) + Stryker + TruffleHog + TypeSpec/openapi-ts regen-and-diff

### Tier D - slow CI (optional PR gate, <15min)

```
playwright test           (E2E on staging-like env)
lighthouse ci             (web vitals; fetch-depth: 20 mandatory)
lost-pixel                (visual regression for Storybook components + Playwright snapshots)
```

**Tooling locked:** Playwright + LHCI 0.15.x w/ Lighthouse 12.6.1 + Lost Pixel

### Tier E - nightly (full coverage + slower checks)

```
codeql analyze            (deeper semantic dataflow; SSRF/SQLi/injection beyond Semgrep)
stryker run               (full mutation suite, not just --changed)
syft + grype              (SBOM + CVE scan)
renovate                  (dep update PRs)
ground-truth eval suite   (per [[curaos-agent-eval-obs-rule]] when locked)
```

**Tooling locked:** CodeQL + Stryker (full) + syft + grype + Renovate

**Tier E execution path (local-CI-first era, BINDING per [[curaos-local-ci-first-rule]]):**

- The DEFAULT execution path is LOCAL: a cron or launchd schedule invoking `scripts/tier-e-local.sh` (workspace repo). The runner executes the local scanner equivalents of the four `curaos/ci-gates.yaml` Tier E jobs (semgrep deep ruleset `p/security-audit` + `p/owasp-top-ten` + `p/secrets` as the local CodeQL substitute; full Stryker with `|| true` parity; SBOM + CVE via syft+grype when installed, else osv-scanner; Renovate config review) and archives evidence to `~/.local/state/curaos/tier-e/` (`latest.json` + per-run logs). Findings stay non-blocking (blocking:false parity with ci-gates.yaml), but a scanner that cannot run FAILS CLOSED.
- macOS schedule: `scripts/install-tier-e-schedule.sh` renders + loads `scripts/com.curaos.tier-e-nightly.plist.template` (launchd LaunchAgent, nightly 03:00; a slept-through interval coalesces into one run on wake). Linux schedule: the cron line printed by `scripts/install-tier-e-schedule.sh --cron-line`. Enabling the recurring schedule follows the seeded Tier E schedule-decision issue.
- `env -u GITHUB_TOKEN gh workflow run tier-e-nightly.yml` is permitted ONLY as an explicit one-off workflow-body validation with same-turn user approval, OR under a documented billing-restored condition (Actions auto-triggers re-enabled per [[curaos-local-ci-first-rule]]). No recurring GitHub Actions dependency may satisfy Tier E while Actions triggers are `workflow_dispatch`-only.
- Stop-predicate (wave-done): "Tier E evidence newer than 7 days". `bash scripts/check-tier-e-freshness.sh` must exit 0 before a milestone wave settles to a terminal state; it reads `latest.json` and FAILS CLOSED on missing, stale, failed, or unparseable evidence (`TIER_E_MAX_AGE_DAYS` overrides the window; `TIER_E_STATE_DIR` the evidence root).

## Tooling per tier (locked w/ thresholds)

### Linters

| Layer | Tool | Why |
|---|---|---|
| **Fast first-pass** | **oxlint 1.0** (Rust binary, 50-100× ESLint speed; 699 rules) | Catches 80% of issues in <1s on most codebases; covers ESLint core + TypeScript + React + Vitest + Import + Unicorn + jsx-a11y |
| **Type-aware second-pass** | **ESLint v9 flat config** w/ `eslint-plugin-oxlint` to suppress overlap | ~20% of rules oxlint lacks (security plugins, custom NestJS rules, @typescript-eslint/strict) |
| **Formatter** | **Biome 2.0** (single binary; Prettier-compatible output; 2-3s on 500-file project) | Eliminates Prettier/ESLint formatter fights |
| **Markdown/YAML** | **Prettier 3.x** for YAML/Markdown only (Biome doesn't format YAML) | Hybrid: declare in `.editorconfig` which tool owns which extension |

### Type checking

| Layer | Tool | Threshold |
|---|---|---|
| **TypeScript baseline** | TS 6.x w/ `"strict": true` default | All flags: noUncheckedIndexedAccess + exactOptionalPropertyTypes + noImplicitOverride + isolatedDeclarations |
| **Pre-commit check** | `tsc --noEmit --incremental` (staged files only) | 2-5× faster on re-runs via tsBuildInfoFile |
| **Fast type check** | `tsgo --noEmit` (TS 7 Go compiler) when stable | 77.8s → 7.5s on VS Code codebase |
| **Type coverage** | `type-coverage` (plantain-00) | Agent codebases: ≥90% (agents generate `any` liberally) |
| **Package type quality** | `@arethetypeswrong/cli (attw)` + `publint` | Run on `npm pack` before publish; catch exports-map bugs |

### Commit hooks (Lefthook locked; Husky BANNED)

```yaml
# lefthook.yml - Tier A pre-commit + commit-msg + pre-push
```

- Lefthook Go binary: ~200ms saved per hook vs Husky Node startup
- Native `parallel: true` cuts 30s sequential → 8s parallel
- `root:` scoping per package for monorepo
- `stage_fixed: true` auto-stages files fixed by formatters
- Banned alternatives: Husky (Node startup + no parallel + legacy inertia), simple-git-hooks (no parallel + no monorepo scoping), pre-commit (Python startup overhead)

### Secrets scanning (layered)

| Layer | Tool | Cost | FP rate |
|---|---|---|---|
| **Pre-commit (Tier A)** | **Gitleaks** (`protect --staged --redact`) | <1s on modest diffs | 5-15% w/o tuning |
| **CI (Tier B)** | **TruffleHog** w/ live verification (`--verified`) | Per-PR | <2% w/ verification |

GitGuardian as enterprise option (1-3% FP via ML); skip unless tenant requires.

### Dependency security (3 distinct tools for 3 problems)

| Problem | Tool | Schedule |
|---|---|---|
| Malicious packages (supply chain) | **Socket.dev** | Pre-install hook (behavioral analysis catches before CVE indexed) |
| Known CVEs in installed packages | **Snyk** OR **Dependabot** | Daily |
| Dependency freshness + update PRs | **Renovate** | Nightly (workspace-aware; self-hostable) |

Banned: Dependabot for monorepos (use Renovate - more config power, workspace-aware).

### Coverage + mutation testing

**Coverage thresholds (locked, agent-codebase appropriate):**

```jsonc
// vitest.config.ts
coverage: {
  provider: "v8",
  thresholds: {
    lines: 80,
    branches: 75,
    functions: 80,
    statements: 80
  },
  reporter: ["text", "lcov", "html"]
}
```

Codecov: per-PR coverage diff; `--check-coverage` exits 1 if threshold missed (blocks merge).

**Review-thread resolution gate (BINDING):**

A PR is `safe-to-merge-clean` ONLY when every reviewer review THREAD is resolved AND no thread is escalated/tagged `needs-human` (a review thread left intentionally open for the user). An unresolved review thread BLOCKS merge-clean even when coverage, mutation, lint, and CI all pass. `"merged" alone is insufficient` - a merged-state PR with an open thread or an open `needs-human` thread is not done. Notification-clear is `safe-to-clear-notification` on this same predicate AND a dry-run first: surface the would-clear set, confirm, then clear (e.g. `scripts/mark-pr-notification-done --apply <owner/repo> <N>`, dry-run by default, gated on no-open-`needs-human`). API routing is REST-first: REST may prove no review threads exist only when PR review comments are empty and no review is `CHANGES_REQUESTED`; otherwise targeted GraphQL is required for `reviewThreads.isResolved` / `resolveReviewThread`, and quota exhaustion reports `awaiting-graphql-thread-check` instead of merge-clean.

**Mutation testing thresholds (Stryker):**

| Score | Verdict |
|---|---|
| <60% | Weak - significant test gaps |
| 60-80% | Moderate - improvement needed |
| 80-90% | Good |
| >90% | Strong |

```jsonc
// stryker.config.json
{
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutate": ["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/*.e2e.ts"],
  "thresholds": { "high": 80, "low": 60, "break": 50 },
  "reporters": ["html", "progress", "dashboard"]
}
```

**Stryker enforcement:**
- Tier C (PR full lane): `stryker run --changed` (changed files only; <5min)
- Tier E (nightly): full Stryker suite
- Caveat: doesn't work w/ Vitest browser mode (Playwright-backed)

**Why mutation testing is the only gate agents can't game:** agents add mocks to make tests pass (empirical: 36% mock rate vs 26% human); 100% line coverage with mocked-everything tests = 0% real confidence; Stryker mutates code and checks if tests fail - a test that mocks everything won't catch mutations.

### SAST: Semgrep + CodeQL layered

| Tool | When | Cost | FP |
|---|---|---|---|
| **Semgrep CE** | Every PR (Tier B fast CI) | 10s median; 30+ languages; SARIF to GitHub Security | Moderate; tunable |
| **CodeQL** | Nightly (Tier E) | Minutes-30min; deeper semantic dataflow | Low (GitHub Advanced Security for private repos free for public) |

LinkedIn 2026 SAST pipeline pattern.

Local-CI-first era: CodeQL has no local CLI in the toolchain, so the Tier E LOCAL runner (`scripts/tier-e-local.sh`, the default execution path) substitutes the semgrep deep ruleset (`p/security-audit` + `p/owasp-top-ten` + `p/secrets`) until the billing-restored condition re-enables Actions nightly CodeQL.

### AST tools

| Tool | Use |
|---|---|
| **ast-grep (sg)** | Structural code search + rewrites via tree-sitter grammars; enforces invariants ESLint plugins can't (e.g., `sg -p 'console.log($ARGS)' --lang ts`) |
| **jscodeshift** | Large-scale migrations (import rename, decorator transforms); slower than ast-grep |
| **tree-sitter** | Underlying parser; rarely invoked directly (ast-grep wraps it) |

### Performance regression detection

| Tool | Use | Threshold |
|---|---|---|
| **esbuild-bundle-analyzer** | Bundle size delta per PR | `percent_extra_attention: 20` alert on 20%+ increase; block on absolute threshold |
| **bundlejs** | Online treeshake + minify + compress dep cost check | Before adding deps |
| **Lighthouse CI 0.15.x** (Lighthouse 12.6.1) | Web vitals on Astro/Next apps | `performance ≥0.9`, `first-contentful-paint ≤2000ms`, `total-byte-weight ≤512KB` |

Note: `fetch-depth: 20` mandatory in GitHub Actions - shallow clones break ancestor detection.

### Visual regression (self-hosted only)

| Tool | Use | Self-hosted |
|---|---|---|
| **Lost Pixel** | Storybook component-level + page-level for healthstack flows | Yes (4-container OSS MIT) |
| **Playwright `toHaveScreenshot()`** | Full-page E2E regression on clinical workflows | Yes (built-in) |
| **Chromatic** | Allowed if Storybook team adopts (paid SaaS); per [[curaos-error-tracking-rule]] session replay banned on healthstack-* | Cloud |
| **Banned** | Percy (cloud-only; violates self-hosted-first per [[curaos-orchestration-rule]]) | - |

### Codegen drift detection

| Tool | Use |
|---|---|
| **TypeSpec regen-and-diff** | `bun run codegen && git diff --exit-code src/generated/` - Tier C gate |
| **PactFlow** | Contract-driven testing for OpenAPI/gRPC/GraphQL/AsyncAPI; MCP Auto-Test feature; optional |
| **Schemathesis** | Property-based testing from OpenAPI; fuzzes API endpoints | Optional |
| **Dredd** | OpenAPI spec vs live server validation | Optional NestJS |
| **Banned** | Optic (dead 2025-2026) - use regen-and-diff instead |

## Anti-pattern: tests that mock everything

Per arxiv:2602.00409: agent commits add mocks at 36% rate vs 26% human. Mock-everything tests pass while integration breaks.

**Mitigation gates:**

1. **Lint rule for excessive mocking**: count `jest.mock()` / `vi.mock()` calls per test file; flag where mocks > real assertions
2. **Integration test requirement**: every service ≥N integration tests exercising real DB/message broker (not mocked)
3. **Mutation testing (Stryker)**: only gate that cannot be gamed by writing more mocks
4. **Contract tests**: real HTTP calls against running service w/ real deps (PactFlow or Dredd)
5. **PR review directive (per [[curaos-repo-conventions-rule]])**: "Do not mock the system under test. Mock only external service boundaries."

## Gate philosophy

> "Pipelines need to catch the failure modes AI actually produces, not just the ones designed for when humans wrote everything."

Gates agents can game by writing more code: coverage %.
Gates that require real behavior: mutation score, integration tests, contract tests, regen-and-diff.

## Rules-as-tooling: two-tier enforcement policy (BINDING)

Codified by remediation item RP-22 (deep review section 2 row 2). Incident set: the in-flight generator barrier was ignored, the em-dash ban was violated repeatedly including the PR #310 self-regression, and the AI-attribution-trailer ban went unenforced; meanwhile every pattern that received a converger script stopped recurring while prose-only patterns all recurred (RISK-REGISTER rows RR-02 + RR-10). Prose/LLM enforcement of deterministic invariants has a hard compliance ceiling; binding invariants get tools, not reminders.

**The two tiers:**

1. **Tier 1: deterministic, tool-enforced.** Any binding invariant a grep, script, or test can check MUST be enforced by a committed gate wired into an always-on path: a lefthook pre-commit/commit-msg command, `scripts/check-docs.sh`, a `just ci` suite, a converger script (dry-run default, nonzero exit on drift, `--apply` to fix), or a wave stop-predicate. The prose rule keeps a one-line statement of the invariant plus a link to the gate; the gate is the enforcement.
2. **Tier 2: context-sensitive, prose-enforced.** Rules requiring judgment (stack-choice escalation, scope approval, PHI-boundary design calls, generic-before-vertical placement, recommendation auto-apply) stay prose; they are enforced by agent attention plus T2/T3 review per [[curaos-verification-stack-rule]] and are NOT listed in the inventory below.

**Landing discipline:** a new binding rule containing a deterministic invariant lands WITH its gate in the same PR, or with a RISK-REGISTER row (`gate: NONE`) plus a seeded gate issue. A deterministic invariant living only in prose is a defect under this policy, not a style choice. Every Tier 1 gate obeys the fail-closed convention + failure-fixture checklist above.

### Deterministic-invariant inventory (workspace repo, 2026-06-10)

| Deterministic invariant | Canonical rule/doc | Gate | Wired into |
|---|---|---|---|
| No em/en dashes in committed content | [[curaos-no-em-dash-rule]] | `scripts/check-no-dashes.sh` (RP-09) | lefthook pre-commit `no-dashes` |
| Conventional Commits subject + AI-attribution-trailer ban | [[curaos-repo-conventions-rule]] + AGENTS.md section 8 | `scripts/check-commit-msg.sh` (RP-10) | lefthook commit-msg `conventional-msg` |
| No secrets staged | AGENTS.md section 8 security gates | `gitleaks protect --staged --redact` | lefthook pre-commit `gitleaks` |
| ai/curaos 1:1 structural mirror of curaos | [[curaos-ai-mirror-rule]] | `scripts/check-ai-mirror.sh` | lefthook pre-commit `ai-mirror` + `just mirror` |
| Every Markdown file reachable from root AGENTS.md | [[curaos-doc-graph-rule]] | `scripts/check-doc-graph.js` | `scripts/check-docs.sh` (lefthook `doc-graph` + `just docs`) |
| Executor CONTRACT = playbook frontmatter (forward + reverse pass) | `docs/agents/workflows/README.md` | `scripts/check-workflow-sync.js` | `scripts/check-docs.sh` |
| Workflow executor portability envelope | `docs/agents/workflows/README.md` | `scripts/check-workflow-portability.js` | `scripts/check-docs.sh` |
| Per-module AGENTS.md schema (frontmatter keys, sections, caps) | [[curaos-agents-md-schema-rule]] | `scripts/check-agents-schema.js` (RP-14; warn-first + allowlist, ratchet `CHECK_AGENTS_SCHEMA_MODE=fail`) | `scripts/check-docs.sh` |
| Rule index (ai/rules README + AGENTS.md section 15) = rule frontmatter; rule size budget | [[curaos-memory-agents-sync-rule]] (RP-26 + RP-63) | `scripts/generate-rule-index.js` | `scripts/check-docs.sh` |
| Staged submodule gitlink is ancestor of origin default branch (re-pin discipline) | [[curaos-repo-conventions-rule]] | `scripts/check-submodule-pins.sh` (RP-30) | `just pins` (pre-push via `.githooks/pre-push` running `just ci`) |
| In-flight generator/SDK barrier blocks downstream dispatch | [[curaos-generator-evolution-rule]] | executor-side filter in `scripts/workflows/milestone-wave.workflow.js` consuming `generator_inflight` + truth-contract regression (RP-04) | `just test-js` |
| Merge-clean = all review threads resolved + no `needs-human` | [[curaos-verification-stack-rule]] + this rule's review-thread gate | `scripts/pr-notification-gate` + `scripts/sweep-pr-notifications` | converger (dry-run default) + session closeout |
| Tier E evidence newer than 7 days at wave close | this rule, Tier E execution path | `scripts/check-tier-e-freshness.sh` | wave-done stop-predicate |
| Roadmap milestone-field hygiene | [[curaos-roadmap-workflow-rule]] | `scripts/check-roadmap-milestone-fields` + `scripts/sweep-roadmap-milestone-fields` | converger (exit 3 on drift) |
| Canonical labels present on every org repo | [[curaos-roadmap-workflow-rule]] + `docs/agents/triage-labels.md` | `scripts/sweep-label-seed` | converger (exit 3 on missing label) |
| Claim labels stripped when issues close | `docs/agents/triage-labels.md` | `scripts/sweep-closed-issue-labels` | converger + session closeout |
| Foresight issues stay STAGED until milestone activation | [[curaos-foresight-rule]] | `scripts/sweep-foresight-staging` | converger + session closeout |

**Prose-only deterministic invariants (gate: NONE, tracked in RISK-REGISTER RR-02):**

| Deterministic invariant | Canonical rule | Gate |
|---|---|---|
| Banned tooling absent from manifests/configs (Husky, Percy, Optic, depcheck-only, class-validator, pre-commit-Python) | this rule "Banned" + [[curaos-validation-rule]] | NONE, tracked in RISK-REGISTER (RR-02) |
| kebab-case naming; no snake_case or wrapper dirs | AGENTS.md section 1 + [[curaos-repo-conventions-rule]] | NONE at workspace level, tracked in RISK-REGISTER (RR-02) |
| Banned MCP servers absent from tracked mcp.json files | [[curaos-mcp-stack-rule]] | NONE (manual sweep clean 2026-06-10, RP-65), tracked in RISK-REGISTER (RR-02) |
| No `-v2` / `-next` / `*-new` parallel-path names | [[curaos-rolling-update-rule]] | NONE, tracked in RISK-REGISTER (RR-02) |
| Exact dependency pins + SHA-pinned Actions + digest-pinned images | [[curaos-version-pinning-rule]] | NONE at workspace level (docs.yml hand-verified SHA-pinned), tracked in RISK-REGISTER (RR-02) |

Each NONE row follows the register's aging policy: unguarded rows older than 3 sessions convert to staged foresight issues per [[curaos-foresight-rule]]. When a gate lands for a NONE row, move the row into the gated table above and update RR-02 in the same PR.

## Failure mode → gate map (extends [[curaos-verification-stack-rule]] catalog)

| Agent failure mode | Gate that catches |
|---|---|
| Unused imports/exports | Knip + ESLint `no-unused-vars` (Tier B) |
| `any` type proliferation | type-coverage threshold ≥90% (Tier C) |
| Mock-everything tests | Stryker mutation test (Tier C/E); integration test gate (Tier C) |
| Leftover `console.log` | ast-grep / oxlint rule (Tier A) |
| Hardcoded secrets | Gitleaks pre-commit (Tier A); TruffleHog CI (Tier B) |
| Added malicious/bloated dep | Socket.dev (pre-install); bundle size budget (Tier B) |
| Version drift in monorepo | Syncpack CI check (Tier A/B) |
| Generated file edited directly | Regen-and-diff (Tier C) |
| Spec-to-reality drift | Contract tests (PactFlow/Schemathesis/Dredd) (Tier C) |
| Visual regression in components | Lost Pixel / Playwright snapshots (Tier D) |
| Bundle size regression | esbuild-bundle-analyzer PR comment + threshold (Tier B) |
| Security vuln in new code | Semgrep per-PR (Tier B); CodeQL nightly (Tier E) |
| Missing exports-map types | attw + publint on every package publish (Tier B) |

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §6 NFR | Coverage 80/75/80/80 + mutation 60% break enforces reliability |
| AGENTS.md §8 execution standards | CI/CD trunk-based + security gates default-on per layered approach |
| AGENTS.md §9 Definition of Done | All 5 tiers contribute to "done" closure (per [[curaos-verification-stack-rule]]) |
| AGENTS.md §11 boundaries | Mutation + contract + integration test gates prevent silent failures at swarm scale |
| [[curaos-verification-stack-rule]] | This rule provides tooling implementation for T1+T2 gates |
| [[curaos-repo-conventions-rule]] | Commitlint + PR template + CODEOWNERS reference Tier A/B implementation |
| [[curaos-cli-agents-rule]] | All CLIs invoke `bun run ci` per Toolchain Registry in AGENTS.md |
| [[curaos-bun-primary-rule]] | All tooling installed via `bunx` (one-time `bun add -g`); Verdaccio caches |
| [[curaos-validation-rule]] | class-validator banned per validation rule; Zod 4 default reflected in fail-fast type check |
| [[curaos-image-build-rule]] | syft SBOM + cosign signing integrated at Tier E |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Why this gate stack wins for agents:

- **5-tier ordering by cost** = fail fast at cheap gates; agents get feedback in <5s pre-commit
- **Mutation testing** = only gate agents can't game by writing more mocks (empirical 36% mock rate)
- **Lefthook parallel** = 30s sequential hooks → 8s parallel; agent dev loop unblocked faster
- **oxlint Rust** = 50-100× ESLint; lint feedback in <1s
- **Biome single binary** = no Prettier/ESLint formatter fights; agents emit consistent output
- **Knip + Syncpack** = catches unused exports + version drift (agent failure modes)
- **TypeSpec regen-and-diff** = generated code drift detection w/o complex tooling
- **Failure mode → gate map** = explicit catalog of which agent failure each gate catches
- **Gate philosophy** = pipelines designed for AI failure modes, not human-only

## How to apply

- Install one-time: `bun add -g lefthook commitlint @commitlint/cli @commitlint/config-conventional knip syncpack oxlint @biomejs/biome stryker @stryker-mutator/vitest-runner trufflehog @arethetypeswrong/cli publint`
- Brew install one-time: `brew install gitleaks semgrep syft grype` (already installed per [[curaos-mcp-stack-rule]] audit)
- `lefthook.yml` at workspace root w/ Tier A gates
- `.github/workflows/ci.yml` w/ Tier B + C + D matrix per PR
- `.github/workflows/tier-e-nightly.yml` w/ Tier E + ground-truth eval suite (`workflow_dispatch`-only while billing is exhausted; the DEFAULT Tier E execution path is the local cron/launchd schedule running `scripts/tier-e-local.sh`, installed via `scripts/install-tier-e-schedule.sh`)
- `vitest.config.ts` w/ coverage thresholds 80/75/80/80
- `stryker.config.json` w/ break threshold 50, low 60, high 80
- `.dependency-cruiser.js` per [[curaos-repo-conventions-rule]] boundary rules
- Per-package `publint` + `attw` run on every `bun publish`
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15

## ADRs queued

Per digest §6:
- **ADR (NEW, quality gate ordering + tooling + thresholds)** - number TBD (0156 reused by auth-token-flow; use next free number ≥0212): full version; this rule = short form
- **ADR-0099 (charter)**: amend §8 execution standards to reference 5-tier gate ordering
