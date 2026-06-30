---
name: curaos-generator-evolution-rule
title: Generator-evolution (every edge case feeds back into the generator)
description: Every uncovered edge case in scaffolded/generated code feeds back into the corresponding generator - backend or frontend - so future scaffolds cover it natively
paths:
  - "curaos/tools/codegen/**"
  - "curaos/backend/services/**"
  - "curaos/backend/packages/**"
  - "curaos/frontend/apps/**"
  - "curaos/frontend/packages/**"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9810975c-2b16-46b3-a252-aa175ac615e1
---

# CuraOS Generator-Evolution Rule

Canonical rule: every edge case surfaced inside a generated service/package MUST be folded back into the generator that produced it. Generators are living tools, not one-shot scaffolders.

**User directive (binding, 2026-06-08; strengthened 2026-06-25): always fix the shared owner first.** When VERIFICATION surfaces a defect in GENERATED output (a render that does not match intent; a generated chart/values/schema/SDK that a consumer profile relies on), root-cause the generator, SDK, or contract owner before touching an individual app or service. The fix lands in the GENERATOR/SDK/CONTRACT (template/emitter/CLI flag/package/contract), then regenerate, rework the consumers, and re-verify ALL downstream profiles. A local hot-fix of the generated artifact is NEVER the fix; it leaves the mold defective and masks the silent failure for the next profile. A per-app or per-service manual patch is last resort only after proving no shared owner can express it, and that proof must be documented in the change.

**User directive (binding, 2026-06-25): demo data is database data.** App-visible demo/sample data for local dev, public demos, live verification, and deployed sites MUST be persisted through service-owned database seeds or fixtures. Frontend/API mocks are allowed only for unit tests and CI e2e harnesses. If a generated app or service relies on a runtime mock plane for demo data, the shared fix belongs in the generator, SDK, contract, or service seed owner: emit CI-only mocks for tests and database-backed seeds for runtime/demo.

## The Rule

When a worker (or reviewer, or orchestrator) hits an edge case inside a generated service/package that the generator did NOT cover, the change set for that issue MUST include BOTH:

1. The local fix inside the service/package (unblocks current work).
2. A corresponding generator update - template, post-scaffold hook, playbook, or codegen-tool flag - that emits the fix as the new default for every future scaffold.

If the generator update is too large for the same PR, file a follow-up issue against the generator under the same milestone with `priority=critical` and `requires=` set to the current Story, and add `ready-for-agent` only after the local fix lands.

**Why:** Generators are the injection-molding presses for CuraOS ([[curaos-architecture-vision]]). A press that produces a defective part once will produce defective parts forever unless the mold is updated. The local hot-fix is necessary; the mold update is non-negotiable. Otherwise every future service repeats the same edge-case fix.

## Applies To

- **Backend codegen** - `curaos/tools/codegen/` (M6 hybrid Nx + @turbo/gen + ts-morph + Bun scripts). Targets all three layers per [[curaos-architecture-vision]]: `<name>-core-service`, `personal-<name>-service`, `business-<name>-service`, and any vertical overlay variant generated alongside.
- **Frontend codegen** - same `curaos/tools/codegen/` harness; templates under `templates/app-*`, `templates/package-*`, `templates/agent-docs/*`. RN/Web/Tauri targets included.
- **Workflow / BPM templates** - M5 workflow definitions emitted via codegen.
- **Contract / SDK packages**: `@curaos/*-contracts`, `@curaos/*-sdk` packages emitted from Drizzle introspection or TypeSpec.
- **Deploy / chart codegen**: umbrella + per-service Helm chart emitters (`umbrella-emit.ts` and siblings). Subchart `condition:` gating + a generated `values.yaml` (default-on) so each consumer profile (demo-slice, full-bundle) renders only its declared slice. A subchart list with no condition gating and no values.yaml renders the full platform for every profile and the per-profile trim is silently non-functional.
- **Any future generator** - once a generator owns a class of output, this rule binds.

## What Counts As An Edge Case

The rule fires when any of these holds inside a generated code/doc tree:

- Missing import / re-export that every consumer must add by hand.
- Missing config block (lefthook hook, `.npmrc` line, `package.json` field, `tsconfig.json` flag, drizzle.config option).
- Missing test scaffold or fixture every service needs.
- Workspace boundary regression (generated code violates [[curaos-repo-boundary-rule]] / [[curaos-modulith-standalone-rule]] / [[curaos-ai-mirror-rule]]).
- Generated file contains a TODO/placeholder that ships in production code paths and is silently ignored.
- Generated frontend/API mock data is used as a runtime/demo data source instead of test-only/CI-only harness data.
- Silently non-functional generated artifact: the file is present and well-formed but does not honor the consumer profile that depends on it (e.g. a profile-scoped trim that still renders the full output, a `condition:`-less subchart, a values default that no profile overrides). The artifact looks done; the behavior is wrong. VERIFICATION (rendering every profile, not just the default) is what catches this class.
- AppModule wire-up gap (ts-morph anchor missing, barrel export missing).
- Frontmatter or AGENTS.md/CONTEXT.md/Requirements.md drift from [[curaos-agents-md-schema-rule]].
- Cross-layer trio asymmetry: a fix lands in `*-core-service` template but never in `personal-*` / `business-*` / `healthstack-*` template.
- Missing CI guard (dep-cruiser rule, syncpack range, knip exclusion, PHI scan).
- Lockfile + `bun install` re-resolution failure caused by template-emitted `package.json` shape.
- Sandbox/lefthook closeout breakage (nested submodule untracked content stash failure, transient `node_modules` typecheck flake).

If a worker handles it locally without folding back to the generator, the generator stays defective. The next service hits the same wall.

Also BINDING below the fold: the in-flight generator/SDK barrier (downstream-milestone dispatch BLOCKED while any codegen/SDK/contracts lane carries `agent-claimed:*` or `agent-PR-open`; summary in AGENTS.md section 8) and the trio + frontend-parity + downstream-profile re-verification steps.

<!-- fold: rationale, non-binding -->

## What Counts As A Generator Update

A generator update can take any of these shapes - pick the smallest that captures the lesson:

| Surface | Action |
|---|---|
| Template file (`.hbs`) | Edit the template under `curaos/tools/codegen/templates/<layer>/...` so the file emits with the fix by default. |
| Post-scaffold hook | Edit the relevant emitter in `curaos/tools/codegen/src/*-emit.ts` (lefthook-emit, npmrc-emit, mirror-emit, doc-graph-append, etc.). |
| Playbook | Edit `curaos/tools/codegen/playbooks/<service|package>.playbook.json` to add a step or change ordering. |
| CLI flag | Add a flag to `curaos/tools/codegen/src/index.ts` for selective emission (e.g. `--layer=core`) when scope demands it. Document in README + tests. |
| Schema rule | Update [[curaos-agents-md-schema-rule]] or the generator's internal schema validator. |
| Trio asymmetry | Apply the fix to all three layer templates (`templates/service-core/`, `templates/service-personal/`, `templates/service-business/`) AND any vertical overlay template; verify via snapshot tests. |
| AST mutation | Extend `app-module-wire.ts` / `barrel-emit.ts` ts-morph passes to cover the new shape. |
| Test fixture | Add a snapshot test under `curaos/tools/codegen/__tests__/` that locks the new emission. |

Always add a regression test under `curaos/tools/codegen/__tests__/`. The new snapshot proves the mold now emits the fix without manual intervention.

## How To Apply

When a worker mid-Story discovers an edge case in generated output:

1. **Stop** before manually patching. Read the generator template/emitter, SDK generator, or contract source that produced or typed the file. Prefer the shared owner fix first; manual instance fixes are last resort and require documented proof that no shared owner can express the behavior.
2. **Decide scope**:
   - Trivial template typo → fix in template + add snapshot test + include both in the current PR.
   - Single emitter logic flaw → fix in emitter + extend playbook test + include both in current PR.
   - Multi-file refactor (new flag, new playbook step, cross-layer trio sync) → file follow-up issue against codegen module with `priority=critical`, `parent=<current-story-epic>`, `requires=<current-story>`, `agent-notes=<edge case description + reproduction steps>`; land local fix in current PR; orchestrator dispatches the generator-evolution lane in the next batch.
3. **Verify trio coverage**: when the fix touches a generated NestJS service, check all three layers (`*-core-service`, `personal-*`, `business-*`) PLUS any vertical overlay template that shares the same surface. Asymmetric template fixes produce defective downstream services on the next regen.
4. **Verify frontend parity**: if the analogous edge case applies to a frontend generator template (RN/Web/Tauri/`@curaos/ui`), apply the same fix to that template OR file a parallel follow-up issue when the surfaces genuinely diverge.
5. **Update tests**: snapshot test under `curaos/tools/codegen/__tests__/` MUST cover the new emission. ≥90% coverage threshold from M6 close-gate remains binding ([[curaos-quality-gates-rule]] tier 2).
5b. **Verify ALL downstream profiles after regen**: regenerate from the fixed generator, rework every consumer config (e.g. `values-demo.yaml`), then render/assert EACH profile, not only the one that surfaced the defect. The demo-slice fix is not done until the full-bundle profile is re-verified to still render its complete output. Per-profile re-verification is the close condition; a green default profile alone does not prove the mold.
5c. **Verify runtime/demo data is database-backed**: local live sweeps and deployed demos must run with frontend/API mocks off and must prove rows come from the backing service/database. Mocks may remain for unit tests and CI e2e only.
6. **Update docs**: `curaos/tools/codegen/README.md` + mirror `ai/curaos/tools/codegen/{AGENTS.md,CONTEXT.md,Requirements.md}` updated when a flag is added, a playbook step changes, or a new edge-case class is covered.
7. **Comment back on the originating issue**: post `GENERATOR-EVOLUTION: fix=<template|emitter|playbook|flag> snapshot=<test path> trio=<core,personal,business,healthstack> followup=<issue-url|none>` so the orchestrator can verify the loop closed.

## What This Means For Orchestration

- Worker prompt `docs/agents/one-task-execution-prompt.md` includes a Generator-Evolution Gate before closeout. A worker cannot mark `STATUS: done` if it patched generated code without either (a) folding the fix back into the generator in the same PR or (b) filing a follow-up issue against the generator.
- Orchestrator prompt `docs/agents/milestone-orchestration-prompt.md` §3.11 surfaces every generator-evolution follow-up issue as a high-priority lane in the next batch; orchestrator MUST NOT close a milestone if generator-evolution follow-ups remain open in that milestone's scope.
- Cross-milestone signal: if M11 (bulk neutral capabilities) starts seeing repeated generator-evolution follow-ups for the same template surface, that surface gets a dedicated hardening lane before bulk-shipping continues.
- Cross-milestone consumer-test risk: a generator change in milestone N can silently break a consumer profile/test authored in milestone M (e.g. a demo-slice values profile that selected a few services). A consumer test that asserts only the values/spec it passes in (parse-only) will keep passing green while the generator now renders the wrong output. WHY: the demo-slice profile asserted its YAML-logic for sessions while a generator change rendered all 87 services; only a real `helm dependency build` + `helm template` against the RENDERED manifest caught it. INSTEAD-OF: trusting parse-only consumer tests across milestones, every generator change MUST re-run every downstream consumer profile/test that EXERCISES the render (renderer run + assert the rendered artifact), and any consumer test that only parses its input values gets upgraded to a render-exercising test in the same change set.

## In-flight generator/SDK barrier (DOWNSTREAM MILESTONE START GATE)

User directive 2026-05-27: when ANY generator or SDK has an in-flight fix/improvement, downstream milestone start is BLOCKED. Starting before the fix lands means every service the new wave produces inherits the same defect - 2x-3x more local hot-fixes than waiting would produce. Wait wins on quality AND cost.

"In-flight" means: an open issue against `module=codegen`, `module=*-sdk`, `module=contracts`, or any other shared-tooling module, carrying label `agent-claimed:*` OR `agent-PR-open`. Includes template patches, CLI flag additions, AST mutations, post-scaffold emitters, SDK contract changes, and snapshot tests.

**Concrete example (this session, M7-S2 → #81 → #92):**
- M7-S2 hit Bun-extends-bug (tsconfig decorator metadata). Hot-fix landed in patient-core-service. Follow-up #81 filed against codegen.
- #81 worker patched all 3 service templates. Fix in flight.
- If M8 had been dispatched while #81 was still in flight, every M8 service emitted by codegen would have shipped with the same broken tsconfig.
- M7-S2.2 (#92) surfaced a SECOND generator drift (plural-barrel) after #81 - same logic. Starting M8 before #92 lands compounds the defect surface.

**Gate (binding for orchestrator):**

1. Before dispatching ANY Story in a new milestone wave, query open in-flight generator/SDK lanes:
   ```bash
   gh search issues --owner your-org --state open \
     --json repository,number,title,labels --jq \
     'map(select(.labels|map(.name)|any(startswith("agent-claimed:") or .=="agent-PR-open"))) |
      map(select(.title|test("codegen|sdk|contracts|@curaos/";"i")))'
   ```
2. If the result is non-empty, the new milestone wave is BLOCKED. Orchestrator may proactively triage (§3.4) Stories under the next-milestone Epic but MUST NOT dispatch workers against them. Per user directive 2026-05-27: "you can always unblock the next milestone proactively, but not start taking their tasks in."
3. Block lifts ONLY when every in-flight generator/SDK lane has merged AND the §3.11 generator-evolution sweep on the most recent wave is clean (no open `priority=critical` generator-evolution follow-ups).
4. Exception: user explicit authorization ("ok to start M8 now even though #92 is still in flight"). Record as `user_override: <issue-url>` in `.scratch/active-agent-lanes.json`. Default is WAIT.

Same gate applies to bulk-shipping milestones (M11/M13). The §3.11 cumulative-pattern detection trigger (≥3 hits on same surface) graduates from "file hardening lane" to "BLOCK the bulk milestone until hardening lane lands."

Same gate applies to SDK changes: in-flight version bumps or contract changes on `@curaos/auth-sdk`, `@curaos/audit-sdk`, `@curaos/tenancy`, `@curaos/event-interceptors`, `@curaos/providers`, `@curaos/contracts`, etc - downstream milestone dispatch WAITS. SDK shape drift mid-wave forces every consumer to re-implement integration.

**Recovery from accidental violation:** If a downstream milestone was started before the generator/SDK fix landed, comment on every worker in that milestone with a heads-up referencing the now-landed fix + audit each merged PR retroactively under §3.11 for the now-known defect class. Workers may be re-opened. Cheaper to wait.

## What Counts As "Cover All Similar Cases In The Future"

The fix must be expressed in the smallest unit of generator surface that future invocations naturally hit. Examples:

- Edge case: every emitted service needs `@types/node` re-resolution after `bun install`. Wrong fix: document the workaround. Right fix: emit a `postinstall` hook in `package.json.hbs` OR update playbook step to run `bun install` from the workspace root before the typecheck verification step.
- Edge case: every emitted service triggers a lefthook stash failure when nested submodules carry untracked `node_modules`. Wrong fix: tell every worker to use `LEFTHOOK=0`. Right fix: extend `lefthook-emit.ts` to add `skip_lfs: true` + `pre-commit.parallel: false` + submodule-aware stash strategy OR update the worker prompt's commit step to use the orchestrator-blessed env-var pattern via a generator-emitted commit wrapper script.
- Edge case: codegen always emits the 3-layer trio but a wave only needs the `*-core-` variant. Wrong fix: register dummy submodules to absorb the unused output. Right fix: add `--layer=<core|personal|business|trio>` flag to `curaos/tools/codegen/src/index.ts` so future waves can scope emission precisely.
- Edge case: AGENTS.md emitted to code dir contains TODO markers that violate [[curaos-repo-boundary-rule]]. Wrong fix: edit each emitted file by hand. Right fix: update the `templates/service-*/AGENTS.md.hbs` partial to emit only the [[curaos-agents-md-schema-rule]]-compliant frontmatter + one-line purpose.
- Edge case (#743/#776): an overlay's trio root differs from the core it extends (shop overlays `personal-shop-service`/`business-shop-service` extend `commerce-core-service`, NOT a non-existent `shop-core-service`). The mold hardcoded `@curaos/{{name}}-core-service` + `{{pluralize (pascalCase name)}}Service`, so `gen:service shop --personal-only` emitted an uninstallable overlay importing `ShopsService` from `@curaos/shop-core-service`. Wrong fix: hand-patch the emitted package.json dep + the `*.service.ts`/`*.module.ts` import in each overlay. Right fix: add the `--core-base=<slug>` flag (`tools/codegen/src/index.ts`) threaded into a `coreBase` + `coreServiceClass` render-context var so the overlay package.json dep, the src import, the Dockerfile sibling COPY, the AGENTS.md doc, the overlay-preflight existence check (`overlay-preflight.ts`), and the pruned `bun.lock` sibling set (`service-lock-emit.ts`) all resolve the REAL core. Default `coreBase = name` keeps same-root trios byte-identical (all snapshots stay green). Landed Dockerfile/migrator/lock regen derive `coreBase` from the overlay's `@curaos/*-core-service` package.json dep so a re-lock of a cross-root overlay stays correct without the flag.

## Removal Trigger

This rule retires when:
- 100% of M6-class edge cases surfaced in M7-M15 land back in the generator on first encounter (zero local-only fixes for ≥3 consecutive milestones), AND
- Generator snapshot tests catch ≥95% of edge cases pre-PR-merge.

## Links

- [[curaos-architecture-vision]] - generators as injection molding
- [[curaos-repo-boundary-rule]] - clean code repo vs workspace mirror split
- [[curaos-modulith-standalone-rule]] - dual-mode boot
- [[curaos-ai-mirror-rule]] - 1:1 mirror invariant
- [[curaos-agents-md-schema-rule]] - per-module AGENTS.md schema
- [[curaos-quality-gates-rule]] - coverage + CI gates
- [[curaos-reuse-dry-rule]] - one canonical owner
- [[curaos-foundation-runtime-directives]] - NestJS codegen cookbook
