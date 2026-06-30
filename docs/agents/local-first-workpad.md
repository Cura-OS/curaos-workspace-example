# Local-first Workpad Model

Status: seed design for Symphony-aligned local tracking
Related plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Local ledger: [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md)

## Purpose

The local workpad is the default progress store for agent orchestration. It captures plan, acceptance, validation, evidence, reflection, blockers, and sync intent before any GitHub write.

This document is a seed design. The first live ledger for Symphony adoption is `docs/agents/SYMPHONY-ADOPTION-GOALS.md`. The machine state for local issues must be SQLite, not GitHub and not markdown-only.

## Principles

- Local first: progress updates do not require GitHub.
- Sync explicit: GitHub writes happen only at named checkpoints; once a checkpoint is authorized, sync tries to add safe missing data to either source before reporting parity.
- Evidence first: every done claim points to command output, file readback, screenshot, API response, or PR/commit handle.
- Reflection required: each run records what worked, what failed, decisions, and follow-ups.
- Fail closed: unreadable local state, missing evidence, or truncated sync inputs are blockers, not success.
- SQLite first: local issue state persists in `.scratch/state/symphony-work/local-issues.sqlite` before any sync to GitHub.
- Hierarchy first: every child task links to a main local issue with `parent_id` unless it is itself a durable roadmap/main issue.
- TDD first: scripts and workflow code that read or write local state need a failing test before implementation.

## SQLite local issue database

Path:

```text
.scratch/state/symphony-work/local-issues.sqlite
```

Required tables:

| Table | Purpose |
|---|---|
| `schema_migrations` | Applied migration ids and timestamps. |
| `local_issues` | Local issue id, optional `parent_id`, title, body, status, priority, owner path, workflow name, target phase, timestamps, and optional GitHub link fields. |
| `local_issue_events` | Append-only issue event history with JSON payloads. |
| `reflections` | Worked, failed, decision, follow-up, evidence JSON, and sync-needed note per issue or run. |
| `evidence_refs` | Command, path, digest, exit code, and evidence kind for local proof. |
| `sync_outbox` | Planned GitHub or PR sync actions, payload hash, command, status, and result handle. |

Parity mirror tables added by the GitHub sync checkpoint:

| Table | Purpose |
|---|---|
| `github_sync_runs` | One row per full parity refresh, including org, snapshot path, and imported counts. |
| `github_repos` | Mirrored `your-org` repository inventory. |
| `github_issues` | Mirrored non-PR GitHub issues with labels, assignees, native parent/sub-issue refs, Project refs, and raw JSON. |
| `github_issue_comments` | Mirrored issue comments, keyed by GitHub comment id and issue ref. |
| `github_projects` | Mirrored org Project metadata. |
| `github_project_fields` | Mirrored Project field definitions and single-select options. |
| `github_project_items` | Mirrored Project item rows and normalized CuraOS fields. |

Implemented helpers:

- `scripts/lib/local-issues-db.js` owns schema migration, CRUD, append-only events, reflections, evidence refs, idempotent sync outbox entries, and markdown summary export.
- `scripts/local-issues.js` exposes local-only CLI commands: `ensure`, `create`, `update`, `show`, `list`, `event`, `reflect`, `evidence`, `sync-queue`, `sync-queue-list`, and `export-markdown`.
- Routine local commands perform zero GitHub calls. GitHub intent is recorded only as a `sync_outbox` row until an explicit sync checkpoint.
- `scripts/github-sqlite-sync.js` owns the explicit GitHub/SQLite parity checkpoint. It is dual-way by default: first add queued local-only issues and missing local Project items back to GitHub when safe, then import repos, issues, comments, native hierarchy, Projects, fields, items, and `GH:<owner/repo>#<number>` local issue rows into SQLite. Use `--pull-only` only for an explicitly read-only refresh.

Example:

```sh
node scripts/local-issues.js create --id SAA-MAIN --title "Symphony alignment main issue" --owner-path docs/agents --workflow-name symphony-adoption --json
node scripts/local-issues.js create --id SAA-07 --parent-id SAA-MAIN --title "Local SQLite issue database" --owner-path scripts/lib/local-issues-db.js --workflow-name symphony-adoption --json
node scripts/local-issues.js reflect --id SAA-07 --worked "schema and CLI green" --failed "none" --decision "local first" --follow-up "run closeout" --sync-needed false --json
node scripts/local-issues.js export-markdown
```

TDD requirements for the implementation:

1. Write failing migration tests before creating the schema helper.
2. Write failing CRUD tests before adding create, update, list, and read helpers.
3. Write failing append-only event and reflection tests before adding those helpers.
4. Write failing sync outbox idempotency tests before adding sync queue code.
5. Run the focused red test, then implement, then run focused green, then run the local tracker test suite.

## Proposed JSON shape

```json
{
  "schemaVersion": 1,
  "id": "symphony-adoption-20260627-001",
  "parentId": "symphony-adoption-main",
  "goal": "SAA-04",
  "status": "in_progress",
  "ownedPaths": ["docs/agents/workflows.md"],
  "workspaceRoot": "/Users/dev/workspace/curaos-workspace",
  "plan": [
    { "id": "1", "text": "Patch trigger map", "status": "pending" }
  ],
  "acceptance": [
    { "text": "Doc graph passes", "status": "pending" }
  ],
  "validation": [
    { "command": "bash scripts/check-docs.sh", "status": "pending", "evidencePath": null }
  ],
  "reflection": {
    "worked": [],
    "failed": [],
    "decisions": [],
    "followUps": []
  },
  "githubSync": {
    "needed": false,
    "reason": "local planning only",
    "target": null,
    "status": "not_queued"
  }
}
```

## Storage policy

Machine-readable local issue state lives in `.scratch/state/symphony-work/local-issues.sqlite` while active. Per-run JSON views may live under `.scratch/state/symphony-work/` when useful, but SQLite is the system of record for local issue state. Durable summaries that matter after cleanup should be promoted into docs, PR bodies, or the local adoption ledger.

Evidence should live under `.scratch/evidence/symphony-work/<id>/` until it is either referenced from a PR or promoted to a durable docs location. GC must never delete evidence that is the only proof of a verdict.

## GitHub sync checkpoints

Allowed sync reasons:

- PR creation or PR update after local checks pass.
- Issue creation for durable follow-up work that must be shared.
- Project field reconcile after an issue exists and needs roadmap state.
- Explicit user-requested tracker mirror refresh.
- Commit push after local validation.

Explicit tracker mirror refreshes are dual-way by default:

```sh
node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json
```

The command adds safe missing local issue/Project data to GitHub first, then pulls the live GitHub state into SQLite and verifies parity through counts plus `github_sync_runs` evidence.

Forbidden sync reasons:

- Heartbeat only.
- Checklist tick only.
- Reflection only.
- Exploratory notes only.
- Re-reading broad Project state when a cached local snapshot or targeted REST read is enough.

## Minimal text workpad fallback

When no JSON helper exists, use this markdown shape in a local doc or local run file:

```md
## Local Workpad

### Plan
- [ ] 1. Item

### Acceptance
- [ ] Criterion

### Validation
- [ ] `<command>`

### Evidence
- `<path or command output reference>`

### Reflection
- Worked:
- Failed:
- Decision:
- Follow-up:

### GitHub Sync
- Needed: no
- Reason: local-only progress
```
