---
name: gh-subissue-wire
kind: atomic
version: 0.2.2
inputs:
  parent: { type: string, required: true, description: "owner/repo#N parent issue" }
  children: { type: string, required: true, description: "JSON array of owner/repo#N child issues to wire as sub-issues" }
  blocked_by: { type: string, required: false, description: "JSON array of {issue, blocking} dependency pairs to wire" }
  dry_run: { type: boolean, required: false, description: "report planned edges without creating them" }
outputs:
  subissues_added: { type: array, description: "child refs newly wired (diff-first: existing skipped)" }
  subissues_depth_limited: { type: array, description: "child refs GitHub refused to native-wire because the native sub-issue tree exceeded GitHub's max depth" }
  deps_added: { type: array, description: "dependency edges newly wired" }
  already_wired: { type: array, description: "edges that already existed (no-op)" }
  reparented: { type: array, description: "child refs moved from a stale native parent before wiring" }
  blocked_by_external: { type: boolean, description: "true when GitHub API/quota prevents deterministic wiring" }
  error_kind: { type: string, description: "external failure kind when blocked_by_external is true" }
  error: { type: string, description: "external failure detail when blocked_by_external is true" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github
verification: T1
models:
  wire: haiku
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

# gh-subissue-wire

Wire native GitHub sub-issues + blocked_by dependencies, diff-first (list existing → add only missing). Idempotent. The executor itself calls `scripts/lib/gh-project.js` (`listSubIssues`, `addSubIssue`, `removeSubIssue`, `addBlockedBy` - add/remove use the DB `id`, not the issue `number`, and the content-creation token bucket). An LLM/agent may not perform or claim these edge writes.

## When to invoke

Inside `breakdown` (after creating children) + `pm-triage-gate`. Standalone to repair a parent's sub-issue/dependency graph.

## Gates

- Diff-first: never duplicate an existing edge.
- Reparent-safe: if a child already has a different native parent, remove the stale parent edge before adding the intended parent edge and report it in `reparented`.
- Content-creation throttle (≤80/min, ≤500/hr) enforced by the lib's token bucket - surfaces a wait if capped.
- `dry_run`: list existing edges + return the ones that WOULD be added in `subissues_added` / `deps_added`, create nothing.
- REST-first writes: edge writes go through GitHub native REST endpoints in `scripts/lib/gh-project.js`; do not consume ProjectV2 GraphQL quota for edge wiring.
- Batched hierarchy reads: current parent + `databaseId` for all children needing wiring come from ONE aliased GraphQL query (chunked at 50 aliases via `issueHierarchy`), replacing the per-child REST pair (2 calls/child). A schema probe for `Issue.parent`/`subIssues` availability gates the batch; when the fields are missing the executor falls back to the classified per-child REST pair.
- Quiet expected-404 probes: the lib's `gh()` pipes stderr and attaches it to the thrown error, and `isNotFound()` classifies the structured payload (`{"message":"No parent issue found","status":"404"}`), so the REST fallback's expected parent-probe noise never leaks into wave logs.
- GitHub max-depth exception: when GitHub refuses a native sub-issue edge because the issue tree already exceeds GitHub's sub-issue depth limit, return the child in `subissues_depth_limited` with `error_kind: github-subissue-depth-limit`. Callers may treat that explicit exception as tree-linked only when the issue already carries the intended frontmatter/project parent evidence.
- External API failures: GitHub GraphQL/API quota or transient Project/API failures return `blocked_by_external: true` with `error_kind` instead of throwing a raw executor error. Callers must fail closed on `github-graphql-quota` when tree wiring is mandatory.

## Determinism

Diff + edge creation deterministic (plain lib); the workflow executor resolves DB ids + current parents in one batched GraphQL read (classified REST fallback), lists existing edges, and applies missing edges directly.
