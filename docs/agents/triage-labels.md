# Triage Labels

5 canonical triage roles mapped to actual GitHub label strings across every `your-org` repo (the workspace + curaos + each `curaos/.gitmodules` submodule - count derived dynamically by the seed loop below, never hardcoded).

| Skill role | Label | Meaning |
|---|---|---|
| `needs-triage` | `needs-triage` | Maintainer evaluates |
| `needs-info` | `needs-info` | Waiting on reporter |
| `ready-for-agent` | `ready-for-agent` | Fully specified, AFK agent ready |
| `ready-for-human` | `ready-for-human` | Human implementation required |
| `wontfix` | `wontfix` | Will not action |

Plus 2 **category** labels (triage skill requires both alongside state labels):

| Label | Color | Meaning |
|---|---|---|
| `bug` | `d73a4a` | Broken |
| `enhancement` | `a2eeef` | New feature/improvement |

Every triaged issue = exactly 1 category + 1 state label. Category labels = GitHub defaults, present on every org repo (do not hardcode the repo count - derive it from `curaos/.gitmodules` + `gh repo list your-org`; `bash scripts/sweep-label-seed` converges any repo missing canonical labels).

Skill mentions role ("apply AFK-ready triage label") → use corresponding label string from table.

## Seeding (idempotent, all repos)

**Status: seeded 2026-05-24.** Canonical set on all org repos. `wontfix` recolored from GitHub default (white) to red `B60205`. Triage skill runs w/o bootstrapping. `blocked` joined the canonical set 2026-06-10 and is known-MISSING on newer repos (e.g. `curaos-deploy`, `curaos-website`, `patient-core-service`, `org-core-service`) until the converger below is applied.

**Canonical set = 9 labels** (5 state + 2 category + 2 marker):

| Label | Color | Kind |
|---|---|---|
| `needs-triage` | `FBCA04` | state |
| `needs-info` | `D93F0B` | state |
| `ready-for-agent` | `0E8A16` | state |
| `ready-for-human` | `1D76DB` | state |
| `wontfix` | `B60205` | state |
| `bug` | `d73a4a` | category (GH default) |
| `enhancement` | `a2eeef` | category (GH default) |
| `foresight` | `C5DEF5` | marker - proactively-captured dependency or future work (see [[curaos-foresight-rule]]). It is not a state label and is never a reason to park work by itself. Relevant, fully specified foresight work may carry `ready-for-agent`; incomplete or blocked foresight carries the normal state plus any real blocker marker. Seeded across all org repos 2026-05-29. |
| `blocked` | `E99695` | marker - unmet real/external prerequisite. Pairs with `needs-triage` while parked; cleared (with `blocked-by` re-check) when the prerequisite closes. |

`blocked` is an orthogonal marker label, never a state label: it always pairs with exactly one state label, real blockers also record `blocked-by` frontmatter + a native dependency edge, and triage/close-path hygiene preserve it (markers are never stripped).

> **WARNING - silent failure on missing label.** `gh issue edit <n> --add-label <state>` returns `failed to update 1 issue` and exits **silently** (no clear "label does not exist" error) when `<state>` is absent in that repo. The triage call looks like it ran; the label never lands. **Always seed the canonical set into a repo before triaging any of its issues.** Newer scaffolded service repos (the M7/M9 core/personal/business trio - e.g. `patient-core-service`, `org-core-service`, `party-core-service`) ship with **GitHub-default labels only** and are the ones that drift; re-run the seed after any new submodule is added.

**Converger: `bash scripts/sweep-label-seed`** (idempotent, the committed seed loop). It enumerates **every non-archived `your-org` repo** live via the REST org listing (count derived dynamically, never hardcoded), diffs each repo's labels against the canonical 9, and:

- **dry-run (default):** prints `would-SEED <repo> - <label>` per missing label; exits **3** when any repo lacks a canonical label (so it gates the milestone-orchestration §11 wave-done predicate), **0** when every repo is clean.
- **`--apply`:** creates exactly the missing labels with the canonical color + description (additive-only; it never deletes, recolors, or edits existing labels). Re-running is a no-op.
- **`--repo OWNER/REPO`:** limit to one repo (e.g. right after a new submodule repo is created).

The script strips the narrow-scope env token (`env -u GITHUB_TOKEN gh`) so `gh` uses the broader keyring auth (see [[curaos-gh-project-sync-env-workaround]]). Run the dry-run before any wave-done claim; run `--apply` whenever it reports drift or a new submodule lands.

Edit the right-hand column of the role table to override per-repo vocabulary if any repo uses different names.

## Close-path label hygiene (the close-path state-machine contract)

A **CLOSED** issue must carry **ZERO workflow-state labels**. Only the **category** labels (`bug` / `enhancement`) and the orthogonal **marker** labels (`foresight` / `blocked`) may persist post-close - they describe what the issue *was*, not its live state.

The state/runtime labels that must NOT survive on a closed issue:
`ready-for-agent` · `needs-triage` · `needs-info` · `ready-for-human` · `agent-PR-open` · `agent-claimed:*`

**Why this is a contract, not a nicety:** when a PR with `Closes #N` merges, GitHub closes issue `#N` but leaves every label intact. Left unstripped, the tracker becomes unreadable - `needs-triage` shows on done issues, `ready-for-agent` on merged ones - and you can no longer tell an issue's real status from its labels.

**Enforcement (two layers):**
- **Per-PR (primary):** the merge legs in `scripts/workflows/pr-verify-merge.workflow.js` and `scripts/workflows/milestone-wave.workflow.js` strip every workflow-state label off the auto-closed linked issue immediately after a confirmed merge (resolving the issue via `gh pr view --json closingIssuesReferences`). This self-heals every merge that goes through the workflows.
- **Org-wide converger (backstop):** `bash scripts/sweep-closed-issue-labels` re-scans every closed issue org-wide and strips stranded state labels idempotently - it catches merges that bypass the workflows (direct `gh pr merge` / UI-merge). Dry-run by default (exit 3 if any stranded label found, so it can gate a wave-done stop-predicate); `--apply` to mutate. Run it before claiming any wave-done.

**Single-state invariant (open issues):** an OPEN issue carries **exactly one** state label at a time. `gh-issue-triage` enforces this on every triage pass (sets the resolved state, removes all other state labels, preserves category + markers) - so re-running triage converges any multi-state or zero-state issue.

## Close-path board-status hygiene (the board-status close-path contract)

A **CLOSED/COMPLETED** issue must show board Status = **`Done`** on the `CuraOS Roadmap` Project. The board Status field is **orthogonal to issue state + labels** - closing an issue (even via a `Closes #N` merge) does NOT touch its Project Status, so a genuinely-done issue can sit at `In Review` / `In Progress` / `Ready` on the board indefinitely.

**Why this is a contract, not a nicety:** M7-S5.3 #114 was CLOSED/COMPLETED on 2026-05-27 but its board Status stayed `In Review` for 5 days - the board read "we never finished it" when it was done, and that drift is what surfaced as the "#114 shows in review, why didn't we finish it before moving to later milestones?" confusion. The board is the milestone-completeness source of truth; a stranded active-status item silently understates how done a milestone is.

**The flip predicate** - a Project item's Status is advanced to `Done` iff: its linked issue is `CLOSED` with `stateReason == COMPLETED` AND its current board Status is one of `Ready` / `In Progress` / `In Review`. Left untouched: `Done` (already correct), `Backlog` / `Blocked` (may hold OPEN foresight/blocked work, or a deliberate not-planned park), any item whose issue is still OPEN, and any item closed `NOT_PLANNED` (board state is a human decision, not an auto-Done).

**Enforcement (two layers, mirroring label hygiene):**
- **Per-PR (primary):** the merge legs in `scripts/workflows/pr-verify-merge.workflow.js` and `scripts/workflows/milestone-wave.workflow.js` flip the auto-closed linked issue's board Status to `Done` immediately after a confirmed merge. Self-heals every merge that goes through the workflows.
- **Org-wide converger (backstop):** `bash scripts/sweep-project-status` re-scans the whole board and advances every CLOSED/COMPLETED item stuck at an active status - catches merges that bypass the workflows (direct `gh pr merge` / UI-merge). Dry-run by default (exit 3 if any stranded item found, so it can gate a wave-done stop-predicate); `--apply` to mutate. Run it before claiming any wave-done.
