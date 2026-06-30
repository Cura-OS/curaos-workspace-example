---
name: gh-project-sync
kind: atomic
version: 0.1.0
inputs:
  issue: { type: string, required: true, description: "owner/repo#N to add + sync onto the CuraOS Roadmap project" }
  fields: { type: string, required: false, description: "JSON object of desired field values keyed by field name (Target Version/Priority/CuraOS Milestone/etc.)" }
  project_items_cache: { type: string, required: false, description: "optional path to a cached gh project item-list JSON payload created once by a composite gate/wave to avoid per-candidate full Project scans" }
  dry_run: { type: boolean, required: false, description: "report planned add/field-writes without executing" }
outputs:
  item_id: { type: string, description: "the project item id (existing or newly added)" }
  field_writes: { type: array, description: "the field deltas written (empty if already in sync)" }
  added: { type: boolean, description: "true if the item was newly added (false if it already existed)" }
  milestone: { type: string, description: "confirmed CuraOS Milestone after reconcile: existing in-sync board value or successful set write; NONE if unset/unmapped/skipped. Metadata only, not a dispatch gate." }
  blocked_by_external: { type: boolean, description: "true only when GitHub ProjectV2 quota/transient failure blocks sync; callers must stop dispatch and retry later" }
  error_kind: { type: string, description: "external failure classifier when blocked_by_external=true" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github
verification: T1
models:
  sync: haiku
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

# gh-project-sync

Idempotently add an issue to the `CuraOS Roadmap` org Project and reconcile its field values. Re-runnable: `addProjectV2ItemById` returns the existing item id on a dup; fields are written only where the desired value differs (read-before-write 3-way reconcile). The workflow calls `scripts/roadmap-project-item-sync.js`, which reuses `scripts/lib/gh-project.js`.

## When to invoke

Inside `pm-triage-gate` / orchestrator §3.4, for every issue being curated. Standalone to fix a single issue's project state.

## Behavior

1. `ensureProject` + cached `fieldMap` (refresh on miss / next_global_id) through `scripts/roadmap-project-item-sync.js` + `scripts/lib/gh-project.js`. If a desired field is absent from the cached field map, or a single-select value is reported `unmapped`, refresh the field cache and retry only those affected fields once.
2. Resolve the issue node id through REST and parse the issue body's leading YAML frontmatter as a deterministic backstop. If caller fields omit `Target Version`, derive it from frontmatter `target-version:`. If caller fields omit `CuraOS Milestone`, derive it from frontmatter `milestone:`. If caller fields omit `Issue Kind`, map frontmatter `type:` to the live Project option (`Initiative|Epic -> Roadmap`, `Story|Task|Bug -> Implementation`, `Spike -> Planning`). Normalize stale `Milestone` to `CuraOS Milestone`; never write GitHub's built-in `Milestone` field for any CuraOS milestone value (the live option list is the Project's `CuraOS Milestone` single-select - do not hardcode a milestone range in prose).
3. `addItem` (idempotent - returns existing id), except `dry_run` only computes the plan.
4. Read current item field values from `gh project item-list` flattened keys (`curaOS Milestone`, `priority`, `cycle`, etc.) → `reconcileFields` writes only deltas, clears removed (aliased batched mutations). When the caller passes `project_items_cache`, read that cache instead of re-listing the whole Project; composite gates create the cache once per wave/gate and pass it to every candidate sync. The returned `milestone` is `NONE` unless the value was already in sync or the `CuraOS Milestone` write actually succeeded; an unmapped single-select option never counts as bound after the one refresh retry.
5. GitHub Project GraphQL quota/transient failures return `blocked_by_external: true` with `error_kind` (`github-graphql-quota` / `github-project-api-transient`) instead of throwing into an empty caller result.

For a full tracker parity checkpoint, run `node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json` after local evidence is current. That sync is dual-way by default: it attempts safe missing local issue/Project writes to GitHub first, then imports the live Project and issue state into local SQLite.

## Gates

- Idempotent: re-running on an in-sync issue writes nothing.
- `dry_run`: report the planned add + field deltas, execute no mutations.
- Fail closed if the board list reaches the scan cap or the item still reports `milestone: NONE`; callers treat that as not ready.
- Uses `env -u GITHUB_TOKEN gh` (project scope via keyring).
- ProjectV2 read/write failure is a real external blocker. Never report `{ ready: [], not_ready: [] }` for a non-empty candidate set after Project sync fails.

## Determinism

Add + reconcile are deterministic given inputs (the helper + lib are plain code). This executor shells the helper directly; no agent prompt may replace Project field truth.
