# Issue tracker: GitHub (per-repo, matched at runtime)

Issues live on GitHub, spread across every repo in the `your-org` org (do NOT hardcode a repo count - derive the current set from `curaos/.gitmodules` plus `gh repo list your-org`):

- `curaos-ai-workspace` - workspace itself (planning, cross-cluster ADRs, doc-only changes)
- `curaos` - monorepo container (submodule pointer bumps, root-level cleanup)
- the sub-submodules under `curaos/backend/services/*` + `curaos/frontend/{apps,packages}/*` (per-service code work), plus standalone org repos (`curaos-deploy`, `curaos-website`, docs/onboarding repos, ...)

Pick the right repo per task; do not always default to one. Use the `gh` CLI for every operation.

Use the organization Project in [github-roadmap-project.md](github-roadmap-project.md) for cross-repo priority, dependencies, and dashboard views. Issues remain in the owning repo; the org Project aggregates them.

## Phase/milestone gate

After a scaffold/setup milestone completes and before implementation starts, seed GitHub Issues for the roadmap and the next milestone's atomic tasks.

Generic rule (milestone-agnostic - the live milestone state is NOT hardcoded here; read `ai/curaos/docs/ISSUE-ROADMAP.md` + `ai/curaos/docs/HANDOVER.md` for the active gate):

- A completed scaffold/setup milestone whose GitHub seed is missing/deferred gets an **issue-seeding step** (the "M<n>.5" pattern) before the next milestone's code starts.
- The seeding step creates roadmap issues for the active version's milestone set in `your-org/curaos-ai-workspace` (the milestone option list lives on the `CuraOS Roadmap` Project field, per [[curaos-version-planning-rule]]; never copy it into prose).
- The seeding step creates the next milestone's atomic implementation issues in the owning repo(s).
- Do not start a code branch for the next milestone until the issue seed exists and the issue being implemented has `ready-for-agent`.

If docs conflict, the live state docs (HANDOVER + ISSUE-ROADMAP) win over any prose naming a specific "next" milestone.

## Repo selection rules

| Task type | Target repo |
|---|---|
| Cross-cluster planning, new ADR, workspace tooling | `your-org/curaos-ai-workspace` |
| Root-level build, .gitmodules, monorepo orchestration | `your-org/curaos` |
| Per-service code/test/build issue | `your-org/<submodule-name>` (e.g. `identity-service`, `admin-app`) |
| HealthStack-wide policy (cross several healthstack-* services) | `your-org/curaos-ai-workspace` w/ label `cluster:healthstack` |
| Frontend Bun workspace (Wave 6 scaffold) | `your-org/curaos` (scaffold lives in parent) |

When unsure: run `git remote -v` in the cwd to infer the repo `gh` will target by default. If cwd is the workspace root, pass `--repo` explicitly.

## Conventions

- **Create an issue**: `gh issue create --repo <owner/repo> --title "..." --body "..."`. Heredoc for multi-line.
- **Read an issue**: `gh issue view <number> --repo <owner/repo> --comments`.
- **List issues**: `gh issue list --repo <owner/repo> --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` / `--state` filters.
- **Comment**: `gh issue comment <number> --repo <owner/repo> --body "..."`.
- **Labels**: `gh issue edit <number> --repo <owner/repo> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --repo <owner/repo> --comment "..."`.

`gh` infers `--repo` from the `git remote -v` of the cwd when omitted; pass it explicitly when crossing repo boundaries.

## Agent-consumable issue body

Every seeded implementation issue must start with this YAML frontmatter:

```yaml
---
type: "Epic|Story|Task|Bug|Spike"
target-version: "v1|v1.1|v2|Unversioned"
module: "<repo-or-module-path>"
milestone: "M<num>"
priority: "Critical|High|Medium|Low"
effort: "S|M|L"
parent: "<owner/repo#n for non-root children; empty only for true roots>"
requires: []
blocked-by: []
agent-notes: ""
---
```

`requires` entries must be typed (this is the canonical definition; other docs link here):

- `issue:<owner/repo>#<n>` - required issue must be closed.
- `pr:<owner/repo>#<n>` - required PR must have non-null `mergedAt`.
- `check:<owner/repo>:<workflow>@<ref>` - latest matching workflow run must conclude `success`.
- `artifact:<path>` - required generated artifact must exist.
- `doc:<path>` - required doc must exist.
- Unrecognized `requires` entries are blocking until rewritten.

Then include:

- `Parent`: the same parent issue as frontmatter `parent:` for every non-root Story/Task/Bug/Spike.
- `Scope`: exact files/modules allowed.
- `Do not touch`: files/modules outside scope.
- `Acceptance`: checkable outcomes.
- `Verification`: exact commands.
- `Docs`: docs to update or confirm unchanged.
- `Agent routing` when the issue is intended for subagent dispatch: role, task class, recommended effort, and routing source. Runtime orchestrator still sets explicit current-harness model before dispatch.

Apply exactly one category label (`enhancement` or `bug`) and exactly one state label from `docs/agents/triage-labels.md`.

## Hierarchy requirements

Roadmap hierarchy is `Target Version -> Initiative -> Cycle -> Milestone -> Epic -> Story -> Task`.

- Epics live in `your-org/curaos-ai-workspace` and have `type: "Epic"` with `parent: ""` unless they sit under a higher planning issue.
- Stories and Tasks live in the owning repo selected by the repo rules above.
- Every non-root issue must carry `parent: "<owner/repo#n>"` in frontmatter and a matching `## Parent` section.
- Every non-root issue must be wired under that parent with the native GitHub sub-issue API before it can be `ready-for-agent`.
- Cross-repo parent links are written as full refs in both places, for example `your-org/curaos-ai-workspace#618`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on the repo selected per rules above.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo <owner/repo> --comments`.

## When a skill needs to label-search across multiple repos

Use `gh search issues --owner your-org --label <label> --state open`.

## Local-first issue CLI (`scripts/local-issues.js`)

AGENTS.md §10 requires every task/subtask/blocker/follow-up/verification lane to get a row in `.scratch/state/symphony-work/local-issues.sqlite` BEFORE it becomes chat-only work. `scripts/local-issues.js` is that CLI (the `local_issues` table; distinct from the `github_*` mirror tables the sync tool below populates).

```sh
cd /Users/dev/workspace/curaos-workspace   # workspace ROOT (the db lives here, not under curaos/)
node scripts/local-issues.js ensure                                   # create the db/tables if absent (idempotent)
node scripts/local-issues.js list [--status STATUS] [--json]          # find the existing main issue FIRST
node scripts/local-issues.js show --id ID
node scripts/local-issues.js create --id ID --title TITLE \
  [--parent-id ID] [--status pending] [--workflow-name NAME] [--owner-path PATH]
node scripts/local-issues.js update --id ID [--status STATUS] [--parent-id ID] [--github-sync-status synced]
node scripts/local-issues.js event   --id ID --type TYPE [--payload-json JSON]    # durable audit trail
node scripts/local-issues.js reflect --id ID --worked T --failed T --decision T --follow-up T
node scripts/local-issues.js evidence --id ID --kind KIND [--command CMD] [--path PATH] [--exit-code N]
node scripts/local-issues.js sync-queue --id ID --sync-kind KIND --target TARGET   # queue a GitHub push
node scripts/local-issues.js export-markdown
```

Rules (per AGENTS.md §10):
- **Find the existing main issue first** (`list`); attach work as a child via `--parent-id`. Create a NEW main issue (no parent) only when it owns a durable deliverable, a cross-module epic, or an explicit roadmap outcome.
- A local issue that maps to a GitHub issue uses id `GH:<owner/repo>#<n>` (the sync tool writes these); a purely local issue uses a plain id. After creating the matching GitHub issue, `update --github-sync-status synced` and record a `github-link` event.
- **Version gate (binding):** set the GitHub Project `Target Version` field for every issue (`v1`, `v1.1`, `v2`, `Unversioned`). Only execute work whose Target Version is the active release (v1.0); file higher-version work forward and leave it pending - never start it. See [[curaos-version-planning-rule]].

## GitHub reflection gate (binding - no done work invisible online)

The online GitHub Project board MUST always reflect the real status of done work. Local-tracker-only progress that never reaches GitHub leaves the board lying. Every running session on every agent enforces this; it is never optional and never deferred.

Tiered mirror gates (by deliverable size):
- **Epic / big task / cross-module deliverable** (an XSRC-E\* epic, a new service, a roadmap outcome): a GitHub issue ALWAYS exists, created up front. The big tasks anchor the board.
- **Smaller lane / sub-issue** (a single contract, slice, wiring, follow-up): mirror to GitHub **on dispatch** - when a worker is launched for it, set the matching GitHub issue (or the parent epic) to reflect `in_progress`. A small lane with no durable standalone deliverable may roll its status up into its parent epic's issue instead of getting its own.
- **On done (the hard rule):** the moment any local issue reaches `closed`/`done` (lane merged + verified), its GitHub state MUST be updated the SAME turn - close the matching GitHub issue (or post the epic's roll-up completion status) AND set the Project `Status` field to Done. Then link locally: `update --id ID --github-sync-status synced` + set `github_issue_number`. Never let a merged lane sit with the GitHub side still showing open/in-progress.

When several lanes map to one already-existing GitHub issue (e.g. the curated #849-#868 XSRC slice), close that issue with an evidence comment once its lanes are merged, and link every contributing local row to that `github_issue_number`. Run `github-sqlite-sync.js` (below) at wave boundaries to reconcile Project items + catch any drift, but do NOT wait for it - the on-done close happens inline.

## Local SQLite parity mirror

The live GitHub tracker remains the shared source for repo issues, comments, native sub-issues, dependencies, and Project state. The local SQLite tracker keeps a full parity mirror only at explicit checkpoints.

Run the dual-way mirror when the user asks for tracker parity or when a publish checkpoint needs local proof:

```sh
node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json
```

The command first tries to add safe missing local data to GitHub, including queued local-only issues and missing local Project items, then imports GitHub repos, issues, comments, native hierarchy, Project fields/items, and `GH:<owner/repo>#<number>` local rows into SQLite. Use `--pull-only` only when the caller explicitly requested a read-only mirror. Verify parity with `--counts-only --json` plus a fresh live GitHub count check before reporting full sync.

Event-driven convergers: an org webhook can drive the sweeps instead of polling; see
[webhook listener](webhook-listener.md) (RP-54; registration is operator-only).

## Out-of-scope rejections (triage skill)

When `triage` rejects an enhancement as `wontfix`, it writes a markdown explainer to `.out-of-scope/<slug>.md` in the **repo where the issue was filed** (not centralized). This file is the durable record of why the request was declined; future triages check it to spot near-duplicates fast.

- Location: `.out-of-scope/` at the root of whichever repo holds the rejected issue (workspace, curaos, or submodule)
- Filename: `<short-slug>.md` matching issue title; one file per rejection
- Body: link to original issue + rationale paragraph + alternative if any
- Commit: same PR/branch as the close comment; no separate PR
- Discovery: triage skill greps `.out-of-scope/*.md` before grilling a new enhancement

Create the dir lazily - first rejection creates it, no pre-seeding needed.
