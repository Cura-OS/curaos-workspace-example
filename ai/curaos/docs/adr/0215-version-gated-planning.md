# ADR-0215 - Version-gated planning (target versions as the top planning gate)

**Status:** Accepted
**Date:** 2026-06-08
**Amends:** [[curaos-roadmap-workflow-rule]] (adds a Target Version layer above Initiative in the 6-layer hierarchy)
**Rule:** [[curaos-version-planning-rule]] (canonical binding source; this ADR is the rationale)
**Related:** [[curaos-foresight-rule]] (future-version work is the new home for "too big for now"), [[curaos-recommendation-auto-apply-rule]], [[curaos-generator-evolution-rule]]

## Context

CuraOS planning has been milestone-driven (M1-M17). Milestones answer "what do we build next," but nothing above them answers "what is the smallest coherent SHIPPABLE product, and what is explicitly deferred to a later release." Three concrete failure modes followed:

1. **No closure definition.** "Done" meant "no ready-for-agent issues left," not "v1 is a working set." A milestone could be agent-terminal while the product was not actually a shippable whole.
2. **Scope leak vs scope loss.** Work too big for the current push had only two destinations: jammed into the active milestone (scope leak, dilutes the active priority) or filed as `foresight` with no release target (scope loss, silently vanishes between milestones - the exact #325/#407 class).
3. **Parallelization throttled by milestone.** The orchestrator scanned the active milestone first and treated other milestones' work as out of scope, even when that work lived in a different git working tree and was perfectly parallel-safe. Throughput was bounded by milestone membership instead of by real working-tree collisions.

User directive (2026-06-08): "each target version is how we think and research and gate our planning, and if a bigger set we find a version number that it will fit to as future work" + "do a full parallelisation for all non conflicting tasks from any milestone or any state" + "feel free on every step to file in new adr/issues ... so you plan the next work if opportunity shows."

## Decision

### D1 - Target Version is the top planning layer

Add **Target Version** above Initiative in the hierarchy:

```
Target Version     (v1, v1.1, v2, ...; the release gate; a Project single-select field)
  └── Initiative    (charter pillar)
       └── Cycle    (goal-gated)
            └── Milestone (M1-Mn)
                 └── Epic -> Story -> Task
```

A Target Version is the unit we **research, plan, and gate** against. Every Epic/Story carries a `Target Version` Project field. A version is "done" when its working-set predicate (D3) holds, not when its issues happen to be closed.

### D2 - v1 = M1 through M17 (the GA working set)

The charter (`AGENTS.md` §3 + §5) defines the minimum coherent product: neutral core + HealthStack overlay + builder/BPM + self-hosted deploy + public edge. That maps exactly to:

- **v1 working set = M1-M17.** M15 ("v1 GA Packaging + Launch Readiness") is the GA gate; M16 (Helm packaging) + M17 (public edge) make the GA deploy + public face real.
- Anything beyond charter-minimum is a **future version**, not v1:
  - **v1.1** = GA wave 2 (the triplet-split completion: `personal-hr-service`, `personal-crm-service`, and the remaining `personal-*`/`business-*` variants per #325). "GA wave 2" in existing docs IS v1.1 by definition - it is the wave AFTER v1 GA.
  - **v2+** = EducationStack/ERP deepening beyond foundation, additional verticals, Tier-2 search (#336), any net-new initiative.

When work is found that does not fit v1, it is filed against the version it DOES fit (v1.1, v2, ...) as `foresight` + `Target Version` field set, never dropped and never jammed into v1.

### D3 - Version working-set predicate (the closure gate)

A target version is **done** when ALL hold:

1. Every Epic with that `Target Version` is acceptance-complete (its acceptance criteria met, not merely its issues closed).
2. No open close-blocker carries that `Target Version` (paper blockers triaged per the orchestration prompt §3; real blockers are either resolved or explicitly re-targeted to a later version).
3. The product is a coherent working whole: it builds, deploys (per its deployment models), and the GA acceptance E2E for that version is green (for v1: #517 install-from-scratch across cloud/air-gap/hybrid).
4. Operator-gated (B) live-run steps for that version are either executed (operator-run) or explicitly re-targeted with a recorded reason.

### D4 - Full cross-version parallelization by working tree

The orchestrator scans EVERY open issue across EVERY milestone AND every target version, then dispatches every collision-free lane concurrently. Parallelism is bounded ONLY by git-working-tree collision (same submodule / same parent-repo mutation / shared doc graph) and the runtime `min(16, cores-2)` backstop - never by milestone or version membership. A v1.1 task in its own submodule runs alongside a v1 task in a different submodule.

### D5 - Proactive planning: file the next version's work as opportunity shows

When the orchestrator or a worker discovers work that is real but out of the current version's scope, it MUST file it immediately (ADR for a decision, issue for a unit) against the version it fits, with `Target Version` set and `foresight` if not yet active. This is the inverse of scope leak: instead of dropping or cramming, we PLAN forward. Reversible in-scope recommendations auto-apply and log to `AUTO-DECISION-LOG.md`; only genuine (irreversible / unapproved-scope / T3) decisions escalate.

## Consequences

- The `/goal` line and `milestone-orchestration-prompt.md` gain a version frame: "drive the active version's working set to its D3 predicate," not "drive the active milestone to no-ready-issues."
- A new `Target Version` Project single-select field is added (values: `v1`, `v1.1`, `v2`, `Unversioned`). Backfill: all M1-M17 Epics/Stories -> `v1`; GA-wave-2 (#437/#438/#325 children) -> `v1.1`; #336 Tier-2 search -> `v2`.
- `foresight` issues now ALSO carry a `Target Version` so future work has a release home, not just a milestone tag.
- The stop predicate gains a version clause: a version is not closeable until its D3 predicate holds; the orchestrator never declares the wave done while the active version's working set is incomplete with reachable work.
- No `-v2` code paths: this is a PLANNING version layer (release gating), entirely distinct from the [[curaos-rolling-update-rule]] ban on `-v2`/`-next` parallel CODE paths. Code still rolls forward in place; only the ROADMAP is version-gated.

## Backfill + rollout

1. Author [[curaos-version-planning-rule]] as the canonical binding rule (this ADR is rationale only).
2. Add the `Target Version` Project field + backfill existing Epics/Stories.
3. Patch `milestone-orchestration-prompt.md` (the `/goal` Goal-Setter block + §1 + §2 scan + §11 stop predicate), `one-task-execution-prompt.md`, `milestone-wave.md` + `.workflow.js`, and the roadmap rule hierarchy.
4. Update `AGENTS.md` §15 rules index + `HANDOVER.md` to record v1 = M1-M17 and the active version frame.
