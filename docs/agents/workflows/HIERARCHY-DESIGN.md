# CuraOS Workflow Hierarchy - Design

**Date:** 2026-05-29
**Status:** SHIPPED - this design was approved and built; the live contract is the playbook+executor library ([README.md](README.md) + [trigger map](../workflows.md), synced by `scripts/check-workflow-sync.js`). This file is retained as design rationale; where it disagrees with the committed playbooks/executors, the committed artifacts win. Model vocabulary has since moved to the logical tiers `fable | opus | sonnet | haiku` (frontier gates -> `fable`); read "fresh Opus" below as "fresh frontier-tier grill". Originally PROPOSAL v2, rewritten after an adversarial grill falsified v1's tool claims; it states only **empirically verified** behavior as of the design date.
**Grounding:** [21](../../../ai/research/21-doc-standards-anthropic-agents.md)-[26](../../../ai/research/26-github-pm-orchestration.md) (62 patterns). Wraps [milestone-orchestration-prompt](../milestone-orchestration-prompt.md) + [one-task-execution-prompt](../one-task-execution-prompt.md) + [issue-tracker](../issue-tracker.md) + [github-roadmap-project](../github-roadmap-project.md). Binds [[curaos-verification-stack-rule]], [[curaos-generator-evolution-rule]], [[curaos-roadmap-workflow-rule]], [[curaos-model-tiering-rule]], [[curaos-swarm-collaboration-rule]], [[curaos-rolling-update-rule]], [[curaos-reuse-dry-rule]].

---

## 0. Corrections from the v1 grill (what's actually true)

The first draft overclaimed. Verified facts (Claude Code 2.1.156, tested this session):

| v1 claim | Reality | Source |
|---|---|---|
| Auto-discovered `.claude/workflows/*.js` named library | **FALSE.** No such registry exists. Saved workflows = **slash-commands**; ad-hoc workflows persist to the session transcript dir and are re-invoked by `scriptPath` | filesystem check: no `.claude/workflows/`, no `.claude/commands/` workflow entries; scripts found under `…/subagents/workflows/wf_*` |
| `resumeFromRunId` = durable replay | **Same-session only.** Exit Claude → next session starts fresh. Resumable mid-session; NOT durable across restarts | official docs + tool desc |
| `.js` = "deterministic executor" | **Deterministic *orchestration*, best-effort *agents*.** Control flow + programmatic gates are deterministic; every `agent()` call is non-deterministic (schema constrains shape, not content) | grill F7 |
| Cross-CLI "implements natively" = portable execution | **Shared SPEC, not portable execution.** The `.md` is a spec any agent reads; only Claude Code has the JS executor. No deterministic cross-CLI run | grill F5 |
| Build workflows beside full prompts | **Rolling-update violation** ([[curaos-rolling-update-rule]]) - parallel paths. Content must forward-migrate IN PLACE in the same change | grill F10 |
| `workflow()`, `agent({model})`, `parallel()`, `pipeline()`, 1000-cap, ~16 concurrent | **TRUE** (used all session) | tool schema + this session's runs |
| 1-level `workflow()` nesting | **TRUE** (tool doc); deeper = orchestrator-chained across turns (normal subagent work, NOT a "workflow tier") | tool doc + grill F4 |

**Net:** the engine is real and powerful *within a Claude session*. It is NOT a cross-session durable, cross-CLI, auto-discovered, fully-deterministic platform. Design accordingly.

---

## 1. What we're actually building

A **library of git-committed workflow pairs** + a thin trigger layer. Persistence = git (survives sessions) + slash-command registration (quick `/` invoke). Cross-CLI = the `.md` playbook as shared spec.

```
ops/workflows/<name>.workflow.js   # Claude executor (git-committed → durable across sessions via git, not the runtime)
ai/curaos/docs/workflows/<name>.md # Playbook = cross-CLI SPEC + doc-graph node + the contract
.claude/commands/<name>.md         # (common ones) slash-command shim that invokes the workflow
```

- **`.md` playbook** = precedence-bearing spec. Any CLI (Codex/Gemini/Aider) reads + executes it as a procedure (best-effort, like a runbook - honest framing, not "portable execution"). For Claude it's also the contract the `.js` must satisfy.
- **`.js` executor** = Claude-only deterministic *orchestration* of LLM agents. Invoked by `scriptPath` (re-runnable) or via its slash-command.
- **Determinism honesty:** the workflow guarantees *control-flow* determinism (phase order, gates, idempotency keys) + *structured-output validation* at boundaries. It does NOT guarantee identical agent outputs. High-stakes correctness → programmatic gate or K-vote, never "trust the agent."

---

## 2. Contract (every workflow's `.md` frontmatter)

```yaml
name: <kebab-name>
kind: atomic | composite
version: <semver>            # add field = minor; remove/rename/retype = major
inputs:  { <key>: { type, required, desc } }
outputs: { <key>: { type, desc } }          # the .js StructuredOutput schema mirrors this exactly
guarantees:
  idempotent: true|false
  determinism: control-flow-only   # honest: agents are best-effort
  side_effects: none | github | git | fs
verification: T1 | T2 | T3
models: { <phase>: opus | sonnet | haiku }
composes: [<atomic-names>]   # composites only
```

**Sync gate (scoped, per grill F6):** `check-workflow-sync.js` checks ONLY the machine-checkable subset - the `.js` exports a `CONTRACT` object whose `inputs/outputs/guarantees/verification/models` deep-equals the `.md` frontmatter. It does NOT attempt prose-vs-code semantic diff (undefined). Fails CI on contract mismatch only.

**Boundary discipline:** structured output at every stage (`additionalProperties:false`+`required`); parse→validate→retry(≤3)→escalate. **No-PHI-in-schema.** Side effects carry idempotency keys + live in deterministic steps, never inside an agent loop.

---

## 3. Hierarchy (2 real tiers + an orchestrator layer)

**Tier 0 = atomic** (one job; may use `agent()` but calls no other workflow). **Tier 1 = composite** (`workflow()`-composes atomics, 1 level). **"Tier 2" is NOT a workflow** - it's the orchestrator (main loop / the milestone prompt) chaining composites across turns, where human escalation (§3.6) lives. Named honestly per grill F4.

> **HARD runtime constraint - `workflow()` nesting caps at ONE level.** A workflow invoked as a child throws if it calls `workflow()` (the runtime error is literal: *"workflow() cannot be called from within a child workflow - nesting is limited to one level. Inline the inner script or call its agents directly."*). `agent()` nests freely. So a composite that composes OTHER composites (a composite-of-composites, e.g. `milestone-wave` → `pm-triage-gate` → `gh-issue-triage` = depth 2) cannot be expressed by nesting `workflow()`. **Escape hatch:** the TOP composite declares `composition: inline` in its CONTRACT and INLINES its child composites' bodies, calling the underlying ATOMICS one level deep (legal). Its children stay `composition: nested` (default) and remain independently runnable as a TOP. `import`/`require` across sibling scripts is NOT available (the sandbox accepts only `meta` as a top-level export + injected globals), so a "reusable builder fn" pattern cannot work - inline is the only runtime-valid flatten. `check-workflow-sync.js` enforces: a `nested` composite must call `workflow()`; an `inline` composite must STILL call `workflow()` on its atomics (≥1, depth-1). Do NOT reintroduce nested `workflow()` from a composed composite.

```
ORCHESTRATOR LAYER (main loop / milestone-orchestration-prompt - chains composites, owns §3.6 escalation)
  one wave = pm-triage-gate → breakdown → lane-partition → dispatch(task-execute…) → pr-verify-merge → generator-evolution-sweep → close-gate

TIER 1 - composite (.js + .md, 1-level workflow() composition)
├── pm-triage-gate            §3.4 Tracker-First Triage Gate
├── breakdown                 RECURSIVE issue decomposition (see §4 - not story-only)
├── task-execute              wraps one-task-execution-prompt
├── pr-verify-merge           T2 3-lens + opposite-harness grill + programmatic merge gate
├── generator-evolution-sweep §3.11
├── doc-governance            today's proven pipeline: review→adversarial-sweep→fix→verify
└── md-adversarial-grill      fresh Fable 5 adversary over a doc/plan set

TIER 0 - atomic (.js + .md)
  PM/GitHub:  gh-issue-seed · gh-issue-triage · gh-project-sync · gh-subissue-wire · gh-roadmap-mirror
  Execution:  context-load · tdd-implement · codegen-evolve · lane-partition
  Quality:    doc-review · doc-graph-verify · adr-consistency · adversarial-sweep · citation-verify
  Review:     lens-review · opposite-harness-grill
  (Pure-mechanical ops - field-id cache, label-set, file-move - are PLAIN SCRIPTS, not agent workflows, per swarm-rule 3-question test / grill F12.)
```

---

## 4. Recursive breakdown (your correction)

**Breakdown is context-driven, not tier-locked.** Any issue - Epic, Story, Task, even a sub-task - may need splitting into smaller parts when its scope exceeds an atomic, agent-grabbable unit. Stories and larger *almost always* need it; Tasks *sometimes* do.

`breakdown` atomic logic:
1. **Assess grab-ability** - is this issue a single atomic ready-for-agent unit? Test: one owned-path root, one acceptance criterion cluster, ≤L effort, no internal parallelism, no "and"-spanning scope.
2. **If grab-able → stop** (return as leaf).
3. **If not → split** into child issues (vertical tracer-bullet slices per the `to-issues` skill), wire native sub-issues + dependencies, then **recurse on each child** until every leaf is grab-able.
4. **Depth guard** - max recursion depth (e.g. 4) + min-slice floor, to avoid over-splitting; surface to orchestrator if a unit can't be made atomic (likely a design gap → §3.6 escalation).

Recursion runs as orchestrator-chained passes (the composite splits one level, the orchestrator re-invokes on children) - respects the 1-level `workflow()` limit while achieving arbitrary depth. Output: a tree of grab-able leaf issues, all in the tracker with sub-issue + dependency edges.

---

## 5. Determinism strategy (honest)

| Step | Implementation | Deterministic? |
|---|---|---|
| Phase order, gates, idempotency keys | code | **Yes** |
| t1-verify (ci/gitleaks/audit), doc-graph EXIT=0, coverage ≥90% | programmatic gate (exit code) | **Yes** |
| Subtask fan-out count | orchestrator-worker (runtime input) | shape Yes, content No |
| lens-review, adversarial-sweep, breakdown judgement | LLM `agent()` | **No (best-effort)** |
| High-stakes (PHI, schema migration, security ADR) | K-vote / self-consistency + programmatic gate | gated Yes |

3-cycle cap on verify-fix loops → T3 escalation. Resume is same-session only (no durability claim).

---

## 6. Model tiering ([[curaos-model-tiering-rule]])
Frontier gates (adversarial grill, merge gate, wave plan, breakdown assess) use `opus` while Fable is unavailable. Orchestration/judgement → `opus`. Review/sweep → `opus`. Implementation/sync → `sonnet`. PHI stage → `sonnet` min. Pure-mechanical → plain script (no model). No cross-harness auto-routing; opposite-harness only on explicit per-case decision (code grill).

---

## 7. GitHub PM integration (research §26 - the genuinely solid part)
- **gh-project-sync:** deterministic executor code shells `scripts/roadmap-project-item-sync.js`, which calls `scripts/lib/gh-project.js`: `addProjectV2ItemById` (returns existing id on dup) → read flattened Project values → write deltas via aliased batched mutations → clear empties. It derives the custom `CuraOS Milestone` field from frontmatter `milestone:` when caller fields omit it; never write the bare GitHub `Milestone` field for any CuraOS milestone value (the live option list is the Project's `CuraOS Milestone` single-select). Cached field-ID map (`.cache/project-fields.json`) per [[curaos-gh-project-sync-env-workaround]].
- **next_global_id** handling is a SEPARATE concern from the field-ID cache (grill F8) - own atomic step.
- **gh-subissue-wire:** native `sub_issues` (DB `id`) + `addBlockedBy`; diff-first.
- **gh-roadmap-mirror:** fills the missing-script gap (regenerate ISSUE-ROADMAP from tracker).
- **Rate + throttle (grill F8):** the ≤80/min, ≤500/hr token-bucket + checkpoint lives in a **plain Node script with disk access**, NOT in the workflow runtime (which has no fs/shell). The workflow calls the script.

---

## 8. Doc/prompt migration - FORWARD, IN PLACE (grill F10/F11)
No parallel paths. For each procedure that moves prompt→playbook:
1. In ONE change: extract the detail OUT of the prompt INTO the playbook AND replace the prompt section with a pointer link. Never "full prompt + full workflow" coexisting.
2. Before moving any **binding gate** (worker Generator-Evolution Gate §8.75; orchestrator §3.11; in-flight barrier), assign it ONE canonical owner; others link ([[curaos-reuse-dry-rule]]). A gate must not become prose-only where it loses enforceability.
3. Add `docs/agents/workflows.md` trigger map + register slash-commands. Wire all into doc-graph (DG-1) + ai-mirror.

---

## 9. Scope discipline (grill F9/F12)
- **Do NOT build all 18+7 up front.** Prototype the proven one first (`doc-governance` - bounded, no fs/shell-from-runtime, no 93-repo rate exposure), confirm the pattern, then expand.
- **Do NOT build `codegen-evolve`/`generator-evolution-sweep` while any generator/SDK lane is in-flight** ([[curaos-generator-evolution-rule]] barrier).
- Pure-mechanical "atomics" → plain scripts, not workflows.
- Reuse existing scripts (`seed-github-roadmap.js`, `check-doc-graph.js`, `check-ai-mirror.sh`) - wrap, don't reinvent.

---

## 10. Phased plan (on approval; minimal-first)
| Phase | Deliverable | Gate |
|---|---|---|
| A | Contract spec + scoped `check-workflow-sync.js` + `docs/workflows/README.md` standard | sync gate runs |
| B | **Prototype `doc-governance`** (.js+.md) - persist today's pipeline; prove the model | runs end-to-end; re-invoke by scriptPath |
| C | If B proves out: `pr-verify-merge` + `breakdown` (recursive) + `task-execute` | composition + recursion test |
| D | PM atomics (gh-* ) with throttle-in-plain-script | idempotent re-run test, rate-safe |
| E | Forward-migrate prompt detail in place + `workflows.md` + slash-commands | doc-graph + mirror green; no parallel path |
| F | Final fresh-Opus adversarial grill of all new docs + fix | gates green |

Each phase: build → self-verify → fresh-Opus grill (docs) → fix → gate. No phase ships red. **Stop after B for a go/no-go** before the rest.

---

## 11. Open questions
1. **Workflow script home** - `ops/workflows/` (committed, ops-adjacent) vs `ai/curaos/...` mirror. Recommend `ops/workflows/*.js` (code-adjacent, git-durable) + `ai/curaos/docs/workflows/*.md` (spec, doc-graph). OK?
2. **Slash-command scope** - register all composites as `/` commands, or only the top 2-3 (doc-governance, milestone-wave)? Recommend top few.
3. **Air-gap distribution** - defer OCI-artifact workflow registry ([[curaos-airgap-rule]]) until the in-repo library proves value? Recommend yes (YAGNI now).
```
