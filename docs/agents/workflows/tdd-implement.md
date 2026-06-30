---
name: tdd-implement
kind: atomic
version: 0.2.0
inputs:
  issue: { type: string, required: true, description: "owner/repo#N being implemented" }
  branch: { type: string, required: true, description: "the working branch already created for this issue" }
  context_summary: { type: string, required: false, description: "output from context-load" }
  issue_body: { type: string, required: false, description: "RP-39: deterministically prefetched issue body (gh-project batchIssueRead / context-load REST prefetch). When present it is AUTHORITATIVE for scope + acceptance and the implement prompt injects it instead of mandating a re-fetch; ONE comments spot-check stays permitted, not mandated. Absent => the prompt falls back to the mandated gh issue view read." }
  generated_code: { type: boolean, required: false, description: "from context-load; gates the Generator-Evolution step" }
  issue_spec: { type: object, required: false, description: "resolved issue contract from context-load: owned_paths, closeout_paths, forbidden_paths, acceptance, verification_cmds, adr_refs - the authoritative scope fence" }
  impl_model: { type: string, required: false, description: "complexity-derived implement model from context-load (recommended_model); falls back to opus-default pickImplementModel() when unset" }
  dry_run: { type: boolean, required: false, description: "if true, plan + report the TDD steps without committing" }
outputs:
  status: { type: string, description: "done | blocked | needs-user" }
  tests_added: { type: array, description: "test files/cases added" }
  files_changed: { type: array, description: "implementation files changed" }
  generator_evolution: { type: string, description: "the GENERATOR-EVOLUTION closeout line (n/a if generated_code false)" }
  verification_evidence: { type: string, description: "verbatim last-15-line stdout + exit codes of the verification commands (§8.1 - the claim of record)" }
  blocker: { type: string, description: "if status!=done, the concrete blocker" }
  workflow_defect: { type: boolean, description: "true when the workflow blocked impossible worker output rather than product code" }
  workflow_defect_kind: { type: string, description: "stable workflow-defect classifier when workflow_defect=true" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: git
verification: T1
models:
  implement: opus
  verify: sonnet
composes: []
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---

# tdd-implement

Implement one atomic issue test-first (red → green → refactor) on its working branch, run the T1 gate, and produce the Generator-Evolution closeout when generated code was touched. Wraps the implementation + §8.75 steps of [one-task-execution-prompt](../one-task-execution-prompt.md).

## When to invoke

Inside `task-execute`, after `context-load` and branch creation. Standalone only for a pre-scoped single issue on an existing branch.

## Phases

0. **Scope fence + runtime access check** - the worker is pinned to `issue_spec.owned_paths` for implementation, with `issue_spec.closeout_paths` allowed only for gate-required artifacts such as mirror docs, DOC-GRAPH.md, lockfiles, generated SDK artifacts named by acceptance, or parent submodule pointers. It implements EXACTLY the issue body/ADR refs. **Prefetch threading (RP-39):** when the caller supplies `issue_body` (the wave threads the RP-36 batch record), the prompt injects that body marked AUTHORITATIVE - the worker must NOT re-fetch it, and ONE spot-check read of the comments stays permitted (not mandated) when the body references discussion it needs; without `issue_body` the worker must first `gh issue view` the issue. No self-selected task either way (closes the #114→patient-contracts drift). Before claiming work, the worker runs `pwd`, `git status --short --branch`, and `git branch --show-current`; if it cannot run shell commands, edit files, inspect the issue, or is operating in a planning-only/model-only context, it returns `blocked` with a concrete blocker. It must never return `done` from schema defaults or an unchanged checkout.
1. **Red** - write failing tests for the acceptance criteria (uses the `tdd` skill discipline).
2. **Green** - minimal implementation to pass. Only within owned paths; closeout paths are for required artifacts, not extra implementation scope.
3. **Refactor** - clean up; tests stay green.
4. **T1 gate** (programmatic) - the canonical gate set is every BLOCKING gate in `curaos/ci-gates.yaml` (the single source of truth - `just ci` / `bash scripts/ci-local.sh`): at minimum `bun run ci` (+ any `issue_spec.verification_cmds`) + `node scripts/check-ci-gates-sync.js` (proves the local gate definition == the dispatch-only GH workflow definition - GH auto-CI is OFF, so a green local run + green sync-check IS the merge gate) + `gitleaks --staged` + `bun audit` must pass (real exit codes; verbatim last-15-line pastes captured into `verification_evidence`). The config drives the runner - do not hardcode a frozen command list.
4.5. **Local deterministic self-review** - run Semgrep CE when available before the PR and limit blocking findings to high or critical findings on changed lines. If Semgrep is unavailable, record `verdict=unavailable` and continue; do not call paid external review services. Worker fixes genuine findings within owned paths + 3-cycle cap, then re-runs CI green.
5. **Generator-Evolution** (only if `generated_code`) - §8.75: fold the fix back into `curaos/tools/codegen/` (template/emitter/playbook/flag/AST + snapshot, trio symmetry) OR file a `priority=critical` follow-up; emit the `GENERATOR-EVOLUTION:` line.
6. **Independent verification gate** (programmatic, post-implement) - before the verifier runs, the executor rejects schema-default `done` output (`files_changed:[]`, `tests_added:[]`, empty `verification_evidence`, empty `blocker`) as `status=blocked` with `workflow_defect_kind:"tdd-implement-no-op-done"` because that shape means the implement leg likely had no shell/edit/issue access. For other real `done` claims, a SEPARATE `agent()` Bash call re-derives the truth, ignoring the implementer's self-report: `git diff --name-only main...<branch>` (changed paths), a FRESH re-run of the BLOCKING gates from `curaos/ci-gates.yaml` (`just ci` + `node scripts/check-ci-gates-sync.js`, exit codes + verbatim last-15-line pastes), and a submodule-pointer reachability check. For real dispatches, the verifier's observed git diff decides no-op truth; self-reported empty `files_changed`/`tests_added` arrays do not veto a real diff. The JS derives empty diff from the observed `changed_paths` array (so `changed_paths: []` can never pair with `empty_diff:false`, and `empty_diff:true` with non-empty paths blocks as contradictory verifier output with `workflow_defect_kind:"tdd-implement-verifier-contradiction"`), recomputes out-of-scope containment from observed `changed_paths` + `issue_spec.owned_paths` + `issue_spec.closeout_paths` instead of trusting the verifier's `out_of_scope_paths` array, normalizes non-integer `ci_exit` to failing/nonzero (including string `"0"`; verifier harnesses must emit numeric JSON), and trusts `ci_exit:0` only when the verifier also returns `ci_ran:true` and the independent evidence contains an exit-code paste. It forces `status=blocked` on: empty diff (done-with-no-code = fabrication, returned with `workflow_defect:true` / `workflow_defect_kind:"tdd-implement-no-op-done"`), unresolved scope/no `owned_paths` fence, any changed path outside `owned_paths` plus approved closeout paths, missing CI-run proof, nonzero CI exit, an unpushed/unreachable submodule pointer, or missing worker+independent `verification_evidence`. If the implementer omitted `verification_evidence` but the independent verifier produced the required paste and every other gate is clean, the independent paste becomes the §8.1 fallback claim of record. This is the gate that catches a fabricated "done" - prose instructions to a self-reporting worker are structurally unenforceable on this path (the workflow runtime has no shell).

## Harness Model Routing

`opus` / `sonnet` / `haiku` in this contract are logical tiers. `tdd-implement` omits those strings as raw `agent()` model identifiers by default, so the active harness uses its configured native model while the label still records the logical tier. A runner may opt in to raw logical model passthrough only with `AGENT_WORKFLOW_KIT_PASS_LOGICAL_MODELS=1`. A schema-default `done` result caused by unsupported tier-name passthrough is a workflow defect, not product completion.

## Gates

- **Scope:** implementation changes confined to `issue_spec.owned_paths`; approved gate artifacts may also land in `issue_spec.closeout_paths`. missing `owned_paths` or any out-of-scope file -> status=blocked. The workflow JS computes containment from `changed_paths` + `owned_paths` + `closeout_paths`; verifier-reported `out_of_scope_paths` cannot hide or clear a changed file.
- **T1:** must be green before status=done, asserted by the post-implement INDEPENDENT re-run (not the implementer's claim). A numeric `ci_exit:0` alone is not proof; the verifier must set `ci_ran:true` and paste an exit code.
- **Anti-fabrication:** for real dispatches, schema-default `done` with no changed files/tests/evidence/blocker is rejected before verifier dispatch as likely no shell/edit/issue access. Otherwise the independent verifier's git diff is the truth. Empty diff after self-reported `done` → status=blocked plus machine-readable `workflow_defect:true` / `workflow_defect_kind:"tdd-implement-no-op-done"` even if the worker pasted evidence text. Self-reported arrays alone do not veto a real diff. Missing worker+independent `verification_evidence`, schema-default `done`, or a self-reported pass contradicted by the independent re-run → status=blocked. Independent verifier evidence may satisfy §8.1 only when it includes the verbatim last-15-line paste + exit code for every re-run blocking gate.
- **Submodule hygiene:** a pointer move to an unpushed/unreachable commit → status=blocked (repo-breaking; the prior PR #205 poison).
- If `generated_code` and §8.75 not satisfied → status=blocked (the orchestrator §3.11 sweep would re-open anyway).
- 3-cycle cap on the green-fix loop → status=needs-user.
- `dry_run`: produce the plan + intended commits, make NO commits (independent verification gate skipped). A dry-run with empty intended `files_changed` and empty `tests_added` is still schema-default impossible output and returns `workflow_defect:true`; an evidence string alone is not an implementable claim. This self-reported intended-file guard is dry-run-only because real dispatches use the independent verifier's git diff.

## Determinism

Control flow + T1 gate + the independent verification gate are deterministic JS branching on `agent()`-shelled facts; the implementation itself is best-effort LLM. Commits + the verification Bash happen via `agent()` (the workflow runtime has no git/shell), but the JS evaluates their RESULTS - a self-report alone never advances status. Current workflow runtime cannot run `git diff` directly in executor code, so the independent verifier is the shell boundary of record; if runner shell access becomes available, move `changed_paths` derivation into deterministic executor code before trusting any verifier JSON.
