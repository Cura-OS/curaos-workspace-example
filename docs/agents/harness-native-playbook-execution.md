# Harness-native Playbook Execution

Status: generic fallback rule for harnesses without a workflow runtime
Related: [SYMPHONY-HERMES-NATIVE-GUIDE.md](SYMPHONY-HERMES-NATIVE-GUIDE.md)

## Purpose

A CuraOS playbook must remain usable even when the active harness does not support Claude Workflow or Agent Workflow Kit. The harness reads the playbook, translates phases to native tools, preserves local-first state, and proves outcomes with real evidence.

## Generic steps

1. Read `AGENTS.md`, relevant `ai/rules/`, the plan or issue brief, and the target playbook.
2. Create a local task list in the harness-native planning surface.
3. Read relevant files before edits.
4. Execute phases in order.
5. Use local workpad state for progress and reflection.
6. Run exact verification commands.
7. Sync to GitHub only at explicit checkpoints.
8. Report changed files, evidence, and blocker status.

## Harness examples

| Harness | Native planning | Native fan-out | Native verification |
|---|---|---|---|
| Hermes | `todo` | `delegate_task` | `terminal`, file tools, browser, computer use |
| Codex CLI | AGENTS.md plus prompt plan | subcommands or Agent Workflow Kit if installed | shell commands in sandbox |
| Claude Code | Native Workflow or plan mode | `Task` agents | shell and workflow gates |
| Generic CLI | local checklist in prompt | separate CLI runs | shell commands and file readback |

## Required invariants

- Do not invent missing files, symbols, commands, or test output.
- Do not treat stub-agent runs as evidence of real work.
- Do not write GitHub comments for routine local progress.
- Do not bypass T3 or destructive-operation confirmation gates.
- Do not import harness-specific policy into generic playbooks.
