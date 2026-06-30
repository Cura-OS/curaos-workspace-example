# Agent-Workflow Trigger Map

When to invoke which CuraOS agent-workflow. Workflows are NOT auto-triggered by description match - an agent (or the orchestrator) invokes them explicitly. This map is that trigger layer.

> Library + contract: [workflows/README.md](workflows/README.md). Design: [workflows/HIERARCHY-DESIGN.md](workflows/HIERARCHY-DESIGN.md). Live executor health: [WORKFLOW-STATUS.md](WORKFLOW-STATUS.md) (check before dispatching; a `broken:<issue-url>` row means do not dispatch). Local-state retention + GC: [local-state-retention.md](local-state-retention.md). Symphony adoption plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md), local ledger: [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md), Hermes native guide: [SYMPHONY-HERMES-NATIVE-GUIDE.md](SYMPHONY-HERMES-NATIVE-GUIDE.md).

## How to invoke

- **Claude Code:** `Workflow({ scriptPath: "scripts/workflows/<name>.workflow.js", args: { … } })`. Composition between workflows uses `workflow({ scriptPath }, argsObj)` (1 level deep). `args` arrives as a JSON string - workflows `JSON.parse` it.
- **Other CLIs (Codex/Antigravity/Grok/OpenCode/Pi):** invoke the committed executor through Agent Workflow Kit first: `agent-workflow-kit workflow-run <name> --args-json '{...}' --json`. The kit CLI defaults to STUB agents (`schemaDefaultAgent`; control-flow only - not evidence real work ran); append `--real-agents` (optionally `--agent-timeout-ms <ms>`) to spawn real CLI agents per `docs/agents/workflows/README.md` "Stub vs real agents". If the executor is unavailable, returns `needs_user`, or reports a concrete `workflow-defect`, continue by reading the playbook `docs/agents/workflows/<name>.md` and executing the failed phases natively. Native playbook execution is fallback, not the default.
- **Hermes and harnesses without Claude Workflow or Agent Workflow Kit:** read the same playbook and execute it natively with the harness's tools, while preserving the contract, local-first ledger, evidence gates, and explicit GitHub sync policy. See [harness-native-playbook-execution.md](harness-native-playbook-execution.md) and [SYMPHONY-HERMES-NATIVE-GUIDE.md](SYMPHONY-HERMES-NATIVE-GUIDE.md).
- **Slash-commands:** the common composites are registered under `.claude/commands/` (Claude `/` menu).

## Trigger table

| Situation | Invoke | Notes |
|---|---|---|
| Advance a milestone one pass (triage → dispatch → verify) | `milestone-wave` | `args.milestone` = M9 / M7-M9 / active; one non-interactive pass; the orchestrator re-invokes across turns + handles `needs_user`. Use `/milestone-wave`, `Workflow({ scriptPath: "scripts/workflows/milestone-wave.workflow.js", args })`, or `agent-workflow-kit workflow-run milestone-wave --args-json '{...}' --json` depending on harness. |
| A doc set needs standards-grounded review + tightening | `doc-governance` | manifest of doc paths; `mode=review-only` to report without fixing |
| After a large doc edit, verify no regression introduced | `doc-governance` | the adversarial sweep catches cross-doc regressions |
| Curate candidate issues before dispatch (triage + project + edges + mirror) | `pm-triage-gate` | the §3.4 gate; composes the 4 gh-* atomics; returns ready/not-ready |
| An issue is too large / scope uncertain before dispatch | `breakdown` | recursive; orchestrator re-invokes on `needs_recursion` children |
| Several issues ready - which to dispatch FIRST for max parallelism | `wave-prioritize` | ranks by transitive unblock-leverage (dep-graph) + partitions parallel-safe lanes; leverage = order, every gate still binds; runs inside `milestone-wave`'s Prioritize phase |
| Need the deterministic tracker snapshot (board + open issues + open PRs) before triage/dispatch, or after a merge to catch just-unblocked stories | [`milestone-active-scan`](workflows/milestone-active-scan.md) | read-only, no mutation ever; buckets every open unclaimed issue (`candidates` / `paper_blocked_candidates` / `dependency_cleared`) + Target Version map + `generator_inflight` barrier flag; runs as `milestone-wave`'s Scan phase; safe standalone any time |
| Noticed future work / debt / an idea mid-task - capture it without derailing | `foresight-capture` | focused handoff → fresh subagent specs it → staged `foresight` issue; once relevant to the active working set or a current dependency chain, §3.4 triage may mark it `ready-for-agent` like normal work |
| Proactively scan for future work across milestones (old/current/future) | `foresight-sweep` | `mode=wave` (post-merge, scoped - runs in `milestone-wave`) or `mode=cross-milestone` (deep all-milestone scan, on-demand/scheduled); feeds findings to foresight-capture |
| A `ready-for-agent` issue is ready to implement | `task-execute` | dispatched per safe parallel lane; run `breakdown` first if not grab-able. Use the persistent executor before manual one-task runbook work. |
| A PR needs T2 verification before merge | `pr-verify-merge` | 3-lens + adversarial grill + programmatic merge gate; `auto_merge=false` by default. Gate includes review-thread resolution + no `needs-human`: `safe-to-merge-clean` only when every review THREAD is resolved AND no thread is escalated/tagged `needs-human`; `"merged" alone is insufficient` |
| Need context / blocker check before starting a task | `context-load` | standalone or inside `task-execute` |
| Implement one pre-scoped issue on an existing branch | `tdd-implement` | inside `task-execute` |
| Seed a new agent-consumable issue | `gh-issue-seed` | canonical frontmatter + sections; idempotent |
| Triage an incoming issue to its state label | `gh-issue-triage` | paper-vs-real blocker classification |
| Add/sync an issue on the CuraOS Roadmap project | `gh-project-sync` | idempotent add + 3-way field reconcile |
| Wire sub-issues / dependencies for a parent | `gh-subissue-wire` | diff-first, idempotent |
| Refresh ISSUE-ROADMAP from tracker | `gh-roadmap-mirror` | tracker is source of truth; HANDOVER is explicit closeout state |

## Orchestrator layer (not a workflow)

A full milestone wave is **orchestrator-chained** by the main loop / [milestone-orchestration-prompt](milestone-orchestration-prompt.md), which owns the §3.6 user-escalation funnel + §3.5 research + §3.11 sweep + §11 stop (a workflow cannot escalate to a human mid-run or span turns). The deterministic legs of ONE pass are packaged as the `milestone-wave` workflow; the orchestrator re-invokes it across turns and handles its `needs_user` between passes:

```
loop (orchestrator, across turns):
  milestone-wave(args.milestone)   # one pass: scan → pm-triage-gate → breakdown → partition → task-execute → pr-verify-merge
    → if it returns needs_user: orchestrator runs §3.5 research / §3.6 escalation, then re-invokes
    → if it returns done: orchestrator runs §3.11 sweep + §11 stop predicate, then settles terminal
  where milestone-wave internally chains:
    pm-triage-gate(gh-issue-triage + gh-project-sync + gh-subissue-wire; then gh-roadmap-mirror once)
      → breakdown(large issues, recursive)
      → lane-partition → task-execute per safe lane → pr-verify-merge per PR
```

## Gate inheritance

Every workflow inherits the binding gates of [[curaos-verification-stack-rule]] (T1/T2/T3), [[curaos-generator-evolution-rule]] (§8.75 + in-flight barrier), [[curaos-roadmap-workflow-rule]] (Critical/High/Medium/Low priority field), and [[curaos-rolling-update-rule]]. A workflow stops at `needs-user` rather than crossing a T3 / user-decision boundary.
