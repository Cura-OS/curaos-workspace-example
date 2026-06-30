# Milestone Orchestration Prompt

High-level runbook for one CuraOS milestone wave. The orchestrator owns queue, dependency graph, unblock investigation, research/plan/prototype loop, adversarial grill, escalation funnel, worker dispatch, verification, PR merge, tracker hygiene, and stop-state proof.

**Canonical shared sections (binding, at most one link deep).** One canonical statement per rule; this prompt points to owners instead of restating:

| Topic | Canonical owner |
|---|---|
| `gh` invocation, script-path, REST/GraphQL quota, Search 1000-cap sharding | [shared/gh-conventions.md](shared/gh-conventions.md) |
| Local CI gate + §8.1 evidence-paste contract | [shared/local-ci-gate.md](shared/local-ci-gate.md) |
| Model + effort routing (logical tiers, no inheritance, PHI floor) | [shared/model-routing.md](shared/model-routing.md) |
| Inbox-notification hygiene (whole-inbox sweep + per-PR gate) | [shared/notification-hygiene.md](shared/notification-hygiene.md) |
| PR merge gate (review-settled, threads, branch deletion, close-path hygiene) | [shared/pr-merge-gate.md](shared/pr-merge-gate.md) |
| Worker runbook (claim, TDD, evidence, closeout) | [one-task-execution-prompt.md](one-task-execution-prompt.md) |
| Recommendation auto-apply, generator evolution + barrier, foresight dependency handling, swarm collision, version planning | `ai/rules/curaos_recommendation_auto_apply_rule.md`, `ai/rules/curaos_generator_evolution_rule.md`, `ai/rules/curaos_foresight_rule.md`, `ai/rules/curaos_swarm_collaboration_rule.md`, `ai/rules/curaos_version_planning_rule.md` |
| Wave leg mechanics (scan, triage, prioritize, dispatch, verify) | [workflows/milestone-wave.md](workflows/milestone-wave.md) + per-leg playbooks under [workflows/README.md](workflows/README.md) |
| Local issue hierarchy, all-work tracking, and wave ask | [local-first-workpad.md](local-first-workpad.md), [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md), `ai/rules/curaos_symphony_alignment_rule.md` |

## Goal Setter

```text
/goal Run a user-approved CuraOS orchestration wave using docs/agents/milestone-orchestration-prompt.md and the strongest orchestration path the active harness exposes: Claude native Workflow, Agent Workflow Kit `workflow-run`, Hermes native `todo` plus `delegate_task` plus terminal/file tools, Codex adapter, or generic playbook execution. Before broad work, ask the user to choose a ready-open-issues wave or an unblock-prep wave unless this goal is already the explicit wave approval. Use `.scratch/state/symphony-work/local-issues.sqlite` as the machine issue store: create or find a main wave issue, then attach scan, triage, blocker, dispatch, verification, and follow-up child rows with `parent_id`. Target Version is the top planning gate per [[curaos-version-planning-rule]] + ADR-0215; determine it from the GitHub Project `Target Version` field; never hardcode an issue or milestone range; target all open issues (`CuraOS Milestone` is reporting metadata only, not a candidate or dispatch gate). Invoke committed `milestone-wave` through the selected runner when available; continue natively only for runner outage, `needs_user`, or impossible output, preserving the same local issue evidence. Iterate until terminal: `wave-done`, `awaiting-auto-merge`, `blocked-by-external`, or `needs-user` with option-A escalation filed. Apply this prompt's §2-§11 gates end-to-end; stop only when every §11 predicate holds.
```

## Prompt

```text
Use docs/agents/milestone-orchestration-prompt.md.

Mission:
Run one milestone wave. Implement nothing yourself except orchestration glue, stale tracker repair, merge conflict repair, or a tiny unblocker no worker should own. Use the active harness's best available orchestration tools rather than forcing a different harness: native Workflow, Agent Workflow Kit, Hermes subagents, Codex adapter, or the generic playbook path are all valid when they preserve the same gates. Respect the GitHub project workflow end-to-end (curation, labels, `CuraOS Roadmap`) while recording machine progress in the local SQLite issue store first. Partition by git working tree and start every collision-free lane at once (runtime `min(16, cores-2)` backstop), verify claims, merge accepted PRs, unblock dependents, repeat.

Core worker goal (every implementation worker receives this exact goal shape):

/goal Finish issue <repo>#<number> using docs/agents/one-task-execution-prompt.md. Use only owned paths <paths>. Respect dependencies and PR target <parent-story-pr|own-pr|no-pr>. Plan, adversarial-grill, prototype high-fidelity unknowns, implement with TDD, verify against real deps, update tracker + docs. At closeout resolve the PR per shared/pr-merge-gate.md, clear its notification per shared/notification-hygiene.md, and report `NOTIFICATION: <cleared|left-needs-human|n/a>`. Stop at done/split/blocked/awaiting-auto-merge only.

Truth order:
1. GitHub issue body/comments, native sub-issues, native dependencies, linked PRs.
2. GitHub Project `CuraOS Roadmap` fields/views.
3. `ai/rules/` and ADR `RESOLUTION-MAP.md`, especially `ai/rules/curaos_model_tiering_rule.md`.
4. `docs/agents/issue-tracker.md`, `docs/agents/github-roadmap-project.md`, `docs/agents/triage-labels.md`.
5. `ai/curaos/docs/HANDOVER.md`, `ai/curaos/docs/ISSUE-ROADMAP.md`.
6. Code, tests, build manifests.

Forbidden:
- no hardcoded milestone, issue, repo, or module from examples
- no dispatch before blocker/dependency check, §3.4 completion for every candidate, and §3.5 research persistence for any unknown design decision
- no silent default-pick on a Real-user-decision blocker: auto-apply per §3.6 when a clear reversible in-scope recommendation exists; otherwise escalate
- no terminal STOP (`blocked` / `needs-user`) without the §11 predicate sweep
- no acceptance of `blocked-by` frontmatter without §3 Paper-vs-Real triage; `blocked` is an orthogonal marker label, never a state label
- no orchestrator-direct `gh issue close` or `--add-label ready-for-agent` without §3.4 sync; no new atomic `ready-for-agent` issue without full frontmatter + Project add + native parent wiring
- no two parallel workers sharing a git working tree (same submodule checkout, or both in `curaos/tools/codegen/`) - they clobber each other's branch/HEAD/stash even on different files; serialize them (this is the ONLY hard cap on lane count - everything collision-free runs concurrently, uncapped)
- no committed-workflow impossible output accepted as success - the §3.65 workflow-defect rules are binding
- no parking or skipping a `foresight` issue solely because it carries the marker; relevant, fully specified foresight dependency work is triaged and dispatched like normal ready work per `ai/rules/curaos_foresight_rule.md`
- no write worker in a shared dirty workspace; no worker claim accepted without git status + diff + test verification; no worker output marked "done" while local-test evidence lives only in chat
- no issue close before PR merge verified by `mergedAt`; no direct `main`/`master` push
- no subagent/worker/reviewer dispatched without explicit model + effort, and none inheriting parent model/effort - per shared/model-routing.md
- no forced downgrade to a runner the current harness lacks; select the strongest available harness-native orchestration path and record it in local issue evidence
- no chat-only wave state; every scan, triage, blocker, dispatch, verification, and follow-up lane gets a local SQLite issue row linked to the wave main issue when practical
- no AI/tool attribution trailers (`Co-authored-by:`, `Generated-by:`, etc.; canonical list: AGENTS.md §8 Commits)
- no orchestrator-direct merge of a high-blast-radius PR without cross-harness grill OR same-harness adversarial-reviewer fallback evidence (§3.7)
- no `--admin` merge except when ALL THREE hold: (a) the CI failure is on a known external infra dep, (b) the orchestrator has explicit user authorization, (c) the underlying fix is queued in the same wave
- no generator-evolution gate violation (§3.11); no downstream milestone wave START while a generator/SDK lane is in-flight (§3.10)
- no terminal STOP without the §9.5 ALL-OPEN-PR sweep ORG-WIDE across BOTH orgs; never silent-merge a bot bump you could not validate

0. Setup
- Create `/goal` if harness supports goals. Track plan: context; active version + all-open issue set; ready queue; dependency graph; batch plan; dispatch; worker verification; PR review/merge; unblocking/rebatch; closeout.
- Select and record the harness-native execution path: Claude native Workflow, Agent Workflow Kit `workflow-run`, Hermes native `todo` plus `delegate_task` plus terminal/file tools, Codex adapter, or generic playbook. Prefer the strongest verified path available in the current harness; do not require another harness just because an example names it.
- Create or find the main local wave issue in `.scratch/state/symphony-work/local-issues.sqlite`; create child rows with `parent_id` for setup, scan, triage, blocker investigation, dispatch, verification, closeout, and any follow-up. Store evidence refs there before relying on markdown mirrors or GitHub sync.
- Read: `AGENTS.md`, `CLAUDE.md`, `ai/rules/README.md`, `ai/rules/curaos_live_ops_substrate_rule.md`, swarm/roadmap/cli-agents rules, `docs/agents/issue-tracker.md`, `docs/agents/github-roadmap-project.md`, `docs/agents/triage-labels.md`, `docs/agents/one-task-execution-prompt.md`.
- Binding `gh` invocation + script-path + quota conventions: docs/agents/shared/gh-conventions.md - every `gh` command and `bash scripts/<name>` in this prompt assumes them.
- Verify GitHub auth + Project access: `env -u GITHUB_TOKEN gh auth status && env -u GITHUB_TOKEN gh project list --owner your-org --format json | jq '.projects[] | select(.title=="CuraOS Roadmap") | .number'` returns a number. If not: STATUS: blocked, BLOCKER: tracker-auth-unavailable.
- Run `git status --short --branch`. If dirty, record the owner; do not mix worker edits into a dirty tree.
- Maintain the runtime lane registry at `.scratch/active-agent-lanes.json` (never committed): one record per lane (issue, agent id, worktree, branch, model/effort, state).
- For frontend parity waves, run `node scripts/check-frontend-parity-tracker-hygiene.js` before dispatch. Built-in GitHub issue milestones and missing Project `Target Version` rows are tracker hygiene defects to repair before claiming the wave is tracker-clean.
- For long `agent-workflow-kit workflow-run` executions, use `--stream --json` instead of manually polling `workflow-status`; for an existing run id use `workflow-events <run-id> --follow`. Treat the terminal stream line and `run.json.status` as authoritative; launch commands exit nonzero when terminal run status is `failed`.
- Every dispatched subagent or child workflow must leave inspectable progress: precise `agent()` label + phase/group, `phase()` boundaries, and `log()` messages around slow deterministic batches. Side-effecting child prompts should request a compact progress summary in the structured result when their schema permits it; otherwise the event stream is the progress record.

1. Active Version + Project Context
- Determine the active `Target Version` from the GitHub Project first; HANDOVER/ISSUE-ROADMAP are mirrors. Read `CuraOS Milestone` only as reporting metadata; never narrow scans or dispatch by it.
- Do not use GitHub's built-in issue Milestone field for CuraOS planning. If a built-in milestone is present on active tracker work, clear it and keep Project `Target Version` + `CuraOS Milestone` as the authoritative metadata.
- If the GitHub Project is unavailable, use `ai/curaos/docs/HANDOVER.md` + `ai/curaos/docs/ISSUE-ROADMAP.md`, then mark final report `TRACKER: project-unverified`.

2. Queue Scan (gather the FULL candidate set; do NOT pre-filter to `ready-for-agent`, Target Version, or milestone)

**Binding (the throughput rule): scan EVERY open issue across EVERY repo, every milestone, and every target version.** Forbidden narrowings: filtering the scan to `--label ready-for-agent` (misses mislabelled-`blocked` issues whose `blocked-by` set is already closed, and promotable un-promoted foresight stories) and dropping non-current-milestone issues (an OLDER milestone's debt in a DIFFERENT repo is still dispatchable work).

- Refresh local index when the script exists: `node scripts/seed-github-roadmap.js --index-only`
- Pull the COMPLETE open-issue set (ALL labels, ALL milestones) with TRUE pagination (a hardcoded `--limit` silently truncates under org load), then drop only the genuinely-unavailable (already-claimed / PR-open):
  `gh api -X GET --paginate search/issues -f q='org:your-org is:issue is:open' -f per_page=100 --jq '[.items[] | {repo: .repository_url, number, title, labels, assignees, updated_at, url}] | map(select((.labels|map(.name)|any(startswith("agent-claimed:") or .=="agent-PR-open"))|not))'`
  (`-X GET` is REQUIRED: gh defaults to POST when `-f` params are present, and `POST /search/issues` 404s. REST search items carry `repository_url` + `updated_at`, NOT `repository`/`updatedAt`; project the repo from `repository_url`. `--paginate` walks every result page; do NOT cap the scan. If you must use `gh search issues` instead, treat hitting `--limit` as a fail-closed truncation, not a complete scan.)
  (**GitHub Search 1000-result cap (RP-78):** treat `total_count > 1000` or 1000 items returned as a fail-closed truncation signal, NOT a complete scan; shard per repo and union per the canonical mechanics in shared/gh-conventions.md.)
  (Self-test: the command's GET method, `--paginate`, and projected schema {repo, number, title, labels, assignees, updated_at, url} are validated against a recorded fixture response by `scripts/workflow-truth-contract.test.js` ("binding queue-scan command"). The only LIVE assertion is that every returned item, if any, carries a non-null `repo`; an EMPTY array is a PASS - emptiness reflects current issue population / search-index lag, not command health. This fixed set is also the substrate for the §3.10 in-flight generator barrier probe.)
  (Keep `ready-for-human` issues IN the set: per `ai/rules/curaos_foresight_rule.md` they are interview candidates for §3.6, not dispatch candidates.)
- Do NOT discard by milestone; tag each candidate with its milestone for reporting only.
- Read each candidate + comments: `gh issue view <n> --repo <owner/repo> --comments --json number,title,body,labels,assignees,state,url,comments,projectItems,milestone`; extract frontmatter (`module`, `milestone`, `priority`, `effort`, `requires`, `blocked-by`, `agent-notes`).
- **Label != disposition (binding).** A `blocked` label is NOT proof of a real blocker; re-derive disposition from frontmatter + native dependency state on EVERY scan.
- **Dependency-cleared auto-detection (binding).** A `foresight`/`blocked` story whose `blocked-by` deps all closed becomes a live candidate the moment its blocker merges THIS wave; never hand-notice cleared gates or leave a just-unblocked story parked (label-only scans created the M16 #538 -> M17-S2 #545 invisibility class). `foresight` is a discovered-dependency marker, not a parking reason. User directive 2026-06-08 plus 2026-06-17: ALWAYS auto-pick every unblockable or relevant foresight dependency task; maximum parallelization.
- **STRANDED-GATE: VERIFY on disk BEFORE re-dispatch (binding).** A dependency-cleared (A) slice may already be SHIPPED; verify the named artifact on disk and run its verification commands BEFORE dispatching a worker to redo done work (worker mirror: one-task-execution-prompt.md §2.6).
- **Dependency-cleared live-run/operator work remains agent-authorable through `build-host` unless remote evidence proves otherwise.** For deployment, live-server, public-demo, image-publish, signing, DNS, Caddy, Pocket ID, NetBird, APISIX, k3d, kubectl, zarf, Docker, cosign, GHCR, and VPS work, follow [[curaos-live-ops-substrate-rule]]: if not already on `build-host`, SSH there and use `/home/mkh/workspace/example-homelab` before declaring any blocker. Do not use `ready-for-human` just because work needs SSH, live services, secrets, DNS, provider CLIs, Docker, Kubernetes, or remote server access. Split to `ready-for-human` only for product, legal, authority, irreversible, or genuinely non-agent decisions.

3. Dependency Graph + Real-vs-Paper Blocker Triage
Mark a candidate blocked if any holds: open native dependency blocker; frontmatter `blocked-by` pointing at an open issue; `requires` naming an unmet PR/check/artifact; a required open sibling/parent dependency; a linked unmerged PR the work depends on; body missing Scope / Do not touch / Acceptance / Verification / Docs; labels `needs-info`, `ready-for-human`, `agent-claimed:*`, or `agent-PR-open`.

**Paper-vs-real blocker check** (never accept `blocked-by` frontmatter at face value; read every "Blockers" section of every open issue):
- **Real-external**: upstream system fix, vendor release, or infra access not grantable in-session.
- **Real-user-decision**: genuine fork with no clear recommendation, or irreversible/destructive/T3 action.
- **Real-dependency**: open upstream issue/PR that truly gates this work.
- **Paper-stale**: all deps closed -> relabel `ready-for-agent` and dispatch this wave.
- **Paper-scope**: live-run/operator work mislabelled as agent work -> reclassify `ready-for-human`, drop `blocked`, interview the user via §3.6; it re-enters as an agent leaf only when a future (A) slice is carved off.

If an issue is too broad or missing children: dispatch a planning worker only (`to-prd`/`to-issues` through one-task-execution-prompt.md) and stop that lane at `STATUS: split`.

3.3b Unblock-Leverage Ranking (choose WHICH ready work first)
Rank ready work by unblock-leverage: transitive dependent count over native `blocking`/`blocked_by`/`sub_issues` edges + `issue.parent` backlinks. Keystones first; deepest-first on the critical path; FIFO within a priority class. Ranking changes only ORDER - never adds, drops, or gates a lane. A highest-leverage issue blocked on an unresolved ADR/spec decision routes the DECISION first (§3.5 -> §3.6); leverage never overrides the §3.10 barrier. Re-run the §2 full-scan at wave start AND after every merge; never rank a stale candidate list.

3.4 Tracker-First Triage Gate (MANDATORY before any worker dispatch)
The queue is GitHub Issues + `CuraOS Roadmap` per `ai/rules/curaos_roadmap_workflow_rule.md`. HANDOVER.md, ISSUE-ROADMAP.md, and `.scratch/active-agent-lanes.json` are mirrors; if the tracker is stale, fix the tracker FIRST, then mirrors, then dispatch.

**Run the [`pm-triage-gate`](workflows/pm-triage-gate.md) workflow** over the candidates that survived §3 - it executes the mechanics (triage label, Project add + field reconcile, native sub-issue + dependency wiring, mirror refresh) by composing `gh-issue-triage`, `gh-project-sync`, and `gh-subissue-wire`; those playbooks own the command-level detail. Triage metadata derives deterministically from frontmatter; model output may enrich blocker rationale but may not erase frontmatter-derived Project fields. Project item-list must be cached once per gate/wave and passed to per-candidate sync; GitHub Project quota/transient failures are terminal `blocked-by-external`, not empty triage.

**Native tree wiring (binding):** `gh-subissue-wire` is a deterministic REST executor over `scripts/lib/gh-project.js` (`listSubIssues`, `addSubIssue`, `removeSubIssue`, `addBlockedBy`). Do not accept an LLM/agent-claimed edge write as proof. If a Project-visible candidate has a parent in frontmatter and the workflow returns `subissues_added: []` + `already_wired: []` while REST `GET repos/<owner>/<repo>/issues/<parent>/sub_issues` does not contain the child, record `workflow-defect`, repair the executor or continue natively with the same REST helpers, and re-run before dispatch. If REST `GET repos/<owner>/<repo>/issues/<child>/parent` shows a different parent than frontmatter/project truth, treat it as a reversible tracker reparent repair: remove the stale parent edge, add the intended one, and report it in `reparented`.

- Label seeding: `gh issue edit --add-label` fails SILENTLY when the label is un-seeded in that repo (verify per §11 label-seed sweep). Exactly one state label per open issue; `blocked` is an orthogonal marker; real blockers also record `blocked-by` frontmatter + a native edge. `milestone=NONE` from `gh-project-sync` is roadmap hygiene to log, not a dispatch gate.
- Outputs per candidate: curated body/frontmatter; correct labels; native edges; Project item with reconciled fields; parent backlink; mirrors refreshed AFTER tracker truth; one `gh issue comment` summary `TRACKER-TRIAGE: synced fields=<list> sub_issues=<count> dependencies=<count> parent=<url|none>`.
- Quota routing per shared/gh-conventions.md. A failed REST-supported tracker mutation: STATUS: blocked, BLOCKER: tracker-mutation-unavailable. GraphQL exhaustion blocks only the leg that genuinely needs GraphQL.

**3.4 all-open tracker pass BEFORE dispatch (ordering invariant, MANDATORY).** Triage + hierarchy assignment runs over the WHOLE open-issue set before dispatch selects `ready-for-agent` items; never narrowed by `CuraOS Milestone`. A `foresight` marker is provenance, not a state. It may remain on a `ready-for-agent` issue when the issue is relevant and otherwise ready. `blocked` + Backlog or `needs-triage` is a deliberate triage outcome only when a real blocker, incomplete spec, future-version-only scope, or user/operator gate names the actual reason. No candidate dispatches until it passed §3.4 readiness; non-blocking `not_ready` leftovers do not block collision-free ready lanes, while `runtime-lane-check` and `investigate` routes do; an issue is NEVER worked while still raw `needs-triage`.

If committed `milestone-wave active` returns `pending_tracker_work` or `next_action: "drain-pending-tracker-work"`, drain dispatch-blocking routes before starting unrelated work while keeping non-blocking tracker rows visible and parallelized with independent ready lanes. Route `route`: `tracker-triage` through §3.4, `user-escalation` through §3.6, `runtime-lane-check` by verifying live worker/PR and clearing stale runtime labels, `planning-breakdown` through research/to-issues, `tracker-repair` through sub-issue wiring repair, and `blocker-follow-up` through dependency path. Native fallback must rebuild the same all-open scan or stop workflow defect; must not use active milestones, Target Version, or `ready-for-agent` labels as queue source.

3.5 Research Gate
Drive a research-plan-prototype loop BEFORE dispatching unknowns: competing/analogous platforms, exact libraries/packages reducing custom code, integration map (event producers/consumers, exact paths, data flow, cross-phase deps, must-not-break files). Persist EVERY research output to `ai/curaos/docs/research/<topic>.md` (or the module mirror path) before the dependent dispatch; un-persisted research is lost context and re-bills the next wave.

3.6 User Escalation Funnel (auto-apply first)
Per `ai/rules/curaos_recommendation_auto_apply_rule.md`: a clear + reversible + in-scope recommendation MUST be auto-applied and logged as one row in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` - do NOT escalate. Escalate ONLY when genuinely NO recommendation exists, OR the action is irreversible/destructive/T3, OR scope is unapproved. Escalation = option-A interview: ONE batched `AskUserQuestion` covering every open decision; 2-4 mutually exclusive options in trade-off order, option 1 "(Recommended)" when research supports it, header <= 12 chars. Record `user_decision: "D<n> <verbatim choice>"` in the lane registry and quote it verbatim in every downstream worker prompt. A too-broad story with no real decision is never escalated; break it down via `to-issues` and dispatch the children.

3.65 Committed-Workflow Defect Rules (impossible outputs; binding)
- same-checkout workflow executors must serialize branch-changing dispatch; only native/orchestrator paths that allocate a distinct git worktree per lane may run those lanes concurrently
- branch creation must be deterministic executor code in `task-execute`/`milestone-wave`; empty or mismatched branch-agent output is impossible workflow output: block before implementation, restore or stash the checkout back to the default branch or detach to `origin/<default>` when a linked worktree owns that branch, record/fix `workflow-defect`, and continue natively only from a verified branch/worktree
- `task-execute`/`milestone-wave` branch/restore/stash/collision/PR-ref logic must stay single-owned in `scripts/lib/workflow-git.js`; duplicated local helper blocks are a workflow-maintenance defect
- Remote branch probes and default-branch resolution must fail closed: only `git ls-remote --exit-code` status `2` means "no remote branch"; transport/auth/network/default-branch failures block branch creation and must not silently fall back to `main`
- `task-execute`/`tdd-implement` may open a PR only when the PR body can include a non-empty §8.1 `verification_evidence` paste and workflow JS can enforce an `owned_paths` scope fence from the independent verifier's observed `changed_paths`. If the worker omitted evidence, an independent verifier paste may become the fallback claim of record; if both are missing, if scope is unresolved/no `owned_paths`, if any observed changed path falls outside `owned_paths`, if the verifier does not prove `ci_ran:true` with an exit-code paste, or if verifier facts conflict around `changed_paths`/`empty_diff`, record/block the lane.
- `tdd-implement` no-op `done` is impossible output: for real dispatches, the independent verifier's observed `changed_paths` decides no-op truth (never the agent's self-reported `files_changed`/`tests_added`/`verification_evidence`) and an empty observed diff returns `blocked` with `workflow_defect:true` / `workflow_defect_kind:"tdd-implement-no-op-done"`; for `dry_run`, empty intended `files_changed` + empty intended `tests_added` is the no-op signal. Schema-default `done` with no changed files/tests/evidence/blocker is likewise impossible output and converts to `blocked`. `milestone-wave` and `task-execute` must preserve the marker in the lane result; if a same-checkout `milestone-wave` pass hits it, halt the remaining serial dispatch attempts, mark those lanes blocked by the same workflow-defect barrier, restore default branch, and continue natively from separate verified worktrees.
- `tdd-implement` model routing is harness-aware: `fable`/`opus`/`sonnet`/`haiku` are logical tiers, not portable raw model ids. The executor omits the raw model override by default and lets the active harness use its configured native model; raw logical model passthrough is allowed only with `AGENT_WORKFLOW_KIT_PASS_LOGICAL_MODELS=1`. A schema-default `done` caused by unsupported tier-name passthrough is a `workflow-defect`, not a completed lane.
- `milestone-wave` real-agent triage concurrency is controlled by its queued `triage_batch_size` input (default 3). Do not use Agent Workflow Kit `--max-concurrent-agents` as a throughput throttle for this wave; it is a hard cap that rejects extra agent calls and can create dropped triage rows.
- `milestone-wave` does a Codex runtime preflight before each queued real-agent triage batch. Fresh local Codex status-line/session telemetry with `credits.has_credits:false`, zero balance, or provider limit reached returns terminal `blocked-by-external` (`agent-runtime-quota`) before launching more child agents. Do not silently reroute to Claude or any alternate harness. If immediate real agents are required while Codex is unavailable, rerun intentionally with a same-tier configured harness selected at the runner level (for example `--default-agent-type claude`, plus matching dispatch agent config) and record that explicit choice in the run notes.
- Per-candidate triage child failures, including `agent-runtime-unavailable` timeouts and `triage-workflow-failed`, degrade to `not_ready` with route `triage-retry`; independent ready lanes continue until repeated `agent-runtime-unavailable` exceeds the wave fail-fast limit, then the wave returns terminal `agent-runtime-unavailable` and stops launching more child agents. True provider triage outages such as `agent-runtime-quota`, plus dropped pipeline rows, remain terminal `blocked-by-external`. GitHub GraphQL quota before active scan remains terminal because tracker discovery cannot be trusted; GitHub GraphQL quota after queued triage has partial results is deferred into `not_ready` rows so completed ready lanes can continue.
- `gh-issue-triage` may use its deterministic authoritative-prefetch fast path before invoking an agent for already-labelled, structurally complete rows: preserve non-dispatch labels, honor `blocked`/`blocked-by`, block workspace-hosted leaf issues, and confirm existing `ready-for-agent` only when frontmatter, required sections, parent/root truth, and `Blockers` are complete. It must not promote raw `needs-triage` without agent judgement.
- `opposite-harness-grill` returning pass/issues/block without a non-empty `report_path` that resolves to the requested artifact and a fresh persisted report at that path is impossible output: it must write a blocked report, return `skipped-harness-unavailable`, and include `workflow_defect:true` / `workflow_defect_kind:"opposite-harness-report-missing"`.
- `context-load` must prefetch the issue body in executor code through GitHub REST and deterministically extract `issue_spec.owned_paths`, `forbidden_paths`, `acceptance`, `verification_cmds`, and `adr_refs` before any model summary. Model output may enrich blocker rationale but may not erase frontmatter-derived Project fields or deterministic issue-spec fields. If a Project-visible scoped issue has `## Scope`/frontmatter but context-load returns `issue_spec.owned_paths: []`, treat that as impossible workflow output: record `workflow-defect`, fix the executor/prompt contract, then continue natively only after preserving the scoped issue.
- If a ready parent already has open native subissues, treat it as already decomposed. Hold the parent in `not_ready` with route `breakdown-existing-children`; do not invoke a split agent or create another child set. The all-open issue scan owns pickup of the children.
- If a breakdown assessor says a ready issue is not grab-able but returns no concrete child issues, or if the read-only assessor times out, treat that as inconclusive model output. Do not drop the ready issue from the wave. Keep the original issue as the ready leaf, dispatch it through the normal worker gates, and let `context-load` / `tdd-implement` block with real evidence if the task is truly too broad.
- If a breakdown split agent times out after the assessor proved the parent is too broad, keep the parent out of dispatch for this pass, report it as `not_ready` with route `breakdown-retry` / `planning-breakdown`, and continue independent ready lanes. A single issue-creation timeout is not a global workflow failure.
- Prioritize candidates are built deterministically from the triage context (no LLM enrichment step; RP-47 removed the haiku enrich-frontmatter agent); `wave-prioritize` backfills any missing `priority`/`effort` from the issue's own body frontmatter before ranking. Never pass an empty candidate list to prioritization for a non-empty ready set.
- `wave-prioritize` must rank and partition in executor code over `scripts/lib/dep-graph.js`. For a non-empty ready candidate set, empty `ranked`/`lanes` with no explicit collision/barrier reason is impossible output; record `workflow-defect`, fix the executor, and continue natively only after preserving the ready refs.

3.7 Adversarial Cross-Harness Grill
High-blast-radius code (auth, data migration, durability, PHI, public API contract, financial) gets an opposite-harness adversarial review through `opposite-harness-grill`. **Route it through the workflow's harness-probed RESCUE path - never a raw `codex exec` / `claude -p` shell call** (raw shell invocations hang on approval/auth prompts and stale broker sockets); the workflow probes CLI/auth/model liveness deterministically in executor code, dispatches the rescue agent with a bounded timeout, and returns a structured verdict. Routing + report + re-grill mechanics: [workflows/opposite-harness-grill.md](workflows/opposite-harness-grill.md) + `ai/curaos/docs/grills/README.md`. Binding outcomes:
- Claude orchestrator -> `codex:codex-rescue` (READ-ONLY sandbox, high effort, brief = try to BREAK the named invariant); Codex orchestrator -> the mirror Claude-rescue agent.
- Verdict = structured P0/P1/P2/P3 + report at `ai/curaos/docs/grills/<milestone-story>-pr<num>.md` (or executor-bounded `<safe-prefix>-<sha12>.md`). P0/P1 fixed before merge; P2/P3 filed as follow-ups. Re-grill after every fix cycle via the SAME rescue path, appending `## Re-grill verification (YYYY-MM-DD, post-<sha>)`; merge ONLY on a clean re-grill; fix-cycle cap = 3 (§8).
- Unavailable probe/rescue, empty `report_path`, a path outside `ai/curaos/docs/grills/`, or a not-freshly-written report = `blocked-harness-unavailable` / `skipped-harness-unavailable`: a blocked adversarial leg. A missing grill artifact is never a completed adversarial review. Same-harness fallback only via `allow_same_harness_fallback` (default OFF).

3.8 Bootstrap-Glue Lanes (orchestrator-direct; no worker)
Allowed: missing submodule pointer add, pointer bump after worker PR merge, stale index lock removal, missing `agent-claimed:<id>` label creation, pre-push hook regression fix, clearly-correct hotfix merge a worker cannot self-merge (<= 3 files, no design choice). Mark `L<n>-glue` in the lane registry; cap 2 active; batch serially - glue never starves worker verification.

3.9 Worker Pickup Pattern (sandbox blocks closeout)
Codex `--sandbox workspace-write` cannot push, reach api.github.com, or install against private registries. On worker `STATUS: blocked on closeout, implementation complete locally`: verify the worktree (status + diff + tests), then `cd <worktree> && git add -A && git commit -m "<conventional message>" && git push -u origin <branch>`, open the PR via `gh pr create` with `Closes #<n>`, re-run typecheck + tests before §8.

3.10 In-Flight Generator/SDK Barrier (pre-dispatch, MANDATORY)
Per `ai/rules/curaos_generator_evolution_rule.md`: while ANY lane against `module=codegen | module=*-sdk | module=contracts` carries `agent-claimed:*` OR `agent-PR-open`, downstream-milestone worker dispatch is BLOCKED. Proactive §3.4 triage of next-milestone Stories stays allowed (label `blocked`). Override only with explicit user authorization recorded as `user_override:<issue-url>` in the lane registry. Pre-flight probe before each cross-milestone dispatch:

```bash
gh api -X GET --paginate search/issues \
  -f q='org:your-org is:issue is:open label:agent-PR-open' -f per_page=100 \
  --jq '[.items[] | {repo: .repository_url, number, title}] | map(select(.title|test("codegen|sdk|contracts|@curaos/";"i")))'
# agent-claimed:* has no server-side prefix qualifier: reuse the §2 paginated full-scan set and filter
# client-side for labels starting with "agent-claimed:" plus the same title test.
gh api -X GET --paginate search/issues \
  -f q='org:your-org is:issue is:open' -f per_page=100 \
  --jq '[.items[] | select(.labels|map(.name)|any(startswith("agent-claimed:"))) | {repo: .repository_url, number, title}] | map(select(.title|test("codegen|sdk|contracts|@curaos/";"i")))'
```

If either result is non-empty, do NOT dispatch downstream-milestone Stories. Wait, then re-check. A truncated, errored, or timed-out probe is BLOCKED, not clear: never treat a partial result set as barrier-clear; re-run until the paginated walk completes. (The deterministic executor mirror: `milestone-active-scan` emits `generator_inflight` and `milestone-wave` holds generated-scope lanes with reason `gen-evo barrier: <ref> in-flight`.)

3.11 Generator-Evolution Sweep (after every merge wave)
Per `ai/rules/curaos_generator_evolution_rule.md` (worker mirror: one-task-execution-prompt.md §8.75): audit each merged PR touching generated/scaffolded code for its `GENERATOR-EVOLUTION:` closeout line; a missing line re-opens the issue (`BLOCKER: missing-generator-evolution-followup`) or files a `priority=critical` follow-up against the codegen module. A generator fix consumed by multiple profiles requires EVERY downstream profile re-rendered (parse-only consumer tests get upgraded to render-exercising). >= 3 `GENERATOR-EVOLUTION: fix=*` issues in the current or previous milestone => file a `priority=critical` pattern issue. Milestone closure gates on ZERO open `priority=critical` generator-evolution follow-ups.

3.12 Foresight Sweep
All three capture triggers (worker `FORESIGHT:` closeout lines; `foresight-sweep mode=wave` after every PR-merge wave; handoff capture) route through [workflows/foresight-capture.md](workflows/foresight-capture.md) into staged `foresight` issues per `ai/rules/curaos_foresight_rule.md`. Capture starts no work, bypasses no gate, and dedupes against open `foresight` issues. Once a captured issue is relevant to the active working set or a current dependency chain, §3.4 triage must process it like normal work and may mark it `ready-for-agent`; do not leave it parked solely because of the marker.

3.13 Inbox-Notification Sweep (after every merge wave)
Binding mechanics (whole-inbox `sweep-pr-notifications` dry-run/apply, per-PR `pr-notification-gate` hatch, exit-code semantics, last-action ordering): shared/notification-hygiene.md. Skip only on a zero-merge wave; §11 carries the terminal inbox predicate.

4. Parallel Batch Plan
- Partition by GIT WORKING TREE per `ai/rules/curaos_swarm_collaboration_rule.md`: same submodule checkout, parent repo, `.gitmodules`, or shared doc-graph files serialize; different trees run concurrently. Lane count is collision-bounded, not fixed (the Mission backstop is the only throttle).
- Two lanes run CONCURRENTLY only when no dependency path links them and they share no tree. A failed registry read/cross-check blocks dispatch; if every ready lane collides, monitor until a tree frees.
- Shared parent-repo edits serialize through §3.8 glue lanes; regenerate shared workspace docs (DOC-GRAPH, ISSUE-ROADMAP) after the merge wave, not per PR.

4.5 Model + Effort Routing
Binding matrix (lane -> model -> effort, no inheritance, PHI floor, no cross-harness routing): shared/model-routing.md. Invoke `subagent-orchestration` before dispatch when the active harness exposes it; otherwise use the closest harness-native planning primitive and record the fallback in the local child issue. If the mechanism cannot set explicit model/effort: keep the lane in parent or STATUS: blocked, BLOCKER: explicit-model-effort-unavailable.

5. Worktree + Claim
Branch/claim mechanics are owned by the committed executors (`task-execute`, `milestone-wave` over `scripts/lib/workflow-git.js`) and the worker runbook §1. The orchestrator only verifies, per lane: unique `AGENT_ID=<harness>-<8-plus-hex>`; isolated worktree + branch `agent/<type>-<module>-<slug>-<agent-id>` proven absent on remote; claim label `agent-claimed:<agent-id>` applied, `ready-for-agent` removed, claim comment posted; lane recorded in `.scratch/active-agent-lanes.json`; re-fetched labels show exactly ONE `agent-claimed:*`.

6. Dispatch Contract
Every worker prompt names: issue ref + verbatim `user_decision` quotes; owned paths; forbidden paths; PR target; explicit model + effort; verification commands; required final report schema (`STATUS` / `PR` / `EVIDENCE` / `GENERATOR-EVOLUTION` / `FORESIGHT` / `UNBLOCKS` / `NOTIFICATION` per worker runbook §9). Dispatch through `task-execute` (or `milestone-wave` lanes); never re-specify its internals.

7. Worker Supervision
- Poll workers by worker ID/session ID/PR URL only.
- `STATUS: blocked`: inspect issue comment + claim label; remove the claim only if the worker did not.
- `STATUS: done`: verify in the worker's worktree - `git status --short`; changed files within ownership; `git diff --stat`; the issue's verification commands; docs checks when Markdown changed; PR exists when required; no attribution trailers across branch commits (worker-side check: one-task-execution-prompt.md §8.25).

7.1 Over-Claim Gate (issue #156)
Per shared/local-ci-gate.md: workers MUST paste verbatim §8.1 evidence (last 15 lines + exit code per blocking gate in `curaos/ci-gates.yaml`); a summarized count is NO evidence -> reject closeout, re-claim. Orchestrator re-runs the SAME blocking gates at the SAME worktree path and compares: counts within ±2 accept; divergence > ±2, any fail/error reported as pass, or a silent skip reported as pass = confirmed over-claim -> apply `agent-overclaimed` label (create if unseeded), re-claim for a fix cycle.

8. Review + Fix Loop
For each worker PR run the T2 gate ([workflows/pr-verify-merge.md](workflows/pr-verify-merge.md)): `compound-engineering:ce-code-review` when available, else three read-only lenses (Security, Architecture, QA) with explicit model/effort. Fix loop max 3 cycles (collect checks/review threads, classify valid findings, worker fixes or orchestrator fixes tiny integration conflicts, rerun affected checks); escalate to user before cycle 4, immediately on T3.

9. Merge + Unblock
Merge per shared/pr-merge-gate.md (review-settled precondition, thread resolution, `--auto` merge, `mergedAt` verification, branch-deletion proof); `--admin` only under the Forbidden-list carve-out. After each merge: find dependents via native edges (`gh api repos/<o>/<r>/issues/<n>/dependencies/blocking --jq '.[].html_url'`); verify native blockers closed + `blocked-by` cleared + `requires` satisfied (`issue:` CLOSED / `pr:` MERGED / `check:` success); promote and dispatch into free lanes immediately. Submodule pointer bumps ride a §3.8 glue lane. Auto-merge still pending after the watch window: leave the issue open and dependents blocked; report awaiting-auto-merge.

9.5 Org-Wide All-Open-PR Sweep (MANDATORY, fail-closed)
§8 + §9 cover PRs THIS wave produced; they do NOT cover bot/Dependabot bumps, owner feature PRs, or stranded PRs in unvisited repos. User directive 2026-06-08: sweep EVERY open PR ORG-WIDE across BOTH orgs (`your-org` AND `developer`) and drive each to a disposition: (a) mergeable bot bump -> validate locally then merge (on a system-library-blocked local build, merge on the bot's own resolution evidence); (b) owner feature PR -> review, then HOLD for the user; (c) stranded PR -> resolve reviewer threads, then merge-or-close. Feed results into the next wave's triage pool.

10. Re-batch Loop
After every merge: launch newly unblocked lanes, keep the batch collision-bounded, repeat §2-§9 until a stop state.

11. Stop States - strictly tested before claiming terminal
Verify EVERY line before reporting `blocked`/`needs-user`:
- [ ] every dispatched/closed candidate passed §3.4 (curated body/frontmatter, labels, native edges, Project fields, backlinks, mirrors)
- [ ] every Real-user-decision auto-applied per §3.6 (AUTO-DECISION-LOG row) OR escalated and answered/held
- [ ] every Real-dependency blocker has a dispatched/queued lane OR an in-flight PR
- [ ] every too-broad story broken down via `to-issues`; children seeded + wired + on the Project
- [ ] every research-gated unknown has a persisted doc under `ai/curaos/docs/research/`
- [ ] every high-blast-radius merged PR grilled per §3.7 OR a blocked-grill verdict logged with fallback evidence
- [ ] every glue prerequisite and §3.9 pickup lane drained
- [ ] In-flight generator/SDK barrier verified: no downstream-milestone worker was dispatched while an `agent-claimed:*` OR `agent-PR-open` lane existed against `module=codegen | module=*-sdk | module=contracts` (unless `user_override:<issue-url>` recorded in `.scratch/active-agent-lanes.json`); the §3.10 pre-flight `gh api -X GET --paginate search/issues` probe returned empty before each cross-milestone dispatch this wave; a truncated, errored, or timed-out probe is BLOCKED, not clear
- [ ] §3.12 foresight sweep ran for every PR-merge wave; every `FORESIGHT:` line captured, staged, and any relevant dependency work triaged instead of parked solely by the marker
- [ ] §3.13 inbox sweep per shared/notification-hygiene.md: `--apply` run; live findings captured + resolved; final dry-run is the session's LAST action after the settle window, showing only HELD-open / needs-human entries
- [ ] every merged PR branch proven deleted per shared/pr-merge-gate.md
- [ ] §9.5 org-wide sweep clean: zero unswept open PRs across both orgs
- [ ] hygiene sweeps green (dry-run zero, else `--apply` + re-verify): `sweep-label-seed`, `sweep-closed-issue-labels`, `sweep-project-status`, `sweep-foresight-staging`
- [ ] roadmap milestone-field hygiene logged; HANDOVER + ISSUE-ROADMAP + DOC-GRAPH mirror tracker truth

STATUS: wave-done - active-version working-set predicate holds (every Epic acceptance-complete; no open close-blocker carries the version; product builds + deploys + GA-E2E-green; operator-gated (B) steps executed-or-re-targeted); all worker PRs merged or no-PR closeouts complete; all §11 predicates green; Tier E security evidence fresh (`check-tier-e-freshness.sh` exit 0); primary workspace on default branch, fast-forwarded, submodules synced, `git status --short --branch` clean.
STATUS: awaiting-auto-merge - a PR is queued on auto-merge; dependents wait for `mergedAt`; report names the re-entry command.
STATUS: blocked - remaining ready work is Real-external / tracker-auth / missing-info blocked; every user-decision auto-applied or escalated.
STATUS: needs-user - only no-recommendation, irreversible/destructive/T3, or unapproved-scope decisions reach this state.

Final report:
STATUS: <wave-done|awaiting-auto-merge|blocked|needs-user>
RUNNER: <workflow|workflow-run|hermes-native|codex-adapter|generic-playbook> LOCAL_ISSUES: <main + child row counts>
MILESTONES: <touched> RESEARCH: <docs> PROTOTYPES: <verdicts> GRILLS: <PRs + severity counts>
MERGED: <PRs> OPEN_PR_SWEEP: <count dispositioned; zero unswept> SEEDED: <issues>
BLOCKED: <issues + Real-external|Real-user-decision|Real-dependency classification>
NEXT READY: <queue head> TRACKER: <synced|project-unverified> MIRRORS: <refreshed>
```

## Orchestrator Skill Gates

| Gate | Owner | When |
|---|---|---|
| Wave pass | `milestone-wave` workflow | first move of every wave |
| Triage | [workflows/pm-triage-gate.md](workflows/pm-triage-gate.md) | §3.4, before dispatch |
| Breakdown | `to-prd` / `to-issues` | story too broad / children missing |
| Worker lane | `task-execute` workflow | every implementation dispatch |
| PR gate | [workflows/pr-verify-merge.md](workflows/pr-verify-merge.md) | every worker PR (§8-§9) |
| Adversarial grill | [workflows/opposite-harness-grill.md](workflows/opposite-harness-grill.md) | high-blast-radius code (§3.7) |
| Foresight | [workflows/foresight-capture.md](workflows/foresight-capture.md) / [workflows/foresight-sweep.md](workflows/foresight-sweep.md) | §3.12 triggers |
| Routing | `subagent-orchestration` + shared/model-routing.md | before every dispatch (§4.5) |
| Doc governance | [workflows/doc-governance.md](workflows/doc-governance.md) | Markdown-touching waves |

## Wave-Pattern Examples

Historical wave shapes (M9-M17): keystone unblock chains, generator-barrier holds, mixed glue+worker waves, stranded-finding sweeps. See `ai/curaos/docs/ISSUE-ROADMAP.md`; never copy literal issue numbers from examples.

## Research Basis

Anthropic orchestrator-worker pattern; Cognition context-isolation (one writer per tree); GitHub native sub-issues/dependencies as durable dependency truth; RP-04/RP-05/RP-18/RP-34/RP-39/RP-47/RP-78 findings encoded above; `scripts/workflow-truth-contract.test.js` pins this prompt's load-bearing wording.
