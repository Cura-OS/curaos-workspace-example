# Workflow Hierarchy Design

This public example keeps the hierarchy pattern without private research notes.

## Pattern

| Layer | Purpose |
|---|---|
| Playbook | Human-readable workflow contract. |
| Executor | Deterministic implementation for repeatable steps. |
| Local issue | Durable work item and evidence trail. |
| GitHub issue | Shared project management state when publishing work. |

See [README.md](README.md).
