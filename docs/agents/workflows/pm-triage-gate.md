---
name: pm-triage-gate
kind: composite
version: 0.1.0
inputs:
  candidates: { type: string, required: true, description: "JSON array of owner/repo#N issues to run through the triage gate before dispatch" }
  dry_run: { type: boolean, required: false, description: "report planned triage/sync/wire without mutating" }
outputs:
  ready: { type: array, description: "candidates that PASSED the gate (curated body + frontmatter + edges + project item + label) and may be dispatched" }
  not_ready: { type: array, description: "candidates that failed the gate, each with the missing predicate" }
  mirror_refreshed: { type: boolean, description: "true if the roadmap mirror was regenerated after the sweep" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github
verification: T2
models:
  gate: opus
composes: [gh-issue-triage, gh-project-sync, gh-subissue-wire, gh-roadmap-mirror]
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

# pm-triage-gate

The §3.4 Tracker-First Triage Gate as a workflow: for each candidate issue, run triage + project-sync + sub-issue/dependency wiring, then refresh the roadmap mirror once. Composes the four PM atomics. **The orchestrator owns the BINDING predicate** (no dispatch until an issue has a curated body + frontmatter + native edges + Project item + parent backlink); this workflow performs the mechanics + reports which candidates pass.

## When to invoke

Inside the milestone orchestration wave, before dispatching any worker (`task-execute`). The orchestrator passes the candidate set; this gate curates them; only `ready` candidates may be dispatched. The caller records the gate as a child local issue under the wave main issue, then records one child row or evidence ref per candidate batch so paper blockers, real blockers, and sync degradation are not chat-only state.

## Phases (per candidate, then once)

1. **Triage** - `gh-issue-triage` resolves the state label + paper-vs-real blocker, then deterministically merges frontmatter-derived Project fields over any agent field output.
2. **Sync** - create one Project item-list cache for the gate, then run `gh-project-sync` for each candidate with triage-derived fields, deterministic execution Status (`ready-for-agent|ready-for-human -> Ready`, blocked or real blocker -> Blocked, triage/info/future-version-only -> Backlog; `foresight` alone does not force Backlog), and the shared `project_items_cache`. Sync adds the item + reconciles Project fields through `scripts/lib/gh-project.js`; `CuraOS Milestone` is retained as grouping metadata and reports `milestone: NONE` when unset, but it does not block dispatch.
3. **Wire** - `gh-subissue-wire` deterministically ensures native sub-issue + dependency edges via REST helpers in `scripts/lib/gh-project.js` (diff-first), or records `subissues_depth_limited` when GitHub cannot represent a deeper native sub-issue edge.
4. **Mirror** - `gh-roadmap-mirror` regenerates ISSUE-ROADMAP once after the sweep (tracker is source of truth). HANDOVER is updated explicitly at closeout.

Harness routing: run this gate through the active harness's strongest available orchestration path. Claude can call the composite workflow, Agent Workflow Kit can `workflow-run pm-triage-gate`, Hermes can keep the phase in `todo` and use terminal/file tools plus `delegate_task` only for isolated judgement, Codex can use its configured adapter, and generic harnesses can follow the playbook directly. The output contract and local issue evidence are the same for every path.

## Gates

- **Binding predicate (owned by the orchestrator prompt, enforced here):** a candidate is `ready` ONLY if its body has Scope/Acceptance/Verification + current frontmatter + native edges (or a recorded GitHub max-depth exception from `gh-subissue-wire`) + a Project item + parent backlink. Anything missing -> `not_ready` with the gap; the orchestrator fills it (it can't be dispatched half-spec'd).
- `dry_run`: report the planned triage/sync/wire + which candidates would be ready; mutate nothing.
- Idempotent: re-running on already-curated candidates is a no-op (the composed atomics are each idempotent).
- **Sync-failure degradation (per-candidate, RP-12):** if `gh-project-sync` fails with genuine GraphQL quota exhaustion (`github-graphql-quota`, which will hit every remaining mutation), stop the gate fail-closed with `blocked_by_external: true` and every affected candidate in `not_ready`; do not collapse failures into an empty triage result. Any OTHER external sync failure (a transient 5xx that survived the bounded 3-attempt retry in `scripts/lib/gh-project.js`) degrades ONLY the affected candidate into `not_ready` with the recorded kind - the surviving ready set stays dispatchable and the pass completes. One flaky mutation must not discard an entire wave pass.
- If `gh-issue-triage` returns `blocked_by_external: true`, skip `gh-project-sync` for that candidate, stop the gate with `blocked_by_external: true`, and evaluate that triage blocker before sync blockers; do not dispatch or infer fields from stale memory.

## Determinism

Control flow deterministic. `gh-project-sync` and `gh-subissue-wire` perform Project/edge mutations through executor code and shared helpers, not model claims. Remaining composed atomics that use agent stages are best-effort but must still return machine-checkable output; impossible output is a workflow defect, not completion proof.
