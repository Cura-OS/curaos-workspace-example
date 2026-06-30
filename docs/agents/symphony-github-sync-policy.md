# Symphony GitHub Sync Policy

Status: local-first sync design
Related plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Related local workpad: [local-first-workpad.md](local-first-workpad.md)

## Purpose

This policy keeps Symphony-aligned work local first while preserving GitHub as the shared PR, commit, issue, and roadmap sync target.

## Default

Local SQLite issues, local workpad summaries, and local evidence are the source of progress truth during execution. GitHub is read or written only when the workflow reaches a named sync checkpoint.

## Read policy

Use this order:

1. Existing local SQLite issue database, local workpad, local ledger, and `.agent-workflow-kit/runs` when the question is local progress.
2. Cached board snapshot when a fresh Project-wide view is not needed.
3. Targeted REST reads for one issue, one PR, labels, comments, or dependencies.
4. GraphQL only for ProjectV2-only fields or review-thread operations that REST cannot prove.

## Write policy

Allowed writes:

- PR create or update.
- Issue create for durable shared follow-up.
- Issue close or label change when the local proof is complete.
- Project field reconcile for roadmap state.
- One concise checkpoint comment when needed for reviewer handoff.

Disallowed writes:

- Progress heartbeat comments.
- Checklist ticks that only mirror local workpad state.
- Broad Project item sweeps for every local check.
- Repeated comments where one editable workpad or local ledger is enough.

## Sync record

Before a sync, record this in the local ledger:

```md
| Local item | Sync target | Reason | Planned command | Status |
|---|---|---|---|---|
| SAA-10 | PR | local checks green | `gh pr create ...` | Pending |
```

After a sync, replace `Status` with the exact handle and evidence, for example PR URL, issue URL, commit SHA, or command output path.

The future SQLite `sync_outbox` table is the machine-readable source for planned sync actions. Markdown rows are the human-readable summary.

## Quota controls

- Prefer `gh issue view`, `gh pr view`, `gh api repos/...`, and other REST-supported reads.
- Use `scripts/lib/gh-project.js` caches for Project metadata.
- Invalidate snapshots only after mutating sync.
- Fail closed when a read is truncated, rate-limited, or missing required fields.
- Never turn a failed GitHub call into a clean local pass.
