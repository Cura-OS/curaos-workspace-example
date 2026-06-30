# Symphony Rollout Sequence

Status: rollout plan shard
Parent plan: [SYMPHONY-ALIGNMENT-PLAN.md](SYMPHONY-ALIGNMENT-PLAN.md)

## Sequence

1. Substrate docs and rule.
2. Hermes skill and native guide.
3. Conformance map and checker.
4. Local-first workpad schema and helper.
5. High-priority playbook updates.
6. Executor updates only when contracts change.
7. Local CI and docs gates.
8. PR sync after local proof.

## Stop gates

- Stop before broad workflow edits if the conformance checker is absent.
- Stop before GitHub sync if local docs and workflow checks are not green.
- Stop before runner adapter changes if the target harness cannot be locally verified.
- Stop before unsafe permission changes or T3 actions and ask.

## Batch sizing

Keep batches small:

- Batch A: docs, rule, skill.
- Batch B: checker and local workpad helper.
- Batch C: first two playbooks.
- Batch D: remaining public playbooks.
- Batch E: cleanup and rollout docs.
