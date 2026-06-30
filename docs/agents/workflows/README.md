# CuraOS Agent-Workflow Library

Deterministic-orchestration workflows for CuraOS agent work. **This is the agent-workflow library** (orchestration of Claude/CLI agents) - distinct from `ai/curaos/docs/workflows/` which holds product **BPM/Flow-IR** definitions.

> Design + rationale: [HIERARCHY-DESIGN.md](HIERARCHY-DESIGN.md). Trigger map: [../workflows.md](../workflows.md). Symphony alignment plan: [../SYMPHONY-ALIGNMENT-PLAN.md](../SYMPHONY-ALIGNMENT-PLAN.md).

## What a workflow is here

Each workflow is a **pair**:

| Artifact | Path | Role |
|---|---|---|
| Playbook | `docs/agents/workflows/<name>.md` | Cross-CLI **spec** (any agent reads + executes as a runbook) + the contract. Doc-graph node. Precedence-bearing. |
| Executor | `scripts/workflows/<name>.workflow.js` | Claude-Code **JS executor** (deterministic orchestration of LLM agents). Invoked by `scriptPath` or its slash-command. |

The `.md` is canonical for the **contract** (inputs/outputs/gates); the `.js` must satisfy it. `scripts/check-workflow-sync.js` enforces the machine-checkable subset.

## Symphony alignment

OpenAI Symphony is treated as a standards input for this library. CuraOS keeps its paired playbook/executor model rather than replacing it with a single root `WORKFLOW.md`. `scripts/check-symphony-conformance.js` maps every public playbook to the Symphony concepts captured in [../SYMPHONY-CONFORMANCE.md](../SYMPHONY-CONFORMANCE.md): tracker adapter, trigger mode, workspace owner, hooks, runner adapter, prompt inputs, state model, local SQLite issue storage, retry/reconciliation, observability, safety, GitHub sync, validation, and TDD evidence.

Harness-neutral execution remains binding. Claude may use native `Workflow`; Agent Workflow Kit users may call `workflow-run`; Hermes and other harnesses without either layer execute the playbook natively with their own tools per [../harness-native-playbook-execution.md](../harness-native-playbook-execution.md) and [../SYMPHONY-HERMES-NATIVE-GUIDE.md](../SYMPHONY-HERMES-NATIVE-GUIDE.md).

Every harness starts a CuraOS request by picking the closest playbook here. If a request is too small for a full executor, still use the playbook's harness mapping, local issue DB, evidence, and closeout gates. Local issue hierarchy is part of the contract: create or find the main issue first, then attach run-specific child issues with `parent_id` unless the work owns its own durable roadmap outcome.

Before launching broad orchestration, the harness must ask the user whether to run a ready-open-issues wave or an unblock-prep wave. A wave means a full Symphony workflow run to a verified stop state, not a background best-effort sweep.

## Verified runtime reality (Claude Code 2.1.156)

- Workflows run via the `Workflow` tool; `agent({model})`, `parallel()`, `pipeline()`, `workflow('name'|{scriptPath})` (1-level nesting), schema-validated boundaries are real.
- **Persistence = git** (commit the `.js`) + optional **slash-command** registration. There is NO auto-discovered `.claude/workflows/` registry.
- **Resume is same-session only** - exit Claude → next run starts fresh. Not durable across restarts.
- Concurrency: up to 16 agents (fewer on limited cores); 1000-agent total cap per run.
- **No filesystem/shell from inside the workflow runtime** - side-effecting ops (git, gh, fs) run as plain scripts the workflow shells to via `agent()` Bash, or are done by the orchestrator.
- **`args` arrives as a JSON STRING**, not a parsed object - every workflow must `JSON.parse` it (read it lazily inside the run body, not at top-level module load, or it captures `undefined`). See the `parseArgs` helper in `doc-governance.workflow.js`.
- **Executor syntax is runner-compatible script syntax.** `agent-workflow-kit workflow-run` evaluates committed `.workflow.js` files through the workflow runner, not plain `node`. Load Node built-ins via Node 24's runtime builtin loader (`const { execFileSync } = process.getBuiltinModule("node:child_process")`). Do not add top-level ESM `import { ... } from "node:..."`, CommonJS `require(...)`, or top-level `await import(...)` in workflow executors; one of the two gates (`agent-workflow-kit workflow-run` or `node --check`) can pass while the other fails before phase 1.
- **Metadata export split:** workflows that directly use shell/fs built-ins must keep `meta` as a plain `const`, not `export const meta`; the exported-meta runner sandbox has no `process`. Pure LLM/control-flow workflows may still export `meta`.

## Cross-Harness Invocation

Claude Code stays native: use `.claude/commands/<name>.md` or `Workflow({ scriptPath: "scripts/workflows/<name>.workflow.js", args: {...} })`.

Non-Claude harnesses use the installed `agent-workflow-kit` pack for their native command/skill/tool surface, which delegates to the shared CLI from the workspace root. The generic resolver finds committed executors by name under `scripts/workflows/<name>.workflow.js`, so these project workflows are invocable without wrapper files:

```sh
agent-workflow-kit workflow-run milestone-wave --args-json '{"milestone":"active","dry_run":true}' --json
agent-workflow-kit workflow-run task-execute --args-json '{"issue":"OWNER/REPO#123","dry_run":true}' --json
agent-workflow-kit workflow-run pr-verify-merge --args-json '{"pr":"OWNER/REPO#123","auto_merge":false}' --json
agent-workflow-kit workflow-run doc-governance --args-json '{"manifest":"/absolute/path/to/manifest.txt","mode":"review-only"}' --json
```

Codex, Antigravity, Grok, OpenCode, and Pi expose those same calls through their `agent-workflow-kit` plugin/extension command names. Keep workflow script paths relative to the workspace root; do not bake machine-local absolute paths into executors.

**Stub vs real agents (kit CLI; RP-44):** by default the kit CLI runs every `agent()` leg through `schemaDefaultAgent` - a schema-default STUB that exercises control flow only (the workflow-defect #508 legacy path, kept for plan-only/dry runs). A stub pass is NEVER evidence that real work ran. Append `--real-agents` to spawn real CLI agents (`claude -p` / `codex exec` per agentType); `--agent-timeout-ms <ms>` bounds each spawned agent and is valid only with `--real-agents`:

```sh
agent-workflow-kit workflow-run milestone-wave --args-json '{"milestone":"active","dry_run":true}' --real-agents --agent-timeout-ms 600000 --json
```

Claude Code's native `Workflow` tool always runs real agents (the flag exists only on the kit CLI). A DISPATCHING real-agent run (one that can claim issues / open PRs) must be preceded by the in-flight generator/SDK/contracts preflight (paginated probe empty, archived with the run evidence); when the executor-side barrier cannot be proven active for the invoked path, constrain the run to `dry_run: true` (no-dispatch mode). See the orchestration prompt's "Real-agent mode" note.

## Event Streams

For long real-agent runs, do not manually poll `workflow-status` in chat. Launch with the kit-native stream mode so phase, log, agent start, retry, done, heartbeat, and terminal events stay visible:

```sh
agent-workflow-kit workflow-run milestone-wave --args-json '{"milestone":"active","dry_run":false,"auto_merge":true,"init_submodules":true}' --real-agents --agent-timeout-ms 600000 --stream --json
```

Or attach to a known run:

```sh
agent-workflow-kit workflow-events wf_xxx --follow
```

With `--stream --json`, event lines go to stderr and the final run JSON stays on stdout. With `workflow-events --follow --json`, events are JSONL. Both paths read `.agent-workflow-kit/runs/<run-id>/events.jsonl` plus `run.json` via file notifications and exit nonzero when terminal `run.json.status == failed`.

Executor progress contract: every long workflow should emit `phase()` and `log()` before and after slow deterministic batches, and every `agent()` call must have a precise `label` and `phase/group`. Long side-effecting agent prompts should ask the agent to include a compact progress summary in its structured result when the schema allows it. If the schema cannot carry progress fields, the executor labels and event stream are the required progress surface.

The tracked `.agent-workflow-kit/config.json` keys (`ultracode`, `ultracodeKeywordTriggerEnabled`, `ultracodeEffortMode`, `disableWorkflows`) are consumed only by the external globally installed kit binary (owning version: `agent-workflow-kit` 0.1.3, CLI 0.1.2); nothing in this repo reads them. A kit-side key rename silently no-ops this tracked config, so re-verify the keys against the kit's ultracode/workflow config handling when bumping the kit version (the kit currently exposes no config-validate command to gate this mechanically).

## Determinism contract (honest)

**Deterministic:** control flow (phase order), programmatic gates (exit codes, schema validation), idempotency keys.
**Best-effort (non-deterministic):** every `agent()` LLM output - schema constrains shape, not content. High-stakes correctness uses programmatic gates or K-voting, never "trust the agent."

## CONTRACT (every workflow declares this)

The playbook `.md` carries this as YAML frontmatter; the `.js` exports a matching `CONTRACT` const.

```yaml
name: <kebab-name>
kind: atomic | composite
version: <semver>            # add field = minor; remove/rename/retype = major
inputs:  { <key>: { type, required, desc } }
outputs: { <key>: { type, desc } }
guarantees:
  idempotent: true | false
  determinism: control-flow-only
  side_effects: none | github | git | fs
verification: T1 | T2 | T3   # per ../../../ai/rules/curaos_verification_stack_rule.md
composition: nested | inline # composites only; default nested. inline = the composite INLINES its children's bodies (reaching their atomics 1-level deep) instead of workflow()-nesting them - required when a composite would otherwise exceed the 1-level workflow() nesting cap (e.g. a TOP composite-of-composites).
models: { <phase>: opus | sonnet | haiku }
composes: [<atomic-names>]   # composites only
```

`opus` / `sonnet` / `haiku` are logical tier labels. Executors must map them to the active harness's native model/effort surface or omit the override when the harness already supplies the configured model. Raw logical model passthrough is allowed only for runners explicitly configured with `AGENT_WORKFLOW_KIT_PASS_LOGICAL_MODELS=1`; passing an unsupported tier label through as a raw model id and accepting schema-default output is a workflow defect.

> **`workflow()` nesting caps at ONE level (hard runtime throw).** `agent()` nests freely, but a workflow invoked as a child cannot call `workflow()`. A composite-of-composites (e.g. `milestone-wave` → `pm-triage-gate` → `gh-issue-triage`) is 2 levels and throws. Escape hatch: the TOP composite sets `composition: inline` and inlines its child composites' bodies, calling the underlying ATOMICS one level deep (legal). The child composites stay `composition: nested` (default) and remain independently runnable as a TOP. Do NOT reintroduce nested `workflow()` from a composite that is itself composed.

```js
// scripts/workflows/<name>.workflow.js
// NOTE: pure workflows may use `export const meta`; deterministic shell/fs workflows use plain `const meta`
// because the exported-meta runner sandbox has no `process`. CONTRACT is a plain (non-exported) const.
const meta = { name, description, phases: [...] }          // Plain const when the executor uses process.getBuiltinModule
const CONTRACT = { name, kind, version, inputs, outputs, guarantees, verification, composition, models, composes }
const { execFileSync } = process.getBuiltinModule("node:child_process") // Node built-ins: no static import/require/top-level await
// ... script body (reference CONTRACT.models.<phase> for per-phase model)
```

`check-workflow-sync.js` deep-equals the `.md` frontmatter `CONTRACT` block against the `.js` `CONTRACT` export. Contract drift fails CI. It does NOT diff prose-vs-code semantics.

## Tiers

- **atomic** - one job; may call `agent()` but no other workflow.
- **composite** - `workflow()`-composes atomics, 1 level deep.
- **orchestrator-chained** - NOT a workflow; the main loop / milestone-orchestration-prompt chains composites across turns, owning human-escalation (§3.6).

## Adding a workflow

1. Write the `.md` playbook (contract frontmatter + phases + gates + model-tiering).
2. Write the `.js` executor exporting a matching `CONTRACT`.
3. Add the `symphony:` frontmatter block described in [../SYMPHONY-CONFORMANCE.md](../SYMPHONY-CONFORMANCE.md).
4. Run `node scripts/check-workflow-sync.js` and `node scripts/check-symphony-conformance.js` - both must pass.
5. Wire the playbook into the doc-graph (link from this README's index + the `workflows.md` trigger map); run `bun scripts/check-doc-graph.js`.
6. (Optional) register a slash-command shim in `.claude/commands/<name>.md`.

## Library index

**Composites**

| Workflow | Purpose |
|---|---|
| [doc-governance](doc-governance.md) | review → adversarial-sweep → fix → verify, over a doc set |
| [pm-triage-gate](pm-triage-gate.md) | §3.4 triage gate: per candidate triage + project-sync + wire, then mirror (composes the 4 gh-* atomics) |
| [breakdown](breakdown.md) | recursively decompose any issue into grab-able atomic units + wire sub-issues/deps |
| [task-execute](task-execute.md) | execute one issue: context-load → branch → TDD → PR (composes context-load + tdd-implement) |
| [pr-verify-merge](pr-verify-merge.md) | T2 PR gate: 3-lens review + adversarial grill + programmatic merge (composes lens-review + opposite-harness-grill) |
| [milestone-wave](milestone-wave.md) | ONE non-interactive pass of a milestone wave: scan → triage → breakdown → prioritize (unblock-leverage) → dispatch → verify → foresight (composes pm-triage-gate + wave-prioritize + breakdown + task-execute + pr-verify-merge + foresight-sweep); orchestrator re-invokes across turns |
| [foresight-capture](foresight-capture.md) | per foresight observation: focused handoff → focused subagent specs it → seed staged `foresight` issue (target version when known, Backlog at birth, later normal triage) |
| [foresight-sweep](foresight-sweep.md) | discover future work and dependency work (debt/ideas/risks/prereqs) across milestones (wave or cross-milestone mode) + seed it through foresight-capture |

**Atomics**

| Workflow | Purpose |
|---|---|
| [context-load](context-load.md) | read canonical context + surface blockers before a task |
| [tdd-implement](tdd-implement.md) | red-green-refactor one issue + T1 gate + Generator-Evolution closeout |
| [lens-review](lens-review.md) | one lens (Security/Architecture/QA) of the T2 code review |
| [opposite-harness-grill](opposite-harness-grill.md) | fresh-adversary Tier-2 grill; persists verdict to `ai/curaos/docs/grills/` |
| [wave-prioritize](wave-prioritize.md) | rank ready candidates by transitive unblock-leverage + partition parallel-safe lanes (deterministic dep-graph math; leverage = order, gates still bind) |
| [gh-issue-seed](gh-issue-seed.md) | create one canonical agent-consumable issue (idempotent) |
| [gh-issue-triage](gh-issue-triage.md) | triage one issue to its state label + paper-vs-real blocker |
| [gh-pr-gate-snapshot](gh-pr-gate-snapshot.md) | deterministic REST snapshot for PR merge-gate facts |
| [gh-project-sync](gh-project-sync.md) | idempotent project item add + 3-way field reconcile |
| [gh-subissue-wire](gh-subissue-wire.md) | diff-first native sub-issues + dependencies |
| [gh-roadmap-mirror](gh-roadmap-mirror.md) | regenerate ISSUE-ROADMAP from live tracker |

PM atomics share the canonical lib `scripts/lib/gh-project.js` (idempotent add, 3-way reconcile, content-creation token bucket). Trigger map: [../workflows.md](../workflows.md). Full planned set + rationale: [HIERARCHY-DESIGN](HIERARCHY-DESIGN.md).
