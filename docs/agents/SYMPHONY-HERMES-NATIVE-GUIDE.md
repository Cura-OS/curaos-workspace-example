# Symphony-aligned native execution guide for Hermes

Status: support guide for Hermes and other harnesses without Claude Workflow or Agent Workflow Kit
Related plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Local ledger: [SYMPHONY-ADOPTION-GOALS.md](SYMPHONY-ADOPTION-GOALS.md)
Governing rule: [../../ai/rules/curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)

## Purpose

Hermes does not need Claude Workflow or Agent Workflow Kit to follow CuraOS Symphony-aligned workflows. It can execute the same repository-owned playbooks by using native Hermes tools and preserving the same contract, state, evidence, and gates.

## Native mapping

| Symphony/CuraOS concept | Hermes native surface |
|---|---|
| Workflow playbook | `read_file` on `docs/agents/workflows/<name>.md` |
| Plan and local workpad | `todo` for session state, plus edits to `docs/agents/SYMPHONY-ADOPTION-GOALS.md` or future local workpad files |
| Issue or PR tracker reads | `terminal` with `gh` CLI, REST-first and targeted |
| File changes | `patch` for existing files, `write_file` for new files |
| Agent fan-out | `delegate_task` for parallel read/reasoning work, with verification by the parent agent |
| Long local jobs | `terminal(background=true, notify_on_complete=true)` for bounded jobs, `process` for reconciliation |
| Browser or desktop proof | `browser_*` or `computer_use` tools when UI evidence is required |
| Verification evidence | real command output from `terminal`, file readback, screenshots, or API responses |
| Reflection | Update the local ledger before any GitHub sync; explicit tracker parity syncs are dual-way by default |

## Execution steps

1. Load `hermes-agent` skill if the task modifies Hermes itself.
2. Load or follow the Symphony alignment skill when available.
3. Read the project rule, plan, local ledger, and the specific workflow playbook.
4. Convert the playbook phases into a Hermes `todo` list.
5. Read relevant files and context before edits.
6. Use Hermes tools to perform the workflow phases natively.
7. Keep progress local until a real sync checkpoint is reached.
8. Verify with the exact commands required by the playbook and CuraOS gates.
9. Update the local ledger reflection and sync queue.
10. Only then create or update GitHub PRs/issues if the local ledger says sync is needed.

## Done criteria

A Hermes-native Symphony workflow run is done only when:

- The requested playbook phases are complete or a real blocker is surfaced.
- Evidence exists for every claim.
- Local progress and reflection are recorded.
- GitHub sync, if any, is explicit and dual-way for tracker parity checkpoints.
- The final answer names changed files, validation commands, and blocker status.
