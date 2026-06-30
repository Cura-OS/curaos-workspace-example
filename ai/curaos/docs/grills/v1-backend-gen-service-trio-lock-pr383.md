# Grill: gen:service trio per-service lock ordering (#739) - curaos PR #383

Target: curaos PR #383 `fix(codegen): defer trio per-service bun.lock to post-emit pass (#739)`.
Branch: `fix/gen-service-trio-lock-ordering`. High-blast (fleet-wide generator).
Harness: Claude orchestrator -> codex:codex-rescue (opposite-harness, READ-ONLY, high effort).

## Round 1 (commit b260583)

Verdict: CLAIM PARTIALLY HOLDS. No P0/P1. Two P2 + one P3.

- P2a (UNCERTAIN): overlay-only path (`--personal-only`/`--business-only`) could re-trigger "Workspace not found" when the `<name>-core-service` sibling is registered-but-unchecked-out (absent package.json). Deferred-lock fix covers the FULL trio run but not overlay-only-absent-core.
- P2b: idempotency not test-covered.
- P3: deferred pass is non-transactional; a mid-pass throw leaves services 1..N-1 locked. Not a regression vs the old inline behavior.

Attack vectors verified clean: ordering (plain/core-only/core+personal), spec capture (fresh arrays per call), resultIndex<->results alignment (no skip path), skipServiceLock + skipped-no-workspace short-circuit, lock-before-package.json for trio runs.

## Re-grill verification (85676ea)

Delta: `service-lock-emit.ts` `lockGlobs` filter (drop literal globs whose package.json is absent) + idempotency test + overlay-only test.

Test run: sandbox `bun test` blocked at mkdtemp (`PermissionDenied`) - env failure, not a source verdict.

- P2b RESOLVED (yes): idempotency test is non-vacuous by source review (two full `emitServiceLive` passes; second-pass every `serviceLock.action === 'unchanged'`; cannot pass via `skipped-no-workspace` since both passes complete the lock path).
- P2a NOT RESOLVED (no): the filter prevents the Bun "Workspace not found" error by DROPPING the core from the narrowed workspace. But real generated overlay package.json declare `@curaos/{{name}}-core-service` as a workspace dep, and overlay Dockerfiles COPY + build the core. A lock with the core dropped omits the core's transitive deps -> the eventual `--frozen-lockfile` overlay IMAGE build fails on a lockfile mismatch. The fix moves the failure from lock-gen to image-build, does not prevent it. The new test fixture omits the core dep so it only proves a reduced package can lock, not that the overlay image build succeeds.
- NEW P3 (silent self-drop): `emitServiceLock` validates the service DIR exists but not that the service's OWN package.json is present before filtering; a partial/transient checkout can silently drop the service's own workspace and report a misleading `changed`.
- P3 (non-transactional partial-lock): unchanged, doc-note level, not worsened.

Overall merge verdict: **fix-first.** Default trio ordering claim holds, no P0/P1. P2a open: either include the core workspace dep in the test AND have the filter handle it correctly, OR explicitly BLOCK the overlay-only-absent-core path with a clear error rather than silently filtering.

## Resolution (orchestrator, post-85676ea)

Adopting the grill's recommended option: **fail closed, do not silently filter a REQUIRED sibling.** The silent `lockGlobs` filter is replaced by a fail-closed guard: a missing LITERAL sibling/core dir that the spec requires raises a clear "sibling not checked out - init the submodule first" error (an overlay genuinely cannot build without its core); the service's OWN absent package.json likewise fails closed (P3). `*`-globs still self-expand safely. For this wave the case does not arise (overlay services' cores already exist populated on disk), but the guard is now sound. Commit 136ec26.

## Re-grill cycle 2 (commit 136ec26) - CLEAN

Codex opposite-harness re-grill of the fail-closed P2a fix. Sandbox blocked `bun test` (mkdtemp EPERM); verdict from source analysis (the orchestrator ran the 4 tests locally: 4 pass / 20 assertions, + live `gen:service automation --write` exit 0 full-trio).

- P2a RESOLVED (yes): silent filter gone; full `globs` restored; `requiredLiteralDirs` = serviceDirRel + siblingDirsRel + nestedWorkspacePackageDirs is checked for package.json and throws an actionable error before bun can produce a structurally-incomplete lock.
- P3 (own absent package.json) RESOLVED (yes): serviceDirRel is in requiredLiteralDirs.
- Full-trio happy path INTACT: all 3 package.json exist before the deferred guard runs.
- requiredLiteralDirs completeness CLEAN: BASE globs self-expand; service + sibling + nested-package literals all guarded; no literal reaches generatePrunedLock unguarded. One theoretical edge (hand-built spec with a nestedWorkspaceGlobs literal absent from nestedWorkspacePackageDirs) is not reachable from production constructors.
- P3 non-transactional partial-lock: UNCHANGED, pre-existing, out of P2a scope (captured as foresight #805).
- No over-strict false positives (base-workspace absence still returns skipped-no-workspace before the guard).

**MERGE VERDICT: CLEAN.** No P0/P1, P2a + P3 resolved. Merged to curaos main.
