# Grill: PR #342 - RAM-aware job cap + migrator workspace-lock detection

- Repo: `your-org/curaos`
- PR: #342 `fix(build): RAM-aware job cap + migrator workspace-lock detection`
- Branch: `fix/build-ram-aware-jobs`
- PR head graded: `93eb863` (NOT the locally-checked-out `0312f7a`; see Scope note)
- Base: `origin/main` (`7acbfea` merge-base)
- Reviewer: adversarial (chaos engineering / break-it-by-construction)
- Date: 2026-06-14

## Scope correction (read first)

The local checkout was STALE. The local branch tip was `0312f7a` (commit 1 only,
build-all-services.sh), and `git diff origin/main...HEAD` locally showed a 1-file
diff. The real PR head on GitHub is `93eb863` and carries a SECOND commit
(`fix(codegen): detect migrator workspace deps from the bun.lock shape`) that adds
live-emit.ts + the 618 test. I fetched and graded the real PR head:

```
tools/build/build-all-services.sh                                   71 +-
tools/codegen/__tests__/templates/migrator-workspace-detection-618.test.ts  133 ++
tools/codegen/src/live-emit.ts                                     110 +-
3 files changed, 263 insertions(+), 51 deletions(-)
```

263 changed lines + v1 GA image-publish release tooling => DEEP review.

Note: the local on-disk test was `service-lock-emit-618.test.ts` (a different,
already-landed file); the PR's actual new test is
`migrator-workspace-detection-618.test.ts`. Both names appear in the workspace;
the graded one is the PR-added file confirmed via `gh pr view 342 --json files`.

## Verdict

BLOCK - one merge-blocking finding (P1). The runtime logic of BOTH fixes is sound
and matches every behavioral VERIFY item; the 64/64 build proving runtime
correctness is not in dispute. BUT the codegen change introduces a NEW static
type error that fails the codegen package `typecheck`/`build` gate, which the
local-CI-first merge gate (`turbo run lint typecheck test build`) runs. `bun test`
strips types so it never caught it; the image build runs the EMITTED Dockerfiles,
never `tsc`, so it never caught it either. The gate that catches it is not the one
the "it demonstrably works" evidence exercised.

## Findings

### P1 - `tsc --noEmit` regression: `m[1]` is `string | undefined` under `noUncheckedIndexedAccess`, fails the codegen typecheck gate

- File: `tools/codegen/src/live-emit.ts:1210`
- Added line (commit `93eb863`):
  ```ts
  for (const m of lockText.matchAll(
    /"(backend\/(?:packages|services)\/[a-z0-9][a-z0-9-]*)"\s*:\s*\{/g,
  )) {
    memberDirs.add(m[1]);   // <- m[1] : string | undefined
  }
  ```
- Proof (PR head `93eb863`, from `tools/codegen/`):
  ```
  $ bunx tsc --noEmit
  src/live-emit.ts(1210,20): error TS2345: Argument of type 'string | undefined'
    is not assignable to parameter of type 'string'.
  $ echo $?   # tsc exit
  1
  ```
- Why it is real, not noise: the effective tsconfig
  (`tools/codegen/tsconfig.json` -> `@curaos/tsconfig/base.json` -> root
  `tsconfig.base.json`) has `noUncheckedIndexedAccess: true`, confirmed via
  `bunx tsc --showConfig` (`"noUncheckedIndexedAccess": true`). Under that flag a
  `RegExpMatchArray` index access is `string | undefined`, and `Set<string>.add`
  requires `string`. tsc 5.9.3.
- Why every "it works" signal missed it:
  - `bun test` transpiles + strips types -> 957/957 template tests + 5/5 618
    tests pass at runtime regardless of the type error.
  - the 64/64 image build runs the EMITTED `Dockerfile.migrator`, never the
    codegen TypeScript. Runtime correctness != static gate green.
- Why it is merge-blocking: the codegen `package.json` declares
  `"typecheck": "tsc --noEmit"` and `"build": "tsc --noEmit"`. The local-CI-first
  merge gate runs `bunx turbo run lint typecheck test build`
  (`scripts/ci-local.sh:369`, `justfile:18-19`), so the codegen `typecheck`/`build`
  task is in the merge gate and is now RED.
- Baseline check: on `origin/main` the only tsc error was the 618 test importing a
  not-yet-exported `computeMigratorWorkspace` (TS2459), which THIS PR fixes by
  adding `export`. So the PR removes one error and adds a different one; net the
  gate is still red, on a PR-authored line.
- Concrete fix (any one):
  - `if (m[1]) memberDirs.add(m[1]);` (the regex guarantees group 1 on every
    match, so the guard is free), or
  - `for (const [, dir] of lockText.matchAll(...)) memberDirs.add(dir);` then
    guard `dir`, or
  - assert: `memberDirs.add(m[1]!);` (least preferred; silences rather than
    proves).
- autofix_class: manual (concrete one-line fix above) / owner: downstream-resolver

## Verified sound (no finding) - adversarial scenarios that did NOT break

These were attacked and held; recording them so the BLOCK is understood as
narrow (one static-gate line), not a logic rejection.

### Fix #1 build-all-services.sh - compute_jobs RAM cap

Exercised the verbatim `compute_jobs` body with stubbed probes across all
spec items:

| scenario | input | result | spec |
|---|---|---|---|
| (a) RAM_CAP=0 means skip not force-1 | ncpu8, free_ram 0 | JOBS=7 | PASS |
| (b) nproc-1 never 0 | ncpu1 | CPU_CAP=1 JOBS=1 | PASS |
| (c) unprobeable host still parallelizes | ncpu4, free_ram 0 | JOBS=3 | PASS |
| (d) explicit --jobs bypasses auto | --jobs12, free_ram 1GiB | JOBS=12 (RAM ignored) | PASS |
| RAM binds under cpu | ncpu16, free_ram 15GiB | JOBS=7 | PASS |
| RAM binds hard | ncpu16, free_ram 4GiB | JOBS=2 | PASS |
| RAM floor | ncpu16, free_ram 1GiB | RAM_CAP=1 JOBS=1 | PASS |

- (e) no `set -u` / arithmetic-on-empty bug: `set -euo pipefail` (line 99) is on;
  NCPU, FREE_RAM_BYTES, RAM_CAP, CPU_CAP are all assigned in `compute_jobs`
  BEFORE first use, and `compute_jobs` is called before `print_header`
  (the only reader of CPU_CAP/RAM_CAP/FREE_RAM_BYTES). No unbound read.
- `set -e` trailing-statement trap: `compute_jobs` ends on a `if [[ <5 ]]` whose
  condition is false on bash5 -> an `if` with a false condition and no `else`
  returns 0, so the bare `compute_jobs` call does not abort under `set -e`
  (verified empirically).
- `--expected-ram-size` validation: rejects `0`/non-int via
  `^[1-9][0-9]*$` (line ~224), mirroring `--expected-tar-size`. `--jobs 0` is
  likewise rejected upfront (line ~215); the `[[ JOBS -lt 1 ]] && JOBS=1` clamp is
  redundant defense-in-depth, not the primary guard.
- New arg's missing-value-under-set-u abort (`--expected-ram-size` as last token)
  is IDENTICAL to every existing `shift 2` arg (`--jobs`, `--expected-tar-size`,
  ...). No NEW breakage introduced.
- macOS `free_ram_bytes` uses `hw.memsize / 2` as an available proxy; Linux uses
  `MemAvailable`; both bytes-validated before arithmetic. Unprobeable -> `0` ->
  no RAM cap. Correct.
- `make_isolated_context` cp-al stderr capture: `.cperr` is created only on the
  TIER1 path, removed on both success (`rm -f "${tmp}.cperr"`) and failure
  (`rm -rf "${tmp}" "${tmp}.cperr"`). No orphan.
- `bash -n tools/build/build-all-services.sh` => clean (bash 5.3.9).

Residual (not a finding, design note): the RAM cap is LAUNCH-TIME only. Unlike
disk, which has a runtime `free_bytes_on` floor check in `run_pool`, there is no
mid-wave RAM backpressure. The cap is the proven fix (64/64), but a host whose
free RAM collapses mid-wave from an external process has no analogous throttle.
Acceptable for the controlled GA-build host; logged for future hardening.

### Fix #2 live-emit.ts - computeMigratorWorkspace lock-shape detection

- (a) 3 shapes pinned by the new test AND verified against REAL on-disk
  lockfiles:
  - shape (a) devDep-only (`audit-core-service`): real lock -> hasWs=true,
    serviceDirs=[]. PASS.
  - shape (b) no-@curaos-dep (covered by test `scheduling-service`; the named
    real `scheduling-core-service`/`terminology-core-service` submodules are
    uninitialised locally so could not be run live, but `audit`/`commerce`/
    `calendar`/`documents` core all return hasWs=true serviceDirs=[] which is the
    same code path). PASS.
  - shape (c) has-sibling-service-dep: real `crm-core-service` lock ->
    serviceDirs=[`backend/services/personal-crm-service`] (sibling exists on
    disk). PASS.
- (b) existence-check drops stale lock entries: test
  `drops a stale sibling-service lock entry...` -> serviceDirs=[] when the named
  sibling dir is absent; no crash. Verified the `.filter(existsSync(... package.json))`
  guard. PASS.
- (c) LABEL recovery loop unwinds + terminates: stress-tested 8 inputs incl.
  triple-nested wrapper, purpose-with-own-parens (the old innermost-paren defect),
  no-closing-paren, empty inner. Loop strictly shortens `candidate` by the
  non-empty `wrapperPrefix` length each iteration => guaranteed termination
  (max iters observed 3 on triple-nest; an `iters>10000` tripwire never fired).
  PASS. The inner-parens case `(... (ADR-0210 neutral root))` now recovers
  `neutral root (ADR-0210 neutral root)` correctly (old code mis-extracted).
- (d) does NOT regress already-passing #588 workspace-dep migrators: real
  `encounter-service` -> hasWs=true (routes to deps stage); the
  `serviceDirs=[]` + `hasWorkspaceDeps=true` combination is fully handled by the
  template - the `{{#each migratorWorkspaceServiceDirs}}` block emits nothing and
  the deps stage still COPYs `backend/packages` + the service's own package.json
  (`templates/service-core/Dockerfile.migrator.hbs:48-78`). No new mishandled
  state. PASS.
- (e) the new test genuinely pins the 3 shapes:
  ```
  $ bun test __tests__/templates/migrator-workspace-detection-618.test.ts
  5 pass / 0 fail / 13 expect() calls
  ```
  Cases: shape(b), shape(a), sibling-COPY, stale-drop, single-package-negative.
- (f) existing template suite still green:
  ```
  $ bun test __tests__/templates/
  957 pass / 1 skip / 0 fail / 3734 expect() calls (57 files)
  $ bun test __tests__/templates/migration-dockerfile.test.ts
  29 pass / 0 fail
  ```
- Member-dir regex over-match check: against 4 real lockfiles, every
  `"backend/(packages|services)/X": {` match falls inside the `workspaces` map
  (before the lock `packages` resolution section). No match after the resolution
  section -> no false members pulled from dependency-resolution entries.

## Non-blocking observations (P3, not gating)

- `tools/codegen/src/live-emit.ts:1224` `.sort()` -> oxlint unicorn/no-array-sort
  warning (prefer `toSorted()`). It is a WARNING (oxlint exits 0; no
  `--deny-warnings` in the lint script) and the prior code already used `.sort()`,
  so it is a carried pattern, not a new defect. Optional cleanup.

## Em/en dash gate

`tools/build/build-all-services.sh`, `tools/codegen/src/live-emit.ts`,
`tools/codegen/__tests__/templates/migrator-workspace-detection-618.test.ts`:
all CLEAN (added lines scanned; `live-emit.ts:961` uses `–—` escape
sequences, not glyph bytes - verified via hexdump).

## What must happen before merge

1. Fix `live-emit.ts:1210` so `tsc --noEmit` is green on the codegen package
   (guard `m[1]` or destructure-and-guard).
2. Re-run `bunx turbo run lint typecheck test build --filter=@curaos/codegen`
   (or the relevant codegen filter) and confirm green, since the proving build run
   never exercised the typecheck task.

GRILL-VERDICT: BLOCK
