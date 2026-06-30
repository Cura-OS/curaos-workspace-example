---
name: curaos-foresight-rule
title: Foresight + proactive task creation (capture discovered dependency work; triage relevant foresight like normal work)
description: Foresight + proactive task creation: BINDING - capture future work and discovered dependency work (debt/idea/context/risk/prereq) across old/current/future milestones via 3 triggers (inline `FORESIGHT:` closeout line + end-of-wave `foresight-sweep mode=wave` + periodic `mode=cross-milestone`), all routed through `foresight-capture` = focused handoff → fresh focused subagent specs it → seed issue (NOT thin inline stub; user directive 2026-05-29). `foresight` is a marker, not a parking state: active triage must not park work solely because it carries the marker. When relevant to the active working set or a current dependency chain, complete foresight issues promote to `ready-for-agent`; incomplete, future-version-only, user/operator, or real-blocked foresight uses the normal state and blocker. Capture never bypasses a gate; idempotent dedupe. `foresight` label (C5DEF5) seeded across all org repos. Orchestration §3.12 + §11 stop predicate
---

# Foresight + Proactive Task Creation rule

> Behavioral rule - WHEN to capture future work, WHY (so it isn't lost / doesn't pollute the active queue), INSTEAD-OF what. Binding for every CLI agent. Canonical at `ai/rules/`; referenced by slug `[[curaos-foresight-rule]]`.

## Intent

The roadmap must reflect what is actually coming - not only what is queued today. Future work and discovered dependency work (debt, improvements, ideas, missing context/specs, risks, next-milestone prerequisites) gets **captured into the tracker as it surfaces**, across OLD / CURRENT / FUTURE milestones, so it survives `/clear` and is never lost - without producing thin stubs. Once such work is relevant to the active working set or a current dependency chain, the `foresight` marker must not hold it back.

## WHEN to capture (three triggers, one mechanism)

1. **Inline** - any worker/orchestrator that notices future work mid-task emits a `FORESIGHT:` closeout line (one per observation; `none` if nothing). Shape: `FORESIGHT: kind=<debt|idea|context|risk|prereq> milestone=<target M-tag|unknown> scope=<repo/module> what=<one line> why=<consequence>`. The worker does NOT implement it or file it - it emits the observation. See `docs/agents/one-task-execution-prompt.md` §9.
2. **End-of-wave** - `foresight-sweep mode=wave` runs in `milestone-wave`'s Foresight phase after every PR-merge wave (advisory, non-blocking).
3. **Periodic cross-milestone** - `foresight-sweep mode=cross-milestone` deep-scans all milestones on demand / scheduled.

All three route through `foresight-capture`.

## HOW to capture (binding - handoff + focused subagent, NOT inline stubs)

A mid-task observation is a hunch, not a spec. `foresight-capture` (user directive 2026-05-29):
1. compacts each observation into a **focused handoff doc** (handoff-skill discipline: reference ADRs/rules/code by path, never duplicate; suggest skills; redact secrets) in the OS tmp dir;
2. dispatches a **fresh subagent whose entire context is that one item** to research + properly spec it (invoking `to-issues` / `deep-research`, persisting research to `ai/curaos/docs/research/` per [[curaos-knowledge-persistence-rule]]); it does NOT implement;
3. seeds the issue.

INSTEAD-OF: filing a one-line stub inline that derails the capturing wave or fails triage later.

## Staging + promotion (binding)

- Every foresight issue is born `needs-triage` + `foresight`, added to the `CuraOS Roadmap` Project with its target `Target Version` when known, roadmap milestone metadata when derivable, `Status=Backlog`, and parent Epic. Birth state is staging only; it is not a durable hold.
- **DRAIN-ON-STAGE-COMPLETE (binding - closes the inverse strand: staged-but-still-needs-triage permanently jams the barrier).** `needs-triage` is correct only at birth, before research + staging finish. The moment staging is complete (on Project + `Target Version` when known + `Status=Backlog` + parent wired), the item has enough tracker shape for §3.4 to decide its real state. If it is relevant to the active working set or a current dependency chain and otherwise ready, promote it. If it is incomplete, future-version-only, user/operator gated, or real-blocked, record that actual disposition. `foresight` alone is never the reason to park it.
- **STAGING-COMPLETENESS is readiness evidence, NOT a parking disposition (binding).** A `foresight` label counts as a valid marker only when the issue is properly staged: (1) on the `CuraOS Roadmap` Project, (2) `Target Version` set when known, (3) tree-linked (native sub-issue under a parent Epic, or is an Epic root). `CuraOS Milestone` is grouping metadata and should be backfilled when derivable, not a dispatch gate. A foresight issue filed by a raw `gh issue create --label foresight,needs-triage` is a strand the sweep will flag. **Always file foresight via the `foresight-capture` workflow** (it stages atomically).
- Promotes to `ready-for-agent` when it is relevant to the active working set or a current dependency chain, passes §3.4 triage, and has no real blocker. Relevance includes active Target Version, active milestone, a current issue declaring `blocked-by` or `requires`, or a dependency-cleared item surfaced by the scan.
- **PROMOTE-ON-RELEVANCE IS MANDATORY, NOT OPTIONAL (binding - closes the "foresight held forever" drift).** Foresight is work we looked ahead and deemed NECESSARY. The moment a foresight item's relevance gate opens - active working set, dependency chain, user activation decision, or cleared blocker - the §3.4 gate MUST evaluate it like normal work: set `Status=Ready`, add `ready-for-agent` when complete and unblocked, order it by its `requires`/`blocked-by` dependency chain, and dispatch it like any other ready issue. An activated or dependency-relevant story still sitting at `foresight`/Backlog solely because of the marker is a TRIAGE FAILURE, not a valid terminal `wave-done`.
- **`ready-for-human` MEANS "interview the user to unblock," NOT passive wait (binding).** `ready-for-human` is reserved for a genuine **Real-user-decision** gate - something only the user can answer (a trade-off with no clear recommendation, an irreversible/T3-class action, or unapproved scope). When an item carries `ready-for-human`, the orchestrator's obligation is to **ask the user the specific blocking question(s) this wave** (via the interview/`AskUserQuestion` path) and act on the answer to clear it - not to skip it and stop. A purely dependency-blocked or milestone-gated item is NOT `ready-for-human` (it needs a dependency, not the user): it stays staged with `foresight`/Backlog until the target or dependency gate opens, or it carries `blocked` with the dependency named. `ready-for-human` must be removed from it. Mislabeling staged/dependency-blocked foresight as `ready-for-human` (e.g. the `foresight`+`ready-for-human` combination on a STAGED item) is a converger bug: a foresight item at rest carries `foresight` only.
- **`ready-for-human` ALSO covers operator-must-act, NOT only user-decision (binding).** Beyond the Real-user-decision gate above, `ready-for-human` is the correct disposition for a dependency-cleared item that has NO agent-authorable (A) slice and is a pure (B) live-run / operator step: it needs a real cluster, build host, signing keys, SSH, OIDC/webhook registration, or a live-benchmark RUN. Agents MUST NOT SSH, start services, register OIDC/webhooks, or run live-infra load (security constraint): so once such an item's blockers close it does NOT become `ready-for-agent` and must NOT stay `blocked` cycling as a paper-blocked candidate in every scan; reclassify it `blocked` -> `ready-for-human` and surface its specific operator step to the user ONCE (not re-interviewed every wave: once classified `ready-for-human` with the operator step recorded in a comment, it rests there until the operator acts). A part-(A)-part-(B) item is split: the (A) slice goes `ready-for-agent`, the residual (B) slice becomes its own `ready-for-human` operator issue. (Examples: #322 hybrid Diamond live-verify; #489 live OQ-05 50-user benchmark RUN where the k6 script exists but the RUN is operator; #541/#547 operator product-deploy / demo live-run.)
- Capture NEVER bypasses a gate - a promoted foresight issue still passes §3.4/§3.5/§3.7. Capture creates tracked work; triage decides whether it is ready, blocked, future-version-only, or user/operator gated.
- Idempotent: dedupe against open `foresight` issues (semantic, scope+what) before seeding.

## WHY (failure modes this prevents)

- **Lost foresight** - an observation noticed mid-wave dies on `/clear` if not captured. The tracker is the durable home, not chat or a side doc.
- **Marker-as-parking drift** - discovered dependency work stays held back even after it becomes relevant. The `foresight` marker preserves provenance; it does not block dispatch.
- **Thin stubs** - inline-filed hunches fail triage + waste a re-open cycle. Handoff + focused subagent produces a real spec.
- **Reactive-only drift** - without a proactive sweep, debt + deferred decisions + un-seeded future milestones accumulate invisibly until they block.

## Pointers

- Workflows: [`foresight-capture`](../../docs/agents/workflows/foresight-capture.md), [`foresight-sweep`](../../docs/agents/workflows/foresight-sweep.md).
- Orchestration: `docs/agents/milestone-orchestration-prompt.md` §3.12 + §11 stop predicate.
- Label: `foresight` (color `C5DEF5`), seeded across all org repos alongside the triage labels - see `docs/agents/triage-labels.md`.
- Related: [[curaos-roadmap-workflow-rule]], [[curaos-knowledge-persistence-rule]], [[curaos-generator-evolution-rule]] (the reactive follow-up filing this complements).
