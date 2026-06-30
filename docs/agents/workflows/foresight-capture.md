---
name: foresight-capture
kind: atomic
version: 0.1.0
inputs:
  observations: { type: string, required: true, description: "JSON array of foresight items: {kind: debt|idea|context|risk|prereq, target-version?, milestone?, scope (repo/module), what, why, suggested_handoff?}" }
  dry_run: { type: boolean, required: false, description: "produce handoffs + specs + the issue plan WITHOUT creating issues or mutating the Project" }
outputs:
  seeded: { type: array, description: "issues created/reused, each {issue, kind, targetVersion, milestone, deduped}" }
  skipped: { type: array, description: "observations skipped (duplicate of an existing foresight issue, or insufficient signal), with reason" }
  handoffs: { type: array, description: "the focused handoff doc paths written (one per non-skipped observation)" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github+fs
verification: T1
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

# foresight-capture

Turn raw **foresight observations** - future work, debt, ideas, context, risks, next-version prerequisites noticed during any wave - into **properly-specced, staged tracker issues**, without polluting the capturing wave's context or producing thin stubs.

## Why handoff-then-subagent (user directive 2026-05-29)

A foresight observation noticed mid-task is a one-line hunch, not a spec. Filing it inline either derails the capturing agent onto a tangent or produces a thin stub that fails triage later. So for each observation this workflow:

1. **Handoff** - compacts the observation into a *focused* handoff doc (handoff-skill discipline: reference existing ADRs/rules/code by path, never duplicate; include a "Suggested skills" section; redact secrets), written to the OS tmp dir.
2. **Spec** - dispatches a **fresh subagent whose entire context is that one handoff** to research + properly spec the item (invoking `to-issues` / `deep-research` as warranted, persisting research to `ai/curaos/docs/research/`). It produces a complete issue body (6 canonical sections + frontmatter) aligned with specs + ADRs - it does **not** implement.
3. **Seed** - creates the issue `needs-triage` + `foresight` (no `ready-for-agent` at birth), then stamps target `Target Version` when known, roadmap milestone metadata when derivable, and **Status=Backlog** on the Roadmap Project (the same `scripts/lib/gh-project.js` add+reconcile that `gh-project-sync` performs, run inline as a direct agent step) and wires it under its parent Epic. Once staging is complete, the workflow drains the `needs-triage` label (keeping `foresight` + Backlog) so the issue reads as staged foresight, not an undrained raw triage strand. `needs-triage` is retained only if staging fails, so the strand stays visible to `sweep-foresight-staging`.

The capturing wave stays focused on its current work; the future item gets its own proper, focused pass.

## Staging

A `foresight` issue is not dispatched by this capture workflow. It starts in Backlog with `Target Version` set when known. Normal all-open §3.4 triage later decides readiness: if the item is relevant to the active working set or a current dependency chain, complete, and unblocked, it may become `ready-for-agent` while keeping the `foresight` marker. If it is incomplete, future-version-only, user/operator gated, or real-blocked, triage records that actual disposition.

## Idempotency

Phase 1 dedupes against existing open `foresight` issues (semantic match on scope + "what", not string match) before doing any work - re-running an end-of-wave or cross-milestone sweep never duplicates. `dry_run` produces the handoffs + specs + the issue plan but creates nothing.

## Invoked by

- inline FORESIGHT closeout lines (worker/orchestrator) - see `docs/agents/one-task-execution-prompt.md`
- the `foresight-sweep` workflow (end-of-wave + cross-milestone scan)
- the orchestrator directly, for an ad-hoc observation

## Gates

This workflow ranks nothing and dispatches no implementation - it only seeds staged issues. The seeded issues still pass the full §3.4 triage gate (and §3.5/§3.7 etc.) before implementation. Foresight capture adds tracked work; it never bypasses a gate to start work.
