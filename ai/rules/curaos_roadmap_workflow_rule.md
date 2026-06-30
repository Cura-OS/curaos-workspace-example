---
name: curaos-roadmap-workflow-rule
title: Roadmap workflow (1 org Project + 7-layer hierarchy + sub-issues + Pocock skill flow + 9 canonical + 2 runtime labels + 10 fields + 10 views + Tier 1+2 automation + goal-gated Cycles)
description: Roadmap workflow: ONE org-level GitHub Project (CuraOS Roadmap) aggregates every org repo (live list via `gh repo list your-org`); 7-layer hierarchy (Target Version → Initiative → Cycle → Milestone → Epic → Story → Task) via native sub-issues + 6 Issue Types (Initiative/Epic/Story/Task/Bug/Spike); 11 labels per repo (Pocock 5 triage + 4 execution + 2 category) seeded across every org repo; 11 custom Project fields (Status/Priority/Target Version/Milestone/Cycle goal-gated/Initiative/Domain/Estimate/Epic-Link/Parent-Issue/Blocked-By); 10 views (Roadmap/Triage Inbox/Ready-for-Agent/Ready-for-Human/In Flight/By Milestone/By Domain/Blocked/Done-Cycle/Epics-Roadmap); Tier 1+2 automation (org reusable workflows add-to-project + block-parent-close + sub-issue-redirect; per-repo caller workflow_dispatch ONLY per M1 user directive); Matt Pocock skill chain (grill-me → grill-with-docs → to-prd → triage → to-issues → tdd → qa → diagnose → improve-codebase-architecture); strict source-of-truth split (GH Issues+Project = execution canonical; ai/curaos/docs/ = decisions canonical; to-prd/to-issues/triage/qa write GH only; grill-with-docs writes docs only); workspace-as-hub w/ Epics in curaos-ai-workspace + Stories/Tasks in owning submodule repos w/ auto-redirect comments; goal-gated Cycles (1d-6mo, NO time-box, admin curates); approved 2026-05-25
---

# CuraOS Roadmap Workflow Rule

Canonical rule: CuraOS work is tracked across every org repo (derive the live count from `curaos/.gitmodules` + `gh repo list your-org`) via **one org-level GitHub Project** + **native sub-issues** + **6 Issue Types** + **Matt Pocock skill flow**. GH Issues + Project are canonical execution state; `ai/curaos/docs/` is canonical design state. Skills and agents follow the layers, labels, and views defined here.

Approved 2026-05-25 via design proposal at `ai/curaos/docs/proposals/roadmap-workflow-design.md`.

## Hierarchy (7 layers)

```
Target Version      (Project field; v1, v1.1, v2, ...; the RELEASE GATE; see [[curaos-version-planning-rule]])
  └── Initiative     (type:Initiative; charter pillar; lives in curaos-ai-workspace)
       └── Cycle      (Project field; GOAL-GATED; flexible duration 1d-6mo; NOT time-boxed)
            └── Milestone (M1-Mn; native GitHub Milestone)
                 └── Epic   (type:Epic; PRD per feature; lives in curaos-ai-workspace)
                      └── Story (type:Story; vertical slice; in owning submodule repo)
                           └── Task (type:Task; atomic AFK/HITL; in owning submodule repo)

Bug + Spike attach at any level (typically Story or Task layer).
```

**Hard rules:**
- Target Version is the top planning gate; v1 = M1-M17 (the GA working set). Every Epic/Story (and `foresight` issue) carries a `Target Version` Project field. Work too big for the active version is filed against a future version, never dropped or crammed. See [[curaos-version-planning-rule]] + [ADR-0215](../curaos/docs/adr/0215-version-gated-planning.md).
- Initiatives + Epics live ONLY in `curaos-ai-workspace`
- Stories + Tasks live in owning submodule repo (cross-repo sub-issue link to Epic)
- Cycles are goal-gated single-select Project field; admin adds/closes as initiative goals shift
- Cycle naming: `C<seq>-<short-goal-slug>` (e.g. `C1-Foundation`, `C2-Identity-Audit`)

## Issue Types (6 org-level)

Create in `your-org` org settings → Code, planning, automation → Issue types.
Body templates live in `your-org/.github` org repo (not this workspace):

| Type | Use | Body template |
|---|---|---|
| `Initiative` | Charter pillar / strategic theme | `templates/initiative.md` |
| `Epic` | PRD-scoped feature | `templates/epic.md` (Pocock to-prd output) |
| `Story` | Vertical-slice unit | `templates/story.md` |
| `Task` | Atomic AFK/HITL slice | `templates/task.md` (Pocock to-issues output) |
| `Bug` | Defect | `templates/bug.md` (Pocock qa output) |
| `Spike` | Time-boxed research | `templates/spike.md` |

## Required reading order (for new agents on this repo)

1. `AGENTS.md` (workspace)
2. `ai/rules/README.md` + relevant `curaos_*_rule.md` (incl. this one)
3. `ai/curaos/docs/adr/RESOLUTION-MAP.md`
4. Existing `docs/agents/` files (issue-tracker.md, triage-labels.md, domain.md, github-roadmap-project.md)
5. Target module `AGENTS.md` + `CONTEXT.md` + `Requirements.md`
6. Target repo `README.md`

<!-- fold: rationale, non-binding -->

## Why

Drift between docs and tracker is the #1 risk in a 93-repo workspace. Splitting execution (GH) from decisions (docs) + locking the hierarchy + skill flow + view set prevents:

- Agents writing PRDs to docs when they should be issues (or vice versa)
- Cross-repo epics losing their atomic sub-issue trail
- Multiple sources-of-truth for status (label vs Project field vs milestone)
- Per-repo Projects fragmenting roadmap visibility
- Auto-trigger surprises (M1 directive: ALL CI workflows manual until per-workflow user approval)

## Labels (9 canonical per repo)

### Triage 5 (Pocock state machine)

| Label | Color | Meaning |
|---|---|---|
| `needs-triage` | `#FBCA04` | Default on creation |
| `needs-info` | `#D93F0B` | Waiting on reporter |
| `ready-for-agent` | `#0E8A16` | AFK-ready w/ full brief |
| `ready-for-human` | `#1D76DB` | HITL-only, w/ brief + delegation block |
| `wontfix` | `#B60205` | Rejected |

### Category 2

`bug` (red `#d73a4a`) + `enhancement` (light-blue `#a2eeef`).

### Marker 2 (orthogonal)

| Label | Color | Meaning |
|---|---|---|
| `foresight` | `#C5DEF5` | Proactively-captured dependency or future work; marker only. Relevant, fully specified foresight work may become ready; incomplete or blocked foresight uses the normal state and blocker. |
| `blocked` | `#E99695` | Unmet real/external prerequisite |

`blocked` is an orthogonal marker label, never a state label: it always pairs with exactly one state label, real blockers also record `blocked-by` frontmatter + a native dependency edge, and triage/close-path hygiene preserve it (markers are never stripped).

### Runtime (created on demand, never seeded)

`agent-claimed:<id>` + `agent-PR-open` mark live lanes and are stripped on close (close-path hygiene in `docs/agents/triage-labels.md`). Execution lifecycle (`In Progress` / `In Review` / `Done`) is tracked by the Project `Status` field, not labels; the earlier `in-progress`/`in-review`/`done` lifecycle-label registry is superseded (any `done`/`in-review` labels written by Tier-1 automations are cosmetic Status mirrors, not part of the canonical set).

Total = 9 canonical labels per org repo (live repo count via `gh repo list your-org`). Single registry source: `docs/agents/triage-labels.md` (on drift it wins over this mirror) + idempotent org-wide seed converger `bash scripts/sweep-label-seed` (dry-run default, exit 3 on any missing canonical label, `--apply` to seed). Note: `scripts/seed-labels.sh` and `templates/*.md` (initiative.md, epic.md, story.md, task.md, bug.md, spike.md) live in the `your-org/.github` org repo, not this workspace.

## Project - `CuraOS Roadmap`

- Owner: `your-org` (org-level)
- URL: `https://github.com/orgs/your-org/projects/1`
- One org Project ONLY. **No per-repo Projects.** Views provide team/service drill-down.

### Custom fields (11)

| # | Field | Type | Values |
|---|---|---|---|
| 1 | Status | Single-select | `Backlog` / `Ready` / `In Progress` / `In Review` / `Blocked` / `Done` |
| 2 | Priority | Single-select | `Critical` / `High` / `Medium` / `Low` |
| 3 | Target Version | Single-select | `v1` / `v1.1` / `v2` / `Unversioned`; top planning and closure gate |
| 4 | CuraOS Milestone | Single-select | `M1` ... `M17` (live field is named `CuraOS Milestone`, NOT the bare built-in `Milestone`; grouping metadata, should be backfilled when derivable, not a dispatch gate) |
| 5 | Cycle | Single-select | Goal-gated; admin curates |
| 6 | Initiative | Single-select | 8 charter pillars from `AGENTS.md §3` |
| 7 | Domain | Single-select | ~30 from charter `§5.1`+`§5.2` |
| 8 | Estimate | Number | Fibonacci 1/2/3/5/8/13 |
| 9 | Epic Link | Text | URL of parent Epic |
| 10 | Parent Issue | Native (auto) | populated by sub-issue link |
| 11 | Blocked-By | Text | comma-separated URLs |

### Views (10)

1. **Roadmap** (Roadmap layout) - `-status:Done`; group Milestone; sort Cycle asc
2. **Triage Inbox** (Table) - `label:needs-triage`; group Repo; sort Created asc
3. **Ready-for-Agent** (Table) - `label:ready-for-agent status:Ready`; group Domain; sort Priority desc + Created asc
4. **Ready-for-Human** (Table) - `label:ready-for-human status:Ready`; group Domain; sort Priority desc
5. **In Flight** (Board) - `status:"In Progress","In Review","Blocked"`; columns Status, swimlanes Assignee
6. **By Milestone** (Table) - `-status:Done`; group Milestone; sort Priority desc
7. **By Domain/Repo** (Board) - no filter; columns Domain
8. **Blocked** (Table) - `label:blocked OR status:Blocked`; group Domain; sort Updated asc
9. **Done This Cycle** (Table) - `status:Done cycle:<current>`; group Milestone
10. **Epics Roadmap** (Roadmap) - `type:Epic`; group Initiative; sort Milestone asc

### Built-in workflow automations (7)

| Trigger | Action |
|---|---|
| Item added | Status = `Backlog` |
| Issue closed | Status = `Done` + label `done` |
| Issue reopened | Status = `In Progress` + remove `done` |
| PR linked + opened | Status = `In Review` + label `in-review` |
| PR merged | Status = `Done` + label `done` |
| PR closed unmerged | Status = `Backlog` + remove `in-review` |
| Done > 30d | Archive item |

## GitHub API quota routing (REST-first, GraphQL-last)

The roadmap workflow must keep making progress when GitHub GraphQL quota is low. GraphQL is a scarce resource reserved for APIs that have no REST equivalent.

**Binding rules:**
- Before any broad GraphQL or Project sweep, check `gh api rate_limit --jq '.resources.graphql'`. If remaining quota is low, continue all REST-supported work and park only the GraphQL-only step as `blocked: github-graphql-quota`; do not stop issue triage, PR reads, notification enumeration, REST comments, REST labels, or REST merges.
- Use REST/`gh search issues` for issue and PR discovery, labels, milestones, comments, issue timelines, PR reviews, PR review comments, commit statuses, notifications, native `sub_issues`, and issue dependency reads (`/dependencies/blocking` and `/dependencies/blocked_by`) whenever those endpoints support the needed data.
- Do not run broad `gh project item-list --limit 500`, `gh pr view --json ...`, or `gh issue view --json projectItems` loops when a REST endpoint or targeted query can answer the question. These commands spend GraphQL quota behind the scenes.
- ProjectV2 GraphQL is allowed only for the pieces GitHub still exposes only through GraphQL: Project item lookup, Project item add, field value reads, and field value mutations. Use a targeted query scoped to the one issue/PR item being reconciled; cache project, field, and option IDs; serialize Project mutations.
- Review-thread resolution is GraphQL-only once a PR has review comments. REST may prove the cheap zero-thread case (`/pulls/<n>/comments` empty and `/pulls/<n>/reviews` has no `CHANGES_REQUESTED`). If REST shows any review comment, use one targeted `pullRequest.reviewThreads` GraphQL query/mutation set. If quota is exhausted, the PR is `awaiting-graphql-thread-check`; do not merge or clear its notification.
- Use REST writes where supported: PR create (`POST /pulls`), PR merge (`PUT /pulls/<n>/merge`), issue edit/labels/comments/close/reopen, review replies, and notification mark-read. Reserve GraphQL writes for ProjectV2 field updates and `resolveReviewThread`.
- Notification sweeps enumerate and mark notifications through REST. They invoke GraphQL only for PR notifications that need unresolved-thread proof. A GraphQL quota miss HOLDs only that PR notification; it must not block clearing unrelated REST-provable notifications.

## Cross-repo automation (GitHub Actions Tier 1+2)

### Org reusable workflows

Land in `your-org/.github/.github/workflows/`:

- `add-to-project.yml` - uses `actions/add-to-project@v1.0.2`; filters by Pocock-state label OR; uses org secret `ADD_TO_PROJECT_PAT` (classic PAT, `project`+`repo` scopes, rotate quarterly)
- `block-parent-close.yml` - rejects parent close while open sub-issues exist
- `sub-issue-redirect.yml` - auto-comments in submodule child linking back to workspace Epic

### Per-repo caller workflow

Every org repo (live list via `gh repo list your-org`) hosts `.github/workflows/add-to-roadmap.yml`:

- **`on: workflow_dispatch:` ONLY.** Auto triggers (issues/PRs) re-enabled ONLY on explicit per-workflow user approval (M1 directive).
- Calls org reusable `add-to-project.yml` w/ `secrets: inherit`
- Workspace exception (RP-65, 2026-06-10): the workspace repo's caller was DELETED; dispatch-only it carried no issue payload and could never add an item. The canonical add path is LOCAL (`scripts/roadmap-project-item-sync.js` via the `gh-project-sync` / `gh-roadmap-mirror` sweeps); do not reintroduce an Actions-side add path while [[curaos-local-ci-first-rule]] holds.

## Skill flow (Matt Pocock canonical chain)

```
grill-me (productivity, optional)
  → grill-with-docs (engineering, optional; writes CONTEXT.md + ADRs)
    → to-prd (engineering; creates type:Epic issue in curaos-ai-workspace; label:needs-triage)
      → triage (engineering; Epic moves needs-triage → ready-for-agent OR ready-for-human)
        → to-issues (engineering; creates type:Story sub-issues cross-repo in submodule; vertical slices)
          → [AGENT picks ready-for-agent Story]
            → tdd (engineering; red-green-refactor; Status In Progress → In Review → Done)
              → qa (engineering; bug reports → new type:Bug; re-enter triage)
                → diagnose (engineering; hard-bug 6-phase loop)
                  → improve-codebase-architecture (engineering, periodic; emits RFC Epics → re-enter to-issues)
```

**Writer privileges:**

| Skill | Writes to GH? | Writes to docs? |
|---|---|---|
| `grill-me` | No | No |
| `grill-with-docs` | No | **Yes** (CONTEXT + ADR) |
| `to-prd` | **Yes** (Epic issue) | No |
| `triage` | **Yes** (labels + comments) | No |
| `to-issues` | **Yes** (Story sub-issues) | No |
| `qa` | **Yes** (Bug issues) | No |
| `tdd` | **No** (issues; code only) | No |
| `diagnose` | **No** (issues; code only) | No |
| `improve-codebase-architecture` | **Yes** (RFC Epic issues) | No |

## Drill-down navigation

UI: Roadmap → milestone marker → By Milestone → Epic → sub-issues panel → Story → sub-issues → Task → linked PR → commits → diff.

CLI (for agents):

```bash
gh search issues --owner your-org \
  "type:Initiative is:open" \
  --json number,title,repository,url

# REST first: native sub-issues and dependencies do not need GraphQL reads.
gh api repos/your-org/curaos-ai-workspace/issues/<epic-number>/sub_issues
gh api repos/<owner>/<repo>/issues/<issue-number>/dependencies/blocking
gh api repos/<owner>/<repo>/issues/<issue-number>/dependencies/blocked_by

gh search issues --owner your-org \
  --label "ready-for-agent" --state open \
  --json number,title,url,repository
```

## Source-of-truth split (drift prevention)

| State | Source of truth | Writers |
|---|---|---|
| Design decisions | `ai/curaos/docs/adr/` | `grill-with-docs` only |
| Domain glossary | `ai/curaos/<module>/CONTEXT.md` | `grill-with-docs` only |
| Specs / PRDs | GH Issue body (`type:Epic`) | `to-prd` only |
| Atomic work units | GH Issue body (`type:Story`/`Task`) | `to-issues` only |
| Execution state | Project Status field + labels | Project automations |
| Triage state | Pocock 5 labels on issue | `triage` skill |
| Roadmap timeline | Project Roadmap view | Render-only (no writer) |

**Hard rules:**
- Pocock issue-writing skills NEVER write to `ai/curaos/docs/`
- `grill-with-docs` + `improve-codebase-architecture` NEVER create GH issues directly (their output feeds `to-prd` for that)
- Project Status is canonical for execution; labels mirror Status (kept in sync by automations)

## Failure modes prevented

- Workspace docs drift behind tracker reality (split SoT enforced)
- Per-repo Projects fragmenting visibility (org-only)
- Cycle goals slipping silently into time-boxes (no time-box; goal-gated; admin curates)
- Auto-CI surprises (workflow_dispatch only until user approves per-workflow)
- Sub-issue parent closed w/ children still open (block-parent-close workflow)
- Epic in workspace + child in submodule lose discoverability (auto-redirect comment)
- Skills bypass `docs/agents/` (read-order enforced via `domain.md` 4 consumer rules)

## Related rules

- `[[curaos-mcp-stack-rule]]` - GitHub Issues canonical work queue (DA3)
- `[[curaos-swarm-collaboration-rule]]` - task partition by submodule + 5-label state machine
- `[[curaos-agents-md-schema-rule]]` - per-module AGENTS.md frontmatter + split pattern
- `[[curaos-doc-graph-rule]]` - every Markdown is a graph node; `DOC-GRAPH.md` enforcement
- `[[curaos-reuse-dry-rule]]` - one canonical owner per behavior/decision/rule
- `[[curaos-knowledge-persistence-rule]]` - L1 HANDOVER + L2 module docs + L3 ADRs + L4 codegraph + L5 git + L6 cold storage
- `[[curaos-memory-agents-sync-rule]]` - memory ↔ `ai/rules/` sync mandate
- `[[curaos-version-pinning-rule]]` - pin SHA on GH Actions; pin Renovate cadence

## Supersedes / amends

- `AGENTS.md §"Agent skills"` block (workspace root) - extended w/ 6-layer hierarchy + 9 canonical labels + 10 fields + 10 views
- `docs/agents/github-roadmap-project.md` - sync field/view definitions to match this rule (this rule wins on conflict)
- `docs/agents/issue-tracker.md` - extend w/ Initiative/Epic/Story/Task workflow

## Implementation phases

See `ai/curaos/docs/proposals/roadmap-workflow-design.md §10` for full 27-step Phase A-G plan. Phase A (configure GH Issue Types + Project fields/views/automations + secret + label seed) is currently in flight per task #157.
