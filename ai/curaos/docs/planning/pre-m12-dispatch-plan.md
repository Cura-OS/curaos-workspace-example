# Pre-M12 Dispatch Plan (session-24) - blocked on GraphQL reset 1780515825

User directive: triage + do ALL pre-M12 tasks, then start M12. "Everything dispatchable now" + all buckets. Unblock-all for the 3 blocked items.

## DONE (pre-reset, REST/local)
- #374 esign license residual - FIXED (commit d68d13a), close+status=Done DEFERRED to reset batch.
- #322 (IDENTITY_DIAMOND_MODE) - re-parented M9#23→M14#28, CuraOS Milestone=M14, runbook §2 written, operator comment posted. Quarantined, does NOT block M12.
- #330 (air-gap zero-egress) - re-parented M8#22→M15#29, CuraOS Milestone=M15, runbook §1 written, operator comment posted. Quarantined, does NOT block M12.
- Runbook: ai/curaos/docs/runbooks/live-verification-gaps.md (committed d68d13a).

## BLOCKED-EXTERNAL (operator-only, NOT M12 gating) - escalated + runbooked
- #322, #330 - T3 HITL, deliverable IS a live operator verification record; agent forbidden to fabricate. Await operator infra. Re-homed to M14/M15 where they activate naturally.

## REAL vs PAPER blocker triage results
- #208 dep-graph calibration - REAL blocker (needs ≥3 waves recorded dispatch data; dataset absent). In-session slice = data-collection hook (scripts/workflows/wave-prioritize.workflow.js append wave-record) + calibration-script skeleton (no recommendations until N≥3). Dispatch SLICE only. Tree: curaos-workspace scripts/ (parent repo - collides with orchestrator; worktree-isolate worker).
- #317 audit-chain hash v1-drop - conditional on "no live v1 emitter remains"; needs v1-emitter grep across services BEFORE dispatch. Tree: tools/codegen + audit-core-service. Codegen serial chain.
- #356 identity current-roles view - "when a current-roles view IS built" → view is docs-only/not built; not actionable until built. Keep quarantined (re-confirm: it's a future-prereq, not current work). RE-EVALUATE: may stay Backlog.

## WAVE 1 - codegen `tools/codegen` SERIAL chain (consolidated lanes; all same working tree)
Order A→B→C→D, then money/regen. Each lane = one worker on docs/agents/one-task-execution-prompt.md, own paths under curaos/tools/codegen + named service submodules. SERIALIZE (same checkout).
- **Lane A - audit-outbox mold hardening** (#333 + #334 + #335): replayer page-cap streaming (#333 G1), persisted-checkpoint boot-assertion in prod (#334 G2), test delimiter guards (#335). Paths: curaos/tools/codegen/templates/service-{core,personal,business}/src/db/audit-outbox-replayer.ts.hbs + src/db/audit-outbox.module.ts.hbs + __tests__/.../audit-outbox-mold-hardening-320.test.ts (NOTE: replayer+module under src/db/, NOT src/audit/). Trio byte-identical + snapshot. Parent #320.
- **Lane B - audit-chain-hash v2 encoding** (#318 ONLY): length-prefixed self-delimiting v2 material (#318), additive + safe. Paths: tools/codegen/templates/service-{core,personal,business}/src/audit/audit-chain-hash.ts.hbs + audit-core-service validator. CAUTION: v1 immutable, only touch v2 path. Trio byte-identical + snapshot.
  - **#317 STAYS QUARANTINED** (real telemetry blocker, NOT paper): v1-emitter scan (session-24) confirmed ALL current producers stamp hashVersion:2 (schema z.literal(1).or(z.literal(2)).optional; recompute defaults v1 only when ABSENT). v1 read-path is a legacy-acceptance fallback for pre-#300 persisted envelopes. Dropping it needs telemetry proving no live v1 envelope is still validated (same guard-class as 369-1 consumer-backstop). Keep Backlog; do NOT dispatch. Note telemetry gate on issue.
- **Lane C - codegen test/ci hardening** (#358 + #359 + #362): mikro pre-#354 tree snapshot fixture + tsc/bootstrap smoke (#358); self-contained tsconfig/@types/node fallback OR documented workspace-root gate (#359); live-PG domain_outbox ::uuid enqueue test gated on DATABASE_URL (#362). Paths: tools/codegen/__tests__ + templates tsconfig/package.json.hbs.
- **Lane D - scopedRead mold fold-back** (#367): drop stub scopedRead/XRead OR make it overridable so domain impls stop hot-fixing auth-matrix.test.ts + .tsp. Paths: tools/codegen/templates/service-core/src controller + specs/*.tsp + test/integration/auth-matrix.test.ts.hbs.

## WAVE 1b - depends on mold (after A-D land)
- **#371 money wire** (high, M): producer event payloads amount_minor JSON number→string at wire boundary, dual-emit-then-drop (decision 369-1). Codegen mold + sales/procurement/inventory/commerce/crm-core. requires #369 (CLOSED ✓). Touches codegen + 5 submodules → after codegen lanes; serialize per submodule.
- **#363 regen** (normal): regenerate commerce-core + crm-core domain-outbox FROM mold; add commerce 0002_snapshot.json. 2 submodule trees (commerce-core, crm-core). After #371 (overlaps money paths).

## WAVE 2 - independent trees (parallel vs codegen chain)
- **#73** identity-service Diamond forward-guard CI contract test. Tree: identity-service submodule. DISPATCH NOW (parallel). Origin M9, parent #23.
- **#194** org-wide agent-overclaimed label seed. No tree (API). Low prio (auto-creates on-demand). I do directly post-reset OR tiny worker. Tree: none.
- **#208** SLICE (hook+skeleton). Tree: curaos-workspace scripts/. Worktree-isolate.

## WAVE 3 - M12 prerequisites (after generator barrier clears = all codegen lanes merged)
- **#329** clinical-overlay research (FHIR boundary, terminology licensing, encounter lifecycle, consent/PHI, regulatory). Persist to disk ai/curaos/research/. Gates M12.
- **#372** seed atomic M12 clinical Stories under Epic #26.

## THEN - activate M12
- Remove #26 blocked label, Project status In Progress, promote M12 Stories ready-for-agent, dispatch. VERIFY in-flight generator barrier CLEAR first (all codegen/SDK lanes merged).

## RESET BATCH (run all on GraphQL recovery)
1. Close #374 + Project status=Done.
2. Re-confirm #322/#330 re-parent + field landed (returned OK pre-limit).
3. Dispatch #73 worker (independent tree) FIRST (parallel-safe).
4. Start codegen Lane A worker (serial chain head).
5. Promote each dispatched issue: §3.4 - label ready-for-agent, Project status, sub-issue/dep wire.
