---
name: gh-issue-triage
kind: atomic
version: 0.1.1
inputs:
  issue: { type: string, required: true, description: "owner/repo#N to triage" }
  dry_run: { type: boolean, required: false, description: "report the triage decision + label changes without applying" }
  prefetch: { type: object, required: false, description: "optional batchIssueRead record with body, labels, and native parent data" }
outputs:
  state_label: { type: string, description: "the resolved state label (needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix)" }
  blocker_kind: { type: string, description: "paper | real | none - per the orchestrator paper-vs-real triage" }
  label_changes: { type: array, description: "labels added/removed" }
  rationale: { type: string, description: "why this state was chosen" }
  project_fields: { type: object, description: "CuraOS Roadmap field name -> option label, derived from the issue frontmatter (Target Version, CuraOS Milestone, Priority, Cycle, Initiative, Effort, Module, Issue Kind); omit any field the frontmatter does not declare" }
  parent_ref: { type: string, description: "the issue parent from frontmatter parent:, ## Parent, or native parent endpoint, normalized as owner/repo#N or empty string when parent metadata is absent" }
  is_root: { type: boolean, description: "true only when parent: is explicitly empty and ## Parent explicitly says None or Root; downstream wiring uses this as root truth" }
  blocked_by_external: { type: boolean, description: "true only when deterministic issue prefetch or the triage agent hit an external quota/runtime failure; callers must stop dispatch and retry later" }
  error_kind: { type: string, description: "external failure classifier when blocked_by_external=true" }
guarantees:
  idempotent: true
  determinism: control-flow-only
  side_effects: github
verification: T1
models:
  triage: sonnet
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

# gh-issue-triage

Triage one issue to its canonical state label + classify any blocker paper-vs-real, per [triage-labels](../triage-labels.md) + the orchestrator §3 Paper-vs-Real triage. Idempotent (re-applying the same state is a no-op).

This is the atomic issue-orchestration unit used by broad waves and unblock-prep waves. The caller must already have a main local issue for the wave/prep session and should record each triage candidate as a child row or evidence ref in `.scratch/state/symphony-work/local-issues.sqlite`, preserving the chosen runner (`workflow`, `workflow-run`, `hermes-native`, `codex-adapter`, or `generic-playbook`) with the result.

## Behavior

1. Read the issue body + comments + linked deps. When the caller passes `prefetch`, consume that batched issue record's body, labels, and native parent as authoritative input and do not re-fetch the issue body; a targeted comments or dependency spot-check is optional only when the prefetched body explicitly requires it. ALSO parse the body's leading YAML frontmatter (`---` ... `---`) and derive:
   - `project_fields` - a map of CuraOS Roadmap field **name** -> desired **option label**, keyed exactly as `gh-project-sync`/`reconcileFields` expect (`Target Version`/`CuraOS Milestone`/`Priority`/`Cycle`/`Initiative`/`Effort`/`Module`/`Issue Kind`). The frontmatter `target-version:` maps to `Target Version`. The frontmatter `milestone:` maps to `CuraOS Milestone` when present. The bare `Milestone` key is GitHub's built-in issue milestone field and must be normalized away before Project sync. `priority` maps `P0->Critical`, `P1->High`, `P2->Medium`, `P3->Low` (already-named tiers pass through; values are the named tiers, **not** `P0..P3`). `type` maps to live `Issue Kind` options: `Initiative|Epic -> Roadmap`, `Story|Task|Bug -> Implementation`, `Spike -> Planning`, `Gate -> Gate`, `Verification -> Verification`. `Cycle` is one of `C1-Foundation`..`C6-Production-Hardening`; `Initiative` is one of the 8 charter initiatives. **Omit** any field the frontmatter does not declare; never invent (null/absent over guessed).
   - `parent_ref` - the frontmatter `parent:`, or first issue ref in `## Parent`, or native parent endpoint; normalize to `owner/repo#N`. Empty means parent metadata is absent, not necessarily root.
   - `is_root` - true only when `parent:` is explicitly empty and `## Parent` explicitly says `None` or `Root`; silent missing parent metadata is not a root. Downstream wiring uses `is_root` as the root source of truth.
2. Deterministic prefetch strips `GITHUB_TOKEN`, retries bounded transient GitHub 5xx/504 failures, and returns `blocked_by_external: true` on API/quota/transient failure. When the caller supplied authoritative `prefetch`, the executor may finish before the agent only for bounded deterministic cases: existing non-dispatch state labels (`ready-for-human`, `needs-info`, `wontfix`), explicit `blocked`/`blocked-by` guards, the workspace-hosted leaf backstop, or existing `ready-for-agent` with complete required frontmatter, required body sections (`Parent` unless root, `Scope`, `Do not touch`, `Acceptance`, `Verification`, `Docs`, `Blockers`), native parent/root truth, and a clear `Blockers` section. A prefetched stale `ready-for-agent` missing any of those facts becomes `needs-info`. Raw `needs-triage` is not promoted by this fast path.
3. If the real triage agent itself cannot produce a usable result because of provider quota, session limit, or runtime failure, the workflow returns `blocked_by_external: true` (`agent-runtime-quota` or `agent-runtime-unavailable`). The classifier reads local Codex session/status-line no-credit telemetry when the child error only says `codex exited with status 1`, so no-credit fan-out fails fast instead of looking like a generic workflow failure. Callers must stop dispatch and retry later, not invent a triage result.
4. Classify any blocker: **paper** (missing spec/section the orchestrator can fill from code/specs) vs **real** (genuine external/user dependency). `blocked` is an orthogonal marker label, never a state label: it always pairs with exactly one state label, real blockers also record `blocked-by` frontmatter + a native dependency edge, and triage/close-path hygiene preserve it (markers are never stripped).
5. Resolve the single state label: needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix. **Foresight dependency rule (binding):** an issue carrying the `foresight` marker is discovered dependency work, not automatically future-only work. Do not park an issue solely because it carries `foresight`. If it is relevant to the active working set or needed by a current dependency chain, has a complete body/frontmatter, and has no real blocker, resolve it `ready-for-agent` like any other work. Preserve the `foresight` marker until close-path hygiene. If it is incomplete, has a real blocker, belongs to a future Target Version with no current dependency chain, or needs user/operator action, use the normal state/blocker result and name that actual blocker. An issue with an unmet real/external blocker stays `needs-triage` + `blocked` marker, never ready-for-agent. **Hierarchy guard (binding):** a `Story` or `Task` in `your-org/curaos-ai-workspace` is a paper blocker, even if otherwise ready. Transfer or recreate it in the owning submodule repo before dispatch.
6. Apply the label change (exactly one state label; remove only OTHER state labels; **preserve the category label `enhancement`/`bug` AND the marker labels `foresight`/`blocked`** - markers are orthogonal, never stripped). Deriving `project_fields`/`parent_ref` is **read-only** - no Project field is written here; the values are returned for `pm-triage-gate` to stamp via `gh-project-sync`.

## Gates

- Exactly one state label (per triage-labels rule).
- Return exactly one JSON object. Do not wrap the result in an array or return a list of alternatives.
- A `ready-for-agent` set requires the body to be complete (all sections present) - else needs-info or needs-triage.
- `project_fields` keys are restricted to declared frontmatter (no invented values); `CuraOS Milestone` is derived from frontmatter `milestone:` and `Priority` uses Critical/High/Medium/Low, never P0..P3.
- Existing deterministic non-dispatch state labels (`ready-for-human`, `needs-info`, `wontfix`) are authoritative over agent defaults. `ready-for-human` and `wontfix` stay parked until a human label edit changes them. `needs-info` stays parked unless the issue is otherwise ready, has no `blocked` or `blocked-by` guard, and the triage result explicitly resolves `ready-for-agent`. Apply mode must leave exactly one state label.
- Deterministic backstop: the executor reads the issue body itself before the agent call, parses frontmatter, and merges those Project fields over the agent result. If the agent returns `{ project_fields: {} }` or uses stale `Milestone`, the workflow still returns `CuraOS Milestone` from frontmatter.
- Deterministic state-label backstop: if the live issue already has exactly `ready-for-agent`, has no `blocked` marker label, has no `blocked-by` frontmatter value, and the fresh triage result also resolves `ready-for-agent`, the workflow returns `state_label: ready-for-agent` and `blocker_kind: none`. A fresh `needs-info` or `needs-triage` result overrides a stale ready label, so incomplete bodies cannot proceed to Breakdown or dispatch.
- Deterministic fast path: only authoritative `prefetch` may bypass the agent. It must preserve non-dispatch labels, honor blocked markers/frontmatter, block workspace-hosted leaf issues, and confirm existing `ready-for-agent` only when frontmatter, required body sections, parent/root truth, and the `Blockers` section are complete. It never promotes raw `needs-triage`.
- Deterministic hierarchy backstop: if the issue is a `Story` or `Task` hosted in `your-org/curaos-ai-workspace`, the workflow returns `needs-triage` with a paper blocker so workspace-hosted leaf work cannot dispatch, but existing non-dispatch state labels stay authoritative for escalation/reporting.
- Deterministic prefetch failure on GitHub API/quota/transient errors and real-agent quota/runtime failure return `blocked_by_external: true`; composite gates must surface it as `blocked-by-external` or, when the parent wave has already completed safe queued rows, defer the affected row as `not_ready` without dispatching it. Outside the pre-agent deterministic fast path, agent failure never falls back to existing labels, because stale `ready-for-agent` is a false-pass risk.
- `dry_run`: report the decision (incl. derived `project_fields`/`parent_ref`), change nothing.

## Determinism

Project field and parent derivation are deterministic from issue frontmatter, the `## Parent` section, and the native parent endpoint. The authoritative prefetch fast path is deterministic and intentionally narrow. The blocker classification remains best-effort LLM judgement outside that fast path; label application is a single idempotent op.
