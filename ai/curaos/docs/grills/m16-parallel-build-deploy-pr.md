# Adversarial Tier-2 grill: parallel dependency-aware build/deploy rewrite

- Branch: `feat/parallel-build-deploy`
- Parent curaos commit: `ca9045f` (`perf(build): dependency-aware parallel build+deploy scheduler`)
- Submodule curaos-deploy commit: `b27d8ae` (`perf(bundle): concurrent 4-profile fan-out with vendor-once + cache isolation`)
- Reviewer harness: Claude (Opus 4.8), adversarial/chaos-engineering pass
- Host: macOS, bash 5.3.9 reachable as both `/opt/homebrew/bin/bash` and PATH `bash`
- Design + must-fix spec: `ai/curaos/docs/research/2026-06-14-parallel-dep-aware-build-deploy.md`

Method: read the full changed code, then INDEPENDENTLY VERIFIED each claim with
static analysis (bash -n, shellcheck 0.11.0) and live dynamic harnesses that
source the REAL scheduler functions (`run_pool`, `build_one`, `make_isolated_context`,
`reduce_digests`, `count_built/failed`, `profile_worker`/`run_profiles`) and drive
them with deterministic fake builders to provoke races. No claim was taken on trust.

---

## Verdict summary

The headline root-lock race IS eliminated and I could not construct a corruption.
All 7 MUST-FIX items are really implemented (not stubbed) and behave correctly
under live parallel execution. Determinism holds: jobs=1 and jobs=8 produced a
byte-identical sorted manifest, and every service's digest was the hash of ITS
OWN pruned lock with the committed `REPO_ROOT/bun.lock` untouched. The "4
pre-existing test failures" claim is verified true (identical root cause on
origin/main). No P0 or P1 findings. The findings below are P2/P3 advisories.

---

## Claim-by-claim verification

### 1. ROOT-LOCK RACE ELIMINATED (headline) - VERIFIED

- Every WAVE 1 service builds with `--context <its own clone>` and
  `--dockerfile ${ctx}/${df}` (`_build_one_impl` L933, L948-951). Migrators build
  read-only against `REPO_ROOT` (or `REPO_ROOT/<svc-dir>`) and never stage a lock.
- The committed `REPO_ROOT/bun.lock` is NEVER mutated on any path: the old
  swap+RETURN-trap machinery is fully deleted; `make_isolated_context` overlays
  the pruned lock onto the CLONE only (`cp -p "${svc_lock}" "${tmp}/bun.lock"`,
  L716, after `rm -f "${tmp}/bun.lock"` breaks the hardlink).
- LIVE PROOF: drove the real `run_pool`+`build_one` with 12 fake services at
  jobs=8 (random sleeps to force interleave). Each service's sentinel digest =
  `sha256(name | its-own-pruned-lock)`, verified against independent hashes
  (svc1=`34ec82b...`, svc7=`ea900f0...` matched exactly). Committed root lock read
  `ROOT-COMMITTED-LOCK` unchanged after the parallel run. Two concurrent builds
  cannot touch the same lock file: each owns `WORKDIR/ctx/<unique-name>/bun.lock`.
- Atomic clone: `rm -rf ctx tmp` first, clone into `ctx.tmp.$$`, then `mv` (L683,
  L719). LIVE PROOF: confirmed `cp -al src dst` NESTS into `dst/src` when dst
  survives (the hazard is real), then confirmed `make_isolated_context` called
  twice with a surviving ctx does NOT nest (overlays correctly, post-clone
  `bun.lock` assert at L725 passes, service file present at expected depth).
- `.git` excluded from the clone (L697 `rm -rf "${tmp}/.git"`); LIVE PROOF the
  clone has no `.git`. `WAVE_EPOCH` is frozen ONCE pre-fan-out from `REPO_ROOT`
  HEAD (L350-353) and passed `--source-date-epoch "${WAVE_EPOCH}"` to EVERY worker
  (L955), so the git-in-clone dependence is genuinely removed (not just claimed).

### 2. DETERMINISM (jobs 1 == jobs N) - VERIFIED

- LIVE PROOF: `diff <(sort wd1/manifest) <(sort wd8/manifest)` on the 12-service
  harness = IDENTICAL. Manifest is `sort -u`'d in `reduce_digests` (L1045) so it is
  order-independent. `WAVE_EPOCH` is frozen once and threaded uniformly, so the
  per-image epoch cannot drift under parallel ordering. The digest function has no
  shared-mutable input after the root-lock fix; I could not construct a path where
  parallel ordering leaks into a digest.

### 3. THE 7 MUST-FIX - ALL VERIFIED IMPLEMENTED

(a) BASH-5 re-exec / honest serial degrade: L114-133 re-exec under
    `/opt/homebrew/bin/bash` or PATH bash>=5 (guarded by `_CURAOS_BUILD_REEXEC`
    against loops); if none, `compute_jobs` forces `JOBS=1` + sets
    `JOBS_DEGRADE_REASON` (L333-336) which prints in `print_header` (L480) AND the
    dry-run WAVE PLAN (L531). `dispatch` gates on `BASH_VERSINFO>=5` (L783).
    The plan no longer lies: it prints the EFFECTIVE jobs + interpreter version.
(b) Atomic idempotent context clone: see #1. `rm -rf` first, `.tmp.$$` then `mv`,
    post-clone assert. VERIFIED no-nest on surviving target.
(c) Interrupt net repurposed: `cleanup_contexts_on_exit` (L261-264) scrubs
    `CTX_DIR/*` on EXIT/INT/TERM (NOT deleted wholesale). LIVE PROOF: the trap
    fires ONCE at main-shell exit (BASHPID = main), and backgrounded function
    workers do NOT fire the inherited EXIT trap on return - so a worker finishing
    cannot wipe a sibling's live context.
(d) Backfill mktemp same-filesystem: `WORK="$(mktemp "${ZARF_YAML}.XXXXXX")"`
    (zarf-digest-backfill.sh L63) => same dir => `mv` is rename(2) = atomic.
    `trap 'rm -f ... "${WORK}"' EXIT` cleans up (L64).
(e) Runner ref via sentinel file: WAVE 0 writes `STATUS_DIR/runner.ref`
    atomically (L867). Migrator workers READ it from disk (L961) and FAIL if
    absent or the all-zero placeholder (L962-970). LIVE PROOF of all 3 cases:
    missing ref -> rc=1, all-zero ref -> rc=1, valid ref -> rc=0 + digest written.
    No reliance on inherited shell global.
(f) Deploy worker isolation: `profile_worker` wraps `build_profile` in `( ... )`
    (bundle.sh L296) so `die`'s `exit` is contained. LIVE PROOF: a `die 3` in the
    hybrid profile left cloud/on-prem/air-gap PASSing and fail-aggregate reported
    exactly 1 failure with non-zero exit. `wait -n || rc=$?` (L310/316) keeps the
    pool from aborting under set -e.
(g) Realistic disk budget: `PER_JOB_BYTES = EXPECTED_TAR_BYTES * 3` (L314),
    `DISK_CAP = FREE_BYTES / 2 / PER_JOB_BYTES` (L316). VERIFIED math = 5 slots on
    22G (matches spec), clamps to 1 on a tiny disk. Runtime df floor throttle in
    `run_pool` (L755) drains before launching below one job's budget; cannot spin
    forever (inner loop requires `active>0`). Stream-then-delete of tar + ctx is
    immediate in `build_one` (L890-891).

### 4. WAVE ORDERING - VERIFIED

- Runner-base barrier BEFORE any migrator: WAVE 0 runs serially+fully before
  WAVE 2 (L1148-1155); `build_migration_runner` returns non-zero -> hard exit 2.
- WAVE 1 (services) fully joins before WAVE 2 (migrators) - sequential `dispatch`
  calls (L1163, L1172). So a #588 deps-overlay migrator's paired service sentinel
  is always present, AND every migrator reads `runner.ref` from disk and fails if
  absent. The overlap opt-in was correctly NOT shipped.
- Backfill barrier AFTER the complete digest set: `FAILED>0 -> exit 2` (L1184)
  runs BEFORE `reduce_digests` (L1194), which itself asserts
  `seen == expect_count` and refuses an incomplete set. Backfill is L1209+.
- I could not construct a schedule that violates any of these in the default path.

### 5. SENTINEL CORRECTNESS - VERIFIED

- One writer per file (`digests.d/<name>.txt`, `status.d/<name>.rc`), atomic
  temp+rename. LIVE PROOF with a forced svc5 build failure: svc5 status.rc=1, NO
  svc5 digest sentinel, 11 (not 12) digest sentinels, `count_built=11
  count_failed=1`, and `reduce_digests 12` REFUSED ("found 11, expected 12").
- A worker that fails is counted failed, never green. A worker that writes a
  digest then fails on push: `FAILED>0` gate aborts before backfill.
- Name collision: `enumerate` ends with `sort -u` (L441) and `reduce_digests`
  rejects duplicate names via `uniq -d` (L1050). One-file-per-name means a
  collision yields a short count -> count-assert fails. Safe.
- Note: the count-assert is structural, not semantic (a wrong-context build would
  write a well-formed sentinel and pass the count). The real semantic backstop is
  `bun install --frozen-lockfile` failing loudly inside a wrong-lock build, which
  propagates to the worker rc. Acceptable as designed; see F2.

### 6. A/B CRED SPLIT under parallel - VERIFIED

- `PUSH_CACHE` is keyed on `DO_PUSH`, never `JOBS` (L817, L979); the registry
  cache flags in repro-build only emit when `PUSH_CACHE=1` (L182). `--push`/`--sign`
  precondition gates fail-fast BEFORE any wave (L578-593, exit 3). The agent path
  (`--build`/`--dry-run`/`--backfill`/`--operand-digest`) needs no creds even at
  `--jobs N`. I could not construct a parallel path that leaks a push or needs
  creds in the agent half.

### 7. THE "4 PRE-EXISTING FAILURES" CLAIM - VERIFIED TRUE (NOT regressions)

- Branch `bun test tools/build/build-all-services.test.js` = 12 pass / 4 fail.
- ALL 4 failures share ONE root cause: the real `ops/zarf/zarf.yaml` has 0
  `@sha256:<digest>` placeholders (backfilled since #330), but the test fixture
  asserts 64 CuraOS + 67 total placeholders and that a partial backfill exits 2.
- This PR does NOT touch the test file or zarf.yaml (`git diff --quiet
  origin/main...HEAD -- tools/build/build-all-services.test.js ops/zarf/zarf.yaml`
  both report UNCHANGED).
- INDEPENDENT PROOF the partial-backfill failure pre-exists: ran BOTH the branch
  backfill AND origin/main's backfill (via a detached worktree) against the real
  already-backfilled zarf.yaml with a partial manifest -> BOTH return exit 0
  (not 2), identically. The test predates the #330 backfill and is a fixture
  staleness issue, not a regression from this change.

---

## Findings

### F1 [P2] cp -al hardlink clone walks the full ~377K-file monorepo per service

`make_isolated_context` does `cp -al "${REPO_ROOT}" "${tmp}"` of the ENTIRE
working tree. The repo currently has ~376,957 files (node_modules dominated). A
single `cp -al` of this tree did not finish within ~15s in my measurement. WAVE 1
clones once PER buildable service (32 in `--all`), i.e. ~32 x ~377K = ~12M
hardlink syscalls plus 32 x post-clone `rm -rf .git`. The clones are near-zero
DISK (shared inodes, confirmed) so this is not a disk or correctness defect - it
is wall-clock + inode-pressure overhead that can erode, or on a slow filesystem
exceed, the parallelism win the PR exists to deliver. Evidence: `find REPO_ROOT
-type f | wc -l` = 376957; the timed `cp -al` of REPO_ROOT was still running at
15s. Advisory: prefer the TIER-3 buildx `--build-context lockctx=` end-state (the
PR already records it as the clean migration) or exclude `node_modules`/build
caches from the clone, since service Dockerfiles `COPY` only tracked source +
the overlaid lock. Owner: human (perf/maintainer judgment; the codegen TIER-3
follow-up is already filed).

### F2 [P3] reduce_digests completeness check is structural, not semantic

`reduce_digests` asserts `seen == expect_count`, no duplicate names, and
well-formed `sha256:64hex` - but cannot prove a sentinel holds the RIGHT digest
for the RIGHT context. A hypothetical wrong-context build would write a
well-formed sentinel and pass the count. In practice this is defended by (a) the
atomic non-nesting clone + post-clone `bun.lock` assert (verified), and (b)
`bun install --frozen-lockfile` inside each build failing loudly on a wrong lock,
which propagates to the worker rc and trips `FAILED>0`. So the gap is theoretical
given the other guards. Advisory only: the design already documents frozen-lock
as the semantic backstop; no change required. Owner: human.

### F3 [P3] Per-job HELM_CACHE_HOME mktemp dirs are never cleaned up

Each helm `profile_worker` does `helm_home="$(mktemp -d)"` and exports
HELM_CACHE/CONFIG/DATA into it (bundle.sh L148-152) but never removes it. Over
repeated runs this leaks temp dirs. The dirs are tiny (file:// subcharts already
vendored, `--skip-refresh`) so this is housekeeping, not correctness. Advisory:
add `trap 'rm -rf "${helm_home}"' RETURN` or clean in the worker. Owner: human.

### F4 [P3] Pre-existing em-dash in curaos-deploy lib/common.sh (NOT this PR)

`bundle.sh`'s runtime SKIP output contains U+2014 ("SKIP: ... — ...") sourced
from `lib/common.sh:10` `skip()`, which is UNCHANGED by this PR and lives in a
submodule with no em-dash gate. All FIVE files this PR actually changed are
em-dash-clean (0 occurrences). Flagged only so it is not mistaken for a
regression; out of scope for this change. Owner: human.

---

## Residual risks

- The disk throttle and disk_cap default (5 slots on 22G) are tuned to build-host;
  EXPECTED_TAR_BYTES=700MiB is an estimate. A genuinely larger image or a very
  small `--workdir` filesystem relies on the runtime df floor to throttle. The
  floor logic is correct (drains before launching below one job's budget) but has
  no lower bound below 1 slot, so a near-full disk still launches one build that
  may itself fail on disk-full - acceptable degradation, surfaced as a normal
  build failure + sentinel rc!=0.
- The parallel path was exercised here with FAKE builders (no docker daemon). The
  scheduler/sentinel/clone logic is fully proven; the real buildkit
  per-clone-context cache behavior (design's "low" hole about shared local-source
  COPY cache) was NOT live-tested - the design's stated backstop is
  frozen-lockfile failing on a wrong lock, which is sound but unverified against a
  real daemon here.

## Testing gaps

- No automated test exercises the parallel scheduler itself (run_pool, sentinel
  reduction, jobs=1==jobs=N determinism, runner.ref guard, deploy die-containment).
  The existing test suite covers only the (A) dry-run/backfill surface. The
  determinism + isolation guarantees are the load-bearing claims of this PR and
  currently rest on manual/grill verification, not CI. Recommend a follow-up test
  that drives the scheduler with a stub repro-build (as this grill did) and
  asserts manifest equality across jobs values + the failure-accounting paths.
- The 4 pre-existing test failures should be fixed in a separate change (refresh
  the fixture to a staged zarf.yaml WITH placeholders, or assert against a
  staged-pre-backfill copy) so the suite is green and future real regressions are
  not masked by known-red.

---

GRILL-VERDICT: PASS
