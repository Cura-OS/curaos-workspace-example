# Shared: Subagent Model + Effort Routing

Canonical routing contract for every dispatched subagent/worker/reviewer lane (both [prompts](../milestone-orchestration-prompt.md) point here; the model matrix itself is owned by `ai/rules/curaos_model_tiering_rule.md`). See also [one-task prompt](../one-task-execution-prompt.md) section 2.75 for the worker-side gate.

Binding rules:

- No subagent/worker/reviewer is dispatched without an explicit model + effort assignment; never inherit parent model or parent effort by default.
- Resolve role -> model -> effort from `ai/rules/curaos_model_tiering_rule.md` (canonical current-harness matrix). Do NOT inline model names in prompts or durable issue bodies; they rot on every release.
- Stay inside the current harness. No cross-harness routing unless the user explicitly asked this session; the opposite-harness adversarial grill is the standing exception because the prompts explicitly require it.
- HealthStack PHI: obey the PHI routing floor from the tiering rule; never a budget/mechanical model.
- If the available subagent mechanism cannot set explicit model/effort, do not silently inherit: use a mechanism that can, keep the lane in the parent, or stop with `STATUS: blocked`, `BLOCKER: explicit-model-effort-unavailable`.
- Invoke `subagent-orchestration` before partitioning/dispatching; record routing per lane: `ROUTING: <role/task_class/model/effort/routing_source>`.

Lane class -> effort mapping (apply after role/risk):

- Planner/orchestrator lane (architecture, dependency graph, ambiguous requirements, cross-module reasoning): strongest current-harness model, high/xhigh effort.
- Worker lane (normal Story/Task/Bug implementation, adapters, focused debugging, known patterns): worker model, medium effort.
- Mechanical lane (formatting, fixture update, narrow doc sync, small generated-artifact check): mechanical model, low effort.
- Review/adversarial lane (Security/Architecture/QA PR lens, auth/shell/network/PHI, final integration review, grills): reviewer model; strongest model + high/xhigh effort when blast radius or risk is high.
- Frontmatter effort maps: `S` + mechanical -> low; `M`/normal implementation -> medium; `L`, architecture, ambiguous, cross-cutting, security/PHI, final review -> high/xhigh.

Harness invocation examples:

- Claude: `cd <worktree> && claude --model <model> --effort <low|medium|high|xhigh> -p "<prompt>"`
- Codex: `codex exec -m <model> -c model_reasoning_effort="<low|medium|high|xhigh>" --sandbox <read-only|workspace-write> --cd <worktree> "<prompt>"`
- Pi: `pi --provider <provider> --model <model> --thinking <low|medium|high|xhigh> -p "<prompt>"`
