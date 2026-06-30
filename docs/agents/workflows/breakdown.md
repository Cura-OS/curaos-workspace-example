---
name: breakdown
kind: composite
version: 0.3.0
inputs:
  issue: { type: string, required: true, description: "owner/repo#N to assess + (if needed) decompose" }
  issue_body: { type: string, required: false, description: "RP-39: deterministically prefetched issue body (gh-project batchIssueRead). When present it is AUTHORITATIVE and the assess prompt injects it instead of mandating a re-fetch; ONE comments spot-check stays permitted, not mandated. Absent => the assess prompt falls back to the mandated gh issue view read." }
  dry_run: { type: boolean, required: false, description: "if true, return the proposed tree without creating issues/edges" }
  max_depth: { type: number, required: false, description: "recursion-depth guard (default 4)" }
  depth: { type: number, required: false, description: "current recursion depth (orchestrator passes depth+1 on re-invoke; default 0)" }
outputs:
  grabable: { type: boolean, description: "true if the input issue was already an atomic grab-able unit (no split)" }
  leaves: { type: array, description: "the grab-able leaf issues (existing + created)" }
  created: { type: array, description: "issues created this pass (empty in dry_run)" }
  needs_recursion: { type: array, description: "child issues that are themselves not yet grab-able (orchestrator re-invokes breakdown on each)" }
  escalate: { type: string, description: "set if a unit cannot be made atomic within max_depth (likely a design gap → §3.6)" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: github
verification: T2
models:
  assess: sonnet
  split: opus
composes: [gh-subissue-wire]
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

# breakdown

Decompose ANY issue (Epic, Story, Task, sub-task) into grab-able atomic units when its scope exceeds one agent-grabbable unit. **Not story-only** - stories and larger almost always need it; tasks sometimes do (per the 2026-05-29 design correction). Uses tracer-bullet vertical slices (the `to-issues` skill) and wires native sub-issues + dependencies.

## When to invoke

- Orchestrator triage (§3.4) finds an issue too large for a single worker.
- Before dispatching any issue whose grab-ability is uncertain.

## Recursion model (1-level workflow() limit honored)

`breakdown` splits ONE level per invocation:
1. **Assess grab-ability** - single owned-path root? one acceptance cluster? ≤L effort? no internal parallelism? no "and"-spanning scope? → if yes, `grabable=true`, return as leaf, done. **Prefetch threading (RP-39):** when the caller supplies `issue_body` (e.g. the wave's RP-36 batch record), the assess prompt injects that body marked AUTHORITATIVE - no body re-fetch, ONE comments spot-check permitted (not mandated); without it the prompt mandates the `gh issue view` read. The wave's inlined assess copy carries the same threading (keep in sync).
2. **Split** - decompose into child issues (vertical tracer-bullet slices), create each child with `type`, `target-version`, and `parent: "<owner/repo#N>"` frontmatter plus a matching `## Parent` section, then wire native sub-issues + dependencies (composes `gh-subissue-wire`).
3. For each child, re-assess grab-ability; grab-able children → `leaves`; non-grab-able children → `needs_recursion` (the ORCHESTRATOR re-invokes `breakdown` on each - arbitrary depth without violating the 1-level `workflow()` nesting limit).
4. **Depth guard (programmatic)** - `depth` (default 0) is checked in code at entry: if `depth >= max_depth`, return `escalate` and split no further. The orchestrator passes `depth+1` when it re-invokes `breakdown` on a `needs_recursion` child, so the guard is a real numeric comparison, not a prompt hint.

## Gates

- Every leaf must pass the grab-ability test.
- Sub-issue + dependency edges wired for every split (diff-first, idempotent; composes `gh-subissue-wire`).
- `dry_run`: return the proposed tree, create nothing.
- min-slice floor: do not split below a meaningful vertical slice (avoid over-decomposition).

## Determinism

Assess/split are best-effort LLM; the recursion control + grab-ability gate are deterministic. Issue/edge creation is idempotent via `gh-subissue-wire` (Phase D; until then wired inline).
