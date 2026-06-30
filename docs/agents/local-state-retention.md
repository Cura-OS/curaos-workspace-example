# Local-State Retention Policy (RP-75)

Retention rules for workspace-local, git-ignored state, enforced by `scripts/gc-local-state.sh`.
The GC is DRY-RUN BY DEFAULT: it lists candidates and exits without touching anything. Deletion
runs only behind an explicit `--apply` flag, and `--apply` is a destructive operation under
AGENTS.md section 11: it requires same-turn user confirmation, with the dry-run candidate listing
(printed by the script before any action) as the recorded evidence.

Fail-closed clause (born in RP-27, lives here per its convention): the GC FAILS (exit nonzero)
instead of deleting whenever a candidate may be the only record of a verdict or an unmerged
artifact tree. The predicates are encoded in `scripts/lib/gc-evidence-guard.js` (own bun suite at
`scripts/lib/gc-evidence-guard.test.js`); the script consumes `gcBlockers` and exits nonzero
without deleting when it returns a nonempty list.

## Scope and TTLs

| Store | Rule | Disposition |
|---|---|---|
| `.agent-workflow-kit/runs/<run-id>/` | Keep the newest 50 runs, and any run newer than 7 days (either prong keeps) | Older runs deleted; FAILED runs (run.json `status` != `completed`, or unreadable run.json, treated as failed) get `run.json` + `events.jsonl` archived to `.agent-workflow-kit/runs-archive/<run-id>/` BEFORE the run dir is removed |
| `.scratch/cache/` | TTL 7 days | Deleted after TTL (regenerable caches only) |
| `.scratch/state/` | TTL 30 days | Deleted after TTL (resumable lane/orchestrator state) |
| `.scratch/evidence/` | No auto-deletion | Promotion-only: files older than 7 days are listed as promotion-pending; the GC never deletes them |
| `.scratch/integration-queue/` | Protected | Never GC'd; lifecycle is owned by the remediation/integration wave, not by TTL |
| `.scratch/` other files (legacy, untyped) | TTL 7 days AND unreferenced by open issues | Deleted only when older than 7 days and the basename appears in no open issue (tracker repo); when the issue check is unavailable, apply mode fails closed |
| `.worktrees/` | Registered worktrees only | Non-worktree dirs (the stray escaped-artifact-tree class) BLOCK the GC; they need a human diff + disposition, never silent deletion |
| `.codegraph/*.db` | WAL kept smaller than the db | `PRAGMA wal_checkpoint(TRUNCATE)` in apply mode (size evidence printed before/after); dry-run reports sizes only |
| `.scratch/workflow-cache/roadmap-items-*` | Snapshot family (RP-71): keep newest 3 rotations | Count-based rotation, not TTL; fixed names (`roadmap-items.json`, `roadmap-items-latest.json`) never candidates |
| `.scratch/project/curaos-roadmap-items-*` | Snapshot family (RP-71): keep newest 3 rotations | Same rotation rule; fixed `curaos-roadmap-items.json` protected |
| `.scratch/project-items-*` (top level) | Snapshot family (RP-71): keep newest 3 rotations | Same rotation rule (the dated board-copy class) |

New scratch artifacts should be written into `.scratch/{cache,state,evidence}` by class; the
untyped top-level form is legacy and carries the strictest deletion gate (open-issue reference
check) because its contents are unclassified.

## Snapshot writer policy (RP-71)

Snapshot families (recurring full-board or item-list dumps under `.scratch`) follow a fixed
writer contract, implemented in `scripts/lib/snapshot-rotation.js` (own bun suite at
`scripts/lib/snapshot-rotation.test.js`):

- A family keeps fixed-name latest file(s): `<base>.json` (the RP-38 shared TTL snapshot) and/or
  `<base>-latest.json` (the RP-71 fixed latest pointer). Fixed names are never rotated and never
  pruned.
- Beside the fixed file(s), a writer keeps the newest 3 timestamped rotations
  (`<base>-<epoch-ms>.json`) and deletes older rotations IN THE SAME CALL:
  `writeSnapshotWithRotation({ dir, base, data })`. The call returns an immediate measured
  size/count ledger (before/after bytes + file counts) for evidence.
- Unique-filename-per-pass writers (`<base>-<ts>-<rand>.json` with no pruning, the
  46-orphaned-snapshots growth class) are FORBIDDEN; callers that maintain their own fixed file
  pass `writeLatest: false` and still get rotation + same-call pruning.
- The GC backstops families that accumulated rotations before this policy landed: the registry
  in `GC_SNAPSHOT_FAMILIES` (same lib) names `roadmap-items` in `.scratch/workflow-cache/`,
  `curaos-roadmap-items` in `.scratch/project/`, and `project-items` at the `.scratch/` root.
  Rotation candidates are governed by count (keep newest 3, ordering by filename stamp with an
  mtime fallback for date-suffixed legacy copies), not by the legacy TTL class; an open-issue
  reference still keeps a member when the reference check succeeded. Every family pass emits a
  `SUMMARY-SNAPSHOTS` before/after ledger line, and apply mode re-measures each family after
  deletion (`snapshot-after` lines).
- Mutating board runs still invalidate the RP-38 TTL snapshot (`rm -f
  .scratch/workflow-cache/roadmap-items.json` or `invalidateBoardSnapshot()`); rotation never
  substitutes for invalidation.

## Fail-closed gates (any of these stops the GC without deleting)

1. **Verdict evidence in `.scratch`**: any `.scratch` file matching `VERDICT:` blocks the whole GC
   (exit 2). Grill verdicts must be PROMOTED to `ai/curaos/docs/grills/` per the grills lifecycle,
   never parked in `.scratch` (including `.scratch/evidence/`; that dir is for non-verdict
   artifacts awaiting promotion).
2. **Unreadable `.scratch` candidates**: a file the guard cannot read blocks the GC (uncertainty
   is treated as evidence).
3. **Stray dirs under `.worktrees/`**: any directory not registered in `git worktree list
   --porcelain` (workspace root + `curaos/`) blocks the GC (exit 2). A failed registry listing
   blocks every entry rather than treating them all as strays.
4. **Secret scan**: `gitleaks detect --no-git` runs over `.agent-workflow-kit/runs` and `.scratch`
   (the one place a token dump would silently persist). Findings, scanner errors, or a missing
   gitleaks binary in apply mode stop the GC (exit 3) before any deletion.
5. **Open-issue reference check unavailable**: in apply mode, legacy `.scratch` candidates cannot
   be deleted without the reference check (exit 4). Source is `GC_OPEN_ISSUES_FILE` (a text/JSON
   dump to grep) or `gh issue list -R <tracker repo>` as fallback.

## Running the GC

```
scripts/gc-local-state.sh                  # dry-run (default): list candidates, delete nothing
scripts/gc-local-state.sh --apply          # destructive: requires same-turn user confirmation
                                           # per AGENTS.md section 11
```

Flags: `--root DIR` (default: RP-27 workspace-root resolution via
`scripts/lib/workspace-root.js`; never the caller cwd), `--keep-runs N` (default 50),
`--run-ttl-days N` (7), `--cache-ttl-days N` (7), `--state-ttl-days N` (30),
`--legacy-ttl-days N` (7), `--keep-snapshots N` (3; RP-71 rotation depth per snapshot family).

Env: `GC_GITLEAKS_BIN` (gitleaks binary override), `GC_OPEN_ISSUES_FILE` (open-issue text source;
overrides the `gh` fallback), `GC_ISSUE_REPO` (default
`your-org/curaos-ai-workspace`).

Exit codes: `0` clean (dry-run listed candidates, or apply completed), `2` evidence blockers
(RP-27 guard), `3` gitleaks findings/error or missing scanner in apply mode, `4` apply blocked on
unavailable issue check, `5` usage or root-resolution failure.

Tests: `scripts/gc-local-state.test.sh` (runs in `just test-sh`); the evidence-class acceptance
fixtures (a `.scratch` file containing `VERDICT:`, a non-worktree dir under `.worktrees/`) live
there and assert nonzero exit without deletion.
