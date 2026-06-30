# Symphony Alignment Plan for CuraOS Agent Workflows

Status: closed locally; explicit GitHub sync not queued
Owner surface: `docs/agents/`, `scripts/workflows/`, `ai/rules/`, active Hermes profile skills
Local tracker: [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md)
Research source: [2026-06-27-symphony-orchestration-alignment.md](../../ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md)
Governing rule: [curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)

## Purpose

Adopt OpenAI Symphony's service specification and example workflow as a standards input for CuraOS agent orchestration. The adoption strengthens the current CuraOS workflow library, Claude workflow usage, Agent Workflow Kit invocation path, Hermes native orchestration path, local-first tracker model, and evidence gates.

This plan intentionally avoids a wholesale copy of Symphony. CuraOS already has binding rules for GitHub tracking, local CI, agent workflow executors, cross-harness verification, generator evolution, and doc graph maintenance. Symphony alignment means mapping the spec concepts to those owners and adding conformance checks where gaps exist.

## Related local docs

- [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md)
- [SYMPHONY-CONFORMANCE.md](SYMPHONY-CONFORMANCE.md)
- [SYMPHONY-HERMES-NATIVE-GUIDE.md](SYMPHONY-HERMES-NATIVE-GUIDE.md)
- [local-first-workpad.md](local-first-workpad.md)
- [harness-native-playbook-execution.md](harness-native-playbook-execution.md)
- [symphony-github-sync-policy.md](symphony-github-sync-policy.md)
- [symphony-source-intake.md](symphony-source-intake.md)
- [symphony-reflection-template.md](symphony-reflection-template.md)
- [symphony-adoption-closeout.md](symphony-adoption-closeout.md)
- [symphony-adapter-boundaries.md](symphony-adapter-boundaries.md)
- [symphony-workflow-gap-matrix.md](symphony-workflow-gap-matrix.md)
- [symphony-hermes-skill-brief.md](symphony-hermes-skill-brief.md)
- [symphony-rollout-sequence.md](symphony-rollout-sequence.md)
- [symphony-quality-gates.md](symphony-quality-gates.md)
- [symphony-open-questions.md](symphony-open-questions.md)

## Non-negotiables

- GitHub remains the tracker adapter for shared execution state. Linear is not adopted.
- The local goal/progress file is the working tracker for this adoption effort. GitHub is used for PRs, commits, and explicit sync checkpoints, not for every progress update.
- Claude Code can use native `Workflow`. Non-Claude harnesses with Agent Workflow Kit can call `agent-workflow-kit workflow-run`. Hermes and any harness without those layers must execute the same playbooks with native tools.
- Every CuraOS request starts with the matching Symphony-aligned workflow or harness-native playbook path; if no playbook fits, the run records a local follow-up to add or extend one.
- Codex app-server is an optional runner adapter. It must not become a requirement for generic workflows.
- T1, T2, T3, local CI, evidence-before-claims, no em dash, no AI commit trailers, and generator-evolution rules still bind.
- All workflow and Symphony-alignment scripts/code must be delivered with strict TDD: write the failing test first, run it red, implement the smallest code, run it green, then refactor with tests green.
- Local issues for all agent work must persist in a local SQLite database before any GitHub sync. Markdown ledgers stay human-readable summaries, not the system of record for machine issue state. Child work links to a main issue through `parent_id` unless it qualifies as its own main issue.
- Harnesses ask before broad orchestration: offer a ready-open-issues wave or an unblock-prep wave, then execute the approved Symphony workflow to a verified stop state.
- No external credentials, tokens, or API keys are written to docs, logs, skills, or tracker files.

## Current CuraOS surfaces inspected

| Surface | Current role | Symphony alignment impact |
|---|---|---|
| `docs/agents/workflows/README.md` | Workflow library contract and trigger index | Add Symphony compatibility guidance and keep `.md` plus `.js` as the CuraOS equivalent of repository-owned workflow contracts. |
| `docs/agents/workflows.md` | Harness trigger map | Make Hermes native execution explicit beside Claude and Agent Workflow Kit. |
| `scripts/check-workflow-sync.js` | Playbook/executor contract gate | Keep as first conformance gate and extend later with Symphony concept coverage. |
| `scripts/workflow-truth-contract.test.js` | Workflow helper truth tests | Extend later with shared local tracker and strict prompt rendering helpers. |
| `docs/agents/local-state-retention.md` | Local run and scratch retention policy | Use as retention base for Symphony SQLite database, workpads, snapshots, and evidence. |
| `docs/agents/issue-tracker.md` | GitHub issue contract | Keep GitHub canonical for shared issues, add local SQLite issue storage and sync policy around it. |
| `scripts/lib/gh-project.js` | REST and GraphQL project sync, cache, bucket | Reuse for explicit GitHub sync, not per-heartbeat writes. |
| `ai/rules/*` | Binding workspace policy | Add Symphony alignment rule and regenerate the rule index. |
| Hermes skills | Native Hermes procedural memory | Add a Symphony alignment skill so Hermes can follow the generic playbooks without Claude Workflow or Agent Workflow Kit. |

## Target architecture

### Layer 1: Shared policy

- `ai/rules/curaos_symphony_alignment_rule.md` defines binding adoption behavior.
- Existing rules keep precedence for tracker, safety, verification, local CI, generator evolution, context, and no em dash.

### Layer 2: Repository-owned workflow contracts

- Keep `docs/agents/workflows/<name>.md` as the cross-harness playbook contract.
- Keep `scripts/workflows/<name>.workflow.js` as the deterministic executor when one exists.
- Treat the pair as the CuraOS version of Symphony's `WORKFLOW.md` contract.
- Add a later conformance section to each playbook or a generated matrix that records the Symphony concept mapping:
  - tracker adapter
  - polling or trigger mode
  - workspace root and owned working tree
  - hooks
  - agent runner adapter
  - prompt template inputs
  - validation error surface
  - internal state transitions
  - retry and reconciliation
  - observability and evidence
  - safety posture

### Layer 3: Harness adapters

| Harness | Primary path | Fallback path | Required invariant |
|---|---|---|---|
| Claude Code | Native `Workflow({ scriptPath, args })` | Read the playbook and execute phases manually | Same contract, same gates, same evidence. |
| Agent Workflow Kit users | `agent-workflow-kit workflow-run <name> --args-json ...` | Read the playbook and execute failed phases natively | Stub-agent runs are never proof of real work. |
| Hermes | Hermes skill plus native tools: `todo`, `delegate_task`, terminal, file tools, browser/computer when needed | Manual playbook execution | No dependency on Agent Workflow Kit or Claude Workflow. |
| Codex | Agent Workflow Kit or Codex app-server adapter where justified | Codex CLI direct | Codex-specific config stays in adapter fields. |
| Other CLI agents | Agent Workflow Kit if installed | Playbook-native execution | No duplicated policy files. |

### Layer 4: Local-first tracker

Use [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md) as the human ledger. The SQLite-backed machine ledger is implemented and remains the local system of record before broad workflow implementation or GitHub sync:

```text
.scratch/state/symphony-work/local-issues.sqlite
.scratch/state/symphony-work/<run-id>.json
.scratch/evidence/symphony-work/<run-id>/
```

SQLite tables to standardize:

- `local_issues`: id, title, status, priority, owner_path, workflow_name, target_phase, parent_id, created_at, updated_at, github_repo, github_issue_number, github_sync_status.
- `local_issue_events`: issue_id, event_type, payload_json, created_at, actor.
- `reflections`: issue_id, worked, failed, decision, follow_up, evidence_json, created_at.
- `sync_outbox`: issue_id, sync_kind, target, payload_hash, planned_command, status, result_handle, created_at, synced_at.
- `evidence_refs`: issue_id, kind, command, path, digest, exit_code, created_at.

Workpad fields to mirror into SQLite or JSON views:

- `id`
- `goal_id`
- `phase`
- `status`
- `owned_paths`
- `workspace_root`
- `local_workpad_path`
- `github_sync_status`
- `last_reflection`
- `verification_evidence`
- `blocked_by`
- `next_sync_checkpoint`

GitHub sync is explicit and diff-first:

1. Local planning and progress update: zero GitHub calls.
2. Need tracker truth: use cached board snapshot or targeted REST read.
3. Need PR or issue creation: one explicit sync batch, with evidence captured in the local ledger.
4. Need project fields: use `scripts/lib/gh-project.js` caches and GraphQL only for ProjectV2-only fields.
5. After sync: invalidate local snapshot only if a mutating sync occurred.

## Implementation phases

### Phase 0: Research and substrate docs

Status: done.

Deliverables:

- Research note under `ai/curaos/docs/research/`.
- Symphony alignment rule under `ai/rules/`.
- Full implementation plan under `docs/agents/`.
- Local adoption goal ledger under `docs/agents/`.
- Hermes skill in the active default profile.
- Links from workflow and docs indexes.

Validation:

- `node scripts/generate-rule-index.js --write`
- `node scripts/generate-rule-index.js`
- `node scripts/check-workflow-sync.js`
- `node scripts/check-symphony-source-audit.js`
- `bun scripts/check-doc-graph.js --write`
- `bash scripts/check-docs.sh`
- No em dash or en dash in changed markdown.

### Phase 1: Symphony conformance model

Status: done.

Deliverables:

- Tests first: add failing unit tests for missing mapping, invalid mapping, and no-GitHub-call behavior before writing checker code.
- `docs/agents/SYMPHONY-CONFORMANCE.md` defining the CuraOS mapping from Symphony sections to local workflow fields.
- `scripts/lib/symphony-conformance.js` with pure helpers for playbook parsing and concept coverage.
- `scripts/check-symphony-conformance.js` that fails closed when a reusable workflow lacks required mapping fields.
- Test fixtures covering missing workflow file, invalid front matter, non-map front matter, unknown template variable, missing workspace root, missing runner adapter, and unproven tracker sync.

Success criteria:

- All current reusable workflows have either a complete mapping or an explicit `not_applicable` reason.
- Existing internal one-shot executors remain allowlisted in `scripts/check-workflow-sync.js` and do not become public generic workflows by accident.
- Conformance checker is local-only and performs zero GitHub calls.

### Phase 2: Local-first workpad and reflection ledger

Status: done for local SQLite issue substrate and CLI.

Deliverables:

- Tests first: add failing tests for SQLite schema creation, parent issue hierarchy, issue CRUD, event append, reflection append, sync outbox idempotency, and zero GitHub calls.
- Machine-readable local SQLite issue schema under `docs/agents/local-first-workpad.md`.
- `scripts/lib/local-issues-db.js` with schema migration, parent issue hierarchy, create/update/read/list, event append, reflection append, and sync outbox helpers.
- `scripts/local-issues.js` CLI for local issue CRUD, reflection, evidence linking, and explicit sync queue inspection.
- GC integration with `docs/agents/local-state-retention.md` so evidence and reflections are retained or promoted safely.
- Optional sync script that can summarize a local workpad into one GitHub issue or PR comment only at explicit checkpoints.

Success criteria:

- Routine progress updates do not call GitHub.
- Local issue state survives session compaction and process restarts in `.scratch/state/symphony-work/local-issues.sqlite`.
- Reflection captures `worked`, `failed`, `decision`, `evidence`, `follow_up`, and `sync_needed` fields.
- GitHub sync batches are idempotent, diff-first, and logged locally before and after.
- Red, green, refactor evidence is recorded for every new local tracker helper and CLI behavior.

### Phase 2b: Workflow script TDD alignment

Status: done for the new workflow helper, checker, docs gate, and local issue CLI added by this alignment wave.

Deliverables:

- Tests first: add failing coverage for each changed workflow helper or executor before implementation.
- Update workflow-related scripts/code so Symphony concepts are explicit in reusable helpers rather than copied into each workflow.
- Extend `scripts/workflow-truth-contract.test.js` or add focused tests for prompt input rendering, local issue attachment, evidence collection, retry/reconciliation fields, and harness adapter selection.
- Add focused source audit coverage for tracked and untracked workflow markdown plus scripts that are outside markdown playbook frontmatter.
- Keep generated or shared workflow behavior in `scripts/lib/*` and `scripts/workflows/*` central seams, not local one-off scripts.

Success criteria:

- Every code change in `scripts/lib/`, `scripts/workflows/`, or workflow checkers has a recorded failing test run before the implementation patch.
- The final green run includes focused tests plus `node scripts/check-workflow-sync.js` and docs checks.
- Any workflow defect found during alignment is fixed in the shared helper, checker, generator, or playbook contract owner.
- Tracked and untracked workflow markdown plus scripts are checked for no-em-dash source hygiene and agent tracker policy drift.

### Phase 3: Workflow playbook updates

Status: done for all current public reusable playbooks.

Deliverables:

- Add a `Symphony mapping` section to reusable playbooks or generate a matrix from the conformance file.
- Update `task-execute`, `milestone-wave`, `pm-triage-gate`, `pr-verify-merge`, `context-load`, and `wave-prioritize` first.
- Update trigger map language so Hermes, Claude, Agent Workflow Kit, and Codex all share the same fallback semantics.
- Keep `scripts/check-workflow-sync.js` green after every playbook/executor contract edit.

Success criteria:

- Every public workflow has a tracker adapter, workspace ownership, retry/reconciliation, observability, and safety posture defined.
- Every workflow names exactly where local progress is stored and when GitHub sync is allowed.
- Every workflow names how local issues attach to the SQLite database and what sync outbox entries are allowed.
- No executor assumes a single harness unless it is explicitly adapter-scoped.

### Phase 4: Harness-specific adoption

Status: done for documentation and conformance mapping.

Deliverables:

- Claude: native Workflow usage confirmed in docs.
- Agent Workflow Kit: `--real-agents` and stub-evidence caveats retained.
- Hermes: skill and native execution guide validated in this session.
- Codex: app-server usage documented only as a runner adapter and only where needed.

Success criteria:

- Hermes can complete a workflow from the playbook using its own tools without `agent-workflow-kit` or Claude Workflow.
- Non-Claude Agent Workflow Kit users get the same contract through `workflow-run`.
- Claude native workflows keep existing behavior.
- Codex-specific examples do not leak into generic playbooks.

### Phase 5: Verification and rollout

Status: local rollout done; GitHub PR remains explicit-sync only and is not queued by this local implementation.

Deliverables:

- Local CI gate additions, if needed, wired through existing scripts.
- Workflow sync, rule index, doc graph, and docs checks integrated into the adoption closeout checklist.
- Adoption goal ledger updated for every completed phase.
- Optional GitHub PR after local evidence is complete.

Success criteria:

- All docs and scripts pass local verification.
- No GitHub quota-heavy sweep is required for normal local progress checks.
- GitHub sync is limited to PR, commit, issue seed, project field reconcile, or explicit mirror refresh; tracker parity refreshes are dual-way by default once requested.
- A future agent can continue from the local goal ledger without session history.

## Detailed file plan

| Change | Path | Type | Notes |
|---|---|---|---|
| Research note | `ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md` | New doc | Source facts and gap matrix. |
| Rule | `ai/rules/curaos_symphony_alignment_rule.md` | New rule | Generated index updates `ai/rules/README.md` and `AGENTS.md`. |
| Plan | `docs/agents/SYMPHONY-ALIGNMENT-PLAN.md` | New doc | This file. |
| Goal ledger | `docs/agents/SYMPHONY-ADOPTION-GOALS.md` | New doc | Local-first tracking and progress. |
| Local SQLite issue DB | `.scratch/state/symphony-work/local-issues.sqlite` | Implemented local state | Machine issue store, ignored by Git, with schema documented and migration tested. |
| Workflow index links | `docs/agents/workflows.md`, `docs/agents/workflows/README.md` | Patch | Make Symphony adoption discoverable. |
| Docs index link | `ai/curaos/docs/README.md` | Patch | Link the research note. |
| Hermes skill | active default Hermes profile | New skill | Native playbook execution without Agent Workflow Kit. |
| Conformance checker | `scripts/check-symphony-conformance.js` | New code | Implemented by TDD and wired into docs checks. |
| Persistent source audit | `scripts/check-symphony-source-audit.js` | New code | Implemented by TDD and wired into docs checks for tracked and untracked workflow markdown plus scripts. |
| Local issue DB helper | `scripts/lib/local-issues-db.js` | New code | Implemented by TDD. |
| Local issue CLI | `scripts/local-issues.js` | New code | Implemented by TDD and never calls GitHub unless sync is explicit. |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Copying Linear-specific policy | Treat GitHub as adapter and keep Linear only in research notes. |
| Making Codex required | Keep Codex app-server behind runner adapter. |
| GitHub quota burn | Local ledger first, REST-first targeted reads, cached board snapshots, explicit sync checkpoints. |
| SQLite database becomes hidden state | Keep schema documented, add CLI export, mirror durable summaries into the markdown ledger, and test migrations. |
| TDD skipped during script implementation | Block completion until red and green command evidence is recorded in the local issue or ledger. |
| Workflow drift | Keep `check-workflow-sync`, `check-symphony-conformance`, and `check-symphony-source-audit` green. |
| Generic playbooks become too verbose | Put concept mapping in generated matrix or concise sections, not duplicated prose. |
| Hermes path forgotten | Maintain Hermes skill and mention native tool execution in the trigger map. |
| Upstream skill conflicts | Review imported skills and reject AI attribution trailers and unsafe permission defaults. |

## Phase 0 closeout criteria

- [x] Research note created and linked.
- [x] Symphony alignment rule created and rule index regenerated.
- [x] Plan and goal ledger created.
- [x] Workflow docs link to the plan and goal ledger.
- [x] Hermes skill created.
- [x] `node scripts/check-workflow-sync.js` passes.
- [x] `node scripts/generate-rule-index.js` passes.
- [x] `bun scripts/check-doc-graph.js --write` run, then docs check run.
- [x] Changed markdown contains no em dash or en dash.
- [x] `git status --short` reviewed and only intended files changed.
