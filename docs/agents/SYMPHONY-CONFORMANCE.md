# Symphony Conformance Map for CuraOS Workflows

Status: implemented local conformance gate
Related plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Governing rule: [../../ai/rules/curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)

## Purpose

This document defines the concept mapping that workflow playbooks and checks must satisfy. It is intentionally small and local-first. It does not replace `scripts/check-workflow-sync.js`; it sits beside it through `scripts/check-symphony-conformance.js` and `scripts/check-symphony-source-audit.js`.

## Required mapping fields

Every public reusable workflow should be able to answer these fields:

| Field | Meaning | Example source |
|---|---|---|
| `tracker_adapter` | How work items are discovered, claimed, updated, or deliberately not updated | `gh` CLI via `docs/agents/issue-tracker.md` |
| `trigger_mode` | Polling, manual invocation, event-driven webhook, or orchestrator-chained loop | `docs/agents/workflows.md` trigger row |
| `workspace_owner` | Git working tree or local root that the lane may mutate | `owned_root`, `owned_path`, or issue front matter |
| `workspace_lifecycle` | Create, reuse, cleanup, retention, and GC policy | `docs/agents/local-state-retention.md` |
| `hooks` | Commands that run before or after work, if any | workflow playbook or executor |
| `agent_runner` | Claude Workflow, Agent Workflow Kit, Hermes native tools, Codex adapter, or manual fallback | harness section in playbook |
| `prompt_inputs` | Inputs rendered into the agent prompt | workflow front matter and args schema |
| `strict_rendering` | Whether unknown inputs fail closed | future template test |
| `state_model` | Local states used by the workflow | run status, local SQLite issue row, labels, project fields, local workpad summary |
| `local_issue_db` | SQLite attachment, issue id, event model, reflection, evidence, and sync outbox | `.scratch/state/symphony-work/local-issues.sqlite` |
| `retry_reconcile` | How retries, continuation, and active run reconciliation are handled | executor outputs and local ledger |
| `observability` | Event stream, logs, status, evidence, and snapshots | `.agent-workflow-kit/runs`, stdout, local evidence |
| `safety_posture` | Approval, sandbox, T3, PHI, secret, path containment policy | relevant `ai/rules/` links |
| `github_sync` | When and how local state syncs to GitHub | sync checkpoint row |
| `validation` | Commands or evidence required before done | playbook verification section |
| `tdd_evidence` | Required red and green evidence for workflow script/code changes | local issue evidence refs and command output |

`github_sync: explicit-checkpoint-only` means no routine tracker writes. When the checkpoint is a tracker parity sync, it is dual-way by default: safe missing local issues or Project items are added to GitHub first, then GitHub issue, comment, hierarchy, and Project state is pulled back into SQLite.

## Required YAML shape for playbooks

Every public playbook frontmatter carries a compact block like this:

```yaml
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
```

## Checker behavior

The checker:

1. Enumerate public playbooks in `docs/agents/workflows/`.
2. Skip `README.md`, `HIERARCHY-DESIGN.md`, and internal executor allowlist entries already owned by `scripts/check-workflow-sync.js`.
3. Parses the `symphony` block in frontmatter.
4. Fail closed when a required field is absent, malformed, or uses an unknown enum.
5. Perform zero GitHub calls.
6. Emits a compact JSON report for agents and a human-readable table for docs.
7. Includes fixtures for missing fields, unknown runner, missing sync checkpoint, invalid workspace owner, missing local issue DB mapping, and missing TDD evidence rule.

## Persistent source audit

`scripts/check-symphony-source-audit.js` covers tracked and untracked workflow markdown plus workflow-related scripts. Discovery uses `git ls-files --cached --others --exclude-standard` across the workspace and nested Git repositories so Codex, Hermes, and other harnesses see files before they are committed. It skips generated sandboxes, lane-local worktrees, `dist`, `node_modules`, and scratch paths. The audit currently enforces:

- no em dash or en dash in covered workflow markdown and scripts;
- no executable agent orchestration source may reintroduce Linear as tracker policy;
- zero GitHub calls during audit.

## Current reusable workflows

All 20 public workflow playbooks under `docs/agents/workflows/` now carry the mapping. Internal executor-only workflows remain owned by the allowlist in `scripts/check-workflow-sync.js`.

## Success criteria

- Public playbooks either pass the map or declare a reviewed not-applicable reason.
- Conformance status is local and testable without GitHub quota.
- Hermes native execution appears as a first-class runner path.
- Local SQLite issue storage and TDD evidence are first-class fields for any workflow that changes scripts/code.
- Tracked and untracked workflow markdown plus scripts are audited with the same local-first closeout gate.
