# GitHub Roadmap Project schema (generated)

<!-- GENERATED FILE. Do not hand-edit: regenerate with
     `node scripts/generate-project-schema.js --write` (live read-only GraphQL dump;
     needs project-scope keyring auth, i.e. `env -u GITHUB_TOKEN gh`).
     Drift probe: `node scripts/generate-project-schema.js --check` (exit 3 on drift). -->

Live schema dump of the ONE org-level GitHub Project. This doc is the single
vocabulary source for Project FIELD and VIEW names: [[curaos-roadmap-workflow-rule]],
[the orchestration prompt](milestone-orchestration-prompt.md), and the workflow
playbooks link here instead of carrying their own field lists. If this doc and any
prose disagree, regenerate this doc; the live board wins.

## Project identity

| Key | Value |
|---|---|
| Org | `your-org` |
| Title | `CuraOS Roadmap` |
| Number | 2 (informational; resolve by TITLE, never hardcode the number) |
| URL | <https://github.com/orgs/your-org/projects/2> |
| Node ID | `PVT_kwDODhOBDc4BYvCn` |
| Generated | 2026-06-10 |

## Custom fields (14)

| Field | Data type | Options |
|---|---|---|
| `Status` | SINGLE_SELECT | `Backlog` / `Ready` / `In Progress` / `In Review` / `Blocked` / `Done` |
| `Priority` | SINGLE_SELECT | `Critical` / `High` / `Medium` / `Low` |
| `CuraOS Milestone` | SINGLE_SELECT | `M1` / `M1.5` / `M2` / `M3` / `M4` / `M5` / `M6` / `M7` / `M8` / `M9` / `M10` / `M11` / `M12` / `M13` / `M14` / `M15` / `M16` / `M17` |
| `Initiative` | SINGLE_SELECT | `Self-hosted` / `Generic-before-vertical` / `Composable` / `Builder-led` / `Event-led` / `Documented-seams` / `Multi-tenant` / `Tenant-data-isolation` |
| `Cycle` | SINGLE_SELECT | `C1-Foundation` / `C2-Identity-Core` / `C3-Builder-Codegen` / `C4-Workflow-Engine` / `C5-HealthStack-Phase-A` / `C6-Production-Hardening` |
| `Domain` | SINGLE_SELECT | `identity` / `tenancy` / `party` / `org` / `audit` / `settings` / `notify` / `search` / `reports` / `storage` / `calendar` / `tasks` / `documents` / `geospatial` / `fleet` / `commerce` / `sales` / `procurement` / `inventory` / `hr` / `crm` / `accounting` / `esign` / `conversion` / `donation` / `event` / `integrations` / `site` / `workflow` / `builder` / `automation` / `codegen` / `healthstack` / `educationstack` / `erp` / `observability` / `security` / `api-gateway` |
| `Estimate` | NUMBER |  |
| `Epic Link` | TEXT |  |
| `Blocked By` | TEXT |  |
| `Effort` | SINGLE_SELECT | `XS` / `S` / `M` / `L` / `XL` |
| `Issue Kind` | SINGLE_SELECT | `Roadmap` / `Gate` / `Implementation` / `Verification` / `Planning` |
| `Module` | TEXT |  |
| `Requires` | TEXT |  |
| `Target Version` | SINGLE_SELECT | `v1` / `v1.1` / `v2` / `Unversioned` |

Option IDs are intentionally omitted: GitHub regenerates ALL option IDs when a
single-select field is edited (session-30 lesson), so scripts read them at runtime
via `fieldMap()` in `scripts/lib/gh-project.js` (cached at `.cache/project-fields.json`),
never from this doc.

## Built-in fields (12)

| Field | Data type |
|---|---|
| `Title` | TITLE |
| `Assignees` | ASSIGNEES |
| `Labels` | LABELS |
| `Linked pull requests` | LINKED_PULL_REQUESTS |
| `Milestone` | MILESTONE |
| `Repository` | REPOSITORY |
| `Reviewers` | REVIEWERS |
| `Parent issue` | PARENT_ISSUE |
| `Sub-issues progress` | SUB_ISSUES_PROGRESS |
| `Created` | CREATED |
| `Updated` | UPDATED |
| `Closed` | CLOSED |

## Views (10)

| # | View | Layout | Filter |
|---|---|---|---|
| 1 | Roadmap | ROADMAP_LAYOUT | `-status:Done` |
| 2 | Triage Inbox | TABLE_LAYOUT | `label:needs-triage` |
| 3 | Ready-for-Agent | TABLE_LAYOUT | `label:ready-for-agent status:Ready` |
| 4 | Ready-for-Human | TABLE_LAYOUT | `label:ready-for-human status:Ready` |
| 5 | In Flight | BOARD_LAYOUT | `status:"In Progress","In Review","Blocked"` |
| 6 | By Milestone | TABLE_LAYOUT | `-status:Done` |
| 7 | By Domain | BOARD_LAYOUT | (none) |
| 8 | Blocked | TABLE_LAYOUT | `label:blocked` |
| 9 | Done This Cycle | TABLE_LAYOUT | `status:Done` |
| 10 | Epics Roadmap | ROADMAP_LAYOUT | `type:Epic` |

## Consumer contract

- Resolve the project by TITLE (exact match on the open project) via
  `scripts/lib/gh-project.js`; the number above is recorded for humans only.
- Field NAMES above are the only valid `project_fields` keys; a name not in the
  custom-fields table does not exist on the board (writes to it are silently lost).
- `CuraOS Milestone` (custom single-select) is the milestone field; the built-in
  `Milestone` field is repo-milestone plumbing and is never written by CuraOS tooling.
- Single-select values must match an option listed above; unknown options are
  reported as `unmapped` by `reconcileFields()`, not text-written.
