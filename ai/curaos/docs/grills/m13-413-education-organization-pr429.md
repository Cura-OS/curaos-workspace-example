# Codex grill — m13-413-education-organization PR curaos-ai-workspace#429

Date: 2026-06-04
Agent: codex-f0e0d19b
Harness: Claude CLI, opposite-harness read-only planning review
Issue: https://github.com/your-org/curaos-ai-workspace/issues/413
PR: https://github.com/your-org/curaos-ai-workspace/pull/429

## Verdict: APPROVE-WITH-CONDITIONS

## P0 findings (block merge)

None for PR #429 after the service/docs implementation persisted research, reference-only boundaries, and the documented graph-writer blocker.

## P1 findings (must address before merge)

None for PR #429. The planning BLOCK below was resolved by the worker reconciliation and implementation scope.

## P2 findings (followups acceptable)

None remaining for PR #429 after regenerating `DOC-GRAPH.md` from a complete submodule tree.

## What Claude got right (counter-balance — minimum 3 items)

1. Flagged that the service had to use reference ports rather than duplicate people/org models.
2. Required persisted research before implementation.
3. Caught stale/aspirational upstream contract claims before the worker froze implementation assumptions.

---

## Planning Review Evidence

BLOCK

## Reviewer Output

Semgrep hook noise (no token) — non-blocking for a markdown review file. Review complete.

Why BLOCK (3 hard facts, verified by filesystem):

1. Research artifact MISSING — named `m13-413-education-organization-foundation.md` not in research dir (full 62-file listing checked). Runbook §3 Research Gate unmet.
2. `education-core-service` code = EMPTY — recursive find = zero files. Acceptance #6 "build on education-core contracts" → building on nothing.
3. `education-organization-service` code = README + `.git` only — never scaffolded. Every "must not break" file in `CONTEXT.md:71-76` is aspirational; the unblock research's §87 claim that they exist is factually wrong.

Plus:

- org-core/party-core/hr-service contract existence NOT VERIFIED (git gated) → acceptance #1/#5 "by reference only" may have nothing to reference → silent duplication risk.
- M13 on activation hold (`#27 OPEN`, #413 absent from roadmap); in-flight codegen lanes (#401/#404/#410) → generator-evolution barrier likely blocks dispatch.
- Doc contradiction: event topic `education.roster.synced` (`Requirements.md:89`) vs `education.enrollment.synced` (`ADR-0207:268`) — must resolve before freezing outbox contract.
- Missing frontmatter `data: drizzle` + `validation: zod` per ORM/validation rules.

Net: scope correct on paper, but not executable as-is — worker would be forced to stub upstream contracts + invent local Org/people model, violating acceptance #5/#6. Block until upstream contracts land (or split with `requires=`), foundation research persists, M13 activates, generator barrier confirmed clear.

Note: Bash/git/gh were sandbox-gated this session, so submodule-init state of org-core/party-core/hr-service and the live in-flight-lane label query are marked NOT VERIFIED in the report — those are the pre-flight commands the implementer must run first.

## Worker Reconciliation

1. Research artifact: valid process finding. The first artifact was accidentally written in the original workspace, not the dispatched worktree. Corrected by copying it to `ai/curaos/docs/research/m13-413-education-organization-foundation.md` in this worktree and removing the accidental original-workspace copy.
2. `education-core-service` contract availability: valid risk. Before implementation, initialize/read only the upstream dependency submodules needed to prove reference boundaries.
3. Clean-slate service: expected issue scope. Implementation must scaffold on the service branch and must not write agent docs into the code repo.
4. Org/Party/HR contract availability: valid risk. Implementation must use ports and reference IDs only; no embedded org/person/staff profile fields.
5. M13 activation: reviewer claim rejected by current tracker evidence. Issue #413 is open, claimed by `agent-claimed:codex-f0e0d19b`, and Project status is `In Progress`.
6. Generator barrier: reviewer claim rejected by current GitHub evidence. Live search for open `agent-claimed:*` / `agent-PR-open` codegen, sdk, contracts, and `@curaos/` issues returned `[]`.
7. Event contradiction: reviewer claim rejected by current docs search. Both `ai/curaos/backend/services/education-organization-service/Requirements.md` and `ai/curaos/docs/adr/0207-cluster-educationstack.md` use `education.roster.synced`.
8. Frontmatter fields: valid docs gap if required by per-module schema. Check and patch service docs only if current frontmatter misses locked ORM/validation metadata.

## Required Plan Changes

1. Verify/read upstream education-core, org-core, party-core, and HR references before finalizing domain ports.
2. Treat all upstream data as references: `orgId`, `learnerId`/`partyId`, and `staffId` only.
3. Keep accreditation advancement as workflow assertion plus Cerbos authorization before state/event append.
4. Preserve `education.roster.synced` as the roster event topic unless a higher-precedence rule or ADR update says otherwise.
5. Do not include the unsafe generated `ISSUE-ROADMAP.md` prune in the workspace PR.
