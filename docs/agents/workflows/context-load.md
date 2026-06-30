---
name: context-load
kind: atomic
version: 0.1.0
inputs:
  issue: { type: string, required: false, description: "owner/repo#N of the issue being worked, if any" }
  target_paths: { type: string, required: false, description: "comma-separated repo-relative paths the task will touch" }
  scope_hint: { type: string, required: false, description: "free-text hint about the work (e.g. 'NestJS service', 'frontend app', 'contract package')" }
outputs:
  context_summary: { type: string, description: "distilled context the worker needs: relevant rules, owners, gotchas" }
  generated_code: { type: boolean, description: "true if the target touches generated/scaffolded code (triggers the Generator-Evolution Gate)" }
  blockers: { type: array, description: "any in-flight-generator/SDK barrier or precondition that blocks this work" }
  must_read: { type: array, description: "the canonical docs/rules the worker must honor for this task" }
  issue_spec: { type: object, description: "the resolved issue contract (when issue set): owned_paths, closeout_paths, forbidden_paths, acceptance, verification_cmds, adr_refs - the AUTHORITATIVE scope fence the worker must obey" }
  recommended_model: { type: string, description: "complexity-derived implement tier (opus|sonnet|haiku) for tdd-implement, opus-default per [[curaos-model-tiering-rule]]; derived from issue_spec effort/owned_paths/adr_refs/acceptance" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: none
verification: T1
models:
  load: sonnet
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

# context-load

Read the canonical context a worker needs before touching a CuraOS task, and surface blockers BEFORE work starts. Atomic, read-only. Wraps step 1 of [one-task-execution-prompt](../one-task-execution-prompt.md).

## When to invoke

First step of any execution composite (`task-execute`). Also standalone to answer "what do I need to know / am I blocked before starting issue X?".

## What it reads

The one-task-prompt step-1 set: `AGENTS.md`, `CLAUDE.md`, `ai/rules/README.md` + `curaos_model_tiering_rule` + `curaos_cli_agents_rule` + `curaos_generator_evolution_rule` (incl. the in-flight-generator/SDK barrier section), `ai/curaos/{AGENTS,CONTEXT,Requirements}.md`, `ai/curaos/docs/HANDOVER.md` + `ISSUE-ROADMAP.md`, `docs/agents/issue-tracker.md` + `github-roadmap-project.md`. If `scope_hint`/`target_paths` indicate generated/scaffolded code, also `curaos/tools/codegen/README.md` + `ai/curaos/tools/codegen/{AGENTS,CONTEXT,Requirements}.md`.

**Issue resolution (when `issue` is set):** executor code first reads GitHub through REST (`gh api repos/:owner/:repo/issues/:number` plus paginated comments) and deterministically extracts the AUTHORITATIVE `issue_spec` - `owned_paths` (the implementation scope fence), `closeout_paths` (non-implementation artifacts explicitly required by acceptance or closeout sections), `forbidden_paths`, `acceptance`, `verification_cmds`, `adr_refs` - from the body's `## Scope` / `## Do not touch` / `## Acceptance` / `## Verification` sections + any worker brief in the comments. Model output may enrich `context_summary` and blocker rationale, but it may not erase deterministic issue-spec fields; the executor merges deterministic fields back after the model call. This is what stops a dispatched worker self-selecting an off-task deliverable in a scope vacuum (the #114→patient-contracts drift). `context_summary` is derived FROM the resolved body, not a generic doc summary; an unresolvable body yields `issue-spec-unresolved` in `blockers`. The CANONICAL CI gate set the worker runs is the BLOCKING gates in `curaos/ci-gates.yaml` (the single source of truth - `just ci` / `bash scripts/ci-local.sh`; GH auto-CI is OFF per [[curaos-local-ci-first-rule]] so the LOCAL gate IS the merge gate); `verification_cmds` captures only the issue-specific buckets, not a frozen full gate list.

## Gates

- **In-flight barrier check** - if any `module=codegen|*-sdk|contracts` lane carries `agent-claimed:*` or `agent-PR-open` AND this task is downstream-milestone work, return it in `blockers` (do NOT silently proceed) per [[curaos-generator-evolution-rule]].
- **generated_code flag** - set true when the target touches a NestJS service / frontend app / contract package / BPM workflow / SDK, so the composite wires the Generator-Evolution Gate.

## Determinism

Read-only; GitHub issue body fetch + issue-spec extraction are deterministic executor code. The distilled summary is best-effort LLM output and is merged after deterministic fields.
