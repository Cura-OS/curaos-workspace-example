---
name: gh-issue-seed
kind: atomic
version: 0.1.0
inputs:
  spec: { type: string, required: true, description: "JSON of the issue: {repo, title, module, target-version, milestone?, priority, effort, scope, acceptance, ...}" }
  dry_run: { type: boolean, required: false, description: "render the issue body + report, create nothing" }
outputs:
  issue: { type: string, description: "owner/repo#N created or reused" }
  created: { type: boolean, description: "false if an existing issue with the same title was reused" }
  body_preview: { type: string, description: "the rendered frontmatter + sections" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github
verification: T1
models:
  seed: sonnet
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

# gh-issue-seed

Create one agent-consumable issue with the canonical CuraOS frontmatter + sections, in the correct repo. Idempotent (reuse an existing same-title issue under the same parent rather than duplicate). Wraps the issue-body contract from [issue-tracker](../issue-tracker.md) + [github-roadmap-project](../github-roadmap-project.md).

## Issue body (enforced)

Frontmatter: `module / target-version / milestone? / priority (Critical|High|Medium|Low) / effort (S|M|L) / requires / blocked-by / agent-notes`. `target-version` is required and maps to Project `Target Version`; `milestone` is optional custom `CuraOS Milestone` metadata only. Never set GitHub's built-in issue Milestone field. Sections: `## Scope`, `## Do not touch`, `## Acceptance`, `## Verification`, `## Docs`, `## Blockers`. Labels: exactly one category (`enhancement`|`bug`) + one state (default `needs-triage`).

## Gates

- Repo selection per the issue-tracker repo rules (right submodule vs workspace).
- `target-version` is present in frontmatter before create/reuse is reported.
- Priority is named (Critical/High/Medium/Low), never P0..P3.
- Idempotent: same title under same parent → reuse, don't duplicate.
- `dry_run`: render body, create nothing.

## Determinism

Body rendering deterministic from spec; the create is a single idempotent op.
