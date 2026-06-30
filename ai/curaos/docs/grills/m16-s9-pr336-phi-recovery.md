# PHI-Critical Recovery Grill: your-org/curaos#336

Harness: Codex (opposite-harness, read-only) per [[curaos-verification-stack-rule]]. Orchestrator-persisted (Codex sandbox blocked the outside-worktree write).
Target: PR #336, recovery of the P0 PHI charter violation merged in PR #334 (6302cc2). Date: 2026-06-13.

## VERDICT: PASS

No P0/P1/P2/P3 findings. The PHI boundary is fully corrected for the 5 canonical clinical services: zero clinical services routed to neutral.

## Per-check results

1. PASS - neutral `Database` CRs for `scheduling-service-db` and `terminology-service-db` are gone; `business-scheduling-service-db` correctly remains neutral on `curaos-citus-coordinator` (cnpg-clusters.yaml:316,322).
2. PASS - `scheduling-service` + `terminology-service` PHI-routed with the existing clinical services to `healthstack-pg` (cnpg-clusters.yaml:53-75,89,95).
3. PASS - both removed from `postgres.neutral.databases`; all 5 clinical services present in `postgres.phi.services` (values.zarf.yaml:137-155).
4. PASS - the new test parses the canonical `CLINICAL_SERVICES` from `backend/packages/healthstack-phi-boundary/src/clinical-services.ts` and asserts every clinical service is absent-from-neutral + present-in-PHI; would fail on the PR #334 bug class. `bun test ops/zarf/cnpg-clusters.test.ts` = 25 pass / 0 fail / 591 expects (RED 3-fail pre-fix).
5. PASS - all 5 CLINICAL_SERVICES correctly PHI-routed; no third misroute. Parser: neutralCr=false, neutralLogical=false, neutralValues=false, phiComment=true, phiServices=true for all 5.
6. PASS - no dangling neutral DB reference; neutral CR count is actually 67 (totalDatabaseCRs=67, neutralDatabaseCRs=67, neutralMapCount=67, phiStaticDatabaseCRs=0); CR<->map lockstep asserted (test:306-325).
7. PASS - zero U+2013/U+2014 dashes, zero AI attribution trailers, no new `@sha256:<digest>` placeholder; `git diff --check` exit 0.

## Findings

None. No fix required.

## Final verdict

PASS. Recovery complete: all 5 canonical clinical services absent from neutral CRs + neutral values map, present in PHI routing, guarded by a canonical-inventory test that fails on the PR #334 bug class. No clinical service remains mis-routed to neutral.
