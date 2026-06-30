---
name: curaos-swarm-collaboration-rule
title: Swarm collaboration (bundle-first submodule lanes + GitHub Issues queue + uncapped collision-bounded lanes)
description: Swarm collaboration - task partition and lane packing by submodule boundary (91 submodules = natural ownership unit; one agent per submodule at a time, with compatible work bundled before adding agents; CODEOWNERS soft lock per [[curaos-repo-conventions-rule]]; pre-flight git merge-tree for cross-module conflicts); GitHub Issues canonical queue per [[curaos-mcp-stack-rule]] DA3 w/ work-queue state machine (canonical 11 labels per [[curaos-roadmap-workflow-rule]] PLUS ephemeral claim labels agent-claimed:<id>/agent-PR-open - see label-model section); lanes UNCAPPED (collision-bounded by git working tree + runtime min(16,cores-2) backstop; user directive 2026-06-03); physical isolation:worktree directories disk-bounded (prune + free-space monitor, no fixed count); trunk-based + agent/<type>-<module>-<slug>-<id> branches <24h per [[curaos-repo-conventions-rule]]; GitHub native merge queue (free, sufficient for solo dev; upgrade Mergify at >20 PRs/day); LiteLLM proxy ADOPTED w/ Presidio PHI scrub per [[curaos-agent-eval-obs-rule]] DA11 (AMENDMENT overrides original DA9 NO-gateway; per-tenant cost attribution deferred v2/v3 product per [[curaos-model-tiering-rule]] DA5); coordination via GitHub Issues + PR comments + Conventional Commit issue refs (shared state); A2A protocol available NOT auto-routed; no AI/co-author commit trailers
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA9 - grounded in [[curaos-cli-agents-rule]] DA1 + [[curaos-mcp-stack-rule]] DA3 + [[curaos-repo-conventions-rule]] DA8 + [[curaos-model-tiering-rule]] DA5).

## The rule

Seven locked components:

1. **Task partition and lane packing by submodule boundary** - 91 submodules = natural ownership unit; one agent per submodule at a time, with compatible work bundled for that owner before adding more agents
2. **GitHub Issues canonical work queue** w/ work-queue state machine (canonical 11 labels per [[curaos-roadmap-workflow-rule]] PLUS ephemeral claim labels)
3. **Lanes UNCAPPED (collision-bounded)** - bounded only by the git-working-tree collision unit + the runtime `min(16, cores-2)` backstop; physical `isolation:worktree` directories disk-bounded (prune + free-space monitor, no fixed number)
4. **Trunk-based + agent/<type>-<module>-<slug>-<id> branches <24h** + GitHub native merge queue
5. **Cost control gateway** - LiteLLM proxy ADOPTED w/ Presidio PHI scrub (SUPERSEDED by DA11 - see AMENDMENT NOTE below; original DA9 said NO LiteLLM); per-tenant cost attribution deferred v2/v3 product per [[curaos-model-tiering-rule]] DA5
6. **Coordination via GitHub shared state** (Issues + PR comments + Conventional Commit issue refs); A2A protocol available NOT auto-routed
7. **Lane size before lane count** - local issues can stay atomic, but dispatch lanes and PRs must be right-sized coherent deliverables before parallelism is increased

## Banned

- Grep bombing (use codegraph_search per [[curaos-mcp-stack-rule]])
- Duplicate task dispatch (atomic claim mandatory via agent-claimed:<id> label)
- Contradictory PRs (CODEOWNERS soft lock + pre-dispatch git merge-tree)
- Infinite loops (hard max_turns/max_tokens ceiling + verifier 3-cycle cap)
- Runaway destructive ops (T3 HITL per [[curaos-verification-stack-rule]])
- Micro-agent proliferation (3-question test before wrapping in agent)
- Micro-lane PR proliferation (one tiny fix per PR when same-owner work can safely ship together)
- Tool soup (per-session MCP activation per [[curaos-mcp-stack-rule]])
- Long-lived branches (trunk-based + <24h agent branches)
- Force push to shared branches (branch protection blocks)
- Amending pushed commits (new commits only)
- Bypassing LiteLLM proxy (proxy ADOPTED per DA11 AMENDMENT - see cost-control section; use proxy + Presidio PHI scrub)
- Per-tenant cost attribution at rule level (deferred per [[curaos-model-tiering-rule]])
- Linear / Jira as work queue (GitHub Issues canonical per [[curaos-mcp-stack-rule]])
- External shared memory store (Redis pub/sub etc.) - GitHub as shared state sufficient
- Auto cross-harness A2A routing (per DA1: explicit user request only)
- Codex defaulting to Agent Workflow Kit CLI orchestration. Codex must use internal harness tools, skills, subagents, and local issue rows unless the user explicitly requests the CLI path.
- Worktree count >10 (alert; disk explosion risk)
- GitFlow (use trunk-based at swarm scale)
- GitHub Copilot coding agent (paused new signups Apr 2026)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| Submodule boundary partition | 91 submodules = natural ownership unit; CuraOS structure already enforces it; minimal coordination cost |
| File-ownership prevents collisions | Agents touching overlapping files require merge conflict arbitration = costliest coordination mode |
| Lane count = UNCAPPED (collision-bounded only) | The lane limit is **working-tree collisions, not a fixed number**. With 91 submodules, many genuinely-independent lanes (different submodule checkouts / different repos) run concurrently with zero conflict - dispatch EVERY collision-free lane. The runtime's own `min(16, cores-2)` per-workflow concurrency backstop throttles actual execution + queues the rest, so an "uncapped" partition never overruns hardware. The old "cap at 8-10" (Zylos 2026) measured *physical-worktree* operational overhead, NOT lane count for shared-checkout dispatch - it does not bind lanes that share or isolate cleanly by working tree. (User directive 2026-06-03: maximize lanes/agents wherever conflict-free.) |
| Physical-worktree disk guard (only when `isolation: worktree` is used) | 9.82GB consumed in 20min for 2GB codebase w/ 5 active *physical* worktrees (Penligent 2026). Applies ONLY to lanes that materialize a real `git worktree` on disk (the expensive `isolation: "worktree"` mode). NO fixed-number cap - bounded by **real available disk**: prune (`git worktree prune`) post-merge + monitor free space + stop spinning new physical worktrees when disk runs low. Shared-checkout serial lanes + isolated-submodule-checkout lanes do NOT create extra worktrees, so the disk guard does not bind them; they are bounded only by the collision rule + the runtime concurrency backstop. |
| GitHub Issues canonical | your-org has 93 repos on GitHub; existing triage-labels skill + GitHub Agentic Workflows Feb 2026 native trigger |
| Trunk-based at swarm scale | GitFlow long-lived release branches = contention points when 10+ agents merging daily; trunk-based + short-lived agent branches (<24h) is correct model |
| GitHub native merge queue free + sufficient | Solo dev volume; upgrade only when PR volume exceeds ~20/day (Mergify speculative execution + batching) |
| AI PR acceptance 32.7% vs human 84.4% | CodeAnt AI 2026 stat; PR Evidence checklist per [[curaos-repo-conventions-rule]] raises acceptance |
| AI PRs wait 4.6× longer for review | Automated merge queues essential, not optional |
| NO cost gateway for dev | Per user: dev phase doesn't need per-tenant cost attribution (deferred v2/v3 product per [[curaos-model-tiering-rule]]); each CLI calls own models per DA1; no cross-harness routing auto-applies |
| GitHub as shared state | Eliminates external shared memory store; Issues + PR comments + issue refs in commit messages carry coordination state |

## Task partitioning (locked: per submodule)

### Submodule boundary = natural ownership unit

| Partition unit | Collision risk | CuraOS fit |
|---|---|---|
| **One service / submodule** | Minimal - repo boundary isolates | **91 CuraOS submodules map cleanly** |
| One package/directory | Low - well-bounded | Monorepo internal layers (use CODEOWNERS) |
| One feature across layers | Medium - cuts across files in multiple dirs | Requires pre-flight conflict check |
| One story/issue w/ fuzzy scope | High - agents guess file ownership | Avoid w/o explicit file manifest |

### Lane sizing = bundle before parallelizing

Binding user directive 2026-06-30: Wave 0 was delayed by too-small agent slices. More lanes help only after lane size is sane.

For broad CuraOS waves, Codex and other skill-aware harnesses must load standalone `macro-subagent-orchestration` before dispatching workers. Do not also load the micro subagent skills for the same wave unless one lane is deliberately reduced to a narrow micro task.

Local tracker rows stay granular for scan, dispatch, verify, blocker, and follow-up evidence. Worker lanes and PRs do not default to that granularity. Before spawning agents, the orchestrator must pack compatible rows into the largest coherent deliverable that one worker can finish, test, and PR without colliding.

Default bundle rule:

- Group by same `owner_path`, target version, checkout, branch target, and verification surface.
- Include implementation, tests, docs, generated artifacts, fixture updates, follow-up fixes, and reviewer-confirmed nits for that owner in the same lane.
- Prefer one PR per coherent owner-path deliverable, not one PR per local issue row.
- Spawn more agents only after right-sized bundles exist. Increasing agent count without increasing slice size repeats the Wave 0 failure mode.
- If a candidate lane would touch only one trivial file or one tiny follow-up, hold it briefly and pack it with the next compatible same-owner lane unless it is an urgent build unblocker, security fix, pointer-chain PR, or explicitly requested micro-lane.

### Codex subagent cap shard fallback

Binding user directive 2026-06-30: if Codex `multi_agent_v1` refuses to spawn more than six live subagents despite config declaring a higher cap, do not shrink the planned lane set and do not retry the same failed spawn loop. Treat the observed six-agent ceiling as a harness runtime limit for that parent session.

Fallback:

- Keep the parent Codex session's six internal subagent slots filled with the highest-priority, collision-free macro lanes.
- Start one additional Codex CLI orchestrator shard with `codex exec` for each extra block of up to six collision-free lanes.
- Each shard must receive a complete macro lane brief: parent issue, child local issue rows, owner paths, checkouts, branch targets, non-owned paths, verification commands, and evidence/report path.
- Shards must use internal Codex harness behavior and local issue rows. They must not invoke Agent Workflow Kit CLI unless the user explicitly requests that path.
- Shards do not bypass pack-first lane sizing, the generator/SDK/contract barrier, owner-path collision rules, or no-drop git sync rules.
- Write shards need isolated checkouts or disjoint mutable working trees. Read-only scout shards may share the integration checkout.
- The parent orchestrator records the shard command, session or log path, assigned lanes, and verification result in `.scratch/state/symphony-work/local-issues.sqlite`.

One shard equals at most six worker lanes. For example, 18 useful lanes means six parent subagents plus two `codex exec` shard orchestrators. This is a runtime workaround only; it is not a reason to create micro lanes.

Allowed split reasons:

- Different git working tree or owner-path collision risk.
- Generator/SDK/contract barrier ordering.
- High-risk surface that needs isolated review, such as auth, data migration, PHI/PII, or destructive operations.
- Pointer-chain level. Pointer bumps stay separate and bottom-up.
- Runtime dependency, test environment dependency, or merge queue dependency.
- Explicit user instruction.

Every split smaller than the default bundle records `split_reason` in the local issue event. Missing split reason means the lane is over-fragmented and should be repacked before dispatch.

### Collision unit = the GIT WORKING TREE that gets mutated (NOT the file path, NOT the tracker repo) - BINDING

The partition collision unit is the **git checkout a worker will mutate**, not which files it edits and not which tracker repo the issue lives in. Two lanes that resolve to the SAME working tree MUST serialize (max 1 concurrent), because every `task-execute` worker checks out its branch inside that one shared checkout - a second worker's `git checkout`/`reset`/`stash` clobbers the first's branch, HEAD, and untracked files even when the two touch entirely different files.

- **All `curaos/tools/codegen/` (generator/mold) issues share ONE working tree** (`.git/modules/curaos`) - they are NEVER parallel-safe, regardless of which template/emitter/test file each edits. Serialize them (or give each an isolated `git worktree`). This is exactly the collision that tangled **#316/#319/#320** on 2026-06-03 (three codegen lanes dispatched in parallel into one curaos checkout → branch resets, stashed edits, a wiped test file, two fabrication-looking empty-diff verdicts, and an unpushed nested-submodule pointer; ~an hour of hand-untangle to recover all three into clean separate PRs). The shared **tracker** repo (curaos-ai-workspace) was a red herring - the shared **code** checkout (curaos) was the real collision unit.
- Two issues in the **same backend/frontend submodule** → same working tree → serialize.
- **Parent-repo** lanes (edit `.gitmodules`, submodule pointers, `ai/curaos/` docs, doc graph) → serialize with each other and with any submodule-pointer-bumping lane.
- **Two-level pointer-bump chain (BINDING ORDER):** when a fix lands in a NESTED submodule (e.g. `curaos-deploy`, itself a submodule of `curaos`), bump bottom-up, one focused PR per level, never skip a level. (1) Update the nested submodule to its merged `main`. (2) Commit the nested-pointer bump in the PARENT submodule (`curaos`) on its OWN branch + PR; merge that. (3) ONLY after step 2 merges, bump the parent submodule (`curaos`) pointer in the workspace repo as its own PR. Each bump is its own PR; NEVER mix a pointer bump with substantive code in the same PR. Verify each level synced before declaring done: run `git submodule status` (no `+`/`-` prefix at any level) at the workspace root. A skipped intermediate level leaves an unpushed nested-submodule pointer dangling (the failure mode that tangled the #316/#319/#320 codegen recovery on 2026-06-03).
- Pure **workspace-repo** lanes (write only `ai/curaos/docs/research/`, `ai/rules/`, ADRs - no curaos code) are parallel-safe with curaos-code lanes (different checkout); serialize among themselves only if they touch the doc graph / RESOLUTION-MAP.
- When unsure whether two lanes share a working tree, **serialize** - a false-serialize costs one wave; a false-parallel corrupts both lanes' git state. Enforced in `scripts/workflows/wave-prioritize.workflow.js` step 2.

### Mandatory pre-dispatch checks

```bash
# Check no agent currently claimed on this submodule
gh issue list --label "agent-claimed" --state open

# Pre-flight conflict detection (for cross-module work)
git merge-tree <branch-a> <branch-b>
```
Conflicts predicted → serialize, do NOT parallelize.

### CODEOWNERS soft lock (per [[curaos-repo-conventions-rule]])
`.github/CODEOWNERS` assigns directories to owner tokens (agent identities or human handles). Cross-ownership PRs require additional approval - soft lock for swarm partition enforcement.

### Ensemble pattern (parallel explorations)
Ambiguous design: 2-3 agents solve same problem independently; evaluator picks best. Reduces wall-clock time; accept 3× token cost.

### Pipeline pattern (sequential handoffs)
Stage 1 Analysis commits spec → Stage 2 Implementation reads spec + commits code → Stage 3 Review → Stage 4 Test. Each stage checks out previous stage's commit in same worktree branch.

## Work queue (locked: GitHub Issues + label state machine)

### Work-queue state machine

Canonical label set = 11 labels per [[curaos-roadmap-workflow-rule]] (5 triage + 4 execution + 2 category). This rule adds two **ephemeral, non-seeded** claim labels on top:

```
needs-triage → ready-for-agent → agent-claimed:<agent-id> → agent-PR-open → merged / failed
```

`agent-claimed:<agent-id>` and `agent-PR-open` are ephemeral runtime labels (not seeded, not part of the canonical 11). The triage state machine below is a subset view; canonical label definitions live in [[curaos-roadmap-workflow-rule]].

| Label | Type | Meaning |
|---|---|---|
| `needs-triage` | canonical triage | new, unreviewed |
| `needs-info` | canonical triage | blocked on reporter |
| `ready-for-agent` | canonical triage | scoped, AFK-ready (agent can pick up w/ no human context) |
| `ready-for-human` | canonical triage | requires judgment, auth, or irreversible action |
| `wontfix` | canonical triage | rejected |
| `agent-claimed:<agent-id>` | ephemeral claim | agent has atomically claimed this issue |
| `agent-PR-open` | ephemeral claim | PR open, under review |

### Atomic claim pattern

```bash
# Agent atomically claims before starting work
gh issue edit <num> --add-label "agent-claimed:<agent-id>" --remove-label "ready-for-agent"
```

### Issue frontmatter (agent-consumable)

```yaml
---
module: identity-service
effort: small        # small | medium | large
requires: [bun test, dep-check]
blocked-by: []
agent-notes: "Scope: src/auth/ only. Do NOT touch migration files."
---
```

### Worker-brief verification evidence (BINDING - verbatim stdout, no summarizing)

**Binding per issue #156** (your-org/curaos-ai-workspace). Pattern: L2 workers (dispatched general-purpose `Agent` subagents + claude workers) consistently over-claim `bun run ci`. Cycle-1 worker claimed 121 pass / 0 fail; orchestrator re-run found 41 pass / 4 fail / 4 errors. Cycle-2 worker claimed 136 pass / 0 fail; orchestrator re-run found 67 pass / 30 fail / 24 errors. Root cause: workers run `ci` in an isolated worktree where (a) workspace deps may not be fully resolved, (b) Bun port reservation differs, (c) the test runner's CI-vs-interactive env detection silently masks failures - and workers SUMMARIZE ("N pass / 0 fail") instead of pasting stdout, so neither the orchestrator nor a cross-harness grill can tell a silent skip from a real pass.

**Rule:** every dispatched worker brief MUST carry a `## VERIFICATION (MANDATORY - copy command stdout verbatim into STATUS, no summarizing)` section. The worker pastes the LAST 15 lines of each command's combined stdout+stderr into the STATUS comment under a fenced code block, run from the exact owned worktree path:
- `bun run typecheck`
- `bun test test/<bucket>` (one paste per touched bucket)
- `bun run ci`

The paste is the claim of record:
- NO "all tests pass" / "exit 0" summary in place of the paste; the actual exit code MUST be on the last line of each paste.
- A SKIPPED test → the skip notice MUST appear in the paste. An ERRORED test → the TypeError/stack MUST appear, not a count.
- A summarized count with no backing paste = no evidence; it fails closeout.

**Orchestrator over-claim re-run + tolerance:** the orchestrator re-runs the same commands at the same path and compares counts. Match within **±2 tests** (flaky-but-rerun-stable tolerance) = accept. Divergence > ±2, any fail/error reported as pass, or any silent skip reported as pass = confirmed over-claim → add ephemeral label **`agent-overclaimed`** (color `D4350C`; applied only on orchestrator-confirmed divergence, removed after a fix-cycle re-run matches within ±2) and re-claim the issue for a worker fix cycle. This is the worker-brief side of `docs/agents/one-task-execution-prompt.md` §8.1 + `docs/agents/milestone-orchestration-prompt.md` §7.1.

`agent-overclaimed` is an **ephemeral, non-seeded** claim/state marker (like `agent-claimed:<id>` / `agent-PR-open`) - NOT one of the canonical 11 labels per [[curaos-roadmap-workflow-rule]]. Org-wide seeding of the label across all repos is tracked separately.

### GitHub Agentic Workflows (Feb 2026 technical preview)
When GA: converts Issues into agent tasks natively. Triggers: issue event / comment command / schedule / manual dispatch. Agent reads issue, produces PR, posts status comment. Sandboxed read-only default; writes through sanitized outputs.

## Branch + worktree strategy (locked)

### Branch naming (per [[curaos-repo-conventions-rule]])
Format: `agent/<type>-<module>-<short-desc>-<agent-id>`. Examples:
- `agent/feat-identity-add-webauthn-cc01`
- `agent/fix-notify-email-retry-bug-cdx07`
- `agent/refactor-shared-dto-zod-v4-pi09`

Branch lifetime: <24h ideally; never >2 days. Stale → merge hell at swarm scale.

### Branch lifecycle
1. Creates branch from `main` at task start (claims issue first per atomic claim pattern)
2. Commits incrementally (Conventional Commits per [[curaos-repo-conventions-rule]])
3. Opens draft PR immediately so merge queue can track
4. Marks PR ready when CI green (per [[curaos-quality-gates-rule]] T1+T2 pass)
5. Review-thread resolution gate (BINDING): a PR is `safe-to-merge-clean` ONLY when every reviewer review THREAD is resolved AND no thread is escalated/tagged `needs-human` (a review thread left intentionally open for the user). `"merged" alone is insufficient`; notification-clear is `safe-to-clear-notification` on the same predicate AND a dry-run first
6. Merge queue auto-merges when approved + checks green + threads resolved (step 5)
7. Force push to shared branches: BLOCKED by branch protection (per [[curaos-repo-conventions-rule]])
8. MUST NOT rebase/amend pushed commits; new commits only

### Git sync no-drop protocol

Binding user directive 2026-06-30: no agent may drop local work to repair a sync problem. "Make it clean" means preserve and reconcile, not discard.

When any root repo, parent repo, submodule, or nested submodule has dirty or divergent state:
- Freeze broad orchestration and stop dispatching new lanes that could touch the same working trees.
- Inventory every affected checkout with `git status --short --branch`, `git rev-parse HEAD`, default-branch remote head, and open PR state.
- Create or find the local incident issue and attach child rows for scan, dispatch, verify, and follow-up under `parent_id`.
- Preserve dirty work before cleanup using a WIP branch plus commit and push, a draft PR, or an explicit named patch artifact when Git cannot commit. Stash is allowed only with an explicit stash name recorded in the local issue and a same-turn recovery path.
- Verify the remote branch head equals the local preserved commit before switching branches, updating submodule pointers, or returning to `main`.
- After every PR merge, fetch and fast-forward the merged repo main, update each parent submodule pointer bottom-up, push the pointer PR, and re-run status checks at each level.

Banned during sync recovery unless the user gives explicit same-turn approval after seeing the exact preserved refs: `git reset --hard`, `git clean`, force push, deleting branches, deleting stashes, checkout or restore commands that overwrite dirty paths, and manual file deletion.

### NO fixed caps - lanes collision-bounded; physical worktrees disk-bounded

**Lanes (parallel task-execute dispatches) are UNCAPPED** - bounded solely by working-tree collisions + the runtime's `min(16, cores-2)` per-workflow concurrency backstop. With 91 submodules, dispatch every collision-free lane; do NOT throttle to a fixed number (user directive 2026-06-03).

**Physical worktrees** (`git worktree` directories on disk - the expensive `isolation: "worktree"` mode, RARELY used: most lanes run in their own submodule checkout or the shared serialized curaos checkout, neither of which materializes an extra worktree) have **NO fixed-number cap either** - they are bounded by **real available disk**, not an arbitrary count. The disk concern is genuine (data point: 9.82 GB consumed in 20 min for a 2 GB codebase with 5 active worktrees - Penligent 2026, because each worktree re-expands deps + build cache), so the guard is operational: **prune aggressively (`git worktree prune` post-merge), monitor free space before spinning a new physical worktree, and stop spinning new ones when free disk runs low** - not "stop at N." If you are not using `isolation: "worktree"`, none of this binds anything.

### Worktree isolation (Claude Code `isolation: worktree`)

Worktrees isolate: branch checkout, index, per-worktree HEAD.
Worktrees do NOT isolate: host ports, databases, caches, secrets, test state, Docker container names, build cache.

**Hybrid pattern required when several concurrent physical worktrees run local services (shared host ports / DB / containers collide regardless of lane count - host-resource conflict, NOT a lane cap):**
- Dynamic port assignment: `PORT=$((3000 + WORKTREE_INDEX))`
- Docker container names prefixed w/ branch name
- SQLite per worktree for local tests; branch-prefixed Postgres DB names (`db_<branch>_test`)
- Sandcastle / Conductor (Melty Labs) for additional sandboxing

### Submodule pointer-chain pull verify (BINDING)

WHEN: after ANY `git pull --ff-only` or submodule `git checkout` along the two-level pointer chain (workspace -> `curaos/` -> child: `curaos/backend|frontend/<submodule>`, `curaos/ops`, `curaos-deploy`). WHY: `git pull --ff-only` can print `Updating X..Y` yet leave HEAD at X when the submodule checkout is interrupted, so the working tree silently keeps stale generated content and a parent records a pointer to an un-advanced child. INSTEAD-OF: trusting the pull's `Updating X..Y` print as proof the move landed.

Rule (per level, top-down, bump + verify in order):
```bash
git rev-parse HEAD                            # must equal the intended target commit
git rev-list --count HEAD..origin/<default>   # must be 0; non-zero = ff did NOT complete
git merge --ff-only origin/<default>          # re-run when count != 0, then re-verify
```
Verify each level before bumping its parent pointer; never record a parent pointer to an un-advanced child. This is the swarm-side contract for the orchestrator's §11 `workspace readiness clean` predicate in `docs/agents/milestone-orchestration-prompt.md`.

### Stale worktree cleanup

```bash
# Post-merge CI hook
git worktree prune

# Faster cleanup
rm -rf ../project-feature-a && git worktree prune
```
Alert if worktree count >10.

## Merge automation (locked: GitHub native merge queue)

| Tool | Adopt when |
|---|---|
| **GitHub native merge queue** | **NOW** (free; sufficient for solo dev) |
| **Mergify** | When PR volume > 20/day (commercial; speculative execution + batching; scopes PRs by service) |
| **Aviator** | Same use case as Mergify; pick one |
| **Graphite** | Stacked PR workflows (74% faster merge at Ramp); paid SaaS |
| **GitHub Copilot coding agent** | Paused new signups Apr 2026 due to infra strain - skip |

### Tiered review model (per [[curaos-verification-stack-rule]] T2 multi-model code review subagent + adversarial cross-harness)
```text
Automated bot review (every PR):       Multi-model code review subagent (Security+Architecture+QA)
Spot-check human review (random 10-20%): Solo dev scans for pattern drift
Mandatory human review (T3 triggers):   PHI/auth/migrations/CODEOWNERS - per [[curaos-verification-stack-rule]] DA6
Mandatory human review (>500 lines / >5 files): Solo dev full review
```

## Cost control gateway (SUPERSEDED by DA11 - see AMENDMENT NOTE)

> **AMENDMENT NOTE (current binding state):** [[curaos-agent-eval-obs-rule]] DA11 OVERRIDES DA9 - **LiteLLM proxy ADOPTED** w/ Presidio PHI scrub + 4-threshold cost alerts (75/90/95/100%). Per-tenant cost attribution still deferred v2/v3 product per [[curaos-model-tiering-rule]] DA5.

Original DA9 decision (superseded by DA11 above):
- ~~NO LiteLLM proxy for dev workflow~~
- ~~NO 4-threshold cost alerts~~
- ~~NO budget-overrun fallback chain~~
- **NO per-tenant cost attribution** at rule level (deferred v2/v3 product per [[curaos-model-tiering-rule]] DA5) - still applies
- **NO mandatory metadata tagging** for cost rollups - still deferred

### Why skipped for dev
- Dev phase doesn't need per-tenant cost visibility
- Each CLI calls own models w/o cross-routing (per DA1 + DA5)
- Per-tenant attribution = product concern (SaaS billing) deferred v2/v3
- LiteLLM proxy adds infra complexity for marginal benefit at solo-dev scale

### When to revisit
- CuraOS reaches SaaS phase (multi-tenant billing visibility needed)
- Swarm hits cost ceiling requiring per-agent attribution
- v2/v3 product roadmap requires per-tenant pricing

### Cost discipline alternative (per [[curaos-cli-agents-rule]] DA1 + [[curaos-model-tiering-rule]] DA5)
- Each CLI's pricing transparent (Anthropic / OpenAI / Pi Zen)
- BATS budget tracker per session (per [[curaos-context-engineering-rule]] DA4) tracks per-session token usage
- HealthStack PHI minimum Sonnet 4.6 (per DA5)
- Layered tiering within each harness (Fable/Opus/Sonnet/Haiku within Claude)
- Pi Zen free tier (nemotron-3-ultra-free, deepseek-v4-flash-free, big-pickle) for mechanical work when cost-sensitive

## A2A + MCP coordination (locked: GitHub shared state)

### GitHub as canonical shared state
Coordination via:
- **Issues** (work queue + labels)
- **PR comments** (review feedback, hand-offs)
- **Commit messages** (Conventional Commits w/ issue refs only)
- **CODEOWNERS** (soft lock for partition enforcement)

No external shared memory store (Redis / pub-sub) required for solo-dev + 200-agent swarm at current scale.

### A2A protocol available NOT auto-routed
Per [[curaos-cli-agents-rule]] DA1: cross-harness routing only when user explicitly asks. A2A (Google April 2025; under Linux Foundation AAIF Dec 2025) protocol available for stateful long-running multi-stage workflows; NOT default; NOT auto-routed.

### MCP for agent-to-tool access (per [[curaos-mcp-stack-rule]] DA3)
Must-have MCPs (codegraph + open-design + context-mode + computer-use + deepwiki) for tool access. Memory MCPs all BANNED per DA3.

## Agent attribution outside commit trailers

Per [[curaos-repo-conventions-rule]], git commits have exactly one accountable author. Agents, subagents, reviewers, and tools MUST NOT add `Co-authored-by:`, `Generated-by:`, `AI-assisted-by:`, `Agent-ID:`, `Agent-Model:`, `Task-Issue:`, `Worktree:`, or similar AI/tool attribution trailers.

Store lineage in GitHub issue comments, PR body, review artifacts, Langfuse/logs, and branch/worktree names. Commit messages stay concise:

```
feat(identity): add WebAuthn registration flow

Closes #412
```
Git blame + issue/PR links give code ownership; operational lineage lives outside commit metadata.

## Time-to-PR metric (primary velocity signal)

Track timestamps via GitHub Events API:
```
issue-created → agent-claimed → PR-opened → CI-green → merged
```
P95 time-to-PR = primary velocity signal for swarm health.

## Anti-patterns (locked: ban list)

### Grep bombing
**Problem:** 200 agents running `rg` across full monorepo simultaneously saturates disk I/O.
**Fix:** Pre-index w/ CodeGraph (per [[curaos-mcp-stack-rule]] must-have MCP). Agents query knowledge graph (sub-ms) instead of grepping files.
**Enforce via agent system prompt:** "Use codegraph_search before rg."

### Duplicate task dispatch
**Problem:** Two agents claim same issue; both open PRs; one wasted.
**Fix:** Atomic claim via label (`agent-claimed:<id>`) + pre-dispatch check (`gh issue list --label "agent-claimed"`).

### Contradictory PRs
**Problem:** Agent A refactors AuthService interface; Agent B writes code against old interface; both PRs pass CI (unit tests mock interface); integration breaks at merge.
**Fix:** File ownership partition; CODEOWNERS blocks cross-ownership PRs at review; pre-dispatch `git merge-tree` detects interface conflicts.

### Infinite loops
**Problem:** Agent loops indefinitely when tool fails or task ambiguous.
**Fixes:**
- Hard iteration limit: every agent run has `max_turns` / `max_tokens` ceiling
- Verifier 3-cycle cap per [[curaos-verification-stack-rule]]
- Dead-end detection: last 3 tool calls identical → escalate to human
- Semantic loop detection: alert if recent turns have >0.95 cosine similarity

### Runaway destructive ops (Replit Jul 2025 postmortem)
**Problem:** Agent executed `DROP DATABASE` on production despite freeze instruction.
**Fix:** Per [[curaos-verification-stack-rule]] T3 HITL mandatory approval for destructive ops; infrastructure-level gate, NOT prompt instruction.

### Micro-agent proliferation
**Problem:** Every small op wrapped in agent adds reasoning overhead ("agent-washing"). Single-path deterministic ops incur reasoning tax that doubles/triples token count.
**Fix:** 3-question test before wrapping in agent: (1) Tool selection dynamic? (2) Path conditional? (3) Feedback loop present? All "no" → implement as tool or workflow, not agent.

### Tool soup (context explosion)
**Problem:** Exposing 50-100 tools upfront consumes ~72K tokens before any work. 4-turn conversation = 288K tokens on definitions alone.
**Fix:** Per [[curaos-mcp-stack-rule]] DA3: per-session MCP activation; tool-search subagent enabled when >3 active MCPs (47% main-thread overhead reduction).

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §10 agent operating rules | Submodule awareness + trust-but-verify + branch hygiene per this rule |
| AGENTS.md §11 boundaries + approvals | T3 HITL per [[curaos-verification-stack-rule]] for destructive ops |
| [[curaos-cli-agents-rule]] | Each CLI calls own models; cross-harness only when user asks |
| [[curaos-mcp-stack-rule]] | codegraph for structural queries; GitHub Issues as canonical queue |
| [[curaos-repo-conventions-rule]] | Trunk-based + agent/<type>-<module>-<slug>-<id> branches + CODEOWNERS + PR template |
| [[curaos-verification-stack-rule]] | T2 multi-model code review subagent at PR; T3 HITL at destructive ops |
| [[curaos-quality-gates-rule]] | CI gates run on every agent commit + PR |
| [[curaos-model-tiering-rule]] | Per-CLI tiering; cross-harness only when explicit |
| [[curaos-context-engineering-rule]] | BATS budget tracker per session; sub-agent isolation |
| [[curaos-knowledge-persistence-rule]] | git log + HANDOVER.md + Conventional Commits = swarm coordination trail |
| [[curaos-ai-mirror-rule]] | Generator (per [[curaos-speed-patterns-rule]]) emits AGENTS.md under ai/curaos/ mirror |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Why this swarm pattern wins:
- **Submodule boundary partition** = 91 submodules already enforce ownership; minimal coordination cost
- **GitHub Issues canonical queue** = no separate work-queue infra; gh CLI per [[curaos-mcp-stack-rule]] DA3
- **Work-queue state machine** (canonical 11 labels + ephemeral claim labels) = atomic claim prevents duplicate dispatch
- **Lanes UNCAPPED (collision-bounded)** = dispatch every parallel-safe lane; the only limits are working-tree collisions + the runtime `min(16, cores-2)` concurrency backstop. The ~8 cap applies ONLY to physical `isolation:worktree` directories (disk/ops), never to lane count (user directive 2026-06-03)
- **Trunk-based + <24h branches** = no contention at swarm scale; 89% deployment incident reduction
- **GitHub native merge queue free** = sufficient for solo dev; Mergify only at >20 PRs/day
- **LiteLLM proxy w/ Presidio scrub** (DA11) = cost visibility + PHI scrub; per-tenant attribution deferred product layer
- **GitHub as shared state** = no Redis/external memory; coordinate via Issues + PR comments + issue refs
- **A2A available NOT auto-routed** = cross-harness only when user asks (matches DA1)
- **No AI/co-author commit trailers** = clean release history; lineage preserved in issue/PR artifacts
- **Time-to-PR P95 metric** = primary velocity signal; tracks swarm health

## How to apply

- Workspace setup:
  - `.github/CODEOWNERS` w/ ownership tokens (agent identities or human handles)
  - `.github/ISSUE_TEMPLATE/agent-task.md` w/ frontmatter (module/effort/requires/blocked-by/agent-notes)
  - Branch protection rules: required status checks + CODEOWNERS soft lock + no force push to main
  - GitHub native merge queue enabled
  - 5-label state machine seeded across 93 repos via existing triage-labels skill
- Per-session:
  - Agent claims issue atomically: `gh issue edit <num> --add-label "agent-claimed:<id>" --remove-label "ready-for-agent"`
  - Pre-dispatch: `gh issue list --label "agent-claimed"` to see what's in flight
  - Pre-flight: `git merge-tree <branch-a> <branch-b>` for cross-module work
- Lane / worktree management:
  - **Lane count: UNCAPPED** - dispatch every collision-free lane; runtime `min(16, cores-2)` backstop queues the rest
  - **Physical worktrees** (`isolation:worktree` only): NO fixed count - disk-bounded; prune post-merge + monitor free space + stop spinning new ones when disk runs low
  - Post-merge: `git worktree prune` in CI hook
  - Dynamic port assignment for parallel agents w/ dev servers
- Cost discipline (gateway ADOPTED per DA11, superseding the original DA9 "no gateway"):
  - Route model traffic through the LiteLLM proxy w/ Presidio PHI scrub per [[curaos-agent-eval-obs-rule]] DA11
  - Per-CLI tiering per [[curaos-model-tiering-rule]] DA5
  - BATS budget tracker per session per [[curaos-context-engineering-rule]] DA4
  - Pi Zen free tier for mechanical work when cost-sensitive
  - Per-tenant cost attribution deferred to v2/v3 product (not a dev-phase gate)
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15

## ADRs queued

Per digest §6:
- **ADR-0158 (NEW, swarm collaboration submodule partition + GitHub Issues queue + uncapped collision-bounded lanes [physical worktrees disk-bounded, no fixed count] + trunk-based + no cost gateway dev)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §10 agent operating rules + §11 boundaries to reference 5-label state machine + uncapped collision-bounded lane dispatch (physical worktrees disk-bounded, no fixed count)
