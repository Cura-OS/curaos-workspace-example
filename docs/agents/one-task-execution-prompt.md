# One-Task Execution Prompt

Compact runbook for one CuraOS issue. Queue picks task. Task then gets local SQLite tracking, plan, adversarial grilling, prototype when needed, TDD, proof, closeout.

> **Deterministic executor:** the [`task-execute`](workflows/task-execute.md) workflow implements this runbook's happy path (context-load -> branch -> tdd-implement + Generator-Evolution -> PR) with programmatic gates. Agents must invoke `task-execute` first when their harness exposes a committed workflow runner (see [workflows.md](workflows.md)): Claude Code uses `Workflow({ scriptPath: "scripts/workflows/task-execute.workflow.js", args: { issue: "OWNER/REPO#N" } })`; Codex/Antigravity/Grok/OpenCode/Pi use `agent-workflow-kit workflow-run task-execute --args-json '{"issue":"OWNER/REPO#N"}' --json`. Hermes or any harness without that runner executes this same runbook natively with its strongest available tools (`todo`, `delegate_task`, terminal, file tools) after recording the runner gap in local issue evidence. This prompt remains the canonical spec + cross-CLI runbook. Manual execution is fallback only when the workflow is unavailable, returns `needs-user`, or reports a concrete `workflow-defect`; the workflow must satisfy this prompt, not replace it.

## Goal Setter

```text
/goal Finish one unblocked CuraOS issue from the GitHub queue using docs/agents/one-task-execution-prompt.md and the strongest worker execution path the active harness exposes: Claude native Workflow, Agent Workflow Kit `workflow-run`, Hermes native `todo` plus `delegate_task` plus terminal/file tools, Codex adapter, or generic playbook execution. Pick from current tracker truth, handle deps + subtasks, plan, adversarial-grill, prototype high-fidelity unknowns, implement with TDD, and verify against real deps. Use `.scratch/state/symphony-work/local-issues.sqlite` as the worker evidence spine: create or find a local row for the selected/received issue, link to the wave parent with `parent_id` when dispatched, and attach child rows for split, blocker, verification, closeout, and follow-up lanes when the work branches. If the issue is a Story that splits, partition the sub-Tasks for MAXIMAL parallelism - each owning a distinct git working tree so the orchestrator can fan them out concurrently (lane count uncapped; only same-working-tree sub-Tasks serialize). Update tracker + docs. Resolve the PR properly at closeout: a PR is done only when every reviewer thread is resolved and no `needs-human` thread is open - then, if it merged, clear its inbox notification through the safe gate `bash "$WORKSPACE_ROOT/scripts/pr-notification-gate" --apply OWNER/REPO N` (clears only when terminal + threads-resolved + no `needs-human`; on BLOCK exit 3 capture the live finding into a follow-up issue + resolve the thread first, then re-run - never force-clear), restore the affected checkout to its default branch with a clean status, and report `NOTIFICATION: <cleared|left-needs-human|n/a>` plus `WORKSPACE_READY: <clean|stashed|blocked|n/a>`. Stop at done/split/blocked/awaiting-auto-merge only.
Persistent workflow first: after selecting or receiving the issue, invoke the committed `task-execute` executor when the current harness can run it (`Workflow({ scriptPath: "scripts/workflows/task-execute.workflow.js", args: { issue: "OWNER/REPO#N" } })` in Claude; `agent-workflow-kit workflow-run task-execute --args-json '{"issue":"OWNER/REPO#N"}' --json` in Codex/Antigravity/Grok/OpenCode/Pi). If the executor is unavailable, the harness has no runner, or it returns a concrete defect, record `workflow-defect` or `runner-unavailable` in the local SQLite row and continue this runbook natively from the failed gate; do not skip the executor silently.
gh invocation + script-path + REST/GraphQL quota conventions are canonical in docs/agents/shared/gh-conventions.md and BINDING for every `gh` command and `bash scripts/<name>` below (commands omit the `env -u GITHUB_TOKEN` prefix for readability).
```

## Prompt

```text
Use docs/agents/one-task-execution-prompt.md.

Mission:
Finish exactly one CuraOS issue. No hardcoded milestone. No hardcoded issue number. No hardcoded target version. Use the active harness's best available worker execution path while preserving the same gates. GitHub queue + Project status (including the `Target Version` field, per [[curaos-version-planning-rule]]) decide current task; local SQLite records machine progress and evidence before any explicit GitHub sync.

Modes:
- Standalone: no issue provided. Pick, claim, branch, execute exactly one issue.
- Dispatched: orchestrator provides `ISSUE`, `AGENT_ID`, `WORKTREE`, `BRANCH`, `OWNED_PATHS`, and `PR_TARGET`. Do not pick another issue. Do not create a second claim. Verify provided claim/branch, then execute only that issue.

Truth:
- Queue/status: GitHub issue body/comments + Project `CuraOS Roadmap`.
- Local work state: `.scratch/state/symphony-work/local-issues.sqlite` rows and evidence; markdown is a human mirror only.
- Architecture: `ai/rules/`, ADRs, `ai/curaos/CONTEXT.md`, module `CONTEXT.md`, module `Requirements.md`.
- Handover: `ai/curaos/docs/HANDOVER.md`, `ai/curaos/docs/ISSUE-ROADMAP.md`.
- Code: repo files, tests, build config.
- Ordering tie-breaker: GitHub Project + issue deps win. HANDOVER/ISSUE-ROADMAP mirror state only.

Forbidden:
- no issue pickup skip
- no code before readiness + plan
- no user question before docs/code or adversarial agent
- no user escalation when a recommended answer exists (auto-apply per `ai/rules/curaos_recommendation_auto_apply_rule.md`); escalate only when (a) no recommendation exists, (b) action is irreversible/destructive/T3, or (c) scope is unapproved
- no stale example as current task
- no done claim without evidence
- no chat-only worker state; selected issue, split, blocker, verification, closeout, and follow-up lanes get local SQLite rows when practical
- no subagent/reviewer/planning worker inheritance of parent model or parent effort by default
- no subagent/reviewer/planning worker dispatch without explicit model + effort from `ai/rules/curaos_model_tiering_rule.md`

Escalation triggers:
- T3 hard blockers from `ai/rules/curaos_verification_stack_rule.md`: `ai/rules/*` change, PHI field add/remove/rename, RBAC/ABAC/access-control logic, schema DROP / ALTER COLUMN, main/master push, force push shared branch, prod credential rotation, external API mutating state, destructive ops, service file deletion, unverified submodule pointer bump
- Ask-user gray areas: paid/vendor lock-in, cross-milestone ordering conflict, irreversible architecture choice not already resolved by rule/ADR

0. Setup
- Create `/goal` if harness supports goals.
- Select and record the worker execution path: Claude native Workflow, Agent Workflow Kit `workflow-run`, Hermes native `todo` plus `delegate_task` plus terminal/file tools, Codex adapter, or generic playbook. Prefer the strongest verified path available in the current harness; do not require another harness just because an example names it.
- Create or find a local row for the selected or provided issue in `.scratch/state/symphony-work/local-issues.sqlite`. If dispatched by a wave, attach it to the wave main issue with `parent_id`; create child rows for split, blocker, verification, closeout, and follow-up lanes when the work branches. Store evidence refs there before relying on chat, markdown mirrors, or GitHub sync.
- After claim, post heartbeat before every major gate and before/after any wait expected to exceed 15 minutes:
  `gh issue comment <n> --repo <owner/repo> --body "STATUS: heartbeat AGENT_ID=${AGENT_ID} BRANCH=<branch> HEARTBEAT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"`
- Track plan:
   - queue
   - selected issue
   - readiness
   - adversarial grill
   - prototype if needed
   - implementation plan
   - TDD
   - verification
   - closeout

1. Queue Pick
1. Read context: `AGENTS.md`, `CLAUDE.md`, `ai/rules/README.md`, `ai/rules/curaos_model_tiering_rule.md`, `ai/rules/curaos_cli_agents_rule.md`, `ai/rules/curaos_generator_evolution_rule.md` (including "In-flight generator/SDK barrier" section - downstream-milestone dispatch is blocked while a generator/SDK lane is in-flight; if dispatched against you in violation, surface immediately as `BLOCKER: inflight-generator-sdk-barrier <issue-url>` per the rule's Recovery section), `ai/curaos/AGENTS.md`, `ai/curaos/CONTEXT.md`, `ai/curaos/Requirements.md`, `ai/curaos/docs/HANDOVER.md`, `ai/curaos/docs/ISSUE-ROADMAP.md`, `docs/agents/issue-tracker.md`, `docs/agents/github-roadmap-project.md`. When the issue scope touches generated/scaffolded code (NestJS service, frontend app, contract package, BPM workflow, SDK), also read `curaos/tools/codegen/README.md` + `ai/curaos/tools/codegen/{AGENTS,CONTEXT,Requirements}.md` so the Generator-Evolution Gate (§8.75) does not surprise you at closeout.
   > Lane context bundle (RP-50): when dispatched from a wave, read `.scratch/<lane-slug>/context-bundle.md`
   > FIRST (lane slug = the issue ref lowercased, non-alphanumerics to `-`); it carries the plan row,
   > the module's mirror-doc context resolved once at plan time, and the PRE-CODING ANCHORS
   > (naming / contract / no-dash invariants from Requirements.md) you must confirm BEFORE writing
   > any file. If the bundle is absent (standalone run or fail-soft skip), fall back to the canonical
   > context-load read list; the anchors still bind.
2. Run `git status --short`; protect unrelated work.
3. Refresh index if stale: `node scripts/seed-github-roadmap.js --index-only`.
4. If `ISSUE` is provided by an orchestrator, skip queue query and use only that issue. Else query ready queue:
   `gh search issues --owner your-org --state open --label ready-for-agent --json repository,number,title,labels,assignees,updatedAt,url --limit 50 --jq 'map(select((.labels|map(.name)|any(startswith("agent-claimed:") or .=="agent-PR-open" or .=="blocked" or .=="ready-for-human"))|not))'`
5. If `ISSUE` is not provided, pick first unblocked issue by Project order + issue deps. HANDOVER advisory only.
6. Read full issue + comments: `gh issue view <n> --repo <owner/repo> --comments`.
7. Claim fast with runtime label, unless dispatched:
   - Standalone mode: set unique `AGENT_ID=<harness>-<8-plus-hex>` from `uuidgen` or `openssl rand -hex 4`, create label, then claim:
     `gh label create "agent-claimed:${AGENT_ID}" --repo <owner/repo> --color 5319E7 2>/dev/null || true`
     `gh issue edit <n> --repo <owner/repo> --add-label "agent-claimed:${AGENT_ID}" --remove-label "ready-for-agent" --add-assignee @me`
   - Dispatched mode: use provided `AGENT_ID`; verify issue already has `agent-claimed:${AGENT_ID}`. If `ready-for-agent` is still present, remove it. Do not add another `agent-claimed:*`.
8. Re-fetch issue. Continue only if exactly one `agent-claimed:*` label exists and it equals `agent-claimed:${AGENT_ID}`.
9. If race detected:
   - Standalone mode: sort all `agent-claimed:*` labels. Lowest lexical label keeps claim. Losers rollback, sleep random 5-30s, then pick next issue:
     `gh issue edit <n> --repo <owner/repo> --remove-label "agent-claimed:${AGENT_ID}" --remove-assignee @me`
   - After rollback, re-fetch labels. Restore `ready-for-agent` only when no `agent-claimed:*` and no `agent-PR-open` labels remain.
   - Standalone winner waits 30s and re-fetches. If losing labels remain and have no heartbeat/branch/PR, remove losing labels; otherwise return `STATUS: blocked`, `BLOCKER: claim-race-active`.
   - Dispatched mode: do not mutate labels; return `STATUS: blocked`, `BLOCKER: claim-mismatch`.
10. Branch before edits:
   - Dispatched mode: switch to provided `WORKTREE` + `BRANCH`; do not create a second branch.
   - Standalone mode: create/switch branch before edits: `agent/<type>-<module>-<slug>-<agent-id>`.
   - Before edits, verify branch is unique on remote: `git ls-remote --exit-code --heads origin <branch>` must return no match.
   - After branch chosen, heartbeat claim:
     `gh issue comment <n> --repo <owner/repo> --body "STATUS: claimed AGENT_ID=${AGENT_ID} BRANCH=<branch> HEARTBEAT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"`

2. Readiness Gate
Issue must match `docs/agents/issue-tracker.md` issue body + label contract:
- canonical frontmatter
- Scope / Do not touch / Acceptance / Verification / Docs
- exactly one category label + one state label
- close condition

If missing/too broad:
- invoke skill `to-issues` to split vertical slices.
- invoke skill `to-prd` only if selected item is product/epic scope.
- Stop after split with parent + child links.

2.5 Hierarchy + Metrics Gate
Classify selected issue:
- Initiative: strategy/theme. Do not code. Ensure linked Epics exist.
- Epic: PRD scope. Use skill `to-prd` if PRD sections missing/stale.
- Story: demoable vertical slice. Prefer one PR target.
- Task: atomic AFK/HITL work item under Story. Can have own PR only when independently reviewable.
- Bug: defect with repro, expected behavior, regression test. Can have own PR when fix is isolated.
- Spike: research/prototype only. Ends with findings + next issue(s), not production code.

Use skill `to-prd` when:
- issue describes product capability, cross-module feature, or big bug class
- no Problem/Solution/User Stories/Implementation Decisions/Testing Decisions/Out-of-Scope
- user value or success metric unclear

Use skill `to-issues` when:
- PRD/Epic needs Stories
- Story needs sub-Tasks for parallel subagents
- bug fix spans multiple independent failure modes
- work has >1 independently verifiable target metric
- one PR would mix unrelated review surfaces

When splitting, **partition for MAXIMAL parallelism**: carve sub-Tasks so each owns a distinct git working tree (different submodule, or non-overlapping owned-path within one) - the more collision-free sub-Tasks, the wider the orchestrator can fan out (lane count is uncapped; only same-working-tree sub-Tasks serialize, per [[curaos-swarm-collaboration-rule]]). Prefer many small independent sub-Tasks over a few broad ones that collide. Record each sub-Task's owned working-tree root in its Scope so the orchestrator's partition is unambiguous.

Every generated child issue must include:
- Parent issue link
- Issue type: Story/Task/Bug/Spike
- Target metric: required only for Task dispatched to parallel subagent; otherwise acceptance criterion is target
- Subagent routing seed: role, task class, recommended effort, routing source `ai/rules/curaos_model_tiering_rule.md`. Do not hardcode a model in durable issue body unless dispatching immediately; orchestrator derives explicit current-harness model at dispatch.
- Scope + Do not touch
- Inputs: docs, ADRs, prototypes, deps
- Output artifact: code, docs, test, research, prototype, config
- Acceptance criteria: outcome-focused, testable
- Verification command(s)
- Blocked by / Requires
- PR target: parent Story PR, own PR, or no PR

PR target rule:
- Prefer one PR per Story.
- Child Tasks may land in same Story PR when tightly coupled.
- Big Task/Bug gets own PR when independently reviewable and has complete acceptance/verification.
- Never create PR per micro-task if review value is lower than coordination cost.

2.6 Stranded-Gate Short-Circuit (binding, before any plan/research/TDD)
If the issue is a dependency-cleared / formerly-`blocked`/`foresight` (A) slice (its `blocked-by:` deps now all closed), it may already have been SHIPPED in a prior session and only kept its `blocked` label because the deps were open then. CHECK disk FIRST, before the Research Gate or any TDD:
- locate the named artifact (`git ls-files | grep <file>` / `fd <file>`), and if present run its OWN verification (`shellcheck`, `bun test <path>`, the issue's Verification command).
- If it already exists AND passes: do NOT re-implement. Skip the Research/Plan/TDD steps (3 through 7), jump straight to the Verify step (§8) to capture the green evidence, then Closeout (§9) = close the issue + strip `foresight`/`blocked`/state labels (a CLOSED issue carries zero state labels) + record any operator-gated remainder as a `ready-for-human` (B) issue per [[curaos-foresight-rule]].
- Only proceed into the normal Research/Plan/TDD path when the artifact is MISSING or its tests FAIL.
WHY: both #516(A) (values-demo.yaml) and #517(A) (ga-install-from-scratch harness) were already shipped in prior sessions; the correct action when the dependency-cleared scan surfaced them was verify + close, NOT re-dispatch a worker to redo done work.

2.75 Subagent Routing Gate
Before invoking adversarial agents, review agents, or any split/planning/implementation subagent:
- Invoke `subagent-orchestration`.
- Apply the canonical routing rules in docs/agents/shared/model-routing.md (explicit role + task class + model + effort; no inheritance; current-harness only; effort mapped from issue/frontmatter effort after role/risk; PHI floor; blocked fallback `BLOCKER: explicit-model-effort-unavailable`).
- Record routing in plan/output: `ROUTING: <role/task_class/model/effort/routing_source>` (harness invocation examples live in shared/model-routing.md).

3. Research Gate
Before new feature/decision code, persist research:
- competing/analogous platforms or patterns
- exact libraries/packages reducing custom code
- integration map: producers, consumers, must-not-break files, exact paths, data flow

Write:
- `ai/curaos/docs/research/YYYY-MM-DD-<topic>.md`, or
- module mirror research path when module-specific.

4. Adversarial Grill Gate
Run after issue selected, before final implementation plan.

Default: do not grill user. Use opposite harness read-only.

Commands:
- Codex -> Claude:
  Run the workflow path, not an unbounded raw shell call:
  `agent-workflow-kit workflow-run opposite-harness-grill --args-json '{"subject":"<subject>","opposite_harness":"claude","opposite_harness_agent":"<codex-plugin-claude-rescue-agent>","probe_timeout_ms":20000,"grill_timeout_ms":600000}' --json`
  The workflow owns the `harness-probe`, bounded timeout, report persistence, and `GRILL: blocked-harness-unavailable` fallback if the opposite harness is unavailable.
- Claude -> Codex:
  Run the workflow path, not an unbounded raw shell call:
  `agent-workflow-kit workflow-run opposite-harness-grill --args-json '{"subject":"<subject>","opposite_harness":"codex","probe_timeout_ms":20000,"grill_timeout_ms":600000}' --json`
  The workflow probes `codex` and returns `GRILL: blocked-harness-unavailable` with evidence when the CLI/auth/model path is unavailable or timed out.

Rules:
- reviewer cannot edit
- timeout/failure/nonconforming output -> `STATUS: blocked`, `BLOCKER: adversarial-review-unavailable`
- reviewer critical flag -> ask user before code
- implementer can overrule non-critical reviewer concern only with docs/code citation
- **Grill report location (binding):** opposite-harness grill verdicts go to `ai/curaos/docs/grills/<milestone-story>-pr<num>.md`. NEVER write to `.scratch/` (orchestrator lane-state only; wiped by worktree cleanup). See `ai/curaos/docs/grills/README.md` for the template + lifecycle. Reuse existing file if grilling the same PR (re-grill appends a `## Re-grill verification` section); otherwise create new file.

Ask adversarial agent for only:
- missing questions
- docs/ADR conflicts
- glossary conflicts
- hidden deps/subtasks
- prototype candidates
- decision points with recommended answers from docs/code (implementer auto-applies these per `ai/rules/curaos_recommendation_auto_apply_rule.md` + logs each to `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`; do NOT label as user-escalation candidates when a recommendation exists)
- genuine trade-offs only (no recommendation, OR irreversible/destructive/T3, OR unapproved scope) - these are the only valid user-escalation candidates

Routing:
- Adversarial grill is a judgment lane. Use explicit high/xhigh effort and strongest current-harness model available for the risk level.
- For Codex -> Claude or Claude -> Codex opposite-harness grills, cross-harness use is allowed only because this prompt explicitly requires adversarial opposite-harness review. Still set the invoked agent's model/effort explicitly when the harness supports it.

Resolve:
- docs/code answer exists -> auto-apply the recommendation, record `(auto-applied per recommendation, 2026-05-29 directive)` + a row in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`, cite path; do NOT ask user (per `ai/rules/curaos_recommendation_auto_apply_rule.md`)
- domain term resolved -> invoke skill `grill-with-docs`; update relevant `CONTEXT.md` glossary only
- hard-to-reverse + surprising + real tradeoff -> ADR via skill `grill-with-docs`
- unresolved non-critical -> conservative documented assumption
- unresolved critical, no recommendation -> ask user one question
- unresolved critical, recommendation exists but action is irreversible/destructive/T3 -> ask user one question, state the recommendation, confirm before proceeding

Escalation triggers bypass "no user question" rule ONLY when no recommendation exists, or the action is irreversible/destructive/T3, or scope is unapproved. If a reviewer marks a point as a user-escalation candidate but also supplies a recommended answer, auto-apply the recommendation (+ log it) and do NOT ask.

5. Prototype Gate
Prototype high-fidelity unknown before final plan.

Use skill `prototype` when:
- UI/UX interaction has viable options
- state machine/routing/data-flow unclear
- dependency behavior uncertain and cheap to spike
- performance/scale claim needs proof

Prototype rules:
- throwaway, clearly named
- one command
- no persistence unless persistence is question
- show full relevant state
- compare options when options exist
- capture verdict in issue/comment/research note
- delete or absorb before closeout

6. Task Plan
Before edits, write compact issue-specific plan:
- target behavior
- public interface
- in-scope files/modules
- deps/subtasks
- target metric + PR target
- data/event flow
- tests
- impact map: upstream/downstream symbols/services, must-not-break files, downstream tests
- verification commands
- docs updates
- rollback/blocker path
- **rolling-update check** (`ai/rules/curaos_rolling_update_rule.md`, BINDING): any schema/API/runtime change lands IN PLACE via forward migration + feature flag + semver bump. NO `-v2`/`-next`/`*-new`/`*-replacement` parallel paths, no Strangler-Fig-with-separate-paths, no cutover-archive subtasks. Add-new-alongside-old + backfill + dual-write behind a flag + telemetry-gated drop; document the recovery procedure.

If plan exposes new deps/subtasks, return to skill `to-issues`.

7. Implement With `tdd`
Invoke skill `tdd`.

Loop:
1. pick one impact-map node
2. one public behavior test for that node
3. run narrow test; capture RED
4. minimal code
5. run narrow test; capture GREEN
6. repeat
7. refactor only while green

No bulk test batch. No speculative API. No weakened gate.

8. Verify
Run:
- issue verification commands
- tests for every downstream module in impact map
- **the canonical local CI gate per docs/agents/shared/local-ci-gate.md (binding)**: every BLOCKING gate in `curaos/ci-gates.yaml` via `just ci` (or `just ci-service <name>` / `just ci-changed`; `bash curaos/scripts/ci-local.sh` without `just`), plus a green `node scripts/check-ci-gates-sync.js` drift proof. GitHub auto-CI is OFF; the LOCAL gate IS the merge gate. Do NOT hand-pick a frozen command list; the config drives the runner.
- docs: `bun scripts/check-doc-graph.js --write` then `bash scripts/check-docs.sh` when Markdown changed
- security checks when touched area requires: `gitleaks`, `semgrep`, `bun audit`, rule-specific scans
- `git status --short`
- `git diff --stat`

8.1 VERIFICATION Evidence (MANDATORY - verbatim stdout, no summarizing)

Binding per `ai/rules/curaos_swarm_collaboration_rule.md` §Worker-brief verification evidence + issue #156 (L2 workers over-claim `bun run ci`; isolated-worktree dep resolution + CI-vs-interactive env detection silently mask failures, so a summarized "N pass / 0 fail" is NOT evidence).

> The merge gate is this verbatim LOCAL CI evidence, not a green GitHub check (auto-CI OFF; canonical mechanics + manual-dispatch escape hatch: docs/agents/shared/local-ci-gate.md; full procedure `ai/curaos/docs/ci-local.md`).

For every verification command, paste the LAST 15 lines of its combined stdout+stderr into the closeout STATUS comment under a fenced code block. Run each from the EXACT worktree path and print the path + the command on the line above each paste. **The LIST of commands to paste = the BLOCKING gates from `curaos/ci-gates.yaml`** (the single source of truth - do NOT paste a frozen hardcoded set; paste whatever the config currently marks `blocking: true` for the touched scope). For a typical service/package change that is:
- `bun run typecheck`
- `bun run ci` (or `just ci` from the `curaos/` root - the `aggregate-ci` gate = turbo lint+typecheck+test+build; the default merge gate now that GH auto-CI is OFF)
- `bun run depcruise` (the `depcruise` module-boundary gate)
- `node scripts/check-ci-gates-sync.js` (the `ci-gates-sync` self-gate - its green output proves the local gate definition == the dispatch-only GH workflow definition, i.e. a green local run truly simulates CI)
- `bun test test/<bucket>` - one paste per test bucket touched (each `aggregate-ci`-covered bucket your change exercises)

The authoritative list is `ci-gates.yaml`, not this enumeration - if the config gains/changes a blocking gate, paste that one instead. GH auto-CI being `workflow_dispatch`-only means these LOCAL pastes ARE the merge gate; there is no green GitHub check behind them.

Rules:
- NO "all tests pass" / "exit 0" summary in place of the paste. The actual exit code MUST appear on the last line of each paste (e.g. emit `echo "exit=$?"` immediately after the command).
- If any test was SKIPPED, the paste MUST include the skip notice (do not strip it).
- If any test ERRORED, the paste MUST include the TypeError/stack frame, not a count.
- The pasted counts (pass/fail/skip/error) are the claim of record. A summarized count without its backing paste is treated as no evidence and fails this gate.
- The orchestrator re-runs the SAME commands at the SAME path (milestone-orchestration-prompt §7.1). Pastes must match within ±2 tests (flaky-but-rerun-stable tolerance). A larger divergence is an over-claim: the issue is re-claimed for a fix cycle and labeled `agent-overclaimed`.

Do not proceed to §8.25 Branch + Commit until the VERIFICATION pastes exist for every blocking gate in `curaos/ci-gates.yaml` for the touched scope (typecheck + ci + depcruise + ci-gates-sync + every touched bucket).

8.2 Local Deterministic Self-Review (cheap local review BEFORE the PR; executor mirror: `scripts/workflows/tdd-implement.workflow.js` step 4.5)
Catches style/reuse/obvious-bug findings so the downstream cross-harness grill spends its tokens on deep adversarial verification, not the cheap stuff:
- Run Semgrep CE when available and limit blocking findings to high or critical findings on changed lines.
- If Semgrep is unavailable, record `verdict=unavailable` and continue; do not call paid external review services.
- Fix genuine findings (style, reuse, obvious bugs) WITHIN the owned paths under the same 3-cycle cap as the T1 gate; re-run `bun run ci` after fixes to keep it green. Ignore false positives; cosmetic-only findings you disagree with: note + skip.

8.25 Branch + Commit
- confirm not on `main`/`master`
- stage only task-owned changes
- commit with `type(scope): imperative summary`
- no `Co-authored-by:`, `Generated-by:`, `AI-assisted-by:`, `Agent-ID:`, `Agent-Model:`, `Task-Issue:`, `Worktree:`, or similar AI/tool attribution trailers
- `<base-ref>` = PR target tracking ref, usually `origin/main`
- trailer check over all branch commits must return no matches:
  `git log <base-ref>..HEAD --format=%B | git interpret-trailers --parse | rg '^(Co-authored-by|Generated-by|Generated-with|AI-assisted-by|Agent-[A-Za-z0-9-]+|Task-Issue|Worktree):'`
- push branch: `git push -u origin <branch>`

8.5 PR Review + Merge Gate
Run when PR target is not `no PR`.

Worker-owned (do these here):
- create the PR: one per Story preferred; own PR for independently reviewable Task/Bug. Body includes issue link, scope, target metric, RED/GREEN, verification, GRILL, PROTOTYPE, impact map. Conventional Commit titles; no AI attribution trailers (per AGENTS.md §8).
- no direct push/merge to `main`/`master`; never `--admin`/force-push/bypass protection (worker-side ABSOLUTE ban, intentionally stricter than the orchestrator's three-condition `--admin` carve-out in milestone-orchestration-prompt; only the orchestrator may exercise that carve-out).
- after PR opens, transition label:
  `gh label create "agent-PR-open" --repo <owner/repo> --color 006B75 2>/dev/null || true`
  `gh issue edit <n> --repo <owner/repo> --add-label "agent-PR-open" --remove-label "agent-claimed:${AGENT_ID}"`

Review + merge mechanics - run the [`pr-verify-merge`](workflows/pr-verify-merge.md) workflow (T2 3-lens review + adversarial grill + programmatic merge gate per `ai/rules/curaos_verification_stack_rule.md`); it owns the 3 lenses (Security/Architecture/QA, each routed per the Subagent Routing Gate), the cross-harness verifier option, and the fix loop (3-cycle cap -> escalate via the Escalation triggers above, 4 typed decisions Approve/Edit/Reject/Respond). The binding merge gate (review-settled precondition, thread resolution, REST-vs-`gh pr merge` mechanics, `mergedAt` verification, RP-18 post-merge branch-deletion proof) is canonical in docs/agents/shared/pr-merge-gate.md; non-Claude workers follow it directly. If auto-merge pends after watch timeout: `STATUS: awaiting-auto-merge` + re-entry command. With GH auto-CI OFF the merge precondition is the §8.1 LOCAL CI evidence (`gh pr checks --watch` semantics: docs/agents/shared/local-ci-gate.md).

8.75 Generator-Evolution Gate (MANDATORY when work touches generated/scaffolded code)

Per `ai/rules/curaos_generator_evolution_rule.md`: every uncovered edge case inside a generated service/package MUST feed back into the corresponding generator. Local-only hot-fixes are forbidden - they leave the mold defective so the next service hits the same wall.

Trigger this gate when any of these holds for the current Story:
- Issue body lists "generated", "scaffold", "codegen", or "template" in Scope, OR
- Owned paths include `curaos/backend/services/<name>/` or `curaos/frontend/{apps,packages}/<name>/` where the package was created by `curaos/tools/codegen` (any service whose `package.json` carries `"codegen.source": "@curaos/codegen"` or whose initial commit subject contains `codegen scaffold`), OR
- During implementation you patched a file that was emitted by the generator (anything under `templates/` shape - controller / module / service / drizzle.config.ts / lefthook.yml / .npmrc / agent doc / migration scaffold).

Steps:

1. **Diff classification** - for each file you modified, classify:
   - `intentional-new` - net-new product code that the generator was never expected to emit (e.g. business logic specific to this Story). No generator action needed.
   - `template-divergence` - modifications to a file the generator produced where the change applies to EVERY future scaffold (missing import, missing config, missing CI guard, drift from rules). Generator update REQUIRED.
   - `local-only-justified` - change applies ONLY to this service due to a genuinely service-specific concern. Document in PR body with reasoning + link to a follow-up issue if reasoning is fragile.

2. **Decide scope** for every `template-divergence`:
   - Trivial template typo / single emitter logic flaw → fix the template under `curaos/tools/codegen/templates/...` OR the emitter under `curaos/tools/codegen/src/*-emit.ts` IN THIS PR, plus a snapshot test under `curaos/tools/codegen/__tests__/`. Bun-run `bun test --filter=@curaos/codegen --coverage` must stay ≥90% coverage (the M6 close-gate floor).
   - Multi-file refactor (new CLI flag, new playbook step, ts-morph wire extension, cross-layer trio sync, frontend↔backend parity) → file a follow-up issue against the codegen module with `priority=critical`, `parent=<this story's Epic>`, `requires=<this story>`, `agent-notes=<reproduction steps + edge case description>`; land the local fix in the current PR; orchestrator picks the generator-evolution lane up in the next batch via prompt §3.11.

3. **Trio symmetry check** - when the diverged file lives under `templates/service-core/`, verify the analogous file under `templates/service-personal/`, `templates/service-business/`, and any `templates/service-<vertical>-*/` overlay exists and carries the same fix. Asymmetric template fixes produce defective downstream services on the next regen. Snapshot tests MUST cover all three layers + any active vertical overlay.

4. **Frontend parity check** - when the analogous edge case applies to a frontend generator template (RN/Web/Tauri/`@curaos/ui`), either apply the same fix to that template OR file a parallel follow-up issue when the surfaces genuinely diverge. The reasoning lands in the PR body.

5. **Re-run codegen on a fixture** - before pushing, verify the generator emits the fixed output in a throwaway run:
   ```bash
   cd curaos
   bun run gen:service <smoke-name> --domain=<scope> --purpose="generator-evolution smoke" --dry-run \
     | grep -E "<sentinel-line>"
   ```
   The sentinel line is the new emission your template/emitter produced. If absent, the generator update did not bind.

5b. **Verify the RENDER, not just the values, and across ALL consumer profiles (binding).** When the generator output is consumed by more than one profile (e.g. an umbrella chart consumed by a demo-slice profile AND a full-bundle profile), a values/spec-file assertion is NOT enough: a parse-only test passes while the real render is wrong. EXERCISE the render (`helm dependency build` + `helm template`, `kustomize build`, codegen emit + `git diff`) and assert against the RENDERED manifest, for EACH profile, not only the one that surfaced the defect. Regenerate from the fixed generator, rework every consumer config, then re-render every profile: the defect-surfacing profile is not done until the sibling full-output profile is re-verified to still render its complete output. Any consumer test that only PARSES its input values gets upgraded to a render-exercising test in this same change set (per [[curaos-verification-stack-rule]] "Exercise generated output, never just parse it"). This is the #516 demo-slice class: the umbrella shipped 87 subcharts with no `condition:` gating, the demo-slice test asserted only its values keys and passed green for sessions while the real render emitted all 87.

6. **Comment back on the originating issue** with one line:
   ```
   GENERATOR-EVOLUTION: fix=<template|emitter|playbook|flag|ast|test> path=<repo-relative path> snapshot=<test path> trio=<core,personal,business,healthstack|n/a> frontend-parity=<n/a|same-pr|followup-#NNN> followup=<issue-url|none>
   ```

If you skip this gate while it should have fired, the orchestrator's §3.11 sweep WILL flag the closeout and the issue WILL be re-opened. Save yourself the cycle.

9. Closeout
Done:
- comment issue: summary, files, RED/GREEN, verification, docs, follow-ups
- include the §8.1 VERIFICATION pastes verbatim (last 15 lines + exit code of every blocking gate in `curaos/ci-gates.yaml` for the touched scope - `bun run typecheck`, `bun run ci`, `bun run depcruise`, `node scripts/check-ci-gates-sync.js`, and each touched `bun test` bucket) under fenced code blocks - a summarized count without its backing paste fails closeout and is treated as an over-claim
- include `GRILL: <opposite-harness|blocked>` and `GRILL-OUTPUT: <path/comment-url>`
- include `PROTOTYPE: <verdict-link|not-needed>`
- include `PR: <url|not-needed>` and `MERGE: <merged|blocked>`
- include `GENERATOR-EVOLUTION: <fix-summary|n/a>` (mandatory when §8.75 fired)
- include `FORESIGHT:` line(s) - any FUTURE or adjacent work you noticed but (correctly) did NOT do inline: out-of-scope debt, an improvement, missing context/spec, a risk, or a next-milestone prerequisite. ONE line per observation; `none` if you saw nothing. If the item is a relevant dependency for the current issue and can be handled within approved scope, do it or surface it as the current blocker instead of parking it as foresight. Otherwise, do not implement or file it yourself - emit the observation and the orchestrator routes it through `foresight-capture` (focused handoff -> focused subagent -> staged `foresight` issue). Shape: `FORESIGHT: kind=<debt|idea|context|risk|prereq> milestone=<target M-tag or unknown> scope=<repo/module> what=<one line> why=<consequence if not done>`. Capturing it here is how it survives /clear and reaches normal triage - an un-emitted observation is lost.
- include `UNBLOCKS:` line; the issues your merge frees so the orchestrator re-batches them into the NEXT wave's free lanes immediately (a merge frees a working tree AND may clear a dependent's `blocked-by`). List every issue that named THIS issue/PR in its `blocked-by`/`requires`, plus any same-tree work that was serialized behind you. Shape: `UNBLOCKS: <repo#N>[, <repo#N>...]` or `none`. This is how throughput compounds: the orchestrator's post-merge re-scan turns your `UNBLOCKS` into immediately-dispatchable lanes instead of waiting for the next full sweep.
- close only when close condition satisfied and PR `safe-to-merge-clean`: every reviewer thread is resolved AND no thread is escalated/tagged `needs-human` (a review thread left intentionally open for the user)
- `"merged" alone is insufficient` - a merged-state PR with an unresolved thread or an open `needs-human` thread is NOT a valid close; leave it open and surface the unresolved thread
- clear the inbox notification: once your PR is merged AND safe-to-clear, run the per-PR gate `bash "$WORKSPACE_ROOT/scripts/pr-notification-gate" --apply OWNER/REPO N` - canonical predicate, exit-code semantics, and quota-hold handling in docs/agents/shared/notification-hygiene.md. If you merged directly (not via `pr-verify-merge`, which clears its own), this is the ONLY thing that removes the PR from the user's inbox; never force-clear, leave a `needs-human` notification in place. Report `NOTIFICATION: <cleared|left-needs-human|held-awaiting-graphql-thread-check|n/a>`.
- **close-path label hygiene:** when your PR auto-closes its issue via `Closes #N`, strip the issue's workflow-state labels (`ready-for-agent`/`needs-triage`/`needs-info`/`ready-for-human`/`agent-PR-open`/every `agent-claimed:*`) - a CLOSED issue must carry ZERO state labels (only category `bug`/`enhancement` + markers `foresight`/`blocked` persist). One idempotent `env -u GITHUB_TOKEN gh issue edit N -R OWNER/REPO --remove-label ...` (reuse the same `--remove-label` idiom you used to flip `agent-claimed:*`→`agent-PR-open` earlier). If you merged via `pr-verify-merge`/`milestone-wave` it already stripped them; this covers a direct merge. Don't just clear the notification - strip the labels too.
- **workspace readiness:** after a merged PR, do not leave the local checkout on the merged/deleted branch. Fetch/prune, switch to the repository default branch (`main` unless `gh repo view --json defaultBranchRef` says otherwise), fast-forward pull, sync submodules if this is a parent workspace, and verify `git status --short --branch` is clean. If residue exists, preserve it with a named stash or land it through its own PR; do not discard it silently and do not report `STATUS: done` from a `[gone]` upstream branch. Report `WORKSPACE_READY: <clean|stashed:<stash-ref>|blocked:<reason>|n/a>`.
- update remaining Project/labels if automation missed
- update HANDOVER with next queue item
- final: `STATUS: done`, `ISSUE: <repo>#<n>`, `PR`, `MERGE`, `NOTIFICATION`, `WORKSPACE_READY`, `GRILL`, `PROTOTYPE`, `FILES`, `RED/GREEN`, `VERIFY`, `GENERATOR_EVOLUTION`
- include `ROUTING: <role/task_class/model/effort/routing_source>` for any spawned subagent/reviewer
- `GENERATOR_EVOLUTION` shape: `fix=<template|emitter|playbook|flag|ast|test|n/a> path=<repo-relative path or n/a> snapshot=<test path or n/a> trio=<core,personal,business,healthstack or n/a> frontend-parity=<n/a|same-pr|followup-#NNN> followup=<issue-url or none>`. Required whenever §8.75 fired.

Split:
- publish children, link parent/children, update index
- final: `STATUS: split`, `PARENT`, `CHILDREN`, `NEXT`

Blocked:
- comment exact blocker, remove own `agent-claimed:*` label, classify the blocker so the orchestrator's scan routes it right (label != disposition):
  - **dependency / milestone-gated** (waiting on another issue's PR, or a milestone not yet active): use the `blocked` marker label + frontmatter `blocked-by: [<ref>]`. Do NOT use `ready-for-human` for a dependency; it needs code/a merge, not the user. The scan picks it up the moment the dependency clears. `blocked` is an orthogonal marker label, never a state label: it always pairs with exactly one state label, real blockers also record `blocked-by` frontmatter + a native dependency edge, and triage/close-path hygiene preserve it (markers are never stripped).
  - **genuine user decision** (a trade-off with NO clear recommendation, an irreversible/T3 action, or unapproved scope): use `ready-for-human`; this means "the orchestrator must interview the user to unblock THIS wave," not "park forever" (per [[curaos-foresight-rule]]). State the exact question(s) the user must answer.
  - never leave a dependency-blocked issue labelled `ready-for-human` (that hides real dispatchable-once-cleared work behind a fake user gate) and never leave a real user-decision labelled `blocked` (that hides a needed interview behind a fake dependency).
- update HANDOVER
- final: `STATUS: blocked`, `ISSUE`, `BLOCKER`, `BLOCKER-CLASS: <dependency|milestone-gated|real-external|real-user-decision>`, `NEXT UNBLOCK`

Awaiting auto-merge:
- auto-merge enabled but PR not merged yet
- do not close issue
- do not unblock dependents
- final: `STATUS: awaiting-auto-merge`, `PR`, `NEXT CHECK`
```

## Skill Gates

| Gate | Skill | Use |
|---|---|---|
| Product scope | `to-prd` | selected issue is PRD/epic, not atomic work |
| Breakdown | `to-issues` | issue too broad or deps missing |
| Domain/ADR grill | `grill-with-docs` | adversarial pass finds glossary/ADR decision |
| Prototype | `prototype` | high-fidelity unknown needs proof/options |
| Implementation | `tdd` | atomic issue ready |
| PR review | `compound-engineering:ce-code-review` | PR T2 3-lens review when available |
| Generator-evolution | §8.75 + `ai/rules/curaos_generator_evolution_rule.md` | MANDATORY when work touched generated/scaffolded code - fold local fix back into `curaos/tools/codegen/` template/emitter/playbook/flag/AST/test in the same PR OR file `priority=critical` follow-up issue against codegen module; trio symmetry enforced |

## Opposite-Harness Grill Prompt

```text
Review selected CuraOS issue + local rules/docs as adversarial planning reviewer.
Do not implement.
Return only:
1. missing questions
2. docs/ADR conflicts
3. glossary conflicts
4. hidden deps/subtasks
5. prototype candidates
6. decision points with recommended answers from docs/code - implementer MUST auto-apply these (per `ai/rules/curaos_recommendation_auto_apply_rule.md`), not escalate; record each as `(auto-applied per recommendation)` + a row in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`
7. genuine user-escalation candidates - ONLY when (a) no recommendation exists, (b) action is irreversible/destructive/T3, or (c) scope is unapproved; if a recommendation exists it belongs in item 6, not here
Focus: make issue ready for one AFK implementation run.
```
