---
name: gh-pr-gate-snapshot
kind: atomic
version: 0.1.0
inputs:
  pr: { type: string, required: true, description: "owner/repo#N PR to inspect" }
outputs:
  head_sha: { type: string, description: "current PR head sha, or empty on failure" }
  minutes_since_last_push: { type: number, description: "minutes since the PR was last updated (pulls/{number}.updated_at), exposed through this compatibility field name, or -1 on failure" }
  blocked_by_external: { type: boolean, description: "true when GitHub REST failed" }
  error: { type: string, description: "failure text when blocked_by_external=true" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github-read
verification: T1
models: {}
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

# gh-pr-gate-snapshot

Reads PR merge-gate facts directly from GitHub REST:

- current PR head SHA
- minutes since the PR was last updated (`pulls/{number}.updated_at`)

This workflow exists so `pr-verify-merge` and `milestone-wave` do not ask a model to report deterministic gate facts. Missing or failed REST reads return `blocked_by_external: true` with empty `head_sha` and `minutes_since_last_push: -1`.

## Gates

- Input must be `owner/repo#N`.
- Callers compare `head_sha` with the grill result's `verified_sha` and fail closed on empty, malformed, or mismatched SHA values.
- This workflow does not poll for review presence and does not expose advisory review fields.
