# Codex grill — m9-245 dep-cruiser boundary gate enforce, curaos PR#149

> Cross-harness adversarial grill (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]] + orchestration §3.7 — CI-GATE change (the gate that
> enforces AGENTS.md §5 cluster boundaries) + a real import-cycle refactor → grill MANDATORY.
> Issue `your-org/curaos-ai-workspace#245` (parent #106 close-gate; surfaced
> while building #240). The dep-cruiser boundary gate was DEAD — it never actually enforced.

- PR: https://github.com/your-org/curaos/pull/149
- Branch: `agent/m9-245-depcruise-enforce-claude-5670341`
- Commits: `34eb1fd` (enforce + initial triage) → `54f5e7e` (grill-fix: per-app alias + scoped regex) **FINAL**
- Base: `main` @ `5670341`

## Verdict trail: REQUEST-CHANGES (2 gate-correctness defects) → fix `54f5e7e` → APPROVE (converged)

## The dead gate (root cause)
`package.json` `"depcruise": "depcruise --validate backend frontend tools"`. In dependency-cruiser
v16 `--validate` takes an OPTIONAL config-path arg → `backend` was consumed as the rules-file path
→ only `tools/` (~62 modules, 0 backend) was ever cruised. EVERY boundary rule — the #240
cluster-boundary rules (`no-neutral-capability-to-vertical`, `no-cross-service-src-import`, merged
in `1a42d13` / PR #148) PLUS the pre-existing M7 ones — was effectively a no-op. Orchestrator
independently confirmed: corrected invocation took the backend module count **0 → 471** (647 total
backend+frontend+tools). The gate had never enforced anything on backend/frontend.

## Round 1 (`34eb1fd`) — enforce + triage; 2 gate-correctness defects found
The fix corrected the invocation to `depcruise --config .dependency-cruiser.cjs backend frontend
tools` (config auto-discovered; targets are positional) and triaged the findings the now-live cruise
surfaced WITHOUT weakening any rule (rxjs mixed-import → `tsPreCompilationDeps:true`; @turbo/gen →
resolver `conditionNames`/`mainFields`; tenancy cycle → broke inline; identity-service refresh-session
cycle → filed identity-service#59 + narrow scoped pathNot). Enforce-proof passed (deliberate
neutral→vertical reverse import → depcruise exit 4, 4 boundary errors). BUT the grill found 2 ways the
"live" gate still silently MISSED violations:

1. **HIGH — `@/*` cross-app mis-resolution.** Root `tsconfig.json` listed builder-studio's `@/*` paths
   FIRST, then workflow-designer; dep-cruiser takes the first match → workflow-designer's `@/*` imports
   (e.g. `app/page.tsx` → `@/src/auth/session`) RESOLVED INTO builder-studio source → that app's
   cross-boundary violations mismapped (wrong from-module) or missed entirely. The gate was partially
   dead for one whole app. (Confirmed via live cruise of `workflow-designer/app/page.tsx`.)
2. **MODERATE — repo-wide generated-artifact pathNot.** The `no-circular` `from.pathNot` glob
   `(^|/)generated/(client|core)/[^/]+\.gen\.ts$` was repo-wide → ANY service with a `generated/client|core`
   dir would get its circular violations silently suppressed. Too broad — a hole for future services.

## Round 2 fix (`54f5e7e`) — both closed; key discovery
**Both frontend apps are git SUBMODULES** (uneditable from the parent; each maps `@/* → ./*` in its own
tsconfig) — so the alias fix had to be PARENT-REPO-ONLY:
- **Defect 1:** two NEW dep-cruise-only tsconfigs (`tsconfig.depcruise.builder-studio.json`,
  `tsconfig.depcruise.workflow-designer.json`), each mapping `@/*` to exactly ONE app's root
  (non-overlapping). The `depcruise` script became a **3-pass gate**: `depcruise:bulk`
  (`DEPCRUISE_SCOPE=bulk` → `options.exclude` drops the two `@/`-apps) + `depcruise:builder-studio`
  + `depcruise:workflow-designer` (each app cruised with `--ts-config <its own>`), chained with `&&`
  (exit propagates). Before/after proof: workflow-designer `@/src/auth/session` resolved
  builder-studio (wrong) → workflow-designer (correct); 0 `@/` edges resolve to the wrong app.
- **Defect 2:** regex anchored to
  `(^|/)backend/services/builder-core-service/packages/builder-sdk/src/generated/(client|core)/[^/]+\.gen\.ts$`
  — verified against all 14 on-disk `.gen.ts` files: matches EXACTLY the 10 builder-sdk client/core files,
  nothing else (identity-service auth-sdk `types.gen.ts` matched by neither old nor new).
Re-enforce-proof: a `@/`-aliased circular import injected INSIDE workflow-designer → per-app pass FAILED
`no-circular`, correctly attributed to the workflow-designer file (proving defect 1 fixed) → probe removed.

## Round 2 grill — APPROVE (converged)
Codex verified the highest-risk regression of the 3-pass split — the **coverage gap**: the bulk-exclude
pattern `(^|/)frontend/apps/(builder-studio|workflow-designer)/` matches EXACTLY the dirs the per-app
passes target → the union {bulk, builder-studio, workflow-designer} covers the ENTIRE tree, NO file
dropped from boundary checking. Defect 1 CLOSED, defect 2 CLOSED, all 6 rules intact in all passes
(per-app passes do NOT set `DEPCRUISE_SCOPE=bulk` → apps ARE boundary-checked), root `tsconfig.json`
now inert for dep-cruise (authoritative resolution is the per-app `--ts-config`), exit codes propagate
via `&&`. NO new defect.

## Orchestrator independent evidence
- Diff `5670341..54f5e7e`: 8 files, +125/-13. NO submodule pointer changes (parent-repo-only).
- Ran `bun run depcruise` on `54f5e7e`: bulk **571 modules / 0 violations**; builder-studio 59 / 0
  errors / 1 orphan-warn (pre-existing `next.config.mjs`, non-blocking); workflow-designer 24 / 0
  violations. Gate green + ENFORCING.
- `bun run ci` (turbo lint+typecheck+test+build): 85/85 tasks pass, exit 0.
- **Pre-existing baseline (NOT this PR):** `bun install --frozen-lockfile` fails — `party-core-service`
  + `patient-contracts` are absent from `bun.lock` on BASE `5670341` (0 refs; this PR's dep/workspace
  surface is byte-identical to base — `package.json` diff is scripts-only). `scripts/ci-local.sh` halts
  at step-1 frozen-install regardless of this change. Filed as foresight follow-up (lockfile drift).

## Lineage
- Surfaced by: #240 (the cluster-boundary RULE code, merged `1a42d13` / PR #148 — but those rules were
  dead-gated until THIS PR makes them enforce). After #149 merges, #240's tracker issue can close.
- Files: identity-service#59 (refresh-session 2-file cycle, submodule-scoped, narrow pathNot).
- Parent: #106 M9 close-gate.

## Env note
The `semgrep` PostToolUse hook errored "No SEMGREP_APP_TOKEN found" on every edit — an
environment/login gap, NOT a code finding; edits applied normally. The 2 defects were both
gate-blindness defects no test caught (no test asserted the gate actually cruises backend, or that
each app's aliases resolve within that app) — exactly why the grill mattered for a gate whose job is
to catch boundary violations.
