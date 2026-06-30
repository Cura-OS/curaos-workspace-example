---
name: milestone-active-scan
kind: atomic
version: 0.2.1
inputs:
  dry_run: { type: boolean, required: false, description: "echoed back in the result; the scan itself is read-only either way" }
outputs:
  active_target_version: { type: string, description: "lowest open Target Version on the board (empty when the board carries none)" }
  target_versions: { type: array, description: "every Target Version carried by an open issue, ascending" }
  milestones_by_target_version: { type: object, description: "map of Target Version to its CuraOS Milestones (board metadata)" }
  milestones: { type: array, description: "every CuraOS Milestone carried by an open issue, ascending" }
  open_issue_count: { type: number, description: "raw count of every open org issue before runtime-label exclusion" }
  candidates: { type: array, description: "every open org issue not held by agent-claimed:* or agent-PR-open" }
  runtime_held_candidates: { type: array, description: "open issues held out by agent-claimed:* or agent-PR-open; orchestrator must verify the runtime lane before treating the queue as done" }
  paper_blocked_candidates: { type: array, description: "candidates carrying the blocked label; a label, not a disposition" }
  promotable_foresight: { type: array, description: "legacy bucket, always empty; promotion is decided downstream of dependency_cleared" }
  dependency_cleared: { type: array, description: "foresight/blocked issues whose every named blocked-by ref is now CLOSED" }
  generator_inflight: { type: string, description: "issue ref of an in-flight codegen/SDK/contracts lane, empty when none; downstream generated work stays frozen while set" }
  needs_user: { type: array, description: "always empty; the scan never crosses a user-decision boundary" }
  open_prs: { type: array, description: "open PRs linked to open org issues, as owner/repo#N refs" }
  project_scan_completed: { type: boolean, description: "true only when board, issue, and PR scans all completed below their fail-closed caps" }
  dry_run: { type: boolean, description: "echo of inputs.dry_run" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: none
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

# milestone-active-scan

Deterministic, **read-only** scan of the CuraOS Roadmap Project (org Project 2) plus every open org issue and PR. It is the tracker-truth snapshot the orchestration layer consumes before triage and dispatch: which issues are actually available, which carry the `blocked` label, which foresight/blocked stories just had their last blocker close, and whether an in-flight generator/SDK lane freezes downstream generated work.

Milestone fields are tracker metadata, not dispatch gates: the scan classifies every open, unclaimed issue across the whole org; it does not narrow candidates or block dispatch by milestone. Runs as the Scan phase inside [`milestone-wave`](milestone-wave.md) and is safe to run standalone at any time (no mutation, ever).

The [milestone-orchestration-prompt](../milestone-orchestration-prompt.md) binds behavior to two of its buckets: `dependency_cleared` (re-run after EVERY merge; promote cleared stories the same wave) and `generator_inflight` (in-flight generator barrier holds generated-scope lanes).

## Phases (native execution)

Non-Claude harnesses executing this playbook directly follow the same single Scan phase the executor implements. All `gh` calls run with the keyring token (`env -u GITHUB_TOKEN gh ...`), retry transient GitHub 5xx/504 failures up to 3 attempts with backoff, and fail closed.

1. **Board read.** Read the shared RP-38 board snapshot via `scripts/lib/gh-project.js boardSnapshot()` (`.scratch/workflow-cache/roadmap-items.json`, 5 minute TTL). A fresh snapshot costs zero GraphQL Project calls; a stale or missing snapshot refetches with `gh project item-list <resolved project number> --owner your-org --format json --limit 1000`. If GitHub Project reads are unavailable due quota/rate exhaustion and a non-empty local board snapshot exists, use that snapshot as a stale-cache fallback and log it; if no snapshot exists, FAIL. If the item count reaches the limit, FAIL (refuse to scan a truncated result set). Collect per-issue `CuraOS Milestone` and `Target Version` fields; derive `target_versions` (ascending), `milestones`, `milestones_by_target_version`, and `active_target_version` = lowest open Target Version.
2. **Open issues.** `gh search issues --owner your-org --state open --limit 1000` (same fail-closed cap). Key every issue by `owner/repo#N`.
3. **Bucket candidates.** Record `open_issue_count` before exclusions. Every open issue NOT labeled `agent-claimed:*` / `agent-PR-open` joins `candidates` (`ready-for-human` is kept: it means interview-the-user, surfaced for the escalation path, not skip). Issues carrying runtime labels join `runtime_held_candidates`; this bucket is not dispatchable, but it prevents a stale claim or stale `agent-PR-open` label from becoming invisible. Issues with the `blocked` label also join `paper_blocked_candidates`. `promotable_foresight` stays empty (legacy output).
4. **Generator barrier.** `generator_inflight` = first claimed issue whose ref/title matches codegen / `*-sdk` / contracts scope. While set, only generator-scope foresight/blocked issues get dependency probing; downstream generated work stays frozen.
5. **Dependency-cleared probe.** For each `foresight`/`blocked` candidate (subject to the barrier), parse the issue body frontmatter `blocked-by:` list. Only strict `owner/repo#N` refs count; prose blockers are dropped, so a story carrying one can never auto-clear. A story joins `dependency_cleared` only when EVERY named blocker is CLOSED (confirmed via `gh issue view`, fail closed: a transient probe failure aborts the scan rather than running on a partial dependency view; a non-transient per-ref failure parks that story, never clears it).
6. **Open PRs.** `gh search prs --owner your-org --state open --limit 1000` (fail-closed cap); keep PRs whose title/body links an open org issue (`owner/repo#N` or `closes #N` forms) as `open_prs`.
7. **Return** the full output object with `project_scan_completed: true` only when every step ran below its cap.

## Failure modes (fail closed, never improvise)

- Transient GitHub 5xx/504 after 3 attempts: surface `github-project-api-transient` and stop; never substitute LLM memory for tracker truth.
- `gh project` returning "unknown owner type" can mask exhausted GraphQL quota: use the local board snapshot fallback only when it exists and is non-empty; otherwise surface `github-graphql-quota` and stop.
- Any `--limit` cap reached: stop; a truncated scan is not a scan.
