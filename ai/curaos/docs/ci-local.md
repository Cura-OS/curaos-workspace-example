# Runbook — Local CI First

**Last updated:** 2026-05-30
**Canonical rule:** [[curaos-local-ci-first-rule]] ([`../../rules/curaos_local_ci_first_rule.md`](../../rules/curaos_local_ci_first_rule.md))
**Governed by:** workspace [`AGENTS.md`](../../../AGENTS.md) · composes with [[curaos-verification-stack-rule]] + [[curaos-quality-gates-rule]]

> Operator + agent runbook for the **local-CI-first** verification model. Read this before opening a PR
> or merging anything in the CuraOS org.

---

## 1. Why (billing)

Org GitHub Actions billing is **exhausted** — pushes/PRs fail with *"recent account payments have
failed"* and every auto-triggered run consumes minutes the account no longer has. Rather than burn the
remaining budget on every commit, the workflows were flipped to **manual-trigger-only** and a local
runner now carries the merge gate.

The pivot (user directive, 2026-05-30):

- **LOCAL CI is the default verification gate.** A green `just ci` is the gate that previously came from
  auto GitHub Actions.
- **GitHub CI runs ONLY when manually triggered** (`workflow_dispatch`) — for special cases now (e.g.
  validating a runner-specific behaviour, a one-off air-gap image build), and as the
  contributor-scale escape hatch later.
- **Evidence replaces the green check.** Every PR/merge gate that previously relied on the auto
  GitHub check now relies on the local run **plus** the orchestrator/worker pasting verbatim local CI
  stdout. This dovetails with the one-task §8.1 VERBATIM-stdout rule and the over-claim re-run gate
  (milestone §7.1).

---

## 2. What changed (7 workflows → `workflow_dispatch`-only)

Every auto-trigger (`on: pull_request` / `on: push` / `on: schedule`) was stripped. Each workflow's job
body is **unchanged** and remains hand-triggerable. The table is the source of truth for what is OFF.

| # | Repo | Workflow file | Was triggered by | Now |
|---|---|---|---|---|
| 1 | `curaos-ai-workspace` | `.github/workflows/docs.yml` | `pull_request` (paths) + `push` | `workflow_dispatch` only |
| 2 | `curaos` | `.github/workflows/tier-b-fast-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 3 | `curaos` | `.github/workflows/tier-c-full-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 4 | `curaos` | `.github/workflows/tier-d-slow-ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 5 | `curaos` | `.github/workflows/tier-e-nightly.yml` | `schedule` (nightly cron) | `workflow_dispatch` only. DEFAULT execution path = local schedule: `bash scripts/tier-e-local.sh` (workspace repo), installed via `scripts/install-tier-e-schedule.sh`; freshness gate `scripts/check-tier-e-freshness.sh` |
| 6 | `identity-service` | `.github/workflows/ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |
| 7 | `builder-core-service` / `builder-studio` | `.github/workflows/ci.yml` | `pull_request` + `push` | `workflow_dispatch` only |

> The `add-to-roadmap.yml` callers across the org were already `workflow_dispatch`-only per the M1
> roadmap directive ([[curaos-roadmap-workflow-rule]]); they are not part of this pivot but follow the
> same pattern.

The replacement local runner shipped in **curaos PR
[#134](https://github.com/your-org/curaos/pull/134)**: a `justfile` + a single
`scripts/ci-local.sh` (single source of truth — the `just` recipes delegate to it, so non-`just` users
run the script directly). It mirrors the GH CI step order and emits a PASS/FAIL summary table with
per-step timing.

---

## 2.5 Gate definition = `ci-gates.yaml` (single source of truth)

Every CI gate is **defined once** in [`curaos/ci-gates.yaml`](https://github.com/your-org/curaos/blob/main/ci-gates.yaml).
The local runner, the dispatch-only GH workflows, the agent prompts, and the agent-workflow executors all
READ this one file — none re-declares the gate set. Edit the config, never the consumers.

### Schema (GHA-shaped, so reactivating auto CI is a near-1:1 lift)

```yaml
tiers:                       # maps to curaos_quality_gates_rule.md 5-tier-by-cost model
  A: { name: pre-commit-mirror, budget: 3min, workflow: tier-a-precommit-mirror.yml }
  B: { name: fast-ci, budget: 5min, workflow: tier-b-fast-ci.yml }
  # … C/D/E …
jobs:                        # each job = a workflow job; steps[].run = the gate cmd
  <gate-id>:
    tier: A|B|C|D|E          # cost tier (quality-gates rule)
    blocking: true|false     # false <-> GHA `continue-on-error: true` (informational gate)
    scope: workspace|package|changed   # turbo --filter granularity (local hint)
    needs: [<job>, …]        # GHA job ordering (run after deps)
    services: [verdaccio|docker]       # <-> the local `--integration` gate
    if: <expr>               # changed-only / conditional
    local-only: true         # gates with no 1:1 tier-*.yml job (excluded from drift compare)
    steps:
      - { name: <label>, run: <the gate command> }       # mirrored verbatim into tier-*.yml
      - { name: <label>, uses: <gha-action>, local: <equiv cmd | skip> }  # action-only step
```

- **`run:` steps** are the gate commands the local runner executes and the GH `tier-*.yml` mirror verbatim.
- **`uses:` steps** are GHA actions with no local CLI; they carry `local: <cmd>` (an equivalent) or `local: skip`
  (no analogue). The sync-check compares `run:` lines only, so action steps never create false drift.
- **`blocking: true`** gates are the ones a worker runs + pastes (one-task §8.1) and the orchestrator re-runs
  (milestone §7.1); `blocking: false` gates are informational and never fail a merge.
- **`local-only: true`** gates (e.g. `depcruise`, `aggregate-ci`, `ci-gates-sync`, `integration`) have no
  1:1 `tier-*.yml` job and are excluded from the drift comparison.

### How to add or change a gate

1. **Edit `curaos/ci-gates.yaml`** — add the `jobs.<id>` block (or change a `run:` / `blocking:` / `scope:`),
   pick its tier. NEVER edit `ci-local.sh`, a `tier-*.yml`, a prompt, or an executor to change a gate.
2. **Run the sync-check:** `node scripts/check-ci-gates-sync.js` (from `curaos/`). It FAILS (exit 1) if any
   `tier-*.yml` `run:` command drifts from the config. Fix the drift in the config until it is green.
3. **It propagates:** `ci-local.sh` (and `just ci`) pick up the new/changed `run:` step automatically; the
   dispatch-only GH `tier-*.yml` is the lift target when auto CI returns; the agent prompts + executors already
   say "the BLOCKING gates in `ci-gates.yaml`" so they need no per-gate edit.

### The sync-check is itself a BLOCKING gate

`ci-gates-sync` (`node scripts/check-ci-gates-sync.js`) is a `blocking: true` Tier-A gate in the config. A green
sync-check proves the local gate definition == the dispatch-only GH workflow definition, so a green `just ci`
run is a faithful simulation of CI. A drifted config CANNOT pass local CI and CANNOT merge — that is the
mechanism that keeps the local-first gate honest while GH auto-CI is OFF.

---

## 3. How to run LOCAL CI (the default gate)

All recipes live in [`curaos/justfile`](https://github.com/your-org/curaos/blob/main/justfile)
and delegate to [`curaos/scripts/ci-local.sh`](https://github.com/your-org/curaos/blob/main/scripts/ci-local.sh).
Run from the `curaos/` repo root.

> Install `just` once: `brew install just` (https://just.systems). Without `just`, run the script
> directly — every recipe maps 1:1 to a `bash scripts/ci-local.sh …` invocation.

### Full gate — all packages (the default merge gate, no Docker)

```bash
just ci
# or, without just:
bash scripts/ci-local.sh
```

Runs the Tier A pre-commit mirror (oxlint + Biome + gitleaks), Tier B fast CI (tsc typecheck + Knip +
Syncpack), the Tier B/C aggregate (`bun run ci` = `turbo run lint typecheck test build`), and the
repo-boundary `depcruise` gate. Exit `0` only if **every** step passed.

### Scoped to one package

```bash
just ci-service identity                  # short alias
just ci-service @curaos/identity-service  # full package name (always works)
just ci-for service=identity              # matches the task `ci service=<name>` ergonomics
# or:
bash scripts/ci-local.sh identity
```

> Short aliases live in `scripts/ci-local.sh` (`alias_to_pkg`). If an alias is missing/stale, pass the
> full `@curaos/*` package name.

### Only changed packages (vs `origin/main`)

```bash
git fetch origin main      # refresh the base ref first
just ci-changed
just ci-changed-since origin/release-1.2   # arbitrary base ref
# or:
bash scripts/ci-local.sh --changed
bash scripts/ci-local.sh --changed --base origin/release-1.2
```

Uses the turbo `'...[origin/main]'` selector so only packages affected by the diff run.

### Verdaccio-backed integration tier (requires Docker)

```bash
just ci-integration        # full gate + verdaccio-backed turbo test:integration
# Verdaccio lifecycle helpers (reuse ops/dev/verdaccio/docker-compose.yml — do NOT duplicate):
just verdaccio-up
just verdaccio-logs
just verdaccio-down
# or:
bash scripts/ci-local.sh --integration
```

The common case needs **no Docker**; Verdaccio (for `@curaos/*` workspace resolution) is gated behind
`--integration`.

---

## 4. How to MANUALLY trigger GitHub CI (only when genuinely needed)

Use this only when a check truly must run on GitHub's runners — e.g. validating runner-specific or
OS-matrix behaviour, a one-off reproducible/air-gap image build, or confirming the workflow body itself
still works. **Do not** trigger it as a routine per-PR gate; that is what local CI is for and it burns
the budget the pivot is protecting.

The org token is scoped narrowly, so unset it for `gh` (per the workspace env workaround) and dispatch
explicitly against the branch:

```bash
env -u GITHUB_TOKEN gh workflow run ci.yml \
  --repo your-org/identity-service \
  --ref <branch>

# tier workflows in the curaos monorepo use their own filenames:
env -u GITHUB_TOKEN gh workflow run tier-b-fast-ci.yml \
  --repo your-org/curaos \
  --ref <branch>
```

### Watch the run

```bash
# list recent runs for the workflow on that branch:
env -u GITHUB_TOKEN gh run list \
  --repo your-org/identity-service \
  --workflow ci.yml --branch <branch> --limit 5

# watch the most recent run to completion:
env -u GITHUB_TOKEN gh run watch \
  "$(env -u GITHUB_TOKEN gh run list --repo your-org/identity-service \
       --workflow ci.yml --branch <branch> --limit 1 --json databaseId --jq '.[0].databaseId')" \
  --repo your-org/identity-service --exit-status

# or view a specific run's conclusion:
env -u GITHUB_TOKEN gh run view <run-id> \
  --repo your-org/identity-service --json conclusion --jq .conclusion
```

> `--exit-status` makes `gh run watch` return non-zero on failure, so it composes into scripts.

---

## 5. When to RE-ENABLE auto CI (reverse procedure)

Re-enable auto triggers when **either** condition holds:

- **Billing restored** — the org GitHub Actions budget is funded again, so per-commit minutes are no
  longer a constraint; **or**
- **Contributor scale** — more than the solo maintainer is opening PRs and local-evidence-pasting no
  longer scales as the merge gate.

The reverse is mechanical: re-add the auto trigger block that was stripped, restore the
nightly `schedule`, and keep `workflow_dispatch` so manual runs still work.

```yaml
# tier-b-fast-ci.yml / tier-c / tier-d / per-service ci.yml — re-add:
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

# docs.yml — re-add the path filter it had:
on:
  pull_request:
    paths: ['**/*.md', 'scripts/check-doc-graph.js', 'scripts/check-workflow-sync.js']
  push:
    branches: [main]
  workflow_dispatch: {}

# tier-e-nightly.yml - restore the cron ONLY under the documented billing-restored
# condition (curaos_local_ci_first_rule.md); until then the DEFAULT Tier E path is
# the local schedule (workspace scripts/tier-e-local.sh):
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:
```

Land the re-enable as one change per repo (Conventional Commit `ci:` / `chore(ci):`), then retire or
soften the local-evidence-pasting expectation in §6 and update [[curaos-local-ci-first-rule]] + this
runbook to reflect the new default. Do **not** delete the `justfile` / `scripts/ci-local.sh` — local CI
stays as the fast pre-push gate even after auto CI returns.

---

## 6. Evidence-pasting expectation for PRs

Because there is no green GitHub check to point at, the **local CI run is the evidence**. This is the
existing verbatim-stdout discipline, now load-bearing for the merge decision:

- **Worker (one-task §8.1):** paste the LAST 15 lines + exit code of each verification command
  (`bun run typecheck`, `bun run ci` / `just ci`, each touched `bun test` bucket) into the PR/STATUS
  comment under fenced code blocks. A summarized "N pass / 0 fail" without its backing paste is **not
  evidence** and fails closeout.
- **Orchestrator (milestone §7.1):** re-run the SAME commands at the SAME worktree path. Pastes must
  match within ±2 tests; a larger divergence is an over-claim → label `agent-overclaimed`, re-claim for
  a fix cycle.
- **PR body:** include the `just ci` summary table (or the relevant scoped run) as the verification
  artifact in place of the old CI badge. If a GitHub run was manually dispatched (§4), link the run URL
  + its `conclusion` too.

This satisfies workspace **Definition of Done** §4 (tests green) without an auto CI check, and composes
with [[curaos-verification-stack-rule]] T1 (every commit) + [[curaos-quality-gates-rule]] tiering.

---

## See also

- [`curaos/ci-gates.yaml`](https://github.com/your-org/curaos/blob/main/ci-gates.yaml) — the single-source-of-truth gate definition (§2.5); `node scripts/check-ci-gates-sync.js` enforces no drift
- [[curaos-local-ci-first-rule]] — the binding rule this runbook operationalizes
- [[curaos-quality-gates-rule]] — the 5-tier gate model the local runner mirrors
- [[curaos-verification-stack-rule]] — T1/T2/T3 verification the local gate plugs into
- [[curaos-gh-project-sync-env-workaround]] — why `env -u GITHUB_TOKEN gh`
- [`docs/agents/one-task-execution-prompt.md`](../../../docs/agents/one-task-execution-prompt.md) §8.1 — worker evidence pastes
- [`docs/agents/milestone-orchestration-prompt.md`](../../../docs/agents/milestone-orchestration-prompt.md) §7.1 — over-claim re-run gate
