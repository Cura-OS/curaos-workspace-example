---
name: foresight-sweep
kind: composite
version: 0.1.0
inputs:
  mode: { type: string, required: false, description: "wave (post-merge, milestone-scoped - default) | cross-milestone (deep all-milestone scan)" }
  milestone: { type: string, required: false, description: "milestone scope for wave mode (e.g. M9); ignored in cross-milestone mode" }
  max_items: { type: number, required: false, description: "cap on findings handed to capture this run (default 12; keeps the backlog growth bounded + logs what was dropped)" }
  dry_run: { type: boolean, required: false, description: "discover + report findings WITHOUT seeding any issue" }
outputs:
  findings: { type: array, description: "the future-work observations discovered, each {kind, milestone, scope, what, why}" }
  captured: { type: array, description: "foresight-capture result: issues seeded/reused for the findings" }
  dropped: { type: number, description: "findings beyond max_items not handed to capture this run (NO silent truncation - surfaced for the next run)" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github+fs
verification: T1
composes: [foresight-capture]
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

# foresight-sweep

Proactively **discover** future work across milestones, then hand each finding to [`foresight-capture`](foresight-capture.md) (focused handoff → focused subagent → staged triaged issue). The foresight horizon the orchestrator can't keep in its head: debt introduced this wave, decisions punted into ADR limbo, milestones with no stories yet, research gaps, old debt worth re-surfacing.

## Modes

| Mode | When | Scans |
|---|---|---|
| `wave` (default) | end of every milestone wave (the Foresight phase of `milestone-wave`) | just-merged work + the active milestone's near-term horizon - tight, scoped |
| `cross-milestone` | on demand / scheduled (the periodic deep horizon) | OLD + CURRENT + FUTURE milestones broadly - stale closed-milestone debt, ADR `STILL-OPEN`, milestones with no seeded stories, cumulative ad-hoc-fix patterns |

## Discovery sources (read-only)

1. **Debt introduced** - merged PRs/commits/closeouts mentioning `follow-up` / `TODO` / `stale` / `n/a reason` / `skipped` / `--no-verify` / `unmapped` / `out of scope` / `separate task`.
2. **Deferred decisions** - `RESOLUTION-MAP.md` rows `STILL-OPEN` / `needs-user`; ADR Open-Questions sections.
3. **Missing scaffolds/stories** - milestones in the Project with an Epic but no seeded Stories/Tasks.
4. **Research gaps** - Acceptance criteria naming an undecided library/pattern with no matching `ai/curaos/docs/research/*.md`.
5. **Cross-milestone only** - closed-milestone deferred P2/P3 still applicable; a fix applied ad-hoc ≥2× that should become a generator/rule change.

Every finding is grounded in a real artifact (commit, ADR row, Project gap, missing research file) - no speculative make-work.

## No silent truncation

`max_items` (default 12) bounds backlog growth per run. Findings beyond the cap are **not dropped silently** - `dropped` reports the count and `log()` surfaces it so the next run picks them up. Capture dedupes, so re-running never duplicates.

## Staging inheritance

Everything this sweep seeds goes through `foresight-capture`, which files `needs-triage` + `foresight`, Backlog at birth, and Target Version set when known. The sweep itself never dispatches implementation work. A later all-open §3.4 triage pass decides readiness: relevant, complete, unblocked foresight work can become `ready-for-agent`; incomplete, future-version-only, user/operator gated, or real-blocked work records that actual disposition.
