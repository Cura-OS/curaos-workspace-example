# Symphony Adapter Boundaries

Status: boundary guide for tracker and runner adoption
Related rule: [../../ai/rules/curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)

## Tracker boundary

Symphony's example uses Linear. CuraOS uses GitHub Issues plus the CuraOS Roadmap Project.

Generic workflow language may say `tracker`, but CuraOS implementation language must name the adapter:

- GitHub issue for shared work item.
- GitHub PR for review and merge artifact.
- GitHub Project for roadmap fields.
- Local SQLite issue database for active machine issue state.
- Local workpad and markdown ledger for human progress summaries and reflection.

## Runner boundary

Symphony's example uses Codex app-server. CuraOS supports multiple runners.

Generic workflow language may say `agent_runner`, but implementation language must name the adapter:

- Claude native Workflow.
- Agent Workflow Kit.
- Hermes native tools.
- Codex CLI or Codex app-server when explicitly scoped.
- Other CLI agents through playbook-native execution.

## Safety boundary

Upstream examples are not safety policy. CuraOS safety policy comes from `ai/rules/`, including T1/T2/T3, local CI, no secret logging, PHI boundaries, and destructive-operation confirmation.

## Implementation boundary

Workflow and Symphony-alignment code must follow TDD. Do not add or change `scripts/lib/*`, `scripts/workflows/*`, workflow checkers, or local issue CLIs until a focused failing test proves the desired behavior.

## Import rule

When importing an upstream Symphony example, first classify each behavior as one of:

- Generic pattern to adopt.
- Tracker adapter behavior.
- Runner adapter behavior.
- Unsafe or conflicting behavior to reject.
- Research-only note.

Only generic patterns belong in shared playbooks.
