# Grill — M10 #277 tasks-core-service scaffold (PR #1)

- **Story:** your-org/curaos-ai-workspace#277 — tasks-core-service scaffold + FHIR Task + status lifecycle
- **Branch:** `agent/scaffold-tasks-core-277` (submodule `tasks-core-service`)
- **Reviewer (opposite harness):** Codex (`codex exec -m gpt-5-codex -c model_reasoning_effort=high --sandbox read-only`) — **HUNG** (>15 min, no streamed output, killed SIGTERM exit 144). Per one-task-execution-prompt §4 fallback ("Codex stalls → default model effort high; if STILL hangs, verify directly + record orchestrator-verified note + OPEN THE PR anyway"), this grill is **ORCHESTRATOR-VERIFIED** via direct adversarial audit of the domain code below.
- **Date:** 2026-06-02
- **Verdict:** PROCEED — orchestrator-verified. Status machine matches ADR-0203 §4.4; event payload reference-only (no PHI); CodeRabbit domain findings = 0 Critical/Major.

## Scope reviewed

Filled tasks domain on top of the hardened codegen mold (curaos `2d2379e`, `--core-only`): `drizzle/schema.ts` (the `tasks` table), `src/tasks/tasks.dto.ts`, `src/tasks/tasks.service.ts`, `src/tasks/tasks.controller.ts`, `src/events/tasks-event-producer.ts` (the FHIR-Task surface), `test/tasks.service.test.ts` — vs ADR-0203 §4.4.

## Orchestrator-verified adversarial audit (codex hung — direct review)

The three highest-risk grill targets for a status-lifecycle domain, audited directly:

| # | Check | Result |
|---|---|---|
| 1 | **Status machine vs ADR-0203 §4.4** — programmatic diff of `STATUS_TRANSITIONS` against the ADR edge set (DRAFT→ACTIVE/CANCELLED, ACTIVE→ON-HOLD/COMPLETED/CANCELLED, ON-HOLD→ACTIVE). | **PASS** — every ADR core edge present; COMPLETED/CANCELLED terminal; ON-HOLD→CANCELLED added as a reasonable extension. No missing edge, no illegal edge admitted. |
| 2 | **Event payload PHI leak** — scan the `TaskDomainPayload` snake_case envelope for PHI-shaped field names; confirm assignee/requester are UUID references not names. | **PASS** — reference-only; `assignee_id`/`requester_id` are opaque UUID refs, `title` is the neutral label. No `ssn`/`dob`/`*_name` field on the wire (matches ADR-0115 PHI-partitioning + calendar sibling's reference-only VEVENT contract). |
| 3 | **Transition guard holes** — no-op self-transition + terminal-state escape. | **PASS** — `assertTransition` rejects `from === to` (no spurious `task.status.changed`) AND any edge not in the graph (COMPLETED→ACTIVE → 400). Tests cover both. |

## CodeRabbit (committed-vs-main) — 10 findings (Major 1, Minor 9)

Classified by domain-vs-mold:

- **Major — `test/integration/audit-chain-e2e.test.ts` (dead SSN assertion + stdout/stderr stub gap):** MOLD-emitted. Verified **byte-identical** to `calendar-core-service` after `s/tasks/calendar/` substitution. The calendar sibling grill flagged this exact finding as mold-class and PROCEEDED. **NOT domain code** → flagged to orchestrator (no `tools/codegen` edits — concurrent sibling scaffold worker).
- **Minor — `drizzle/schema.ts:198` nullable idempotency_key:** the MOLD's `audit_outbox` table (lines 124-176), not the `tasks` domain table. Mold-class.
- **Minor — `test/integration/auth-helpers.ts:61`, `drizzle.config.ts:7` dev fallback:** mold-class.
- **Minor — `Dockerfile:7` base-image digest:** KNOWN-PENDING (#299 placeholder digest).
- **Minor — `src/tasks/tasks.controller.ts:133` returns full `TaskMutation`:** domain code, but **intentional** — matches the accepted calendar-core sibling design (the one-transaction outbox contract: the controller returns `{record, event}` so the app-layer persistence/outbox interceptor persists the row + enqueues the event atomically). The calendar grill PROCEEDED with the identical `CalendarEventMutation` return. Not Critical/Major; kept for sibling parity per [[curaos-reuse-dry-rule]].

**0 Critical/Major in DOMAIN code** — the only Major is mold-class.

## Verdict

PROCEED to PR (orchestrator-verified; codex grill hung and was not allowed to stall the lane per §4 fallback). Status machine + event contract + transition guards verified directly against ADR-0203 §4.4. Mold-class CodeRabbit findings flagged to the orchestrator. Deferred items (FHIR Task HAPI write, dependency enforcement, app-layer persistence/outbox wiring) are gated on healthstack-careplans-service + the modulith host and documented in the PR body.
