#!/usr/bin/env bash
# Tests for gc-local-state.sh (RP-75). Self-contained fixture roots under mktemp;
# every destructive (--apply) invocation targets a throwaway fixture, never the
# real workspace. Carries the RP-75 acceptance fixtures: a .scratch file with
# VERDICT: and a non-worktree dir under .worktrees/ must make even the dry-run
# exit nonzero without deleting.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/gc-local-state.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Hermetic git config (identity + hooks isolated from any workspace hooksPath).
HOOKS="$TMP/no-hooks"
mkdir -p "$HOOKS"
cat > "$TMP/gitconfig" <<EOF
[user]
	name = RP75 GC Test
	email = rp75-gc@test.invalid
[init]
	defaultBranch = main
[core]
	hooksPath = $HOOKS
[commit]
	gpgsign = false
EOF
export GIT_CONFIG_GLOBAL="$TMP/gitconfig"
export GIT_CONFIG_SYSTEM=/dev/null

# Deterministic external deps: gitleaks stubs + an open-issues file (no gh calls).
EMPTY_ISSUES="$TMP/issues-empty.txt"
: > "$EMPTY_ISSUES"
STUB_OK="$TMP/gitleaks-ok"
STUB_LOG="$TMP/gitleaks-ok.log"
cat > "$STUB_OK" <<EOF
#!/bin/sh
echo "\$@" >> "$STUB_LOG"
exit 0
EOF
chmod +x "$STUB_OK"
STUB_LEAK="$TMP/gitleaks-leak"
cat > "$STUB_LEAK" <<'EOF'
#!/bin/sh
echo "leak: fake finding"
exit 1
EOF
chmod +x "$STUB_LEAK"

ts_days_ago() { # ts_days_ago <days> -> touch -t stamp
  date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M
}
make_old() { touch -t "$(ts_days_ago "$2")" "$1"; }

mkroot() { # mkroot <dir>: minimal workspace marker (AGENTS.md + ai/)
  mkdir -p "$1/ai" "$1/.scratch" "$1/.agent-workflow-kit/runs"
  printf 'fixture\n' > "$1/AGENTS.md"
}

run_gc() { # run_gc <root> [extra args...]; sets OUT + RC; stubbed gitleaks + empty issues
  local root="$1"; shift
  OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$root" "$@" 2>&1)"
  RC=$?
}

# --- T1: dry-run is the default; lists candidates without deleting ---
R1="$TMP/r1"
mkroot "$R1"
mkdir -p "$R1/.scratch/cache"
printf 'stale cache\n' > "$R1/.scratch/cache/old.json"
make_old "$R1/.scratch/cache/old.json" 30
run_gc "$R1"
if [ "$RC" -eq 0 ]; then ok "T1 dry-run exits 0 on a clean fixture"; else nok "T1 rc" "rc=$RC out=$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "SCRATCH-DELETE.*cache/old.json"; then ok "T1 dry-run lists the cache candidate"; else nok "T1 listing" "$OUT"; fi
if [ -f "$R1/.scratch/cache/old.json" ]; then ok "T1 dry-run deleted nothing"; else nok "T1 no-delete" "candidate was removed in dry-run"; fi
if printf '%s\n' "$OUT" | grep -q "mode=DRY-RUN"; then ok "T1 default mode is DRY-RUN"; else nok "T1 mode" "$OUT"; fi

# --- T9a: gitleaks leg runs over both runs + .scratch dirs (stub records invocations) ---
if grep -q "$R1/.agent-workflow-kit/runs" "$STUB_LOG" 2>/dev/null && grep -q "$R1/.scratch" "$STUB_LOG" 2>/dev/null; then
  ok "T9a gitleaks leg scanned .agent-workflow-kit/runs and .scratch"
else
  nok "T9a gitleaks invocations" "$(cat "$STUB_LOG" 2>/dev/null)"
fi
if grep -q "detect --no-git" "$STUB_LOG" 2>/dev/null; then ok "T9a gitleaks invoked as detect --no-git"; else nok "T9a gitleaks args" "$(cat "$STUB_LOG" 2>/dev/null)"; fi

# --- T2: RP-75 acceptance fixture: .scratch file with VERDICT: blocks even dry-run ---
R2="$TMP/r2"
mkroot "$R2"
printf 'VERDICT: PASS (grill evidence)\n' > "$R2/.scratch/x"
run_gc "$R2"
if [ "$RC" -eq 2 ]; then ok "T2 VERDICT fixture makes dry-run exit nonzero (2)"; else nok "T2 rc" "rc=$RC out=$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "scratch-evidence-verdict"; then ok "T2 blocker reason is scratch-evidence-verdict"; else nok "T2 reason" "$OUT"; fi
if [ -f "$R2/.scratch/x" ]; then ok "T2 nothing deleted under blocker"; else nok "T2 no-delete" "evidence file removed"; fi

# --- T3: RP-75 acceptance fixture: non-worktree dir under .worktrees/ blocks dry-run ---
R3="$TMP/r3"
mkroot "$R3"
git -C "$R3" init -q
git -C "$R3" add AGENTS.md
git -C "$R3" commit -qm "feat: fixture seed"
git -C "$R3" worktree add -q "$R3/.worktrees/lane-a" -b lane-a
mkdir -p "$R3/.worktrees/ai/curaos"
printf 'stray\n' > "$R3/.worktrees/ai/curaos/doc.md"
run_gc "$R3"
if [ "$RC" -eq 2 ]; then ok "T3 stray .worktrees dir makes dry-run exit nonzero (2)"; else nok "T3 rc" "rc=$RC out=$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "non-worktree-dir-under-worktrees"; then ok "T3 blocker reason is non-worktree-dir"; else nok "T3 reason" "$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "BLOCKER.*\.worktrees/lane-a"; then nok "T3 registered worktree" "lane-a falsely flagged: $OUT"; else ok "T3 registered worktree lane-a not flagged"; fi
if [ -d "$R3/.worktrees/ai" ]; then ok "T3 stray dir untouched"; else nok "T3 no-delete" "stray dir removed"; fi

# --- T4: runs retention dry-run (keep newest N or younger than TTL) ---
mkrun() { # mkrun <root> <name> <status> <age-days>
  local d="$1/.agent-workflow-kit/runs/$2"
  mkdir -p "$d"
  printf '{"runId":"%s","status":"%s"}\n' "$2" "$3" > "$d/run.json"
  printf '{"event":"x"}\n' > "$d/events.jsonl"
  make_old "$d/run.json" "$4"
  make_old "$d/events.jsonl" "$4"
  make_old "$d" "$4"
}
R4="$TMP/r4"
mkroot "$R4"
mkrun "$R4" "wf-old-fail" "failed" 30
mkrun "$R4" "wf-old-done" "completed" 20
mkrun "$R4" "wf-new" "completed" 0
run_gc "$R4" --keep-runs 1
if [ "$RC" -eq 0 ]; then ok "T4 dry-run rc=0"; else nok "T4 rc" "rc=$RC out=$OUT"; fi
if [ "$(printf '%s\n' "$OUT" | grep -c "^RUN-DELETE")" -eq 2 ]; then ok "T4 two old runs are candidates"; else nok "T4 candidates" "$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "RUN-DELETE.*wf-new"; then nok "T4 keep newest" "wf-new flagged: $OUT"; else ok "T4 newest run kept"; fi
if printf '%s\n' "$OUT" | grep -q "RUN-ARCHIVE.*wf-old-fail"; then ok "T4 failed run has archive plan"; else nok "T4 archive plan" "$OUT"; fi
if [ -d "$R4/.agent-workflow-kit/runs/wf-old-fail" ] && [ -d "$R4/.agent-workflow-kit/runs/wf-old-done" ]; then ok "T4 dry-run deleted no runs"; else nok "T4 no-delete" "run dirs removed in dry-run"; fi

# --- T5: runs retention apply (archive failures first, then delete) ---
R5="$TMP/r5"
mkroot "$R5"
mkrun "$R5" "wf-old-fail" "failed" 30
mkrun "$R5" "wf-old-done" "completed" 20
mkrun "$R5" "wf-new" "completed" 0
run_gc "$R5" --keep-runs 1 --apply
if [ "$RC" -eq 0 ]; then ok "T5 apply rc=0"; else nok "T5 rc" "rc=$RC out=$OUT"; fi
if [ ! -d "$R5/.agent-workflow-kit/runs/wf-old-fail" ] && [ ! -d "$R5/.agent-workflow-kit/runs/wf-old-done" ]; then ok "T5 old runs deleted"; else nok "T5 delete" "old runs remain"; fi
if [ -d "$R5/.agent-workflow-kit/runs/wf-new" ]; then ok "T5 newest run kept"; else nok "T5 keep" "wf-new deleted"; fi
if [ -f "$R5/.agent-workflow-kit/runs-archive/wf-old-fail/run.json" ] && [ -f "$R5/.agent-workflow-kit/runs-archive/wf-old-fail/events.jsonl" ]; then ok "T5 failed run archived before deletion"; else nok "T5 archive" "$(ls -R "$R5/.agent-workflow-kit" 2>/dev/null)"; fi
if [ ! -d "$R5/.agent-workflow-kit/runs-archive/wf-old-done" ]; then ok "T5 completed run not archived"; else nok "T5 archive scope" "completed run archived"; fi

# --- T6: scratch class TTLs + protected dirs (apply) ---
R6="$TMP/r6"
mkroot "$R6"
mkdir -p "$R6/.scratch/cache" "$R6/.scratch/state" "$R6/.scratch/evidence" "$R6/.scratch/integration-queue"
printf 'c\n' > "$R6/.scratch/cache/old.bin";   make_old "$R6/.scratch/cache/old.bin" 10
printf 's\n' > "$R6/.scratch/state/mid.bin";   make_old "$R6/.scratch/state/mid.bin" 10
printf 's\n' > "$R6/.scratch/state/old.bin";   make_old "$R6/.scratch/state/old.bin" 40
printf 'e\n' > "$R6/.scratch/evidence/ev.txt"; make_old "$R6/.scratch/evidence/ev.txt" 40
printf 'q\n' > "$R6/.scratch/integration-queue/rp-99.md"; make_old "$R6/.scratch/integration-queue/rp-99.md" 40
run_gc "$R6" --apply
if [ "$RC" -eq 0 ]; then ok "T6 apply rc=0"; else nok "T6 rc" "rc=$RC out=$OUT"; fi
if [ ! -f "$R6/.scratch/cache/old.bin" ]; then ok "T6 cache file past 7d TTL deleted"; else nok "T6 cache" "survived"; fi
if [ -f "$R6/.scratch/state/mid.bin" ]; then ok "T6 state file at 10d kept (30d TTL)"; else nok "T6 state-mid" "deleted early"; fi
if [ ! -f "$R6/.scratch/state/old.bin" ]; then ok "T6 state file past 30d TTL deleted"; else nok "T6 state-old" "survived"; fi
if [ -f "$R6/.scratch/evidence/ev.txt" ]; then ok "T6 evidence never auto-deleted"; else nok "T6 evidence" "deleted"; fi
if printf '%s\n' "$OUT" | grep -q "EVIDENCE-PENDING.*ev.txt"; then ok "T6 old evidence listed promotion-pending"; else nok "T6 evidence listing" "$OUT"; fi
if [ -f "$R6/.scratch/integration-queue/rp-99.md" ]; then ok "T6 integration-queue protected"; else nok "T6 queue" "deleted"; fi

# --- T7: legacy scratch files honor the open-issue reference check ---
R7="$TMP/r7"
mkroot "$R7"
printf 'a\n' > "$R7/.scratch/ref-kept.txt"; make_old "$R7/.scratch/ref-kept.txt" 30
printf 'b\n' > "$R7/.scratch/unref.txt";    make_old "$R7/.scratch/unref.txt" 30
ISSUES7="$TMP/issues7.txt"
printf 'open issue #42 mentions ref-kept.txt as pending evidence\n' > "$ISSUES7"
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$ISSUES7" bash "$SCRIPT" --root "$R7" --apply 2>&1)"; RC=$?
if [ "$RC" -eq 0 ]; then ok "T7 apply rc=0"; else nok "T7 rc" "rc=$RC out=$OUT"; fi
if [ -f "$R7/.scratch/ref-kept.txt" ]; then ok "T7 issue-referenced file kept"; else nok "T7 referenced" "deleted"; fi
if [ ! -f "$R7/.scratch/unref.txt" ]; then ok "T7 unreferenced legacy file deleted"; else nok "T7 unreferenced" "survived"; fi
if printf '%s\n' "$OUT" | grep -q "SCRATCH-KEEP.*referenced-by-open-issue"; then ok "T7 keep reason recorded"; else nok "T7 reason" "$OUT"; fi

# --- T8: apply fails closed when the issue check is unavailable ---
R8="$TMP/r8"
mkroot "$R8"
printf 'x\n' > "$R8/.scratch/orphan.txt"; make_old "$R8/.scratch/orphan.txt" 30
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$TMP/does-not-exist.txt" bash "$SCRIPT" --root "$R8" --apply 2>&1)"; RC=$?
if [ "$RC" -eq 4 ]; then ok "T8 apply exits 4 without issue check"; else nok "T8 rc" "rc=$RC out=$OUT"; fi
if [ -f "$R8/.scratch/orphan.txt" ]; then ok "T8 nothing deleted when blocked"; else nok "T8 no-delete" "deleted"; fi
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$TMP/does-not-exist.txt" bash "$SCRIPT" --root "$R8" 2>&1)"; RC=$?
if [ "$RC" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "SCRATCH-BLOCKED"; then ok "T8 dry-run only warns (rc=0, blocked listed)"; else nok "T8 dry-run" "rc=$RC out=$OUT"; fi

# --- T9b: gitleaks findings stop the GC before any deletion ---
R9="$TMP/r9"
mkroot "$R9"
mkdir -p "$R9/.scratch/cache"
printf 'c\n' > "$R9/.scratch/cache/old.bin"; make_old "$R9/.scratch/cache/old.bin" 10
OUT="$(GC_GITLEAKS_BIN="$STUB_LEAK" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$R9" --apply 2>&1)"; RC=$?
if [ "$RC" -eq 3 ]; then ok "T9b gitleaks findings exit 3"; else nok "T9b rc" "rc=$RC out=$OUT"; fi
if [ -f "$R9/.scratch/cache/old.bin" ]; then ok "T9b nothing deleted on findings"; else nok "T9b no-delete" "deleted"; fi
OUT="$(GC_GITLEAKS_BIN="$TMP/no-such-gitleaks" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$R9" --apply 2>&1)"; RC=$?
if [ "$RC" -eq 3 ]; then ok "T9b missing gitleaks fails closed in apply (3)"; else nok "T9b missing-apply" "rc=$RC out=$OUT"; fi
OUT="$(GC_GITLEAKS_BIN="$TMP/no-such-gitleaks" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$R9" 2>&1)"; RC=$?
if [ "$RC" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "WARN: gitleaks not found"; then ok "T9b missing gitleaks only warns in dry-run"; else nok "T9b missing-dry" "rc=$RC out=$OUT"; fi

# --- T10: .codegraph WAL checkpoint with size evidence (apply, fixture db) ---
if command -v sqlite3 >/dev/null 2>&1; then
  R10="$TMP/r10"
  mkroot "$R10"
  mkdir -p "$R10/.codegraph"
  DB="$R10/.codegraph/codegraph.db"
  # SIGKILL skips the clean close so the WAL survives on disk (a clean close
  # would checkpoint + remove it). bun -e argv = [bun, args...]; db path is argv[1].
  # The intermediate bash is bun's job parent, so the expected "Killed: 9" notice
  # lands on its (redirected) stderr instead of the test output.
  bash -c 'bun -e "
const { Database } = require(\"bun:sqlite\");
const db = new Database(process.argv[1]);
db.exec(\"PRAGMA journal_mode=WAL;\");
db.exec(\"CREATE TABLE t (x BLOB);\");
db.exec(\"INSERT INTO t VALUES (randomblob(200000));\");
process.kill(process.pid, \"SIGKILL\");
" "$1"; :' _ "$DB" >/dev/null 2>&1
  WAL_BEFORE="$(wc -c < "${DB}-wal" 2>/dev/null | tr -d '[:space:]')"
  if [ "${WAL_BEFORE:-0}" -gt 0 ] 2>/dev/null; then
    run_gc "$R10"
    if printf '%s\n' "$OUT" | grep -q "would checkpoint"; then ok "T10 dry-run reports sizes, would checkpoint"; else nok "T10 dry-run" "$OUT"; fi
    WAL_MID="$(wc -c < "${DB}-wal" | tr -d '[:space:]')"
    if [ "$WAL_MID" = "$WAL_BEFORE" ]; then ok "T10 dry-run left WAL untouched"; else nok "T10 dry-run wal" "before=$WAL_BEFORE mid=$WAL_MID"; fi
    run_gc "$R10" --apply
    WAL_AFTER="$(wc -c < "${DB}-wal" 2>/dev/null | tr -d '[:space:]')"
    if [ "$RC" -eq 0 ] && [ "${WAL_AFTER:-0}" -eq 0 ]; then ok "T10 apply truncated WAL ($WAL_BEFORE -> ${WAL_AFTER:-0} bytes)"; else nok "T10 apply" "rc=$RC before=$WAL_BEFORE after=${WAL_AFTER:-?} out=$OUT"; fi
    if printf '%s\n' "$OUT" | grep -q "checkpointed .*before=${WAL_BEFORE} after="; then ok "T10 size evidence printed"; else nok "T10 evidence" "$OUT"; fi
  else
    nok "T10 fixture" "could not produce a persistent WAL (before=${WAL_BEFORE:-empty})"
  fi
else
  ok "T10 skipped: sqlite3 not installed"
fi

# --- T11: bad --root fails closed (marker validation) ---
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$TMP/missing-root" 2>&1)"; RC=$?
if [ "$RC" -eq 5 ]; then ok "T11 nonexistent --root exits 5"; else nok "T11 missing root" "rc=$RC out=$OUT"; fi
NOMARK="$TMP/nomark"
mkdir -p "$NOMARK"
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$EMPTY_ISSUES" bash "$SCRIPT" --root "$NOMARK" 2>&1)"; RC=$?
if [ "$RC" -eq 5 ]; then ok "T11 marker-less --root exits 5"; else nok "T11 marker" "rc=$RC out=$OUT"; fi

# --- T12: RP-71 snapshot rotation dry-run (count-based, fixed names protected) ---
# All files age 0: proves rotation is keep-newest-3 by count, not a TTL class.
S0=1780600000000
R12="$TMP/r12"
mkroot "$R12"
mkdir -p "$R12/.scratch/workflow-cache"
printf '{"items":[]}\n' > "$R12/.scratch/workflow-cache/roadmap-items.json"
printf '{"items":[]}\n' > "$R12/.scratch/workflow-cache/roadmap-items-latest.json"
for i in 1 2 3 4 5; do
  printf '{"items":[%d]}\n' "$i" > "$R12/.scratch/workflow-cache/roadmap-items-$((S0+i))-abc$i.json"
done
run_gc "$R12"
if [ "$RC" -eq 0 ]; then ok "T12 dry-run rc=0"; else nok "T12 rc" "rc=$RC out=$OUT"; fi
if [ "$(printf '%s\n' "$OUT" | grep -c "^SNAPSHOT-DELETE")" -eq 2 ]; then ok "T12 exactly 2 of 5 rotations are delete candidates (keep 3)"; else nok "T12 candidates" "$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "SNAPSHOT-DELETE.*roadmap-items-$((S0+1))-abc1.json" \
   && printf '%s\n' "$OUT" | grep -q "SNAPSHOT-DELETE.*roadmap-items-$((S0+2))-abc2.json"; then
  ok "T12 the 2 oldest stamps are the candidates"
else
  nok "T12 oldest" "$OUT"
fi
if printf '%s\n' "$OUT" | grep "^SNAPSHOT-DELETE" | grep -q "roadmap-items.json\|roadmap-items-latest.json"; then nok "T12 fixed names" "fixed file listed for deletion: $OUT"; else ok "T12 fixed names never candidates"; fi
if printf '%s\n' "$OUT" | grep -q "SUMMARY-SNAPSHOTS.*family=roadmap-items.*before_files=5.*delete=2.*after_files=3"; then ok "T12 size/count ledger line present (before/after files + bytes)"; else nok "T12 ledger" "$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "SUMMARY-SNAPSHOTS.*before_bytes=[1-9]"; then ok "T12 ledger carries byte counts"; else nok "T12 ledger bytes" "$OUT"; fi
if [ "$(ls "$R12/.scratch/workflow-cache" | wc -l | tr -d '[:space:]')" -eq 7 ]; then ok "T12 dry-run deleted nothing"; else nok "T12 no-delete" "$(ls "$R12/.scratch/workflow-cache")"; fi

# --- T13: RP-71 apply across the three families + measured-after ledger ---
# Members are >7 days old with an EMPTY issues file: under the legacy class they would all be
# deleted (or blocked); survival of the 3 newest proves rotation governs family members.
R13="$TMP/r13"
mkroot "$R13"
mkdir -p "$R13/.scratch/workflow-cache" "$R13/.scratch/project"
printf '{"items":[]}\n' > "$R13/.scratch/workflow-cache/roadmap-items.json"
for i in 1 2 3 4 5; do
  printf '{"items":[%d]}\n' "$i" > "$R13/.scratch/workflow-cache/roadmap-items-$((S0+i)).json"
  make_old "$R13/.scratch/workflow-cache/roadmap-items-$((S0+i)).json" 20
done
printf '{"items":[]}\n' > "$R13/.scratch/project/curaos-roadmap-items.json"
AGE=14
for n in after-seeding after-promotion after-worker1 final post; do
  printf '{"items":[]}\n' > "$R13/.scratch/project/curaos-roadmap-items-$n.json"
  make_old "$R13/.scratch/project/curaos-roadmap-items-$n.json" "$AGE"
  AGE=$((AGE+1))
done
AGE=14
for n in cache-current post-transfer-20260609 post-repair-20260609 final-repair-20260609; do
  printf '{"items":[]}\n' > "$R13/.scratch/project-items-$n.json"
  make_old "$R13/.scratch/project-items-$n.json" "$AGE"
  AGE=$((AGE+1))
done
run_gc "$R13" --apply
if [ "$RC" -eq 0 ]; then ok "T13 apply rc=0"; else nok "T13 rc" "rc=$RC out=$OUT"; fi
WC13="$(ls "$R13/.scratch/workflow-cache" | sort | tr '\n' ' ')"
if [ "$WC13" = "roadmap-items-$((S0+3)).json roadmap-items-$((S0+4)).json roadmap-items-$((S0+5)).json roadmap-items.json " ]; then
  ok "T13 workflow-cache: fixed file + 3 newest stamps survive, 2 oldest deleted"
else
  nok "T13 workflow-cache" "$WC13"
fi
PJ13="$(ls "$R13/.scratch/project" | sort | tr '\n' ' ')"
if [ "$PJ13" = "curaos-roadmap-items-after-promotion.json curaos-roadmap-items-after-seeding.json curaos-roadmap-items-after-worker1.json curaos-roadmap-items.json " ]; then
  ok "T13 .scratch/project: fixed file + 3 newest mtimes survive"
else
  nok "T13 project" "$PJ13"
fi
if [ -f "$R13/.scratch/project-items-cache-current.json" ] && [ -f "$R13/.scratch/project-items-post-transfer-20260609.json" ] \
   && [ -f "$R13/.scratch/project-items-post-repair-20260609.json" ] && [ ! -f "$R13/.scratch/project-items-final-repair-20260609.json" ]; then
  ok "T13 .scratch root project-items: 3 newest survive, oldest deleted"
else
  nok "T13 root family" "$(ls "$R13/.scratch")"
fi
if printf '%s\n' "$OUT" | grep -q "snapshot-after family=roadmap-items .*files=4 "; then ok "T13 measured-after ledger printed for roadmap-items"; else nok "T13 after-ledger" "$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "snapshot-after family=project-items .*files=3 "; then ok "T13 measured-after ledger printed for project-items"; else nok "T13 after-ledger-root" "$OUT"; fi

# --- T14: RP-71 rotation honors the open-issue reference check when available ---
R14="$TMP/r14"
mkroot "$R14"
mkdir -p "$R14/.scratch/workflow-cache"
for i in 1 2 3 4 5; do
  printf '{"items":[%d]}\n' "$i" > "$R14/.scratch/workflow-cache/roadmap-items-$((S0+i)).json"
done
ISSUES14="$TMP/issues14.txt"
printf 'open issue #7 cites roadmap-items-%d.json as evidence\n' "$((S0+1))" > "$ISSUES14"
OUT="$(GC_GITLEAKS_BIN="$STUB_OK" GC_OPEN_ISSUES_FILE="$ISSUES14" bash "$SCRIPT" --root "$R14" 2>&1)"; RC=$?
if [ "$RC" -eq 0 ]; then ok "T14 dry-run rc=0"; else nok "T14 rc" "rc=$RC out=$OUT"; fi
if printf '%s\n' "$OUT" | grep -q "SNAPSHOT-KEEP.*roadmap-items-$((S0+1)).json.*referenced-by-open-issue"; then ok "T14 referenced rotation member kept with reason"; else nok "T14 keep" "$OUT"; fi
if [ "$(printf '%s\n' "$OUT" | grep -c "^SNAPSHOT-DELETE")" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "SNAPSHOT-DELETE.*roadmap-items-$((S0+2)).json"; then
  ok "T14 only the unreferenced 4th-newest is a candidate"
else
  nok "T14 candidates" "$OUT"
fi

printf '\ngc-local-state tests: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
