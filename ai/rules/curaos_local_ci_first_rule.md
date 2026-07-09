---
name: curaos-local-ci-first-rule
title: Local-CI-first (local `just ci` default gate + GH Actions `workflow_dispatch`-only + evidence-pasting)
description: BINDING - org GitHub Actions billing exhausted, so LOCAL CI is the DEFAULT verification + merge gate; GitHub Actions CI workflows are workflow_dispatch-only (7 auto-trigger workflows stripped of on:pull_request/push/schedule across curaos-ai-workspace docs.yml + curaos tier-b/c/d/e + identity-service/builder-core-service/builder-studio ci.yml); the gate that previously came from an auto GH check now comes from a green `just ci` (delegates to scripts/ci-local.sh in curaos; the gate DEFINITION is single-sourced in curaos/ci-gates.yaml which ci-local.sh + the dispatch-only GH tier-*.yml + the agent prompts + the workflow executors all READ, with node scripts/check-ci-gates-sync.js as a BLOCKING drift gate - edit the config never the consumers; tiers map to [[curaos-quality-gates-rule]]; mirrors the 5-tier GH step order) PLUS verbatim local CI stdout pasted per one-task §8.1 + over-claim re-run per milestone §7.1; GitHub CI triggered manually ONLY when genuinely needed via `env -u GITHUB_TOKEN gh workflow run <wf>.yml --repo <repo> --ref <branch>` (never as routine per-PR gate); RE-ENABLE auto triggers (re-add on:pull_request/push/schedule, keep workflow_dispatch) ONLY when billing restored OR contributor-scale exceeds solo maintainer; composes with [[curaos-verification-stack-rule]] T1/T2 + [[curaos-quality-gates-rule]] 5-tier; runbook ai/curaos/docs/ci-local.md
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-30, GitHub Actions billing pivot):

## The rule

**Local CI is the default verification + merge gate. GitHub Actions CI is `workflow_dispatch`-only.**

1. **LOCAL CI = default gate.** A green `just ci` (delegates to `curaos/scripts/ci-local.sh`, the single
   source of truth) is the gate that previously came from an auto GitHub Actions check. The runner
   mirrors the same checks in the same order as the GH CI steps, so a green local run == a green CI run.
2. **GitHub Actions CI = `workflow_dispatch`-only.** All `on: pull_request` / `on: push` / `on: schedule`
   triggers were stripped from CI workflows (job bodies unchanged, still hand-triggerable). 7 workflows
   converted (see table below).
3. **Evidence replaces the green check.** Because there is no auto check to point at, the merge gate is
   the local run PLUS verbatim local CI stdout pasted per one-task §8.1 + confirmed by the orchestrator's
   over-claim re-run per milestone §7.1.
4. **Manual GitHub trigger only when genuinely needed** - runner-specific / OS-matrix validation, a
   one-off air-gap image build, or confirming a workflow body still works. NEVER as a routine per-PR gate.
5. **Re-enable auto CI** when billing is restored OR contributor scale exceeds the solo maintainer
   (reverse procedure below).

## The gate DEFINITION - `curaos/ci-gates.yaml` (single source of truth)

The gate set is **defined ONCE** in [`curaos/ci-gates.yaml`](https://github.com/your-org/curaos/blob/main/ci-gates.yaml).
Every gate appears there exactly once (`id`, tier `A`-`E`, `run:` cmd, `scope`, `blocking`, `needs`/`services`),
GHA-shaped so reactivating auto CI is a near-1:1 lift back into `.github/workflows/*.yml`. **Every consumer
READS this config; none re-defines the gate:**

- `curaos/scripts/ci-local.sh` runs the gates from it (and `just ci` / `just ci-service` / `just ci-changed` delegate to that script).
- the dispatch-only GH `tier-*.yml` workflows mirror its `run:` steps verbatim.
- the agent prompts (one-task §8/§8.1, milestone §7.1/§9) cite "the BLOCKING gates in `ci-gates.yaml`" as the
  command list to run + paste, NOT a frozen hardcoded set.
- the agent-workflow executors (`tdd-implement`, `pr-verify-merge`, `task-execute`, `context-load`) source the
  verify/merge gate from it.

`node curaos/scripts/check-ci-gates-sync.js` is itself a **BLOCKING gate** (`ci-gates-sync` in the config): it
FAILS (exit 1) if any `tier-*.yml` `run:` command drifts from `ci-gates.yaml`. Green sync-check ⇒ the local gate
definition == the dispatch-only GH workflow definition, so a green local run is a faithful CI simulation. **EDIT
the config, NEVER the consumers** - change a gate by editing `ci-gates.yaml`, then run `check-ci-gates-sync.js`;
the change propagates to `ci-local.sh`, the GH workflows, the prompts, and the executors. The config's tiers
(`A`-`E`) map directly onto the [[curaos-quality-gates-rule]] 5-tier-by-cost model.

## Banned

- Routine per-PR `gh workflow run` to recreate auto CI (burns the budget the pivot protects)
- Adding `on: pull_request` / `push` / `schedule` back to any CI workflow without the billing-restored
  OR contributor-scale trigger (and without updating this rule + runbook)
- Treating a summarized "N pass / 0 fail" as the merge gate (no backing verbatim paste = no evidence)
- Deleting `curaos/justfile` or `curaos/scripts/ci-local.sh` (local CI stays even after auto CI returns)
- Weakening the local gate (`|| true`, skipping steps, editing coverage thresholds) to force a green run
- Editing a gate command in a CONSUMER (`ci-local.sh`, a `tier-*.yml`, a prompt, an executor) instead of in
  `curaos/ci-gates.yaml` - the config is the single source of truth; consumer edits drift the gate and the
  `ci-gates-sync` self-gate will FAIL. Edit the config, re-run `check-ci-gates-sync.js`, let it propagate.
- Bypassing the `ci-gates-sync` self-gate (it is BLOCKING) - a drifted config means the local run no longer
  mirrors CI, so green local CI would be a lie

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Mechanical / billing backing |
|---|---|
| Local CI is default | Org GH Actions billing exhausted - auto runs fail with "recent account payments have failed" and burn minutes the account lacks; per-commit minutes are no longer affordable |
| `workflow_dispatch`-only | Removes the per-push/PR minute drain while keeping the workflow body intact + hand-triggerable; zero auto consumption |
| Single `scripts/ci-local.sh` | One source of truth; `just` recipes delegate so non-`just` users run `bash scripts/ci-local.sh` and get identical behaviour; mirrors GH CI step order → green local == green CI |
| Evidence-pasting is the gate | No auto green check exists; a summarized "N pass / 0 fail" is gameable (issue #156), so verbatim stdout + orchestrator re-run is the only trustworthy substitute (composes with [[curaos-verification-stack-rule]] T1) |
| Manual trigger gated to "genuinely needed" | Every dispatched run still costs minutes; routine per-PR dispatch defeats the pivot |
| Re-enable on billing/contributor scale | Local-evidence-pasting scales for a solo maintainer; multi-contributor PRs need the shared auto check back; funded billing removes the cost constraint |

## What changed - 7 `workflow_dispatch`-only workflows

| # | Repo | Workflow | Was | Now |
|---|---|---|---|---|
| 1 | `curaos-ai-workspace` | `.github/workflows/docs.yml` | `pull_request`(paths) + `push` | `workflow_dispatch` only |
| 2 | `curaos` | `.github/workflows/tier-b-fast-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 3 | `curaos` | `.github/workflows/tier-c-full-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 4 | `curaos` | `.github/workflows/tier-d-slow-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 5 | `curaos` | `.github/workflows/tier-e-nightly.yml` | `schedule` (nightly) | `workflow_dispatch` only |
| 6 | `identity-service` | `.github/workflows/ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 7 | `builder-core-service` / `builder-studio` | `.github/workflows/ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |

Replacement runner shipped in curaos PR #134: `justfile` + `scripts/ci-local.sh`.

## How to apply

### Run local CI (default gate, from `curaos/` root)

```bash
just ci                         # full gate, all packages (no Docker)
just ci-service identity        # scoped to one package (short alias or @curaos/* name)
just ci-changed                 # only packages changed vs origin/main (git fetch origin main first)
just ci-integration             # full gate + verdaccio-backed integration (requires Docker)
bash scripts/ci-local.sh        # identical, without just
```

### Manually trigger GitHub CI (only when genuinely needed)

```bash
env -u GITHUB_TOKEN gh workflow run ci.yml \
  --repo your-org/identity-service --ref <branch>
env -u GITHUB_TOKEN gh run watch \
  "$(env -u GITHUB_TOKEN gh run list --repo <owner/repo> --workflow ci.yml \
       --branch <branch> --limit 1 --json databaseId --jq '.[0].databaseId')" \
  --repo <owner/repo> --exit-status
```

### Re-enable auto CI (reverse - only on billing-restored OR contributor-scale)

Re-add the stripped trigger block; keep `workflow_dispatch`:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:        # tier-e: restore `schedule: - cron: '0 3 * * *'`
```

Land one `ci:` / `chore(ci):` change per repo, then soften the evidence-pasting expectation and update
this rule + `ai/curaos/docs/ci-local.md`. Keep `justfile` + `scripts/ci-local.sh` as the fast pre-push
gate regardless.

## How it composes

- **[[curaos-verification-stack-rule]]** - T1 (every commit: `git status` + `git diff --stat` +
  `bun run ci` + `gitleaks` + `bun audit`) runs locally; the `bun run ci` step IS the local gate here.
  T2 (per-PR 3-lens review + grill) still applies; the missing piece is only the *auto* check, replaced
  by pasted local evidence. T3 HITL triggers (incl. `main` push) unchanged.
- **CodeRabbit dropped as a required gate (#705).** CodeRabbit fired only on GitHub webhooks, so it
  sat OUTSIDE this local merge gate; with auto CI off it could not gate at all. Its value is now a
  SaaS-free layered LOCAL review stack inside `scripts/ci-local.sh` (via `ci-gates.yaml` `local-only`
  jobs): `danger-policy` (deterministic CuraOS policies, blocking) then `semgrep-diff`
  (`--baseline-commit origin/main` via reviewdog, advisory) then `code-review` (**Claude `/code-review`
  is the semantic layer**, opt-in, advisory). The opposite-harness grill stays the deep T2 gate.
  Inline GitHub posting is guarded to the live-PR + token path only. Full design + escape hatch
  (PR-Agent OSS) in [[curaos-verification-stack-rule]] "Layered LOCAL review stack".
- **[[curaos-quality-gates-rule]]** - `scripts/ci-local.sh` mirrors the 5-tier model (Tier A pre-commit
  oxlint+Biome+gitleaks → Tier B fast tsc+Knip+Syncpack → Tier B/C aggregate `turbo run lint typecheck
  test build` → repo-boundary depcruise → opt-in Verdaccio integration). The tiers are unchanged; only
  the *trigger* moved from auto GH to local + manual dispatch.
- **[[curaos-swarm-collaboration-rule]] / one-task §8.1 / milestone §7.1** - the verbatim-stdout + over-claim
  re-run gates are now the merge evidence, not a supplement to an auto check.
- **[[curaos-gh-project-sync-env-workaround]]** - `env -u GITHUB_TOKEN gh` for the manual dispatch.

## Runbook

Full operator + agent procedure: `ai/<project>/docs/ci-local.md`.

Per [[curaos-memory-agents-sync-rule]]: this rule add propagates to memory (slug pointer only) +
`ai/rules/README.md` index + `AGENTS.md §15`.
