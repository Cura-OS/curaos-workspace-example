---
name: curaos-recommendation-auto-apply-rule
title: Recommendation auto-apply (clear recommendation → take it, don't escalate; destructive-confirm + unapproved-scope-propose gates survive)
description: Recommendation auto-apply: BINDING - when a decision has a clear recommended option (research/analysis-preferred path), take it and proceed; do NOT escalate via `AskUserQuestion`. Record auto-applied choice on tracker/lane-registry with `(auto-applied per recommendation, 2026-05-29 directive)` marker; bind downstream as if user-answered. Escalate ONLY when no recommendation exists (true trade-off), or action is irreversible/destructive/T3-class (confirm gate survives), or scope is unapproved (propose-first survives). Narrows orchestration §3.6 funnel; user directive 2026-05-29
---

# Recommendation Auto-Apply Rule

> Binding cross-CLI agent-behavior rule. WHEN a decision has a clear recommended option, take it - do NOT escalate to the user. WHY: user explicitly does not want to be interrupted for decisions where the agent already knows the right answer. INSTEAD-OF: filing an `AskUserQuestion` / option-A funnel for every Real-user-decision blocker.

**Source:** user directive 2026-05-29 - *"If you ever have a recommended action never escalate the question to me and go with the recommendation, you can even add this as a workspace rule."*

## The rule

When the agent (orchestrator, worker, or any lane) reaches a decision point and **a clear recommended option exists** - research points one way, analysis prefers one path, or one option is the obvious low-blast-radius default - the agent MUST:

1. **Take the recommendation and proceed.** Do not stop to ask.
2. **Log the auto-applied choice** as one row in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` (the canonical scannable ledger of every silent decision) - `Date | Context | Options | Chosen | Why | Reversible-how | Ref` - in the SAME unit of work that applies the decision, BEFORE it binds downstream. Also stamp the marker `(auto-applied per recommendation, 2026-05-29 directive)` wherever the decision is tracked locally (issue comment, lane registry `user_decision:` field, commit body). The AUTO-DECISION-LOG row is mandatory - a silent decision with no log row is invisible to the user and defeats the rule. Promote a row to a numbered ADR when the decision becomes binding/cross-cutting.
3. **Bind it downstream exactly as if the user had answered** - quote it verbatim in dependent worker prompts; do not re-ask, do not reinterpret later.
4. **Surface the log at closeout.** The wave/task report states how many decisions were auto-applied this session and points at the AUTO-DECISION-LOG so the user can review + revise any silent choice. The user changing a logged answer is a normal decision: reverse via that row's Reversible-how path and append a follow-up row noting the override.

## When escalation is STILL required (narrow exceptions)

Escalate via `AskUserQuestion` ONLY when:

- **No recommendation exists** - a genuine trade-off where analysis does not prefer any path (list options in trade-off order, no "Recommended" marker).
- **Irreversible / destructive / T3-class action** - `rm -rf`, force push, schema/table drop, `terraform destroy`, submodule deinit, data deletion, production cutover, or any [[curaos-verification-stack-rule]] T3 trigger. A recommendation does NOT bypass the destructive-op confirmation gate (workspace `AGENTS.md` §11, global `# Ask before destructive ops`). Confirm first even if you'd recommend proceeding.
- **Scope expansion** - work not in project docs or approved this session (global `# never add unapproved work`): propose first, regardless of recommendation strength.

## Interaction with the escalation funnel

This rule narrows `docs/agents/milestone-orchestration-prompt.md` §3.6. The §3.6 funnel still defines HOW to escalate when escalation is warranted; this rule defines that a clear recommendation means escalation is NOT warranted. The two compose: recommendation present + reversible + in-scope → auto-apply; otherwise → §3.6 funnel.

## Precedence

Priority #1 workspace rule per `AGENTS.md` §13b. Overrides the default "always escalate Real-user-decision blockers" posture in prompts and skills. Does NOT override the destructive-op confirmation gate or the unapproved-scope gate - those are safety floors that survive any recommendation.

Related: [[curaos-decision-methodology]] · [[curaos-verification-stack-rule]] · [[curaos-roadmap-workflow-rule]]
