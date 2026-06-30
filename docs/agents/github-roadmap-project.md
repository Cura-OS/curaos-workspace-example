# GitHub Roadmap Project

Canonical tracking setup for CuraOS milestone and agent work.

## Standard

Use one organization-level GitHub Project:

- Owner: `your-org`
- Project title: `CuraOS Roadmap`
- Issues stay in their owning repositories.
- Project aggregates issues from `curaos-ai-workspace`, `curaos`, and submodule repos.
- Do not create one project per repo unless a repo later needs a separate execution dashboard.
- GitHub issue records remain canonical; local docs contain generated summaries and operating rules.

## Why

GitHub Projects are cross-repository tables, boards, and roadmaps. GitHub Issues support sub-issues and issue dependencies, so hierarchy and blocking relationships should be native GitHub relationships, not only markdown links.

GitHub's documented model is: issues hold work and metadata, sub-issues create hierarchy, issue dependencies create blocking relationships, and Projects provide custom views over issue metadata and custom fields.

## Repository Roles

| Repo | Issue ownership |
|---|---|
| `your-org/curaos-ai-workspace` | Roadmap, milestone, planning, ADR/doc, cross-repo coordination |
| `your-org/curaos` | Monorepo root, package orchestration, submodule pointers, workspace CI/tooling |
| `your-org/<submodule>` | Per-service/per-app implementation owned by that repo |

## Required Views

Create these project views:

| View | Purpose | Filter/grouping |
|---|---|---|
| Roadmap | Milestone overview | group by `milestone` / title prefix `M<num>` |
| Ready for Agent | AFK-ready queue | label `ready-for-agent` |
| Blocked | Dependency bottlenecks | native dependency status plus `blocked-by` frontmatter |
| In Flight | Active agent work | labels matching `agent-claimed:*` or `agent-PR-open` |
| By Repo | Ownership partition | group by repository |
| By Module | Service/package focus | `module` frontmatter or project field |

GitHub CLI creates Projects, items, and fields. Saved view layout/filter setup is most reliable in the GitHub web UI; keep the table above as canonical and restore UI views to match it if they drift.

## Target Version field (the top planning gate)

The **custom single-select `Target Version` field** (`PVTSSF_lADODhOBDc4BYvCnzhU_YGk`; options `v1`, `v1.1`, `v2`, `Unversioned`) is the release gate ABOVE milestone, per [[curaos-version-planning-rule]] + [ADR-0215](../../ai/curaos/docs/adr/0215-version-gated-planning.md). **v1 = M1-M17** (the GA working set); v1.1 = GA wave 2 (triplet completion); v2+ = EducationStack/ERP deepening + Tier-2 search + net-new. Every Epic/Story (and `foresight` issue) carries a `Target Version`. A version is closeable only when its working-set predicate holds (Epics acceptance-complete + no open close-blocker + coherent working whole + GA E2E green + operator (B) executed-or-re-targeted). Scan + dispatch read the field but are version-blind for PARALLELISM: a v1.1 task in its own submodule runs alongside a v1 task in a different submodule. Work too big for the active version is filed forward against the version it fits, never dropped.

## CuraOS Milestone field (grouping metadata)

The Roadmap groups by the **custom single-select `CuraOS Milestone` field** (18 options `M1..M17` (incl `M1.5`)), NOT GitHub's built-in issue `Milestone` field. CuraOS does not use built-in GitHub milestones for roadmap planning; if one is found on CuraOS tracker work, clear it and keep the custom Project fields as the source of truth. Every Project item SHOULD carry a non-empty `CuraOS Milestone` value when derivable, so milestone views stay useful. An unset value is a roadmap hygiene gap, not a dispatch gate.

`CuraOS Milestone` is now grouping metadata only. All scans target every open issue, and dispatch readiness is gated by issue body, labels, native tree links, dependencies, Project presence, and git working-tree collision. Unset milestone metadata should still be backfilled when derivable because it preserves roadmap views, but it is not a dispatch gate.

This is maintained by these checks:

1. **Per-item metadata thread** - `pm-triage-gate` / `milestone-wave` thread `project_fields` into `gh-project-sync`, which reports `milestone: NONE` for unset or unmapped metadata without blocking readiness.
2. **Board-wide self-heal converger** - `scripts/sweep-roadmap-milestone-fields --apply` derives each unset item's TRUE milestone (title `[Mxx]` -> frontmatter `milestone:` -> first `Mxx-Syy` ref -> bare `Mxx`) and sets the field; it reports only items that need parent-epic judgement. This is the automatic fix for items added by a path that bypasses triage (the auto-add workflow, a manual `gh project item-add`, a raw `gh issue create`, or items seeded before the field existed).
3. **Board-wide read-only hygiene check** - `scripts/check-roadmap-milestone-fields` lists every Project item whose `CuraOS Milestone` is unset and exits 3 if any are found. Treat this as roadmap hygiene evidence, not as proof that issue dispatch must stop.
4. **Frontend parity tracker preflight** - `scripts/check-frontend-parity-tracker-hygiene.js` lists v1 frontend parity rows with built-in GitHub milestones or missing Project `Target Version`; both must be repaired before a frontend parity wave is treated as tracker-clean.

```bash
# self-heal (derive + set), then verify (exit 0 = all set; exit 3 = at least one unset)
bash scripts/sweep-roadmap-milestone-fields --apply
bash scripts/check-roadmap-milestone-fields
node scripts/check-frontend-parity-tracker-hygiene.js
```

Project-add automation is LOCAL-ONLY: `scripts/roadmap-project-item-sync.js` (driven by the `gh-project-sync` workflow and the roadmap sweeps) is the canonical way issues enter the CuraOS Roadmap project. The GitHub Actions workflow `.github/workflows/add-to-roadmap.yml` was deleted 2026-06-10 (RP-65): under the dispatch-only policy it carried no issue payload and could never add an item; do not reintroduce an Actions-side add path while [[curaos-local-ci-first-rule]] holds.

Foresight/backlog items must carry the milestone they will actually be ACTIONED in (their true target), not the milestone they were surfaced from - otherwise a completed wave (M1..M10) looks unfinished. When the true target is genuinely unknown, group under the milestone the issue body most plausibly names; never leave it stamped on a completed milestone.

## Issue Hierarchy

Use native GitHub sub-issues when available:

```text
M2 Shared Library Full Implementation
├── Drizzle/Citus PoC live run
├── @curaos/tenancy M2 implementation
├── @curaos/audit-sdk M2 implementation
├── @curaos/providers M2 implementation
├── @curaos/event-interceptors M2 implementation
├── Publish packages to Verdaccio
└── M2 verification and gate closure
```

If sub-issue API access is unavailable, put child issue URLs under a `Sub-issues` section in the parent issue body and add all items to the org Project. Native relationships can be backfilled later.

## Dependencies

Use native GitHub issue dependencies when available:

- M2 package issues are blocked by the M1.5 issue-seeding gate.
- M3 Auth v0 is blocked by all required M2 package issues.
- Downstream services are blocked by M7 first mold output.

If dependency API access is unavailable, mirror dependencies in issue frontmatter:

```yaml
requires:
  - "your-org/curaos-ai-workspace#<issue>"
blocked-by:
  - "your-org/curaos#<issue>"
```

## Issue Body Contract

The seeded-issue body contract - YAML frontmatter (`module`/`milestone`/`priority`/`effort`/`requires`/`blocked-by`/`agent-notes`) + the `## Scope`/`## Do not touch`/`## Acceptance`/`## Verification`/`## Docs`/`## Blockers` sections + typed `requires` - is defined canonically in [issue-tracker.md](issue-tracker.md). Do not restate it here; this doc owns only the **Project field mapping** + the priority vocabulary below.

**Priority vocabulary** - canonical owner is the GH Project Priority field defined in [[curaos-roadmap-workflow-rule]]: `Critical` / `High` / `Medium` / `Low` (single-select). The field was migrated P0→Critical / P1→High / P2→Medium / P3→Low per `ai/curaos/research/2026-05-25-gh-state-inventory.md`; the old `P0..P3` form is legacy. Write `priority: "Critical"` in frontmatter and `priority=critical` in prose/commands; treat `P0..P3` as Critical/High/Medium/Low when encountered in older issues.

The required body sections (`Scope` / `Do not touch` / `Acceptance` / `Verification` / `Docs` / `Dependencies`) are owned by [issue-tracker.md](issue-tracker.md). One Project-specific addition: include an `Agent routing` section when subagent dispatch is expected (role, task class, recommended effort, routing source; the runtime orchestrator sets the explicit current-harness model before dispatch per [[curaos-model-tiering-rule]]).

## Labels

Label vocabulary (1 category `enhancement`|`bug` + exactly 1 state `needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`) is defined canonically in [triage-labels.md](triage-labels.md). The runtime/swarm labels (`agent-claimed:<id>`, `agent-PR-open`, `failed`) + their lifecycle are below.

Swarm/runtime labels may be added in addition:

- `agent-claimed:<id>`
- `agent-PR-open`
- `failed`

Runtime label lifecycle:

- `ready-for-agent` -> `agent-claimed:<id>` when a worker claims an issue.
- `agent-claimed:<id>` -> `agent-PR-open` when a linked PR opens.
- `agent-PR-open` is removed when the PR merges or closes unmerged.
- Workers heartbeat before every major gate and before/after waits longer than 15 minutes.
- Stale `agent-claimed:<id>` labels are removed by the orchestrator when the worker session is dead, or claim heartbeat is older than 2 hours and no open PR exists.

Typed `requires` values + their resolution semantics are defined canonically in [issue-tracker.md](issue-tracker.md) (`requires` entries must be typed). Use that definition; do not restate it here.

## Drift Prevention

Agents must check these before choosing work:

1. `ai/curaos/docs/HANDOVER.md`
2. `docs/agents/github-roadmap-project.md`
3. `docs/agents/issue-tracker.md`
4. GitHub Project `CuraOS Roadmap`
5. Exact issue body and comments

If local docs and GitHub disagree:

- GitHub issue state wins for work queue state.
- Local ADR/rule docs win for architecture decisions.
- Agent must patch stale local docs or comment on stale GitHub issues before implementation.

For full GitHub/SQLite parity refreshes, use the dual-way checkpoint from [issue-tracker.md](issue-tracker.md): `node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json`. It adds safe missing local issue or Project data to GitHub first, then pulls the GitHub issues, comments, native hierarchy, and Project fields/items into local SQLite. Do not treat a one-way read as full parity unless `--pull-only` was explicitly requested.

## References

- [GitHub Docs: About issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issues)
- [GitHub Docs: Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)
- [GitHub Docs: Customizing project views](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project)
- [GitHub Docs: Quickstart for Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects)

## Setup Commands

Project API requires `project` scope:

```bash
env -u GITHUB_TOKEN gh auth refresh --hostname github.com -s read:project -s project
```

Rate ceiling + the `env -u GITHUB_TOKEN` workaround: prefer
`GH_TOKEN=$(scripts/gh-app-token)` for new call sites. The helper falls back to the
keyring `gh auth token` (same posture as the workaround) until the operator registers
the org GitHub App, then upgrades to the raised installation-token ceiling. Runbook:
[GitHub App installation token](gh-app-token.md).

List/create project:

```bash
gh project list --owner your-org --format json
gh project create --owner your-org --title "CuraOS Roadmap"
```

Add issue to project:

```bash
gh project item-add <project-number> --owner your-org --url <issue-url>
```

Issue creation still uses repo-specific ownership from `docs/agents/issue-tracker.md`.
