# Grill — curaos#189 (gen:sdk -core-service resolution, issue #309)

> Cross-harness grill: Codex → Claude. PR `your-org/curaos#189`, branch
> `agent/m10-309-gen-sdk-core-resolution-claude-3a09c1d2`, commit `0ccc171`. Closes
> `curaos-ai-workspace#309`. Grill run 2026-06-02. Verdict transcribed by the orchestrator
> because the Codex sandbox rejected writing this path directly (verdict was returned in the
> rescue agent's final message).

## Verdict: APPROVE

No P0/P1. The invariant holds for `calendar` and `tasks`; the fallback errors before writing
files; executable shipped SDK paths use the resolved core slugs; CLI validation blocks
traversal-shaped names. (Remote `gh pr diff` was network-blocked in the sandbox, so evidence
came from the local commit `0ccc171`.)

| ID | Severity | Area | Finding |
|---|---|---|---|
| G1 | P2 | Auto resolution | Auto mode silently chooses `<name>-service` when both plain AND core contracts exist for the same name |
| G2 | P3 | Test coverage | No regression test covers the name-collision case or malicious SDK names |

### [G1] [P2] Auto-mode precedence on a name collision
**Evidence:** `tools/codegen/src/sdk-emit.ts:51-56`, `:148-153`.
**Attack:** with BOTH `backend/services/calendar-service/specs/calendar.tsp` and
`backend/services/calendar-core-service/specs/calendar.tsp` present, default `gen:sdk calendar`
picks the plain dir first.
**Impact:** current `calendar`/`tasks` are clean (only the core variant exists), but a future
dual-layout name could silently target the wrong source. Non-blocking — filed as a follow-up
(explicit `--core`/`--service-slug` already overrides; the gap is only the silent `auto` default).

### [G2] [P3] No collision/malicious-name regression test
Follow-up: add a snapshot test asserting the precedence (or an explicit error) when both layouts
exist, plus a traversal-name rejection test.

## Follow-up
P2 + P3 captured as foresight (non-merge-blocking per §3.7). Merge proceeded on the clean APPROVE.
