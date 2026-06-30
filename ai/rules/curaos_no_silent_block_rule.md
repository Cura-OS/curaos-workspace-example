---
name: curaos-no-silent-block-rule
title: No Silent Block (never park work `blocked` in the background; same-turn escalation to user with exact unblock ask grouped by credential/approval/decision/live-infra + downstream cascade; exhaust build-host agent path first; batch all blockers; §11 not terminal while a clearable blocker is unsurfaced; re-escalate on resume; foresight marker is not an exemption for relevant work)
description: "No Silent Block: BINDING (user directive 2026-06-14). Work is never parked `blocked` in the background without a same-turn escalation to the user stating exactly what is needed (credential/approval/decision/live-infra) plus what it unblocks downstream. Exhaust the agent path first ([[curaos-live-ops-substrate-rule]] build-host); only genuinely out-of-reach work is a real blocker. Batch all blockers into one grouped escalation block; ask precise questions never assign chores; offer the agent-executable path once access is granted. A wave is NOT terminal while a clearable blocker is unsurfaced (adds to milestone-orchestration §11 stop predicate); re-escalate the standing blocker set on resume/compaction. Relevant foresight dependency work is covered by the same blocker surfacing rule; the marker alone is not an exemption."
---

# No Silent Block: escalate every blocker to the user immediately

**BINDING (user directive 2026-06-14).** Work is never parked as `blocked` in the background without an explicit, same-turn escalation to the user that says exactly what is needed to unblock it. The user is the unblocker of last resort; an agent that labels an issue `blocked` and moves on, without surfacing it, has hidden work the user could have cleared in seconds.

## Why

The orchestrator accumulated 12 `blocked` issues (v1 GA live-deploy tail: #29, #322, #407, #536-tail, #541, #543, #547, #689) that sat silent across many sessions. Each was operator-gated (live cluster + deploy approval + GHCR push credential) - things only the user can grant. None were ever surfaced as "here is what I need from you." The user found them by asking, not by being told. That is the failure this rule removes: blocking is not a terminal state an agent gets to choose quietly; it is an escalation event.

## The rule

1. **Blocked is loud, never silent.** The moment any issue, PR, lane, or task cannot proceed for a reason outside the agent's reach (credential, approval, live infra, external service, a user decision), the agent MUST in the SAME turn:
   - Name the blocker in one line (what is missing).
   - State the single concrete action the user can take to clear it (grant scope X, approve deploy Y, run command Z, decide between A/B).
   - State what unblocks downstream once cleared (the cascade).
   Do this BEFORE scheduling any wakeup, ending the turn, or moving to the next lane.

2. **Exhaust the agent path first (composes with [[curaos-live-ops-substrate-rule]]).** Before declaring a blocker, prove it is truly out of reach: deploy/live-ops/image/DNS/signing work runs from build-host (SSH there if not already on it). Only what genuinely needs a credential the agent cannot obtain, an approval only the user can give, or hardware/cluster the agent cannot stand up, is a real blocker. A blocker declared without exhausting the agent path is a defect.

3. **Batch the asks, do not drip them.** When the terminal sweep finds multiple blockers, present ALL of them together as one escalation block (grouped by what they need: credential / approval / decision / live-infra), so the user can clear the whole set in one pass. Do not surface them one at a time across turns.

4. **Ask precise questions, never assign tasks.** Per workspace §11, the agent never says "you should run X" as a chore handoff. It says "I need you to do X because only you can (credential/approval/hardware), and that unblocks Y and Z - want me to walk you through it / can I do it on build-host once you grant the scope?" Offer the agent-executable path wherever one exists after the user grants access.

5. **A wave is not terminal while a clearable blocker is unsurfaced.** The §11 stop predicate is NOT satisfied if any `blocked` item has not been escalated this session with its unblock ask. "Everything else is blocked" is only a valid stop state AFTER the escalation block has been delivered to the user.

6. **Re-escalate on resume.** On a new session / after compaction, the standing blocker set is re-surfaced to the user (not silently re-parked). Stale `blocked` issues get a fresh one-line "still needs X" rather than disappearing into the backlog.

## Escalation block format

When surfacing blockers, group and make each row actionable:

```
BLOCKED - need you to unblock (grouped by what each needs):

CREDENTIAL:
  #NNN <title> - needs <exact scope/secret>. Grant: <command/UI step>. Unblocks: #A, #B.

APPROVAL:
  #NNN <title> - needs your go-ahead to <action>. Risk: <one line>. Unblocks: #C.

DECISION:
  #NNN <title> - choose between <A> / <B>. Recommend <X> because <reason>.

LIVE-INFRA:
  #NNN <title> - needs <cluster/hardware> I cannot stand up. Option A: <agent-run-on-build-host once you provision>. Option B: <you run>.
```

## Composes with

- [[curaos-live-ops-substrate-rule]] - exhaust the build-host agent path before declaring a live-ops blocker.
- [[curaos-foresight-rule]] - foresight is a discovered-dependency marker, not a silent parking state. Relevant foresight work in the active working set or a current dependency chain is subject to the same blocker and escalation rules as other work.
- Workspace §11 (boundaries + approvals) - never assign chores; offer the agent-executable path.
- Milestone-orchestration §11 stop predicates - add "all active-set blockers escalated this session" as a closure gate.
- [[curaos-recommendation-auto-apply-rule]] - the destructive-confirm + unapproved-scope-propose gates still hold; this rule only forbids SILENT blocking, not the existing approval gates.

## Out of scope

This rule does not force the agent to ask permission for routine in-reach work (that violates [[curaos-recommendation-auto-apply-rule]]). It applies only when work is genuinely blocked by something only the user can provide. In-reach work proceeds without asking; out-of-reach work escalates loudly. The two are mutually exclusive.
