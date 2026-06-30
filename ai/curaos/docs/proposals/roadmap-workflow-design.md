---
name: roadmap-workflow-design
description: Canonical CuraOS roadmap + issue workflow design. Combines Matt Pocock skill flow with GitHub Projects v2 native primitives (sub-issues, Issue Types, custom fields, views, automation). 93-repo org pattern. APPROVED 2026-05-25; canonical rule at ai/rules/curaos_roadmap_workflow_rule.md.
date: 2026-05-25
status: APPROVED 2026-05-25
sources:
  - ai/curaos/research/2026-05-25-github-projects-v2-multi-repo.md
  - ai/curaos/research/2026-05-25-workflow-patterns-industry.md
  - ai/curaos/research/2026-05-25-matt-pocock-skills-flow.md
  - ai/curaos/research/2026-05-25-cross-repo-navigation-patterns.md
  - ai/curaos/research/2026-05-25-local-skills-docs-audit.md
  - ai/curaos/research/2026-05-25-roadmap-workflow-interview.md
---

# CuraOS Roadmap + Issue Workflow Design

**STATUS: APPROVED 2026-05-25.** Canonical rule landed at `ai/rules/curaos_roadmap_workflow_rule.md`. Phase A partially executed; remaining manual user steps in `ai/curaos/docs/agents/REQUIRED-USER-ACTIONS.md`.

This document specifies the full shape, design, and implementation plan for managing 93 repos under the `your-org` org via one org-level GitHub Project, native sub-issues, Issue Types, and the Matt Pocock skill flow. Drift prevention rules + canonical rule file location included.

---

## 1. Hierarchy

```
Initiative          (issue type:Initiative — charter pillar / strategic theme)
  └── Cycle         (Project field — goal-gated; flexible duration; closed when objective hit)
       └── Milestone (existing M1–M15; native GitHub Milestone OR Project Milestone field)
            └── Epic   (issue type:Epic — PRD per feature; lives in curaos-ai-workspace repo)
                 └── Story (issue type:Story — vertical slice; can live in owning submodule repo)
                      └── Task (issue type:Task — atomic AFK/HITL; owning submodule repo)

Bug + Spike attach at any level (typically Story / Task).
```

**Notes:**
- Initiatives, Epics, Cycles = workspace-level concerns → live in `curaos-ai-workspace` repo
- Stories + Tasks = implementation → live in owning submodule repo
- Sub-issue links connect cross-repo (GA April 2025; cross-org GA Sep 2025)
- 8-level nesting native; we use 5 (Initiative→Epic→Story→Task→Sub-task if needed)

---

## 2. Issue Types (org-level, 6 total)

Create in org settings → Code, planning, and automation → Planning → Issue types:

| Type | Description | Body template |
|---|---|---|
| **Initiative** | Charter pillar / multi-cycle strategic theme | `templates/initiative.md` |
| **Epic** | PRD-scoped feature; spans 1+ milestones | `templates/epic.md` (Pocock to-prd output) |
| **Story** | Vertical-slice user story; ≤2 weeks effort | `templates/story.md` |
| **Task** | Atomic AFK or HITL implementation unit | `templates/task.md` (Pocock to-issues output) |
| **Bug** | Defect | `templates/bug.md` (Pocock qa output) |
| **Spike** | Time-boxed research / experiment | `templates/spike.md` |

19 type-slots remain free for future (25 max per org).

---

## 3. Labels (9 total per repo)

### 3.1 Pocock 5 (triage state machine)

| Label | Color | Meaning |
|---|---|---|
| `needs-triage` | `#FBCA04` yellow | Default on creation |
| `needs-info` | `#D93F0B` orange | Waiting on reporter |
| `ready-for-agent` | `#0E8A16` green | AFK-ready; full brief in body |
| `ready-for-human` | `#1D76DB` blue | HITL; same brief + delegation block |
| `wontfix` | `#B60205` red | Rejected (current CuraOS color) |

### 3.2 Execution 4 (lifecycle state, complement Pocock 5)

| Label | Color | Meaning |
|---|---|---|
| `in-progress` | `#5319E7` purple | Agent/dev actively working |
| `in-review` | `#006B75` teal | PR open / awaiting review |
| `blocked` | `#E99695` light-red | Blocked by external dependency |
| `done` | `#0E8A16` green (light) | Merged + verified |

### 3.3 Category 2 (issue nature)

`bug` (red) + `enhancement` (light-blue). Existing in all 93 repos.

**Total: 11 labels × 93 repos = 1023 label rows.** Seeding script `scripts/seed-labels.sh` (extends existing 5-label seed).

---

## 4. Project v2 — `CuraOS Roadmap`

### 4.1 Project metadata

- **Title:** `CuraOS Roadmap`
- **Owner:** `your-org` (org-level)
- **URL:** `https://github.com/orgs/your-org/projects/2`
- **Visibility:** Public (org-public; tweak per security review)
- **Item limit:** Default 1,200 → request increase to 50,000 (Sep 2025 GA)

### 4.2 Custom fields (10 total)

| # | Field | Type | Values |
|---|---|---|---|
| 1 | **Status** | Single-select | `Backlog` / `Ready` / `In Progress` / `In Review` / `Blocked` / `Done` |
| 2 | **Priority** | Single-select | `Critical` / `High` / `Medium` / `Low` |
| 3 | **Milestone** | Single-select | `M1` / `M1.5` / `M2` / `M3` / ... / `M15` |
| 4 | **Cycle** | Single-select | Open cycles (goal-gated; e.g. `C1-Foundation`, `C2-AuthCore`, ...); admin adds/closes as goals shift |
| 5 | **Initiative** | Single-select | `Self-hosted` / `Generic-before-vertical` / `Composable` / `Builder-led` / `Event-led` / `Documented-seams` / `Multi-tenant` / `Tenant-data-isolation` (8 charter pillars from §3 AGENTS.md) |
| 6 | **Domain** | Single-select | ~30 from charter §5.1+5.2: `identity`, `tenancy`, `audit`, `notify`, `search`, `commerce`, `healthstack`, `educationstack`, `erp`, etc. |
| 7 | **Estimate** | Number | Story points (1, 2, 3, 5, 8, 13 Fibonacci) |
| 8 | **Epic Link** | Text | URL of parent Epic (back-up to sub-issue) |
| 9 | **Parent Issue** | Native (auto) | Read-only; auto-populated by sub-issue link |
| 10 | **Blocked-By** | Text | Comma-separated URLs of blockers |

**Note on Cycle:** Goal-gated per user Q5 — NOT a time-bound iteration. Add new cycle option when initiative goal needs a coordination unit; close + archive when goal reached. Cycle naming convention: `C<seq>-<short-goal-slug>` (e.g. `C1-Foundation`, `C2-Identity-Audit-Foundation`, `C3-HealthStack-Phase-A`).

### 4.3 Views (10 total)

| # | View | Layout | Filter | Group by | Sort | Purpose |
|---|---|---|---|---|---|---|
| 1 | **Roadmap** | Roadmap | `-status:Done` | Milestone | Cycle asc | Top-level timeline; markers per milestone |
| 2 | **Triage Inbox** | Table | `label:needs-triage` | Repo | Created asc | Pocock triage skill workqueue |
| 3 | **Ready-for-Agent** | Table | `label:ready-for-agent status:Ready` | Domain | Priority desc + Created asc | AFK agent pickup queue |
| 4 | **Ready-for-Human** | Table | `label:ready-for-human status:Ready` | Domain | Priority desc | HITL queue for maintainers |
| 5 | **In Flight** | Board | `status:"In Progress","In Review","Blocked"` | Status (columns) + Assignee (swimlanes) | — | Active work board |
| 6 | **By Milestone** | Table | `-status:Done` | Milestone | Priority desc | Per-milestone burn-down view |
| 7 | **By Domain/Repo** | Board | (none) | Domain (columns) | — | Service-team drill-down |
| 8 | **Blocked** | Table | `label:blocked OR status:Blocked` | Domain | Updated asc | Stuck-work surface |
| 9 | **Done This Cycle** | Table | `status:Done cycle:<current>` | Milestone | Closed desc | Cycle review |
| 10 | **Epics Roadmap** | Roadmap | `type:Epic` | Initiative | Milestone asc | Charter-pillar timeline |

### 4.4 Built-in workflow automations

Enable via Project → Workflows:

| Trigger | Action | Notes |
|---|---|---|
| Item added | Set Status = `Backlog` | All new items start here |
| Issue closed | Set Status = `Done` + label `done` | |
| Issue reopened | Set Status = `In Progress` + remove `done` | |
| PR linked + opened | Set Status = `In Review` + label `in-review` | |
| PR merged | Set Status = `Done` + label `done` | |
| PR closed unmerged | Set Status = `Backlog` + remove `in-review` | |
| Auto-archive | Done items > 30d → archive | Keeps Project clean |

---

## 5. Cross-repo automation (GitHub Actions)

### 5.1 Org `.github` repo — reusable add-to-project workflow

`your-org/.github/.github/workflows/add-to-project.yml`:

```yaml
on:
  workflow_call:
    inputs:
      project-url:
        required: true
        type: string

jobs:
  add:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/add-to-project@v1.0.2  # pin per curaos-version-pinning-rule
        with:
          project-url: ${{ inputs.project-url }}
          github-token: ${{ secrets.ADD_TO_PROJECT_PAT }}
          labeled: needs-triage,ready-for-agent,ready-for-human,needs-info,wontfix
          label-operator: OR  # any one label triggers add
```

### 5.2 Caller workflow — per submodule repo

`<each-of-93-repos>/.github/workflows/add-to-roadmap.yml`:

```yaml
name: Add to CuraOS Roadmap
on:
  workflow_dispatch: {}  # MANUAL TRIGGER ONLY per user directive — no auto triggers for now
  # Future when auto-triggers approved by user:
  # issues:
  #   types: [opened, labeled]
  # pull_request:
  #   types: [opened]

jobs:
  add:
    uses: your-org/.github/.github/workflows/add-to-project.yml@main
    with:
      project-url: https://github.com/orgs/your-org/projects/2
    secrets: inherit
```

**Per user M1 directive: ALL CI workflows are `workflow_dispatch` only.** No auto triggers. Auto-triggers re-enabled only on explicit user approval per-workflow.

### 5.3 Block-parent-close workflow (Q6)

`your-org/.github/.github/workflows/block-parent-close.yml`:

```yaml
on:
  workflow_call:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check open sub-issues
        uses: actions/github-script@v7
        with:
          script: |
            const result = await github.graphql(`
              query($owner:String!,$repo:String!,$num:Int!){
                repository(owner:$owner,name:$repo){
                  issue(number:$num){
                    subIssues(first:100){nodes{state}}
                  }
                }
              }`, {
                owner: context.repo.owner,
                repo: context.repo.repo,
                num: context.issue.number
              }, { headers: { 'GraphQL-Features': 'sub_issues' } });
            const open = result.repository.issue.subIssues.nodes.filter(n => n.state === 'OPEN');
            if (open.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: `Cannot close: ${open.length} open sub-issue(s) remain. Close them first.`
              });
              await github.rest.issues.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                state: 'open'
              });
              core.setFailed('Parent has open children');
            }
```

Manual trigger only (`workflow_dispatch`) per user directive; user can re-arm `on: issues: types: [closed]` later.

### 5.4 Auto-redirect comment (Q4) — Epic in workspace → child in submodule

When a sub-issue is added to an Epic in `curaos-ai-workspace`, post a redirect comment in the submodule child:

`your-org/.github/.github/workflows/sub-issue-redirect.yml`:

```yaml
on:
  workflow_call:
    inputs:
      parent-issue-url:
        required: true
        type: string

jobs:
  redirect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `**Parent Epic:** ${{ inputs.parent-issue-url }}\n\nFull PRD context lives in the workspace Epic. This sub-issue is the implementation slice.`
            });
```

Triggered manually until user approves auto-trigger on `sub_issue.added` event.

### 5.5 Required secrets

- **`ADD_TO_PROJECT_PAT`** (org-level secret) — classic PAT w/ `project` + `repo` scopes. Owned by org admin. Rotate every 90 days per security policy.

---

## 6. Skill flow integration

```
USER REQUEST
    ↓
┌──────────────────────────────────────────────────────────────┐
│  grill-me (productivity)  ← if plan unresolved                │
│    → resolved plan in context                                  │
│                                                                │
│  grill-with-docs (engineering) ← refine vs CONTEXT + ADRs      │
│    → updated CONTEXT.md + new ADR stubs                        │
│                                                                │
│  to-prd (engineering)                                          │
│    INPUT: resolved context                                     │
│    OUTPUT: 1 Epic issue in curaos-ai-workspace                 │
│            type:Epic, label:needs-triage                       │
│            template: Problem / Scope / Module map /            │
│                      Deep modules / Acceptance / Open Qs       │
│                                                                │
│  triage (engineering) ← maintainer reviews PRD                 │
│    Epic → label changes needs-triage → ready-for-agent         │
│    (or ready-for-human if HITL design call)                    │
│                                                                │
│  to-issues (engineering)                                       │
│    INPUT: Epic issue URL                                       │
│    OUTPUT: N Story sub-issues (vertical slices)                │
│            cross-repo: sub-issue in owning submodule repo      │
│            type:Story, label:ready-for-agent OR ready-for-human│
│            sub-issue link to parent Epic                       │
│            auto-redirect comment posted in child               │
│                                                                │
│  [AGENT picks up Story]                                        │
│    skim docs/agents/ + module CONTEXT.md + Epic body           │
│                                                                │
│  tdd (engineering)                                             │
│    Red-green-refactor per Story                                │
│    Status: Ready → In Progress (label applied)                 │
│    Open PR → Status: In Review (auto via workflow when armed)  │
│    Merge PR → Status: Done (auto)                              │
│                                                                │
│  qa (engineering) ← on bug reports                             │
│    New Bug issues file via tracker                             │
│    → re-enter triage                                           │
│                                                                │
│  diagnose (engineering) ← on hard bugs                         │
│    6-phase loop: reproduce/minimize/hypothesize/instrument/    │
│                  fix/regression-test                           │
│                                                                │
│  improve-codebase-architecture (engineering) ← periodic        │
│    Output: RFC Epic issues → re-enter to-issues                │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. File layout — where things live

### 7.1 Canonical rule

**`ai/rules/curaos_roadmap_workflow_rule.md`** — cross-CLI binding rule per `ai/rules/` policy. Indexed in `ai/rules/README.md` + `AGENTS.md §15`.

### 7.2 Docs (decisions + design)

> **Post-approval note:** Skill-config docs (`issue-tracker.md` / `triage-labels.md` / `domain.md` / `github-roadmap-project.md`) live under the **workspace-root `docs/agents/`** (i.e. `/Users/dev/workspace/curaos-workspace/docs/agents/`), NOT under `ai/curaos/docs/agents/`. The tree below shows the design-time intent; readers should look in workspace-root `docs/agents/` for these files.

```
ai/curaos/docs/
├── agents/                          # Pocock skill config (existing)
│   ├── issue-tracker.md             # WHERE: workspace/93-repo selection rules + frontmatter contract
│   ├── triage-labels.md             # 5+4+2 = 11 labels canonical
│   ├── domain.md                    # CONTEXT.md path + ADR path + 4 consumer rules
│   └── github-roadmap-project.md    # Project shape + views + custom fields
├── proposals/                       # NEW dir — design proposals awaiting approval
│   └── roadmap-workflow-design.md   # THIS FILE
├── adr/                             # ADRs (existing 55 files)
└── HANDOVER.md                      # L1 session state (existing)
```

### 7.3 GitHub state (execution)

```
github.com/your-org/
├── .github/                                       # ORG-LEVEL REUSABLE WORKFLOWS
│   └── .github/workflows/
│       ├── add-to-project.yml                     # Q11 Tier 1
│       ├── block-parent-close.yml                 # Q6 + Q11 Tier 2
│       └── sub-issue-redirect.yml                 # Q4 redirect comment
│
├── curaos-ai-workspace/                           # WORKSPACE HUB REPO
│   └── issues/                                    # Initiatives + Epics live here
│       └── (M1–M15 milestone parents + PRD Epics)
│
├── curaos/                                        # MAIN PRODUCT REPO
│   └── issues/                                    # Existing M2 #18–#24 sub-issues
│
└── <91 submodule repos>/                          # SERVICE-LEVEL REPOS
    ├── .github/workflows/add-to-roadmap.yml       # Caller workflow (workflow_dispatch only)
    └── issues/                                    # Story + Task atomic slices
```

---

## 8. Drift prevention — single source of truth split

Per Q12:

| State | Source of Truth | Pocock skill | Writes? |
|---|---|---|---|
| **Design decisions** (ADRs) | `ai/curaos/docs/adr/` | `grill-with-docs` | Yes |
| **Domain glossary** | `ai/curaos/<module>/CONTEXT.md` | `grill-with-docs` | Yes |
| **Specs/PRDs** | GitHub Issue body (`type:Epic`) | `to-prd` | Yes (creates issue) |
| **Atomic work units** | GitHub Issue body (`type:Story/Task`) | `to-issues` | Yes (creates issues) |
| **Execution state** | Project Status field + labels | Project Workflows + workflows | Yes (auto on events) |
| **Triage state** | Pocock 5 labels on issue | `triage` | Yes |
| **Roadmap timeline** | Project Roadmap view | n/a (read-only render) | No |

**Hard rules:**
- `to-prd` / `to-issues` / `triage` / `qa` skills NEVER write to `ai/curaos/docs/`. They write GH only.
- `grill-with-docs` / `improve-codebase-architecture` NEVER create GH issues directly. They write docs only. Resulting Epic issues created by `to-prd` as separate step.
- Project Status is canonical for execution; labels mirror Status (kept in sync by workflows).

---

## 9. Drill-down navigation — high-level → granular

```
1. Roadmap view (Project)
   └── Click milestone marker
2. By Milestone view
   └── Click Epic row
3. Epic issue (type:Epic, in curaos-ai-workspace)
   └── Sub-issues panel (up to 100, cross-repo within org)
4. Story issue (type:Story, in submodule repo)
   └── Sub-issues panel
5. Task issue (type:Task, in submodule repo)
   └── Development section → linked PR
6. PR → commits → file diff
```

CLI equivalent (for agents):

```bash
# 1. List all Initiatives
gh search issues --owner your-org \
  --include-prs=false "type:Initiative is:open" \
  --json number,title,repository,url

# 2. Walk Epic → Story → Task tree
gh api graphql -H "GraphQL-Features: sub_issues" -f query='
  query($num:Int!){
    repository(owner:"your-org",name:"curaos-ai-workspace"){
      issue(number:$num){
        title
        subIssues(first:100){
          nodes{ number title state repository{name} }
        }
      }
    }
  }' -F num=<epic-number>

# 3. Pick next ready-for-agent task in current cycle
gh search issues --owner your-org \
  --label "ready-for-agent" --state open \
  --json number,title,url,repository \
  --jq '.[] | select(.repository.name != "curaos-ai-workspace")'
```

---

## 10. Implementation plan (post-approval)

### Phase A — Configure GitHub (no code; org admin actions)

1. **Org Issue Types:** create `Initiative`, `Epic`, `Story`, `Task`, `Bug`, `Spike` (org settings UI; one-time)
2. **Project custom fields:** add 10 fields per §4.2 (`gh project field-create` × 10)
3. **Project views:** create 10 views per §4.3 (gh CLI or UI)
4. **Project built-in workflows:** enable 7 automations per §4.4 (UI)
5. **Org secret:** create `ADD_TO_PROJECT_PAT` (classic PAT, `project` + `repo` scopes)
6. **Seed 9 labels per repo:** extend `scripts/seed-labels.sh` from 5→11; run across 93 repos

### Phase B — Org-level reusable workflows (Tier 1+2)

7. Create `your-org/.github` repo if missing
8. Write 3 reusable workflows (`add-to-project.yml`, `block-parent-close.yml`, `sub-issue-redirect.yml`) — all callable, no triggers
9. Per-repo caller workflow `add-to-roadmap.yml` (workflow_dispatch only); deploy via bulk script across 93 repos

### Phase C — Skill alignment

10. Update existing `docs/agents/issue-tracker.md` — add Epic/Story/Task hierarchy + cross-repo sub-issue convention
11. Update existing `docs/agents/triage-labels.md` — add 4 execution labels (in-progress/in-review/blocked/done)
12. Update existing `docs/agents/github-roadmap-project.md` — sync field/view definitions

### Phase D — Issue type templates

14. Create 6 issue templates in `.github/ISSUE_TEMPLATE/` of `curaos-ai-workspace` (Initiative, Epic, Story, Task, Bug, Spike)
15. Mirror Story/Task/Bug/Spike templates to `curaos/.github/ISSUE_TEMPLATE/` + provide via `gh repo set` to 91 submodule repos

### Phase E — Canonical rule + index

16. Write `ai/rules/curaos_roadmap_workflow_rule.md`
17. Index in `ai/rules/README.md` + `AGENTS.md §15` table
18. Refresh `ai/curaos/docs/HANDOVER.md` to point at new rule

### Phase F — Seed M3-M15 PRDs

19. Run Pocock `to-prd` per milestone M3-M15 — synthesise PRD from existing context (HANDOVER + ADRs + delivery-roadmap.md) → 13 new Epic issues in `curaos-ai-workspace`
20. Run Pocock `to-issues` per Epic — break to vertical-slice Stories/Tasks in owning submodule repos
21. Apply labels + custom fields per generated issues
22. Verify Project views populate correctly

### Phase G — Verify + commit

23. Verify all 93 repos have 11 labels + workflow_dispatch caller workflow
24. Verify Project has 10 fields + 10 views + 7 automations
25. Verify M3-M15 Epics + sub-issues visible in Roadmap view
26. Commit all docs changes (workspace + curaos submodule)
27. Update HANDOVER

---

## 11. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Label sprawl (11/repo × 93 repos = 1023 rows) | Centralized seed script; `triage-labels.md` is single source of truth |
| Cross-repo sub-issue auth | `ADD_TO_PROJECT_PAT` w/ org-scope; rotate quarterly |
| Project item limit (1.2k default) | Request 50k limit (GA Sep 2025); auto-archive Done items > 30d |
| GraphQL `sub_issues` header forgotten | All examples include header; document in `docs/agents/issue-tracker.md` |
| User decision drift (cycle goals change) | Cycle field is single-select; admin updates as initiative goals shift |
| Skills bypass docs/agents/ | Domain consumer rules in `domain.md` enforce CONTEXT/ADR read before action |
| Legacy `curaos` issues (#11-#17 + phase-0 labels) pollute Project | Migrate to new labels OR filter via `-label:phase-0` in Project views |

---

## 12. What this does NOT do (out of scope)

- Linear Agent-style LLM triage (Tier 3; user picked Tier 1+2)
- Slack/Discord notifications (Tier 3)
- Weekly digest job (Tier 3)
- External dashboard (Grafana/Metabase CFD; GH native Insights covers burn-up only)
- Triage Party (Kubernetes pattern) — could be added later if needed
- Backstage catalog (`catalog-info.yaml`) — could be added later if needed
- Per-repo Projects (user chose Org-only)
- 6-week Shape Up cycles (user chose goal-gated flexible cycles)

---

## 13. Approval gate

User reviews this proposal. Three response patterns:

1. **APPROVE** → proceed to canonical rule write + Phase A-G execution
2. **EDIT** → user marks specific sections; revise + re-present
3. **REJECT** → archive proposal; restart from interview phase

After approval, this proposal moves to `ai/curaos/docs/decisions/` (or appended to relevant ADR) as historical record, AND canonical rule at `ai/rules/curaos_roadmap_workflow_rule.md` becomes the live binding source.

---

*End of design. Awaiting user decision.*
