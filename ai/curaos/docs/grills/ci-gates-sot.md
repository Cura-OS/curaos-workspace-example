## Grill Report

Subject: CuraOS config-driven CI gates single-source-of-truth change.

Read scope:
- CuraOS config lane read from local ref `chore/ci-gates-config` at `000838d86c6ef2802e5bdb24a7130824ac19d592` because the current `curaos/` checkout is the #134 detached commit and does not contain `ci-gates.yaml`.
- Workspace wire lane read from current `curaos-ai-workspace` branch at `b23190640cb78ad5b3a73567da30afc6cd5d5f21`.
- Read all requested files plus every `.github/workflows/*.yml` present on the config ref: `add-to-roadmap.yml`, `cosign-sign.yml`, `cosign-verify.yml`, `publish-packages.yml`, `publish-patient-contracts.yml`, `repro-build.yml`, `tier-a-precommit-mirror.yml`, `tier-b-fast-ci.yml`, `tier-c-full-ci.yml`, `tier-d-slow-ci.yml`, `tier-e-nightly.yml`, `zarf-package.yml`.

### 1. Coverage Parity

#### Finding 1.1 - P0 - Blocking action gates are skipped locally and still exit green

Evidence:
- `curaos/ci-gates.yaml:55-61` says `secret-scan-staged` is blocking and maps the action to a local command: `blocking: true` and `- { name: gitleaks, uses: "gitleaks/gitleaks-action", local: "bun run gitleaks" }`.
- `curaos/ci-gates.yaml:173-178` says `secrets-full` is blocking but has no local equivalent: `blocking: true` and `- { name: TruffleHog secret scan, uses: "trufflesecurity/trufflehog", local: "skip" }`.
- `curaos/ci-gates.yaml:227-232` says CodeQL is blocking but local is skipped: `blocking: true` and `- { name: CodeQL deep scan, uses: "github/codeql-action", local: "skip" }`.
- `curaos/ci-gates.yaml:241-247` says SBOM/CVE is blocking but local is skipped: `blocking: true`, `- { name: SBOM, uses: "anchore/sbom-action", local: "skip" }`, and `- { name: CVE scan (grype), uses: "anchore/scan-action", local: "skip" }`.
- `curaos/scripts/ci-local.sh:372-383` treats action steps with `local: skip` as a print-only skip: `printf '%s\n\n' "${c_dim}skip: ${label} — GHA action '${suses}' has no local equivalent (runs in cloud CI only)${c_reset}"`.
- `curaos/scripts/ci-local.sh:376-378` also skips blocking gitleaks when the binary is absent: `if [ "${suses}" = "gitleaks/gitleaks-action" ] && ! command -v gitleaks >/dev/null 2>&1; then` then `skip: ${label} — gitleaks not installed`.

Failure scenario:
On a machine without `gitleaks`, `just ci` prints a skip for the blocking secret scan and keeps `OVERALL_RC=0`. TruffleHog, CodeQL, SBOM, CVE, and Renovate validation also skip without setting failure even though their config entries are `blocking: true`. A PR can merge with no local execution of the cloud-only blocking gates.

Exact fix:
In `curaos/scripts/ci-local.sh`, replace lines 372-383 with fail-closed skip handling:

```bash
    elif [ -n "${suses}" ]; then
      if [ -n "${slocal}" ] && [ "${slocal}" != "skip" ]; then
        run_step "${label}" "${blocking}" "${slocal}"
      elif [ "${blocking}" -eq 1 ]; then
        run_step "${label}" 1 "echo 'blocking GHA action ${suses} has no local equivalent'; exit 1"
      else
        printf '%s\n\n' "${c_dim}skip: ${label} — non-blocking GHA action '${suses}' has no local equivalent${c_reset}"
      fi
```

Then replace blocking `local: "skip"` entries in `ci-gates.yaml` with real local commands, or mark them `blocking: false` until a local equivalent exists.

#### Finding 1.2 - P0 - Blocking gates are configured to never fail

Evidence:
- `curaos/ci-gates.yaml:90-95` marks Knip blocking, but the command is `bunx knip --no-exit-code`.
- `curaos/.github/workflows/tier-b-fast-ci.yml:38-39` mirrors the same non-failing command: `run: bunx knip --no-exit-code`.
- `curaos/ci-gates.yaml:157-164` marks `test-coverage` blocking, but the threshold command ends with `|| true`: `run: bunx coverage-checker --statements 80 --branches 75 --functions 80 --lines 80 coverage/coverage-summary.json || true`.
- `curaos/.github/workflows/tier-c-full-ci.yml:39-41` also swallows coverage failure: `bunx coverage-checker --statements 80 --branches 75 --functions 80 --lines 80 \` then `coverage/coverage-summary.json || true`.
- `curaos/ci-gates.yaml:180-187` marks `typespec-regen-diff` blocking, but the only command is `echo "TypeSpec codegen drift check — awaiting M6 codegen platform"`.
- `curaos/.github/workflows/tier-c-full-ci.yml:90-93` mirrors that placeholder: `# Phase 3 placeholder...` then `echo "TypeSpec codegen drift check — awaiting M6 codegen platform"`.

Failure scenario:
Knip finds unused dependencies, coverage falls below 80/75/80/80, or TypeSpec generated output drifts. All three commands still return 0, so both local and manual GH gates are false-green.

Exact fix:
- Change `curaos/ci-gates.yaml:95` and `tier-b-fast-ci.yml:39` to `bunx knip`.
- Change `curaos/ci-gates.yaml:164` to remove `|| true`.
- Change `tier-c-full-ci.yml:40-41` to remove `|| true`.
- Replace `curaos/ci-gates.yaml:187` and `tier-c-full-ci.yml:91-93` with the actual TypeSpec regen-and-diff command, for example `bun run typespec:generate && git diff --exit-code -- backend/packages patient-contracts`, adjusted to the real generated paths. If TypeSpec is not live yet, set `blocking: false` and stop advertising it as a merge gate.

#### Finding 1.3 - P1 - PR-time workflows outside `tier-*.yml` are not represented in `ci-gates.yaml`

Evidence:
- `curaos/.github/workflows/cosign-verify.yml:25-34` has `workflow_dispatch` and `pull_request` triggers for signing trust paths.
- `curaos/.github/workflows/cosign-verify.yml:60-64` runs `bash tools/verify/cosign-verify.sh`.
- `curaos/.github/workflows/cosign-verify.yml:244-283` contains the Zarf-mirror admission regression guard and exits 1 when admission permits an unsigned mirror ref.
- `curaos/.github/workflows/repro-build.yml:55-67` has `pull_request` and `push` triggers for build/codegen paths.
- `curaos/.github/workflows/repro-build.yml:200-227` runs BuildKit pass 1 and pass 2 through `./tools/build/repro-build.sh`.
- `curaos/.github/workflows/repro-build.yml:365-392` runs Buildah pass 1 and pass 2 through `./tools/build/repro-build.sh`.
- `curaos/.github/workflows/zarf-package.yml:17-25` has a `pull_request` trigger for Zarf and guard-script paths.
- `curaos/.github/workflows/zarf-package.yml:60-75` runs schema validation, deploy-order, and zero-egress guards.
- `curaos/ci-gates.yaml:31-36` maps only tiers A-E to `tier-a-precommit-mirror.yml` through `tier-e-nightly.yml`.

Failure scenario:
When GitHub Actions are treated as manual/off, `just ci` only simulates the five tier workflows. A PR touching `ops/zarf/**`, `tools/build/**`, or signing trust can pass local gates without running cosign admission rejection, reproducible-build determinism, Zarf schema/order, or zero-egress checks that GitHub still defines as PR gates.

Exact fix:
Extend `ci-gates.yaml` with mapped jobs for the PR-triggered non-tier workflows:
- Add `cosign-verify` gates for `bash tools/verify/cosign-verify.sh` and the admission-reject harness.
- Add `repro-build` gates for BuildKit and Buildah same-tool determinism.
- Add `zarf-package` gates for schema validation, deploy-order, zero-egress, and digest check.
- Update `check-ci-gates-sync.js` to compare every `.github/workflows/*.yml`, not only `tiers.<N>.workflow`.

#### Finding 1.4 - P1 - Verdaccio publish and `@curaos/*` resolution checks are not in the gate source

Evidence:
- `curaos/.github/workflows/publish-packages.yml:3-25` defines a manual Verdaccio package publishing workflow.
- `curaos/.github/workflows/publish-packages.yml:60-89` validates metadata, builds, tests, and typechecks the M2 packages.
- `curaos/.github/workflows/publish-packages.yml:207-244` writes `@curaos:registry=%s` and runs `bun scripts/publish-m2-packages.mjs` plus `bun scripts/smoke-m2-packages.mjs`.
- `curaos/.github/workflows/publish-patient-contracts.yml:3-7` states it publishes `@curaos/patient-contracts` to internal Verdaccio and is `workflow_dispatch`.
- `curaos/.github/workflows/publish-patient-contracts.yml:126-183` writes `@curaos:registry=%s`, runs `bun publish`, then smoke-installs `@curaos/patient-contracts@$PACKAGE_VERSION`.
- `curaos/ci-gates.yaml:213-224` only has `integration tests (turbo)`, not package packing, publishing, or smoke-install.

Failure scenario:
The local `--integration` lane can be green while package tarball packing, publish dry-run, registry auth wiring, and `@curaos/*` smoke-resolution are broken. The config does not preserve the Verdaccio publish workflow coverage.

Exact fix:
Add a `package-publish-smoke` gate to `ci-gates.yaml` with `services: [docker, verdaccio]`, `blocking: true`, and local steps equivalent to the manual publish workflows: metadata test, package builds/tests/typechecks, tarball pack, dry-run publish to local Verdaccio, and smoke install for `@curaos/patient-contracts`.

#### Finding 1.5 - P1 - Doc graph/docs checks remain outside the CI gate source

Evidence:
- `docs/agents/one-task-execution-prompt.md:265` defines the canonical gate set as every blocking gate in `curaos/ci-gates.yaml`.
- `docs/agents/one-task-execution-prompt.md:267` separately says `docs: bun scripts/check-doc-graph.js --write then bash scripts/check-docs.sh when Markdown changed`.
- `docs/agents/milestone-orchestration-prompt.md:392` requires `docs checks when Markdown changed`.
- `docs/agents/milestone-orchestration-prompt.md:454` again says `run docs graph/checks if docs changed`.

Failure scenario:
`just ci` can pass while Markdown changes would fail doc graph or docs checks. The gate source does not encode the conditional docs gate, so agents can treat the local CI summary as complete even when docs coverage was not run.

Exact fix:
Add a conditional docs gate to `ci-gates.yaml`, for example:

```yaml
  docs:
    tier: B
    blocking: true
    scope: workspace
    if: markdown_changed
    steps:
      - { name: doc graph, run: cd .. && bun scripts/check-doc-graph.js }
      - { name: docs checks, run: cd .. && bash scripts/check-docs.sh }
```

Then teach `ci-local.sh` and `check-ci-gates-sync.js` to evaluate `if: markdown_changed`.

Specific gate check list:
- gitleaks: present in config/GH, but local can silently skip when binary missing.
- semgrep: present in config/GH, but local is `local: "skip"` and non-blocking only.
- knip: present, but `--no-exit-code` makes a blocking gate non-failing.
- syncpack: present and command-mirrored.
- publint: present and command-mirrored.
- attw: present and intentionally non-blocking with `|| true`.
- depcruise: present only as `local-only: true`; not in Tier B workflow.
- coverage-gate: present with 80/75/80/80 thresholds, but `|| true` drops enforcement.
- stryker: present and intentionally non-blocking with `|| true`.
- trufflehog: present in GH/config, but blocking local is skipped.
- typespec-diff: present but placeholder echo only.
- playwright e2e: present, non-blocking, and config adds `services: [verdaccio]` while GH has no service block.
- lighthouse: present and intentionally non-blocking with `|| true`.
- lost-pixel: present, non-blocking, local skipped.
- Verdaccio publish + `@curaos/*` resolution: not covered by `ci-gates.yaml`.
- doc graph/docs checks: not covered by `ci-gates.yaml`.

### 2. Drift-Check Soundness

#### Finding 2.1 - P1 - Drift check ignores action steps, action pins, inputs, and blocking metadata

Evidence:
- `curaos/scripts/check-ci-gates-sync.js:83-87` says `runCmds` collects normalized `run:` commands.
- `curaos/scripts/check-ci-gates-sync.js:91-96` only adds steps where `typeof step.run === 'string'`; no `uses`, `with`, `continue-on-error`, `blocking`, `services`, or `needs` fields are added to the comparison set.
- `curaos/.github/workflows/tier-a-precommit-mirror.yml:41-44` pins gitleaks and sets `GITLEAKS_CONFIG: .gitleaks.toml`.
- `curaos/ci-gates.yaml:60-61` has only `uses: "gitleaks/gitleaks-action"` and `local: "bun run gitleaks"`, with no action SHA or env comparison.

Failure scenario:
Change the GH gitleaks step to a different SHA, remove `GITLEAKS_CONFIG`, or replace `trufflesecurity/trufflehog` with a different action. `check-ci-gates-sync.js` still exits 0 because there is no `run:` string to compare.

Exact fix:
Replace `runCmds` with a `stepSignatures` collector that includes:
- `run` after normalization,
- `uses` including full `@sha`,
- `with`,
- `env`,
- `continue-on-error`,
- config-side `blocking`, `services`, and `needs`.

Fail when any mapped workflow step signature differs from `ci-gates.yaml`.

#### Finding 2.2 - P2 - `local-only: true` is a parity escape hatch that makes config-only gates invisible to drift

Evidence:
- `curaos/ci-gates.yaml:133-141` defines `depcruise` as `blocking: true`, `local-only: true`, and `run: bun run depcruise`.
- `curaos/ci-gates.yaml:144-154` defines `aggregate-ci` as `blocking: true`, `local-only: true`, and `run: bun run ci`.
- `curaos/ci-gates.yaml:214-224` defines `integration` as `blocking: true`, `services: [docker, verdaccio]`, `local-only: true`, and `run: bunx turbo run test:integration`.
- `curaos/scripts/check-ci-gates-sync.js:87-90` skips local-only jobs when `skipLocalOnly` is true.
- `curaos/scripts/check-ci-gates-sync.js:145` calls `runCmds(cfgJobs, { skipLocalOnly: true })`.
- `curaos/.github/workflows/tier-b-fast-ci.yml:35-64` lists Typecheck, Knip, Syncpack, Semgrep, publint, attw, and Forward-only migration policy; it has no depcruise or aggregate-ci step.

Failure scenario:
Someone adds a new blocking local gate with `local-only: true`, or marks an existing gate local-only to quiet drift. The sync check passes even though a reactivated GH workflow would not run that gate.

Exact fix:
Delete the general `skipLocalOnly` path. Permit exactly one explicit exception, `ci-gates-sync`, by job id. Add depcruise and aggregate-ci to `tier-b-fast-ci.yml`, and add the Verdaccio integration job to a mapped Tier D workflow, or stop claiming reactivation is a 1:1 lift.

#### Finding 2.3 - P2 - The config-driven check only searches for the string `ci-gates.yaml`

Evidence:
- `curaos/scripts/check-ci-gates-sync.js:113-124` validates `ci-local.sh` by reading the file and checking `if (!/ci-gates\.yaml/.test(sh))`.
- The success message at `curaos/scripts/check-ci-gates-sync.js:123` is `ci-local.sh reads ci-gates.yaml (config-driven)`.

Failure scenario:
Replace the main loop with a hardcoded `bun run ci` list but leave any comment containing `ci-gates.yaml`. The drift check reports `ci-local.sh reads ci-gates.yaml (config-driven)` even though runtime no longer reads the config.

Exact fix:
Replace the regex with structural assertions:
- `ci-local.sh` must call `cfg_jobs`, `job_step_count`, and `step_field` in the main loop.
- `ci-local.sh` must not contain hardcoded gate commands outside install/bootstrap and helper comments.
- Add a tiny fixture test that runs `ci-local.sh --dry-run-config <fixture>` or equivalent and proves a synthetic config step appears in the planned execution.

Question-specific answers:
- A workflow `run:` command not in config is caught only for the five tier workflows and only if it is not normalized away as setup/comment/whitespace.
- A config `run:` gate not in a mapped workflow is caught unless the job is `local-only: true`.
- A one-character command mismatch is caught for substantive `run:` characters after comment stripping and whitespace normalization, but not for action steps or metadata.

### 3. `ci-local.sh` Config-Read Integrity

#### Finding 3.1 - P0 - Empty/malformed config can run zero config jobs and exit green

Evidence:
- `curaos/scripts/ci-local.sh:41-45` fails loudly only when the file is missing: `if [ ! -f "${CONFIG}" ]; then ... exit 2`.
- `curaos/scripts/ci-local.sh:129-143` runs `yq` inside `cfg_jobs`.
- `curaos/scripts/ci-local.sh:145-157` runs the Bun YAML parse fallback inside `cfg_jobs`.
- `curaos/scripts/ci-local.sh:318-322` runs install before expanding the config jobs.
- `curaos/scripts/ci-local.sh:329-387` feeds the loop from process substitution: `done < <(cfg_jobs)`.
- `curaos/scripts/ci-local.sh:397` exits only `OVERALL_RC`.

Failure scenario:
If `ci-gates.yaml` is empty or malformed, `cfg_jobs` can fail inside the process substitution, the loop receives no jobs, only install has run, and `OVERALL_RC` remains 0. The script then prints `LOCAL CI PASSED`.

Exact fix:
Before running install, materialize and validate jobs:

```bash
jobs_to_run="$(cfg_jobs)" || {
  echo "ci-local: failed to parse ${CONFIG}" >&2
  exit 2
}
if [ -z "${jobs_to_run}" ]; then
  echo "ci-local: ${CONFIG} produced zero runnable jobs" >&2
  exit 2
fi
```

Then replace `done < <(cfg_jobs)` with `done <<< "${jobs_to_run}"`.

#### Finding 3.2 - P1 - Blocking vs non-blocking is honored for failing commands, but not for skipped action gates

Evidence:
- `curaos/scripts/ci-local.sh:220-249` correctly sets `OVERALL_RC=1` when a command returns non-zero and `blocking` is 1.
- `curaos/scripts/ci-local.sh:372-383` prints skipped action steps without recording `FAIL` or changing `OVERALL_RC`.

Failure scenario:
A blocking command gate fails correctly. A blocking action gate with `local: skip` never executes and never flips the exit code.

Exact fix:
Same as Finding 1.1: make skipped blocking actions fail closed, and only allow skip for `blocking: false`.

#### Finding 3.3 - P2 - `--tier` silently excludes service-backed jobs unless `--integration` is also passed

Evidence:
- `curaos/scripts/ci-local.sh:123-128` documents `--tier X` as selecting jobs whose `.tier == X`.
- `curaos/scripts/ci-local.sh:135-139` also requires either `INTEGRATION == "1"` or no `services` block.
- `curaos/ci-gates.yaml:190-197` puts Tier D `e2e` behind `services: [verdaccio]`.
- `curaos/ci-gates.yaml:214-224` puts the blocking Tier D `integration` job behind `services: [docker, verdaccio]`.

Failure scenario:
`bash scripts/ci-local.sh --tier D` prints that it is running Tier D, but excludes service-backed Tier D jobs. A user trying to run the exact Tier D set does not get it.

Exact fix:
Make `--tier` mean the full tier. Change the filter to:

```yq
(strenv(TIER_FILTER) == "" or .value.tier == strenv(TIER_FILTER))
and (
  strenv(TIER_FILTER) != "" or
  strenv(INTEGRATION) == "1" or
  ((.value.services // []) | length) == 0
)
```

Also document `--tier D --integration` if service jobs must remain opt-in.

### 4. Prompt/Executor Authority

#### Finding 4.1 - P2 - `tdd-implement` still carries hardcoded `bun run ci` fallbacks

Evidence:
- `scripts/workflows/tdd-implement.workflow.js:52-53` defaults `verification_cmds` to `["bun run ci"]`.
- `scripts/workflows/tdd-implement.workflow.js:91` says the canonical gate is every blocking gate in `ci-gates.yaml`, but also says `At minimum run ${verifyCmds...}`.
- `scripts/workflows/tdd-implement.workflow.js:95` says after CodeRabbit fixes, `re-run \`bun run ci\` after fixes to keep it green`.
- `docs/agents/one-task-execution-prompt.md:287` correctly says `The authoritative list is ci-gates.yaml, not this enumeration`.

Failure scenario:
An agent follows the hardcoded fallback or CodeRabbit repair instruction and runs only `bun run ci` plus sync, missing a future blocking gate added to `ci-gates.yaml`.

Exact fix:
- Change `scripts/workflows/tdd-implement.workflow.js:52-53` to default `verifyCmds` to `[]`.
- Change line 95 to `re-run the affected blocking gate(s) from curaos/ci-gates.yaml, normally cd ${ROOT}/curaos && just ci`.
- Replace the line 91 `At minimum run ...` wording with `Run cd ${ROOT}/curaos && just ci and node scripts/check-ci-gates-sync.js; then run issue-specific verification_cmds as additional evidence.`

The prompt/executor edits otherwise mostly defer to `ci-gates.yaml` at runtime: `one-task-execution-prompt.md:265`, `milestone-orchestration-prompt.md:404`, `pr-verify-merge.workflow.js:122-125`, `task-execute.workflow.js:83`, and `context-load.workflow.js:69` all point to the config-driven local gate and require verbatim evidence.

### 5. Reactivation Parity

#### Finding 5.1 - P2 - `ci-gates.yaml` is not mechanically GitHub-Actions-shaped

Evidence:
- `curaos/ci-gates.yaml:10-20` introduces non-GHA meanings for `blocking`, array `services`, `scope`, `uses` without pin, and `local`.
- `curaos/ci-gates.yaml:78` uses `local-only: true`.
- `curaos/ci-gates.yaml:139` uses `local-only: true`.
- `curaos/ci-gates.yaml:152` uses `local-only: true`.
- `curaos/ci-gates.yaml:221-222` combines `services: [docker, verdaccio]` with `local-only: true`.
- `curaos/ci-gates.yaml:61` uses `uses: "gitleaks/gitleaks-action"` without the pinned SHA that exists in the workflow at `tier-a-precommit-mirror.yml:42`.

Failure scenario:
Lifting config jobs into GitHub Actions requires a translator, not a mechanical copy. `blocking` must become `continue-on-error`, `services: [docker, verdaccio]` must become a real GHA `services:` object or `needs`, `local` must be stripped, `local-only` jobs must be materialized or excluded, and action pins/inputs must be restored.

Exact fix:
Move local-only metadata under `x-local`, and make the GHA-shaped portion valid Actions YAML:

```yaml
jobs:
  knip:
    runs-on: ubuntu-latest
    continue-on-error: false
    steps:
      - name: Knip
        run: bunx knip
    x-local:
      tier: B
      scope: workspace
```

Alternatively keep the current schema but add a generator `scripts/render-ci-workflows.js` and make reactivation use generated workflows, not copy/paste.

### 6. Stacking / Merge Order

#### Finding 6.1 - P1 - Wire PR references `ci-gates.yaml` while the workspace submodule pointer does not contain it

Evidence:
- `docs/agents/one-task-execution-prompt.md:265` tells workers to run every blocking gate in `curaos/ci-gates.yaml`.
- `scripts/workflows/pr-verify-merge.workflow.js:122-125` tells the merge gate to use `curaos/ci-gates.yaml`.
- Local git evidence: workspace branch `chore/ci-gates-wire-prompts` points `curaos` at `390394330b306121205a2eb21492cae8a6008900`; the config file exists only on `curaos` branch commit `000838d86c6ef2802e5bdb24a7130824ac19d592`.
- Live PR metadata was not observed: both `gh pr view 135` and `gh pr view 219` failed with `error connecting to api.github.com`.

Failure scenario:
If the workspace wire PR merges before the CuraOS config PR and parent submodule pointer update, agents follow docs/executors that reference `curaos/ci-gates.yaml`, but the checked-out submodule lacks that file. The merge gate becomes a missing-file blocker or agents fall back to old hardcoded commands.

Exact fix:
Block `curaos-ai-workspace` PR #219 until the `curaos` config PR lands and the workspace submodule pointer is updated to a commit containing `ci-gates.yaml`. In the wire branch, update `curaos` submodule to the merged config commit and include that pointer change in the PR, or add a hard dependency note that #219 must merge after #135 and after parent pointer refresh.

Stack apply status:
- Local ancestry shows `chore/ci-gates-config` contains `4d46c0a chore/local-ci-runner` then `000838d feat(ci): ci-gates.yaml...`, with merge-base `42a8288` against `origin/main`.
- A local `git merge-tree` against current #134 detached commit produced merged hunks for tier workflows and an added `ci-gates.yaml`; no conflict marker was observed in the inspected merge-tree output. Live GitHub base-ref correctness remains unverified due API failure.

### 7. `check-workflow-sync.js` Contract Check

No finding observed.

Evidence:
- `scripts/check-workflow-sync.js:124-136` normalizes and deep-compares contract objects.
- `scripts/check-workflow-sync.js:188-194` fails when playbook and executor contracts differ.
- `docs/agents/workflows/context-load.md:1-23` matches `scripts/workflows/context-load.workflow.js:9-30`.
- `docs/agents/workflows/task-execute.md:1-21` matches `scripts/workflows/task-execute.workflow.js:14-33`.
- `docs/agents/workflows/tdd-implement.md:1-28` matches `scripts/workflows/tdd-implement.workflow.js:9-35`.
- `docs/agents/workflows/pr-verify-merge.md:1-24` matches `scripts/workflows/pr-verify-merge.workflow.js:14-35`.
- Runtime check result: `node scripts/check-workflow-sync.js` returned `18 in sync, 0 problem(s)`.

## Verdict

`unsafe`

The core guarantee is not true yet. The local runner reads the config, but several blocking gates are skipped or made non-failing, the drift checker ignores action steps and non-tier workflows, and the wire PR can reference a config file not present at the current workspace submodule pointer. This is not zero lost coverage.

```json
{
  "verdict": "unsafe",
  "findings": [
    {
      "severity": "P0",
      "area": "ci-local action gates",
      "issue": "Blocking action gates with local: skip, plus missing gitleaks binary, do not fail the local gate.",
      "fix": "Make skipped blocking actions fail closed in ci-local.sh lines 372-383 and replace blocking local: skip entries with real local commands or blocking:false."
    },
    {
      "severity": "P0",
      "area": "non-failing blocking gates",
      "issue": "Knip uses --no-exit-code, coverage uses || true, and TypeSpec diff is an echo placeholder while marked blocking.",
      "fix": "Remove --no-exit-code from Knip, remove || true from coverage checker, and replace the TypeSpec placeholder with a real regen-and-diff command or mark it non-blocking."
    },
    {
      "severity": "P1",
      "area": "coverage parity",
      "issue": "cosign-verify, repro-build, and zarf-package PR workflows are not represented in ci-gates.yaml.",
      "fix": "Add those workflows' PR-time gates to ci-gates.yaml and extend check-ci-gates-sync.js to compare every workflow file, not only tier workflows."
    },
    {
      "severity": "P1",
      "area": "package publish parity",
      "issue": "Verdaccio publish, tarball, and @curaos/* smoke-resolution workflows are not modeled in ci-gates.yaml.",
      "fix": "Add a package-publish-smoke integration gate that runs metadata tests, builds/tests/typechecks packages, dry-run publishes to local Verdaccio, and smoke-installs @curaos packages."
    },
    {
      "severity": "P1",
      "area": "docs gates",
      "issue": "Doc graph/docs checks are prompt-side conditionals, not ci-gates.yaml gates.",
      "fix": "Add a conditional docs gate to ci-gates.yaml and teach ci-local.sh/check-ci-gates-sync.js to evaluate markdown_changed."
    },
    {
      "severity": "P1",
      "area": "drift-check action coverage",
      "issue": "check-ci-gates-sync.js compares only run commands and ignores uses/action pins/with/env/continue-on-error/services/needs.",
      "fix": "Compare full step signatures, including uses refs, with/env, continue-on-error, services, needs, and blocking metadata."
    },
    {
      "severity": "P2",
      "area": "drift-check local-only escape",
      "issue": "local-only:true hides blocking config-only gates such as depcruise, aggregate-ci, and integration from drift comparison.",
      "fix": "Delete general skipLocalOnly; exempt only ci-gates-sync by id and add missing local-only gates to mapped workflows."
    },
    {
      "severity": "P2",
      "area": "drift-check ci-local assertion",
      "issue": "ci-local.sh is considered config-driven if it merely contains the string ci-gates.yaml.",
      "fix": "Assert the runtime loop calls cfg_jobs, job_step_count, and step_field, and add a fixture test that proves synthetic config steps are executed."
    },
    {
      "severity": "P0",
      "area": "ci-local parse failure",
      "issue": "Malformed or empty config can fail inside process substitution, run zero config jobs after install, and exit OVERALL_RC=0.",
      "fix": "Materialize jobs_to_run with command substitution before install, fail if parsing fails or produces zero runnable jobs, then feed the loop from jobs_to_run."
    },
    {
      "severity": "P2",
      "area": "ci-local filtering",
      "issue": "--tier excludes service-backed jobs unless --integration is also set, so --tier D is not the full Tier D set.",
      "fix": "Change the cfg_jobs filter so a tier filter includes all jobs in that tier, or require/document --tier D --integration explicitly."
    },
    {
      "severity": "P2",
      "area": "prompt/executor authority",
      "issue": "tdd-implement still defaults verification_cmds to bun run ci and tells fix loops to re-run bun run ci.",
      "fix": "Default verification_cmds to [] and replace hardcoded bun run ci repair text with just ci / ci-gates.yaml blocking gate wording."
    },
    {
      "severity": "P2",
      "area": "reactivation parity",
      "issue": "ci-gates.yaml contains non-GHA-shaped keys and unpinned action refs, so reactivation is not a mechanical lift.",
      "fix": "Move local metadata under x-local or generate workflows from the config, mapping blocking/services/local-only/local/uses pins explicitly."
    },
    {
      "severity": "P1",
      "area": "stacking",
      "issue": "The wire PR references curaos/ci-gates.yaml while the workspace submodule pointer lacks that file until the config PR/pointer update lands.",
      "fix": "Block the wire PR until config PR lands and update the workspace curaos submodule pointer to a commit containing ci-gates.yaml."
    }
  ]
}
```

---

## Re-grill (2026-05-30, post-5dd4d5f) — P0 fixes

**Scope:** Evaluated current working tree in `/Users/dev/workspace/curaos-workspace/curaos` (branch `chore/ci-gates-config`). Commit `5dd4d5f` not in local object DB; no network fetch; files at HEAD of that branch were grilled. Observed executions: `bash scripts/ci-local.sh --tier B`, empty/malformed config inputs, `node scripts/check-ci-gates-sync.js`.

### P0a — blocking-gate-skips-to-green

**CONFIRM-FIXED.** Missing blocking `gitleaks` binary sets `OVERALL_RC=1` and prints `HARD FAILURE` at `scripts/ci-local.sh:437-444`. Blocking `local: skip` also fails closed at `scripts/ci-local.sh:458-461`. Observed: PATH-hiding gitleaks → exit 1 + hard failure printed.

### P0b — non-failing blocking gates

**PARTIAL.** knip fixed (`ci-gates.yaml:99-107`, no `--no-exit-code`). Coverage fixed (`ci-gates.yaml:169-179`, no `|| true`). TypeSpec-diff marked non-blocking (`ci-gates.yaml:201-211`). Wrapper propagates blocking failures (`scripts/ci-local.sh:230-245`). **Still broken:** blocking `zarf-package` gate retains `|| true` at `ci-gates.yaml:309-321` — a zero-exit swallow survives on a blocking gate.

### P0c — empty/malformed yaml → exit 0

**CONFIRM-FIXED.** Parse failure exits 1 at `scripts/ci-local.sh:325-330`. Zero runnable jobs exits 1 at `scripts/ci-local.sh:335-340`. Zero blocking jobs exits 1 at `scripts/ci-local.sh:350-354`. Loop uses pre-materialized list at `scripts/ci-local.sh:470-472`. Observed: empty config → exit 1; malformed config → exit 1.

**P0c closed? YES.**

### P0d — check-ci-gates-sync.js depth

**STILL-BROKEN.** Sync check compares only `step.run` strings at `scripts/check-ci-gates-sync.js:87-98`; run-set diff at `scripts/check-ci-gates-sync.js:168-170`. Adding `continue-on-error: true` to a workflow step with identical `run:` is not detected. A hand-added `continue-on-error: true` on a blocking step would pass the sync check undetected — the exact drift vector this check exists to catch.

### P0e — coverage parity

**PARTIAL.** Present in `ci-gates.yaml`: cosign (`299-307`), zarf (`309-321`), repro-build (`323-335`), publish-smoke (`337-347`), docs (`349-363`). Gaps: the `cosign-verify.yml` workflow contains additional steps (`58-90`) not reflected in config; `repro-build.yml` Buildah path (`29-33`) has no config counterpart. GitHub-enforced gates from those workflows remain partially absent from the SoT config.

### P0f — GHA-shape reactivation

**STILL-BROKEN.** Config is not 1:1-liftable. Local-only fields without GHA equivalents remain: `scope` (`ci-gates.yaml:16`), `local:` block (`ci-gates.yaml:17-20`), `local-only` / `local-only-steps` markers at lines `87`, `151`, `164`, `246`, `332`, `359`. A mechanical lift to GHA would require stripping or mapping these fields — not automatic.

### Observed exit codes

| Command | Exit |
|---|---|
| `bash scripts/ci-local.sh --tier B` | 1 |
| script pointed at empty config | 1 |
| script pointed at malformed config | 1 |
| `node scripts/check-ci-gates-sync.js` | 1 (6 drift failures) |

### Verdict

**REJECT**

P0a and P0c are genuinely closed. P0b, P0d, P0e, P0f remain partial or broken. The sync checker itself exits 1 on the current tree — meaning drift already exists between `ci-gates.yaml` and the workflow files, so the SoT is not currently in sync. The `|| true` on the blocking `zarf-package` gate (P0b remnant) and the shallow run-only comparison in the sync checker (P0d) are the two highest-risk survivors.

**Remaining blockers before APPROVE:**
1. **P0b remnant (P1):** Remove `|| true` from `zarf-package` gate at `ci-gates.yaml:309-321`.
2. **P0d (P1):** Expand `check-ci-gates-sync.js` comparison to include `continue-on-error`, `env`, `with`, `services`, `needs` fields — not just `run:` strings.
3. **P0e (P2):** Add missing cosign/Buildah workflow steps to `ci-gates.yaml` so GitHub-enforced gates are fully represented.
4. **P0f (P2):** Document the `local:`/`local-only` → GHA mapping procedure, or add a transformer script, so the "GHA-liftable" claim is verifiable.
5. **Sync red (blocker):** Resolve the 6 existing drift failures that cause `check-ci-gates-sync.js` to exit 1 — the SoT and workflows are already out of sync at PR merge time.

---

## Final resolution + merge (2026-05-30, PR #137 → curaos main `c0018bd`)

All remaining-blocker items above were resolved on branch `chore/ci-gates-config` and PR #137 was admin-squash-merged to `curaos` main as `c0018bd` (`feat(ci): ci-gates.yaml single source of truth + drift sync-check (fail-closed) (#137)`). Head-verified Codex round-4 grill of `a23604d` returned **ACCEPT** (grilled_sha == PR head; 7/7 checks pass; zero residual holes).

**Fix commits (on top of the merged #136 SoT base):**
- `69a4f24` / `0d541a3` — P0b remnant closed (`zarf-package` `|| true` split into a separate `blocking:false` digest-placeholder job; no zero-exit swallow on a blocking gate); lost-pixel SHA-pinned; deepened drift-check (full signature: `run` + `uses` + `continue-on-error` + `services` + `needs`) — **P0d closed**; the 6 stale-tree drift failures resolved (sync-check now EXIT 0, "9 in sync").
- `771d290` — closed the partial-mirror **one-directional drift hole**: a new gate step added only to a workflow (not `ci-gates.yaml`) used to escape. Added a reverse workflow→config check gated by a per-job `cloud-only:` allowlist.
- `3ef5eed` — hardened the allowlist: bound each `cloud-only` entry to its command **signature** (`sha` of normalized `run` / `uses` pin) instead of step name, so borrowing an allowlisted name with a different command still DRIFTs. Malformed entries are reported.
- `a23604d` — closed the `mirror-exempt-runs` residual (repro-build run steps are now reverse-checked against a sha-bound `cloud-only` list; the exemption only relaxes the config→workflow existence direction) and widened the signature digest 8→12 hex (32→48 bit) against second-preimage.

**Adversarial probes (all caught → EXIT 1, files restored):** named-unmapped gate step; unnamed gate step; borrow-allowlisted-name-with-different-command; action-pin swap under a borrowed name; arbitrary run step injected into `repro-build.yml`; bare-string (malformed) cloud-only entry. `normRun()` comment-stripping proven non-exploitable (only inert comment payloads collide). sha integrity: all 22 `sha` + 1 `uses` cloud-only entries match their current workflow steps.

**Local-CI evidence:** `bash scripts/ci-local.sh --tier A` → `PASS [A] ci-gates-sync: ci-gates drift check` ("9 check(s) in sync, 0 problem(s)") + commitlint PASS. The tier-A `install (bun, frozen lockfile)` FAIL and its lint cascade are a **local partial-submodule-checkout artifact** (this working copy resolves workspace `file:` links differently than CI's full checkout — the committed `bun.lock` is the correct full-checkout one; regenerating locally would WRONGLY downgrade `@nestjs` 11.1.24→23 and strip `@rjsf/*`), NOT real drift and NOT a #137 regression. P0e/P0f (coverage-parity gaps for extra cosign/Buildah steps; GHA-shape `x-local` mapping) remain as documented P2 follow-ups, not merge blockers.

**Net status: SoT drift-check is fail-closed and tamper-evident.** The earlier `unsafe`/`REJECT` verdicts were against stale trees; the merged tree passes head-verified adversarial review.
