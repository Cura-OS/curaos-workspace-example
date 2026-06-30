# Grill — M10 integration-harness hardening (curaos-ai-workspace#311)

- **Issue:** your-org/curaos-ai-workspace#311
- **Branch:** `agent/m10-311-integration-harness-fifo-claude-c8d4e519`
- **Reviewer:** Codex (opposite-harness, `codex exec --sandbox read-only`, account-default model, reasoning_effort=high)
- **Implementer:** Claude (claude-c8d4e519)
- **Date:** 2026-06-02
- **Scope reviewed:** 3 owned files in `curaos/test/integration/m10-cross-service/` (event-bus.ts FIFO queueing, cross-service-flows.test.ts assertion + new tests, README path).

## Verdict

No critical blockers. All findings carried recommendations → auto-applied per
`ai/rules/curaos_recommendation_auto_apply_rule.md` (2026-05-29 directive).

## Findings + resolution

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | FIFO nested-publish queue is correct: enqueue → re-entrant defer (`draining`) → drain after fan-out. Tests cover `[A,B,inner]` + multi-nested FIFO. | confirm-correct | accepted, no action |
| 2 | `reset()` did not clear `pending`/`draining` — a handler throwing mid-drain could leak a queued nested message into the next flow. | major (correctness) | **auto-applied**: `reset()` now scrubs `pending` + `draining`; added a regression test (`reset() after a handler throws mid-drain leaves no queued nested message to leak`). |
| 3 | Any publish while `draining=true` enqueues, so a *concurrent top-level* publish would resolve its `await` before its own fan-out — promise contract weaker than docstring implies. | minor (contract clarity) | **auto-applied**: documented the single-flight contract in the `publish` docstring. The harness drives flows sequentially (each test awaits its top-level publish), so concurrent top-level publish never occurs — mirrors a single append-ordered broker log. Intentionally unsupported. |
| 4 | Existing Flow 4 / Flow 5 assertions do NOT rely on a nested publish completing inside the handler (they assert after the outer await). | confirm-no-regression | accepted; verified by 14/0/3-skip green run. |
| 5 | Tenant-B assertion now genuinely non-tautological (b-1 emitted under TENANT_B; `tenantBView` must equal `['b-1']`; views disjoint). | confirm-correct | accepted, no action |
| 6 | README runbook artifact "missing under /tmp/wt-311". | false-positive | The runbook lives in the workspace `ai/curaos/` mirror tree, NOT the code-only `curaos/` repo (the mirror rule + the exact point of the README clarification). Codex only had the `curaos/` worktree mounted, so it could not see it. No action. |
| 7 | `bun.lock` modified outside the 3-file scope. | scope hygiene | Worktree-isolation artifact (only 7 of ~70 submodules installed → partial lockfile). **NOT staged/committed.** |

## FORESIGHT emitted

- `kind=idea milestone=unknown scope=curaos/test/integration/m10-cross-service what=event-bus could expose a typed single-flight/concurrent-publish contract (or a queue-depth assertion helper) why=current concurrent-top-level-publish semantics are documented-only, not enforced by a test` — captured as a closeout FORESIGHT line, not implemented inline (out of issue scope).
