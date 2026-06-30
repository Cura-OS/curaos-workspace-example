---
name: task-execute
kind: composite
version: 0.2.0
inputs:
  issue: { type: string, required: true, description: "owner/repo#N ready-for-agent issue to execute" }
  bundle_issues: { type: string, required: false, description: "OPTIONAL JSON array of same-owner issue refs bundled into this lane; issue remains the lead issue for branch and PR refs" }
  bundle_issue_bodies: { type: string, required: false, description: "OPTIONAL JSON object mapping bundled issue refs to deterministically prefetched issue bodies" }
  branch: { type: string, required: false, description: "optional branch name supplied by a parent worktree dispatcher" }
  branch_precreated: { type: boolean, required: false, description: "true when the caller already created and checked out branch in an isolated worktree" }
  dry_run: { type: boolean, required: false, description: "plan + report without branch/commit/PR side effects" }
outputs:
  status: { type: string, description: "pr-open | blocked | needs-user" }
  branch: { type: string, description: "the working branch" }
  pr: { type: string, description: "the opened PR ref (if status=pr-open)" }
  generator_evolution: { type: string, description: "the §8.75 closeout line" }
  blocker: { type: string, description: "if not pr-open, the concrete blocker" }
  workflow_defect: { type: boolean, description: "true when a child workflow blocked impossible executor/agent output" }
  workflow_defect_kind: { type: string, description: "stable workflow-defect classifier when workflow_defect=true" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: git
verification: T1
models:
  branch: haiku
composes: [context-load, tdd-implement]
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

# task-execute

Execute one ready-for-agent issue or same-owner issue bundle end to end: load context + check blockers -> branch -> TDD implement (+ Generator-Evolution) -> open one PR. The deterministic worker form of [one-task-execution-prompt](../one-task-execution-prompt.md). Composes `context-load` + `tdd-implement` via `workflow({scriptPath})`.

## When to invoke

Dispatched by the orchestrator (`milestone-wave`) for each grab-able leaf issue or same-owner bundle in a safe lane. Every bundled issue MUST be grab-able (run `breakdown` first if uncertain), `ready-for-agent`, and share the same owner path / checkout / verification surface. A parallel orchestrator must run each `task-execute` lane from a distinct git worktree; invoking multiple branch-changing workers from one checkout is forbidden and must be serialized.

Invoke the persistent executor before any manual one-task runbook work: Claude Code uses `Workflow({ scriptPath: "scripts/workflows/task-execute.workflow.js", args: { issue: "OWNER/REPO#N" } })`; Codex/Antigravity/Grok/OpenCode/Pi use `agent-workflow-kit workflow-run task-execute --args-json '{"issue":"OWNER/REPO#N"}' --json`. Manual execution of [one-task-execution-prompt](../one-task-execution-prompt.md) is fallback only after executor outage, `needs-user`, or a concrete `workflow-defect`.

## Phases

1. **context-load** (composed) - read rules/owners/gotchas, detect generated_code, surface blockers for the lead issue and every bundled issue. If any blocker appears -> status=blocked, stop.
2. **Branch** (deterministic) - create the short-lived working branch off the repository remote default ref (default branch resolved from `origin/HEAD`, base `origin/<default>`) in executor code via git, not by accepting an agent self-report. If branch creation fails, the executor returns `blocked` with `branch-create-failed`, attempts to restore or stash back to the default branch or detach to the remote default ref when another worktree owns that branch, and no implementation/PR phase may run.
3. **tdd-implement** (composed) - red->green->refactor + T1 gate + §8.75 Generator-Evolution closeout when generated_code. For bundles, `context_summary`, `issue_spec`, and optional prefetched issue bodies are merged so one worker sees every bundled issue and one scope fence.
4. **PR** - push branch, open one PR with all bundled issue refs, the closeout line + GENERATOR-EVOLUTION line + the full §8.1 `verification_evidence` block; set labels (agent-PR-open) on every bundled issue. If `tdd-implement` reaches `done` without a non-empty evidence block, stop as `blocked` and open no PR. If the PR agent returns an empty or malformed PR ref (must be `owner/repo#N`), or if post-PR default-branch restore fails, block after preserving/restoring checkout state.

## Gates

- Blocked-before-start (in-flight barrier) halts at phase 1 - no branch, no work.
- Branch creation must be deterministic executor code against the repository remote default ref. Empty/mismatched branch-agent output is impossible workflow output; do not use it as proof. Branch failures block before `tdd-implement`, preserving residue with a named stash if needed before returning to the default branch or detaching to the remote default ref when local default-branch checkout is held by another linked worktree.
- Branch creation, default-branch restore/stash, remote/local branch collision checks, and PR-ref normalization/validation are single-owned in `scripts/lib/workflow-git.js`; `task-execute` must load that helper instead of carrying a local copy. A non-empty model string such as `no PR opened` is not a PR ref and must block, not advance to `pr-open`.
- Remote branch probes fail closed: only `git ls-remote --exit-code` status `2` means "no matching remote branch"; transport/auth/network/default-branch-resolution failures block branch creation and must not fall back to `main`.
- tdd-implement T1 gate must be green before PR, and the PR body must include the worker or independent-verifier §8.1 evidence paste. Missing evidence is a workflow block, not a PR-open condition. If `tdd-implement` returns `workflow_defect:true`, `task-execute` preserves `workflow_defect` and `workflow_defect_kind` instead of flattening the child defect into a generic product blocker.
- `dry_run` propagates to tdd-implement; no branch/commit/PR.
- 3-cycle cap inherited from tdd-implement → needs-user.

## Determinism

Control flow deterministic; the composed implementation and PR stages are best-effort. Branch creation and default-branch restoration are executor-owned git calls; PR creation still goes through the PR agent. PR review + merge are NOT here - that's `pr-verify-merge`.
