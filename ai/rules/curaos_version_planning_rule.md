---
name: curaos-version-planning-rule
title: Version-gated planning (Target Version top gate; v1 = M1-M17 working set; v1.1 = GA wave 2; future work filed forward never dropped; version working-set predicate = closure gate; scan/dispatch version-blind for parallelism)
description: Version-gated planning: BINDING (user directive 2026-06-08); Target Version is the top planning gate above Initiative (7-layer hierarchy); we research/plan/gate against the version work ships in. v1 = M1-M17 (the GA working set); v1.1 = GA wave 2 triplet completion; v2+ = EducationStack/ERP deepening + Tier-2 search + net-new. Every Epic/Story + `foresight` issue carries a `Target Version` Project field. Work too big for the active version is filed against a future version (ADR/issue, `Target Version` set), NEVER dropped or crammed. Version working-set predicate (Epic acceptance-complete + no open close-blocker + coherent working whole + GA E2E green + operator (B) executed-or-re-targeted) is the closure gate. Scan + dispatch are version-blind for parallelism (bounded only by working-tree collision + `min(16,cores-2)`). Distinct from rolling-update: this is roadmap release-gating, NOT a `-v2` code path. ADR-0215 is stripped from this public example.
---

# CuraOS Version-Planning Rule

Canonical binding rule. **Target versions are the top planning gate.** We research, plan, and gate every piece of work against the version it ships in. Work too big for the current version is filed against a future version, never dropped and never crammed into the active one. The private rationale and full decision record were stripped from this public example.

Approved 2026-06-08 (user directive: "each target version is how we think and research and gate our planning, and if a bigger set we find a version number that it will fit to as future work").

## Why

Milestones answer "what next," not "what is the smallest coherent shippable product and what is explicitly deferred." Without a version gate above milestones: no closure definition ("done" = no ready issues, not "v1 works"); scope either leaks into the active milestone or vanishes as untargeted `foresight`; and parallelism is throttled by milestone membership instead of real working-tree collisions. The version layer fixes all three.

## Hierarchy (version is layer 0, above Initiative)

```
Target Version     (v1, v1.1, v2, ...; release gate; Project single-select field)
  └── Initiative    (charter pillar)
       └── Cycle    (goal-gated Project field)
            └── Milestone (M1-Mn; native GitHub Milestone)
                 └── Epic -> Story -> Task
```

Every Epic and Story carries a `Target Version` Project field. `foresight` issues carry it too, so future work has a release home.

## The v1 working set (binding)

**v1 = M1 through M17.** Charter (`AGENTS.md` §3 + §5) minimum coherent product = neutral core + HealthStack overlay + builder/BPM + self-hosted deploy + public edge, which maps exactly to M1-M17. M15 ("v1 GA Packaging + Launch Readiness") is the GA gate; M16 (Helm packaging) + M17 (public edge) make the GA deploy + public face real.

Beyond charter-minimum is a future version:
- **v1.1** = GA wave 2 (triplet-split completion: `personal-hr-service`, `personal-crm-service`, remaining `personal-*`/`business-*` variants per #325). "GA wave 2" IS v1.1 (the wave after v1 GA).
- **v2+** = EducationStack/ERP deepening beyond foundation, additional verticals, Tier-2 search (#336), any net-new initiative.

## Version working-set predicate (the closure gate)

A target version is **done** only when ALL hold:
1. Every Epic with that `Target Version` is acceptance-complete (acceptance criteria met, not merely issues closed).
2. No open close-blocker carries that `Target Version` (paper blockers triaged; real blockers resolved or explicitly re-targeted to a later version).
3. Product is a coherent working whole: builds, deploys per its deployment models, GA acceptance E2E green (v1: #517 install-from-scratch cloud/air-gap/hybrid).
4. Operator-gated (B) live-run steps either executed or explicitly re-targeted with a recorded reason.

## Binding behaviors

- **Scan + dispatch are version-blind for parallelism.** Scan EVERY open issue across EVERY milestone AND every target version; dispatch every collision-free lane concurrently. Parallelism is bounded ONLY by git-working-tree collision (same submodule / same parent-repo mutation / shared doc graph) and the runtime `min(16, cores-2)` backstop. A v1.1 task in its own submodule runs alongside a v1 task in a different submodule.
- **File forward, never drop or cram.** When work is found that is real but out of the current version's scope, file it immediately (ADR for a decision, issue for a unit) against the version it fits, with `Target Version` set and `foresight` if not yet active. Reversible in-scope recommendations auto-apply + log to `AUTO-DECISION-LOG.md` per [[curaos-recommendation-auto-apply-rule]]; only genuine (irreversible / unapproved-scope / T3) decisions escalate.
- **Stop only at the version predicate.** The wave is not done while the active version's working set is incomplete with reachable work. The stop predicate gains a version clause (orchestration prompt §11).
- **Version is a PLANNING layer, not a code path.** This is release gating on the roadmap. It is entirely distinct from [[curaos-rolling-update-rule]]'s ban on `-v2`/`-next`/`*-new` parallel CODE paths. Code rolls forward in place (forward migration + feature flag + semver bump); only the ROADMAP is version-gated. Never create a `-v2` directory or service because of this rule.

## Project field

`Target Version` single-select: `v1`, `v1.1`, `v2`, `Unversioned`. Backfill: M1-M17 Epics/Stories -> `v1`; GA-wave-2 (#437/#438/#325 children) -> `v1.1`; #336 Tier-2 search -> `v2`.

## Related

[[curaos-roadmap-workflow-rule]] (hierarchy this extends) · [[curaos-foresight-rule]] (future-version work is the new home for "too big for now") · [[curaos-recommendation-auto-apply-rule]] · [[curaos-generator-evolution-rule]] · [[curaos-rolling-update-rule]] (distinct: code-path ban, not planning).
