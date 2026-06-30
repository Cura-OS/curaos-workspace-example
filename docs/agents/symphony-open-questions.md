# Symphony Adoption Open Questions

Status: local question queue
Parent plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)

## Questions

| ID | Question | Current recommendation | Status |
|---|---|---|---|
| Q1 | Should CuraOS add a root `WORKFLOW.md`? | No for now. Existing paired playbooks and executors are the repository-owned contracts. Add a generated compatibility view only if a runner needs it. | Recommended |
| Q2 | Should Linear support be added? | No. Keep GitHub as the tracker adapter. | Recommended |
| Q3 | Should Codex app-server be required? | No. Keep it optional and adapter-scoped. | Recommended |
| Q4 | Should local workpads be markdown, JSON, or SQLite first? | SQLite is the machine issue store, markdown is the human ledger, and JSON views are optional exports. | Resolved |
| Q5 | Should GitHub issues be seeded for every adoption task now? | No. Use local ledger until PR or durable shared tracking is needed. | Recommended |

## Promotion rule

Promote a question to `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` or a full ADR only when it becomes cross-cutting and binding beyond this adoption effort.
