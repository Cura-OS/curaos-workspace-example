# Symphony Adoption Goals and Local Progress Ledger

Status: closed and published through SAA-16; GitHub issue/project parity mirrored locally through SAA-18; dual-way sync docs audited through SAA-19; one-task worker prompt aligned through SAA-20
Started: 2026-06-27
GitHub sync mode: explicit checkpoints only; once a checkpoint exists, tracker parity sync is dual-way by default. Latest publish SAA-16 pushed `446532c8` in the root workspace and `bc38b97` in `curaos`; latest requested mirror SAA-18 imported GitHub issue/project parity into local SQLite
Primary plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Governing rule: [../../ai/rules/curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)
Research: [../../ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md](../../ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md)

## Tracking policy

This file is the local-first issue tracker for Symphony adoption. Use it before creating or updating GitHub issues.

Rules:

1. Update this file after every meaningful local phase.
2. Do not use GitHub for routine checklists, heartbeat, reflection, or exploratory status.
3. Sync to GitHub only when a PR is opened, a commit needs review, a durable shared issue is required, or the user explicitly asks for a roadmap/project sync. At that checkpoint, try to add safe missing data to either source before reporting parity.
4. Before any GitHub sync, write the intended sync in `Sync queue` below.
5. After sync, record the exact PR, issue, or commit handle and the local command evidence.
6. If a decision has a clear recommendation, auto-apply it per [[curaos-recommendation-auto-apply-rule]] and record the choice here or in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` if it becomes cross-cutting.
7. If a blocker is a true credential, permission, destructive operation, or T3 gate, stop and surface it. Do not park it silently.

## Success definition

Symphony adoption is complete when all of these are true:

- Every public CuraOS agent workflow has a Symphony concept mapping or an explicit not-applicable reason.
- Claude, Agent Workflow Kit, Hermes, Codex, and generic CLI agents can follow the same playbook contract through their own runner path.
- Hermes has a local skill that teaches native execution of CuraOS Symphony-aligned workflows without Agent Workflow Kit or Claude Workflow.
- Local-first workpads capture plan, acceptance, validation, evidence, reflection, and sync status.
- Local issues persist in `.scratch/state/symphony-work/local-issues.sqlite` with tested schema migration, parent hierarchy, CRUD, event, reflection, evidence, and sync outbox behavior.
- Every task, subtask, blocker, follow-up, and verification lane links to a main issue through `parent_id` unless it is its own main issue.
- Harnesses ask before starting broad ready-open-issues or unblock-prep waves, then run the approved Symphony workflow to a verified stop state.
- Wave and issue orchestration goal text lets each harness use its best verified tools, including Claude native Workflow, Agent Workflow Kit, Hermes native tools, Codex adapters, or generic playbook execution, while preserving the same gates and local issue evidence.
- Every workflow and Symphony-alignment script/code change follows TDD with recorded red, green, and refactor evidence.
- Tracked and untracked workflow markdown plus scripts are audited for Symphony tracker policy and no-em-dash source hygiene.
- GitHub API usage is minimized through local ledgers, cached snapshots, REST-first reads, diff-first writes, explicit sync checkpoints, and dual-way parity when a checkpoint is requested.
- Workflow sync, rule index, doc graph, docs checks, local CI where applicable, and no-em-dash checks are green.
- Upstream Symphony example behavior that conflicts with CuraOS policy is rejected or adapter-scoped.

## Progress board

| ID | Goal | Status | Owner path | Verification |
|---|---|---|---|---|
| SAA-00 | Research Symphony spec, example, Codex app-server, and harness engineering sources | Done | `ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md` | Source URLs recorded with accessed date. |
| SAA-01 | Add binding CuraOS Symphony alignment rule | Done | `ai/rules/curaos_symphony_alignment_rule.md` | `node scripts/generate-rule-index.js` passed. |
| SAA-02 | Create full implementation plan | Done | `docs/agents/SYMPHONY-ALIGNMENT-PLAN.md` | `bash scripts/check-docs.sh` passed. |
| SAA-03 | Create this local-first progress ledger | Done | `docs/agents/SYMPHONY-ADOPTION-GOALS.md` | `bash scripts/check-docs.sh` passed. |
| SAA-04 | Link plan and ledger from workflow docs and docs index | Done | `docs/agents/workflows.md`, `docs/agents/workflows/README.md`, `ai/curaos/docs/README.md` | Doc graph passed. |
| SAA-05 | Add Hermes native skill for Symphony-aligned workflow execution | Done | active Hermes default profile skill | `skill_view` loaded `symphony-orchestration-alignment`. |
| SAA-06 | Add Symphony conformance checker for playbooks | Done | `scripts/check-symphony-conformance.js`, `scripts/lib/symphony-conformance.js` | `node scripts/check-symphony-conformance.js` passes with 20 checked, 0 problems. |
| SAA-07 | Add local SQLite issue database and helper | Done | `.scratch/state/symphony-work/local-issues.sqlite`, `scripts/lib/local-issues-db.js`, `scripts/local-issues.js` | Focused local issue DB tests pass and prove zero GitHub calls. |
| SAA-08 | Update reusable workflow playbooks with mapping or generated matrix | Done | `docs/agents/workflows/*.md` | `node scripts/check-workflow-sync.js` and `node scripts/check-symphony-conformance.js` pass. |
| SAA-09 | Verify all harness paths | Done | docs and skills | Claude, Agent Workflow Kit, Hermes, Codex adapter, and generic playbook paths are encoded in every public workflow mapping. |
| SAA-10 | GitHub sync checkpoint | Done, no sync queued | GitHub PR only after explicit sync request | Sync outbox empty; no PR opened in this local-only run. |
| SAA-11 | Enforce TDD for workflow and Symphony-alignment code | Done | `scripts/lib/*`, `scripts/check-*.js`, `scripts/local-issues.js`, playbooks | Red, green, refactor evidence recorded in local SQLite issues. |
| SAA-12 | Audit persistent workflow source | Done | `scripts/check-symphony-source-audit.js`, `scripts/lib/symphony-source-audit.js`, `curaos/backend/services/workflow-core-service/src/temporal/patient-admission.workflow.ts` | Initial source audit passed after removing Unicode dashes from patient admission workflow comments. |
| SAA-13 | Expand source audit to tracked and untracked markdown plus scripts | Done | `scripts/check-symphony-source-audit.js`, `scripts/lib/symphony-source-audit.js`, `scripts/workflows/*.workflow.js`, `scripts/*.js`, `scripts/lib/*.js` | Source audit uses `git ls-files --cached --others --exclude-standard` across nested repos and checks 340 files. |
| SAA-14 | Add mandatory AGENTS Symphony guidance and local issue hierarchy | Done | `AGENTS.md`, `ai/rules/curaos_symphony_alignment_rule.md`, `scripts/lib/local-issues-db.js`, `scripts/local-issues.js` | Harnesses must select Symphony workflows, track every work item locally, attach child issues to a main issue, and ask before broad ready/unblock waves. |
| SAA-15 | Close Symphony alignment part | Done | `docs/agents/SYMPHONY-ADOPTION-GOALS.md`, `docs/agents/SYMPHONY-ALIGNMENT-PLAN.md`, `.scratch/state/symphony-work/local-issues.sqlite` | Final closeout checks pass; SAA-MAIN is closed with SAA-15 linked through `parent_id`. |
| SAA-16 | Publish Symphony alignment commits | Done | root workspace, `curaos`, nested submodules | Root, `curaos`, and 21 nested submodule commits pushed; recursive clean/upstream parity check passed. |
| SAA-17 | Refresh wave and issue orchestration goal docs for harness-native tooling | Done locally | `docs/agents/SYMPHONY-ADOPTION-GOALS.md`, `docs/agents/milestone-orchestration-prompt.md`, `docs/agents/WORKFLOW-STATUS.md`, `docs/agents/workflows/milestone-wave.md`, `docs/agents/workflows/pm-triage-gate.md`, `docs/agents/workflows/gh-issue-triage.md` | Goal text now selects the active harness's strongest orchestration path and records wave/issue work in local child issues; workflow status table covers all 48 executors. |
| SAA-18 | Sync GitHub issues and Project data into local SQLite parity mirror | Done locally | `scripts/github-sqlite-sync.js`, `scripts/lib/github-sqlite-sync.js`, `.scratch/state/symphony-work/local-issues.sqlite` | Local SQLite now mirrors 127 org repos, 815 GitHub issues, 1666 issue comments, 1 Project, 26 Project fields, and 681 Project items; live count verification matched SQLite with zero mismatches. |
| SAA-19 | Audit docs/rules for dual-way sync reflection and publish all changes | Done locally, publish checkpoint active | `ai/rules/curaos_symphony_alignment_rule.md`, `docs/agents/local-first-workpad.md`, `docs/agents/issue-tracker.md`, `docs/agents/github-roadmap-project.md`, workflow docs | Canonical tracker docs describe the dual-way default; final validation is green and exact push evidence is recorded in local SQLite after publish. |
| SAA-20 | Align one-task worker prompt with harness-native local SQLite wording | Done locally, publish checkpoint active | `docs/agents/one-task-execution-prompt.md` | Worker prompt names strongest current-harness execution and local SQLite evidence rows; validation is green and exact push evidence is recorded in local SQLite after publish. |

## Local work items

### SAA-01: Rule

Acceptance:

- [x] Rule file exists.
- [x] Rule front matter has name, title, and description.
- [x] Rule index regeneration updates `ai/rules/README.md` and `AGENTS.md`.
- [x] No em dash or en dash in rule title, description, or body.

Reflection:

- Upstream Symphony is useful as a standards model, but CuraOS must keep GitHub, local CI, and multi-harness execution as first-class constraints.

### SAA-02: Plan

Acceptance:

- [x] Plan describes target architecture, phases, risks, and validation.
- [x] Plan names exact file owners and future scripts.
- [x] Plan keeps implementation local-first before GitHub sync.

Reflection:

- The first safe step is substrate and conformance design. Bulk workflow edits should wait until the conformance checker exists.

### SAA-03: Local tracker

Acceptance:

- [x] This ledger has goals, status, acceptance, reflection, and sync queue.
- [x] It is linked from workflow docs so future agents find it.
- [x] It does not require GitHub reads to continue local work.

Reflection:

- A local ledger reduces GitHub quota usage and survives session compaction better than chat history.

### SAA-04: Discovery links

Acceptance:

- [x] `docs/agents/workflows.md` links to the plan and ledger.
- [x] `docs/agents/workflows/README.md` mentions Symphony alignment and Hermes native execution.
- [x] `ai/curaos/docs/README.md` links the research note.
- [x] Doc graph is refreshed.

Reflection:

- Link-only edits keep policy centralized and avoid copying full rule text.

### SAA-05: Hermes skill

Acceptance:

- [x] Skill exists in the active Hermes default profile.
- [x] Skill tells Hermes to read the project plan, goal ledger, and playbook.
- [x] Skill maps generic workflow phases to Hermes native tools.
- [x] Skill forbids assuming Claude Workflow or Agent Workflow Kit exists.

Reflection:

- Hermes is the proof case for harness-neutral adoption because it has its own orchestration and tool layer.

### SAA-06: Symphony conformance checker

Acceptance:

- [x] Failing tests existed before implementation for missing mapping, invalid runner, missing local issue DB, missing TDD evidence, and no GitHub call behavior.
- [x] `scripts/lib/symphony-conformance.js` parses public playbook frontmatter and validates the required `symphony:` fields.
- [x] `scripts/check-symphony-conformance.js` reports human-readable and JSON output.
- [x] The checker performs zero GitHub calls and fails closed on malformed mapping.

Reflection:

- The checker is intentionally local and narrow. It complements workflow sync instead of replacing contract equality.

### SAA-07: Local SQLite issue database

Acceptance:

- [x] SQLite schema is documented in `docs/agents/local-first-workpad.md`.
- [x] Failing tests were run for schema migration, local issue CRUD, event append, reflection append, evidence refs, and sync outbox idempotency before implementation.
- [x] `scripts/lib/local-issues-db.js` creates and migrates `.scratch/state/symphony-work/local-issues.sqlite` without GitHub calls.
- [x] `scripts/local-issues.js` supports local create, update, list, reflect, evidence, sync-queue, and markdown export commands.
- [x] A markdown export keeps durable human progress visible at `.scratch/state/symphony-work/local-issues-summary.md` for this local run.

Reflection:

- Local SQLite is now the machine issue store. Markdown remains the human summary and GitHub remains explicit-sync only.

### SAA-08: Reusable workflow playbook mapping

Acceptance:

- [x] All 20 public reusable playbooks under `docs/agents/workflows/` carry `symphony:` frontmatter.
- [x] Mapping includes tracker adapter, trigger mode, workspace owner, runner adapters, local SQLite issue DB, GitHub sync policy, validation, and TDD evidence fields.
- [x] `node scripts/check-symphony-conformance.js` passes.
- [x] `node scripts/check-workflow-sync.js` still passes after frontmatter changes.

Reflection:

- A concise frontmatter map avoids copying long prose into every playbook while giving agents and CI a machine-checkable contract.

### SAA-09: Harness paths

Acceptance:

- [x] Claude native Workflow remains documented.
- [x] Agent Workflow Kit `workflow-run` remains documented.
- [x] Hermes native guide and skill remain the fallback for harnesses without Claude Workflow or Agent Workflow Kit.
- [x] Codex app-server remains adapter-scoped and is not required for generic workflows.
- [x] Generic playbook execution is represented in every public workflow mapping.

Reflection:

- Harness-specific runtime mechanics stay adapters. The playbook contract and local evidence gates are shared.

### SAA-10: GitHub sync checkpoint

Acceptance:

- [x] No GitHub sync was performed for routine local progress.
- [x] Local SQLite `sync_outbox` is empty.
- [x] PR creation remains available only as an explicit sync checkpoint after local proof.
- [x] This local closeout did not queue or perform GitHub sync because the user asked to close the local alignment part, not to publish it.

Reflection:

- No PR was opened because this run was local implementation and verification. A PR can be queued later without replaying local progress from chat or changing the local closed status.

### SAA-11: TDD enforcement for workflow code

Acceptance:

- [x] Every new or changed workflow helper, checker, CLI, or docs-gate behavior started with a failing focused test.
- [x] The failing test output is recorded in local SQLite issues as red events and evidence refs.
- [x] The passing focused test output is recorded after the implementation.
- [x] Refactor happened only after green, with focused tests still passing.
- [x] Final evidence includes relevant focused tests, `node scripts/check-workflow-sync.js`, docs checks, and `node scripts/check-symphony-conformance.js`.

Reflection:

- TDD is enforced by tests plus local SQLite evidence, not prose. The final gate re-runs after ledger edits.

### SAA-12: Persistent workflow source audit

Acceptance:

- [x] Failing focused tests existed before implementation for workflow `.mjs` discovery, `.workflow.ts` discovery, generated sandbox skips, no-em-dash source hygiene, and Linear tracker policy rejection.
- [x] `scripts/lib/symphony-source-audit.js` discovers persistent workflow-related `.mjs` and `.workflow.ts` source while skipping `.worktrees`, `.stryker-tmp`, `dist`, `node_modules`, and scratch paths.
- [x] `scripts/check-symphony-source-audit.js` runs locally with no GitHub calls and is wired into `scripts/check-docs.sh`.
- [x] The audit found and fixed `curaos/backend/services/workflow-core-service/src/temporal/patient-admission.workflow.ts` comments that still used Unicode dash characters.
- [x] Focused Temporal patient admission workflow tests still pass after the source hygiene fix.
- [x] Local issue CLI stdout pipe closure regression is covered so large evidence reads do not crash with EPIPE.

Reflection:

- The active source issue was source hygiene, not product Temporal semantics. Stale `.worktrees` and Stryker sandboxes are excluded because they are generated or lane-local artifacts, not the canonical workspace source of truth. The evidence readback also exposed an EPIPE bug in the local issue CLI, so that path now has regression coverage.

### SAA-13: Tracked and untracked workspace source audit

Acceptance:

- [x] Failing focused tests prove discovery includes tracked and untracked files from both the root repo and nested Git repos.
- [x] Failing focused tests prove tracked markdown and untracked workflow scripts are both audited.
- [x] `scripts/check-symphony-source-audit.js` uses `git ls-files --cached --others --exclude-standard` so Codex, Hermes, and generic harnesses see uncommitted workspace files before PR sync.
- [x] The expanded audit found and fixed Unicode dash characters in root workflow scripts and reusable workflow executors.
- [x] The expanded audit excludes generated sandboxes and lane-local worktrees, including `.claude/worktrees`, so stale lanes do not block the canonical workspace gate.

Reflection:

- The first source audit was too narrow because it walked files by extension and missed the Git index plus untracked workspace surface. The corrected gate treats local filesystem truth as first class and covers markdown plus scripts before GitHub sync.

### SAA-14: Mandatory AGENTS guidance and hierarchy tracking

Acceptance:

- [x] Workspace `AGENTS.md` tells every harness to choose the matching Symphony-aligned workflow or native playbook path for every CuraOS request.
- [x] Workspace `AGENTS.md` and the Symphony rule require local SQLite issue rows for tasks, subtasks, blockers, follow-ups, and verification lanes.
- [x] Local issue helpers support `parent_id` so child work can link to a main issue before any GitHub sync.
- [x] Harness guidance requires asking the user whether to run a ready-open-issues wave or an unblock-prep wave before launching broad orchestration.
- [x] Focused local issue DB tests include red and green evidence for parent hierarchy support.

Reflection:

- The guidance needed storage support, not prose only. Adding `parent_id` to the local DB keeps future harnesses from losing subtask lineage in chat or markdown-only notes.

### SAA-15: Final local closeout

Acceptance:

- [x] Plan status and adoption ledger status show local closeout with GitHub sync not queued.
- [x] SAA-10 is closed as a no-sync checkpoint rather than left as pending work.
- [x] SAA-15 is linked to SAA-MAIN through `parent_id` in local SQLite.
- [x] SAA-MAIN is marked done after final verification evidence is recorded.
- [x] Final closeout runs include focused tests, workflow sync, Symphony conformance, source audit, rule index, doc graph, docs check, syntax checks, diff whitespace check, no-dash scan, and sync outbox readback.

Reflection:

- The adoption part is locally closed. The remaining action is optional explicit GitHub sync if the user wants a PR or shared tracker mirror later.

### SAA-16: Explicit publish sync

Acceptance:

- [x] Dirty nested submodules were committed and pushed before parent pointer updates.
- [x] `curaos` pointer updates were committed and pushed after nested submodules were clean.
- [x] The root workspace commit was pushed after `curaos` was clean.
- [x] Recursive clean/upstream parity proved all tracked repos and submodules matched their configured upstream branches.

Reflection:

- Bottom-up sync was required because recursive submodule dirt was not visible in the first non-recursive root status. Publication remains an explicit checkpoint, not routine progress tracking.

### SAA-17: Wave and issue orchestration goal refresh

Acceptance:

- [x] The milestone orchestration goal setter tells harnesses to choose the strongest available native orchestration path instead of forcing Claude Workflow or Agent Workflow Kit.
- [x] The goal setter requires a user-approved ready-open-issues or unblock-prep wave before broad orchestration, unless the goal itself is the explicit approval.
- [x] The goal setter and wave playbook require a main local issue plus child `parent_id` rows for scan, triage, blocker, dispatch, verification, closeout, and follow-up work.
- [x] Issue orchestration playbooks record triage/gate results in local SQLite evidence while keeping GitHub as the explicit-sync tracker adapter.
- [x] `docs/agents/WORKFLOW-STATUS.md` covers all 48 workflow executors after the goal-doc verification exposed missing rows for new v1 executors.

Reflection:

- The goal docs now make harness choice a capability decision, not a vendor lock. Hermes can use `todo`, `delegate_task`, terminal, and file tools; Agent Workflow Kit can use `workflow-run`; Claude can use native Workflow; Codex and generic agents keep adapter/playbook paths.

### SAA-18: GitHub issue and Project parity mirror

Acceptance:

- [x] Added a tested SQLite mirror importer with dedicated tables for repos, issues, issue comments, Projects, Project fields, Project items, sync runs, and `GH:<owner/repo>#<number>` local issue rows.
- [x] The importer clears stale mirror rows on each full sync while leaving local SAA work items intact.
- [x] Native GitHub parent/sub-issue hierarchy is mirrored into both `github_issues.parent_ref` and `local_issues.parent_id` when available.
- [x] Live GitHub counts matched local SQLite counts: 127 repos, 815 issues, 1666 issue comments, 1 Project, 26 Project fields, 681 Project items, and 815 local GitHub issue rows.
- [x] Project item issue refs all resolve to mirrored issue rows, with 681 Project-linked issues and 596 parent links mirrored.
- [x] Dual-way sync is now the default: before each pull mirror it tries to add queued local-only issues and missing local Project items back to GitHub; this run found no missing GitHub writes.

Reflection:

- The local issue DB is now both the Symphony work ledger and the requested GitHub parity mirror. Dedicated `github_*` tables preserve full Project/field/item data while `GH:*` rows make GitHub issues visible through the local issue surface.

### SAA-19: Dual-way sync reflection audit and publish closeout

Acceptance:

- [x] Audited canonical tracker docs, Symphony rule, Hermes guide, workflow sync docs, and goal ledger for one-way sync wording.
- [x] Reflected the dual-way default in `ai/rules/curaos_symphony_alignment_rule.md`, `docs/agents/local-first-workpad.md`, `docs/agents/issue-tracker.md`, `docs/agents/github-roadmap-project.md`, `docs/agents/SYMPHONY-CONFORMANCE.md`, Hermes guides, and GitHub sync workflow docs.
- [x] Kept `github_sync: explicit-checkpoint-only` as the machine enum while documenting that tracker parity checkpoints add safe missing data to either side.
- [x] Final validation is green; commit, push, and upstream parity proof are handled by the explicit SAA-19 publish checkpoint and recorded in local SQLite after publish.

Reflection:

- The missing policy surface was not the importer; it was the surrounding canonical docs that still implied one-way pull or minimal sync. The durable rule is now explicit checkpoint plus dual-way reconcile.

### SAA-20: One-task worker prompt alignment

Acceptance:

- [x] Explained why the previous harness-native pass touched the milestone orchestrator but not the worker prompt: it was scoped to broad wave/orchestration docs and treated `one-task` as the linked worker runbook, not as a prompt needing parallel wording.
- [x] Updated `docs/agents/one-task-execution-prompt.md` so worker runs select the active harness's strongest execution path and record local SQLite evidence before relying on chat, markdown, or GitHub sync.
- [x] Validation is green; commit, push, and upstream parity proof are handled by the explicit SAA-20 publish checkpoint and recorded in local SQLite after publish.

Reflection:

- The orchestrator prompt correctly linked to `one-task`, but the worker prompt still over-emphasized Claude Workflow and Agent Workflow Kit. The fix is not to copy wave approval language into a worker runbook; it is to express the same harness-native and local-issue rules at worker granularity.

## Sync queue

Latest completed explicit publish sync: SAA-16 pushed root `446532c8`, `curaos` `bc38b97`, and the required nested submodule commits after bottom-up verification.

Latest completed requested dual mirror: SAA-18 imported all GitHub org issues, issue comments, plus Project data into `.scratch/state/symphony-work/local-issues.sqlite` with run id `github-parity-20260627T220426952Z`; the local-to-GitHub add pass found no missing writes.

Latest publish closeout: SAA-19 audits dual-way sync reflection surfaces and publishes the root workspace changes; exact commit and upstream parity proof are recorded in local SQLite after push.

Latest local correction: SAA-20 updates `docs/agents/one-task-execution-prompt.md` to match the harness-native/local-SQLite policy already present in the milestone orchestrator at worker scope.

No new GitHub sync is queued for SAA-17 unless the user asks to publish this local goal-doc refresh.

When a sync is needed, add a row before executing it:

| Local item | Sync target | Reason | Planned command | Status |
|---|---|---|---|---|
| Example | PR | Local checks green, ready for review | `gh pr create ...` | Pending |

## Reflection log

| Date | Event | What worked | What failed or risk found | Follow-up |
|---|---|---|---|---|
| 2026-06-27 | Research and substrate planning | Symphony maps well to CuraOS playbook and executor pairs, local state retention, and evidence gates. | Upstream example is Linear and Codex-specific, and upstream commit skill conflicts with CuraOS no-AI-trailer policy. | Keep tracker and runner as adapters. Add conformance gates before broad workflow edits. |
| 2026-06-27 | Phase 0 docs and Hermes skill created | Local-first tracking worked without GitHub writes. `check-docs.sh`, workflow sync, rule index, doc graph, and skill load verified the substrate. | Whole research-dir dash scan hit pre-existing dash findings, so closeout switched to changed-file dash scanning. | Future closeout scripts should scan changed files by default, with an optional full-repo mode. |
| 2026-06-27 | Added SQLite and TDD requirements to plan | The plan made local SQLite issues and test-first workflow code mandatory for implementation phases. | Implementation did not exist at that moment, so later closeout proof was required. | Completed by SAA-07 and closed by SAA-15 with strict TDD evidence. |
| 2026-06-27 | Implemented local SQLite issues and Symphony conformance | Local DB, CLI, conformance checker, docs gate, and 20 playbook mappings are green with red and green evidence stored in local SQLite. | One test expectation needed repair for SQLite's internal `sqlite_sequence` table. | Keep `node scripts/check-symphony-conformance.js` in closeout and open PR only on explicit sync. |
| 2026-06-27 | Added persistent workflow source audit | `.mjs` and `.workflow.ts` workflow source now has a local checker and docs gate. | The first red repo run found Unicode dashes in patient admission Temporal workflow comments; evidence readback exposed a local issue CLI EPIPE crash. | Keep `node scripts/check-symphony-source-audit.js` in closeout and ignore generated sandboxes/worktrees unless a lane is explicitly active. |
| 2026-06-27 | Expanded source audit to tracked and untracked files | Git-backed discovery now covers tracked and untracked workflow markdown plus scripts across nested repos, and the gate caught stale Unicode dashes in root workflow scripts. | The first broadened run included `.claude/worktrees` and product-generated service files, so the scope had to exclude lane-local worktrees and avoid product TypeScript false positives. | Keep the git-backed audit in `check-docs.sh`; if scope expands again, add a red fixture before changing filters. |
| 2026-06-27 | Added mandatory harness guidance and parent local issues | AGENTS and the Symphony rule now make workflow selection, local issue hierarchy, and wave asks binding; local issue CLI supports `--parent-id`. | Prose guidance alone would not preserve hierarchy, so the SQLite helper needed a migration and focused tests. | Keep child work attached with `parent_id`; ask before ready/unblock waves instead of silently starting broad orchestration. |
| 2026-06-27 | Closed local Symphony alignment part | Plan and ledger now show closed local status, SAA-MAIN/SAA-15 capture final local issue state, and GitHub sync remains explicitly not queued. | The only intentionally unperformed step is PR or shared tracker sync, because that remains an explicit checkpoint. | If publication is needed later, queue one explicit GitHub sync item with the final local evidence. |
| 2026-06-27 | Published Symphony alignment commits | Bottom-up recursive submodule sync pushed 21 nested repos, then `curaos`, then the root workspace; final recursive clean/upstream parity passed. | Non-recursive root status hid nested dirty submodules, so the publish path needed the recursive submodule sync skill. | Keep recursive clean/upstream proof in future commit/push closeouts. |
| 2026-06-27 | Refreshed wave and issue orchestration goal docs | Goal text now tells harnesses to use their strongest available orchestration tools and keeps local issue hierarchy as the machine progress spine. | The previous goal examples overfit Claude Workflow and Agent Workflow Kit examples, which could make Hermes or generic harnesses look like fallbacks instead of first-class paths. | Keep conformance/source-audit gates green after this docs refresh, then publish only if requested. |
| 2026-06-27 | Mirrored GitHub issues and Project data to SQLite | The dedicated parity importer captured repos, all org issues, issue comments, Project fields/items, hierarchy, and local `GH:*` rows in one verified local DB. | The existing local issue schema was too narrow for full Project parity, so the mirror needed dedicated `github_*` tables rather than overloading SAA rows. | Use `node scripts/github-sqlite-sync.js --db .scratch/state/symphony-work/local-issues.sqlite --json` for the next requested mirror refresh. |
| 2026-06-27 | Audited dual-way sync reflection surfaces | Rule, tracker docs, local workpad, roadmap docs, Hermes guides, and GitHub sync workflows now state that explicit tracker parity checkpoints add safe missing data to either side. | The initial mirror documentation was accurate for pull parity but under-described the user's dual-way expectation. | Keep `--pull-only` exceptional; default to dual-way sync before reporting parity. |
| 2026-06-27 | Aligned one-task worker prompt after user review | Worker runbook now names harness-native execution and local SQLite evidence at worker granularity. | The previous pass updated the milestone orchestrator because that was the broad-wave surface, but left `one-task` relying on older executor wording. | Keep paired orchestrator and worker prompt wording in future harness-native refreshes. |
