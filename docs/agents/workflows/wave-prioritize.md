---
name: wave-prioritize
kind: atomic
version: 0.4.1
inputs:
  candidates: { type: string, required: true, description: "JSON array of {ref, priority, effort, module, owned_path} that survived §3 triage" }
  weights: { type: string, required: false, description: "JSON object overriding the blend weights {unblock,cp,prio,effort} (default 0.5/0.3/0.15/0.05)" }
  max_lanes: { type: number, required: false, description: "OPTIONAL hard cap on concurrent lanes. Default UNCAPPED (collision-bounded only): emit every parallel-safe lane (no shared git working tree). The runtime's own min(16, cores-2) concurrency backstop throttles execution; excess lanes queue + run as slots free. Pass a number only to deliberately throttle below the collision-safe maximum." }
  milestone: { type: string, required: false, description: "OPTIONAL milestone tag (e.g. M9) stamped into the calibration dispatch record's waveId/milestone fields. Defaults to 'unknown' when omitted." }
  near_completion: { type: string, required: false, description: "RP-51: OPTIONAL JSON array of issue refs with deterministic near-completion evidence (open PR awaiting verify, board Status In Progress / In Review). These lanes are scheduled FIRST within the collision-safe set (finishing a lane frees capacity and unblocks dependents faster than a fresh parallel start); ordering only, never membership or gates." }
  dry_run: { type: boolean, required: false, description: "skip calibration append; ranking and partition still run" }
outputs:
  ranked: { type: array, description: "candidates sorted by leverage score desc, each {issue, score, unblockReach, criticalPathDepth, priority, effort, breakdown}" }
  lanes: { type: array, description: "the dispatch plan: every parallel-safe lane (no shared git working tree). Same-owned-root candidates are bundled into one lane with issues[]; UNCAPPED by default, truncated only if a finite max_lanes was passed. Scheduled in RP-51 order: near-completion lanes first, then critical path, FIFO within a priority class" }
  weights: { type: object, description: "the blend weights actually applied (for explainability + calibration)" }
  rationale: { type: string, description: "one-line why-this-order: the top issue + its unblock reach + what it frees" }
  degraded: { type: boolean, description: "RP-46: true when the dep-graph build hit edge-fetch failures after retries; ranking is usable but unblockReach may be undercounted, and the calibration append is skipped" }
  edge_fetch_failures: { type: number, description: "RP-46: count of edge-fetch failures during the rank() graph build (0 on a clean run)" }
  calibrationLogged: { type: boolean, description: "whether the fail-soft calibration dispatch record was appended to scripts/lib/dep-graph-calibration-log.json (false on a fail-soft skip never aborts the wave)" }
  wavePlanPath: { type: string, description: "RP-49: path of the wave-plan.json artifact written this run (.scratch/workflow-cache/wave-plan.json: lane assignments + critical path + velocity-sized scope; advisory planning surface - the version working-set predicate stays the closure gate); empty string on a fail-soft write skip" }
  context_bundles: { type: array, description: "RP-50: per-lane context bundles written at plan time ({issue, path} rows; path = .scratch/<lane-slug>/context-bundle.md with mirror-doc context + pre-coding anchors), so every dispatched lane's bundle exists BEFORE its worker starts; fail-soft (a skipped bundle never aborts planning)" }
guarantees:
  idempotent: true
  determinism: code-derived-ranking
  side_effects: fs
verification: T1
models:
  prioritize: sonnet
composes: []
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---

# wave-prioritize

Rank the ready-for-agent candidates that survived §3 triage by **unblock-leverage** - how much downstream work each transitively frees - and partition them into parallel-safe dispatch lanes. Same-owned-root candidates are bundled into one lane and one intended PR. The orchestrator (and `milestone-wave`) runs this **between scan and partition** so a wave spends its first lanes on the keystones that open the most future parallel width, not on leaves that unblock nothing.

The ranking math lives in the canonical lib [`scripts/lib/dep-graph.js`](../../../scripts/lib/dep-graph.js) - plain deterministic code (transitive-unblock reach + critical-path depth + a weighted blend), **not** LLM judgment. This workflow executor calls the lib directly and partitions in code; it never delegates ranking or lane selection to an agent.

## Signal (weighted blend - user decision 2026-05-29)

```
score = 0.5·norm(transitiveUnblock) + 0.3·norm(criticalPathDepth)
      + 0.15·priorityWeight + 0.05·(1/effort)
```

- **transitiveUnblock** - count of issues reachable downstream over the union of native `blocking` + sub-issue (child→parent) edges. The leverage core.
- **criticalPathDepth** - longest downstream chain to milestone close (CPM position).
- **priority** - frontmatter `priority` (Critical/High/Medium/Low or P0..P3).
- **effort** - quick-win bias: `1/effort` (XS..XL), so a small issue that unblocks ranks a touch higher.

Raw components are min-max normalized to `[0,1]` across the candidate set **before** weighting, so the large-range component (unblock reach) can't swamp the others by scale. Weights are **named, config-overridable (`weights` input), and echoed in `weights` output**; every issue's `breakdown` carries its per-component raw + normalized + weighted values, so a pick is always explainable and the weights are calibratable (the known risk of a blend).

## Behavior

1. `require("scripts/lib/dep-graph.js").rank(candidates, { weights })` - the lib pulls the **live** GitHub dependency graph (`blocking` + `sub_issues` + `parent`, via `env -u GITHUB_TOKEN gh`), computes reach + critical-path depth (cycle-safe, memoized), and returns `ranked` + `weights`. A non-empty candidate input that returns empty `ranked` is a workflow defect and fails closed. Candidates arriving without `priority`/`effort` get those fields backfilled deterministically from the issue's own body frontmatter before ranking (read-only `gh issue view`); the calibration dispatch record therefore captures real priority/effort, not null (RP-47).
2. **Lane partition (bundle-first)** - walk `ranked` highest-score-first; greedily create a lane for each new git working tree and append later same-root candidates to that existing lane's `issues[]` bundle (per [`curaos_swarm_collaboration_rule`](../../../ai/rules/curaos_swarm_collaboration_rule.md): local issue rows can stay atomic, but worker lanes and PRs bundle compatible work before adding more agents). **Default UNCAPPED**: emit *every* collision-safe owner-root lane - with ~90+ submodules (derive the current count from `curaos/.gitmodules`) many independent lanes run at once, and the runtime's own `min(16, cores-2)` backstop queues anything beyond what executes concurrently. Truncate new root lanes **only** if a finite `max_lanes` was explicitly passed; already-selected roots still absorb later same-root issues into their bundle. The **only** issues deferred to the next wave are those whose root was not selected because of a finite throttle or a real collision/dependency reason. Maximize useful lanes after packing; never defer same-owner work merely because it shares the owner.
   Candidate `owned_path` or `module` values are used before any live issue-body read when determining git working tree. If those do not resolve because the local worktree has uninitialized submodules, the issue repo identity is the fallback collision root. If GitHub REST is rate-limited and the candidate already carries tracker-derived module data, lane partition still stays collision-aware instead of collapsing every issue into `unknown`.
3. `rationale` - one line naming the #1 issue, its `unblockReach`, and what it frees.
4. **Calibration data-collection hook (fail-soft side-effect)** - after the lib returns `ranked`/`weights`, the executor appends exactly one dispatch record to [`scripts/lib/dep-graph-calibration-log.json`](../../../scripts/lib/dep-graph-calibration-log.json) via [`scripts/lib/dep-graph-calibration.js`](../../../scripts/lib/dep-graph-calibration.js). This is a fail-soft fs side-effect (hence `side_effects: fs`, introduced at version `0.2.0`); it is **append-never-rewrite** and **fail-soft** (warns + returns `false`, never throws - same contract as the lib's edge-fetch), so `ranked`/`lanes`/`weights`/`rationale` are byte-for-byte unchanged whether or not the append succeeds. `dry_run:true` skips this append and returns `calibrationLogged:false`.
5. **wave-plan.json artifact (RP-49, version `0.3.0`)** - every run (dry_run included: the plan IS the dry-run deliverable) writes `.scratch/workflow-cache/wave-plan.json` with `schemaVersion: 1` and the three planning surfaces downstream tooling consumes: `lanes` (lane assignments `{issue, issues, bundled_count, score, owned_root}`), `critical_path` (rows with `criticalPathDepth > 0`, deepest first), and `velocity_sized_scope` (`suggestedWaveSize` from the RP-47 calibration sizing signal when >= 3 complete waves exist, `source: calibration`; the scope is the first `suggestedWaveSize` issues across ordered lane bundles; otherwise all issues, `source: fallback-all-lanes`). The write is fail-soft (`wavePlanPath: ""` on skip, ranking unaffected). ADVISORY ONLY: the version working-set predicate stays the closure gate per [`curaos_version_planning_rule`](../../../ai/rules/curaos_version_planning_rule.md); the plan never gates closure or dispatch.
6. **Lane scheduling (RP-51, version `0.4.0`)** - after the collision partition, lanes are ORDERED (membership untouched) by the deterministic policy in [`scripts/lib/lane-schedule.js`](../../../scripts/lib/lane-schedule.js): **near-completion lanes first** (caller-supplied `near_completion` refs carrying deterministic evidence: an open PR awaiting verify, or board Status In Progress / In Review; any bundled issue can make its lane near-completion), then **critical path first** (deepest `criticalPathDepth` across the bundle), then priority class, with **FIFO within a priority class** (stable original leverage order). Selective pampering: COMPLETING a lane frees capacity and unblocks dependents faster than starting another fresh lane in parallel. `milestone-wave`'s serial dispatch loop consumes the lanes in this order. Ordering only - never a gate, never adds or drops a lane.
7. **Per-lane context bundle (RP-50, version `0.4.0`)** - after the plan write, [`scripts/lib/lane-context-bundle.js`](../../../scripts/lib/lane-context-bundle.js) writes one `.scratch/<lane-slug>/context-bundle.md` per lane at PLAN time, so a dispatched lane's bundle exists BEFORE its worker starts: the plan row including bundled issue refs, the PRE-CODING ANCHORS (naming / contract / no-dash invariants), the owned root's mirror docs resolved once (`ai/curaos/<owned_root>/{CONTEXT.md,Requirements.md,AGENTS.md}` per the ai-mirror rule, workspace doc set as fallback), and the ADR/contract source pointers. Reported in `context_bundles` (`{issue, path}` rows). Fail-soft per lane: a bundle failure never aborts planning, and the worker prompt's anchor block names the canonical context-load reads as the fallback. The wave's dispatch leg threads the matching anchor block into the worker prompt via `context_summary`.

## Calibration

The blend weights in [`scripts/lib/dep-graph.js`](../../../scripts/lib/dep-graph.js) (`DEFAULT_WEIGHTS = { unblock: 0.5, cp: 0.3, prio: 0.15, effort: 0.05 }`, user decision 2026-05-29) are **unvalidated guesses**. This feedback loop makes them measurable without touching the deterministic ranking math (issue #208):

**The loop**

1. **Dispatch record (this workflow, every run)** - the hook above appends one record to the log capturing, per ranked candidate, the *predicted* `rankAtDispatch` (1-based), `score`, `unblockReachAtDispatch`, `criticalPathDepth`, `priority`, `effort`, plus the applied `weights`, `waveId`, `milestone`, `dispatchedAt`. No `outcome` yet.
2. **Outcome backfill (at wave close)** - `scripts/backfill-calibration-outcome.js` fills the record's `outcome` block with each candidate's realized `freedCount` (its `blocking` targets now closed = blocked dependents freed within the wave window). Run it at the `milestone-wave` close phase or manually once the wave's PRs merge:

   ```sh
   node scripts/backfill-calibration-outcome.js --wave "<waveId>"        # backfill a specific wave
   node scripts/backfill-calibration-outcome.js --latest                 # backfill the most recent record lacking an outcome
   node scripts/backfill-calibration-outcome.js --wave "<waveId>" --dry-run   # preview the outcome without writing
   ```

   It updates **only** that record's `outcome` field; every other record + field is preserved (the `records[]` append-only invariant holds).
3. **Analysis** - `scripts/lib/dep-graph-calibration.js` reads the log and, for records **with** a backfilled outcome, computes **Pearson + Spearman** correlation between predicted `score`/`rankAtDispatch` and realized `freedCount`. With >= 3 complete waves `analyze()` also emits `sizing: { medianDispatchedPerWave, medianFreedPerWave, suggestedWaveSize }` (median dispatched/freed per complete wave; the throughput input that sizes drafted story sets for the pre-breakdown trigger, RP-48). Advisory only; never gates dispatch, never writes weights:

   ```sh
   node -e 'console.log(JSON.stringify(require("./scripts/lib/dep-graph-calibration.js").analyze(), null, 2))'
   ```

**Acceptance gate + insufficient-data skeleton**

- With **< 3** complete waves (records carrying an `outcome`), `analyze()` returns `{ status: "insufficient-data", wavesWithOutcome: <n> }` and **recommends nothing**. This is the current state - the calibration dataset does not yet exist; only the data-collection hook + skeleton have landed.
- With **≥ 3** complete waves it reports correlation. The weight **recommender** (a coarse grid search over `{unblock, cp, prio, effort}` summing to 1.0, re-scoring the logged candidates and re-measuring correlation, proposing a new set **only** when correlation improves by **> 0.05** over the `DEFAULT_WEIGHTS` baseline across all ≥ 3 waves) is data-blocked follow-up work that activates once that data exists.
- **`DEFAULT_WEIGHTS` changes are T3 (HITL)-gated.** The script **never** writes `DEFAULT_WEIGHTS` - a weight change is a user decision of the same class as the original 2026-05-29 blend decision (per [`curaos_verification_stack_rule`](../../../ai/rules/curaos_verification_stack_rule.md)). `analyze()` emits an advisory recommendation only; a human applies it via a follow-up T3-gated PR.

**Log location + schema** - [`scripts/lib/dep-graph-calibration-log.json`](../../../scripts/lib/dep-graph-calibration-log.json) (committed as the durable dataset - the dataset *is* the deliverable's value). Shape `{ schemaVersion: 1, records: [...] }`; each record:

```jsonc
{
  "schemaVersion": 1,
  "waveId": "M9-2026-06-12T14:03:00Z",   // <milestone>-<iso8601>
  "milestone": "M9",
  "dispatchedAt": "2026-06-12T14:03:00Z",
  "weights": { "unblock": 0.5, "cp": 0.3, "prio": 0.15, "effort": 0.05 },
  "candidates": [
    { "issue": "owner/repo#N", "rankAtDispatch": 1, "score": 0.7421,
      "unblockReachAtDispatch": 12, "criticalPathDepth": 4, "priority": "high", "effort": "m" }
  ],
  "outcome": {                            // backfilled at wave close (absent until then)
    "windowClosedAt": "<iso8601>",
    "freed": [ { "issue": "owner/repo#N", "freedCount": 8 } ]
  }
}
```

Both the data-collection hook and the calibration reader validate records against this `schemaVersion 1` shape (`validateRecord` in `dep-graph-calibration.js`) - a malformed record is rejected (warn) rather than silently miscounted.

A degraded run (`rank()` reports `degraded:true` after edge-fetch failures) never appends a calibration record; the log only learns from complete graphs (RP-46). The executor surfaces the condition in its `degraded` + `edge_fetch_failures` outputs so the wave can log it.

## Gates - leverage is ORDER, never a gate-skip

This workflow ranks + partitions; it does **not** gate. Every existing gate still binds, enforced by the orchestrator / `milestone-wave`, not here:

- **§3.4** Tracker-First Triage Gate (body curated, frontmatter + labels current, sub-issues/dependencies wired, `CuraOS Milestone` + fields stamped, parent backlinked)
- **§3.5** research-before-unknowns (no dispatch of an undecided design)
- **§3.7** cross-harness adversarial grill on high-blast-radius PRs
- **generator/SDK in-flight barrier** (§3.10) - no downstream wave start while a codegen/SDK lane is claimed
- **ADR / spec acceptance** in each issue body

A high-leverage issue whose referenced ADR is unresolved still escalates (§3.6) or routes the decision first - it never skips a gate to dispatch sooner. Leverage changes which *eligible* issue goes first, not whether an issue is eligible.

## Determinism

The ranking is fully code-derived (`dep-graph.js` is plain Node over the live graph) - same candidates + same graph state → same order. Network failure on an edge fetch degrades that node to zero downstream (never throws the wave). The executor applies the deterministic greedy lane partition itself; no agent can return an empty `ranked`/`lanes` result for non-empty candidates.
