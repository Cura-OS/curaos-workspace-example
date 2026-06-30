---
name: curaos-rolling-update-rule
title: Rolling update (no -v2 / -next / -new parallel paths - forward migration + feature flag + semver bump only)
description: BINDING - every schema/API/runtime change lands in the existing module via forward migration + feature flag + semver bump; parallel paths like `-v2` / `-next` / `*-new` FORBIDDEN
paths:
  - "curaos/**/migrations/**"
  - "curaos/backend/**/package.json"
  - "curaos/frontend/**/package.json"
  - "curaos/.gitmodules"
metadata:
  node_type: rule
  type: feedback
  originSessionId: 9810975c-2b16-46b3-a252-aa175ac615e1
---

User correction (2026-05-28). Replaces Strangler Fig + parallel-path rollouts with rolling in-place updates. Captured after Strangler Fig pattern landed `identity-service-v2/` + `auth-sdk-v2/` parallel paths in PR-1 / PR-2 / PR-3 - user shut it down.

## The rule

**No `-v2` / `-v3` / `*-next` / `*-new` / `*-replacement` parallel paths.** Every change lands in the existing module via:

1. Forward-only migration that adds new columns/tables/indexes (never drops live tables).
2. Feature flag (env var or settings row) gating the new code path.
3. Semantic version bump on any published artifact (npm package, contract, event schema).
4. Backfill jobs that fill the new shape from the existing shape (idempotent + restartable).
5. Consumer migration through the published package's range bump (`^1 || ^2` → `^2` per consumer over time).
6. Drop old columns/code/feature flag in a later forward migration once consumer telemetry confirms zero traffic on the old path.

## What never goes in the codebase

- New submodule with `-v2` / `-v3` / `-next` suffix.
- New package directory with `-v2` / `-v3` / `-replacement` suffix (e.g. `backend/packages/auth-sdk-v2/`).
- New service directory with `-v2` / `-v3` / `-new` suffix (e.g. `backend/services/identity-service-v2/`).
- "Strangler Fig with separate paths" rollout plans in ADRs / RFCs / Issues.
- Publish-rename mechanisms that translate workspace `name` to a different published `name` at `npm publish` time. The workspace name and the published name MUST match.
- "Cutover archive" subtasks that schedule deletion of an entire submodule (e.g. `_archive/identity-service-v1/`). Drop the deprecated path with a normal forward migration commit, not a path-move + archive.

## Exceptions

None at workspace level. If a real exception arises (e.g. binary protocol incompatibility that genuinely cannot run in one process), file an ADR + escalate to the user for explicit per-case approval. The exception lands in the ADR, not in this rule.

Signal gates (below) are equally BINDING: every drop/promote step is gated on a measurable signal, never on a clock.

<!-- fold: rationale, non-binding -->

## What rolling-update looks like in practice

For schema changes:

- Add new tables alongside existing ones (forward migration).
- Backfill data from old → new shape (idempotent job).
- Switch reads to new shape behind a feature flag.
- Switch writes to dual-write (old + new) behind a feature flag.
- Once telemetry confirms new path stable, drop dual-write; reads serve from new only.
- Drop old tables in a final forward migration with a clear deprecation comment.

For published package API breaks:

- Bump package semver MAJOR (`@curaos/auth-sdk@1.x` → `@curaos/auth-sdk@2.0.0`) - same workspace path, same published name.
- Consumers pin range `^1 || ^2` while migrating; narrow to `^2` once cut over.
- Old surface stays exported with `@deprecated` JSDoc for 1 minor version.
- Final minor removes the deprecated surface; downstream consumer pin must already be `^2`.

For service deployment rollouts:

- Single service binary. Feature flag toggles new code path.
- Canary deployment ramps traffic gradually via Argo Rollouts or k8s percentage routing - NOT via parallel service binaries.

## Signal gates only - NO time or date gates (BINDING)

Every "drop the old path / promote the new path" step above is gated on **a signal that proves the new path is safe** - never on a clock. No calendar date, no "wait N days", no "soak for N hours", no minimum bake window. Time is not evidence. A gate clears the instant its signal is green and not one second later; it stays shut while the signal is red no matter how much time has passed.

**Forbidden, all of these:**
- `external:<thing>-until-<DATE>` - a bare calendar date.
- `soak-floor:... >= <N>h` / `burn-in >= <N>d` / "wait at least N days/hours before promoting" - a wall-clock minimum is still a time gate.
- "earliest handoff date" / "promote after <date>" framing in ADRs / Issues / runbooks.

A date or duration is a proxy for a state nobody measured. The clock elapses while the real condition is still false (false-go), or blocks work that was already safe (false-stop). Either way the clock is lying about safety.

**Required shape for any rollout/cutover gate** - name the measurable condition, nothing else:

```
blocked-by:
  - 'signal:<gauge> <comparator> <threshold>'
# e.g. signal:auth-diamond-divergence == 0   (over the gauge's own sampling window)
#      signal:m3-path-traffic == 0           (no requests hit the old path)
```

- **Name the gauge + pass condition.** If "sustained over a window" genuinely matters for stability, that window belongs INSIDE the gauge's own definition (e.g. the divergence metric is computed over a rolling sample and reports `stable` only when the sample is consistently zero) - it is a property of the signal, not a separate wall-clock floor bolted onto the gate. The gate reads one boolean: is the signal green.
- If the gauge does not exist yet, the gate's real blocker is **"build/deploy the instrumentation"** - file that as a dependency Story. Do NOT substitute a date or a soak window for the missing gauge.
- `external:*` blockers are reserved for genuinely external events that are themselves state, not time: a vendor release *existing*, a contract being *signed*, an embargo being *lifted* - gate on the event having happened, not on the date it's scheduled for.

Failure mode this prevents (2026-05-29): M9-S2 #99 Phase D carried `external:phase-c-burn-in-until-2026-05-31` - a date standing in for an unbuilt audit-divergence checker. The date read as a hard external dependency, so unblock passes treated it as immovable when the real blocker was "the gauge isn't deployed." Gate on the signal; build the gauge if it's missing; never gate on the clock.

## Why

Parallel `-v2` paths permanently fragment the codebase:

- ai-mirror per [[curaos-ai-mirror-rule]] doubles for every duplicated module.
- Doc-graph gets 100+ extra edges to the v2 ai-docs subtree.
- Every reader asks "which path is canonical?" - and the answer changes mid-cutover.
- The cutover step that promises to delete the old path becomes indefinite. The 2026-05-28 case had identity-service-v2 created with a Strangler Fig plan whose cutover (#147) was deferred to "M9-S10" - an unscheduled milestone.
- Publish-rename mechanisms (workspace `name` = `@curaos/auth-sdk-v2`, published `name` = `@curaos/auth-sdk`) require custom CI logic that bit-rots silently. The 2026-05-28 case had the publish-rename mechanism documented in prose only, with no working script.
- Every dual-run window adds operational complexity (config-toggle traffic routing, audit-stream divergence checking, runbook ramp procedures) that disappears once cutover lands - but lives forever if cutover slips.

Rolling updates inside one module are mechanically simpler, observably progressing, and don't pollute the ai-mirror or doc-graph.

## Cross-references

- [[curaos-ai-mirror-rule]] - duplicated modules force duplicated ai-mirror; one path = one mirror.
- [[curaos-modulith-standalone-rule]] - modulith mode means everything in one container; parallel services break that posture.
- [[curaos-version-pinning-rule]] - semver bumps managed by Renovate, not by parallel paths.
- [[curaos-doc-graph-rule]] - every doc node lives once; parallel paths fragment the graph.
- [[curaos-roadmap-workflow-rule]] - Strangler Fig sub-issues (e.g. cutover archive tasks) are not roadmap-valid milestone work.

## Recovery procedure if a `-v2` path lands by mistake

1. Close any open PR introducing the `-v2` artifact (`"Superseded by rolling-update per [[curaos-rolling-update-rule]]"`).
2. Delete the `-v2` repo / submodule / package directory.
3. Port any genuinely new logic INTO the existing module behind a feature flag.
4. Bump the existing module's semver if the API surface changes.
5. File this rule's slug in the closing comment so future agents see the precedent.

Recorded 2026-05-28 after the M9-S2 Strangler Fig miss; binding from that date forward.
