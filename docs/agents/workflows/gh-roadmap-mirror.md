---
name: gh-roadmap-mirror
kind: atomic
version: 0.1.0
inputs:
  dry_run: { type: boolean, required: false, description: "report the mirror diff without writing the docs" }
  offline: { type: boolean, required: false, description: "render from the local board snapshot without a GitHub Project read" }
  refresh: { type: boolean, required: false, description: "force-refresh the board snapshot before rendering" }
  snapshot: { type: string, required: false, description: "board snapshot path to render; defaults to the shared workflow cache" }
outputs:
  issue_roadmap_updated: { type: boolean, description: "true if ISSUE-ROADMAP.md changed" }
  handover_updated: { type: boolean, description: "always false; HANDOVER stop-state remains an explicit closeout edit" }
  drift: { type: array, description: "tracker-vs-mirror discrepancies found + reconciled" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: fs
verification: T1
models:
  mirror: sonnet
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

# gh-roadmap-mirror

Regenerate `ai/curaos/docs/ISSUE-ROADMAP.md` from live tracker state. **Fills the gap** the milestone-orchestration-prompt flags (no `refresh-roadmap-mirrors.js` exists). Tracker is source of truth; mirrors follow tracker, never vice versa. `HANDOVER.md` remains an explicit closeout snapshot because it records current operator intent and next action, not only tracker rows.

## Behavior

1. Render the shared GitHub Project board snapshot through `scripts/render-issue-roadmap.js`.
2. Diff the rendered output against the current ISSUE-ROADMAP mirror.
3. Write ISSUE-ROADMAP when it differs. In `dry_run`, write only a scratch copy and report whether the doc would change.
4. Return whether ISSUE-ROADMAP changed; `handover_updated` is always false.
5. In post-triage wave callers, pass `refresh: true` so labels and Project fields mutated during triage are visible in the generated mirror.
6. If a post-triage `refresh: true` render fails, retry once with `offline: true` against the existing shared snapshot before failing the workflow.

When the requested mirror is local SQLite tracker parity rather than markdown roadmap rendering, use `node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json`. That checkpoint is dual-way by default, so it adds safe missing local issue/Project data to GitHub before pulling GitHub state back into SQLite.

## Gates

- Tracker wins: never edit the tracker to match the mirror.
- `dry_run`: report the drift, write nothing.
- `offline`: render from the existing snapshot only and issue zero GitHub Project reads.
- `refresh`: force a fresh board snapshot before rendering so post-mutation mirrors do not reuse stale cache.
- Refresh fallback: a live refresh failure may use the cached snapshot, preserving the wave instead of dropping already-triaged candidates.
- Re-rendering writes a fresh `Generated at` stamp, so the workflow is deterministic but not byte-idempotent.
- HANDOVER is not regenerated here; update it explicitly at session closeout.

## Determinism

The renderer is deterministic over the shared board snapshot. There is no model-authored prose path in this workflow.
