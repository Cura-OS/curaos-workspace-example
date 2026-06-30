---
name: lens-review
kind: atomic
version: 0.1.0
inputs:
  lens: { type: string, required: true, description: "Security | Architecture | QA" }
  pr: { type: string, required: false, description: "owner/repo#N PR, if reviewing a PR" }
  diff_ref: { type: string, required: false, description: "git ref/range to diff (default working tree)" }
outputs:
  lens: { type: string, description: "the lens reviewed" }
  findings: { type: array, description: "issues found by this lens" }
  verdict: { type: string, description: "pass | changes-requested | block" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: none
verification: T2
models:
  review: opus
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

# lens-review

One lens of the T2 3-lens multi-model code review (Security / Architecture / QA) per [[curaos-verification-stack-rule]] + per-harness tiering [[curaos-model-tiering-rule]]. Read-only. Composed 3× (one per lens) by `pr-verify-merge`.

## Lenses

- **Security** - auth, input handling, PHI boundary, secrets, OWASP-class bugs, tenant isolation.
- **Architecture** - pattern compliance, dependency direction (vertical→neutral, never reverse), coupling, contract integrity.
- **QA** - test coverage gaps, weak assertions, edge cases, brittle tests.

## Determinism

Read-only LLM review; best-effort. The verdict feeds `pr-verify-merge`'s programmatic merge gate (block from any lens = no merge).
