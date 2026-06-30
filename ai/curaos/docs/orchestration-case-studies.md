# Orchestration Case Studies (M3–M5 unblock wave)

Concrete worked examples of the patterns in [`docs/agents/milestone-orchestration-prompt.md`](../../../docs/agents/milestone-orchestration-prompt.md). Reference material — **not loaded into the orchestrator prompt** (it kept the prompt at the AP-7 context-bloat line). Reuse the SHAPE, not the verbatim text; specifics here are historical and may have rotted.

## Example 1 — Real-vs-Paper blocker triage that broke a milestone open

M4 "Builder v0" had 7 issues all labeled `blocked`. Surface reading said "wait for M3 close." Real triage found:
- builder-core-service#1 was actually unblocked because `@curaos/auth-sdk` had already shipped (M3-S6); the only real wait was `@curaos/*` package consumption in CI, which had its own follow-up issue.
- builder-core-service was NOT registered as a submodule in `curaos/.gitmodules` — a paper "not yet started" gap; orchestrator added the submodule in a glue lane within 5 minutes.

Outcome: one glue lane + one user decision (D1 hybrid CI) + one worker dispatch (L12) → M4-S1 lands in same wave.

## Example 2 — User escalation funnel collapsed 4 decisions into one interrupt

Wave had 4 user-only blockers: Verdaccio-in-CI (D1), wf-core auth posture (D2), durable outbox design (D3), role-refresh reconciliation (D4). Instead of asking one at a time, orchestrator built one `AskUserQuestion` with 4 batched questions (each 2-4 options + cost/benefit), bound each answer into worker prompts as `USER DECISION (binding): ...` verbatim. Outcome: 4 lanes dispatched in parallel within 10 minutes of the answer.

## Example 3 — Research-before-dispatch unblocked durable outbox

wf-core#18 acceptance said "durable outbox + restart-persistence test" but named no library/schema. Orchestrator: (1) dispatched `deep-research` with a 6-section brief; (2) researcher persisted a 586-line doc at `ai/curaos/docs/research/outbox-hybrid-design.md` w/ 13 citations + Drizzle schema + LISTEN/NOTIFY pattern + test sketch; (3) worker prompt said "READ this doc first, then implement"; (4) worker delivered on first try.

## Example 4 — Worker-pickup pattern after sandbox closeout block

Codex worker in `--sandbox workspace-write` cannot push or open PR. Worker printed "STATUS: blocked on closeout, implementation complete locally" + file list + local-test evidence. Orchestrator picked up: commit + push + `gh pr create` (body w/ user-decision binding + test plan + `Closes #<n>`), verified typecheck+tests **from inside the parent submodule** (worktree `bun install` fails for private `@curaos/*`), caught one real bug (`workflowInfo` not exported in `@temporalio/activity` v1.16 → `Context.current().info`), fixed inline in 2 edits, did NOT bounce back to the worker.

## Example 5 — Cross-harness grill caught P0/P1 auth findings

wf-core#11 inbox-SSE PR: T2 review missed that `complete`/`signal` endpoints trusted unverified `x-curaos-actor-*` headers. Cross-harness grill (Claude → codex, "try to break auth") surfaced P0 (no AuthGuard wired) + P1 (inbox `role=` query param unverified) + P1 (audit `source` caller-controlled). Outcome: 3 follow-up issues as M5 close blockers + escalate auth posture (D2) + dispatch L10 to fix all three once the user answered.

## Example 6 — Bootstrap-glue lane was necessary before worker dispatch

L12 (builder-core scaffold) needed `backend/services/builder-core-service` registered as a submodule. Worker can't edit parent `.gitmodules`. Orchestrator ran a 3-command glue (`git checkout -b` → `git submodule add` → `git commit`) plus inline pre-push-hook regression fixes (wf-core typecheck + identity-service Valkey types) surfaced during the bootstrap branch's push — each filed + fixed in 2-3 edits before the L12 worker dispatched.

## Example 7 — Tracker-First Triage caught a paper-ready issue before dispatch

`identity-service#19` carried `ready-for-agent` + Story label but §3.4 inspection found: frontmatter missing `requires` (an unmerged auth-sdk PR), no native sub-issue link to parent Epic `curaos-ai-workspace#11`, Project `Status` still `Backlog` + `Effort` empty, and 3 atomic Tasks living only as a markdown bullet list. Orchestrator BEFORE dispatch: patched `requires` + wired native dependency, seeded `#20/#21/#22` via `to-issues` + set frontmatter + added to Project + linked under `#19`, backlinked parent Epic, set Project fields, removed `ready-for-agent` from the Story (dispatch the Tasks instead), refreshed mirrors, posted `TRACKER-TRIAGE:` comment. Outcome: workers dispatched against the 3 atomic Tasks with native blockers correct. Skipping §3.4 would have wasted a worker run on a Story-shaped issue.
