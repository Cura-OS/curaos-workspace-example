# Symphony Workflow Gap Matrix

Status: implemented gap matrix for current reusable workflows
Plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)
Conformance map: [SYMPHONY-CONFORMANCE.md](SYMPHONY-CONFORMANCE.md)

## Initial workflow priority

| Workflow | Why first | Main gap |
|---|---|---|
| `task-execute` | Core one-issue implementation path | Frontmatter mapping added and checked. |
| `milestone-wave` | Main orchestrator pass | Frontmatter mapping added and checked. |
| `pm-triage-gate` | Tracker readiness gate | Frontmatter mapping added and checked. |
| `pr-verify-merge` | T2 review and merge gate | Frontmatter mapping added and checked. |
| `context-load` | Required context and blocker check | Frontmatter mapping added and checked. |
| `wave-prioritize` | Lane partition and scheduling | Frontmatter mapping added and checked. |
| `opposite-harness-grill` | Cross-harness adversarial proof | Frontmatter mapping added and checked. |

## Gap classes

| Gap class | Description | Fix owner |
|---|---|---|
| Contract mapping | Playbook lacks Symphony concept fields | Playbook or generated conformance matrix |
| Prompt rendering | Unknown variables may not fail closed | Future checker and tests |
| Local workpad | Progress stored only in chat or tracker | Local-first workpad helper |
| Sync budget | Broad GitHub reads during local checks | GitHub sync policy and helper reuse |
| Runner boundary | Generic docs imply a specific harness | Harness adapter docs and Hermes skill |
| Workspace safety | Owned root is implicit | Conformance map and lane context bundle |
| Observability | Events are tool-specific | Local status snapshot design |
| Source hygiene | Tracked and untracked workflow markdown plus scripts can drift outside playbook frontmatter checks | `scripts/check-symphony-source-audit.js` |

## Update order

1. Conformance checker added.
2. Local SQLite issue schema and helper added.
3. All public reusable playbooks updated with `symphony:` frontmatter.
4. Executors unchanged because machine CONTRACT fields did not change.
5. Tracked and untracked workflow markdown plus script audit added.
6. Workflow sync, conformance, source audit, and docs gates run after the batch.
